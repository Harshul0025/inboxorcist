/**
 * Structured JSON logger in the format Cloud Logging parses natively
 * (`severity` + `message`). Fields that could carry personal data are
 * dropped defensively, so email content and addresses never reach logs.
 */

export type Severity = 'DEBUG' | 'INFO' | 'WARNING' | 'ERROR';
export type LogFields = Record<string, string | number | boolean | null | undefined>;

const PII_KEYS = /email|subject|snippet|sender|from|^to$|body|name|url|token|key/i;

export interface Logger {
  log(severity: Severity, message: string, fields?: LogFields): void;
}

/**
 * Removes any field whose key looks like it could hold personal data.
 * @param fields Arbitrary log fields.
 */
export function redact(fields: LogFields = {}): LogFields {
  const safe: LogFields = {};
  for (const [key, value] of Object.entries(fields)) {
    safe[key] = PII_KEYS.test(key) ? '[redacted]' : value;
  }
  return safe;
}

/**
 * Creates a logger that writes one JSON object per line.
 * @param write Sink for serialized lines, defaults to stdout.
 */
export function createLogger(write: (line: string) => void = (line) => process.stdout.write(`${line}\n`)): Logger {
  return {
    log(severity, message, fields) {
      write(JSON.stringify({ severity, message, time: new Date().toISOString(), ...redact(fields) }));
    },
  };
}

/** Logger that discards everything; used in tests. */
export const silentLogger: Logger = { log: () => undefined };
