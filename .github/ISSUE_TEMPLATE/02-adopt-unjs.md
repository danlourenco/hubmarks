---
name: "chore(domain): adopt unjs (ufo, uncrypto, defu)"
about: Replace custom utilities with unjs packages
labels: enhancement, domain, v2
---

## Summary
Adopt unjs packages to replace bespoke utilities:
- `ufo` for URL canonicalization
- `uncrypto` for SHA‑256/HMAC
- `defu` for deep defaults

## Tasks
- [ ] Replace custom URL normalization with `ufo` helpers.
- [ ] Replace Web Crypto wrappers with `uncrypto` for SHA‑256 (and HMAC as opt‑in).
- [ ] Use `defu` to merge settings/policies with defaults.

## Acceptance Criteria
- [ ] ID generation and canonicalization match previous behavior (existing tests pass).
- [ ] No local crypto helpers left; all hashing via `uncrypto`.
- [ ] Settings defaulting uses `defu`; no ad‑hoc object spreads for defaults.

