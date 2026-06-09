package services

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"
	"unicode"
)

const (
	maxSubtitleDurationSeconds = 7
	maxSubtitleRunes           = 220
	maxSubtitleWords           = 32
	targetSubtitleWords        = 24
)

type TranscribeOptions struct {
	Language string
	Model    string
}

type TranscriptionSegment struct {
	StartSeconds float64
	EndSeconds   float64
	Text         string
	Confidence   float64
}

type TranscriptionResult struct {
	Language string
	Duration float64
	Segments []TranscriptionSegment
	RawJSON  []byte
}

type VideoTranscriber interface {
	Transcribe(ctx context.Context, audioPath string, opts TranscribeOptions) (*TranscriptionResult, error)
}

type OpenAITranscriber struct {
	BaseURL    string
	APIKey     string
	Model      string
	MaxAudioMB int
	Client     *http.Client
}

func NewOpenAITranscriber(baseURL, apiKey, model string, timeoutSeconds, maxAudioMB int) *OpenAITranscriber {
	if baseURL == "" {
		baseURL = "https://api.openai.com/v1"
	}
	if model == "" {
		model = "whisper-1"
	}
	if timeoutSeconds <= 0 {
		timeoutSeconds = 1800
	}
	if maxAudioMB <= 0 {
		maxAudioMB = 25
	}
	return &OpenAITranscriber{
		BaseURL:    strings.TrimRight(baseURL, "/"),
		APIKey:     apiKey,
		Model:      model,
		MaxAudioMB: maxAudioMB,
		Client:     &http.Client{Timeout: time.Duration(timeoutSeconds) * time.Second},
	}
}

func (t *OpenAITranscriber) Transcribe(ctx context.Context, audioPath string, opts TranscribeOptions) (*TranscriptionResult, error) {
	if strings.TrimSpace(t.APIKey) == "" && !isLocalTranscriptionBaseURL(t.BaseURL) {
		return nil, fmt.Errorf("transcription api key is not configured")
	}

	info, err := os.Stat(audioPath)
	if err != nil {
		return nil, fmt.Errorf("failed to read audio file: %w", err)
	}
	if info.Size() > int64(t.MaxAudioMB)*1024*1024 {
		return nil, fmt.Errorf("audio file is %d MB, above transcription limit %d MB; import SRT/VTT subtitles or use a shorter video", info.Size()/1024/1024, t.MaxAudioMB)
	}

	file, err := os.Open(audioPath)
	if err != nil {
		return nil, fmt.Errorf("failed to open audio file: %w", err)
	}
	defer file.Close()

	var body bytes.Buffer
	writer := multipart.NewWriter(&body)

	part, err := writer.CreateFormFile("file", filepath.Base(audioPath))
	if err != nil {
		return nil, fmt.Errorf("failed to create multipart file: %w", err)
	}
	if _, err := io.Copy(part, file); err != nil {
		return nil, fmt.Errorf("failed to attach audio file: %w", err)
	}

	model := firstNonEmptyString(opts.Model, t.Model)
	_ = writer.WriteField("model", model)
	_ = writer.WriteField("response_format", "verbose_json")
	_ = writer.WriteField("timestamp_granularities[]", "segment")
	if strings.TrimSpace(opts.Language) != "" {
		_ = writer.WriteField("language", opts.Language)
	}
	if err := writer.Close(); err != nil {
		return nil, fmt.Errorf("failed to close multipart body: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, t.BaseURL+"/audio/transcriptions", &body)
	if err != nil {
		return nil, fmt.Errorf("failed to create transcription request: %w", err)
	}
	if strings.TrimSpace(t.APIKey) != "" {
		req.Header.Set("Authorization", "Bearer "+t.APIKey)
	}
	req.Header.Set("Content-Type", writer.FormDataContentType())

	resp, err := t.Client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("transcription request failed: %w", err)
	}
	defer resp.Body.Close()

	raw, err := io.ReadAll(io.LimitReader(resp.Body, 20*1024*1024))
	if err != nil {
		return nil, fmt.Errorf("failed to read transcription response: %w", err)
	}

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("transcription provider returned %d: %s", resp.StatusCode, truncateForError(raw, 800))
	}

	var parsed struct {
		Language string  `json:"language"`
		Duration float64 `json:"duration"`
		Text     string  `json:"text"`
		Segments []struct {
			Start            float64 `json:"start"`
			End              float64 `json:"end"`
			Text             string  `json:"text"`
			AvgLogProb       float64 `json:"avg_logprob"`
			NoSpeechProb     float64 `json:"no_speech_prob"`
			CompressionRatio float64 `json:"compression_ratio"`
		} `json:"segments"`
	}
	if err := json.Unmarshal(raw, &parsed); err != nil {
		return nil, fmt.Errorf("failed to parse transcription response: %w", err)
	}

	segments := make([]TranscriptionSegment, 0, len(parsed.Segments))
	for _, segment := range parsed.Segments {
		segments = append(segments, TranscriptionSegment{
			StartSeconds: segment.Start,
			EndSeconds:   segment.End,
			Text:         segment.Text,
			Confidence:   confidenceFromLogProb(segment.AvgLogProb),
		})
	}
	if len(segments) == 0 && strings.TrimSpace(parsed.Text) != "" {
		segments = append(segments, TranscriptionSegment{
			StartSeconds: 0,
			EndSeconds:   parsed.Duration,
			Text:         parsed.Text,
			Confidence:   0,
		})
	}

	return &TranscriptionResult{
		Language: parsed.Language,
		Duration: parsed.Duration,
		Segments: CleanTranscriptionSegmentsWithDuration(segments, parsed.Duration),
		RawJSON:  raw,
	}, nil
}

func CleanTranscriptionSegments(input []TranscriptionSegment) []TranscriptionSegment {
	return CleanTranscriptionSegmentsWithDuration(input, 0)
}

func CleanTranscriptionSegmentsWithDuration(input []TranscriptionSegment, fallbackDuration float64) []TranscriptionSegment {
	segments := make([]TranscriptionSegment, 0, len(input))
	for _, segment := range input {
		segment.Text = strings.Join(strings.Fields(strings.TrimSpace(segment.Text)), " ")
		if segment.Text == "" {
			continue
		}
		if segment.StartSeconds < 0 {
			segment.StartSeconds = 0
		}
		if segment.EndSeconds <= segment.StartSeconds {
			segment.EndSeconds = segment.StartSeconds + 1
		}
		segments = append(segments, segment)
	}

	if len(segments) == 1 && fallbackDuration > segments[0].EndSeconds {
		textIsLong := len([]rune(segments[0].Text)) > maxSubtitleRunes || len(strings.Fields(segments[0].Text)) > maxSubtitleWords
		if textIsLong || segments[0].EndSeconds <= 2 {
			segments[0].EndSeconds = fallbackDuration
		}
	}

	sort.SliceStable(segments, func(i, j int) bool {
		return segments[i].StartSeconds < segments[j].StartSeconds
	})

	if hasCompressedTimeline(segments, fallbackDuration) {
		segments = redistributeSegmentsAcrossDuration(segments, fallbackDuration)
	}

	return splitLongSegments(segments)
}

func hasCompressedTimeline(segments []TranscriptionSegment, fallbackDuration float64) bool {
	if fallbackDuration < 30 || len(segments) == 0 {
		return false
	}

	minStart := segments[0].StartSeconds
	maxEnd := segments[0].EndSeconds
	totalWords := 0
	for _, segment := range segments {
		if segment.StartSeconds < minStart {
			minStart = segment.StartSeconds
		}
		if segment.EndSeconds > maxEnd {
			maxEnd = segment.EndSeconds
		}
		totalWords += len(strings.Fields(segment.Text))
	}

	span := maxEnd - minStart
	if totalWords < 25 {
		return false
	}
	return span <= 5 || span < fallbackDuration*0.05
}

func redistributeSegmentsAcrossDuration(segments []TranscriptionSegment, duration float64) []TranscriptionSegment {
	totalRunes := 0
	for _, segment := range segments {
		totalRunes += len([]rune(segment.Text))
	}
	if totalRunes == 0 || duration <= 0 {
		return segments
	}

	redistributed := make([]TranscriptionSegment, 0, len(segments))
	cursor := 0.0
	for index, segment := range segments {
		ratio := float64(len([]rune(segment.Text))) / float64(totalRunes)
		end := cursor + duration*ratio
		if index == len(segments)-1 {
			end = duration
		}
		if end <= cursor {
			end = cursor + 1
		}
		segment.StartSeconds = cursor
		segment.EndSeconds = end
		redistributed = append(redistributed, segment)
		cursor = end
	}
	return redistributed
}

func splitLongSegments(input []TranscriptionSegment) []TranscriptionSegment {
	var output []TranscriptionSegment
	for _, segment := range input {
		if segment.EndSeconds-segment.StartSeconds <= maxSubtitleDurationSeconds &&
			len([]rune(segment.Text)) <= maxSubtitleRunes &&
			len(strings.Fields(segment.Text)) <= maxSubtitleWords {
			output = append(output, segment)
			continue
		}

		parts := splitSentenceParts(segment.Text)
		if len(parts) <= 1 {
			output = append(output, segment)
			continue
		}

		totalRunes := 0
		for _, part := range parts {
			totalRunes += len([]rune(part))
		}
		if totalRunes == 0 {
			output = append(output, segment)
			continue
		}

		cursor := segment.StartSeconds
		duration := segment.EndSeconds - segment.StartSeconds
		for index, part := range parts {
			ratio := float64(len([]rune(part))) / float64(totalRunes)
			partDuration := duration * ratio
			end := cursor + partDuration
			if index == len(parts)-1 {
				end = segment.EndSeconds
			}
			output = append(output, TranscriptionSegment{
				StartSeconds: cursor,
				EndSeconds:   end,
				Text:         part,
				Confidence:   segment.Confidence,
			})
			cursor = end
		}
	}
	return output
}

func splitSentenceParts(text string) []string {
	var parts []string
	start := 0
	runes := []rune(text)
	for i, r := range runes {
		if strings.ContainsRune(".?!;:。？！；：", r) && i+1-start > 20 {
			part := strings.TrimSpace(string(runes[start : i+1]))
			if part != "" {
				parts = append(parts, splitOversizedSubtitlePart(part)...)
			}
			start = i + 1
		}
	}
	if start < len(runes) {
		part := strings.TrimSpace(string(runes[start:]))
		if part != "" {
			parts = append(parts, splitOversizedSubtitlePart(part)...)
		}
	}
	if len(parts) <= 1 {
		return splitOversizedSubtitlePart(text)
	}
	return parts
}

func splitOversizedSubtitlePart(text string) []string {
	text = strings.TrimSpace(text)
	if text == "" {
		return nil
	}
	words := strings.Fields(text)
	if len(words) > maxSubtitleWords {
		return splitWordsIntoSubtitleParts(words)
	}
	if len([]rune(text)) > maxSubtitleRunes {
		return splitRunesIntoSubtitleParts(text)
	}
	return []string{text}
}

func splitWordsIntoSubtitleParts(words []string) []string {
	parts := make([]string, 0, (len(words)+targetSubtitleWords-1)/targetSubtitleWords)
	for start := 0; start < len(words); {
		end := findNaturalWordBoundary(words, start)
		if remaining := len(words) - end; remaining > 0 && remaining < 8 {
			end = len(words)
		}
		if end-start > maxSubtitleWords {
			end = start + maxSubtitleWords
		}
		parts = append(parts, strings.Join(words[start:end], " "))
		start = end
	}
	return parts
}

func findNaturalWordBoundary(words []string, start int) int {
	minEnd := minInt(len(words), start+targetSubtitleWords)
	maxEnd := minInt(len(words), start+maxSubtitleWords)
	for index := minEnd; index < maxEnd; index++ {
		previous := strings.ToLower(words[index-1])
		current := strings.ToLower(words[index])
		if isLikelyPhraseBoundary(previous, current) {
			return index
		}
	}
	return minEnd
}

func isLikelyPhraseBoundary(previous, current string) bool {
	if current == "" {
		return true
	}
	if strings.ContainsRune(",.?!;:", lastRuneOf(previous)) {
		return true
	}
	switch current {
	case "and", "but", "so", "because", "when", "while", "if", "then", "now", "today", "there",
		"we", "i", "you", "they", "he", "she", "it", "this", "that", "these", "those":
		return true
	default:
		return false
	}
}

func minInt(a, b int) int {
	if a < b {
		return a
	}
	return b
}

func splitRunesIntoSubtitleParts(text string) []string {
	runes := []rune(text)
	parts := make([]string, 0, (len(runes)+maxSubtitleRunes-1)/maxSubtitleRunes)
	for start := 0; start < len(runes); {
		end := start + maxSubtitleRunes
		if end > len(runes) {
			end = len(runes)
		}
		parts = append(parts, strings.TrimSpace(string(runes[start:end])))
		start = end
	}
	return parts
}

func lastRuneOf(text string) rune {
	var last rune
	for _, r := range text {
		last = r
	}
	return last
}

func isSubtitleBreakRune(r rune) bool {
	return strings.ContainsRune(",，、", r) || (unicode.IsPunct(r) && !strings.ContainsRune("'’)]}", r))
}

func confidenceFromLogProb(avgLogProb float64) float64 {
	if avgLogProb == 0 {
		return 0
	}
	confidence := 1 + avgLogProb
	if confidence < 0 {
		return 0
	}
	if confidence > 1 {
		return 1
	}
	return confidence
}

func truncateForError(raw []byte, limit int) string {
	text := strings.TrimSpace(string(raw))
	if len(text) > limit {
		return text[:limit]
	}
	return text
}

func firstNonEmptyString(values ...string) string {
	for _, value := range values {
		value = strings.TrimSpace(value)
		if value != "" {
			return value
		}
	}
	return ""
}

func isLocalTranscriptionBaseURL(baseURL string) bool {
	baseURL = strings.ToLower(strings.TrimSpace(baseURL))
	return strings.Contains(baseURL, "localhost") ||
		strings.Contains(baseURL, "127.0.0.1") ||
		strings.Contains(baseURL, "[::1]")
}
