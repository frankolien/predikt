import { useEffect, useMemo, useState } from "react";
import { Sparkles, Trash2, Cpu, Loader2 } from "lucide-react";
import { Flag, Eyebrow, LiveDot } from "../ui";
import { FantasyPitch, type PitchPlayer } from "./FantasyPitch";
import { PlayerHoverCard } from "./PlayerHoverCard";
import { SpeakButton } from "../SpeakButton";
import { api, streamFantasyAI, type FantasyPlayer, type FantasyPosition, type FantasyChip } from "../../lib/api";

const POSITIONS: FantasyPosition[] = ["GK", "DEF", "MID", "FWD"];
const SQUAD_QUOTA: Record<FantasyPosition, number> = { GK: 2, DEF: 5, MID: 5, FWD: 3 };
const XI_MIN: Record<FantasyPosition, number> = { GK: 1, DEF: 3, MID: 2, FWD: 1 };
const XI_MAX: Record<FantasyPosition, number> = { GK: 1, DEF: 5, MID: 5, FWD: 3 };
const DEFAULT_XI: Record<FantasyPosition, number> = { GK: 1, DEF: 4, MID: 4, FWD: 2 };
const BUDGET = 100;
const CHIPS: Array<{ key: FantasyChip; label: string; blurb: string }> = [
  { key: null, label: "No chip", blurb: "captain scores ×2" },
  { key: "tc", label: "Triple Captain", blurb: "captain scores ×3 this run" },
  { key: "bb", label: "Bench Boost", blurb: "all 15 players score" },
];

export interface SquadState {
  squadIds: string[];
  starterIds: string[];
  captainId: string | null;
  viceId: string | null;
  chip: FantasyChip;
  valid: boolean;
}

function xiValid(starters: FantasyPlayer[]): boolean {
  if (starters.length !== 11) return false;
  const c: Record<FantasyPosition, number> = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
  for (const p of starters) c[p.position]++;
  return POSITIONS.every((k) => c[k] >= XI_MIN[k] && c[k] <= XI_MAX[k]);
}

export function SquadBuilder({ onChange }: { onChange: (s: SquadState) => void }) {
  const [players, setPlayers] = useState<FantasyPlayer[]>([]);
  const [sel, setSel] = useState<string[]>([]);
  const [starterSet, setStarterSet] = useState<Set<string>>(new Set());
  const [captain, setCaptain] = useState<string | null>(null);
  const [vice, setVice] = useState<string | null>(null);
  const [chip, setChip] = useState<FantasyChip>(null);
  const [filter, setFilter] = useState<"ALL" | FantasyPosition>("ALL");
  const [search, setSearch] = useState("");
  const [teamFilter, setTeamFilter] = useState<string>("ALL");
  const [drafting, setDrafting] = useState(false);
  const [aiText, setAiText] = useState("");
  const [aiRun, setAiRun] = useState(false);
  const [aiDone, setAiDone] = useState(false);

  useEffect(() => {
    api.fantasy.players().then((r) => setPlayers(r.players)).catch(() => {});
  }, []);

  const byId = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);
  const squad = useMemo(() => sel.map((id) => byId.get(id)).filter((p): p is FantasyPlayer => !!p), [sel, byId]);
  const starters = useMemo(() => squad.filter((p) => starterSet.has(p.id)), [squad, starterSet]);

  const posCount = useMemo(() => {
    const c: Record<FantasyPosition, number> = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
    for (const p of squad) c[p.position]++;
    return c;
  }, [squad]);
  const budget = useMemo(() => squad.reduce((a, p) => a + p.price, 0), [squad]);
  const teamOver = useMemo(() => {
    const t: Record<string, number> = {};
    for (const p of squad) t[p.teamCode] = (t[p.teamCode] || 0) + 1;
    return Object.values(t).some((n) => n > 3);
  }, [squad]);

  const errs: string[] = [];
  if (sel.length !== 15) errs.push(`${sel.length}/15 picked`);
  for (const pos of POSITIONS) if (posCount[pos] !== SQUAD_QUOTA[pos]) errs.push(`${pos} ${posCount[pos]}/${SQUAD_QUOTA[pos]}`);
  if (budget > BUDGET + 1e-6) errs.push("over budget");
  if (teamOver) errs.push("max 3 per nation");
  if (!xiValid(starters)) errs.push("invalid XI");
  if (!captain || !starterSet.has(captain)) errs.push("pick a captain");
  if (!vice || !starterSet.has(vice)) errs.push("pick a vice");
  const valid = errs.length === 0;

  // Keep captain/vice consistent (must be starters; distinct; default to priciest).
  useEffect(() => {
    let cap = captain && starterSet.has(captain) ? captain : null;
    let vc = vice && starterSet.has(vice) && vice !== cap ? vice : null;
    const ranked = starters.slice().sort((a, b) => b.price - a.price);
    if (!cap && ranked[0]) cap = ranked[0].id;
    if (!vc) vc = ranked.find((p) => p.id !== cap)?.id ?? null;
    if (cap !== captain) setCaptain(cap);
    if (vc !== vice) setVice(vc);
  }, [sel, starterSet]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    onChange({ squadIds: sel, starterIds: [...starterSet], captainId: captain, viceId: vice, chip, valid });
  }, [sel, starterSet, captain, vice, chip, valid]); // eslint-disable-line react-hooks/exhaustive-deps

  const addPlayer = (p: FantasyPlayer) => {
    if (sel.includes(p.id)) return;
    if (sel.length >= 15 || posCount[p.position] >= SQUAD_QUOTA[p.position]) return;
    // assign to XI toward a default 4-4-2, else bench
    const startersOfPos = starters.filter((s) => s.position === p.position).length;
    const asStarter = starterSet.size < 11 && startersOfPos < DEFAULT_XI[p.position];
    setSel((cur) => [...cur, p.id]);
    if (asStarter) setStarterSet((cur) => new Set(cur).add(p.id));
  };
  const removePlayer = (id: string) => {
    setSel((cur) => cur.filter((x) => x !== id));
    setStarterSet((cur) => { const n = new Set(cur); n.delete(id); return n; });
    if (captain === id) setCaptain(null);
    if (vice === id) setVice(null);
  };
  const toggle = (id: string) => (sel.includes(id) ? removePlayer(id) : addPlayer(byId.get(id)!));

  // Sub a player on/off, swapping with the best valid counterpart (same position first).
  const subToggle = (id: string) => {
    const p = byId.get(id);
    if (!p) return;
    const isStarter = starterSet.has(id);
    const pool = squad.filter((q) => (isStarter ? !starterSet.has(q.id) : starterSet.has(q.id)));
    const ordered = [...pool.filter((q) => q.position === p.position), ...pool.filter((q) => q.position !== p.position)];
    for (const q of ordered) {
      const nextStarters = new Set(starterSet);
      if (isStarter) { nextStarters.delete(id); nextStarters.add(q.id); }
      else { nextStarters.delete(q.id); nextStarters.add(id); }
      const arr = squad.filter((x) => nextStarters.has(x.id));
      if (xiValid(arr)) {
        setStarterSet(nextStarters);
        // if we benched the captain/vice, drop the armband
        const benched = isStarter ? id : q.id;
        if (captain === benched) setCaptain(null);
        if (vice === benched) setVice(null);
        return;
      }
    }
  };

  const makeCaptain = (id: string) => {
    if (!starterSet.has(id)) return;
    if (vice === id) setVice(null);
    setCaptain(id);
  };
  const makeVice = (id: string) => {
    if (!starterSet.has(id)) return;
    if (captain === id) setCaptain(null);
    setVice(id);
  };

  const autoDraft = async () => {
    setDrafting(true);
    try {
      const d = await api.fantasy.draft();
      setSel(d.squadIds);
      setStarterSet(new Set(d.starterIds));
      setCaptain(d.captainId);
      setVice(d.viceId);
    } finally {
      setDrafting(false);
    }
  };

  const askGaffer = () => {
    if (!starters.length) return;
    setAiText(""); setAiRun(true); setAiDone(false);
    streamFantasyAI(starters.map((p) => p.id), captain || "", "review", (e) => {
      if (e.type === "delta") setAiText((t) => t + e.text);
      else if (e.type === "done") { if (e.text) setAiText(e.text); setAiRun(false); setAiDone(true); }
      else if (e.type === "error") { setAiRun(false); setAiDone(true); setAiText((t) => t || "The Gaffer's got nothing to say about that lot."); }
    });
  };

  const teams = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of players) if (!m.has(p.teamCode)) m.set(p.teamCode, p.teamName);
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [players]);

  const q = search.trim().toLowerCase();
  const filtered = players
    .filter((p) => filter === "ALL" || p.position === filter)
    .filter((p) => teamFilter === "ALL" || p.teamCode === teamFilter)
    .filter((p) => !q || p.name.toLowerCase().includes(q) || p.teamName.toLowerCase().includes(q))
    .sort((a, b) => b.price - a.price);
  const shown = filtered.slice(0, 60);

  // pitch model: bench order = outfield by price desc (1..3); bench GK = 0
  const benchOutfield = squad.filter((p) => !starterSet.has(p.id) && p.position !== "GK").sort((a, b) => b.price - a.price);
  const benchOrder = new Map(benchOutfield.map((p, i) => [p.id, i + 1]));
  const pitchPlayers: PitchPlayer[] = squad.map((p) => ({
    id: p.id, name: p.name, teamCode: p.teamCode, position: p.position, price: p.price,
    starter: starterSet.has(p.id), benchOrder: benchOrder.get(p.id) ?? 0,
  }));

  return (
    <div className="grid gap-5 lg:grid-cols-[0.95fr_1.05fr]">
      {/* your squad */}
      <div className="rounded-lg border border-edge bg-panel/60 p-5">
        <div className="flex items-center justify-between">
          <Eyebrow>your squad</Eyebrow>
          <div className="flex items-center gap-2">
            <button
              onClick={autoDraft}
              disabled={drafting}
              className="inline-flex items-center gap-1.5 rounded-default border border-edge-2 px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.1em] text-chalk hover:border-edge-3 disabled:opacity-50"
            >
              {drafting ? <Loader2 size={11} className="animate-spin" /> : <Sparkles size={11} />}
              Auto-draft
            </button>
            {sel.length > 0 && (
              <button
                onClick={() => { setSel([]); setStarterSet(new Set()); setCaptain(null); setVice(null); }}
                className="grid h-7 w-7 place-items-center rounded-default border border-edge-2 text-steel hover:border-edge-3 hover:text-chalk"
              >
                <Trash2 size={12} />
              </button>
            )}
          </div>
        </div>

        {/* budget + counts */}
        <div className="mt-3">
          <div className="flex items-center justify-between font-mono text-[11px]">
            <span className="text-steel">
              budget <span className="text-chalk">{budget.toFixed(1)}</span>
              <span className="text-faint"> / {BUDGET}.0</span>
            </span>
            <span className={sel.length === 15 ? "text-live" : "text-steel"}>{sel.length}/15</span>
          </div>
          <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-panel-2">
            <div className={`h-full ${budget > BUDGET ? "bg-chalk" : "bg-live"}`} style={{ width: `${Math.min(100, (budget / BUDGET) * 100)}%` }} />
          </div>
        </div>

        {/* pitch + bench */}
        <div className="mt-3">
          <FantasyPitch
            players={pitchPlayers}
            captainId={captain}
            viceId={vice}
            mode="build"
            onCaptain={makeCaptain}
            onVice={makeVice}
            onSub={subToggle}
            onRemove={removePlayer}
            onAddPosition={(pos) => setFilter(pos)}
          />
          <p className="mt-2 font-mono text-[9.5px] uppercase tracking-[0.12em] text-faint">
            tap a shirt → armband · vice · bench · drop
          </p>
        </div>

        {/* chip */}
        <div className="mt-4">
          <Eyebrow className="mb-1.5">chip · one per run</Eyebrow>
          <div className="flex flex-wrap gap-1.5">
            {CHIPS.map((c) => (
              <button
                key={c.label}
                onClick={() => setChip(c.key)}
                title={c.blurb}
                className={`rounded-default border px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.08em] transition-colors ${
                  chip === c.key ? "border-live/50 bg-live-soft text-live" : "border-edge-2 text-steel hover:border-edge-3 hover:text-chalk"
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
          <span className="mt-1 block font-mono text-[10px] text-faint">{CHIPS.find((c) => c.key === chip)?.blurb}</span>
        </div>

        {errs.length > 0 && sel.length > 0 && <p className="mt-3 font-mono text-[10px] text-steel">{errs.join(" · ")}</p>}

        {/* gaffer review */}
        {starters.length > 0 && (
          <div className="mt-4 border-t border-edge pt-3">
            {!aiText && !aiRun ? (
              <button
                onClick={askGaffer}
                className="inline-flex items-center gap-1.5 rounded-default border border-edge-2 px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.1em] text-steel hover:border-edge-3 hover:text-chalk"
              >
                <Cpu size={11} /> Ask the Gaffer
              </button>
            ) : (
              <>
                <div className="mb-1.5 flex items-center gap-1.5">
                  {aiRun ? (
                    <span className="inline-flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.14em] text-live"><LiveDot /> on-device</span>
                  ) : (
                    <Eyebrow>the gaffer's verdict</Eyebrow>
                  )}
                </div>
                <p className={`text-[13.5px] leading-relaxed ${aiText ? "text-silver" : "text-faint"} ${aiRun ? "caret" : ""}`}>{aiText}</p>
                {aiDone && aiText && (
                  <div className="mt-2 flex gap-2">
                    <SpeakButton text={aiText} label="Hear it" />
                    <button onClick={askGaffer} className="rounded-default border border-edge-2 px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.1em] text-steel hover:border-edge-3 hover:text-chalk">Again</button>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* player pool */}
      <div className="rounded-lg border border-edge bg-panel/60 p-5">
        <div className="flex items-center justify-between">
          <Eyebrow>player pool</Eyebrow>
          <span className="font-mono text-[10px] text-faint">{filtered.length} players</span>
        </div>

        {/* squad composition tracker */}
        <div className="mt-2 flex flex-wrap gap-1.5">
          {POSITIONS.map((pos) => {
            const done = posCount[pos] === SQUAD_QUOTA[pos];
            return (
              <span key={pos} className={`rounded-chip border px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.1em] ${done ? "border-live/40 text-live" : "border-edge-2 text-steel"}`}>
                {pos} {posCount[pos]}/{SQUAD_QUOTA[pos]}
              </span>
            );
          })}
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search player or nation…"
            className="min-w-0 flex-1 rounded-default border border-edge-2 bg-panel-2 px-3 py-2 text-[13px] text-chalk placeholder:text-faint focus:border-edge-3 focus:outline-none"
          />
          <select
            value={teamFilter}
            onChange={(e) => setTeamFilter(e.target.value)}
            className="rounded-default border border-edge-2 bg-panel-2 px-2.5 py-2 font-mono text-[12px] text-chalk focus:border-edge-3 focus:outline-none"
          >
            <option value="ALL">All nations</option>
            {teams.map(([code, name]) => (
              <option key={code} value={code}>{name}</option>
            ))}
          </select>
        </div>

        <div className="mt-2 flex gap-1">
          {(["ALL", ...POSITIONS] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-chip px-2.5 py-1 font-mono text-[9.5px] uppercase tracking-[0.12em] transition-colors ${
                filter === f ? "bg-white/[0.06] text-chalk" : "text-steel hover:text-chalk"
              }`}
            >
              {f}
            </button>
          ))}
        </div>

        <div className="mt-2.5 max-h-[520px] space-y-1 overflow-y-auto pr-1">
          {shown.map((p) => {
            const picked = sel.includes(p.id);
            const posFull = !picked && posCount[p.position] >= SQUAD_QUOTA[p.position];
            return (
              <PlayerHoverCard key={p.id} playerId={p.id} className="block w-full">
                <button
                  onClick={() => toggle(p.id)}
                  disabled={posFull || (!picked && sel.length >= 15)}
                  className={`flex w-full items-center gap-2.5 rounded-default border px-2.5 py-2 text-left transition-colors disabled:opacity-40 ${
                    picked ? "border-live/40 bg-live-soft" : "border-edge-2 hover:border-edge-3 hover:bg-white/[0.02]"
                  }`}
                >
                  <Flag code={p.teamCode} size={20} />
                  <span className="w-9 font-mono text-[9px] uppercase tracking-[0.1em] text-faint">{p.position}</span>
                  <span className="min-w-0 flex-1 truncate text-[13.5px] text-chalk">{p.name}</span>
                  <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-steel">{p.teamCode}</span>
                  <span className="w-9 text-right font-mono text-[12px] text-silver">{p.price.toFixed(1)}</span>
                  <span className={`w-4 text-center font-mono text-[13px] ${picked ? "text-live" : "text-steel"}`}>{picked ? "−" : "+"}</span>
                </button>
              </PlayerHoverCard>
            );
          })}
          {filtered.length > shown.length && (
            <div className="px-3 py-2 text-center font-mono text-[10px] text-faint">+{filtered.length - shown.length} more — search or filter to narrow</div>
          )}
          {filtered.length === 0 && <div className="px-3 py-6 text-center font-mono text-[11px] text-faint">No players match.</div>}
        </div>
      </div>
    </div>
  );
}
