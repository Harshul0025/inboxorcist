import { useCallback, useEffect, useMemo, useRef } from 'react';
import { STORY_CHATTER_CHANCE } from '../../../shared/constants';
import type { ChoreAction } from '../../../shared/types';
import { useStory } from '../../app/story';
import type { Encounter, GhostSpec } from '../../lib/encounters';
import { storyLines } from '../../lib/story';

export interface RunNarration {
  /** The run begins. */
  start: (unread: number) => void;
  /** A ghost-wave decision: rescues and timeouts always talk, other decisions sometimes. */
  decision: (action: ChoreAction, timedOut: boolean, ghost: GhostSpec) => void;
  /** A boss was sealed forever. */
  sealed: (bossName: string) => void;
}

interface RunNarrationOptions {
  /** Whether encounters are currently being played. */
  playing: boolean;
  encounter: Encounter | undefined;
  multiplier: number;
  /** Random source, injectable for tests. */
  random?: () => number;
}

/**
 * Storyboard narration for a solo run. Waves, trapped souls and combo
 * increases are narrated automatically; the returned callbacks narrate
 * moments the game reports explicitly.
 */
export function useRunNarration({
  playing,
  encounter,
  multiplier,
  random = Math.random,
}: RunNarrationOptions): RunNarration {
  const tell = useStory();

  useEffect(() => {
    if (!playing || !encounter || encounter.kind === 'boss') return;
    tell(encounter.kind === 'souls' ? storyLines.soulsStart() : storyLines.waveStart());
  }, [encounter, playing, tell]);

  const lastMultiplier = useRef(1);
  useEffect(() => {
    if (multiplier > lastMultiplier.current) tell(storyLines.combo(multiplier));
    lastMultiplier.current = multiplier;
  }, [multiplier, tell]);

  const start = useCallback(
    (unread: number) => {
      tell(storyLines.runStart(unread));
    },
    [tell],
  );

  const decision = useCallback(
    (action: ChoreAction, timedOut: boolean, ghost: GhostSpec) => {
      if (action === 'rescue') tell(storyLines.rescue(ghost.email.senderName));
      else if (timedOut || random() < STORY_CHATTER_CHANCE) {
        tell(storyLines.decision(action, ghost.email.senderName, timedOut));
      }
    },
    [random, tell],
  );

  const sealed = useCallback(
    (bossName: string) => {
      tell(storyLines.sealed(bossName));
    },
    [tell],
  );

  return useMemo(() => ({ start, decision, sealed }), [decision, sealed, start]);
}
