package services

import (
	"encoding/json"
	"testing"
)

func TestChatCompletionRequestOmitsTemperatureForMimoV25(t *testing.T) {
	payload := chatCompletionRequest{
		Model:       "mimo-v2.5-pro",
		Messages:    []chatMessage{{Role: "user", Content: "hello"}},
		Temperature: temperatureForModel("mimo-v2.5-pro", 0.4),
		MaxTokens:   1200,
	}

	body, err := json.Marshal(payload)
	if err != nil {
		t.Fatalf("marshal request: %v", err)
	}
	if string(body) == "" {
		t.Fatal("expected request body")
	}
	if jsonContainsKey(body, "temperature") {
		t.Fatalf("expected temperature to be omitted for MiMo v2.5 request: %s", string(body))
	}
}

func TestChatCompletionRequestKeepsTemperatureForOtherModels(t *testing.T) {
	payload := chatCompletionRequest{
		Model:       "gpt-4o-mini",
		Messages:    []chatMessage{{Role: "user", Content: "hello"}},
		Temperature: temperatureForModel("gpt-4o-mini", 0.4),
		MaxTokens:   1200,
	}

	body, err := json.Marshal(payload)
	if err != nil {
		t.Fatalf("marshal request: %v", err)
	}
	if !jsonContainsKey(body, "temperature") {
		t.Fatalf("expected temperature for non-MiMo request: %s", string(body))
	}
}

func TestChatCompletionRequestIncludesStreamWhenEnabled(t *testing.T) {
	payload := chatCompletionRequest{
		Model:     "mimo-v2.5-pro",
		Messages:  []chatMessage{{Role: "user", Content: "hello"}},
		MaxTokens: 1200,
		Stream:    true,
	}

	body, err := json.Marshal(payload)
	if err != nil {
		t.Fatalf("marshal request: %v", err)
	}
	if !jsonContainsKey(body, "stream") {
		t.Fatalf("expected stream flag in request: %s", string(body))
	}
}

func jsonContainsKey(body []byte, key string) bool {
	var payload map[string]any
	if err := json.Unmarshal(body, &payload); err != nil {
		return false
	}
	_, ok := payload[key]
	return ok
}
