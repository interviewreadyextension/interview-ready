# Interview Ready - Copilot Instructions

## 🏗️ Architecture Overview
This is a Chrome Extension (Manifest V3) that tracks LeetCode readiness.
- **Content Script (`src/onsite/content-script.js`)**: Runs on `leetcode.com`. Syncs user status + submissions from LeetCode's GraphQL API and problem data from GitHub raw JSON into `chrome.storage.local`.
- **Popup UI (`src/ux/popup/home/home.js`)**: The main interface. Reactively renders state by listening to `chrome.storage.onChanged`.
- **Logic (`src/readiness-logic/`)**: Modular functions for calculating readiness scores and problem recommendations.

## 🛠️ Critical Workflows
- **Syncing Data**: The UI triggers a refresh by setting `refresh_problems` or `modal_opened` in `chrome.storage.local`. The content script listens for these keys and executes API calls.
- **Mocking**: `src/shared/mock.js` can be used to simulate the Chrome environment for testing logic outside the extension runtime.

## ⚠️ Project Conventions & Constraints
- **NO BUNDLER**: The `onsite/content-script.js` file is NOT bundled. 
    - **Do NOT use `import`/`export`** in `content-script.js`.
    - Content script contains manual copies of shared code (marked with `// COPY OF ...`). Update copies if original shared files change.
- **Logging**: Use `delog(msg)` from `src/shared/logging.js` instead of `console.log`. It only logs in development (when `update_url` is missing from manifest).
- **Communication**: Always use `chrome.storage.local` and `chrome.storage.onChanged` for state synchronization between the popup and content script.

## ✅ Project Requirements (Hard Rules)
1. **Never query LeetCode directly for problem data.** Problem data comes exclusively from the GitHub-hosted `data/problems.json` file, fetched via the raw URL. If the GitHub fetch fails, the extension uses whatever is already cached in `chrome.storage.local` and raises a flag.
2. **Submissions come from LeetCode's submission list API**, authenticated by the user's session cookies on `leetcode.com`. This is the only acceptable direct LeetCode query the content script makes (besides user status).
3. **No bundler.** The content script cannot use `import`/`export`. Shared logic lives in `src/shared/` with ES module exports, and is manually copied into `src/onsite/content-script.js` (marked with `// COPY OF ...` comments).
4. **Use `delog()` for logging**, never bare `console.log`. Only logs in development (when `update_url` is missing from manifest).
5. **Communication between popup and content script** uses `chrome.storage.local` and `chrome.storage.onChanged`. No direct messaging.

## 🧱 Data Architecture

### Problems (`problemsKey`)
- **Source**: GitHub raw URL → `data/problems.json` (generated daily by GitHub Actions)
- **Fetch cadence**: Once per 24 hours (semaphore pattern — set `fetchStartedAt` before fetch)
- **On failure**: Keep cached data, record `lastError`, clear semaphore
- **Format**: `{ data: { problemsetQuestionList: { total, questions: [...] } }, fetchStartedAt, fetchCompletedAt, timeStamp, source, lastError }`

### Submissions (`recentSubmissionsKey`)
- **Source**: LeetCode `questionSubmissionList` GraphQL API (user-authenticated)
- **First sync**: Full paginated fetch of all submissions, filter to accepted only
- **Subsequent syncs**: Incremental — fetch pages until we encounter the `lastSyncedTimestamp`
- **Chronological validation**: Every page and final result are validated for descending timestamp order. Violations throw loud, descriptive errors.
- **Format**: `{ data: { recentAcSubmissionList: [...] }, firstSyncedAt, lastSyncedAt, lastSyncedTimestamp, timeStamp, source, lastError }`

### User Status (`userDataKey`)
- **Source**: LeetCode `globalData` GraphQL API
- **Contains**: `isSignedIn`, `isPremium`, `username`
- Fetched on every content script load (every LeetCode tab open)

## 🤖 GitHub Actions
- **Workflow**: `.github/workflows/sync-problems.yml`
- **Script**: `scripts/fetch-problems.mjs` (Node.js)
- Runs daily at midnight UTC, fetches all problems in 100-item batches from LeetCode GraphQL, writes `data/problems.json`, commits if changed.
- This is the **only** place that queries LeetCode for problem data.

## 🧪 Testing
- Test runner: `node --test` (Node.js built-in)
- Tests live in `tests/unit/*.test.js`
- Chrome APIs mocked via `tests/unit/_helpers.mjs` (`installChromeStub` / `uninstallChromeStub`)
- Sync logic is testable via `src/shared/sync-logic.js` (ES module with exports)
- Content script copy is validated by static analysis tests

## 🪲 Debug Panel
- Collapsible `<details>` element at bottom of popup
- Shows: user, problems metadata (source, timestamps, errors, count), submissions metadata
- Labels data as `(legacy - pre-migration data)` when metadata fields are absent

## 📝 Key Data Structures
- **Storage Keys**: `userDataKey`, `problemsKey`, `recentSubmissionsKey`.
- **Readiness Logic**: Configuration for target topics and problem counts is in `src/readiness-logic/target-topics.js`.

## 📌 Notable Technical Debt
- **Hardcoded Username**: `src/onsite/content-script.js` currently has a hardcoded username `"michael187"` in `updateRecentAcceptedSubmissions`. This should eventually be replaced by the dynamic username from `userDataKey`.
