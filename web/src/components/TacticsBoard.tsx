import { useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Link } from "react-router-dom";
import { ArrowRight, Brain, Wallet, Radio, Users, Trophy, Star } from "lucide-react";
import { Brackets, LiveDot } from "./ui";
import { cn } from "../lib/cn";
import type { Health } from "../lib/api";

/* ============================================================================
   TacticsBoard — the gamified, interactive landing centrepiece.

   The whole platform laid out as a starting line-up on a chalk tactics board:
   the Gaffer (on-device AI) plays regista, the self-custodial USD₮ wallet keeps
   goal, and the three ways to play — Predict / Organize / Fantasy — are the
   front three, fed by the ball (the live World Cup feed). Hover or tap a player
   to see what it does and where it takes you. Monochrome chalkboard; the only
   colour is the live-green that signals real, running systems (honest health).
   ============================================================================ */

type SystemKey = "ai" | "chain" | "feed";

type Node = {
  key: string;
  no: string;
  label: string;
  role: string;
  icon: typeof Brain;
  detail: string;
  chips: string[];
  x: number; // % across the board (0 left → 100 right)
  y: number; // % down the board (0 top → 100 bottom)
  live?: SystemKey;
  to?: string;
  cta?: string;
};

const NODES: Node[] = [
  {
    key: "gaffer",
    no: "10",
    label: "the Gaffer",
    role: "Regista · on-device AI",
    icon: Brain,
    detail:
      "Your private pundit. Reads every tie — form, matchups, a proper hot take — and reacts live as the goals go in. Runs on your device. No cloud, ever.",
    chips: ["reads the tie", "reacts live", "no cloud"],
    x: 63,
    y: 50,
    live: "ai",
    to: "/app",
    cta: "Meet the Gaffer",
  },
  {
    key: "wallet",
    no: "1",
    label: "USD₮ wallet",
    role: "Keeper · self-custodial",
    icon: Wallet,
    detail:
      "One self-custodial USD₮ wallet under everything. Buy-ins go to escrow; payouts settle on-chain to you, with a real tx hash. Or keep it free and play in points.",
    chips: ["self-custodial", "on-chain payouts", "points too"],
    x: 89,
    y: 50,
    live: "chain",
    to: "/app",
    cta: "Connect a wallet",
  },
  {
    key: "predict",
    no: "7",
    label: "Predict",
    role: "Front · the caller",
    icon: Radio,
    detail:
      "Call the score on live World Cup ties, stake points or USD₮, and pool up with your mates by invite code. Correct callers split the pot at full time.",
    chips: ["live ties", "score pools", "invite codes"],
    x: 33,
    y: 21,
    to: "/predict",
    cta: "Open Predict",
  },
  {
    key: "organize",
    no: "9",
    label: "Organize",
    role: "Front · the gaffer",
    icon: Trophy,
    detail:
      "Run a knockout cup in minutes. Share a CUP-code, seed the bracket, report scores — winners auto-advance and the pot auto-settles by your prize split.",
    chips: ["knockout bracket", "auto-settle", "prize splits"],
    x: 25,
    y: 50,
    to: "/organize",
    cta: "Run a cup",
  },
  {
    key: "fantasy",
    no: "11",
    label: "Fantasy",
    role: "Front · the manager",
    icon: Users,
    detail:
      "Build a salary-cap XI from real World Cup squads, name a captain, and climb mini-leagues scored live off the fixture feed. The Gaffer can auto-draft you.",
    chips: ["real WC players", "salary cap", "live scoring"],
    x: 33,
    y: 79,
    to: "/fantasy",
    cta: "Pick your XI",
  },
  {
    key: "feed",
    no: "",
    label: "Live feed",
    role: "The ball · WC 2026",
    icon: Star,
    detail:
      "Everything runs off the real World Cup 2026 feed — live scores, minutes and results drive the pools, cups and fantasy as it happens.",
    chips: ["world cup 2026", "live scores", "real results"],
    x: 50,
    y: 50,
    live: "feed",
  },
];

const BALL = NODES.find((n) => n.key === "feed")!;
const PASSES: Array<[string, string]> = [
  ["wallet", "gaffer"],
  ["gaffer", "predict"],
  ["gaffer", "organize"],
  ["gaffer", "fantasy"],
];

const byKey = Object.fromEntries(NODES.map((n) => [n.key, n]));
// board coordinate space maps 1:1 to percentages (viewBox 100 × 62.5, ratio 16/10)
const VB_W = 100;
const VB_H = 62.5;
const vx = (n: Node) => (n.x / 100) * VB_W;
const vy = (n: Node) => (n.y / 100) * VB_H;

function systemOk(health: Health | null, k?: SystemKey): boolean {
  if (!health) return false;
  if (k === "ai") return health.ai?.state === "ready" || health.ai?.state === "mock";
  if (k === "chain") return !!health.chainReady;
  if (k === "feed") return !!health.ok;
  return false;
}

export function TacticsBoard({ health }: { health: Health | null }) {
  const reduce = useReducedMotion();
  const [hover, setHover] = useState<string | null>(null);
  const [pinned, setPinned] = useState<string | null>(null);
  const activeKey = hover ?? pinned;
  const active = activeKey ? byKey[activeKey] : null;

  const systems: Array<{ k: SystemKey; label: string }> = [
    { k: "ai", label: "AI" },
    { k: "chain", label: "chain" },
    { k: "feed", label: "feed" },
  ];

  return (
    <div className="w-full">
      <Brackets className="rounded-lg border border-edge bg-coal/50 p-2.5 sm:p-3.5">
        {/* ---- the pitch ---- */}
        <div className="relative aspect-[16/10] w-full overflow-hidden rounded-default">
          {/* chalk lines + faint grain */}
          <Pitch />

          {/* pass network (under the players) */}
          <svg
            viewBox={`0 0 ${VB_W} ${VB_H}`}
            preserveAspectRatio="none"
            className="pointer-events-none absolute inset-0 h-full w-full"
            aria-hidden
          >
            {PASSES.map(([a, b]) => {
              const na = byKey[a];
              const nb = byKey[b];
              const on = activeKey === a || activeKey === b;
              return (
                <line
                  key={`${a}-${b}`}
                  x1={vx(na)}
                  y1={vy(na)}
                  x2={vx(nb)}
                  y2={vy(nb)}
                  className={cn("pass-line", on ? "pass-line--on" : "")}
                  stroke="currentColor"
                  style={{ color: on ? "var(--color-chalk)" : "var(--color-edge-2)" }}
                />
              );
            })}
          </svg>

          {/* live systems HUD */}
          <div className="absolute left-2.5 top-2.5 z-20 flex items-center gap-2 rounded-chip border border-edge bg-void/70 px-2.5 py-1.5 backdrop-blur-sm sm:left-3.5 sm:top-3.5">
            <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-faint">line-up</span>
            <span className="h-2.5 w-px bg-edge-2" />
            {systems.map((s) => {
              const ok = systemOk(health, s.k);
              return (
                <span key={s.k} className="flex items-center gap-1">
                  {ok ? (
                    <LiveDot />
                  ) : (
                    <span className="h-1.5 w-1.5 rounded-full bg-ghost" />
                  )}
                  <span
                    className={cn(
                      "font-mono text-[9px] uppercase tracking-[0.14em]",
                      ok ? "text-silver" : "text-faint",
                    )}
                  >
                    {s.label}
                  </span>
                </span>
              );
            })}
          </div>

          {/* the players */}
          {NODES.map((n, i) => (
            <Player
              key={n.key}
              node={n}
              index={i}
              active={activeKey === n.key}
              dim={!!activeKey && activeKey !== n.key}
              ok={systemOk(health, n.live)}
              reduce={!!reduce}
              onEnter={() => setHover(n.key)}
              onLeave={() => setHover((h) => (h === n.key ? null : h))}
              onClick={() => setPinned((p) => (p === n.key ? null : n.key))}
            />
          ))}
        </div>

        {/* ---- info panel: swaps to the active player ---- */}
        <InfoPanel active={active} health={health} />
      </Brackets>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function Player({
  node,
  index,
  active,
  dim,
  ok,
  reduce,
  onEnter,
  onLeave,
  onClick,
}: {
  node: Node;
  index: number;
  active: boolean;
  dim: boolean;
  ok: boolean;
  reduce: boolean;
  onEnter: () => void;
  onLeave: () => void;
  onClick: () => void;
}) {
  const isBall = node.key === "feed";
  const Icon = node.icon;
  return (
    <motion.button
      type="button"
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      onFocus={onEnter}
      onBlur={onLeave}
      onClick={onClick}
      aria-label={`${node.label} — ${node.role}`}
      aria-pressed={active}
      className="group absolute z-10 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1.5 outline-none"
      style={{ left: `${node.x}%`, top: `${node.y}%` }}
      initial={reduce ? false : { opacity: 0, scale: 0.6 }}
      animate={{ opacity: dim ? 0.55 : 1, scale: 1 }}
      transition={{ duration: 0.5, delay: reduce ? 0 : 0.15 + index * 0.07, ease: [0.16, 1, 0.3, 1] }}
    >
      {/* shirt / node */}
      <span
        className={cn(
          "relative grid place-items-center rounded-full border transition-all duration-200",
          isBall
            ? "h-9 w-9 border-edge-2 bg-panel-2 sm:h-11 sm:w-11"
            : "h-11 w-11 border-edge-2 bg-panel shadow-lift sm:h-14 sm:w-14",
          active
            ? "-translate-y-0.5 border-chalk bg-raise ring-2 ring-chalk/70"
            : "group-hover:-translate-y-0.5 group-hover:border-edge-3",
        )}
      >
        {isBall ? (
          <BallGlyph active={active} live={ok} reduce={reduce} />
        ) : (
          <>
            <Icon
              size={active ? 17 : 16}
              className={cn("transition-colors", active ? "text-chalk" : "text-silver group-hover:text-chalk")}
            />
            {node.no && (
              <span className="absolute -right-1 -top-1 grid h-4 w-4 place-items-center rounded-full border border-edge-2 bg-void font-mono text-[8px] text-steel">
                {node.no}
              </span>
            )}
            {node.live && ok && (
              <span className="absolute -bottom-0.5 -left-0.5">
                <LiveDot />
              </span>
            )}
          </>
        )}
      </span>

      {/* name tag */}
      <span
        className={cn(
          "whitespace-nowrap rounded-chip px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.12em] transition-colors sm:text-[10px]",
          active ? "bg-void/80 text-chalk" : "text-steel group-hover:text-silver",
        )}
      >
        {node.label}
      </span>
    </motion.button>
  );
}

function BallGlyph({ active, live, reduce }: { active: boolean; live: boolean; reduce: boolean }) {
  return (
    <span className="relative grid h-full w-full place-items-center">
      {live && !reduce && (
        <span className="absolute inset-0 rounded-full bg-live/25 [animation:pulse-live_1.6s_ease-in-out_infinite]" />
      )}
      <svg viewBox="0 0 24 24" className={cn("relative h-5 w-5", active ? "text-chalk" : "text-silver")} fill="none">
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.2" />
        <path
          d="M12 6.5l3.2 2.3-1.2 3.8h-4L8.8 8.8 12 6.5z"
          fill="currentColor"
          fillOpacity={active ? 0.9 : 0.55}
        />
        <path d="M12 3.5v3M4.7 9.3l2.8 1M19.3 9.3l-2.8 1M7 19l1.6-2.6M17 19l-1.6-2.6" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
      </svg>
    </span>
  );
}

function InfoPanel({ active, health }: { active: Node | null; health: Health | null }) {
  const aiLabel =
    health?.ai?.state === "ready"
      ? "on-device · ready"
      : health?.ai?.state === "loading"
        ? `warming up · ${Math.round((health.ai.progress ?? 0) * 100)}%`
        : health?.ai?.state ?? "—";

  return (
    <div className="mt-2.5 flex min-h-[104px] flex-col justify-center overflow-hidden rounded-default border border-edge bg-void/40 p-3.5 sm:mt-3.5 sm:h-[150px] sm:min-h-0">
      {active ? (
        <motion.div
          key={active.key}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
          className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4"
        >
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-mono text-[9.5px] uppercase tracking-[0.16em] text-faint">{active.role}</span>
            </div>
            <div className="mt-1 font-display text-[16px] font-semibold text-chalk">{active.label}</div>
            <p className="mt-1 line-clamp-3 max-w-[46ch] text-[12.5px] leading-relaxed text-silver">{active.detail}</p>
            <div className="mt-2 flex flex-nowrap gap-1.5 overflow-hidden">
              {active.chips.map((c) => (
                <span
                  key={c}
                  className="rounded-chip border border-edge-2 px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.1em] text-steel"
                >
                  {c}
                </span>
              ))}
            </div>
          </div>
          {active.to && active.cta && (
            <Link
              to={active.to}
              className="inline-flex shrink-0 items-center gap-1.5 self-start rounded-default border border-edge-2 px-3 py-2 font-mono text-[10.5px] uppercase tracking-[0.12em] text-chalk transition-colors hover:border-edge-3 hover:bg-white/[0.04]"
            >
              {active.cta} <ArrowRight size={13} />
            </Link>
          )}
        </motion.div>
      ) : (
        <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="font-display text-[15px] font-semibold text-chalk">The starting line-up</div>
            <p className="mt-0.5 text-[12.5px] text-steel">
              One wallet, one Gaffer, three ways to play.{" "}
              <span className="text-silver">Hover the squad</span> to scout each one.
            </p>
          </div>
          <span className="whitespace-nowrap font-mono text-[10px] uppercase tracking-[0.14em] text-faint">
            AI · {aiLabel}
          </span>
        </div>
      )}
    </div>
  );
}

/* Monochrome chalk pitch (landscape, our goal to the right). */
function Pitch() {
  const stroke = "var(--color-edge-2)";
  const sw = 0.35;
  return (
    <div className="absolute inset-0">
      <div className="grid-lines absolute inset-0 opacity-40" aria-hidden />
      <svg
        viewBox="0 0 160 100"
        preserveAspectRatio="none"
        className="absolute inset-0 h-full w-full"
        aria-hidden
        fill="none"
        stroke={stroke}
        strokeWidth={sw}
      >
        {/* boundary */}
        <rect x="3" y="3" width="154" height="94" rx="1.5" />
        {/* halfway line + centre circle */}
        <line x1="80" y1="3" x2="80" y2="97" />
        <circle cx="80" cy="50" r="11" />
        <circle cx="80" cy="50" r="0.8" fill={stroke} stroke="none" />
        {/* left third */}
        <rect x="3" y="26" width="22" height="48" />
        <rect x="3" y="38" width="9" height="24" />
        <circle cx="17" cy="50" r="0.8" fill={stroke} stroke="none" />
        <path d="M25 41 A 9 9 0 0 1 25 59" />
        {/* right third */}
        <rect x="135" y="26" width="22" height="48" />
        <rect x="148" y="38" width="9" height="24" />
        <circle cx="143" cy="50" r="0.8" fill={stroke} stroke="none" />
        <path d="M135 41 A 9 9 0 0 0 135 59" />
      </svg>
      {/* edge vignette so the board sits into the page */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(120% 100% at 50% 50%, transparent 55%, color-mix(in srgb, var(--color-void) 85%, transparent) 100%)",
        }}
      />
    </div>
  );
}
