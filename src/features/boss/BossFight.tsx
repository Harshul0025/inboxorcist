import { motion } from 'motion/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  REDUCED_MOTION_WINDOW_MS,
  WEAK_SPOT_MIN_WINDOW_MS,
  WEAK_SPOT_WINDOW_MS,
  WEAK_SPOT_WINDOW_STEP_MS,
} from '../../../shared/constants';
import type { ChoreAdapter } from '../../adapters/types';
import { useAnnounce } from '../../app/announcer';
import { useSettings } from '../../app/settings';
import { useStory } from '../../app/story';
import { GhostSprite } from '../../components/GhostSprite';
import type { BossSpec } from '../../lib/encounters';
import type { RunExecutor } from '../../lib/executor';
import { playSound } from '../../lib/sound';
import { storyLines } from '../../lib/story';
import { strings } from '../../strings';
import { useBossEngine } from './useBossEngine';

export const ARROW_KEYS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'] as const;
export type ArrowKey = (typeof ARROW_KEYS)[number];
const ARROW_SYMBOL: Readonly<Record<ArrowKey, string>> = {
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
};
const CENTER = { x: 50, y: 50 };

interface BossFightProps {
  boss: BossSpec;
  adapter: ChoreAdapter;
  executor: RunExecutor;
  importantIds: ReadonlySet<string>;
  streak: number;
  onHit: (emails: number) => void;
  onMiss: () => void;
  onDefeated: (cleared: number) => void;
  /** Random source, injectable for deterministic tests. */
  random?: () => number;
}

/**
 * A boss fight: hit the moving weak spot (click, tap or the arrow key it
 * shows) and every hit archives a real chunk of the boss's emails.
 */
export function BossFight({
  boss,
  adapter,
  executor,
  importantIds,
  streak,
  onHit,
  onMiss,
  onDefeated,
  random = Math.random,
}: BossFightProps) {
  const { reducedMotion, sound } = useSettings();
  const announce = useAnnounce();
  const tell = useStory();
  const clearedRef = useRef(0);
  const [shake, setShake] = useState(0);
  const [spawn, setSpawn] = useState(0);
  const [spot, setSpot] = useState<{ x: number; y: number; key: ArrowKey }>({ ...CENTER, key: 'ArrowUp' });

  const handleChunk = useCallback(
    (emails: number) => {
      clearedRef.current += emails;
      onHit(emails);
      if (sound) playSound('hit');
      announce(strings.boss.cleared(clearedRef.current));
    },
    [announce, onHit, sound],
  );

  const engine = useBossEngine({ boss, adapter, executor, importantIds, onChunk: handleChunk });
  const windowMs = reducedMotion
    ? REDUCED_MOTION_WINDOW_MS
    : Math.max(WEAK_SPOT_MIN_WINDOW_MS, WEAK_SPOT_WINDOW_MS - streak * WEAK_SPOT_WINDOW_STEP_MS);

  const moveSpot = useCallback(() => {
    const key = ARROW_KEYS[Math.floor(random() * ARROW_KEYS.length)] ?? 'ArrowUp';
    const position = reducedMotion ? CENTER : { x: 15 + random() * 70, y: 20 + random() * 60 };
    setSpot({ ...position, key });
    setSpawn((value) => value + 1);
  }, [random, reducedMotion]);

  useEffect(() => {
    if (engine.status !== 'fighting') return undefined;
    const timer = setTimeout(moveSpot, windowMs);
    return () => {
      clearTimeout(timer);
    };
  }, [engine.status, moveSpot, spawn, windowMs]);

  const strike = useCallback(() => {
    engine.hit();
    setShake((value) => value + 1);
    moveSpot();
  }, [engine, moveSpot]);

  useEffect(() => {
    if (engine.status !== 'fighting') return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (!(ARROW_KEYS as readonly string[]).includes(event.key)) return;
      event.preventDefault();
      if (event.key === spot.key) {
        strike();
      } else {
        onMiss();
        if (sound) playSound('miss');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [engine.status, onMiss, sound, spot.key, strike]);

  const pleaded = useRef(false);
  useEffect(() => {
    if (pleaded.current || engine.status !== 'fighting' || engine.maxHp === 0) return;
    if (engine.hp > 0 && engine.hp <= engine.maxHp / 2) {
      pleaded.current = true;
      tell(storyLines.bossPlea(boss.bossName, boss.plea));
    }
  }, [boss.bossName, boss.plea, engine.hp, engine.maxHp, engine.status, tell]);

  const finished = useRef(false);
  useEffect(() => {
    if (finished.current) return;
    if (engine.status === 'defeated') {
      finished.current = true;
      if (sound) playSound('defeat');
      announce(strings.boss.defeated(boss.bossName), 'assertive');
      tell(storyLines.bossDefeated(boss.epitaph));
      onDefeated(clearedRef.current);
    }
  }, [announce, boss.bossName, boss.epitaph, engine.status, onDefeated, sound, tell]);

  const percent = engine.maxHp > 0 ? (engine.hp / engine.maxHp) * 100 : 0;

  return (
    <section aria-labelledby="boss-name" className="card">
      <div className="flex flex-col items-center gap-2 text-center">
        <span className="rounded-full bg-purple-500/20 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-purple-200">
          {boss.category}
        </span>
        <h2 id="boss-name" className="sensitive text-3xl font-black text-amber-200">
          {boss.bossName}
        </h2>
        <p className="sensitive max-w-xl rounded-2xl bg-slate-800 px-4 py-2 text-slate-200 italic">“{boss.taunt}”</p>
      </div>

      <div className="mt-4">
        <div className="mb-1 flex justify-between text-sm text-slate-300">
          <span id="boss-hp-label">{strings.boss.hp}</span>
          <span className="tabular-nums" data-testid="boss-hp">
            {strings.boss.hpValue(engine.hp, engine.maxHp)}
          </span>
        </div>
        <div
          role="progressbar"
          aria-labelledby="boss-hp-label"
          aria-valuemin={0}
          aria-valuemax={engine.maxHp}
          aria-valuenow={engine.hp}
          aria-valuetext={strings.boss.hpValue(engine.hp, engine.maxHp)}
          className="h-4 overflow-hidden rounded-full bg-slate-800"
        >
          <div
            className="h-full origin-left bg-gradient-to-r from-rose-500 to-amber-400 transition-transform duration-300"
            style={{ transform: `scaleX(${percent / 100})` }}
          />
        </div>
      </div>

      {engine.status === 'loading' && <p className="mt-6 text-center text-slate-300">{strings.boss.loading}</p>}

      {engine.status === 'empty' && (
        <div className="mt-6 text-center">
          <p className="text-slate-300">{strings.boss.empty}</p>
          <button
            type="button"
            className="btn btn-primary mt-3"
            onClick={() => {
              onDefeated(0);
            }}
          >
            {strings.boss.continue}
          </button>
        </div>
      )}

      {engine.status === 'error' && (
        <div role="alert" className="mt-6 text-center">
          <p className="text-rose-300">{strings.boss.error}</p>
          <button type="button" className="btn btn-primary mt-3" onClick={engine.retry}>
            {strings.boss.retry}
          </button>
        </div>
      )}

      {(engine.status === 'fighting' || engine.status === 'defeated') && (
        <>
          <p className="mt-4 text-center text-sm text-slate-400">{strings.boss.instructions}</p>
          <div className="relative mt-3 h-72 overflow-hidden rounded-3xl bg-gradient-to-b from-slate-900 to-purple-950 sm:h-80">
            <motion.div
              key={shake}
              className="absolute inset-0 flex items-center justify-center"
              animate={reducedMotion ? {} : { x: [0, -12, 12, -6, 6, 0] }}
              transition={{ duration: 0.3 }}
            >
              <GhostSprite seed={boss.sender} size={180} />
            </motion.div>
            {engine.status === 'fighting' && (
              <button
                type="button"
                data-testid="weak-spot"
                aria-label={strings.boss.strike(ARROW_SYMBOL[spot.key])}
                aria-keyshortcuts={spot.key}
                onClick={strike}
                className="weak-spot absolute flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full text-2xl font-black text-slate-950"
                style={{ left: `${spot.x}%`, top: `${spot.y}%` }}
              >
                {ARROW_SYMBOL[spot.key]}
              </button>
            )}
          </div>
        </>
      )}
    </section>
  );
}
