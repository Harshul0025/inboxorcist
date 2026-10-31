import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RAID_CREATE_ATTEMPTS, RAID_MAX_TAPS_PER_FLUSH, RAID_TAP_FLUSH_MS } from '../../../shared/constants';
import type { PublicConfig } from '../../../shared/types';
import type * as RaidService from '../../../src/features/raid/raidService';

/** In-memory stand-in for the parts of the Firebase SDK the raid service uses. */
const fb = vi.hoisted(() => {
  const state = {
    auth: { currentUser: null as { uid: string } | null, authStateReady: () => Promise.resolve() },
    signIns: 0,
    emulators: { auth: 0, db: 0 },
    writes: [] as { path: string; value: unknown }[],
    updates: [] as { path: string; patch: unknown }[],
    listeners: new Map<string, { onValue: (snap: unknown) => void; onError?: () => void }>(),
    disconnects: [] as { path: string; value: unknown }[],
    failSet: (_path: string) => false,
    failSignIn: false,
  };
  return state;
});

vi.mock('../../../src/lib/firebaseApp', () => ({ getFirebaseApp: vi.fn(() => Promise.resolve({ name: 'app' })) }));
vi.mock('firebase/auth', () => ({
  getAuth: () => fb.auth,
  connectAuthEmulator: () => {
    fb.emulators.auth += 1;
  },
  signInAnonymously: () => {
    fb.signIns += 1;
    if (fb.failSignIn) return Promise.reject(new Error('auth down'));
    fb.auth.currentUser = { uid: `user-${fb.signIns}` };
    return Promise.resolve({ user: fb.auth.currentUser });
  },
}));
vi.mock('firebase/database', () => ({
  getDatabase: () => ({ db: true }),
  connectDatabaseEmulator: () => {
    fb.emulators.db += 1;
  },
  ref: (_db: unknown, path: string) => ({ path }),
  serverTimestamp: () => ({ '.sv': 'timestamp' }),
  increment: (amount: number) => ({ increment: amount }),
  set: (target: { path: string }, value: unknown) => {
    if (fb.failSet(target.path)) return Promise.reject(new Error('PERMISSION_DENIED'));
    fb.writes.push({ path: target.path, value });
    return Promise.resolve();
  },
  update: (target: { path: string }, patch: unknown) => {
    fb.updates.push({ path: target.path, patch });
    return Promise.resolve();
  },
  onValue: (target: { path: string }, onValue: (snap: unknown) => void, onError?: () => void) => {
    fb.listeners.set(target.path, { onValue, onError });
    return () => fb.listeners.delete(target.path);
  },
  onDisconnect: (target: { path: string }) => ({
    set: (value: unknown) => {
      fb.disconnects.push({ path: target.path, value });
      return Promise.resolve();
    },
  }),
}));

const config: PublicConfig = {
  googleClientId: null,
  firebase: { apiKey: 'k', authDomain: 'd', databaseURL: 'u', projectId: 'p', appId: 'a' },
  recaptchaSiteKey: null,
  useEmulators: false,
};

const snapshot = (value: unknown) => ({ exists: () => value !== null, val: () => value });
const room = { hostUid: 'user-1', status: 'lobby', hostOnline: true, createdAt: 1 };

type Service = typeof RaidService;
let service: Service;

beforeEach(async () => {
  fb.auth.currentUser = null;
  fb.signIns = 0;
  fb.emulators = { auth: 0, db: 0 };
  fb.writes = [];
  fb.updates = [];
  fb.listeners.clear();
  fb.disconnects = [];
  fb.failSet = () => false;
  fb.failSignIn = false;
  // The service caches its connection, so every test gets a fresh module.
  vi.resetModules();
  service = await import('../../../src/features/raid/raidService');
});

afterEach(() => {
  vi.useRealTimers();
});

describe('connectRaid', () => {
  it('signs in anonymously once, even for concurrent callers', async () => {
    const [a, b] = await Promise.all([service.connectRaid(config), service.connectRaid(config)]);
    expect(a.uid).toBe('user-1');
    expect(b).toBe(a);
    expect(fb.signIns).toBe(1);
    expect(fb.emulators).toEqual({ auth: 0, db: 0 });
  });

  it('reuses a user that is already signed in and wires the emulators when asked', async () => {
    fb.auth.currentUser = { uid: 'existing' };
    const conn = await service.connectRaid({ ...config, useEmulators: true });
    expect(conn.uid).toBe('existing');
    expect(fb.signIns).toBe(0);
    expect(fb.emulators).toEqual({ auth: 1, db: 1 });
  });

  it('forgets a failed attempt so the next call can retry', async () => {
    fb.failSignIn = true;
    await expect(service.connectRaid(config)).rejects.toThrow('auth down');
    fb.failSignIn = false;
    await expect(service.connectRaid(config)).resolves.toMatchObject({ uid: 'user-2' });
  });
});

describe('rooms', () => {
  it('creates a room as its host, retrying codes that are taken', async () => {
    const conn = await service.connectRaid(config);
    let attempts = 0;
    fb.failSet = () => {
      attempts += 1;
      return attempts < 3;
    };
    const code = await service.createRoom(conn, () => 0);
    expect(code).toBe('AAAA');
    expect(fb.writes).toEqual([
      {
        path: 'rooms/AAAA',
        value: { hostUid: 'user-1', status: 'lobby', hostOnline: true, createdAt: { '.sv': 'timestamp' } },
      },
    ]);
  });

  it('gives up after the maximum number of attempts', async () => {
    const conn = await service.connectRaid(config);
    let attempts = 0;
    fb.failSet = () => {
      attempts += 1;
      return true;
    };
    await expect(service.createRoom(conn)).rejects.toThrow('Could not create a room');
    expect(attempts).toBe(RAID_CREATE_ATTEMPTS);
  });

  it('streams validated room snapshots and forwards errors', async () => {
    const conn = await service.connectRaid(config);
    const onRoom = vi.fn();
    const onError = vi.fn();
    const stop = service.subscribeRoom(conn, 'ABCD', onRoom, onError);
    const listener = fb.listeners.get('rooms/ABCD');
    listener?.onValue(snapshot(room));
    listener?.onValue(snapshot({ ...room, status: 'hacked' }));
    listener?.onValue(snapshot(null));
    listener?.onError?.();
    expect(onRoom.mock.calls).toEqual([[room], [null], [null]]);
    expect(onError).toHaveBeenCalled();
    stop();
    expect(fb.listeners.has('rooms/ABCD')).toBe(false);
  });

  it('updates the room and casts votes at the right paths', async () => {
    const conn = await service.connectRaid(config);
    await service.updateRoom(conn, 'ABCD', { status: 'boss' });
    await service.castVote(conn, 'ABCD', 'v0', 'banish');
    expect(fb.updates).toEqual([{ path: 'rooms/ABCD', patch: { status: 'boss' } }]);
    expect(fb.writes).toEqual([{ path: 'rooms/ABCD/votes/v0/user-1', value: 'banish' }]);
  });
});

describe('presence', () => {
  it('marks the host online and arms an offline flag on every reconnect', async () => {
    const conn = await service.connectRaid(config);
    const onConnection = vi.fn();
    service.trackHostPresence(conn, 'ABCD', onConnection);
    const connected = fb.listeners.get('.info/connected');
    connected?.onValue(snapshot(false));
    expect(fb.disconnects).toEqual([]);
    connected?.onValue(snapshot(true));
    await vi.waitFor(() => {
      expect(fb.writes).toContainEqual({ path: 'rooms/ABCD/hostOnline', value: true });
    });
    expect(fb.disconnects).toEqual([{ path: 'rooms/ABCD/hostOnline', value: false }]);
    expect(onConnection.mock.calls).toEqual([[false], [true]]);
  });

  it('joins as a player and tracks the player’s online flag', async () => {
    const conn = await service.connectRaid(config);
    const stop = await service.joinRoom(conn, 'ABCD', 'Asha');
    expect(fb.writes[0]).toEqual({
      path: 'rooms/ABCD/players/user-1',
      value: { name: 'Asha', online: true, joinedAt: { '.sv': 'timestamp' } },
    });
    fb.listeners.get('.info/connected')?.onValue(snapshot(true));
    await vi.waitFor(() => {
      expect(fb.disconnects).toEqual([{ path: 'rooms/ABCD/players/user-1/online', value: false }]);
    });
    stop();
  });
});

describe('createTapFlusher', () => {
  it('batches taps into capped server-side increments and keeps taps that fail to send', async () => {
    vi.useFakeTimers();
    const conn = await service.connectRaid(config);
    const flusher = service.createTapFlusher(conn, 'ABCD');

    vi.advanceTimersByTime(RAID_TAP_FLUSH_MS);
    expect(fb.writes).toEqual([]);

    flusher.add(RAID_MAX_TAPS_PER_FLUSH + 30);
    vi.advanceTimersByTime(RAID_TAP_FLUSH_MS);
    expect(fb.writes.at(-1)).toEqual({ path: 'rooms/ABCD/taps/user-1', value: { increment: RAID_MAX_TAPS_PER_FLUSH } });

    fb.failSet = () => true;
    vi.advanceTimersByTime(RAID_TAP_FLUSH_MS);
    await vi.advanceTimersByTimeAsync(0);
    fb.failSet = () => false;
    vi.advanceTimersByTime(RAID_TAP_FLUSH_MS);
    expect(fb.writes.at(-1)).toEqual({ path: 'rooms/ABCD/taps/user-1', value: { increment: 30 } });

    flusher.dispose();
    flusher.add(5);
    vi.advanceTimersByTime(RAID_TAP_FLUSH_MS * 3);
    expect(fb.writes.filter((w) => w.path.endsWith('/taps/user-1'))).toHaveLength(2);
  });
});
