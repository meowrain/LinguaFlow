package services

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"strings"
	"time"

	openai "github.com/cloudwego/eino-ext/components/model/openai"
	"github.com/cloudwego/eino/components/model"
	"github.com/cloudwego/eino/schema"
)

type SentenceAnalysisResult struct {
	Sentence       string   `json:"sentence"`
	Translation    string   `json:"translation"`
	WordCount      int      `json:"word_count"`
	Structure      []string `json:"structure"`
	KeyPhrases     []string `json:"key_phrases"`
	DifficultyTips []string `json:"difficulty_tips"`
	Provider       string   `json:"provider"`
}

type DailySentenceResult struct {
	Sentence    string `json:"sentence"`
	Translation string `json:"translation"`
	Topic       string `json:"topic"`
}

type ArticleAssistantMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type ArticleAssistantResult struct {
	Message  ArticleAssistantMessage `json:"message"`
	Provider string                  `json:"provider"`
}

type AIStudyNoteInput struct {
	ArticleTitle   string
	ArticleSummary string
	ArticleContent string
	EventsJSON     string
	VocabularyJSON string
}

type AIAnalysisService struct {
	BaseURL   string
	APIKey    string
	Model     string
	ChatModel *openai.ChatModel
}

func NewAIAnalysisService(baseURL, apiKey, modelName string, timeoutSeconds int) *AIAnalysisService {
	if timeoutSeconds <= 0 {
		timeoutSeconds = 20
	}

	baseURL = strings.TrimRight(baseURL, "/")

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	cm, err := openai.NewChatModel(ctx, &openai.ChatModelConfig{
		BaseURL: baseURL,
		APIKey:  apiKey,
		Model:   modelName,
		Timeout: time.Duration(timeoutSeconds) * time.Second,
	})
	if err != nil {
		// 初始化失败时 ChatModel 为 nil，IsConfigured() 返回 false
		return &AIAnalysisService{
			BaseURL: baseURL,
			APIKey:  apiKey,
			Model:   modelName,
		}
	}

	return &AIAnalysisService{
		BaseURL:   baseURL,
		APIKey:    apiKey,
		Model:     modelName,
		ChatModel: cm,
	}
}

func (s *AIAnalysisService) IsConfigured() bool {
	return s != nil && s.BaseURL != "" && s.APIKey != "" && s.Model != "" && s.ChatModel != nil
}

// chatOpts 根据模型特性构建 Eino Generate/Stream 选项
func (s *AIAnalysisService) chatOpts(temperature float64, maxTokens int) []model.Option {
	var opts []model.Option
	if t := temperatureForModel(s.Model, temperature); t != nil {
		opts = append(opts, model.WithTemperature(float32(*t)))
	}
	if maxTokens > 0 {
		opts = append(opts, model.WithMaxTokens(maxTokens))
	}
	return opts
}

// toSchemaMessages 将 ArticleAssistantMessage 历史转为 Eino schema.Message 列表
func toSchemaMessages(history []ArticleAssistantMessage) []*schema.Message {
	var msgs []*schema.Message
	for _, item := range history {
		role := strings.ToLower(strings.TrimSpace(item.Role))
		content := strings.TrimSpace(item.Content)
		if content == "" {
			continue
		}
		switch role {
		case "user":
			msgs = append(msgs, schema.UserMessage(content))
		case "assistant":
			msgs = append(msgs, schema.AssistantMessage(content, nil))
		case "system":
			msgs = append(msgs, schema.SystemMessage(content))
		}
	}
	return msgs
}

// generate 同步调用 LLM 并返回文本内容
func (s *AIAnalysisService) generate(ctx context.Context, messages []*schema.Message, temperature float64, maxTokens int) (string, error) {
	resp, err := s.ChatModel.Generate(ctx, messages, s.chatOpts(temperature, maxTokens)...)
	if err != nil {
		return "", err
	}
	content := strings.TrimSpace(resp.Content)
	if content == "" {
		return "", fmt.Errorf("AI 结果为空")
	}
	return content, nil
}

// stream 流式调用 LLM，每收到 delta 时调用 onDelta 回调
func (s *AIAnalysisService) stream(ctx context.Context, messages []*schema.Message, temperature float64, maxTokens int, onDelta func(string) error) error {
	sr, err := s.ChatModel.Stream(ctx, messages, s.chatOpts(temperature, maxTokens)...)
	if err != nil {
		return err
	}
	defer sr.Close()

	received := false
	for {
		chunk, err := sr.Recv()
		if errors.Is(err, io.EOF) {
			break
		}
		if err != nil {
			return err
		}
		delta := strings.TrimSpace(chunk.Content)
		if delta == "" {
			continue
		}
		received = true
		if err := onDelta(delta); err != nil {
			return err
		}
	}
	if !received {
		return fmt.Errorf("AI 结果为空")
	}
	return nil
}

// ---------- AnalyzeSentence ----------

func (s *AIAnalysisService) AnalyzeSentence(text string) (*SentenceAnalysisResult, error) {
	if !s.IsConfigured() {
		return nil, fmt.Errorf("AI 精读服务未配置")
	}

	messages := []*schema.Message{
		schema.SystemMessage(strings.TrimSpace(`你是一个面向中文英语学习者的精读老师。
请只返回 JSON，不要使用 Markdown，不要输出额外解释。
JSON 字段必须是：
sentence: 原英文句子
translation: 自然准确的中文翻译
word_count: 英文词数
structure: 字符串数组，2-5 条，拆解主干、从句、修饰成分、逻辑关系
key_phrases: 字符串数组，3-8 条，列出值得学习的短语或搭配
difficulty_tips: 字符串数组，2-5 条，指出阅读难点和理解方法`)),
		schema.UserMessage(fmt.Sprintf("请精读解析下面英文：\n%s", text)),
	}

	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	content, err := s.generate(ctx, messages, 0.2, 1200)
	if err != nil {
		return nil, fmt.Errorf("AI 精读请求失败: %w", err)
	}

	cleaned := cleanJSONContent(content)
	var analysis SentenceAnalysisResult
	if err := json.Unmarshal([]byte(cleaned), &analysis); err != nil {
		return nil, fmt.Errorf("解析 AI 精读 JSON 失败: %w", err)
	}

	if analysis.Sentence == "" {
		analysis.Sentence = text
	}
	if analysis.WordCount == 0 {
		analysis.WordCount = len(strings.Fields(text))
	}
	if len(analysis.Structure) == 0 || analysis.Translation == "" {
		return nil, fmt.Errorf("AI 精读结果缺少必要字段")
	}
	analysis.Provider = "ai"

	return &analysis, nil
}

// ---------- DiscussArticle ----------

func (s *AIAnalysisService) DiscussArticle(title, summary, content string, history []ArticleAssistantMessage) (*ArticleAssistantResult, error) {
	if !s.IsConfigured() {
		return nil, fmt.Errorf("AI 文章助手未配置")
	}

	messages := buildArticleAssistantMessages(title, summary, content, history)

	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	text, err := s.generate(ctx, messages, 0.4, 1200)
	if err != nil {
		return nil, fmt.Errorf("AI 助手请求失败: %w", err)
	}

	return &ArticleAssistantResult{
		Message: ArticleAssistantMessage{
			Role:    "assistant",
			Content: text,
		},
		Provider: "ai",
	}, nil
}

// ---------- DiscussArticleStream ----------

func (s *AIAnalysisService) DiscussArticleStream(title, summary, content string, history []ArticleAssistantMessage, onDelta func(string) error) error {
	if !s.IsConfigured() {
		return fmt.Errorf("AI 文章助手未配置")
	}
	if onDelta == nil {
		return fmt.Errorf("AI 文章助手流式回调未配置")
	}

	messages := buildArticleAssistantMessages(title, summary, content, history)

	ctx, cancel := context.WithTimeout(context.Background(), 120*time.Second)
	defer cancel()

	return s.stream(ctx, messages, 0.4, 1200, onDelta)
}

// ---------- GenerateStudyNote ----------

func (s *AIAnalysisService) GenerateStudyNote(input AIStudyNoteInput) (*ArticleStudyNoteResponse, error) {
	if !s.IsConfigured() {
		return nil, fmt.Errorf("AI 精读笔记服务未配置")
	}

	messages := []*schema.Message{
		schema.SystemMessage(strings.TrimSpace(`你是一个面向中文英语学习者的精读笔记整理助手。
请只返回 JSON，不要使用 Markdown，不要输出额外解释。
JSON 字段必须是：
summary: 字符串，中文，概括文章内容和本次学习行为
keywords: 字符串数组，精确 5 个关键词
difficult_sentences: 数组，精确 2 项，每项包含 text, translation, reason, tips。tips 是字符串数组
grammar_points: 数组，每项包含 title, description, examples。examples 是字符串数组
expression_replacements: 数组，精确 3 项，每项包含 original, alternative, note
review_plan: 字符串数组，3-5 条复习动作
要求：
1. 优先使用用户查过、翻译过、精读过、问过 AI 的内容。
2. 不编造文章没有出现的细节。
3. 输出适合读后复习，简洁但可执行。`)),
		schema.UserMessage(fmt.Sprintf(strings.TrimSpace(`文章标题：
%s

文章摘要：
%s

文章正文节选：
%s

用户学习事件 JSON：
%s

本篇生词 JSON：
%s`), input.ArticleTitle, input.ArticleSummary, input.ArticleContent, input.EventsJSON, input.VocabularyJSON)),
	}

	ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
	defer cancel()

	text, err := s.generate(ctx, messages, 0.25, 1800)
	if err != nil {
		return nil, fmt.Errorf("AI 精读笔记请求失败: %w", err)
	}

	cleaned := cleanJSONContent(text)
	var note ArticleStudyNoteResponse
	if err := json.Unmarshal([]byte(cleaned), &note); err != nil {
		return nil, fmt.Errorf("解析 AI 精读笔记 JSON 失败: %w", err)
	}
	if strings.TrimSpace(note.Summary) == "" {
		return nil, fmt.Errorf("AI 精读笔记缺少摘要")
	}
	note.Provider = "ai"
	return &note, nil
}

// ---------- GenerateDailySentence ----------

func (s *AIAnalysisService) GenerateDailySentence() (*DailySentenceResult, error) {
	if !s.IsConfigured() {
		return nil, fmt.Errorf("AI 服务未配置")
	}

	messages := []*schema.Message{
		schema.SystemMessage(strings.TrimSpace(`你是一个面向中文英语学习者的每日英文精选老师。
请生成一句有趣的英文句子，适合中高级英语学习者（CET-4 水平）。
要求：
1. 句子内容应包含有用的词汇或地道表达
2. 涉及科技、文化、生活方式、自然等话题
3. 句子要有一定深度和可讨论性，但不要太长（15-30 词）
4. 每天的句子不要重复主题

请只返回 JSON，不要使用 Markdown，不要输出额外解释。
JSON 字段必须是：
sentence: 英文句子
translation: 自然准确的中文翻译
topic: 话题分类（如：科技、文化、生活方式、自然、教育等）`)),
		schema.UserMessage("请生成今天的每日一句。"),
	}

	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	text, err := s.generate(ctx, messages, 0.8, 300)
	if err != nil {
		return nil, fmt.Errorf("每日一句请求失败: %w", err)
	}

	cleaned := cleanJSONContent(text)
	var result DailySentenceResult
	if err := json.Unmarshal([]byte(cleaned), &result); err != nil {
		return nil, fmt.Errorf("解析每日一句 JSON 失败: %w", err)
	}

	if result.Sentence == "" || result.Translation == "" {
		return nil, fmt.Errorf("每日一句结果缺少必要字段")
	}

	return &result, nil
}

// ---------- GenerateStudyPlanStream ----------

func (s *AIAnalysisService) GenerateStudyPlanStream(input StudyPlanDataInput, onDelta func(string) error) error {
	if !s.IsConfigured() {
		return fmt.Errorf("AI 学习计划服务未配置")
	}
	if onDelta == nil {
		return fmt.Errorf("AI 学习计划流式回调未配置")
	}

	prompt := buildStudyPlanPrompt(input)

	messages := []*schema.Message{
		schema.SystemMessage(strings.TrimSpace(`你是一个面向中文英语学习者的 AI 学习规划助手。
请根据用户的学习数据，生成今日学习计划。
要求：
1. 使用中文回复
2. 内容要具体、可执行
3. 计划要平衡听说读写
4. 考虑用户的考试目标和当前水平
5. 输出格式为友好的学习计划文本
6. 每天的计划应包括：单词复习、新文章阅读、视频学习、练习建议等`)),
		schema.UserMessage(prompt),
	}

	ctx, cancel := context.WithTimeout(context.Background(), 120*time.Second)
	defer cancel()

	return s.stream(ctx, messages, 0.4, 1500, onDelta)
}

// ---------- 内部工具函数 ----------

func buildArticleAssistantMessages(title, summary, content string, history []ArticleAssistantMessage) []*schema.Message {
	messages := []*schema.Message{
		schema.SystemMessage(strings.TrimSpace(`你是一个面向中文英语学习者的文章阅读 AI 助手。
你需要围绕用户正在阅读的英文文章回答问题、解释观点、拆解语言点、引导思考。
回答要求：
1. 主要使用中文，必要时保留英文原句或关键词。
2. 所有解释必须基于给定文章内容；如果用户问到文章外事实，请明确说明并区分推断。
3. 不要编造文章没有出现的细节。
4. 用户问语言学习问题时，给出简洁例句、词组或句式拆解。
5. 回答保持清晰、自然，避免 Markdown 表格。`)),
		schema.UserMessage(fmt.Sprintf(strings.TrimSpace(`文章标题：
%s

文章摘要：
%s

文章正文：
%s`), title, summary, content)),
		schema.AssistantMessage("我已阅读这篇文章。你可以问我文章观点、段落逻辑、词句理解、背景推断或学习建议。", nil),
	}

	messages = append(messages, toSchemaMessages(history)...)
	return messages
}

func temperatureForModel(modelName string, value float64) *float64 {
	normalized := strings.ToLower(strings.TrimSpace(modelName))
	if strings.HasPrefix(normalized, "mimo-v2.5") {
		return nil
	}
	return &value
}

func cleanJSONContent(content string) string {
	content = strings.TrimSpace(content)
	content = strings.TrimPrefix(content, "```json")
	content = strings.TrimPrefix(content, "```")
	content = strings.TrimSuffix(content, "```")
	return strings.TrimSpace(content)
}

type StudyPlanDataInput struct {
	UserID             uint   `json:"user_id"`
	ReviewDueWords     int    `json:"review_due_words"`
	ForgottenWords     int    `json:"forgotten_words"`
	RecentReadingCount int    `json:"recent_reading_count"`
	WordBookBacklog    int    `json:"wordbook_backlog"`
	IncompleteVideos   int    `json:"incomplete_videos"`
	TargetExam         string `json:"target_exam"`
	CurrentLevel       string `json:"current_level"`
	TargetLevel        string `json:"target_level"`
	DailyReadMinutes   int    `json:"daily_read_minutes"`
	DailyReviewWords   int    `json:"daily_review_words"`
	DailyArticles      int    `json:"daily_articles"`
}

func buildStudyPlanPrompt(input StudyPlanDataInput) string {
	var sb strings.Builder
	sb.WriteString("请根据以下用户学习数据，生成今日学习计划：\n\n")

	sb.WriteString("【学习数据统计】\n")
	sb.WriteString(fmt.Sprintf("- 待复习单词数：%d\n", input.ReviewDueWords))
	sb.WriteString(fmt.Sprintf("- 高遗忘词数（遗忘3次以上）：%d\n", input.ForgottenWords))
	sb.WriteString(fmt.Sprintf("- 最近7天阅读文章数：%d\n", input.RecentReadingCount))
	sb.WriteString(fmt.Sprintf("- 词书积压词数：%d\n", input.WordBookBacklog))
	sb.WriteString(fmt.Sprintf("- 未完成视频课程数：%d\n", input.IncompleteVideos))

	sb.WriteString("\n【学习目标设置】\n")
	if input.TargetExam != "" {
		sb.WriteString(fmt.Sprintf("- 目标考试：%s\n", input.TargetExam))
	}
	if input.CurrentLevel != "" {
		sb.WriteString(fmt.Sprintf("- 当前水平：%s\n", input.CurrentLevel))
	}
	if input.TargetLevel != "" {
		sb.WriteString(fmt.Sprintf("- 目标水平：%s\n", input.TargetLevel))
	}

	sb.WriteString("\n【每日目标】\n")
	sb.WriteString(fmt.Sprintf("- 每日阅读时长：%d 分钟\n", input.DailyReadMinutes))
	sb.WriteString(fmt.Sprintf("- 每日复习单词数：%d 个\n", input.DailyReviewWords))
	sb.WriteString(fmt.Sprintf("- 每日阅读文章数：%d 篇\n", input.DailyArticles))

	sb.WriteString("\n请生成今日具体可执行的学习计划。")
	return sb.String()
}
