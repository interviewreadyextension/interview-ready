/**
 * Date filter dropdown — controls the time window for readiness scores.
 * Also contains the legend "?" button and the refresh "↺" button.
 */

import { type FC } from 'react';
import type { DateRange } from '../../readiness-logic/readiness';

// ─── Presets ────────────────────────────────────────────────────────

export type DateFilterPreset = '7d' | '30d' | '120d' | 'all';

export const DATE_FILTER_OPTIONS: { value: DateFilterPreset; label: string }[] = [
  { value: 'all', label: 'All time' },
  { value: '120d', label: 'Last 120 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: '7d', label: 'Last 7 days' },
];

/** Convert a preset to a DateRange (undefined = all time). */
export function getDateRange(preset: DateFilterPreset): DateRange | undefined {
  if (preset === 'all') return undefined;
  const days = preset === '7d' ? 7 : preset === '30d' ? 30 : 120;
  const nowSec = Math.floor(Date.now() / 1000);
  return { startSec: nowSec - days * 86400, endSec: nowSec };
}

// ─── Component ──────────────────────────────────────────────────────

interface ControlRowProps {
  dateFilter: DateFilterPreset;
  onDateFilterChange: (preset: DateFilterPreset) => void;
  onLegend: () => void;
  onRefresh: () => void;
  refreshing: boolean;
}

export const ControlRow: FC<ControlRowProps> = ({
  dateFilter,
  onDateFilterChange,
  onLegend,
  onRefresh,
  refreshing,
}) => (
  <div className="control-row">
    <select
      className="date-filter"
      value={dateFilter}
      onChange={(e) => onDateFilterChange(e.target.value as DateFilterPreset)}
    >
      {DATE_FILTER_OPTIONS.map((opt) => (
        <option key={opt.value} value={opt.value}>{opt.label}</option>
      ))}
    </select>
    <div className="control-buttons">
      <button className="clickable control-btn" onClick={onLegend} title="Legend">?</button>
      <button
        className={`clickable control-btn${refreshing ? ' spinning' : ''}`}
        onClick={onRefresh}
        title="Refresh"
        disabled={refreshing}
      >↺</button>
    </div>
  </div>
);
