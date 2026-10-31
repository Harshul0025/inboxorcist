import { describe, expect, it, vi } from 'vitest';
import { chunk, mapWithConcurrency, sleep, withRetry } from '../../../src/lib/async';

const noWait = () => Promise.resolve();

describe('withRetry', () => {
  it('retries retryable errors with growing backoff and then succeeds', async () => {
    const waits: number[] = [];
    let calls = 0;
    const result = await withRetry(
      async () => {
        calls += 1;
        if (calls < 3) throw new Error('flaky');
        return 'ok';
      },
      { shouldRetry: () => true, wait: (ms) => (waits.push(ms), Promise.resolve()), random: () => 1, baseDelayMs: 100 },
    );
    expect(result).toBe('ok');
    expect(calls).toBe(3);
    expect(waits).toEqual([100, 200]);
  });

  it('does not retry non-retryable errors', async () => {
    const task = vi.fn().mockRejectedValue(new Error('fatal'));
    await expect(withRetry(task, { shouldRetry: () => false, wait: noWait })).rejects.toThrow('fatal');
    expect(task).toHaveBeenCalledTimes(1);
  });

  it('gives up after the maximum attempts', async () => {
    const task = vi.fn().mockRejectedValue(new Error('down'));
    await expect(withRetry(task, { shouldRetry: () => true, attempts: 3, wait: noWait })).rejects.toThrow('down');
    expect(task).toHaveBeenCalledTimes(3);
  });

  it('caps the delay', async () => {
    const waits: number[] = [];
    let calls = 0;
    await withRetry(
      async () => {
        calls += 1;
        if (calls < 5) throw new Error('x');
        return calls;
      },
      {
        shouldRetry: () => true,
        wait: (ms) => (waits.push(ms), Promise.resolve()),
        random: () => 1,
        baseDelayMs: 1000,
        maxDelayMs: 1500,
      },
    );
    expect(Math.max(...waits)).toBe(1500);
  });
});

describe('mapWithConcurrency', () => {
  it('preserves order, respects the limit and reports progress', async () => {
    let active = 0;
    let peak = 0;
    const progress: number[] = [];
    const result = await mapWithConcurrency(
      [1, 2, 3, 4, 5, 6],
      2,
      async (value) => {
        active += 1;
        peak = Math.max(peak, active);
        await sleep(1);
        active -= 1;
        return value * 10;
      },
      (done) => progress.push(done),
    );
    expect(result).toEqual([10, 20, 30, 40, 50, 60]);
    expect(peak).toBe(2);
    expect(progress).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('handles an empty list', async () => {
    await expect(mapWithConcurrency([], 4, async (x: number) => x)).resolves.toEqual([]);
  });
});

describe('chunk', () => {
  it('splits into fixed-size chunks', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([], 3)).toEqual([]);
  });

  it('rejects invalid sizes', () => {
    expect(() => chunk([1], 0)).toThrow(RangeError);
  });
});
