import { describe, expect, it } from 'vitest';
import { bossNameFor, classifySender, fallbackProposal, tauntFor } from '../../../shared/classifier';
import { fallbackDraft, fallbackRoast } from '../../../shared/fallbacks';
import { cleanText, hashString, truncate } from '../../../shared/text';
import type { RunStats, SenderGroup } from '../../../shared/types';

const group = (sender: string, senderName: string, subjects: string[], count = subjects.length): SenderGroup => ({
  sender,
  senderName,
  count,
  samples: subjects.map((subject, i) => ({ id: `${sender}-${i}`, subject, snippet: '' })),
});

const stats: RunStats = {
  cleared: 120,
  rescued: 2,
  kept: 3,
  sealed: 1,
  bossesDefeated: 2,
  durationMs: 90_000,
  unreadBefore: 500,
  unreadAfter: 380,
  bestCombo: 7,
  score: 4200,
};

describe('text helpers', () => {
  it('hashes deterministically to a non-negative integer', () => {
    expect(hashString('swiggy')).toBe(hashString('swiggy'));
    expect(hashString('swiggy')).not.toBe(hashString('zomato'));
    expect(hashString('')).toBeGreaterThanOrEqual(0);
  });

  it('truncates with an ellipsis only when needed', () => {
    expect(truncate('short', 10)).toBe('short');
    expect(truncate('a long subject line', 8)).toBe('a long…');
    expect(truncate('abc', 8).length).toBeLessThanOrEqual(8);
  });

  it('removes control characters and collapses whitespace', () => {
    expect(cleanText('  Hi\u0000there\n\nfriend\t ')).toBe('Hi there friend');
  });
});

describe('classifySender', () => {
  it('banishes food delivery promotions with high confidence', () => {
    const verdict = classifySender(group('offers@swiggy.in', 'Swiggy', ['60% off biryani']));
    expect(verdict.action).toBe('banish');
    expect(verdict.isImportant).toBe(false);
    expect(verdict.confidence).toBeGreaterThanOrEqual(0.7);
    expect(verdict.bossName).toBe('The Swiggy Specter');
  });

  it('protects bills and banking mail', () => {
    const verdict = classifySender(group('alerts@hdfcbank.net', 'HDFC Bank', ['Your credit card statement is ready']));
    expect(verdict.action).toBe('rescue');
    expect(verdict.isImportant).toBe(true);
  });

  it('protects deadlines before matching promotional rules', () => {
    const verdict = classifySender(group('hello@unstop.com', 'Unstop', ['Interview slot confirmation']));
    expect(verdict.isImportant).toBe(true);
  });

  it('keeps security alerts', () => {
    expect(classifySender(group('no-reply@accounts.example', 'Accounts', ['New sign-in to your account'])).action).toBe(
      'keep',
    );
  });

  it('treats personal domains as important', () => {
    const verdict = classifySender(group('riya@gmail.com', 'Riya', ['Lunch?']));
    expect(verdict).toMatchObject({ category: 'Personal', action: 'rescue', isImportant: true });
  });

  it('falls back to a low-confidence keep for unknown mail', () => {
    const verdict = classifySender(group('team@unknown.dev', 'Unknown', ['Hello']));
    expect(verdict).toMatchObject({ action: 'keep', isImportant: false });
    expect(verdict.confidence).toBeLessThan(0.7);
  });
});

describe('boss names and taunts', () => {
  it('uses alliterative monsters, with a fallback for other letters', () => {
    expect(bossNameFor('Zomato')).toBe('The Zomato Zombie');
    expect(bossNameFor('Quora')).toMatch(/^The Quora (Poltergeist|Spirit|Shade|Goblin)$/);
    expect(bossNameFor('   ')).toMatch(/^The Nameless /);
  });

  it('writes singular and plural taunts', () => {
    expect(tauntFor(group('a@b.co', 'A', ['Hi'], 1))).toContain('an email');
    expect(tauntFor(group('a@b.co', 'A', ['Hi'], 5))).toContain('5 emails');
    expect(tauntFor({ sender: 'a@b.co', senderName: 'A', count: 3, samples: [] })).toContain('3 unread emails');
    expect(tauntFor({ sender: 'a@b.co', senderName: 'A', count: 1, samples: [] })).toContain('One unread email');
  });
});

describe('fallbackProposal', () => {
  it('lists every sample of an important sender as important', () => {
    const proposal = fallbackProposal([
      group('riya@gmail.com', 'Riya', ['Meet?', 'Call me']),
      group('offers@swiggy.in', 'Swiggy', ['Deal']),
    ]);
    expect(proposal.source).toBe('fallback');
    expect(proposal.verdicts).toHaveLength(2);
    expect(proposal.importantIds).toEqual(['riya@gmail.com-0', 'riya@gmail.com-1']);
  });
});

describe('fallbacks', () => {
  it('roasts based on the stats', () => {
    expect(fallbackRoast(stats).lines[0]).toContain('120');
    expect(fallbackRoast(stats).lines[1]).toContain('2 real souls');
    expect(fallbackRoast({ ...stats, cleared: 0, rescued: 0 }).lines[0]).toContain('nothing');
    expect(fallbackRoast({ ...stats, rescued: 1 }).lines[1]).toContain('1 real soul.');
  });

  it('drafts a polite reply, with a generic greeting when the name is empty', () => {
    expect(fallbackDraft({ senderName: 'Riya Sharma', subject: 'Meet?', snippet: '' }).body).toMatch(/^Hi Riya,/);
    expect(fallbackDraft({ senderName: '', subject: 'Meet?', snippet: '' }).body).toMatch(/^Hi there,/);
  });
});
