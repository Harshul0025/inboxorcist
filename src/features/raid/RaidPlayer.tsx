import { type SyntheticEvent, useEffect, useRef, useState } from 'react';
import { RAID_NAME_MAX, RAID_VOTE_MS } from '../../../shared/constants';
import { useAnnounce } from '../../app/announcer';
import { useServices } from '../../app/services';
import { GhostSprite } from '../../components/GhostSprite';
import { formatCount } from '../../lib/scoring';
import { strings } from '../../strings';
import { rankMvps, type RoomState, sanitizeNickname, type VoteChoice } from './raidLogic';
import { castVote, connectRaid, createTapFlusher, joinRoom, type RaidConnection, subscribeRoom } from './raidService';

type Stage = 'connecting' | 'form' | 'joining' | 'joined' | 'failed';

/** Phone view for raid players: join, tap the boss, vote. Never shows senders or subjects. */
export default function RaidPlayer({ code, onExit }: { code: string; onExit: () => void }) {
  const { config } = useServices();
  const [stage, setStage] = useState<Stage>(config.firebase ? 'connecting' : 'failed');
  const [conn, setConn] = useState<RaidConnection | null>(null);
  const [name, setName] = useState('');
  const [room, setRoom] = useState<RoomState | null>(null);
  const [joinError, setJoinError] = useState(false);
  const stopPresence = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!config.firebase) return undefined;
    let cancelled = false;
    connectRaid(config).then(
      (connection) => {
        if (cancelled) return;
        setConn(connection);
        setStage('form');
      },
      () => {
        if (!cancelled) setStage('failed');
      },
    );
    return () => {
      cancelled = true;
      stopPresence.current?.();
    };
  }, [config]);

  useEffect(() => {
    if (!conn || stage !== 'joined') return undefined;
    return subscribeRoom(conn, code, setRoom, () => {
      setStage('failed');
    });
  }, [code, conn, stage]);

  const join = (event: SyntheticEvent) => {
    event.preventDefault();
    const nickname = sanitizeNickname(name);
    if (!conn || !nickname) return;
    setStage('joining');
    setJoinError(false);
    joinRoom(conn, code, nickname).then(
      (stop) => {
        stopPresence.current = stop;
        setStage('joined');
      },
      () => {
        setJoinError(true);
        setStage('form');
      },
    );
  };

  if (stage === 'failed') {
    return (
      <section role="alert" className="card mx-auto max-w-md text-center">
        <p className="text-rose-300">{config.firebase ? strings.raid.joinFailed : strings.raid.unavailable}</p>
        <button type="button" className="btn btn-ghost mt-4" onClick={onExit}>
          {strings.raid.leave}
        </button>
      </section>
    );
  }

  if (stage !== 'joined' || !conn) {
    return (
      <section aria-labelledby="join-heading" className="card mx-auto max-w-md">
        <h2 id="join-heading" className="font-spooky text-gradient text-4xl">
          {strings.raid.joinHeading} <span className="tracking-[0.3em] text-amber-200">{code}</span>
        </h2>
        <form className="mt-4 flex flex-col gap-3" onSubmit={join}>
          <label className="flex flex-col gap-1">
            <span>{strings.raid.nickname}</span>
            <input
              className="input text-lg"
              value={name}
              maxLength={RAID_NAME_MAX}
              autoComplete="nickname"
              required
              onChange={(event) => {
                setName(event.target.value);
              }}
            />
          </label>
          {joinError && (
            <p role="alert" className="text-rose-300">
              {strings.raid.joinFailed}
            </p>
          )}
          <button type="submit" className="btn btn-primary" disabled={stage !== 'form' || !sanitizeNickname(name)}>
            {stage === 'joining' ? strings.raid.joining : strings.raid.join}
          </button>
        </form>
      </section>
    );
  }

  return <PlayerStage conn={conn} code={code} room={room} onExit={onExit} />;
}

function PlayerStage({
  conn,
  code,
  room,
  onExit,
}: {
  conn: RaidConnection;
  code: string;
  room: RoomState | null;
  onExit: () => void;
}) {
  if (!room) return <div className="spinner mx-auto" role="status" aria-label={strings.raid.joining} />;
  if (!room.hostOnline && room.status !== 'ended') {
    return (
      <p role="status" className="card mx-auto max-w-md text-center text-amber-200">
        {strings.raid.playerPaused}
      </p>
    );
  }
  switch (room.status) {
    case 'lobby':
      return (
        <section className="card mx-auto max-w-md text-center">
          <div className="float flex justify-center">
            <GhostSprite seed={code} size={120} />
          </div>
          <p role="status" className="mt-4 text-lg">
            {strings.raid.waiting}
          </p>
        </section>
      );
    case 'boss':
      return <TapPad conn={conn} code={code} room={room} />;
    case 'vote':
      return room.vote ? <VotePad key={room.vote.id} conn={conn} code={code} room={room} /> : null;
    case 'souls':
      return (
        <p role="status" className="card mx-auto max-w-md text-center">
          {strings.raid.soulsHost}
        </p>
      );
    case 'ended':
      return (
        <section className="card mx-auto max-w-md text-center">
          <h2 className="font-spooky text-gradient text-5xl">{strings.raid.ended}</h2>
          {room.stats && <p className="mt-2 text-lg">{strings.boss.cleared(room.stats.cleared)}</p>}
          <ol className="mt-4 space-y-1 text-left">
            {rankMvps(room.players, room.taps).map((mvp, position) => (
              <li key={`${mvp.name}-${position}`} className="flex justify-between rounded-xl bg-slate-900 px-3 py-2">
                <span>
                  {position + 1}. {mvp.name}
                </span>
                <span className="tabular-nums">{strings.end.taps(mvp.taps)}</span>
              </li>
            ))}
          </ol>
          <button type="button" className="btn btn-ghost mt-4" onClick={onExit}>
            {strings.raid.leave}
          </button>
        </section>
      );
  }
}

function TapPad({ conn, code, room }: { conn: RaidConnection; code: string; room: RoomState }) {
  // Created in the effect (not in state) so a cleanup/remount cycle always gets a live flusher.
  const flusher = useRef<ReturnType<typeof createTapFlusher> | null>(null);
  const [mine, setMine] = useState(0);

  useEffect(() => {
    const current = createTapFlusher(conn, code);
    flusher.current = current;
    return () => {
      current.dispose();
      flusher.current = null;
    };
  }, [conn, code]);

  const tap = () => {
    flusher.current?.add(1);
    setMine((value) => value + 1);
  };

  const boss = room.boss;
  const percent = boss && boss.maxHp > 0 ? (boss.hp / boss.maxHp) * 100 : 100;
  return (
    <section className="mx-auto flex max-w-md flex-col items-center gap-4 text-center">
      {boss && <p className="text-lg text-slate-200">{boss.summary}</p>}
      <div className="hp-bar w-full" aria-hidden="true">
        <div className="hp-fill" style={{ transform: `scaleX(${percent / 100})` }} />
      </div>
      {boss && <p className="tabular-nums">{strings.boss.hpValue(boss.hp, boss.maxHp)}</p>}
      <button
        type="button"
        aria-label={strings.raid.tapLabel}
        onClick={tap}
        className="weak-spot-tap h-56 w-56 touch-manipulation rounded-full text-5xl font-black text-slate-950 select-none"
      >
        {strings.raid.tap}
      </button>
      <p className="tabular-nums text-slate-300">{strings.raid.yourTaps(mine)}</p>
      {room.lastResult && <p className="text-sm text-slate-400">{room.lastResult}</p>}
      <p className="sr-only">{formatCount(mine)}</p>
    </section>
  );
}

function VotePad({ conn, code, room }: { conn: RaidConnection; code: string; room: RoomState }) {
  const announce = useAnnounce();
  const vote = room.vote;
  const [choice, setChoice] = useState<VoteChoice | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(Math.ceil(RAID_VOTE_MS / 1000));

  useEffect(() => {
    const started = Date.now();
    const ticker = setInterval(() => {
      setSecondsLeft(Math.max(0, Math.ceil((RAID_VOTE_MS - (Date.now() - started)) / 1000)));
    }, 250);
    return () => {
      clearInterval(ticker);
    };
  }, []);

  if (!vote) return null;
  const send = (value: VoteChoice) => {
    setChoice(value);
    castVote(conn, code, vote.id, value).then(
      () => {
        announce(strings.raid.voted);
      },
      () => {
        setChoice(null);
      },
    );
  };

  return (
    <section aria-labelledby="player-vote" className="card mx-auto max-w-md text-center">
      <h2 id="player-vote" className="font-spooky text-gradient text-5xl">
        {strings.raid.voteHeading}
      </h2>
      <p className="mt-2 text-lg">{vote.summary}</p>
      <p className="mt-1 text-slate-400">{strings.raid.voteCountdown(secondsLeft)}</p>
      {choice ? (
        <p role="status" className="mt-4 text-emerald-300">
          {strings.raid.voted}
        </p>
      ) : (
        <div className="mt-4 grid grid-cols-2 gap-3">
          <button
            type="button"
            className="btn btn-danger h-24 text-2xl"
            disabled={secondsLeft === 0}
            onClick={() => {
              send('banish');
            }}
          >
            {strings.raid.voteBanish}
          </button>
          <button
            type="button"
            className="btn btn-success h-24 text-2xl"
            disabled={secondsLeft === 0}
            onClick={() => {
              send('keep');
            }}
          >
            {strings.raid.voteKeep}
          </button>
        </div>
      )}
    </section>
  );
}
