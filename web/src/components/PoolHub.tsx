import { useEffect, useState } from "react";
import { Minus, Plus, Users, ArrowRight } from "lucide-react";
import { api, type FixtureSummary, type PointsPool } from "../lib/api";
import { Button, Card, Crest, Eyebrow } from "./ui";
import { impliedReturn, oddsLabel, outcomeText, usdt } from "../lib/format";
import { cn } from "../lib/cn";

const BUYINS = [25, 50, 100, 250];
const USDT_BUYINS = [1, 5, 10, 25];

function friendly(msg: string): string {
  const m = (msg || "").toLowerCase();
  if (m.includes("insufficient")) return "Not enough points for that buy-in.";
  if (m.includes("already joined")) return "You're already in that pool.";
  if (m.includes("locked")) return "That tie has kicked off — calls are closed.";
  if (m.includes("not found") || m.includes("no pool")) return "No pool with that code.";
  return "Couldn't do that — try again.";
}

function Stepper({ team, value, onChange }: { team: FixtureSummary["home"]; value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="flex items-center gap-2">
        <Crest team={team} size={26} />
        <span className="font-mono text-[11px] font-semibold text-silver">{team.code}</span>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={() => onChange(Math.max(0, value - 1))}
          className="grid h-7 w-7 place-items-center rounded-default border border-edge-2 text-silver hover:border-edge-3 hover:text-chalk"
        >
          <Minus size={13} />
        </button>
        <span className="w-8 text-center font-mono text-[28px] font-bold tabular-nums text-chalk">{value}</span>
        <button
          onClick={() => onChange(Math.min(9, value + 1))}
          className="grid h-7 w-7 place-items-center rounded-default border border-edge-2 text-silver hover:border-edge-3 hover:text-chalk"
        >
          <Plus size={13} />
        </button>
      </div>
    </div>
  );
}

/** Entry hub for a fixture: pick your score once, then stake it in a friend's pool,
 *  a public pool, or one you start. */
export function PoolHub({
  fixture,
  prefill,
  onEntered,
}: {
  fixture: FixtureSummary;
  prefill?: { homeGoals: number; awayGoals: number } | null;
  onEntered: (pool: PointsPool) => void;
}) {
  const [home, setHome] = useState(1);
  const [away, setAway] = useState(1);

  useEffect(() => {
    if (prefill) {
      setHome(prefill.homeGoals);
      setAway(prefill.awayGoals);
    }
  }, [prefill]);
  const [publicPools, setPublicPools] = useState<PointsPool[]>([]);
  const [name, setName] = useState("");
  const [buyIn, setBuyIn] = useState(50);
  const [currency, setCurrency] = useState<"points" | "usdt">("points");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const unit = currency === "usdt" ? "USD₮" : "pts";

  useEffect(() => {
    api.pools.forFixture(fixture.id).then((r) => setPublicPools(r.pools)).catch(() => {});
  }, [fixture.id]);

  const prediction = { homeGoals: home, awayGoals: away };

  const wrap = async (fn: () => Promise<PointsPool>) => {
    setBusy(true);
    setError(null);
    try {
      onEntered(await fn());
    } catch (e) {
      setError(friendly((e as Error).message));
    } finally {
      setBusy(false);
    }
  };
  const createAndJoin = () =>
    wrap(async () => {
      const pool = await api.pools.create(fixture.id, { name: name.trim() || undefined, buyIn, isPublic: true, currency });
      return (await api.pools.join({ poolId: pool.id, prediction })).pool;
    });
  const joinByCode = () => wrap(async () => (await api.pools.join({ code: code.trim(), prediction })).pool);
  const joinPublic = (p: PointsPool) => wrap(async () => (await api.pools.join({ poolId: p.id, prediction })).pool);

  return (
    <Card className="p-5">
      <Eyebrow className="mb-3">call it · your prediction</Eyebrow>
      <div className="flex items-center justify-center gap-6">
        <Stepper team={fixture.home} value={home} onChange={setHome} />
        <span className="font-mono text-[20px] text-ghost">:</span>
        <Stepper team={fixture.away} value={away} onChange={setAway} />
      </div>
      <p className="mt-3 text-center text-[12px] text-steel">
        You win on the <span className="text-silver">{outcomeText(outcome(prediction), fixture.home.name, fixture.away.name)}</span> —
        exact score is a bonus badge. Now stake it:
      </p>

      {/* Public pools to join */}
      {publicPools.length > 0 && (
        <div className="mt-4 space-y-2">
          <Eyebrow>open pools</Eyebrow>
          {publicPools.slice(0, 4).map((p) => {
            const proj = impliedReturn(p.members, p.buyIn, p.potPoints, home, away, true);
            return (
              <button
                key={p.id}
                onClick={() => joinPublic(p)}
                disabled={busy}
                className="flex w-full items-center justify-between rounded-default border border-edge bg-panel-2 px-3 py-2.5 text-left hover:border-edge-2 disabled:opacity-50"
              >
                <span className="min-w-0">
                  <span className="block truncate text-[13.5px] font-medium text-chalk">{p.name}</span>
                  <span className="label-mono !text-[9px]">
                    <Users size={9} className="inline" /> {p.memberCount} in · {usdt(p.potPoints, 0)} {p.currency === "usdt" ? "USD₮" : "pts"} pot · {p.buyIn} buy-in
                  </span>
                </span>
                <span className="ml-2 shrink-0 text-right">
                  <span className="block font-mono text-[12px] text-live">{oddsLabel(proj.multiple)}</span>
                  <span className="label-mono !text-[8px]">join</span>
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Start your own */}
      <div className="mt-4 border-t border-edge pt-4">
        <Eyebrow className="mb-2">start your own</Eyebrow>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={40}
          placeholder="Pool name (e.g. The Office)"
          className="mb-2 w-full rounded-default border border-edge-2 bg-panel-2 px-3 py-2 text-[13.5px] text-chalk placeholder:text-faint focus:border-edge-3 focus:outline-none"
        />
        <div className="mb-2 flex items-center gap-1.5">
          <button
            onClick={() => { setCurrency("points"); setBuyIn(50); }}
            className={cn("rounded-default border px-2.5 py-1 font-mono text-[10px]", currency === "points" ? "border-edge-3 bg-white/[0.04] text-chalk" : "border-edge-2 text-steel hover:border-edge-3")}
          >
            Free · points
          </button>
          <button
            onClick={() => { setCurrency("usdt"); setBuyIn(5); }}
            className={cn("rounded-default border px-2.5 py-1 font-mono text-[10px]", currency === "usdt" ? "border-edge-3 bg-white/[0.04] text-chalk" : "border-edge-2 text-steel hover:border-edge-3")}
          >
            Real · USD₮
          </button>
        </div>
        <div className="mb-2 flex items-center gap-1.5">
          <span className="label-mono mr-1">buy-in · {unit}</span>
          {(currency === "usdt" ? USDT_BUYINS : BUYINS).map((b) => (
            <button
              key={b}
              onClick={() => setBuyIn(b)}
              className={cn(
                "rounded-default border px-2.5 py-1 font-mono text-[11px]",
                buyIn === b ? "border-live text-live" : "border-edge-2 text-steel hover:border-edge-3",
              )}
            >
              {b}
            </button>
          ))}
        </div>
        <Button variant="solid" className="w-full" onClick={createAndJoin} disabled={busy}>
          {busy ? "…" : (<>Create pool & call it</>)}
        </Button>
      </div>

      {/* Join by code */}
      <div className="mt-4 border-t border-edge pt-4">
        <Eyebrow className="mb-2">have an invite code?</Eyebrow>
        <div className="flex gap-2">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === "Enter" && code.trim() && joinByCode()}
            placeholder="GAF-XXXX"
            className="flex-1 rounded-default border border-edge-2 bg-panel-2 px-3 py-2 font-mono text-[13px] uppercase tracking-wider text-chalk placeholder:text-faint focus:border-edge-3 focus:outline-none"
          />
          <Button variant="outline" onClick={joinByCode} disabled={busy || !code.trim()}>
            Join <ArrowRight size={13} />
          </Button>
        </div>
      </div>

      {error && <p className="mt-3 text-[12.5px] text-steel">{error}</p>}
    </Card>
  );
}

function outcome(p: { homeGoals: number; awayGoals: number }): "HOME" | "DRAW" | "AWAY" {
  if (p.homeGoals > p.awayGoals) return "HOME";
  if (p.homeGoals < p.awayGoals) return "AWAY";
  return "DRAW";
}
