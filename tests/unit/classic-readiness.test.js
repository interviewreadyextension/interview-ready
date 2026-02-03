import test from "node:test";
import assert from "node:assert/strict";

import { getReadinessData } from "../../src/readiness-logic/classic.js";
import { targetTopics, targetTopicQuestionTarget } from "../../src/readiness-logic/target-topics.js";

import { makeAllProblems, q } from "./_helpers.mjs";

test("getReadinessData initializes all target topics", () => {
  const allProblems = makeAllProblems([]);
  const result = getReadinessData(allProblems, null);

  for (const topic of targetTopics) {
    assert.ok(topic in result);
    assert.equal(result[topic][0], "notReady");
    assert.equal(result[topic][1], 0);
  }
});

test("getReadinessData treats recent accepted as solved (even if status is not 'ac')", () => {
  const allProblems = makeAllProblems([
    q({ titleSlug: "x", difficulty: "Easy", status: null, topicSlugs: ["array"] }),
  ]);

  const recentAcceptedSubmissions = {
    data: { recentAcSubmissionList: [{ titleSlug: "x" }] },
  };

  const result = getReadinessData(allProblems, recentAcceptedSubmissions);
  assert.ok(result.array);
  assert.notEqual(result.array[1], 0);
});

test("getReadinessData readiness thresholds: >=100% ready, >70% almost", () => {
  // With Easy points=0.4, we can reach 100% for a topic by repeating enough Easy solves.
  const target = targetTopicQuestionTarget["queue"];
  const needed = Math.ceil(target / 0.4);

  const questions = [];
  for (let i = 0; i < needed; i++) {
    questions.push(q({ titleSlug: `q-${i}`, difficulty: "Easy", status: "ac", topicSlugs: ["queue"] }));
  }

  const allProblems = makeAllProblems(questions);
  const result = getReadinessData(allProblems, null);

  assert.equal(result.queue[0], "ready");
  assert.ok(result.queue[1] >= 100);
});

test("getReadinessData Medium scoring weights by acceptance-rate band (easier < target < harder)", () => {
  // This is *weighting*, not exclusion: you can accept any Medium, but lower acRate
  // should contribute more readiness points.

  const scoreFor = (acRate) => {
    const allProblems = makeAllProblems([
      q({
        titleSlug: `m-${acRate}`,
        difficulty: "Medium",
        acRate,
        status: "ac",
        topicSlugs: ["hash-table"],
      }),
    ]);
    return getReadinessData(allProblems, null)["hash-table"][1];
  };

  const easier = scoreFor(70); // >=60 => easier Medium
  const target = scoreFor(50); // 40-60 => target Medium
  const harder = scoreFor(30); // <40 => harder Medium

  assert.ok(easier > 0);
  assert.ok(target > easier);
  assert.ok(harder > target);
});
