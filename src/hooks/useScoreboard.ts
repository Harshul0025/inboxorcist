import { useCallback, useMemo, useState } from 'react';
import { comboMultiplier, pointsForDecision, pointsForHit } from '../lib/scoring';

export interface Scoreboard {
  score: number;
  streak: number;
  bestCombo: number;
  multiplier: number;
  /** Records a successful boss hit that cleared `emails` emails. */
  hit: (emails: number) => void;
  /** Records a ghost-wave decision made in time. */
  decide: () => void;
  /** Records a miss (wrong key or timeout); resets the streak. */
  miss: () => void;
}

/** Score, streak and combo bookkeeping for one run. */
export function useScoreboard(): Scoreboard {
  const [state, setState] = useState({ score: 0, streak: 0, bestCombo: 0 });

  const hit = useCallback((emails: number) => {
    setState((s) => ({
      score: s.score + pointsForHit(emails, s.streak),
      streak: s.streak + 1,
      bestCombo: Math.max(s.bestCombo, s.streak + 1),
    }));
  }, []);
  const decide = useCallback(() => {
    setState((s) => ({
      score: s.score + pointsForDecision(s.streak),
      streak: s.streak + 1,
      bestCombo: Math.max(s.bestCombo, s.streak + 1),
    }));
  }, []);
  const miss = useCallback(() => {
    setState((s) => ({ ...s, streak: 0 }));
  }, []);

  return useMemo(
    () => ({ ...state, multiplier: comboMultiplier(state.streak), hit, decide, miss }),
    [state, hit, decide, miss],
  );
}
