# Topic Hub 调试手册

## 环境准备

### 前置依赖

- Node.js 20 LTS
- pnpm 9+
- Docker（用于 MongoDB）

### 启动 MongoDB

```bash
docker compose up -d mongodb
```

### 安装依赖

```bash
pnpm install
```

---

## 启动开发服务器

```bash
# 热重载模式
pnpm --filter server dev

# 或进入 server 目录
cd packages/server && pnpm dev
```

服务器默认运行在 `http://localhost:3000`。

### 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `MONGODB_URI` | `mongodb://localhost:27017/topichub` | MongoDB 连接字符串 |
| `PORT` | `3000` | 服务端口 |
| `LOG_FORMAT` | `json` | 日志格式：`json`（结构化）或 `pretty`（可读） |
| `LOG_LEVEL` | `info` | 日志级别：`debug` / `info` / `warn` / `error` |
| `SKILLS_DIR` | `./skills` | Skill 自动发现目录 |
| `ENCRYPTION_KEY` | 开发默认值 | AES-256 加密密钥（生产环境必须设置） |
| `JWKS_CONFIGS` | 内置 Feishu/Slack | JWKS 端点配置（JSON） |
| `AI_ENABLED` | `false` | AI 总开关 |
| `AI_PROVIDER` | `ark` | AI 提供商（目前支持 `ark`） |
| `AI_API_URL` | `https://ark.cn-beijing.volces.com/api/v3` | AI API 地址（内部部署改为内网地址） |
| `AI_API_KEY` | — | AI API Bearer Token |
| `AI_MODEL` | `doubao-seed-2-0-pro-260215` | 模型标识符 |
| `AI_TIMEOUT_MS` | `10000` | 单次 AI 请求超时（毫秒） |
| `AI_RATE_LIMIT_GLOBAL` | `1000` | 平台级每小时请求上限 |

开发时推荐使用 pretty 日志：

```bash
LOG_FORMAT=pretty pnpm --filter server dev
```

---

## 断点调试（VSCode / Cursor）

### 方式一：NestJS Debug 模式

在 `.vscode/launch.json` 中添加：

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Debug Server",
      "type": "node",
      "request": "launch",
      "runtimeExecutable": "pnpm",
      "args": ["--filter", "server", "dev"],
      "cwd": "${workspaceFolder}",
      "env": {
        "MONGODB_URI": "mongodb://localhost:27017/topichub",
        "LOG_FORMAT": "pretty",
        "SKILLS_DIR": "./skills"
      },
      "console": "integratedTerminal",
      "sourceMaps": true
    }
  ]
}
```

按 `F5` 启动，在任意 `.ts` 文件中设断点即可。

### 方式二：Attach 到运行中的进程

```bash
# 先以 debug 模式启动
node --inspect -r ts-node/register packages/server/src/main.ts
```

然后在 VSCode 中用 "Attach to Node Process" 连接。

### 方式三：调试单个测试

```json
{
  "name": "Debug Test",
  "type": "node",
  "request": "launch",
  "runtimeExecutable": "pnpm",
  "args": ["--filter", "server", "test", "--", "--testPathPattern", "${fileBasenameNoExtension}", "--no-coverage"],
  "cwd": "${workspaceFolder}",
  "console": "integratedTerminal"
}
```

打开一个测试文件，按 `F5` 即可调试该测试。

---

## API 手动测试

### 健康检查

```bash
curl http://localhost:3000/health
```

### 租户管理

```bash
# 创建租户
curl -X POST http://localhost:3000/admin/tenants \
  -H "Content-Type: application/json" \
  -d '{"name": "Test Team"}'

# 列出租户
curl http://localhost:3000/admin/tenants
```

### 事件推送

```bash
# 用创建租户时返回的 API Key
curl -X POST http://localhost:3000/api/v1/ingestion/events \
  -H "Content-Type: application/json" \
  -H "X-API-Key: <your-api-key>" \
  -d '{
    "type": "deploy",
    "title": "v2.3 Release",
    "sourceUrl": "https://ci.example.com/123",
    "metadata": {"version": "2.3.0"},
    "tags": ["production"]
  }'
```

### Skill 管理

```bash
# 列出已安装 Skill
curl http://localhost:3000/admin/skills

# 安装 Skill
curl -X POST http://localhost:3000/admin/skills \
  -H "Content-Type: application/json" \
  -d '{"packagePath": "./my-skill"}'

# 统计信息
curl http://localhost:3000/admin/stats
```

### AI 管理

```bash
# AI 提供商状态
curl http://localhost:3000/admin/ai/status

# 租户 AI 配置
curl http://localhost:3000/admin/tenants/<tenant-id>/ai

# 启用 AI
curl -X PATCH http://localhost:3000/admin/tenants/<tenant-id>/ai \
  -H "Content-Type: application/json" \
  -d '{"enabled": true}'

# 设置速率限制
curl -X PATCH http://localhost:3000/admin/tenants/<tenant-id>/ai \
  -H "Content-Type: application/json" \
  -d '{"rateLimit": 50}'

# 查看 AI 用量
curl "http://localhost:3000/admin/tenants/<tenant-id>/ai/usage?hours=24"
```

### 搜索

```bash
curl "http://localhost:3000/api/v1/topics/search?type=deploy&status=open"
```

---

## CLI 调试

### 直接运行

```bash
cd packages/cli

# 各种命令
pnpm start health
pnpm start skill list
pnpm start tenant create --name "Test"
pnpm start stats

# AI 命令
pnpm start ai status
pnpm start ai enable
pnpm start ai disable
pnpm start ai usage
pnpm start ai config --show

# 或设置别名
alias thub='pnpm --filter cli start'
thub health
thub skill list
thub ai status
```

> **注意：** 不要在 `pnpm start` 后面加 `--`。`pnpm start` 会自动将
> 后续参数传给脚本，加了 `--` 反而会把它当作第一个参数传入，
> 导致命令路由失败（显示 Usage 帮助信息）。

### 调试 CLI（断点）

```json
{
  "name": "Debug CLI",
  "type": "node",
  "request": "launch",
  "runtimeExecutable": "tsx",
  "args": ["src/index.tsx", "health"],
  "cwd": "${workspaceFolder}/packages/cli",
  "console": "integratedTerminal"
}
```

将 `"health"` 替换为要调试的命令。

---

## 测试

### 单元测试

```bash
# 全部单元测试
pnpm --filter server test

# 单个文件
pnpm --filter server test -- --testPathPattern="topic.service"

# watch 模式（修改文件自动重跑）
pnpm --filter server test -- --watch
```

### 集成测试

集成测试使用 `mongodb-memory-server`，不需要真实 MongoDB：

```bash
pnpm --filter server test:int
```

### CLI 测试

```bash
pnpm --filter cli test
```

### 全部测试

```bash
pnpm test
```

### 覆盖率

```bash
pnpm --filter server test -- --coverage
```

---

## MongoDB 数据检查

### 连接 MongoDB

```bash
# Docker 内的 mongosh
docker exec -it topic-hub-mongodb-1 mongosh topichub

# 或本地安装的 mongosh
mongosh mongodb://localhost:27017/topichub
```

### 常用查询

```javascript
// 查看所有 topic
db.topics.find().pretty()

// 按类型查
db.topics.find({ type: "deploy" }).pretty()

// 查看时间线
db.timeline_entries.find({ topicId: ObjectId("...") }).sort({ timestamp: 1 })

// 查看租户
db.tenants.find().pretty()

// 查看已安装 Skill
db.skill_registrations.find().pretty()

// 查看租户 Skill 配置
db.tenant_skill_configs.find({ tenantId: "..." }).pretty()

// 查看租户 AI 配置（特殊 skillName = '__ai__'）
db.tenant_skill_configs.find({ skillName: "__ai__" }).pretty()

// 查看 AI 用量记录
db.ai_usage_records.find({ tenantId: "..." }).sort({ periodStart: -1 }).limit(10)

// 按 Skill 统计 AI 用量
db.ai_usage_records.aggregate([
  { $match: { tenantId: "..." } },
  { $group: { _id: "$skillName", total: { $sum: "$count" }, tokens: { $sum: "$totalTokens" } } }
])

// 按 group 查找 topic
db.topics.find({ "groups.platform": "feishu", "groups.groupId": "oc_xxx" })

// 查找活跃 topic（非关闭）
db.topics.find({ status: { $ne: "closed" } })

// 统计
db.topics.countDocuments()
db.topics.aggregate([{ $group: { _id: "$type", count: { $sum: 1 } } }])
```

### 清空数据（开发环境）

```javascript
db.topics.deleteMany({})
db.timeline_entries.deleteMany({})
db.tenants.deleteMany({})
db.skill_registrations.deleteMany({})
db.tenant_skill_configs.deleteMany({})
db.ai_usage_records.deleteMany({})
```

---

## 常见问题

### MongoDB 连接失败

```
Error: connect ECONNREFUSED 127.0.0.1:27017
```

确认 MongoDB 容器在运行：

```bash
docker compose ps
docker compose up -d mongodb
```

### 端口被占用

```bash
# 查找占用 3000 端口的进程
lsof -i :3000
kill -9 <PID>
```

### Skill 加载失败

检查 `skills/` 目录下的 Skill 包结构：
- 每个 Skill 必须有 `package.json`
- `package.json` 的 `main` 字段指向入口文件
- 入口文件必须 `export default` 一个符合接口的对象

### pnpm install 失败

```bash
# 清除缓存重试
pnpm store prune
rm -rf node_modules packages/*/node_modules
pnpm install
```

### TypeScript 编译错误

```bash
# 检查类型
pnpm --filter server build

# 只检查不输出
npx tsc --noEmit -p packages/server/tsconfig.json
```

---

## 项目结构速查

```
packages/
├── server/src/
│   ├── ai/            ← AI 服务（AiService、Provider、用量追踪、熔断器）
│   ├── core/          ← Topic + Timeline 实体和服务
│   ├── tenant/        ← 多租户（Guard、Service）
│   ├── skill/         ← Skill 系统（接口、注册、管线、SkillContext）
│   ├── command/       ← /topichub 命令解析和路由
│   ├── ingestion/     ← 事件推送 API
│   ├── search/        ← Topic 搜索
│   ├── admin/         ← 管理 API（给 CLI 用）
│   ├── auth/          ← JWT/JWKS 验证
│   ├── crypto/        ← AES-256 加密
│   ├── database/      ← MongoDB 连接
│   └── common/        ← 枚举、日志、异常过滤器
├── cli/src/
│   ├── commands/      ← CLI 命令（skill、tenant、stats、health、ai）
│   ├── auth/          ← OAuth2 PKCE + OS Keychain
│   └── api-client/    ← HTTP 客户端
└── skills/            ← 已安装 Skill（空目录，通过 CLI 添加）
```
