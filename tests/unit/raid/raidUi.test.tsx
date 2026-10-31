import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PublicConfig } from '../../../shared/types';
import { DemoAdapter } from '../../../src/adapters/DemoAdapter';
import type { RoomState } from '../../../src/features/raid/raidLogic';
import RaidHost, { RaidVoteStage } from '../../../src/features/raid/RaidHost';
import RaidPlayer from '../../../src/features/raid/RaidPlayer';
import type { GhostSpec } from '../../../src/lib/encounters';
import { RunExecutor } from '../../../src/lib/executor';
import { offlineConfig, renderWithProviders } from '../renderWithProviders';

const fake = vi.hoisted(() => {
  const state = {
    room: null as RoomState | null,
    listeners: new Set<(room: RoomState | null) => void>(),
    updates: [] as Record<string, unknown>[],
    taps: 0,
    votes: [] as string[],
    emit(room: RoomState | null) {
      state.room = room;
      for (const listener of state.listeners) listener(room);
    },
  };
  return state;
});

vi.mock('qrcode', () => ({ default: { toDataURL: () => Promise.resolve('data:image/png;base64,AAAA') } }));
vi.mock('../../../src/features/raid/raidService', () => ({
  connectRaid: vi.fn(() => Promise.resolve({ db: {}, uid: 'me' })),
  createRoom: vi.fn(() => {
    fake.emit({ hostUid: 'me', status: 'lobby', hostOnline: true, createdAt: 0 });
    return Promise.resolve('ABCD');
  }),
  subscribeRoom: vi.fn((_conn: unknown, _code: string, onRoom: (room: RoomState | null) => void) => {
    fake.listeners.add(onRoom);
    onRoom(fake.room);
    return () => fake.listeners.delete(onRoom);
  }),
  updateRoom: vi.fn((_conn: unknown, _code: string, patch: Record<string, unknown>) => {
    fake.updates.push(patch);
    fake.emit({ ...(fake.room as RoomState), ...patch });
    return Promise.resolve();
  }),
  trackHostPresence: vi.fn((_conn: unknown, _code: string, onConnection: (c: boolean) => void) => {
    onConnection(true);
    return () => undefined;
  }),
  joinRoom: vi.fn(() => Promise.resolve(() => undefined)),
  createTapFlusher: vi.fn(() => ({
    add: (n: number) => {
      fake.taps += n;
    },
    dispose: vi.fn(),
  })),
  castVote: vi.fn((_conn: unknown, _code: string, _voteId: string, choice: string) => {
    fake.votes.push(choice);
    return Promise.resolve();
  }),
}));

const raidService = await import('../../../src/features/raid/raidService');

const firebaseConfig: PublicConfig = {
  ...offlineConfig,
  firebase: { apiKey: 'k', authDomain: 'd', databaseURL: 'u', projectId: 'p', appId: 'a' },
};

beforeEach(() => {
  fake.room = null;
  fake.listeners.clear();
  fake.updates = [];
  fake.taps = 0;
  fake.votes = [];
});

afterEach(() => {
  vi.useRealTimers();
});

describe('RaidHost', () => {
  it('runs lobby → boss fight driven by crowd taps → end screen with MVPs', async () => {
    const adapter = new DemoAdapter({ latencyMs: 0 });
    renderWithProviders(<RaidHost adapter={adapter} onExit={vi.fn()} onAgain={vi.fn()} />, { config: firebaseConfig });

    fireEvent.click(await screen.findByRole('button', { name: 'Raid lobby' }));
    expect(await screen.findByTestId('room-code')).toHaveTextContent('ABCD');
    expect(await screen.findByRole('img', { name: 'QR code to join raid ABCD' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start the raid' })).toBeDisabled();

    act(() => {
      fake.emit({ ...(fake.room as RoomState), players: { p1: { name: 'Asha', online: true } } });
    });
    fireEvent.click(screen.getByRole('button', { name: 'Start the raid' }));

    await waitFor(() => {
      expect(fake.updates.some((u) => u.status === 'boss')).toBe(true);
    });
    const before = await adapter.unreadCount();
    act(() => {
      fake.emit({ ...(fake.room as RoomState), taps: { p1: 120 } });
    });
    await waitFor(async () => {
      expect(await adapter.unreadCount()).toBeLessThan(before);
    });
    // Nothing a raid player can see contains a sender address or a subject.
    expect(JSON.stringify(fake.updates)).not.toMatch(/@|Biryani|biryani/);

    fireEvent.click(screen.getByRole('button', { name: 'End raid' }));
    expect(await screen.findByRole('heading', { name: 'Exorcism complete' })).toBeInTheDocument();
    expect(screen.getByText('1. Asha')).toBeInTheDocument();
    await waitFor(() => {
      expect(fake.updates.at(-1)).toMatchObject({ status: 'ended' });
    });
  });

  it('shows an error when the room cannot be created', async () => {
    vi.mocked(raidService.createRoom).mockRejectedValueOnce(new Error('rules'));
    renderWithProviders(<RaidHost adapter={new DemoAdapter({ latencyMs: 0 })} onExit={vi.fn()} onAgain={vi.fn()} />, {
      config: firebaseConfig,
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Raid lobby' }));
    expect(await screen.findByText(/Could not create a raid room/)).toBeInTheDocument();
  });

  it('pauses when the host goes offline', async () => {
    vi.mocked(raidService.trackHostPresence).mockImplementationOnce((_c, _code, onConnection) => {
      onConnection(false);
      return () => undefined;
    });
    renderWithProviders(<RaidHost adapter={new DemoAdapter({ latencyMs: 0 })} onExit={vi.fn()} onAgain={vi.fn()} />, {
      config: firebaseConfig,
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Raid lobby' }));
    expect(await screen.findByText(/raid is paused/)).toBeInTheDocument();
  });
});

describe('RaidVoteStage', () => {
  it('opens a vote, tallies it after the timer and applies the majority', async () => {
    vi.useFakeTimers();
    const executor = new RunExecutor(new DemoAdapter({ latencyMs: 0 }), 'run');
    const apply = vi.spyOn(executor, 'apply');
    const onDone = vi.fn();
    const ghost: GhostSpec = {
      email: { id: 'demo-00001', threadId: 't', senderEmail: 'a@b.co', senderName: 'A', subject: 'S', snippet: '' },
      suggestion: 'keep',
      confidence: 0.4,
      isImportant: false,
      summary: 'Campus mailing list',
    };
    fake.emit({ hostUid: 'me', status: 'boss', hostOnline: true, createdAt: 0 });
    const conn = { db: {}, uid: 'me' } as never;
    const view = renderWithProviders(
      <RaidVoteStage
        ghost={ghost}
        voteId="v0"
        executor={executor}
        conn={conn}
        code="ABCD"
        room={fake.room!}
        onDone={onDone}
      />,
    );
    expect(fake.updates[0]).toMatchObject({ status: 'vote', vote: { id: 'v0', summary: 'Campus mailing list' } });

    const voted: RoomState = { ...fake.room!, votes: { v0: { p1: 'banish', p2: 'banish', p3: 'keep' } } };
    view.rerender(
      <RaidVoteStage
        ghost={ghost}
        voteId="v0"
        executor={executor}
        conn={conn}
        code="ABCD"
        room={voted}
        onDone={onDone}
      />,
    );
    expect(screen.getByText('Banish 2')).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(7000);
    });
    expect(apply).toHaveBeenCalledWith('banish', ['demo-00001']);
    expect(screen.getByRole('status')).toHaveTextContent('2 banish vs 1 keep: banished!');
    expect(onDone).toHaveBeenCalled();
  });
});

describe('RaidPlayer', () => {
  async function join() {
    renderWithProviders(<RaidPlayer code="ABCD" onExit={vi.fn()} />, { config: firebaseConfig });
    const input = await screen.findByRole('textbox', { name: 'Ghost-hunter nickname' });
    expect(screen.getByRole('button', { name: 'Join raid' })).toBeDisabled();
    fireEvent.change(input, { target: { value: '  Asha  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Join raid' }));
    await waitFor(() => {
      expect(raidService.joinRoom).toHaveBeenCalledWith(expect.anything(), 'ABCD', 'Asha');
    });
  }

  it('walks through every room state', async () => {
    fake.room = { hostUid: 'host', status: 'lobby', hostOnline: true, createdAt: 0 };
    await join();
    expect(await screen.findByText(/Waiting for the host/)).toBeInTheDocument();

    act(() => {
      fake.emit({ ...fake.room!, status: 'boss', boss: { summary: 'Food delivery promotions', hp: 40, maxHp: 80 } });
    });
    const tap = screen.getByRole('button', { name: 'Tap to attack the boss' });
    fireEvent.click(tap);
    fireEvent.click(tap);
    expect(fake.taps).toBe(2);
    expect(screen.getByText('Your taps: 2')).toBeInTheDocument();
    expect(screen.getByText('40 of 80 emails left')).toBeInTheDocument();

    act(() => {
      fake.emit({ ...fake.room!, status: 'vote', vote: { id: 'v0', summary: 'Campus mailing list', endsAt: 0 } });
    });
    fireEvent.click(screen.getByRole('button', { name: 'Banish' }));
    expect(await screen.findByText('Vote locked in.', { selector: 'p' })).toBeInTheDocument();
    expect(fake.votes).toEqual(['banish']);

    act(() => {
      fake.emit({ ...fake.room!, status: 'souls' });
    });
    expect(screen.getByText(/Only the host can rescue/)).toBeInTheDocument();

    act(() => {
      fake.emit({ ...fake.room!, status: 'souls', hostOnline: false });
    });
    expect(screen.getByText(/host disconnected/)).toBeInTheDocument();

    act(() => {
      fake.emit({
        ...fake.room!,
        hostOnline: true,
        status: 'ended',
        stats: { cleared: 812, durationMs: 1000 },
        players: { me: { name: 'Asha', online: true } },
        taps: { me: 2 },
      });
    });
    expect(screen.getByText('The raid is over!')).toBeInTheDocument();
    expect(screen.getByText('812 emails exorcised')).toBeInTheDocument();
    expect(screen.getByText('1. Asha')).toBeInTheDocument();
  });

  it('reports a failed join and a failed connection', async () => {
    vi.mocked(raidService.joinRoom).mockRejectedValueOnce(new Error('denied'));
    await join();
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not join');
  });

  it('shows a failure when Firebase cannot connect', async () => {
    vi.mocked(raidService.connectRaid).mockRejectedValueOnce(new Error('offline'));
    renderWithProviders(<RaidPlayer code="ABCD" onExit={vi.fn()} />, { config: firebaseConfig });
    expect(await screen.findByText(/Could not join/)).toBeInTheDocument();
  });
});
