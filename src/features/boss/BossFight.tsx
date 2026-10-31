import { AnimatePresence, motion } from 'motion/react';
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
import { GhostSprite } from '../../components/GhostSprite';
import { Graveyard } from '../../components/Graveyard';
import type { BossSpec } from '../../lib/encounters';
import type { RunExecutor } from '../../lib/executor';
import { playSound } from '../../lib/sound';
import { strings } from '../../strings';
import { useBossEngine } from './useBossEngine';
import { useBossStory } from './useBossStory';

export const ARROW_KEYS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'] as const;
export type ArrowKey = (typeof ARROW_KEYS)[number];
const ARROW_SYMBOL: Readonly<Record<ArrowKey, string>> = {
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
};
const CENTER = { x: 50, y: 50 };
const DAMAGE_POP_MS = 900;

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
  const clearedRef = useRef(0);
  const [shake, setShake] = useState(0);
  const [spawn, setSpawn] = useState(0);
  const [spot, setSpot] = useState<{ x: number; y: number; key: ArrowKey }>({ ...CENTER, key: 'ArrowUp' });

  const [pops, setPops] = useState<{ id: number; amount: number; x: number }[]>([]);
  const popId = useRef(0);

  const handleChunk = useCallback(
    (emails: number) => {
      clearedRef.current += emails;
      onHit(emails);
      if (sound) playSound('hit');
      announce(strings.boss.cleared(clearedRef.current));
      // Floating "-N" damage number; purely decorative.
      popId.current += 1;
      const id = popId.current;
      setPops((current) => [...current.slice(-4), { id, amount: emails, x: 40 + random() * 20 }]);
      setTimeout(() => {
        setPops((current) => current.filter((pop) => pop.id !== id));
      }, DAMAGE_POP_MS);
    },
    [announce, onHit, random, sound],
  );

  const engine = useBossEngine({ boss, adapter, executor, importantIds, onChunk: handleChunk });
  useBossStory(boss, engine);
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

  const finished = useRef(false);
  useEffect(() => {
    if (finished.current) return;
    if (engine.status === 'defeated') {
      finished.current = true;
      if (sound) playSound('defeat');
      announce(strings.boss.defeated(boss.bossName), 'assertive');
      onDefeated(clearedRef.current);
    }
  }, [announce, boss.bossName, engine.status, onDefeated, sound]);

  const percent = engine.maxHp > 0 ? (engine.hp / engine.maxHp) * 100 : 0;

  return (
    <section aria-labelledby="boss-name" className="card">
      <div className="flex flex-col items-center gap-3 text-center">
        <span className="chip">
          <span aria-hidden="true">💀</span> {boss.category}
        </span>
        <h2 id="boss-name" className="sensitive font-spooky text-gradient text-glow text-4xl sm:text-6xl">
          {boss.bossName}
        </h2>
        <p className="sensitive relative max-w-2xl rounded-2xl border border-violet-300/20 bg-violet-950/60 px-5 py-3 text-lg text-violet-50 italic">
          “{boss.taunt}”
        </p>
      </div>

      <div className="mt-4">
        <div className="mb-2 flex justify-between text-sm font-medium text-violet-100">
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
          className="hp-bar"
        >
          <div className="hp-fill" style={{ transform: `scaleX(${percent / 100})` }} />
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
          <p id="boss-instructions" className="mt-4 text-center text-sm text-violet-200/80">
            {strings.boss.instructions}
          </p>
          <div className="arena mt-3 h-80 sm:h-96">
            <Graveyard />
            {!reducedMotion && shake > 0 && (
              <motion.div
                key={`flash-${shake}`}
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 bg-amber-200"
                initial={{ opacity: 0.22 }}
                animate={{ opacity: 0 }}
                transition={{ duration: 0.25 }}
              />
            )}
            <motion.div
              key={shake}
              className="absolute inset-0 flex items-center justify-center"
              animate={reducedMotion ? {} : { x: [0, -14, 14, -7, 7, 0], rotate: [0, -3, 3, 0] }}
              transition={{ duration: 0.3 }}
            >
              <div className={reducedMotion ? '' : 'float'}>
                <GhostSprite seed={boss.sender} size={200} />
              </div>
            </motion.div>
            <AnimatePresence>
              {pops.map((pop) => (
                <motion.span
                  key={pop.id}
                  aria-hidden="true"
                  className="font-spooky pointer-events-none absolute top-1/3 text-5xl text-amber-300 drop-shadow-[0_0_12px_rgba(251,146,60,0.9)]"
                  style={{ left: `${pop.x}%` }}
                  initial={{ opacity: 1, y: 0, scale: reducedMotion ? 1 : 0.6 }}
                  animate={reducedMotion ? { opacity: 1 } : { opacity: 0, y: -80, scale: 1.2 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.85, ease: 'easeOut' }}
                >
                  -{pop.amount}
                </motion.span>
              ))}
            </AnimatePresence>
            {engine.status === 'fighting' && (
              <button
                type="button"
                data-testid="weak-spot"
                aria-label={strings.boss.strike(ARROW_SYMBOL[spot.key])}
                aria-describedby="boss-instructions"
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
