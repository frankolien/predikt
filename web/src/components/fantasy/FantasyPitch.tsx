import { useState } from "react";
import { X, Plus, ArrowUp, ArrowDown } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { Flag } from "../ui";
import { PlayerHoverCard } from "./PlayerHoverCard";
import { cn } from "../../lib/cn";
import type { FantasyPosition, FantasyChip } from "../../lib/api";

/* ============================================================================
   FantasyPitch — an FPL squad on a chalk pitch: the starting XI in its shape,
   a 4-man bench strip beneath, captain (C) + vice (V) armbands.

   · build — tap a shirt for actions (armband, vice, sub on/off, drop); tap a
     dashed slot to fill that position from the pool.
   · view — read-only; each shirt shows its live SCORE, the counted XI is lit,
     benched players are dim (unless Bench Boost), auto-subs are flagged.
   Monochrome chalkboard; green = captain / live.
   ============================================================================ */

export type PitchPlayer = {
  id: string;
  name: string;
  teamCode: string;
  position: FantasyPosition;
  price?: number;
  points?: number;
  basePoints?: number;
  starter: boolean;
  benchOrder?: number;
};

const ROWS: FantasyPosition[] = ["FWD", "MID", "DEF", "GK"]; // top → bottom
const DEFAULT_XI: Record<FantasyPosition, number> = { GK: 1, DEF: 4, MID: 4, FWD: 2 };
const DEFAULT_BENCH: Record<FantasyPosition, number> = { GK: 1, DEF: 1, MID: 1, FWD: 1 };

function lastName(name: string): string {
  const parts = name.trim().split(/\s+/);
  const last = parts[parts.length - 1];
  return last.length <= 11 ? last : last.slice(0, 10) + "…";
}

export function FantasyPitch({
  players,
  captainId,
  viceId,
  mode = "view",
  chip = null,
  autoSubIn = [],
  autoSubOut = [],
  onCaptain,
  onVice,
  onSub,
  onRemove,
  onAddPosition,
  className,
}: {
  players: PitchPlayer[];
  captainId: string | null;
  viceId?: string | null;
  mode?: "build" | "view";
  chip?: FantasyChip;
  autoSubIn?: string[];
  autoSubOut?: string[];
  onCaptain?: (id: string) => void;
  onVice?: (id: string) => void;
  onSub?: (id: string) => void; // toggle starter ⇄ bench
  onRemove?: (id: string) => void;
  onAddPosition?: (pos: FantasyPosition) => void;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const [active, setActive] = useState<string | null>(null);

  const starters = players.filter((p) => p.starter);
  const bench = players.filter((p) => !p.starter).sort((a, b) => (a.benchOrder ?? 9) - (b.benchOrder ?? 9));
  const full = players.length >= 15;

  const counts: Record<FantasyPosition, number> = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
  for (const p of starters) counts[p.position]++;
  const formation = `${counts.DEF}-${counts.MID}-${counts.FWD}`;
  const activePlayer = mode === "build" ? players.find((p) => p.id === active) ?? null : null;

  return (
    <div
      className={cn("relative w-full overflow-hidden rounded-lg border border-edge bg-coal/50", className)}
    >
      <div className="absolute right-2.5 top-2.5 z-20 flex items-center gap-1.5">
        {chip && (
          <span className="rounded-chip border border-live/50 bg-live-soft px-1.5 py-1 font-mono text-[8.5px] font-semibold uppercase tracking-[0.12em] text-live">
            {chip === "tc" ? "3× Cap" : "Bench Boost"}
          </span>
        )}
        <span className="rounded-chip border border-edge bg-void/70 px-2 py-1 font-mono text-[9px] uppercase tracking-[0.14em] text-steel backdrop-blur-sm">
          {players.length}/15 · {formation}
        </span>
      </div>

      {/* pitch — a 3D grass field with the starting XI laid FLAT on top, so the
         perspective sells depth while player names stay perfectly upright. */}
      <div className="relative aspect-[10/12] overflow-hidden bg-[#276e35]">
        {/* grass, tilted back for depth (near edge at the foot) */}
        <div
          className="absolute inset-0"
          style={{ transform: "perspective(1600px) rotateX(15deg)", transformOrigin: "50% 100%" }}
        >
          <PitchLines />
        </div>
        {/* flat depth wash — darkens the far end + hides the tilt seam at the top */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "linear-gradient(180deg, rgba(3,10,5,0.5) 0%, transparent 20%, transparent 88%, rgba(3,10,5,0.28) 100%), radial-gradient(125% 90% at 50% 38%, transparent 60%, rgba(3,10,5,0.42) 100%)",
          }}
        />
        <div className="relative z-10 flex h-full flex-col justify-between px-[3%] py-[5%]">
        {ROWS.map((pos) => {
          const group = starters.filter((p) => p.position === pos);
          const ph = mode === "build" && !full ? Math.max(0, DEFAULT_XI[pos] - group.length) : 0;
          if (group.length === 0 && ph === 0) return null;
          return (
            <div key={pos} className="flex items-center justify-center gap-1.5 sm:gap-2.5">
              {group.map((p, i) => (
                <Shirt
                  key={p.id}
                  player={p}
                  index={i}
                  captain={p.id === captainId}
                  vice={p.id === viceId}
                  mode={mode}
                  active={active === p.id}
                  subOut={autoSubOut.includes(p.id)}
                  dim={mode === "view" && chip !== "bb" && autoSubOut.includes(p.id)}
                  reduce={!!reduce}
                  onToggle={() => setActive((a) => (a === p.id ? null : p.id))}
                />
              ))}
              {Array.from({ length: ph }).map((_, i) => (
                <Placeholder key={`ph-${pos}-${i}`} pos={pos} onClick={() => onAddPosition?.(pos)} />
              ))}
            </div>
          );
        })}
        {players.length === 0 && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center">
            <span className="rounded-default bg-void/80 px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.16em] text-silver">tap a slot to build your squad</span>
          </div>
        )}
        </div>
      </div>

      {/* bench strip */}
      {(bench.length > 0 || mode === "build") && (
        <div className="relative z-10 flex items-center gap-2 border-t border-edge bg-void/40 px-3 py-2.5">
          <span className="font-mono text-[8.5px] uppercase tracking-[0.16em] text-faint">bench</span>
          <div className="flex flex-1 items-center justify-around gap-1.5">
            {bench.map((p, i) => (
              <Shirt
                key={p.id}
                player={p}
                index={i}
                captain={p.id === captainId}
                vice={p.id === viceId}
                mode={mode}
                active={active === p.id}
                subIn={autoSubIn.includes(p.id)}
                dim={mode === "view" && chip !== "bb" && !autoSubIn.includes(p.id)}
                bench
                reduce={!!reduce}
                onToggle={() => setActive((a) => (a === p.id ? null : p.id))}
              />
            ))}
            {mode === "build" &&
              (["GK", "DEF", "MID", "FWD"] as FantasyPosition[]).flatMap((pos) => {
                const have = bench.filter((p) => p.position === pos).length;
                const need = full ? 0 : Math.max(0, DEFAULT_BENCH[pos] - have);
                return Array.from({ length: need }).map((_, i) => (
                  <Placeholder key={`bph-${pos}-${i}`} pos={pos} small onClick={() => onAddPosition?.(pos)} />
                ));
              })}
          </div>
        </div>
      )}

      {/* build action bar */}
      {activePlayer && (
        <motion.div
          initial={reduce ? false : { opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.18 }}
          className="absolute inset-x-0 bottom-0 z-30 flex flex-wrap items-center gap-1.5 border-t border-edge-2 bg-void/95 px-3 py-2.5 backdrop-blur-sm"
        >
          <Flag code={activePlayer.teamCode} size={16} />
          <span className="mr-auto min-w-0 truncate text-[12.5px] text-chalk">{activePlayer.name}</span>
          {activePlayer.starter ? (
            <>
              <BarBtn active={activePlayer.id === captainId} onClick={() => { onCaptain?.(activePlayer.id); setActive(null); }}>© C</BarBtn>
              <BarBtn active={activePlayer.id === viceId} onClick={() => { onVice?.(activePlayer.id); setActive(null); }}>Ⓥ V</BarBtn>
              <BarBtn onClick={() => { onSub?.(activePlayer.id); setActive(null); }}><ArrowDown size={11} /> Bench</BarBtn>
            </>
          ) : (
            <BarBtn onClick={() => { onSub?.(activePlayer.id); setActive(null); }}><ArrowUp size={11} /> Start</BarBtn>
          )}
          <BarBtn onClick={() => { onRemove?.(activePlayer.id); setActive(null); }}><X size={11} /></BarBtn>
        </motion.div>
      )}
    </div>
  );
}

function BarBtn({ children, active, onClick }: { children: React.ReactNode; active?: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1 rounded-default border px-2 py-1.5 font-mono text-[9.5px] uppercase tracking-[0.08em]",
        active ? "border-live/50 text-live" : "border-edge-2 text-steel hover:border-edge-3 hover:text-chalk",
      )}
    >
      {children}
    </button>
  );
}

function Placeholder({ pos, small, onClick }: { pos: FantasyPosition; small?: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className="group flex flex-col items-center gap-1" aria-label={`Add ${pos}`}>
      <span
        className={cn(
          "grid place-items-center rounded-full border border-dashed border-edge-2 text-steel transition-colors group-hover:border-edge-3 group-hover:text-chalk",
          small ? "h-8 w-8" : "h-9 w-9 sm:h-11 sm:w-11",
        )}
      >
        <Plus size={small ? 12 : 14} />
      </span>
      <span className="rounded-[3px] bg-void/70 px-1 py-px font-mono text-[8px] uppercase tracking-[0.12em] text-silver sm:text-[9px]">{pos}</span>
    </button>
  );
}

function Shirt({
  player,
  index,
  captain,
  vice,
  mode,
  active,
  dim,
  subIn,
  subOut,
  bench,
  reduce,
  onToggle,
}: {
  player: PitchPlayer;
  index: number;
  captain: boolean;
  vice: boolean;
  mode: "build" | "view";
  active: boolean;
  dim?: boolean;
  subIn?: boolean;
  subOut?: boolean;
  bench?: boolean;
  reduce: boolean;
  onToggle: () => void;
}) {
  const score = player.points ?? 0;
  const sz = bench ? "h-9 w-9 sm:h-11 sm:w-11" : "h-11 w-11 sm:h-14 sm:w-14";
  const flagSz = bench ? 36 : 56;
  const shirt = (
    <button
      onClick={onToggle}
      className={cn(
        "relative grid place-items-center rounded-full transition-transform",
        sz,
        captain && "ring-2 ring-live",
        !captain && vice && "ring-2 ring-white/70",
        active && "-translate-y-0.5 ring-2 ring-white",
        dim && "opacity-45",
      )}
      aria-label={player.name}
    >
      <Flag
        code={player.teamCode}
        size={flagSz}
        className="!h-full !w-full object-cover shadow-[0_2px_6px_rgba(0,0,0,0.45),0_0_0_1px_rgba(0,0,0,0.28)]"
      />
      {captain && (
        <span className="absolute -left-1 -top-1 grid h-4 w-4 place-items-center rounded-full border border-live bg-void font-mono text-[8px] font-bold text-live">
          C
        </span>
      )}
      {!captain && vice && (
        <span className="absolute -left-1 -top-1 grid h-4 w-4 place-items-center rounded-full border border-edge-3 bg-void font-mono text-[8px] font-bold text-silver">
          V
        </span>
      )}
      {(subIn || subOut) && (
        <span
          className={cn(
            "absolute -right-1 -top-1 grid h-4 w-4 place-items-center rounded-full border bg-void",
            subIn ? "border-live text-live" : "border-edge-2 text-faint",
          )}
        >
          {subIn ? <ArrowUp size={9} /> : <ArrowDown size={9} />}
        </span>
      )}
      {mode === "view" && (
        <span
          className={cn(
            "absolute -bottom-1.5 grid min-w-[20px] place-items-center rounded-chip border px-1 py-px font-mono text-[10px] font-semibold tabular-nums",
            captain ? "border-live/50 bg-void text-live" : "border-edge-2 bg-void text-chalk",
          )}
        >
          {score}
        </span>
      )}
    </button>
  );
  return (
    <motion.div
      className={cn("relative flex flex-col items-center gap-1", bench ? "w-[22%] max-w-[80px]" : "w-[19%] max-w-[92px]")}
      initial={reduce ? false : { opacity: 0, y: 8, scale: 0.85 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.3, delay: reduce ? 0 : index * 0.04, ease: [0.16, 1, 0.3, 1] }}
    >
      <PlayerHoverCard playerId={player.id}>{shirt}</PlayerHoverCard>
      <span className="max-w-full truncate rounded-[4px] bg-void/90 px-1.5 py-0.5 text-center font-mono text-[11px] font-semibold leading-tight text-white shadow-[0_1px_4px_rgba(0,0,0,0.6)] sm:text-[12px]">
        {lastName(player.name)}
      </span>
      {mode === "build" && (
        <span className="rounded-[4px] bg-void/80 px-1.5 font-mono text-[9.5px] font-medium text-white">{player.price?.toFixed(1)}</span>
      )}
    </motion.div>
  );
}

/* Portrait grass pitch — our goal at the foot, attacking up. */
function PitchLines() {
  const line = "rgba(255,255,255,0.74)";
  return (
    <div className="absolute inset-0 overflow-hidden">
      {/* grass + mowing stripes (bands run across the pitch) */}
      <div
        className="absolute inset-0"
        style={{ background: "repeating-linear-gradient(180deg, #2f7d3f 0 8.33%, #276e35 8.33% 16.66%)" }}
      />
      {/* top light for a bit of turf sheen */}
      <div
        className="absolute inset-0"
        style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.07), transparent 42%)" }}
      />
      {/* white markings */}
      <svg viewBox="0 0 100 120" preserveAspectRatio="none" className="absolute inset-0 h-full w-full" aria-hidden fill="none" stroke={line} strokeWidth={0.5}>
        <rect x="2.5" y="2.5" width="95" height="115" rx="1.5" />
        <line x1="2.5" y1="60" x2="97.5" y2="60" />
        <circle cx="50" cy="60" r="11" />
        <circle cx="50" cy="60" r="0.7" fill={line} stroke="none" />
        <rect x="26" y="2.5" width="48" height="16" />
        <rect x="39" y="2.5" width="22" height="6" />
        <rect x="26" y="101.5" width="48" height="16" />
        <rect x="39" y="111.5" width="22" height="6" />
      </svg>
    </div>
  );
}
