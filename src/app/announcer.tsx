import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from 'react';

export type Announce = (message: string, priority?: 'polite' | 'assertive') => void;

const AnnouncerContext = createContext<Announce | null>(null);

/**
 * Screen-reader announcements for every game action, via ARIA live regions.
 * Re-announcing identical text works because a counter forces a new node.
 */
export function AnnouncerProvider({ children }: { children: ReactNode }) {
  const [polite, setPolite] = useState({ id: 0, text: '' });
  const [assertive, setAssertive] = useState({ id: 0, text: '' });

  const announce = useCallback<Announce>((message, priority = 'polite') => {
    const setter = priority === 'assertive' ? setAssertive : setPolite;
    setter((previous) => ({ id: previous.id + 1, text: message }));
  }, []);

  const value = useMemo(() => announce, [announce]);
  return (
    <AnnouncerContext.Provider value={value}>
      {children}
      <div className="sr-only" aria-live="polite" aria-atomic="true" data-testid="announcer-polite">
        <span key={polite.id}>{polite.text}</span>
      </div>
      <div className="sr-only" aria-live="assertive" aria-atomic="true" data-testid="announcer-assertive">
        <span key={assertive.id}>{assertive.text}</span>
      </div>
    </AnnouncerContext.Provider>
  );
}

/** Returns the announce function. Must be used inside `AnnouncerProvider`. */
export function useAnnounce(): Announce {
  const announce = useContext(AnnouncerContext);
  if (!announce) throw new Error('useAnnounce must be used inside AnnouncerProvider');
  return announce;
}
