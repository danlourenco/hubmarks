---
name: "feat(app): extract sync engine (state machine)"
about: Move orchestration to app/sync-engine.ts with deterministic states
labels: enhancement, app, v2
---

## Summary
Extract a small sync engine state machine (idle → read → merge → write → apply → done/error) with pure composition and adapters.

## Tasks
- [ ] Create `app/sync-engine.ts` implementing the state machine.
- [ ] Compose domain functions and adapters; no UI logic inside.
- [ ] Unit tests for each transition; integration test for a full run.

## Acceptance Criteria
- [ ] Engine runs existing flows; tests for success and error paths.
- [ ] Deterministic transitions; no hidden side‑effects.

