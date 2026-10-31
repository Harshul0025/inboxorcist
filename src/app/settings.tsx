import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { readFlag, writeFlag } from '../lib/storage';

export interface Settings {
  streamer: boolean;
  sound: boolean;
  reducedMotion: boolean;
  setStreamer: (value: boolean) => void;
  setSound: (value: boolean) => void;
}

const STREAMER_KEY = 'inboxorcist.streamer';
const SOUND_KEY = 'inboxorcist.sound';
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

const SettingsContext = createContext<Settings | null>(null);

function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

/**
 * Provides player preferences (streamer mode, sound) and the OS
 * reduced-motion preference to the whole app.
 */
export function SettingsProvider({ children }: { children: ReactNode }) {
  const [streamer, setStreamerState] = useState(() => readFlag(STREAMER_KEY, false));
  const [sound, setSoundState] = useState(() => readFlag(SOUND_KEY, true));
  const [reducedMotion, setReducedMotion] = useState(prefersReducedMotion);

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return undefined;
    const query = window.matchMedia(REDUCED_MOTION_QUERY);
    const onChange = (event: MediaQueryListEvent) => {
      setReducedMotion(event.matches);
    };
    query.addEventListener('change', onChange);
    return () => {
      query.removeEventListener('change', onChange);
    };
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('streamer', streamer);
  }, [streamer]);

  const setStreamer = useCallback((value: boolean) => {
    setStreamerState(value);
    writeFlag(STREAMER_KEY, value);
  }, []);
  const setSound = useCallback((value: boolean) => {
    setSoundState(value);
    writeFlag(SOUND_KEY, value);
  }, []);

  const value = useMemo(
    () => ({ streamer, sound, reducedMotion, setStreamer, setSound }),
    [streamer, sound, reducedMotion, setStreamer, setSound],
  );
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

/** Reads the current settings. Must be used inside `SettingsProvider`. */
export function useSettings(): Settings {
  const settings = useContext(SettingsContext);
  if (!settings) throw new Error('useSettings must be used inside SettingsProvider');
  return settings;
}
