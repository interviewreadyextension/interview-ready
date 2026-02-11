/**
 * Single topic row in the readiness dashboard.
 *
 * Renders five practice-arrow buttons (suggested, easy, medium, hard, random)
 * followed by the topic name and its readiness percentage. Each button
 * shows a tooltip with unsolved/completed counts.
 */

import type { FC } from 'react';
import type { TopicAvailability, PracticeTarget } from '../../readiness-logic/readiness';

interface TopicRowProps {
  topic: string;
  status: string;
  percentage: number;
  availability: TopicAvailability;
  onTopicClick: (topic: string, target: PracticeTarget) => void;
}

const DIFFICULTIES: PracticeTarget[] = ['suggested', 'easy', 'medium', 'hard', 'random'];

export const TopicRow: FC<TopicRowProps> = ({ topic, status, percentage, availability, onTopicClick }) => {
  if (availability.suggested.total === 0) return null;

  const readinessText =
    status === 'ready'
      ? `Ready %${percentage.toFixed()}`
      : `%${percentage.toFixed()}`;

  return (
    <div className="topicStatus">
      {DIFFICULTIES.map((diff) => {
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
