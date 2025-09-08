---
name: "feat(app): implement 409 re-merge & retry"
about: Re-read remote on 409, re-merge, and retry with backoff
labels: enhancement, app, v2
---

## Summary
When GitHub returns 409 on write, re-read the latest remote, re-run merge (base := latest), and retry with exponential backoff.

## Tasks
- [ ] Add re-merge step in retry loop.
- [ ] Exponential backoff with jitter; cap attempts.
- [ ] Tests simulating 409 → success on retry; and max-retry failure.

## Acceptance Criteria
- [ ] Data loss avoided under concurrent writes; tests pass reliably.

