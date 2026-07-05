import { motion } from "motion/react";
import { Users, ShieldCheck } from "lucide-react";
import type { PoolView, Wallet } from "../lib/api";
import { CountUp, Card } from "./ui";
import { shortAddr, usdt } from "../lib/format";
import { cn } from "../lib/cn";

export function PoolTable({ pool, wallet }: { pool: PoolView | null; wallet: Wallet | null }) {
  if (!pool) {
    return (
      <Card className="p-5">
        <p className="label-mono">no pool yet — be the first to call this tie</p>
      </Card>
    );
  }

  const settled = pool.status === "settled";
  return (
    <Card className="overflow-hidden">
      {/* Masthead */}
      <div className="flex items-end justify-between border-b border-edge-2 px-5 pb-3 pt-4">
        <div>
          <div className="label-mono mb-1">The Pool · escrow ledger</div>
          <div className="font-display text-[30px] font-semibold leading-none text-chalk">
            <CountUp value={pool.potHuman} dp={2} suffix=" USDT" />
          </div>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <span className="inline-flex items-center gap-1.5 font-mono text-[11px] text-silver">
            <Users size={12} /> {pool.playerCount} in
          </span>
          <span className="inline-flex items-center gap-1.5 font-mono text-[10px] text-faint">
            <ShieldCheck size={11} /> {shortAddr(pool.escrow)}
          </span>
        </div>
      </div>

      <div className="px-2 py-1">
        <div className="grid grid-cols-[1.4fr_auto_auto_auto] items-center gap-2 px-3 py-2 label-mono !text-[9px] !text-ghost">
          <span>Fan</span>
          <span className="text-center">Pick</span>
          <span className="text-right">Stake</span>
          <span className="text-right">{settled ? "Payout" : ""}</span>
        </div>

        {pool.entries.map((e, i) => {
          const isMe = wallet && e.address.toLowerCase() === wallet.address.toLowerCase();
          return (
            <motion.div
              key={e.address}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.05, duration: 0.35 }}
              className={cn(
                "grid grid-cols-[1.4fr_auto_auto_auto] items-center gap-2 border-t border-edge px-3 py-2.5",
                isMe && "bg-white/[0.04]",
              )}
            >
              <span className="flex min-w-0 items-center gap-2">
                <span className="truncate font-medium text-chalk">{e.displayName}</span>
                {isMe && (
                  <span className="rounded-[2px] bg-white px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-wide text-void">
                    you
                  </span>
                )}
                {e.isBot && !isMe && (
                  <span className="font-mono text-[9px] uppercase tracking-wide text-ghost">bot</span>
                )}
              </span>
              <span className="text-center font-mono text-[15px] font-bold tabular-nums text-silver">
                {e.prediction.homeGoals}:{e.prediction.awayGoals}
              </span>
              <span className="text-right font-mono text-[12px] text-steel">{usdt(e.stake, 0)}</span>
              <span className="text-right">
                {!settled ? (
                  <span className="text-ghost">·</span>
                ) : e.won ? (
                  <span className="font-mono text-[13px] font-bold text-chalk">
                    +{usdt(e.winnings, 2)}
                    {e.exactScore && <span className="ml-1 text-[9px] text-steel">EXACT</span>}
                  </span>
                ) : (
                  <span className="font-mono text-[12px] text-ghost">—</span>
                )}
              </span>
            </motion.div>
          );
        })}
      </div>

      {settled && pool.result && (
        <div className="flex items-center justify-between border-t border-edge-2 bg-white/[0.03] px-5 py-2.5">
          <span className="label-mono !text-silver">
            Full time · {pool.result.homeGoals}:{pool.result.awayGoals} · paid on-chain
          </span>
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-chalk">settled</span>
        </div>
      )}
    </Card>
  );
}
