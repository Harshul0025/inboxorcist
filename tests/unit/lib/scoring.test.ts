import { describe, expect, it } from 'vitest';
import { MAX_COMBO_MULTIPLIER } from '../../../shared/constants';
import {
  comboMultiplier,
  formatCount,
  formatDuration,
  pointsForDecision,
  pointsForHit,
  secondsSaved,
} from '../../../src/lib/scoring';

describe('scoring', () => {
  it('grows the combo every few hits and caps it', () => {
    expect(comboMultiplier(0)).toBe(1);
    expect(comboMultiplier(3)).toBe(2);
    expect(comboMultiplier(-4)).toBe(1);
    expect(comboMultiplier(1000)).toBe(MAX_COMBO_MULTIPLIER);
  });

  it('scores hits and decisions with the multiplier', () => {
    expect(pointsForHit(10, 0)).toBe(100);
    expect(pointsForHit(10, 3)).toBe(200);
    expect(pointsForHit(-5, 0)).toBe(0);
    expect(pointsForDecision(0)).toBe(25);
  });

  it('estimates time saved', () => {
    expect(secondsSaved(12)).toBe(60);
    expect(secondsSaved(-1)).toBe(0);
  });

  it('formats durations and counts', () => {
    expect(formatDuration(65_000)).toBe('1:05');
    expect(formatDuration(3_725_000)).toBe('1:02:05');
    expect(formatDuration(-10)).toBe('0:00');
    expect(formatCount(123456)).toBe('1,23,456');
  });
});
