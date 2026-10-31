import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { Tell } from '../../../src/app/story';
import type { Encounter, GhostSpec } from '../../../src/lib/encounters';

const tell = vi.hoisted(() => vi.fn<Tell>());
vi.mock('../../../src/app/story', () => ({ useStory: () => tell }));

const { useRunNarration } = await import('../../../src/features/solo/useRunNarration');

const ghost: GhostSpec = {
  email: { id: 'g', threadId: 'g', senderEmail: 'a@b.co', senderName: 'Riya', subject: 'Hi', snippet: '' },
  suggestion: 'keep',
  confidence: 0.4,
  isImportant: false,
  summary: 'Mail',
};
const wave: Encounter = { kind: 'ghosts', ghosts: [ghost] };
const souls: Encounter = { kind: 'souls', ghosts: [ghost] };
const wrapper = ({ children }: { children: ReactNode }) => children;

describe('useRunNarration', () => {
  it('narrates waves, souls and combo increases automatically', () => {
    tell.mockClear();
    const { rerender } = renderHook((props) => useRunNarration(props), {
      wrapper,
      initialProps: { playing: true, encounter: wave as Encounter | undefined, multiplier: 1 },
    });
    expect(tell).toHaveBeenLastCalledWith(expect.objectContaining({ emoji: '🌫️' }));
    rerender({ playing: true, encounter: souls, multiplier: 1 });
    expect(tell).toHaveBeenLastCalledWith(expect.objectContaining({ emoji: '🕯️' }));
    rerender({ playing: true, encounter: souls, multiplier: 2 });
    expect(tell).toHaveBeenLastCalledWith(expect.objectContaining({ emoji: '📣' }));
    const calls = tell.mock.calls.length;
    rerender({ playing: true, encounter: souls, multiplier: 1 });
    expect(tell).toHaveBeenCalledTimes(calls);
  });

  it('always narrates rescues and timeouts, and only sometimes ordinary decisions', () => {
    tell.mockClear();
    let roll = 0.99;
    const { result } = renderHook(
      () => useRunNarration({ playing: false, encounter: undefined, multiplier: 1, random: () => roll }),
      {
        wrapper,
      },
    );
    result.current.decision('keep', false, ghost);
    expect(tell).not.toHaveBeenCalled();
    roll = 0;
    result.current.decision('banish', false, ghost);
    result.current.decision('keep', true, ghost);
    result.current.decision('rescue', false, ghost);
    result.current.start(42);
    result.current.sealed('The LinkedIn Lich');
    expect(tell.mock.calls.map(([line]) => line.emoji)).toEqual(['💨', '👻', '🛟', '📜', '🔒']);
  });
});
