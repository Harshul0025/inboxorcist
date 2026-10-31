import type { RunSetup } from '../../hooks/useRunSetup';
import { strings } from '../../strings';

/** Progress and error states while the inbox is scanned and classified. */
export function SetupStatus({
  setup,
  onRetry,
  onBack,
}: {
  setup: Exclude<RunSetup, { status: 'ready' }>;
  onRetry: () => void;
  onBack: () => void;
}) {
  if (setup.status === 'error') {
    return (
      <section role="alert" className="card mx-auto max-w-lg text-center">
        <p className="text-rose-300">{strings.scan.failed}</p>
        <div className="mt-4 flex justify-center gap-3">
          <button type="button" className="btn btn-ghost" onClick={onBack}>
            {strings.briefing.back}
          </button>
          <button type="button" className="btn btn-primary" onClick={onRetry}>
            {strings.scan.retry}
          </button>
        </div>
      </section>
    );
  }

  const progress =
    setup.status === 'scanning' && setup.total > 0 ? strings.scan.progress(setup.done, setup.total) : null;
  return (
    <section className="card mx-auto max-w-lg text-center" aria-busy="true">
      <div className="spinner mx-auto" aria-hidden="true" />
      <p role="status" className="mt-4 text-lg">
        {setup.status === 'consulting' ? strings.scan.consulting : strings.scan.scanning}
      </p>
      {progress && <p className="mt-1 text-sm text-slate-400">{progress}</p>}
    </section>
  );
}
