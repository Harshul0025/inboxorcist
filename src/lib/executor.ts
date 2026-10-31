import type { ChoreAction } from '../../shared/types';
import type { ChoreAdapter } from '../adapters/types';

export interface ExecutorCounts {
  cleared: number;
  rescued: number;
  kept: number;
}

/**
 * Executes player decisions against an adapter exactly once per message.
 * Message ids that are already processed (or currently in flight) are
 * skipped, so retries and double taps never double-apply an action.
 */
export class RunExecutor {
  private readonly processed = new Set<string>();
  private readonly inFlight = new Set<string>();
  private readonly counts: ExecutorCounts = { cleared: 0, rescued: 0, kept: 0 };

  /**
   * @param adapter Mail source to act on.
   * @param runId Id of this run; used for the undo label.
   */
  constructor(
    private readonly adapter: ChoreAdapter,
    readonly runId: string,
  ) {}

  /** Snapshot of how many emails each action has handled. */
  get totals(): ExecutorCounts {
    return { ...this.counts };
  }

  /** True when the message was already handled in this run. */
  hasProcessed(id: string): boolean {
    return this.processed.has(id);
  }

  /**
   * Applies an action to the given messages, skipping ones already handled.
   * @returns How many messages were newly handled.
   */
  async apply(action: ChoreAction, ids: readonly string[]): Promise<number> {
    const fresh = [...new Set(ids)].filter((id) => !this.processed.has(id) && !this.inFlight.has(id));
    if (fresh.length === 0) return 0;

    if (action === 'keep') {
      for (const id of fresh) this.processed.add(id);
      this.counts.kept += fresh.length;
      return fresh.length;
    }

    for (const id of fresh) this.inFlight.add(id);
    try {
      await this.adapter.apply(action, fresh, this.runId);
      for (const id of fresh) this.processed.add(id);
      if (action === 'banish') this.counts.cleared += fresh.length;
      else this.counts.rescued += fresh.length;
      return fresh.length;
    } finally {
      for (const id of fresh) this.inFlight.delete(id);
    }
  }
}

/**
 * Creates a run id that is safe to use inside a Gmail label name.
 * @param now Clock, injectable for tests.
 * @param random Random source, injectable for tests.
 */
export function createRunId(now: Date = new Date(), random: () => number = Math.random): string {
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\..+$/, '').replace('T', '-');
  const suffix = Math.floor(random() * 36 ** 4)
    .toString(36)
    .padStart(4, '0');
  return `run-${stamp}-${suffix}`;
}
