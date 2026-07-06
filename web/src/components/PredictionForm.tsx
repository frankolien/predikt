import { useEffect, useState } from "react";
import { Minus, Plus, Lock, ArrowUpRight } from "lucide-react";
import { api, type FixtureSummary, type PoolView, type Wallet } from "../lib/api";
import { Button, Card, Crest, Eyebrow, Pill } from "./ui";
import { impliedReturn, oddsLabel, outcomeText, shortHash, usdt } from "../lib/format";

/** Turn a raw API/contract error into a short, human line. */
function friendlyError(msg: string): string {
  const m = (msg || "").toLowerCase();
  if (m.includes("unknown fan wallet") || m.includes("warming up")) return "Unlock your wallet with your PIN to stake real USD₮.";
  if (m.includes("locked")) return "This tie has kicked off — predictions are closed.";
  if (m.includes("already joined") || m.includes("already")) return "This wallet has already called this tie.";
  if (m.includes("insufficient") || m.includes("balance")) return "Not enough USDT in this wallet for the buy-in.";
  if (m.includes("settled")) return "This pool has already settled.";
  return "Couldn't place that stake — try again in a moment.";
}

function Stepper({
  team,
  value,
  onChange,
  disabled,
}: {
  team: FixtureSummary["home"];
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="flex items-center gap-2">
        <Crest team={team} size={28} />
        <span className="font-mono text-[11px] font-semibold text-silver">{team.code}</span>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={() => onChange(Math.max(0, value - 1))}
          disabled={disabled || value <= 0}
          className="grid h-7 w-7 place-items-center rounded-default border border-edge-2 text-silver hover:border-edge-3 hover:text-chalk disabled:opacity-30"
        >
          <Minus size={13} />
        </button>
        <span className="w-9 text-center font-mono text-[30px] font-bold tabular-nums text-chalk">{value}</span>
        <button
          onClick={() => onChange(Math.min(9, value + 1))}
          disabled={disabled}
          className="grid h-7 w-7 place-items-center rounded-default border border-edge-2 text-silver hover:border-edge-3 hover:text-chalk disabled:opacity-30"
        >
          <Plus size={13} />
        </button>
      </div>
    </div>
  );
}

export function PredictionForm({
  fixture,
  pool,
  wallet,
  prefill,
  onJoined,
}: {
  fixture: FixtureSummary;
  pool: PoolView | null;
  wallet: Wallet | null;
  prefill: { homeGoals: number; awayGoals: number } | null;
  onJoined: (p: PoolView) => void;
}) {
  const [home, setHome] = useState(1);
  const [away, setAway] = useState(1);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (prefill) {
      setHome(prefill.homeGoals);
      setAway(prefill.awayGoals);
    }
  }, [prefill]);

  const myEntry = pool?.entries.find(
    (e) => wallet && e.address.toLowerCase() === wallet.address.toLowerCase(),
  );
  const stake = pool?.stake ?? fixture.stake;
  const settled = pool?.status === "settled";

  // The on-chain pool locks at kick-off — so once a tie is live/finished (or its
  // scheduled kickoff has passed) no new calls are possible. Gate the UI on that
  // instead of letting a doomed stake revert with a raw "pool locked" error.
  const kickoffMs = Date.parse(fixture.kickoff);
  const kickedOff =
    fixture.matchStatus === "live" ||
    fixture.matchStatus === "finished" ||
    (Number.isFinite(kickoffMs) && kickoffMs <= Date.now());
  const locked = settled || kickedOff;

  // Pari-mutuel projection for the pick currently on the steppers (recomputes as
  // you change the score / as fans join). Indicative, not a fixed odds quote.
  const proj = impliedReturn(pool?.entries ?? [], stake, pool?.potHuman ?? 0, home, away, true);

  const join = async () => {
    if (!wallet) return;
    setJoining(true);
    setError(null);
    try {
      onJoined(await api.join(fixture.id, wallet.address, { homeGoals: home, awayGoals: away }, wallet.displayName));
    } catch (e) {
      setError(friendlyError((e as Error).message));
    } finally {
      setJoining(false);
    }
  };

  if (myEntry) {
    return (
      <Card className="p-5">
        <Eyebrow className="mb-2 flex items-center gap-2">
          <Lock size={12} className="text-chalk" /> your pick is locked on-chain
        </Eyebrow>
        <div className="flex items-center gap-4">
          <div className="font-mono text-[34px] font-bold tabular-nums text-chalk">
            {myEntry.prediction.homeGoals}
            <span className="mx-1 text-ghost">:</span>
            {myEntry.prediction.awayGoals}
          </div>
          <div className="flex flex-col gap-1">
            <span className="label-mono">staked {usdt(myEntry.stake, 0)} USDT · self-custodial</span>
            <TxRow label="approve" hash={myEntry.approveTx} />
            <TxRow label="deposit" hash={myEntry.depositTx} />
          </div>
        </div>
        {!settled &&
          (() => {
            const p = impliedReturn(
              pool?.entries ?? [],
              myEntry.stake,
              pool?.potHuman ?? 0,
              myEntry.prediction.homeGoals,
              myEntry.prediction.awayGoals,
              false,
            );
            return (
              <div className="mt-3 flex items-center justify-between border-t border-edge pt-3">
                <span className="text-[12.5px] text-steel">
                  If {outcomeText(p.outcome, fixture.home.name, fixture.away.name)} lands
                </span>
                <span className="font-mono text-[13px] text-live">
                  ≈ {usdt(p.payout, 2)} USDT <span className="text-steel">· {oddsLabel(p.multiple)}</span>
                </span>
              </div>
            );
          })()}
        {settled && (
          <div className="mt-3 border-t border-edge pt-3">
            {myEntry.won ? (
              <Pill strong>
                won {usdt(myEntry.winnings, 2)} USDT{myEntry.exactScore ? " · exact" : ""}
              </Pill>
            ) : (
              <Pill>pipped — better luck next round</Pill>
            )}
          </div>
        )}
      </Card>
    );
  }

  if (locked) {
    const reason = settled
      ? "This pool has settled."
      : fixture.matchStatus === "finished"
        ? "This tie has finished."
        : "This tie has kicked off.";
    return (
      <Card className="p-5">
        <Eyebrow className="mb-2 flex items-center gap-2">
          <Lock size={12} className="text-steel" /> predictions closed
        </Eyebrow>
        <p className="text-[13.5px] leading-relaxed text-silver">
          {reason} Calls lock at kick-off so nobody can predict once the ball is rolling. Pick an
          upcoming fixture above to make your call.
        </p>
      </Card>
    );
  }

  return (
    <Card className="p-5">
      <Eyebrow className="mb-3">step 3 · call it & stake</Eyebrow>
      <div className="flex items-center justify-center gap-6">
        <Stepper team={fixture.home} value={home} onChange={setHome} disabled={joining || settled} />
        <span className="font-mono text-[20px] text-ghost">:</span>
        <Stepper team={fixture.away} value={away} onChange={setAway} disabled={joining || settled} />
      </div>

      <div className="mt-4 flex items-center justify-between rounded-default border border-edge bg-panel-2 px-3 py-2">
        <span className="label-mono">buy-in</span>
        <span className="font-mono text-[15px] text-chalk">{usdt(stake, 0)} USDT</span>
      </div>

      <ReturnPanel proj={proj} home={fixture.home.name} away={fixture.away.name} />

      {wallet ? (
        <Button variant="solid" className="mt-3 w-full" onClick={join} disabled={joining || settled}>
          {joining ? (
            "Signing approve + deposit…"
          ) : settled ? (
            "Pool closed"
          ) : (
            <>
              <Lock size={13} /> Stake {usdt(stake, 0)} USDT & lock pick
            </>
          )}
        </Button>
      ) : (
        <div className="mt-3 rounded-default border border-dashed border-edge-2 px-3 py-2.5 text-center">
          <span className="label-mono">create a wallet to stake</span>
        </div>
      )}
      {joining && (
        <p className="mt-2 text-center text-[12px] text-steel">
          you sign both transactions — the escrow pulls your stake, nobody holds it for you
        </p>
      )}
      {error && <p className="mt-2 text-[13px] text-steel">{error}</p>}
    </Card>
  );
}

function ReturnPanel({
  proj,
  home,
  away,
}: {
  proj: ReturnType<typeof impliedReturn>;
  home: string;
  away: string;
}) {
  return (
    <div className="mt-3 rounded-default border border-live/30 bg-live-soft px-3.5 py-3">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-live">potential return</span>
        <span className="rounded-chip bg-live/15 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-live">
          {oddsLabel(proj.multiple)}
        </span>
      </div>
      <div className="mt-1.5 flex items-baseline gap-1.5">
        <span className="font-mono text-[24px] font-bold tabular-nums text-chalk">≈ {usdt(proj.payout, 2)}</span>
        <span className="label-mono">USDT</span>
      </div>
      <p className="mt-1.5 text-[11.5px] leading-snug text-steel">
        if <span className="text-silver">{outcomeText(proj.outcome, home, away)}</span> — the{" "}
        {proj.winners === 1 ? "sole caller takes" : `${proj.winners} callers split`} the {usdt(proj.pot, 0)} pot.
        Pari-mutuel: no house, updates as fans join. Win on the outcome; exact score is a badge.
      </p>
    </div>
  );
}

function TxRow({ label, hash }: { label: string; hash?: string }) {
  if (!hash) return null;
  return (
    <span className="flex items-center gap-1.5 font-mono text-[10px] text-faint">
      <span className="text-steel">{label}</span>
      {shortHash(hash)}
      <ArrowUpRight size={10} />
    </span>
  );
}
