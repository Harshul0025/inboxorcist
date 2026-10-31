import { act, fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DemoAdapter } from '../../../src/adapters/DemoAdapter';
import { BossFight } from '../../../src/features/boss/BossFight';
import type { BossSpec } from '../../../src/lib/encounters';
import { RunExecutor } from '../../../src/lib/executor';
import { renderWithProviders } from '../renderWithProviders';

const boss: BossSpec = {
  sender: 'offers@swiggy.in',
  senderName: 'Swiggy',
  bossName: 'The Swiggy Specter',
  taunt: 'Biryani?',
  summary: 'Food delivery promotions',
  category: 'Food delivery',
  estimatedHp: 40,
};

function setup(options: { adapter?: DemoAdapter; important?: Set<string> } = {}) {
  const adapter = options.adapter ?? new DemoAdapter({ latencyMs: 0 });
  const executor = new RunExecutor(adapter, 'run');
  const props = { onHit: vi.fn(), onMiss: vi.fn(), onDefeated: vi.fn() };
  renderWithProviders(
    <BossFight
      boss={boss}
      adapter={adapter}
      executor={executor}
      importantIds={options.important ?? new Set()}
      streak={0}
      random={() => 0}
      {...props}
    />,
  );
  return { adapter, executor, ...props };
}

describe('BossFight', () => {
  it('loads real HP and drains it as hits archive mail', async () => {
    const { adapter, onHit, onMiss, onDefeated } = setup();
    const total = (await adapter.idsForSender(boss.sender)).length;
    const spot = await screen.findByTestId('weak-spot');
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuemax', String(total));
    expect(spot).toHaveAttribute('aria-keyshortcuts', 'ArrowUp');

    fireEvent.keyDown(window, { key: 'ArrowDown' });
    expect(onMiss).toHaveBeenCalledTimes(1);

    fireEvent.click(spot);
    await vi.waitFor(() => {
      expect(onHit).toHaveBeenCalledTimes(1);
    });
    expect(Number(screen.getByRole('progressbar').getAttribute('aria-valuenow'))).toBeLessThan(total);

    for (let i = 0; i < 10; i += 1) fireEvent.keyDown(window, { key: 'ArrowUp' });
    await vi.waitFor(() => {
      expect(onDefeated).toHaveBeenCalledWith(total);
    });
    expect(await adapter.idsForSender(boss.sender)).toEqual([]);
  });

  it('skips important mail and handles an empty boss', async () => {
    const adapter = new DemoAdapter({ latencyMs: 0 });
    const ids = await adapter.idsForSender(boss.sender);
    const { onDefeated } = setup({ adapter, important: new Set(ids) });
    fireEvent.click(await screen.findByRole('button', { name: 'Continue' }));
    expect(onDefeated).toHaveBeenCalledWith(0);
  });

  it('shows a retry after a failed hit and resumes', async () => {
    const adapter = new DemoAdapter({ latencyMs: 0 });
    const apply = vi.spyOn(adapter, 'apply').mockRejectedValueOnce(new Error('503'));
    const { onHit } = setup({ adapter });
    fireEvent.click(await screen.findByTestId('weak-spot'));
    fireEvent.click(await screen.findByRole('button', { name: 'Retry' }));
    fireEvent.click(await screen.findByTestId('weak-spot'));
    await vi.waitFor(() => {
      expect(onHit).toHaveBeenCalledTimes(1);
    });
    expect(apply).toHaveBeenCalledTimes(2);
  });

  it('retries loading when the sender lookup fails', async () => {
    const adapter = new DemoAdapter({ latencyMs: 0 });
    vi.spyOn(adapter, 'idsForSender').mockRejectedValueOnce(new Error('offline'));
    setup({ adapter });
    fireEvent.click(await screen.findByRole('button', { name: 'Retry' }));
    expect(await screen.findByTestId('weak-spot')).toBeInTheDocument();
  });

  it('moves the weak spot when the window expires', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      setup();
      const spot = await screen.findByTestId('weak-spot');
      const before = spot.style.left;
      act(() => {
        vi.advanceTimersByTime(2000);
      });
      expect(screen.getByTestId('weak-spot').style.left).not.toBe(before);
    } finally {
      vi.useRealTimers();
    }
  });
});
