---
name: "feat(adapter-messaging): typed background/UI RPC"
about: Define discriminated unions for messages and responses
labels: enhancement, adapter, v2
---

## Summary
Introduce typed RPC between UI and background with discriminated unions and runtime guards.

## Tasks
- [ ] Define message/response unions; encode types in a shared module.
- [ ] Add runtime guards (zod or TS narrowing with exhaustiveness checks).
- [ ] Update hooks to use typed RPC; add tests.

## Acceptance Criteria
- [ ] Invalid messages rejected; handlers are exhaustively matched.

