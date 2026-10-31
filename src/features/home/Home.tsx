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

const ORBIT = ['✉️', '📩', '🔔', '📨'] as const;

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
    <div className="space-y-14">
      <section className="grid items-center gap-10 pt-4 md:grid-cols-[1.25fr_0.75fr]">
        <div>
          <p className="chip">
            <span aria-hidden="true">✦</span> {strings.home.badge}
          </p>
          <h2 className="font-spooky text-gradient text-glow mt-5 text-6xl leading-[1.02] sm:text-7xl lg:text-8xl">
            {strings.home.heading}
          </h2>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-violet-100/90">{strings.home.intro}</p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <button
              type="button"
              className="btn btn-primary btn-xl"
              onClick={() => {
                onPlay('demo');
              }}
            >
              <span aria-hidden="true">👻</span>
              {strings.home.demoCta}
            </button>
            {gmailReady && (
              <button
                type="button"
                className="btn btn-ghost btn-xl"
                disabled={connecting}
                onClick={() => {
                  onPlay('gmail');
                }}
              >
                <span aria-hidden="true">📬</span>
                {connecting ? strings.home.connecting : strings.home.gmailCta}
              </button>
            )}
          </div>
          <p className="mt-3 text-sm text-violet-200/80">
            {strings.home.demoBody} {gmailReady ? strings.home.gmailBody : strings.home.gmailUnavailable}
          </p>
          {connectError && (
            <p role="alert" className="mt-2 text-sm text-rose-300">
              {strings.home.connectFailed}
            </p>
          )}

          <dl className="mt-8 grid max-w-xl grid-cols-3 gap-3">
            {strings.home.stats.map((stat) => (
              <div key={stat.label} className="stat-pill">
                <dt className="sr-only">{stat.label}</dt>
                <dd>
                  <span className="block text-2xl font-bold text-amber-200">{stat.value}</span>
                  <span aria-hidden="true" className="text-xs text-violet-200/80">
                    {stat.label}
                  </span>
                </dd>
              </div>
            ))}
          </dl>
        </div>

        <div
          className="relative mx-auto flex aspect-square w-full max-w-sm items-center justify-center"
          aria-hidden="true"
        >
          <div className="absolute inset-6 rounded-full bg-[radial-gradient(circle,rgb(192_132_252/0.35),transparent_65%)] blur-2xl" />
          <div className="absolute inset-0 rounded-full border border-violet-400/20" />
          <div className="absolute inset-10 rounded-full border border-amber-300/15" />
          {ORBIT.map((icon, index) => (
            <span
              key={icon}
              className="float absolute text-3xl"
              style={{
                top: `${[8, 30, 72, 62][index] ?? 0}%`,
                left: `${[18, 84, 10, 80][index] ?? 0}%`,
                animationDelay: `${index * 0.6}s`,
              }}
            >
              {icon}
            </span>
          ))}
          <div className="float">
            <GhostSprite seed="inboxorcist" size={220} />
          </div>
        </div>
      </section>

      <section aria-labelledby="how-heading">
        <h3 id="how-heading" className="font-spooky text-4xl text-amber-200">
          {strings.home.howHeading}
        </h3>
        <ol className="mt-5 grid gap-4 md:grid-cols-3">
          {strings.home.steps.map((step, index) => (
            <li key={step.title} className="card card-hover">
              <div className="flex items-center gap-3">
                <span
                  aria-hidden="true"
                  className="flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-500/20 text-2xl"
                >
                  {step.icon}
                </span>
                <span className="font-spooky text-3xl text-violet-300/70" aria-hidden="true">
                  0{index + 1}
                </span>
              </div>
              <h4 className="mt-4 text-lg font-bold text-white">{step.title}</h4>
              <p className="mt-1 text-violet-100/80">{step.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <div className="grid gap-4 md:grid-cols-[1.4fr_1fr]">
        <section aria-labelledby="raid-title" className="card card-hover overflow-hidden">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -top-16 -right-10 h-48 w-48 rounded-full bg-orange-500/20 blur-3xl"
          />
          <p className="chip">
            <span aria-hidden="true">📱</span> {strings.home.raidChip}
          </p>
          <h3 id="raid-title" className="font-spooky mt-3 text-4xl text-white">
            {strings.home.raidTitle}
          </h3>
          <p className="mt-1 max-w-md text-violet-100/85">{strings.home.raidBody}</p>
          {raidReady ? (
            <div className="mt-5 flex flex-wrap gap-3">
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
            <p className="mt-5 text-sm text-violet-200/80">{strings.home.raidUnavailable}</p>
          )}
        </section>

        <section aria-labelledby="join-title" className="card card-hover">
          <h3 id="join-title" className="font-spooky text-4xl text-white">
            {strings.home.joinTitle}
          </h3>
          <form className="mt-4 flex flex-wrap items-end gap-3" onSubmit={submitJoin}>
            <label className="flex flex-col gap-1">
              <span className="text-sm text-violet-200">{strings.home.joinLabel}</span>
              <input
                className="input w-36 text-center text-2xl font-bold tracking-[0.3em] uppercase"
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

      <p className="flex items-start gap-2 text-sm text-violet-200/80">
        <span aria-hidden="true">🛡️</span>
        {strings.home.safety}
      </p>
    </div>
  );
}
