package handlers

import (
	"context"
	"crypto/md5"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"gugudu-backend/database"
	"gugudu-backend/models"
	"gugudu-backend/services"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

var translationService *services.TranslationService
var dictionaryService wordLookupService

type wordLookupService interface {
	LookupWord(word string) (*services.DictionaryResult, error)
}

// InitTranslationService 初始化翻译服务
func InitTranslationService(baiduAppID, baiduSecret, baiduDictAPIKey, baiduDictSecretKey, youdaoAppKey, youdaoAppSecret string) {
	translationService = services.NewTranslationService()

	fmt.Printf("初始化翻译服务...\n")
	fmt.Printf("百度翻译 AppID: %s\n", baiduAppID)
	fmt.Printf("百度词典 API Key: %s\n", baiduDictAPIKey)
	fmt.Printf("有道翻译 AppKey: %s\n", youdaoAppKey)

	// 添加百度翻译
	if baiduAppID != "" && baiduSecret != "" {
		baidu := services.NewBaiduTranslator(baiduAppID, baiduSecret)
		translationService.AddProvider(baidu)
		fmt.Println("✓ 百度翻译已初始化")
	}

	// 优先使用百度智能云文本翻译-词典版
	if baiduDictAPIKey != "" && baiduDictSecretKey != "" {
		dictionaryService = services.NewBaiduDictionaryService(baiduDictAPIKey, baiduDictSecretKey)
		fmt.Println("✓ 百度词典版已初始化")
	}

	// 添加有道翻译
	if youdaoAppKey != "" && youdaoAppSecret != "" {
		youdao := services.NewYoudaoTranslator(youdaoAppKey, youdaoAppSecret)
		translationService.AddProvider(youdao)
		fmt.Println("✓ 有道翻译已初始化")

		if dictionaryService == nil {
			dictionaryService = services.NewYoudaoDictionaryService(youdaoAppKey, youdaoAppSecret)
			fmt.Println("✓ 有道词典已初始化")
		}
	} else {
		fmt.Println("✗ 有道词典未配置")
	}

	if dictionaryService == nil {
		fmt.Println("✗ 词典服务未配置")
	}
}

// TranslateRequest 翻译请求
type TranslateRequest struct {
	Text       string `json:"text" binding:"required"`
	TargetLang string `json:"target_lang" binding:"required"` // zh, en
	SourceLang string `json:"source_lang"`
}

// TranslateResponse 翻译响应
type TranslateResponse struct {
	SourceText  string `json:"source_text"`
	Translation string `json:"translation"`
	TargetLang  string `json:"target_lang"`
	Provider    string `json:"provider"`
	Cached      bool   `json:"cached"`
}

// Translate 翻译文本（支持划词翻译、段落翻译）
func Translate(c *gin.Context) {
	var req TranslateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// 生成缓存 key
	cacheKey := generateCacheKey(req.Text, req.TargetLang)

	// 先查询 Redis 缓存
	ctx := context.Background()
	cachedResult, err := database.RDB.Get(ctx, cacheKey).Result()
	if err == nil && cachedResult != "" {
		c.JSON(http.StatusOK, TranslateResponse{
			SourceText:  req.Text,
			Translation: cachedResult,
			TargetLang:  req.TargetLang,
			Provider:    "cache",
			Cached:      true,
		})
		return
	}

	// 查询数据库缓存
	var cache models.TranslationCache
	if err := database.DB.Where("source_text = ? AND target_lang = ?", req.Text, req.TargetLang).
		First(&cache).Error; err == nil {
		// 写入 Redis 缓存
		database.RDB.Set(ctx, cacheKey, cache.Translation, 24*time.Hour)

		c.JSON(http.StatusOK, TranslateResponse{
			SourceText:  req.Text,
			Translation: cache.Translation,
			TargetLang:  req.TargetLang,
			Provider:    cache.Provider,
			Cached:      true,
		})
		return
	}

	translation := ""
	provider := "mock"

	if translationService != nil {
		if result, providerName, err := translationService.Translate(req.Text, req.SourceLang, req.TargetLang); err == nil {
			translation = result
			provider = providerName
		}
	}

	if translation == "" {
		translation = mockTranslate(req.Text, req.TargetLang)
	}

	// 保存到数据库
	newCache := models.TranslationCache{
		SourceText:  req.Text,
		TargetLang:  req.TargetLang,
		Translation: translation,
		Provider:    provider,
	}
	database.DB.Create(&newCache)

	// 写入 Redis 缓存
	database.RDB.Set(ctx, cacheKey, translation, 24*time.Hour)

	c.JSON(http.StatusOK, TranslateResponse{
		SourceText:  req.Text,
		Translation: translation,
		TargetLang:  req.TargetLang,
		Provider:    provider,
		Cached:      false,
	})
}

// LookupWord 查词（获取单词详细释义）
func LookupWord(c *gin.Context) {
	word := normalizeLookupWord(c.Query("word"))
	if word == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Word parameter required"})
		return
	}

	if result, ok := getDictionaryCache(word); ok {
		c.JSON(http.StatusOK, gin.H{"data": result})
		return
	}

	// 如果配置了词典服务，使用真实的词典服务
	if dictionaryService != nil {
		result, err := dictionaryService.LookupWord(word)
		if err == nil {
			saveDictionaryCache(word, "dictionary", result)
			c.JSON(http.StatusOK, gin.H{"data": result})
			return
		}
		// 如果失败，记录错误并继续
		errMsg := fmt.Sprintf("词典查询失败: %v", err)
		fmt.Println(errMsg)

		// 返回错误给前端
		c.JSON(http.StatusOK, gin.H{
			"data": map[string]interface{}{
				"word":        word,
				"translation": "查词失败",
				"error":       errMsg,
			},
		})
		return
	}

	// 使用百度翻译作为后备方案，构建丰富的返回格式
	if translationService != nil {
		translation, provider, err := translationService.Translate(word, "en", "zh")
		if err == nil {
			// 构建模拟的详细词典结果
			result := map[string]interface{}{
				"word":        word,
				"translation": translation,
				"provider":    provider,
				"phonetic":    "", // 百度翻译不提供音标
				"uk_phonetic": "", // 需要有道词典
				"us_phonetic": "", // 需要有道词典
				"definitions": []map[string]string{
					{"definition": translation}, // 基本翻译
				},
			}
			saveDictionaryCache(word, provider, dictionaryResultFromMap(result))
			c.JSON(http.StatusOK, gin.H{"data": result})
			return
		}
	}

	// 最后才返回模拟数据
	wordInfo := mockDictionary(word)
	saveDictionaryCache(word, "mock", dictionaryResultFromMap(wordInfo))
	c.JSON(http.StatusOK, gin.H{"data": wordInfo})
}

// AddToVocabulary 添加到生词本
func AddToVocabulary(c *gin.Context) {
	userID, _ := c.Get("user_id")

	var req struct {
		Word        string `json:"word" binding:"required"`
		ArticleID   *uint  `json:"article_id"`
		Context     string `json:"context"`
		Phonetic    string `json:"phonetic"`
		Definition  string `json:"definition"`
		Translation string `json:"translation"`
		Examples    string `json:"examples"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// 检查是否已存在
	var existing models.Vocabulary
	if err := database.DB.Where("user_id = ? AND word = ?", userID, req.Word).
		First(&existing).Error; err == nil {
		c.JSON(http.StatusOK, gin.H{
			"message": "Word already exists in vocabulary",
			"data":    existing,
		})
		return
	}

	vocab := models.Vocabulary{
		UserID:      userID.(uint),
		Word:        req.Word,
		ArticleID:   req.ArticleID,
		Context:     req.Context,
		Phonetic:    req.Phonetic,
		Definition:  req.Definition,
		Translation: req.Translation,
		Examples:    req.Examples,
		ReviewEase:  2.5,
	}

	if err := database.DB.Create(&vocab).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to add word"})
		return
	}

	// 更新用户学习统计
	database.DB.Model(&models.User{}).Where("id = ?", userID).
		UpdateColumn("words_learned", database.DB.Raw("words_learned + 1"))

	c.JSON(http.StatusCreated, gin.H{
		"message": "Word added to vocabulary",
		"data":    vocab,
	})
}

// GetVocabulary 获取生词本
func GetVocabulary(c *gin.Context) {
	userID, _ := c.Get("user_id")

	var vocabulary []models.Vocabulary
	query := database.DB.Where("user_id = ?", userID)

	if c.Query("due") == "true" {
		now := time.Now()
		query = query.Where("is_learned = ? OR next_review_at IS NULL OR next_review_at <= ?", false, now)
	}

	if articleID := c.Query("article_id"); articleID != "" {
		query = query.Where("article_id = ?", articleID)
	}

	if err := query.
		Order("COALESCE(next_review_at, created_at) ASC, created_at DESC").
		Find(&vocabulary).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": vocabulary})
}

// generateCacheKey 生成缓存 key
func generateCacheKey(text, targetLang string) string {
	hash := md5.Sum([]byte(text + ":" + targetLang))
	return "translate:" + hex.EncodeToString(hash[:])
}

// mockDictionary 模拟词典查询
func mockDictionary(word string) map[string]interface{} {
	// 实际应该调用词典 API
	return map[string]interface{}{
		"word":     word,
		"phonetic": "/wɜːrd/",
		"definitions": []map[string]interface{}{
			{
				"pos":        "noun",
				"definition": "A single unit of language",
				"example":    "He wrote a short word.",
			},
		},
		"translation": "单词；词",
		"examples": []string{
			"The word is on the tip of my tongue.",
		},
	}
}

func mockTranslate(text, targetLang string) string {
	dictionary := map[string]string{
		"data":         "数据",
		"energy":       "能源",
		"business":     "商业",
		"artificial":   "人工的",
		"intelligence": "智能",
		"technology":   "技术",
		"health":       "健康",
		"climate":      "气候",
		"power":        "电力；力量",
		"companies":    "公司",
		"customers":    "客户",
		"workers":      "工人；从业者",
		"outbreak":     "疫情暴发",
		"brain":        "大脑",
		"computer":     "计算机",
		"interface":    "接口",
	}

	if targetLang != "zh" {
		return text
	}

	if translation, ok := dictionary[text]; ok {
		return translation
	}

	return "模拟翻译：" + text
}

// MarkWordLearned 标记单词已掌握
func MarkWordLearned(c *gin.Context) {
	userID, _ := c.Get("user_id")
	wordID := c.Param("id")

	var vocab models.Vocabulary
	if err := database.DB.Where("id = ? AND user_id = ?", wordID, userID).
		First(&vocab).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Word not found"})
		return
	}

	vocab.IsLearned = true
	now := time.Now()
	vocab.LastReview = &now

	if err := database.DB.Save(&vocab).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update word"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "Word marked as learned",
		"data":    vocab,
	})
}

// ReviewVocabulary 提交一次复习结果
func ReviewVocabulary(c *gin.Context) {
	userID, _ := c.Get("user_id")
	wordID := c.Param("id")

	var req struct {
		Rating string `json:"rating" binding:"required"` // forgot, hard, good
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var vocab models.Vocabulary
	if err := database.DB.Where("id = ? AND user_id = ?", wordID, userID).
		First(&vocab).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Word not found"})
		return
	}

	now := time.Now()
	ease := vocab.ReviewEase
	if ease <= 0 {
		ease = 2.5
	}
	interval := vocab.ReviewInterval

	switch req.Rating {
	case "forgot":
		interval = 1
		ease -= 0.2
		vocab.IsLearned = false
	case "hard":
		if interval < 1 {
			interval = 1
		} else {
			interval = maxInt(1, int(float64(interval)*1.4))
		}
		ease -= 0.05
		vocab.IsLearned = false
	case "good":
		if interval < 1 {
			interval = 2
		} else {
			interval = maxInt(interval+1, int(float64(interval)*ease))
		}
		ease += 0.05
		vocab.IsLearned = vocab.ReviewCount >= 2 || interval >= 7
	default:
		c.JSON(http.StatusBadRequest, gin.H{"error": "rating must be forgot, hard, or good"})
		return
	}

	if ease < 1.3 {
		ease = 1.3
	}
	nextReview := now.AddDate(0, 0, interval)
	vocab.ReviewCount++
	vocab.ReviewInterval = interval
	vocab.ReviewEase = ease
	vocab.LastReview = &now
	vocab.NextReviewAt = &nextReview

	if err := database.DB.Save(&vocab).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to review word"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Review saved", "data": vocab})
}

func getDictionaryCache(word string) (*services.DictionaryResult, bool) {
	var cache models.DictionaryCache
	if err := database.DB.Where("word = ?", word).First(&cache).Error; err != nil {
		return nil, false
	}

	result := &services.DictionaryResult{
		Word:        cache.Word,
		Phonetic:    cache.Phonetic,
		UKPhonetic:  cache.UKPhonetic,
		USPhonetic:  cache.USPhonetic,
		SpeechURL:   cache.SpeechURL,
		UKSpeechURL: cache.UKSpeechURL,
		USSpeechURL: cache.USSpeechURL,
		Translation: cache.Translation,
		Error:       cache.Error,
	}
	_ = json.Unmarshal([]byte(cache.Definitions), &result.Definitions)
	_ = json.Unmarshal([]byte(cache.WebMeanings), &result.WebMeanings)
	return result, true
}

func saveDictionaryCache(word, provider string, result *services.DictionaryResult) {
	if result == nil || word == "" {
		return
	}

	definitions, _ := json.Marshal(result.Definitions)
	webMeanings, _ := json.Marshal(result.WebMeanings)
	cache := models.DictionaryCache{
		Word:        word,
		Provider:    provider,
		Phonetic:    result.Phonetic,
		UKPhonetic:  result.UKPhonetic,
		USPhonetic:  result.USPhonetic,
		SpeechURL:   result.SpeechURL,
		UKSpeechURL: result.UKSpeechURL,
		USSpeechURL: result.USSpeechURL,
		Translation: result.Translation,
		Definitions: string(definitions),
		WebMeanings: string(webMeanings),
		Error:       result.Error,
	}

	var existing models.DictionaryCache
	if err := database.DB.Where("word = ?", word).First(&existing).Error; err == nil {
		cache.ID = existing.ID
		cache.CreatedAt = existing.CreatedAt
		database.DB.Save(&cache)
		return
	}
	database.DB.Create(&cache)
}

func dictionaryResultFromMap(data map[string]interface{}) *services.DictionaryResult {
	result := &services.DictionaryResult{}
	if value, ok := data["word"].(string); ok {
		result.Word = value
	}
	if value, ok := data["phonetic"].(string); ok {
		result.Phonetic = value
	}
	if value, ok := data["translation"].(string); ok {
		result.Translation = value
	}
	if values, ok := data["definitions"].([]map[string]string); ok {
		for _, item := range values {
			result.Definitions = append(result.Definitions, services.DefinitionItem{
				Pos:        item["pos"],
				Definition: item["definition"],
			})
		}
	}
	return result
}

func normalizeLookupWord(word string) string {
	word = strings.TrimSpace(strings.ToLower(word))
	word = strings.Trim(word, " \t\r\n.,;:!?\"'()[]{}")
	return word
}

func maxInt(a, b int) int {
	if a > b {
		return a
	}
	return b
}
