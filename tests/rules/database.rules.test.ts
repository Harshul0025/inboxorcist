import fs from 'node:fs';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { get, ref, set, update } from 'firebase/database';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

let env: RulesTestEnvironment;

const room = (code = 'ABCD') => `rooms/${code}`;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-inboxorcist',
    database: { rules: fs.readFileSync('database.rules.json', 'utf8'), host: '127.0.0.1', port: 9000 },
  });
});

afterAll(async () => {
  await env.cleanup();
});

beforeEach(async () => {
  await env.clearDatabase();
});

const db = (uid: string | null) => (uid ? env.authenticatedContext(uid) : env.unauthenticatedContext()).database();

async function seedRoom(status = 'lobby') {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await set(ref(ctx.database(), room()), {
      hostUid: 'host',
      status,
      hostOnline: true,
      createdAt: 1,
      players: { p1: { name: 'Asha', online: true } },
      vote: { id: 'v0', summary: 'Campus mail', endsAt: 1 },
    });
  });
}

describe('room creation', () => {
  it('lets a signed-in user create a room they host', async () => {
    await assertSucceeds(
      set(ref(db('host'), room()), { hostUid: 'host', status: 'lobby', hostOnline: true, createdAt: 1 }),
    );
  });

  it('rejects anonymous visitors, impersonated hosts, bad codes and overwrites', async () => {
    const value = { hostUid: 'host', status: 'lobby', hostOnline: true, createdAt: 1 };
    await assertFails(set(ref(db(null), room()), value));
    await assertFails(set(ref(db('mallory'), room()), value));
    await assertFails(set(ref(db('host'), room('ABIO')), value));
    await assertFails(set(ref(db('host'), room()), { hostUid: 'host', status: 'lobby' }));
    await seedRoom();
    await assertFails(set(ref(db('host'), room()), value));
  });
});

describe('host-only fields', () => {
  it('only the host can change status, boss, vote and results', async () => {
    await seedRoom();
    await assertSucceeds(
      update(ref(db('host'), room()), { status: 'boss', boss: { summary: 'Promos', hp: 10, maxHp: 20 } }),
    );
    await assertFails(update(ref(db('p1'), room()), { status: 'ended' }));
    await assertFails(set(ref(db('p1'), `${room()}/boss/hp`), 0));
    await assertFails(set(ref(db('host'), `${room()}/status`), 'hacked'));
    await assertFails(set(ref(db('host'), `${room()}/boss`), { summary: 'x', hp: 1, maxHp: 1, sender: 'a@b.co' }));
    await assertFails(set(ref(db('host'), `${room()}/hostUid`), 'mallory'));
  });
});

describe('players', () => {
  it('can join as themselves with a short name, and only while the room is open', async () => {
    await seedRoom();
    await assertSucceeds(set(ref(db('p2'), `${room()}/players/p2`), { name: 'Bilal', online: true, joinedAt: 5 }));
    await assertFails(set(ref(db('p2'), `${room()}/players/p3`), { name: 'Imposter', online: true }));
    await assertFails(set(ref(db('p4'), `${room()}/players/p4`), { name: 'x'.repeat(21), online: true }));
    await assertFails(set(ref(db('p4'), `${room()}/players/p4`), { name: 'Ok', online: true, admin: true }));
    await assertFails(set(ref(db('p4'), `${room('ZZZZ')}/players/p4`), { name: 'Ghost', online: true }));
  });

  it('only members and the host can read the room', async () => {
    await seedRoom();
    await assertSucceeds(get(ref(db('host'), room())));
    await assertSucceeds(get(ref(db('p1'), room())));
    await assertFails(get(ref(db('stranger'), room())));
    await assertFails(get(ref(db(null), room())));
  });
});

describe('taps', () => {
  it('accept monotonic, rate-capped increments during a boss fight only', async () => {
    await seedRoom('boss');
    await assertSucceeds(set(ref(db('p1'), `${room()}/taps/p1`), 150));
    await assertSucceeds(set(ref(db('p1'), `${room()}/taps/p1`), 300));
    await assertFails(set(ref(db('p1'), `${room()}/taps/p1`), 100));
    await assertFails(set(ref(db('p1'), `${room()}/taps/p1`), 10_000));
    await assertFails(set(ref(db('p1'), `${room()}/taps/someone-else`), 10));
    await assertFails(set(ref(db('stranger'), `${room()}/taps/stranger`), 10));
  });

  it('are rejected outside a boss fight', async () => {
    await seedRoom('lobby');
    await assertFails(set(ref(db('p1'), `${room()}/taps/p1`), 10));
  });
});

describe('votes', () => {
  it('allow one valid vote per player on the open vote', async () => {
    await seedRoom('vote');
    await assertSucceeds(set(ref(db('p1'), `${room()}/votes/v0/p1`), 'banish'));
    await assertFails(set(ref(db('p1'), `${room()}/votes/v0/p1`), 'keep'));
    await assertFails(set(ref(db('p1'), `${room()}/votes/v9/p1`), 'keep'));
    await assertFails(set(ref(db('stranger'), `${room()}/votes/v0/stranger`), 'keep'));
  });

  it('reject invalid choices and votes outside the vote phase', async () => {
    await seedRoom('vote');
    await assertFails(set(ref(db('p1'), `${room()}/votes/v0/p1`), 'delete-everything'));
    await seedRoom('boss');
    await assertFails(set(ref(db('p1'), `${room()}/votes/v0/p1`), 'keep'));
  });
});

describe('everything else', () => {
  it('is locked down', async () => {
    await assertFails(set(ref(db('host'), 'secrets'), 'x'));
    await assertFails(get(ref(db('host'), 'rooms')));
    await seedRoom();
    await assertFails(set(ref(db('host'), `${room()}/extra`), 'x'));
  });
});
