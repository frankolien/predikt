import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { Cpu } from "lucide-react";
import { streamLiveCommentary, type FixtureSummary, type PoolView, type Wallet } from "../lib/api";
import { Card, Crest, Eyebrow, LivePill, Pill } from "./ui";
import { outcomeLabel } from "../lib/format";
import { cn } from "../lib/cn";

export function LiveTracker({
  fixture,
  pool,
  wallet,
}: {
  fixture: FixtureSummary;
  pool: PoolView | null;
  wallet: Wallet | null;
}) {
  const [text, setText] = useState("");
  const [streaming, setStreaming] = useState(false);
  const cleanup = useRef<null | (() => void)>(null);

  const score = fixture.result ?? { homeGoals: 0, awayGoals: 0 };
  const cur = outcomeLabel(score.homeGoals, score.awayGoals);

  // Live clock: seed from the server's minute, then tick locally each minute so
  // the display keeps moving between pushes. Re-syncs whenever the feed updates.
  const feedMinute = typeof fixture.minute === "number" ? fixture.minute : null;
  const [clock, setClock] = useState<number | null>(feedMinute);
  useEffect(() => {
    setClock(feedMinute);
    if (feedMinute == null) return;
    const id = setInterval(() => setClock((c) => (c == null ? c : Math.min(90, c + 1))), 60000);
    return () => clearInterval(id);
  }, [feedMinute]);
  const liveMinute = clock != null ? clock : fixture.minute ?? null;

  // Re-run the on-device reaction on mount and whenever the live score changes.
  useEffect(() => {
    setText("");
    setStreaming(true);
    cleanup.current?.();
    cleanup.current = streamLiveCommentary(fixture.id, (e) => {
      if (e.type === "reaction") setText((t) => t + e.delta);
      else if (e.type === "done" || e.type === "error") setStreaming(false);
    });
    return () => cleanup.current?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fixture.id, score.homeGoals, score.awayGoals]);

  const ranked = (pool?.entries ?? [])
    .map((e) => {
      const eo = outcomeLabel(e.prediction.homeGoals, e.prediction.awayGoals);
      return {
        ...e,
        onTrack: eo === cur,
        exact: e.prediction.homeGoals === score.homeGoals && e.prediction.awayGoals === score.awayGoals,
      };
    })
    .sort((a, b) => Number(b.onTrack) - Number(a.onTrack));

  const leaders = ranked.filter((e) => e.onTrack).length;

  return (
    <Card className="overflow-hidden">
      {/* Live strip */}
      <div className="flex items-center justify-between border-b border-edge px-4 py-2.5">
        <LivePill minute={liveMinute} />
        <span className="label-mono">{fixture.stage}</span>
      </div>

      {/* Match row — colour crests + names + big score (FotMob-clean) */}
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 border-b border-edge px-4 py-5 sm:px-5">
        <div className="flex min-w-0 items-center justify-end gap-2.5 text-right sm:gap-3">
          <span className="truncate font-display text-[15px] font-medium leading-tight text-chalk sm:text-[17px]">
            {fixture.home.name}
          </span>
          <Crest team={fixture.home} size={36} />
        </div>
        <div className="font-mono text-[32px] font-bold leading-none text-chalk tabular-nums sm:text-[36px]">
          {score.homeGoals}
          <span className="mx-1.5 text-ghost">:</span>
          {score.awayGoals}
        </div>
        <div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
          <Crest team={fixture.away} size={36} />
          <span className="truncate font-display text-[15px] font-medium leading-tight text-chalk sm:text-[17px]">
            {fixture.away.name}
          </span>
        </div>
      </div>

      {/* On-device live reaction */}
      <div className="border-b border-edge px-4 py-3.5 sm:px-5">
        <Eyebrow className="mb-1.5 flex items-center gap-2">
          <Cpu size={11} className="text-live" /> the Gaffer, reacting on-device
        </Eyebrow>
        <p className={cn("min-h-[20px] text-[14px] leading-relaxed text-silver", streaming && "caret")}>
          {text || (streaming ? "" : "…")}
        </p>
      </div>

      {/* Who's winning now */}
      <div className="px-4 py-3 sm:px-5">
        <div className="mb-1 flex items-baseline justify-between">
          <span className="text-[13px] font-medium text-chalk">Who's winning now</span>
          <span className="font-mono text-[11px] tabular-nums text-live">{leaders} on track</span>
        </div>
        {ranked.length === 0 && (
          <p className="py-1 text-[12.5px] text-steel">No stakes yet — join the pool to track your call live.</p>
        )}
        {ranked.map((e, i) => {
          const isMe = wallet && e.address.toLowerCase() === wallet.address.toLowerCase();
          return (
            <motion.div
              key={e.address}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: i * 0.04 }}
              className={cn(
                "-mx-2 flex items-center justify-between gap-2 rounded-default px-2 py-2",
                isMe && "bg-live-soft",
              )}
            >
              <span className="flex min-w-0 items-center gap-2">
                <span className="truncate text-[13.5px] font-medium text-chalk">{e.displayName}</span>
                {isMe && (
                  <span className="rounded-[2px] bg-live px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-wide text-void">
                    you
                  </span>
                )}
                <span className="font-mono text-[12px] text-steel tabular-nums">
                  {e.prediction.homeGoals}:{e.prediction.awayGoals}
                </span>
              </span>
              {e.exact ? (
                <Pill strong className="!border-live !text-live">
                  spot on
                </Pill>
              ) : e.onTrack ? (
                <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-live">on track</span>
              ) : (
                <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-faint">trailing</span>
              )}
            </motion.div>
          );
        })}
      </div>
    </Card>
  );
}
