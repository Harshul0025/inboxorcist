import { createContext, type ReactNode, useContext } from 'react';
import type { PublicConfig } from '../../shared/types';
import type { ApiClient } from '../lib/api';

export interface Services {
  api: ApiClient;
  config: PublicConfig;
}

const ServicesContext = createContext<Services | null>(null);

/** Provides the API client and runtime config to the app. */
export function ServicesProvider({ services, children }: { services: Services; children: ReactNode }) {
  return <ServicesContext.Provider value={services}>{children}</ServicesContext.Provider>;
}

/** Reads app services. Must be used inside `ServicesProvider`. */
export function useServices(): Services {
  const services = useContext(ServicesContext);
  if (!services) throw new Error('useServices must be used inside ServicesProvider');
  return services;
}
