import { formatCount } from '../lib/scoring';
import { strings } from '../strings';

interface HudProps {
  score: number;
  multiplier: number;
  unread: number;
  index: number;
  total: number;
  onQuit: () => void;
}

/** Heads-up display: score, combo, live unread counter and progress. */
export function Hud({ score, multiplier, unread, index, total, onQuit }: HudProps) {
  return (
    <div className="card mb-5 flex flex-wrap items-center justify-between gap-3 !rounded-3xl !py-3">
      <dl className="flex flex-wrap gap-2">
        <div className="stat-pill">
          <dt className="text-[0.65rem] font-semibold tracking-[0.18em] text-violet-200/80 uppercase">
            {strings.hud.score}
          </dt>
          <dd className="text-2xl font-bold text-white tabular-nums" data-testid="score">
            {formatCount(score)}
          </dd>
        </div>
        <div
          className={`stat-pill ${multiplier > 1 ? 'border-amber-300/50 shadow-[0_0_24px_-6px_rgb(251_146_60)]' : ''}`}
        >
          <dt className="text-[0.65rem] font-semibold tracking-[0.18em] text-violet-200/80 uppercase">
            {strings.hud.combo}
          </dt>
          <dd className="flex items-center gap-1 text-2xl font-bold text-amber-300 tabular-nums">
            {multiplier > 1 && <span aria-hidden="true">🔥</span>}
            <span>x{multiplier}</span>
          </dd>
        </div>
        <div className="stat-pill">
          <dt className="text-[0.65rem] font-semibold tracking-[0.18em] text-violet-200/80 uppercase">
            {strings.hud.unread}
          </dt>
          <dd className="text-2xl font-bold text-lime-300 tabular-nums" data-testid="unread-counter">
            {formatCount(unread)}
          </dd>
        </div>
      </dl>
      <div className="flex items-center gap-3">
        <span className="chip">{strings.hud.encounter(index, total)}</span>
        <button type="button" className="btn btn-ghost" onClick={onQuit}>
          {strings.hud.quit}
        </button>
      </div>
    </div>
  );
}
