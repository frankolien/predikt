import { useState, type ReactNode } from "react";
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
  ArrowDownLeft,
  ShieldCheck,
  Coins,
  Plus,
  Loader2,
  Copy,
  Check,
  X,
} from "lucide-react";
import { Card, Eyebrow, Pill, LiveDot, Reveal, Button } from "../components/ui";
import { Onboard } from "../components/Onboard";
import { BootScreen } from "../components/BootScreen";
import { useApp } from "../context";
import { api, type AiStatus, aiLive, type Wallet as WalletT } from "../lib/api";
import { usdt, shortAddr } from "../lib/format";

/* ------------------------------------------------------------------ */
/* Money spine — the self-custodial USD₮ wallet (WDK), plus play points */
/* ------------------------------------------------------------------ */
function MoneySpine() {
  const { wallet, connectWallet, account, refreshBalance } = useApp();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [modal, setModal] = useState<null | "send" | "receive">(null);

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
    // The one place we spend colour: the money rail is a live-green hero card;
    // everything around it stays monochrome.
    <div className="relative flex h-full flex-col gap-4 overflow-hidden rounded-lg border border-live/25 bg-panel/60 p-5 backdrop-blur-sm">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(130% 120% at 0% 0%, color-mix(in srgb, var(--color-live) 22%, transparent), transparent 58%)",
        }}
      />
      <div className="relative flex flex-1 flex-col gap-4">
        <div className="flex items-center justify-between">
          <Eyebrow>money · self-custodial</Eyebrow>
          <Pill strong>
            <Wallet size={11} /> WDK
          </Pill>
        </div>

        {wallet ? (
          <div className="flex flex-col gap-4">
            <div>
              <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-faint">USD₮ balance</div>
              <div className="mt-0.5 flex items-baseline gap-1.5">
                <span className="font-display text-[36px] font-semibold leading-none text-chalk">
                  {usdt(wallet.usdtHuman)}
                </span>
                <span className="font-mono text-[12px] text-steel">USD₮</span>
              </div>
            </div>

            {/* the money moment — real self-custodial USD₮ transfers */}
            <div className="grid grid-cols-2 gap-2.5">
              <button
                onClick={() => setModal("send")}
                className="flex items-center justify-center gap-2 rounded-default bg-live px-3 py-2.5 font-mono text-[11px] uppercase tracking-[0.12em] text-void shadow-[0_10px_30px_-12px_var(--color-live)] transition-transform hover:-translate-y-px"
              >
                <ArrowUpRight size={14} /> Send
              </button>
              <button
                onClick={() => setModal("receive")}
                className="flex items-center justify-center gap-2 rounded-default border border-live/40 px-3 py-2.5 font-mono text-[11px] uppercase tracking-[0.12em] text-live transition-colors hover:bg-live/[0.08]"
              >
                <ArrowDownLeft size={14} /> Receive
              </button>
            </div>

            <button
              onClick={() => copyAddress(wallet.address)}
              title={copied ? "Address copied" : `Copy address · ${wallet.address}`}
              className="group flex w-full items-center gap-2 rounded-default border border-edge bg-void/40 px-3 py-2 text-left transition-colors hover:border-edge-2"
            >
              <ShieldCheck size={13} className="shrink-0 text-live" />
              <span className="font-mono text-[11px] text-silver">{shortAddr(wallet.address)}</span>
              {copied ? (
                <Check size={12} className="text-live" />
              ) : (
                <Copy size={12} className="text-steel transition-colors group-hover:text-chalk" />
              )}
              <span className="ml-auto font-mono text-[9.5px] uppercase tracking-[0.14em] text-faint">{wallet.backend}</span>
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-[13.5px] leading-relaxed text-silver">
              A real, non-custodial USD₮ wallet — the keys live on your device, not our server. It's the money rail under
              every module: entry fees in, prizes straight back out.
            </p>
            <Button variant="solid" onClick={create} disabled={busy} className="self-start">
              {busy ? <Loader2 size={13} className="animate-spin" /> : <Wallet size={13} />}
              {busy ? "Connecting…" : "Connect USD₮ wallet"}
            </Button>
            {err && <p className="font-mono text-[11px] text-steel">{err}</p>}
          </div>
        )}

        <div className="mt-auto flex items-center justify-between border-t border-edge/70 pt-3">
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-faint">play balance</span>
          <span className="inline-flex items-center gap-1.5 font-mono text-[13px] text-live">
            <Coins size={12} /> {account ? usdt(account.points, 0) : "—"} pts
          </span>
        </div>
      </div>

      {modal === "send" && wallet && (
        <SendModal wallet={wallet} onClose={() => setModal(null)} onSent={refreshBalance} />
      )}
      {modal === "receive" && wallet && <ReceiveModal address={wallet.address} onClose={() => setModal(null)} />}
    </div>
  );
}

/* ---------------- send / receive USD₮ ---------------- */
function ModalShell({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-[90] grid place-items-center bg-void/70 px-6 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-[380px] rounded-lg border border-edge-2 bg-panel p-5 shadow-[0_30px_80px_-24px_rgba(0,0,0,0.9)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-display text-[17px] font-semibold text-chalk">{title}</h3>
          <button onClick={onClose} className="grid h-7 w-7 place-items-center rounded-chip text-steel hover:bg-white/[0.05] hover:text-chalk">
            <X size={14} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function SendModal({ wallet, onClose, onSent }: { wallet: WalletT; onClose: () => void; onSent: () => void }) {
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [tx, setTx] = useState<string | null>(null);

  const amt = Number(amount);
  const valid = /^0x[a-fA-F0-9]{40}$/.test(to.trim()) && Number.isFinite(amt) && amt > 0 && amt <= wallet.usdtHuman;

  const submit = async () => {
    setBusy(true);
    setErr(null);
    try {
      const r = await api.account.send(to.trim(), amt);
      setTx(r.txHash);
      onSent();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalShell title="Send USD₮" onClose={onClose}>
      {tx ? (
        <div className="flex flex-col items-center gap-3 py-2 text-center">
          <div className="grid h-12 w-12 place-items-center rounded-full bg-live/15">
            <Check size={22} className="text-live" />
          </div>
          <div className="font-display text-[16px] font-semibold text-chalk">Sent {amt} USD₮</div>
          <p className="font-mono text-[10px] leading-relaxed text-steel break-all">{tx}</p>
          <Button variant="solid" className="mt-1 w-full" onClick={onClose}>
            Done
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div>
            <span className="label-mono mb-1 block">recipient address</span>
            <input
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="0x…"
              spellCheck={false}
              className="w-full rounded-default border border-edge-2 bg-panel-2 px-3 py-2.5 font-mono text-[12px] text-chalk placeholder:text-faint focus:border-edge-3 focus:outline-none"
            />
          </div>
          <div>
            <div className="mb-1 flex items-center justify-between">
              <span className="label-mono">amount</span>
              <button
                onClick={() => setAmount(String(wallet.usdtHuman))}
                className="font-mono text-[10px] text-live hover:underline"
              >
                max {usdt(wallet.usdtHuman)}
              </button>
            </div>
            <div className="flex items-center gap-2 rounded-default border border-edge-2 bg-panel-2 px-3 focus-within:border-edge-3">
              <input
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
                inputMode="decimal"
                placeholder="0.00"
                className="w-full bg-transparent py-2.5 font-display text-[18px] text-chalk placeholder:text-faint focus:outline-none"
              />
              <span className="font-mono text-[11px] text-steel">USD₮</span>
            </div>
          </div>
          {err && <p className="font-mono text-[11px] text-steel">{err}</p>}
          <Button variant="solid" className="w-full" onClick={submit} disabled={busy || !valid}>
            {busy ? <Loader2 size={13} className="animate-spin" /> : <ArrowUpRight size={13} />}
            {busy ? "Sending…" : "Send USD₮"}
          </Button>
          <p className="text-center font-mono text-[9.5px] text-faint">Signed on-device by your WDK key · gas is on us</p>
        </div>
      )}
    </ModalShell>
  );
}

function ReceiveModal({ address, onClose }: { address: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard?.writeText(address).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <ModalShell title="Receive USD₮" onClose={onClose}>
      <div className="flex flex-col gap-3">
        <p className="text-[13px] leading-relaxed text-silver">
          Share your address to get paid in USD₮. Funds land straight in your self-custodial wallet.
        </p>
        <div className="break-all rounded-default border border-edge-2 bg-panel-2 px-3 py-3 font-mono text-[12px] leading-relaxed text-chalk">
          {address}
        </div>
        <Button variant="solid" className="w-full" onClick={copy}>
          {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? "Copied" : "Copy address"}
        </Button>
      </div>
    </ModalShell>
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
    <main className="mx-auto max-w-[1180px] 2xl:max-w-[1440px] px-6 pb-24 pt-24">
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
