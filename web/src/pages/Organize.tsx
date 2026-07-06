import { useCallback, useEffect, useState } from "react";
import {
  Trophy,
  ArrowLeft,
  ArrowRight,
  Copy,
  Check,
  Play,
  UserPlus,
  Loader2,
  Users,
  Coins,
  Crown,
  X,
} from "lucide-react";
import { Card, Eyebrow, Button, Pill, Reveal, LiveDot, Avatar } from "../components/ui";
import { Onboard } from "../components/Onboard";
import { BootScreen } from "../components/BootScreen";
import { CreateCup } from "../components/organize/CreateCup";
import { CupBracket } from "../components/organize/CupBracket";
import { GafferDirector } from "../components/organize/GafferDirector";
import { useApp } from "../context";
import { api, aiLive, type Tournament } from "../lib/api";
import { usdt } from "../lib/format";
import { ExplorerLink } from "../components/ExplorerLink";

export default function Organize() {
  const { health, account, refreshAccount } = useApp();
  const [selected, setSelected] = useState<Tournament | null>(null);
  const [mine, setMine] = useState<Tournament[]>([]);

  const loadMine = useCallback(() => {
    if (!account) return setMine([]);
    api.tournaments.mine().then((r) => setMine(r.tournaments)).catch(() => {});
  }, [account]);

  useEffect(() => {
    if (!selected) loadMine();
  }, [selected, loadMine]);

  // Deep link: /organize?t=<id> opens a cup directly (shareable link).
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("t");
    if (id) api.tournaments.get(id).then(setSelected).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep an open/live cup fresh so late entrants and spectators see it advance.
  useEffect(() => {
    if (!selected || (selected.status !== "open" && selected.status !== "live")) return;
    const id = selected.id;
    const t = setInterval(() => {
      api.tournaments.get(id).then(setSelected).catch(() => {});
    }, 5000);
    return () => clearInterval(t);
  }, [selected?.id, selected?.status]);

  if (!health) return <BootScreen health={health} />;

  return (
    <main className="mx-auto max-w-[1180px] px-6 pb-24 pt-24">
      {selected ? (
        <Detail
          t={selected}
          isOrganizer={account?.id === selected.organizerId}
          isParticipant={selected.participants.some((p) => p.userId && p.userId === account?.id)}
          signedIn={!!account}
          onChange={(t) => {
            setSelected(t);
            refreshAccount();
          }}
          onBack={() => {
            setSelected(null);
            loadMine();
          }}
        />
      ) : (
        <Home account={!!account} mine={mine} onOpen={setSelected} onCreated={setSelected} refreshAccount={refreshAccount} />
      )}
    </main>
  );
}

/* ---------------- Home ---------------- */
function Home({
  account,
  mine,
  onOpen,
  onCreated,
  refreshAccount,
}: {
  account: boolean;
  mine: Tournament[];
  onOpen: (t: Tournament) => void;
  onCreated: (t: Tournament) => void;
  refreshAccount: () => void;
}) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const join = async () => {
    if (!code.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      const t = await api.tournaments.join({ code: code.trim() });
      refreshAccount();
      onOpen(t);
    } catch (e) {
      // If they're already in or it's started, just open it.
      try {
        const t = await api.tournaments.byCode(code.trim());
        onOpen(t);
      } catch {
        setErr((e as Error).message);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Reveal>
        <Eyebrow className="mb-2">organize · knockout cups</Eyebrow>
        <h1 className="max-w-2xl font-display text-[38px] font-semibold leading-[1.03] tracking-[-0.03em] text-chalk">
          Run a Cup. <span className="text-gradient">The pot runs itself.</span>
        </h1>
        <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-silver">
          Set an entry, share a code, and let the pot fill. Seed the draw, scores advance the bracket
          live, and the winner gets paid automatically — on-chain USD₮ or points.
        </p>
      </Reveal>

      <div className="mt-8 grid gap-5 lg:grid-cols-[1.05fr_0.95fr]">
        <div className="space-y-5">
          {account ? <CreateCup onCreated={onCreated} /> : <Onboard />}
        </div>

        <div className="space-y-5">
          <Card className="p-5">
            <Eyebrow className="mb-2">join a cup</Eyebrow>
            <p className="text-[13.5px] leading-relaxed text-silver">Got an invite code? Drop it in.</p>
            <div className="mt-3 flex gap-2">
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === "Enter" && join()}
                placeholder="CUP-XXXX"
                className="flex-1 rounded-default border border-edge-2 bg-panel-2 px-3 py-2.5 font-mono text-[14px] uppercase tracking-[0.1em] text-chalk placeholder:text-faint focus:border-edge-3 focus:outline-none"
              />
              <Button variant="outline" onClick={join} disabled={busy || !code.trim() || !account}>
                {busy ? <Loader2 size={13} className="animate-spin" /> : <ArrowRight size={13} />}
              </Button>
            </div>
            {!account && <p className="mt-2 font-mono text-[11px] text-steel">Pick a handle first to join.</p>}
            {err && <p className="mt-2 font-mono text-[11px] text-steel">{err}</p>}
          </Card>

          {account && mine.length > 0 && (
            <Card className="p-5">
              <Eyebrow className="mb-3">your cups</Eyebrow>
              <div className="flex flex-col gap-2">
                {mine.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => onOpen(t)}
                    className="group flex items-center justify-between rounded-default border border-edge-2 px-3 py-2.5 text-left transition-colors hover:border-edge-3 hover:bg-white/[0.02]"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-[14px] text-chalk">{t.name}</div>
                      <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-faint">
                        {t.code} · {t.participantCount}/{t.maxPlayers}
                      </div>
                    </div>
                    <StatusChip status={t.status} />
                  </button>
                ))}
              </div>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}

/* ---------------- Detail ---------------- */
function Detail({
  t,
  isOrganizer,
  isParticipant,
  signedIn,
  onChange,
  onBack,
}: {
  t: Tournament;
  isOrganizer: boolean;
  isParticipant: boolean;
  signedIn: boolean;
  onChange: (t: Tournament) => void;
  onBack: () => void;
}) {
  const { wallet, connectWallet, health } = useApp();
  const [busy, setBusy] = useState<string | null>(null);
  const [reporting, setReporting] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const isUsdt = t.currency === "usdt";
  const money = (n: number) => `${usdt(n, isUsdt ? 2 : 0)} ${isUsdt ? "USD₮" : "pts"}`;

  const act = async (key: string, fn: () => Promise<Tournament>) => {
    setBusy(key);
    setErr(null);
    try {
      onChange(await fn());
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const report = async (matchId: string, body: { homeScore: number; awayScore: number; penaltyWinner?: "home" | "away" }) => {
    setReporting(matchId);
    setErr(null);
    try {
      onChange(await api.tournaments.report(t.id, matchId, body));
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setReporting(null);
    }
  };

  const champion = t.participants.find((p) => p.id === t.winnerId);
  const canStart = isOrganizer && t.status === "open" && t.participantCount >= 2;

  return (
    <div>
      <button onClick={onBack} className="mb-5 inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.12em] text-steel hover:text-chalk">
        <ArrowLeft size={13} /> All cups
      </button>

      {/* header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <Trophy size={18} className="text-chalk" />
            <h1 className="font-display text-[30px] font-semibold tracking-[-0.03em] text-chalk">{t.name}</h1>
            <StatusChip status={t.status} />
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[11px] text-steel">
            <span>{t.maxPlayers}-team knockout</span>
            <span>·</span>
            <span>{t.entryFee > 0 ? `${money(t.entryFee)} entry` : "free cup"}</span>
            <span>·</span>
            <span className="inline-flex items-center gap-1 text-live">
              <Coins size={11} /> pot {money(t.pot)}
            </span>
          </div>
        </div>
        <CodeCopy code={t.code} />
      </div>

      {err && <p className="mt-4 font-mono text-[11.5px] text-steel">{err}</p>}

      {/* champion banner */}
      {t.status === "completed" && champion && (
        <Reveal className="mt-6">
          <div className="flex items-center gap-4 rounded-lg border border-live/30 bg-live-soft px-5 py-4">
            <Crown size={26} className="shrink-0 text-live" />
            <div>
              <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-live">champion</div>
              <div className="font-display text-[24px] font-semibold text-chalk">{champion.name}</div>
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

      {/* body */}
      {t.status === "open" ? (
        <OpenState
          t={t}
          isOrganizer={isOrganizer}
          isParticipant={isParticipant}
          signedIn={signedIn}
          money={money}
          busy={busy}
          canStart={canStart}
          onJoin={() =>
            act("join", async () => {
              if (isUsdt && !wallet) await connectWallet(); // ensure a USD₮ wallet before paying in
              return api.tournaments.join({ tournamentId: t.id });
            })
          }
          onAddEntrant={(name) => act("add", () => api.tournaments.addEntrant(t.id, name))}
          onStart={() => act("start", () => api.tournaments.start(t.id))}
          onCancel={() => act("cancel", () => api.tournaments.cancel(t.id))}
        />
      ) : t.status === "cancelled" ? (
        <div className="mt-8 rounded-lg border border-edge bg-panel/40 p-6 text-center">
          <X size={22} className="mx-auto text-steel" />
          <p className="mt-2 text-[14px] text-silver">This cup was cancelled and every entry was refunded.</p>
        </div>
      ) : (
        <div className="mt-7 space-y-6">
          {aiLive(health?.ai) && (
            <GafferDirector
              tournamentId={t.id}
              kind={t.status === "completed" ? "trophy" : "draw"}
              title={t.status === "completed" ? "the gaffer · trophy lift" : "the gaffer · the draw"}
            />
          )}
          <Card className="p-5">
            <div className="mb-3 flex items-center justify-between">
              <Eyebrow>the bracket</Eyebrow>
              {t.status === "live" && (
                <span className="inline-flex items-center gap-1.5 font-mono text-[9.5px] uppercase tracking-[0.14em] text-live">
                  <LiveDot /> in play
                </span>
              )}
            </div>
            <CupBracket tournament={t} canReport={isOrganizer && t.status === "live"} onReport={report} reporting={reporting} />
            {isOrganizer && t.status === "live" && (
              <p className="mt-2 font-mono text-[10.5px] text-faint">
                You're the organizer — tap a ready tie to enter the score. Winners advance automatically.
              </p>
            )}
          </Card>

          {t.status === "completed" && <Payouts t={t} money={money} />}
        </div>
      )}
    </div>
  );
}

/* ---------------- open state (roster + controls) ---------------- */
function OpenState({
  t,
  isOrganizer,
  isParticipant,
  signedIn,
  money,
  busy,
  canStart,
  onJoin,
  onAddEntrant,
  onStart,
  onCancel,
}: {
  t: Tournament;
  isOrganizer: boolean;
  isParticipant: boolean;
  signedIn: boolean;
  money: (n: number) => string;
  busy: string | null;
  canStart: boolean;
  onJoin: () => void;
  onAddEntrant: (name: string) => void;
  onStart: () => void;
  onCancel: () => void;
}) {
  const [entrant, setEntrant] = useState("");
  const slots = t.maxPlayers - t.participantCount;

  return (
    <div className="mt-7 grid gap-5 lg:grid-cols-[1fr_0.8fr]">
      {/* roster */}
      <Card className="p-5">
        <div className="mb-3 flex items-center justify-between">
          <Eyebrow>the field</Eyebrow>
          <span className="font-mono text-[11px] text-steel">
            {t.participantCount}/{t.maxPlayers}
          </span>
        </div>
        <div className="flex flex-col gap-2">
          {t.participants.map((p, i) => (
            <div key={p.id} className="flex items-center gap-3 rounded-default border border-edge-2 px-3 py-2">
              <span className="w-5 font-mono text-[11px] text-faint">{i + 1}</span>
              <Avatar seed={p.name} size={20} />
              <span className="min-w-0 flex-1 truncate text-[14px] text-chalk">{p.name}</span>
              {p.staked > 0 && <span className="font-mono text-[10px] text-steel">{money(p.staked)}</span>}
            </div>
          ))}
          {Array.from({ length: Math.max(0, slots) }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 rounded-default border border-dashed border-edge px-3 py-2">
              <span className="w-5 font-mono text-[11px] text-ghost">{t.participantCount + i + 1}</span>
              <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-ghost">open slot</span>
            </div>
          ))}
        </div>
      </Card>

      {/* controls */}
      <div className="space-y-5">
        {signedIn && !isParticipant && (
          <Card className="p-5">
            <Eyebrow className="mb-2">enter</Eyebrow>
            <p className="text-[13.5px] leading-relaxed text-silver">
              {t.entryFee > 0 ? `Pay ${money(t.entryFee)} to take a spot in the draw.` : "Grab a spot in the draw."}
            </p>
            <Button variant="solid" className="mt-3" onClick={onJoin} disabled={busy === "join" || slots <= 0}>
              {busy === "join" ? <Loader2 size={13} className="animate-spin" /> : <UserPlus size={13} />}
              {slots <= 0 ? "Bracket full" : t.entryFee > 0 ? `Join · ${money(t.entryFee)}` : "Join cup"}
            </Button>
          </Card>
        )}
        {isParticipant && (
          <div className="flex items-center gap-2 rounded-lg border border-live/30 bg-live-soft px-4 py-3">
            <Check size={15} className="text-live" />
            <span className="text-[13.5px] text-chalk">You're in. Waiting for the organizer to kick off.</span>
          </div>
        )}

        {isOrganizer && (
          <Card className="p-5">
            <Eyebrow className="mb-3">organizer</Eyebrow>
            {t.entryFee === 0 && (
              <div className="mb-3 flex gap-2">
                <input
                  value={entrant}
                  onChange={(e) => setEntrant(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && entrant.trim()) {
                      onAddEntrant(entrant.trim());
                      setEntrant("");
                    }
                  }}
                  placeholder="Add a team / player…"
                  maxLength={40}
                  className="flex-1 rounded-default border border-edge-2 bg-panel-2 px-3 py-2 text-[13px] text-chalk placeholder:text-faint focus:border-edge-3 focus:outline-none"
                />
                <Button
                  variant="outline"
                  onClick={() => {
                    if (entrant.trim()) {
                      onAddEntrant(entrant.trim());
                      setEntrant("");
                    }
                  }}
                  disabled={busy === "add" || !entrant.trim()}
                >
                  <UserPlus size={13} />
                </Button>
              </div>
            )}
            <Button variant="solid" className="w-full" onClick={onStart} disabled={!canStart || busy === "start"}>
              {busy === "start" ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
              {t.participantCount < 2 ? "Need 2+ entrants" : "Seed & kick off"}
            </Button>
            <button
              onClick={onCancel}
              disabled={busy === "cancel"}
              className="mt-2 w-full rounded-default border border-edge px-3 py-2 font-mono text-[10px] uppercase tracking-[0.12em] text-faint hover:border-edge-2 hover:text-steel"
            >
              {busy === "cancel" ? "Cancelling…" : "Cancel & refund"}
            </button>
          </Card>
        )}
      </div>
    </div>
  );
}

/* ---------------- payouts ---------------- */
function Payouts({ t, money }: { t: Tournament; money: (n: number) => string }) {
  const paid = t.participants.filter((p) => p.payout != null && p.payout > 0).sort((a, b) => (a.placement ?? 9) - (b.placement ?? 9));
  if (!paid.length) return null;
  return (
    <Card className="p-5">
      <Eyebrow className="mb-3">payouts</Eyebrow>
      <div className="flex flex-col gap-2">
        {paid.map((p) => (
          <div key={p.id} className="flex items-center gap-3 rounded-default border border-edge-2 px-3 py-2">
            <span className="w-5 font-mono text-[11px] text-live">{p.placement}</span>
            <Avatar seed={p.name} size={20} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[14px] text-chalk">{p.name}</div>
              {p.payoutTx && <div className="flex items-center gap-1 font-mono text-[9.5px] text-faint">paid ✓ <ExplorerLink hash={p.payoutTx} size={9} /></div>}
            </div>
            <span className="font-mono text-[12px] text-live">+{money(p.payout ?? 0)}</span>
          </div>
        ))}
      </div>
      <p className="mt-3 font-mono text-[10px] text-faint">
        {t.currency === "usdt"
          ? "Real USD₮ — paid on-chain from escrow to each winner's self-custodial wallet."
          : "Paid straight to the players' balances — same settlement path that moves USD₮ on the live tier."}
      </p>
    </Card>
  );
}

/* ---------------- bits ---------------- */
function StatusChip({ status }: { status: Tournament["status"] }) {
  if (status === "live")
    return (
      <span className="inline-flex items-center gap-1.5 rounded-chip bg-live-soft px-2 py-1 font-mono text-[9.5px] font-semibold uppercase tracking-[0.14em] text-live">
        <LiveDot /> Live
      </span>
    );
  if (status === "completed") return <Pill strong>Complete</Pill>;
  if (status === "cancelled") return <Pill>Cancelled</Pill>;
  return <Pill strong>Open</Pill>;
}

function CodeCopy({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard?.writeText(code).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
      className="group inline-flex items-center gap-2 rounded-default border border-edge-2 px-3 py-2 hover:border-edge-3"
    >
      <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-faint">invite</span>
      <span className="font-mono text-[14px] tracking-[0.1em] text-chalk">{code}</span>
      {copied ? <Check size={13} className="text-live" /> : <Copy size={13} className="text-steel group-hover:text-chalk" />}
    </button>
  );
}
