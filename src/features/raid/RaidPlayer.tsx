import { type SyntheticEvent, useEffect, useRef, useState } from 'react';
import { RAID_NAME_MAX } from '../../../shared/constants';
import { useServices } from '../../app/services';
import { GhostSprite } from '../../components/GhostSprite';
import { strings } from '../../strings';
import { rankMvps, type RoomState, sanitizeNickname } from './raidLogic';
import { connectRaid, joinRoom, type RaidConnection, subscribeRoom } from './raidService';
import { TapPad } from './TapPad';
import { VotePad } from './VotePad';

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
