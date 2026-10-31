import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { EmailItem } from '../../../shared/types';
import { connectGmail } from '../../../src/adapters/connectGmail';
import { DemoAdapter } from '../../../src/adapters/DemoAdapter';
import { SoloGame } from '../../../src/features/solo/SoloGame';
import { renderWithProviders } from '../renderWithProviders';

const getToken = vi.hoisted(() => vi.fn(() => Promise.resolve('tok')));
vi.mock('../../../src/adapters/googleAuth', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  createTokenManager: () => ({
    getToken,
    ensureScopes: vi.fn(),
    hasScopes: vi.fn(),
    invalidate: vi.fn(),
    revoke: vi.fn(),
  }),
}));

function mail(id: string, senderEmail: string, senderName: string, subject: string): EmailItem {
  return { id, threadId: id, senderEmail, senderName, subject, snippet: '', messageIdHeader: `<${id}@x>` };
}

/** A tiny inbox: one boss (10 promos), one uncertain ghost and one trapped soul. */
function tinyInbox(): EmailItem[] {
  return [
    ...Array.from({ length: 10 }, (_, i) => mail(`p${i}`, 'offers@swiggy.in', 'Swiggy', '60% off biryani')).map(
      (e) => ({ ...e, unsubscribeUrl: 'https://swiggy.example/u' }),
    ),
    mail('g1', 'team@unknown.dev', 'Unknown Team', 'Hello there'),
    mail('s1', 'riya@gmail.com', 'Riya Sharma', 'Are we still meeting?'),
  ];
}

describe('SoloGame', () => {
  it('plays boss → seal → ghost wave → trapped souls (with a reply draft) → end screen', async () => {
    const adapter = new DemoAdapter({ latencyMs: 0, emails: tinyInbox() });
    renderWithProviders(<SoloGame adapter={adapter} onExit={vi.fn()} onAgain={vi.fn()} />);

    fireEvent.click(await screen.findByRole('checkbox'));
    await waitFor(() => {
      expect(screen.getByRole('checkbox')).toBeChecked();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Start exorcism' }));

    // Boss: keep pressing the key the weak spot asks for until the seal prompt appears.
    for (let i = 0; i < 30 && !screen.queryByRole('dialog'); i += 1) {
      const spot = screen.queryByTestId('weak-spot');
      if (spot) fireEvent.keyDown(window, { key: spot.getAttribute('aria-keyshortcuts') ?? 'ArrowUp' });
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    fireEvent.click(await screen.findByRole('button', { name: 'Seal forever' }));

    expect(await screen.findByRole('heading', { name: 'Ghost wave' })).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'ArrowRight' });

    expect(await screen.findByRole('heading', { name: 'Trapped souls' })).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'ArrowUp' });

    expect(await screen.findByRole('heading', { name: 'Exorcism complete' })).toBeInTheDocument();
    expect(await adapter.unreadCount()).toBe(2);
    expect(adapter.unsubscribed).toEqual(['offers@swiggy.in']);
    await waitFor(() => {
      expect(adapter.drafts).toEqual([{ to: 'riya@gmail.com', body: expect.stringContaining('Hi Riya') as string }]);
    });
    expect(screen.getByText('12 → 2')).toBeInTheDocument();
  });

  it('can skip sealing', async () => {
    const adapter = new DemoAdapter({ latencyMs: 0, emails: tinyInbox() });
    renderWithProviders(<SoloGame adapter={adapter} onExit={vi.fn()} onAgain={vi.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Start exorcism' }));
    for (let i = 0; i < 30 && !screen.queryByRole('dialog'); i += 1) {
      const spot = screen.queryByTestId('weak-spot');
      if (spot) fireEvent.click(spot);
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    fireEvent.click(await screen.findByRole('button', { name: 'Not now' }));
    expect(await screen.findByRole('heading', { name: 'Ghost wave' })).toBeInTheDocument();
    expect(adapter.unsubscribed).toEqual([]);
  });

  it('stays on the end screen when a seal finishes after "End run"', async () => {
    const adapter = new DemoAdapter({ latencyMs: 0, emails: tinyInbox() });
    let finishSeal: () => void = () => undefined;
    vi.spyOn(adapter, 'seal').mockImplementation(
      () =>
        new Promise((resolve) => {
          finishSeal = () => {
            resolve({ filtered: true, unsubscribed: false });
          };
        }),
    );
    renderWithProviders(<SoloGame adapter={adapter} onExit={vi.fn()} onAgain={vi.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Start exorcism' }));
    for (let i = 0; i < 30 && !screen.queryByRole('dialog'); i += 1) {
      const spot = screen.queryByTestId('weak-spot');
      if (spot) fireEvent.click(spot);
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    fireEvent.click(await screen.findByRole('button', { name: 'Seal forever' }));
    fireEvent.click(screen.getByRole('button', { name: 'End run' }));
    expect(await screen.findByRole('heading', { name: 'Exorcism complete' })).toBeInTheDocument();
    await act(async () => {
      finishSeal();
      await Promise.resolve();
    });
    expect(screen.getByRole('heading', { name: 'Exorcism complete' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Ghost wave' })).not.toBeInTheDocument();
  });

  it('recovers from a failed scan', async () => {
    const adapter = new DemoAdapter({ latencyMs: 0, emails: tinyInbox() });
    vi.spyOn(adapter, 'scan').mockRejectedValueOnce(new Error('offline'));
    renderWithProviders(<SoloGame adapter={adapter} onExit={vi.fn()} onAgain={vi.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('button', { name: 'Start exorcism' })).toBeInTheDocument();
  });
});

describe('connectGmail', () => {
  it('signs in before returning the adapter', async () => {
    const adapter = await connectGmail('cid', { unsubscribe: vi.fn() } as never);
    expect(getToken).toHaveBeenCalled();
    expect(adapter.kind).toBe('gmail');
  });
});
