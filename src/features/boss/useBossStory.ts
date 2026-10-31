import { useEffect, useRef } from 'react';
import { useStory } from '../../app/story';
import type { BossSpec } from '../../lib/encounters';
import { storyLines } from '../../lib/story';
import type { BossEngine } from './useBossEngine';

/**
 * Narrates a boss fight on the storyboard: the boss begs once when it drops
 * to half health, and gets its epitaph once it is defeated. Shared by the
 * solo boss fight and the raid big screen.
 * @param boss Boss being fought (name and Gemini-written lines).
 * @param engine Live fight state from `useBossEngine`.
 */
export function useBossStory(
  boss: Pick<BossSpec, 'bossName' | 'plea' | 'epitaph'>,
  engine: Pick<BossEngine, 'status' | 'hp' | 'maxHp'>,
): void {
  const tell = useStory();
  const pleaded = useRef(false);
  const mourned = useRef(false);
  const { status, hp, maxHp } = engine;

  useEffect(() => {
    if (pleaded.current || status !== 'fighting' || maxHp === 0) return;
    if (hp > 0 && hp <= maxHp / 2) {
      pleaded.current = true;
      tell(storyLines.bossPlea(boss.bossName, boss.plea));
    }
  }, [boss.bossName, boss.plea, hp, maxHp, status, tell]);

  useEffect(() => {
    if (mourned.current || status !== 'defeated') return;
    mourned.current = true;
    tell(storyLines.bossDefeated(boss.epitaph));
  }, [boss.epitaph, status, tell]);
}
