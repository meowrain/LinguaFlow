---
feature: ai-study-plan
status: delivered
specs:
  - docs/compose/specs/2026-06-13-ai-study-plan-design.md
plans:
  - docs/compose/plans/2026-06-13-ai-study-plan.md
branch: feature/ai-study-plan
commits: f7875a4..13f0be1
---

# AI 学习规划 — 最终报告

## 实现了什么

在 `/study` 页面首屏增加了一个 AI 学习规划卡片，根据用户数据（待复习单词、最近阅读、词书积压、视频进度、考试目标）生成个性化的每日学习建议。后端按日缓存 AI 生成的计划，前端通过 SSE 流式接收并展示。

## 架构

### 数据模型

- `UserProfile` — 存储用户考试目标（TargetExam: 四级/考研/雅思等，TargetLevel/CurrentLevel: A1-C2）
- `StudyPlan` — 按 (UserID, PlanDate) 缓存 AI 生成的学习建议

### 后端 API

| 端点 | 方法 | 描述 |
|------|------|------|
| `/api/profile/study` | GET | 获取学习档案（考试目标） |
| `/api/profile/study` | PUT | 更新学习档案 |
| `/api/study/plan` | GET | 获取今日 AI 规划（有缓存返回 JSON，无缓存生成后返回） |
| `/api/study/plan` | POST | 重新生成今日规划（SSE 流式） |

### 前端

- `frontend/src/app/study/page.tsx` — AI 规划卡片组件，流式文字效果
- `frontend/src/lib/api.ts` — `studyAPI.getPlan/regeneratePlan`，`profileAPI.get/update`
- `frontend/src/types/index.ts` — `UserProfile`、`StudyPlanData` 类型

## 使用方式

1. 用户访问 `/study` 页面
2. 页面加载时调用 `GET /api/study/plan`
3. 若有当日缓存，直接显示 AI 建议（带「已缓存」标签）
4. 若无缓存，后端调用 AI 生成计划，流式返回并缓存
5. 用户可点击「重新规划」按钮重新生成（SSE 流式）
6. 若未设置考试目标，显示「设置考试目标」入口

## 验证

- Backend: `go test ./...` 通过
- Frontend: `npm run build` 通过（仅有预存 warnings）
- E2E: 手动测试完成（缓存生效、流式输出正常、路由无冲突）

## 旅程日志

- [pivot] 初始设计 `/api/profile`，但与已有 `/api/profile` 路由冲突，改用 `/api/profile/study`
- [lesson] SSE 流式响应不能用 `c.JSON()`，需要用 `event: error` 格式
- [lesson] 前端 `regeneratePlan` 需要用 fetch + async generator，不能用 axios
- [pivot] 最初 `GET /study/plan` 也返回 SSE，后改为 GET 始终返回 JSON，POST 才返回 SSE

## 源文件

| 文件 | 角色 | 备注 |
|------|------|------|
| `docs/compose/plans/2026-06-13-ai-study-plan.md` | 实现计划 | 完整 |
| `backend/models/models.go` | UserProfile, StudyPlan 模型 | §3 |
| `backend/handlers/study.go` | API handlers | §4, §5 |
| `backend/services/ai_analysis.go` | GenerateStudyPlanStream | §5 |
| `backend/main.go` | 路由注册 | §4 |
| `frontend/src/app/study/page.tsx` | AI 规划卡片 | §6 |
| `frontend/src/lib/api.ts` | API 客户端 | §3, §4 |