# Quickstart: Superadmin Identity Model

**Feature**: 011-superadmin-identity  
**Date**: 2026-04-11

## Prerequisites

- Node.js 20 LTS
- MongoDB 7 running locally or accessible
- pnpm installed

## Setup (Developer)

```bash
# Clone and install
git checkout 011-superadmin-identity
pnpm install

# Build all packages
pnpm -r build
```

## End-to-End Flow

### 1. Initialize the system (creates superadmin)

```bash
# Start the server
pnpm --filter @topichub/server start

# In another terminal — initialize
topichub-admin init --server http://localhost:3000

# Output:
# System initialized!
# Superadmin token: sa_a1b2c3d4e5f6...
# Store this token securely. It cannot be retrieved again.
```

### 2. Create a user identity (superadmin action)

```bash
topichub-admin identity create \
  --token sa_a1b2c3d4e5f6... \
  --unique-id alice \
  --name "Alice Chen" \
  --server http://localhost:3000

# Output:
# Identity created: alice (Alice Chen)
# Identity token: id_d4e5f6a7b8c9...
# Give this token to the user.
```

### 3. Start a local executor (user action)

```bash
topichub-admin serve \
  --token id_d4e5f6a7b8c9... \
  --server http://localhost:3000

# Output:
# Executor registered with server.
# Executor token: eth_x1y2z3w4v5u6...
# Use this token with /topichub register on your IM platform.
# Listening for tasks...
```

### 4. Register on IM platform (user action)

On Feishu/Discord/Telegram/Slack, send:

```
/topichub register eth_x1y2z3w4v5u6...
```

Response: "Registered! Your IM commands will be routed to executor eth_x1y2... (alice@my-laptop)."

### 5. Use the system from IM

```
/topichub create bug "Login page broken"
```

The command is routed to Alice's local executor, which processes it and replies via IM.

### 6. Switch executor (user action)

Start a second executor on another machine, get its executor token, then on IM:

```
/topichub register eth_newtoken123...
```

All subsequent IM commands now route to the new executor.

## Testing

```bash
# Run all tests
pnpm -r test

# Run core package tests only
pnpm --filter @topichub/core test

# Run integration tests
pnpm --filter @topichub/server test:e2e
```

## Key Differences from Previous Model

| Before (Tenant Model) | After (Identity Model) |
|----------------------|----------------------|
| Create a tenant first | Run `init` once (auto-creates superadmin) |
| API key per tenant | Identity token per user + executor token per process |
| `tenantId` on every query | No tenant scoping — data is global |
| Pairing code + CLI link | Direct `register <executor-token>` on IM |
| One executor per tenant-user | Multiple executors per identity |
| Switch tenant = switch context | Switch executor = `register` with different token |
