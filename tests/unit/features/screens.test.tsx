import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { fallbackProposal } from '../../../shared/classifier';
import type { RunStats } from '../../../shared/types';
import { DemoAdapter } from '../../../src/adapters/DemoAdapter';
import { SealPrompt } from '../../../src/features/boss/SealPrompt';
import { EndScreen } from '../../../src/features/endscreen/EndScreen';
import { Briefing } from '../../../src/features/solo/Briefing';
import { SetupStatus } from '../../../src/features/solo/SetupStatus';
import { buildEncounters, type BossSpec } from '../../../src/lib/encounters';
import { renderWithProviders } from '../renderWithProviders';

const stats: RunStats = {
  cleared: 812,
  rescued: 2,
  kept: 4,
  sealed: 1,
  bossesDefeated: 2,
  durationMs: 192_000,
  unreadBefore: 2000,
  unreadAfter: 1188,
  bestCombo: 9,
  score: 12_340,
};
const boss: BossSpec = {
  sender: 'offers@swiggy.in',
  senderName: 'Swiggy',
  bossName: 'The Swiggy Specter',
  taunt: 'Biryani?',
  summary: 'Food delivery promotions',
  category: 'Food',
  estimatedHp: 40,
  unsubscribeUrl: 'https://u.example/x',
};

describe('SetupStatus', () => {
  it('shows progress, then retry on error', () => {
    const onRetry = vi.fn();
    const { rerender } = renderWithProviders(
      <SetupStatus setup={{ status: 'scanning', done: 3, total: 10 }} onRetry={onRetry} onBack={vi.fn()} />,
    );
    expect(screen.getByText('Reading 3 of 10 recent emails')).toBeInTheDocument();
    rerender(<SetupStatus setup={{ status: 'consulting' }} onRetry={onRetry} onBack={vi.fn()} />);
    expect(screen.getByRole('status')).toHaveTextContent(/Gemini/);
    rerender(<SetupStatus setup={{ status: 'error' }} onRetry={onRetry} onBack={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalled();
  });
});

describe('Briefing', () => {
  async function plan() {
    const adapter = new DemoAdapter({ latencyMs: 0 });
    const scan = await adapter.scan();
    const proposal = fallbackProposal(scan.groups);
    return { adapter, scan, proposal, plan: buildEncounters(scan, proposal) };
  }

  it('lists bosses and starts with drafts enabled once permission is granted', async () => {
    const setup = await plan();
    const onStart = vi.fn();
    renderWithProviders(
      <Briefing
        plan={setup.plan}
        proposal={setup.proposal}
        totalUnread={2000}
        adapter={setup.adapter}
        onStart={onStart}
        onBack={vi.fn()}
      />,
    );
    expect(screen.getByText('2,000 unread emails are haunting this inbox.')).toBeInTheDocument();
    expect(screen.getByText('The Swiggy Specter')).toBeInTheDocument();
    expect(screen.getByText(/offline rulebook/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox'));
    await waitFor(() => {
      expect(screen.getByRole('checkbox')).toBeChecked();
    });
    fireEvent.click(screen.getByRole('checkbox'));
    expect(screen.getByRole('checkbox')).not.toBeChecked();
    fireEvent.click(screen.getByRole('checkbox'));
    await waitFor(() => {
      expect(screen.getByRole('checkbox')).toBeChecked();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Start exorcism' }));
    expect(onStart).toHaveBeenCalledWith(true);
  });

  it('reports refused draft permission and an already clean inbox', async () => {
    const setup = await plan();
    vi.spyOn(setup.adapter, 'enableDrafts').mockRejectedValue(new Error('denied'));
    const { unmount } = renderWithProviders(
      <Briefing
        plan={setup.plan}
        proposal={setup.proposal}
        totalUnread={2000}
        adapter={setup.adapter}
        onStart={vi.fn()}
        onBack={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('checkbox'));
    expect(await screen.findByRole('alert')).toHaveTextContent('not granted');
    unmount();

    renderWithProviders(
      <Briefing
        plan={{ encounters: [], importantIds: new Set(), verdicts: new Map() }}
        proposal={{ ...setup.proposal, source: 'gemini' }}
        totalUnread={0}
        adapter={setup.adapter}
        onStart={vi.fn()}
        onBack={vi.fn()}
      />,
    );
    expect(screen.getByText(/already clean/)).toBeInTheDocument();
    expect(screen.getByText('Verdicts by Gemini')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Start exorcism' })).not.toBeInTheDocument();
  });
});

const { unsubscribeUrl: _unused, ...withoutUnsubscribe } = boss;

describe('SealPrompt', () => {
  it('seals the sender', async () => {
    const adapter = new DemoAdapter({ latencyMs: 0 });
    const onDone = vi.fn();
    renderWithProviders(<SealPrompt boss={boss} adapter={adapter} runId="run" onDone={onDone} />);
    expect(screen.getByRole('button', { name: 'Seal forever' })).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: 'Seal forever' }));
    await waitFor(() => {
      expect(onDone).toHaveBeenCalledWith(true);
    });
    expect(screen.getByTestId('announcer-polite')).toHaveTextContent(/unsubscribed/);
    expect(adapter.unsubscribed).toEqual(['offers@swiggy.in']);
  });

  it('can be skipped and reports failures', async () => {
    const adapter = new DemoAdapter({ latencyMs: 0 });
    vi.spyOn(adapter, 'seal').mockRejectedValue(new Error('no'));
    const onDone = vi.fn();
    renderWithProviders(<SealPrompt boss={withoutUnsubscribe} adapter={adapter} runId="run" onDone={onDone} />);
    fireEvent.click(screen.getByRole('button', { name: 'Seal forever' }));
    expect(await screen.findByText(/Could not seal/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }));
    expect(onDone).toHaveBeenCalledWith(false);
  });
});

describe('EndScreen', () => {
  it('shows stats, the roast, MVPs and copies the result', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    renderWithProviders(
      <EndScreen
        stats={stats}
        adapter={new DemoAdapter({ latencyMs: 0 })}
        runId="run"
        categories={['Food']}
        mvps={[{ name: 'Asha', taps: 120 }]}
        onHome={vi.fn()}
        onAgain={vi.fn()}
      />,
    );
    expect(screen.getByRole('heading', { name: 'Exorcism complete' })).toHaveFocus();
    expect(screen.getByText('2,000 → 1,188')).toBeInTheDocument();
    expect(await screen.findByTestId('roast')).toHaveTextContent('812');
    expect(screen.getByText('1. Asha')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Copy result' }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Result copied!' })).toBeInTheDocument();
    });
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('812 unread emails in 3:12'));
  });

  it('resurrects everything after confirmation', async () => {
    const adapter = new DemoAdapter({ latencyMs: 0 });
    const ids = await adapter.idsForSender('offers@swiggy.in');
    await adapter.apply('banish', ids, 'run');
    renderWithProviders(
      <EndScreen stats={stats} adapter={adapter} runId="run" categories={[]} onHome={vi.fn()} onAgain={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Resurrect/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    fireEvent.click(screen.getByRole('button', { name: /Resurrect/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Yes, resurrect' }));
    expect(await screen.findByText(`${ids.length} emails restored to your inbox.`)).toBeInTheDocument();
    expect(await adapter.idsForSender('offers@swiggy.in')).toHaveLength(ids.length);
  });

  it('reports a failed undo and tolerates a missing clipboard', async () => {
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
    const adapter = new DemoAdapter({ latencyMs: 0 });
    vi.spyOn(adapter, 'undo').mockRejectedValue(new Error('down'));
    renderWithProviders(
      <EndScreen stats={stats} adapter={adapter} runId="run" categories={[]} onHome={vi.fn()} onAgain={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Copy result' }));
    fireEvent.click(screen.getByRole('button', { name: /Resurrect/ }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Yes, resurrect' }));
    });
    expect(await screen.findByText(/Undo failed/)).toBeInTheDocument();
  });
});
