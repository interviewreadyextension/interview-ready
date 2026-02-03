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
