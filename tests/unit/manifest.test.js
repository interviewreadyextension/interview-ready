import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

const manifestPath = new URL("../../src/manifest.json", import.meta.url);

test("manifest declares tabs permission (popup uses chrome.tabs.*)", async () => {
  // Intended behavior: popup can open/login and navigate the current tab.
  const raw = await fs.readFile(manifestPath, "utf8");
  const manifest = JSON.parse(raw);

  const permissions = new Set(manifest.permissions ?? []);
  assert.ok(permissions.has("tabs"));
  assert.ok(permissions.has("storage"));
});

test("manifest content script matches leetcode.com and points at onsite/content-script.js", async () => {
  const raw = await fs.readFile(manifestPath, "utf8");
  const manifest = JSON.parse(raw);

  const cs = manifest.content_scripts?.[0];
  assert.ok(cs);
  assert.ok(cs.matches?.includes("https://leetcode.com/*"));
  assert.ok(cs.js?.includes("/onsite/content-script.js"));
});
