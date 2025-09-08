---
name: "perf: caching and rate-limit friendly changes"
about: Optimize browser adapter, skip no-op writes, and reduce API calls
labels: performance, v2
---

## Summary
Improve performance by caching folder paths, computing deltas, and skipping no-op README writes.

## Tasks
- [ ] Cache common folder paths and avoid repeated getTree.
- [ ] Skip README updates when content unchanged.
- [ ] Add timing tests for large bookmark sets.

## Acceptance Criteria
- [ ] Significant reduction in API calls; large sets sync within target time.

