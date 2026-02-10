import type { FC } from 'react';
import type { ProblemData, SubmissionData } from '../../types/storage.types';
import type { UserStatus } from '../../types/models';

/**
 * Format timestamp from ms to localeString
 */
function formatTimestampMs(value: number | undefined): string {
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

interface DebugPanelProps {
  userData?: UserStatus;
  problems?: ProblemData;
  submissions?: SubmissionData;
}

export const DebugPanel: FC<DebugPanelProps> = ({ userData, problems: problemData, submissions: submissionData }) => {
  if (!userData?.isSignedIn) {
    return null;
  }

  const problemCount = problemData?.data?.problemsetQuestionList?.questions?.length ?? 0;
  const problemTotal = problemData?.data?.problemsetQuestionList?.total;
  const submissionCount = submissionData?.data?.recentAcSubmissionList?.length ?? 0;

  const isLegacyProblems = problemCount > 0 && !problemData?.source;
  const isLegacySubs = submissionCount > 0 && !submissionData?.firstSyncedAt;

  const lines = [
    `user: ${userData?.username ?? 'unknown'}`,
    '',
    `problems:${isLegacyProblems ? ' (legacy - pre-migration data)' : ''}`,
    `  source: ${problemData?.source ?? 'n/a'}`,
    `  generatedAt: ${problemData?.generatedAt ?? 'n/a'}`,
    `  fetchStartedAt: ${formatTimestampMs(problemData?.fetchStartedAt)}`,
    `  fetchCompletedAt: ${formatTimestampMs(problemData?.fetchCompletedAt)}`,
    `  lastAttemptAt: ${formatTimestampMs(problemData?.lastAttemptAt)}`,
    `  lastError: ${problemData?.lastError ?? 'none'}`,
    `  usingCache: ${problemData?.usingCache ? 'yes' : 'no'}`,
    `  count: ${problemCount}${Number.isFinite(problemTotal) ? ` / ${problemTotal}` : ''}`,
    '',
    `submissions:${isLegacySubs ? ' (legacy - pre-migration data)' : ''}`,
    `  source: ${submissionData?.source ?? 'n/a'}`,
    `  firstSyncedAt: ${formatTimestampMs(submissionData?.firstSyncedAt)}`,
    `  lastSyncedAt: ${formatTimestampMs(submissionData?.lastSyncedAt)}`,
    `  lastSyncedTimestamp: ${formatTimestampSeconds(submissionData?.lastSyncedTimestamp)}`,
    `  lastError: ${submissionData?.lastError ?? 'none'}`,
    `  count: ${submissionCount}`,
  ];

  return (
    <details id="debug-panel">
      <summary>Debug</summary>
      <pre id="debug-content">{lines.join('\n')}</pre>
    </details>
  );
};
