import { describe, expect, it } from 'vitest';
import { DEMO_TOTAL_EMAILS, SCAN_SAMPLE_SIZE } from '../../../shared/constants';
import { DemoAdapter } from '../../../src/adapters/DemoAdapter';
import { generateDemoInbox, mulberry32 } from '../../../src/adapters/demoInbox';

describe('demo inbox', () => {
  it('is deterministic and the right size', () => {
    const a = generateDemoInbox();
    expect(a).toHaveLength(DEMO_TOTAL_EMAILS);
    expect(generateDemoInbox().map((e) => e.id)).toEqual(a.map((e) => e.id));
    expect(new Set(a.map((e) => e.id)).size).toBe(a.length);
  });

  it('puts every important email inside the scan sample', () => {
    const recent = generateDemoInbox().slice(0, SCAN_SAMPLE_SIZE);
    expect(recent.some((e) => e.senderEmail === 'riya.sharma@gmail.com')).toBe(true);
    expect(recent.some((e) => e.senderEmail === 'alerts@hdfcbank.net')).toBe(true);
  });

  it('has a PRNG that stays in [0, 1)', () => {
    const random = mulberry32(42);
    for (let i = 0; i < 100; i += 1) {
      const value = random();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});

describe('DemoAdapter', () => {
  it('scans a sample and reports the full unread count', async () => {
    const adapter = new DemoAdapter({ latencyMs: 0 });
    const progress: number[] = [];
    const scan = await adapter.scan((done) => progress.push(done));
    expect(scan.totalUnread).toBe(DEMO_TOTAL_EMAILS);
    expect(scan.emails).toHaveLength(SCAN_SAMPLE_SIZE);
    expect(scan.groups[0]?.count).toBeGreaterThan(1);
    expect(progress).toEqual([SCAN_SAMPLE_SIZE]);
  });

  it('banishes, rescues and undoes a run', async () => {
    const adapter = new DemoAdapter({ latencyMs: 0 });
    const ids = await adapter.idsForSender('offers@swiggy.in');
    expect(ids.length).toBeGreaterThan(10);
    await adapter.apply('banish', ids, 'run-1');
    await adapter.apply('rescue', ['missing-id'], 'run-1');
    expect(await adapter.unreadCount()).toBe(DEMO_TOTAL_EMAILS - ids.length);
    expect(await adapter.idsForSender('offers@swiggy.in')).toEqual([]);
    expect(await adapter.undo('run-1')).toBe(ids.length);
    expect(await adapter.unreadCount()).toBe(DEMO_TOTAL_EMAILS);
    expect(await adapter.undo('run-1')).toBe(0);
  });

  it('keeps rescued mail in the inbox', async () => {
    const adapter = new DemoAdapter({ latencyMs: 0 });
    const [id] = await adapter.idsForSender('riya.sharma@gmail.com');
    await adapter.apply('rescue', [id!], 'run-2');
    expect(await adapter.idsForSender('riya.sharma@gmail.com')).toEqual([id]);
  });

  it('seals senders, drafts replies and clears filters on undo', async () => {
    const adapter = new DemoAdapter({ latencyMs: 1 });
    await adapter.enableDrafts();
    expect(await adapter.seal({ sender: 'offers@swiggy.in', unsubscribeUrl: 'https://u.example/x' }, 'run-3')).toEqual({
      filtered: true,
      unsubscribed: true,
    });
    expect(await adapter.seal({ sender: 'notifications@linkedin.com' }, 'run-3')).toEqual({
      filtered: true,
      unsubscribed: false,
    });
    expect(adapter.filtersFor('run-3')).toEqual(['offers@swiggy.in', 'notifications@linkedin.com']);
    expect(adapter.unsubscribed).toEqual(['offers@swiggy.in']);
    const email = (await adapter.scan()).emails[0]!;
    await adapter.createDraft(email, 'Thanks!');
    expect(adapter.drafts).toEqual([{ to: email.senderEmail, body: 'Thanks!' }]);
    await adapter.undo('run-3');
    expect(adapter.filtersFor('run-3')).toEqual([]);
  });
});
