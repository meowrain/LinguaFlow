# 阅读增强功能实现计划

> [!NOTE]
> This document may not reflect the current implementation.
> See the final report for up-to-date state:
> [Final Report](../reports/reading-enhancement.md)

> **For agentic workers:** REQUIRED SUB-SKILL: Use compose:subagent (recommended) or compose:execute to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 LinguaFlow 添加5项阅读增强功能：分栏式精读模式、阅读后测验增强、长难句收藏夹、文章难度推荐、阅读模式切换（泛读/精读/考试/跟读）

**Architecture:** 在现有 `/articles/[slug]` 页面基础上增加 Tab 切换，分栏式精读组件，复用现有 AI 分析服务生成句子解析，扩展 ArticleQuiz 支持多题型，新增句子收藏表，新增难度推荐端点

**Tech Stack:** Go 1.22 Gin (后端), Next.js 14 + TypeScript + Tailwind (前端), Radix UI Tabs (如未装需添加)

---

## 任务结构总览

| 任务 | 功能 | 预估复杂度 |
|------|------|------------|
| Task 1 | 后端：扩展 ArticleQuizQuestion 支持多题型 | 中 |
| Task 2 | 后端：新增句子收藏 API | 低 |
| Task 3 | 后端：新增难度推荐 API | 中 |
| Task 4 | 前端：阅读模式 Tab 切换 UI | 中 |
| Task 5 | 前端：分栏式精读组件 | 高 |
| Task 6 | 前端：测验组件支持多题型 | 中 |
| Task 7 | 前端：句子收藏夹页面 | 低 |
| Task 8 | 前端：难度推荐筛选器 | 低 |
| Task 9 | 前端：考试模式组件 | 中 |
| Task 10 | 前端：跟读模式组件 | 中 |

---

### Task 1: 后端 - 扩展 ArticleQuizQuestion 支持多题型

**Files:**
- Modify: `backend/models/models.go:119-135`
- Modify: `backend/handlers/article.go` (quiz 生成逻辑)
- Test: `backend/handlers/article_test.go`

- [ ] **Step 1: 修改模型支持多题型**

```go
// backend/models/models.go 中 ArticleQuizQuestion 添加新字段
// QuestionType 字段已存在，扩展支持：
// - single_choice (现有)
// - true_false (新增)
// - main_idea (新增)
// - word_meaning (新增)

// 无需修改模型，只需修改 handlers 中的生成逻辑
```

- [ ] **Step 2: 在 article.go 中添加多题型生成逻辑**

在 `generateQuiz` 函数中增加 `question_types` 参数支持：

```go
func generateQuiz(article *models.Article, questionTypes []string) *models.ArticleQuiz {
    // questionTypes 来自请求参数，支持 ["single_choice", "true_false", "main_idea", "word_meaning"]
    // 默认 ["single_choice"]
    
    questions := []models.ArticleQuizQuestion{}
    
    for _, qt := range questionTypes {
        switch qt {
        case "single_choice":
            questions = append(questions, generateSingleChoice(article)...)
        case "true_false":
            questions = append(questions, generateTrueFalse(article)...)
        case "main_idea":
            questions = append(questions, generateMainIdea(article)...)
        case "word_meaning":
            questions = append(questions, generateWordMeaning(article)...)
        }
    }
    
    // ...
}
```

- [ ] **Step 3: 修改 quiz 生成端点支持题型参数**

```go
// POST /api/articles/:slug/quiz
type QuizRequest struct {
    QuestionTypes []string `json:"question_types"` // 默认 ["single_choice"]
    Count         int      `json:"count"`          // 每种题型数量，默认 2
}
```

- [ ] **Step 4: 测试运行**

```bash
cd backend && go test ./handlers/ -v -run TestQuiz
```

- [ ] **Step 5: 提交**

```bash
git add backend/models/models.go backend/handlers/article.go
git commit -m "feat(quiz): 扩展测验支持多题型(true_false/main_idea/word_meaning)"
```

---

### Task 2: 后端 - 新增句子收藏 API

**Files:**
- Modify: `backend/models/models.go` (可选，使用现有 ArticleStudyEvent)
- Modify: `backend/handlers/article.go`
- Modify: `frontend/src/lib/api.ts`
- Modify: `frontend/src/types/index.ts`

- [ ] **Step 1: 使用现有 ArticleStudyEvent 表，新增 event_type**

在 `backend/handlers/article.go` 新增端点：

```go
// POST /api/articles/:slug/sentences
// 保存用户收藏的句子
type SaveSentenceRequest struct {
    SentenceText string `json:"sentence_text" binding:"required"`
    Analysis     string `json:"analysis"` // 可选，预分析结果
}

// GET /api/articles/:slug/sentences
// 获取当前文章的用户收藏句子

// DELETE /api/articles/:slug/sentences/:id
// 删除收藏
```

使用 `event_type = 'sentence_saved'`，`SourceText` = 句子文本，`ResultText` = 分析结果

- [ ] **Step 2: 新增获取用户所有收藏句子的端点**

```go
// GET /api/sentences
// 获取当前用户所有收藏的句子，按文章分组
type UserSentenceCollection struct {
    ID            uint   `json:"id"`
    ArticleID     uint   `json:"article_id"`
    ArticleTitle  string `json:"article_title"`
    SentenceText  string `json:"sentence_text"`
    Analysis      string `json:"analysis"`
    CreatedAt     string `json:"created_at"`
    IsReviewed    bool   `json:"is_reviewed"`
}
```

- [ ] **Step 3: 测试运行**

```bash
cd backend && go test ./handlers/ -v -run TestSentence
```

- [ ] **Step 4: 提交**

```bash
git add backend/handlers/article.go
git commit -m "feat(sentences): 添加句子收藏API"
```

---

### Task 3: 后端 - 新增难度推荐 API

**Files:**
- Modify: `backend/handlers/article.go`
- Test: `backend/handlers/article_test.go`

- [ ] **Step 1: 新增推荐端点**

```go
// GET /api/articles/recommend
// 根据用户阅读数据推荐合适难度的文章

type DifficultyRecommendation struct {
    UserCEFR         string           `json:"user_cefr"`      // 推荐 CEFR 等级
    Confidence       float64          `json:"confidence"`     // 推荐置信度
    Stats            UserReadingStats `json:"stats"`          // 用户阅读统计
    RecommendedArticles []Article     `json:"articles"`       // 推荐文章
}

type UserReadingStats struct {
    AvgNewWordRate   float64 `json:"avg_new_word_rate"`   // 平均生词率
    AvgReadingSpeed  float64 `json:"avg_reading_speed"`   // 平均阅读速度 (WPM)
    CompletionRate   float64 `json:"completion_rate"`     // 完读率
    ArticlesRead     int     `json:"articles_read"`       // 已读文章数
}
```

**算法**：
```
生词率 = 用户未掌握单词数 / 文章总词数
阅读速度 = 总词数 / 总阅读时间
完读率 = 完成文章数 / 开始阅读文章数

if 生词率 < 0.05: CEFR = A1-A2
else if 生词率 < 0.15: CEFR = B1
else if 生词率 < 0.25: CEFR = B2
else: CEFR = C1-C2
```

- [ ] **Step 2: 实现查询用户阅读统计**

从 ReadHistory, Vocabulary, StudyRecord 表聚合计算

- [ ] **Step 3: 测试运行**

```bash
cd backend && go test ./handlers/ -v -run TestRecommend
```

- [ ] **Step 4: 提交**

```bash
git add backend/handlers/article.go
git commit -m "feat(articles): 添加文章难度推荐API"
```

---

### Task 4: 前端 - 阅读模式 Tab 切换 UI

**Files:**
- Modify: `frontend/src/app/articles/[slug]/page.tsx`

- [ ] **Step 1: 安装 Radix UI Tabs (如未安装)**

```bash
cd frontend && npm install @radix-ui/react-tabs
```

- [ ] **Step 2: 在现有页面中添加 Tab 组件**

在 `articles/[slug]/page.tsx` 中添加：

```tsx
import * as Tabs from '@radix-ui/react-tabs';

// 在现有组件中添加状态
const [readingMode, setReadingMode] = useState<'browsing' | 'intensive' | 'exam' | 'echo'>('browsing');

// 用 Tabs 包装现有���容
<Tabs.Root value={readingMode} onValueChange={(v) => setReadingMode(v as typeof readingMode)}>
  <Tabs.List className="flex border-b border-gray-200 dark:border-gray-700">
    <Tabs.Trigger 
      value="browsing"
      className="px-4 py-2 data-[state=active]:border-b-2 data-[state=active]:border-blue-500"
    >
      泛读
    </Tabs.Trigger>
    <Tabs.Trigger value="intensive" className="...">
      精读
    </Tabs.Trigger>
    <Tabs.Trigger value="exam" className="...">
      考试
    </Tabs.Trigger>
    <Tabs.Trigger value="echo" className="...">
      跟读
    </Tabs.Trigger>
  </Tabs.List>
  
  <Tabs.Content value="browsing">
    {/* 现有文章阅读 UI */}
  </Tabs.Content>
  
  <Tabs.Content value="intensive">
    {/* 分栏式精读组件 - Task 5 */}
  </Tabs.Content>
  
  <Tabs.Content value="exam">
    {/* 考试模式组件 - Task 9 */}
  </Tabs.Content>
  
  <Tabs.Content value="echo">
    {/* 跟读模式组件 - Task 10 */}
  </Tabs.Content>
</Tabs.Root>
```

- [ ] **Step 3: 测试运行**

```bash
cd frontend && npm run lint
```

- [ ] **Step 4: 提交**

```bash
git add frontend/src/app/articles/\[slug\]/page.tsx frontend/package.json
git commit -m "feat(reading): 添加阅读模式Tab切换UI"
```

---

### Task 5: 前端 - 分栏式精读组件

**Files:**
- Create: `frontend/src/components/IntensiveReadingPanel.tsx`
- Modify: `frontend/src/app/articles/[slug]/page.tsx` (在 Task 4 中已引入)
- Modify: `frontend/src/lib/api.ts`
- Modify: `frontend/src/types/index.ts`

- [ ] **Step 1: 创建 IntensiveReadingPanel 组件**

```tsx
// frontend/src/components/IntensiveReadingPanel.tsx
'use client';

import { useState } from 'react';
import { articleAPI } from '@/lib/api';
import { Article, SentenceAnalysis } from '@/types';

interface Props {
  article: Article;
}

export default function IntensiveReadingPanel({ article }: Props) {
  const [selectedSentence, setSelectedSentence] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<SentenceAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  
  // 将文章内容按句子分割
  const sentences = article.content.split(/[.!?]+/).filter(Boolean);
  
  const handleSentenceClick = async (sentence: string) => {
    setSelectedSentence(sentence);
    setLoading(true);
    try {
      const result = await articleAPI.analyzeSentence(article.slug, sentence);
      setAnalysis(result);
    } catch (error) {
      console.error('Failed to analyze sentence:', error);
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <div className="flex h-[calc(100vh-200px)]">
      {/* 左侧：原文句子列表 */}
      <div className="w-1/2 overflow-y-auto pr-4 border-r">
        <div className="space-y-4">
          {sentences.map((sentence, index) => (
            <div
              key={index}
              onClick={() => handleSentenceClick(sentence)}
              className={`p-3 rounded-lg cursor-pointer transition-colors ${
                selectedSentence === sentence 
                  ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-500' 
                  : 'hover:bg-gray-50 dark:hover:bg-gray-800'
              }`}
            >
              <p className="text-gray-800 dark:text-gray-200">{sentence.trim()}</p>
            </div>
          ))}
        </div>
      </div>
      
      {/* 右侧：解析面板 */}
      <div className="w-1/2 pl-4 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="animate-spin" />
          </div>
        ) : analysis ? (
          <div className="space-y-4">
            {/* 语法拆解 */}
            <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <h3 className="font-semibold mb-2">语法拆解</h3>
              <p className="text-sm">{analysis.grammar || '暂无'}</p>
            </div>
            
            {/* 难词注释 */}
            <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <h3 className="font-semibold mb-2">难词注释</h3>
              <div className="space-y-1">
                {analysis.difficult_words?.map((word, i) => (
                  <div key={i} className="flex justify-between">
                    <span className="font-medium">{word.word}</span>
                    <span className="text-gray-600">{word.definition}</span>
                  </div>
                )) || <p className="text-sm">暂无</p>}
              </div>
            </div>
            
            {/* 翻译 */}
            <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <h3 className="font-semibold mb-2">翻译</h3>
              <p className="text-sm">{analysis.translation || '暂无'}</p>
            </div>
            
            {/* 重点表达 */}
            <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <h3 className="font-semibold mb-2">重点表达</h3>
              <ul className="list-disc list-inside text-sm">
                {analysis.expressions?.map((exp, i) => (
                  <li key={i}>{exp}</li>
                )) || <p>暂无</p>}
              </ul>
            </div>
            
            {/* 收藏按钮 */}
            <button
              onClick={() => saveSentence(selectedSentence, analysis)}
              className="w-full py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
            >
              收藏此句
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-center h-full text-gray-400">
            点击左侧句子查看解析
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 添加类型定义**

```ts
// frontend/src/types/index.ts
export interface SentenceAnalysis {
  sentence: string;
  grammar?: string;
  difficult_words?: Array<{ word: string; definition: string }>;
  translation?: string;
  expressions?: string[];
}
```

- [ ] **Step 3: 添加 API 方法**

```ts
// frontend/src/lib/api.ts
export const articleAPI = {
  // ...existing methods
  analyzeSentence: (slug: string, sentence: string) =>
    api.post<SentenceAnalysis>(`/articles/${slug}/sentence-analyze`, { sentence }),
  saveSentence: (slug: string, sentence: string, analysis?: string) =>
    api.post(`/articles/${slug}/sentences`, { sentence_text: sentence, analysis }),
};
```

- [ ] **Step 4: 测试运行**

```bash
cd frontend && npm run lint
```

- [ ] **Step 5: 提交**

```bash
git add frontend/src/components/IntensiveReadingPanel.tsx frontend/src/types/index.ts frontend/src/lib/api.ts
git commit -m "feat(reading): 添加分栏式精读组件"
```

---

### Task 6: 前端 - 测验组件支持多题型

**Files:**
- Modify: `frontend/src/types/index.ts` (已在 Task 5 中扩展)
- Modify: `frontend/src/app/articles/[slug]/page.tsx` (quiz 部分)

- [ ] **Step 1: 修改测验展示组件支持新题型**

在现有 Quiz 展示区域，增加对不同题型的渲染：

```tsx
// QuestionRenderer 组件
function QuestionRenderer({ question }: { question: ArticleQuizQuestion }) {
  switch (question.question_type) {
    case 'single_choice':
      return <SingleChoiceQuestion question={question} />;
    case 'true_false':
      return <TrueFalseQuestion question={question} />;
    case 'main_idea':
      return <MainIdeaQuestion question={question} />;
    case 'word_meaning':
      return <WordMeaningQuestion question={question} />;
    default:
      return <SingleChoiceQuestion question={question} />;
  }
}

// TrueFalseQuestion 组件
function TrueFalseQuestion({ question }: { question: ArticleQuizQuestion }) {
  return (
    <div className="space-y-3">
      <p className="font-medium">{question.prompt}</p>
      <div className="flex gap-4">
        {question.options?.map((option, i) => (
          <button
            key={i}
            onClick={() => handleAnswer(i)}
            className="flex-1 py-3 px-4 border rounded-lg hover:bg-gray-50"
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 测试运行**

```bash
cd frontend && npm run lint
```

- [ ] **Step 3: 提交**

```bash
git add frontend/src/app/articles/\[slug\]/page.tsx
git commit -m "feat(quiz): 测验组件支持多题型渲染"
```

---

### Task 7: 前端 - 句子收藏夹页面

**Files:**
- Create: `frontend/src/app/sentences/page.tsx`
- Modify: `frontend/src/app/layout.tsx` (添加导航)

- [ ] **Step 1: 创建句子收藏夹页面**

```tsx
// frontend/src/app/sentences/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { articleAPI } from '@/lib/api';

interface SavedSentence {
  id: number;
  article_id: number;
  article_title: string;
  sentence_text: string;
  analysis?: string;
  created_at: string;
}

export default function SentencesPage() {
  const [sentences, setSentences] = useState<SavedSentence[]>([]);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    loadSentences();
  }, []);
  
  const loadSentences = async () => {
    try {
      const data = await articleAPI.getUserSentences();
      setSentences(data);
    } catch (error) {
      console.error('Failed to load sentences:', error);
    } finally {
      setLoading(false);
    }
  };
  
  const deleteSentence = async (id: number) => {
    await articleAPI.deleteSentence(id);
    setSentences(sentences.filter(s => s.id !== id));
  };
  
  // 按文章分组
  const grouped = sentences.reduce((acc, s) => {
    const key = s.article_title;
    if (!acc[key]) acc[key] = [];
    acc[key].push(s);
    return acc;
  }, {} as Record<string, SavedSentence[]>);
  
  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">我的收藏句子</h1>
      
      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="animate-spin" />
        </div>
      ) : Object.keys(grouped).length === 0 ? (
        <p className="text-gray-500 text-center py-12">暂无收藏的句子</p>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([title, items]) => (
            <div key={title} className="border rounded-lg overflow-hidden">
              <div className="bg-gray-50 px-4 py-2 font-medium">
                {title}
              </div>
              <div className="divide-y">
                {items.map(sentence => (
                  <div key={sentence.id} className="p-4 flex justify-between items-start">
                    <p className="flex-1 text-gray-800">{sentence.sentence_text}</p>
                    <button
                      onClick={() => deleteSentence(sentence.id)}
                      className="ml-4 text-red-500 hover:text-red-600"
                    >
                      删除
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: 添加 API 方法**

```ts
// frontend/src/lib/api.ts
export const articleAPI = {
  // ...existing
  getUserSentences: () => api.get<SavedSentence[]>('/sentences'),
  deleteSentence: (id: number) => api.delete(`/sentences/${id}`),
};
```

- [ ] **Step 3: 测试运行**

```bash
cd frontend && npm run lint
```

- [ ] **Step 4: 提交**

```bash
git add frontend/src/app/sentences/page.tsx frontend/src/lib/api.ts
git commit -m "feat(sentences): 添加句子收藏夹页面"
```

---

### Task 8: 前端 - 难度推荐筛选器

**Files:**
- Modify: `frontend/src/app/latest/page.tsx` 或 `frontend/src/app/categories/page.tsx`

- [ ] **Step 1: 在文章列表页添加难度筛选器**

```tsx
// 在现有文章列表页面添加
const [cefrFilter, setCefrFilter] = useState<string | null>(null);

const { articles, loading } = useArticles({
  cefr: cefrFilter,
  // ...existing params
});

return (
  <div>
    {/* 筛选器 */}
    <div className="flex gap-2 mb-4">
      {['A1', 'A2', 'B1', 'B2', 'C1', 'C2'].map(level => (
        <button
          key={level}
          onClick={() => setCefrFilter(level === cefrFilter ? null : level)}
          className={`px-3 py-1 rounded-full text-sm ${
            cefrFilter === level 
              ? 'bg-blue-500 text-white' 
              : 'bg-gray-100 dark:bg-gray-800'
          }`}
        >
          {level}
        </button>
      ))}
    </div>
    
    {/* 文章列表 */}
    <ArticleList articles={articles} loading={loading} />
  </div>
);
```

- [ ] **Step 2: 添加推荐按钮**

```tsx
<button
  onClick={() => setCefrFilter(recommendedCEFR)}
  className="px-4 py-2 bg-green-500 text-white rounded-lg"
>
  根据我的水平推荐
</button>
```

- [ ] **Step 3: 测试运行**

```bash
cd frontend && npm run lint
```

- [ ] **Step 4: 提交**

```bash
git add frontend/src/app/latest/page.tsx
git commit -m "feat(articles): 添加CEFR难度筛选器"
```

---

### Task 9: 前端 - 考试模式组件

**Files:**
- Create: `frontend/src/components/ExamReadingPanel.tsx`

- [ ] **Step 1: 创建 ExamReadingPanel 组件**

```tsx
// frontend/src/components/ExamReadingPanel.tsx
'use client';

import { useState, useEffect } from 'react';
import { articleAPI } from '@/lib/api';
import { Article, ArticleQuiz } from '@/types';

interface Props {
  article: Article;
}

export default function ExamReadingPanel({ article }: Props) {
  const [phase, setPhase] = useState<'reading' | 'quiz'>('reading');
  const [timeLeft, setTimeLeft] = useState(article.reading_time * 60); // 秒
  const [quiz, setQuiz] = useState<ArticleQuiz | null>(null);
  const [currentQ, setCurrentQ] = useState(0);
  const [answers, setAnswers] = useState<number[]>([]);
  const [score, setScore] = useState<number | null>(null);
  
  // 计时器
  useEffect(() => {
    if (phase !== 'reading' || timeLeft <= 0) return;
    const timer = setInterval(() => {
      setTimeLeft(t => t - 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [phase, timeLeft]);
  
  // 时间到自动进入测验
  useEffect(() => {
    if (timeLeft === 0 && phase === 'reading') {
      startQuiz();
    }
  }, [timeLeft, phase]);
  
  const startQuiz = async () => {
    const quizData = await articleAPI.getQuiz(article.slug);
    setQuiz(quizData);
    setPhase('quiz');
  };
  
  const handleAnswer = (answerIdx: number) => {
    const newAnswers = [...answers, answerIdx];
    setAnswers(newAnswers);
    
    if (currentQ < (quiz?.questions.length || 0) - 1) {
      setCurrentQ(c => c + 1);
    } else {
      // 计算分数
      let correct = 0;
      quiz?.questions.forEach((q, i) => {
        if (q.correct_index === newAnswers[i]) correct++;
      });
      setScore(Math.round((correct / (quiz?.questions.length || 1)) * 100));
    }
  };
  
  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };
  
  if (phase === 'reading') {
    return (
      <div className="flex flex-col items-center justify-center h-full space-y-4">
        <div className="text-4xl font-mono">{formatTime(timeLeft)}</div>
        <p className="text-gray-500">阅读文章，时间结束自动进入测验</p>
        <button
          onClick={startQuiz}
          className="px-6 py-2 bg-blue-500 text-white rounded-lg"
        >
          提前开始测验
        </button>
        {/* 简化版文章内容展示 */}
        <div className="max-w-2xl mt-8 p-6 bg-gray-50 rounded-lg max-h-[60vh] overflow-y-auto">
          <h2 className="text-xl font-bold mb-4">{article.title}</h2>
          <div className="prose">{article.content}</div>
        </div>
      </div>
    );
  }
  
  if (score !== null) {
    return (
      <div className="flex flex-col items-center justify-center h-full space-y-4">
        <div className="text-6xl font-bold text-green-500">{score}%</div>
        <p className="text-gray-500">
          {score >= 80 ? '优秀！' : score >= 60 ? '良好' : '继续加油'}
        </p>
        <button
          onClick={() => window.location.reload()}
          className="px-6 py-2 bg-blue-500 text-white rounded-lg"
        >
          重新开始
        </button>
      </div>
    );
  }
  
  const question = quiz?.questions[currentQ];
  
  return (
    <div className="max-w-2xl mx-auto p-6">
      <div className="mb-4 flex justify-between items-center">
        <span>题目 {currentQ + 1} / {quiz?.questions.length}</span>
        <span className="text-sm text-gray-500">
          {question?.question_type === 'true_false' ? '判断题' :
           question?.question_type === 'main_idea' ? '主旨题' :
           question?.question_type === 'word_meaning' ? '词义题' : '选择题'}
        </span>
      </div>
      
      <div className="mb-6">
        <p className="text-lg font-medium">{question?.prompt}</p>
      </div>
      
      <div className="space-y-3">
        {question?.options?.map((option, i) => (
          <button
            key={i}
            onClick={() => handleAnswer(i)}
            className="w-full p-4 text-left border rounded-lg hover:bg-gray-50"
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 测试运行**

```bash
cd frontend && npm run lint
```

- [ ] **Step 3: 提交**

```bash
git add frontend/src/components/ExamReadingPanel.tsx
git commit -m "feat(reading): 添加考试模式组件"
```

---

### Task 10: 前端 - 跟读模式组件

**Files:**
- Create: `frontend/src/components/EchoReadingPanel.tsx`

- [ ] **Step 1: 创建 EchoReadingPanel 组件**

```tsx
// frontend/src/components/EchoReadingPanel.tsx
'use client';

import { useState, useRef, useEffect } from 'react';
import { ttsAPI } from '@/lib/api';
import { Article } from '@/types';
import { Play, Pause, Volume2, Mic, Square } from 'lucide-react';

interface Props {
  article: Article;
}

export default function EchoReadingPanel({ article }: Props) {
  const [sentences, setSentences] = useState<string[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  
  useEffect(() => {
    // 分割句子
    const sents = article.content.split(/[.!?]+/).filter(Boolean);
    setSentences(sents);
  }, [article]);
  
  const playSentence = async (text: string) => {
    setIsPlaying(true);
    try {
      // 使用 TTS API 播放
      const audioUrl = await ttsAPI.synthesize(text, 'en-US');
      const audio = new Audio(audioUrl);
      audio.onended = () => setIsPlaying(false);
      await audio.play();
    } catch (error) {
      console.error('TTS failed:', error);
      setIsPlaying(false);
    }
  };
  
  const playCurrent = () => {
    if (sentences[currentIdx]) {
      playSentence(sentences[currentIdx]);
    }
  };
  
  const nextSentence = () => {
    if (currentIdx < sentences.length - 1) {
      setCurrentIdx(i => i + 1);
    }
  };
  
  const prevSentence = () => {
    if (currentIdx > 0) {
      setCurrentIdx(i => i - 1);
    }
  };
  
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream);
      audioChunksRef.current = [];
      
      mediaRecorderRef.current.ondataavailable = (e) => {
        audioChunksRef.current.push(e.data);
      };
      
      mediaRecorderRef.current.start();
      setIsRecording(true);
    } catch (error) {
      console.error('Failed to start recording:', error);
    }
  };
  
  const stopRecording = () => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      // 可以保存录音或播放回听
    }
  };
  
  return (
    <div className="flex flex-col items-center max-w-3xl mx-auto p-6">
      {/* 进度指示 */}
      <div className="w-full mb-4">
        <div className="h-2 bg-gray-200 rounded-full">
          <div 
            className="h-full bg-blue-500 rounded-full transition-all"
            style={{ width: `${((currentIdx + 1) / sentences.length) * 100}%` }}
          />
        </div>
        <p className="text-sm text-gray-500 mt-1">
          {currentIdx + 1} / {sentences.length}
        </p>
      </div>
      
      {/* 当前句子 */}
      <div className="w-full p-6 bg-gray-50 dark:bg-gray-800 rounded-lg mb-6">
        <p className="text-xl leading-relaxed text-center">
          {sentences[currentIdx]?.trim()}
        </p>
      </div>
      
      {/* 控制按钮 */}
      <div className="flex gap-4 mb-6">
        <button
          onClick={prevSentence}
          disabled={currentIdx === 0}
          className="px-4 py-2 border rounded-lg disabled:opacity-50"
        >
          上一句
        </button>
        
        <button
          onClick={playCurrent}
          disabled={isPlaying}
          className="px-6 py-2 bg-blue-500 text-white rounded-lg flex items-center gap-2"
        >
          <Volume2 size={20} />
          播放
        </button>
        
        <button
          onClick={nextSentence}
          disabled={currentIdx === sentences.length - 1}
          className="px-4 py-2 border rounded-lg disabled:opacity-50"
        >
          下一句
        </button>
      </div>
      
      {/* 录音控制 */}
      <div className="flex gap-4">
        {isRecording ? (
          <button
            onClick={stopRecording}
            className="px-6 py-2 bg-red-500 text-white rounded-lg flex items-center gap-2"
          >
            <Square size={20} />
            停止录音
          </button>
        ) : (
          <button
            onClick={startRecording}
            className="px-6 py-2 bg-green-500 text-white rounded-lg flex items-center gap-2"
          >
            <Mic size={20} />
            跟读录音
          </button>
        )}
      </div>
      
      <p className="text-sm text-gray-400 mt-4">
        点击"播放"听原声，点击"跟读录音"录下你的发音
      </p>
    </div>
  );
}
```

- [ ] **Step 2: 测试运行**

```bash
cd frontend && npm run lint
```

- [ ] **Step 3: 提交**

```bash
git add frontend/src/components/EchoReadingPanel.tsx
git commit -m "feat(reading): 添加跟读模式组件"
```

---

## 验证检查清单

完成所有任务后，运行以下验证：

- [ ] 后端测试通过: `cd backend && go test ./...`
- [ ] 前端 Lint 通过: `cd frontend && npm run lint`
- [ ] 前端 Build 通过: `cd frontend && npm run build`
- [ ] 所有新 API 端点可访问
- [ ] 所有新 UI 组件可正常渲染

---

## 注意事项

1. **Task 依赖关系**：Task 4 (Tab UI) 必须在 Task 5, 9, 10 之前完成，因为它们依赖 Tab 结构
2. **现有 Quiz 组件**：现有文章页已有 Quiz 展示逻辑，Task 6 是扩展不是重建
3. **TTS API**：需要确认 `ttsAPI.synthesize` 接口存在，如不存在需先扩展
4. **Sentence Analysis API**：需要确认后端有句子分析能力，复用现有 AI 服务