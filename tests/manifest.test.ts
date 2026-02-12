import { describe, test, expect } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';

const manifestPath = path.resolve(__dirname, '../public/manifest.json');

describe('manifest.json', () => {
  test('declares tabs and storage permissions', async () => {
    const raw = await fs.readFile(manifestPath, 'utf8');
    const manifest = JSON.parse(raw);

    const permissions = new Set(manifest.permissions ?? []);
    expect(permissions.has('tabs')).toBe(true);
    expect(permissions.has('storage')).toBe(true);
  });

  test('content script matches leetcode.com and points at onsite/content-script.js', async () => {
    const raw = await fs.readFile(manifestPath, 'utf8');
    const manifest = JSON.parse(raw);

    const cs = manifest.content_scripts?.[0];
    expect(cs).toBeDefined();
    expect(cs.matches).toContain('https://leetcode.com/*');
    expect(cs.js).toContain('/onsite/content-script.js');
  });
});
