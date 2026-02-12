/**
 * Vitest global setup — provides a chrome.storage.local mock so
 * every test that reads/writes storage works without a real browser.
 *
 * Individual tests should call `installChromeStub()` / `uninstallChromeStub()`
 * from `./helpers` to set up specific initial data.
 */
import { afterEach } from 'vitest';
import { uninstallChromeStub } from './helpers';

// Clean up after every test automatically
afterEach(() => {
  uninstallChromeStub();
});
