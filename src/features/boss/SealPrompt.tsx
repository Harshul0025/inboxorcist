import { useEffect, useRef, useState } from 'react';
import type { ChoreAdapter } from '../../adapters/types';
import { useAnnounce } from '../../app/announcer';
import type { BossSpec } from '../../lib/encounters';
import { strings } from '../../strings';

interface SealPromptProps {
  boss: BossSpec;
  adapter: ChoreAdapter;
  runId: string;
  onDone: (sealed: boolean) => void;
}

/**
 * Offered after a boss dies: filter the sender's future mail out of the
 * inbox and unsubscribe (RFC 8058 one-click) where supported.
 */
export function SealPrompt({ boss, adapter, runId, onDone }: SealPromptProps) {
  const announce = useAnnounce();
  const [state, setState] = useState<'idle' | 'working' | 'done' | 'failed'>('idle');
  const [message, setMessage] = useState('');
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    confirmRef.current?.focus();
  }, []);

  const seal = () => {
    setState('working');
    adapter
      .seal({ sender: boss.sender, ...(boss.unsubscribeUrl ? { unsubscribeUrl: boss.unsubscribeUrl } : {}) }, runId)
      .then(
        (result) => {
          // The prompt closes on success, so announce through the app-wide live region.
          announce(strings.seal.done(result.unsubscribed));
          setState('done');
          onDone(true);
        },
        () => {
          setMessage(strings.seal.failed);
          setState('failed');
        },
      );
  };

  return (
    <section
      role="dialog"
      aria-modal="false"
      aria-labelledby="seal-heading"
      className="card mx-auto max-w-lg text-center"
    >
      <h2 id="seal-heading" className="font-spooky text-gradient text-5xl">
        {strings.seal.heading}
      </h2>
      <p className="sensitive mt-1 font-semibold text-amber-200">{boss.bossName}</p>
      <p className="mt-2 text-slate-300">{strings.seal.body}</p>
      {message && (
        <p role="status" className="mt-3 text-emerald-300">
          {message}
        </p>
      )}
      <div className="mt-4 flex flex-wrap justify-center gap-3">
        <button
          ref={confirmRef}
          type="button"
          className="btn btn-primary"
          disabled={state === 'working' || state === 'done'}
          onClick={seal}
        >
          {state === 'working' ? strings.seal.working : strings.seal.confirm}
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          disabled={state === 'working'}
          onClick={() => {
            onDone(false);
          }}
        >
          {strings.seal.skip}
        </button>
      </div>
    </section>
  );
}
