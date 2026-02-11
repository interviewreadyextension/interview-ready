/**
 * Big practice buttons — the three main action buttons (suggested, review, random)
 * that appear above, between, and below the topic rows.
 */

import type { FC } from 'react';
import type { BigButtonStates, BigPracticeMode } from '../../readiness-logic/readiness';

interface BigPracticeButtonsProps {
  states: BigButtonStates;
  onPracticeClick: (mode: BigPracticeMode) => void;
}

/** Renders the suggested button, review button, and random button as a fragment. */
export const BigPracticeButtons: FC<BigPracticeButtonsProps & { children?: React.ReactNode }> = ({
  states,
  onPracticeClick,
  children,
}) => (
  <>
    {/* Top: suggested — with progress bar below label */}
    <button
      className="clickable bigpractice bigpractice-suggested"
      onClick={() => onPracticeClick('suggested')}
    >
      <div>{states.suggested.label}</div>
      {states.suggested.total > 0 && (
        <div className="bigpractice-progress-track">
          <div
            className="bigpractice-progress-fill"
            style={{ width: `${Math.min(100, (states.suggested.done / states.suggested.total) * 100)}%` }}
          />
        </div>
      )}
    </button>

    {/* Topic rows are inserted here as children */}
    <div className="topic-rows-group">
      {children}
    </div>

    {/* Review */}
    {states.review.enabled ? (
      <button
        className="clickable bigpractice"
        onClick={() => onPracticeClick('review')}
      >
        {states.review.label}
      </button>
    ) : (
      <button
        className="clickable bigpractice disabled"
        disabled
        title="No completed problems yet"
      >
        {states.review.label}
      </button>
    )}

    {/* Random */}
    <button
      className="clickable bigpractice"
      onClick={() => onPracticeClick('random')}
    >
      Solve Random Problem
    </button>
  </>
);
