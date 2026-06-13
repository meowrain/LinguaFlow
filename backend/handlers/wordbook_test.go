package handlers

import (
	"testing"

	"gugudu-backend/models"
)

func TestApplyVocabularyReview_Good(t *testing.T) {
	vocab := &models.Vocabulary{
		ReviewEase:     2.5,
		ReviewInterval: 0,
		ReviewCount:    0,
	}

	if err := applyVocabularyReview(vocab, "good"); err != nil {
		t.Fatal(err)
	}
	if vocab.ReviewInterval != 2 {
		t.Errorf("first good: interval = %d, want 2", vocab.ReviewInterval)
	}
	if vocab.ReviewCount != 1 {
		t.Errorf("first good: review_count = %d, want 1", vocab.ReviewCount)
	}
	if vocab.IsLearned {
		t.Error("first good: should not be learned yet (check at reviewCount=0)")
	}

	if err := applyVocabularyReview(vocab, "good"); err != nil {
		t.Fatal(err)
	}
	if vocab.ReviewCount != 2 {
		t.Errorf("second good: review_count = %d, want 2", vocab.ReviewCount)
	}
	// mastery check runs before increment, so second good checks at count=1 — not yet learned

	if err := applyVocabularyReview(vocab, "good"); err != nil {
		t.Fatal(err)
	}
	if !vocab.IsLearned {
		t.Error("third good: should be learned (check at reviewCount=2 >= srsMasteryReviewCount)")
	}
}

func TestApplyVocabularyReview_Forgot(t *testing.T) {
	vocab := &models.Vocabulary{
		ReviewEase:     2.5,
		ReviewInterval: 5,
		ReviewCount:    3,
		IsLearned:      true,
	}

	if err := applyVocabularyReview(vocab, "forgot"); err != nil {
		t.Fatal(err)
	}
	if vocab.ReviewInterval != 1 {
		t.Errorf("forgot: interval = %d, want 1", vocab.ReviewInterval)
	}
	if vocab.IsLearned {
		t.Error("forgot: should not be learned")
	}
	if vocab.ForgottenCount != 1 {
		t.Errorf("forgot: forgotten_count = %d, want 1", vocab.ForgottenCount)
	}
	if vocab.ReviewEase != 2.3 {
		t.Errorf("forgot: ease = %f, want 2.3", vocab.ReviewEase)
	}
}

func TestApplyVocabularyReview_Hard(t *testing.T) {
	vocab := &models.Vocabulary{
		ReviewEase:     2.5,
		ReviewInterval: 0,
		ReviewCount:    0,
	}

	if err := applyVocabularyReview(vocab, "hard"); err != nil {
		t.Fatal(err)
	}
	if vocab.ReviewInterval != 1 {
		t.Errorf("first hard: interval = %d, want 1", vocab.ReviewInterval)
	}
	if vocab.IsLearned {
		t.Error("hard: should not be learned")
	}

	vocab.ReviewInterval = 10
	if err := applyVocabularyReview(vocab, "hard"); err != nil {
		t.Fatal(err)
	}
	if vocab.ReviewInterval != 14 {
		t.Errorf("hard at 10: interval = %d, want 14", vocab.ReviewInterval)
	}
}

func TestApplyVocabularyReview_EaseFloor(t *testing.T) {
	vocab := &models.Vocabulary{
		ReviewEase:     1.35,
		ReviewInterval: 1,
		ReviewCount:    5,
	}

	if err := applyVocabularyReview(vocab, "forgot"); err != nil {
		t.Fatal(err)
	}
	if vocab.ReviewEase < srsMinEase {
		t.Errorf("ease = %f, should not go below %f", vocab.ReviewEase, srsMinEase)
	}
}

func TestApplyVocabularyReview_InvalidRating(t *testing.T) {
	vocab := &models.Vocabulary{}
	err := applyVocabularyReview(vocab, "invalid")
	if err == nil {
		t.Error("expected error for invalid rating")
	}
}

func TestApplyVocabularyReview_MasteryByInterval(t *testing.T) {
	vocab := &models.Vocabulary{
		ReviewEase:     2.5,
		ReviewInterval: 5,
		ReviewCount:    1,
	}

	if err := applyVocabularyReview(vocab, "good"); err != nil {
		t.Fatal(err)
	}
	if !vocab.IsLearned {
		t.Error("should be learned when interval >= srsMasteryInterval (7)")
	}
	if vocab.ReviewInterval < srsMasteryInterval {
		t.Errorf("interval = %d, expected >= %d", vocab.ReviewInterval, srsMasteryInterval)
	}
}

func TestApplyWordBookReview_Good(t *testing.T) {
	progress := &models.UserWordBookProgress{
		ReviewEase:     2.5,
		ReviewInterval: 0,
		ReviewCount:    0,
		Status:         "learning",
	}

	if err := applyWordBookReview(progress, "good"); err != nil {
		t.Fatal(err)
	}
	if progress.Status != "learning" {
		t.Errorf("first good: status = %s, want learning", progress.Status)
	}

	if err := applyWordBookReview(progress, "good"); err != nil {
		t.Fatal(err)
	}
	if progress.Status != "learning" {
		t.Errorf("second good: status = %s, want learning (check at count=1)", progress.Status)
	}

	if err := applyWordBookReview(progress, "good"); err != nil {
		t.Fatal(err)
	}
	if progress.Status != "mastered" {
		t.Errorf("third good: status = %s, want mastered", progress.Status)
	}
	if !progress.IsLearned {
		t.Error("third good: should be learned")
	}
}

func TestApplyWordBookReview_Forgot(t *testing.T) {
	progress := &models.UserWordBookProgress{
		ReviewEase:     2.5,
		ReviewInterval: 5,
		ReviewCount:    3,
		Status:         "mastered",
		IsLearned:      true,
	}

	if err := applyWordBookReview(progress, "forgot"); err != nil {
		t.Fatal(err)
	}
	if progress.Status != "learning" {
		t.Errorf("forgot: status = %s, want learning", progress.Status)
	}
	if progress.IsLearned {
		t.Error("forgot: should not be learned")
	}
	if progress.ForgottenCount != 1 {
		t.Errorf("forgot: forgotten_count = %d, want 1", progress.ForgottenCount)
	}
}

func TestApplyWordBookReview_SRSUnifiedWithVocabulary(t *testing.T) {
	vocab := &models.Vocabulary{
		ReviewEase:     2.5,
		ReviewInterval: 0,
		ReviewCount:    0,
	}
	progress := &models.UserWordBookProgress{
		ReviewEase:     2.5,
		ReviewInterval: 0,
		ReviewCount:    0,
		Status:         "learning",
	}

	for i := 0; i < 3; i++ {
		_ = applyVocabularyReview(vocab, "good")
		_ = applyWordBookReview(progress, "good")
	}

	if vocab.IsLearned != progress.IsLearned {
		t.Errorf("SRS divergence: vocab.IsLearned=%v, progress.IsLearned=%v", vocab.IsLearned, progress.IsLearned)
	}
	if vocab.ReviewInterval != progress.ReviewInterval {
		t.Errorf("SRS divergence: vocab.interval=%d, progress.interval=%d", vocab.ReviewInterval, progress.ReviewInterval)
	}
}

func TestPickWordBookExerciseTypeFallbacks(t *testing.T) {
	entry := models.WordBookEntry{Word: "abandon"}
	if got := pickWordBookExerciseType(entry, "spelling_focus", []string{"zh_to_en_spelling"}); got != "flashcard" {
		t.Fatalf("without translation should fallback to flashcard, got %s", got)
	}

	entry.Translation = "放弃"
	if got := pickWordBookExerciseType(entry, "spelling_focus", nil); got != "zh_to_en_spelling" {
		t.Fatalf("spelling_focus should prefer spelling, got %s", got)
	}

	entry.Examples = `[{"en":"They had to abandon the plan.","zh":"他们不得不放弃计划。"}]`
	if got := pickWordBookExerciseType(entry, "mixed", []string{"context_fill_blank"}); got != "context_fill_blank" {
		t.Fatalf("explicit context type should be allowed when examples exist, got %s", got)
	}
}

func TestBuildContextBlank(t *testing.T) {
	entry := models.WordBookEntry{
		Word:     "abandon",
		Examples: `[{"en":"They had to abandon the plan.","zh":"他们不得不放弃计划。"}]`,
	}
	context, placeholder, ok := buildWordBookContextBlank(entry)
	if !ok {
		t.Fatal("expected context blank")
	}
	if context != "They had to _____ the plan." {
		t.Fatalf("context = %q", context)
	}
	if placeholder != "abandon" {
		t.Fatalf("placeholder = %q", placeholder)
	}
}

func TestBuildWordBookDistractors(t *testing.T) {
	entries := []models.WordBookEntry{
		{Word: "abandon", Translation: "放弃"},
		{Word: "adapt", Translation: "适应"},
		{Word: "obvious", Translation: "明显的"},
		{Word: "maintain", Translation: "维持"},
		{Word: "empty"},
	}
	got := buildWordBookDistractors(entries, "放弃", func(e models.WordBookEntry) string {
		return e.Translation
	}, 3)
	if len(got) != 3 {
		t.Fatalf("len = %d, want 3: %#v", len(got), got)
	}
	for _, value := range got {
		if value == "放弃" || value == "" {
			t.Fatalf("invalid distractor %q in %#v", value, got)
		}
	}
}

func TestBuildWordBookExerciseItemChoice(t *testing.T) {
	entry := models.WordBookEntry{ID: 1, Word: "abandon", Translation: "放弃"}
	pool := []models.WordBookEntry{
		entry,
		{ID: 2, Word: "adapt", Translation: "适应"},
		{ID: 3, Word: "obvious", Translation: "明显的"},
		{ID: 4, Word: "maintain", Translation: "维持"},
	}
	item := buildWordBookExerciseItem(entry, 9, "review", wordBookExerciseEnToZhChoice, pool)
	if item.ProgressID != 9 || item.Phase != "review" {
		t.Fatalf("unexpected metadata: %#v", item)
	}
	if item.Answer != "放弃" {
		t.Fatalf("answer = %q", item.Answer)
	}
	if len(item.Options) != 4 {
		t.Fatalf("options = %#v", item.Options)
	}
}

func TestCloseSpellingAnswer(t *testing.T) {
	tests := []struct {
		answer   string
		expected string
		want     bool
	}{
		{"abandon", "abandon", true},
		{"abando", "abandon", true},
		{"abandn", "abandon", true},
		{"abandon", "abandn", true},
		{"cat", "dog", false},
		{"", "abandon", false},
		{"abandon", "", false},
		{"Abandon", "abandon", true},
		{"ab", "abandon", false},
	}

	for _, tt := range tests {
		got := closeSpellingAnswer(tt.answer, tt.expected)
		if got != tt.want {
			t.Errorf("closeSpellingAnswer(%q, %q) = %v, want %v", tt.answer, tt.expected, got, tt.want)
		}
	}
}

func TestLevenshteinDistance(t *testing.T) {
	tests := []struct {
		a, b string
		want int
	}{
		{"", "", 0},
		{"a", "", 1},
		{"", "b", 1},
		{"kitten", "sitting", 3},
		{"abandon", "abandon", 0},
		{"abandon", "abando", 1},
		{"act", "cat", 2},
	}

	for _, tt := range tests {
		got := levenshteinDistance(tt.a, tt.b)
		if got != tt.want {
			t.Errorf("levenshteinDistance(%q, %q) = %d, want %d", tt.a, tt.b, got, tt.want)
		}
	}
}

func TestNormalizeLookupWord(t *testing.T) {
	tests := []struct {
		input string
		want  string
	}{
		{"  Abandon  ", "abandon"},
		{"hello.", "hello"},
		{"WORLD!", "world"},
		{"  ", ""},
		{"test,;", "test"},
	}

	for _, tt := range tests {
		got := normalizeLookupWord(tt.input)
		if got != tt.want {
			t.Errorf("normalizeLookupWord(%q) = %q, want %q", tt.input, got, tt.want)
		}
	}
}

func TestFirstMeaning(t *testing.T) {
	tests := []struct {
		input string
		want  string
	}{
		{`["放弃；抛弃"]`, "放弃；抛弃"},
		{`[{"pos":"verb","definition":"to give up"}]`, "to give up"},
		{"简单文本", "简单文本"},
		{"第一行\n第二行", "第一行"},
		{"词1；词2", "词1"},
		{"", ""},
	}

	for _, tt := range tests {
		got := firstMeaning(tt.input)
		if got != tt.want {
			t.Errorf("firstMeaning(%q) = %q, want %q", tt.input, got, tt.want)
		}
	}
}

func TestNormalizeAnswer(t *testing.T) {
	tests := []struct {
		input string
		want  string
	}{
		{"  Hello  ", "hello"},
		{"world.", "world"},
		{"TEST!", "test"},
		{"  ", ""},
	}

	for _, tt := range tests {
		got := normalizeAnswer(tt.input)
		if got != tt.want {
			t.Errorf("normalizeAnswer(%q) = %q, want %q", tt.input, got, tt.want)
		}
	}
}

func TestMaxInt(t *testing.T) {
	if maxInt(3, 5) != 5 {
		t.Error("maxInt(3, 5) should be 5")
	}
	if maxInt(7, 2) != 7 {
		t.Error("maxInt(7, 2) should be 7")
	}
	if maxInt(4, 4) != 4 {
		t.Error("maxInt(4, 4) should be 4")
	}
}
