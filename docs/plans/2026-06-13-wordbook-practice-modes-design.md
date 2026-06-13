# Wordbook Practice Modes Design

Date: 2026-06-13
Worktree: `.worktrees/vocab-practice`

## Goal

词书练习不再只依赖翻卡片。新词和复习都应该支持更灵活的练习方式，同时保留现有每日任务、SRS 评分、学习进度恢复和 AI 助记能力。

第一版采用前后端一起改，但不新增练习记录表。后端负责生成题目与校验答案，前端负责统一渲染题型和模式切换。

## Current State

- 今日任务来自 `GET /api/wordbooks/:id/today`。
- 新词提交走 `POST /api/wordbooks/:id/learn`。
- 复习提交走 `POST /api/wordbooks/:id/review`。
- 前端 `frontend/src/app/wordbook/[slug]/learn/page.tsx` 已有部分复习题型逻辑：翻卡、英译中选择、中译英拼写。
- 新词阶段主要使用 `LearnCard`，题型选择只对复习阶段生效。
- 选择题干扰项目前在前端从今日任务里临时拼装，不够稳定，也难以扩展到更多题型。

## Recommended Approach

新增词书练习题 API，让后端基于词书条目、今日任务和同词书干扰项生成结构化题目。前端把新词与复习统一成练习队列，并用题型组件渲染。

不新增练习记录表。提交仍落到现有 `learn` / `review` 接口，SRS 逻辑继续使用 `applyWordBookReview`。提交 payload 可增加 `exercise_type`、`answer`、`is_correct` 等字段，第一版用于服务端校验和日志扩展，但不要求持久化每道题。

## Practice Types

第一版支持 5 种题型：

1. `flashcard`：翻卡自评，保留「认识 / 模糊 / 忘了」。
2. `en_to_zh_choice`：给英文单词，选择中文释义。
3. `zh_to_en_spelling`：给中文释义，拼写英文。
4. `audio_word_choice`：播放单词音频，选择英文单词。
5. `context_fill_blank`：例句挖空，输入或选择目标词。

题型生成时要考虑数据可用性：

- 没有 translation 时，不生成选择或拼写题。
- 没有 examples 时，不生成例句填空题。
- 音频题可依赖前端已有 `wordAudio`，后端只返回 `audio_text`。
- 干扰项不足时降级到 `flashcard` 或减少选项数量，但不能返回无效题。

## Practice Modes

第一版支持 6 种模式：

1. `mixed`：默认模式，新词和复习混合题型。
2. `new_only`：只学今日新词。
3. `review_only`：只做今日复习。
4. `spelling_focus`：优先中译英拼写，缺数据时降级。
5. `quick_choice`：优先选择题和听音辨词，适合快速刷。
6. `mistakes`：本次会话内错题重练，不依赖新表。

`mistakes` 第一版只保存在前端会话状态中。用户答错或评为 `forgot` 的词进入本轮错题队列，今日任务完成后可以继续重练。重练结果不重复增加每日完成数，避免刷进度。

## Backend Design

新增接口：

```text
GET /api/wordbooks/:id/exercises
```

Query 参数：

- `entry_ids`: 逗号分隔的词条 ID，来自今日任务。
- `phase`: `new` 或 `review`。
- `mode`: 当前练习模式。
- `types`: 可选，逗号分隔的题型白名单。

响应结构：

```json
{
  "data": {
    "items": [
      {
        "entry_id": 1,
        "progress_id": 10,
        "phase": "review",
        "type": "en_to_zh_choice",
        "word": "abandon",
        "prompt": "请选择正确的中文释义",
        "translation": "放弃；抛弃",
        "options": ["放弃；抛弃", "适应", "明显的", "维持"],
        "answer": "放弃；抛弃",
        "audio_text": "",
        "context": "",
        "placeholder": ""
      }
    ]
  }
}
```

后端职责：

- 校验用户已订阅该词书。
- 只允许为当前词书下的词条生成题目。
- 对 review 题补充 `progress_id`，防止前端错提交。
- 从同词书其他词条抽取干扰项，优先同单元、同难度，再扩展到全词书。
- 将题型选择逻辑下沉到可测试函数，handler 保持薄。
- 为答案规范化、拼写近似判断、干扰项生成补单元测试。

现有提交接口调整：

- `POST /api/wordbooks/:id/learn` 保持兼容，新增字段可选。
- `POST /api/wordbooks/:id/review` 保持兼容，新增字段可选。
- 服务端仍以 `rating` 更新 SRS。题目自动判分只负责映射默认 rating，前端可提交最终 rating。

## Frontend Design

`learn/page.tsx` 拆分为更清晰的练习编排：

- 页面负责加载今日任务、恢复进度、切换模式、提交结果。
- 新增 `PracticeModeSelector` 渲染模式切换。
- 新增 `PracticeExerciseRenderer` 根据 `type` 分发题型组件。
- 保留并复用 `LearnCard` 作为 `flashcard` 题型。
- 新增选择题、拼写题、听音辨词、例句填空组件。
- 新词和复习使用同一个题目队列，不再让题型只作用于复习阶段。

前端状态：

- `phase`: `new` / `review` / `mistakes` / `done`。
- `mode`: 6 种练习模式。
- `exerciseQueue`: 后端生成的题目列表。
- `mistakeQueue`: 本次会话错题列表。
- `currentIndex`、`submitting`、`answerState`。

模式切换时重新生成队列，但不重置已完成的服务端进度。若用户切到 `new_only` 或 `review_only`，只过滤当前未完成任务。

## Error Handling

- 今日任务加载失败：保留现有中文错误文案和返回入口。
- 题目生成失败：前端降级为 `flashcard` 队列，确保用户仍可完成学习。
- 干扰项不足：后端返回更少选项或降级题型。
- 提交失败：保留当前题，不前进，显示可读错误。
- 题型不支持：前端渲染通用翻卡，避免白屏。

## Testing

Backend:

- `go test ./...`
- 新增题型生成测试：干扰项数量、同词书限制、缺 translation / examples 降级。
- 新增答案工具测试：normalize、近似拼写、例句挖空。

Frontend:

- 当前项目无前端测试 runner，验证命令为：
  - `npm run lint`
  - `npm run build`
- 手动检查移动端和桌面：模式菜单、选择题结果、拼写输入、听音题按钮、例句填空、错题重练。

## Non-Goals

- 不新增练习历史表。
- 不做长期错题统计。
- 不改变词书订阅、每日计划、统计页的核心数据模型。
- 不改变现有 SRS 算法。
- 不引入新的前端测试框架。
