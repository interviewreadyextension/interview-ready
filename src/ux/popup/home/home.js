import {delog, traceMethod} from "../../../shared/logging.js"
import {getNextPracticeProblem, getReadinessData, recommendedList} from "../../../readiness-logic/classic.js"
import {getPracticeProblem} from "../../../readiness-logic/practice.js"
import { randomElementInArray } from "../../../readiness-logic/random.js";
import { targetTopics } from "../../../readiness-logic/target-topics.js";

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

//////////// Availability checking ///////////////
function buildRecentAcceptedSet(recentAcceptedSubmissions) {
    const recentAccepted = new Set();
    const acList = recentAcceptedSubmissions?.data?.recentAcSubmissionList;
    if (acList?.length > 0) {
        for (let item of acList) {
            recentAccepted.add(item.titleSlug);
        }
    }
    return recentAccepted;
}

async function computeTopicAvailability() {
    const allProblems = (await chrome.storage.local.get(["problemsKey"])).problemsKey;
    const recentAcceptedSubmissions = (await chrome.storage.local.get(["recentSubmissionsKey"])).recentSubmissionsKey;
    const userHasPremium = (await chrome.storage.local.get(["userDataKey"])).userDataKey?.isPremium;

    const recentAccepted = buildRecentAcceptedSet(recentAcceptedSubmissions);
    const questions = allProblems?.data?.problemsetQuestionList?.questions;

    const availability = {};
    
    for (const topic of targetTopics) {
        availability[topic] = {
            suggested: { total: 0, unsolved: 0 },
            easy: { total: 0, unsolved: 0 },
            medium: { total: 0, unsolved: 0 },
            hard: { total: 0, unsolved: 0 },
            random: { total: 0, unsolved: 0 },
        };
    }

    if (!questions) return availability;

    for (const q of questions) {
        if (q.paidOnly && !userHasPremium) continue;

        const solved = (q.status == "ac") || recentAccepted.has(q.titleSlug);

        for (const tag of (q.topicTags || [])) {
            const topic = tag.slug;
            if (!availability[topic]) continue;

            // Track by difficulty
            const diff = q.difficulty?.toLowerCase();
            if (diff === "easy" || diff === "medium" || diff === "hard") {
                availability[topic][diff].total++;
                if (!solved) availability[topic][diff].unsolved++;
            }

            // Track for suggested/random (any difficulty)
            availability[topic].suggested.total++;
            if (!solved) availability[topic].suggested.unsolved++;
            
            availability[topic].random.total++;
            if (!solved) availability[topic].random.unsolved++;
        }
    }

    return availability;
}

async function computeBigButtonStates() {
    const allProblems = (await chrome.storage.local.get(["problemsKey"])).problemsKey;
    const recentAcceptedSubmissions = (await chrome.storage.local.get(["recentSubmissionsKey"])).recentSubmissionsKey;
    const userHasPremium = (await chrome.storage.local.get(["userDataKey"])).userDataKey?.isPremium;

    const recentAccepted = buildRecentAcceptedSet(recentAcceptedSubmissions);
    const questions = allProblems?.data?.problemsetQuestionList?.questions;

    const states = {
        suggested: { hasUnsolved: false, label: "Next Suggested Problem" },
        review: { enabled: false, label: "Review Random Completed" },
        random: { hasUnsolved: true, label: "Solve Random Problem" },
    };

    if (!questions) return states;

    // Check suggested list
    const bySlug = new Map();
    for (const q of questions) {
        bySlug.set(q.titleSlug, q);
    }

    let suggestedUnsolved = false;
    for (const slug of recommendedList) {
        const q = bySlug.get(slug);
        if (!q) continue;
        if (q.paidOnly && !userHasPremium) continue;

        const solved = (q.status == "ac") || recentAccepted.has(slug);
        if (!solved) {
            suggestedUnsolved = true;
            break;
        }
    }

    states.suggested.hasUnsolved = suggestedUnsolved;
    if (!suggestedUnsolved) {
        states.suggested.label = "Solve Random Problem";
    }

    // Check review (any completed problems)
    let hasCompleted = false;
    for (const q of questions) {
        if (q.paidOnly && !userHasPremium) continue;
        const inTargetTopics = q.topicTags?.some(t => targetTopics.includes(t.slug));
        if (!inTargetTopics) continue;

        const solved = (q.status == "ac") || recentAccepted.has(q.titleSlug);
        if (solved) {
            hasCompleted = true;
            break;
        }
    }

    states.review.enabled = hasCompleted;

    return states;
}
///////////////////////////////////////////////////////////////////////


///////////////// Render ///////////////
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
    
    var readiness = document.getElementById("currentReadiness");
    readiness.innerHTML = '';

    if(!allProblemsData) {
        showProgress();
        setTimeout(render, 1000);
        return;
    }

    hideProgress();

    // Compute availability before rendering
    const availability = await computeTopicAvailability();
    const bigButtonStates = await computeBigButtonStates();
    
    let topicData = getReadinessData(allProblemsData, recentAcceptedSubmissions);

    // Render big buttons
    readiness.innerHTML = `<button class='clickable bigpractice' practice-type='suggested'>${bigButtonStates.suggested.label}</button>`;
    readiness.innerHTML += '<button id=\'legend-button\' class=\'clickable\'>?</button><button id=\'refresh-button\' class=\'clickable\'>↺</button>';

    var sortedTopicProficiency = Object.entries(topicData).sort((a, b) => {
        return b[1][1] - a[1][1];
    });

    var readinessHtmlFunc = (styleClass, text, topic, avail) => {
        // Only render if topic has ANY problems
        if (avail.suggested.total === 0) {
            return "";
        }

        const makeButton = (difficulty) => {
            const a = avail[difficulty];
            if (a.total === 0) {
                return `<button class="clickable practice practice-${difficulty} disabled" difficulty='${difficulty}' data-topic='${topic}' disabled title="No ${difficulty} problems for this topic">🡕</button>`;
            }
            
            // Build tooltip: show unsolved count, only show completed if > 0
            const completed = a.total - a.unsolved;
            let tooltip = `${a.unsolved} unsolved`;
            if (completed > 0) {
                tooltip += `, ${completed} completed`;
            }
            
            return `<button class="clickable practice practice-${difficulty}" difficulty='${difficulty}' data-topic='${topic}' title="${tooltip}">🡕</button>`;
        };

        return `<div class="topicStatus">
        ${makeButton("suggested")}
        ${makeButton("easy")}
        ${makeButton("medium")}
        ${makeButton("hard")}
        ${makeButton("random")}
        <button difficulty='suggested' data-topic='${topic}' class='clickable practice ${styleClass}'>${topic} - ${text}</button>
        <div class="suggested tooltip practice-suggested">suggested</div>
        <div class="easy tooltip practice-easy">easy</div>
        <div class="medium tooltip practice-medium">medium</div>
        <div class="hard tooltip practice-hard">hard</div>
        <div class="random tooltip practice-random">random</div>
        </div>`;
    };

    sortedTopicProficiency.forEach(element => {
        var topic = element[0];
        var readinessPercent = element[1][1];
        var designation = element[1][0];
        var readinessScoreFormattedAsPercent = '%' + readinessPercent.toFixed();
        if (designation == "ready") {
            readinessScoreFormattedAsPercent = `Ready ${readinessScoreFormattedAsPercent}`;
        }
        
        const html = readinessHtmlFunc(designation, readinessScoreFormattedAsPercent, topic, availability[topic]);
        readiness.innerHTML += html;
    });

    
    if(bigButtonStates.review.enabled) {
        readiness.innerHTML += `<button class='clickable bigpractice' practice-type='review'>${bigButtonStates.review.label}</button>`;
    } else {
        readiness.innerHTML += `<button class='clickable bigpractice disabled' practice-type='review' disabled title="No completed problems yet">${bigButtonStates.review.label}</button>`;
    }

    readiness.innerHTML += '<button class=\'clickable bigpractice\' practice-type=\'random\'>Solve Random Problem</button>';

    //////// DONE CHANGING DOM -- ADD handlers

    var items = document.getElementsByClassName("practice");
    for (var i = 0; i < items.length; i++) {
        let button = items[i];
        if (button.disabled) continue; // Don't attach handler to disabled buttons
        button.addEventListener("click", function () {
            onTopicClick(button.getAttribute("data-topic"), button.getAttribute("difficulty"));
        });
    }

    var items = document.getElementsByClassName("bigpractice");
    for (var i = 0; i < items.length; i++) {
        let button = items[i];
        if (button.disabled) continue;
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
        try {
            var nextProblemSlug = await getNextPracticeProblem(topic, target);
            if (!nextProblemSlug) {
                delog(`No unsolved problem found for topic=${topic} target=${target}. Trying to pick from solved...`);
                // Fallback: pick from solved problems
                const fallbackSlug = await pickFromSolved(topic, target);
                if (fallbackSlug) {
                    delog(`Picked solved problem: ${fallbackSlug}`);
                    var fallbackUrl = `https://leetcode.com/problems/${fallbackSlug}`;
                    chrome.tabs.update(tab.id, { url: fallbackUrl });
                    window.close();
                    return;
                }
                delog(`No problems at all for topic=${topic} target=${target}`);
                return;
            }
            var nextProblemUrl = `https://leetcode.com/problems/${nextProblemSlug}`
            chrome.tabs.update(tab.id, { url: nextProblemUrl });
            window.close();
        } catch (e) {
            delog(`Error while selecting problem: ${e}`);
            console.error("Error in onTopicClick:", e);
        }
    });
}

function onBigPracticeButtonClick(practiceType) {
    delog(practiceType);
    chrome.tabs.query({ active: true, currentWindow: true }, async function (tabs) {
        var tab = tabs[0];
        try {
            var nextProblemSlug = await getPracticeProblem(practiceType);
            if (!nextProblemSlug) {
                delog(`No problem found for practiceType=${practiceType}`);
                return;
            }
            var nextProblemUrl = `https://leetcode.com/problems/${nextProblemSlug}`
            chrome.tabs.update(tab.id, { url: nextProblemUrl });
            window.close();
        } catch (e) {
            delog(`Error while selecting practice problem: ${e}`);
            console.error("Error in onBigPracticeButtonClick:", e);
        }
    });
}

async function pickFromSolved(topic, target) {
    const allProblems = (await chrome.storage.local.get(["problemsKey"])).problemsKey;
    const recentAcceptedSubmissions = (await chrome.storage.local.get(["recentSubmissionsKey"])).recentSubmissionsKey;
    const userHasPremium = (await chrome.storage.local.get(["userDataKey"])).userDataKey?.isPremium;

    const recentAccepted = buildRecentAcceptedSet(recentAcceptedSubmissions);
    const questions = allProblems?.data?.problemsetQuestionList?.questions;
    if (!questions) return null;

    const difficultyFilter = (target === "easy" || target === "medium" || target === "hard")
        ? (target.charAt(0).toUpperCase() + target.slice(1))
        : null;

    const solvedProblems = [];

    for (const q of questions) {
        const relatedToTopic = q.topicTags?.find(t => t.slug == topic);
        if (!relatedToTopic) continue;
        if (q.paidOnly && !userHasPremium) continue;
        if (difficultyFilter && q.difficulty !== difficultyFilter) continue;

        const solved = (q.status == "ac") || recentAccepted.has(q.titleSlug);
        if (solved) {
            solvedProblems.push(q.titleSlug);
        }
    }

    return randomElementInArray(solvedProblems);
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
