/**
 * Deterministic 32-bit string hash (djb2). Used to pick stable names and
 * phrases so the same inbox always produces the same bosses.
 * @param value Any string.
 * @returns A non-negative integer.
 */
export function hashString(value: string): number {
  let hash = 5381;
  for (let i = 0; i < value.length; i += 1) {
    hash = ((hash << 5) + hash + value.charCodeAt(i)) | 0;
  }
  return hash >>> 0;
}

/**
 * Truncates text to a maximum length, adding an ellipsis when it was cut.
 * @param value Input text.
 * @param max Maximum length of the result, ellipsis included.
 */
export function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

/**
 * Collapses whitespace and strips control characters from untrusted text.
 * @param value Untrusted text, e.g. an email subject.
 */
export function cleanText(value: string): string {
  return (
    value
      // Matching control characters is the point of this function.
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u001f\u007f]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  );
}
