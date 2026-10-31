import { useCallback, useEffect, useRef, useState } from 'react';
import type { Proposal } from '../../shared/types';
import type { ChoreAdapter, ScanResult } from '../adapters/types';
import { useServices } from '../app/services';
import { buildEncounters, type EncounterPlan } from '../lib/encounters';

export type RunSetup =
  | { status: 'scanning'; done: number; total: number }
  | { status: 'consulting' }
  | { status: 'ready'; scan: ScanResult; proposal: Proposal; plan: EncounterPlan }
  | { status: 'error' };

/**
 * Scans the inbox, asks the game master for verdicts and builds the
 * encounter plan. `retry` restarts the whole pipeline.
 * @param adapter Mail source.
 */
export function useRunSetup(adapter: ChoreAdapter): { setup: RunSetup; retry: () => void } {
  const { api } = useServices();
  const [setup, setSetup] = useState<RunSetup>({ status: 'scanning', done: 0, total: 0 });
  const [attempt, setAttempt] = useState(0);
  const active = useRef(0);

  useEffect(() => {
    const token = (active.current += 1);
    const isCurrent = () => active.current === token;

    void (async () => {
      try {
        const scan = await adapter.scan((done, total) => {
          if (isCurrent()) setSetup({ status: 'scanning', done, total });
        });
        if (!isCurrent()) return;
        setSetup({ status: 'consulting' });
        const proposal = await api.propose(scan.groups);
        if (!isCurrent()) return;
        setSetup({ status: 'ready', scan, proposal, plan: buildEncounters(scan, proposal) });
      } catch {
        if (isCurrent()) setSetup({ status: 'error' });
      }
    })();

    return () => {
      active.current += 1;
    };
  }, [adapter, api, attempt]);

  const retry = useCallback(() => {
    setSetup({ status: 'scanning', done: 0, total: 0 });
    setAttempt((value) => value + 1);
  }, []);

  return { setup, retry };
}
