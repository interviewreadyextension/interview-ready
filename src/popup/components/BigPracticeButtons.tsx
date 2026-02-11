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
    {/* Top: suggested */}
    <button
      className="clickable bigpractice"
      onClick={() => onPracticeClick('suggested')}
    >
      {states.suggested.label}
    </button>

    {/* Topic rows are inserted here as children */}
    {children}

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
