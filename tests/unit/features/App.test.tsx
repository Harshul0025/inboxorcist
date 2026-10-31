import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PublicConfig } from '../../../shared/types';
import { DemoAdapter } from '../../../src/adapters/DemoAdapter';
import { App } from '../../../src/App';
import { offlineApi, offlineConfig } from '../renderWithProviders';

const connectGmail = vi.hoisted(() => vi.fn());
vi.mock('../../../src/adapters/connectGmail', () => ({ connectGmail }));

function renderApp(config: PublicConfig = offlineConfig) {
  return render(<App services={{ api: offlineApi(), config }} />);
}

afterEach(() => {
  window.history.replaceState(null, '', '/');
  document.documentElement.classList.remove('streamer');
  localStorage.clear();
});

describe('App', () => {
  it('plays a demo run from the home page to the end screen', async () => {
    renderApp();
    expect(screen.getByRole('heading', { name: 'Your inbox is haunted.' })).toBeInTheDocument();
    expect(screen.getByText(/Gmail sign-in is not configured/)).toBeInTheDocument();
    expect(screen.getByText(/Raid mode needs Firebase/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Play demo' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Start exorcism' }, { timeout: 3000 }));
    expect(screen.getByTestId('unread-counter')).toHaveTextContent('2,000');
    expect(await screen.findByTestId('weak-spot')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'End run' }));
    expect(await screen.findByRole('heading', { name: 'Exorcism complete' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Play again' }));
    expect(await screen.findByRole('button', { name: 'Start exorcism' }, { timeout: 3000 })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByRole('heading', { name: 'Your inbox is haunted.' })).toBeInTheDocument();
  });

  it('toggles streamer mode and sound, persisting the choice', () => {
    renderApp();
    fireEvent.click(screen.getByRole('switch', { name: 'Streamer mode' }));
    expect(document.documentElement).toHaveClass('streamer');
    expect(localStorage.getItem('inboxorcist.streamer')).toBe('true');
    fireEvent.click(screen.getByRole('switch', { name: 'Sound' }));
    expect(localStorage.getItem('inboxorcist.sound')).toBe('false');
    expect(screen.getByRole('switch', { name: 'Streamer mode' })).toHaveAccessibleDescription(
      'Blurs senders and subjects for projectors and screen shares.',
    );
  });

  it('connects Gmail and reports a cancelled sign-in', async () => {
    const config = { ...offlineConfig, googleClientId: 'cid' };
    connectGmail.mockRejectedValueOnce(new Error('popup_closed'));
    renderApp(config);
    fireEvent.click(screen.getByRole('button', { name: 'Connect Gmail' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('cancelled or failed');

    connectGmail.mockResolvedValueOnce(new DemoAdapter({ latencyMs: 0 }));
    fireEvent.click(screen.getByRole('button', { name: 'Connect Gmail' }));
    expect(await screen.findByRole('button', { name: 'Start exorcism' })).toBeInTheDocument();
  });

  it('opens the join screen from a room link and from the join form', async () => {
    window.history.replaceState(null, '', '/?room=abcd');
    const { unmount } = renderApp();
    expect(await screen.findByText(/Raid mode is not configured/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Leave' }));
    expect(window.location.search).toBe('');
    unmount();

    renderApp({
      ...offlineConfig,
      firebase: { apiKey: 'k', authDomain: 'd', databaseURL: 'u', projectId: 'p', appId: 'a' },
    });
    const input = screen.getByRole('textbox', { name: 'Room code' });
    fireEvent.change(input, { target: { value: 'ab1c' } });
    expect(input).toHaveValue('ABC');
    expect(screen.getByRole('button', { name: 'Join' })).toBeDisabled();
    fireEvent.change(input, { target: { value: 'abcd' } });
    fireEvent.submit(input.closest('form')!);
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Join the raid/ })).toBeInTheDocument();
    });
  });
});
