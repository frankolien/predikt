import { useState } from "react";
import { Trophy, Loader2 } from "lucide-react";
import { Card, Eyebrow, Button } from "../ui";
import { api, type Tournament } from "../../lib/api";

const SIZES = [4, 8, 16] as const;
const SPLITS: Array<{ key: string; label: string; bps: number[]; blurb: string }> = [
  { key: "wta", label: "Winner takes all", bps: [10000], blurb: "champion takes the whole pot" },
  { key: "top2", label: "70 · 30", bps: [7000, 3000], blurb: "champion + runner-up" },
  { key: "top3", label: "60 · 25 · 15", bps: [6000, 2500, 1500], blurb: "champion, runner-up, semis" },
];

export function CreateCup({ onCreated }: { onCreated: (t: Tournament) => void }) {
  const [name, setName] = useState("");
  const [size, setSize] = useState<number>(8);
  const [fee, setFee] = useState<number>(50);
  const [currency, setCurrency] = useState<"points" | "usdt">("points");
  const [split, setSplit] = useState(SPLITS[0]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const unit = currency === "usdt" ? "USD₮" : "pts";
  const rounds = Math.round(Math.log2(size));
  const create = async () => {
    setBusy(true);
    setErr(null);
    try {
      const t = await api.tournaments.create({
        name: name.trim() || "Knockout Cup",
        maxPlayers: size,
        entryFee: Math.max(0, Number(fee) || 0),
        currency,
        splitBps: split.bps,
      });
      onCreated(t);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="p-5">
      <div className="flex items-center gap-2">
        <Trophy size={15} className="text-chalk" />
        <Eyebrow>run a cup</Eyebrow>
      </div>
      <h3 className="mt-2 font-display text-[20px] font-semibold text-chalk">New knockout</h3>

      <div className="mt-4 flex flex-col gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-faint">cup name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
            placeholder="e.g. Office Champions League"
            className="rounded-default border border-edge-2 bg-panel-2 px-3 py-2.5 text-[14px] text-chalk placeholder:text-faint focus:border-edge-3 focus:outline-none"
          />
        </label>

        <div className="flex flex-col gap-1.5">
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-faint">bracket size</span>
          <div className="flex gap-1.5">
            {SIZES.map((s) => (
              <Seg key={s} active={size === s} onClick={() => setSize(s)}>
                {s} teams
              </Seg>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-faint">stakes</span>
          <div className="flex gap-1.5">
            <Seg active={currency === "points"} onClick={() => { setCurrency("points"); setFee(50); }}>
              Free · points
            </Seg>
            <Seg active={currency === "usdt"} onClick={() => { setCurrency("usdt"); setFee(5); }}>
              Real · USD₮
            </Seg>
          </div>
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-faint">entry fee · {unit}</span>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={0}
              step={currency === "usdt" ? 0.5 : 1}
              value={fee}
              onChange={(e) => setFee(Number(e.target.value))}
              className="w-28 rounded-default border border-edge-2 bg-panel-2 px-3 py-2.5 font-mono text-[14px] text-chalk focus:border-edge-3 focus:outline-none"
            />
            <span className="font-mono text-[11px] text-steel">
              {fee > 0
                ? `pot at full field = ${fee * size} ${unit}`
                : currency === "usdt"
                  ? "set a USD₮ entry"
                  : "free cup — add entrants yourself"}
            </span>
          </div>
          {currency === "usdt" && (
            <span className="font-mono text-[10.5px] text-faint">
              Real USD₮ — players pay from their wallet into escrow; the pot auto-pays winners on-chain.
            </span>
          )}
        </label>

        <div className="flex flex-col gap-1.5">
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-faint">prize split</span>
          <div className="flex flex-wrap gap-1.5">
            {SPLITS.map((s) => (
              <Seg key={s.key} active={split.key === s.key} onClick={() => setSplit(s)}>
                {s.label}
              </Seg>
            ))}
          </div>
          <span className="font-mono text-[10.5px] text-faint">{split.blurb}</span>
        </div>

        <div className="flex items-center justify-between border-t border-edge pt-3">
          <span className="font-mono text-[11px] text-steel">
            {size} teams · {rounds} rounds · single elimination
          </span>
          <Button variant="solid" onClick={create} disabled={busy}>
            {busy ? <Loader2 size={13} className="animate-spin" /> : <Trophy size={13} />}
            {busy ? "Creating…" : "Create cup"}
          </Button>
        </div>
        {err && <p className="font-mono text-[11px] text-steel">{err}</p>}
      </div>
    </Card>
  );
}

function Seg({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-default border px-3 py-1.5 font-mono text-[11px] transition-colors ${
        active ? "border-edge-3 bg-white/[0.04] text-chalk" : "border-edge-2 text-steel hover:border-edge-3 hover:text-chalk"
      }`}
    >
      {children}
    </button>
  );
}
