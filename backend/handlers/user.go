package handlers

import (
	"gugudu-backend/database"
	"gugudu-backend/models"
	"net/http"

	"github.com/gin-gonic/gin"
)

// GetMySubscriptions 获取我的订阅
func GetMySubscriptions(c *gin.Context) {
	userID, _ := c.Get("user_id")

	query := database.DB.Where("user_id = ?", userID)

	if folderID := c.Query("folder_id"); folderID != "" {
		query = query.Where("folder_id = ?", folderID)
	}

	var subscriptions []models.Subscription
	if err := query.
		Preload("Article").
		Preload("Article.Category").
		Preload("Folder").
		Order("created_at DESC").
		Find(&subscriptions).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": subscriptions})
}

// AddSubscription 添加订阅
func AddSubscription(c *gin.Context) {
	userID, _ := c.Get("user_id")

	var req struct {
		ArticleID uint `json:"article_id" binding:"required"`
		FolderID  uint `json:"folder_id"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// 检查文章是否存在
	var article models.Article
	if err := database.DB.First(&article, req.ArticleID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Article not found"})
		return
	}

	// 检查是否已订阅
	var existing models.Subscription
	if err := database.DB.Where("user_id = ? AND article_id = ?", userID, req.ArticleID).
		First(&existing).Error; err == nil {
		c.JSON(http.StatusOK, gin.H{"message": "Already subscribed"})
		return
	}

	// 确定收藏夹
	folderID := req.FolderID
	if folderID == 0 {
		var defaultFolder models.FavoriteFolder
		if err := database.DB.Where("user_id = ? AND is_default = ?", userID, true).
			First(&defaultFolder).Error; err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "No default folder found"})
			return
		}
		folderID = defaultFolder.ID
	} else {
		// 验证收藏夹属于当前用户
		var folder models.FavoriteFolder
		if err := database.DB.Where("id = ? AND user_id = ?", folderID, userID).
			First(&folder).Error; err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Folder not found or access denied"})
			return
		}
	}

	subscription := models.Subscription{
		UserID:    userID.(uint),
		ArticleID: req.ArticleID,
		FolderID:  folderID,
	}

	if err := database.DB.Create(&subscription).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to subscribe"})
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"message": "Subscribed successfully",
		"data":    subscription,
	})
}

// MoveSubscription 移动订阅到其他收藏夹
func MoveSubscription(c *gin.Context) {
	userID, _ := c.Get("user_id")

	var req struct {
		ArticleID  uint `json:"article_id" binding:"required"`
		ToFolderID uint `json:"to_folder_id" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// 验证目标收藏夹属于当前用户
	var folder models.FavoriteFolder
	if err := database.DB.Where("id = ? AND user_id = ?", req.ToFolderID, userID).
		First(&folder).Error; err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Target folder not found or access denied"})
		return
	}

	// 更新订阅的收藏夹
	result := database.DB.Model(&models.Subscription{}).
		Where("user_id = ? AND article_id = ?", userID, req.ArticleID).
		Update("folder_id", req.ToFolderID)

	if result.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": result.Error.Error()})
		return
	}

	if result.RowsAffected == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "Subscription not found"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Subscription moved successfully"})
}

// RemoveSubscription 取消订阅
func RemoveSubscription(c *gin.Context) {
	userID, _ := c.Get("user_id")
	articleID := c.Param("article_id")

	result := database.DB.Where("user_id = ? AND article_id = ?", userID, articleID).
		Delete(&models.Subscription{})

	if result.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": result.Error.Error()})
		return
	}

	if result.RowsAffected == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "Subscription not found"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Unsubscribed successfully"})
}

// GetReadHistory 获取阅读历史
func GetReadHistory(c *gin.Context) {
	userID, _ := c.Get("user_id")

	var history []models.ReadHistory
	if err := database.DB.Where("user_id = ?", userID).
		Preload("Article").
		Preload("Article.Category").
		Order("last_read_at DESC").
		Find(&history).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": history})
}
