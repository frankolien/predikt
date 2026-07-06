import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, streamFixtures, aiLive, type FixtureSummary, type PointsPool } from "../lib/api";
import { useApp } from "../context";
import { BootScreen } from "../components/BootScreen";
import { FixtureRail } from "../components/FixtureRail";
import { Scorebug } from "../components/Scorebug";
import { LiveReaction } from "../components/LiveReaction";
import { LiveSimControls } from "../components/LiveSimControls";
import { GafferPanel } from "../components/GafferPanel";
import { PoolHub } from "../components/PoolHub";
import { MyPoolCard } from "../components/MyPoolCard";
import { PoolStandings } from "../components/PoolStandings";
import { Leaderboard } from "../components/Leaderboard";
import { Onboard } from "../components/Onboard";
import { VoiceAsk } from "../components/VoiceAsk";
import { useVoiceStatus } from "../lib/useVoice";
import { Card, Eyebrow } from "../components/ui";
import { Lock } from "lucide-react";

export default function Room() {
  const { health, account, refreshAccount } = useApp();
  const { fixtureId } = useParams();
  const navigate = useNavigate();
  const voiceStatus = useVoiceStatus();

  const [fixtures, setFixtures] = useState<FixtureSummary[]>([]);
  const [activePool, setActivePool] = useState<PointsPool | null>(null);
  const [prefill, setPrefill] = useState<{ homeGoals: number; awayGoals: number } | null>(null);
  const [lbKey, setLbKey] = useState(0);

  const ready = !!health; // server reachable — the points product doesn't need the chain
  const showAi = aiLive(health?.ai); // hide the on-device pundit widgets when the backend is scripted

  const refreshFixtures = useCallback(() => {
    api.fixtures().then(setFixtures).catch(() => {});
  }, []);

  // Fixtures: initial fetch + real-time push + slow reconciliation poll.
  useEffect(() => {
    if (!ready) return;
    refreshFixtures();
    const stop = streamFixtures((incoming) => {
      setFixtures((prev) => {
        if (prev.length === 0) return incoming;
        const byId = new Map(prev.map((f) => [f.id, f]));
        for (const f of incoming) byId.set(f.id, f);
        return [...byId.values()];
      });
    });
    const id = setInterval(refreshFixtures, 30000);
    return () => {
      stop();
      clearInterval(id);
    };
  }, [ready, refreshFixtures]);

  // Default to the soonest fixture when none is selected.
  useEffect(() => {
    if (ready && !fixtureId && fixtures[0]) navigate(`/room/${fixtures[0].id}`, { replace: true });
  }, [ready, fixtureId, fixtures, navigate]);

  const fixture = fixtures.find((f) => f.id === fixtureId) ?? null;
  const scoreKey = fixture?.result ? `${fixture.result.homeGoals}-${fixture.result.awayGoals}` : "0-0";
  const isLive = fixture?.isLive || fixture?.matchStatus === "live";
  const canJoin = fixture?.matchStatus === "scheduled" || (!fixture?.matchStatus && fixture?.status === "scheduled");

  // The pool I'm in for this fixture (if any).
  const reloadPool = useCallback(() => {
    if (!account || !fixtureId) {
      setActivePool(null);
      return;
    }
    api.pools
      .mine()
      .then((r) => setActivePool(r.pools.find((p) => p.fixtureId === fixtureId) ?? null))
      .catch(() => {});
  }, [account, fixtureId]);
  useEffect(() => reloadPool(), [reloadPool]);

  // Keep an active, unsettled pool fresh for live standings + auto-settle payout.
  useEffect(() => {
    if (!activePool || activePool.status === "settled") return;
    const id = setInterval(() => {
      api.pools
        .get(activePool.id)
        .then((p) => {
          setActivePool(p);
          if (p.status === "settled") {
            refreshAccount();
            setLbKey((k) => k + 1);
          }
        })
        .catch(() => {});
    }, 8000);
    return () => clearInterval(id);
  }, [activePool?.id, activePool?.status, refreshAccount]);

  // Refetch standings the moment the live score changes.
  useEffect(() => {
    if (activePool && activePool.status !== "settled")
      api.pools.get(activePool.id).then(setActivePool).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scoreKey]);

  const onEntered = (pool: PointsPool) => {
    setActivePool(pool);
    refreshAccount();
    setLbKey((k) => k + 1);
  };

  if (!ready) return <BootScreen health={health} />;

  return (
    <main className="mx-auto max-w-[1180px] px-6 pb-24 pt-24">
      <div className="mb-5 flex items-end justify-between">
        <div>
          <Eyebrow className="mb-1.5">live fixtures · world cup 2026</Eyebrow>
          <h1 className="font-display text-[28px] font-semibold text-chalk">Pick a tie, call it, play your mates</h1>
        </div>
        <span className="hidden label-mono sm:block">free to play · points</span>
      </div>

      <FixtureRail
        fixtures={fixtures}
        selected={fixtureId ?? ""}
        onSelect={(id) => {
          setPrefill(null);
          navigate(`/room/${id}`);
        }}
      />

      {fixture && health?.mode === "local" && <LiveSimControls fixture={fixture} onChanged={refreshFixtures} />}

      <div className="mt-6 grid gap-5 lg:grid-cols-[1.05fr_0.95fr]">
        <div className="space-y-5">
          {fixture && <Scorebug fixture={fixture} />}
          {fixture && isLive && showAi && <LiveReaction fixtureId={fixture.id} scoreKey={scoreKey} />}
          {activePool && <PoolStandings pool={activePool} fixture={fixture} meId={account?.id} />}
          <Leaderboard meId={account?.id} refreshKey={lbKey} />
        </div>

        <div className="space-y-5">
          {!account && <Onboard />}
          {showAi && fixture && fixtureId && (
            <GafferPanel
              key={fixtureId}
              fixtureId={fixtureId}
              ai={health?.ai}
              onUsePick={setPrefill}
              voiceReady={voiceStatus?.tts === "ready"}
            />
          )}
          {account &&
            fixture &&
            (activePool ? (
              <MyPoolCard pool={activePool} fixture={fixture} meId={account.id} />
            ) : canJoin ? (
              <PoolHub fixture={fixture} prefill={prefill} onEntered={onEntered} />
            ) : (
              <Card className="p-5">
                <Eyebrow className="mb-2 flex items-center gap-2">
                  <Lock size={12} className="text-steel" /> calls closed
                </Eyebrow>
                <p className="text-[13.5px] leading-relaxed text-silver">
                  This tie has kicked off — calls lock at kick-off so nobody predicts once the ball is rolling. Pick an
                  upcoming fixture above to make yours.
                </p>
              </Card>
            ))}
          {showAi && fixtureId && <VoiceAsk fixtureId={fixtureId} status={voiceStatus} />}
        </div>
      </div>
    </main>
  );
}
