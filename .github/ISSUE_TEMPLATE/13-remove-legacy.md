---
name: "chore: remove legacy code and duplicates"
about: Remove sync-old.ts and consolidate markdown generators
labels: cleanup, v2
---

## Summary
Remove legacy code (`utils/sync-old.ts`) and consolidate markdown generators into a single module.

## Tasks
- [ ] Delete `utils/sync-old.ts`.
- [ ] Keep a single markdown rendering implementation.

## Acceptance Criteria
- [ ] Build remains green; no references to legacy code.

