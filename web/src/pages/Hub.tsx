import { useState } from "react";
import { Link } from "react-router-dom";
import {
  Wallet,
  Cpu,
  Trophy,
  Users,
  Ticket,
  Sparkles,
  ArrowRight,
  ArrowUpRight,
  ShieldCheck,
  Coins,
  Plus,
  Loader2,
  Copy,
  Check,
} from "lucide-react";
import { Card, Eyebrow, Pill, LiveDot, Reveal, Button } from "../components/ui";
import { Onboard } from "../components/Onboard";
import { BootScreen } from "../components/BootScreen";
import { useApp } from "../context";
import { type AiStatus, aiLive } from "../lib/api";
import { usdt, shortAddr } from "../lib/format";

/* ------------------------------------------------------------------ */
/* Money spine — the self-custodial USD₮ wallet (WDK), plus play points */
/* ------------------------------------------------------------------ */
function MoneySpine() {
  const { wallet, connectWallet, account } = useApp();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const copyAddress = (address: string) => {
    navigator.clipboard
      ?.writeText(address)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1400);
      })
      .catch(() => {
        /* clipboard blocked */
      });
  };

  const create = async () => {
    setBusy(true);
    setErr(null);
    try {
      await connectWallet();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="flex flex-col gap-4 p-5">
      <div className="flex items-center justify-between">
        <Eyebrow>money · self-custodial</Eyebrow>
        <Pill strong>
          <Wallet size={11} /> WDK
        </Pill>
      </div>

      {wallet ? (
        <div className="flex flex-col gap-3">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-faint">USD₮ balance</div>
            <div className="mt-0.5 flex items-baseline gap-1.5">
              <span className="font-display text-[34px] font-semibold leading-none text-chalk">
                {usdt(wallet.usdtHuman)}
              </span>
              <span className="font-mono text-[12px] text-steel">USD₮</span>
            </div>
          </div>
          <button
            onClick={() => copyAddress(wallet.address)}
            title={copied ? "Address copied" : `Copy address · ${wallet.address}`}
            className="group flex w-full items-center gap-2 rounded-default border border-edge bg-panel-2/60 px-3 py-2 text-left transition-colors hover:border-edge-2"
          >
            <ShieldCheck size={13} className="shrink-0 text-live" />
            <span className="font-mono text-[11px] text-silver">{shortAddr(wallet.address)}</span>
            {copied ? (
              <Check size={12} className="text-live" />
            ) : (
              <Copy size={12} className="text-steel transition-colors group-hover:text-chalk" />
            )}
            <span className="ml-auto font-mono text-[9.5px] uppercase tracking-[0.14em] text-faint">
              {wallet.backend}
            </span>
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-[13.5px] leading-relaxed text-silver">
            A real, non-custodial USD₮ wallet — the keys live on your device, not our server. It's the
            money rail under every module: entry fees in, prizes straight back out.
          </p>
          <Button variant="solid" onClick={create} disabled={busy} className="self-start">
            {busy ? <Loader2 size={13} className="animate-spin" /> : <Wallet size={13} />}
            {busy ? "Connecting…" : "Connect USD₮ wallet"}
          </Button>
          {err && <p className="font-mono text-[11px] text-steel">{err}</p>}
        </div>
      )}

      <div className="mt-auto flex items-center justify-between border-t border-edge pt-3">
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-faint">play balance</span>
        <span className="inline-flex items-center gap-1.5 font-mono text-[13px] text-live">
          <Coins size={12} /> {account ? usdt(account.points, 0) : "—"} pts
        </span>
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* AI spine — the Gaffer, on-device via QVAC                           */
/* ------------------------------------------------------------------ */
function AiSpine({ ai }: { ai?: AiStatus }) {
  const state = ai?.state ?? "idle";
  const ready = state === "ready";
  const loading = state === "loading";
  const label = (ai?.model || "").replace(/_/g, " ").replace(/ INST.*$/i, "").trim() || "Llama 3.2";
  return (
    <Card className="flex flex-col gap-4 p-5">
      <div className="flex items-center justify-between">
        <Eyebrow>the gaffer · on-device</Eyebrow>
        <Pill strong>
          <Cpu size={11} /> QVAC
        </Pill>
      </div>
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          {ready ? <LiveDot /> : <Cpu size={14} className="text-steel" />}
          <span className="font-display text-[19px] font-semibold text-chalk">
            {ready ? "Live on your machine" : loading ? "Loading model…" : state === "mock" ? "Scripted pundit" : "Warming up"}
          </span>
        </div>
        <p className="text-[13.5px] leading-relaxed text-silver">
          One AI runs across the whole platform — reading ties, drafting squads, directing tournaments,
          talking out loud. It runs locally through QVAC. No cloud, nothing leaves your device.
        </p>
        {loading && (
          <div className="h-1 overflow-hidden rounded-full bg-panel-2">
            <div className="h-full bg-live transition-all" style={{ width: `${Math.round((ai?.progress ?? 0) * 100)}%` }} />
          </div>
        )}
        <div className="flex items-center justify-between border-t border-edge pt-3">
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-faint">model</span>
          <span className="font-mono text-[12px] text-silver">{label}</span>
        </div>
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Module tile                                                         */
/* ------------------------------------------------------------------ */
type Tag = "LIVE" | "NEW" | "SOON";
interface Module {
  name: string;
  tagline: string;
  desc: string;
  to?: string;
  tag: Tag;
  icon: typeof Trophy;
  tracks: string[];
}

const MODULES: Module[] = [
  {
    name: "Predict",
    tagline: "live prediction pools",
    desc: "Call the score, pool up with mates by invite code, split the pot at full time.",
    to: "/predict",
    tag: "LIVE",
    icon: Sparkles,
    tracks: ["WDK"],
  },
  {
    name: "Organize",
    tagline: "knockout tournaments",
    desc: "Run a Cup with a real entry fee. Seed the draw, scores advance the bracket, the pot auto-pays the winner.",
    to: "/organize",
    tag: "NEW",
    icon: Trophy,
    tracks: ["WDK"],
  },
  {
    name: "Fantasy",
    tagline: "salary-cap leagues",
    desc: "Draft a World Cup XI under a budget, captain your talisman, watch points tick up live. Mini-leagues with a real prize pool.",
    to: "/fantasy",
    tag: "NEW",
    icon: Users,
    tracks: ["WDK"],
  },
  {
    name: "Access",
    tagline: "tickets & fan payments",
    desc: "Sell entry to your five-a-side, your watch party, your local final — paid and settled in USD₮.",
    tag: "SOON",
    icon: Ticket,
    tracks: ["WDK"],
  },
];

function ModuleTile({ m, i }: { m: Module; i: number }) {
  const soon = m.tag === "SOON";
  const inner = (
    <div
      className={`group relative flex h-full flex-col gap-3 rounded-lg border p-5 transition-all ${
        soon
          ? "border-edge bg-panel/30"
          : "border-edge-2 bg-panel/60 hover:-translate-y-0.5 hover:border-edge-3 hover:bg-panel"
      }`}
    >
      <div className="flex items-start justify-between">
        <div
          className={`grid h-10 w-10 place-items-center rounded-default border ${
            soon ? "border-edge text-steel" : "border-edge-2 text-chalk"
          }`}
        >
          <m.icon size={18} />
        </div>
        <TagPill tag={m.tag} />
      </div>
      <div>
        <div className="flex items-center gap-1.5">
          <span className="font-display text-[19px] font-semibold text-chalk">{m.name}</span>
          {!soon && (
            <ArrowUpRight size={15} className="text-steel transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-chalk" />
          )}
        </div>
        <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-faint">{m.tagline}</div>
      </div>
      <p className="text-[13px] leading-relaxed text-steel">{m.desc}</p>
      <div className="mt-auto flex items-center gap-1.5 pt-1">
        {m.tracks.map((t) => (
          <span
            key={t}
            className="rounded-chip border border-edge-2 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.14em] text-steel"
          >
            {t}
          </span>
        ))}
      </div>
    </div>
  );
  return (
    <Reveal delay={i * 0.05} className="h-full">
      {soon || !m.to ? inner : <Link to={m.to} className="block h-full">{inner}</Link>}
    </Reveal>
  );
}

function TagPill({ tag }: { tag: Tag }) {
  if (tag === "LIVE")
    return (
      <span className="inline-flex items-center gap-1.5 rounded-chip bg-live-soft px-2 py-1 font-mono text-[9.5px] font-semibold uppercase tracking-[0.14em] text-live">
        <LiveDot /> Live
      </span>
    );
  if (tag === "NEW")
    return (
      <span className="rounded-chip border border-edge-3 px-2 py-1 font-mono text-[9.5px] font-semibold uppercase tracking-[0.14em] text-chalk">
        New
      </span>
    );
  return (
    <span className="rounded-chip border border-edge px-2 py-1 font-mono text-[9.5px] uppercase tracking-[0.14em] text-faint">
      Soon
    </span>
  );
}

/* ------------------------------------------------------------------ */
export default function Hub() {
  const { health, account } = useApp();
  if (!health) return <BootScreen health={health} />;
  const showAi = aiLive(health.ai);

  return (
    <main className="mx-auto max-w-[1180px] px-6 pb-24 pt-24">
      <Reveal>
        <Eyebrow className="mb-2">predikt · the football economy</Eyebrow>
        <h1 className="max-w-2xl font-display text-[40px] font-semibold leading-[1.02] tracking-[-0.03em] text-chalk">
          One wallet. <span className="text-gradient">Every way to play</span> the World Cup.
        </h1>
        <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-silver">
          Predict, organize, and play fantasy — all on one self-custodial USD₮ wallet. Real money in,
          real money out. Your keys, your money, no custody.
        </p>
      </Reveal>

      <div className={`mt-9 grid gap-5 ${showAi ? "lg:grid-cols-2" : ""}`}>
        {account ? (
          <Reveal delay={0.05}>
            <MoneySpine />
          </Reveal>
        ) : (
          <Reveal delay={0.05}>
            <Onboard />
          </Reveal>
        )}
        {showAi && (
          <Reveal delay={0.1}>
            <AiSpine ai={health.ai} />
          </Reveal>
        )}
      </div>

      <div className="mt-11 flex items-center justify-between">
        <Eyebrow>modules</Eyebrow>
        <span className="hidden font-mono text-[11px] text-faint sm:block">
          one platform · one wallet — self-custodial USD₮ under every game
        </span>
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {MODULES.map((m, i) => (
          <ModuleTile key={m.name} m={m} i={i} />
        ))}
        <Reveal delay={MODULES.length * 0.05} className="h-full">
          <Link
            to="/predict"
            className="group flex h-full flex-col items-start justify-center gap-2 rounded-lg border border-dashed border-edge-2 p-5 transition-colors hover:border-edge-3 hover:bg-panel/40"
          >
            <span className="font-display text-[17px] font-semibold text-chalk">Jump in</span>
            <span className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.12em] text-steel group-hover:text-chalk">
              Start with a live tie <ArrowRight size={13} />
            </span>
          </Link>
        </Reveal>
      </div>
    </main>
  );
}
