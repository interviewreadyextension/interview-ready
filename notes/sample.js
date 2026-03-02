fetch("https://leetcode.com/graphql/", {
  "headers": {
    "accept": "*/*",
    "accept-language": "en-US,en;q=0.9",
    "authorization": "",
    "cache-control": "no-cache",
    "content-type": "application/json",
    "operation-name": "submissionList",
    "pragma": "no-cache",
    "priority": "u=1, i",
    "random-uuid": "e681f430-88da-eaa9-6dd8-a354e6019c78",
    "sec-ch-ua": "\"Not:A-Brand\";v=\"99\", \"Google Chrome\";v=\"145\", \"Chromium\";v=\"145\"",
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": "\"Windows\"",
    "sec-fetch-dest": "empty",
    "sec-fetch-mode": "cors",
    "sec-fetch-site": "same-origin",
    "uuuserid": "e7c9d87eb1f0ff1f3eefd85e7ee5e916",
    "x-csrftoken": "9jURMNoHDZdB3kl7NO2PbHYJPgKhIDkj"
  },
  "referrer": "https://leetcode.com/problems/two-sum/submissions/",
  "body": "{\"query\":\"\\n    query submissionList($offset: Int!, $limit: Int!, $lastKey: String, $questionSlug: String!, $lang: Int, $status: Int) {\\n  questionSubmissionList(\\n    offset: $offset\\n    limit: $limit\\n    lastKey: $lastKey\\n    questionSlug: $questionSlug\\n    lang: $lang\\n    status: $status\\n  ) {\\n    lastKey\\n    hasNext\\n    submissions {\\n      id\\n      title\\n      titleSlug\\n      status\\n      statusDisplay\\n      lang\\n      langName\\n      runtime\\n      timestamp\\n      url\\n      isPending\\n      memory\\n      hasNotes\\n      notes\\n      flagType\\n      frontendId\\n      topicTags {\\n        id\\n      }\\n    }\\n  }\\n}\\n    \",\"variables\":{\"questionSlug\":\"two-sum\",\"offset\":0,\"limit\":20,\"lastKey\":null},\"operationName\":\"submissionList\"}",
  "method": "POST",
  "mode": "cors",
  "credentials": "include"
});