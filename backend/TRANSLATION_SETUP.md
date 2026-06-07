# 翻译服务配置指南

本项目集成了**百度翻译**和**有道翻译**两个翻译服务，支持自动切换（主服务失败时自动使用备用服务）。

## 服务特性

- ✅ 支持百度翻译和有道翻译
- ✅ 自动服务切换（主服务失败时使用备用）
- ✅ 翻译结果缓存（Redis + 数据库）
- ✅ 减少API调用成本

## 1. 百度翻译 API 配置

### 注册账号
访问：https://fanyi-api.baidu.com/

### 获取密钥
1. 注册并登录百度翻译开放平台
2. 进入"管理控制台"
3. 创建应用，获取 **APP ID** 和 **密钥**
4. 免费版额度：**每月 100 万字符**

### 配置到项目
编辑 `backend/.env` 文件：

```env
BAIDU_TRANSLATE_APPID=your_baidu_app_id
BAIDU_TRANSLATE_SECRET=your_baidu_secret_key
```

## 2. 有道翻译 API 配置

### 注册账号
访问：https://ai.youdao.com/

### 获取密钥
1. 注册并登录有道智云
2. 进入"应用管理" → "我的应用"
3. 创建应用（自然语言翻译），获取 **应用ID** 和 **应用密钥**
4. 免费版额度：**每月 100 万字符**

### 配置到项目
编辑 `backend/.env` 文件：

```env
YOUDAO_TRANSLATE_APPKEY=your_youdao_app_key
YOUDAO_TRANSLATE_APPSECRET=your_youdao_app_secret
```

## 3. 完整配置示例

```env
# Database
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=postgres
DB_NAME=gugudu

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# JWT
JWT_SECRET=your-secret-key-change-in-production

# Server
PORT=8080
GIN_MODE=debug

# CORS
ALLOWED_ORIGINS=http://localhost:3000

# 百度翻译 API
BAIDU_TRANSLATE_APPID=20241234567890
BAIDU_TRANSLATE_SECRET=abcdef123456789

# 有道翻译 API
YOUDAO_TRANSLATE_APPKEY=fedcba987654321
YOUDAO_TRANSLATE_APPSECRET=123456789abcdef
```

## 4. 服务切换策略

系统会按照以下顺序尝试翻译服务：

1. **优先使用第一个配置的服务**（百度或有道）
2. 如果失败，**自动切换到备用服务**
3. 成功的服务会被设为下次优先使用

你可以只配置一个服务，或同时配置两个作为互相备份。

## 5. 支持的语言

- **中文**: `zh` (百度) / `zh-CHS` (有道)
- **英文**: `en`
- **自动检测**: `auto`

系统会自动处理不同API的语言代码差异。

## 6. API 调用限制

### 百度翻译
- 免费版：100万字符/月
- QPS限制：10次/秒
- 文档：https://fanyi-api.baidu.com/doc/21

### 有道翻译
- 免费版：100万字符/月
- 并发限制：10个/秒
- 文档：https://ai.youdao.com/DOCSIRMA/html/trans/api/wbfy/index.html

## 7. 测试翻译功能

启动后端服务后，使用以下 API 测试：

```bash
# 翻译请求
curl -X POST http://localhost:8080/api/translate \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Hello World",
    "target_lang": "zh"
  }'

# 响应示例
{
  "source_text": "Hello World",
  "translation": "你好世界",
  "target_lang": "zh",
  "provider": "baidu",  # 或 "youdao"
  "cached": false
}
```

## 8. 缓存机制

为减少API调用，系统实现了两级缓存：

1. **Redis 缓存**：有效期 24 小时，快速访问
2. **数据库缓存**：永久保存，Redis 未命中时使用

相同的翻译请求只会调用一次真实API。

## 9. 错误处理

如果两个服务都未配置或都失败，将返回：

```json
{
  "error": "翻译服务未配置"
}
```

建议至少配置一个翻译服务。

## 10. 成本优化建议

- 启用缓存（已默认启用）
- 对常用词汇预加载翻译
- 监控每月API使用量
- 考虑付费版获取更高配额

---

配置完成后重启后端服务即可使用翻译功能！
