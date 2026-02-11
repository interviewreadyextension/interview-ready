import { useState, useEffect, useMemo, useCallback, type FC } from 'react';
import type { ProblemData, SubmissionCacheData } from '../types/storage.types';
import type { UserStatus } from '../types/models';
import { delogError } from '../shared/logging';
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
  type DateRange,
} from '../readiness-logic/readiness';
import { SyncProgressBar } from './components/SyncProgress';
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

// ─── Date filter presets ────────────────────────────────────
export type DateFilterPreset = '7d' | '30d' | '120d' | 'all';

const DATE_FILTER_OPTIONS: { value: DateFilterPreset; label: string }[] = [
  { value: 'all', label: 'All time' },
  { value: '120d', label: 'Last 120 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: '7d', label: 'Last 7 days' },
];

function getDateRange(preset: DateFilterPreset): DateRange | undefined {
  if (preset === 'all') return undefined;
  const days = preset === '7d' ? 7 : preset === '30d' ? 30 : 120;
  const nowSec = Math.floor(Date.now() / 1000);
  return { startSec: nowSec - days * 86400, endSec: nowSec };
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
  const [cacheData, setCacheData] = useState<SubmissionCacheData>();
  const [loading, setLoading] = useState(true);
  const [legendVisible, setLegendVisible] = useState(false);
  const [dateFilter, setDateFilter] = useState<DateFilterPreset>('120d');
  const [refreshing, setRefreshing] = useState(false);

  // Load initial data from chrome.storage.local
  useEffect(() => {
    async function load() {
      const result = await chrome.storage.local.get([
        'userDataKey',
        'problemsKey',
        'submissionCacheKey',
      ]) as { userDataKey?: UserStatus; problemsKey?: ProblemData; submissionCacheKey?: SubmissionCacheData };
      setUserData(result.userDataKey);
      setProblemData(result.problemsKey);
      setCacheData(result.submissionCacheKey);
      setLoading(false);

      // Signal popup opened → triggers submission sync in the content script
      if (result.userDataKey?.isSignedIn) {
        chrome.storage.local.set({ modal_opened: Date.now() });
      }
    }
    load();
  }, []);

  // Reactively update state when storage changes
  useEffect(() => {
    function listener(changes: Record<string, chrome.storage.StorageChange>) {
      if (changes.userDataKey) setUserData(changes.userDataKey.newValue as UserStatus);
      if (changes.problemsKey) setProblemData(changes.problemsKey.newValue as ProblemData);
      if (changes.submissionCacheKey) setCacheData(changes.submissionCacheKey.newValue as SubmissionCacheData);
    }
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, []);

  // Date range for filtering
  const dateRange = useMemo(() => getDateRange(dateFilter), [dateFilter]);

  // Compute readiness scores
  const readinessData = useMemo<ReadinessData | null>(() => {
    if (!problemData) return null;
    return getReadinessData(problemData, cacheData, dateRange);
  }, [problemData, cacheData, dateRange]);

  // Set of accepted slugs (respects date filter)
  const recentAccepted = useMemo(
    () => buildAcceptedSet(cacheData, dateRange),
    [cacheData, dateRange],
  );
  const questions = problemData?.data?.problemsetQuestionList?.questions;
  const isPremium = userData?.isPremium ?? false;
  const cacheEntries = cacheData?.entries;

  const availability = useMemo<Record<string, TopicAvailability> | null>(() => {
    if (!questions) return null;
    return computeTopicAvailability(questions, recentAccepted, isPremium, dateRange, cacheEntries);
  }, [questions, recentAccepted, isPremium, dateRange, cacheEntries]);

  const bigButtonStates = useMemo<BigButtonStates | null>(() => {
    if (!questions) return null;
    return computeBigButtonStates(questions, recentAccepted, isPremium, dateRange, cacheEntries);
  }, [questions, recentAccepted, isPremium, dateRange, cacheEntries]);

  // Derived stats
  const totalProblems = questions?.length ?? 0;
  const totalSolved = recentAccepted.size;
  const totalCacheEntries = cacheData?.entries ? Object.keys(cacheData.entries).length : 0;
  const cacheStatus = cacheData?.cacheStatus ?? 'empty';

  const formatAgo = useCallback((ts: number | undefined) => {
    if (!ts) return null;
    const now = Date.now();
    const diffMin = Math.floor((now - ts) / 60000);
    if (diffMin < 1) return 'just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }, []);

  const problemsSyncLabel = useMemo(
    () => formatAgo(problemData?.fetchCompletedAt),
    [problemData?.fetchCompletedAt, formatAgo],
  );
  const subsSyncLabel = useMemo(
    () => formatAgo(cacheData?.lastIncrementalAt ?? cacheData?.lastFullScanAt ?? undefined),
    [cacheData?.lastIncrementalAt, cacheData?.lastFullScanAt, formatAgo],
  );

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
        // Fallback: pick from solved problems
        const allProblems = (await chrome.storage.local.get(['problemsKey'])).problemsKey as ProblemData;
        const cache = (await chrome.storage.local.get(['submissionCacheKey'])).submissionCacheKey as SubmissionCacheData | undefined;
        const recAccepted = buildAcceptedSet(cache);
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
      delogError('Error selecting problem', e);
    }
  }, []);

  const handleBigPracticeClick = useCallback(async (practiceType: BigPracticeMode) => {
    try {
      const slug = await getPracticeProblem(practiceType);
      if (slug) openProblem(slug);
    } catch (e) {
      delogError('Error selecting practice problem', e);
    }
  }, []);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    chrome.storage.local.set({
      refresh_problems: Date.now(),
      modal_opened: Date.now(),
    });
    ensureLeetCodeTab();
    // Clear the spinning state after a short delay
    setTimeout(() => setRefreshing(false), 2000);
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
          <div className="loading-bar"><div className="loading-bar-fill" /></div>
        </div>
        <SyncProgressBar />
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
          <div className="loading-text">Loading problem data…</div>
          <div className="loading-bar"><div className="loading-bar-fill" /></div>
        </div>
        <SyncProgressBar />
      </div>
    );
  }
  return (
    <div className="homecontainer">
      <Legend visible={legendVisible} />

      <div className="control-row">
        <select
          className="date-filter"
          value={dateFilter}
          onChange={(e) => setDateFilter(e.target.value as DateFilterPreset)}
        >
          {DATE_FILTER_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        <div className="control-buttons">
          <button className="clickable control-btn" onClick={handleLegend} title="Legend">?</button>
          <button
            className={`clickable control-btn${refreshing ? ' spinning' : ''}`}
            onClick={handleRefresh}
            title="Refresh"
            disabled={refreshing}
          >↺</button>
        </div>
      </div>

      <div className="info-summary">
        <div className="info-left">
          {userData?.username && (
            <span className="info-stat">
              <span className="info-value">{userData.username}</span>
              {userData?.isPremium && <span className="info-label"> ★</span>}
            </span>
          )}
          <span className="info-stat">
            <span className="info-value">{totalSolved}</span>
            <span className="info-label">/{totalProblems} solved</span>
            {dateFilter !== 'all' && (
              <span className="info-label"> ({dateFilter})</span>
            )}
          </span>
          <span className="info-stat">
            <span className="info-value">{totalCacheEntries.toLocaleString()}</span>
            <span className="info-label"> cached</span>
          </span>
        </div>
        <div className="info-right">
          {problemsSyncLabel && <span>problems {problemsSyncLabel}</span>}
          {problemsSyncLabel && subsSyncLabel && <span> · </span>}
          {subsSyncLabel && <span>subs {subsSyncLabel}</span>}
        </div>
      </div>

      <div id="currentReadiness">
        {/* Top big button: suggested */}
        <button
          className="clickable bigpractice"
          onClick={() => handleBigPracticeClick('suggested')}
        >
          {bigButtonStates.suggested.label}
        </button>

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

      <SyncProgressBar />

      <div className="github-link">
        <a href="https://github.com/interviewreadyextension/interview-ready" target="_blank" rel="noreferrer">
          https://github.com/interviewreadyextension/interview-ready
        </a>
      </div>
    </div>
  );
};
