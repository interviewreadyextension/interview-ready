import { useState, useEffect, useMemo, useCallback, type FC } from 'react';
import type { ProblemData, SubmissionData } from '../types/storage.types';
import type { UserStatus } from '../types/models';
import {
  getReadinessData,
  buildAcceptedSet,
  computeTopicAvailability,
  computeBigButtonStates,
  getNextPracticeProblem,
  getPracticeProblem,
  randomElementInArray,
  type ReadinessData,
  type TopicAvailability,
  type BigButtonStates,
  type PracticeTarget,
  type BigPracticeMode,
} from '../readiness-logic/readiness';
import { DebugPanel } from './components/DebugPanel';
import './App.css';

// ─── Helpers ────────────────────────────────────────────────
function openProblem(slug: string): void {
  const url = `https://leetcode.com/problems/${slug}`;
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0];
    if (tab?.id) {
      chrome.tabs.update(tab.id, { url });
      window.close();
    }
  });
}

function ensureLeetCodeTab(): void {
  chrome.tabs.query({ url: '*://leetcode.com/*' }, (tabs) => {
    if (tabs.length === 0) {
      chrome.tabs.create({ url: 'https://leetcode.com', active: false });
    }
  });
}

// ─── Legend component ───────────────────────────────────────
const Legend: FC<{ visible: boolean }> = ({ visible }) => {
  if (!visible) return null;
  return (
    <div id="legend">
      <p><span className="practice-suggested">↗</span> - This is the next suggested problem!</p>
      <p><span className="practice-easy">↗</span> - Random easy!</p>
      <p><span className="practice-medium">↗</span> - Random medium on a graduated scale by acceptance rate!</p>
      <p><span className="practice-hard">↗</span> - Random hard!</p>
      <p><span className="practice-random">↗</span> - Random problem of any difficulty!</p>
    </div>
  );
};

// ─── Topic row component ────────────────────────────────────
interface TopicRowProps {
  topic: string;
  status: string;
  percentage: number;
  availability: TopicAvailability;
  onTopicClick: (topic: string, target: PracticeTarget) => void;
}

const TopicRow: FC<TopicRowProps> = ({ topic, status, percentage, availability, onTopicClick }) => {
  if (availability.suggested.total === 0) return null;

  const readinessText =
    status === 'ready'
      ? `Ready %${percentage.toFixed()}`
      : `%${percentage.toFixed()}`;

  const difficulties: PracticeTarget[] = ['suggested', 'easy', 'medium', 'hard', 'random'];

  return (
    <div className="topicStatus">
      {difficulties.map((diff) => {
        const a = availability[diff];
        if (a.total === 0) {
          return (
            <button
              key={diff}
              className={`clickable practice practice-${diff} disabled`}
              disabled
              title={`No ${diff} problems for this topic`}
            >
              🡕
            </button>
          );
        }
        const completed = a.total - a.unsolved;
        let tooltip = `${a.unsolved} unsolved`;
        if (completed > 0) tooltip += `, ${completed} completed`;
        return (
          <button
            key={diff}
            className={`clickable practice practice-${diff}`}
            title={tooltip}
            onClick={() => onTopicClick(topic, diff)}
          >
            🡕
          </button>
        );
      })}
      <button
        className={`clickable practice ${status}`}
        onClick={() => onTopicClick(topic, 'suggested')}
      >
        {topic} - {readinessText}
      </button>
      <div className="suggested tooltip practice-suggested">suggested</div>
      <div className="easy tooltip practice-easy">easy</div>
      <div className="medium tooltip practice-medium">medium</div>
      <div className="hard tooltip practice-hard">hard</div>
      <div className="random tooltip practice-random">random</div>
    </div>
  );
};

// ─── Main App ───────────────────────────────────────────────
export const App: FC = () => {
  const [userData, setUserData] = useState<UserStatus>();
  const [problemData, setProblemData] = useState<ProblemData>();
  const [submissionData, setSubmissionData] = useState<SubmissionData>();
  const [loading, setLoading] = useState(true);
  const [legendVisible, setLegendVisible] = useState(false);

  // Load initial data
  useEffect(() => {
    async function load() {
      const result = await chrome.storage.local.get([
        'userDataKey',
        'problemsKey',
        'recentSubmissionsKey',
      ]) as { userDataKey?: UserStatus; problemsKey?: ProblemData; recentSubmissionsKey?: SubmissionData };
      setUserData(result.userDataKey);
      setProblemData(result.problemsKey);
      setSubmissionData(result.recentSubmissionsKey);
      setLoading(false);

      // Signal modal opened (triggers submission sync in content script)
      if (result.userDataKey?.isSignedIn) {
        chrome.storage.local.set({ modal_opened: Date.now() });
      }
    }
    load();
  }, []);

  // Listen for storage changes (reactive updates)
  useEffect(() => {
    function listener(changes: Record<string, chrome.storage.StorageChange>) {
      if (changes.userDataKey) setUserData(changes.userDataKey.newValue as UserStatus);
      if (changes.problemsKey) setProblemData(changes.problemsKey.newValue as ProblemData);
      if (changes.recentSubmissionsKey) setSubmissionData(changes.recentSubmissionsKey.newValue as SubmissionData);
    }
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, []);

  // Compute readiness
  const readinessData = useMemo<ReadinessData | null>(() => {
    if (!problemData) return null;
    return getReadinessData(problemData, submissionData);
  }, [problemData, submissionData]);

  const recentAccepted = useMemo(() => buildAcceptedSet(submissionData), [submissionData]);
  const questions = problemData?.data?.problemsetQuestionList?.questions;
  const isPremium = userData?.isPremium ?? false;

  const availability = useMemo<Record<string, TopicAvailability> | null>(() => {
    if (!questions) return null;
    return computeTopicAvailability(questions, recentAccepted, isPremium);
  }, [questions, recentAccepted, isPremium]);

  const bigButtonStates = useMemo<BigButtonStates | null>(() => {
    if (!questions) return null;
    return computeBigButtonStates(questions, recentAccepted, isPremium);
  }, [questions, recentAccepted, isPremium]);

  // Sorted topic data
  const sortedTopics = useMemo(() => {
    if (!readinessData) return [];
    return Object.entries(readinessData).sort((a, b) => b[1][1] - a[1][1]);
  }, [readinessData]);

  // Handlers
  const handleTopicClick = useCallback(async (topic: string, target: PracticeTarget) => {
    try {
      let slug = await getNextPracticeProblem(topic, target);
      if (!slug) {
        // Fallback: pick from solved
        const allProblems = (await chrome.storage.local.get(['problemsKey'])).problemsKey as ProblemData;
        const recSubs = (await chrome.storage.local.get(['recentSubmissionsKey'])).recentSubmissionsKey as SubmissionData | undefined;
        const recAccepted = buildAcceptedSet(recSubs);
        const userPremium = ((await chrome.storage.local.get(['userDataKey'])).userDataKey as UserStatus | undefined)?.isPremium;
        const qs = allProblems?.data?.problemsetQuestionList?.questions ?? [];

        const difficultyFilter =
          target === 'easy' || target === 'medium' || target === 'hard'
            ? target.charAt(0).toUpperCase() + target.slice(1)
            : null;

        const solvedProblems: string[] = [];
        for (const q of qs) {
          if (!q.topicTags?.find((t) => t.slug === topic)) continue;
          if (q.paidOnly && !userPremium) continue;
          if (difficultyFilter && q.difficulty !== difficultyFilter) continue;
          const solved = q.status === 'ac' || recAccepted.has(q.titleSlug);
          if (solved) solvedProblems.push(q.titleSlug);
        }
        slug = randomElementInArray(solvedProblems);
      }
      if (slug) openProblem(slug);
    } catch (e) {
      console.error('Error selecting problem:', e);
    }
  }, []);

  const handleBigPracticeClick = useCallback(async (practiceType: BigPracticeMode) => {
    try {
      const slug = await getPracticeProblem(practiceType);
      if (slug) openProblem(slug);
    } catch (e) {
      console.error('Error selecting practice problem:', e);
    }
  }, []);

  const handleRefresh = useCallback(() => {
    chrome.storage.local.set({ refresh_problems: Date.now() });
    ensureLeetCodeTab();
  }, []);

  const handleLegend = useCallback(() => {
    setLegendVisible(true);
    setTimeout(() => setLegendVisible(false), 3000);
  }, []);

  // ─── Render ─────────────────────────────────
  if (loading) {
    return (
      <div className="homecontainer">
        <div className="loading-container">
          <div className="loading-text">Loading</div>
          <img className="loading-ani" src="../images/loading.png" alt="Loading" />
        </div>
      </div>
    );
  }

  if (!userData?.isSignedIn) {
    return (
      <div className="homecontainer">
        <div className="alert" id="coldStart">
          Please sign in to leetcode to start preparing for your interviews! :)
          <br /><br />
          <button
            id="signInToLeetCode"
            onClick={() => {
              chrome.tabs.create({ url: 'https://leetcode.com', active: true });
            }}
          >
            Sign in to LeetCode
          </button>
        </div>
      </div>
    );
  }

  if (!problemData || !readinessData || !availability || !bigButtonStates) {
    return (
      <div className="homecontainer">
        <div className="loading-container">
          <div className="loading-text">Loading</div>
          <img className="loading-ani" src="../images/loading.png" alt="Loading" />
        </div>
        <DebugPanel userData={userData} problems={problemData} submissions={submissionData} />
      </div>
    );
  }

  return (
    <div className="homecontainer">
      <Legend visible={legendVisible} />

      <div id="currentReadiness">
        {/* Top big button: suggested */}
        <button
          className="clickable bigpractice"
          onClick={() => handleBigPracticeClick('suggested')}
        >
          {bigButtonStates.suggested.label}
        </button>

        <button id="legend-button" className="clickable" onClick={handleLegend}>?</button>
        <button id="refresh-button" className="clickable" onClick={handleRefresh}>↺</button>

        {/* Topic rows sorted by readiness */}
        {sortedTopics.map(([topic, [status, percentage]]) =>
          availability[topic] ? (
            <TopicRow
              key={topic}
              topic={topic}
              status={status}
              percentage={percentage}
              availability={availability[topic]}
              onTopicClick={handleTopicClick}
            />
          ) : null
        )}

        {/* Review button */}
        {bigButtonStates.review.enabled ? (
          <button
            className="clickable bigpractice"
            onClick={() => handleBigPracticeClick('review')}
          >
            {bigButtonStates.review.label}
          </button>
        ) : (
          <button
            className="clickable bigpractice disabled"
            disabled
            title="No completed problems yet"
          >
            {bigButtonStates.review.label}
          </button>
        )}

        {/* Random button */}
        <button
          className="clickable bigpractice"
          onClick={() => handleBigPracticeClick('random')}
        >
          Solve Random Problem
        </button>
      </div>

      <DebugPanel userData={userData} problems={problemData} submissions={submissionData} />

      <div className="github-link">
        <a href="https://github.com/interviewreadyextension/interview-ready" target="_blank" rel="noreferrer">
          https://github.com/interviewreadyextension/interview-ready
        </a>
      </div>
    </div>
  );
};
