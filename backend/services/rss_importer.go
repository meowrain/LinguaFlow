package services

import (
	"context"
	"crypto/sha1"
	"encoding/hex"
	"encoding/xml"
	"errors"
	"fmt"
	"gugudu-backend/config"
	"gugudu-backend/models"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"

	"golang.org/x/net/html"
	"gorm.io/gorm"
)

const (
	defaultRSSUserAgent = "GuGuDu RSS Importer/1.0"
	defaultRSSTimeout   = 15 * time.Second
	defaultRSSMaxItems  = 10
)

type RSSImporter struct {
	db     *gorm.DB
	cfg    config.RSSConfig
	client *http.Client
}

type RSSImportReport struct {
	Feeds      []RSSFeedImportReport `json:"feeds"`
	Created    int                   `json:"created"`
	Updated    int                   `json:"updated"`
	Skipped    int                   `json:"skipped"`
	Errors     []string              `json:"errors,omitempty"`
	ImportedAt time.Time             `json:"imported_at"`
}

type RSSFeedImportReport struct {
	Name    string   `json:"name"`
	URL     string   `json:"url"`
	Created int      `json:"created"`
	Updated int      `json:"updated"`
	Skipped int      `json:"skipped"`
	Errors  []string `json:"errors,omitempty"`
}

type feedArticle struct {
	Title       string
	Summary     string
	Content     string
	SourceURL   string
	Author      string
	PublishedAt time.Time
	CoverImage  string
}

type parsedFeed struct {
	Title string
	Items []feedItem
}

type feedItem struct {
	Title          string
	Link           string
	GUID           string
	Description    string
	ContentEncoded string
	PubDate        string
	Updated        string
	Author         string
	Creator        string
	Categories     []string
}

type rssDocument struct {
	Channel struct {
		Title string        `xml:"title"`
		Items []rssFeedItem `xml:"item"`
	} `xml:"channel"`
}

type rssFeedItem struct {
	Title          string   `xml:"title"`
	Link           string   `xml:"link"`
	GUID           string   `xml:"guid"`
	Description    string   `xml:"description"`
	ContentEncoded string   `xml:"http://purl.org/rss/1.0/modules/content/ encoded"`
	PubDate        string   `xml:"pubDate"`
	Date           string   `xml:"http://purl.org/dc/elements/1.1/ date"`
	Author         string   `xml:"author"`
	Creator        string   `xml:"http://purl.org/dc/elements/1.1/ creator"`
	Categories     []string `xml:"category"`
}

type atomDocument struct {
	Title   string         `xml:"title"`
	Entries []atomFeedItem `xml:"entry"`
}

type atomFeedItem struct {
	Title     string     `xml:"title"`
	ID        string     `xml:"id"`
	Links     []atomLink `xml:"link"`
	Summary   string     `xml:"summary"`
	Content   string     `xml:"content"`
	Published string     `xml:"published"`
	Updated   string     `xml:"updated"`
	Author    atomAuthor `xml:"author"`
	Category  []atomCat  `xml:"category"`
}

type atomLink struct {
	Href string `xml:"href,attr"`
	Rel  string `xml:"rel,attr"`
}

type atomAuthor struct {
	Name string `xml:"name"`
}

type atomCat struct {
	Term string `xml:"term,attr"`
}

type extractedArticleHTML struct {
	Content     string
	Description string
	CoverImage  string
	PublishedAt *time.Time
}

func NewRSSImporter(db *gorm.DB, cfg config.RSSConfig) *RSSImporter {
	timeout := defaultRSSTimeout
	if cfg.RequestTimeoutSeconds > 0 {
		timeout = time.Duration(cfg.RequestTimeoutSeconds) * time.Second
	}

	return &RSSImporter{
		db:  db,
		cfg: cfg,
		client: &http.Client{
			Timeout: timeout,
		},
	}
}

func (i *RSSImporter) ImportAll(ctx context.Context) RSSImportReport {
	report := RSSImportReport{ImportedAt: time.Now()}

	if !i.cfg.Enabled {
		report.Errors = append(report.Errors, "RSS import is disabled")
		return report
	}

	for _, feed := range i.cfg.Feeds {
		feedReport := i.ImportFeed(ctx, feed)
		report.Feeds = append(report.Feeds, feedReport)
		report.Created += feedReport.Created
		report.Updated += feedReport.Updated
		report.Skipped += feedReport.Skipped
		report.Errors = append(report.Errors, feedReport.Errors...)
	}

	return report
}

func (i *RSSImporter) ImportFeed(ctx context.Context, feed config.RSSFeedConfig) RSSFeedImportReport {
	report := RSSFeedImportReport{Name: feed.Name, URL: feed.URL}
	if !feed.Enabled {
		report.Skipped++
		return report
	}
	if strings.TrimSpace(feed.URL) == "" {
		report.Errors = append(report.Errors, "feed URL is empty")
		return report
	}

	body, err := i.fetch(ctx, feed.URL)
	if err != nil {
		report.Errors = append(report.Errors, err.Error())
		return report
	}

	parsed, err := parseFeed(body)
	if err != nil {
		report.Errors = append(report.Errors, err.Error())
		return report
	}

	limit := i.cfg.MaxItemsPerFeed
	if limit <= 0 {
		limit = defaultRSSMaxItems
	}
	if len(parsed.Items) < limit {
		limit = len(parsed.Items)
	}

	for _, item := range parsed.Items[:limit] {
		article, err := i.buildArticle(ctx, feed, item)
		if err != nil {
			report.Errors = append(report.Errors, fmt.Sprintf("%s: %v", item.Title, err))
			continue
		}
		if strings.TrimSpace(article.Title) == "" || strings.TrimSpace(article.SourceURL) == "" {
			report.Skipped++
			continue
		}

		created, updated, err := i.saveArticle(feed, article)
		if err != nil {
			report.Errors = append(report.Errors, fmt.Sprintf("%s: %v", article.Title, err))
			continue
		}
		if created {
			report.Created++
		} else if updated {
			report.Updated++
		} else {
			report.Skipped++
		}
	}

	return report
}

func (i *RSSImporter) buildArticle(ctx context.Context, feed config.RSSFeedConfig, item feedItem) (feedArticle, error) {
	sourceURL := firstNonEmpty(item.Link, item.GUID)
	if sourceURL == "" {
		return feedArticle{}, errors.New("missing source URL")
	}

	summary := cleanText(stripHTML(item.Description))
	content := stripHTML(firstNonEmpty(item.ContentEncoded, item.Description))
	publishedAt := parseFeedTime(firstNonEmpty(item.PubDate, item.Updated), time.Now())
	article := feedArticle{
		Title:       cleanText(stripHTML(item.Title)),
		Summary:     summary,
		Content:     content,
		SourceURL:   sourceURL,
		Author:      cleanText(firstNonEmpty(item.Creator, item.Author)),
		PublishedAt: publishedAt,
	}

	if htmlBody, err := i.fetch(ctx, sourceURL); err == nil {
		extracted := extractArticleHTML(htmlBody)
		if extracted.Content != "" {
			article.Content = extracted.Content
		}
		if article.Summary == "" {
			article.Summary = extracted.Description
		}
		if extracted.CoverImage != "" {
			article.CoverImage = absoluteURL(sourceURL, extracted.CoverImage)
		}
		if extracted.PublishedAt != nil {
			article.PublishedAt = *extracted.PublishedAt
		}
	}

	if article.Author == "" {
		article.Author = feed.Source
	}
	if article.Content == "" {
		article.Content = article.Summary
	}

	return article, nil
}

func (i *RSSImporter) saveArticle(feed config.RSSFeedConfig, item feedArticle) (bool, bool, error) {
	category, err := ensureRSSCategory(i.db, feed)
	if err != nil {
		return false, false, err
	}

	wordCount := countWords(item.Content)
	readingTime := (wordCount + 179) / 180
	if readingTime < 1 {
		readingTime = 1
	}
	source := firstNonEmpty(feed.Source, feed.Name)
	slug := makeArticleSlug(item.Title, item.SourceURL)

	article := models.Article{
		Title:           item.Title,
		Slug:            slug,
		Summary:         item.Summary,
		Content:         item.Content,
		CoverImage:      item.CoverImage,
		CategoryID:      category.ID,
		Tags:            cleanTags(feed.Tags),
		Source:          source,
		SourceURL:       item.SourceURL,
		Author:          item.Author,
		PublishedAt:     item.PublishedAt,
		DifficultyLevel: difficultyForWordCount(wordCount),
		WordCount:       wordCount,
		ReadingTime:     readingTime,
		Status:          "published",
	}

	var existing models.Article
	err = i.db.Where("source_url = ? OR slug = ?", item.SourceURL, slug).First(&existing).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return true, false, i.db.Create(&article).Error
	}
	if err != nil {
		return false, false, err
	}

	updates := map[string]interface{}{
		"title":            article.Title,
		"summary":          article.Summary,
		"content":          article.Content,
		"cover_image":      article.CoverImage,
		"category_id":      article.CategoryID,
		"tags":             article.Tags,
		"source":           article.Source,
		"author":           article.Author,
		"published_at":     article.PublishedAt,
		"difficulty_level": article.DifficultyLevel,
		"word_count":       article.WordCount,
		"reading_time":     article.ReadingTime,
		"status":           article.Status,
	}

	return false, true, i.db.Model(&existing).Updates(updates).Error
}

func (i *RSSImporter) fetch(ctx context.Context, rawURL string) ([]byte, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, rawURL, nil)
	if err != nil {
		return nil, err
	}
	userAgent := firstNonEmpty(i.cfg.UserAgent, defaultRSSUserAgent)
	req.Header.Set("User-Agent", userAgent)
	req.Header.Set("Accept", "application/rss+xml, application/atom+xml, application/xml, text/xml, text/html")

	resp, err := i.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("GET %s returned %d", rawURL, resp.StatusCode)
	}

	return io.ReadAll(io.LimitReader(resp.Body, 4*1024*1024))
}

func parseFeed(data []byte) (parsedFeed, error) {
	var rss rssDocument
	if err := xml.Unmarshal(data, &rss); err == nil && len(rss.Channel.Items) > 0 {
		items := make([]feedItem, 0, len(rss.Channel.Items))
		for _, item := range rss.Channel.Items {
			items = append(items, feedItem{
				Title:          item.Title,
				Link:           item.Link,
				GUID:           item.GUID,
				Description:    item.Description,
				ContentEncoded: item.ContentEncoded,
				PubDate:        item.PubDate,
				Updated:        item.Date,
				Author:         item.Author,
				Creator:        item.Creator,
				Categories:     item.Categories,
			})
		}
		return parsedFeed{Title: rss.Channel.Title, Items: items}, nil
	}

	var atom atomDocument
	if err := xml.Unmarshal(data, &atom); err == nil && len(atom.Entries) > 0 {
		items := make([]feedItem, 0, len(atom.Entries))
		for _, entry := range atom.Entries {
			categories := make([]string, 0, len(entry.Category))
			for _, category := range entry.Category {
				categories = append(categories, category.Term)
			}
			items = append(items, feedItem{
				Title:          entry.Title,
				Link:           atomEntryLink(entry),
				GUID:           entry.ID,
				Description:    entry.Summary,
				ContentEncoded: entry.Content,
				PubDate:        entry.Published,
				Updated:        entry.Updated,
				Author:         entry.Author.Name,
				Categories:     categories,
			})
		}
		return parsedFeed{Title: atom.Title, Items: items}, nil
	}

	return parsedFeed{}, errors.New("unsupported or empty RSS/Atom feed")
}

func atomEntryLink(entry atomFeedItem) string {
	for _, link := range entry.Links {
		if link.Rel == "" || link.Rel == "alternate" {
			return link.Href
		}
	}
	if len(entry.Links) > 0 {
		return entry.Links[0].Href
	}
	return ""
}

func ensureRSSCategory(db *gorm.DB, feed config.RSSFeedConfig) (models.Category, error) {
	slug := firstNonEmpty(feed.CategorySlug, "world-news")
	category := models.Category{
		Name:        firstNonEmpty(feed.CategoryName, feed.Name, "外刊精选"),
		NameEN:      firstNonEmpty(feed.CategoryEN, feed.Name, "World News"),
		Slug:        slug,
		Description: "Imported RSS articles for English reading practice",
		Icon:        "newspaper",
		SortOrder:   50,
	}

	var saved models.Category
	err := db.Where("slug = ?", slug).Attrs(category).FirstOrCreate(&saved).Error
	return saved, err
}

func extractArticleHTML(data []byte) extractedArticleHTML {
	doc, err := html.Parse(strings.NewReader(string(data)))
	if err != nil {
		return extractedArticleHTML{}
	}

	extracted := extractedArticleHTML{}
	meta := extractMeta(doc)
	extracted.CoverImage = firstNonEmpty(meta["og:image"], meta["twitter:image"])
	extracted.Description = cleanText(firstNonEmpty(meta["og:description"], meta["description"], meta["twitter:description"]))
	if published := parseFeedTime(firstNonEmpty(meta["article:published_time"], meta["pubdate"]), time.Time{}); !published.IsZero() {
		extracted.PublishedAt = &published
	}

	candidates := findContentCandidates(doc)
	best := ""
	for _, candidate := range candidates {
		text := extractStructuredText(candidate)
		if countWords(text) > countWords(best) {
			best = text
		}
	}
	extracted.Content = best

	return extracted
}

func extractMeta(n *html.Node) map[string]string {
	values := map[string]string{}
	var walk func(*html.Node)
	walk = func(node *html.Node) {
		if node.Type == html.ElementNode && node.Data == "meta" {
			key := ""
			value := ""
			for _, attr := range node.Attr {
				switch strings.ToLower(attr.Key) {
				case "property", "name":
					key = strings.ToLower(attr.Val)
				case "content":
					value = attr.Val
				}
			}
			if key != "" && value != "" {
				values[key] = value
			}
		}
		for child := node.FirstChild; child != nil; child = child.NextSibling {
			walk(child)
		}
	}
	walk(n)
	return values
}

func findContentCandidates(n *html.Node) []*html.Node {
	var candidates []*html.Node
	var walk func(*html.Node)
	walk = func(node *html.Node) {
		if node.Type == html.ElementNode {
			if node.Data == "article" || hasContentClass(node) {
				candidates = append(candidates, node)
			}
		}
		for child := node.FirstChild; child != nil; child = child.NextSibling {
			walk(child)
		}
	}
	walk(n)
	return candidates
}

func hasContentClass(n *html.Node) bool {
	for _, attr := range n.Attr {
		if attr.Key != "class" && attr.Key != "id" {
			continue
		}
		value := strings.ToLower(attr.Val)
		for _, token := range []string{"article-content", "article__content", "article-body", "entry-content", "main-content", "body-content", "wsw"} {
			if strings.Contains(value, token) {
				return true
			}
		}
	}
	return false
}

func extractStructuredText(n *html.Node) string {
	parts := []string{}

	var walk func(*html.Node, bool)
	walk = func(node *html.Node, inBlock bool) {
		if node.Type == html.ElementNode {
			if shouldSkipHTMLNode(node.Data) {
				return
			}
			inBlock = inBlock || isTextBlock(node.Data)
		}

		if node.Type == html.TextNode && inBlock {
			text := cleanText(node.Data)
			if text != "" {
				parts = append(parts, text)
			}
		}

		for child := node.FirstChild; child != nil; child = child.NextSibling {
			walk(child, inBlock)
		}

		if node.Type == html.ElementNode && isTextBlock(node.Data) {
			parts = append(parts, "\n\n")
		}
	}
	walk(n, false)

	text := strings.Join(parts, " ")
	text = regexp.MustCompile(`\s*\n\s*\n\s*`).ReplaceAllString(text, "\n\n")
	return cleanArticleText(text)
}

func stripHTML(raw string) string {
	if strings.TrimSpace(raw) == "" {
		return ""
	}

	doc, err := html.Parse(strings.NewReader(raw))
	if err != nil {
		return cleanText(raw)
	}
	if text := extractStructuredText(doc); text != "" {
		return text
	}
	return cleanText(extractAllText(doc))
}

func shouldSkipHTMLNode(tag string) bool {
	switch tag {
	case "script", "style", "noscript", "nav", "aside", "footer", "header", "form", "button":
		return true
	default:
		return false
	}
}

func isTextBlock(tag string) bool {
	switch tag {
	case "p", "div", "section", "article", "li", "blockquote", "h1", "h2", "h3", "h4":
		return true
	default:
		return false
	}
}

func extractAllText(n *html.Node) string {
	parts := []string{}
	var walk func(*html.Node)
	walk = func(node *html.Node) {
		if node.Type == html.ElementNode && shouldSkipHTMLNode(node.Data) {
			return
		}
		if node.Type == html.TextNode {
			text := cleanText(node.Data)
			if text != "" {
				parts = append(parts, text)
			}
		}
		for child := node.FirstChild; child != nil; child = child.NextSibling {
			walk(child)
		}
	}
	walk(n)
	return strings.Join(parts, " ")
}

func cleanArticleText(text string) string {
	lines := strings.Split(text, "\n")
	cleaned := make([]string, 0, len(lines))
	for _, line := range lines {
		line = cleanText(line)
		if line != "" {
			cleaned = append(cleaned, line)
		}
	}
	return strings.Join(cleaned, "\n\n")
}

func cleanText(text string) string {
	text = html.UnescapeString(text)
	text = strings.ReplaceAll(text, "\u00a0", " ")
	text = regexp.MustCompile(`[ \t\r\n]+`).ReplaceAllString(text, " ")
	return strings.TrimSpace(text)
}

func cleanTags(tags string) string {
	parts := strings.Split(tags, ",")
	cleaned := make([]string, 0, len(parts))
	seen := map[string]bool{}
	for _, part := range parts {
		part = cleanText(part)
		key := strings.ToLower(part)
		if part != "" && !seen[key] {
			cleaned = append(cleaned, part)
			seen[key] = true
		}
	}
	return strings.Join(cleaned, ",")
}

func parseFeedTime(raw string, fallback time.Time) time.Time {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return fallback
	}

	layouts := []string{
		time.RFC3339,
		time.RFC3339Nano,
		time.RFC1123Z,
		time.RFC1123,
		time.RFC822Z,
		time.RFC822,
		"Mon, 02 Jan 2006 15:04:05 -0700",
		"Mon, 02 Jan 2006 15:04:05 MST",
		"2006-01-02 15:04:05",
		"2006-01-02",
	}

	for _, layout := range layouts {
		if parsed, err := time.Parse(layout, raw); err == nil {
			return parsed
		}
	}

	return fallback
}

func countWords(text string) int {
	return len(regexp.MustCompile(`[A-Za-z]+(?:['-][A-Za-z]+)?`).FindAllString(text, -1))
}

func difficultyForWordCount(wordCount int) string {
	switch {
	case wordCount <= 700:
		return "easy"
	case wordCount <= 1400:
		return "medium"
	default:
		return "hard"
	}
}

func makeArticleSlug(title, sourceURL string) string {
	base := strings.ToLower(title)
	base = regexp.MustCompile(`[^a-z0-9]+`).ReplaceAllString(base, "-")
	base = strings.Trim(base, "-")
	if base == "" {
		base = "rss-article"
	}
	if len(base) > 150 {
		base = strings.Trim(base[:150], "-")
	}

	hashSource := firstNonEmpty(sourceURL, title)
	sum := sha1.Sum([]byte(hashSource))
	return base + "-" + hex.EncodeToString(sum[:])[:8]
}

func absoluteURL(baseURL, maybeRelative string) string {
	if strings.TrimSpace(maybeRelative) == "" {
		return ""
	}
	parsed, err := url.Parse(maybeRelative)
	if err != nil || parsed.IsAbs() {
		return maybeRelative
	}
	base, err := url.Parse(baseURL)
	if err != nil {
		return maybeRelative
	}
	return base.ResolveReference(parsed).String()
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return strings.TrimSpace(value)
		}
	}
	return ""
}
