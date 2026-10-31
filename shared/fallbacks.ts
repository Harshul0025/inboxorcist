import { ROAST_LINE_MAX } from './constants.js';
import { cleanText, truncate } from './text.js';
import type { DraftReply, DraftRequest, Roast, RunStats } from './types.js';

/**
 * Deterministic roast used when Gemini is unavailable.
 * @param stats Final run statistics.
 */
export function fallbackRoast(stats: RunStats): Roast {
  const first =
    stats.cleared > 0
      ? `${stats.cleared} unread emails were haunting you. Your inbox was its own horror movie.`
      : 'You entered a haunted inbox and exorcised… nothing. The ghosts are honoured.';
  const second =
    stats.rescued > 0
      ? `At least you rescued ${stats.rescued} real ${stats.rescued === 1 ? 'soul' : 'souls'}. Reply before they haunt you too.`
      : 'Next time, maybe rescue a soul or two on the way out.';
  return { lines: [truncate(first, ROAST_LINE_MAX), truncate(second, ROAST_LINE_MAX)], source: 'fallback' };
}

/**
 * Deterministic reply draft used when Gemini is unavailable.
 * @param request The email being answered.
 */
export function fallbackDraft(request: DraftRequest): DraftReply {
  const first = cleanText(request.senderName).split(' ')[0] ?? '';
  const name = first.length > 0 ? first : 'there';
  return {
    body: `Hi ${name},\n\nThanks for your email about "${truncate(cleanText(request.subject), 80)}". I'll get back to you shortly.\n\nBest regards`,
    source: 'fallback',
  };
}
