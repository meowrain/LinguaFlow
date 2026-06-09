package services

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"net/http/cookiejar"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/PuerkitoBio/goquery"
	"github.com/microcosm-cc/bluemonday"
)

const (
	ao3BaseURL   = "https://archiveofourown.org"
	ao3UserAgent = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"
)

var whitespacePattern = regexp.MustCompile(`\s+`)

type AO3Client struct {
	httpClient   *http.Client
	proxyURL     string
	sessionMu    sync.Mutex
	sessionReady bool
}

type AO3SearchResult struct {
	ID            string   `json:"id"`
	Title         string   `json:"title"`
	Authors       []string `json:"authors"`
	Summary       string   `json:"summary"`
	Fandoms       []string `json:"fandoms"`
	Rating        string   `json:"rating"`
	Warnings      []string `json:"warnings"`
	Categories    []string `json:"categories"`
	Relationships []string `json:"relationships"`
	Characters    []string `json:"characters"`
	Tags          []string `json:"tags"`
	Language      string   `json:"language"`
	Words         string   `json:"words"`
	Chapters      string   `json:"chapters"`
	Comments      string   `json:"comments"`
	Kudos         string   `json:"kudos"`
	Bookmarks     string   `json:"bookmarks"`
	Hits          string   `json:"hits"`
	UpdatedAt     string   `json:"updated_at"`
	URL           string   `json:"url"`
	AO3Path       string   `json:"ao3_path"`
}

type AO3SearchResponse struct {
	Query      string            `json:"query"`
	Page       int               `json:"page"`
	Works      []AO3SearchResult `json:"works"`
	HasNext    bool              `json:"has_next"`
	SourceURL  string            `json:"source_url"`
	Disclaimer string            `json:"disclaimer"`
}

type AO3Work struct {
	ID            string       `json:"id"`
	Title         string       `json:"title"`
	Authors       []string     `json:"authors"`
	Summary       string       `json:"summary"`
	Notes         string       `json:"notes"`
	Fandoms       []string     `json:"fandoms"`
	Rating        string       `json:"rating"`
	Warnings      []string     `json:"warnings"`
	Categories    []string     `json:"categories"`
	Relationships []string     `json:"relationships"`
	Characters    []string     `json:"characters"`
	Tags          []string     `json:"tags"`
	Language      string       `json:"language"`
	Words         string       `json:"words"`
	Chapters      string       `json:"chapters"`
	PublishedAt   string       `json:"published_at"`
	UpdatedAt     string       `json:"updated_at"`
	ContentHTML   string       `json:"content_html"`
	ContentText   string       `json:"content_text"`
	Paragraphs    []string     `json:"paragraphs"`
	ChaptersData  []AO3Chapter `json:"chapters_data"`
	URL           string       `json:"url"`
	Disclaimer    string       `json:"disclaimer"`
}

type AO3Chapter struct {
	ID          string   `json:"id"`
	Index       int      `json:"index"`
	Title       string   `json:"title"`
	Summary     string   `json:"summary"`
	Notes       string   `json:"notes"`
	ContentHTML string   `json:"content_html"`
	ContentText string   `json:"content_text"`
	Paragraphs  []string `json:"paragraphs"`
}

func NewAO3Client(timeout time.Duration) *AO3Client {
	return NewAO3ClientWithProxy(timeout, "")
}

func NewAO3ClientWithProxy(timeout time.Duration, proxyURL string) *AO3Client {
	if timeout <= 0 {
		timeout = 12 * time.Second
	}

	transport := http.DefaultTransport.(*http.Transport).Clone()
	proxyURL = strings.TrimSpace(proxyURL)
	if proxyURL != "" {
		if parsed, err := url.Parse(proxyURL); err == nil {
			transport.Proxy = http.ProxyURL(parsed)
		}
	}

	jar, _ := cookiejar.New(nil)

	return &AO3Client{
		httpClient: &http.Client{
			Timeout:   timeout,
			Transport: transport,
			Jar:       jar,
		},
		proxyURL: proxyURL,
	}
}

func (c *AO3Client) Search(ctx context.Context, query string, page int) (*AO3SearchResponse, error) {
	query = strings.TrimSpace(query)
	if query == "" {
		return nil, fmt.Errorf("search query is required")
	}
	if page < 1 {
		page = 1
	}
	if page > 10 {
		page = 10
	}

	params := url.Values{}
	params.Set("work_search[query]", query)
	params.Set("page", strconv.Itoa(page))
	searchURL := ao3BaseURL + "/works/search?" + params.Encode()

	doc, err := c.fetchDocument(ctx, searchURL)
	if err != nil {
		return nil, err
	}

	works := make([]AO3SearchResult, 0)
	doc.Find("li.work").Each(func(_ int, s *goquery.Selection) {
		work := parseSearchResult(s)
		if work.ID != "" && work.Title != "" {
			works = append(works, work)
		}
	})

	return &AO3SearchResponse{
		Query:      query,
		Page:       page,
		Works:      works,
		HasNext:    doc.Find("ol.pagination a[rel='next'], ol.pagination a:contains('Next')").Length() > 0,
		SourceURL:  searchURL,
		Disclaimer: "AO3 data is parsed from public HTML pages. This is an unofficial integration and links back to the original work.",
	}, nil
}

func (c *AO3Client) GetWork(ctx context.Context, id string) (*AO3Work, error) {
	id = strings.TrimSpace(id)
	if !regexp.MustCompile(`^\d+$`).MatchString(id) {
		return nil, fmt.Errorf("invalid AO3 work id")
	}

	workURL := ao3BaseURL + "/works/" + id + "?view_adult=true&view_full_work=true"
	doc, err := c.fetchDocument(ctx, workURL)
	if err != nil {
		return nil, err
	}

	title := cleanAO3Text(doc.Find("h2.title.heading").First().Text())
	authors := ao3SelectionTexts(doc.Find("h3.byline.heading a[rel='author']"))
	if len(authors) == 0 {
		authors = ao3SelectionTexts(doc.Find("a[rel='author']"))
	}

	content := doc.Find("div#chapters").First()
	content.Find("script, style, form, ul.chapter.actions").Remove()
	contentHTML, _ := content.Html()
	contentHTML = sanitizeAO3HTML(contentHTML)
	chapters := extractAO3Chapters(content, title)
	paragraphs := flattenAO3ChapterParagraphs(chapters)
	contentText := strings.Join(paragraphs, "\n\n")

	work := &AO3Work{
		ID:            id,
		Title:         title,
		Authors:       authors,
		Summary:       cleanAO3Text(doc.Find("div.summary blockquote.userstuff").First().Text()),
		Notes:         cleanAO3Text(doc.Find("div.notes blockquote.userstuff").First().Text()),
		Fandoms:       ao3SelectionTexts(doc.Find("dd.fandom.tags a.tag")),
		Rating:        cleanAO3Text(doc.Find("dd.rating.tags a.tag").First().Text()),
		Warnings:      ao3SelectionTexts(doc.Find("dd.warning.tags a.tag")),
		Categories:    ao3SelectionTexts(doc.Find("dd.category.tags a.tag")),
		Relationships: ao3SelectionTexts(doc.Find("dd.relationship.tags a.tag")),
		Characters:    ao3SelectionTexts(doc.Find("dd.character.tags a.tag")),
		Tags:          ao3SelectionTexts(doc.Find("dd.freeform.tags a.tag")),
		Language:      cleanAO3Text(doc.Find("dd.language").First().Text()),
		Words:         cleanAO3Text(doc.Find("dd.words").First().Text()),
		Chapters:      cleanAO3Text(doc.Find("dd.chapters").First().Text()),
		PublishedAt:   cleanAO3Text(doc.Find("dd.published").First().Text()),
		UpdatedAt:     cleanAO3Text(doc.Find("dd.status").First().Text()),
		ContentHTML:   strings.TrimSpace(contentHTML),
		ContentText:   contentText,
		Paragraphs:    paragraphs,
		ChaptersData:  chapters,
		URL:           ao3BaseURL + "/works/" + id,
		Disclaimer:    "This is an unofficial reader for publicly accessible AO3 pages. The original work belongs to its author; use the AO3 link for canonical reading and interaction.",
	}

	if work.Title == "" {
		return nil, fmt.Errorf("AO3 work was not found or is not publicly readable")
	}

	return work, nil
}

func (c *AO3Client) fetchDocument(ctx context.Context, targetURL string) (*goquery.Document, error) {
	_ = c.ensureBrowserSession(ctx)

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, targetURL, nil)
	if err != nil {
		return nil, err
	}
	c.applyBrowserHeaders(req, true)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("AO3 request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusTooManyRequests {
		return nil, fmt.Errorf("AO3 is rate limiting requests; please try again later")
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("AO3 returned status %d%s", resp.StatusCode, c.proxyDescription())
	}

	doc, err := goquery.NewDocumentFromReader(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to parse AO3 HTML: %w", err)
	}
	return doc, nil
}

func (c *AO3Client) ensureBrowserSession(ctx context.Context) error {
	c.sessionMu.Lock()
	defer c.sessionMu.Unlock()

	if c.sessionReady {
		return nil
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, ao3BaseURL+"/", nil)
	if err != nil {
		return err
	}
	c.applyBrowserHeaders(req, false)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	_, _ = io.Copy(io.Discard, io.LimitReader(resp.Body, 512*1024))

	if resp.StatusCode >= 200 && resp.StatusCode < 400 {
		c.sessionReady = true
	}
	return nil
}

func (c *AO3Client) applyBrowserHeaders(req *http.Request, withReferer bool) {
	req.Header.Set("User-Agent", ao3UserAgent)
	req.Header.Set("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8")
	req.Header.Set("Accept-Language", "en-US,en;q=0.9")
	req.Header.Set("Cache-Control", "no-cache")
	req.Header.Set("Pragma", "no-cache")
	req.Header.Set("Upgrade-Insecure-Requests", "1")
	req.Header.Set("Sec-Fetch-Dest", "document")
	req.Header.Set("Sec-Fetch-Mode", "navigate")
	req.Header.Set("Sec-Fetch-Site", "none")
	req.Header.Set("Sec-Fetch-User", "?1")
	if withReferer {
		req.Header.Set("Referer", ao3BaseURL+"/")
		req.Header.Set("Sec-Fetch-Site", "same-origin")
	}
}

func (c *AO3Client) proxyDescription() string {
	if c.proxyURL == "" {
		return " without proxy"
	}
	return " via proxy " + c.proxyURL
}

func parseSearchResult(s *goquery.Selection) AO3SearchResult {
	titleLink := s.Find("h4.heading a[href^='/works/']").First()
	href, _ := titleLink.Attr("href")
	id := workIDFromPath(href)

	work := AO3SearchResult{
		ID:            id,
		Title:         cleanAO3Text(titleLink.Text()),
		Authors:       ao3SelectionTexts(s.Find("h4.heading a[rel='author']")),
		Summary:       cleanAO3Text(s.Find("blockquote.summary").Text()),
		Fandoms:       ao3SelectionTexts(s.Find("h5.fandoms a.tag")),
		Rating:        firstAO3Text(s.Find("span.rating a.tag, li.rating a.tag")),
		Warnings:      ao3SelectionTexts(s.Find("li.warnings a.tag")),
		Categories:    ao3SelectionTexts(s.Find("li.category a.tag")),
		Relationships: ao3SelectionTexts(s.Find("li.relationships a.tag")),
		Characters:    ao3SelectionTexts(s.Find("li.characters a.tag")),
		Tags:          ao3SelectionTexts(s.Find("li.freeforms a.tag")),
		Language:      cleanAO3Text(s.Find("dd.language").Text()),
		Words:         cleanAO3Text(s.Find("dd.words").Text()),
		Chapters:      cleanAO3Text(s.Find("dd.chapters").Text()),
		Comments:      cleanAO3Text(s.Find("dd.comments").Text()),
		Kudos:         cleanAO3Text(s.Find("dd.kudos").Text()),
		Bookmarks:     cleanAO3Text(s.Find("dd.bookmarks").Text()),
		Hits:          cleanAO3Text(s.Find("dd.hits").Text()),
		UpdatedAt:     cleanAO3Text(s.Find("p.datetime, p.status").First().Text()),
		AO3Path:       href,
	}

	if href != "" {
		work.URL = ao3BaseURL + href
	}

	return work
}

func cleanAO3Text(value string) string {
	return strings.TrimSpace(whitespacePattern.ReplaceAllString(value, " "))
}

func firstAO3Text(selection *goquery.Selection) string {
	return cleanAO3Text(selection.First().Text())
}

func ao3SelectionTexts(selection *goquery.Selection) []string {
	items := make([]string, 0)
	seen := make(map[string]bool)
	selection.Each(func(_ int, s *goquery.Selection) {
		text := cleanAO3Text(s.Text())
		if text == "" || seen[text] {
			return
		}
		seen[text] = true
		items = append(items, text)
	})
	return items
}

func workIDFromPath(path string) string {
	path = strings.TrimSpace(path)
	if path == "" {
		return ""
	}

	re := regexp.MustCompile(`/works/(\d+)`)
	matches := re.FindStringSubmatch(path)
	if len(matches) < 2 {
		return ""
	}
	return matches[1]
}

func sanitizeAO3HTML(raw string) string {
	policy := bluemonday.UGCPolicy()
	policy.AllowElements("section", "article", "div", "span", "hr")
	policy.AllowAttrs("class").Matching(regexp.MustCompile(`^[a-zA-Z0-9 _-]+$`)).OnElements("section", "article", "div", "span", "p", "blockquote")
	policy.AllowAttrs("id").Matching(regexp.MustCompile(`^[a-zA-Z0-9_-]+$`)).OnElements("section", "article", "div")
	policy.AllowAttrs("href").OnElements("a")
	policy.RequireParseableURLs(true)
	policy.AllowRelativeURLs(true)
	policy.AllowURLSchemes("http", "https")
	return policy.Sanitize(raw)
}

func extractAO3Paragraphs(content *goquery.Selection) []string {
	paragraphs := make([]string, 0)
	content.Find("p").Each(func(_ int, s *goquery.Selection) {
		text := cleanAO3Text(s.Text())
		if text != "" {
			paragraphs = append(paragraphs, text)
		}
	})

	if len(paragraphs) > 0 {
		return paragraphs
	}

	text := cleanAO3Text(content.Text())
	if text == "" {
		return paragraphs
	}
	return []string{text}
}

func extractAO3Chapters(content *goquery.Selection, workTitle string) []AO3Chapter {
	chapters := make([]AO3Chapter, 0)
	chapterSelections := content.Find("div.chapter[id^='chapter-']")
	if chapterSelections.Length() == 0 {
		chapterSelections = content.Find("div.chapter")
	}

	chapterSelections.Each(func(index int, chapter *goquery.Selection) {
		parsed := parseAO3Chapter(chapter, index+1, workTitle)
		if len(parsed.Paragraphs) > 0 || parsed.Title != "" {
			chapters = append(chapters, parsed)
		}
	})

	if len(chapters) > 0 {
		return chapters
	}

	chapter := parseAO3Chapter(content, 1, workTitle)
	if chapter.Title == "" {
		chapter.Title = firstAO3NonEmpty(workTitle, "全文")
	}
	if len(chapter.Paragraphs) == 0 {
		chapter.Paragraphs = extractAO3Paragraphs(content)
		chapter.ContentText = strings.Join(chapter.Paragraphs, "\n\n")
	}
	if chapter.ContentHTML == "" {
		html, _ := content.Html()
		chapter.ContentHTML = sanitizeAO3HTML(html)
	}
	return []AO3Chapter{chapter}
}

func parseAO3Chapter(chapter *goquery.Selection, index int, workTitle string) AO3Chapter {
	id, _ := chapter.Attr("id")
	title := firstUsableAO3ChapterTitle(chapter)
	if title == "" {
		if index == 1 {
			title = firstAO3NonEmpty(workTitle, "全文")
		} else {
			title = fmt.Sprintf("Chapter %d", index)
		}
	}

	summary := cleanAO3Text(chapter.Find("div.summary blockquote.userstuff").First().Text())
	notes := cleanAO3Text(chapter.Find("div.notes blockquote.userstuff").First().Text())
	body := chapter.Clone()
	body.Find("div.summary, div.notes, div.end.notes, h2, h3, ul.chapter.actions").Remove()

	paragraphs := extractAO3Paragraphs(body)
	contentHTML, _ := body.Html()

	return AO3Chapter{
		ID:          firstAO3NonEmpty(id, fmt.Sprintf("chapter-%d", index)),
		Index:       index,
		Title:       title,
		Summary:     summary,
		Notes:       notes,
		ContentHTML: sanitizeAO3HTML(contentHTML),
		ContentText: strings.Join(paragraphs, "\n\n"),
		Paragraphs:  paragraphs,
	}
}

func firstUsableAO3ChapterTitle(chapter *goquery.Selection) string {
	headingSelectors := []string{
		"div.chapter.preface h3.title",
		"div.chapter.preface h2.title",
		"div.preface h3.title",
		"div.preface h2.title",
		"h3.title",
		"h2.title",
		"h3.heading",
		"h2.heading",
	}

	for _, selector := range headingSelectors {
		var title string
		chapter.Find(selector).EachWithBreak(func(_ int, s *goquery.Selection) bool {
			candidate := cleanAO3Text(s.Text())
			if isAO3PlaceholderHeading(candidate) {
				return true
			}
			title = candidate
			return false
		})
		if title != "" {
			return title
		}
	}

	return ""
}

func isAO3PlaceholderHeading(value string) bool {
	normalized := strings.ToLower(strings.TrimSpace(strings.TrimSuffix(value, ":")))
	return normalized == "" ||
		normalized == "work text" ||
		normalized == "chapter text" ||
		normalized == "notes" ||
		normalized == "summary" ||
		normalized == "actions"
}

func flattenAO3ChapterParagraphs(chapters []AO3Chapter) []string {
	paragraphs := make([]string, 0)
	for _, chapter := range chapters {
		paragraphs = append(paragraphs, chapter.Paragraphs...)
	}
	return paragraphs
}

func firstAO3NonEmpty(values ...string) string {
	for _, value := range values {
		value = strings.TrimSpace(value)
		if value != "" {
			return value
		}
	}
	return ""
}
