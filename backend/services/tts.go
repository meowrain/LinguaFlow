package services

import (
	"bytes"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"
)

type TTSRequest struct {
	Text         string  `json:"text"`
	Voice        string  `json:"voice"`
	Speed        float64 `json:"speed"`
	Format       string  `json:"format"`
	Instructions string  `json:"instructions"`
}

type TTSResult struct {
	ID       string `json:"id"`
	AudioURL string `json:"audio_url"`
	Cached   bool   `json:"cached"`
	Format   string `json:"format"`
}

type TTSService struct {
	BaseURL        string
	APIKey         string
	Model          string
	DefaultVoice   string
	DefaultFormat  string
	Instructions   string
	CacheDir       string
	MaxInputLength int
	client         *http.Client
}

type mimoChatMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type mimoAudioOptions struct {
	Format string `json:"format,omitempty"`
	Voice  string `json:"voice,omitempty"`
}

type mimoSpeechRequest struct {
	Model    string            `json:"model"`
	Messages []mimoChatMessage `json:"messages"`
	Audio    mimoAudioOptions  `json:"audio"`
	Stream   bool              `json:"stream,omitempty"`
}

type mimoSpeechResponse struct {
	Choices []struct {
		Message struct {
			Audio struct {
				Data string `json:"data"`
			} `json:"audio"`
		} `json:"message"`
	} `json:"choices"`
}

func NewTTSService(baseURL, apiKey, model, voice, responseFormat, instructions, cacheDir string, timeoutSeconds, maxInputLength int) *TTSService {
	if timeoutSeconds <= 0 {
		timeoutSeconds = 30
	}
	if maxInputLength <= 0 {
		maxInputLength = 3000
	}
	if model == "" {
		model = "mimo-v2.5-tts"
	}
	if voice == "" {
		voice = "Chloe"
	}
	if responseFormat == "" {
		responseFormat = "wav"
	}
	if cacheDir == "" {
		cacheDir = "storage/tts"
	}

	return &TTSService{
		BaseURL:        strings.TrimRight(baseURL, "/"),
		APIKey:         apiKey,
		Model:          model,
		DefaultVoice:   voice,
		DefaultFormat:  normalizeAudioFormat(responseFormat),
		Instructions:   instructions,
		CacheDir:       cacheDir,
		MaxInputLength: maxInputLength,
		client: &http.Client{
			Timeout: time.Duration(timeoutSeconds) * time.Second,
		},
	}
}

func (s *TTSService) IsConfigured() bool {
	return s != nil && s.BaseURL != "" && s.APIKey != "" && s.Model != ""
}

func (s *TTSService) Generate(req TTSRequest) (*TTSResult, error) {
	if !s.IsConfigured() {
		return nil, fmt.Errorf("TTS 服务未配置")
	}

	text := strings.TrimSpace(req.Text)
	if text == "" {
		return nil, fmt.Errorf("朗读文本不能为空")
	}
	if len([]rune(text)) > s.MaxInputLength {
		return nil, fmt.Errorf("朗读文本过长，最多 %d 个字符", s.MaxInputLength)
	}

	voice := strings.TrimSpace(req.Voice)
	if voice == "" {
		voice = s.DefaultVoice
	}
	format := normalizeAudioFormat(req.Format)
	if format == "" {
		format = s.DefaultFormat
	}
	speed := req.Speed
	if speed <= 0 {
		speed = 1
	}
	if speed < 0.25 || speed > 4 {
		return nil, fmt.Errorf("语速必须在 0.25 到 4.0 之间")
	}
	instructions := strings.TrimSpace(req.Instructions)
	if instructions == "" {
		instructions = s.Instructions
	}

	id := s.cacheID(text, voice, format, speed, instructions)
	path := s.cachePath(id, format)
	if _, err := os.Stat(path); err == nil {
		return &TTSResult{
			ID:       id,
			AudioURL: "/api/tts/audio/" + id + "." + format,
			Cached:   true,
			Format:   format,
		}, nil
	}

	messages := make([]mimoChatMessage, 0, 2)
	if instructionText := buildMimoInstructions(instructions, speed); instructionText != "" {
		messages = append(messages, mimoChatMessage{
			Role:    "user",
			Content: instructionText,
		})
	}
	messages = append(messages, mimoChatMessage{
		Role:    "assistant",
		Content: text,
	})

	payload := mimoSpeechRequest{
		Model:    s.Model,
		Messages: messages,
		Audio: mimoAudioOptions{
			Format: format,
			Voice:  voice,
		},
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return nil, fmt.Errorf("构建 TTS 请求失败: %w", err)
	}

	httpReq, err := http.NewRequest(http.MethodPost, s.BaseURL+"/chat/completions", bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("构建 TTS 请求失败: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Authorization", "Bearer "+s.APIKey)
	httpReq.Header.Set("api-key", s.APIKey)

	resp, err := s.client.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("TTS 请求失败: %w", err)
	}
	defer resp.Body.Close()

	audio, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("读取 TTS 响应失败: %w", err)
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("TTS HTTP %d: %s", resp.StatusCode, string(audio))
	}

	var speechResp mimoSpeechResponse
	if err := json.Unmarshal(audio, &speechResp); err != nil {
		return nil, fmt.Errorf("解析 TTS 响应失败: %w", err)
	}
	if len(speechResp.Choices) == 0 || speechResp.Choices[0].Message.Audio.Data == "" {
		return nil, fmt.Errorf("TTS 响应没有音频数据")
	}

	audioBytes, err := base64.StdEncoding.DecodeString(speechResp.Choices[0].Message.Audio.Data)
	if err != nil {
		return nil, fmt.Errorf("解码 TTS 音频失败: %w", err)
	}

	if err := os.MkdirAll(s.CacheDir, 0755); err != nil {
		return nil, fmt.Errorf("创建 TTS 缓存目录失败: %w", err)
	}
	if err := os.WriteFile(path, audioBytes, 0644); err != nil {
		return nil, fmt.Errorf("写入 TTS 缓存失败: %w", err)
	}

	return &TTSResult{
		ID:       id,
		AudioURL: "/api/tts/audio/" + id + "." + format,
		Cached:   false,
		Format:   format,
	}, nil
}

func (s *TTSService) AudioFilePath(filename string) (string, string, error) {
	name := filepath.Base(filename)
	ext := strings.TrimPrefix(strings.ToLower(filepath.Ext(name)), ".")
	if normalizeAudioFormat(ext) == "" {
		return "", "", fmt.Errorf("不支持的音频格式")
	}

	id := strings.TrimSuffix(name, filepath.Ext(name))
	if len(id) != 64 || !isHex(id) {
		return "", "", fmt.Errorf("无效的音频 ID")
	}

	path := filepath.Join(s.CacheDir, id+"."+ext)
	if _, err := os.Stat(path); err != nil {
		return "", "", err
	}

	return path, audioContentType(ext), nil
}

func (s *TTSService) cacheID(text, voice, format string, speed float64, instructions string) string {
	sum := sha256.Sum256([]byte(fmt.Sprintf("%s\n%s\n%s\n%.2f\n%s\n%s", s.Model, voice, format, speed, instructions, text)))
	return hex.EncodeToString(sum[:])
}

func (s *TTSService) cachePath(id, format string) string {
	return filepath.Join(s.CacheDir, id+"."+format)
}

func buildMimoInstructions(instructions string, speed float64) string {
	parts := make([]string, 0, 2)
	if instructions != "" {
		parts = append(parts, instructions)
	}
	if speed > 0 && speed != 1 {
		parts = append(parts, fmt.Sprintf("Use approximately %.2fx speaking speed while keeping pronunciation natural.", speed))
	}
	return strings.Join(parts, "\n")
}

func normalizeAudioFormat(format string) string {
	switch strings.ToLower(strings.TrimSpace(format)) {
	case "", "wav":
		return "wav"
	case "pcm16":
		return "pcm16"
	default:
		return ""
	}
}

func audioContentType(format string) string {
	switch format {
	case "mp3":
		return "audio/mpeg"
	case "wav":
		return "audio/wav"
	case "pcm16":
		return "audio/pcm"
	default:
		return "application/octet-stream"
	}
}

func isHex(value string) bool {
	for _, char := range value {
		if !((char >= '0' && char <= '9') || (char >= 'a' && char <= 'f')) {
			return false
		}
	}
	return true
}
