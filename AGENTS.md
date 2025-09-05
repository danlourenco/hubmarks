# Repository Guidelines

## Project Structure & Module Organization
- `entrypoints/`: Extension entry points (`background.ts`, `content.ts`, `popup.html`).
- `components/`: React UI components (auto-imported by WXT).
- `hooks/`: Reusable React hooks (auto-imported).
- `utils/`: Core logic (GitHub client, storage, bookmarks, sync) with colocated tests.
- `assets/` and `public/`: Static assets; `public/` is copied as-is to the build.
- `docs/`: Architecture, data flow, and testing references.
- Config: `wxt.config.ts`, `vitest.config.ts`, `tsconfig.json`.

## Build, Test, and Development Commands
- `npm run dev`: Start WXT dev server (Chrome by default).
- `npm run dev:firefox`: Dev server targeting Firefox.
- `npm run build`: Production build of the extension.
- `npm run zip`: Package the built extension as a distributable zip.
- `npm run compile`: Type-check with TypeScript (no emit).
- `npm test` | `npm run test:watch` | `npm run test:coverage`: Run Vitest, watch mode, or coverage.

## Coding Style & Naming Conventions
- Language: TypeScript + React 19. Prefer functional components and hooks.
- Indentation: 2 spaces; keep imports sorted and minimal.
- Naming: `PascalCase` for components (`SyncStatus.tsx`), `camelCase` for utilities (`github.ts`).
- Tests: `*.test.ts` / `*.test.tsx` colocated near code.
- Path alias: import from project root with `~` (e.g., `import { github } from '~/utils/github'`).

## Testing Guidelines
- Framework: Vitest (`jsdom`) + Testing Library.
- Setup file: `test-setup.ts` (see `vitest.config.ts`).
- Coverage: reporters enabled; target ~80% unit coverage (see `docs/testing.md`).
- Run a single file: `npm test utils/storage.test.ts`.

## Commit & Pull Request Guidelines
- Commits: Conventional Commits.
  - Examples: `feat: add GitHub authentication`, `fix: resolve sync race`, `test: add storage manager tests`.
- PRs: clear description, linked issue, screenshots of UI changes, and tests for new/changed logic. Update `docs/` when behavior or architecture changes.

## Security & Configuration Tips
- Never commit tokens or secrets. Configure the GitHub token via the extension’s Options UI.
- Do not modify `.output/` or `.wxt/` directly (generated).
- Keep changes focused; prefer small, reviewable PRs and include type-checks and tests before submitting.
