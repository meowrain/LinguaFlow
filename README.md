# GuGuDu 英语学习平台

一个基于 Next.js + Golang 的英语学习资讯平台，通过阅读优质英文文章学习英语，支持划词翻译、生词本等功能。

## 项目特色

- 📚 **优质资讯** - 精选英文科技、文化资讯
- 🌐 **划词翻译** - 选中单词/段落即可翻译
- 📝 **生词本** - 保存学习的单词，支持复习
- 📊 **学习追踪** - 记录阅读历史和进度
- 🔖 **订阅系统** - 收藏感兴趣的文章
- 🎯 **难度分级** - 简单/中等/困难三个级别

## 技术栈

### 后端 (Golang)
- **框架**: Gin
- **数据库**: PostgreSQL + GORM
- **缓存**: Redis
- **认证**: JWT
- **密码加密**: bcrypt

### 前端 (Next.js)
- **框架**: Next.js 14 (App Router)
- **语言**: TypeScript
- **样式**: Tailwind CSS
- **状态管理**: Zustand
- **HTTP 客户端**: Axios
- **图标**: Lucide React
- **日期处理**: date-fns

## 项目结构

```
gugudu/
├── backend/                 # 后端服务
│   ├── main.go             # 主入口
│   ├── config/             # 配置管理
│   ├── database/           # 数据库连接
│   ├── models/             # 数据模型
│   ├── handlers/           # API 处理器
│   │   ├── auth.go        # 认证
│   │   ├── article.go     # 文章
│   │   ├── translation.go # 翻译
│   │   └── user.go        # 用户
│   └── middleware/         # 中间件
└── frontend/               # 前端应用
    ├── src/
    │   ├── app/           # Next.js 页面
    │   │   ├── page.tsx          # 首页
    │   │   ├── articles/[slug]/  # 文章详情
    │   │   ├── login/            # 登录
    │   │   ├── register/         # 注册
    │   │   └── vocabulary/       # 生词本
    │   ├── components/    # React 组件
    │   │   ├── Header.tsx
    │   │   ├── ArticleCard.tsx
    │   │   └── TranslationTooltip.tsx
    │   ├── lib/          # 工具库
    │   │   └── api.ts    # API 客户端
    │   ├── store/        # 状态管理
    │   │   └── authStore.ts
    │   └── types/        # TypeScript 类型
    └── public/           # 静态资源
```

## 快速开始

### 前置要求

- Go 1.22+
- Node.js 18+
- PostgreSQL 15+
- Redis 7+

### 后端设置

```bash
cd backend

# 安装依赖
go mod download

# 配置环境变量
cp .env.example .env
# 编辑 .env 文件

# 启动数据库（使用 Docker）
docker run -d --name postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=gugudu \
  -p 5432:5432 \
  postgres:15

docker run -d --name redis \
  -p 6379:6379 \
  redis:7

# 运行服务
go run main.go
```

后端服务将在 `http://localhost:8080` 启动。

### 前端设置

```bash
cd frontend

# 安装依赖
npm install

# 运行开发服务器
npm run dev
```

前端应用将在 `http://localhost:3000` 启动。

## 核心功能

### 1. 文章阅读

- 支持按分类、难度筛选
- 显示预估阅读时间
- 记录阅读进度
- 浏览量统计

### 2. 划词翻译

在文章页面选中任意单词或段落，会自动弹出翻译气泡：
- 显示中文翻译
- 支持发音（待接入 API）
- 一键添加到生词本
- 翻译结果缓存（Redis + 数据库）

### 3. 生词本

- 保存学习的单词
- 显示单词音标、释义、例句
- 记录添加时的上下文
- 支持标记"已掌握"
- 按学习状态筛选

### 4. 用户系统

- 邮箱注册/登录
- JWT token 认证
- 个人资料管理
- 学习统计（阅读时长、文章数、单词数）

### 5. 订阅系统

- 收藏感兴趣的文章
- 查看订阅列表
- 取消订阅

## API 文档

详见 `backend/README.md`

主要端点：

```
POST   /api/auth/register          # 注册
POST   /api/auth/login             # 登录
GET    /api/articles               # 文章列表
GET    /api/articles/:slug         # 文章详情
POST   /api/translate              # 翻译
GET    /api/vocabulary             # 生词本
POST   /api/vocabulary             # 添加单词
GET    /api/subscriptions          # 订阅列表
```

## 待完成功能

### 翻译服务集成

当前使用模拟翻译，建议接入：
- Google Translate API
- DeepL API
- 百度翻译 API
- 有道翻译 API

在 `backend/handlers/translation.go` 的 `mockTranslate` 函数中替换为真实 API 调用。

### 词典 API

在 `backend/handlers/translation.go` 的 `mockDictionary` 函数中接入：
- 有道词典 API
- 金山词霸 API
- Oxford Dictionary API

### 文本转语音

为单词发音功能接入 TTS 服务。

### 管理后台

添加文章发布和管理功能。

## 部署

### 使用 Docker

```bash
# 后端
cd backend
docker build -t gugudu-backend .
docker run -p 8080:8080 --env-file .env gugudu-backend

# 前端
cd frontend
docker build -t gugudu-frontend .
docker run -p 3000:3000 gugudu-frontend
```

### 使用 Docker Compose

创建 `docker-compose.yml`：

```yaml
version: '3.8'

services:
  postgres:
    image: postgres:15
    environment:
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: gugudu
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:7
    ports:
      - "6379:6379"

  backend:
    build: ./backend
    ports:
      - "8080:8080"
    depends_on:
      - postgres
      - redis
    environment:
      DB_HOST: postgres
      REDIS_HOST: redis

  frontend:
    build: ./frontend
    ports:
      - "3000:3000"
    depends_on:
      - backend
    environment:
      NEXT_PUBLIC_API_URL: http://backend:8080/api

volumes:
  postgres_data:
```

运行：

```bash
docker-compose up -d
```

## 开发建议

1. **真实翻译 API** - 替换模拟翻译为真实 API
2. **词典服务** - 接入专业词典 API 获取详细释义
3. **TTS 语音** - 添加单词发音功能
4. **内容抓取** - 定时抓取英文资讯网站内容
5. **推荐系统** - 根据用户阅读历史推荐文章
6. **移动端适配** - 优化移动端体验
7. **PWA 支持** - 支持离线阅读
8. **分享功能** - 文章分享到社交媒体

## 许可证

MIT

## 贡献

欢迎提交 Issue 和 Pull Request！
