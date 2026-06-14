package services

import (
	"testing"
)

func TestTemperatureForModelOmitsForMimoV25(t *testing.T) {
	temp := temperatureForModel("mimo-v2.5-pro", 0.4)
	if temp != nil {
		t.Fatalf("expected nil temperature for mimo-v2.5-pro, got %v", *temp)
	}
}

func TestTemperatureForModelKeepsForOtherModels(t *testing.T) {
	temp := temperatureForModel("gpt-4o-mini", 0.4)
	if temp == nil {
		t.Fatal("expected non-nil temperature for gpt-4o-mini")
	}
	if *temp != 0.4 {
		t.Fatalf("expected temperature 0.4, got %v", *temp)
	}
}

func TestTemperatureForModelTrimsWhitespace(t *testing.T) {
	temp := temperatureForModel("  mimo-v2.5-tts  ", 0.7)
	if temp != nil {
		t.Fatalf("expected nil temperature for mimo-v2.5-tts with whitespace, got %v", *temp)
	}
}

func TestChatOptsIncludesTemperature(t *testing.T) {
	svc := &AIAnalysisService{Model: "gpt-4o-mini"}
	opts := svc.chatOpts(0.7, 1200)
	if len(opts) != 2 {
		t.Fatalf("expected 2 opts (temperature + maxTokens), got %d", len(opts))
	}
}

func TestChatOptsOmitsTemperatureForMimo(t *testing.T) {
	svc := &AIAnalysisService{Model: "mimo-v2.5-pro"}
	opts := svc.chatOpts(0.7, 1200)
	if len(opts) != 1 {
		t.Fatalf("expected 1 opt (maxTokens only) for mimo, got %d", len(opts))
	}
}

func TestChatOptsOmitsZeroMaxTokens(t *testing.T) {
	svc := &AIAnalysisService{Model: "gpt-4o-mini"}
	opts := svc.chatOpts(0.7, 0)
	if len(opts) != 1 {
		t.Fatalf("expected 1 opt (temperature only) when maxTokens=0, got %d", len(opts))
	}
}
