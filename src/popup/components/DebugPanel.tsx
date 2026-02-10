import { useState, type FC } from 'react';
import type { ProblemData, SubmissionData, ProblemStatusData } from '../../types/storage.types';
import type { UserStatus } from '../../types/models';

/**
 * Format timestamp from ms to localeString
 */
function formatTimestampMs(value: number | undefined | null): string {
  if (!value) return 'n/a';
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return String(value);
  return new Date(numeric).toLocaleString();
}

/**
 * Format timestamp from seconds to localeString
 */
function formatTimestampSeconds(value: string | null | undefined): string {
  if (!value) return 'n/a';
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return String(value);
  return new Date(numeric * 1000).toLocaleString();
}

function timeSince(ms: number | undefined | null): string {
  if (!ms) return 'n/a';
  const delta = Date.now() - ms;
  if (delta < 0) return 'in the future?';
  if (delta < 60_000) return `${Math.round(delta / 1000)}s ago`;
  if (delta < 3_600_000) return `${Math.round(delta / 60_000)}m ago`;
  if (delta < 86_400_000) return `${(delta / 3_600_000).toFixed(1)}h ago`;
  return `${(delta / 86_400_000).toFixed(1)}d ago`;
}

interface DiagnosticLog {
  ts: number;
  event: string;
  detail?: string;
}

interface DebugPanelProps {
  userData?: UserStatus;
  problems?: ProblemData;
  submissions?: SubmissionData;
  statusOverlay?: ProblemStatusData;
}

export const DebugPanel: FC<DebugPanelProps> = ({ userData, problems: problemData, submissions: submissionData, statusOverlay }) => {
  const [diagnosticLog, setDiagnosticLog] = useState<DiagnosticLog[]>([]);
  const [copied, setCopied] = useState(false);

  // Load diagnostic log from storage on first expand
  const handleToggle = () => {
    chrome.storage.local.get(['_diagnosticLog'], (result) => {
      setDiagnosticLog((result._diagnosticLog as DiagnosticLog[]) ?? []);
    });
  };

  const problemCount = problemData?.data?.problemsetQuestionList?.questions?.length ?? 0;
  const problemTotal = problemData?.data?.problemsetQuestionList?.total;
  const submissionCount = submissionData?.data?.recentAcSubmissionList?.length ?? 0;

  const isLegacyProblems = problemCount > 0 && !problemData?.source;
  const isLegacySubs = submissionCount > 0 && !submissionData?.firstSyncedAt;

  const now = Date.now();

  // Status overlay info (Mode A)
  const statusAcCount = statusOverlay?.statuses
    ? Object.values(statusOverlay.statuses).filter((s) => s === 'ac').length
    : 0;
  const statusTotal = statusOverlay?.totalProblems ?? 0;

  // Check if semaphore is stale (>5 min old with no completion)
  const semaphoreStale =
    problemData?.fetchStartedAt &&
    !problemData?.fetchCompletedAt &&
    now - problemData.fetchStartedAt > 5 * 60_000;

  // First few submission slugs for quick sanity check
  const sampleSubmissions = submissionData?.data?.recentAcSubmissionList
    ?.slice(0, 3)
    .map((s) => s.titleSlug)
    .join(', ') ?? 'none';

  // Sample problem titles
  const sampleProblems = problemData?.data?.problemsetQuestionList?.questions
    ?.slice(0, 3)
    .map((q) => q.titleSlug)
    .join(', ') ?? 'none';

  const lines = [
    `=== Interview Ready Debug ===`,
    `timestamp: ${new Date().toISOString()}`,
    ``,
    `── User ──`,
    `  signed in: ${userData?.isSignedIn ?? false}`,
    `  username: ${userData?.username ?? 'none'}`,
    `  premium: ${userData?.isPremium ?? false}`,
    ``,
    `── Problems ──${isLegacyProblems ? ' ⚠ LEGACY DATA' : ''}`,
    `  count: ${problemCount}${Number.isFinite(problemTotal) ? ` (total: ${problemTotal})` : ''}`,
    `  source: ${problemData?.source ?? 'MISSING'}`,
    `  fetchStartedAt: ${formatTimestampMs(problemData?.fetchStartedAt)} (${timeSince(problemData?.fetchStartedAt)})`,
    `  fetchCompletedAt: ${formatTimestampMs(problemData?.fetchCompletedAt)} (${timeSince(problemData?.fetchCompletedAt)})`,
    `  lastAttemptAt: ${formatTimestampMs(problemData?.lastAttemptAt)} (${timeSince(problemData?.lastAttemptAt)})`,
    `  lastError: ${problemData?.lastError ?? 'none'}`,
    `  usingCache: ${problemData?.usingCache ?? 'n/a'}`,
    semaphoreStale ? `  ⚠ STALE SEMAPHORE: fetch started ${timeSince(problemData?.fetchStartedAt)} but never completed` : null,
    `  sample: [${sampleProblems}]`,
    ``,
    `── Submissions ──${isLegacySubs ? ' ⚠ LEGACY DATA' : ''}`,
    `  count: ${submissionCount}`,
    `  source: ${submissionData?.source ?? 'MISSING'}`,
    `  firstSyncedAt: ${formatTimestampMs(submissionData?.firstSyncedAt)} (${timeSince(submissionData?.firstSyncedAt)})`,
    `  lastSyncedAt: ${formatTimestampMs(submissionData?.lastSyncedAt)} (${timeSince(submissionData?.lastSyncedAt)})`,
    `  lastSyncedTimestamp: ${formatTimestampSeconds(submissionData?.lastSyncedTimestamp)}`,
    `  lastError: ${submissionData?.lastError ?? 'none'}`,
    `  sample: [${sampleSubmissions}]`,
    ``,
    `── Status Overlay ──`,
    `  accepted: ${statusAcCount} / ${statusTotal}`,
    `  fetchedAt: ${formatTimestampMs(statusOverlay?.fetchedAt)} (${timeSince(statusOverlay?.fetchedAt)})`,
    `  lastError: ${statusOverlay?.lastError ?? 'none'}`,
    ``,
    `── Diagnostics ──`,
    `  problemData exists: ${!!problemData}`,
    `  problemData keys: ${problemData ? Object.keys(problemData).join(', ') : 'n/a'}`,
    `  submissionData exists: ${!!submissionData}`,
    `  submissionData keys: ${submissionData ? Object.keys(submissionData).join(', ') : 'n/a'}`,
    `  userData exists: ${!!userData}`,
    `  raw problemData type: ${typeof problemData}`,
    `  questions array?: ${Array.isArray(problemData?.data?.problemsetQuestionList?.questions)}`,
    ``,
    `── Content Script Log ──`,
    ...(diagnosticLog.length > 0
      ? diagnosticLog.slice(-20).map(
          (entry) => `  [${new Date(entry.ts).toLocaleTimeString()}] ${entry.event}${entry.detail ? ': ' + entry.detail : ''}`
        )
      : ['  (no log entries — open popup while on leetcode.com)']),
  ].filter((line): line is string => line !== null);

  const debugText = lines.join('\n');

  const handleCopy = () => {
    navigator.clipboard.writeText(debugText).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <details id="debug-panel" onToggle={handleToggle}>
      <summary>Debug</summary>
      <button
        onClick={handleCopy}
        style={{
          fontSize: '11px',
          padding: '2px 8px',
          margin: '4px 0',
          cursor: 'pointer',
          background: copied ? '#4caf50' : '#333',
          color: '#fff',
          border: 'none',
          borderRadius: '3px',
        }}
      >
        {copied ? '✓ Copied!' : 'Copy Debug Info'}
      </button>
      <pre id="debug-content" style={{ fontSize: '10px', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{debugText}</pre>
    </details>
  );
};
