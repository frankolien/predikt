import { useState } from "react";
import { Copy, Check, Lock, Share2, Pencil, Minus, Plus, LogOut, Loader2 } from "lucide-react";
import { api, type FixtureSummary, type PointsPool } from "../lib/api";
import { Button, Card, Crest, Eyebrow, Pill } from "./ui";
import { impliedReturn, oddsLabel, outcomeText, usdt } from "../lib/format";

/** Your locked call in a pool — with the shareable invite code + live potential.
 *  While the tie hasn't kicked off you can re-call the score or leave the pool. */
export function MyPoolCard({
  pool,
  fixture,
  meId,
  onChange,
}: {
  pool: PointsPool;
  fixture: FixtureSummary | null;
  meId: string;
  onChange: (pool: PointsPool | null) => void;
}) {
  const me = pool.members.find((m) => m.userId === meId);
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [busy, setBusy] = useState<"save" | "leave" | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const settled = pool.status === "settled";

  // You can re-call or leave only while the pool is still open (before kick-off).
  const open =
    pool.status === "open" && (!pool.lockTime || Date.parse(pool.lockTime) > Date.now());

  const copy = () => {
    navigator.clipboard?.writeText(pool.code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  const save = async (home: number, away: number) => {
    setBusy("save");
    setErr(null);
    try {
      const { pool: next } = await api.pools.updatePrediction(pool.id, { homeGoals: home, awayGoals: away });
      onChange(next);
      setEditing(false);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const leave = async () => {
    setBusy("leave");
    setErr(null);
    try {
      await api.pools.leave(pool.id);
      onChange(null); // I'm out — drop back to the join hub regardless of who's left
    } catch (e) {
      setErr((e as Error).message);
      setBusy(null);
      setConfirmLeave(false);
    }
  };

  const proj =
    me && !settled
      ? impliedReturn(pool.members, me.staked, pool.potPoints, me.prediction.homeGoals, me.prediction.awayGoals, false)
      : null;
  const unit = pool.currency === "usdt" ? "USD₮" : "pts";
  const money = (n?: number | null) => usdt(n ?? 0, pool.currency === "usdt" ? 2 : 0);

  if (editing && fixture) {
    return (
      <CallEditor
        fixture={fixture}
        initial={me?.prediction ?? { homeGoals: 1, awayGoals: 1 }}
        busy={busy === "save"}
        err={err}
        onSave={save}
        onCancel={() => {
          setEditing(false);
          setErr(null);
        }}
      />
    );
  }

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <Eyebrow className="flex items-center gap-2">
          <Lock size={12} className="text-live" /> your call is in
        </Eyebrow>
        <button
          onClick={copy}
          className="flex items-center gap-1.5 rounded-default border border-edge-2 px-2 py-1 font-mono text-[11px] tracking-wide text-chalk hover:border-edge-3"
        >
          {copied ? <Check size={11} className="text-live" /> : <Copy size={11} />} {pool.code}
        </button>
      </div>

      <div className="mt-3 flex items-center gap-4">
        <div className="font-mono text-[34px] font-bold tabular-nums text-chalk">
          {me?.prediction.homeGoals}
          <span className="mx-1 text-ghost">:</span>
          {me?.prediction.awayGoals}
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-[14px] font-medium text-chalk">{pool.name}</span>
          <span className="label-mono">
            staked {money(me?.staked)} {unit} · {pool.memberCount} in · pot {money(pool.potPoints)}
          </span>
        </div>
      </div>

      {settled ? (
        <div className="mt-3 border-t border-edge pt-3">
          {me?.won ? (
            <Pill strong className="!border-live !text-live">
              won +{money(me.winnings)} {unit}{me.exact ? " · exact score" : ""}
            </Pill>
          ) : (
            <Pill>pipped — better luck next round</Pill>
          )}
        </div>
      ) : proj ? (
        <div className="mt-3 flex items-center justify-between border-t border-edge pt-3">
          <span className="text-[12.5px] text-steel">
            If {outcomeText(proj.outcome, fixture?.home.name ?? "home", fixture?.away.name ?? "away")} lands
          </span>
          <span className="font-mono text-[13px] text-live">
            ≈ {money(proj.payout)} {unit} <span className="text-steel">· {oddsLabel(proj.multiple)}</span>
          </span>
        </div>
      ) : null}

      {/* Re-call / leave — only while the tie hasn't kicked off. */}
      {open && (
        <div className="mt-4 flex items-center gap-2 border-t border-edge pt-3">
          <Button variant="outline" className="flex-1" onClick={() => setEditing(true)} disabled={!!busy}>
            <Pencil size={12} /> Change my call
          </Button>
          {confirmLeave ? (
            <button
              onClick={leave}
              disabled={!!busy}
              className="flex items-center gap-1.5 rounded-default border border-edge-2 px-3 py-2 font-mono text-[11px] uppercase tracking-[0.1em] text-chalk hover:border-edge-3 disabled:opacity-50"
            >
              {busy === "leave" ? <Loader2 size={12} className="animate-spin" /> : <LogOut size={12} />} Confirm leave
            </button>
          ) : (
            <button
              onClick={() => setConfirmLeave(true)}
              disabled={!!busy}
              className="flex items-center gap-1.5 rounded-default px-3 py-2 font-mono text-[11px] uppercase tracking-[0.1em] text-steel hover:text-chalk disabled:opacity-50"
              title="Refunds your stake and removes you from this pool"
            >
              <LogOut size={12} /> Leave
            </button>
          )}
        </div>
      )}

      {err && <p className="mt-2 font-mono text-[11px] text-steel">{err}</p>}

      {!settled && !confirmLeave && (
        <p className="mt-3 flex items-center gap-1.5 text-[12px] text-steel">
          <Share2 size={11} /> Share <span className="font-mono text-silver">{pool.code}</span> — mates join, predict, and
          you watch it live together.
        </p>
      )}
      {confirmLeave && !busy && (
        <p className="mt-2 font-mono text-[11px] text-steel">
          Leaving refunds your {money(me?.staked)} {unit} stake.{" "}
          <button onClick={() => setConfirmLeave(false)} className="text-silver underline underline-offset-2 hover:text-chalk">
            keep my spot
          </button>
        </p>
      )}
    </Card>
  );
}

/** Inline score re-caller — a compact twin of the PoolHub stepper. */
function CallEditor({
  fixture,
  initial,
  busy,
  err,
  onSave,
  onCancel,
}: {
  fixture: FixtureSummary;
  initial: { homeGoals: number; awayGoals: number };
  busy: boolean;
  err: string | null;
  onSave: (home: number, away: number) => void;
  onCancel: () => void;
}) {
  const [home, setHome] = useState(initial.homeGoals);
  const [away, setAway] = useState(initial.awayGoals);
  const pick: "HOME" | "DRAW" | "AWAY" = home > away ? "HOME" : home < away ? "AWAY" : "DRAW";

  return (
    <Card className="p-5">
      <Eyebrow className="mb-3">re-call it · your prediction</Eyebrow>
      <div className="flex items-center justify-center gap-6">
        <Side team={fixture.home} value={home} onChange={setHome} />
        <span className="font-mono text-[20px] text-ghost">:</span>
        <Side team={fixture.away} value={away} onChange={setAway} />
      </div>
      <p className="mt-3 text-center text-[12px] text-steel">
        You win on the{" "}
        <span className="text-silver">{outcomeText(pick, fixture.home.name, fixture.away.name)}</span> — exact score is a
        bonus badge.
      </p>
      <div className="mt-4 flex items-center gap-2">
        <Button variant="ghost" className="flex-1" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button variant="solid" className="flex-1" onClick={() => onSave(home, away)} disabled={busy}>
          {busy ? <Loader2 size={13} className="animate-spin" /> : "Save my call"}
        </Button>
      </div>
      {err && <p className="mt-2 font-mono text-[11px] text-steel">{err}</p>}
    </Card>
  );
}

function Side({ team, value, onChange }: { team: FixtureSummary["home"]; value: number; onChange: (v: number) => void }) {
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
