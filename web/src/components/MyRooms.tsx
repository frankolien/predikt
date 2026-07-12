import { useEffect, useState } from "react";
import { ArrowRight, Users, Loader2 } from "lucide-react";
import { api, type FixtureSummary, type PointsPool } from "../lib/api";
import { Card, Eyebrow, Crest } from "./ui";
import { usdt } from "../lib/format";
import { useApp } from "../context";
import { payBuyInFor } from "../lib/custody";

/** Map a pool's status to a compact chip. */
function statusChip(status: PointsPool["status"]) {
  if (status === "settled") return { label: "FT", cls: "text-faint border-edge-2" };
  if (status === "locked") return { label: "LIVE", cls: "text-live border-live/40" };
  return { label: "OPEN", cls: "text-steel border-edge-2" };
}

function friendly(msg: string): string {
  const m = (msg || "").toLowerCase();
  if (m.includes("usdt_gas_shortfall")) return msg.split("|").slice(1).join("|").trim() || "Add a little USD₮ to cover network gas, then try again.";
  if (m.includes("not found") || m.includes("no pool")) return "No pool with that code.";
  if (m.includes("locked")) return "That tie has kicked off — calls are closed.";
  if (m.includes("sign in")) return "Sign in first.";
  return "Couldn't join — check the code.";
}

/**
 * Every pool you're in, across all matches — so you're never limited to the one
 * tie you happen to be looking at. Jump into any room, or drop an invite code to
 * join another from anywhere.
 */
export function MyRooms({
  fixtures,
  currentFixtureId,
  refreshKey,
  onOpen,
}: {
  fixtures: FixtureSummary[];
  currentFixtureId?: string;
  refreshKey?: number;
  onOpen: (fixtureId: string) => void;
}) {
  const { health, account } = useApp();
  const [pools, setPools] = useState<PointsPool[] | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api.pools
      .mine()
      .then((r) => setPools(r.pools))
      .catch(() => setPools([]));
  }, [refreshKey]);

  const join = async () => {
    const c = code.trim();
    if (!c) return;
    setBusy(true);
    setErr(null);
    try {
      // Resolve first so we can check membership + pay a USD₮ buy-in (client-signed)
      // only when we know the join will take — the treasury can't refund a no-op join.
      let pool = await api.pools.byCode(c);
      if (!pool.members?.some((m) => m.userId === account?.id)) {
        const depositTx = await payBuyInFor(health, pool.currency, pool.buyIn);
        pool = (await api.pools.join({ code: c, prediction: { homeGoals: 1, awayGoals: 1 }, depositTx })).pool;
      }
      setCode("");
      onOpen(pool.fixtureId); // land on that tie — you can dial in your call there
    } catch (e) {
      setErr(friendly((e as Error).message));
    } finally {
      setBusy(false);
    }
  };

  // Open/live first, settled last; most recent within each.
  const sorted = (pools ?? []).slice().sort((a, b) => {
    const rank = (p: PointsPool) => (p.status === "settled" ? 2 : p.status === "locked" ? 0 : 1);
    return rank(a) - rank(b);
  });

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <Eyebrow>your rooms</Eyebrow>
        {pools && pools.length > 0 && (
          <span className="label-mono">{pools.length} joined</span>
        )}
      </div>

      {pools === null ? (
        <p className="mt-3 flex items-center gap-2 font-mono text-[11px] text-steel">
          <Loader2 size={12} className="animate-spin" /> loading…
        </p>
      ) : sorted.length === 0 ? (
        <p className="mt-3 text-[12.5px] leading-relaxed text-steel">
          You're not in any rooms yet — call a tie above, or drop an invite code below to join a friend's.
        </p>
      ) : (
        <div className="mt-3 flex flex-col gap-2">
          {sorted.map((p) => {
            const fx = fixtures.find((f) => f.id === p.fixtureId);
            const chip = statusChip(p.status);
            const unit = p.currency === "usdt" ? "USD₮" : "pts";
            const here = p.fixtureId === currentFixtureId;
            return (
              <button
                key={p.id}
                onClick={() => onOpen(p.fixtureId)}
                className={`group flex items-center justify-between rounded-default border px-3 py-2.5 text-left transition-colors ${
                  here ? "border-edge-3 bg-white/[0.03]" : "border-edge-2 hover:border-edge-3 hover:bg-white/[0.02]"
                }`}
              >
                <span className="min-w-0">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-[13.5px] font-medium text-chalk">{p.name}</span>
                    <span className={`shrink-0 rounded-chip border px-1.5 py-px font-mono text-[8px] uppercase tracking-[0.12em] ${chip.cls}`}>
                      {chip.label}
                    </span>
                  </span>
                  <span className="mt-1 flex items-center gap-1.5 font-mono text-[10px] text-faint">
                    {fx && (
                      <>
                        <Crest team={fx.home} size={13} />
                        <span className="text-steel">{fx.home.code}</span>
                        <span>v</span>
                        <Crest team={fx.away} size={13} />
                        <span className="text-steel">{fx.away.code}</span>
                        <span className="text-edge-3">·</span>
                      </>
                    )}
                    <Users size={9} /> {p.memberCount} · {usdt(p.potPoints, p.currency === "usdt" ? 2 : 0)} {unit} pot
                  </span>
                </span>
                <ArrowRight size={14} className="ml-2 shrink-0 text-steel transition-colors group-hover:text-chalk" />
              </button>
            );
          })}
        </div>
      )}

      {/* Join another room from anywhere — even while you're already in one. */}
      <div className="mt-4 border-t border-edge pt-4">
        <Eyebrow className="mb-2">join another room</Eyebrow>
        <div className="flex gap-2">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === "Enter" && code.trim() && join()}
            placeholder="GAF-XXXX"
            className="flex-1 rounded-default border border-edge-2 bg-panel-2 px-3 py-2 font-mono text-[13px] uppercase tracking-wider text-chalk placeholder:text-faint focus:border-edge-3 focus:outline-none"
          />
          <button
            onClick={join}
            disabled={busy || !code.trim()}
            className="flex items-center gap-1.5 rounded-default border border-edge-2 px-3 py-2 font-mono text-[11px] uppercase tracking-[0.1em] text-chalk hover:border-edge-3 disabled:opacity-40"
          >
            {busy ? <Loader2 size={13} className="animate-spin" /> : <>Join <ArrowRight size={13} /></>}
          </button>
        </div>
        {err && <p className="mt-2 font-mono text-[11px] text-steel">{err}</p>}
      </div>
    </Card>
  );
}
