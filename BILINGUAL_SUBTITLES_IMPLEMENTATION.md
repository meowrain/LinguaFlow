# 双语字幕功能实现完成

## 实现概述

已按照 `docs/development/video-bilingual-subtitles.md` 的设计方案完成视频双语字幕功能的核心实现（Phase 1 + Phase 2）。

## 后端改动（Phase 1）

### 1. 服务层增强
**文件**: `backend/services/video_learning.go`

- 新增类型定义：
  - `VideoSubtitleTranslateRequest`: 翻译请求参数
  - `VideoSubtitleTranslateResult`: 翻译结果统计
  - `VideoSubtitleUpdateRequest`: 字幕编辑请求

- 新增方法：
  - `SetTranslationService()`: 注入翻译服务
  - `TranslateSubtitles()`: 批量翻译字幕，支持 `force` 参数
  - `UpdateSubtitle()`: 编辑单条字幕（原文/译文/时间轴）
  - `VTT()`: 扩展支持 `track` 参数（en/zh/bilingual）

- `SubtitlesToVTT()` 增强：支持三种轨道输出
  - `track=en`: 只输出英文
  - `track=zh`: 优先输出中文，无翻译时回退英文
  - `track=bilingual`: 同一 cue 输出两行（英文+中文）

### 2. 处理层新增接口
**文件**: `backend/handlers/video_learning.go`

新增 Handler：
- `TranslateVideoSubtitles()`: `POST /api/video-lessons/:id/subtitles/translate`
- `UpdateVideoSubtitle()`: `PATCH /api/video-lessons/:id/subtitles/:subtitle_id`

修改 Handler：
- `GetVideoSubtitlesVTT()`: 增加 `track` 查询参数支持

### 3. 翻译服务连接
**文件**: `backend/handlers/translation.go`

- 新增 `LinkTranslationToVideoLearning()` 函数
- 在服务初始化后将现有翻译服务注入到视频学习模块

### 4. 路由注册
**文件**: `backend/main.go`

```go
videoLessons.POST("/:id/subtitles/translate", handlers.TranslateVideoSubtitles)
videoLessons.PATCH("/:id/subtitles/:subtitle_id", handlers.UpdateVideoSubtitle)
handlers.LinkTranslationToVideoLearning()
```

## 前端改动（Phase 2）

### 1. 类型定义
**文件**: `frontend/src/types/index.ts`

```typescript
export type SubtitleDisplayMode = 'en' | 'zh' | 'bilingual' | 'off';

export interface VideoSubtitleTranslateResult {
  translated: number;
  skipped: number;
  failed: number;
}
```

### 2. API 客户端
**文件**: `frontend/src/lib/api.ts`

```typescript
videoLessonAPI: {
  getSubtitleVTTURL: (id, track = 'en') => ...,
  translateSubtitles: (id, { target_lang, source_lang, force }) => ...,
  updateSubtitle: (lessonId, subtitleId, data) => ...,
}
```

### 3. 视频学习页面
**文件**: `frontend/src/app/study/videos/[id]/page.tsx`

#### 新增状态
- `subtitleMode`: 字幕显示模式（'en' | 'zh' | 'bilingual' | 'off'）
- `translating`: 翻译加载状态

#### 新增功能
- `handleTranslateSubtitles()`: 调用批量翻译接口
- 字幕模式切换按钮组（英文/中文/双语/关闭）

#### UI 改进
1. **播放器字幕叠加层**：根据 `subtitleMode` 显示不同内容
   - `en`: 仅英文
   - `zh`: 仅中文（无翻译时显示英文）
   - `bilingual`: 英文（大字）+ 中文（小字）
   - `off`: 不显示

2. **当前字幕卡片**：同时展示英文和中文

3. **字幕列表**：每条字幕下方显示中文翻译

4. **操作按钮**：新增"生成双语字幕"按钮

## 编译验证

### 后端
```bash
cd backend
go build -o /tmp/gugudu-backend-test
# ✅ 编译成功
```

### 前端
```bash
cd frontend
npm run build
# ✅ 编译成功
# ✅ Lint 通过
```

## 核心特性

### ✅ 已实现
1. 批量翻译字幕（POST `/api/video-lessons/:id/subtitles/translate`）
2. 编辑单条字幕（PATCH `/api/video-lessons/:id/subtitles/:subtitle_id`）
3. WebVTT 多轨道输出（`?track=en|zh|bilingual`）
4. 播放器三种字幕模式切换
5. 字幕列表同时展示原文和译文
6. 翻译结果持久化到数据库
7. 复用现有翻译服务，无需新建 API client

### ⏳ 未实现（Phase 3）
- 字幕编辑 UI（需要弹窗或表单）
- `force=true` 重新翻译按钮
- 单条字幕翻译入口
- 移动端长字幕自动换行优化

## 使用流程

1. 用户上传英文视频
2. 系统自动生成英文字幕（ASR）
3. 用户点击"生成双语字幕"按钮
4. 后端批量调用翻译服务，填充 `VideoSubtitle.translation` 字段
5. 前端刷新字幕列表，显示中英文对照
6. 用户可在播放器控制栏切换字幕显示模式
7. 字幕数据保存到数据库，下次打开无需重新翻译

## API 设计

### 批量翻译字幕
```http
POST /api/video-lessons/:id/subtitles/translate
Content-Type: application/json

{
  "target_lang": "zh",
  "source_lang": "en",
  "force": false
}

Response:
{
  "data": {
    "translated": 42,
    "skipped": 8,
    "failed": 0
  }
}
```

### 编辑字幕
```http
PATCH /api/video-lessons/:id/subtitles/:subtitle_id
Content-Type: application/json

{
  "start_seconds": 12.34,
  "end_seconds": 15.67,
  "text": "This is the original subtitle.",
  "translation": "这是中文字幕。"
}
```

### WebVTT 输出
```http
GET /api/video-lessons/:id/subtitles.vtt?track=bilingual
```

## 数据模型

沿用现有 `VideoSubtitle` 模型，无需新建表：

```go
type VideoSubtitle struct {
    VideoLessonID uint
    SortOrder     int
    StartSeconds  float64
    EndSeconds    float64
    Text          string       // 英文原文
    Translation   string       // 中文翻译
    Confidence    float64
    Source        string       // auto/edited
}
```

## 权限和边界

- 所有接口都使用 `AuthRequired()` 中间件
- 所有查询都带 `user_id` 过滤，用户只能访问自己的视频
- 翻译服务未配置时返回友好错误
- 批量翻译单次最多 1000 条字幕，分批处理
- 失败的字幕不阻塞整体流程，返回统计结果

## 性能和成本

- 翻译结果持久化，避免重复调用 API
- 支持 `force=false` 跳过已有翻译
- 批量处理降低网络往返次数（每批 20 条）
- Redis + PostgreSQL 双层缓存（复用现有翻译缓存）

## 下一步（Phase 3）

1. 增加字幕编辑 UI（inline 编辑或弹窗表单）
2. 增加"重新翻译"按钮（`force=true`）
3. 为空翻译的字幕增加单条翻译入口
4. 移动端字幕换行和控件遮挡优化
5. 字幕时间轴可视化编辑（拖拽调整）
