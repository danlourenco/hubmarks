---
name: "feat(security-optional): HMAC-based IDs (opt-in)"
about: Add privacy option to derive IDs with HMAC-SHA-256
labels: enhancement, security, v2
---

## Summary
Add an opt-in privacy setting to derive stable IDs via HMAC-SHA-256 with a per-user secret, preventing preimage guessing.

## Tasks
- [ ] Add setting and secure local key storage.
- [ ] Update ID generator to use HMAC when enabled.
- [ ] Migration behavior clarified (IDs won’t match non-HMAC repos).

## Acceptance Criteria
- [ ] HMAC mode works, validated against schema; docs updated.

