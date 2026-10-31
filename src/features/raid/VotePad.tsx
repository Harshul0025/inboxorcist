import { useEffect, useState } from 'react';
import { RAID_VOTE_MS } from '../../../shared/constants';
import { useAnnounce } from '../../app/announcer';
import { strings } from '../../strings';
import type { RoomState, VoteChoice } from './raidLogic';
import { castVote, type RaidConnection } from './raidService';

/** Banish/keep voting buttons with a countdown, one vote per player. */
export function VotePad({ conn, code, room }: { conn: RaidConnection; code: string; room: RoomState }) {
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
