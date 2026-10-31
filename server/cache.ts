import { createHash } from 'node:crypto';

interface Entry<V> {
  value: V;
  expiresAt: number;
}

/**
 * Small LRU cache with per-entry TTL. Used to avoid paying for identical
 * Gemini calls when a player restarts a run on the same inbox.
 */
export class TtlCache<V> {
  private readonly entries = new Map<string, Entry<V>>();

  /**
   * @param maxEntries Maximum number of entries before the oldest is evicted.
   * @param ttlMs Lifetime of each entry in milliseconds.
   * @param now Clock, injectable for tests.
   */
  constructor(
    private readonly maxEntries: number,
    private readonly ttlMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  /** Returns a cached value, or undefined when missing or expired. */
  get(key: string): V | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= this.now()) {
      this.entries.delete(key);
      return undefined;
    }
    // Re-insert to mark as most recently used.
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.value;
  }

  /** Stores a value, evicting the least recently used entry when full. */
  set(key: string, value: V): void {
    this.entries.delete(key);
    this.entries.set(key, { value, expiresAt: this.now() + this.ttlMs });
    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
    }
  }

  /** Number of live entries (expired ones may still be counted until read). */
  get size(): number {
    return this.entries.size;
  }
}

/**
 * Stable SHA-256 cache key for any JSON-serialisable value.
 * @param value Request payload.
 */
export function cacheKey(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
