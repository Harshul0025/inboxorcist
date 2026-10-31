/**
 * Reads a string property (such as `code` or `type`) from an unknown thrown
 * value without unsafe casts.
 * @param error Anything that was thrown.
 * @param key Property name.
 */
export function errorProperty(error: unknown, key: 'code' | 'type'): string | undefined {
  if (typeof error !== 'object' || error === null || !(key in error)) return undefined;
  const value: unknown = Reflect.get(error, key);
  return typeof value === 'string' ? value : undefined;
}

/**
 * Short, non-sensitive name of an error for logs.
 * @param error Anything that was thrown.
 */
export function errorName(error: unknown): string {
  return error instanceof Error ? error.name : 'unknown';
}
