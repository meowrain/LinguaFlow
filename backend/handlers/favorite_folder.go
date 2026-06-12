package handlers

import (
	"gugudu-backend/database"
	"gugudu-backend/models"
	"net/http"

	"github.com/gin-gonic/gin"
)

type FolderWithCount struct {
	models.FavoriteFolder
	ArticleCount int `json:"article_count"`
}

// GetFavoriteFolders 获取用户所有收藏夹（含文章数量）
func GetFavoriteFolders(c *gin.Context) {
	userID, _ := c.Get("user_id")

	var folders []models.FavoriteFolder
	if err := database.DB.
		Where("user_id = ?", userID).
		Order("sort_order ASC, created_at ASC").
		Find(&folders).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get folders"})
		return
	}

	result := make([]FolderWithCount, len(folders))
	for i, folder := range folders {
		var count int64
		database.DB.Model(&models.Subscription{}).
			Where("user_id = ? AND folder_id = ?", userID, folder.ID).
			Count(&count)
		result[i] = FolderWithCount{
			FavoriteFolder: folder,
			ArticleCount:   int(count),
		}
	}

	c.JSON(http.StatusOK, gin.H{"data": result})
}

// CreateFavoriteFolder 创建收藏夹
func CreateFavoriteFolder(c *gin.Context) {
	userID, _ := c.Get("user_id")

	var req struct {
		Name string `json:"name" binding:"required"`
		Icon string `json:"icon"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Name is required"})
		return
	}

	var count int64
	database.DB.Model(&models.FavoriteFolder{}).Where("user_id = ?", userID).Count(&count)
	if count >= 20 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "最多创建 20 个收藏夹"})
		return
	}

	icon := req.Icon
	if icon == "" {
		icon = "folder"
	}

	folder := models.FavoriteFolder{
		UserID: userID.(uint),
		Name:   req.Name,
		Icon:   icon,
	}
	if err := database.DB.Create(&folder).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create folder"})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"data": folder})
}

// UpdateFavoriteFolder 更新收藏夹（名称、图标）
func UpdateFavoriteFolder(c *gin.Context) {
	userID, _ := c.Get("user_id")
	folderID, ok := parsePathUint(c, "id")
	if !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid folder id"})
		return
	}

	var folder models.FavoriteFolder
	if err := database.DB.
		Where("id = ? AND user_id = ?", folderID, userID).
		First(&folder).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Folder not found"})
		return
	}

	if folder.IsDefault {
		c.JSON(http.StatusForbidden, gin.H{"error": "默认收藏夹不能修改"})
		return
	}

	var req struct {
		Name *string `json:"name"`
		Icon *string `json:"icon"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	updates := map[string]interface{}{}
	if req.Name != nil {
		updates["name"] = *req.Name
	}
	if req.Icon != nil {
		updates["icon"] = *req.Icon
	}

	if len(updates) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "No fields to update"})
		return
	}

	if err := database.DB.Model(&folder).Updates(updates).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update folder"})
		return
	}

	database.DB.First(&folder, folder.ID)
	c.JSON(http.StatusOK, gin.H{"data": folder})
}

// DeleteFavoriteFolder 删除收藏夹（文章移回默认）
func DeleteFavoriteFolder(c *gin.Context) {
	userID, _ := c.Get("user_id")
	folderID, ok := parsePathUint(c, "id")
	if !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid folder id"})
		return
	}

	var folder models.FavoriteFolder
	if err := database.DB.
		Where("id = ? AND user_id = ?", folderID, userID).
		First(&folder).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Folder not found"})
		return
	}

	if folder.IsDefault {
		c.JSON(http.StatusForbidden, gin.H{"error": "默认收藏夹不能删除"})
		return
	}

	var defaultFolder, err = database.EnsureDefaultFolder(userID.(uint))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get default folder"})
		return
	}

	database.DB.Model(&models.Subscription{}).
		Where("user_id = ? AND folder_id = ?", userID, folder.ID).
		Update("folder_id", defaultFolder.ID)

	if err := database.DB.Delete(&folder).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete folder"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Folder deleted"})
}

// UpdateFolderSort 批量更新收藏夹排序
func UpdateFolderSort(c *gin.Context) {
	userID, _ := c.Get("user_id")

	var req struct {
		Items []struct {
			ID        uint `json:"id"`
			SortOrder int  `json:"sort_order"`
		} `json:"items" binding:"required,min=1"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	tx := database.DB.Begin()
	for _, item := range req.Items {
		result := tx.Model(&models.FavoriteFolder{}).
			Where("id = ? AND user_id = ?", item.ID, userID).
			Update("sort_order", item.SortOrder)
		if result.Error != nil {
			tx.Rollback()
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update sort order"})
			return
		}
	}
	tx.Commit()

	var folders []models.FavoriteFolder
	database.DB.
		Where("user_id = ?", userID).
		Order("sort_order ASC, created_at ASC").
		Find(&folders)

	c.JSON(http.StatusOK, gin.H{"data": folders})
}
