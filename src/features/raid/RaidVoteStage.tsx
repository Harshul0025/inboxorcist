import { useEffect, useRef, useState } from 'react';
import { RAID_VOTE_GRACE_MS, RAID_VOTE_MS } from '../../../shared/constants';
import { useAnnounce } from '../../app/announcer';
import type { GhostSpec } from '../../lib/encounters';
import type { RunExecutor } from '../../lib/executor';
import { strings } from '../../strings';
import { type RoomState, tallyVotes } from './raidLogic';
import { type RaidConnection, updateRoom } from './raidService';

interface RaidVoteStageProps {
  ghost: GhostSpec;
  voteId: string;
  executor: RunExecutor;
  conn: RaidConnection;
  code: string;
  room: RoomState;
  onDone: () => void;
}

/** Crowd vote on one uncertain email; the majority wins and a tie keeps it. */
export function RaidVoteStage({ ghost, voteId, executor, conn, code, room, onDone }: RaidVoteStageProps) {
  const announce = useAnnounce();
  const [result, setResult] = useState<string | null>(null);
  // The vote must run exactly once per stage, so the timer reads the latest props through a ref.
  const latest = useRef({ ghost, voteId, executor, conn, code, room, onDone, announce });
  useEffect(() => {
    latest.current = { ghost, voteId, executor, conn, code, room, onDone, announce };
  });

  useEffect(() => {
    let active = true;
    const start = latest.current;
    void updateRoom(start.conn, start.code, {
      status: 'vote',
      vote: { id: start.voteId, summary: start.ghost.summary, endsAt: Date.now() + RAID_VOTE_MS },
    }).catch(() => undefined);

    const timer = setTimeout(() => {
      const now = latest.current;
      const tally = tallyVotes(now.room.votes?.[now.voteId]);
      const text = strings.raid.voteResult(tally.banish, tally.keep, tally.winner);
      setResult(text);
      now.announce(text);
      void updateRoom(now.conn, now.code, { lastResult: text }).catch(() => undefined);
      now.executor
        .apply(now.ghost.isImportant ? 'keep' : tally.winner, [now.ghost.email.id])
        .catch(() => undefined)
        .finally(() => {
          if (active) setTimeout(() => latest.current.onDone(), RAID_VOTE_GRACE_MS * 3);
        });
    }, RAID_VOTE_MS + RAID_VOTE_GRACE_MS);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, []);

  const live = tallyVotes(room.votes?.[voteId]);
  return (
    <section aria-labelledby="vote-heading" className="card text-center">
      <h2 id="vote-heading" className="font-spooky text-gradient text-6xl">
        {strings.raid.voteHeading}
      </h2>
      <p className="mt-2 text-xl text-slate-200">{ghost.summary}</p>
      <p className="sensitive mt-1 text-slate-400">{ghost.email.subject}</p>
      <p className="mt-4 text-3xl font-bold tabular-nums">
        <span className="text-rose-300">
          {strings.raid.voteBanish} {live.banish}
        </span>
        {' · '}
        <span className="text-emerald-300">
          {strings.raid.voteKeep} {live.keep}
        </span>
      </p>
      {result && (
        <p role="status" className="mt-3 text-lg text-amber-200">
          {result}
        </p>
      )}
    </section>
  );
}
