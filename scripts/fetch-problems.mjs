import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const outputPath = path.join(rootDir, "data", "problems.json");

const LIMIT = 100;

function buildQuery(skip, limit) {
  return JSON.stringify({
    query:
      "query problemsetQuestionList($categorySlug: String, $limit: Int, $skip: Int, $filters: QuestionListFilterInput) {" +
      " problemsetQuestionList: questionList(categorySlug: $categorySlug limit: $limit skip: $skip filters: $filters) {" +
      " total: totalNum questions: data {" +
      " acRate difficulty frontendQuestionId: questionFrontendId isFavor paidOnly: isPaidOnly status title titleSlug" +
      " topicTags { name id slug } hasSolution hasVideoSolution }}}",
    variables: {
      categorySlug: "",
      skip,
      limit,
      filters: {},
    },
  });
}

async function fetchPage(skip, limit) {
  const response = await fetch("https://leetcode.com/graphql/", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: buildQuery(skip, limit),
  });

  if (!response.ok) {
    throw new Error(`LeetCode problems fetch failed: ${response.status} ${response.statusText}`);
  }

  const result = await response.json();
  const list = result?.data?.problemsetQuestionList;
  if (!list || !Array.isArray(list.questions)) {
    throw new Error("Unexpected problems response from LeetCode");
  }

  return list;
}

async function fetchAllProblems() {
  const questions = [];
  let skip = 0;
  let total = null;

  while (total === null || questions.length < total) {
    const page = await fetchPage(skip, LIMIT);
    if (total === null) {
      total = page.total;
    }

    questions.push(...page.questions);
    skip += LIMIT;

    if (page.questions.length === 0) {
      break;
    }
  }

  if (total !== null && questions.length < total) {
    throw new Error(`Problem fetch incomplete: ${questions.length}/${total}`);
  }

  return { total: total ?? questions.length, questions };
}

async function main() {
  const { total, questions } = await fetchAllProblems();

  const payload = {
    data: {
      problemsetQuestionList: {
        total,
        questions,
      },
    },
    generatedAt: new Date().toISOString(),
    source: "leetcode",
  };

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(payload, null, 2));

  console.log(`Wrote ${questions.length} problems to ${outputPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
