import test from "node:test";
import assert from "node:assert/strict";

import { getNextPracticeProblem } from "../../src/readiness-logic/classic.js";
import { getPracticeProblem } from "../../src/readiness-logic/practice.js";
import { installChromeStub, uninstallChromeStub, makeAllProblems, q } from "./_helpers.mjs";

test("popup guards: getNextPracticeProblem must not return null when eligible problems exist", async () => {
  const restoreRandom = Math.random;
  Math.random = () => 0;

  installChromeStub({
    localData: {
      problemsKey: makeAllProblems([
        q({ titleSlug: "valid-problem", difficulty: "Easy", status: null, topicSlugs: ["array"] }),
      ]),
      recentSubmissionsKey: { data: { recentAcSubmissionList: [] } },
      userDataKey: { isPremium: false },
    },
  });

  try {
    const slug = await getNextPracticeProblem("array", "suggested");
    assert.notEqual(slug, null, "Should return a valid slug when problems exist");
    assert.equal(typeof slug, "string", "Should return a string slug");
  } finally {
    Math.random = restoreRandom;
    uninstallChromeStub();
  }
});

test("popup guards: getPracticeProblem('suggested') must not return null when recommended problems exist", async () => {
  installChromeStub({
    localData: {
      problemsKey: makeAllProblems([
        q({ titleSlug: "find-first-palindromic-string-in-the-array", difficulty: "Easy", status: null, topicSlugs: ["array"] }),
      ]),
      recentSubmissionsKey: { data: { recentAcSubmissionList: [] } },
      userDataKey: { isPremium: false },
    },
  });

  try {
    const slug = await getPracticeProblem("suggested");
    assert.notEqual(slug, null, "Should return a valid slug from recommended list");
    assert.equal(typeof slug, "string", "Should return a string slug");
  } finally {
    uninstallChromeStub();
  }
});

test("popup guards: getPracticeProblem('random') must not return null when problems exist", async () => {
  const restoreRandom = Math.random;
  Math.random = () => 0;

  installChromeStub({
    localData: {
      problemsKey: makeAllProblems([
        q({ titleSlug: "some-problem", difficulty: "Medium", status: null, topicSlugs: ["hash-table"] }),
      ]),
      recentSubmissionsKey: { data: { recentAcSubmissionList: [] } },
      userDataKey: { isPremium: false },
    },
  });

  try {
    const slug = await getPracticeProblem("random");
    assert.notEqual(slug, null, "Should return a valid slug for random practice");
    assert.equal(typeof slug, "string", "Should return a string slug");
  } finally {
    Math.random = restoreRandom;
    uninstallChromeStub();
  }
});

// Test that null results are handled properly (user should see message, not silent failure)
test("popup guards: null results should trigger user feedback", async (t) => {
  await t.test("getNextPracticeProblem returns null when no problems match criteria", async () => {
    installChromeStub({
      localData: {
        problemsKey: makeAllProblems([]),  // No problems
        recentSubmissionsKey: { data: { recentAcSubmissionList: [] } },
        userDataKey: { isPremium: false },
      },
    });

    try {
      const slug = await getNextPracticeProblem("array", "easy");
      assert.strictEqual(slug, null, "Should return null when no problems exist");
      // In UI: onTopicClick checks for null and calls showMessage()
    } finally {
      uninstallChromeStub();
    }
  });

  await t.test("getPracticeProblem returns null when mode has no available problems", async () => {
    installChromeStub({
      localData: {
        problemsKey: makeAllProblems([]),  // No problems
        recentSubmissionsKey: { data: { recentAcSubmissionList: [] } },
        userDataKey: { isPremium: false },
      },
    });

    try {
      const slug = await getPracticeProblem("random");
      assert.strictEqual(slug, null, "Should return null when no problems available");
      // In UI: onBigPracticeButtonClick checks for null and calls showMessage()
    } finally {
      uninstallChromeStub();
    }
  });
});
