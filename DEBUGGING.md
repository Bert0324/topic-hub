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
# 列出已安装 Skill（全部）
curl http://localhost:3000/admin/skills

# 按范围过滤
curl "http://localhost:3000/admin/skills?scope=private&tenantId=<tenant-id>"

# 安装 Skill（服务器本地路径）
curl -X POST http://localhost:3000/admin/skills \
  -H "Content-Type: application/json" \
  -d '{"packagePath": "./my-skill"}'

# 批量发布 Skill（私有）
curl -X POST http://localhost:3000/admin/skills/publish \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <admin-token>" \
  -d '{
    "tenantId": "<tenant-id>",
    "skills": [{
      "name": "my-skill",
      "category": "type",
      "version": "1.0.0",
      "metadata": {"topicType": "incident"},
      "skillMdRaw": "---\nexecutor: claude-code\n---\n# My Skill",
      "entryPoint": "export default { manifest: {} }",
      "files": {},
      "manifest": {"name": "my-skill", "topichub": {"category": "type"}}
    }]
  }'

# 批量发布为通用 Skill（需超级管理员）
curl -X POST http://localhost:3000/admin/skills/publish \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <super-admin-token>" \
  -d '{"tenantId": "<tenant-id>", "isPublic": true, "skills": [...]}'

# 热重载所有 Skill
curl -X POST http://localhost:3000/admin/skills/reload

# 统计信息
curl http://localhost:3000/admin/stats
```

### 群组管理

```bash
# 通过 Platform Skill 创建群组
curl -X POST http://localhost:3000/admin/groups \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <admin-token>" \
  -d '{"name": "Bug 值班群", "platform": "feishu", "memberIds": ["user1", "user2"]}'
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

# 基础命令
pnpm start health
pnpm start skill list
pnpm start tenant create --name "Test"
pnpm start stats

# Skill 开发命令
pnpm start skill-repo create my-skills       # 创建 Skill 仓库
pnpm start skill create                      # 交互式创建 Skill（需在仓库内）
pnpm start skill create --category adapter   # 指定类别
pnpm start publish                           # 发布全部 Skill（私有）
pnpm start publish --public                  # 发布为通用（需超级管理员）
pnpm start publish --dry-run                 # 预检验证
pnpm start skill list --scope private        # 仅私有 Skill
pnpm start skill list --category platform    # 按类别过滤

# 群组命令
pnpm start group create "值班群" --platform feishu --members user1,user2

# 本地执行器
pnpm start serve --executor claude-code      # 启动本地 agent 执行

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
thub skill-repo create my-skills
thub publish
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

## Skill 开发

Topic Hub 的 Skill 分为**通用 Skill**（公开，所有租户可用）和**私有 Skill**（仅特定租户可用）。两者使用**完全相同的开发流程**（repo-first workflow），区别仅在于发布时的可见性权限。通用 Skill 还有一条快捷路径：可以直接在服务器本地 `SKILLS_DIR` 编辑。

### Skill 类别

| 类别 | 标识 | 用途 | 示例 |
|------|------|------|------|
| **Topic** | `type` | 定义 topic 类型，绑定生命周期钩子 | bug-report、deploy-tracker |
| **Platform** | `platform` | 对接 IM 平台（webhook + 命令 + 卡片） | feishu、slack |
| **Adapter** | `adapter` | 连接外部系统，处理认证 | github、jira |

### 统一开发流程（推荐）

无论是通用还是私有 Skill，**推荐使用同一套 CLI 工作流**：

```
cli init → skill-repo create → skill create（Q&A）→ 开发 → publish
```

- **普通租户管理员**：`publish` 始终发布为**私有**（仅本租户可见）
- **超级管理员**：`publish --public` 可发布为**通用**（所有租户可见）
- 非超级管理员尝试 `--public` 会被拒绝

详细步骤见下方"私有 Skill 开发"一节（流程完全一致，差别仅在 `publish` 命令是否带 `--public`）。

---

### 通用 Skill 快捷路径（服务器本地编辑）

通用 Skill 除了走 CLI 工作流外，还可以直接放在服务器的 `SKILLS_DIR`（默认 `./skills`）下，服务器启动时自动加载。这条路径适用于平台开发阶段的快速迭代。

#### 1. 创建 Skill 目录

Skill 按类别组织在子目录中：`topics/`、`platforms/`、`adapters/`。

```bash
cd packages/skills

# Topic 类型 Skill
mkdir -p topics/my-topic-skill

# Platform 类型 Skill
mkdir -p platforms/my-platform-skill

# Adapter 类型 Skill
mkdir -p adapters/my-adapter-skill
```

`packages/skills/` 目录已包含 writing-topic-hub 的 AI 辅助文件（`.cursor/rules/`、`AGENTS.md`、`CLAUDE.md`），用 Cursor/Claude Code/Codex 打开即可获得开发引导。

#### 2. 编写 package.json

```json
{
  "name": "my-topic-skill",
  "version": "1.0.0",
  "main": "src/index.ts",
  "topichub": {
    "category": "type",
    "topicType": "incident",
    "hooks": ["created", "updated"]
  }
}
```

Platform Skill 示例：

```json
{
  "name": "feishu-platform",
  "version": "1.0.0",
  "main": "src/index.ts",
  "topichub": {
    "category": "platform",
    "platform": "feishu",
    "capabilities": ["push", "commands", "group_management"]
  }
}
```

Adapter Skill 示例：

```json
{
  "name": "github-adapter",
  "version": "1.0.0",
  "main": "src/index.ts",
  "topichub": {
    "category": "adapter",
    "sourceSystem": "github",
    "auth": { "type": "oauth2", "scopes": ["repo"] },
    "supportedEvents": ["push", "pull_request"]
  }
}
```

#### 3. 编写 SKILL.md（Agent 指令）

```markdown
---
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

#### 4. 实现接口

根据类别实现对应接口。Topic Skill：

```typescript
export default {
  manifest: { /* 同 package.json 的 topichub 字段 */ },
  onTopicCreated(topic) { /* ... */ },
  onTopicUpdated(topic) { /* ... */ },
};
```

Platform Skill 需实现三个接口：`handleWebhook`、`postCard`/`updateCard`、`createGroup`。
Adapter Skill 需实现：`transformWebhook`、`runSetup`（如需认证）。

#### 5. 加载与测试

```bash
# 重启服务器自动加载
pnpm --filter server dev

# 或通过 API 手动安装
curl -X POST http://localhost:3000/admin/skills \
  -H "Content-Type: application/json" \
  -d '{"packagePath": "./skills/my-topic-skill"}'

# 热重载所有 Skill
curl -X POST http://localhost:3000/admin/skills/reload
```

#### 6. 验证

```bash
# 列出已加载 Skill
curl http://localhost:3000/admin/skills

# 查看数据库中的注册信息
mongosh topichub --eval 'db.skill_registrations.find().pretty()'
```

---

### 私有 Skill 开发（租户用户）

租户用户通过 CLI 创建独立的 Skill 仓库，在本地开发后发布到服务器。私有 Skill 仅对发布它的租户可见。

#### 前置条件

```bash
# 1. 初始化 CLI（需要管理员 Token）
pnpm start init
# 按提示输入 server URL、admin token、tenant ID、executor

# 或直接设置 token
pnpm start auth <your-admin-token>
```

#### 1. 创建 Skill 仓库

```bash
cd packages/cli

# 创建一个新的 Skill 仓库
pnpm start skill-repo create my-team-skills
cd ../../my-team-skills   # 仓库创建在当前目录下
```

生成的仓库结构：

```
my-team-skills/
├── package.json              # 仓库配置（tenantId、serverUrl）
├── tsconfig.json
├── .topichub-repo.json       # 仓库元数据
├── .cursor/rules/writing-topic-hub.mdc   # Cursor AI 规则
├── AGENTS.md                 # Claude Code / Codex 指引
├── CLAUDE.md                 # Claude Code 配置
├── skills/                   # Skill 存放目录（按类别组织）
│   ├── topics/               # Topic 类型 Skill
│   ├── platforms/            # Platform 类型 Skill
│   └── adapters/             # Adapter 类型 Skill
└── README.md
```

#### 2. 创建 Skill（交互式 Q&A）

```bash
# 在仓库根目录下运行
cd my-team-skills

# 交互式创建（推荐）
pnpm --filter cli start skill create

# Q&A 流程：
# ? Skill name: my-incident-handler
# ? Category: Topic Type
# ? Topic type name: incident
# ? Lifecycle hooks: created, updated

# 或指定参数跳过部分提问
pnpm --filter cli start skill create --name my-adapter --category adapter

# 非交互模式（CI/自动化场景）
pnpm --filter cli start skill create --name quick-skill --category type --non-interactive
```

创建后的 Skill 会按类别放入对应子目录：

```
skills/
├── topics/
│   └── my-incident-handler/    # topic 类型 Skill
│       ├── package.json
│       ├── SKILL.md
│       ├── src/
│       │   └── index.ts
│       └── README.md
├── platforms/                  # platform 类型 Skill
└── adapters/                   # adapter 类型 Skill
```

#### 3. 使用 AI 辅助开发

仓库自带 AI Agent 配置文件，打开仓库后 AI 工具自动理解 Skill 开发规范：

```bash
# Cursor
cursor my-team-skills/

# Claude Code
cd my-team-skills && claude

# Codex
cd my-team-skills && codex
```

AI 会根据 `.cursor/rules/writing-topic-hub.mdc` 或 `AGENTS.md` 了解：
- Skill 清单结构（每个类别的必填字段）
- SKILL.md 前置元数据格式
- 需要实现的接口方法
- 测试和发布流程

#### 4. 本地调试

在一个终端启动服务器，另一个终端启动本地 executor：

```bash
# 终端 1：启动服务器
./start-local.sh

# 终端 2：启动本地 executor（消费派发任务）
cd packages/cli
pnpm start serve --executor claude-code
```

本地 serve 模式的特性：
- **热重载**：修改 SKILL.md 后无需重启，下次派发自动使用新内容
- **结构化日志**：
  ```
  [DISPATCH] Received: topic-123 / my-incident-handler / created
  [CLAIM]    Claimed dispatch abc-def
  [AGENT]    Running claude-code with my-incident-handler...
  [RESULT]   Completed in 4200ms
  ```
- **错误详情**：出错时显示 Skill 名、Topic ID、错误信息和堆栈

#### 5. 发布到服务器

```bash
cd my-team-skills

# 预检（不实际发布，仅验证）
pnpm --filter cli start publish --dry-run

# 正式发布（批量发布仓库内所有 Skill）
pnpm --filter cli start publish
```

输出示例：

```
Publishing 2 skill(s) from my-team-skills...
  ✓ my-incident-handler (created)
  ✓ my-alert-router (updated)
Published to http://localhost:3000
```

发布行为：
- **批量发布**：仓库是部署单元，所有 Skill 一次性发布
- **覆盖更新**：同名 Skill 再次发布会覆盖旧版本（服务器不保留历史版本）
- **租户隔离**：私有 Skill 仅对发布者的租户可见
- **自动启用**：发布后自动在该租户下启用

#### 6. 查看和管理 Skill

```bash
cd packages/cli

# 列出所有 Skill（公有 + 私有）
pnpm start skill list

# 仅查看私有 Skill
pnpm start skill list --scope private

# 按类别过滤
pnpm start skill list --category adapter

# 启用/禁用某个 Skill
pnpm start skill enable <skill-name>
pnpm start skill disable <skill-name>
```

#### 7. 创建 IM 群组

```bash
# 通过 Platform Skill 创建群组
pnpm start group create "Bug 值班群" --platform feishu --members user1,user2

# 关联 topic 类型
pnpm start group create "部署通知" --platform feishu --topic-type deploy
```

---

### 通用 vs 私有 Skill 对比

| | 通用 Skill | 私有 Skill |
|---|---|---|
| **开发流程** | 同私有 Skill（CLI 工作流） | `init → skill-repo create → skill create → develop → publish` |
| **发布命令** | `topichub publish --public`（需超级管理员） | `topichub publish`（普通管理员即可） |
| **可见性** | 所有租户 | 仅发布者的租户 |
| **快捷路径** | 可直接放 `SKILLS_DIR`，服务器自动加载 | 无，必须通过 `publish` |
| **版本管理** | 用户自行 Git 管理 | 用户自行 Git 管理 |
| **开发工具** | CLI Q&A 脚手架 + AI 辅助 | CLI Q&A 脚手架 + AI 辅助 |
| **适用场景** | 平台基础能力、内置类型 | 团队专属流程、定制集成 |

---

### MongoDB 中查看 Skill 数据

```javascript
// 查看所有 Skill（包含公有和私有）
db.skill_registrations.find().pretty()

// 仅查看私有 Skill
db.skill_registrations.find({ isPrivate: true }).pretty()

// 查看某个租户的私有 Skill
db.skill_registrations.find({ tenantId: "...", isPrivate: true }).pretty()

// 查看发布的 Skill 内容
db.skill_registrations.find(
  { name: "my-incident-handler" },
  { publishedContent: 1 }
).pretty()

// 查看任务派发记录
db.task_dispatches.find({ skillName: "my-incident-handler" }).sort({ createdAt: -1 }).limit(5)
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
- Skill 按类别组织在 `topics/`、`platforms/`、`adapters/` 子目录中
- 每个 Skill 必须有 `package.json`，且包含 `topichub.category` 字段
- `package.json` 的 `main` 字段指向入口文件
- 入口文件必须 `export default` 一个符合对应类别接口的对象

### Skill 发布失败

- **"Not authenticated"**：运行 `topichub-admin init` 或 `topichub-admin auth <token>`
- **"Not in a skill repo"**：确认当前目录或父目录下存在 `.topichub-repo.json`
- **"Permission denied"**：`--public` 需要超级管理员身份
- **"Validation errors"**：检查 `package.json` 的 `name`（小写、连字符、3-64 字符）和 `topichub.category`

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
│   │   ├── interfaces/  ← TypeSkill / PlatformSkill / AdapterSkill / 清单校验
│   │   ├── registry/    ← Skill 加载、注册、租户级解析
│   │   ├── entities/    ← SkillRegistration（含 tenantId / isPrivate / publishedContent）
│   │   └── pipeline/    ← Hooks → AI → Dispatch → Platform 管线
│   ├── command/       ← /topichub 命令解析和路由
│   ├── dispatch/      ← 任务派发（create、claim、complete、SSE）
│   ├── ingestion/     ← 事件推送 API + Adapter Webhook
│   ├── search/        ← Topic 搜索
│   ├── admin/         ← 管理 API（skills/publish、groups、租户管理）
│   ├── auth/          ← JWT/JWKS 验证
│   ├── crypto/        ← AES-256 加密
│   ├── database/      ← MongoDB 连接
│   └── common/        ← 枚举、日志、异常过滤器
├── cli/src/
│   ├── commands/      ← CLI 命令
│   │   ├── skill/       ← skill list / create / enable / disable
│   │   ├── skill-repo/  ← skill-repo create（创建 Skill 仓库）
│   │   ├── publish/     ← publish（批量发布 Skill）
│   │   ├── group/       ← group create（创建 IM 群组）
│   │   ├── serve/       ← serve（本地 executor，含调试日志）
│   │   └── ...          ← tenant、stats、health、ai、init
│   ├── scaffold/      ← Skill 脚手架
│   │   ├── repo-scaffold.ts    ← 创建 Skill 仓库项目
│   │   ├── skill-scaffold.ts   ← 创建单个 Skill
│   │   ├── qa-flow.ts          ← 交互式 Q&A 引擎
│   │   └── templates/          ← 类别模板 + AI Agent 配置
│   ├── auth/          ← OAuth2 PKCE + OS Keychain + Adapter 凭证
│   ├── api-client/    ← HTTP 客户端
│   └── config/        ← ~/.topichub/config.json 管理
└── skills/            ← 通用 Skill（服务器自动加载）
```
