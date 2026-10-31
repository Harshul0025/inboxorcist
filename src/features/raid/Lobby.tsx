import QRCode from 'qrcode';
import { useEffect, useState } from 'react';
import { strings } from '../../strings';

/** Raid lobby on the big screen: QR code, room code and the players who joined. */
export function Lobby({ code, names, onStart }: { code: string; names: string[]; onStart: () => void }) {
  const [qr, setQr] = useState<string | null>(null);
  const joinUrl = `${window.location.origin}/?room=${code}`;

  useEffect(() => {
    let active = true;
    QRCode.toDataURL(joinUrl, { margin: 1, width: 320 }).then(
      (url) => {
        if (active) setQr(url);
      },
      () => undefined,
    );
    return () => {
      active = false;
    };
  }, [joinUrl]);

  return (
    <section aria-labelledby="lobby-heading" className="card grid gap-6 md:grid-cols-2">
      <div className="text-center">
        <h2 id="lobby-heading" className="font-spooky text-gradient text-5xl">
          {strings.raid.hostHeading}
        </h2>
        <p className="mt-2 text-slate-300">{strings.raid.joinUrl}</p>
        {qr && (
          <img
            src={qr}
            alt={strings.raid.qrAlt(code)}
            width={320}
            height={320}
            className="mx-auto mt-4 rounded-2xl bg-white p-2"
          />
        )}
        <p className="mt-3 text-5xl font-black tracking-[0.4em]" data-testid="room-code">
          {code}
        </p>
        <p className="mt-1 break-all text-sm text-slate-400">{joinUrl}</p>
      </div>
      <div>
        <h3 className="text-xl font-bold">{strings.raid.players(names.length)}</h3>
        {names.length === 0 ? (
          <p className="mt-2 text-slate-400">{strings.raid.noPlayers}</p>
        ) : (
          <ul className="mt-2 flex flex-wrap gap-2" data-testid="player-list">
            {names.map((name, position) => (
              <li key={`${name}-${position}`} className="rounded-full bg-purple-900/60 px-3 py-1">
                {name}
              </li>
            ))}
          </ul>
        )}
        <button type="button" className="btn btn-primary mt-6" disabled={names.length === 0} onClick={onStart}>
          {strings.raid.start}
        </button>
      </div>
    </section>
  );
}
