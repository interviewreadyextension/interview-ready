import { useState, useEffect, useRef, type FC } from 'react';

interface SyncProgress {
  fetched: number;
  total: number;
  phase: string;
}

const PROGRESS_KEYS = [
  '_syncProgress_problems',
  '_syncProgress_submissions',
  '_syncProgress_status',
] as const;

/**
 * Animated number that scrolls up from old value to new value.
 */
const AnimatedNumber: FC<{ value: number; duration?: number }> = ({ value, duration = 300 }) => {
  const [display, setDisplay] = useState(value);
  const rafRef = useRef<number>(0);
  const startRef = useRef({ value: 0, time: 0 });

  useEffect(() => {
    const from = display;
    const to = value;
    if (from === to) return;

    startRef.current = { value: from, time: performance.now() };

    const animate = (now: number) => {
      const elapsed = now - startRef.current.time;
      const progress = Math.min(elapsed / duration, 1);
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = Math.round(from + (to - from) * eased);
      setDisplay(current);

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate);
      }
    };

    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, duration]);

  return <span className="sync-number">{display.toLocaleString()}</span>;
};

function getPhaseLabel(phase: string): string {
  if (phase === 'submissions') return 'Getting submission history';
  if (phase === 'scanning') return 'Getting submission history';
  if (phase === 'status') return 'Syncing statuses';
  return 'Loading problems';
}

/**
 * Single progress row for one sync phase.
 */
const ProgressRow: FC<{ progress: SyncProgress }> = ({ progress }) => {
  const isIndeterminate = progress.phase === 'submissions' || progress.total <= 0;
  const pct = !isIndeterminate ? (progress.fetched / progress.total) * 100 : 0;

  return (
    <div className="sync-progress">
      <div className="sync-progress-label">
        {getPhaseLabel(progress.phase)}:&nbsp;
        <AnimatedNumber value={progress.fetched} />
        {!isIndeterminate && (
          <>
            &nbsp;/&nbsp;
            <AnimatedNumber value={progress.total} />
          </>
        )}
        {isIndeterminate && <span> found…</span>}
      </div>
      <div className="sync-progress-track">
        <div
          className={`sync-progress-fill${isIndeterminate ? ' indeterminate' : ''}`}
          style={isIndeterminate ? undefined : { width: `${Math.min(pct, 100)}%` }}
        />
      </div>
    </div>
  );
};

/**
 * Progress bar(s) shown during LeetCode data sync.
 * Reads from per-phase keys in chrome.storage.local.
 */
export const SyncProgressBar: FC = () => {
  const [phases, setPhases] = useState<Record<string, SyncProgress>>({});

  useEffect(() => {
    // Load initial
    chrome.storage.local.get([...PROGRESS_KEYS], (result) => {
      const initial: Record<string, SyncProgress> = {};
      for (const key of PROGRESS_KEYS) {
        if (result[key]) initial[key] = result[key] as SyncProgress;
      }
      setPhases(initial);
    });

    // Listen for updates
    function listener(changes: Record<string, chrome.storage.StorageChange>) {
      for (const key of PROGRESS_KEYS) {
        if (changes[key]) {
          const val = changes[key].newValue as SyncProgress | undefined;
          setPhases(prev => {
            const next = { ...prev };
            if (val) {
              next[key] = val;
            } else {
              delete next[key];
            }
            return next;
          });
        }
      }
    }
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, []);

  const activePhases = Object.values(phases);
  if (activePhases.length === 0) return null;

  return (
    <>
      {activePhases.map((p) => (
        <ProgressRow key={p.phase} progress={p} />
      ))}
    </>
  );
};
