import { motion } from "motion/react";
import { Trophy } from "lucide-react";
import type { FixtureSummary, PointsPool } from "../lib/api";
import { outcomeLabel, usdt } from "../lib/format";
import { Card, Crest, Eyebrow, Pill } from "./ui";
import { cn } from "../lib/cn";

/** Live standings for a points pool — who's on track now, or who won at full time. */
export function PoolStandings({
  pool,
  fixture,
  meId,
}: {
  pool: PointsPool;
  fixture: FixtureSummary | null;
  meId?: string;
}) {
  const settled = pool.status === "settled";
  const score = pool.result ?? fixture?.result ?? null;
  const cur = score ? outcomeLabel(score.homeGoals, score.awayGoals) : null;

  const ranked = pool.members
    .map((m) => {
      const mo = outcomeLabel(m.prediction.homeGoals, m.prediction.awayGoals);
      const onTrack = cur ? mo === cur : false;
      const exact = score
        ? m.prediction.homeGoals === score.homeGoals && m.prediction.awayGoals === score.awayGoals
        : false;
      return { ...m, onTrack, exact };
    })
    .sort((a, b) =>
      settled ? (b.winnings ?? 0) - (a.winnings ?? 0) : Number(b.onTrack) - Number(a.onTrack),
    );

  const onTrackCount = ranked.filter((m) => m.onTrack).length;

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-edge px-4 py-3">
        <div className="flex items-center gap-2.5">
          {fixture && <Crest team={fixture.home} size={18} />}
          <span className="font-display text-[15px] font-semibold text-chalk">{pool.name}</span>
          {fixture && <Crest team={fixture.away} size={18} />}
        </div>
        <span className="label-mono">
          {settled ? "final" : cur ? `${onTrackCount} on track` : "picks in"}
        </span>
      </div>

      <div className="px-4 py-2">
        {ranked.map((m, i) => {
          const isMe = meId && m.userId === meId;
          return (
            <motion.div
              key={m.userId}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: i * 0.04 }}
              className={cn(
                "-mx-2 flex items-center justify-between gap-2 rounded-default px-2 py-2",
                isMe && "bg-live-soft",
              )}
            >
              <span className="flex min-w-0 items-center gap-2">
                {settled && i === 0 && (m.winnings ?? 0) > 0 && <Trophy size={13} className="text-live" />}
                <span className="truncate text-[13.5px] font-medium text-chalk">{m.handle}</span>
                {isMe && (
                  <span className="rounded-[2px] bg-live px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-wide text-void">
                    you
                  </span>
                )}
                <span className="font-mono text-[12px] tabular-nums text-steel">
                  {m.prediction.homeGoals}:{m.prediction.awayGoals}
                </span>
              </span>
              {settled ? (
                m.won ? (
                  <Pill strong className="!border-live !text-live">
                    +{usdt(m.winnings, 0)}{m.exact ? " · exact" : ""}
                  </Pill>
                ) : (
                  <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-faint">out</span>
                )
              ) : m.exact ? (
                <Pill strong className="!border-live !text-live">
                  spot on
                </Pill>
              ) : m.onTrack ? (
                <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-live">on track</span>
              ) : cur ? (
                <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-faint">trailing</span>
              ) : (
                <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-steel">in</span>
              )}
            </motion.div>
          );
        })}
      </div>

      <div className="flex items-center justify-between border-t border-edge px-4 py-2.5">
        <Eyebrow>pot</Eyebrow>
        <span className="font-mono text-[13px] text-chalk">{usdt(pool.potPoints, 0)} pts</span>
      </div>
    </Card>
  );
}
