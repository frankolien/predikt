import { useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { Avatar } from "../ui";
import type { Tournament, TournamentMatchView, TournamentSide } from "../../lib/api";

/* Split a round's matches into adjacent pairs so we can draw the vertical join. */
function pairs<T>(arr: T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += 2) out.push(arr.slice(i, i + 2));
  return out;
}

interface ReportBody {
  homeScore: number;
  awayScore: number;
  penaltyWinner?: "home" | "away";
}

export function CupBracket({
  tournament,
  canReport,
  onReport,
  reporting,
}: {
  tournament: Tournament;
  canReport: boolean;
  onReport: (matchId: string, body: ReportBody) => Promise<void> | void;
  reporting?: string | null;
}) {
  const total = tournament.totalRounds;
  const seedOf = new Map(tournament.participants.map((p) => [p.id, p.seed] as const));
  const firstCount = tournament.rounds[0]?.matches.length ?? 1;
  const height = Math.max(220, firstCount * 108);

  return (
    <div className="overflow-x-auto pb-3">
      <div className="flex min-w-max">
        {tournament.rounds.map((rd) => {
          const isFinal = rd.round === total;
          return (
            <div key={rd.round} className="flex flex-col" style={{ width: 236 }}>
              <div className="mb-3 px-2 font-mono text-[10px] uppercase tracking-[0.16em] text-faint">
                {rd.name}
              </div>
              <div className="flex flex-col" style={{ height }}>
                {isFinal
                  ? rd.matches.map((m) => (
                      <div key={m.id} className="flex flex-1 items-center px-2">
                        <MatchCard
                          match={m}
                          seedOf={seedOf}
                          canReport={canReport}
                          onReport={onReport}
                          reporting={reporting}
                        />
                      </div>
                    ))
                  : pairs(rd.matches).map((pair, gi) => (
                      <div key={gi} className="relative flex flex-1 flex-col justify-around">
                        {/* vertical join between the pair + horizontal stub to the next round */}
                        <span className="pointer-events-none absolute right-0 top-1/4 bottom-1/4 w-px bg-edge-2" />
                        <span className="pointer-events-none absolute right-0 top-1/2 h-px w-4 translate-x-full bg-edge-2" />
                        {pair.map((m) => (
                          <div key={m.id} className="flex items-center px-2">
                            <MatchCard
                              match={m}
                              seedOf={seedOf}
                              canReport={canReport}
                              onReport={onReport}
                              reporting={reporting}
                            />
                          </div>
                        ))}
                      </div>
                    ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MatchCard({
  match,
  seedOf,
  canReport,
  onReport,
  reporting,
}: {
  match: TournamentMatchView;
  seedOf: Map<string, number | null>;
  canReport: boolean;
  onReport: (matchId: string, body: ReportBody) => Promise<void> | void;
  reporting?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const confirmed = match.status === "confirmed";
  const bothSet = !!match.home.participantId && !!match.away.participantId;
  const playable = canReport && match.status === "ready" && bothSet;
  const busy = reporting === match.id;

  return (
    <div className="w-full">
      <div
        className={`overflow-hidden rounded-default border ${
          confirmed ? "border-edge-2 bg-panel/70" : match.status === "ready" ? "border-edge-3 bg-panel" : "border-edge bg-panel/40"
        } ${playable ? "cursor-pointer transition-colors hover:border-live/60" : ""}`}
        onClick={() => playable && setOpen((v) => !v)}
      >
        <Row
          side={match.home}
          seed={match.home.participantId ? seedOf.get(match.home.participantId) ?? null : null}
          isWinner={confirmed && match.winnerParticipantId === match.home.participantId}
          confirmed={confirmed}
        />
        <div className="h-px bg-edge" />
        <Row
          side={match.away}
          seed={match.away.participantId ? seedOf.get(match.away.participantId) ?? null : null}
          isWinner={confirmed && match.winnerParticipantId === match.away.participantId}
          confirmed={confirmed}
        />
      </div>

      {confirmed && match.decidedBy === "penalties" && (
        <div className="mt-1 px-1 font-mono text-[9px] uppercase tracking-[0.14em] text-faint">won on penalties</div>
      )}
      {playable && !open && (
        <div className="mt-1 px-1 font-mono text-[9px] uppercase tracking-[0.14em] text-live">tap to enter score</div>
      )}

      {open && playable && (
        <ReportForm
          home={match.home.name ?? "Home"}
          away={match.away.name ?? "Away"}
          busy={busy}
          onSubmit={async (body) => {
            await onReport(match.id, body);
            setOpen(false);
          }}
          onCancel={() => setOpen(false)}
        />
      )}
    </div>
  );
}

function Row({
  side,
  seed,
  isWinner,
  confirmed,
}: {
  side: TournamentSide;
  seed: number | null;
  isWinner: boolean;
  confirmed: boolean;
}) {
  const name = side.name ?? "TBD";
  return (
    <div className="flex items-center gap-2 px-2.5 py-1.5">
      {side.name ? (
        <Avatar seed={side.name} size={18} />
      ) : (
        <span className="grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full border border-dashed border-edge text-[10px] text-ghost">
          –
        </span>
      )}
      <span className={`min-w-0 flex-1 truncate text-[12.5px] ${isWinner ? "font-semibold text-chalk" : side.name ? "text-silver" : "text-faint"}`}>
        {name}
      </span>
      {isWinner && <Check size={11} className="shrink-0 text-live" />}
      {confirmed ? (
        <span className={`w-4 text-right font-mono text-[13px] ${isWinner ? "text-chalk" : "text-steel"}`}>
          {side.score ?? 0}
        </span>
      ) : seed ? (
        <span className="w-5 text-right font-mono text-[9.5px] text-faint">#{seed}</span>
      ) : (
        <span className="w-4" />
      )}
    </div>
  );
}

function ReportForm({
  home,
  away,
  busy,
  onSubmit,
  onCancel,
}: {
  home: string;
  away: string;
  busy?: boolean;
  onSubmit: (b: ReportBody) => void | Promise<void>;
  onCancel: () => void;
}) {
  const [hs, setHs] = useState(0);
  const [as, setAs] = useState(0);
  const [pen, setPen] = useState<"home" | "away" | null>(null);
  const level = hs === as;

  return (
    <div
      className="mt-1.5 rounded-default border border-edge-2 bg-panel-2/70 p-2.5"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between gap-2">
        <Stepper label={home} value={hs} onChange={setHs} />
        <span className="font-mono text-[11px] text-faint">–</span>
        <Stepper label={away} value={as} onChange={setAs} align="right" />
      </div>

      {level && (
        <div className="mt-2">
          <div className="mb-1 font-mono text-[9px] uppercase tracking-[0.14em] text-faint">penalties — who went through?</div>
          <div className="flex gap-1.5">
            {(["home", "away"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setPen(s)}
                className={`flex-1 truncate rounded-chip border px-2 py-1 font-mono text-[10px] ${
                  pen === s ? "border-live text-live" : "border-edge-2 text-steel hover:border-edge-3"
                }`}
              >
                {s === "home" ? home : away}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="mt-2.5 flex items-center gap-2">
        <button
          disabled={busy || (level && !pen)}
          onClick={() => onSubmit({ homeScore: hs, awayScore: as, penaltyWinner: level ? pen ?? undefined : undefined })}
          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-default bg-white px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-void disabled:opacity-40"
        >
          {busy ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
          {busy ? "Saving" : "Confirm"}
        </button>
        <button
          onClick={onCancel}
          className="rounded-default border border-edge-2 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-steel hover:text-chalk"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function Stepper({
  label,
  value,
  onChange,
  align = "left",
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  align?: "left" | "right";
}) {
  return (
    <div className={`flex min-w-0 flex-1 flex-col gap-1 ${align === "right" ? "items-end" : ""}`}>
      <span className="max-w-full truncate font-mono text-[9.5px] uppercase tracking-[0.1em] text-steel">{label}</span>
      <div className="flex items-center gap-1.5">
        <button
          onClick={() => onChange(Math.max(0, value - 1))}
          className="grid h-6 w-6 place-items-center rounded-chip border border-edge-2 font-mono text-chalk hover:border-edge-3"
        >
          –
        </button>
        <span className="w-5 text-center font-display text-[18px] font-semibold text-chalk">{value}</span>
        <button
          onClick={() => onChange(Math.min(99, value + 1))}
          className="grid h-6 w-6 place-items-center rounded-chip border border-edge-2 font-mono text-chalk hover:border-edge-3"
        >
          +
        </button>
      </div>
    </div>
  );
}
