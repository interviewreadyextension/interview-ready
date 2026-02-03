import test from "node:test";
import assert from "node:assert/strict";

import { randomElementInArray } from "../../src/readiness-logic/random.js";

test("randomElementInArray returns an element from the array", () => {
  const arr = ["a", "b", "c"];
  const v = randomElementInArray(arr);
  assert.ok(arr.includes(v));
});

test("randomElementInArray returns null for empty arrays (intended robustness)", () => {
  // Intended behavior: callers should never navigate to /problems/undefined.
  assert.equal(randomElementInArray([]), null);
});
