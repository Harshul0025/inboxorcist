import { type SyntheticEvent, useState } from 'react';
import { RAID_CODE_LENGTH } from '../../../shared/constants';
import { useServices } from '../../app/services';
import { GhostSprite } from '../../components/GhostSprite';
import { strings } from '../../strings';

export type AdapterKind = 'demo' | 'gmail';

interface HomeProps {
  onPlay: (kind: AdapterKind) => void;
  onHostRaid: (kind: AdapterKind) => void;
  onJoin: (code: string) => void;
  connecting: boolean;
  connectError: boolean;
}

/** Landing page: demo, real Gmail, hosting or joining a raid. */
export function Home({ onPlay, onHostRaid, onJoin, connecting, connectError }: HomeProps) {
  const { config } = useServices();
  const [code, setCode] = useState('');
  const gmailReady = Boolean(config.googleClientId);
  const raidReady = Boolean(config.firebase);

  const submitJoin = (event: SyntheticEvent) => {
    event.preventDefault();
    if (code.length === RAID_CODE_LENGTH) onJoin(code);
  };

  return (
    <div className="space-y-6">
      <section className="flex flex-col items-center gap-4 text-center sm:flex-row sm:text-left">
        <div className="float">
          <GhostSprite seed="inboxorcist" size={140} />
        </div>
        <div>
          <h2 className="text-4xl font-black sm:text-5xl">{strings.home.heading}</h2>
          <p className="mt-3 max-w-2xl text-lg text-slate-300">{strings.home.intro}</p>
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <section aria-labelledby="demo-title" className="card">
          <h3 id="demo-title" className="text-xl font-bold">
            {strings.home.demoTitle}
          </h3>
          <p className="mt-1 text-slate-300">{strings.home.demoBody}</p>
          <button
            type="button"
            className="btn btn-primary mt-4"
            onClick={() => {
              onPlay('demo');
            }}
          >
            {strings.home.demoCta}
          </button>
        </section>

        <section aria-labelledby="gmail-title" className="card">
          <h3 id="gmail-title" className="text-xl font-bold">
            {strings.home.gmailTitle}
          </h3>
          <p className="mt-1 text-slate-300">{strings.home.gmailBody}</p>
          {gmailReady ? (
            <button
              type="button"
              className="btn btn-primary mt-4"
              disabled={connecting}
              onClick={() => {
                onPlay('gmail');
              }}
            >
              {connecting ? strings.home.connecting : strings.home.gmailCta}
            </button>
          ) : (
            <p className="mt-4 text-sm text-slate-400">{strings.home.gmailUnavailable}</p>
          )}
          {connectError && (
            <p role="alert" className="mt-2 text-sm text-rose-300">
              {strings.home.connectFailed}
            </p>
          )}
        </section>

        <section aria-labelledby="raid-title" className="card">
          <h3 id="raid-title" className="text-xl font-bold">
            {strings.home.raidTitle}
          </h3>
          <p className="mt-1 text-slate-300">{strings.home.raidBody}</p>
          {raidReady ? (
            <div className="mt-4 flex flex-wrap gap-3">
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  onHostRaid('demo');
                }}
              >
                {strings.home.raidDemoCta}
              </button>
              {gmailReady && (
                <button
                  type="button"
                  className="btn btn-ghost"
                  disabled={connecting}
                  onClick={() => {
                    onHostRaid('gmail');
                  }}
                >
                  {strings.home.raidGmailCta}
                </button>
              )}
            </div>
          ) : (
            <p className="mt-4 text-sm text-slate-400">{strings.home.raidUnavailable}</p>
          )}
        </section>

        <section aria-labelledby="join-title" className="card">
          <h3 id="join-title" className="text-xl font-bold">
            {strings.home.joinTitle}
          </h3>
          <form className="mt-3 flex flex-wrap items-end gap-3" onSubmit={submitJoin}>
            <label className="flex flex-col gap-1">
              <span className="text-sm text-slate-300">{strings.home.joinLabel}</span>
              <input
                className="input w-32 text-center text-2xl font-bold tracking-[0.3em] uppercase"
                value={code}
                maxLength={RAID_CODE_LENGTH}
                autoComplete="off"
                autoCapitalize="characters"
                pattern="[A-Za-z]{4}"
                disabled={!raidReady}
                onChange={(event) => {
                  setCode(event.target.value.replace(/[^a-z]/gi, '').toUpperCase());
                }}
              />
            </label>
            <button type="submit" className="btn btn-ghost" disabled={!raidReady || code.length !== RAID_CODE_LENGTH}>
              {strings.home.joinCta}
            </button>
          </form>
        </section>
      </div>

      <p className="text-sm text-slate-400">{strings.home.safety}</p>
    </div>
  );
}
