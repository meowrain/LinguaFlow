package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"gugudu-backend/database"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
)

type DailySentenceResponse struct {
	Sentence    string `json:"sentence"`
	Translation string `json:"translation"`
	Topic       string `json:"topic"`
	Date        string `json:"date"`
	Cached      bool   `json:"cached"`
}

// GetDailySentence 获取每日一句（GET /api/daily-sentence）
// 每日通过 AI 生成一句英文句子 + 中文翻译，结果缓存到 Redis（当天有效）
func GetDailySentence(c *gin.Context) {
	today := time.Now().Format("2006-01-02")
	cacheKey := "daily_sentence:" + today

	ctx := context.Background()

	// 先查 Redis 缓存
	cachedJSON, err := database.RDB.Get(ctx, cacheKey).Result()
	if err == nil && cachedJSON != "" {
		var cached DailySentenceResponse
		if json.Unmarshal([]byte(cachedJSON), &cached) == nil {
			cached.Cached = true
			c.JSON(http.StatusOK, cached)
			return
		}
	}

	// 缓存未命中，调用 AI 生成
	if aiAnalysisService == nil || !aiAnalysisService.IsConfigured() {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "AI 服务未配置"})
		return
	}

	result, err := aiAnalysisService.GenerateDailySentence()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("生成每日一句失败: %v", err)})
		return
	}

	resp := DailySentenceResponse{
		Sentence:    result.Sentence,
		Translation: result.Translation,
		Topic:       result.Topic,
		Date:        today,
		Cached:      false,
	}

	// 写入 Redis 缓存，TTL 到次日午夜
	respJSON, _ := json.Marshal(resp)
	now := time.Now()
	midnight := time.Date(now.Year(), now.Month(), now.Day()+1, 0, 0, 0, 0, now.Location())
	ttl := time.Until(midnight)
	database.RDB.Set(ctx, cacheKey, string(respJSON), ttl)

	c.JSON(http.StatusOK, resp)
}
