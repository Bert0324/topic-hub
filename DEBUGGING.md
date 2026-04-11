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

### 事件推送

```bash
curl -X POST http://localhost:3000/api/v1/ingestion/events \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <identity-token>" \
  -d '{
    "type": "deploy",
    "title": "v2.3 Release",
    "sourceUrl": "https://ci.example.com/123",
    "metadata": {"version": "2.3.0"},
    "tags": ["production"]
  }'
```

### 身份管理（超管）

```bash
# 创建身份（超管 token）
curl -X POST http://localhost:3000/api/v1/admin/identities \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <superadmin-token>" \
  -d '{"uniqueId": "user1", "displayName": "张三"}'

# 列出所有身份
curl http://localhost:3000/api/v1/admin/identities \
  -H "Authorization: Bearer <superadmin-token>"

# 查看自己的身份
curl http://localhost:3000/api/v1/identity/me \
  -H "Authorization: Bearer <identity-token>"
```

### 执行器注册与配对码

```bash
# 注册执行器
curl -X POST http://localhost:3000/api/v1/executors/register \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <identity-token>" \
  -d '{"executorMeta": {"agentType": "claude-code", "maxConcurrentAgents": 2}}'

# 生成配对码（使用返回的 executorToken）
curl -X POST http://localhost:3000/api/v1/executors/pairing-code \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <executor-token>"
```

### Skill 发布

```bash
# 发布 Skill
curl -X POST http://localhost:3000/admin/skills/publish \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <identity-token>" \
  -d '{
    "skills": [{
      "name": "my-skill",
      "version": "1.0.0",
      "metadata": {},
      "skillMdRaw": "---\nname: My Skill\ndescription: A demo skill\n---\n# My Skill\nYou are a helpful agent...",
      "entryPoint": "",
      "files": {},
      "manifest": {"name": "my-skill"}
    }]
  }'

# 热重载所有 Skill
curl -X POST http://localhost:3000/admin/skills/reload
```

### 搜索

```bash
curl "http://localhost:3000/api/v1/topics/search?type=deploy&status=open"
```

---

## CLI 调试

### 命令速查

```bash
cd packages/cli

# 初始化配置
pnpm start init

# 认证
pnpm start login
pnpm start logout

# 查看自己的身份
pnpm start identity me --token <your-token>

# 身份管理（超管）
pnpm start identity create --token <superadmin-token> --unique-id user1 --name "张三"
pnpm start identity list --token <superadmin-token>

# 本地执行器（启动后会显示配对码）
pnpm start serve --executor claude-code

# Skill 开发
pnpm start skill create --name my-skill

# 发布 Skill
pnpm start publish ./path/to/skill-dir

# 创建 Topic
pnpm start topic create bug --platform discord --channel general

# 或设置别名
alias thub='pnpm --filter cli start'
thub identity me --token <token>
thub serve
thub skill create
thub publish ./my-skill
thub topic create deploy --platform feishu --channel oc_xxx
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
  "args": ["src/index.tsx", "identity", "me", "--token", "xxx"],
  "cwd": "${workspaceFolder}/packages/cli",
  "console": "integratedTerminal"
}
```

将参数替换为要调试的命令。

---

## IM 指令

在 IM 中 @Bot 后直接输入指令，无需 `/topichub` 前缀。

### 无需绑定执行器

| 指令 | 说明 |
|------|------|
| `/help` | 查看所有可用指令 |
| `/register <配对码>` | 将 IM 账号绑定到本地执行器 |

### 需要绑定执行器

| 指令 | 说明 |
|------|------|
| `/create <type>` | 创建新 topic |
| `/update --status <status>` | 更新 topic 状态 |
| `/assign --user <userId>` | 分配用户 |
| `/show` | 查看当前 topic |
| `/timeline` | 查看时间线 |
| `/reopen` | 重新打开 |
| `/history` | 查看群组历史 |
| `/search --type <type>` | 搜索 topic |
| `/use <skill-name>` | 调用指定 Skill |
| `/unregister` | 解绑执行器 |
| `/answer [#N] <text>` | 回答 Agent 提问 |

### 配对流程

1. 本地运行 `topichub-admin serve`，控制台显示配对码
2. 在 IM 中 @Bot 输入 `/register <配对码>`
3. 绑定成功后即可使用所有指令
4. 一个执行器可被多个 IM 账号绑定（1:N）
5. 每个 IM 账号同时只能绑定一个执行器

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

// 查看已注册 Skill
db.skill_registrations.find().pretty()

// 查看身份绑定
db.user_identity_bindings.find().pretty()

// 查看活跃绑定
db.user_identity_bindings.find({ active: true }).pretty()

// 查看配对码
db.pairing_codes.find({ claimed: false }).pretty()

// 查看执行器心跳
db.executor_heartbeats.find().pretty()

// 查看任务派发记录
db.task_dispatches.find().sort({ createdAt: -1 }).limit(10).pretty()

// 查看 Q&A 交互
db.qa_exchanges.find().sort({ createdAt: -1 }).limit(5).pretty()

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
db.skill_registrations.deleteMany({})
db.user_identity_bindings.deleteMany({})
db.pairing_codes.deleteMany({})
db.executor_heartbeats.deleteMany({})
db.task_dispatches.deleteMany({})
db.qa_exchanges.deleteMany({})
```

---

## Skill 开发

Skill 是一个 SKILL.md 文件，定义了 Agent 的指令、触发条件和上下文。所有 Skill 在本地执行，仅有两个生命周期状态：**本地**（未发布）和**已发布**（Skill Center 可见）。

### 创建 Skill

```bash
cd packages/cli

# 交互式创建
pnpm start skill create

# 指定名称
pnpm start skill create --name my-incident-handler

# 非交互模式
pnpm start skill create --name quick-skill --non-interactive
```

创建后在当前目录的 `skills/` 下生成：

```
skills/
└── my-incident-handler/
    ├── SKILL.md          # Agent 指令文件
    └── README.md
```

### 编写 SKILL.md

```markdown
---
name: Incident Handler
description: 处理生产事故的 Agent Skill
executor: claude-code
maxTurns: 10
allowedTools:
  - mcp__topichub__get_topic
  - mcp__topichub__update_topic
  - mcp__topichub__add_timeline_entry
---

# Incident Handler

你是一个处理生产事故的 Agent...
```

### 本地调试

在一个终端启动服务器，另一个终端启动本地 executor：

```bash
# 终端 1：启动服务器
./start-local.sh

# 终端 2：启动本地 executor（控制台会显示配对码）
cd packages/cli
pnpm start serve --executor claude-code
```

本地 serve 模式的特性：
- **配对码**：启动时显示配对码，在 IM 中 `/register <code>` 完成绑定
- **热重载**：修改 SKILL.md 后无需重启，下次派发自动使用新内容
- **结构化日志**：
  ```
  [DISPATCH] Received: topic-123 / my-incident-handler / created
  [CLAIM]    Claimed dispatch abc-def
  [AGENT]    Running claude-code with my-incident-handler...
  [RESULT]   Completed in 4200ms
  ```

### 发布到 Skill Center

```bash
# 发布单个 Skill 目录
pnpm start publish ./skills/my-incident-handler

# 发布时验证 SKILL.md 格式和必填字段
```

发布后：
- 所有用户都可以通过 `/use my-incident-handler` 调用
- Skill Center 网页可浏览、点赞、查看使用次数
- 更新已发布的 Skill：再次 `publish` 同名目录即可覆盖

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

### Skill 发布失败

- **"Not authenticated"**：运行 `topichub-admin login`
- **"Skill directory not found"**：检查 `publish` 参数路径是否正确指向包含 SKILL.md 的目录

### IM 指令不响应

- 确认已 @mention Bot
- 使用 `/help` 检查 Bot 是否在线（无需绑定执行器）
- 如果提示 "register first"，先用 `/register <code>` 绑定执行器
- 旧的 `/topichub` 前缀已不再支持，直接使用 `/create`、`/show` 等

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
├── core/src/
│   ├── command/        ← 指令解析和路由（无 /topichub 前缀）
│   ├── bridge/         ← OpenClaw IM 桥接（消息标准化、HMAC 验证）
│   ├── webhook/        ← Webhook 处理（/help 免绑定、/register 配对、指令分发）
│   ├── identity/       ← 身份服务（配对码生成/认领、IM 绑定管理）
│   ├── skill/          ← Skill 系统（注册、SKILL.md 解析、管线）
│   ├── services/       ← Topic、Timeline、Dispatch、QA、Heartbeat 等服务
│   ├── ingestion/      ← 事件推送 API
│   ├── entities/       ← Typegoose 实体定义
│   └── common/         ← 枚举、日志、错误类型
├── server/src/
│   ├── api.controller.ts  ← 全部 HTTP 端点（Webhook、Admin、Executor、Identity）
│   └── topichub.provider.ts ← NestJS 服务组装
├── cli/src/
│   ├── commands/       ← CLI 命令
│   │   ├── init/         ← 初始化配置
│   │   ├── serve/        ← 本地执行器（显示配对码）
│   │   ├── identity/     ← 身份管理（me / create / list / revoke / regenerate-token）
│   │   ├── skill/        ← skill create（创建本地 Skill）
│   │   ├── publish/      ← 发布 Skill 到 Skill Center
│   │   └── topic/        ← topic create（创建 Topic）
│   ├── scaffold/       ← Skill 脚手架
│   ├── mcp/            ← MCP Server（Agent 工具）
│   ├── executors/      ← Agent 执行器（Claude Code、Codex）
│   ├── auth/           ← OAuth2 PKCE + OS Keychain
│   ├── api-client/     ← HTTP 客户端
│   └── config/         ← ~/.topichub/config.json 管理
└── skills/             ← Skill 目录（服务器自动加载）
```
