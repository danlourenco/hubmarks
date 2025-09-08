---
name: "feat(debug): correlation IDs + debug panel"
about: Add per-sync correlation IDs and a small UI to inspect last sync trace
labels: enhancement, debug, v2
---

## Summary
Add correlation IDs to sync runs and a minimal debug panel in Options to inspect the last sync trace (size-limited, redact secrets).

## Tasks
- [ ] Generate correlation ID per sync; include in logs.
- [ ] Persist last N sync summaries in storage (bounded).
- [ ] Options page component to display a recent trace.

## Acceptance Criteria
- [ ] Dev can trace a full sync; no sensitive values exposed.

