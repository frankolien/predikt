import { useCallback, useEffect, useState } from "react";
import {
  Users,
  ArrowLeft,
  ArrowRight,
  Copy,
  Check,
  Lock,
  Coins,
  Crown,
  Loader2,
  ChevronDown,
  Trophy,
} from "lucide-react";
import { Card, Eyebrow, Button, Pill, Reveal, LiveDot, Avatar } from "../components/ui";
import { Onboard } from "../components/Onboard";
import { BootScreen } from "../components/BootScreen";
import { SquadBuilder, type SquadState } from "../components/fantasy/SquadBuilder";
import { FantasyPitch } from "../components/fantasy/FantasyPitch";
import { useApp } from "../context";
import { api, type FantasyLeague, type FantasyStanding } from "../lib/api";
import { usdt } from "../lib/format";

const SPLITS: Array<{ key: string; label: string; bps: number[] }> = [
  { key: "wta", label: "Winner takes all", bps: [10000] },
  { key: "top3", label: "60 · 25 · 15", bps: [6000, 2500, 1500] },
];

export default function Fantasy() {
  const { health, account, refreshAccount } = useApp();
  const [squad, setSquad] = useState<SquadState>({ squadIds: [], starterIds: [], captainId: null, viceId: null, chip: null, valid: false });
  const [selected, setSelected] = useState<FantasyLeague | null>(null);
  const [mine, setMine] = useState<FantasyLeague[]>([]);

  const loadMine = useCallback(() => {
    if (!account) return setMine([]);
    api.fantasy.mine().then((r) => setMine(r.leagues)).catch(() => {});
  }, [account]);

  useEffect(() => {
    if (!selected) loadMine();
  }, [selected, loadMine]);

  // Deep link: /fantasy?l=<id> opens a league directly (shareable link).
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("l");
    if (id) api.fantasy.getLeague(id).then(setSelected).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selected || selected.status === "settled") return;
    const id = selected.id;
    const t = setInterval(() => api.fantasy.getLeague(id).then(setSelected).catch(() => {}), 5000);
    return () => clearInterval(t);
  }, [selected?.id, selected?.status]);

  if (!health) return <BootScreen health={health} />;

  return (
    <main className="mx-auto max-w-[1180px] px-6 pb-24 pt-24">
      {selected ? (
        <LeagueDetail
          lg={selected}
          isCreator={account?.id === selected.creatorId}
          meId={account?.id}
          onChange={(l) => { setSelected(l); refreshAccount(); }}
          onBack={() => { setSelected(null); loadMine(); }}
        />
      ) : (
        <Home
          account={!!account}
          squad={squad}
          setSquad={setSquad}
          mine={mine}
          onOpen={setSelected}
          refreshAccount={refreshAccount}
        />
      )}
    </main>
  );
}

/* ---------------- Home ---------------- */
function Home({
  account,
  squad,
  setSquad,
  mine,
  onOpen,
  refreshAccount,
}: {
  account: boolean;
  squad: SquadState;
  setSquad: (s: SquadState) => void;
  mine: FantasyLeague[];
  onOpen: (l: FantasyLeague) => void;
  refreshAccount: () => void;
}) {
  return (
    <>
      <Reveal>
        <Eyebrow className="mb-2">fantasy · salary-cap leagues</Eyebrow>
        <h1 className="max-w-2xl font-display text-[38px] font-semibold leading-[1.03] tracking-[-0.03em] text-chalk">
          Draft a World Cup XI. <span className="text-gradient">Watch it pay.</span>
        </h1>
        <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-silver">
          Draft a 15-man squad under 100 credits, name your XI, captain and vice, then join a mini-league.
          Your XI scores live off the real feed — bench players auto-sub in, and the prize pool pays out to the winners.
        </p>
      </Reveal>

      {!account ? (
        <div className="mt-8 max-w-md">
          <Onboard />
        </div>
      ) : (
        <>
          <div className="mt-8">
            <SquadBuilder onChange={setSquad} />
          </div>
          <div className="mt-6 grid gap-5 lg:grid-cols-[1fr_1fr]">
            <LeagueActions squad={squad} onOpen={onOpen} refreshAccount={refreshAccount} />
            {mine.length > 0 && (
              <Card className="p-5">
                <Eyebrow className="mb-3">your leagues</Eyebrow>
                <div className="flex flex-col gap-2">
                  {mine.map((l) => (
                    <button
                      key={l.id}
                      onClick={() => onOpen(l)}
                      className="group flex items-center justify-between rounded-default border border-edge-2 px-3 py-2.5 text-left hover:border-edge-3 hover:bg-white/[0.02]"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-[14px] text-chalk">{l.name}</div>
                        <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-faint">
                          {l.code} · {l.memberCount} in
                        </div>
                      </div>
                      <LeagueStatus status={l.status} />
                    </button>
                  ))}
                </div>
              </Card>
            )}
          </div>
        </>
      )}
    </>
  );
}

function fantasyError(msg: string): string {
  const m = (msg || "").toLowerCase();
  if (m.includes("unknown fan wallet") || m.includes("warming up")) return "Unlock your wallet with your PIN to stake real USD₮.";
  if (m.includes("insufficient")) return "Not enough for that buy-in.";
  return msg;
}

function LeagueActions({
  squad,
  onOpen,
  refreshAccount,
}: {
  squad: SquadState;
  onOpen: (l: FantasyLeague) => void;
  refreshAccount: () => void;
}) {
  const [name, setName] = useState("");
  const [buyIn, setBuyIn] = useState(50);
  const [currency, setCurrency] = useState<"points" | "usdt">("points");
  const [split, setSplit] = useState(SPLITS[0]);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const guard = () => {
    if (!squad.valid) {
      setErr("Complete a valid 15-man squad — a legal XI, a captain and a vice — first.");
      return false;
    }
    return true;
  };
  const entry = () => ({
    squadIds: squad.squadIds,
    starterIds: squad.starterIds,
    captainId: squad.captainId!,
    viceId: squad.viceId!,
    chip: squad.chip,
  });

  const create = async () => {
    setErr(null);
    if (!guard()) return;
    setBusy("create");
    try {
      const lg = await api.fantasy.createLeague({ name: name.trim() || "Fantasy League", buyIn, splitBps: split.bps, currency });
      const full = await api.fantasy.join({ leagueId: lg.id, ...entry() });
      refreshAccount();
      onOpen(full);
    } catch (e) {
      setErr(fantasyError((e as Error).message));
    } finally {
      setBusy(null);
    }
  };

  const join = async () => {
    setErr(null);
    if (!code.trim()) return;
    if (!guard()) return;
    setBusy("join");
    try {
      const lg = await api.fantasy.join({ code: code.trim(), ...entry() });
      refreshAccount();
      onOpen(lg);
    } catch (e) {
      setErr(fantasyError((e as Error).message));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card className="p-5">
      <Eyebrow className="mb-3">enter a league</Eyebrow>

      <div className="flex flex-col gap-3">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={60}
          placeholder="League name (e.g. The Sunday Boys)"
          className="rounded-default border border-edge-2 bg-panel-2 px-3 py-2.5 text-[14px] text-chalk placeholder:text-faint focus:border-edge-3 focus:outline-none"
        />
        <div className="flex gap-1.5">
          <button
            onClick={() => { setCurrency("points"); setBuyIn(50); }}
            className={`rounded-default border px-2.5 py-1.5 font-mono text-[10px] transition-colors ${
              currency === "points" ? "border-edge-3 bg-white/[0.04] text-chalk" : "border-edge-2 text-steel hover:border-edge-3"
            }`}
          >
            Free · points
          </button>
          <button
            onClick={() => { setCurrency("usdt"); setBuyIn(5); }}
            className={`rounded-default border px-2.5 py-1.5 font-mono text-[10px] transition-colors ${
              currency === "usdt" ? "border-edge-3 bg-white/[0.04] text-chalk" : "border-edge-2 text-steel hover:border-edge-3"
            }`}
          >
            Real · USD₮
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2">
            <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-faint">buy-in {currency === "usdt" ? "(USD₮)" : "(points)"}</span>
            <input
              type="number"
              min={0}
              step={currency === "usdt" ? 0.5 : 1}
              value={buyIn}
              onChange={(e) => setBuyIn(Number(e.target.value))}
              className="w-20 rounded-default border border-edge-2 bg-panel-2 px-2.5 py-2 font-mono text-[13px] text-chalk focus:border-edge-3 focus:outline-none"
            />
          </label>
          {SPLITS.map((s) => (
            <button
              key={s.key}
              onClick={() => setSplit(s)}
              className={`rounded-default border px-2.5 py-1.5 font-mono text-[10px] transition-colors ${
                split.key === s.key ? "border-edge-3 bg-white/[0.04] text-chalk" : "border-edge-2 text-steel hover:border-edge-3"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
        <Button variant="solid" onClick={create} disabled={busy === "create"}>
          {busy === "create" ? <Loader2 size={13} className="animate-spin" /> : <Trophy size={13} />}
          Create league &amp; enter
        </Button>

        <div className="flex items-center gap-2 pt-1">
          <div className="h-px flex-1 bg-edge" />
          <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-faint">or join by code</span>
          <div className="h-px flex-1 bg-edge" />
        </div>
        <div className="flex gap-2">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === "Enter" && join()}
            placeholder="FL-XXXX"
            className="flex-1 rounded-default border border-edge-2 bg-panel-2 px-3 py-2.5 font-mono text-[14px] uppercase tracking-[0.1em] text-chalk placeholder:text-faint focus:border-edge-3 focus:outline-none"
          />
          <Button variant="outline" onClick={join} disabled={busy === "join" || !code.trim()}>
            {busy === "join" ? <Loader2 size={13} className="animate-spin" /> : <ArrowRight size={13} />}
          </Button>
        </div>
        {err && <p className="font-mono text-[11px] text-steel">{err}</p>}
      </div>
    </Card>
  );
}

/* ---------------- Detail ---------------- */
function LeagueDetail({
  lg,
  isCreator,
  meId,
  onChange,
  onBack,
}: {
  lg: FantasyLeague;
  isCreator: boolean;
  meId?: string;
  onChange: (l: FantasyLeague) => void;
  onBack: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const money = (n: number) => `${usdt(n, 0)} ${lg.currency === "usdt" ? "USD₮" : "pts"}`;

  const act = async (key: string, fn: () => Promise<FantasyLeague>) => {
    setBusy(key);
    setErr(null);
    try {
      onChange(await fn());
    } catch (e) {
      setErr(fantasyError((e as Error).message));
    } finally {
      setBusy(null);
    }
  };

  const champion = lg.status === "settled" ? lg.standings.find((s) => s.placement === 1) : null;
  const me = lg.standings.find((s) => s.userId === meId);

  return (
    <div>
      <button onClick={onBack} className="mb-5 inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.12em] text-steel hover:text-chalk">
        <ArrowLeft size={13} /> All leagues
      </button>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <Users size={18} className="text-chalk" />
            <h1 className="font-display text-[30px] font-semibold tracking-[-0.03em] text-chalk">{lg.name}</h1>
            <LeagueStatus status={lg.status} />
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[11px] text-steel">
            <span>{lg.memberCount} managers</span>
            <span>·</span>
            <span>{lg.buyIn > 0 ? `${money(lg.buyIn)} buy-in` : "free"}</span>
            <span>·</span>
            <span className="inline-flex items-center gap-1 text-live"><Coins size={11} /> pot {money(lg.pot)}</span>
          </div>
        </div>
        <CodeCopy code={lg.code} />
      </div>

      {err && <p className="mt-4 font-mono text-[11.5px] text-steel">{err}</p>}

      {champion && (
        <Reveal className="mt-6">
          <div className="flex items-center gap-4 rounded-lg border border-live/30 bg-live-soft px-5 py-4">
            <Crown size={26} className="shrink-0 text-live" />
            <div>
              <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-live">winner</div>
              <div className="font-display text-[24px] font-semibold text-chalk">{champion.handle}</div>
            </div>
            {champion.payout != null && champion.payout > 0 && (
              <div className="ml-auto text-right">
                <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-faint">takes home</div>
                <div className="font-display text-[22px] font-semibold text-live">{money(champion.payout)}</div>
              </div>
            )}
          </div>
        </Reveal>
      )}

      {/* creator controls */}
      {isCreator && lg.status !== "settled" && (
        <div className="mt-5 flex items-center gap-2">
          {lg.status === "open" ? (
            <Button variant="solid" onClick={() => act("start", () => api.fantasy.start(lg.id))} disabled={busy === "start"}>
              {busy === "start" ? <Loader2 size={13} className="animate-spin" /> : <Lock size={13} />}
              Lock league
            </Button>
          ) : (
            <Button variant="solid" onClick={() => act("settle", () => api.fantasy.settle(lg.id))} disabled={busy === "settle"}>
              {busy === "settle" ? <Loader2 size={13} className="animate-spin" /> : <Trophy size={13} />}
              Settle &amp; pay out
            </Button>
          )}
          <span className="font-mono text-[10.5px] text-faint">
            {lg.status === "open" ? "locks every XI — then it scores live" : "pays the pot by final SCORE"}
          </span>
        </div>
      )}

      {/* your XI — the pitch, live scores, and where the points go */}
      {me && (
        <Reveal className="mt-6">
          <YourXI me={me} live={lg.status === "live"} money={money} currency={lg.currency} />
        </Reveal>
      )}

      {/* standings */}
      <Card className="mt-6 p-5">
        <div className="mb-3 flex items-center justify-between">
          <Eyebrow>standings · by score</Eyebrow>
          {lg.status === "live" && lg.scoringStarted !== false && (
            <span className="inline-flex items-center gap-1.5 font-mono text-[9.5px] uppercase tracking-[0.14em] text-live">
              <LiveDot /> scoring live
            </span>
          )}
        </div>
        {lg.scoringStarted === false && lg.status !== "settled" && (
          <p className="mb-3 rounded-default border border-edge-2 bg-panel-2 px-3 py-2 font-mono text-[10.5px] leading-relaxed text-faint">
            Everyone starts on <span className="text-chalk">0</span> — points begin counting when the first match kicks off.
          </p>
        )}
        {lg.standings.length === 0 ? (
          <p className="py-6 text-center font-mono text-[12px] text-faint">No squads yet — share the code {lg.code}.</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {lg.standings.map((s) => (
              <StandingRow
                key={s.squadId}
                s={s}
                isMe={s.userId === meId}
                money={money}
                expanded={open === s.squadId}
                onToggle={() => setOpen(open === s.squadId ? null : s.squadId)}
              />
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function toPitch(players: FantasyStanding["players"]) {
  return players.map((p) => ({
    id: p.id,
    name: p.name,
    teamCode: p.teamCode,
    position: p.position,
    price: p.price,
    points: p.points,
    starter: p.starter,
    benchOrder: p.benchOrder,
  }));
}
const short = (name?: string) => (name ? name.split(/\s+/).slice(-1)[0] : "—");

/* Your squad on the pitch + bench + a plain-language legend so "points" never collides. */
function YourXI({ me, live, money, currency }: { me: FantasyStanding; live: boolean; money: (n: number) => string; currency: "points" | "usdt" }) {
  const armband = me.players.find((p) => p.id === (me.captainedId ?? me.captainId));
  const viceTookOver = me.captainedId != null && me.captainedId !== me.captainId;
  const capMult = me.chip === "tc" ? "×3" : "×2";
  return (
    <div className="grid gap-5 rounded-lg border border-edge bg-panel/60 p-5 lg:grid-cols-[minmax(0,360px)_1fr]">
      <div>
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Eyebrow>your squad</Eyebrow>
            <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-faint">{me.formation}</span>
          </div>
          {live && (
            <span className="inline-flex items-center gap-1.5 font-mono text-[9.5px] uppercase tracking-[0.14em] text-live">
              <LiveDot /> scoring live
            </span>
          )}
        </div>
        <FantasyPitch
          players={toPitch(me.players)}
          captainId={me.captainId}
          viceId={me.viceCaptainId}
          chip={me.chip}
          autoSubIn={me.autoSubIn}
          autoSubOut={me.autoSubOut}
          mode="view"
          className="mx-auto max-w-[360px]"
        />
      </div>

      <div className="flex flex-col">
        <div className="grid grid-cols-3 gap-2.5">
          <Stat label="rank" value={`#${me.rank}`} />
          <Stat label="score" value={String(me.points)} accent />
          <Stat label={`captain ${capMult}`} value={short(armband?.name)} />
        </div>
        {viceTookOver && (
          <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.12em] text-live">
            ▲ vice took the armband — your captain's team didn't feature
          </p>
        )}

        <div className="mt-4 rounded-default border border-edge bg-void/40 p-3.5">
          <Eyebrow className="mb-2">how it scores</Eyebrow>
          <ul className="flex flex-col gap-2 text-[12.5px] leading-relaxed text-silver">
            <li>
              <span className="text-chalk">SCORE</span> is your XI's match points — an appearance, team goals
              (weighted by position), wins and clean sheets. Your <span className="text-live">captain</span> scores {capMult}.
              It's your rank, <span className="text-chalk">not</span> money.
            </li>
            <li>
              If a starter's team doesn't play, a <span className="text-chalk">bench</span> player is auto-subbed on; if your
              captain blanks, the <span className="text-chalk">vice</span> takes the armband.
            </li>
            <li>
              <span className="text-chalk">Buy-in &amp; pot</span> are {currency === "usdt" ? "real USD₮, paid on-chain from your wallet" : "play-points"} — you
              staked {money(me.staked)} {currency === "usdt" ? "USD₮" : "pts"} into the pot. Whoever's on top when the league settles takes it home.
            </li>
          </ul>
        </div>

        {me.payout != null && me.payout > 0 && (
          <div className="mt-3 flex items-center justify-between rounded-default border border-live/30 bg-live-soft px-3.5 py-2.5">
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-live">you won</span>
            <span className="font-display text-[18px] font-semibold text-live">{money(me.payout)}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-default border border-edge-2 bg-void/40 px-3 py-2.5">
      <div className="font-mono text-[9px] uppercase tracking-[0.14em] text-faint">{label}</div>
      <div className={`mt-0.5 truncate font-display text-[20px] font-semibold ${accent ? "text-live" : "text-chalk"}`}>
        {value}
      </div>
    </div>
  );
}

function StandingRow({
  s,
  isMe,
  money,
  expanded,
  onToggle,
}: {
  s: FantasyStanding;
  isMe: boolean;
  money: (n: number) => string;
  expanded: boolean;
  onToggle: () => void;
}) {
  const armband = s.players.find((p) => p.id === (s.captainedId ?? s.captainId));
  return (
    <div className={`rounded-default border ${isMe ? "border-live/40 bg-live-soft" : "border-edge-2"}`}>
      <button onClick={onToggle} className="flex w-full items-center gap-3 px-3 py-2.5 text-left">
        <span className={`w-5 font-mono text-[12px] ${s.rank <= 3 ? "text-live" : "text-faint"}`}>{s.rank}</span>
        <Avatar seed={s.handle} size={22} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 truncate text-[14px] text-chalk">
            {s.handle} {isMe && <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-live">you</span>}
            {s.chip && (
              <span className="rounded-chip border border-live/40 px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-[0.1em] text-live">
                {s.chip === "tc" ? "3×C" : "BB"}
              </span>
            )}
          </div>
          <div className="font-mono text-[9.5px] uppercase tracking-[0.1em] text-faint">
            © {short(armband?.name)} · {s.formation} · {s.budgetUsed.toFixed(1)} spent
          </div>
        </div>
        {s.payout != null && s.payout > 0 && <span className="font-mono text-[11px] text-live">+{money(s.payout)}</span>}
        <span className="font-display text-[20px] font-semibold text-chalk">{s.points}</span>
        <ChevronDown size={14} className={`text-steel transition-transform ${expanded ? "rotate-180" : ""}`} />
      </button>
      {expanded && (
        <div className="border-t border-edge p-3">
          <FantasyPitch
            players={toPitch(s.players)}
            captainId={s.captainId}
            viceId={s.viceCaptainId}
            chip={s.chip}
            autoSubIn={s.autoSubIn}
            autoSubOut={s.autoSubOut}
            mode="view"
            className="mx-auto max-w-[340px]"
          />
        </div>
      )}
    </div>
  );
}

/* ---------------- bits ---------------- */
function LeagueStatus({ status }: { status: FantasyLeague["status"] }) {
  if (status === "live")
    return (
      <span className="inline-flex items-center gap-1.5 rounded-chip bg-live-soft px-2 py-1 font-mono text-[9.5px] font-semibold uppercase tracking-[0.14em] text-live">
        <LiveDot /> Live
      </span>
    );
  if (status === "settled") return <Pill strong>Settled</Pill>;
  return <Pill strong>Open</Pill>;
}

function CodeCopy({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => navigator.clipboard?.writeText(code).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); })}
      className="group inline-flex items-center gap-2 rounded-default border border-edge-2 px-3 py-2 hover:border-edge-3"
    >
      <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-faint">invite</span>
      <span className="font-mono text-[14px] tracking-[0.1em] text-chalk">{code}</span>
      {copied ? <Check size={13} className="text-live" /> : <Copy size={13} className="text-steel group-hover:text-chalk" />}
    </button>
  );
}
