/**
 * Legend overlay — explains what each practice arrow colour means.
 * Shown briefly when the user clicks the "?" button.
 */

import type { FC } from 'react';

export const Legend: FC<{ visible: boolean }> = ({ visible }) => {
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
