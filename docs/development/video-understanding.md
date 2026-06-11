# 视频理解功能实现文档

本文说明如何在 GuGuDu 视频学习模块中实现 AI 视频理解功能，帮助用户更好地学习英文视频内容。

相关设计见 [英文视频学习功能实现文档](./video-learning.md) 和 [视频双语字幕功能实现文档](./video-bilingual-subtitles.md)。后端改动必须遵守 [Gin 后端开发规范](./gin-backend.md)，前端改动必须遵守 [Next.js 前端开发规范](./nextjs-frontend.md)。

## 1. 产品目标

### MVP 功能
1. **视频摘要生成** - AI 根据字幕自动生成视频内容概要（中英文）
2. **关键点提取** - 提取视频中的重点内容，按时间轴展示
3. **AI 对话助手** - 用户可以向 AI 提问视频相关内容
4. **生词提取** - 自动识别视频中的重点词汇，支持一键加入生词本
5. **学习笔记** - 自动生成结构化学习笔记

### 非目标（后续扩展）
- 视频内容搜索（跨视频检索）
- 多视频对比学习
- 视频内容测验生成
- 语音语调分析

## 2. 当前基础

现有能力：
- `VideoLesson` 和 `VideoSubtitle` 模型已就绪
- 字幕已支持英文原文和中文翻译
- AI 服务已存在（`backend/services/ai_analysis.go`），可调用 OpenAI-compatible API
- 文章模块已有类似功能（精读笔记、AI 对话）

缺口：
- 没有视频理解结果的存储模型
- 没有视频理解相关接口
- 前端没有展示视频理解结果的 UI

## 3. 数据模型

### 3.1 视频理解结果表

```go
// VideoUnderstanding 视频理解结果
type VideoUnderstanding struct {
    ID        uint           `gorm:"primarykey" json:"id"`
    CreatedAt time.Time      `json:"created_at"`
    UpdatedAt time.Time      `json:"updated_at"`
    DeletedAt gorm.DeletedAt `gorm:"index" json:"-"`

    VideoLessonID uint   `gorm:"not null;uniqueIndex:idx_video_understanding_user;index" json:"video_lesson_id"`
    UserID        uint   `gorm:"not null;uniqueIndex:idx_video_understanding_user;index" json:"user_id"`
    
    // 核心内容
    SummaryEN      string `gorm:"type:text" json:"summary_en"`           // 英文摘要
    SummaryCN      string `gorm:"type:text" json:"summary_cn"`           // 中文摘要
    KeyPoints      string `gorm:"type:text" json:"key_points"`           // JSON: [{timestamp, title, content}]
    Vocabulary     string `gorm:"type:text" json:"vocabulary"`           // JSON: [{word, translation, context, timestamp}]
    Topics         string `gorm:"type:text" json:"topics"`               // JSON: [topic1, topic2, ...]
    StudyGuide     string `gorm:"type:text" json:"study_guide"`          // 学习指南（降低难度）
    
    // 元信息
    Provider       string     `gorm:"size:30;default:'openai'" json:"provider"`
    Model          string     `gorm:"size:100" json:"model"`
    GeneratedAt    time.Time  `json:"generated_at"`
    RefreshedAt    *time.Time `json:"refreshed_at"`
    TokensUsed     int        `gorm:"default:0" json:"tokens_used"`

    VideoLesson VideoLesson `gorm:"foreignKey:VideoLessonID" json:"video_lesson,omitempty"`
    User        User        `gorm:"foreignKey:UserID" json:"user,omitempty"`
}
```

### 3.2 视频对话历史表

```go
// VideoConversation 视频 AI 对话记录
type VideoConversation struct {
    ID        uint           `gorm:"primarykey" json:"id"`
    CreatedAt time.Time      `json:"created_at"`
    UpdatedAt time.Time      `json:"updated_at"`
    DeletedAt gorm.DeletedAt `gorm:"index" json:"-"`

    VideoLessonID uint   `gorm:"not null;index" json:"video_lesson_id"`
    UserID        uint   `gorm:"not null;index" json:"user_id"`
    Role          string `gorm:"size:20;not null" json:"role"`      // user, assistant
    Content       string `gorm:"type:text;not null" json:"content"`
    TokensUsed    int    `gorm:"default:0" json:"tokens_used"`

    VideoLesson VideoLesson `gorm:"foreignKey:VideoLessonID" json:"video_lesson,omitempty"`
    User        User        `gorm:"foreignKey:UserID" json:"user,omitempty"`
}
```

建议索引：
- `video_lesson_id + user_id` 唯一约束在 `VideoUnderstanding` 上
- `video_lesson_id + user_id + created_at` 联合索引在 `VideoConversation` 上

## 4. 后端接口

所有接口挂在 `/api/video-lessons` 路由组下，需要 `AuthRequired()` 中间件。

### 4.1 生成视频理解

```http
POST /api/video-lessons/:id/understanding
Content-Type: application/json

{
  "force": false,
  "include_vocabulary": true,
  "include_key_points": true
}
```

响应：
```json
{
  "data": {
    "id": 123,
    "video_lesson_id": 7,
    "user_id": 1,
    "summary_en": "This video explains...",
    "summary_cn": "这个视频讲解了...",
    "key_points": [
      {
        "timestamp": 12.5,
        "title": "Introduction to React Hooks",
        "content": "React Hooks allow you to use state..."
      }
    ],
    "vocabulary": [
      {
        "word": "component",
        "translation": "组件",
        "context": "React components are...",
        "timestamp": 45.2
      }
    ],
    "topics": ["React", "JavaScript", "Hooks"],
    "study_guide": "建议先学习基础 JavaScript...",
    "generated_at": "2026-06-11T12:00:00Z"
  }
}
```

行为：
- `force=false` 时，如果已有理解结果且未过期（7天内），直接返回缓存
- `force=true` 时，重新生成并覆盖现有结果
- 权限：只能生成自己的视频理解
- 状态检查：视频必须是 `status=ready` 且有字幕

### 4.2 获取视频理解

```http
GET /api/video-lessons/:id/understanding
```

响应：与生成接口相同，如果不存在返回 404。

### 4.3 视频 AI 对话

```http
POST /api/video-lessons/:id/chat
Content-Type: application/json

{
  "messages": [
    {"role": "user", "content": "What is the main topic of this video?"},
    {"role": "assistant", "content": "The main topic is..."},
    {"role": "user", "content": "Can you explain the first example?"}
  ]
}
```

响应：
```json
{
  "data": {
    "content": "The first example demonstrates...",
    "related_timestamps": [12.5, 34.2]
  }
}
```

行为：
- 系统 prompt 包含视频字幕、摘要、关键点上下文
- 对话历史保存到 `VideoConversation` 表
- 支持流式响应（可选）
- 权限：只能访问自己的视频

### 4.4 获取对话历史

```http
GET /api/video-lessons/:id/conversations?limit=50
```

响应：
```json
{
  "data": [
    {
      "id": 1,
      "role": "user",
      "content": "What is the main topic?",
      "created_at": "2026-06-11T12:00:00Z"
    },
    {
      "id": 2,
      "role": "assistant",
      "content": "The main topic is...",
      "created_at": "2026-06-11T12:00:01Z"
    }
  ]
}
```

### 4.5 清空对话历史

```http
DELETE /api/video-lessons/:id/conversations
```

## 5. AI 服务设计

### 5.1 复用现有 AI 服务

优先复用 `backend/services/ai_analysis.go`，不在视频模块里新建 AI client。

新增服务方法：
```go
type VideoUnderstandingService struct {
    db              *gorm.DB
    aiService       *AIAnalysisService
    translationSvc  *TranslationService
}

func (s *VideoUnderstandingService) GenerateUnderstanding(
    ctx context.Context, 
    lesson *VideoLesson, 
    subtitles []VideoSubtitle, 
    userID uint,
    options GenerateOptions,
) (*VideoUnderstanding, error)

func (s *VideoUnderstandingService) ChatWithVideo(
    ctx context.Context,
    lesson *VideoLesson,
    understanding *VideoUnderstanding,
    messages []ChatMessage,
    userID uint,
) (string, error)
```

### 5.2 生成流程

**步骤 1：构建字幕上下文**
```
将所有字幕拼接成带时间戳的文本：
[00:12] Hello, welcome to this video...
[00:15] Today we're going to talk about...
```

**步骤 2：调用 AI 生成理解**

System Prompt:
```
You are an English learning assistant. Analyze the following video transcript and provide:

1. **Summary (English)**: A concise summary of the video content (100-150 words)
2. **Summary (Chinese)**: 中文摘要（100-150字）
3. **Key Points**: 3-5 key points with timestamps, each containing:
   - timestamp (seconds)
   - title (short title)
   - content (1-2 sentences explaining the point)
4. **Vocabulary**: 10-15 important words for English learners, including:
   - word
   - translation (Chinese)
   - context (sentence from video)
   - timestamp
5. **Topics**: 3-5 main topics covered (array of strings)
6. **Study Guide**: Learning recommendations for students (in Chinese)

Video Transcript:
[00:12] Hello, welcome...
[00:15] Today we're...

Respond in JSON format only.
```

期望响应：
```json
{
  "summary_en": "This video explains...",
  "summary_cn": "这个视频讲解了...",
  "key_points": [...],
  "vocabulary": [...],
  "topics": [...],
  "study_guide": "..."
}
```

**步骤 3：解析并保存**
- 校验 JSON 格式
- 保存到 `VideoUnderstanding` 表
- 返回结果

### 5.3 对话流程

System Prompt:
```
You are an English learning assistant helping a student understand a video. 

Video Summary:
{summary_en}

Key Points:
{key_points}

Full Transcript:
{transcript}

Answer the student's questions about the video. 
- Provide clear, educational responses
- Reference specific timestamps when relevant
- Explain vocabulary and grammar if asked
- Respond in the same language as the user's question
```

User Message:
```
{user_question}
```

响应后保存到 `VideoConversation` 表。

### 5.4 成本和限流

- 单次视频理解消耗约 2000-5000 tokens（取决于视频长度）
- 对话每轮消耗约 500-1500 tokens
- 建议限制：
  - 每个视频最多生成理解 3 次/天（`force=true` 计数）
  - 每个视频对话最多 50 轮/天
  - 单个视频字幕不超过 20,000 tokens（约 40 分钟视频）
- Premium 用户无限制，Free 用户限制使用次数

## 6. 前端交互

### 6.1 视频理解展示

在视频详情页新增"视频理解"标签页，展示：

1. **摘要卡片**
   - 中英文摘要并列展示
   - 主题标签
   - 学习建议

2. **关键点时间轴**
   - 按时间轴排列
   - 点击跳转到对应时间
   - 可折叠展开详细内容

3. **重点词汇列表**
   - 词汇卡片（单词、翻译、例句）
   - 点击加入生词本
   - 点击跳转到字幕位置

4. **生成按钮**
   - 状态：未生成 / 生成中 / 已生成
   - loading 文案："AI 正在理解视频内容..."
   - 生成时间和 token 使用量

### 6.2 AI 对话界面

在视频理解标签页底部或侧边栏增加对话区域：

1. **对话历史**
   - 用户消息和 AI 回复
   - 支持流式显示
   - 时间戳标注

2. **输入框**
   - Placeholder: "询问视频相关问题..."
   - 支持 Shift+Enter 换行
   - Enter 发送

3. **快捷问题**（可选）
   - "这个视频的主要内容是什么？"
   - "视频中有哪些重点词汇？"
   - "这个视频适合什么水平的学习者？"

4. **相关跳转**
   - AI 回复中提到的时间戳可点击跳转

### 6.3 交互流程

```
用户打开视频 → 点击"生成视频理解" 
→ 显示 loading（约 10-20 秒）
→ 展示理解结果
→ 用户可以：
   - 查看摘要和关键点
   - 点击词汇加入生词本
   - 点击时间戳跳转播放
   - 向 AI 提问
```

## 7. 前端 API 和类型

`frontend/src/lib/api.ts` 增加：

```ts
videoLessonAPI: {
  generateUnderstanding: (
    id: number, 
    data?: { force?: boolean; include_vocabulary?: boolean; include_key_points?: boolean }
  ) => api.post(`/video-lessons/${id}/understanding`, data),
  
  getUnderstanding: (id: number) => 
    api.get(`/video-lessons/${id}/understanding`),
  
  chatWithVideo: (
    id: number, 
    messages: Array<{ role: 'user' | 'assistant'; content: string }>
  ) => api.post(`/video-lessons/${id}/chat`, { messages }),
  
  getConversations: (id: number, limit = 50) => 
    api.get(`/video-lessons/${id}/conversations`, { params: { limit } }),
  
  clearConversations: (id: number) => 
    api.delete(`/video-lessons/${id}/conversations`),
}
```

`frontend/src/types/index.ts` 新增：

```ts
export interface VideoKeyPoint {
  timestamp: number;
  title: string;
  content: string;
}

export interface VideoVocabulary {
  word: string;
  translation: string;
  context: string;
  timestamp: number;
}

export interface VideoUnderstanding {
  id: number;
  video_lesson_id: number;
  user_id: number;
  summary_en: string;
  summary_cn: string;
  key_points: VideoKeyPoint[];
  vocabulary: VideoVocabulary[];
  topics: string[];
  study_guide: string;
  provider: string;
  model: string;
  generated_at: string;
  refreshed_at?: string;
  tokens_used: number;
}

export interface VideoConversationMessage {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}
```

## 8. 推荐实现步骤

### Phase 1: 数据模型和基础接口

1. 在 `backend/models/models.go` 新增 `VideoUnderstanding` 和 `VideoConversation` 模型
2. 数据库自动迁移
3. 新增 `backend/services/video_understanding.go`
4. 实现 `GenerateUnderstanding()` 方法
5. 新增 Handler: `POST /api/video-lessons/:id/understanding`
6. 新增 Handler: `GET /api/video-lessons/:id/understanding`

验证：
```bash
cd backend
go test ./...
go build ./...
```

### Phase 2: 前端展示

1. 在视频详情页增加"视频理解"标签页
2. 实现摘要、关键点、词汇展示
3. 增加"生成视频理解"按钮
4. 时间戳跳转功能
5. 词汇加入生词本功能

验证：
```bash
cd frontend
npm run lint
npm run build
```

### Phase 3: AI 对话

1. 实现 `ChatWithVideo()` 方法
2. 新增 Handler: `POST /api/video-lessons/:id/chat`
3. 新增 Handler: `GET /api/video-lessons/:id/conversations`
4. 新增 Handler: `DELETE /api/video-lessons/:id/conversations`
5. 前端实现对话 UI
6. 支持流式响应（可选）

### Phase 4: 优化和限流

1. 增加生成次数限制
2. 增加对话次数限制
3. Token 使用量统计和展示
4. Premium 用户无限制
5. 缓存优化（7天有效期）

## 9. 测试建议

后端测试：
- 不能生成他人的视频理解
- `force=false` 返回缓存，`force=true` 重新生成
- 视频未 ready 或无字幕时返回友好错误
- AI 调用失败时不存储错误结果
- 对话历史按时间排序
- Token 使用量正确统计

前端验证：
- 生成按钮在不同状态下的文案和禁用状态
- 关键点时间戳跳转正确
- 词汇卡片点击加入生词本
- 对话历史滚动到底部
- 流式响应逐字显示
- 移动端响应式布局

## 10. MVP 验收标准

- 用户可以一键生成视频理解结果
- 展示中英文摘要、关键点、重点词汇
- 点击时间戳跳转到对应字幕位置
- 点击词汇可加入生词本
- 用户可以向 AI 提问视频相关内容
- 对话历史持久化保存
- 所有功能都有权限边界保护
- Premium 用户有更高的使用限制

## 11. 成本估算

假设单个视频 10 分钟，约 1500 词字幕：

| 功能 | 输入 Tokens | 输出 Tokens | 总计 | 成本（GPT-4o） |
|------|------------|------------|------|----------------|
| 生成理解 | ~2000 | ~800 | ~2800 | ~$0.014 |
| 单轮对话 | ~3000 | ~300 | ~3300 | ~$0.017 |

建议定价：
- Free 用户：每月 3 次视频理解，10 次对话
- Premium 用户：无限制

## 12. 扩展方向（v2）

1. **视频内容搜索** - 跨视频检索特定内容
2. **多视频对比** - 对比多个视频的内容
3. **自动生成测验** - 根据视频内容生成理解测试
4. **语音分析** - 分析发音、语调、停顿
5. **字幕纠错** - AI 检测和修正 ASR 字幕错误
6. **知识图谱** - 将视频知识点连接到全局知识图谱
