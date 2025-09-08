---
name: "feat(app): structured logging + lifecycle hooks"
about: Introduce consola logs and hookable lifecycle events
labels: enhancement, app, v2
---

## Summary
Replace ad‑hoc console logs with `consola` and expose lifecycle hooks via `hookable`.

## Tasks
- [ ] Add `consola` and replace console.* in the sync path with leveled logs.
- [ ] Add `hookable` and expose: `beforeRead`, `afterRead`, `beforeMerge`, `afterMerge`, `beforeWrite`, `afterWrite`, `beforeApply`, `afterApply`.
- [ ] Wire a simple hook listener in dev to print timings.

## Acceptance Criteria
- [ ] Logs are structured and respect log levels; can be silenced in production.
- [ ] Hooks fire in order; tests assert that hooks are called.

