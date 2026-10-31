import { useOnline } from '../hooks/useOnline';
import { strings } from '../strings';

/** Warns the player when the browser goes offline. */
export function OfflineBanner() {
  const online = useOnline();
  if (online) return null;
  return (
    <p role="alert" className="mb-3 rounded-xl bg-rose-900/60 px-4 py-2 text-rose-100">
      {strings.errors.offline}
    </p>
  );
}
