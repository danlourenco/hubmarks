---
name: "feat(adapter-browser): delta apply (create/update/delete)"
about: Apply merged dataset to browser bookmarks efficiently
labels: enhancement, adapter, v2
---

## Summary
Compute and apply deltas to browser (create/update/delete) instead of full rewrites. Cache folder lookups; avoid repeated getTree.

## Tasks
- [ ] Compute delta sets against current browser state.
- [ ] Batch folder resolution; reduce API calls.
- [ ] Tests for add/edit/delete scenarios.

## Acceptance Criteria
- [ ] Browser reflects merged dataset; minimal operations are performed.

