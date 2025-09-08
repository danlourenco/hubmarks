---
name: "feat(adapter-storage): abstract storage via unstorage"
about: Use unstorage with a chrome driver and memory driver for tests
labels: enhancement, adapter, v2
---

## Summary
Replace direct chrome.storage calls in app layer with unstorage; keep a small chrome driver adapter; enable memory driver in tests.

## Tasks
- [ ] Create chrome driver for unstorage.
- [ ] Refactor app to depend on unstorage API for settings, base, lastSync.
- [ ] Tests swapping drivers.

## Acceptance Criteria
- [ ] App code no longer directly depends on chrome.storage.
- [ ] Tests pass with memory driver.

