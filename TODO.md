# TODO

## E2E Testing with Playwright + LeetCode Auth

Set up automated E2E testing for the Chrome extension using Playwright with cookie-based LeetCode authentication.

### Tasks
- [ ] Install Playwright as a dev dependency
- [ ] Create a helper script to extract `LEETCODE_SESSION` cookie from Chrome (opens browser, user logs in manually, script captures and saves the cookie to `.env`)
- [ ] Write Playwright E2E test setup that:
  - Loads the built extension via `--load-extension=./dist`
  - Injects `LEETCODE_SESSION` cookie from `.env` via `context.addCookies()`
  - Runs in headed mode (extensions require it)
- [ ] Write E2E test cases:
  - Extension popup renders when signed in
  - Practice button opens a new LeetCode tab
  - Refresh triggers sync (verify storage keys update)
  - Popup shows sign-in prompt when not authenticated
- [ ] Add `.env` to `.gitignore` (cookie is sensitive)

### Notes
- `LEETCODE_SESSION` cookie expires ~weekly — the helper script makes refresh quick
- The extension uses `credentials: 'include'` on `fetch` calls, so injecting the cookie into the browser context is sufficient
- Consider adding API mocking (Playwright `route.fulfill()`) for CI where real auth isn't available
