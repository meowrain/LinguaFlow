package handlers

import (
	"errors"
	"fmt"
	"gugudu-backend/services"
	"net/http"
	"os"

	"github.com/gin-gonic/gin"
)

var ttsService *services.TTSService

// InitTTSService 初始化模型 TTS 服务
func InitTTSService(enabled bool, baseURL, apiKey, model, voice, responseFormat, instructions, cacheDir string, timeoutSeconds, maxInputLength int) {
	if !enabled {
		ttsService = nil
		return
	}

	ttsService = services.NewTTSService(
		baseURL,
		apiKey,
		model,
		voice,
		responseFormat,
		instructions,
		cacheDir,
		timeoutSeconds,
		maxInputLength,
	)
	if ttsService.IsConfigured() {
		fmt.Printf("✓ TTS 已初始化: %s / %s\n", model, voice)
	} else {
		fmt.Println("✗ TTS 配置不完整")
	}
}

// GenerateSpeech 生成 TTS 音频并返回缓存 URL
func GenerateSpeech(c *gin.Context) {
	if ttsService == nil || !ttsService.IsConfigured() {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "TTS 服务未配置"})
		return
	}

	var req services.TTSRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	result, err := ttsService.Generate(req)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": result})
}

// GetSpeechAudio 返回缓存音频文件
func GetSpeechAudio(c *gin.Context) {
	if ttsService == nil || !ttsService.IsConfigured() {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "TTS 服务未配置"})
		return
	}

	path, contentType, err := ttsService.AudioFilePath(c.Param("filename"))
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			c.JSON(http.StatusNotFound, gin.H{"error": "音频不存在"})
			return
		}
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.Header("Cache-Control", "public, max-age=31536000, immutable")
	c.Header("Content-Type", contentType)
	c.File(path)
}
