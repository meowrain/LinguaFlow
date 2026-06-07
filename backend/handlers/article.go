package handlers

import (
	"fmt"
	"gugudu-backend/database"
	"gugudu-backend/models"
	"gugudu-backend/services"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

var aiAnalysisService *services.AIAnalysisService

// InitAIAnalysisService 初始化 AI 精读服务
func InitAIAnalysisService(enabled bool, baseURL, apiKey, model string, timeoutSeconds int) {
	if !enabled {
		aiAnalysisService = nil
		return
	}

	aiAnalysisService = services.NewAIAnalysisService(baseURL, apiKey, model, timeoutSeconds)
	if aiAnalysisService.IsConfigured() {
		fmt.Printf("✓ AI 精读已初始化: %s\n", model)
	} else {
		fmt.Println("✗ AI 精读配置不完整")
	}
}

// GetArticles 获取文章列表
func GetArticles(c *gin.Context) {
	var articles []models.Article

	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "20"))
	categorySlug := c.Query("category")
	difficulty := c.Query("difficulty")
	search := c.Query("search")

	offset := (page - 1) * pageSize

	query := database.DB.Model(&models.Article{}).
		Preload("Category").
		Where("status = ?", "published")

	if categorySlug != "" {
		query = query.Joins("JOIN categories ON categories.id = articles.category_id").
			Where("categories.slug = ?", categorySlug)
	}

	if difficulty != "" {
		query = query.Where("difficulty_level = ?", difficulty)
	}

	if search != "" {
		query = query.Where("title ILIKE ? OR summary ILIKE ?", "%"+search+"%", "%"+search+"%")
	}

	var total int64
	query.Count(&total)

	if err := query.Order("published_at DESC").
		Offset(offset).
		Limit(pageSize).
		Find(&articles).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"data": articles,
		"pagination": gin.H{
			"page":       page,
			"page_size":  pageSize,
			"total":      total,
			"total_page": (total + int64(pageSize) - 1) / int64(pageSize),
		},
	})
}

// GetArticleBySlug 根据 slug 获取文章详情
func GetArticleBySlug(c *gin.Context) {
	slug := c.Param("slug")

	var article models.Article
	if err := database.DB.Preload("Category").
		Where("slug = ? AND status = ?", slug, "published").
		First(&article).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Article not found"})
		return
	}

	// 增加浏览量
	database.DB.Model(&article).Update("view_count", article.ViewCount+1)

	// 如果用户已登录，记录阅读历史
	if userID, exists := c.Get("user_id"); exists {
		var history models.ReadHistory
		database.DB.Where("user_id = ? AND article_id = ?", userID, article.ID).
			FirstOrCreate(&history, models.ReadHistory{
				UserID:    userID.(uint),
				ArticleID: article.ID,
			})

		history.LastReadAt = time.Now()
		database.DB.Save(&history)
	}

	c.JSON(http.StatusOK, gin.H{"data": article})
}

// GetFeaturedArticles 获取精选文章
func GetFeaturedArticles(c *gin.Context) {
	var articles []models.Article

	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "6"))

	if err := database.DB.Preload("Category").
		Where("status = ? AND is_featured = ?", "published", true).
		Order("published_at DESC").
		Limit(limit).
		Find(&articles).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": articles})
}

// GetCategories 获取分类列表
func GetCategories(c *gin.Context) {
	var categories []models.Category

	if err := database.DB.Order("sort_order ASC, name ASC").Find(&categories).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": categories})
}

// UpdateReadProgress 更新阅读进度
func UpdateReadProgress(c *gin.Context) {
	userID, _ := c.Get("user_id")
	articleID, _ := strconv.Atoi(c.Param("id"))

	var req struct {
		Progress float64 `json:"progress" binding:"required,min=0,max=100"`
		ReadTime int     `json:"read_time"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var history models.ReadHistory
	database.DB.Where("user_id = ? AND article_id = ?", userID, articleID).
		FirstOrCreate(&history, models.ReadHistory{
			UserID:    userID.(uint),
			ArticleID: uint(articleID),
		})

	wasCompleted := history.IsCompleted
	history.ReadProgress = req.Progress
	history.ReadTime += req.ReadTime
	history.LastReadAt = time.Now()

	if req.Progress >= 100 {
		history.IsCompleted = true
	}

	if err := database.DB.Save(&history).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if req.ReadTime > 0 {
		addedMinutes := (req.ReadTime + 59) / 60
		database.DB.Model(&models.User{}).Where("id = ?", userID).
			UpdateColumn("total_read_time", database.DB.Raw("total_read_time + ?", addedMinutes))
	}

	if history.IsCompleted && !wasCompleted {
		database.DB.Model(&models.User{}).Where("id = ?", userID).
			UpdateColumn("articles_read", database.DB.Raw("articles_read + 1"))
	}

	c.JSON(http.StatusOK, gin.H{"message": "Progress updated", "data": history})
}

// GetArticleCompletion 获取文章阅读完成摘要
func GetArticleCompletion(c *gin.Context) {
	userID, _ := c.Get("user_id")
	articleID, _ := strconv.Atoi(c.Param("id"))

	var article models.Article
	if err := database.DB.Preload("Category").
		Where("id = ?", articleID).
		First(&article).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Article not found"})
		return
	}

	var history models.ReadHistory
	database.DB.Where("user_id = ? AND article_id = ?", userID, articleID).First(&history)

	var words []models.Vocabulary
	if err := database.DB.Where("user_id = ? AND article_id = ?", userID, articleID).
		Order("created_at DESC").
		Find(&words).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	learnedCount := 0
	dueCount := 0
	now := time.Now()
	for _, word := range words {
		if word.IsLearned {
			learnedCount++
		}
		if !word.IsLearned || word.NextReviewAt == nil || !word.NextReviewAt.After(now) {
			dueCount++
		}
	}

	nextArticle := models.Article{}
	database.DB.Preload("Category").
		Where("status = ? AND id <> ? AND difficulty_level = ?", "published", article.ID, article.DifficultyLevel).
		Order("published_at DESC").
		First(&nextArticle)

	c.JSON(http.StatusOK, gin.H{
		"data": gin.H{
			"article": article,
			"history": history,
			"stats": gin.H{
				"read_time":        history.ReadTime,
				"read_progress":    history.ReadProgress,
				"is_completed":     history.IsCompleted,
				"new_words":        len(words),
				"learned_words":    learnedCount,
				"due_review_words": dueCount,
			},
			"words":        words,
			"next_article": nextArticle,
		},
	})
}

type sentenceAnalysis struct {
	Sentence       string   `json:"sentence"`
	Translation    string   `json:"translation"`
	WordCount      int      `json:"word_count"`
	Structure      []string `json:"structure"`
	KeyPhrases     []string `json:"key_phrases"`
	DifficultyTips []string `json:"difficulty_tips"`
	Provider       string   `json:"provider"`
}

// AnalyzeSentence 句子级精读
func AnalyzeSentence(c *gin.Context) {
	var req struct {
		Text string `json:"text" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	text := strings.TrimSpace(req.Text)
	if aiAnalysisService != nil && aiAnalysisService.IsConfigured() {
		if result, err := aiAnalysisService.AnalyzeSentence(text); err == nil {
			c.JSON(http.StatusOK, gin.H{"data": result})
			return
		} else {
			fmt.Printf("AI 精读失败，回退规则解析: %v\n", err)
		}
	}

	translation := mockTranslate(text, "zh")
	if translationService != nil {
		if result, _, err := translationService.Translate(text, "en", "zh"); err == nil && result != "" {
			translation = result
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"data": buildSentenceAnalysis(text, translation),
	})
}

func buildSentenceAnalysis(text, translation string) sentenceAnalysis {
	words := regexp.MustCompile(`[A-Za-z]+(?:['’][A-Za-z]+)?`).FindAllString(text, -1)
	structure := []string{"主干：先找谓语动词，再回看谓语前的主语和谓语后的宾语/补语。"}

	if strings.Contains(text, ",") {
		structure = append(structure, "逗号分隔了插入信息或并列分句，阅读时可以先跳过逗号内的信息。")
	}
	lower := strings.ToLower(text)
	for _, marker := range []string{"because", "when", "while", "if", "although", "that", "which", "who"} {
		if strings.Contains(lower, " "+marker+" ") {
			structure = append(structure, fmtClauseTip(marker))
		}
	}

	keyPhrases := extractKeyPhrases(words)
	tips := make([]string, 0)
	if len(words) >= 24 {
		tips = append(tips, "句子较长，可以按逗号、连词和介词短语切成几个信息块。")
	}
	if strings.Contains(lower, "not ") || strings.Contains(lower, " no ") {
		tips = append(tips, "注意否定词，它会改变整句判断方向。")
	}
	if strings.Contains(lower, "can ") || strings.Contains(lower, "could ") || strings.Contains(lower, "may ") || strings.Contains(lower, "might ") {
		tips = append(tips, "情态动词表达可能性、能力或建议，不等于事实已经发生。")
	}
	if len(tips) == 0 {
		tips = append(tips, "先理解主谓宾，再处理修饰成分。")
	}

	return sentenceAnalysis{
		Sentence:       text,
		Translation:    translation,
		WordCount:      len(words),
		Structure:      structure,
		KeyPhrases:     keyPhrases,
		DifficultyTips: tips,
		Provider:       "rules",
	}
}

func fmtClauseTip(marker string) string {
	switch marker {
	case "because":
		return "because 引导原因，从句解释主句为什么成立。"
	case "when", "while":
		return marker + " 引导时间/背景，从句提供动作发生的条件或场景。"
	case "if":
		return "if 引导条件，先理解条件，再看主句结果。"
	case "although":
		return "although 引导让步，主句通常表达转折后的重点。"
	case "that", "which", "who":
		return marker + " 可能引导从句，通常修饰前面的名词或补充说明。"
	default:
		return marker + " 引导从句，建议拆开理解。"
	}
}

func extractKeyPhrases(words []string) []string {
	stop := map[string]bool{
		"the": true, "a": true, "an": true, "and": true, "or": true, "but": true,
		"to": true, "of": true, "in": true, "on": true, "for": true, "with": true,
		"is": true, "are": true, "was": true, "were": true, "be": true, "been": true,
	}
	phrases := make([]string, 0)
	for i := 0; i < len(words)-1 && len(phrases) < 6; i++ {
		left := strings.ToLower(words[i])
		right := strings.ToLower(words[i+1])
		if stop[left] || stop[right] || len(left) < 4 || len(right) < 4 {
			continue
		}
		phrase := left + " " + right
		duplicate := false
		for _, existing := range phrases {
			if existing == phrase {
				duplicate = true
				break
			}
		}
		if !duplicate {
			phrases = append(phrases, phrase)
		}
	}
	if len(phrases) == 0 && len(words) > 0 {
		phrases = append(phrases, strings.ToLower(words[0]))
	}
	return phrases
}
