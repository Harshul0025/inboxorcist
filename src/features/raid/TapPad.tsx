import { useEffect, useRef, useState } from 'react';
import { formatCount } from '../../lib/scoring';
import { strings } from '../../strings';
import type { RoomState } from './raidLogic';
import { createTapFlusher, type RaidConnection } from './raidService';

/** Big tap button for raid players; taps are batched and flushed to the room. */
export function TapPad({ conn, code, room }: { conn: RaidConnection; code: string; room: RoomState }) {
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
