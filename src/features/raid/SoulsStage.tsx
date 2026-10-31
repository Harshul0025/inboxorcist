import { useEffect } from 'react';
import type { GhostSpec } from '../../lib/encounters';
import type { RunExecutor } from '../../lib/executor';
import { strings } from '../../strings';
import { GhostWave } from '../ghosts/GhostWave';
import { type RaidConnection, updateRoom } from './raidService';

/** Trapped souls in a raid: only the host can rescue important mail. */
export function SoulsStage({
  ghosts,
  executor,
  conn,
  code,
  onDone,
}: {
  ghosts: GhostSpec[];
  executor: RunExecutor;
  conn: RaidConnection;
  code: string;
  onDone: () => void;
}) {
  useEffect(() => {
    void updateRoom(conn, code, { status: 'souls' }).catch(() => undefined);
  }, [code, conn]);
  return (
    <div>
      <p className="mb-3 text-center text-slate-300">{strings.raid.soulsHost}</p>
      <GhostWave ghosts={ghosts} mode="souls" executor={executor} onDecision={() => undefined} onComplete={onDone} />
    </div>
  );
}
