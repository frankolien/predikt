import type { FixtureSummary } from "../lib/api";
import { cn } from "../lib/cn";
import { usdt } from "../lib/format";
import { Crest, LiveDot } from "./ui";

export function FixtureRail({
  fixtures,
  selected,
  onSelect,
}: {
  fixtures: FixtureSummary[];
  selected: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
      {fixtures.slice(0, 8).map((f) => {
        const active = f.id === selected;
        const live = f.isLive || f.matchStatus === "live";
        return (
          <button
            key={f.id}
            onClick={() => onSelect(f.id)}
            className={cn(
              "group flex flex-col gap-2 rounded-lg border px-3 py-3 text-left transition-all",
              active ? "border-edge-3 bg-white/[0.05]" : "border-edge bg-panel/40 hover:border-edge-2",
            )}
          >
            <div className="flex items-center justify-between">
              <span className="label-mono !text-[9px]">{f.stage?.slice(0, 12) || f.id}</span>
              {live ? (
                <span className="flex items-center gap-1">
                  <LiveDot />
                  <span className="font-mono text-[9px] font-semibold uppercase tracking-wide text-live">live</span>
                </span>
              ) : f.matchStatus === "finished" ? (
                <span className="label-mono !text-[9px] !text-steel">FT</span>
              ) : f.poolExists ? (
                <span className="label-mono !text-[9px] !text-silver">{usdt(f.stake * f.playerCount, 0)} USDT</span>
              ) : (
                <span className="label-mono !text-[9px] !text-ghost">open</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Crest team={f.home} size={20} />
              <span className={cn("font-mono text-[13px] font-bold", active ? "text-chalk" : "text-silver")}>
                {f.home.code}
              </span>
              <span className="font-mono text-[10px] text-ghost">v</span>
              <span className={cn("font-mono text-[13px] font-bold", active ? "text-chalk" : "text-silver")}>
                {f.away.code}
              </span>
              <Crest team={f.away} size={20} />
              {f.result && (
                <span className="ml-auto font-mono text-[11px] tabular-nums text-chalk">
                  {f.result.homeGoals}:{f.result.awayGoals}
                </span>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}
