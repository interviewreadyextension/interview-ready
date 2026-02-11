/**
 * Popup React app — the main readiness dashboard.
 *
 * Reads problem data and submission cache from `chrome.storage.local`,
 * computes per-topic readiness scores via the readiness logic module,
 * and renders an interactive grid of practice buttons.
 *
 * Communicates with the content script exclusively through storage
 * keys (`refresh_problems`, `modal_opened`).
 */

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
  type ReadinessData,
  type TopicAvailability,
  type BigButtonStates,
  type PracticeTarget,
  type BigPracticeMode,
} from '../readiness-logic/readiness';
import { SyncProgressBar } from './components/SyncProgress';
import { Legend } from './components/Legend';
import { TopicRow } from './components/TopicRow';
import { InfoSummary } from './components/InfoSummary';
import { ControlRow, getDateRange, type DateFilterPreset } from './components/DateFilter';
import { BigPracticeButtons } from './components/BigPracticeButtons';
import './App.css';

// ─── Helpers ────────────────────────────────────────────────

/** Navigate the active tab to a LeetCode problem. */
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

/** Ensure at least one LeetCode tab exists (needed for the content script). */
function ensureLeetCodeTab(): void {
  chrome.tabs.query({ url: '*://leetcode.com/*' }, (tabs) => {
    if (tabs.length === 0) {
      chrome.tabs.create({ url: 'https://leetcode.com', active: false });
    }
  });
}

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
        'dateFilterPreference',
      ]) as { userDataKey?: UserStatus; problemsKey?: ProblemData; submissionCacheKey?: SubmissionCacheData; dateFilterPreference?: DateFilterPreset };
      setUserData(result.userDataKey);
      setProblemData(result.problemsKey);
      setCacheData(result.submissionCacheKey);
      setDateFilter(result.dateFilterPreference ?? '120d');
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

  // Persist date filter preference
  useEffect(() => {
    chrome.storage.local.set({ dateFilterPreference: dateFilter });
  }, [dateFilter]);

  // ─── Derived data ──────────────────────────────────────────
  const dateRange = useMemo(() => getDateRange(dateFilter), [dateFilter]);
  const questions = problemData?.data?.problemsetQuestionList?.questions;
  const isPremium = userData?.isPremium ?? false;
  const cacheEntries = cacheData?.entries;

  const readinessData = useMemo<ReadinessData | null>(() => {
    if (!problemData) return null;
    return getReadinessData(problemData, cacheData, dateRange);
  }, [problemData, cacheData, dateRange]);

  const recentAccepted = useMemo(
    () => buildAcceptedSet(cacheData, dateRange),
    [cacheData, dateRange],
  );

  const availability = useMemo<Record<string, TopicAvailability> | null>(() => {
    if (!questions) return null;
    return computeTopicAvailability(questions, recentAccepted, isPremium, dateRange, cacheEntries);
  }, [questions, recentAccepted, isPremium, dateRange, cacheEntries]);

  const bigButtonStates = useMemo<BigButtonStates | null>(() => {
    if (!questions) return null;
    return computeBigButtonStates(questions, recentAccepted, isPremium, dateRange, cacheEntries);
  }, [questions, recentAccepted, isPremium, dateRange, cacheEntries]);

  const sortedTopics = useMemo(() => {
    if (!readinessData) return [];
    return Object.entries(readinessData).sort((a, b) => b[1][1] - a[1][1]);
  }, [readinessData]);

  // ─── Handlers ──────────────────────────────────────────────
  const handleTopicClick = useCallback((topic: string, target: PracticeTarget) => {
    if (!questions) return;
    try {
      const slug = getNextPracticeProblem(topic, target, questions, cacheData, isPremium, dateRange);
      if (slug) openProblem(slug);
    } catch (e) {
      delogError('Error selecting problem', e);
    }
  }, [questions, cacheData, isPremium, dateRange]);

  const handleBigPracticeClick = useCallback((practiceType: BigPracticeMode) => {
    if (!problemData) return;
    try {
      const slug = getPracticeProblem(practiceType, problemData, cacheData, isPremium, dateRange);
      if (slug) openProblem(slug);
    } catch (e) {
      delogError('Error selecting practice problem', e);
    }
  }, [problemData, cacheData, isPremium, dateRange]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    chrome.storage.local.set({
      refresh_problems: Date.now(),
      modal_opened: Date.now(),
    });
    ensureLeetCodeTab();
    setTimeout(() => setRefreshing(false), 2000);
  }, []);

  const handleLegend = useCallback(() => {
    setLegendVisible(true);
    setTimeout(() => setLegendVisible(false), 3000);
  }, []);

  // ─── Render ────────────────────────────────────────────────
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

      <ControlRow
        dateFilter={dateFilter}
        onDateFilterChange={setDateFilter}
        onLegend={handleLegend}
        onRefresh={handleRefresh}
        refreshing={refreshing}
      />

      <InfoSummary
        userData={userData}
        problemData={problemData}
        cacheData={cacheData}
        totalSolved={recentAccepted.size}
        dateFilter={dateFilter}
      />

      <div id="currentReadiness">
        <BigPracticeButtons states={bigButtonStates} onPracticeClick={handleBigPracticeClick}>
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
        </BigPracticeButtons>
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
