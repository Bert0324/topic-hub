<p align="center">
  <h1 align="center">Topic Hub</h1>
  <p align="center">
    <strong>Turn chat into execution. Turn updates into traceable outcomes.</strong>
  </p>
</p>

<p align="center">
  <strong>🔥 IM-native collaboration · Local AI execution · Built for fast teams</strong>
</p>

<p align="center">
  <a href="#live-experience-flow">Live Experience</a> &bull;
  <a href="#what-you-get">What You Get</a> &bull;
  <a href="#how-it-feels-in-practice">How It Feels</a> &bull;
  <a href="#for-builders-and-ops-teams">For Builders & Ops</a> &bull;
  <a href="./README.zh-CN.md">中文文档</a>
</p>

---

## Why Teams Share Topic Hub

Modern teams already work in chat. The missing piece is reliable execution and visibility.

Topic Hub creates a closed loop:

- discuss and trigger work in Discord
- turn messages into structured topics with clear lifecycle
- run tasks through your local Claude Code or Codex executor
- send outcomes back to the same channel for team visibility

This keeps collaboration fast, execution controllable, and history auditable.

## Live Experience Flow

Install the CLI globally: `npm i -g topichub-cli` (Node 20+). Then:

1. Join the [Topic Hub Discord server](https://discord.gg/C6fgRpNs). In a **direct message (DM)** with the bot, run `/id create` to get your identity token.
2. Install `claude code` or `codex`, run `topichub-admin init`, and paste the live base URL `https://hk.ltflange.cn` at **step 1** of the wizard (identity/admin token can be skipped), then `topichub-admin login <identity-token>`.
3. Run `topichub-admin serve` for a pairing code. Back in that Discord server, DM the bot `/register <pairing-code>`, create a channel in the server, run `/create`, then assign tasks and watch results flow back from your local executor.

## What You Get

### Topic-Centered Collaboration

Each task lives as a topic with status lifecycle, timeline, and context. Teams stop losing important decisions in noisy chat history.

### Local-First Agent Execution

Your execution engine runs on your machine. You keep control while still collaborating in shared channels.

### IM-Native Workflows

No context switching for end users. Trigger, discuss, iterate, and close tasks where your team already works.

### Extensible Skill System

Topic behavior can be shaped by Skills, so teams can evolve workflows without redesigning the whole platform.

## How It Feels In Practice

A product manager drops a request in Discord.  
An engineer creates a topic in-channel.  
The local agent executes on that topic.  
Progress, questions, and final output all come back to the same conversation.  
Everyone sees what happened and what changed.

## For Builders and Ops Teams

Topic Hub supports both:

- **high-speed product collaboration** (feature asks, follow-ups, ownership)
- **operational workflows** (incident response, release tracking, postmortem artifacts)

The same interaction model works across both domains: create topic, execute, review, close.

## Technical Docs

All setup, deployment, commands, debugging, and API examples are maintained in `DEBUGGING.md`.

If you want to self-host or integrate deeply, start there.

---

## License

MIT
