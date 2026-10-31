import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { STORY_CHATTER_CHANCE } from '../../../shared/constants';
import type { ChoreAction, Proposal, RunStats } from '../../../shared/types';
import type { ChoreAdapter, ScanResult } from '../../adapters/types';
import { useAnnounce } from '../../app/announcer';
import { useServices } from '../../app/services';
import { useStory } from '../../app/story';
import { Hud } from '../../components/Hud';
import { OfflineBanner } from '../../components/OfflineBanner';
import { useRunSetup } from '../../hooks/useRunSetup';
import { useScoreboard } from '../../hooks/useScoreboard';
import { useUnreadCounter } from '../../hooks/useUnreadCounter';
import type { EncounterPlan, GhostSpec } from '../../lib/encounters';
import { createRunId, RunExecutor } from '../../lib/executor';
import { storyLines } from '../../lib/story';
import { strings } from '../../strings';
import { BossFight } from '../boss/BossFight';
import { SealPrompt } from '../boss/SealPrompt';
import { EndScreen } from '../endscreen/EndScreen';
import { GhostWave } from '../ghosts/GhostWave';
import { Briefing } from './Briefing';
import { SetupStatus } from './SetupStatus';

interface SoloGameProps {
  adapter: ChoreAdapter;
  onExit: () => void;
  onAgain: () => void;
}

/** Single-player game: scan → briefing → encounters → end screen. */
export function SoloGame({ adapter, onExit, onAgain }: SoloGameProps) {
  const { setup, retry } = useRunSetup(adapter);
  if (setup.status !== 'ready') return <SetupStatus setup={setup} onRetry={retry} onBack={onExit} />;
  return (
    <SoloRun
      adapter={adapter}
      scan={setup.scan}
      proposal={setup.proposal}
      plan={setup.plan}
      onExit={onExit}
      onAgain={onAgain}
    />
  );
}

interface SoloRunProps extends SoloGameProps {
  scan: ScanResult;
  proposal: Proposal;
  plan: EncounterPlan;
}

type Phase = 'briefing' | 'playing' | 'sealing' | 'ended';

function SoloRun({ adapter, scan, proposal, plan, onExit, onAgain }: SoloRunProps) {
  const { api } = useServices();
  const announce = useAnnounce();
  const tell = useStory();
  const [runId] = useState(() => createRunId());
  const executor = useMemo(() => new RunExecutor(adapter, runId), [adapter, runId]);
  const scoreboard = useScoreboard();
  const counter = useUnreadCounter(adapter, scan.totalUnread);
  const [phase, setPhase] = useState<Phase>('briefing');
  const [index, setIndex] = useState(0);
  const [sealed, setSealed] = useState(0);
  const [bossesDefeated, setBossesDefeated] = useState(0);
  const [stats, setStats] = useState<RunStats | null>(null);
  const draftsEnabled = useRef(false);
  const startedAt = useRef(0);
  const categories = useMemo(() => [...new Set(proposal.verdicts.map((v) => v.category))], [proposal]);
  const encounter = plan.encounters[index];

  const finish = useCallback(async () => {
    const unreadAfter = await adapter.unreadCount().catch(() => counter.count);
    const totals = executor.totals;
    setStats({
      cleared: totals.cleared,
      rescued: totals.rescued,
      kept: totals.kept,
      sealed,
      bossesDefeated,
      durationMs: Date.now() - startedAt.current,
      unreadBefore: scan.totalUnread,
      unreadAfter,
      bestCombo: scoreboard.bestCombo,
      score: scoreboard.score,
    });
    setPhase('ended');
  }, [
    adapter,
    bossesDefeated,
    counter.count,
    executor,
    scan.totalUnread,
    scoreboard.bestCombo,
    scoreboard.score,
    sealed,
  ]);

  const next = useCallback(() => {
    if (index + 1 >= plan.encounters.length) {
      void finish();
      return;
    }
    setIndex(index + 1);
    setPhase('playing');
  }, [finish, index, plan.encounters.length]);

  const onHit = useCallback(
    (emails: number) => {
      scoreboard.hit(emails);
      counter.refresh();
    },
    [counter, scoreboard],
  );

  const onBossDefeated = useCallback(
    (cleared: number) => {
      if (cleared > 0) {
        setBossesDefeated((value) => value + 1);
        setPhase('sealing');
      } else {
        next();
      }
    },
    [next],
  );

  const onDecision = useCallback(
    (action: ChoreAction, timedOut: boolean, ghost: GhostSpec) => {
      if (timedOut) scoreboard.miss();
      else scoreboard.decide();
      counter.refresh();
      if (action === 'rescue') tell(storyLines.rescue(ghost.email.senderName));
      else if (timedOut || Math.random() < STORY_CHATTER_CHANCE) {
        tell(storyLines.decision(action, ghost.email.senderName, timedOut));
      }
    },
    [counter, scoreboard, tell],
  );

  // Narrate the start of each ghost wave and the trapped souls.
  useEffect(() => {
    if (phase !== 'playing' || !encounter || encounter.kind === 'boss') return;
    tell(encounter.kind === 'souls' ? storyLines.soulsStart() : storyLines.waveStart());
  }, [encounter, phase, tell]);

  // Cheer every time the combo multiplier goes up.
  const lastMultiplier = useRef(1);
  useEffect(() => {
    if (scoreboard.multiplier > lastMultiplier.current) tell(storyLines.combo(scoreboard.multiplier));
    lastMultiplier.current = scoreboard.multiplier;
  }, [scoreboard.multiplier, tell]);

  const onRescued = useCallback(
    (ghost: GhostSpec) => {
      if (!draftsEnabled.current) return;
      void api
        .draft({ senderName: ghost.email.senderName, subject: ghost.email.subject, snippet: ghost.email.snippet })
        .then((reply) => adapter.createDraft(ghost.email, reply.body))
        .then(
          () => {
            announce(strings.ghosts.drafted);
          },
          () => undefined,
        );
    },
    [adapter, announce, api],
  );

  if (phase === 'briefing') {
    return (
      <Briefing
        plan={plan}
        proposal={proposal}
        totalUnread={scan.totalUnread}
        adapter={adapter}
        onBack={onExit}
        onStart={(drafts) => {
          draftsEnabled.current = drafts;
          startedAt.current = Date.now();
          tell(storyLines.runStart(scan.totalUnread));
          setPhase('playing');
        }}
      />
    );
  }

  if (phase === 'ended' && stats) {
    return (
      <EndScreen
        stats={stats}
        adapter={adapter}
        runId={runId}
        categories={categories}
        onHome={onExit}
        onAgain={onAgain}
      />
    );
  }

  return (
    <div>
      <OfflineBanner />
      <Hud
        score={scoreboard.score}
        multiplier={scoreboard.multiplier}
        unread={counter.count}
        index={index + 1}
        total={plan.encounters.length}
        onQuit={() => {
          void finish();
        }}
      />
      {phase === 'sealing' && encounter?.kind === 'boss' && (
        <SealPrompt
          boss={encounter.boss}
          adapter={adapter}
          runId={runId}
          onDone={(didSeal) => {
            if (didSeal) {
              setSealed((value) => value + 1);
              tell(storyLines.sealed(encounter.boss.bossName));
            }
            next();
          }}
        />
      )}
      {phase === 'playing' && encounter?.kind === 'boss' && (
        <BossFight
          key={`boss-${index}`}
          boss={encounter.boss}
          adapter={adapter}
          executor={executor}
          importantIds={plan.importantIds}
          streak={scoreboard.streak}
          onHit={onHit}
          onMiss={scoreboard.miss}
          onDefeated={onBossDefeated}
        />
      )}
      {phase === 'playing' && encounter && encounter.kind !== 'boss' && (
        <GhostWave
          key={`wave-${index}`}
          ghosts={encounter.ghosts}
          mode={encounter.kind}
          executor={executor}
          onDecision={onDecision}
          onRescued={onRescued}
          onComplete={next}
        />
      )}
    </div>
  );
}
