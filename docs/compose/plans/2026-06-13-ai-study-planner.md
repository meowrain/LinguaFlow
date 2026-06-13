# AI Study Planner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use compose:subagent (recommended) or compose:execute to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add AI-powered study planning to /study homepage. Backend generates personalized daily study recommendations based on user's reading history, vocabulary due for review, wordbook backlog, video learning progress, and exam target. Results cached daily, served via SSE streaming. Frontend displays as a card at top of /study page.

**Architecture:** Backend collects 6 data points from DB, builds prompt for AI service, generates study plan, caches in StudyPlan table by (UserID, PlanDate). GET /api/study/plan returns cached or generates new. POST /api/study/plan forces regeneration. UserProfile stores exam target. Frontend SSE subscribes to plan endpoint, displays streaming text.

**Tech Stack:** Go/Gin backend, Next.js 14 frontend, OpenAI-compatible AI API, PostgreSQL + GORM, SSE for streaming.

---

## Task 1: Add UserProfile and StudyPlan models

**Covers:** S3 (Data models)

**Files:**
- Modify: `backend/models/models.go`

**Pre-check:** Read `backend/models/models.go` around line 370 to see existing StudyGoal model structure.

- [ ] **Step 1: Add UserProfile model**

```go
// UserProfile 用户学习档案
type UserProfile struct {
    ID          uint           `gorm:"primarykey" json:"id"`
    CreatedAt   time.Time      `json:"created_at"`
    UpdatedAt   time.Time      `json:"updated_at"`
    DeletedAt   gorm.DeletedAt `gorm:"index" json:"-"`

    UserID      uint   `gorm:"not null;uniqueIndex" json:"user_id"`
    TargetExam  string `gorm:"size:50" json:"target_exam"`   // 四级/考研/雅思/托福/自定义
    TargetLevel string `gorm:"size:10" json:"target_level"` // A1-C2
    CurrentLevel string `gorm:"size:10" json:"current_level"` // A1-C2

    User *User `gorm:"foreignKey:UserID" json:"user,omitempty"`
}
```

- [ ] **Step 2: Add StudyPlan model**

```go
// StudyPlan AI 学习计划缓存
type StudyPlan struct {
    ID        uint           `gorm:"primarykey" json:"id"`
    CreatedAt time.Time      `json:"created_at"`
    UpdatedAt time.Time      `json:"updated_at"`
    DeletedAt gorm.DeletedAt `gorm:"index" json:"-"`

    UserID    uint      `gorm:"not null;uniqueIndex:idx_user_date" json:"user_id"`
    PlanDate  string    `gorm:"size:10;not null;uniqueIndex:idx_user_date" json:"plan_date"` // YYYY-MM-DD
    Content   string    `gorm:"type:text" json:"content"` // AI 生成的建议文本

    User *User `gorm:"foreignKey:UserID" json:"user,omitempty"`
}
```

- [ ] **Step 3: Auto-migrate models in main.go**

In `backend/main.go`, add to AutoMigrate call:
```go
db.AutoMigrate(&models.UserProfile{}, &models.StudyPlan{})
```

- [ ] **Step 4: Commit**

```bash
git add backend/models/models.go backend/main.go
git commit -m "feat: add UserProfile and StudyPlan models"
```

---

## Task 2: Implement AI plan generation service method

**Covers:** S5 (AI data collection logic)

**Files:**
- Create: `backend/services/study_plan.go`
- Modify: `backend/services/ai_analysis.go` (read for reference pattern)

**Pre-check:** Read `backend/services/ai_analysis.go` lines 55-90 to see chatCompletionRequest struct, and lines 258-340 for streaming pattern.

- [ ] **Step 1: Create study_plan.go with data collection**

```go
package services

import (
    "time"
    "gugudu-backend/models"
    "gorm.io/gorm"
)

type StudyPlanData struct {
    DueWordsCount        int `json:"due_words_count"`
    HighForgottenCount   int `json:"high_forgotten_count"`
    RecentReadArticles   int `json:"recent_read_articles"`
    RecentReadMinutes    int `json:"recent_read_minutes"`
    WordbookBacklog      int `json:"wordbook_backlog"`
    IncompleteVideos     int `json:"incomplete_videos"`
    TargetExam           string `json:"target_exam"`
    TargetLevel          string `json:"target_level"`
    CurrentLevel         string `json:"current_level"`
    DailyReadGoal        int `json:"daily_read_minutes_goal"`
    DailyReviewGoal      int `json:"daily_review_words_goal"`
    DailyArticlesGoal    int `json:"daily_articles_goal"`
}

type StudyPlanService struct {
    db         *gorm.DB
    aiService  *AIAnalysisService
}

func NewStudyPlanService(db *gorm.DB, aiService *AIAnalysisService) *StudyPlanService {
    return &StudyPlanService{
        db:        db,
        aiService: aiService,
    }
}

func (s *StudyPlanService) CollectUserData(userID uint) (*StudyPlanData, error) {
    data := &StudyPlanData{}
    today := time.Now().Truncate(24 * time.Hour)
    weekAgo := today.AddDate(0, 0, -7)

    // Due vocabulary count
    var dueCount int64
    s.db.Model(&models.Vocabulary{}).Where("user_id = ? AND next_review_at <= ?", userID, time.Now()).Count(&dueCount)
    data.DueWordsCount = int(dueCount)

    // High forgotten words (ForgottenCount >= 3)
    var hfCount int64
    s.db.Model(&models.Vocabulary{}).Where("user_id = ? AND forgotten_count >= 3", userID).Count(&hfCount)
    data.HighForgottenCount = int(hfCount)

    // Recent 7-day reading stats
    var records []models.StudyRecord
    s.db.Where("user_id = ? AND date >= ?", userID, weekAgo.Format("2006-01-02")).Find(&records)
    data.RecentReadArticles = 0
    data.RecentReadMinutes = 0
    for _, r := range records {
        data.RecentReadArticles += r.CompletedArticles
        data.RecentReadMinutes += r.ReadSeconds / 60
    }

    // Wordbook backlog (not learned + due)
    var wbCount int64
    s.db.Model(&models.WordBook{}).Where("user_id = ? AND is_learnned = false", userID).Count(&wbCount)
    data.WordbookBacklog = int(wbCount)

    // Incomplete videos
    var vidCount int64
    s.db.Model(&models.VideoLesson{}).Where("user_id = ? AND completed_at IS NULL", userID).Count(&vidCount)
    data.IncompleteVideos = int(vidCount)

    // User profile (exam target)
    var profile models.UserProfile
    if err := s.db.Where("user_id = ?", userID).First(&profile).Error; err == nil {
        data.TargetExam = profile.TargetExam
        data.TargetLevel = profile.TargetLevel
        data.CurrentLevel = profile.CurrentLevel
    }

    // Study goals
    var goal models.StudyGoal
    if err := s.db.Where("user_id = ?", userID).First(&goal).Error; err == nil {
        data.DailyReadGoal = goal.DailyReadMinutes
        data.DailyReviewGoal = goal.DailyReviewWords
        data.DailyArticlesGoal = goal.DailyArticles
    }

    return data, nil
}

func (s *StudyPlanService) GeneratePlan(userID uint, data *StudyPlanData, onDelta func(string) error) error {
    prompt := buildStudyPlanPrompt(data)
    
    return s.aiService.GenerateStudyPlan(prompt, onDelta)
}

func buildStudyPlanPrompt(data *StudyPlanData) string {
    return `你是一个面向中国英语学习者的学习规划师。根据用户今天的学习数据，给出个性化的学习建议。

用户今日数据：
- 待复习单词：` + string(rune('0'+data.DueWordsCount%10)) + ` 个
- 高遗忘词（遗忘≥3次）：` + string(rune('0'+data.HighForgottenCount%10)) + ` 个
- 近7天阅读：完成 ` + string(rune('0'+data.RecentReadArticles%10)) + ` 篇，阅读 ` + string(rune('0'+data.RecentReadMinutes%10)) + ` 分钟
- 词书积压：未学词 ` + string(rune('0'+data.WordbookBacklog%10)) + ` 个
- 未完成视频：` + string(rune('0'+data.IncompleteVideos%10)) + ` 个
- 目标考试：` + data.TargetExam + `（当前水平: ` + data.CurrentLevel + `，目标水平: ` + data.TargetLevel + `）
- 今日目标：阅读 ` + string(rune('0'+data.DailyReadGoal%10)) + ` 分钟，复习 ` + string(rune('0'+data.DailyReviewGoal%10)) + ` 个单词，完成 ` + string(rune('0'+data.DailyArticlesGoal%10)) + ` 篇文章

请根据以上数据，用中文给出一段简洁的学习建议。格式如下：
"今天建议：先复习 X 个高遗忘词，再读一篇 Y 难度的 Z 主题文章，最后做 N 句视频听写。预计 X 分钟。"

只输出建议内容，不要输出其他内容。`
}
```

- [ ] **Step 2: Add GenerateStudyPlan method to AIAnalysisService**

In `backend/services/ai_analysis.go`, add:

```go
func (s *AIAnalysisService) GenerateStudyPlan(prompt string, onDelta func(string) error) error {
    if !s.IsConfigured() {
        return fmt.Errorf("AI 服务未配置")
    }

    payload := chatCompletionRequest{
        Model:       s.Model,
        Messages: []chatMessage{
            {Role: "system", Content: "你是一个专业的英语学习规划师。请根据用户数据给出简洁的学习建议。"},
            {Role: "user", Content: prompt},
        },
        Temperature: temperatureForModel(s.Model, 0.7),
        MaxTokens:   500,
        Stream:      true,
    }

    body, _ := json.Marshal(payload)
    req, _ := http.NewRequest(http.MethodPost, s.BaseURL+"/chat/completions", bytes.NewReader(body))
    req.Header.Set("Content-Type", "application/json")
    req.Header.Set("Accept", "text/event-stream")
    req.Header.Set("Authorization", "Bearer "+s.APIKey)

    streamClient := *s.client
    streamClient.Timeout = 0
    resp, err := streamClient.Do(req)
    if err != nil {
        return fmt.Errorf("AI 请求失败: %w", err)
    }
    defer resp.Body.Close()

    if resp.StatusCode < 200 || resp.StatusCode >= 300 {
        respBody, _ := io.ReadAll(resp.Body)
        return fmt.Errorf("AI HTTP %d: %s", resp.StatusCode, string(respBody))
    }

    scanner := bufio.NewScanner(resp.Body)
    scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024)
    for scanner.Scan() {
        line := strings.TrimSpace(scanner.Text())
        if line == "" || strings.HasPrefix(line, ":") {
            continue
        }
        if !strings.HasPrefix(line, "data:") {
            continue
        }
        data := strings.TrimSpace(strings.TrimPrefix(line, "data:"))
        if data == "" || data == "[DONE]" {
            break
        }

        var chunk chatCompletionStreamResponse
        if err := json.Unmarshal([]byte(data), &chunk); err != nil {
            continue
        }
        if chunk.Error != nil {
            return fmt.Errorf("AI 错误: %s", chunk.Error.Message)
        }

        for _, choice := range chunk.Choices {
            delta := choice.Delta.Content
            if delta == "" {
                continue
            }
            if err := onDelta(delta); err != nil {
                return err
            }
        }
    }
    return nil
}
```

- [ ] **Step 3: Commit**

```bash
git add backend/services/study_plan.go backend/services/ai_analysis.go
git commit -m "feat: add StudyPlanService with AI generation"
```

---

## Task 3: Add backend API endpoints

**Covers:** S4 (Backend API)

**Files:**
- Modify: `backend/handlers/study.go`
- Modify: `backend/main.go` (register routes)

**Pre-check:** Read `backend/handlers/study.go` lines 1-30 to see existing handler patterns.

- [ ] **Step 1: Add StudyPlan handlers**

Add to `backend/handlers/study.go`:

```go
// GetStudyPlan 获取今日 AI 学习计划
func GetStudyPlan(c *gin.Context) {
    userID := c.GetUint("user_id")
    if userID == 0 {
        c.JSON(http.StatusUnauthorized, gin.H{"error": "未登录"})
        return
    }

    today := time.Now().Format("2006-01-02")
    var plan models.StudyPlan
    if err := database.DB.Where("user_id = ? AND plan_date = ?", userID, today).First(&plan).Error; err == nil {
        c.JSON(http.StatusOK, gin.H{
            "content": plan.Content,
            "cached":  true,
        })
        return
    }

    data, err := studyPlanService.CollectUserData(userID)
    if err != nil {
        c.JSON(http.StatusInternalServerError, gin.H{"error": "收集数据失败"})
        return
    }

    var fullContent strings.Builder
    err = studyPlanService.GeneratePlan(userID, data, func(delta string) error {
        fullContent.WriteString(delta)
        c.SSEvent("message", delta)
        c.Writer.Flush()
        return nil
    })
    if err != nil {
        c.JSON(http.StatusInternalServerError, gin.H{"error": "生成计划失败: " + err.Error()})
        return
    }

    database.DB.Create(&models.StudyPlan{
        UserID:   userID,
        PlanDate: today,
        Content:  fullContent.String(),
    })

    c.SSEvent("done", map[string]string{"status": "completed"})
}

// RegenerateStudyPlan 重新生成今日学习计划
func RegenerateStudyPlan(c *gin.Context) {
    userID := c.GetUint("user_id")
    if userID == 0 {
        c.JSON(http.StatusUnauthorized, gin.H{"error": "未登录"})
        return
    }

    today := time.Now().Format("2006-01-02")
    database.DB.Where("user_id = ? AND plan_date = ?", userID, today).Delete(&models.StudyPlan{})

    GetStudyPlan(c)
}

// GetUserProfile 获取用户学习档案
func GetUserProfile(c *gin.Context) {
    userID := c.GetUint("user_id")
    var profile models.UserProfile
    if err := database.DB.Where("user_id = ?", userID).First(&profile).Error; err != nil {
        if err == gorm.ErrRecordNotFound {
            c.JSON(http.StatusOK, models.UserProfile{UserID: userID})
            return
        }
        c.JSON(http.StatusInternalServerError, gin.H{"error": "获取档案失败"})
        return
    }
    c.JSON(http.StatusOK, profile)
}

// UpdateUserProfile 更新用户学习档案
func UpdateUserProfile(c *gin.Context) {
    userID := c.GetUint("user_id")
    var input struct {
        TargetExam  string `json:"target_exam"`
        TargetLevel string `json:"target_level"`
        CurrentLevel string `json:"current_level"`
    }
    if err := c.ShouldBindJSON(&input); err != nil {
        c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
        return
    }

    var profile models.UserProfile
    if err := database.DB.Where("user_id = ?", userID).First(&profile).Error; err != nil {
        profile = models.UserProfile{UserID: userID}
    }
    profile.TargetExam = input.TargetExam
    profile.TargetLevel = input.TargetLevel
    profile.CurrentLevel = input.CurrentLevel

    if err := database.DB.Save(&profile).Error; err != nil {
        c.JSON(http.StatusInternalServerError, gin.H{"error": "保存失败"})
        return
    }
    c.JSON(http.StatusOK, profile)
}
```

- [ ] **Step 2: Register routes in main.go**

Add routes in `backend/main.go` (around study routes):

```go
study := r.Group("/api/study")
study.Use(middleware.AuthRequired())
{
    study.GET("/today", handlers.GetStudyToday)
    study.GET("/diagnostics", handlers.GetStudyDiagnostics)
    study.PUT("/goal", handlers.UpdateStudyGoal)
    study.GET("/plan", handlers.GetStudyPlan)
    study.POST("/plan", handlers.RegenerateStudyPlan)
}

profile := r.Group("/api/profile")
profile.Use(middleware.AuthRequired())
{
    profile.GET("", handlers.GetUserProfile)
    profile.PUT("", handlers.UpdateUserProfile)
}
```

- [ ] **Step 3: Add studyPlanService global variable**

In `backend/handlers/study.go`, add at top:

```go
var studyPlanService *services.StudyPlanService

func InitStudyPlanService(db *gorm.DB, aiService *services.AIAnalysisService) {
    studyPlanService = services.NewStudyPlanService(db, aiService)
}
```

In `backend/main.go` after AI service init:

```go
handlers.InitStudyPlanService(db, aiAnalysisService)
```

- [ ] **Step 4: Commit**

```bash
git add backend/handlers/study.go backend/main.go
git commit -m "feat: add study plan and profile API endpoints"
```

---

## Task 4: Add frontend API client and types

**Covers:** S6 (Frontend display)

**Files:**
- Modify: `frontend/src/types/index.ts`
- Modify: `frontend/src/lib/api.ts`

**Pre-check:** Read `frontend/src/types/index.ts` to see existing type patterns.

- [ ] **Step 1: Add TypeScript types**

Add to `frontend/src/types/index.ts`:

```typescript
export interface UserProfile {
  id?: number;
  user_id: number;
  target_exam: string;
  target_level: string;
  current_level: string;
}

export interface StudyPlan {
  content: string;
  cached: boolean;
}
```

- [ ] **Step 2: Add API methods**

In `frontend/src/lib/api.ts`, add:

```typescript
export const studyPlanAPI = {
  getPlan: () => api.get<{ data: StudyPlan }>('/study/plan'),
  regenerate: () => api.post<{ data: StudyPlan }>('/study/plan'),
};

export const profileAPI = {
  get: () => api.get<{ data: UserProfile }>('/profile'),
  update: (data: Partial<UserProfile>) => api.put<{ data: UserProfile }>('/profile', data),
};
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/types/index.ts frontend/src/lib/api.ts
git commit -m "feat: add study plan API client and types"
```

---

## Task 5: Build AI Planner card component

**Covers:** S6 (Frontend display)

**Files:**
- Create: `frontend/src/components/study/AIPlannerCard.tsx`
- Modify: `frontend/src/app/study/page.tsx`

**Pre-check:** Read `frontend/src/app/study/page.tsx` lines 1-80 to see component structure and imports.

- [ ] **Step 1: Create AIPlannerCard component**

```tsx
'use client';

import { useEffect, useState, useRef } from 'react';
import { Sparkles, RefreshCw, Loader2, Settings } from 'lucide-react';
import { studyPlanAPI, profileAPI } from '@/lib/api';
import { StudyPlan, UserProfile } from '@/types';

export function AIPlannerCard() {
  const [plan, setPlan] = useState<StudyPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState(false);
  const [displayedText, setDisplayedText] = useState('');
  const [showProfileSetup, setShowProfileSetup] = useState(false);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileForm, setProfileForm] = useState({ target_exam: '', target_level: 'B1', current_level: 'A2' });
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    fetchPlan();
    fetchProfile();
  }, []);

  const fetchPlan = async () => {
    setLoading(true);
    setDisplayedText('');
    const es = new EventSource(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080/api'}/study/plan`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
    });
    eventSourceRef.current = es;

    es.onmessage = (e) => {
      if (e.data === '[DONE]') {
        es.close();
        setLoading(false);
        return;
      }
      setDisplayedText((prev) => prev + e.data);
    };

    es.onerror = () => {
      es.close();
      setLoading(false);
    };

    try {
      const res = await studyPlanAPI.getPlan();
      if (res.data.data?.content && !displayedText) {
        setDisplayedText(res.data.data.content);
      }
    } catch {}
  };

  const fetchProfile = async () => {
    try {
      const res = await profileAPI.get();
      setProfile(res.data.data);
      if (!res.data.data?.target_exam) {
        setShowProfileSetup(true);
      }
    } catch {
      setShowProfileSetup(true);
    }
  };

  const handleRegenerate = async () => {
    setRegenerating(true);
    setDisplayedText('');
    eventSourceRef.current?.close();

    const es = new EventSource(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080/api'}/study/plan`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
    });
    eventSourceRef.current = es;

    es.onmessage = (e) => {
      if (e.data === '[DONE]') {
        es.close();
        setRegenerating(false);
        return;
      }
      setDisplayedText((prev) => prev + e.data);
    };
  };

  const handleSaveProfile = async () => {
    try {
      const res = await profileAPI.update(profileForm);
      setProfile(res.data.data);
      setShowProfileSetup(false);
      fetchPlan();
    } catch {}
  };

  return (
    <div className="bg-gradient-to-r from-violet-50 to-indigo-50 rounded-xl p-6 mb-6 border border-violet-100">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-violet-600" />
          <h2 className="text-lg font-semibold text-gray-900">今日学习规划</h2>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowProfileSetup(!showProfileSetup)}
            className="p-2 hover:bg-violet-100 rounded-lg transition-colors"
            title="设置学习目标"
          >
            <Settings className="w-4 h-4 text-gray-500" />
          </button>
          <button
            onClick={handleRegenerate}
            disabled={regenerating}
            className="p-2 hover:bg-violet-100 rounded-lg transition-colors disabled:opacity-50"
            title="重新规划"
          >
            {regenerating ? <Loader2 className="w-4 h-4 text-violet-600 animate-spin" /> : <RefreshCw className="w-4 h-4 text-gray-500" />}
          </button>
        </div>
      </div>

      {showProfileSetup && (
        <div className="mb-4 p-4 bg-white rounded-lg border border-violet-200">
          <h3 className="text-sm font-medium mb-3">设置学习目标</h3>
          <div className="grid grid-cols-3 gap-3 mb-3">
            <select
              value={profileForm.target_exam}
              onChange={(e) => setProfileForm({ ...profileForm, target_exam: e.target.value })}
              className="px-3 py-2 border rounded-lg text-sm"
            >
              <option value="">选择考试</option>
              <option value="四级">四级</option>
              <option value="六级">六级</option>
              <option value="考研">考研</option>
              <option value="雅思">雅思</option>
              <option value="托福">托福</option>
            </select>
            <select
              value={profileForm.target_level}
              onChange={(e) => setProfileForm({ ...profileForm, target_level: e.target.value })}
              className="px-3 py-2 border rounded-lg text-sm"
            >
              <option value="A1">A1</option>
              <option value="A2">A2</option>
              <option value="B1">B1</option>
              <option value="B2">B2</option>
              <option value="C1">C1</option>
              <option value="C2">C2</option>
            </select>
            <select
              value={profileForm.current_level}
              onChange={(e) => setProfileForm({ ...profileForm, current_level: e.target.value })}
              className="px-3 py-2 border rounded-lg text-sm"
            >
              <option value="A1">A1</option>
              <option value="A2">A2</option>
              <option value="B1">B1</option>
              <option value="B2">B2</option>
              <option value="C1">C1</option>
              <option value="C2">C2</option>
            </select>
          </div>
          <button
            onClick={handleSaveProfile}
            className="w-full py-2 bg-violet-600 text-white rounded-lg text-sm hover:bg-violet-700 transition-colors"
          >
            保存并生成计划
          </button>
        </div>
      )}

      <div className="min-h-[60px]">
        {loading ? (
          <div className="flex items-center gap-2 text-gray-500">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-sm">AI 正在规划今日学习...</span>
          </div>
        ) : displayedText ? (
          <p className="text-gray-700 leading-relaxed">{displayedText}</p>
        ) : (
          <p className="text-gray-400 text-sm">暂无学习规划，请先设置学习目标</p>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Integrate into study page**

In `frontend/src/app/study/page.tsx`, add import and render at top:

```tsx
import { AIPlannerCard } from '@/components/study/AIPlannerCard';
```

Add after line ~100 (after state declarations, before the main content):

```tsx
<AIPlannerCard />
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/study/AIPlannerCard.tsx frontend/src/app/study/page.tsx
git commit -m "feat: add AI planner card to study page"
```

---

## Task 6: Verify implementation

**Covers:** All sections

**Files:**
- Run: Backend tests
- Run: Frontend lint and build

- [ ] **Step 1: Run backend tests**

```bash
cd backend && go test ./...
```

- [ ] **Step 2: Run frontend lint**

```bash
cd frontend && npm run lint
```

- [ ] **Step 3: Run frontend build**

```bash
cd frontend && npm run build
```

- [ ] **Step 4: Final commit**

```bash
git add -A && git commit -m "feat: complete AI study planner feature"
```

---

**Plan complete.** Tasks 1-5 implement the feature; Task 6 verifies. Each task produces working, testable software. Use compose:subagent with fresh subagent per task for parallel or sequential execution.