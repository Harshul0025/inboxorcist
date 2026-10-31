import { describe, expect, it } from 'vitest';
import { PROPOSE_MAX_SAMPLES } from '../../../shared/constants';
import type { EmailItem } from '../../../shared/types';
import { groupBySender, parseFromHeader } from '../../../src/lib/grouping';

const email = (id: string, senderEmail: string, subject = 'Hi'): EmailItem => ({
  id,
  threadId: id,
  senderEmail,
  senderName: senderEmail.split('@')[0] ?? senderEmail,
  subject,
  snippet: 'snippet',
});

describe('parseFromHeader', () => {
  it('parses quoted and unquoted display names', () => {
    expect(parseFromHeader('"Swiggy" <Offers@Swiggy.in>')).toEqual({ email: 'offers@swiggy.in', name: 'Swiggy' });
    expect(parseFromHeader('Riya Sharma <riya@gmail.com>')).toEqual({ email: 'riya@gmail.com', name: 'Riya Sharma' });
  });

  it('falls back to the local part when there is no name', () => {
    expect(parseFromHeader('<noreply@github.com>')).toEqual({ email: 'noreply@github.com', name: 'noreply' });
    expect(parseFromHeader('bare@example.com')).toEqual({ email: 'bare@example.com', name: 'bare' });
    expect(parseFromHeader('@weird')).toEqual({ email: '@weird', name: '@weird' });
  });
});

describe('groupBySender', () => {
  it('groups, counts and sorts senders by volume', () => {
    const groups = groupBySender([
      email('1', 'a@x.com'),
      email('2', 'b@x.com'),
      email('3', 'b@x.com'),
      email('4', 'c@x.com'),
    ]);
    expect(groups.map((g) => [g.sender, g.count])).toEqual([
      ['b@x.com', 2],
      ['a@x.com', 1],
      ['c@x.com', 1],
    ]);
  });

  it('caps the number of samples per sender and cleans text', () => {
    const many = Array.from({ length: 9 }, (_, i) => email(String(i), 'a@x.com', ` Subject\n${i} `));
    const [group] = groupBySender(many);
    expect(group?.count).toBe(9);
    expect(group?.samples).toHaveLength(PROPOSE_MAX_SAMPLES);
    expect(group?.samples[0]?.subject).toBe('Subject 0');
  });
});
