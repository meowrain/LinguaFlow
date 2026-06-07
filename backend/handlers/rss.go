package handlers

import (
	"gugudu-backend/config"
	"gugudu-backend/services"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

var (
	rssImportService *services.RSSImporter
	rssImportToken   string
)

func InitRSSImportService(db *gorm.DB, cfg config.RSSConfig) {
	rssImportService = services.NewRSSImporter(db, cfg)
	rssImportToken = strings.TrimSpace(cfg.ImportToken)
}

func ImportRSS(c *gin.Context) {
	if rssImportService == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "RSS import service is not initialized"})
		return
	}
	if rssImportToken == "" {
		c.JSON(http.StatusForbidden, gin.H{"error": "RSS import token is not configured"})
		return
	}
	if importToken(c) != rssImportToken {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid import token"})
		return
	}

	report := rssImportService.ImportAll(c.Request.Context())
	status := http.StatusOK
	if len(report.Errors) > 0 && report.Created == 0 && report.Updated == 0 {
		status = http.StatusBadGateway
	}
	c.JSON(status, gin.H{"data": report})
}

func importToken(c *gin.Context) string {
	token := strings.TrimSpace(c.GetHeader("X-Import-Token"))
	if token != "" {
		return token
	}

	auth := strings.TrimSpace(c.GetHeader("Authorization"))
	if strings.HasPrefix(strings.ToLower(auth), "bearer ") {
		return strings.TrimSpace(auth[7:])
	}

	return ""
}
