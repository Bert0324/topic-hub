# Quickstart: IM `/id` onboarding (017)

## For operators

1. Ensure OpenClaw / bridge integration is configured so inbound messages include stable **`platform`** and **`userId`** (see existing bridge docs).
2. **`/id create` and `/id me` are DM-only** in `packages/core/src/webhook/webhook-handler.ts`: if the user tries them in a group, the bot replies asking them to open a DM (tokens are never intentionally returned in group channels).
3. User runs **`/id create`** once → receives **token**, **name**, **id** in chat. Treat the DM thread as **sensitive** (equivalent to a password reset email).
4. User installs CLI and stores the identity token, then runs **`topichub-admin serve`** and **`/register <code>`** as today to link **local execution** to the same identity.
5. Superadmin-created identities remain available for teams that prefer central provisioning.

## For developers

- Run unit/integration tests under `packages/core` after implementing `/id` handlers.
- Add **`CONSTITUTION-EXCEPTION:`** comment at `/id` reply sites: intentional token return per feature spec + link to `specs/017-im-first-identification/spec.md`.

## Verification checklist

- [ ] Duplicate `/id create` blocked with clear message  
- [ ] `/id me` returns consistent fields  
- [ ] Logs contain no identity tokens  
- [ ] Executor-backed commands still require active binding + heartbeat  
- [ ] Outbound replies stay on the same thread/session as inbound  
