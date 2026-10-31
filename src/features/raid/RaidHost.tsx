import QRCode from 'qrcode';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RAID_TAPS_PER_HIT, RAID_VOTE_GRACE_MS, RAID_VOTE_MS } from '../../../shared/constants';
import type { RunStats } from '../../../shared/types';
import type { ChoreAdapter } from '../../adapters/types';
import { useAnnounce } from '../../app/announcer';
import { useServices } from '../../app/services';
import { GhostSprite } from '../../components/GhostSprite';
import { OfflineBanner } from '../../components/OfflineBanner';
import { useRunSetup } from '../../hooks/useRunSetup';
import { useScoreboard } from '../../hooks/useScoreboard';
import { useUnreadCounter } from '../../hooks/useUnreadCounter';
import type { BossSpec, EncounterPlan, GhostSpec } from '../../lib/encounters';
import { createRunId, RunExecutor } from '../../lib/executor';
import { formatCount } from '../../lib/scoring';
import { playSound } from '../../lib/sound';
import { storyLines } from '../../lib/story';
import { useSettings } from '../../app/settings';
import { useStory } from '../../app/story';
import { strings } from '../../strings';
import { useBossEngine } from '../boss/useBossEngine';
import { EndScreen } from '../endscreen/EndScreen';
import { GhostWave } from '../ghosts/GhostWave';
import { Briefing } from '../solo/Briefing';
import { SetupStatus } from '../solo/SetupStatus';
import { buildRaidSteps, newHits, rankMvps, type RoomState, sumTaps, tallyVotes } from './raidLogic';
import {
  connectRaid,
  createRoom,
  type RaidConnection,
  subscribeRoom,
  trackHostPresence,
  updateRoom,
} from './raidService';

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

  const finish = useCallback(async () => {
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

/** @internal Exported for tests. */
export function Lobby({ code, names, onStart }: { code: string; names: string[]; onStart: () => void }) {
  const [qr, setQr] = useState<string | null>(null);
  const joinUrl = `${window.location.origin}/?room=${code}`;

  useEffect(() => {
    let active = true;
    QRCode.toDataURL(joinUrl, { margin: 1, width: 320 }).then(
      (url) => {
        if (active) setQr(url);
      },
      () => undefined,
    );
    return () => {
      active = false;
    };
  }, [joinUrl]);

  return (
    <section aria-labelledby="lobby-heading" className="card grid gap-6 md:grid-cols-2">
      <div className="text-center">
        <h2 id="lobby-heading" className="text-3xl font-black">
          {strings.raid.hostHeading}
        </h2>
        <p className="mt-2 text-slate-300">{strings.raid.joinUrl}</p>
        {qr && (
          <img
            src={qr}
            alt={strings.raid.qrAlt(code)}
            width={320}
            height={320}
            className="mx-auto mt-4 rounded-2xl bg-white p-2"
          />
        )}
        <p className="mt-3 text-5xl font-black tracking-[0.4em]" data-testid="room-code">
          {code}
        </p>
        <p className="mt-1 break-all text-sm text-slate-400">{joinUrl}</p>
      </div>
      <div>
        <h3 className="text-xl font-bold">{strings.raid.players(names.length)}</h3>
        {names.length === 0 ? (
          <p className="mt-2 text-slate-400">{strings.raid.noPlayers}</p>
        ) : (
          <ul className="mt-2 flex flex-wrap gap-2" data-testid="player-list">
            {names.map((name, position) => (
              <li key={`${name}-${position}`} className="rounded-full bg-purple-900/60 px-3 py-1">
                {name}
              </li>
            ))}
          </ul>
        )}
        <button type="button" className="btn btn-primary mt-6" disabled={names.length === 0} onClick={onStart}>
          {strings.raid.start}
        </button>
      </div>
    </section>
  );
}

interface RaidBossStageProps {
  boss: BossSpec;
  adapter: ChoreAdapter;
  executor: RunExecutor;
  importantIds: ReadonlySet<string>;
  conn: RaidConnection;
  code: string;
  room: RoomState;
  paused: boolean;
  onHit: (emails: number) => void;
  onDone: (cleared: number) => void;
}

/** @internal Exported for tests. */
export function RaidBossStage({
  boss,
  adapter,
  executor,
  importantIds,
  conn,
  code,
  room,
  paused,
  onHit,
  onDone,
}: RaidBossStageProps) {
  const { sound } = useSettings();
  const tell = useStory();
  const cleared = useRef(0);
  const baseline = useRef<number | null>(null);
  const hitsDone = useRef(0);
  const handleChunk = useCallback(
    (emails: number) => {
      cleared.current += emails;
      onHit(emails);
      if (sound) playSound('hit');
    },
    [onHit, sound],
  );
  const engine = useBossEngine({ boss, adapter, executor, importantIds, onChunk: handleChunk });
  const totalTaps = sumTaps(room.taps);

  useEffect(() => {
    if (engine.status !== 'fighting' && engine.status !== 'defeated') return;
    void updateRoom(conn, code, {
      status: 'boss',
      boss: { summary: boss.summary, hp: engine.hp, maxHp: engine.maxHp },
    }).catch(() => undefined);
  }, [boss.summary, code, conn, engine.hp, engine.maxHp, engine.status]);

  useEffect(() => {
    if (engine.status !== 'fighting' || paused) return;
    baseline.current ??= totalTaps;
    const earned = newHits(totalTaps, baseline.current, hitsDone.current, RAID_TAPS_PER_HIT);
    for (let i = 0; i < earned; i += 1) engine.hit();
    hitsDone.current += earned;
  }, [engine, paused, totalTaps]);

  const pleaded = useRef(false);
  useEffect(() => {
    if (pleaded.current || engine.status !== 'fighting' || engine.maxHp === 0) return;
    if (engine.hp > 0 && engine.hp <= engine.maxHp / 2) {
      pleaded.current = true;
      tell(storyLines.bossPlea(boss.bossName, boss.plea));
    }
  }, [boss.bossName, boss.plea, engine.hp, engine.maxHp, engine.status, tell]);

  const done = useRef(false);
  useEffect(() => {
    if (done.current) return;
    if (engine.status === 'defeated' || engine.status === 'empty') {
      done.current = true;
      if (engine.status === 'defeated') tell(storyLines.bossDefeated(boss.epitaph));
      onDone(cleared.current);
    }
  }, [boss.epitaph, engine.status, onDone, tell]);

  const percent = engine.maxHp > 0 ? (engine.hp / engine.maxHp) * 100 : 0;

  return (
    <section aria-labelledby="raid-boss" className="card text-center">
      <h2 id="raid-boss" className="sensitive text-4xl font-black text-amber-200">
        {boss.bossName}
      </h2>
      <p className="mt-1 text-lg text-slate-300">{boss.summary}</p>
      <div className="float mt-4 flex justify-center">
        <GhostSprite seed={boss.sender} size={200} />
      </div>
      <div
        role="progressbar"
        aria-label={strings.boss.hp}
        aria-valuemin={0}
        aria-valuemax={engine.maxHp}
        aria-valuenow={engine.hp}
        aria-valuetext={strings.boss.hpValue(engine.hp, engine.maxHp)}
        className="mt-4 h-5 overflow-hidden rounded-full bg-slate-800"
      >
        <div
          className="h-full origin-left bg-gradient-to-r from-rose-500 to-amber-400 transition-transform duration-300"
          style={{ transform: `scaleX(${percent / 100})` }}
        />
      </div>
      <p className="mt-2 tabular-nums" data-testid="boss-hp">
        {strings.boss.hpValue(engine.hp, engine.maxHp)}
      </p>
      <p className="mt-4 text-2xl font-bold">{strings.raid.bossPrompt}</p>
      <p className="mt-1 tabular-nums text-slate-300">
        {strings.raid.tapsToHit(totalTaps % RAID_TAPS_PER_HIT, RAID_TAPS_PER_HIT)}
      </p>
      {engine.status === 'loading' && <p className="mt-3 text-slate-400">{strings.boss.loading}</p>}
      {engine.status === 'error' && (
        <div role="alert" className="mt-3">
          <p className="text-rose-300">{strings.boss.error}</p>
          <button type="button" className="btn btn-primary mt-2" onClick={engine.retry}>
            {strings.boss.retry}
          </button>
        </div>
      )}
    </section>
  );
}

interface RaidVoteStageProps {
  ghost: GhostSpec;
  voteId: string;
  executor: RunExecutor;
  conn: RaidConnection;
  code: string;
  room: RoomState;
  onDone: () => void;
}

/** @internal Exported for tests. */
export function RaidVoteStage({ ghost, voteId, executor, conn, code, room, onDone }: RaidVoteStageProps) {
  const announce = useAnnounce();
  const [result, setResult] = useState<string | null>(null);
  // The vote must run exactly once per stage, so the timer reads the latest props through a ref.
  const latest = useRef({ ghost, voteId, executor, conn, code, room, onDone, announce });
  useEffect(() => {
    latest.current = { ghost, voteId, executor, conn, code, room, onDone, announce };
  });

  useEffect(() => {
    let active = true;
    const start = latest.current;
    void updateRoom(start.conn, start.code, {
      status: 'vote',
      vote: { id: start.voteId, summary: start.ghost.summary, endsAt: Date.now() + RAID_VOTE_MS },
    }).catch(() => undefined);

    const timer = setTimeout(() => {
      const now = latest.current;
      const tally = tallyVotes(now.room.votes?.[now.voteId]);
      const text = strings.raid.voteResult(tally.banish, tally.keep, tally.winner);
      setResult(text);
      now.announce(text);
      void updateRoom(now.conn, now.code, { lastResult: text }).catch(() => undefined);
      now.executor
        .apply(now.ghost.isImportant ? 'keep' : tally.winner, [now.ghost.email.id])
        .catch(() => undefined)
        .finally(() => {
          if (active) setTimeout(() => latest.current.onDone(), RAID_VOTE_GRACE_MS * 3);
        });
    }, RAID_VOTE_MS + RAID_VOTE_GRACE_MS);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, []);

  const live = tallyVotes(room.votes?.[voteId]);
  return (
    <section aria-labelledby="vote-heading" className="card text-center">
      <h2 id="vote-heading" className="text-4xl font-black">
        {strings.raid.voteHeading}
      </h2>
      <p className="mt-2 text-xl text-slate-200">{ghost.summary}</p>
      <p className="sensitive mt-1 text-slate-400">{ghost.email.subject}</p>
      <p className="mt-4 text-3xl font-bold tabular-nums">
        <span className="text-rose-300">
          {strings.raid.voteBanish} {live.banish}
        </span>
        {' · '}
        <span className="text-emerald-300">
          {strings.raid.voteKeep} {live.keep}
        </span>
      </p>
      {result && (
        <p role="status" className="mt-3 text-lg text-amber-200">
          {result}
        </p>
      )}
    </section>
  );
}

/** @internal Exported for tests. */
export function SoulsStage({
  ghosts,
  executor,
  conn,
  code,
  onDone,
}: {
  ghosts: GhostSpec[];
  executor: RunExecutor;
  conn: RaidConnection;
  code: string;
  onDone: () => void;
}) {
  useEffect(() => {
    void updateRoom(conn, code, { status: 'souls' }).catch(() => undefined);
  }, [code, conn]);
  return (
    <div>
      <p className="mb-3 text-center text-slate-300">{strings.raid.soulsHost}</p>
      <GhostWave ghosts={ghosts} mode="souls" executor={executor} onDecision={() => undefined} onComplete={onDone} />
    </div>
  );
}
