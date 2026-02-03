import {delog, traceMethod} from "../../../shared/logging.js"
import {getNextPracticeProblem, getReadinessData} from "../../../readiness-logic/classic.js"
import {getPracticeProblem} from "../../../readiness-logic/practice.js"
import { randomElementInArray } from "../../../readiness-logic/random.js";

delog(`Loaded home.js: ${new Date()}`);

//////////// Cold start "sign in to leetcode" experience /////////////
const signIntoLeetCode = traceMethod(function signIntoLeetCode() {
    chrome.tabs.update({
        url: "https://leetcode.com/accounts/login/"
    });

    window.close();
});

document.getElementById("signInToLeetCode").onclick = signIntoLeetCode;

function showColdStart() {
    showHideById("coldStart", false)
}

function hideColdStart() {
    showHideById("coldStart", true);
}

function showProgress() {
    showHideById("loading", false);
}

function hideProgress() {
    showHideById("loading", true);
}

function showLegend() {
    showHideById("legend", false);
}

function hideLegend() {
    showHideById("legend", true);
}

function showHideById(id, shouldHide) {
    document.getElementById(id).hidden = shouldHide;
}
///////////////////////////////////////////////////////////////////////




///////////////// Render ///////////////
//setInterval(render, 1000);
render();

async function render() {

    delog("################");
    delog("render!!!");
    let userData = (await chrome.storage.local.get(["userDataKey"])).userDataKey;
    delog(userData);
    let isSignedIn = userData.isSignedIn;
    delog(`isSignedIn==${isSignedIn}`);

    if (!isSignedIn) {
        showColdStart();
        setTimeout(render, 1000);
        return;
    } else {
        hideColdStart();
    }

    // Signal that we opened the modal and got passed the sign-in
    delog("setting modal opened!");
    chrome.storage.local.set({"modal_opened": Date.now()});

    let allProblemsData = (await chrome.storage.local.get(["problemsKey"])).problemsKey;
    let recentAcceptedSubmissions = (await chrome.storage.local.get(["recentSubmissionsKey"])).recentSubmissionsKey;
    let topicData = getReadinessData(allProblemsData, recentAcceptedSubmissions);
    var readiness = document.getElementById("currentReadiness");

    readiness.innerHTML = '';
    readiness.innerHTML = '<button class=\'clickable bigpractice\' practice-type=\'suggested\'>Next Suggested Problem</button>';
    readiness.innerHTML += '<button id=\'legend-button\' class=\'clickable\'>?</button><button id=\'refresh-button\' class=\'clickable\'>↺</button>';


    if(!allProblemsData) {
        showProgress();
        setTimeout(render, 1000);
        return;
    }

    hideProgress();
    
    var sortedTopicProficiency = Object.entries(topicData).sort((a, b) => {
        return b[1][1] - a[1][1];
    });

    var readinessHtmlFunc = (styleClass, text, topic) => {
        return `<div class="topicStatus">
        <button class="clickable practice practice-suggested" difficulty='suggested' data-topic='${topic}'>🡕</button>
        <button class="clickable practice practice-easy" difficulty='easy' data-topic='${topic}'>🡕</button>
        <button class="clickable practice practice-medium" difficulty='medium' data-topic='${topic}'>🡕</button>
        <button class="clickable practice practice-hard" difficulty='hard' data-topic='${topic}'>🡕</button>
        <button class="clickable practice practice-random" difficulty='random' data-topic='${topic}'>🡕</button>
        <button difficulty='suggested' data-topic='${topic}' class='clickable practice ${styleClass}'>${topic} - ${text}</button>
        <div class="suggested tooltip practice-suggested">suggested</div>
        <div class="easy tooltip practice-easy">easy</div>
        <div class="medium tooltip practice-medium">medium</div>
        <div class="hard tooltip practice-hard">hard</div>
        <div class="random tooltip practice-random">random</div>
        </div>`;
    };

    var addReadiness = (styleClass, text, topic) => readiness.innerHTML += readinessHtmlFunc(styleClass, text, topic);
    var randomTone = () => randomElementInArray(["&#127995;","&#127996;","&#127997;","&#127998;","&#127999;"]);
    var sumOfReadiness = 0;
    sortedTopicProficiency.forEach(element => {
        var topic = element[0];
        var readinessPercent = element[1][1];
        sumOfReadiness += readinessPercent;
        var designation = element[1][0];
        var readinessScoreFormattedAsPercent = '%' + readinessPercent.toFixed();
        if (designation == "ready") {
            readinessScoreFormattedAsPercent = `Ready ${readinessScoreFormattedAsPercent}`; // += " &#128077;" + randomTone(); // 👍
        } else {
            //readinessScoreFormattedAsPercent += " &#x1F448;" + randomTone(); // 👈
        }
        //addReadiness(designation, designation == "ready" ? "Ready": readinessScoreFormattedAsPercent, topic);
        addReadiness(designation, readinessScoreFormattedAsPercent, topic);
    });

    
    if(sumOfReadiness) {
        readiness.innerHTML += '<button class=\'clickable bigpractice\' practice-type=\'review\'>Review Random Completed</button>';
    } 

    readiness.innerHTML += '<button class=\'clickable bigpractice\' practice-type=\'random\'>Solve Random Problem</button>';

    //////// DONE CHANGING DOM -- ADD handlers

    var items = document.getElementsByClassName("practice");
    for (var i = 0; i < items.length; i++) {
        let button = items[i];
        button.addEventListener("click", function () {
            onTopicClick(button.getAttribute("data-topic"), button.getAttribute("difficulty"));
        });
    }

    var items = document.getElementsByClassName("bigpractice");
    for (var i = 0; i < items.length; i++) {
        let button = items[i];
        button.addEventListener("click", function () {
            onBigPracticeButtonClick(button.getAttribute("practice-type"));
        });
    }


    document.getElementById('refresh-button').addEventListener("click", () => {
        chrome.storage.local.set({"refresh_problems": Date.now()});
        showProgress();
        document.getElementById("currentReadiness").innerHTML = '';
        let hostUrl = "leetcode.com";
        chrome.tabs.query({ url: `*://${hostUrl}/*` }, (tabs) => {
            if (tabs.length > 0) {
              delog(`Found tabs on ${hostUrl}:`);
              delog(tabs);
            } else {
              delog(`No tabs found on ${hostUrl}`);
              chrome.tabs.create({url: "https://leetcode.com", active: false});
            }
          });
    });

    document.getElementById('legend-button').addEventListener("click", () => {
        showLegend();
        setTimeout(hideLegend, 3000);
    });
    
};

/////////////////////////////////////////////////////////////////////////



///////  Practice Selection Logic ////////////////////////////////////////
function onTopicClick(topic, target) {
    delog(topic);
    chrome.tabs.query({ active: true, currentWindow: true }, async function (tabs) {
        var tab = tabs[0];
        var nextProblemSlug = await getNextPracticeProblem(topic, target);
        if (!nextProblemSlug) {
            delog(`No problem found for topic=${topic} target=${target}`);
            return;
        }
        var nextProblemUrl = `https://leetcode.com/problems/${nextProblemSlug}`
        chrome.tabs.update(tab.id, { url: nextProblemUrl });
        window.close();
    });
}

function onBigPracticeButtonClick(practiceType) {
    delog(practiceType);
    chrome.tabs.query({ active: true, currentWindow: true }, async function (tabs) {
        var tab = tabs[0];
        var nextProblemSlug = await getPracticeProblem(practiceType);
        if (!nextProblemSlug) {
            delog(`No problem found for practiceType=${practiceType}`);
            return;
        }
        var nextProblemUrl = `https://leetcode.com/problems/${nextProblemSlug}`
        chrome.tabs.update(tab.id, { url: nextProblemUrl });
        window.close();
    });
}
/////////////////////////////////////////////////////////////////////////////////


//////// Listen for updates ///////////////////
function changeListener(changes, namespace) {
    for (let [key, {oldValue, newValue}] of Object.entries(changes)) {
      if((key == "problemsKey" || key == "recentSubmissionsKey") && oldValue?.timeStamp != newValue?.timeStamp) {
        delog(oldValue);
        delog(newValue);
        render();
      }
    }
  }
  
  chrome.storage.onChanged.addListener(changeListener);
