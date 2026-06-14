# Neo4j 引入方案：词汇语义网络与学习知识图谱

本文档说明在 GuGuDu 中引入 Neo4j 图数据库的定位、数据模型、同步策略、接口设计、前端改造和分阶段落地步骤。

后端改动必须遵守 [Gin 后端开发规范](../development/gin-backend.md)，前端改动必须遵守 [Next.js 前端开发规范](../development/nextjs-frontend.md)。本文是方案文档，落地前需按第 12 节的清单逐步实现，每一步都要跑通 `go build ./...` / `npm run build` 才进入下一步。

---

## 1. 背景与架构定位

### 1.1 为什么要引入

GuGuDu 已有一套"知识图谱"功能（`models.KnowledgeNode` / `KnowledgeEdge` / `UserKnowledgeState` + `services/knowledge_graph.go` + 前端 `/knowledge-graph` 页面），但它存在两个结构性限制：

1. **存储层是关系库模拟图**：节点和边存在 PostgreSQL 表里，跨实体多跳查询只能靠递归 CTE 或多次 JOIN。
2. **大多数图谱是"请求时拼装"的**：例如 `handlers/article.go` 的 `buildArticleKnowledgeGraph` 每次请求都从文章内容、词汇、语法点临时组合成 JSON，并不落库成持久化的图；前端的 force simulation 吃的就是这种一次性 JSON。

结果：**当前的"图谱"本质是关系数据的可视化包装，不是真正的图查询。**

英语学习中最有价值的几张网——词与词的语义关系（同义/反义/词根/派生/搭配）、语法点之间的前置依赖、用户掌握度与内容的关联——都是**稠密的多跳图**，正是 Neo4j 的强项。在 PostgreSQL 里做这些查询要么递归 CTE，要么把关系塞进 JSON 字段（项目里 `Tags` / `Keywords` 已经塞成逗号字符串，这条路不可持续）。

### 1.2 Neo4j 在架构中的角色

**Neo4j 作为只读投影库（derived projection），PostgreSQL 仍是唯一写入源（source of truth）。**

```
                 写入                            读取
用户/管理员 ──► Gin handlers ──► PostgreSQL ◄─── 大部分业务查询
                      │             │
                      │(异步双写)    │(ETL/CDC)
                      ▼             ▼
                   Neo4j ◄──── 图查询（语义网络、多跳推荐、学习路径）
```

关键原则：

- **不迁移现有表**：`Vocabulary` / `WordBook` / `Article` / `KnowledgeNode` 等仍以 PostgreSQL 为准。Neo4j 里只存"派生出来的图数据"。
- **可降级**：Neo4j 不可用时，相关功能要能优雅退回（要么用 PostgreSQL 的简化版本，要么返回空结果 + 友好提示），不能让整个服务挂掉。
- **按需开启**：和 `[ai].enabled` / `[tts].enabled` 一样，用 `[neo4j].enabled` 开关控制，本地开发可以不跑 Neo4j。

---

## 2. 产品目标（分阶段）

### 2.1 P0：词汇语义网络（MVP，本文重点）

在用户学习单词时，展示这个词的**语义关系网络**，支持联想记忆：

- 同义词（SYNONYM）
- 反义词（ANTONYM）
- 词根/词缀（HAS_ROOT / HAS_AFFIX）
- 派生词（DERIVED_FROM）
- 常见搭配（COLLOCATES_WITH）
- 易混淆词（CONFUSED_WITH）

**典型场景**：用户在生词本里点开 `predict`，界面右侧展示一个以 `predict` 为中心的小图，把 `prediction / predictable / unpredictable / forecast / foretell` 以及词根 `dict-`（说）连起来，点击任一节点可跳转或加入生词本。

**为什么 P0**：直接提升学习效果（联想记忆是间隔重复之外最有效的手段之一）、纯新增功能不动现有表、风险最低、能验证整个 Neo4j 接入链路。

### 2.2 P1：语法/技能依赖图与学习路径

把 `KnowledgeNode`（type=grammar/topic）建模为依赖图，回答：

- "为了掌握『虚拟语气』，我还差哪些前置语法点？"（前置依赖的拓扑排序）
- "下一步该学什么？"（依赖已满足、且在我水平范围内的语法点）

用 Cypher 的多跳遍历天然表达。

### 2.3 P2：跨实体多跳推荐

把"用户—掌握状态—知识点—文章"连成一张图，支撑：

- 覆盖我薄弱语法点、生词密度合适、我还没读过的文章
- 和我水平/目标相近的用户在读什么（协同推荐）

这部分会增强现有 `/knowledge-graph/overview` 的推荐能力。

### 2.4 非目标（本期不做）

- 不把现有 `KnowledgeNode/Edge/State` 三张表整体迁移到 Neo4j（负收益，重写成本高）。
- 不用 Neo4j 替代 `buildArticleKnowledgeGraph` 那种"单文章、请求时拼装"的场景（关系库 + 前端仿真已经够好）。
- 不把翻译缓存、查词缓存、订单/会员等业务数据放进 Neo4j。
- 不在 P0 就上 CDC（Debezium 等异步同步基础设施），先用应用层双写 + 管理命令，规模上来再说。

---

## 3. 当前基础与缺口

### 3.1 现有能力

- 词汇模型已就绪：`models.Vocabulary`（用户生词本）、`models.WordBook` / `WordBookEntry`（系统词书）、`DictionaryCache`（查词缓存）。
- AI 服务已就绪：`services/ai_analysis.go`（OpenAI 兼容接口），`handlers.InitAIAnalysisService` 单例 + `IsConfigured()` 模式，`handlers/vocab_ai.go` 里有现成的 `simpleAIChat` 辅助函数。
- 配置加载统一走 TOML：`config/config.go` + `config.toml.example`，新增配置块只需加 struct 字段。
- 部署统一走 `docker-compose.yml`（postgres / redis / backend / frontend），加一个服务成本很低。
- 服务初始化模式固定：`handlers.InitXxxService(...)` + `handlers.GetXxxService()` 单例，`main.go` 集中调用。
- 前端 API helper 集中在 `frontend/src/lib/api.ts`（如 `knowledgeGraphAPI`），类型集中在 `frontend/src/types/index.ts`。

### 3.2 缺口

- 词汇之间**没有任何关系**：`Vocabulary` 和 `WordBookEntry` 都是扁平的，`WordBookEntry.Collocations` 只是 JSON 文本，无法查询"和这个词同义的还有哪些"。
- 没有图数据库、没有图查询能力、没有 Go 的 Neo4j driver。
- 没有语义关系数据的**来源**：需要决定是手工种子、词典 API、还是 AI 抽取（见第 9 节）。

---

## 4. 基础设施接入

### 4.1 docker-compose 新增服务

在 `docker-compose.yml` 的 `services:` 下新增：

```yaml
  neo4j:
    image: neo4j:5-community
    container_name: gugudu-neo4j
    environment:
      NEO4J_AUTH: neo4j/gugudu-dev-password   # 仅本地/开发，生产必须换强密码
      NEO4J_PLUGINS: '["apoc"]'               # APOC 用于批量导入/过程式操作
      NEO4J_dbms_memory_heap_max__size: 512m
    ports:
      - "7474:7474"   # 浏览器控制台 http://localhost:7474
      - "7687:7687"   # Bolt 协议（Go driver 连这个）
    volumes:
      - neo4j_data:/data
    healthcheck:
      test: ["CMD-SHELL", "wget -O /dev/null -q http://localhost:7474 || exit 1"]
      interval: 10s
      timeout: 5s
      retries: 10
```

并在文件末尾 `volumes:` 块新增：

```yaml
volumes:
  postgres_data:
  redis_data:
  backend_storage:
  neo4j_data:        # 新增
```

让 `backend` 服务 `depends_on` neo4j（健康检查通过后再启动），保证连接可用：

```yaml
  backend:
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
      neo4j:
        condition: service_healthy   # 新增；若 neo4j.enabled=false 则后端要能跳过
```

> **注意**：`depends_on` 是硬依赖。若希望"本地开发可以不跑 Neo4j"，则不要在 compose 里写死 depends_on，而是在 `main.go` 里按 `cfg.Neo4j.Enabled` 决定是否初始化（见 4.3）。Docker 环境保持开启，本地裸跑 Go 时保持关闭。

### 4.2 配置块

在 `config/config.go` 的 `Config` struct 新增字段：

```go
type Config struct {
    Database      DatabaseConfig      `toml:"database"`
    Redis         RedisConfig         `toml:"redis"`
    Neo4j         Neo4jConfig         `toml:"neo4j"`   // 新增
    JWT           JWTConfig           `toml:"jwt"`
    // ... 其余不变
}

// Neo4jConfig 词汇语义网络图数据库配置
type Neo4jConfig struct {
    Enabled          bool   `toml:"enabled"`
    URI              string `toml:"uri"`            // bolt://localhost:7687
    Username         string `toml:"username"`
    Password         string `toml:"password"`
    Database         string `toml:"database"`       // neo4j（社区版只有默认库，留空即可）
    MaxConnectionPool int   `toml:"max_connection_pool"`  // 默认 50
    ConnectionTimeoutSeconds int `toml:"connection_timeout_seconds"` // 默认 15
}
```

在 `config.toml.example` 新增对应块（放在 `[redis]` 之后，和其它基础设施配置在一起）：

```toml
[neo4j]
enabled = false
uri = "bolt://localhost:7687"
username = "neo4j"
password = "gugudu-dev-password"
database = "neo4j"
max_connection_pool = 50
connection_timeout_seconds = 15
```

默认 `enabled = false`，保证现有开发流程（`cp config.toml.example config.toml` 后直接跑）不会因为没装 Neo4j 而启动失败。这和 `[ai].enabled` / `[tts].enabled` 的约定一致。

### 4.3 Go driver 接入

新增依赖：

```bash
cd backend
go get github.com/neo4j/neo4j-go-driver/v5/neo4j
```

新建 `backend/services/neo4j_graph.go`，沿用项目里"构造 + 单例 + IsConfigured"的服务模式：

```go
package services

import (
    "fmt"
    "time"

    "github.com/neo4j/neo4j-go-driver/v5/neo4j"
    "context"
)

// GraphService 词汇语义网络图服务（只读投影）
type GraphService struct {
    driver  neo4j.DriverWithContext
    database string
}

// NewGraphService 构造图服务。enabled=false 时返回 nil。
func NewGraphService(uri, username, password, database string,
    poolSize, timeoutSec int) (*GraphService, error) {
    auth := neo4j.BasicAuth(username, password, "")
    config := []neo4j.ConfigOption{
        neo4j.MaxConnectionPoolSize(firstPositiveInt(poolSize, 50)),
    }
    driver, err := neo4j.NewDriverWithContext(uri, auth, config...)
    if err != nil {
        return nil, fmt.Errorf("创建 Neo4j driver 失败: %w", err)
    }

    // 连接可用性探活，避免配置错了启动后才发现
    ctx, cancel := context.WithTimeout(context.Background(),
        time.Duration(firstPositiveInt(timeoutSec, 15))*time.Second)
    defer cancel()
    if err := driver.VerifyConnectivity(ctx); err != nil {
        _ = driver.Close(ctx)
        return nil, fmt.Errorf("Neo4j 连接失败: %w", err)
    }

    return &GraphService{driver: driver, database: database}, nil
}

func (s *GraphService) IsConfigured() bool {
    return s != nil && s.driver != nil
}

func (s *GraphService) Close(ctx context.Context) error {
    if s == nil || s.driver == nil {
        return nil
    }
    return s.driver.Close(ctx)
}

// session 打开一个带默认库的会话（只读）
func (s *GraphService) readSession() neo4j.SessionWithContext {
    db := s.database
    if db == "" {
        db = neo4j.DefaultDatabase
    }
    return s.driver.NewSession(neo4j.SessionConfig{
        AccessMode: neo4j.AccessModeRead,
        DatabaseName: db,
    })
}

func firstPositiveInt(values ...int) int {
    for _, v := range values {
        if v > 0 {
            return v
        }
    }
    return 0
}
```

在 `handlers` 包加一个轻量的单例持有者（新建 `backend/handlers/graph_service.go`）：

```go
package handlers

import "gugudu-backend/services"

var graphService *services.GraphService

// InitGraphService 初始化词汇语义网络服务。enabled=false 时传入 nil。
func InitGraphService(svc *services.GraphService) {
    graphService = svc
}

func GetGraphService() *services.GraphService {
    return graphService
}
```

在 `main.go` 初始化段（紧跟 Redis 之后）：

```go
// 初始化 Neo4j（可选）
if cfg.Neo4j.Enabled {
    graphSvc, err := services.NewGraphService(
        cfg.Neo4j.URI, cfg.Neo4j.Username, cfg.Neo4j.Password, cfg.Neo4j.Database,
        cfg.Neo4j.MaxConnectionPool, cfg.Neo4j.ConnectionTimeoutSeconds,
    )
    if err != nil {
        log.Printf("⚠️  Neo4j 初始化失败，词汇语义网络功能将不可用: %v", err)
        // 不 Fatal，保证未启用 Neo4j 的环境能正常启动
    } else {
        handlers.InitGraphService(graphSvc)
        defer graphSvc.Close(context.Background())
    }
} else {
    log.Println("Neo4j 未启用（neo4j.enabled=false）")
}
```

`main.go` 顶部新增 import `"context"`。注意这里**不 log.Fatal**：Neo4j 是可选增强，挂了要降级而不是整个服务起不来。

---

## 5. P0 数据模型（Cypher schema）

### 5.1 节点标签与约束

P0 只建模"词"和"词根/词缀"两类实体。用 `Word` 表达英文单词/词组，用 `Morpheme` 表达词根词缀。

```cypher
// 唯一性约束（同时建索引），保证每个 lemma 只有一份
CREATE CONSTRAINT word_lemma IF NOT EXISTS
FOR (w:Word) REQUIRE w.lemma IS UNIQUE;

CREATE CONSTRAINT morpheme_id IF NOT EXISTS
FOR (m:Morpheme) REQUIRE m.form IS UNIQUE;

// 辅助索引（高频查询字段）
CREATE INDEX word_cefr IF NOT EXISTS FOR (w:Word) ON (w.cefr_level);
CREATE INDEX word_pos   IF NOT EXISTS FOR (w:Word) ON (w.pos);
```

节点属性：

| 标签 | 属性 | 说明 |
|------|------|------|
| `Word` | `lemma` (string, 唯一) | 规范化小写词形 |
| | `pos` (string) | 词性，如 noun/verb/adj |
| | `phonetic` (string) | 音标（可选） |
| | `cefr_level` (string) | A1–C2（可选，用于按难度过滤） |
| | `frequency` (int) | 词频排名（可选，用于排序） |
| | `translation_cn` (string) | 首选中文释义（冗余，便于一跳展示） |
| `Morpheme` | `form` (string, 唯一) | 词根/词缀形，如 `dict` / `pre-` |
| | `type` (string) | root / prefix / suffix |
| | `meaning_cn` (string) | 含义，如 dict- = "说" |

> **重要约定**：Neo4j 里的 `Word` 节点要和 PostgreSQL 的 `Vocabulary` / `WordBookEntry` 通过 `lemma` 对齐，**不**用主键 ID 对齐。原因：同一个词会出现在多个用户的生词本和多本词书里，但语义网络是**全平台共享**的，只有一份。掌握状态（用户私有）留在 PostgreSQL（见第 6 节），不进图。

### 5.2 关系类型

P0 的六种语义关系：

```cypher
// 词 → 词
(:Word)-[:SYNONYM {score: 0.9}]->(:Word)        // 同义，score 相似度 0–1
(:Word)-[:ANTONYM]->(:Word)                      // 反义
(:Word)-[:DERIVED_FROM]->(:Word)                 // 派生：predictable ← predict
(:Word)-[:COLLOCATES_WITH {freq: 120}]->(:Word)  // 搭配，freq 共现频次
(:Word)-[:CONFUSED_WITH]->(:Word)                // 易混淆：predict / predicate

// 词 → 词根词缀
(:Word)-[:HAS_ROOT]->(:Morpheme)                 // predict -[:HAS_ROOT]-> dict
(:Word)-[:HAS_PREFIX]->(:Morpheme)
(:Word)-[:HAS_SUFFIX]->(:Morpheme)

// 词根族反向查询：共享同一词根的词
// 不存冗余关系，靠 MATCH (a:Word)-[:HAS_ROOT]->(:Morpheme)<-[:HAS_ROOT]-(b:Word) 现算
```

关系是**有向的**，但语义关系（同义/反义）在查询时用 `-[r:SYNONYM]-`（无向）匹配更自然。Neo4j 的无向匹配会自动覆盖两个方向。

---

## 6. 数据写入与同步策略

### 6.1 策略选择：应用层双写 + 管理命令回填

P0 数据的**写入路径很少**：

- 词的语义关系主要是**全平台共享的离线数据**（词典/词根库/批量导入），不是用户实时产生的。
- 用户行为（加生词、复习、掌握度变化）**不写进图**，留 PostgreSQL。

因此采用最简单的两层同步：

| 写入场景 | 策略 |
|----------|------|
| 批量导入词根库/词典种子数据 | 一次性管理命令（`go run ./cmd/seedgraph` 或 admin 接口） |
| 单词的语义关系补全（AI 抽取） | 按需触发，结果写 Neo4j + 缓存，见第 9 节 |
| 用户的掌握度变化 | **不写图**，查询时实时 JOIN PostgreSQL |

**不引入 CDC / 消息队列**。原因：P0 的图数据更新频率低、写入点可控，CDC 是过度工程。等 P2（用户行为也进图、推荐实时刷新）再考虑。

### 6.2 为什么掌握度不进图

用户的 `Vocabulary.ReviewCount` / `ForgottenCount` / `NextReviewAt` 变化频繁、且属于用户私有状态。把每个用户对每个词的掌握度都建成 `(:User)-[:KNOWS]->(:Word)` 关系，会让图的边数随 `用户数 × 词数` 爆炸，且每次复习都要写图。更合理的做法是：

- **图**：只存全平台共享的、低频变更的词与词语义关系。
- **PostgreSQL**：存用户私有的、高频变更的掌握状态。
- **查询时**：先用图的 Cypher 拿到"和 X 同义/同根的词"，再用这些 lemma 去 PostgreSQL 里 JOIN 当前用户的掌握度，组装成响应。

这样图的规模 = 词数 × 平均关系数，和用户数解耦。

### 6.3 upsert 写法示例

管理命令/服务里写入词关系时统一用 `MERGE`（幂等）：

```cypher
// 写入一个词及其同义关系（参数化）
UNWIND $words AS w
MERGE (word:Word {lemma: toLower(w.lemma)})
  SET word.pos = w.pos,
      word.phonetic = w.phonetic,
      word.cefr_level = w.cefr_level,
      word.translation_cn = w.translation_cn;

// 写入同义关系（双向语义用有向单边 + 查询时无向匹配，避免存两份）
UNWIND $pairs AS p
MATCH (a:Word {lemma: toLower(p.from)})
MATCH (b:Word {lemma: toLower(p.to)})
MERGE (a)-[r:SYNONYM]->(b)
  SET r.score = p.score;
```

`MERGE` 保证重复执行幂等，管理命令可安全反复跑。

---

## 7. 后端接口设计

新增接口挂在 `protected`（需要登录）下，与现有 `knowledgeGraphAPI` 并列。命名前缀 `vocabulary-semantic` 避免和现有 `/vocabulary/:id/knowledge-graph`（那个是规则拼装的）冲突。

### 7.1 接口列表

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/vocabulary/:id/semantic-graph` | 单词的语义网络（P0 核心） |
| POST | `/api/vocabulary/:id/semantic-graph/refresh` | 强制重新抽取/刷新该词的语义关系（可选，Premium） |

响应统一遵守规范：`{ "data": ... }`，错误用 `{ "error": "..." }`。

### 7.2 单词语义图响应结构

和前端已有的 `KnowledgeGraph` 结构对齐，便于复用 `/knowledge-graph` 页面的渲染逻辑：

```go
// 语义网络子图响应（可复用 services/knowledge_graph.go 的 DTO 风格）
type SemanticGraphResponse struct {
    Focus  SemanticGraphNode   `json:"focus"`            // 中心词
    Nodes  []SemanticGraphNode `json:"nodes"`            // 包含中心词 + 邻居
    Edges  []SemanticGraphEdge `json:"edges"`
    Stats  SemanticGraphStats  `json:"stats"`
}

type SemanticGraphNode struct {
    ID          string `json:"id"`           // "word:predict"
    DBID        int64  `json:"db_id"`        // elementId 的数值化，前端调试用
    Type        string `json:"type"`         // "word" | "morpheme"
    Label       string `json:"label"`        // 词形
    Weight      int    `json:"weight"`       // 渲染权重，中心词=100
    Description string `json:"description"`  // 中文释义
    Mastery     *int   `json:"mastery,omitempty"` // 当前用户对该词的掌握度（仅 word 节点）
    Metadata    map[string]any `json:"metadata,omitempty"`
    // metadata 里带：phonetic / cefr_level / pos / in_vocab(是否在当前用户生词本) / vocab_id
}

type SemanticGraphEdge struct {
    ID       string `json:"id"`
    Source   string `json:"source"`
    Target   string `json:"target"`
    Relation string `json:"relation"`  // SYNONYM / ANTONYM / HAS_ROOT ...
    Label    string `json:"label"`     // "同义" / "反义" / "同根"（中文展示）
    Weight   int    `json:"weight"`
}

type SemanticGraphStats struct {
    TotalNodes int            `json:"total_nodes"`
    TotalEdges int            `json:"total_edges"`
    ByRelation map[string]int `json:"by_relation"` // {"SYNONYM":3, "HAS_ROOT":1, ...}
}
```

### 7.3 核心 Cypher 查询

中心词 + 一跳邻居（按关系类型限制数量，避免高频词拉出几百个节点）：

```cypher
// 参数：$lemma, $limitPerType
MATCH (focus:Word {lemma: $lemma})
OPTIONAL MATCH (focus)-[r:SYNONYM|ANTONYM|DERIVED_FROM|COLLOCATES_WITH|CONFUSED_WITH]-(other:Word)
WITH focus, r, other
  WHERE other IS NULL OR r.score >= 0.3   // 过滤弱同义
WITH focus,
     collect(DISTINCT [other, r]) AS wordPairs
// 同根的词（共享 Morpheme 的其它 Word）
OPTIONAL MATCH (focus)-[:HAS_ROOT|HAS_PREFIX|HAS_SUFFIX]->(m:Morpheme)<-[:HAS_ROOT|HAS_PREFIX|HAS_SUFFIX]-(kin:Word)
  WHERE kin <> focus
WITH focus, wordPairs, collect(DISTINCT kin)[..5] AS kinWords, collect(DISTINCT m) AS morphemes
RETURN focus, wordPairs, kinWords, morphemes;
```

> 实际实现里建议拆成 2 条查询（一次拿中心词 + 词关系，一次拿同根词），用 `LIMIT` 控制每类关系数量，避免单条大查询。Go 侧用 `neo4j.SessionWithContext.ExecuteRead` + `neo4j.Collect` 处理结果，把 element 映射成上面的 DTO。

### 7.4 掌握度 JOIN（PostgreSQL 侧）

Cypher 拿到一组 lemma 后，回 PostgreSQL 补当前用户状态（伪代码）：

```go
// lemmas 来自 Cypher 结果
var userWords []models.Vocabulary
db.Where("user_id = ? AND LOWER(word) IN ?", userID, lemmas).Find(&userWords)
// 组装成 map[lemma]Vocabulary，回填到节点的 Mastery / in_vocab / vocab_id
```

### 7.5 降级处理

`GetGraphService()` 返回 nil 时（`neo4j.enabled=false` 或连接失败），handler 返回：

```go
c.JSON(http.StatusOK, gin.H{
    "data": emptySemanticGraph(vocab.Word),
    "enabled": false,
})
```

前端据此显示"语义网络需要启用 Neo4j"的占位提示，而不是报错。**这是和现有 `ai.enabled=false` 时各 AI 接口返回 503 一致的处理思路，但要更友好**——图功能是只读展示，空结果比 503 体验更好。

---

## 8. 前端改造

### 8.1 类型（`frontend/src/types/index.ts`）

新增类型，和 `KnowledgeGraph` 并列：

```typescript
export interface SemanticGraphNode {
  id: string;
  db_id: number;
  type: 'word' | 'morpheme';
  label: string;
  description?: string;
  weight: number;
  mastery?: number;
  metadata?: {
    phonetic?: string;
    cefr_level?: string;
    pos?: string;
    in_vocab?: boolean;
    vocab_id?: number;
  };
}

export interface SemanticGraphEdge {
  id: string;
  source: string;
  target: string;
  relation: string;   // SYNONYM | ANTONYM | HAS_ROOT ...
  label: string;      // 同义 / 反义 / 同根
  weight: number;
}

export interface SemanticGraphStats {
  total_nodes: number;
  total_edges: number;
  by_relation: Record<string, number>;
}

export interface SemanticGraph {
  focus: SemanticGraphNode;
  nodes: SemanticGraphNode[];
  edges: SemanticGraphEdge[];
  stats: SemanticGraphStats;
  enabled?: boolean;   // 后端 Neo4j 未启用时为 false
}
```

### 8.2 API helper（`frontend/src/lib/api.ts`）

在现有 `knowledgeGraphAPI` 旁新增：

```typescript
export const semanticGraphAPI = {
  getWordGraph: (vocabulary_id: number) =>
    api.get(`/vocabulary/${vocabulary_id}/semantic-graph`),
  refreshWordGraph: (vocabulary_id: number) =>
    api.post(`/vocabulary/${vocabulary_id}/semantic-graph/refresh`),
};
```

### 8.3 展示位置

两种可选方案，建议**先做 A**（改动小、聚焦）：

- **方案 A（推荐 P0）**：在生词本单词详情页/抽屉里新增"语义网络"标签页。复用现有 force simulation 渲染逻辑（`app/knowledge-graph/page.tsx` 里 `initSimNodes` / `runForceStep` 可抽成共享 hook），节点颜色按关系类型分（同义蓝、反义红、同根紫）。
- 方案 B：在主知识图谱页面 `/knowledge-graph` 里把语义子图作为一类可展开的 group 融入。改动大，留给 P1。

**交互**：

- 点击任一 `word` 节点 → 若 `metadata.in_vocab`，跳到该词的详情；否则弹"加入生词本"。
- 点击 `morpheme` 节点 → 展开同根的其它词（懒加载）。
- `enabled === false` 时显示提示卡片："语义网络由 Neo4j 提供，当前未启用。"

### 8.4 复用现有渲染

`app/knowledge-graph/page.tsx` 已有完整的力导向仿真（`SimNode` / `SimEdge` / `runForceStep`）。落地时**抽出一个共享组件** `<WordNetwork nodes edges focus />` 到 `components/`，避免复制粘贴 80 行仿真代码。这一步符合 `nextjs-frontend.md` 里"UI 复用优先于复制"的约定。

---

## 9. 语义关系数据从哪来

这是 P0 最现实的问题：图数据库本身不产生关系，得有数据喂进去。三种来源，按 ROI 组合：

### 9.1 词根词缀库（一次性种子，覆盖率高）

词根数据相对结构化、开源资源多（如基于 ETAOIN 词根表、WordNet 的派生关系）。建议：

- 从 WordNet 提取 `DERIVED_FROM`（WordNet 的 derivations）和 `SYNONYM`（synset 同义集），用脚本导成 JSON，通过管理命令一次性导入。
- 词根词缀用开源词根词缀表（如 `dict-` `pre-` `-able`），手工整理成 CSV，导入为 `Morpheme` 节点 + `HAS_ROOT` 关系。

这一步覆盖大部分核心词汇的"同根"和"同义"关系，是 P0 数据的**地基**。

### 9.2 词典 API 增强（利用已有 Eliaschen/百度词典）

项目已接入 `services/dictionary.go`（Eliaschen / 百度词典）。这些词典返回里常带 `synonyms` / `antonyms` 字段。可以：

- 在 `LookupWord` 缓存到 `DictionaryCache` 时，顺带把同义/反义异步写进 Neo4j（仅在 `graphService.IsConfigured()` 时）。
- 这是**唯一一处真正的"应用层双写"**：词典数据本来就要缓存，多写一份到图里成本极低。

### 9.3 AI 抽取（按需补全，Premium）

词根库和词典覆盖不到的词（新词、专业词、搭配），用已有的 `AIAnalysisService` 抽取：

```
prompt: 给定单词 predict，返回 JSON：
  { synonyms: [...], antonyms: [...], root: "dict", derived: [...],
    collocations: [...], confused_with: [...] }
```

复用 `handlers/vocab_ai.go` 里 `simpleAIChat` + JSON 解析的成熟写法。结果：

- 写入 Neo4j（`MERGE` 幂等）。
- 缓存到 PostgreSQL（新增 `WordSemanticCache` 表，按 lemma 缓存，避免重复调 AI），见 9.4。

### 9.4 缓存表（避免重复抽 AI）

新增 GORM 模型（放 `models/models.go`，和 `DictionaryCache` / `TranslationCache` 风格一致）：

```go
// WordSemanticCache 语义网络抽取结果缓存（按 lemma 全局共享）
type WordSemanticCache struct {
    ID        uint      `gorm:"primarykey" json:"id"`
    CreatedAt time.Time `json:"created_at"`
    UpdatedAt time.Time `json:"updated_at"`

    Lemma    string `gorm:"size:100;not null;uniqueIndex" json:"lemma"`
    Payload  string `gorm:"type:text;not null" json:"payload"` // JSON: 抽取结果
    Provider string `gorm:"size:30;default:'ai'" json:"provider"` // ai / wordnet / dict
    InGraph  bool   `gorm:"default:false;index" json:"in_graph"`  // 是否已写入 Neo4j
}
```

查询语义图时：先查 Neo4j（有数据直接返回）→ 没有则查 `WordSemanticCache` → 还没有则触发 AI 抽取 → 写缓存 + 写图 → 返回。

---

## 10. 安全与运维注意

1. **密码不入库**：`config.toml` 已在 `.gitignore`（见 AGENTS.md）。`docker-compose.yml` 里的 `NEO4J_AUTH` 仅用于本地开发；生产环境用 secrets 或环境变量注入，不要写死强密码到 compose 文件。
2. **CORS 与端口暴露**：7474/7687 端口**只在本地开发映射**到宿主机。生产环境 Neo4j 不应对公网开放，backend 和 neo4j 在同一 docker network 内通信即可。
3. **查询防滥用**：单次语义图查询要 `LIMIT`（见 7.3），避免高频词拉出超大子图拖垮前端渲染和数据库。每类关系限制如 5–8 条。
4. **Premium 门控**：`refresh`（AI 抽取）接口建议走 `middleware.PremiumRequired(database.DB)`，和现有 `/articles/:id/assistant`、`/sentences/analyze` 一致，避免免费用户大量触发 AI 抽取产生成本。
5. **可观测性**：`graphService` 调用要记日志（成功/失败/耗时），和现有 service 调用日志风格一致。Neo4j 自身指标可通过其 `/db/metrics` 端点接 Prometheus（非 P0）。
6. **备份**：Neo4j 数据卷 `neo4j_data` 要纳入备份策略。由于 Neo4j 是派生投影（理论上可从种子 + 抽取重建），优先级低于 PostgreSQL，但要有重建脚本。

---

## 11. 风险与取舍

| 风险 | 影响 | 缓解 |
|------|------|------|
| 多一个数据库要运维 | 部署/备份/升级成本 | 默认 `enabled=false`，仅在需要时开启；P0 只读、低频写入，运维负担小 |
| 双库数据不一致 | 图里缺词/缺关系 | Neo4j 是只读投影，不一致只影响"图功能展示"，不影响核心业务；查询时以 PostgreSQL 为准回填 |
| Go 依赖新增（neo4j-driver） | 二进制体积、构建时间 | 该 driver 较轻量；若在意可做 build tag 隔离 |
| 语义数据质量差 | 推荐出无关词 | 关系带 `score`/`freq`，查询时过滤；AI 抽取结果落缓存表便于人工审核 |
| 图查询慢（子图过大） | 接口超时 | 每类关系 LIMIT；只查一跳；只读 session |
| 过度工程 | 投入产出失衡 | 严格守 P0 范围；掌握度不进图；不引入 CDC |

**最大的取舍**：要不要为了 P0 一个"语义网络"功能引入一整套图数据库？如果项目目前用户量小、词汇量小，P0 完全可以用 PostgreSQL 的 JSON 字段 + 应用层遍历先凑合。**引入 Neo4j 的真正回报在 P1/P2**——当你要做学习路径推理、跨实体推荐时，关系库会越来越痛苦，而图数据库的价值是指数级的。P0 是为了用最低风险把整条接入链路跑通，并为后续铺路。

---

## 12. 落地步骤（分阶段 checklist）

每一步完成后必须跑通对应验证命令再进入下一步。

### 阶段 1：基础设施（不碰业务代码）
- [ ] `docker-compose.yml` 加 neo4j 服务 + volume
- [ ] `docker compose up -d neo4j` 起来，浏览器访问 `localhost:7474` 能登录
- [ ] `config/config.go` 加 `Neo4jConfig` struct + 字段
- [ ] `config.toml.example` 加 `[neo4j]` 块（默认 `enabled = false`）
- [ ] 验证：`cd backend && go build ./...`

### 阶段 2：服务层接入
- [ ] `go get github.com/neo4j/neo4j-go-driver/v5/neo4j`
- [ ] 新建 `backend/services/neo4j_graph.go`（GraphService + IsConfigured + Close）
- [ ] 新建 `backend/handlers/graph_service.go`（Init/Get 单例）
- [ ] `main.go` 按 `cfg.Neo4j.Enabled` 初始化，不 Fatal
- [ ] 验证：`enabled=true` 能连上、`enabled=false` 能正常启动且 GetGraphService()=nil
- [ ] 验证：`cd backend && go build ./... && go test ./...`

### 阶段 3：数据模型与种子
- [ ] 新建 `backend/services/neo4j_schema.go`，封装建约束/索引的 Cypher
- [ ] 写一个管理命令（`backend/cmd/seedgraph/`）或 admin 接口，建约束 + 导入 WordNet 派生/同义种子
- [ ] 导入一小批词根词缀（CSV → Morpheme + HAS_ROOT）
- [ ] 手动在 Neo4j 浏览器跑第 7.3 节 Cypher，确认能查出 `predict` 的语义子图

### 阶段 4：后端接口
- [ ] `models/models.go` 加 `WordSemanticCache`
- [ ] `backend/services/neo4j_graph.go` 加查询方法 `GetWordSemanticGraph(ctx, lemma, userID) (*SemanticGraphResponse, error)`
- [ ] `backend/services/neo4j_graph.go` 加写入方法 `UpsertSemanticRelations(ctx, payload)`（MERGE 写法）
- [ ] `handlers/article.go` 或新建 `handlers/semantic_graph.go`：`GET /vocabulary/:id/semantic-graph`（含降级）
- [ ] 可选：`POST /vocabulary/:id/semantic-graph/refresh`（走 PremiumRequired）
- [ ] `main.go` 注册路由
- [ ] 验证：`cd backend && go build ./... && go test ./...`；手动 curl 验证返回结构

### 阶段 5：前端
- [ ] `frontend/src/types/index.ts` 加 SemanticGraph 相关类型
- [ ] `frontend/src/lib/api.ts` 加 `semanticGraphAPI`
- [ ] 抽共享组件 `components/WordNetwork.tsx`（从 `app/knowledge-graph/page.tsx` 复用仿真）
- [ ] 生词本详情页加"语义网络"标签页，调用 API 渲染
- [ ] 处理 `enabled===false` 占位态
- [ ] 验证：`cd frontend && npm run lint && npm run build`

### 阶段 6：文档与收尾
- [ ] 在 `docs/development/README.md` 加链接到本文档
- [ ] 更新 `AGENTS.md` 的架构说明（提及 Neo4j 作为可选图投影）
- [ ] 写一段"如何重建 Neo4j 数据"的运维说明（备份/恢复/种子重跑）
- [ ] 提交：`feat: 引入 Neo4j 词汇语义网络（P0）`

### 后续（P1/P2，本文不展开实现）
- P1：把 `KnowledgeNode`(grammar/topic) 镜像进图，建 `PREREQUISITE_OF`，做学习路径 Cypher 查询。
- P2：评估引入 CDC（Debezium）把用户掌握度事件流式写图，支撑实时跨实体推荐。

---

## 附：关键文件清单（预计改动）

**新增**：
- `backend/services/neo4j_graph.go` — GraphService 核心
- `backend/services/neo4j_schema.go` — Cypher schema 与查询封装
- `backend/handlers/graph_service.go` — 单例持有
- `backend/handlers/semantic_graph.go` — HTTP 接口
- `backend/cmd/seedgraph/main.go` — 种子导入命令
- `frontend/src/components/WordNetwork.tsx` — 共享图渲染组件

**修改**：
- `docker-compose.yml` — 加 neo4j 服务 + volume
- `backend/config/config.go` — 加 `Neo4jConfig`
- `backend/config.toml.example` — 加 `[neo4j]` 块
- `backend/main.go` — 初始化 + 路由注册
- `backend/models/models.go` — 加 `WordSemanticCache`
- `frontend/src/types/index.ts` — 加语义图类型
- `frontend/src/lib/api.ts` — 加 `semanticGraphAPI`
- 生词本详情页（接入 `WordNetwork` 组件）
- `docs/development/README.md`、`AGENTS.md` — 文档更新
