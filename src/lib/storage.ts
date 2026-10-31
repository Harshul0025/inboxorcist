/**
 * Reads a boolean preference from localStorage, tolerating private mode and
 * storage being disabled.
 * @param key Storage key.
 * @param fallback Value when nothing is stored.
 */
export function readFlag(key: string, fallback: boolean): boolean {
  try {
    const value = window.localStorage.getItem(key);
    return value === null ? fallback : value === 'true';
  } catch {
    return fallback;
  }
}

/**
 * Persists a boolean preference; failures are ignored.
 * @param key Storage key.
 * @param value Value to store.
 */
export function writeFlag(key: string, value: boolean): void {
  try {
    window.localStorage.setItem(key, String(value));
  } catch {
    // Storage unavailable (private mode): the preference simply is not remembered.
  }
}
