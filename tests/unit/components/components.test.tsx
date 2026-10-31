import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AnnouncerProvider, useAnnounce } from '../../../src/app/announcer';
import { useServices } from '../../../src/app/services';
import { SettingsProvider, useSettings } from '../../../src/app/settings';
import { DemoAdapter } from '../../../src/adapters/DemoAdapter';
import { ErrorBoundary } from '../../../src/components/ErrorBoundary';
import { Hud } from '../../../src/components/Hud';
import { OfflineBanner } from '../../../src/components/OfflineBanner';
import { useScoreboard } from '../../../src/hooks/useScoreboard';
import { useUnreadCounter } from '../../../src/hooks/useUnreadCounter';
import { playSound } from '../../../src/lib/sound';
import { readFlag, writeFlag } from '../../../src/lib/storage';

function Boom(): never {
  throw new Error('kaboom');
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('ErrorBoundary', () => {
  it('shows a recovery screen and resets', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const onReset = vi.fn();
    render(
      <ErrorBoundary onReset={onReset}>
        <Boom />
      </ErrorBoundary>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('A ghost crashed the game');
    fireEvent.click(screen.getByRole('button', { name: 'Reload' }));
    expect(onReset).toHaveBeenCalled();
  });
});

describe('providers', () => {
  it('throw a helpful error outside their provider', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => renderHook(() => useSettings())).toThrow(/SettingsProvider/);
    expect(() => renderHook(() => useAnnounce())).toThrow(/AnnouncerProvider/);
    expect(() => renderHook(() => useServices())).toThrow(/ServicesProvider/);
  });

  it('follow the reduced-motion media query', () => {
    let listener: ((event: { matches: boolean }) => void) | undefined;
    vi.stubGlobal('matchMedia', () => ({
      matches: true,
      addEventListener: (_type: string, l: (event: { matches: boolean }) => void) => {
        listener = l;
      },
      removeEventListener: vi.fn(),
    }));
    const { result } = renderHook(() => useSettings(), { wrapper: SettingsProvider });
    expect(result.current.reducedMotion).toBe(true);
    act(() => {
      listener?.({ matches: false });
    });
    expect(result.current.reducedMotion).toBe(false);
  });

  it('announce politely and assertively', () => {
    const { result } = renderHook(() => useAnnounce(), { wrapper: AnnouncerProvider });
    act(() => {
      result.current('Hit!');
      result.current('Hit!');
      result.current('Failed', 'assertive');
    });
    expect(screen.getByTestId('announcer-polite')).toHaveTextContent('Hit!');
    expect(screen.getByTestId('announcer-assertive')).toHaveTextContent('Failed');
  });
});

describe('Hud and OfflineBanner', () => {
  it('renders the HUD and quits', () => {
    const onQuit = vi.fn();
    render(<Hud score={1234} multiplier={3} unread={4321} index={2} total={5} onQuit={onQuit} />);
    expect(screen.getByTestId('score')).toHaveTextContent('1,234');
    expect(screen.getByText('x3')).toBeInTheDocument();
    expect(screen.getByText('Encounter 2 of 5')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'End run' }));
    expect(onQuit).toHaveBeenCalled();
  });

  it('warns when offline', () => {
    const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    render(<OfflineBanner />);
    expect(screen.getByRole('alert')).toHaveTextContent('offline');
    online.mockReturnValue(true);
    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('hooks', () => {
  it('scores hits, decisions and misses', () => {
    const { result } = renderHook(() => useScoreboard());
    act(() => {
      result.current.hit(10);
      result.current.decide();
      result.current.decide();
    });
    expect(result.current.score).toBe(150);
    expect(result.current.streak).toBe(3);
    expect(result.current.multiplier).toBe(2);
    act(() => {
      result.current.miss();
    });
    expect(result.current.streak).toBe(0);
    expect(result.current.bestCombo).toBe(3);
  });

  it('debounces unread counter refreshes', async () => {
    vi.useFakeTimers();
    const adapter = new DemoAdapter({ latencyMs: 0 });
    const spy = vi.spyOn(adapter, 'unreadCount');
    const { result } = renderHook(() => useUnreadCounter(adapter, 5));
    expect(result.current.count).toBe(5);
    act(() => {
      result.current.refresh();
      result.current.refresh();
      result.current.refresh();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(result.current.count).toBe(2000);
  });
});

describe('storage and sound', () => {
  it('reads and writes flags, tolerating storage errors', () => {
    writeFlag('k', true);
    expect(readFlag('k', false)).toBe(true);
    expect(readFlag('missing', true)).toBe(true);
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied');
    });
    expect(readFlag('k', false)).toBe(false);
    expect(() => {
      writeFlag('k', true);
    }).not.toThrow();
  });

  it('plays synthesised sounds and never throws', () => {
    const start = vi.fn();
    const param = () => ({ setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() });
    class FakeAudioContext {
      currentTime = 0;
      destination = {};
      createOscillator() {
        return { type: '', frequency: param(), connect: () => ({ connect: vi.fn() }), start, stop: vi.fn() };
      }
      createGain() {
        return { gain: param() };
      }
    }
    vi.stubGlobal('AudioContext', FakeAudioContext);
    playSound('hit');
    playSound('defeat');
    expect(start).toHaveBeenCalledTimes(2);
  });
});
