# Interview Ready — Copilot Instructions

## Architecture Overview

Chrome Extension (Manifest V3) built with **Vite + React + TypeScript**.
Tracks LeetCode readiness by syncing problems and submissions, then
computing per-topic readiness scores.

| Layer | Source | Description |
|-------|--------|-------------|
| **Content Script** (`src/content-script/index.ts`) | Runs on `leetcode.com` | Orchestrates three-layer sync, writes results to `chrome.storage.local` |
| **Popup** (`src/popup/`) | React app (`App.tsx`) | Reads storage reactively, renders readiness dashboard with practice buttons |
| **Readiness Logic** (`src/readiness-logic/readiness.ts`) | Pure functions | Computes per-topic readiness, suggestions, availability counts |

### Build

```bash
# Popup (React ES-module bundle) + Content script (IIFE bundle)
npx tsc && npx vite build && npx vite build --config vite.config.content.ts
```

Output goes to `dist/`. Static assets in `public/` are copied as-is.

## Three-Layer Sync Architecture

1. **Layer 1 — Problem catalog** (`src/sync/problem-sync.ts` → `src/api/leetcode-problems.ts`)
   Batch-fetches all ~3 800 problems via `problemsetQuestionList` GraphQL.
   Each problem includes per-user `status` ('ac' | 'notac' | null) because
   the content script runs authenticated on leetcode.com.
   TTL: 24 hours. Progress reported via `_syncProgress_problems`.

2. **Layer 2 — Submission cache** (`src/sync/submission-cache.ts` → `src/api/leetcode-graphql.ts`)
   Per-problem `questionSubmissionList` scan for actual accepted timestamps.
   Uses a **strategy pattern** (`src/sync/scan-strategy.ts`):
   - `TargetedStrategy` — only queries `status === 'ac'` problems (default)
   - `EagerStrategy` — queries all attempted problems
   Sequential with 30 ms throttle, checkpoints every 10 problems.

3. **Layer 3 — Incremental sync** (`src/sync/submission-sync.ts`)
   Fast ~20 recent-accepted check via `recentAcSubmissionList`.
   Gap detection: if no overlap with cache → marks cache stale → Layer 2 re-runs.

## Project Conventions

- **Logging**: Use `delog()` / `delogError()` from `src/shared/logging.ts`. Only logs in development (when `update_url` is absent from manifest).
- **Communication**: Popup ↔ content script exclusively via `chrome.storage.local` and `chrome.storage.onChanged`. No direct messaging.
- **Storage keys**: Centralised in `src/storage/storage-keys.ts`, accessed through `src/storage/storage-service.ts`.
- **Types**: Domain models in `src/types/models.ts`, storage shapes in `src/types/storage.types.ts`, LeetCode API shapes in `src/types/leetcode.types.ts`.

## Data Architecture

### Problems (`problemsKey`)
- **Source**: LeetCode `problemsetQuestionList` GraphQL (authenticated)
- **Fetch cadence**: Once per 24 hours (TTL guard + in-flight guard)
- **On failure**: Keep cached data, record `lastError`, set `usingCache: true`

### Submission Cache (`submissionCacheKey`)
- **Source**: Per-problem `questionSubmissionList` GraphQL (authenticated)
- **Status lifecycle**: `empty → building → valid` (or `stale` if gap detected)
- **Entries**: `{ [titleSlug]: { solved, latestAcceptedTimestamp, checkedAt } }`

### User Status (`userDataKey`)
- **Source**: LeetCode `globalData` GraphQL
- **Contains**: `isSignedIn`, `isPremium`, `username`
- Fetched on every content script load

## Testing

- **Runner**: Vitest (`npx vitest`)
- **Tests**: `tests/**/*.test.ts`
- **Chrome mock**: `tests/setup.ts`
- **55 tests** across readiness, sync, cache, strategy, fetch, manifest

## GitHub Actions

- **Publish**: `.github/workflows/publish.yml` — zips `dist/` and uploads to Chrome Web Store on manifest version bump.
