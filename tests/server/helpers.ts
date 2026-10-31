import { type Mock, vi } from 'vitest';
import { loadConfig, type ServerConfig } from '../../server/config';
import { fallbackProposal } from '../../shared/classifier';
import { fallbackDraft, fallbackRoast } from '../../shared/fallbacks';
import type { GameMaster } from '../../server/services/gameMaster';
import { silentLogger } from '../../server/logger';
import { type AppDeps, createApp } from '../../server/app';

export function testConfig(overrides: Partial<ServerConfig> = {}): ServerConfig {
  return { ...loadConfig({ STATIC_DIR: '/nonexistent' }), ...overrides };
}

export function fakeGameMaster(): { [K in keyof GameMaster]: Mock<GameMaster[K]> } {
  return {
    propose: vi.fn<GameMaster['propose']>((groups) =>
      Promise.resolve({ ...fallbackProposal(groups), source: 'gemini' as const }),
    ),
    roast: vi.fn<GameMaster['roast']>((stats) => Promise.resolve(fallbackRoast(stats))),
    draft: vi.fn<GameMaster['draft']>((request) => Promise.resolve(fallbackDraft(request))),
  };
}

export function buildApp(overrides: Partial<AppDeps> = {}) {
  const deps: AppDeps = {
    config: testConfig(),
    logger: silentLogger,
    gameMaster: fakeGameMaster(),
    unsubscribe: vi.fn(() => Promise.resolve(200)),
    appCheckVerifier: null,
    ...overrides,
  };
  return { app: createApp(deps), deps };
}

export const groups = [
  {
    sender: 'offers@swiggy.in',
    senderName: 'Swiggy',
    count: 40,
    samples: [{ id: 'm1', subject: '60% off', snippet: 'tonight' }],
  },
];

export const stats = {
  cleared: 10,
  rescued: 1,
  kept: 2,
  sealed: 0,
  bossesDefeated: 1,
  durationMs: 1000,
  unreadBefore: 20,
  unreadAfter: 10,
  bestCombo: 3,
  score: 300,
};
