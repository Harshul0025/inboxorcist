import { act, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EmailItem } from '../../../shared/types';
import { DemoAdapter } from '../../../src/adapters/DemoAdapter';
import { GhostWave, ghostTimeMs } from '../../../src/features/ghosts/GhostWave';
import type { GhostSpec } from '../../../src/lib/encounters';
import { RunExecutor } from '../../../src/lib/executor';
import { renderWithProviders } from '../renderWithProviders';

const ghost = (id: string, isImportant = false): GhostSpec => ({
  email: {
    id,
    threadId: id,
    senderEmail: `${id}@example.com`,
    senderName: `Sender ${id}`,
    subject: `Subject ${id}`,
    snippet: 'snippet',
  } satisfies EmailItem,
  suggestion: isImportant ? 'rescue' : 'banish',
  confidence: 0.55,
  isImportant,
  summary: 'Mail',
});

function setup(ghosts: GhostSpec[], mode: 'ghosts' | 'souls' = 'ghosts') {
  const executor = new RunExecutor(new DemoAdapter({ latencyMs: 0, emails: [] }), 'run');
  const apply = vi.spyOn(executor, 'apply');
  const onDecision = vi.fn();
  const onComplete = vi.fn();
  const onRescued = vi.fn();
  renderWithProviders(
    <GhostWave
      ghosts={ghosts}
      mode={mode}
      executor={executor}
      onDecision={onDecision}
      onComplete={onComplete}
      onRescued={onRescued}
    />,
  );
  return { apply, onDecision, onComplete, onRescued };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('ghostTimeMs', () => {
  it('speeds up but never below the minimum, and is generous with reduced motion', () => {
    expect(ghostTimeMs(0, false)).toBeGreaterThan(ghostTimeMs(5, false));
    expect(ghostTimeMs(100, false)).toBe(2500);
    expect(ghostTimeMs(100, true)).toBeGreaterThanOrEqual(6000);
  });
});

describe('GhostWave', () => {
  it('maps arrow keys to banish, keep and rescue and completes after the last ghost', async () => {
    const { apply, onDecision, onComplete, onRescued } = setup([ghost('a'), ghost('b'), ghost('c')]);
    expect(screen.getByText('Subject a')).toBeInTheDocument();
    expect(screen.getByText(/Gemini suggests: Banish \(55% sure\)/)).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    fireEvent.keyDown(window, { key: 'ArrowUp' });
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(apply.mock.calls.map((c) => c[0])).toEqual(['banish', 'keep', 'rescue']);
    expect(onDecision).toHaveBeenCalledWith('banish', false, expect.objectContaining({ suggestion: 'banish' }));
    expect(onComplete).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => {
      expect(onRescued).toHaveBeenCalledTimes(1);
    });
  });

  it('supports buttons', () => {
    const { apply } = setup([ghost('a')]);
    fireEvent.click(screen.getByRole('button', { name: /Keep/ }));
    expect(apply).toHaveBeenCalledWith('keep', ['a']);
  });

  it('never banishes trapped souls', () => {
    const { apply, onComplete } = setup([ghost('s', true)], 'souls');
    expect(screen.getByRole('button', { name: /Banish/ })).toBeDisabled();
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(apply).not.toHaveBeenCalled();
    expect(screen.getByText(/never banished/)).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'ArrowUp' });
    expect(apply).toHaveBeenCalledWith('rescue', ['s']);
    expect(onComplete).toHaveBeenCalled();
  });

  it('keeps the email when time runs out', () => {
    vi.useFakeTimers();
    const { apply, onDecision } = setup([ghost('a'), ghost('b')]);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByText(/5s left/)).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(6000);
    });
    expect(onDecision).toHaveBeenCalledWith('keep', true, expect.objectContaining({ isImportant: false }));
    expect(apply).toHaveBeenCalledWith('keep', ['a']);
    expect(screen.getByText('Subject b')).toBeInTheDocument();
  });

  it('announces failures', async () => {
    const { apply } = setup([ghost('a')]);
    apply.mockRejectedValueOnce(new Error('nope'));
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    await vi.waitFor(() => {
      expect(screen.getByTestId('announcer-assertive')).toHaveTextContent('That action failed');
    });
  });
});
