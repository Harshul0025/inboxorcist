import { useEffect, useRef, useState } from 'react';
import type { Roast, RunStats } from '../../../shared/types';
import type { ChoreAdapter } from '../../adapters/types';
import { useAnnounce } from '../../app/announcer';
import { useServices } from '../../app/services';
import { formatCount, formatDuration, secondsSaved } from '../../lib/scoring';
import { strings } from '../../strings';

export interface MvpEntry {
  name: string;
  taps: number;
}

interface EndScreenProps {
  stats: RunStats;
  adapter: ChoreAdapter;
  runId: string;
  categories: readonly string[];
  mvps?: readonly MvpEntry[];
  onHome: () => void;
  onAgain: () => void;
}

type UndoState =
  | { kind: 'idle' }
  | { kind: 'confirm' }
  | { kind: 'working' }
  | { kind: 'done'; restored: number }
  | { kind: 'failed' };

/** Final stats, Gemini's roast, sharing and the one-click Resurrect (undo). */
export function EndScreen({ stats, adapter, runId, categories, mvps, onHome, onAgain }: EndScreenProps) {
  const { api } = useServices();
  const announce = useAnnounce();
  const [roast, setRoast] = useState<Roast | null>(null);
  const [undo, setUndo] = useState<UndoState>({ kind: 'idle' });
  const [copied, setCopied] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  useEffect(() => {
    let active = true;
    void api.roast(stats, categories).then((result) => {
      if (active) setRoast(result);
    });
    return () => {
      active = false;
    };
  }, [api, categories, stats]);

  const time = formatDuration(stats.durationMs);
  const minutesSaved = Math.round(secondsSaved(stats.cleared + stats.rescued + stats.kept) / 60);

  const resurrect = () => {
    setUndo({ kind: 'working' });
    adapter.undo(runId).then(
      // The outcome renders in a status/alert region, which screen readers announce.
      (restored) => {
        setUndo({ kind: 'done', restored });
      },
      () => {
        setUndo({ kind: 'failed' });
      },
    );
  };

  const share = () => {
    // The Clipboard API is missing on insecure origins and some browsers.
    const clipboard = navigator.clipboard as Clipboard | undefined;
    if (!clipboard) return;
    void clipboard.writeText(strings.end.shareText(stats.cleared, time)).then(
      () => {
        setCopied(true);
        announce(strings.end.copied);
      },
      () => undefined,
    );
  };

  const tiles: [string, string][] = [
    [strings.end.cleared, formatCount(stats.cleared)],
    [strings.end.rescued, formatCount(stats.rescued)],
    [strings.end.kept, formatCount(stats.kept)],
    [strings.end.sealed, formatCount(stats.sealed)],
    [strings.end.bosses, formatCount(stats.bossesDefeated)],
    [strings.end.time, time],
    [strings.end.unread, strings.end.unreadChange(stats.unreadBefore, stats.unreadAfter)],
    [strings.end.bestCombo, formatCount(stats.bestCombo)],
    [strings.end.score, formatCount(stats.score)],
  ];

  return (
    <section aria-labelledby="end-heading" className="card">
      <h2
        id="end-heading"
        ref={headingRef}
        tabIndex={-1}
        className="font-spooky text-gradient text-glow text-center text-5xl sm:text-7xl"
      >
        {strings.end.heading}
      </h2>
      <p className="mt-1 text-center text-slate-300">{strings.end.saved(minutesSaved)}</p>

      <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {tiles.map(([label, value]) => (
          <div key={label} className="stat-pill !p-4">
            <dt className="text-[0.65rem] font-semibold tracking-[0.18em] text-violet-200/80 uppercase">{label}</dt>
            <dd className="mt-1 text-2xl font-bold text-white tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-6 rounded-3xl border-2 border-amber-300/60 bg-violet-950/60 p-5 shadow-[5px_5px_0_rgb(250_204_21/0.3)]">
        <h3 className="font-spooky text-2xl text-amber-200">
          <span aria-hidden="true">🔥 </span>
          {strings.end.roastHeading}
        </h3>
        {roast ? (
          <div data-testid="roast" className="mt-1 space-y-1 text-slate-100">
            <p>{roast.lines[0]}</p>
            <p>{roast.lines[1]}</p>
          </div>
        ) : (
          <p className="mt-1 text-slate-400">{strings.end.roastLoading}</p>
        )}
      </div>

      {mvps && mvps.length > 0 && (
        <div className="mt-5">
          <h3 className="font-semibold">{strings.end.mvp}</h3>
          <ol className="mt-2 space-y-1">
            {mvps.map((mvp, position) => (
              <li key={`${mvp.name}-${position}`} className="flex justify-between rounded-xl bg-slate-900 px-3 py-2">
                <span>
                  {position + 1}. {mvp.name}
                </span>
                <span className="tabular-nums text-slate-300">{strings.end.taps(mvp.taps)}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      <div className="mt-6 flex flex-wrap justify-center gap-3">
        {undo.kind === 'confirm' ? (
          <div
            role="group"
            aria-label={strings.end.resurrect}
            className="flex flex-wrap items-center justify-center gap-3"
          >
            <p className="w-full text-center text-slate-200">{strings.end.resurrectConfirm}</p>
            <button type="button" className="btn btn-danger" onClick={resurrect}>
              {strings.end.resurrectYes}
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                setUndo({ kind: 'idle' });
              }}
            >
              {strings.end.resurrectNo}
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="btn btn-ghost"
            disabled={undo.kind === 'working' || undo.kind === 'done' || stats.cleared === 0}
            onClick={() => {
              setUndo({ kind: 'confirm' });
            }}
          >
            {undo.kind === 'working' ? strings.end.resurrecting : strings.end.resurrect}
          </button>
        )}
        <button type="button" className="btn btn-ghost" onClick={share}>
          {copied ? strings.end.copied : strings.end.share}
        </button>
        <button type="button" className="btn btn-ghost" onClick={onHome}>
          {strings.end.home}
        </button>
        <button type="button" className="btn btn-primary" onClick={onAgain}>
          {strings.end.again}
        </button>
      </div>
      {undo.kind === 'done' && (
        <p role="status" className="mt-3 text-center text-emerald-300">
          {strings.end.resurrected(undo.restored)}
        </p>
      )}
      {undo.kind === 'failed' && (
        <p role="alert" className="mt-3 text-center text-rose-300">
          {strings.end.resurrectFailed}
        </p>
      )}
    </section>
  );
}
