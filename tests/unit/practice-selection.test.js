import test from "node:test";
import assert from "node:assert/strict";

import { getPracticeProblem } from "../../src/readiness-logic/practice.js";
import { recommendedList } from "../../src/readiness-logic/classic.js";
import { installChromeStub, uninstallChromeStub, makeAllProblems, q } from "./_helpers.mjs";

test("practice:suggested returns first recommended slug not yet accepted", async () => {
  // Arrange: mark the first N recommended as accepted, ensure the next one is not.
  const accepted = new Set(recommendedList.slice(0, 3));
  const allQuestions = recommendedList.slice(0, 5).map((slug) =>
    q({ titleSlug: slug, status: accepted.has(slug) ? "ac" : null, difficulty: "Easy", topicSlugs: ["array"] })
  );

  const local = installChromeStub({
    localData: {
      problemsKey: makeAllProblems(allQuestions),
      recentSubmissionsKey: { data: { recentAcSubmissionList: [] } },
      userDataKey: { isPremium: false },
    },
  });

  try {
    const slug = await getPracticeProblem("suggested");
    assert.equal(slug, recommendedList[3]);
  } finally {
    uninstallChromeStub();
  }
});

test("practice:review returns null when nothing accepted", async () => {
  installChromeStub({
    localData: {
      problemsKey: makeAllProblems([
        q({ titleSlug: "a", status: null, difficulty: "Easy", topicSlugs: ["array"] }),
      ]),
      recentSubmissionsKey: { data: { recentAcSubmissionList: [] } },
      userDataKey: { isPremium: false },
    },
  });

  try {
    const slug = await getPracticeProblem("review");
    assert.equal(slug, null);
  } finally {
    uninstallChromeStub();
  }
});

test("practice logic must read recent accepts from recentSubmissionsKey (not problemsKey)", async () => {
  // Intended behavior: if a problem is in recent accepted, treat it as accepted.
  // This test will currently FAIL because practice.js reads recentSubmissionsKey but classic.getNextPracticeProblem has a key bug,
  // and practice.js itself previously had key wiring issues.
  installChromeStub({
    localData: {
      problemsKey: makeAllProblems([
        q({ titleSlug: "two-sum", status: null, difficulty: "Easy", topicSlugs: ["array"] }),
      ]),
      recentSubmissionsKey: { data: { recentAcSubmissionList: [{ titleSlug: "two-sum" }] } },
      userDataKey: { isPremium: false },
    },
  });

  try {
    const slug = await getPracticeProblem("review");
    assert.equal(slug, "two-sum");
  } finally {
    uninstallChromeStub();
  }
});
