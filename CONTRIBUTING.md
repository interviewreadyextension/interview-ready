# Contributing to Interview Ready

Chrome Extension (Manifest V3) built with **Vite + React + TypeScript**.

## Build

```bash
npm install
npx tsc && npx vite build && npx vite build --config vite.config.content.ts
```

Output goes to `dist/`. Load it as an unpacked extension at `chrome://extensions` with Developer Mode enabled.

## Test

```bash
npx vitest
```

55 tests across readiness logic, sync layers, cache, strategy, fetch, and manifest validation.

## Architecture

| Layer | Source | Description |
|-------|--------|-------------|
| Content Script (`src/content-script/index.ts`) | Runs on `leetcode.com` | Orchestrates three-layer sync, writes to `chrome.storage.local` |
| Popup (`src/popup/App.tsx`) | React app | Reads storage reactively, renders readiness dashboard |
| Readiness Logic (`src/readiness-logic/readiness.ts`) | Pure functions | Computes per-topic scores, suggestions, availability |

Communication between the popup and content script is exclusively through `chrome.storage.local` and `chrome.storage.onChanged` — no direct messaging.

## Three-Layer Sync

1. **Layer 1 — Problem catalog** (`src/sync/problem-sync.ts` → `src/api/leetcode-problems.ts`)
   Batch-fetches all ~3,800 problems via `problemsetQuestionList` GraphQL. Each problem includes the user's `status` ('ac' | 'notac' | null) because the content script runs authenticated on leetcode.com. TTL: 24 hours.

2. **Layer 2 — Submission cache** (`src/sync/submission-cache.ts` → `src/api/leetcode-graphql.ts`)
   Per-problem `questionSubmissionList` scan for accepted timestamps. Uses a strategy pattern (`src/sync/scan-strategy.ts`): `TargetedStrategy` only queries `status === 'ac'` problems; `EagerStrategy` queries all attempted. Sequential with 30 ms throttle, checkpoints every 10 problems.

3. **Layer 3 — Incremental sync** (`src/sync/submission-sync.ts`)
   Fast ~20 recent-accepted check via `recentAcSubmissionList`. Gap detection: if no overlap with the existing cache, marks it stale so Layer 2 re-runs.

## Key Conventions

- **Logging** — `delog()` / `delogError()` from `src/shared/logging.ts`. Only logs in dev (when `update_url` is absent from the manifest).
- **Storage keys** — centralised in `src/storage/storage-keys.ts`, accessed through `src/storage/storage-service.ts`.
- **Types** — domain models in `src/types/models.ts`, storage shapes in `src/types/storage.types.ts`, LeetCode API shapes in `src/types/leetcode.types.ts`.

## Data Flow

| Storage Key | Source | Description |
|-------------|--------|-------------|
| `problemsKey` | LeetCode `problemsetQuestionList` (authenticated) | Full problem catalog with per-user status |
| `submissionCacheKey` | Per-problem `questionSubmissionList` (authenticated) | `{ [slug]: { solved, latestAcceptedTimestamp, checkedAt } }` |
| `userDataKey` | LeetCode `globalData` | `isSignedIn`, `isPremium`, `username` |

## Project Structure

```
src/
  api/                  # LeetCode GraphQL fetch functions
  content-script/       # Extension entry point (runs on leetcode.com)
  popup/                # React popup app (dashboard UI)
  readiness-logic/      # Pure readiness computation functions
  shared/               # Logging, utilities
  storage/              # Storage keys and type-safe wrappers
  sync/                 # Three-layer sync orchestration
  types/                # TypeScript interfaces and type definitions
public/
  manifest.json         # Chrome extension manifest
  ux/                   # Icons and options page
tests/                  # Vitest test suite
```

## CI/CD

`.github/workflows/publish.yml` — builds the project and uploads `dist/` to the Chrome Web Store when `public/manifest.json` changes.
