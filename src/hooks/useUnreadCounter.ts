import { useCallback, useEffect, useRef, useState } from 'react';
import { COUNTER_REFRESH_DEBOUNCE_MS } from '../../shared/constants';
import type { ChoreAdapter } from '../adapters/types';

/**
 * Live unread counter backed by the adapter. `refresh` is debounced so a
 * burst of hits costs a single API call.
 * @param adapter Mail source.
 * @param initial Count known from the scan.
 */
export function useUnreadCounter(adapter: ChoreAdapter, initial: number) {
  const [count, setCount] = useState(initial);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const refresh = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      adapter.unreadCount().then(
        (value) => {
          if (mounted.current) setCount(value);
        },
        () => undefined,
      );
    }, COUNTER_REFRESH_DEBOUNCE_MS);
  }, [adapter]);

  return { count, refresh };
}
