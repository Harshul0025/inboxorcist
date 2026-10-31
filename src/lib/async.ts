import { RETRY_BASE_DELAY_MS, RETRY_MAX_ATTEMPTS, RETRY_MAX_DELAY_MS } from '../../shared/constants';

/**
 * Resolves after the given number of milliseconds.
 * @param ms Delay in milliseconds.
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface RetryOptions {
  attempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  shouldRetry: (error: unknown) => boolean;
  wait?: (ms: number) => Promise<void>;
  random?: () => number;
}

/**
 * Runs `task` and retries retryable failures with exponential backoff and
 * full jitter.
 * @param task Operation to run; receives the 1-based attempt number.
 * @param options Retry policy.
 */
export async function withRetry<T>(task: (attempt: number) => Promise<T>, options: RetryOptions): Promise<T> {
  const attempts = options.attempts ?? RETRY_MAX_ATTEMPTS;
  const base = options.baseDelayMs ?? RETRY_BASE_DELAY_MS;
  const max = options.maxDelayMs ?? RETRY_MAX_DELAY_MS;
  const wait = options.wait ?? sleep;
  const random = options.random ?? Math.random;

  for (let attempt = 1; ; attempt += 1) {
    try {
      return await task(attempt);
    } catch (error) {
      if (attempt >= attempts || !options.shouldRetry(error)) throw error;
      const ceiling = Math.min(max, base * 2 ** (attempt - 1));
      await wait(Math.round(random() * ceiling));
    }
  }
}

/**
 * Maps over items with at most `limit` tasks in flight, preserving order.
 * @param items Inputs.
 * @param limit Maximum concurrency (>= 1).
 * @param mapper Async mapper.
 * @param onProgress Called after each item completes with (done, total).
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  mapper: (item: T, index: number) => Promise<R>,
  onProgress?: (done: number, total: number) => void,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  let done = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await mapper(items[index] as T, index);
      done += 1;
      onProgress?.(done, items.length);
    }
  });
  await Promise.all(workers);
  return results;
}

/**
 * Splits an array into chunks of at most `size` items.
 * @param items Input array.
 * @param size Chunk size (>= 1).
 */
export function chunk<T>(items: readonly T[], size: number): T[][] {
  if (size < 1) throw new RangeError('Chunk size must be at least 1');
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}
