package services

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
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

type AIAnalysisService struct {
	BaseURL string
	APIKey  string
	Model   string
	client  *http.Client
}

type chatCompletionRequest struct {
	Model       string        `json:"model"`
	Messages    []chatMessage `json:"messages"`
	Temperature float64       `json:"temperature"`
	MaxTokens   int           `json:"max_tokens"`
}

type chatMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type chatCompletionResponse struct {
	Choices []struct {
		Message chatMessage `json:"message"`
	} `json:"choices"`
	Error *struct {
		Message string `json:"message"`
		Type    string `json:"type"`
		Code    any    `json:"code"`
	} `json:"error"`
}

func NewAIAnalysisService(baseURL, apiKey, model string, timeoutSeconds int) *AIAnalysisService {
	if timeoutSeconds <= 0 {
		timeoutSeconds = 20
	}

	return &AIAnalysisService{
		BaseURL: strings.TrimRight(baseURL, "/"),
		APIKey:  apiKey,
		Model:   model,
		client: &http.Client{
			Timeout: time.Duration(timeoutSeconds) * time.Second,
		},
	}
}

func (s *AIAnalysisService) IsConfigured() bool {
	return s != nil && s.BaseURL != "" && s.APIKey != "" && s.Model != ""
}

func (s *AIAnalysisService) AnalyzeSentence(text string) (*SentenceAnalysisResult, error) {
	if !s.IsConfigured() {
		return nil, fmt.Errorf("AI 精读服务未配置")
	}

	payload := chatCompletionRequest{
		Model: s.Model,
		Messages: []chatMessage{
			{
				Role: "system",
				Content: strings.TrimSpace(`你是一个面向中文英语学习者的精读老师。
请只返回 JSON，不要使用 Markdown，不要输出额外解释。
JSON 字段必须是：
sentence: 原英文句子
translation: 自然准确的中文翻译
word_count: 英文词数
structure: 字符串数组，2-5 条，拆解主干、从句、修饰成分、逻辑关系
key_phrases: 字符串数组，3-8 条，列出值得学习的短语或搭配
difficulty_tips: 字符串数组，2-5 条，指出阅读难点和理解方法`),
			},
			{
				Role:    "user",
				Content: fmt.Sprintf("请精读解析下面英文：\n%s", text),
			},
		},
		Temperature: 0.2,
		MaxTokens:   1200,
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return nil, fmt.Errorf("构建 AI 请求失败: %w", err)
	}

	endpoint := s.BaseURL + "/chat/completions"
	req, err := http.NewRequest(http.MethodPost, endpoint, bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("构建 AI 请求失败: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+s.APIKey)

	resp, err := s.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("AI 精读请求失败: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("读取 AI 响应失败: %w", err)
	}

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("AI 精读 HTTP %d: %s", resp.StatusCode, string(respBody))
	}

	var completion chatCompletionResponse
	if err := json.Unmarshal(respBody, &completion); err != nil {
		return nil, fmt.Errorf("解析 AI 响应失败: %w", err)
	}
	if completion.Error != nil {
		return nil, fmt.Errorf("AI 精读错误: %s", completion.Error.Message)
	}
	if len(completion.Choices) == 0 || strings.TrimSpace(completion.Choices[0].Message.Content) == "" {
		return nil, fmt.Errorf("AI 精读结果为空")
	}

	content := cleanJSONContent(completion.Choices[0].Message.Content)
	var analysis SentenceAnalysisResult
	if err := json.Unmarshal([]byte(content), &analysis); err != nil {
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

func cleanJSONContent(content string) string {
	content = strings.TrimSpace(content)
	content = strings.TrimPrefix(content, "```json")
	content = strings.TrimPrefix(content, "```")
	content = strings.TrimSuffix(content, "```")
	return strings.TrimSpace(content)
}
