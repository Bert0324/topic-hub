# Quickstart: verify IM ↔ executor mapping (015)

## Preconditions

- MongoDB + Topic Hub server running with OpenClaw bridge configured.
- Two IM test accounts (or one account + second workspace) if testing credential switch.

## Happy path

1. Run `topichub-admin serve` (or project CLI equivalent); note **pairing code**.
2. In **DM**, `/register <code>` for **IM identity A** — expect success.
3. In **topic group** with active topic, send a relay line — expect “Your local agent is running…” then completion in **same** thread.
4. `/agent list` — expect roster; with one agent, no `#N` required on relay (per spec).

## Security checks

1. **Wrong token**: Stop `serve`, start another instance with new registration, **do not** re-register IM A → send command → expect **executor unavailable** (no dispatch to wrong process).
2. **Identity B**: From IM identity **B** (never `/register`) → same group → expect **not linked** (no dispatch).
3. **Re-bind A**: `/register` with **new** code from current `serve` → relay again → expect success; old session should not receive new work.

## FR-014 UX check (≥2 agents)

1. `/agent create` until two slots exist.
2. Send relay **without** `#N` → completion copy should **explicitly** reference **agent #1** (once implemented per plan tasks).
3. Send with `#2` prefix → completion should reference **#2**.
