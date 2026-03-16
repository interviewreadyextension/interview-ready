/**
 * Paste this script in the Chrome DevTools console while on the
 * Interview Ready extension popup (or any page where chrome.storage
 * is available) to export the current extension state as JSON files.
 *
 * Usage:
 *   1. Right-click the Interview Ready extension icon → "Inspect popup"
 *      (or go to chrome://extensions, enable Developer Mode,
 *       click "Inspect views: popup.html")
 *   2. Open the Console tab in the DevTools that appear
 *   3. Paste this entire script and press Enter
 *   4. Three JSON files will be downloaded automatically
 *   5. Move them into tests/mock_data/ in the repo
 */

(async () => {
  const keys = ['problemsKey', 'submissionCacheKey', 'userDataKey'];
  const result = await chrome.storage.local.get(keys);

  const fileMap = {
    problemsKey: 'problems.json',
    submissionCacheKey: 'submission_cache.json',
    userDataKey: 'user_data.json',
  };

  for (const [key, filename] of Object.entries(fileMap)) {
    const data = result[key];
    if (!data) {
      console.warn(`⚠️  "${key}" not found in storage — skipping ${filename}`);
      continue;
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    console.log(`✅  Downloaded ${filename} (${(blob.size / 1024).toFixed(1)} KB)`);
  }

  console.log('🎉  Done! Move the downloaded files to tests/mock_data/');
})();
