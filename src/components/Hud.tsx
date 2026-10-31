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
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-slate-900/70 px-4 py-3">
      <dl className="flex flex-wrap gap-x-6 gap-y-1">
        <div>
          <dt className="text-xs uppercase tracking-wide text-slate-400">{strings.hud.score}</dt>
          <dd className="text-xl font-bold tabular-nums" data-testid="score">
            {formatCount(score)}
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-slate-400">{strings.hud.combo}</dt>
          <dd className="text-xl font-bold text-amber-300 tabular-nums">x{multiplier}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-slate-400">{strings.hud.unread}</dt>
          <dd className="text-xl font-bold text-emerald-300 tabular-nums" data-testid="unread-counter">
            {formatCount(unread)}
          </dd>
        </div>
      </dl>
      <div className="flex items-center gap-3">
        <span className="text-sm text-slate-300">{strings.hud.encounter(index, total)}</span>
        <button type="button" className="btn btn-ghost" onClick={onQuit}>
          {strings.hud.quit}
        </button>
      </div>
    </div>
  );
}
