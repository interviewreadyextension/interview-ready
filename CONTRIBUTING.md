# Contributing to Interview Ready

Chrome Extension (Manifest V3) built with **Vite + React + TypeScript**.

## Build

```bash
npm install
npx tsc && npx vite build && npx vite build --config vite.config.content.ts
```

Output goes to `dist/`.

**Why two Vite configs?** Chrome extension popups support `<script type="module">`, so the popup is built as a standard ES-module React app (`vite.config.ts`). Content scripts cannot use ES modules — they must be a single IIFE file — so the content script has its own build (`vite.config.content.ts`). The second build runs with `emptyOutDir: false` to avoid wiping the popup output.

## Test

```bash
npx vitest
```

55 tests across readiness logic, sync layers, cache, strategy, fetch, and manifest validation.

## Loading & Debugging Locally

1. Build (see above)
2. Open `chrome://extensions`, enable **Developer Mode**
3. Click **Load unpacked** and select the `dist/` folder
4. Visit [leetcode.com](https://leetcode.com) — the content script runs automatically
5. Click the extension icon to open the popup

**Debugging tips:**
- **Content script logs**: Open DevTools on any leetcode.com tab → Console. All `delog()` output appears here (dev builds only — when `update_url` is absent from the manifest).
- **Popup DevTools**: Right-click the popup → Inspect. React state, storage reads, and readiness computations log here.
- **Storage inspector**: In either DevTools console, run `chrome.storage.local.get(null, console.log)` to dump all stored data.
- **After code changes**: Rebuild, then click the refresh icon on `chrome://extensions` (or press Ctrl+R on the extension card). Reload the leetcode.com tab to re-run the content script.

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
