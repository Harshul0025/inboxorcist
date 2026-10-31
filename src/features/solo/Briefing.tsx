import { useEffect, useRef, useState } from 'react';
import type { Proposal } from '../../../shared/types';
import type { ChoreAdapter } from '../../adapters/types';
import type { EncounterPlan } from '../../lib/encounters';
import { strings } from '../../strings';

interface BriefingProps {
  plan: EncounterPlan;
  proposal: Proposal;
  totalUnread: number;
  adapter: ChoreAdapter;
  onStart: (draftsEnabled: boolean) => void;
  onBack: () => void;
  /** Label for the start button (raid hosts open a lobby instead). */
  startLabel?: string;
}

/** Shows what Gemini found (bosses, waves, souls) before the run starts. */
export function Briefing({ plan, proposal, totalUnread, adapter, onStart, onBack, startLabel }: BriefingProps) {
  const [drafts, setDrafts] = useState(false);
  const [draftError, setDraftError] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const bosses = plan.encounters.flatMap((e) => (e.kind === 'boss' ? [e.boss] : []));
  const waves = plan.encounters.filter((e) => e.kind === 'ghosts').length;
  const souls = plan.encounters.find((e) => e.kind === 'souls')?.ghosts.length ?? 0;
  const empty = plan.encounters.length === 0;

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  const toggleDrafts = (checked: boolean) => {
    setDraftError(false);
    if (!checked) {
      setDrafts(false);
      return;
    }
    // Called from the change event (a user gesture), so the consent popup is allowed.
    adapter.enableDrafts().then(
      () => {
        setDrafts(true);
      },
      () => {
        setDrafts(false);
        setDraftError(true);
      },
    );
  };

  return (
    <section aria-labelledby="briefing-heading" className="card">
      <h2
        id="briefing-heading"
        ref={headingRef}
        tabIndex={-1}
        className="font-spooky text-gradient text-glow text-5xl sm:text-6xl"
      >
        {strings.briefing.heading}
      </h2>
      <p className="mt-1 text-lg text-slate-200">{strings.briefing.unread(totalUnread)}</p>
      <p className="mt-1 text-sm text-slate-400">{strings.briefing.source(proposal.source)}</p>

      {empty ? (
        <p className="mt-4 text-emerald-300">{strings.briefing.nothing}</p>
      ) : (
        <>
          {bosses.length > 0 && (
            <>
              <h3 className="font-spooky mt-6 text-3xl text-amber-200">{strings.briefing.bosses}</h3>
              <ul className="mt-2 space-y-2">
                {bosses.map((boss) => (
                  <li key={boss.sender} className="stat-pill !p-4">
                    <div className="flex flex-wrap justify-between gap-2">
                      <span className="sensitive font-bold">{boss.bossName}</span>
                      <span className="tabular-nums text-rose-300">{strings.briefing.hp(boss.estimatedHp)}</span>
                    </div>
                    <p className="sensitive mt-1 text-sm text-slate-300 italic">“{boss.taunt}”</p>
                  </li>
                ))}
              </ul>
            </>
          )}
          <ul className="mt-4 list-inside list-disc text-slate-300">
            {waves > 0 && <li>{strings.briefing.waves(waves)}</li>}
            {souls > 0 && <li>{strings.briefing.souls(souls)}</li>}
          </ul>
          <div className="mt-4">
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                className="h-5 w-5 accent-purple-500"
                checked={drafts}
                onChange={(event) => {
                  toggleDrafts(event.target.checked);
                }}
                aria-describedby="drafts-hint"
              />
              <span>{strings.briefing.drafts}</span>
            </label>
            <p id="drafts-hint" className="ml-8 text-sm text-slate-400">
              {strings.briefing.draftsHint}
            </p>
            {draftError && (
              <p role="alert" className="ml-8 text-sm text-rose-300">
                {strings.briefing.draftsFailed}
              </p>
            )}
          </div>
        </>
      )}

      <div className="mt-6 flex flex-wrap gap-3">
        <button type="button" className="btn btn-ghost" onClick={onBack}>
          {strings.briefing.back}
        </button>
        {!empty && (
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              onStart(drafts);
            }}
          >
            {startLabel ?? strings.briefing.start}
          </button>
        )}
      </div>
    </section>
  );
}
