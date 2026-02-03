import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

const contentScriptPath = new URL("../../src/onsite/content-script.js", import.meta.url);

test("content-script must not hardcode a username for recent accepts", async () => {
  // Intended behavior: use the signed-in user from userDataKey.
  // This will currently FAIL because the script hardcodes "michael187".
  const code = await fs.readFile(contentScriptPath, "utf8");
  assert.ok(!code.includes('"michael187"'));
});

test("content-script storage helper should use computed property names", async () => {
  // Intended behavior: setStoragePromise(key,value) sets the provided key.
  // This will currently FAIL because it uses {key: value} instead of {[key]: value}.
  const code = await fs.readFile(contentScriptPath, "utf8");
  assert.ok(!code.includes("chrome.storage.local.set({key: value})"));
});
