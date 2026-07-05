import { useEffect, useState } from "react";
import { Minus, Plus, Gavel, ArrowUpRight } from "lucide-react";
import { api, type FixtureSummary, type PoolView } from "../lib/api";
import { Button, Card, Eyebrow } from "./ui";
import { shortHash } from "../lib/format";

/**
 * Result oracle. When the real feed has a full-time score it prefills here; the
 * escrow contract distributes the pot BY RULE — the oracle can only report a
 * score, never redirect funds.
 */
export function SettlePanel({
  fixture,
  pool,
  onSettled,
}: {
  fixture: FixtureSummary;
  pool: PoolView | null;
  onSettled: (p: PoolView) => void;
}) {
  const [home, setHome] = useState(fixture.result?.homeGoals ?? 1);
  const [away, setAway] = useState(fixture.result?.awayGoals ?? 0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const realScore = fixture.result;
  const finished = fixture.matchStatus === "finished";

  useEffect(() => {
    if (realScore) {
      setHome(realScore.homeGoals);
      setAway(realScore.awayGoals);
    }
  }, [realScore?.homeGoals, realScore?.awayGoals]);

  if (!pool || pool.playerCount === 0) return null;

  if (pool.status === "settled") {
    return (
      <Card className="p-4">
        <Eyebrow className="mb-1.5 flex items-center gap-2">
          <Gavel size={12} className="text-chalk" /> settled on-chain
        </Eyebrow>
        <a className="flex items-center gap-1.5 font-mono text-[11px] text-steel hover:text-chalk">
          settle tx {shortHash(pool.settleTx)} <ArrowUpRight size={11} />
        </a>
      </Card>
    );
  }

  const settle = async () => {
    setBusy(true);
    setError(null);
    try {
      onSettled(await api.settle(fixture.id, home, away));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="p-4">
      <Eyebrow className="mb-3 flex items-center gap-2">
        <Gavel size={12} className="text-chalk" />
        {finished ? "result oracle · real full-time score" : "result oracle · post full-time"}
      </Eyebrow>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <MiniStepper code={fixture.home.code} value={home} onChange={setHome} />
          <span className="font-mono text-[16px] text-ghost">:</span>
          <MiniStepper code={fixture.away.code} value={away} onChange={setAway} />
        </div>
        <Button variant="solid" onClick={settle} disabled={busy}>
          {busy ? "Settling…" : "Post result"}
        </Button>
      </div>
      <p className="mt-2.5 text-[12px] text-steel">
        {finished
          ? "The final score is in from the live feed. Settling pays every correct-outcome fan pro-rata — automatically."
          : "The contract pays every correct-outcome fan pro-rata. The oracle can’t touch the pot."}
      </p>
      {error && <p className="mt-1.5 text-[13px] text-steel">{error}</p>}
    </Card>
  );
}

function MiniStepper({ code, value, onChange }: { code: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="label-mono w-8 !text-[9px]">{code}</span>
      <button
        onClick={() => onChange(Math.max(0, value - 1))}
        className="grid h-6 w-6 place-items-center rounded-default border border-edge-2 text-silver hover:border-edge-3"
      >
        <Minus size={11} />
      </button>
      <span className="w-6 text-center font-mono text-[20px] font-bold tabular-nums text-chalk">{value}</span>
      <button
        onClick={() => onChange(Math.min(9, value + 1))}
        className="grid h-6 w-6 place-items-center rounded-default border border-edge-2 text-silver hover:border-edge-3"
      >
        <Plus size={11} />
      </button>
    </div>
  );
}
