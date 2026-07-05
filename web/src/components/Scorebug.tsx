import type { FixtureSummary, TeamCard } from "../lib/api";
import { kickoffLabel } from "../lib/format";
import { Crest, LivePill } from "./ui";
import { cn } from "../lib/cn";

function Form({ form }: { form: Array<"W" | "D" | "L"> }) {
  if (!form?.length) return null;
  const cls = {
    W: "bg-live/85 text-void",
    D: "border border-edge-2 text-silver",
    L: "border border-edge text-faint",
  };
  return (
    <div className="flex gap-0.5">
      {form.slice(0, 5).map((r, i) => (
        <span
          key={i}
          className={cn("grid h-3.5 w-3.5 place-items-center rounded-[1px] font-mono text-[8px] font-bold", cls[r])}
        >
          {r}
        </span>
      ))}
    </div>
  );
}

export function Scorebug({ fixture }: { fixture: FixtureSummary }) {
  const { home, away, result } = fixture;
  const live = fixture.isLive || fixture.matchStatus === "live";
  const finished = fixture.matchStatus === "finished" || fixture.status === "settled";

  return (
    <div className="overflow-hidden rounded-lg border border-edge bg-panel/50">
      <div className="flex items-center justify-between border-b border-edge px-4 py-2.5">
        <span className="label-mono truncate">
          {fixture.stage}
          {fixture.venue ? ` · ${fixture.venue}` : ""}
        </span>
        {live ? (
          <LivePill minute={fixture.minute} />
        ) : finished ? (
          <span className="label-mono !text-silver">Full time</span>
        ) : (
          <span className="label-mono">{kickoffLabel(fixture.kickoff)}</span>
        )}
      </div>

      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 px-5 py-6">
        <TeamSide team={home} align="right" />
        <div className="flex flex-col items-center">
          {result ? (
            <div className="font-mono text-[38px] font-bold leading-none text-chalk tabular-nums">
              {result.homeGoals}
              <span className="mx-1.5 text-ghost">:</span>
              {result.awayGoals}
            </div>
          ) : (
            <div className="font-mono text-[24px] font-bold leading-none text-faint tabular-nums">v</div>
          )}
          <span className="label-mono mt-2">{result ? (live ? "live" : "result") : "kick-off"}</span>
        </div>
        <TeamSide team={away} align="left" />
      </div>
    </div>
  );
}

function TeamSide({ team, align }: { team: TeamCard; align: "left" | "right" }) {
  const right = align === "right";
  return (
    <div className={cn("flex items-center gap-3", right ? "flex-row-reverse text-right" : "text-left")}>
      <Crest team={team} />
      <div className={cn("flex min-w-0 flex-col", right ? "items-end" : "items-start")}>
        <span className="truncate font-display text-[19px] font-medium leading-tight text-chalk">
          {team.name}
        </span>
        <div className={cn("mt-1.5 flex items-center gap-2", right && "flex-row-reverse")}>
          {team.fifaRank > 0 && <span className="label-mono !tracking-[0.12em]">#{team.fifaRank}</span>}
          <Form form={team.form} />
        </div>
      </div>
    </div>
  );
}
