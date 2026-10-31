import { connectAuthEmulator, getAuth, signInAnonymously } from 'firebase/auth';
import {
  connectDatabaseEmulator,
  type Database,
  getDatabase,
  increment,
  onDisconnect,
  onValue,
  ref,
  serverTimestamp,
  set,
  update,
} from 'firebase/database';
import { RAID_CREATE_ATTEMPTS, RAID_TAP_FLUSH_MS } from '../../../shared/constants';
import type { PublicConfig } from '../../../shared/types';
import { getFirebaseApp } from '../../lib/firebaseApp';
import { clampTapFlush, generateRoomCode, parseRoomState, type RoomState, type VoteChoice } from './raidLogic';

export interface RaidConnection {
  db: Database;
  uid: string;
}

let connection: Promise<RaidConnection> | null = null;

/**
 * Signs in anonymously and returns a Realtime Database handle. The connection
 * is shared: concurrent callers (e.g. React StrictMode effects) must not
 * create two anonymous users, or writes made as the first one get rejected.
 * @param config Public runtime config.
 */
export function connectRaid(config: PublicConfig): Promise<RaidConnection> {
  connection ??= (async () => {
    const app = await getFirebaseApp(config);
    const auth = getAuth(app);
    const db = getDatabase(app);
    if (config.useEmulators) {
      connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
      connectDatabaseEmulator(db, '127.0.0.1', 9000);
    }
    await auth.authStateReady();
    const user = auth.currentUser ?? (await signInAnonymously(auth)).user;
    return { db, uid: user.uid };
  })().catch((error: unknown) => {
    connection = null;
    throw error;
  });
  return connection;
}

const roomPath = (code: string) => `rooms/${code}`;

/**
 * Creates a room with a fresh code. The security rules reject writes to an
 * existing room, so a collision just means trying another code.
 */
export async function createRoom(conn: RaidConnection, random: () => number = Math.random): Promise<string> {
  for (let attempt = 0; attempt < RAID_CREATE_ATTEMPTS; attempt += 1) {
    const code = generateRoomCode(random);
    try {
      await set(ref(conn.db, roomPath(code)), {
        hostUid: conn.uid,
        status: 'lobby',
        hostOnline: true,
        createdAt: serverTimestamp(),
      });
      return code;
    } catch {
      // Code taken (permission denied): try another one.
    }
  }
  throw new Error('Could not create a room');
}

/** Subscribes to the whole room; returns an unsubscribe function. */
export function subscribeRoom(
  conn: RaidConnection,
  code: string,
  onRoom: (room: RoomState | null) => void,
  onError: () => void,
): () => void {
  return onValue(
    ref(conn.db, roomPath(code)),
    (snapshot) => {
      onRoom(snapshot.exists() ? parseRoomState(snapshot.val()) : null);
    },
    onError,
  );
}

/** Host-only partial update of the room. */
export async function updateRoom(conn: RaidConnection, code: string, patch: Record<string, unknown>): Promise<void> {
  await update(ref(conn.db, roomPath(code)), patch);
}

/**
 * Keeps `flagPath` true while connected and false after a disconnect,
 * re-arming on every reconnect.
 */
function trackPresence(conn: RaidConnection, flagPath: string, onConnection: (connected: boolean) => void): () => void {
  const flag = ref(conn.db, flagPath);
  return onValue(ref(conn.db, '.info/connected'), (snapshot) => {
    const connected = snapshot.val() === true;
    onConnection(connected);
    if (!connected) return;
    void onDisconnect(flag)
      .set(false)
      .then(() => set(flag, true))
      .catch(() => undefined);
  });
}

/** Host presence: players see the raid as paused while the host is offline. */
export function trackHostPresence(conn: RaidConnection, code: string, onConnection: (connected: boolean) => void) {
  return trackPresence(conn, `${roomPath(code)}/hostOnline`, onConnection);
}

/** Joins a room as a player and keeps the player's online flag current. */
export async function joinRoom(conn: RaidConnection, code: string, name: string): Promise<() => void> {
  await set(ref(conn.db, `${roomPath(code)}/players/${conn.uid}`), {
    name,
    online: true,
    joinedAt: serverTimestamp(),
  });
  return trackPresence(conn, `${roomPath(code)}/players/${conn.uid}/online`, () => undefined);
}

/**
 * Buffers taps locally and flushes them with an atomic server-side
 * increment every few hundred ms, so 100 players do not flood the database.
 */
export function createTapFlusher(conn: RaidConnection, code: string) {
  let pending = 0;
  const target = ref(conn.db, `${roomPath(code)}/taps/${conn.uid}`);
  const timer = setInterval(() => {
    const amount = clampTapFlush(pending);
    if (amount === 0) return;
    pending -= amount;
    set(target, increment(amount)).catch(() => {
      pending += amount;
    });
  }, RAID_TAP_FLUSH_MS);
  return {
    add(taps: number) {
      pending += taps;
    },
    dispose() {
      clearInterval(timer);
    },
  };
}

/** Casts this player's vote (one per vote, enforced by the rules). */
export async function castVote(conn: RaidConnection, code: string, voteId: string, choice: VoteChoice): Promise<void> {
  await set(ref(conn.db, `${roomPath(code)}/votes/${voteId}/${conn.uid}`), choice);
}
