import {
  COMBO_STEP,
  MAX_COMBO_MULTIPLIER,
  POINTS_PER_DECISION,
  POINTS_PER_EMAIL,
  SECONDS_SAVED_PER_EMAIL,
} from '../../shared/constants';

/**
 * Score multiplier for the current streak: +1x every `COMBO_STEP` hits, capped.
 * @param streak Consecutive successful actions.
 */
export function comboMultiplier(streak: number): number {
  return Math.min(MAX_COMBO_MULTIPLIER, 1 + Math.floor(Math.max(0, streak) / COMBO_STEP));
}

/**
 * Points for clearing emails during a boss fight.
 * @param emails Emails cleared by the hit.
 * @param streak Streak before the hit.
 */
export function pointsForHit(emails: number, streak: number): number {
  return Math.max(0, emails) * POINTS_PER_EMAIL * comboMultiplier(streak);
}

/**
 * Points for a ghost-wave decision.
 * @param streak Streak before the decision.
 */
export function pointsForDecision(streak: number): number {
  return POINTS_PER_DECISION * comboMultiplier(streak);
}

/**
 * Rough estimate of the time a human would spend triaging these emails.
 * @param emails Number of emails handled.
 * @returns Seconds saved.
 */
export function secondsSaved(emails: number): number {
  return Math.max(0, emails) * SECONDS_SAVED_PER_EMAIL;
}

/**
 * Formats a duration as `m:ss` (or `h:mm:ss` for long runs).
 * @param ms Duration in milliseconds.
 */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = String(total % 60).padStart(2, '0');
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${seconds}` : `${minutes}:${seconds}`;
}

/**
 * Formats an integer with Indian digit grouping, e.g. 1,23,456.
 * @param value Number to format.
 */
export function formatCount(value: number): string {
  return new Intl.NumberFormat('en-IN').format(value);
}
