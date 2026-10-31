import { useCallback, useEffect, useRef } from 'react';
import { RAID_TAPS_PER_HIT } from '../../../shared/constants';
import type { ChoreAdapter } from '../../adapters/types';
import { useSettings } from '../../app/settings';
import { GhostSprite } from '../../components/GhostSprite';
import type { BossSpec } from '../../lib/encounters';
import type { RunExecutor } from '../../lib/executor';
import { playSound } from '../../lib/sound';
import { strings } from '../../strings';
import { useBossEngine } from '../boss/useBossEngine';
import { useBossStory } from '../boss/useBossStory';
import { newHits, type RoomState, sumTaps } from './raidLogic';
import { type RaidConnection, updateRoom } from './raidService';

interface RaidBossStageProps {
  boss: BossSpec;
  adapter: ChoreAdapter;
  executor: RunExecutor;
  importantIds: ReadonlySet<string>;
  conn: RaidConnection;
  code: string;
  room: RoomState;
  paused: boolean;
  onHit: (emails: number) => void;
  onDone: (cleared: number) => void;
}

/**
 * Raid boss fight on the big screen. Combined crowd taps become hits: every
 * `RAID_TAPS_PER_HIT` taps archive one real chunk of the boss's mail.
 */
export function RaidBossStage({
  boss,
  adapter,
  executor,
  importantIds,
  conn,
  code,
  room,
  paused,
  onHit,
  onDone,
}: RaidBossStageProps) {
  const { sound } = useSettings();
  const cleared = useRef(0);
  const baseline = useRef<number | null>(null);
  const hitsDone = useRef(0);
  const handleChunk = useCallback(
    (emails: number) => {
      cleared.current += emails;
      onHit(emails);
      if (sound) playSound('hit');
    },
    [onHit, sound],
  );
  const engine = useBossEngine({ boss, adapter, executor, importantIds, onChunk: handleChunk });
  useBossStory(boss, engine);
  const totalTaps = sumTaps(room.taps);

  useEffect(() => {
    if (engine.status !== 'fighting' && engine.status !== 'defeated') return;
    void updateRoom(conn, code, {
      status: 'boss',
      boss: { summary: boss.summary, hp: engine.hp, maxHp: engine.maxHp },
    }).catch(() => undefined);
  }, [boss.summary, code, conn, engine.hp, engine.maxHp, engine.status]);

  useEffect(() => {
    if (engine.status !== 'fighting' || paused) return;
    baseline.current ??= totalTaps;
    const earned = newHits(totalTaps, baseline.current, hitsDone.current, RAID_TAPS_PER_HIT);
    for (let i = 0; i < earned; i += 1) engine.hit();
    hitsDone.current += earned;
  }, [engine, paused, totalTaps]);

  const done = useRef(false);
  useEffect(() => {
    if (done.current) return;
    if (engine.status === 'defeated' || engine.status === 'empty') {
      done.current = true;
      onDone(cleared.current);
    }
  }, [engine.status, onDone]);

  const percent = engine.maxHp > 0 ? (engine.hp / engine.maxHp) * 100 : 0;

  return (
    <section aria-labelledby="raid-boss" className="card text-center">
      <h2 id="raid-boss" className="sensitive font-spooky text-gradient text-glow text-5xl sm:text-6xl">
        {boss.bossName}
      </h2>
      <p className="mt-1 text-lg text-slate-300">{boss.summary}</p>
      <div className="float mt-4 flex justify-center">
        <GhostSprite seed={boss.sender} size={200} />
      </div>
      <div
        role="progressbar"
        aria-label={strings.boss.hp}
        aria-valuemin={0}
        aria-valuemax={engine.maxHp}
        aria-valuenow={engine.hp}
        aria-valuetext={strings.boss.hpValue(engine.hp, engine.maxHp)}
        className="hp-bar mt-4"
      >
        <div className="hp-fill" style={{ transform: `scaleX(${percent / 100})` }} />
      </div>
      <p className="mt-2 tabular-nums" data-testid="boss-hp">
        {strings.boss.hpValue(engine.hp, engine.maxHp)}
      </p>
      <p className="mt-4 text-2xl font-bold">{strings.raid.bossPrompt}</p>
      <p className="mt-1 tabular-nums text-slate-300">
        {strings.raid.tapsToHit(totalTaps % RAID_TAPS_PER_HIT, RAID_TAPS_PER_HIT)}
      </p>
      {engine.status === 'loading' && <p className="mt-3 text-slate-400">{strings.boss.loading}</p>}
      {engine.status === 'error' && (
        <div role="alert" className="mt-3">
          <p className="text-rose-300">{strings.boss.error}</p>
          <button type="button" className="btn btn-primary mt-2" onClick={engine.retry}>
            {strings.boss.retry}
          </button>
        </div>
      )}
    </section>
  );
}
