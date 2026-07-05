import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { Crest, LiveDot } from "../ui";
import { cn } from "../../lib/cn";
import { api, type FantasyPlayerDetail, type FantasyPlayerGame } from "../../lib/api";

/* ============================================================================
   PlayerHoverCard — hover a player anywhere in Fantasy to scout them.

   FotMob-style card, but honest: every field is real data we actually hold —
   squad details (age, nationality), the player's TEAM's live World Cup run
   (form, results, next fixture) and their fantasy value + live SCORE. What the
   free feed can't give (market value, per-player goals, ratings) we omit rather
   than invent. Monochrome; green = live / a win. Rendered in a portal so the
   scrolling player pool never clips it.
   ============================================================================ */

const CARD_W = 306;
const cache = new Map<string, FantasyPlayerDetail>();
const inflight = new Map<string, Promise<FantasyPlayerDetail>>();

function load(id: string): Promise<FantasyPlayerDetail> {
  const hit = cache.get(id);
  if (hit) return Promise.resolve(hit);
  let p = inflight.get(id);
  if (!p) {
    p = api.fantasy
      .player(id)
      .then((d) => { cache.set(id, d); inflight.delete(id); return d; })
      .catch((e) => { inflight.delete(id); throw e; });
    inflight.set(id, p);
  }
  return p;
}

export function PlayerHoverCard({
  playerId,
  children,
  className,
}: {
  playerId: string;
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const [data, setData] = useState<FantasyPlayerDetail | null>(() => cache.get(playerId) ?? null);
  const [loading, setLoading] = useState(false);
  const reduce = useReducedMotion();

  const place = () => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const gap = 10;
    let left = r.right + gap;
    if (left + CARD_W > window.innerWidth - 8) left = r.left - CARD_W - gap;
    left = Math.max(8, Math.min(left, window.innerWidth - CARD_W - 8));
    const approxH = 380;
    let top = r.top;
    if (top + approxH > window.innerHeight - 8) top = Math.max(8, window.innerHeight - approxH - 8);
    setPos({ left, top });
  };

  const open = () => {
    place();
    if (!cache.get(playerId)) {
      setLoading(true);
      load(playerId).then((d) => { setData(d); setLoading(false); }).catch(() => setLoading(false));
    } else {
      setData(cache.get(playerId)!);
    }
  };

  const show = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(open, 120);
  };
  const hide = () => {
    if (timer.current) clearTimeout(timer.current);
    setPos(null);
  };

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  return (
    <span
      ref={ref}
      className={cn("inline-flex", className)}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocusCapture={show}
      onBlurCapture={hide}
    >
      {children}
      {typeof document !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {pos && (
              <motion.div
                initial={reduce ? { opacity: 0 } : { opacity: 0, y: 6, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, transition: { duration: 0.1 } }}
                transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
                style={{ position: "fixed", left: pos.left, top: pos.top, width: CARD_W, zIndex: 90 }}
                className="pointer-events-none overflow-hidden rounded-lg border border-edge-2 bg-coal/95 shadow-[0_24px_60px_-24px_rgba(0,0,0,0.9)] backdrop-blur-md"
              >
                {data ? <Body d={data} /> : <Skeleton loading={loading} />}
              </motion.div>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </span>
  );
}

function Body({ d }: { d: FantasyPlayerDetail }) {
  const recent = d.games.filter((g) => g.matchStatus !== "scheduled").slice(-3).reverse();
  return (
    <div>
      {/* header */}
      <div className="flex items-center gap-3 border-b border-edge bg-panel/60 px-3.5 py-3">
        <Crest team={{ crest: d.crest, code: d.teamCode }} size={38} />
        <div className="min-w-0 flex-1">
          <div className="truncate font-display text-[15px] font-semibold text-chalk">{d.name}</div>
          <div className="truncate font-mono text-[10px] uppercase tracking-[0.12em] text-steel">
            {d.teamName}
            {d.fifaRank ? ` · FIFA #${d.fifaRank}` : ""}
          </div>
        </div>
        <span className="rounded-chip border border-edge-2 px-2 py-1 font-mono text-[9.5px] font-semibold uppercase tracking-[0.12em] text-silver">
          {d.position}
        </span>
      </div>

      {/* real bio + fantasy value */}
      <div className="grid grid-cols-3 gap-px bg-edge">
        <Cell label="age" value={d.age != null ? String(d.age) : "—"} />
        <Cell label="price" value={`${d.price.toFixed(1)}`} sub="cr" />
        <Cell label="score ×2 = cap" value={String(d.score)} accent sub="fantasy" />
      </div>

      {/* WC form */}
      <div className="flex items-center gap-2 border-t border-edge px-3.5 py-2.5">
        <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-faint">WC form</span>
        {d.form.length ? (
          <div className="flex gap-1">
            {d.form.slice(-5).map((r, i) => (
              <span
                key={i}
                className={cn(
                  "grid h-4 w-4 place-items-center rounded-[3px] font-mono text-[9px] font-bold",
                  r === "W" ? "bg-live-soft text-live" : r === "D" ? "bg-white/[0.06] text-silver" : "bg-white/[0.03] text-faint",
                )}
              >
                {r}
              </span>
            ))}
          </div>
        ) : (
          <span className="font-mono text-[10px] text-faint">— awaiting kickoff</span>
        )}
      </div>

      {/* results + next */}
      <div className="border-t border-edge px-3.5 py-2.5">
        <div className="mb-1.5 font-mono text-[9px] uppercase tracking-[0.16em] text-faint">
          {recent.length ? "recent · next" : "fixtures"}
        </div>
        <div className="flex flex-col gap-1.5">
          {recent.map((g, i) => <GameRow key={`r${i}`} g={g} teamCode={d.teamCode} />)}
          {d.next && <GameRow g={d.next} teamCode={d.teamCode} upcoming />}
          {!recent.length && !d.next && (
            <span className="font-mono text-[10.5px] text-faint">No World Cup fixtures loaded yet.</span>
          )}
        </div>
      </div>

      <div className="border-t border-edge px-3.5 py-2 font-mono text-[8.5px] uppercase tracking-[0.14em] text-faint">
        real world cup 2026 data · fantasy value is Predikt's
      </div>
    </div>
  );
}

function Cell({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className="bg-coal px-2.5 py-2">
      <div className="font-mono text-[8.5px] uppercase tracking-[0.12em] text-faint">{label}</div>
      <div className={cn("mt-0.5 font-display text-[16px] font-semibold leading-none", accent ? "text-live" : "text-chalk")}>
        {value}
        {sub && <span className="ml-0.5 font-mono text-[8.5px] font-normal text-faint">{sub}</span>}
      </div>
    </div>
  );
}

function GameRow({ g, teamCode, upcoming }: { g: FantasyPlayerGame; teamCode: string; upcoming?: boolean }) {
  const when = g.kickoff
    ? new Date(g.kickoff).toLocaleDateString(undefined, { month: "short", day: "numeric" })
    : "";
  return (
    <div className="flex items-center gap-2">
      <span className="w-4 text-center font-mono text-[9px] text-faint">{g.home ? "v" : "@"}</span>
      <Crest team={{ crest: g.opponentCrest, code: g.opponentCode }} size={16} />
      <span className="min-w-0 flex-1 truncate text-[12px] text-silver">{g.opponent}</span>
      {g.isLive ? (
        <span className="inline-flex items-center gap-1 font-mono text-[10px] text-live">
          <LiveDot /> {g.score ?? "live"}{typeof g.minute === "number" ? ` ${g.minute}'` : ""}
        </span>
      ) : upcoming ? (
        <span className="font-mono text-[10px] text-steel">{when}</span>
      ) : (
        <span className="flex items-center gap-1.5">
          <span className="font-mono text-[11px] tabular-nums text-chalk">{g.score ?? "—"}</span>
          {g.outcome && (
            <span
              className={cn(
                "grid h-3.5 w-3.5 place-items-center rounded-[3px] font-mono text-[8px] font-bold",
                g.outcome === "W" ? "bg-live-soft text-live" : g.outcome === "D" ? "bg-white/[0.06] text-silver" : "bg-white/[0.03] text-faint",
              )}
            >
              {g.outcome}
            </span>
          )}
        </span>
      )}
    </div>
  );
}

function Skeleton({ loading }: { loading: boolean }) {
  return (
    <div className="p-3.5">
      <div className="flex items-center gap-3">
        <div className="h-9 w-9 animate-pulse rounded-full bg-white/[0.06]" />
        <div className="flex-1 space-y-1.5">
          <div className="h-3 w-2/3 animate-pulse rounded bg-white/[0.06]" />
          <div className="h-2 w-1/2 animate-pulse rounded bg-white/[0.04]" />
        </div>
      </div>
      <div className="mt-3 h-10 animate-pulse rounded bg-white/[0.04]" />
      {!loading && <div className="mt-3 font-mono text-[10px] text-faint">Couldn't load this player.</div>}
    </div>
  );
}
