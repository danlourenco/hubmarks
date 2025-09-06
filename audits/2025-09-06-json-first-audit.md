# HubMark Audit — JSON‑First Integration (2025‑09‑06)

This document captures a thorough re‑review of the codebase after the JSON‑first pivot, plus a precise change list to bring the implementation in line with the docs and eliminate current risks.

## Summary Assessment

### The Good
- JSON‑first building blocks exist: Ajv schema + tests (`utils/json-schema.ts`, `utils/json-schema.test.ts`).
- `JSONGitHubClient` implements read/write with 409 retry/backoff and README generation.
- MV3 compliance is solid (`chrome.alarms` for timers, base64 Web APIs for encoding).
- Tailwind + DaisyUI are now loaded on Options; form UI contrast issues are resolved.
- Docs updated to reflect JSON‑first architecture.

### The Bad
- JSON‑first is only partially integrated into the live sync path:
  - `SyncManager` still uses `GitHubClient` directly and writes JSON manually (no Ajv validation, no 3‑way merge, no 409 re‑merge).
  - Paths diverge: `SyncManager` uses `bookmarks.json` + root `README.md`; `JSONGitHubClient` uses `bookmarks/data.json` + `bookmarks/README.md`.
- Encoding layering regression: `JSONGitHubClient.writeBookmarkData` base64‑encodes content and then calls `GitHubClient.updateFile/createFile` which base64‑encodes again (double encoding). `readBookmarkData` then decodes again. This is brittle and wrong layering.
- IDs are inconsistent with the schema: `utils/bookmarks.ts` generates short 8‑hex IDs, but the schema and `stable-id.ts` expect 32‑char hashes (`^hm_[a-z0-9]{32,}$`).
- Deletions still not implemented in the live path (no `toDelete` derivation; no base/3‑way merge usage).
- Strategy naming mismatches remain in places (e.g., `'browser-wins'` vs `'local-wins'`).

### The Ugly
- Two parallel solutions for the same problem (manual JSON in `SyncManager` vs `JSONGitHubClient`) with different file paths and behaviors = future data drift and corruption.
- Without validation on the active write path and with non‑compliant IDs, you risk writing JSON that fails your own schema.

### Does It Match The Docs?
Partially. The codebase has the right utilities and documentation, but the live sync flow doesn’t yet adopt them end‑to‑end.

## Precise Change List (Implementation Plan)

The goal is to consolidate the sync pipeline around the JSON‑first client, ensure schema compliance, and remove path/encoding drift. No behavior should be duplicated.

### 1) Consolidate SyncManager onto JSONGitHubClient
- File: `utils/sync.ts`
  - Replace direct `GitHubClient` JSON reads/writes with `JSONGitHubClient` end‑to‑end:
    - Import and construct `JSONGitHubClient` (using the existing `GitHubConfig`).
    - Use `readBookmarkData()` to obtain `{ data, sha }` and validate.
    - Compute `base` (last known), `local` (from browser), `remote` (from JSON) and `deletions`.
    - Use `mergeBookmarks(base, local, remote, deletions, strategy)` to obtain `merged`, `conflicts`, and `stats`.
    - If strategy is `manual` and conflicts remain, surface to UI and stop; otherwise, proceed.
    - Write back using `writeBookmarkData(mergedData, message, sha)` (with 409 retry/backoff handled inside).
    - Update README via `updateReadmeIfChanged(mergedData)`.
  - Remove any direct usage of `parseMarkdownContent`/`generateMarkdownContent` in the sync path (keep for migration only, if needed).

### 2) Fix Encoding Layering in JSONGitHubClient (single source of base64)
- File: `utils/json-github.ts`
  - In `writeBookmarkData`: pass the plain JSON string to `GitHubClient.updateFile/createFile` and let `GitHubClient` handle base64 encoding (as it already does across the codebase). Remove `browserSafeEncode` here.
  - In `readBookmarkData`: `GitHubClient.getFileContent` returns UTF‑8; remove `browserSafeDecode` and `JSON.parse` the returned string directly.
  - Keep `browserSafeEncode/Decode` exported for other consumers that need raw base64, but do not use it in JSON read/write.

### 3) Standardize Repository Paths
- Choose one canonical structure and apply it everywhere (code + docs + tests):
  - Recommended: `bookmarks/data.json` (source of truth) and `bookmarks/README.md` (generated view).
- File updates:
  - `utils/sync.ts`: change any `bookmarks.json` / `README.md` root references to `bookmarks/data.json` and `bookmarks/README.md`.
  - `utils/json-github.ts`: ensure `dataPath = 'bookmarks/data.json'` and `readmePath = 'bookmarks/README.md'` (already set).
  - Docs: `README.md`, `docs/json-architecture.md`, `docs/api-reference.md` — make paths consistent.

### 4) Enforce 32‑char Stable IDs Everywhere
- Files: `utils/bookmarks.ts`, any producer of `StoredBookmark`/`HubMarkBookmark` IDs
  - Replace the 8‑hex synchronous ID with either:
    - `utils/stable-id.generateStableId(url, title)` (async SHA‑256 → 32 chars), or
    - a synchronous equivalent that produces 32 lower‑case hex chars to satisfy `^hm_[a-z0-9]{32,}$`.
  - Ensure all new bookmarks conform to the schema before writing JSON.
  - Consider a one‑time migration mapping for legacy 8‑char IDs, or re‑compute IDs deterministically to avoid duplicates.

### 5) Implement Deletions via 3‑Way Merge
- Persist a minimal “base” for 3‑way merges (e.g., last synced JSON bookmarks and/or last SHA):
  - Storage addition (if not present): `storageManager.getSyncBase()` / `setSyncBase()` to persist the last known remote dataset (or just the last SHA and rebuild base from that on next read).
- In `SyncManager`, pass `base`, `local`, and `remote` into `mergeBookmarks` and let it compute added/modified/deleted and conflicts according to the selected strategy.
- Update the persisted base after a successful write.

### 6) Strategy Naming Consistency
- Map UI `'browser-wins'` to merge strategy `'local-wins'` internally (or rename everywhere). Ensure both SyncManager and JSONGitHubClient treat the strategy vocabulary consistently.

### 7) README Generation: Single Codepath
- Remove README write logic from `SyncManager`; always call `JSONGitHubClient.updateReadmeIfChanged(mergedData)` after a successful JSON write.
- Only write when content actually changes (already handled in JSONGitHubClient).

### 8) Tests to Add/Adjust
- End‑to‑end JSON sync:
  - `readBookmarkData` → `mergeBookmarks` (with base and conflicting edits) → `writeBookmarkData` with 409 retry path → `updateReadmeIfChanged`.
- Schema conformance:
  - IDs match `^hm_[a-z0-9]{32,}$`; required fields present.
- Deletions:
  - Base contains an ID, local removes it, remote unchanged → deleted; and vice‑versa.
- Encoding:
  - Assert files round‑trip as UTF‑8 strings through GitHubClient; no double encoding.
- Strategy mapping:
  - `'browser-wins'` UI value maps to `'local-wins'` merge behavior.

### 9) Migration Notes (Optional, if legacy repos exist)
- Detect `bookmarks.md` if `bookmarks/data.json` is missing:
  - Best‑effort parse → build JSON → validate → write `bookmarks/data.json` → generate `bookmarks/README.md` → optionally keep `bookmarks.md` as legacy.

---

By consolidating on JSONGitHubClient, fixing encoding, aligning paths, enforcing schema‑compliant IDs, and driving the live sync through a 3‑way merge, you’ll match the docs’ promises and dramatically reduce data corruption risk.

