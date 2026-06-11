package handlers

import (
	"gugudu-backend/database"
	"gugudu-backend/services"
	"net/http"

	"github.com/gin-gonic/gin"
)

var videoUnderstandingService *services.VideoUnderstandingService

func InitVideoUnderstandingService(aiService *services.AIAnalysisService) {
	if aiService != nil {
		videoUnderstandingService = services.NewVideoUnderstandingService(database.DB, aiService)
	}
}

func GenerateVideoUnderstanding(c *gin.Context) {
	service, ok := requireVideoLearningService(c)
	if !ok {
		return
	}
	if videoUnderstandingService == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "视频理解服务未启用"})
		return
	}

	userID, ok := currentUserID(c)
	if !ok {
		return
	}
	lessonID, ok := parseUintParam(c, "id")
	if !ok {
		return
	}

	var req struct {
		Force             bool `json:"force"`
		IncludeVocabulary bool `json:"include_vocabulary"`
		IncludeKeyPoints  bool `json:"include_key_points"`
	}
	_ = c.ShouldBindJSON(&req)

	lesson, err := service.GetLesson(c.Request.Context(), userID, lessonID)
	if err != nil {
		handleVideoNotFound(c, err)
		return
	}

	if lesson.Status != "ready" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "视频尚未准备就绪"})
		return
	}

	subtitles, err := service.GetSubtitles(c.Request.Context(), userID, lessonID)
	if err != nil || len(subtitles) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "视频暂无字幕"})
		return
	}

	understanding, err := videoUnderstandingService.GenerateUnderstanding(
		c.Request.Context(),
		lesson,
		subtitles,
		userID,
		services.GenerateOptions{
			Force:             req.Force,
			IncludeVocabulary: req.IncludeVocabulary,
			IncludeKeyPoints:  req.IncludeKeyPoints,
		},
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": understanding})
}

func GetVideoUnderstanding(c *gin.Context) {
	if videoUnderstandingService == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "视频理解服务未启用"})
		return
	}

	userID, ok := currentUserID(c)
	if !ok {
		return
	}
	lessonID, ok := parseUintParam(c, "id")
	if !ok {
		return
	}

	understanding, err := videoUnderstandingService.GetUnderstanding(c.Request.Context(), lessonID, userID)
	if err != nil {
		handleVideoNotFound(c, err)
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": understanding})
}

func ChatWithVideo(c *gin.Context) {
	service, ok := requireVideoLearningService(c)
	if !ok {
		return
	}
	if videoUnderstandingService == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "视频理解服务未启用"})
		return
	}

	userID, ok := currentUserID(c)
	if !ok {
		return
	}
	lessonID, ok := parseUintParam(c, "id")
	if !ok {
		return
	}

	var req struct {
		Messages []services.ChatMessage `json:"messages"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的请求"})
		return
	}

	lesson, err := service.GetLesson(c.Request.Context(), userID, lessonID)
	if err != nil {
		handleVideoNotFound(c, err)
		return
	}

	understanding, err := videoUnderstandingService.GetUnderstanding(c.Request.Context(), lessonID, userID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "请先生成视频理解"})
		return
	}

	response, err := videoUnderstandingService.ChatWithVideo(
		c.Request.Context(),
		lesson,
		understanding,
		req.Messages,
		userID,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": gin.H{"content": response}})
}

func GetVideoConversations(c *gin.Context) {
	if videoUnderstandingService == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "视频理解服务未启用"})
		return
	}

	userID, ok := currentUserID(c)
	if !ok {
		return
	}
	lessonID, ok := parseUintParam(c, "id")
	if !ok {
		return
	}

	limit := parsePositiveInt(c.Query("limit"), 50)
	if limit > 200 {
		limit = 200
	}

	conversations, err := videoUnderstandingService.GetConversations(c.Request.Context(), lessonID, userID, limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "加载对话历史失败"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": conversations})
}

func ClearVideoConversations(c *gin.Context) {
	if videoUnderstandingService == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "视频理解服务未启用"})
		return
	}

	userID, ok := currentUserID(c)
	if !ok {
		return
	}
	lessonID, ok := parseUintParam(c, "id")
	if !ok {
		return
	}

	if err := videoUnderstandingService.ClearConversations(c.Request.Context(), lessonID, userID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "清空对话失败"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "对话历史已清空"})
}
