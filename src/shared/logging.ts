/**
 * Debug-only logging function
 * Only logs when update_url is missing from manifest (development mode)
 */

function isDebug(): boolean {
  try {
    return !('update_url' in chrome.runtime.getManifest());
  } catch {
    return true; // Assume debug in test/dev environments
  }
}

export function delog(message: unknown): void {
  if (isDebug()) {
    console.log(message);
  }
}

export function delogError(message: unknown, error?: unknown): void {
  if (isDebug()) {
    console.error(message, error);
  }
}
