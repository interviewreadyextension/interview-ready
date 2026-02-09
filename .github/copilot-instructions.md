# Interview Ready - Copilot Instructions

## 🏗️ Architecture Overview
This is a Chrome Extension (Manifest V3) that tracks LeetCode readiness.
- **Content Script (`src/onsite/content-script.js`)**: Runs on `leetcode.com`. Fetches data from LeetCode's GraphQL API and syncs it to `chrome.storage.local`.
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

## 📝 Key Data Structures
- **Storage Keys**: `userDataKey`, `problemsKey`, `recentSubmissionsKey`.
- **Readiness Logic**: Configuration for target topics and problem counts is in `src/readiness-logic/target-topics.js`.

## 📌 Notable Technical Debt
- **Hardcoded Username**: `src/onsite/content-script.js` currently has a hardcoded username `"michael187"` in `updateRecentAcceptedSubmissions`. This should eventually be replaced by the dynamic username from `userDataKey`.
