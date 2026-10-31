import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { epitaphFor, pleaFor } from '../../../shared/classifier';
import { STORY_MAX_VISIBLE, STORY_TOAST_MS } from '../../../shared/constants';
import { SettingsProvider } from '../../../src/app/settings';
import { StoryProvider, type Tell, useStory } from '../../../src/app/story';
import { storyLines } from '../../../src/lib/story';

const first = () => 0;
const last = () => 0.999;

function Teller({ onReady }: { onReady: (tell: Tell) => void }) {
  onReady(useStory());
  return null;
}

function renderFeed() {
  let tell: Tell = () => undefined;
  render(
    <SettingsProvider>
      <StoryProvider>
        <Teller onReady={(t) => (tell = t)} />
      </StoryProvider>
    </SettingsProvider>,
  );
  return (line: Parameters<Tell>[0]) => {
    act(() => {
      tell(line);
    });
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('storyLines', () => {
  it('narrates every moment with the real numbers and names', () => {
    expect(storyLines.runStart(2000, first).text).toContain('2,000 unread ghosts');
    expect(storyLines.waveStart(first).emoji).toBe('🌫️');
    expect(storyLines.soulsStart(last).text).toMatch(/Trapped souls/);
    expect(storyLines.bossPlea('The Swiggy Specter', 'Spare me!')).toMatchObject({
      speaker: 'The Swiggy Specter',
      text: '“Spare me!”',
      sensitive: true,
    });
    expect(storyLines.bossDefeated('RIP Swiggy').text).toBe('RIP Swiggy');
    expect(storyLines.combo(3, first).text).toContain('x3');
    expect(storyLines.decision('keep', 'Swiggy', true, first).speaker).toBe('A ghost');
    expect(storyLines.decision('banish', 'Swiggy', false, first).text).toContain('Swiggy');
    expect(storyLines.decision('keep', 'Swiggy', false, first).emoji).toBe('🤝');
    expect(storyLines.rescue('Riya', first)).toMatchObject({
      sensitive: true,
      text: expect.stringContaining('Riya') as string,
    });
    expect(storyLines.sealed('The LinkedIn Lich', last).text).toContain('The LinkedIn Lich');
  });

  it('has deterministic fallback pleas and epitaphs with the sender’s numbers', () => {
    const group = { sender: 'offers@swiggy.in', senderName: 'Swiggy', count: 42, samples: [] };
    expect(pleaFor(group)).toBe(pleaFor(group));
    expect(epitaphFor(group)).toMatch(/Swiggy|42/);
    expect(epitaphFor({ ...group, senderName: '  ' })).not.toContain('{name}');
  });
});

describe('StoryProvider', () => {
  it('shows toasts, keeps only the latest few and auto-dismisses them', async () => {
    // Only timeouts are faked, so exit animations (requestAnimationFrame) still finish.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'], shouldAdvanceTime: true });
    const tell = renderFeed();
    for (let i = 0; i < STORY_MAX_VISIBLE + 2; i += 1) tell({ speaker: 'Narrator', emoji: '📜', text: `Line ${i}` });
    await waitFor(() => {
      expect(screen.getAllByTestId('story-toast')).toHaveLength(STORY_MAX_VISIBLE);
    });
    expect(screen.queryByText('Line 0')).not.toBeInTheDocument();
    expect(screen.getByRole('log', { name: 'Story' })).toHaveAttribute('aria-live', 'polite');
    act(() => {
      vi.advanceTimersByTime(STORY_TOAST_MS + 500);
    });
    await waitFor(() => {
      expect(screen.queryAllByTestId('story-toast')).toHaveLength(0);
    });
  });

  it('can be dismissed and blurs names in streamer mode', async () => {
    const tell = renderFeed();
    tell({ speaker: 'The Swiggy Specter', emoji: '😰', text: 'Spare me!', sensitive: true });
    expect(screen.getByText('Spare me!')).toHaveClass('sensitive');
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    await waitFor(() => {
      expect(screen.queryByText('Spare me!')).not.toBeInTheDocument();
    });
  });

  it('is a safe no-op outside the provider', () => {
    let tell: Tell | undefined;
    render(<Teller onReady={(t) => (tell = t)} />);
    expect(() => tell?.({ speaker: 'x', emoji: 'x', text: 'x' })).not.toThrow();
  });
});
