import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChoreAdapter } from '../../adapters/types';
import { chunk } from '../../lib/async';
import { type BossSpec, bossChunkSize } from '../../lib/encounters';
import type { RunExecutor } from '../../lib/executor';

export type BossStatus = 'loading' | 'fighting' | 'defeated' | 'empty' | 'error';

export interface BossEngineOptions {
  boss: BossSpec;
  adapter: ChoreAdapter;
  executor: RunExecutor;
  importantIds: ReadonlySet<string>;
  /** Called after each chunk is really archived, with the number of emails. */
  onChunk: (emails: number) => void;
}

export interface BossEngine {
  status: BossStatus;
  hp: number;
  maxHp: number;
  cleared: number;
  /** Queues one hit; hits are executed one chunk at a time, in order. */
  hit: () => void;
  /** Resumes after an error (re-loads ids if loading failed). */
  retry: () => void;
}

/**
 * Drives one boss fight against real mail. HP is the sender's real unread
 * count (minus important mail) and only drops after the adapter confirms
 * each chunk, so the bar always reflects what actually happened.
 */
export function useBossEngine({ boss, adapter, executor, importantIds, onChunk }: BossEngineOptions): BossEngine {
  const [status, setStatus] = useState<BossStatus>('loading');
  const [hp, setHp] = useState(0);
  const [maxHp, setMaxHp] = useState(0);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const chunks = useRef<string[][]>([]);
  const next = useRef(0);
  const pending = useRef(0);
  const busy = useRef(false);
  const mounted = useRef(true);
  const onChunkRef = useRef(onChunk);

  useEffect(() => {
    onChunkRef.current = onChunk;
  }, [onChunk]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    adapter.idsForSender(boss.sender).then(
      (ids) => {
        if (cancelled) return;
        const targets = ids.filter((id) => !importantIds.has(id) && !executor.hasProcessed(id));
        chunks.current = chunk(targets, bossChunkSize(targets.length || 1));
        next.current = 0;
        setMaxHp(targets.length);
        setHp(targets.length);
        setStatus(targets.length === 0 ? 'empty' : 'fighting');
      },
      () => {
        if (!cancelled) setStatus('error');
      },
    );
    return () => {
      cancelled = true;
    };
  }, [adapter, boss.sender, executor, importantIds, loadAttempt]);

  const process = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      while (pending.current > 0 && next.current < chunks.current.length) {
        const ids = chunks.current[next.current] ?? [];
        await executor.apply('banish', ids);
        next.current += 1;
        pending.current -= 1;
        if (!mounted.current) return;
        setHp((value) => Math.max(0, value - ids.length));
        onChunkRef.current(ids.length);
      }
      pending.current = 0;
      if (mounted.current && next.current >= chunks.current.length && chunks.current.length > 0) {
        setStatus('defeated');
      }
    } catch {
      pending.current = 0;
      if (mounted.current) setStatus('error');
    } finally {
      busy.current = false;
    }
  }, [executor]);

  const hit = useCallback(() => {
    if (status !== 'fighting') return;
    pending.current += 1;
    void process();
  }, [process, status]);

  const retry = useCallback(() => {
    if (chunks.current.length === 0) {
      setStatus('loading');
      setLoadAttempt((value) => value + 1);
      return;
    }
    setStatus('fighting');
  }, []);

  return { status, hp, maxHp, cleared: maxHp - hp, hit, retry };
}
