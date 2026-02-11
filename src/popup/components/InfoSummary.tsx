/**
 * Info summary bar — shows username, solved count, cache count,
 * and last-sync timestamps at the top of the dashboard.
 */

import { useMemo, type FC } from 'react';
import type { UserStatus } from '../../types/models';
import type { ProblemData, SubmissionCacheData } from '../../types/storage.types';
import type { DateFilterPreset } from './DateFilter';

interface InfoSummaryProps {
  userData: UserStatus | undefined;
  problemData: ProblemData | undefined;
  cacheData: SubmissionCacheData | undefined;
  totalSolved: number;
  dateFilter: DateFilterPreset;
}

function formatAgo(ts: number | undefined): string | null {
  if (!ts) return null;
  const now = Date.now();
  const diffMin = Math.floor((now - ts) / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export const InfoSummary: FC<InfoSummaryProps> = ({
  userData,
  problemData,
  cacheData,
  totalSolved,
  dateFilter,
}) => {
  const totalProblems = problemData?.data?.problemsetQuestionList?.questions?.length ?? 0;
  const totalCacheEntries = cacheData?.entries ? Object.keys(cacheData.entries).length : 0;

  const problemsSyncLabel = useMemo(
    () => formatAgo(problemData?.fetchCompletedAt),
    [problemData?.fetchCompletedAt],
  );
  const subsSyncLabel = useMemo(
    () => formatAgo(cacheData?.lastIncrementalAt ?? cacheData?.lastFullScanAt ?? undefined),
    [cacheData?.lastIncrementalAt, cacheData?.lastFullScanAt],
  );

  return (
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
  );
};
