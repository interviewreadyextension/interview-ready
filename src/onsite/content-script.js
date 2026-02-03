/*
  content-script.js (see README.md)
*/

////////////// COPY OF LOGGING.JS //////////////////////////

const isDebug = !('update_url' in chrome.runtime.getManifest());

function delog(message) {
    if(isDebug) {
        console.log(message);
    }
}

function traceMethod(func) {
    function updatedFunc(...args) {
        delog("######################")
        delog("")
        delog("Calling Function>>>>>>")
        delog(func.name)
        for(const arg of args) {
            delog(arg)
        }
        result = func.apply(this, args)
        delog("Function Returns<<<<")
        delog(result)
        delog("")
        delog("#####################")
    }

    return updatedFunc
}

////////////////// COPY OF data-storage.js ////////////////////////

const getStoragePromise = (key) => {
    return chrome.storage.local.get([key]);
}

const setStoragePromise = (key, value) => {
  return chrome.storage.local.set({[key]: value});
}

const userDataKey = "userDataKey";
const problemsKey = "problemsKey";
const recentSubmissionsKey = "recentSubmissionsKey";

/////////////////////////// END COPIES ///////////////////////////


/**
 * Query data from leetcode apis
 */
async function queryData(queryBody) {
  const response = await fetch(
    "https://leetcode.com/graphql/",
    {
      "headers": {
        "content-type": "application/json",
      },
      "body": queryBody,
      "method": "POST"
    });
  delog("querying");
  return await response.json();
}

async function updateRecentAcceptedSubmissions() {
  const userData = (await chrome.storage.local.get([userDataKey])).userDataKey;
  const username = userData?.username;
  if (!username) {
    delog("No username available; skipping recent accepts update.");
    return;
  }

  const result = await queryData(JSON.stringify({"query":"\n    query recentAcSubmissions($username: String!, $limit: Int!) {\n  recentAcSubmissionList(username: $username, limit: $limit) {\n    id\n    title\n    titleSlug\n    timestamp\n  }\n}\n    ","variables":{"username":username,"limit":15},"operationName":"recentAcSubmissions"}));
  let stringValue = JSON.stringify(result);
  const oldValue = (await chrome.storage.local.get([recentSubmissionsKey])).recentSubmissionsKey;
  delog("Comparing string values");
  delog(stringValue);
  delog(oldValue?.stringValue);
  if (oldValue?.stringValue != stringValue) {
    result.timeStamp = Date.now();
    result.stringValue = stringValue;
    chrome.storage.local.set({recentSubmissionsKey: result});
    delog("Setting...." + recentSubmissionsKey);
    delog(result);
    delog(".....");
  } 
  else {
    delog("nothing has changed, not updating...")
  }
}


async function updateAllProblems() {
  const result = await queryData("{\"query\":\"query problemsetQuestionList($categorySlug: String, $limit: Int, $skip: Int, $filters: QuestionListFilterInput) {problemsetQuestionList: questionList(categorySlug: $categorySlug limit: $limit skip: $skip filters: $filters) {total: totalNum questions: data {acRate difficulty frontendQuestionId: questionFrontendId isFavor paidOnly: isPaidOnly status title titleSlug topicTags {name id slug} hasSolution hasVideoSolution}}}\",\"variables\":{\"categorySlug\":\"\",\"skip\":0,\"limit\":5000,\"filters\":{}}}");
  result.timeStamp = Date.now();
  chrome.storage.local.set({problemsKey: result});
  delog("Setting...." + problemsKey);
  delog(result);
  delog(".....");
};


async function updateUserStatus() {
  const query = JSON.stringify({
    operationName: "globalData",
    query: "query globalData {userStatus {isSignedIn isPremium username realName avatar}}",
    variables: {}
  });
  const result = await queryData(query);
  chrome.storage.local.set({userDataKey: result.data.userStatus});
  delog("Setting...." + userDataKey);
  delog(result);
  delog(".....");
  if(!result.data.userStatus.isSignedIn) {
    delog("not signed in will run again if some tab signs in");
  } else {
    updateAllProblems();
  }
}

/**
 * Refresh data when leetcode is opened on any tab:
 */
updateUserStatus();

function changeListener(changes, namespace) {
  for (let [key, {oldValue, newValue}] of Object.entries(changes)) {
    console.log(`CHANGE ${key}`);
    delog(`CHANGE ${key}`);
    if(key == "refresh_problems" && oldValue != newValue) {
      delog(oldValue);
      delog(newValue);
      updateAllProblems();
    }
    else if(key == "modal_opened" && oldValue != newValue) {
      delog(oldValue);
      delog(newValue);
      updateRecentAcceptedSubmissions();
    }
  }
}

chrome.storage.onChanged.addListener(changeListener);

