<p align="center">
  <h1 align="center">Topic Hub</h1>
  <p align="center">
    <strong>将事件变成可追踪的话题，将群聊变成协作空间</strong>
  </p>
</p>

<p align="center">
  <a href="#快速开始">快速开始</a> &bull;
  <a href="#im-命令">IM 命令</a> &bull;
  <a href="#自定义-skill">自定义 Skill</a> &bull;
  <a href="#部署">部署</a> &bull;
  <a href="./README.md">English</a>
</p>

---

## 解决什么问题

团队处理事件（发布、故障、告警）时，信息散落在各处——CI 发了一条通知，有人在大群里 @了几个人，讨论混在日常闲聊中，最后没人知道这件事到底解决了没有。

**Topic Hub 让每件事都有自己的群，有状态，有时间线，可追踪。**

## 核心概念

### Topic（话题）

一个 Topic 就是一件需要跟踪的事——一次发布、一个故障、一个 bug。每个 Topic 自动获得：

- **专属 IM 群** — 讨论不会淹没在大群里
- **状态流转** — `open → in_progress → resolved → closed`，随时可 reopen
- **时间线** — 谁在什么时间做了什么，自动记录
- **信息卡片** — 置顶在群里，一目了然

### Skill（技能）

Topic Hub 本身只是一个引擎。所有具体能力都通过 Skill 插件提供：

| 类别 | 干什么 | 举例 |
|------|--------|------|
| **Type** | 定义话题类型——字段、卡片样式、状态规则 | `deploy-type`、`incident-type` |
| **Platform** | 对接 IM 平台——建群、发卡片、接收命令 | `feishu`、`slack` |
| **Auth** | 控制权限——谁能做什么 | `rbac-auth`、`ldap-auth` |
| **Adapter** | 转换外部 webhook 为 Topic Hub 事件 | `github-adapter`、`jenkins-adapter` |

不装 Auth Skill？所有人都有全部权限。不装 Adapter？手动创建 Topic 就好。**按需组合，不用的不装。**

### Tenant（租户）

一套部署服务多个团队。每个团队有独立的数据、独立的 Skill 配置、独立的 IM 应用凭证。团队之间互不可见。

---

## 快速开始

### 1. 部署

```bash
git clone https://github.com/your-org/topic-hub.git && cd topic-hub
docker compose up -d
```

服务跑起来了：`http://localhost:3000`。

### 2. 创建租户

```bash
topichub-admin tenant create --name "My Team"
# ✅ Tenant created!
#    ID:          tenant_abc123
#    API Key:     ak_xxxxxxxx
#    Admin Token: tk_xxxxxxxx (30 天有效)
```

### 3. 安装 Skill

```bash
# 用 Admin Token 认证
topichub-admin auth tk_xxxxxxxx

# 安装话题类型（比如「发布」类型）
topichub-admin skill install topichub-deploy-type
topichub-admin skill enable deploy-type

# 对接 IM 平台（比如飞书）
topichub-admin skill install topichub-feishu
topichub-admin skill enable feishu
topichub-admin skill setup feishu   # 按提示完成 OAuth 授权
```

### 4. 开始使用

在 IM 里输入：

```
/topichub create deploy --title "v2.3 Release"
```

一个专属群自动创建，话题卡片置顶，相关人员被拉入群。搞定。

---

## IM 命令

所有终端用户的交互都在 IM 中完成，通过 `/topichub` 命令操作。

### 在任意群聊中

| 命令 | 说明 |
|------|------|
| `/topichub create <type> [args]` | 创建话题（自动建群或在当前群创建） |
| `/topichub search --type <t> --status <s>` | 搜索话题 |
| `/topichub help` | 查看可用的话题类型和命令 |

### 在话题群中

| 命令 | 说明 |
|------|------|
| `/topichub update --status <status>` | 更新状态 |
| `/topichub assign @user` | 指派负责人（自动拉入群） |
| `/topichub show` | 展示话题详情卡片 |
| `/topichub timeline` | 查看时间线 |
| `/topichub reopen` | 重新打开已关闭的话题 |
| `/topichub history` | 查看当前群的历史话题 |

### 状态流转

```
open → in_progress → resolved → closed
                                  ↓
                                open（reopen）
```

话题关闭后群聊保留，可以继续聊天，但修改操作会被禁用。你可以在同一个群里创建新话题，也可以重新打开已关闭的话题。

---

## CLI 管理命令

`topichub-admin` 是给管理员用的命令行工具。

### 认证

```bash
topichub-admin auth <token>          # 用 Admin Token 认证
topichub-admin login                 # OAuth2 登录（浏览器跳转）
```

### Skill 管理

```bash
topichub-admin skill install <包名或路径>   # 安装 Skill
topichub-admin skill list                   # 查看已安装的 Skill
topichub-admin skill enable <name>          # 启用
topichub-admin skill disable <name>         # 禁用
topichub-admin skill setup <name>           # 引导配置（OAuth 等）
topichub-admin skill config <name> --show   # 查看配置（密钥显示为 ***）
```

### 租户管理

```bash
topichub-admin tenant create --name "Team Name"   # 创建租户
topichub-admin tenant list                        # 查看租户列表
```

### 其他

```bash
topichub-admin health         # 检查服务状态
topichub-admin stats          # 查看统计数据
```

---

## 通过 API 接入事件

除了 IM 命令，你也可以通过 API 将外部系统的事件推送到 Topic Hub：

```bash
curl -X POST http://localhost:3000/api/v1/ingestion/events \
  -H "Content-Type: application/json" \
  -H "X-API-Key: <tenant-api-key>" \
  -d '{
    "type": "deploy",
    "title": "v2.3 Release",
    "sourceUrl": "https://ci.example.com/123",
    "metadata": { "version": "2.3.0", "environment": "production" }
  }'
```

如果 `sourceUrl` 与已有话题匹配，会更新而不是重复创建。

或者安装 Adapter Skill，直接把 GitHub / Jenkins 等系统的 webhook 地址指向 Topic Hub，零代码对接：

```
https://your-hub.com/webhooks/adapter/github
```

---

## 自定义 Skill

创建一个目录，包含 `package.json` 和入口文件：

```typescript
import { z } from 'zod';

export default {
  manifest: {
    name: 'incident-type',
    category: 'type',
    topicType: 'incident',
    version: '1.0.0',
    fieldSchema: z.object({
      severity: z.enum(['P0', 'P1', 'P2', 'P3']),
      affectedService: z.string(),
    }),
    groupNamingTemplate: '🚨 {title} - {severity}',
    customArgs: [
      { name: 'severity', type: 'string', required: true, description: 'P0-P3' },
      { name: 'affected-service', type: 'string', required: true },
    ],
  },

  renderCard(topic) {
    return {
      title: `🚨 Incident: ${topic.title}`,
      status: topic.status,
      fields: [
        { label: 'Severity', value: topic.metadata.severity, type: 'badge' },
        { label: 'Service', value: topic.metadata.affectedService, type: 'text' },
      ],
    };
  },

  validateMetadata(metadata) {
    return this.manifest.fieldSchema.safeParse(metadata);
  },
};
```

安装并启用：

```bash
topichub-admin skill install ./my-skills/incident-type
topichub-admin skill enable incident-type
```

现在用户可以在 IM 中输入：

```
/topichub create incident --severity P0 --affected-service payments
```

---

## 部署

### Docker Compose（推荐）

```bash
git clone https://github.com/your-org/topic-hub.git && cd topic-hub
docker compose up -d
```

启动 MongoDB 7 + Topic Hub server，访问 `http://localhost:3000`。

### 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `MONGODB_URI` | `mongodb://localhost:27017/topichub` | MongoDB 连接串 |
| `PORT` | `3000` | 服务端口 |
| `ENCRYPTION_KEY` | — | AES-256 密钥，**生产必填** |
| `SKILLS_DIR` | `./skills` | Skill 目录 |
| `LOG_LEVEL` | `info` | `debug` / `info` / `warn` / `error` |
| `TOKEN_EXPIRY_DAYS` | `30` | Admin Token 有效期（天） |

### 生产清单

- [ ] 设置强 `ENCRYPTION_KEY`（32+ 随机字节，base64 编码）
- [ ] 使用托管 MongoDB（Atlas 等）
- [ ] 配置 HTTPS 反向代理
- [ ] 安装并配置至少一个 Platform Skill（飞书 / Slack）
- [ ] 安装至少一个 Type Skill（deploy / incident / bug 等）
- [ ] 为每个团队创建租户

---

## License

MIT
