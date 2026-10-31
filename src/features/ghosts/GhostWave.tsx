import { motion, type PanInfo } from 'motion/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  GHOST_MIN_TIME_MS,
  GHOST_START_TIME_MS,
  GHOST_TIME_STEP_MS,
  REDUCED_MOTION_WINDOW_MS,
  SWIPE_THRESHOLD_PX,
} from '../../../shared/constants';
import type { ChoreAction } from '../../../shared/types';
import { useAnnounce } from '../../app/announcer';
import { useSettings } from '../../app/settings';
import { GhostSprite } from '../../components/GhostSprite';
import type { GhostSpec } from '../../lib/encounters';
import type { RunExecutor } from '../../lib/executor';
import { playSound } from '../../lib/sound';
import { strings } from '../../strings';

const KEY_ACTIONS: Readonly<Record<string, ChoreAction>> = {
  ArrowLeft: 'banish',
  ArrowRight: 'keep',
  ArrowUp: 'rescue',
};

/**
 * Time allowed for a ghost: waves speed up as they progress.
 * @param index Zero-based position in the wave.
 * @param reducedMotion Whether the player prefers reduced motion (gets a generous fixed time).
 */
export function ghostTimeMs(index: number, reducedMotion: boolean): number {
  if (reducedMotion) return Math.max(GHOST_START_TIME_MS, REDUCED_MOTION_WINDOW_MS * 2);
  return Math.max(GHOST_MIN_TIME_MS, GHOST_START_TIME_MS - index * GHOST_TIME_STEP_MS);
}

interface GhostWaveProps {
  ghosts: readonly GhostSpec[];
  mode: 'ghosts' | 'souls';
  executor: RunExecutor;
  onDecision: (action: ChoreAction, timedOut: boolean, ghost: GhostSpec) => void;
  onRescued?: (ghost: GhostSpec) => void;
  onComplete: () => void;
}

/**
 * Fast triage of uncertain mail (ghosts) or important mail (souls).
 * ← banish, → keep, ↑ rescue; buttons and swipes work too. Running out of
 * time keeps the email, the safe default.
 */
export function GhostWave({ ghosts, mode, executor, onDecision, onRescued, onComplete }: GhostWaveProps) {
  const { reducedMotion, sound } = useSettings();
  const announce = useAnnounce();
  const [index, setIndex] = useState(0);
  const completed = useRef(false);
  const ghost = ghosts[index];
  const souls = mode === 'souls';
  const canBanish = Boolean(ghost && !ghost.isImportant && !souls);
  const timeMs = ghostTimeMs(index, reducedMotion);
  const [tick, setTick] = useState<{ id: string; seconds: number } | null>(null);
  const secondsLeft = ghost && tick?.id === ghost.email.id ? tick.seconds : Math.ceil(timeMs / 1000);

  const advance = useCallback(() => {
    const nextIndex = index + 1;
    setIndex(nextIndex);
    if (nextIndex >= ghosts.length && !completed.current) {
      completed.current = true;
      onComplete();
    }
  }, [ghosts.length, index, onComplete]);

  const decide = useCallback(
    (action: ChoreAction, timedOut = false) => {
      if (!ghost) return;
      if (action === 'banish' && !canBanish) {
        announce(strings.ghosts.banishDisabled, 'assertive');
        return;
      }
      onDecision(action, timedOut, ghost);
      if (sound) playSound(action === 'rescue' ? 'rescue' : timedOut ? 'miss' : 'decide');
      announce(timedOut ? strings.ghosts.timeout : strings.ghosts.decided(action));
      executor.apply(action, [ghost.email.id]).then(
        () => {
          if (action === 'rescue') onRescued?.(ghost);
        },
        () => {
          announce(strings.ghosts.failed, 'assertive');
        },
      );
      advance();
    },
    [advance, announce, canBanish, executor, ghost, onDecision, onRescued, sound],
  );

  const decideRef = useRef(decide);
  useEffect(() => {
    decideRef.current = decide;
  }, [decide]);

  useEffect(() => {
    if (!ghost) return undefined;
    const id = ghost.email.id;
    const started = Date.now();
    const ticker = setInterval(() => {
      setTick({ id, seconds: Math.max(0, Math.ceil((timeMs - (Date.now() - started)) / 1000)) });
    }, 250);
    const timeout = setTimeout(() => {
      decideRef.current('keep', true);
    }, timeMs);
    return () => {
      clearInterval(ticker);
      clearTimeout(timeout);
    };
  }, [ghost, timeMs]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const action = KEY_ACTIONS[event.key];
      if (!action) return;
      event.preventDefault();
      decide(action);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [decide]);

  const onDragEnd = (_event: unknown, info: PanInfo) => {
    if (info.offset.y < -SWIPE_THRESHOLD_PX && Math.abs(info.offset.y) > Math.abs(info.offset.x)) decide('rescue');
    else if (info.offset.x < -SWIPE_THRESHOLD_PX) decide('banish');
    else if (info.offset.x > SWIPE_THRESHOLD_PX) decide('keep');
  };

  if (!ghost) return null;

  return (
    <section aria-labelledby="wave-heading" className="card">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="wave-heading" className="font-spooky text-gradient text-4xl sm:text-5xl">
          {souls ? strings.ghosts.soulsHeading : strings.ghosts.heading}
        </h2>
        <span className="text-sm text-slate-300">{strings.ghosts.of(index + 1, ghosts.length)}</span>
      </div>
      {souls && (
        <p id="souls-intro" className="mt-1 text-slate-300">
          {strings.ghosts.soulsIntro}
        </p>
      )}

      <div className="mt-3 h-2.5 overflow-hidden rounded-full border border-white/10 bg-black/40" aria-hidden="true">
        <div
          key={index}
          className={
            reducedMotion
              ? 'h-full w-full bg-amber-400/60'
              : 'timer-bar h-full bg-gradient-to-r from-rose-500 via-orange-400 to-amber-300'
          }
          style={{ animationDuration: `${timeMs}ms` }}
        />
      </div>
      <p className="mt-1 text-right text-xs text-slate-400" aria-live="off">
        {strings.ghosts.timeLeft(secondsLeft)}
      </p>

      <motion.article
        key={ghost.email.id}
        drag={!reducedMotion}
        dragSnapToOrigin
        dragElastic={0.6}
        onDragEnd={onDragEnd}
        // No fade: text stays at full contrast while the card slides in.
        initial={reducedMotion ? false : { y: 30, scale: 0.95 }}
        animate={{ y: 0, scale: 1 }}
        className={`mt-3 flex cursor-grab touch-none gap-4 rounded-3xl border p-4 active:cursor-grabbing ${
          ghost.isImportant
            ? 'border-amber-300/70 bg-amber-950/40 shadow-[0_0_40px_-10px_rgb(250_204_21)]'
            : 'border-violet-400/40 bg-violet-950/50 shadow-[0_0_40px_-14px_rgb(192_132_252)]'
        }`}
        aria-label={strings.ghosts.of(index + 1, ghosts.length)}
      >
        <GhostSprite seed={ghost.email.senderEmail} size={72} glow={ghost.isImportant} />
        <div className="min-w-0 flex-1">
          <p className="sensitive truncate font-semibold text-slate-100">{ghost.email.senderName}</p>
          <p className="sensitive truncate text-lg text-white">{ghost.email.subject}</p>
          <p className="sensitive line-clamp-2 text-sm text-slate-400">{ghost.email.snippet}</p>
          <p className="mt-2 text-sm text-purple-200">
            <span aria-hidden="true">✦ </span>
            {strings.ghosts.suggestion(ghost.suggestion, ghost.confidence)}
          </p>
        </div>
      </motion.article>

      <div className="mt-4 grid grid-cols-3 gap-3">
        <button
          type="button"
          className="btn btn-danger"
          disabled={!canBanish}
          aria-describedby={souls ? 'souls-intro' : undefined}
          aria-keyshortcuts="ArrowLeft"
          title={canBanish ? undefined : strings.ghosts.banishDisabled}
          onClick={() => {
            decide('banish');
          }}
        >
          <span aria-hidden="true">← </span>
          {strings.ghosts.banish}
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          aria-keyshortcuts="ArrowRight"
          onClick={() => {
            decide('keep');
          }}
        >
          {strings.ghosts.keep}
          <span aria-hidden="true"> →</span>
        </button>
        <button
          type="button"
          className="btn btn-success"
          aria-keyshortcuts="ArrowUp"
          onClick={() => {
            decide('rescue');
          }}
        >
          <span aria-hidden="true">↑ </span>
          {strings.ghosts.rescue}
        </button>
      </div>
    </section>
  );
}
