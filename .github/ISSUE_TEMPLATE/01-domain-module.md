---
name: "feat(domain): introduce domain module layout"
about: Move pure logic into domain/ with tests
labels: enhancement, domain, v2
---

## Summary
Introduce a `domain/` module containing pure, dependency‑free logic (types, IDs, transforms, diff/merge, markdown) with unit tests.

## Tasks
- [ ] Create `domain/` folder and files: `bookmark.ts`, `id.ts`, `transforms.ts`, `diff.ts`, `merge.ts`, `markdown.ts`.
- [ ] Move existing pure logic from `utils/` into `domain/` (no adapter imports).
- [ ] Add unit tests for all pure functions.

## Acceptance Criteria
- [ ] Domain compiles standalone (no references to browser or GitHub APIs).
- [ ] Tests cover ID generation, canonicalization, transforms, merge3, and markdown rendering.
- [ ] No behavior change in app; build is green.

