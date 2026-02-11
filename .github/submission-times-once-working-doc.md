# LeetCode: Build a Map of Submission Times by Problem Name (Console Guide)

This document explains **how to extract all of your LeetCode submission timestamps**, grouped by problem name, **using only GraphQL queries that are known to work**.

It avoids:

* forbidden user-global resolvers (`matchedUser`, `submissionList(username, …)`)
* interception / monkey-patching
* scraping HTML

Everything here runs **directly in the browser console** while logged in to `leetcode.com`.

---

## Overview of the Approach

LeetCode currently allows two critical client-side queries:

1. **`questionList`** (aliased as `problemsetQuestionList`)

   * Returns *all problems*
   * When authenticated, includes a per-user `status` field

     * `'ac'`, `'notac'`, or `null`

2. **`questionSubmissionList`**

   * Returns submission history **for a single problem**
   * Cursor-paginated (`offset`, `lastKey`)

We combine them as follows:

1. Fetch all problems
2. Filter to problems you’ve attempted (`status !== null`)
3. For each problem, fetch all submissions
4. Aggregate timestamps into a `Map<problemTitle, number[]>`

---

## One‑Shot Console Script (Concatenated)

Paste **everything below** into the browser console on `leetcode.com` and press Enter.

```js
// ------------------------------------------------------------
// Step 1: Fetch all problems with per-user status
// ------------------------------------------------------------

const problemsRes = await fetch("https://leetcode.com/graphql", {
  method: "POST",
  credentials: "include",
  headers: {
    "content-type": "application/json",
    "referer": "https://leetcode.com/problemset/all/",
  },
  body: JSON.stringify({
    query: `
      query problemsetQuestionList(
        $categorySlug: String
        $limit: Int
        $skip: Int
        $filters: QuestionListFilterInput
      ) {
        problemsetQuestionList: questionList(
          categorySlug: $categorySlug
          limit: $limit
          skip: $skip
          filters: $filters
        ) {
          total: totalNum
          questions: data {
            title
            titleSlug
            status
          }
        }
      }
    `,
    variables: {
      categorySlug: "",
      skip: 0,
      limit: 5000,
      filters: {},
    },
  }),
});

const problemsJson = await problemsRes.json();

if (!problemsJson?.data?.problemsetQuestionList) {
  throw new Error("Failed to fetch problem list");
}

const attemptedProblems =
  problemsJson.data.problemsetQuestionList.questions
    .filter(q => q.status !== null);

console.log(`Found ${attemptedProblems.length} attempted problems`);

// ------------------------------------------------------------
// Step 2: Fetch submissions per problem and build the map
// ------------------------------------------------------------

const submissionsByProblem = new Map();

for (const { title, titleSlug } of attemptedProblems) {
  let offset = 0;
  let lastKey = null;
  const limit = 20;

  while (true) {
    const res = await fetch("https://leetcode.com/graphql", {
      method: "POST",
      credentials: "include",
      headers: {
        "content-type": "application/json",
        "referer": `https://leetcode.com/problems/${titleSlug}/`,
      },
      body: JSON.stringify({
        operationName: "submissionList",
        query: `
          query submissionList(
            $offset: Int!
            $limit: Int!
            $lastKey: String
            $questionSlug: String!
          ) {
            questionSubmissionList(
              offset: $offset
              limit: $limit
              lastKey: $lastKey
              questionSlug: $questionSlug
            ) {
              lastKey
              hasNext
              submissions {
                timestamp
              }
            }
          }
        `,
        variables: {
          questionSlug: titleSlug,
          offset,
          limit,
          lastKey,
        },
      }),
    });

    const json = await res.json();
    const qsl = json?.data?.questionSubmissionList;

    if (!qsl || qsl.submissions.length === 0) break;

    if (!submissionsByProblem.has(title)) {
      submissionsByProblem.set(title, []);
    }

    for (const s of qsl.submissions) {
      submissionsByProblem.get(title).push(Number(s.timestamp));
    }

    if (!qsl.hasNext) break;

    offset += limit;
    lastKey = qsl.lastKey;
  }
}

// ------------------------------------------------------------
// Final result
// ------------------------------------------------------------

submissionsByProblem;
```

---

## Result

The script evaluates to a JavaScript `Map`:

```
Map<string, number[]>
```

Example:

```js
Map(64) {
  "Two Sum" => [1682357612, 1682357890],
  "Combination Sum" => [1682012345],
  "Binary Tree Inorder Traversal" => [1682400011],
}
```

Each array contains **UNIX timestamps (seconds)** for every submission you’ve made to that problem.

---

## Notes & Variations

* **Key by slug instead of title**

  * Replace `title` with `titleSlug` in the map key

* **Accepted-only submissions**

  * Add `status` to the `submissions` selection and filter

* **Convert timestamps to `Date`**

  ```js
  new Date(timestamp * 1000)
  ```

* **Export to JSON**

  ```js
  Object.fromEntries(submissionsByProblem)
  ```

---

## Why This Works

* Uses only **route-allowed GraphQL queries**
* Matches LeetCode’s own client behavior
* Avoids blocked user-global resolvers
* No interception, no scraping, no heuristics

This is currently the **cleanest and most robust** way to obtain full submission timing data from the browser.
