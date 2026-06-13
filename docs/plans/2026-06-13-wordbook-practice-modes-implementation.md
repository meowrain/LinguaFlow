# Wordbook Practice Modes Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build flexible wordbook practice modes across backend and frontend: five exercise types, six practice modes, session-only mistake retry, and preserved SRS progress.

**Architecture:** Keep `/wordbooks/:id/today` as the daily task source and add a dedicated exercise generation API. Move exercise selection, fallback, distractor generation, and answer helpers into testable Go functions, while the Next.js learn page becomes an orchestrator that renders typed exercise components for both new words and reviews.

**Tech Stack:** Go 1.22, Gin, GORM, Next.js 14 App Router, TypeScript, Tailwind CSS, lucide-react.

---

## Preconditions

- Work from `C:\Users\meowr\projects\LinguaFlow\.worktrees\vocab-practice`.
- Read `docs/development/gin-backend.md` before backend changes.
- Read `docs/development/nextjs-frontend.md` before frontend changes.
- Do not include the existing uncommitted `frontend/package-lock.json` change in commits unless the task explicitly touches dependencies.
- Use `git status --short` before every commit.

## Task 1: Add Backend Exercise Types and Pure Helpers

**Files:**
- Modify: `backend/handlers/wordbook.go`
- Test: `backend/handlers/wordbook_test.go`

**Step 1: Write failing tests for helper behavior**

Add tests in `backend/handlers/wordbook_test.go`:

```go
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
		Word: "abandon",
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
```

**Step 2: Run tests and verify failure**

Run:

```powershell
go test ./handlers -run "TestPickWordBookExerciseTypeFallbacks|TestBuildContextBlank|TestBuildWordBookDistractors"
```

Expected: fails because helper functions do not exist.

**Step 3: Implement helper types and functions**

In `backend/handlers/wordbook.go`, add constants and response structs near existing wordbook request/response structs:

```go
const (
	wordBookExerciseFlashcard        = "flashcard"
	wordBookExerciseEnToZhChoice     = "en_to_zh_choice"
	wordBookExerciseZhToEnSpelling   = "zh_to_en_spelling"
	wordBookExerciseAudioWordChoice  = "audio_word_choice"
	wordBookExerciseContextFillBlank = "context_fill_blank"
)

type wordBookExerciseItem struct {
	EntryID     uint     `json:"entry_id"`
	ProgressID uint     `json:"progress_id,omitempty"`
	Phase      string   `json:"phase"`
	Type       string   `json:"type"`
	Word       string   `json:"word"`
	Prompt     string   `json:"prompt"`
	Translation string  `json:"translation"`
	Options    []string `json:"options,omitempty"`
	Answer     string   `json:"answer"`
	AudioText  string   `json:"audio_text,omitempty"`
	Context    string   `json:"context,omitempty"`
	Placeholder string `json:"placeholder,omitempty"`
}
```

Add pure helpers:

```go
func pickWordBookExerciseType(entry models.WordBookEntry, mode string, allowed []string) string {
	candidates := wordBookExerciseCandidates(mode)
	if len(allowed) > 0 {
		candidates = filterExerciseCandidates(candidates, allowed)
	}
	for _, candidate := range candidates {
		if wordBookExerciseAvailable(entry, candidate) {
			return candidate
		}
	}
	return wordBookExerciseFlashcard
}

func wordBookExerciseCandidates(mode string) []string {
	switch mode {
	case "spelling_focus":
		return []string{wordBookExerciseZhToEnSpelling, wordBookExerciseContextFillBlank, wordBookExerciseFlashcard}
	case "quick_choice":
		return []string{wordBookExerciseEnToZhChoice, wordBookExerciseAudioWordChoice, wordBookExerciseFlashcard}
	case "new_only", "review_only", "mixed", "mistakes", "":
		return []string{wordBookExerciseFlashcard, wordBookExerciseEnToZhChoice, wordBookExerciseZhToEnSpelling, wordBookExerciseAudioWordChoice, wordBookExerciseContextFillBlank}
	default:
		return []string{wordBookExerciseFlashcard}
	}
}

func filterExerciseCandidates(candidates []string, allowed []string) []string {
	allowedSet := make(map[string]bool, len(allowed))
	for _, item := range allowed {
		allowedSet[item] = true
	}
	filtered := make([]string, 0, len(candidates))
	for _, candidate := range candidates {
		if allowedSet[candidate] {
			filtered = append(filtered, candidate)
		}
	}
	return filtered
}

func wordBookExerciseAvailable(entry models.WordBookEntry, exerciseType string) bool {
	switch exerciseType {
	case wordBookExerciseFlashcard:
		return true
	case wordBookExerciseEnToZhChoice, wordBookExerciseZhToEnSpelling:
		return entry.Translation != ""
	case wordBookExerciseAudioWordChoice:
		return entry.Word != ""
	case wordBookExerciseContextFillBlank:
		_, _, ok := buildWordBookContextBlank(entry)
		return ok
	default:
		return false
	}
}
```

Implement `buildWordBookContextBlank` to parse the existing JSON examples array and replace the first case-insensitive whole-word occurrence with `_____`. Implement `buildWordBookDistractors` to collect unique non-empty values up to `limit`.

**Step 4: Run focused tests**

Run:

```powershell
go test ./handlers -run "TestPickWordBookExerciseTypeFallbacks|TestBuildContextBlank|TestBuildWordBookDistractors"
```

Expected: pass.

**Step 5: Commit**

Run:

```powershell
git status --short
git add backend/handlers/wordbook.go backend/handlers/wordbook_test.go
git commit -m "test: add wordbook exercise helper coverage"
```

Do not add `frontend/package-lock.json`.

## Task 2: Add Wordbook Exercises API

**Files:**
- Modify: `backend/handlers/wordbook.go`
- Modify: `backend/main.go`
- Test: `backend/handlers/wordbook_test.go`

**Step 1: Write failing route-level or builder tests**

Add tests for the builder in `backend/handlers/wordbook_test.go`:

```go
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
```

**Step 2: Run test and verify failure**

Run:

```powershell
go test ./handlers -run TestBuildWordBookExerciseItemChoice
```

Expected: fails because `buildWordBookExerciseItem` does not exist.

**Step 3: Implement exercise builder and handler**

In `backend/handlers/wordbook.go`:

- Add `buildWordBookExerciseItem(entry, progressID, phase, exerciseType, pool)`.
- Add query parsers `parseUintCSV` and `parseStringCSV`.
- Add `GetWordBookExercises(c *gin.Context)`.

Handler behavior:

- Parse `bookID`.
- Read current `user_id`.
- Load `UserWordBook` for `user_id + word_book_id`.
- Parse `entry_ids`; reject empty list with 400.
- Load entries with `word_book_id = ? AND id IN ?`.
- Load a distractor pool from the same wordbook, ordered by unit and sort order, limited to a reasonable number such as 200.
- For each loaded entry, choose type from `mode` and `types`, build item, and attach `progress_id` for review entries from `UserWordBookProgress`.
- Return `gin.H{"data": gin.H{"items": items}}`.

**Step 4: Register the route**

In `backend/main.go`, inside the protected wordbooks group:

```go
wordbooks.GET("/:id/exercises", handlers.GetWordBookExercises)
```

Place it near `GET("/:id/today", ...)`.

**Step 5: Run backend tests**

Run:

```powershell
go test ./handlers -run "TestBuildWordBookExerciseItemChoice|TestPickWordBookExerciseTypeFallbacks|TestBuildContextBlank|TestBuildWordBookDistractors"
```

Expected: pass.

**Step 6: Commit**

Run:

```powershell
git status --short
git add backend/handlers/wordbook.go backend/handlers/wordbook_test.go backend/main.go
git commit -m "feat: add wordbook exercise generation API"
```

## Task 3: Extend API Client and Shared Types

**Files:**
- Modify: `frontend/src/types/index.ts`
- Modify: `frontend/src/lib/api.ts`

**Step 1: Add TypeScript types**

In `frontend/src/types/index.ts`, near the wordbook module:

```ts
export type WordBookPracticeMode =
  | 'mixed'
  | 'new_only'
  | 'review_only'
  | 'spelling_focus'
  | 'quick_choice'
  | 'mistakes';

export type WordBookExerciseType =
  | 'flashcard'
  | 'en_to_zh_choice'
  | 'zh_to_en_spelling'
  | 'audio_word_choice'
  | 'context_fill_blank';

export type WordBookExercisePhase = 'new' | 'review' | 'mistakes';

export interface WordBookExercise {
  entry_id: number;
  progress_id?: number;
  phase: WordBookExercisePhase;
  type: WordBookExerciseType;
  word: string;
  prompt: string;
  translation?: string;
  options?: string[];
  answer: string;
  audio_text?: string;
  context?: string;
  placeholder?: string;
}

export interface WordBookExerciseResponse {
  items: WordBookExercise[];
}
```

**Step 2: Add API method**

In `frontend/src/lib/api.ts`, extend `wordBookAPI`:

```ts
getExercises: (
  id: number,
  params: {
    entry_ids: string;
    phase: 'new' | 'review';
    mode?: WordBookPracticeMode;
    types?: string;
  }
) => api.get(`/wordbooks/${id}/exercises`, { params }),
```

Import `WordBookPracticeMode` if `api.ts` does not already import types.

**Step 3: Type-check through build**

Run:

```powershell
npm run lint
```

from `frontend`.

Expected: no lint errors from these type additions.

**Step 4: Commit**

Run:

```powershell
git status --short
git add frontend/src/types/index.ts frontend/src/lib/api.ts
git commit -m "feat: add wordbook exercise frontend types"
```

Do not add `frontend/package-lock.json`.

## Task 4: Create Frontend Practice Components

**Files:**
- Create: `frontend/src/components/wordbook/PracticeModeSelector.tsx`
- Create: `frontend/src/components/wordbook/PracticeExerciseRenderer.tsx`
- Modify: `frontend/src/components/wordbook/LearnCard.tsx`

**Step 1: Create mode selector**

Create `PracticeModeSelector.tsx`:

```tsx
'use client';

import { BookOpen, RotateCcw, Shuffle, SpellCheck, ListChecks, Repeat2 } from 'lucide-react';
import { WordBookPracticeMode } from '@/types';

interface PracticeModeSelectorProps {
  mode: WordBookPracticeMode;
  onModeChange: (mode: WordBookPracticeMode) => void;
  disabled?: boolean;
  mistakeCount: number;
}

const modes: Array<{ id: WordBookPracticeMode; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: 'mixed', label: '混合', icon: Shuffle },
  { id: 'new_only', label: '新词', icon: BookOpen },
  { id: 'review_only', label: '复习', icon: RotateCcw },
  { id: 'spelling_focus', label: '拼写', icon: SpellCheck },
  { id: 'quick_choice', label: '快刷', icon: ListChecks },
  { id: 'mistakes', label: '错题', icon: Repeat2 },
];

export default function PracticeModeSelector({ mode, onModeChange, disabled, mistakeCount }: PracticeModeSelectorProps) {
  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
      {modes.map((item) => {
        const Icon = item.icon;
        const itemDisabled = disabled || (item.id === 'mistakes' && mistakeCount === 0);
        return (
          <button
            key={item.id}
            type="button"
            disabled={itemDisabled}
            onClick={() => onModeChange(item.id)}
            className={`flex min-h-10 items-center justify-center gap-1.5 rounded-lg border px-2 text-xs font-semibold transition-colors ${
              mode === item.id
                ? 'border-blue-500 bg-blue-500 text-white'
                : 'border-gray-200 bg-white text-gray-600 hover:border-blue-300 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300'
            } disabled:cursor-not-allowed disabled:opacity-40`}
          >
            <Icon className="h-3.5 w-3.5" />
            <span>{item.label}</span>
            {item.id === 'mistakes' && mistakeCount > 0 && <span>({mistakeCount})</span>}
          </button>
        );
      })}
    </div>
  );
}
```

**Step 2: Create exercise renderer**

Create `PracticeExerciseRenderer.tsx` with props:

```ts
interface PracticeExerciseRendererProps {
  exercise: WordBookExercise;
  submitting?: boolean;
  upcomingWords?: string[];
  bookId: number;
  onRating: (rating: 'good' | 'hard' | 'forgot', meta?: { isCorrect?: boolean; answer?: string }) => void;
}
```

Implementation requirements:

- For `flashcard`, render `LearnCard`.
- For `en_to_zh_choice`, render options and call `onRating('good', { isCorrect: true })` for correct, `onRating('forgot', { isCorrect: false })` for wrong after a short reveal.
- For `zh_to_en_spelling`, input answer, use client Levenshtein helper, map exact/near to `good`/`hard`, wrong to `forgot`.
- For `audio_word_choice`, call `playWordAudio(exercise.audio_text || exercise.word, 'us')` and render English options.
- For `context_fill_blank`, show `exercise.context` and accept typed answer.
- Unknown type falls back to `LearnCard`.

**Step 3: Keep LearnCard compatible**

Only modify `LearnCard.tsx` if needed to support reuse. Do not remove AI toolbar or rating buttons.

**Step 4: Run lint**

Run from `frontend`:

```powershell
npm run lint
```

Expected: pass or only pre-existing unrelated warnings.

**Step 5: Commit**

Run:

```powershell
git status --short
git add frontend/src/components/wordbook/PracticeModeSelector.tsx frontend/src/components/wordbook/PracticeExerciseRenderer.tsx frontend/src/components/wordbook/LearnCard.tsx
git commit -m "feat: add wordbook practice exercise components"
```

## Task 5: Refactor Learn Page to Use Exercise Queues

**Files:**
- Modify: `frontend/src/app/wordbook/[slug]/learn/page.tsx`

**Step 1: Replace per-review-only type state**

Remove old `ReviewType`, `QuestionMode`, `pickReviewType`, choice state, and spelling state from the page. Keep page-level loading, error, daily progress, current phase, indexes, and submission state.

Add:

```ts
const [mode, setMode] = useState<WordBookPracticeMode>('mixed');
const [exerciseQueue, setExerciseQueue] = useState<WordBookExercise[]>([]);
const [mistakeQueue, setMistakeQueue] = useState<WordBookExercise[]>([]);
const [currentExerciseIndex, setCurrentExerciseIndex] = useState(0);
```

**Step 2: Add queue generation helpers**

Add helpers inside the component:

```ts
const buildEntryIds = (phase: 'new' | 'review') => {
  if (!tasks) return [];
  if (phase === 'new') return tasks.new_words.slice(newIndex).map((item) => item.entry_id);
  return tasks.review_words.slice(reviewIndex).map((item) => item.entry_id);
};
```

Add `loadExercises(phase, selectedMode)` that calls `wordBookAPI.getExercises`. On failure, build local flashcard fallback exercises from current tasks.

**Step 3: Use one renderer**

Render:

```tsx
<PracticeModeSelector
  mode={mode}
  onModeChange={handleModeChange}
  disabled={submitting}
  mistakeCount={mistakeQueue.length}
/>
<PracticeExerciseRenderer
  exercise={currentExercise}
  bookId={bookId}
  submitting={submitting}
  upcomingWords={upcomingWords}
  onRating={handleExerciseRating}
/>
```

**Step 4: Preserve progress semantics**

`handleExerciseRating` must:

- For `phase === 'new'`, call `wordBookAPI.learn`.
- For `phase === 'review'`, call `wordBookAPI.review`.
- For `phase === 'mistakes'`, do not call learn/review again; only remove or advance in mistake queue.
- Add exercise to `mistakeQueue` if `rating === 'forgot'` or `meta.isCorrect === false`.
- Advance from new to review to done according to existing `newDone`, `reviewDone`, `total_new`, and `total_review`.

**Step 5: Keep completion and backlog UI**

Preserve:

- loading state
- error state
- top back link
- `DailyProgress`
- done screen
- backlog warnings

**Step 6: Run lint**

Run from `frontend`:

```powershell
npm run lint
```

Expected: pass.

**Step 7: Commit**

Run:

```powershell
git status --short
git add frontend/src/app/wordbook/[slug]/learn/page.tsx
git commit -m "feat: use flexible exercise queues in wordbook practice"
```

Use `git add -- "frontend/src/app/wordbook/[slug]/learn/page.tsx"` if PowerShell treats brackets specially.

## Task 6: End-to-End Validation and Fixes

**Files:**
- Modify only files required by validation failures.

**Step 1: Run backend tests**

Run from `backend`:

```powershell
go test ./...
```

Expected: pass.

**Step 2: Run backend build**

Run from `backend`:

```powershell
go build ./...
```

Expected: pass.

**Step 3: Run frontend lint**

Run from `frontend`:

```powershell
npm run lint
```

Expected: pass.

**Step 4: Run frontend build**

Run from `frontend`:

```powershell
npm run build
```

Expected: pass.

**Step 5: Commit validation fixes**

If fixes were needed:

```powershell
git status --short
git add <changed-files>
git commit -m "fix: stabilize wordbook practice modes"
```

Do not commit unrelated `frontend/package-lock.json` unless validation proves it is part of the change.

## Task 7: Manual UX Check

**Files:**
- Modify only files required by manual check failures.

**Step 1: Start local services as available**

If the backend and frontend dependencies are already installed, run:

```powershell
cd backend
go run main.go
```

In another shell:

```powershell
cd frontend
npm run dev
```

**Step 2: Check practice flow**

In the browser:

- Open a subscribed wordbook.
- Start practice.
- Switch through mixed, new, review, spelling, quick, and mistakes modes.
- Verify new words are not limited to only flashcards.
- Verify review words support generated options.
- Answer one item wrong and verify it appears in mistake mode.
- Finish today and verify daily progress counts do not double-count mistake retries.

**Step 3: Commit UX fixes**

If fixes were needed:

```powershell
git status --short
git add <changed-files>
git commit -m "fix: polish wordbook practice mode UX"
```

## Final Verification

Run:

```powershell
git status --short
```

Expected:

- No unexpected changes.
- Existing unrelated `frontend/package-lock.json` may remain modified if it predates this work.

Summarize:

- Commits made.
- Validation commands and results.
- Any known limitations, especially session-only mistake queue and no persistent exercise history.
