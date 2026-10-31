import { render } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import type { PublicConfig } from '../../shared/types';
import { AnnouncerProvider } from '../../src/app/announcer';
import { ServicesProvider } from '../../src/app/services';
import { SettingsProvider } from '../../src/app/settings';
import { type ApiClient, createApiClient } from '../../src/lib/api';

export const offlineConfig: PublicConfig = {
  googleClientId: null,
  firebase: null,
  recaptchaSiteKey: null,
  useEmulators: false,
};

/** API client whose network always fails, so every call uses the local fallbacks. */
export function offlineApi(): ApiClient {
  return createApiClient({ fetchImpl: () => Promise.reject(new TypeError('offline')) });
}

export function renderWithProviders(
  ui: ReactElement,
  { api = offlineApi(), config = offlineConfig }: { api?: ApiClient; config?: PublicConfig } = {},
) {
  // A wrapper (rather than wrapping `ui`) keeps the providers when tests call rerender().
  function Providers({ children }: { children: ReactNode }) {
    return (
      <SettingsProvider>
        <AnnouncerProvider>
          <ServicesProvider services={{ api, config }}>{children}</ServicesProvider>
        </AnnouncerProvider>
      </SettingsProvider>
    );
  }
  return render(ui, { wrapper: Providers });
}
