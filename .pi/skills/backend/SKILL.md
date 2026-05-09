---
description: Engineer collaborative skill. Use for APIs, services, data modeling, auth, async and queue work.
---

# Backend

Use for APIs, services, data modeling, auth, async work.

## Defaults

- **API shape:** match the project's existing convention (REST, RPC, GraphQL). Don't introduce a second style.
- **Validation:** validate at the boundary. Inputs from the network are untrusted by default.
- **Error model:** typed errors with stable codes; don't leak internals in error messages.
- **Idempotency:** mutating endpoints take an idempotency key when retries are plausible.

## Rules

- Database changes always go via migration files, never ad-hoc SQL.
- Indexes are added with the query they support, not "just in case."
- N+1 queries get caught in code review, not in production. Batch or eager-load.
- Auth checks are at the boundary, not inside business logic. One layer of enforcement, not five.
- Background jobs are retry-safe and idempotent; assume the message will be delivered twice.
- Never log secrets, PII, or full request bodies for endpoints that handle either.

## Performance / safety checklist before merge

- What's the worst-case query plan for any new endpoint?
- What happens if the downstream service is down for 5 minutes?
- What's the rate-limit story for this endpoint?
- Is there a kill switch / feature flag for risky changes?