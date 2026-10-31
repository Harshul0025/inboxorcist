import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { RunStats } from '../../../shared/types';
import type { ChoreAdapter } from '../../adapters/types';
import { useAnnounce } from '../../app/announcer';
import { useServices } from '../../app/services';
import { useStory } from '../../app/story';
import { OfflineBanner } from '../../components/OfflineBanner';
import { useRunSetup } from '../../hooks/useRunSetup';
import { useScoreboard } from '../../hooks/useScoreboard';
import { useUnreadCounter } from '../../hooks/useUnreadCounter';
import type { EncounterPlan } from '../../lib/encounters';
import { createRunId, RunExecutor } from '../../lib/executor';
import { formatCount } from '../../lib/scoring';
import { storyLines } from '../../lib/story';
import { strings } from '../../strings';
import { EndScreen } from '../endscreen/EndScreen';
import { Briefing } from '../solo/Briefing';
import { SetupStatus } from '../solo/SetupStatus';
import { Lobby } from './Lobby';
import { RaidBossStage } from './RaidBossStage';
import { buildRaidSteps, rankMvps, type RoomState } from './raidLogic';
import {
  connectRaid,
  createRoom,
  type RaidConnection,
  subscribeRoom,
  trackHostPresence,
  updateRoom,
} from './raidService';
import { RaidVoteStage } from './RaidVoteStage';
import { SoulsStage } from './SoulsStage';

interface RaidHostProps {
  adapter: ChoreAdapter;
  onExit: () => void;
  onAgain: () => void;
}

/** Big-screen host for Raid Mode. Only this browser holds the Gmail token. */
export default function RaidHost({ adapter, onExit, onAgain }: RaidHostProps) {
  const { setup, retry } = useRunSetup(adapter);
  const [briefed, setBriefed] = useState(false);
  if (setup.status !== 'ready') return <SetupStatus setup={setup} onRetry={retry} onBack={onExit} />;
  if (!briefed) {
    return (
      <Briefing
        plan={setup.plan}
        proposal={setup.proposal}
        totalUnread={setup.scan.totalUnread}
        adapter={adapter}
        startLabel={strings.raid.hostHeading}
        onBack={onExit}
        onStart={() => {
          setBriefed(true);
        }}
      />
    );
  }
  return (
    <RaidSession
      adapter={adapter}
      plan={setup.plan}
      totalUnread={setup.scan.totalUnread}
      categories={[...new Set(setup.proposal.verdicts.map((v) => v.category))]}
      onExit={onExit}
      onAgain={onAgain}
    />
  );
}

interface RaidSessionProps extends RaidHostProps {
  plan: EncounterPlan;
  totalUnread: number;
  categories: string[];
}

function RaidSession({ adapter, plan, totalUnread, categories, onExit, onAgain }: RaidSessionProps) {
  const { config } = useServices();
  const announce = useAnnounce();
  const tell = useStory();
  const [conn, setConn] = useState<RaidConnection | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [room, setRoom] = useState<RoomState | null>(null);
  const [online, setOnline] = useState(true);
  const [failed, setFailed] = useState(false);
  const [stepIndex, setStepIndex] = useState(-1);
  const [stats, setStats] = useState<RunStats | null>(null);
  const [runId] = useState(() => createRunId());
  const executor = useMemo(() => new RunExecutor(adapter, runId), [adapter, runId]);
  const scoreboard = useScoreboard();
  const counter = useUnreadCounter(adapter, totalUnread);
  const steps = useMemo(() => buildRaidSteps(plan), [plan]);
  const startedAt = useRef(0);
  const bossesDefeated = useRef(0);
  const [stableCategories] = useState(categories);

  useEffect(() => {
    let cancelled = false;
    connectRaid(config)
      .then(async (connection) => {
        const roomCode = await createRoom(connection);
        if (cancelled) return;
        setConn(connection);
        setCode(roomCode);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [config]);

  useEffect(() => {
    if (!conn || !code) return undefined;
    const stopRoom = subscribeRoom(conn, code, setRoom, () => {
      setFailed(true);
    });
    const stopPresence = trackHostPresence(conn, code, setOnline);
    return () => {
      stopRoom();
      stopPresence();
    };
  }, [conn, code]);

  // Once a run is ending, late callbacks (a seal or vote finishing after "End run") must not resume it.
  const ending = useRef(false);
  const finish = useCallback(async () => {
    if (ending.current) return;
    ending.current = true;
    const unreadAfter = await adapter.unreadCount().catch(() => counter.count);
    const totals = executor.totals;
    const durationMs = Date.now() - startedAt.current;
    setStats({
      cleared: totals.cleared,
      rescued: totals.rescued,
      kept: totals.kept,
      sealed: 0,
      bossesDefeated: bossesDefeated.current,
      durationMs,
      unreadBefore: totalUnread,
      unreadAfter,
      bestCombo: scoreboard.bestCombo,
      score: scoreboard.score,
    });
    if (conn && code) {
      await updateRoom(conn, code, { status: 'ended', stats: { cleared: totals.cleared, durationMs } }).catch(
        () => undefined,
      );
    }
  }, [adapter, code, conn, counter.count, executor, scoreboard.bestCombo, scoreboard.score, totalUnread]);

  const next = useCallback(() => {
    if (ending.current) return;
    counter.refresh();
    if (stepIndex + 1 >= steps.length) {
      void finish();
      return;
    }
    setStepIndex(stepIndex + 1);
  }, [counter, finish, stepIndex, steps.length]);

  if (failed) {
    return (
      <section role="alert" className="card mx-auto max-w-lg text-center">
        <p className="text-rose-300">{strings.raid.createFailed}</p>
        <button type="button" className="btn btn-ghost mt-4" onClick={onExit}>
          {strings.briefing.back}
        </button>
      </section>
    );
  }

  if (stats) {
    return (
      <EndScreen
        stats={stats}
        adapter={adapter}
        runId={runId}
        categories={stableCategories}
        mvps={rankMvps(room?.players, room?.taps)}
        onHome={onExit}
        onAgain={onAgain}
      />
    );
  }

  if (!conn || !code || !room) {
    return <SetupStatus setup={{ status: 'consulting' }} onRetry={onExit} onBack={onExit} />;
  }

  const step = steps[stepIndex];
  const players = Object.values(room.players ?? {});

  return (
    <div>
      <OfflineBanner />
      {!online && (
        <p role="alert" className="mb-3 rounded-xl bg-amber-900/60 px-4 py-2 text-amber-100">
          {strings.raid.hostOffline}
        </p>
      )}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-slate-900/70 px-4 py-3">
        <p>
          {strings.raid.code}: <strong className="text-2xl tracking-[0.3em]">{code}</strong>
        </p>
        <p>{strings.raid.players(players.length)}</p>
        <p data-testid="unread-counter">
          {strings.hud.unread}: <strong className="text-emerald-300">{formatCount(counter.count)}</strong>
        </p>
        {stepIndex >= 0 && (
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              void finish();
            }}
          >
            {strings.raid.end}
          </button>
        )}
      </div>

      {stepIndex < 0 && (
        <Lobby
          code={code}
          names={players.map((p) => p.name)}
          onStart={() => {
            startedAt.current = Date.now();
            announce(strings.raid.bossPrompt);
            tell(storyLines.runStart(totalUnread));
            next();
          }}
        />
      )}
      {step?.kind === 'boss' && (
        <RaidBossStage
          key={stepIndex}
          boss={step.boss}
          adapter={adapter}
          executor={executor}
          importantIds={plan.importantIds}
          conn={conn}
          code={code}
          room={room}
          paused={!online}
          onHit={(emails) => {
            scoreboard.hit(emails);
            counter.refresh();
          }}
          onDone={(cleared) => {
            if (cleared > 0) bossesDefeated.current += 1;
            next();
          }}
        />
      )}
      {step?.kind === 'vote' && (
        <RaidVoteStage
          key={stepIndex}
          ghost={step.ghost}
          voteId={step.voteId}
          executor={executor}
          conn={conn}
          code={code}
          room={room}
          onDone={next}
        />
      )}
      {step?.kind === 'souls' && (
        <SoulsStage key={stepIndex} ghosts={step.ghosts} executor={executor} conn={conn} code={code} onDone={next} />
      )}
    </div>
  );
}
