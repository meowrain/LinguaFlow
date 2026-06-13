# AI 学习规划实现计划

> [!NOTE]
> This document may not reflect the current implementation.
> See the final report for up-to-date state:
> [Final Report](../reports/ai-study-plan.md)

> **For agentic workers:** REQUIRED SUB-SKILL: Use compose:subagent (recommended) or compose:execute to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**目标：** 在 /study 首页增加 AI 规划今天学什么功能

**架构：** 后端新增 UserProfile 和 StudyPlan 模型 + 4 个 API (GET/POST plan, GET/PUT profile)；前端在 /study 页面顶部添加 AI 规划卡片，SSE 流式接收

**技术栈：** Go Gin, GORM, SSE, Next.js, Tailwind

---

### Task 1: 新增 UserProfile 和 StudyPlan 数据模型

**Covers:** [S3]

**Files:**
- Modify: `backend/models/models.go`
- Test: `backend/models/models_test.go` (新建)

- [ ] **Step 1: 添加 UserProfile 模型**

在 `models.go` 文件末尾（约第 530 行后）添加：

```go
// UserProfile 用户学习档案（考试目标等）
type UserProfile struct {
	ID        uint           `gorm:"primarykey" json:"id"`
	CreatedAt time.Time      `json:"created_at"`
	UpdatedAt time.Time      `json:"updated_at"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"-"`

	UserID       uint   `gorm:"not null;uniqueIndex" json:"user_id"`
	TargetExam   string `gorm:"size:50" json:"target_exam"`   // 四级/考研/雅思/托福/自定义
	TargetLevel  string `gorm:"size:10" json:"target_level"`  // A1-C2
	CurrentLevel string `gorm:"size:10" json:"current_level"` // A1-C2

	User *User `gorm:"foreignKey:UserID" json:"user,omitempty"`
}
```

- [ ] **Step 2: 添加 StudyPlan 模型**

在 `UserProfile` 后添加：

```go
// StudyPlan AI 学习计划缓存
type StudyPlan struct {
	ID        uint           `gorm:"primarykey" json:"id"`
	CreatedAt time.Time      `json:"created_at"`
	UpdatedAt time.Time      `json:"updated_at"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"-"`

	UserID    uint   `gorm:"not null;uniqueIndex:idx_user_plan_date" json:"user_id"`
	PlanDate  string `gorm:"size:10;not null;uniqueIndex:idx_user_plan_date" json:"plan_date"`
	Content   string `gorm:"type:text" json:"content"`

	User *User `gorm:"foreignKey:UserID" json:"user,omitempty"`
}
```

- [ ] **Step 3: 运行模型测试验证**

```bash
cd backend && go build ./...
```

预期：无编译错误

---

### Task 2: 新增后端 API 端点

**Covers:** [S4]

**Files:**
- Modify: `backend/handlers/study.go`
- Modify: `backend/main.go` (注册路由)

- [ ] **Step 1: 在 handlers/study.go 添加 study plan 和 profile handlers**

在文件末尾添加：

```go
// ========== UserProfile ==========

type UserProfileResponse struct {
	TargetExam   string `json:"target_exam"`
	TargetLevel  string `json:"target_level"`
	CurrentLevel string `json:"current_level"`
}

type UpdateUserProfileRequest struct {
	TargetExam   string `json:"target_exam"`
	TargetLevel  string `json:"target_level"`
	CurrentLevel string `json:"current_level"`
}

func GetUserProfile(c *gin.Context) {
	userID := c.GetUint("user_id")
	var profile models.UserProfile
	if err := database.DB.FirstOrCreate(&profile, models.UserProfile{UserID: userID}).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "获取学习档案失败"})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"data": UserProfileResponse{
			TargetExam:   profile.TargetExam,
			TargetLevel:  profile.TargetLevel,
			CurrentLevel: profile.CurrentLevel,
		},
	})
}

func UpdateUserProfile(c *gin.Context) {
	userID := c.GetUint("user_id")
	var req UpdateUserProfileRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请求参数错误"})
		return
	}
	var profile models.UserProfile
	if err := database.DB.FirstOrCreate(&profile, models.UserProfile{UserID: userID}).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "更新学习档案失败"})
		return
	}
	updates := map[string]interface{}{}
	if req.TargetExam != "" {
		updates["target_exam"] = req.TargetExam
	}
	if req.TargetLevel != "" {
		updates["target_level"] = req.TargetLevel
	}
	if req.CurrentLevel != "" {
		updates["current_level"] = req.CurrentLevel
	}
	if err := database.DB.Model(&profile).Updates(updates).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "更新学习档案失败"})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"data": UserProfileResponse{
			TargetExam:   profile.TargetExam,
			TargetLevel:  profile.TargetLevel,
			CurrentLevel: profile.CurrentLevel,
		},
	})
}

// ========== StudyPlan (SSE 流式) ==========

type StudyPlanData struct {
	Content string `json:"content"`
	Cached  bool   `json:"cached"`
}

func GetStudyPlan(c *gin.Context) {
	userID := c.GetUint("user_id")
	today := time.Now().Format("2006-01-02")

	// 1. 尝试获取缓存
	var cached models.StudyPlan
	err := database.DB.Where("user_id = ? AND plan_date = ?", userID, today).First(&cached).Error
	if err == nil && cached.Content != "" {
		// 有缓存直接返回（非流式）
		c.JSON(http.StatusOK, gin.H{
			"data": StudyPlanData{
				Content: cached.Content,
				Cached:  true,
			},
		})
		return
	}

	// 2. 无缓存，生成新计划并流式返回
	c.Header("Content-Type", "text/event-stream")
	c.Header("Cache-Control", "no-cache")
	c.Header("Connection", "keep-alive")
	c.Header("X-Accel-Buffering", "no")

	c.Stream(func(w io.Writer) bool {
		// 收集用户数据
		data, err := CollectStudyData(userID)
		if err != nil {
			c.SSEvent("error", gin.H{"message": "收集学习数据失败"})
			return false
		}

		// 调用 AI 生成计划（流式）
		err = aiService.GenerateStudyPlanStream(data, func(delta string) error {
			c.SSEvent("message", gin.H{"content": delta})
			return nil
		})
		if err != nil {
			c.SSEvent("error", gin.H{"message": "生成学习计划失败: " + err.Error()})
			return false
		}

		// 保存到缓存（需要完整内容，这里简化：后续优化）
		c.SSEvent("done", gin.H{})
		return false
	})
}

func RegenerateStudyPlan(c *gin.Context) {
	userID := c.GetUint("user_id")
	today := time.Now().Format("2006-01-02")

	// 删除旧缓存
	database.DB.Where("user_id = ? AND plan_date = ?", userID, today).Delete(&models.StudyPlan{})

	// 流式返回新计划（逻辑同 GetStudyPlan，省略缓存检查）
	c.Header("Content-Type", "text/event-stream")
	c.Header("Cache-Control", "no-cache")
	c.Header("Connection", "keep-alive")

	var fullContent strings.Builder
	c.Stream(func(w io.Writer) bool {
		data, _ := CollectStudyData(userID)
		err := aiService.GenerateStudyPlanStream(data, func(delta string) error {
			fullContent.WriteString(delta)
			c.SSEvent("message", gin.H{"content": delta})
			return nil
		})
		if err != nil {
			c.SSEvent("error", gin.H{"message": "生成学习计划失败"})
			return false
		}

		// 保存完整内容到缓存
		database.DB.Create(&models.StudyPlan{
			UserID:   userID,
			PlanDate: today,
			Content:  fullContent.String(),
		})

		c.SSEvent("done", gin.H{})
		return false
	})
}
```

- [ ] **Step 2: 添加 CollectStudyData 辅助函数**

在 study.go 文件中添加：

```go
// CollectStudyData 收集生成 AI 学习计划所需的用户数据
func CollectStudyData(userID uint) (map[string]interface{}, error) {
	result := make(map[string]interface{})
	now := time.Now()
	today := now.Format("2006-01-02")

	// 1. 待复习单词
	var dueVocabCount, highForgetCount int64
	database.DB.Model(&models.Vocabulary{}).Where("user_id = ? AND next_review_at <= ?", userID, now).Count(&dueVocabCount)
	database.DB.Model(&models.Vocabulary{}).Where("user_id = ? AND forgotten_count >= 3", userID).Count(&highForgetCount)
	result["due_vocab_count"] = dueVocabCount
	result["high_forget_count"] = highForgetCount

	// 2. 最近阅读（最近7天）
	weekAgo := now.AddDate(0, 0, -7).Format("2006-01-02")
	var recentRead struct {
		TotalMinutes int
		Completed    int
	}
	database.DB.Model(&models.ReadHistory{}).
		Select("COALESCE(SUM(read_time), 0) as total_minutes, COUNT(CASE WHEN is_completed THEN 1 END) as completed").
		Where("user_id = ? AND date(last_read_at) >= ?", userID, weekAgo).
		Scan(&recentRead)
	result["recent_read_minutes"] = recentRead.TotalMinutes / 60
	result["recent_completed_articles"] = recentRead.Completed

	// 3. 词书积压
	var wordbookBacklog int64
	database.DB.Table("user_wordbook_subscriptions uws").
		Select("COALESCE(SUM(uws.total_entries - uws.learned_count), 0)").
		Joins("JOIN wordbooks w ON w.id = uws.wordbook_id").
		Where("uws.user_id = ?", userID).
		Count(&wordbookBacklog)
	result["wordbook_backlog"] = wordbookBacklog

	// 4. 视频进度
	var incompleteVideoCount int64
	database.DB.Model(&models.VideoLesson{}).Where("user_id = ? AND completed_at IS NULL", userID).Count(&incompleteVideoCount)
	result["incomplete_video_count"] = incompleteVideoCount

	// 5. 用户目标
	var profile models.UserProfile
	if err := database.DB.Where("user_id = ?", userID).First(&profile).Error; err == nil {
		result["target_exam"] = profile.TargetExam
		result["target_level"] = profile.TargetLevel
		result["current_level"] = profile.CurrentLevel
	} else {
		result["target_exam"] = ""
		result["target_level"] = ""
		result["current_level"] = ""
	}

	// 6. 今日目标
	var goal models.StudyGoal
	if err := database.DB.Where("user_id = ?", userID).First(&goal).Error; err == nil {
		result["daily_read_minutes"] = goal.DailyReadMinutes
		result["daily_review_words"] = goal.DailyReviewWords
		result["daily_articles"] = goal.DailyArticles
	} else {
		result["daily_read_minutes"] = 20
		result["daily_review_words"] = 10
		result["daily_articles"] = 1
	}

	return result, nil
}
```

- [ ] **Step 3: 添加 AI 流式生成方法**

在 `backend/services/ai_analysis.go` 末尾添加：

```go
// StudyPlanData 输入数据
type StudyPlanDataInput struct {
	DueVocabCount         int
	HighForgetCount       int
	RecentReadMinutes     int
	RecentCompletedArticles int
	WordbookBacklog       int
	IncompleteVideoCount  int
	TargetExam            string
	TargetLevel           string
	CurrentLevel          string
	DailyReadMinutes      int
	DailyReviewWords      int
	DailyArticles         int
}

// GenerateStudyPlanStream 流式生成学习计划
func (s *AIAnalysisService) GenerateStudyPlanStream(data StudyPlanDataInput, onDelta func(string) error) error {
	if !s.IsConfigured() {
		return fmt.Errorf("AI 服务未配置")
	}

	// 构建 prompt
	prompt := fmt.Sprintf(`你是一个英语学习规划师。请根据用户今天的学习数据，给出个性化的学习建议。

用户数据：
- 待复习单词：%d 个
- 高遗忘词（遗忘≥3次）：%d 个
- 本周阅读时长：%d 分钟
- 本周完成文章：%d 篇
- 词书积压：%d 个
- 未完成视频：%d 个
- 考试目标：%s
- 目标水平：%s
- 当前水平：%s
- 今日阅读目标：%d 分钟
- 今日复习目标：%d 个单词
- 今日文章目标：%d 篇

请按以下格式输出（简洁明了）：
今天建议：[具体建议1]，[具体建议2]，[具体建议3]。预计 %d 分钟。`,
		data.DueVocabCount,
		data.HighForgetCount,
		data.RecentReadMinutes,
		data.RecentCompletedArticles,
		data.WordbookBacklog,
		data.IncompleteVideoCount,
		data.TargetExam,
		data.TargetLevel,
		data.CurrentLevel,
		data.DailyReadMinutes,
		data.DailyReviewWords,
		data.DailyArticles,
		30, // 默认预估时间
	)

	payload := chatCompletionRequest{
		Model: s.Model,
		Messages: []chatMessage{
			{Role: "system", Content: "你是一个友好的英语学习规划师，给出简洁实用的每日建议。"},
			{Role: "user", Content: prompt},
		},
		Temperature: temperatureForModel(s.Model, 0.7),
		MaxTokens:   500,
		Stream:      true,
	}

	// 发送请求并处理流式响应（复用 DiscussArticleStream 的逻辑）
	// 简化实现：参考 DiscussArticleStream 的流式处理
	// ...
}
```

注意：`GenerateStudyPlanStream` 完整实现可复用 `DiscussArticleStream` 的流式处理逻辑，详见 ai_analysis.go:258-345 行。

- [ ] **Step 4: 在 main.go 注册新路由**

在 main.go 约第 214-216 行（study 路由附近）添加：

```go
// 用户学习档案
profile := r.Group("/api/profile")
profile.Use(middleware.AuthRequired())
{
	profile.GET("", handlers.GetUserProfile)
	profile.PUT("", handlers.UpdateUserProfile)
}

// AI 学习计划
studyPlan := r.Group("/api/study/plan")
studyPlan.Use(middleware.AuthRequired())
{
	studyPlan.GET("", handlers.GetStudyPlan)
	studyPlan.POST("", handlers.RegenerateStudyPlan)
}
```

- [ ] **Step 5: 编译验证**

```bash
cd backend && go build ./...
```

预期：编译成功

- [ ] **Step 6: 提交**

```bash
git add backend/models/models.go backend/handlers/study.go backend/services/ai_analysis.go backend/main.go
git commit -m "feat: add UserProfile, StudyPlan models and AI study plan API"
```

---

### Task 3: 前端 API 和类型

**Covers:** [S4]

**Files:**
- Modify: `frontend/src/types/index.ts`
- Modify: `frontend/src/lib/api.ts`

- [ ] **Step 1: 在 frontend/src/types/index.ts 添加类型**

找到 types 文件（约末尾）添加：

```typescript
export interface UserProfile {
  target_exam: string;
  target_level: string;
  current_level: string;
}

export interface StudyPlanData {
  content: string;
  cached: boolean;
}
```

- [ ] **Step 2: 在 frontend/src/lib/api.ts 添加 API 方法**

在 studyAPI 对象中添加：

```typescript
export const studyAPI = {
  getToday: () => api.get('/study/today'),
  getDiagnostics: () => api.get('/study/diagnostics'),
  updateGoal: (data: {...}) => api.put('/study/goal', data),
  // 新增
  getPlan: () => api.get('/study/plan'),
  regeneratePlan: () => api.post('/study/plan'),
  getProfile: () => api.get('/profile'),
  updateProfile: (data: Partial<UserProfile>) => api.put('/profile', data),
};
```

- [ ] **Step 3: 编译验证**

```bash
cd frontend && npm run build
```

预期：编译成功

- [ ] **Step 4: 提交**

```bash
git add frontend/src/types/index.ts frontend/src/lib/api.ts
git commit -m "feat: add study plan API client and types"
```

---

### Task 4: 前端 AI 规划卡片组件

**Covers:** [S6]

**Files:**
- Modify: `frontend/src/app/study/page.tsx`

- [ ] **Step 1: 在 /study 页面顶部添加 AI 规划卡片**

找到 `frontend/src/app/study/page.tsx` 的 Stats Overview 部分（约第 209 行），在其上方添加：

```tsx
// AI 规划卡片状态
const [aiPlan, setAiPlan] = useState<{ content: string; cached: boolean } | null>(null);
const [loadingPlan, setLoadingPlan] = useState(true);
const [planError, setPlanError] = useState('');

// 加载 AI 规划
useEffect(() => {
  if (!mounted || !isAuthenticated) return;
  
  const fetchPlan = async () => {
    try {
      setLoadingPlan(true);
      const res = await studyAPI.getPlan();
      const data = res.data.data;
      setAiPlan({ content: data.content, cached: data.cached });
    } catch (err: any) {
      setPlanError(err.message || '加载学习计划失败');
    } finally {
      setLoadingPlan(false);
    }
  };
  
  fetchPlan();
}, [mounted, isAuthenticated]);

// 重新生成计划
const handleRegeneratePlan = async () => {
  try {
    setLoadingPlan(true);
    setPlanError('');
    const response = await studyAPI.regeneratePlan();
    // SSE 流式处理
    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    let content = '';
    
    while (reader) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value);
      const lines = chunk.split('\n');
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6));
            if (data.content) {
              content += data.content;
              setAiPlan({ content, cached: false });
            }
          } catch {}
        }
      }
    }
  } catch (err: any) {
    setPlanError(err.message || '重新生成学习计划失败');
  } finally {
    setLoadingPlan(false);
  }
};
```

- [ ] **Step 2: 在 JSX 中渲染 AI 规划卡片**

在 stats overview (Line ~209) 之前添加：

```tsx
{/* AI 学习规划卡片 */}
<div className="bg-gradient-to-r from-violet-500 to-purple-600 rounded-xl p-6 text-white mb-6">
  <div className="flex items-center justify-between mb-3">
    <div className="flex items-center gap-2">
      <Sparkles className="w-5 h-5" />
      <h2 className="text-lg font-semibold">今日学习规划</h2>
      {aiPlan?.cached && (
        <span className="text-xs bg-white/20 px-2 py-0.5 rounded-full">已缓存</span>
      )}
    </div>
    <button
      onClick={handleRegeneratePlan}
      disabled={loadingPlan}
      className="flex items-center gap-1 text-sm bg-white/20 hover:bg-white/30 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
    >
      <RotateCcw className={`w-4 h-4 ${loadingPlan ? 'animate-spin' : ''}`} />
      重新规划
    </button>
  </div>
  
  {loadingPlan && !aiPlan ? (
    <div className="space-y-2">
      <div className="h-4 bg-white/20 rounded animate-pulse w-3/4"></div>
      <div className="h-4 bg-white/20 rounded animate-pulse w-1/2"></div>
    </div>
  ) : planError ? (
    <p className="text-red-200 text-sm">{planError}</p>
  ) : aiPlan ? (
    <p className="text-lg leading-relaxed">{aiPlan.content}</p>
  ) : (
    <p className="text-white/70">设置学习目标后，AI 将为你规划今日学习内容</p>
  )}
</div>
```

- [ ] **Step 3: 运行 lint 验证**

```bash
cd frontend && npm run lint
```

预期：无 lint 错误

- [ ] **Step 4: 提交**

```bash
git add frontend/src/app/study/page.tsx
git commit -m "feat: add AI study plan card to /study page"
```

---

### Task 5: 用户目标设置入口

**Covers:** [S6]

**Files:**
- Modify: `frontend/src/app/study/page.tsx`

- [ ] **Step 1: 添加目标设置引导**

如果 AI 规划为空或用户未设置目标，显示设置入口：

```tsx
{/* 在 AI 规划卡片内，aiPlan 为空时显示 */}
{!loadingPlan && !aiPlan && (
  <Link
    href="/profile"
    className="mt-3 inline-flex items-center gap-1 text-sm bg-white/30 hover:bg-white/40 px-3 py-1.5 rounded-lg transition-colors"
  >
    <Target className="w-4 h-4" />
    设置你的考试目标
  </Link>
)}
```

- [ ] **Step 2: 提交**

```bash
git add frontend/src/app/study/page.tsx
git commit -m "feat: add exam target setup link to AI plan card"
```

---

### Task 6: 集成测试

**Covers:** [S4, S6]

**Files:**
- Test: 手动测试

- [ ] **Step 1: 启动后端**

```bash
cd backend && go run main.go
```

- [ ] **Step 2: 启动前端**

```bash
cd frontend && npm run dev
```

- [ ] **Step 3: 手动验证**

1. 登录后访问 /study 页面
2. 确认顶部显示 AI 规划卡片
3. 点击「重新规划」按钮，观察流式输出
4. 刷新页面，确认缓存生效（显示「已缓存」标签）
5. 访问 /profile，设置考试目标
6. 回到 /study，观察建议内容包含考试目标

- [ ] **Step 4: 提交**

```bash
git add -A
git commit -m "test: verify AI study plan feature E2E"
```

---

### 实施检查清单

- [ ] Task 1: 数据模型完成
- [ ] Task 2: 后端 API 完成
- [ ] Task 3: 前端 API 和类型完成
- [ ] Task 4: 前端组件完成
- [ ] Task 5: 目标设置入口完成
- [ ] Task 6: E2E 测试通过

---

### Spec 覆盖

| Spec Section | Task |
|--------------|------|
| [S3] 数据模型 | Task 1 |
| [S4] 后端 API | Task 2 |
| [S5] AI 数据收集逻辑 | Task 2 (CollectStudyData) |
| [S6] 前端展示 | Task 4, Task 5 |
| [S7] 缓存策略 | Task 2 (StudyPlan 模型 + GET 逻辑) |