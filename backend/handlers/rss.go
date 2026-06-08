package handlers

import (
	"gugudu-backend/config"
	"gugudu-backend/database"
	"gugudu-backend/models"
	"gugudu-backend/services"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

var (
	rssImportService *services.RSSImporter
	rssConfig        config.RSSConfig
)

func InitRSSImportService(db *gorm.DB, cfg config.RSSConfig) {
	rssImportService = services.NewRSSImporter(db, cfg)
	rssConfig = cfg
}

type rssFeedSummary struct {
	Name              string          `json:"name"`
	Source            string          `json:"source"`
	CategoryName      string          `json:"category_name"`
	CategoryEN        string          `json:"category_en"`
	CategorySlug      string          `json:"category_slug"`
	Tags              string          `json:"tags"`
	Enabled           bool            `json:"enabled"`
	ArticleCount      int64           `json:"article_count"`
	LatestArticle     *models.Article `json:"latest_article,omitempty"`
	LatestPublishedAt *string         `json:"latest_published_at,omitempty"`
}

func GetRSSFeeds(c *gin.Context) {
	if len(rssConfig.Feeds) == 0 {
		c.JSON(http.StatusOK, gin.H{"data": []rssFeedSummary{}})
		return
	}

	feeds := make([]rssFeedSummary, 0, len(rssConfig.Feeds))
	for _, feed := range rssConfig.Feeds {
		source := firstRSSNonEmpty(feed.Source, feed.Name)
		summary := rssFeedSummary{
			Name:         feed.Name,
			Source:       source,
			CategoryName: feed.CategoryName,
			CategoryEN:   feed.CategoryEN,
			CategorySlug: feed.CategorySlug,
			Tags:         feed.Tags,
			Enabled:      feed.Enabled,
		}

		query := database.DB.Model(&models.Article{}).Where("status = ? AND source = ?", "published", source)
		if strings.TrimSpace(feed.CategorySlug) != "" {
			query = query.Joins("JOIN categories ON categories.id = articles.category_id").
				Where("categories.slug = ?", feed.CategorySlug)
		}
		query.Count(&summary.ArticleCount)

		var latest models.Article
		if err := query.Session(&gorm.Session{}).
			Preload("Category").
			Order("published_at DESC").
			First(&latest).Error; err == nil {
			published := latest.PublishedAt.Format("2006-01-02T15:04:05Z07:00")
			summary.LatestArticle = &latest
			summary.LatestPublishedAt = &published
		}

		feeds = append(feeds, summary)
	}

	c.JSON(http.StatusOK, gin.H{
		"data": feeds,
		"meta": gin.H{
			"enabled":            rssConfig.Enabled,
			"max_items_per_feed": rssConfig.MaxItemsPerFeed,
		},
	})
}

func ImportRSS(c *gin.Context) {
	if rssImportService == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "RSS import service is not initialized"})
		return
	}

	report := rssImportService.ImportAll(c.Request.Context())
	status := http.StatusOK
	if len(report.Errors) > 0 && report.Created == 0 && report.Updated == 0 {
		status = http.StatusBadGateway
	}
	c.JSON(status, gin.H{"data": report})
}

func firstRSSNonEmpty(values ...string) string {
	for _, value := range values {
		value = strings.TrimSpace(value)
		if value != "" {
			return value
		}
	}
	return ""
}
