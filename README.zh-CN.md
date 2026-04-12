<p align="center">
  <h1 align="center">Topic Hub</h1>
  <p align="center">
    <strong>把聊天变成执行，把过程变成可追踪结果。</strong>
  </p>
</p>

<p align="center">
  <strong>🔥 IM 原生协作 · 本地 AI 执行 · 高速团队工作流</strong>
</p>

<p align="center">
  <a href="#体验流程">体验流程</a> &bull;
  <a href="#你会得到什么">你会得到什么</a> &bull;
  <a href="#真实使用感受">真实使用感受</a> &bull;
  <a href="#适用团队">适用团队</a> &bull;
  <a href="./README.md">English</a>
</p>

---

## 为什么大家愿意分享 Topic Hub

团队早就在聊天里协作，真正缺的是“执行闭环”和“过程可见性”。

Topic Hub 把这条链路接起来：

- 在 Discord 里讨论并触发任务
- 把消息沉淀为有生命周期的 topic
- 通过本地 Claude Code 或 Codex 执行引擎处理任务
- 将进度和结果回传到同一个频道

你会同时获得聊天协作的速度、本地执行的可控性、以及全员可见的过程记录。

## 体验流程

按下面 9 步可以快速跑通 Discord -> Topic -> Agent 执行体验：

1. 加入 Discord 用户群：[topic hub discord](https://discord.gg/C6fgRpNs)
2. 在 Discord 私聊 Bot 执行 `/id create`，自助注册并获取 identity token
3. 确认本地已安装 `claude code` 或 `codex`，以及 `topichub-cli`
4. 使用体验服务器地址 `https://hk.ltflange.cn`
5. 本地执行 `topichub-admin init`（token 可跳过），再执行 `topichub-admin login <identity-token>`
6. 启动本地 `serve` 获取匹配码（pairing code）
7. 在 Discord 私聊 Bot 执行 `/register <匹配码>`
8. 在体验 server 新建频道并执行 `/create`
9. 在频道里分配真实任务，观察本地执行结果回传

## 你会得到什么

### Topic 化协作

每个任务都有独立的状态、时间线和上下文，不再被日常聊天淹没。

### 本地优先执行

执行发生在你的本地环境，既能利用 AI 生产力，又能保持安全与可控。

### IM 原生体验

业务同学和研发同学都在熟悉的聊天界面里协作，不需要频繁切换系统。

### 可扩展 Skill 体系

团队可以按自己的业务流程扩展技能能力，逐步形成可复用的执行标准。

## 真实使用感受

产品同学在 Discord 提需求。  
工程师直接在频道创建 topic。  
本地 Agent 接管执行并持续反馈。  
问题、决策、结果都留在同一条协作上下文里。  
谁都知道当前进展和下一步动作。

## 适用团队

Topic Hub 同时适合：

- **产品研发团队**：需求流转、迭代推进、责任归属
- **运维与故障团队**：告警处理、发布跟踪、复盘沉淀

同一套交互方式贯穿全流程：创建、执行、评审、关闭。

## 技术文档入口

部署、命令、调试、排障、API 示例已统一整理在 `DEBUGGING.md`。

如果你准备自建环境或做深度集成，请直接查看该文档。

---

## License

MIT
