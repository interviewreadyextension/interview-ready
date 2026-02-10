/**
 * Shared utility functions used across the extension.
 */

/** Simple async delay — resolves after `ms` milliseconds. */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
