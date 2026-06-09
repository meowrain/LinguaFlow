package handlers

import "testing"

func TestNormalizeTranscriptionModelMapsFunASRPathToAlias(t *testing.T) {
	model := normalizeTranscriptionModel("funasr", "/home/lirui/projects/demo/gugudu/local-asr/funasr/models/SenseVoiceSmall")

	if model != "sensevoice" {
		t.Fatalf("expected sensevoice, got %q", model)
	}
}

func TestNormalizeTranscriptionModelLeavesNonFunASRModel(t *testing.T) {
	model := normalizeTranscriptionModel("openai", "/models/SenseVoiceSmall")

	if model != "/models/SenseVoiceSmall" {
		t.Fatalf("expected original model, got %q", model)
	}
}

func TestNormalizeTranscriptionModelKeepsFunASRAlias(t *testing.T) {
	model := normalizeTranscriptionModel("local", "paraformer")

	if model != "paraformer" {
		t.Fatalf("expected paraformer, got %q", model)
	}
}
