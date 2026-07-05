import { useState } from "react";
import { Copy, Check, Lock, Share2 } from "lucide-react";
import type { FixtureSummary, PointsPool } from "../lib/api";
import { Card, Eyebrow, Pill } from "./ui";
import { impliedReturn, oddsLabel, outcomeText, usdt } from "../lib/format";

/** Your locked call in a pool — with the shareable invite code + live potential. */
export function MyPoolCard({
  pool,
  fixture,
  meId,
}: {
  pool: PointsPool;
  fixture: FixtureSummary | null;
  meId: string;
}) {
  const me = pool.members.find((m) => m.userId === meId);
  const [copied, setCopied] = useState(false);
  const settled = pool.status === "settled";

  const copy = () => {
    navigator.clipboard?.writeText(pool.code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  const proj =
    me && !settled
      ? impliedReturn(pool.members, me.staked, pool.potPoints, me.prediction.homeGoals, me.prediction.awayGoals, false)
      : null;

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
            staked {usdt(me?.staked, 0)} pts · {pool.memberCount} in · pot {usdt(pool.potPoints, 0)}
          </span>
        </div>
      </div>

      {settled ? (
        <div className="mt-3 border-t border-edge pt-3">
          {me?.won ? (
            <Pill strong className="!border-live !text-live">
              won +{usdt(me.winnings, 0)} pts{me.exact ? " · exact score" : ""}
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
            ≈ {usdt(proj.payout, 0)} pts <span className="text-steel">· {oddsLabel(proj.multiple)}</span>
          </span>
        </div>
      ) : null}

      {!settled && (
        <p className="mt-3 flex items-center gap-1.5 text-[12px] text-steel">
          <Share2 size={11} /> Share <span className="font-mono text-silver">{pool.code}</span> — mates join, predict, and
          you watch it live together.
        </p>
      )}
    </Card>
  );
}
