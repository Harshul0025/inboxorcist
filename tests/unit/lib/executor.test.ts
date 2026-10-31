import { describe, expect, it, vi } from 'vitest';
import { DemoAdapter } from '../../../src/adapters/DemoAdapter';
import { createRunId, RunExecutor } from '../../../src/lib/executor';

function setup() {
  const adapter = new DemoAdapter({ latencyMs: 0 });
  const apply = vi.spyOn(adapter, 'apply');
  return { adapter, apply, executor: new RunExecutor(adapter, 'run-test') };
}

describe('RunExecutor', () => {
  it('applies each message exactly once', async () => {
    const { apply, executor } = setup();
    expect(await executor.apply('banish', ['demo-00001', 'demo-00002', 'demo-00001'])).toBe(2);
    expect(await executor.apply('banish', ['demo-00001', 'demo-00003'])).toBe(1);
    expect(apply).toHaveBeenCalledTimes(2);
    expect(apply).toHaveBeenLastCalledWith('banish', ['demo-00003'], 'run-test');
    expect(executor.totals).toEqual({ cleared: 3, rescued: 0, kept: 0 });
  });

  it('skips ids that are already in flight (double taps)', async () => {
    const { apply, executor } = setup();
    const [first, second] = await Promise.all([
      executor.apply('banish', ['demo-00010']),
      executor.apply('banish', ['demo-00010']),
    ]);
    expect(first + second).toBe(1);
    expect(apply).toHaveBeenCalledTimes(1);
  });

  it('records keep without touching the mailbox', async () => {
    const { apply, executor } = setup();
    expect(await executor.apply('keep', ['demo-00004'])).toBe(1);
    expect(apply).not.toHaveBeenCalled();
    expect(executor.hasProcessed('demo-00004')).toBe(true);
    expect(executor.totals.kept).toBe(1);
  });

  it('counts rescues separately', async () => {
    const { executor } = setup();
    await executor.apply('rescue', ['demo-00005']);
    expect(executor.totals.rescued).toBe(1);
  });

  it('does not mark failed messages as processed, so a retry works', async () => {
    const { adapter, apply, executor } = setup();
    apply.mockRejectedValueOnce(new Error('network'));
    await expect(executor.apply('banish', ['demo-00006'])).rejects.toThrow('network');
    expect(executor.hasProcessed('demo-00006')).toBe(false);
    apply.mockImplementation((...args) => DemoAdapter.prototype.apply.apply(adapter, args));
    expect(await executor.apply('banish', ['demo-00006'])).toBe(1);
  });

  it('returns 0 for an empty list', async () => {
    const { executor } = setup();
    expect(await executor.apply('banish', [])).toBe(0);
  });
});

describe('createRunId', () => {
  it('is label-safe and deterministic for a given clock and random source', () => {
    const id = createRunId(new Date('2026-10-31T10:20:30.456Z'), () => 0.5);
    expect(id).toMatch(/^run-20261031-102030-[0-9a-z]{4}$/);
    expect(createRunId(new Date('2026-10-31T10:20:30Z'), () => 0.5)).toBe(id);
  });
});
