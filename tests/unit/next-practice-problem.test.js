import test from "node:test";
import assert from "node:assert/strict";

import { getNextPracticeProblem } from "../../src/readiness-logic/classic.js";

import { installChromeStub, uninstallChromeStub, makeAllProblems, q } from "./_helpers.mjs";

test("getNextPracticeProblem excludes problems in recent accepted submissions", async () => {
  // Intended behavior: anything in recentAcSubmissionList counts as accepted.
  const restoreRandom = Math.random;
  Math.random = () => 0;

  installChromeStub({
    localData: {
      problemsKey: makeAllProblems([
        // This one should be treated as solved via recent-accepted.
        q({ titleSlug: "recently-solved", difficulty: "Easy", status: null, topicSlugs: ["array"] }),
        // This one should be suggested instead.
        q({ titleSlug: "still-unsolved", difficulty: "Easy", status: null, topicSlugs: ["array"] }),
      ]),
      recentSubmissionsKey: {
        data: { recentAcSubmissionList: [{ titleSlug: "recently-solved" }] },
      },
      userDataKey: { isPremium: false },
    },
  });

  try {
    const slug = await getNextPracticeProblem("array", "easy");
    assert.equal(slug, "still-unsolved");
  } finally {
    Math.random = restoreRandom;
    uninstallChromeStub();
  }
});

test("getNextPracticeProblem never returns paid-only problems for non-premium users", async () => {
  const restoreRandom = Math.random;
  Math.random = () => 0;

  installChromeStub({
    localData: {
      problemsKey: makeAllProblems([
        q({ titleSlug: "paid", difficulty: "Easy", status: null, paidOnly: true, topicSlugs: ["array"] }),
        q({ titleSlug: "free", difficulty: "Easy", status: null, paidOnly: false, topicSlugs: ["array"] }),
      ]),
      recentSubmissionsKey: { data: { recentAcSubmissionList: [] } },
      userDataKey: { isPremium: false },
    },
  });

  try {
    const slug = await getNextPracticeProblem("array", "easy");
    assert.equal(slug, "free");
  } finally {
    Math.random = restoreRandom;
    uninstallChromeStub();
  }
});

test("getNextPracticeProblem returns null when there are no eligible problems", async () => {
  // Intended robustness: do not navigate to /problems/undefined.
  // Current code will return undefined because it calls randomElementInArray([]).
  installChromeStub({
    localData: {
      problemsKey: makeAllProblems([
        // Paid-only and user is not premium => no eligible problems.
        q({ titleSlug: "paid", difficulty: "Easy", status: null, paidOnly: true, topicSlugs: ["array"] }),
      ]),
      recentSubmissionsKey: { data: { recentAcSubmissionList: [] } },
      userDataKey: { isPremium: false },
    },
  });

  try {
    const slug = await getNextPracticeProblem("array", "easy");
    assert.equal(slug, null);
  } finally {
    uninstallChromeStub();
  }
});
