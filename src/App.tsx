import { lazy, Suspense, useCallback, useState } from 'react';
import { RAID_CODE_LENGTH } from '../shared/constants';
import { AnnouncerProvider } from './app/announcer';
import { type Services, ServicesProvider } from './app/services';
import { SettingsProvider, useSettings } from './app/settings';
import { connectGmail } from './adapters/connectGmail';
import { DemoAdapter } from './adapters/DemoAdapter';
import type { ChoreAdapter } from './adapters/types';
import { ErrorBoundary } from './components/ErrorBoundary';
import { type AdapterKind, Home } from './features/home/Home';
import { SoloGame } from './features/solo/SoloGame';
import { strings } from './strings';

const RaidHost = lazy(() => import('./features/raid/RaidHost'));
const RaidPlayer = lazy(() => import('./features/raid/RaidPlayer'));

type Screen =
  | { name: 'home' }
  | { name: 'solo'; adapter: ChoreAdapter; run: number }
  | { name: 'raidHost'; adapter: ChoreAdapter; run: number }
  | { name: 'raidJoin'; code: string };

function initialScreen(): Screen {
  const code = new URLSearchParams(window.location.search).get('room')?.toUpperCase() ?? '';
  return /^[A-Z]+$/.test(code) && code.length === RAID_CODE_LENGTH ? { name: 'raidJoin', code } : { name: 'home' };
}

function Header() {
  const { streamer, sound, setStreamer, setSound } = useSettings();
  return (
    <header className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-4">
      <h1 className="text-2xl font-black tracking-tight">
        <span aria-hidden="true">👻 </span>
        {strings.appName}
      </h1>
      <div className="flex flex-wrap items-center gap-4 text-sm">
        <label className="flex items-center gap-2" title={strings.settings.streamerHint}>
          <input
            type="checkbox"
            className="h-4 w-4 accent-purple-500"
            checked={streamer}
            onChange={(event) => {
              setStreamer(event.target.checked);
            }}
          />
          {strings.settings.streamer}
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            className="h-4 w-4 accent-purple-500"
            checked={sound}
            onChange={(event) => {
              setSound(event.target.checked);
            }}
          />
          {strings.settings.sound}
        </label>
      </div>
    </header>
  );
}

function Screens({ services }: { services: Services }) {
  const [screen, setScreen] = useState<Screen>(initialScreen);
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState(false);

  const goHome = useCallback(() => {
    window.history.replaceState(null, '', window.location.pathname);
    setScreen({ name: 'home' });
  }, []);

  const withAdapter = (kind: AdapterKind, open: (adapter: ChoreAdapter) => void) => {
    setConnectError(false);
    if (kind === 'demo') {
      open(new DemoAdapter());
      return;
    }
    const clientId = services.config.googleClientId;
    if (!clientId) return;
    setConnecting(true);
    connectGmail(clientId, services.api).then(
      (adapter) => {
        setConnecting(false);
        open(adapter);
      },
      () => {
        setConnecting(false);
        setConnectError(true);
      },
    );
  };

  let content;
  switch (screen.name) {
    case 'home':
      content = (
        <Home
          connecting={connecting}
          connectError={connectError}
          onPlay={(kind) => {
            withAdapter(kind, (adapter) => {
              setScreen({ name: 'solo', adapter, run: 0 });
            });
          }}
          onHostRaid={(kind) => {
            withAdapter(kind, (adapter) => {
              setScreen({ name: 'raidHost', adapter, run: 0 });
            });
          }}
          onJoin={(code) => {
            setScreen({ name: 'raidJoin', code });
          }}
        />
      );
      break;
    case 'solo':
      content = (
        <SoloGame
          key={screen.run}
          adapter={screen.adapter}
          onExit={goHome}
          onAgain={() => {
            setScreen({ ...screen, run: screen.run + 1 });
          }}
        />
      );
      break;
    case 'raidHost':
      content = (
        <RaidHost
          key={screen.run}
          adapter={screen.adapter}
          onExit={goHome}
          onAgain={() => {
            setScreen({ ...screen, run: screen.run + 1 });
          }}
        />
      );
      break;
    case 'raidJoin':
      content = <RaidPlayer code={screen.code} onExit={goHome} />;
      break;
  }

  return (
    <ErrorBoundary onReset={goHome}>
      <Suspense
        fallback={
          <div className="spinner mx-auto" role="status" aria-label={strings.scan.scanning}>
            <span className="sr-only">{strings.scan.scanning}</span>
          </div>
        }
      >
        {content}
      </Suspense>
    </ErrorBoundary>
  );
}

/** Root component: providers, header and the current screen. */
export function App({ services }: { services: Services }) {
  return (
    <SettingsProvider>
      <AnnouncerProvider>
        <ServicesProvider services={services}>
          <a href="#main" className="skip-link">
            {strings.skipToContent}
          </a>
          <Header />
          <main id="main" tabIndex={-1} className="mx-auto max-w-5xl px-4 pb-16">
            <Screens services={services} />
          </main>
        </ServicesProvider>
      </AnnouncerProvider>
    </SettingsProvider>
  );
}
