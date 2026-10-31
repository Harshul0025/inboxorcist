import { AnimatePresence, motion } from 'motion/react';
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { STORY_MAX_VISIBLE, STORY_TOAST_MS } from '../../shared/constants';
import { strings } from '../strings';
import { useSettings } from './settings';

export interface StoryLine {
  speaker: string;
  emoji: string;
  text: string;
  /** Contains a sender or person name: blurred in streamer mode. */
  sensitive?: boolean;
}

interface StoryEntry extends StoryLine {
  id: number;
}

export type Tell = (line: StoryLine) => void;

const StoryContext = createContext<Tell | null>(null);
const noop: Tell = () => undefined;

/**
 * Storyboard notifications: short, funny comic-panel lines that narrate the
 * run (boss pleas, epitaphs, combos, rescues). They stack in a corner, fade
 * out on their own and let clicks pass through, so they never block play.
 */
export function StoryProvider({ children }: { children: ReactNode }) {
  const { reducedMotion } = useSettings();
  const [entries, setEntries] = useState<StoryEntry[]>([]);
  const nextId = useRef(0);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer) clearTimeout(timer);
    timers.current.delete(id);
    setEntries((current) => current.filter((entry) => entry.id !== id));
  }, []);

  const tell = useCallback<Tell>(
    (line) => {
      nextId.current += 1;
      const id = nextId.current;
      setEntries((current) => [...current, { ...line, id }].slice(-STORY_MAX_VISIBLE));
      timers.current.set(
        id,
        setTimeout(() => {
          dismiss(id);
        }, STORY_TOAST_MS),
      );
    },
    [dismiss],
  );

  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const timer of pending.values()) clearTimeout(timer);
      pending.clear();
    };
  }, []);

  const value = useMemo(() => tell, [tell]);
  return (
    <StoryContext.Provider value={value}>
      {children}
      <section
        role="log"
        aria-label={strings.story.regionLabel}
        aria-live="polite"
        className="pointer-events-none fixed inset-x-2 top-2 z-40 flex flex-col gap-2 sm:inset-x-auto sm:top-auto sm:bottom-4 sm:left-4 sm:w-88"
      >
        <AnimatePresence initial={false}>
          {entries.map((entry) => (
            <motion.div
              key={entry.id}
              layout={!reducedMotion}
              // Slide in without fading so text is at full contrast from the first frame.
              initial={reducedMotion ? false : { x: -48, rotate: -2, scale: 0.96 }}
              animate={{ x: 0, rotate: 0, scale: 1 }}
              exit={reducedMotion ? { opacity: 0 } : { x: '-120%' }}
              transition={{ duration: 0.25 }}
              className="story-panel flex w-full items-start gap-3 rounded-2xl p-3"
              data-testid="story-toast"
            >
              <span className="text-3xl leading-none" aria-hidden="true">
                {entry.emoji}
              </span>
              <p className="min-w-0 flex-1 text-sm">
                <strong className={`block text-amber-200 ${entry.sensitive ? 'sensitive' : ''}`}>
                  {entry.speaker}
                </strong>
                <span className={entry.sensitive ? 'sensitive' : ''}>{entry.text}</span>
              </p>
              <button
                type="button"
                className="pointer-events-auto rounded-full px-2 text-slate-300 hover:text-white"
                aria-label={strings.story.dismiss}
                onClick={() => {
                  dismiss(entry.id);
                }}
              >
                ×
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </section>
    </StoryContext.Provider>
  );
}

/** Returns the storyboard `tell` function (a no-op outside `StoryProvider`). */
export function useStory(): Tell {
  return useContext(StoryContext) ?? noop;
}
