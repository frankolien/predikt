import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useDragControls } from "motion/react";
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
  ClipboardPaste,
} from "lucide-react";
import { Card, Eyebrow, Pill, LiveDot, Reveal, Button } from "../components/ui";
import { NetworkSwitcher } from "../components/NetworkSwitcher";
import { AsciiBall } from "../components/AsciiBall";
import { Onboard } from "../components/Onboard";
import { BootScreen } from "../components/BootScreen";
import { useApp } from "../context";
import { api, type AiStatus, aiLive, resolveNetwork, type NetworkInfo, type Wallet as WalletT } from "../lib/api";
import { usdt, shortAddr } from "../lib/format";
import { keychainAvailable, keychainGet, SEED_KEY } from "../lib/keychain";

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
        <div className="flex items-center justify-between gap-2">
          <Eyebrow>money · self-custodial</Eyebrow>
          <div className="flex items-center gap-2">
            <NetworkSwitcher />
            <Pill strong>
              <Wallet size={11} /> WDK
            </Pill>
          </div>
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
                className="flex items-center justify-center gap-2 rounded-[12px] bg-live px-3 py-2.5 font-mono text-[11px] uppercase tracking-[0.12em] text-void shadow-[0_10px_30px_-12px_var(--color-live)] transition-transform hover:-translate-y-px"
              >
                <ArrowUpRight size={14} /> Send
              </button>
              <button
                onClick={() => setModal("receive")}
                className="flex items-center justify-center gap-2 rounded-[12px] border border-live/40 px-3 py-2.5 font-mono text-[11px] uppercase tracking-[0.12em] text-live transition-colors hover:bg-live/[0.08]"
              >
                <ArrowDownLeft size={14} /> Receive
              </button>
            </div>

            <button
              onClick={() => copyAddress(wallet.address)}
              title={copied ? "Address copied" : `Copy address · ${wallet.address}`}
              className="group flex w-full items-center gap-2 rounded-[12px] border border-edge bg-void/40 px-3 py-2 text-left transition-colors hover:border-edge-2"
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

      <AnimatePresence>
        {modal === "send" && wallet && (
          <SendModal key="send" wallet={wallet} onClose={() => setModal(null)} onSent={refreshBalance} />
        )}
        {modal === "receive" && wallet && (
          <ReceiveModal key="receive" address={wallet.address} onClose={() => setModal(null)} />
        )}
      </AnimatePresence>
    </div>
  );
}

/* ---------------- send / receive USD₮ ---------------- */
function ModalShell({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Portalled to <body> so the dialog escapes the money card's backdrop-filter /
  // overflow-hidden / Reveal transform and centers on the viewport (not the card).
  return createPortal(
    <motion.div
      className="fixed inset-0 z-[90] grid place-items-center bg-void/75 px-6"
      onClick={onClose}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.16 }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 10 }}
        transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-[380px] rounded-[18px] border border-edge-2 bg-panel p-5 shadow-[0_30px_80px_-24px_rgba(0,0,0,0.9)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-display text-[17px] font-semibold text-chalk">{title}</h3>
          <button onClick={onClose} className="grid h-7 w-7 place-items-center rounded-chip text-steel hover:bg-white/[0.05] hover:text-chalk">
            <X size={14} />
          </button>
        </div>
        {children}
      </motion.div>
    </motion.div>,
    document.body,
  );
}

/** Turn raw server errors into something a person can act on. */
function friendlySendError(msg: string, net?: NetworkInfo | null): string {
  if (/fan wallet|unknown wallet|sign in first/i.test(msg)) return "Couldn't reach your wallet key — reopen the app and try again.";
  // On a faucet network the server auto-refuels gas, so a transient gas error just
  // means "wait a moment". On a real network there's no faucet — the server already
  // tells the user to fund their own wallet, so pass that message straight through.
  if (net?.faucet && /gas|insufficient funds|\beth\b/i.test(msg)) return "Network gas is topping up — give it a moment and retry.";
  return msg;
}

function SendModal({ wallet, onClose, onSent }: { wallet: WalletT; onClose: () => void; onSent: () => void }) {
  const { restoreAccount, health, walletNetwork } = useApp();
  const net = resolveNetwork(health, walletNetwork);
  const netTag = net ? (net.kind === "mainnet" ? "LIVE" : net.kind === "testnet" ? "TESTNET" : "DEMO") : "";
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [tx, setTx] = useState<string | null>(null);
  const dragControls = useDragControls();
  const boundsRef = useRef<HTMLDivElement>(null);

  const amt = Number(amount);
  const valid = /^0x[a-fA-F0-9]{40}$/.test(to.trim()) && Number.isFinite(amt) && amt > 0 && amt <= wallet.usdtHuman;

  // Paste the recipient — nobody types a 42-char address by hand.
  const paste = async () => {
    setErr(null);
    try {
      const t = (await navigator.clipboard.readText()).trim();
      if (t) setTo(t);
      else setErr("Clipboard is empty — copy an address first.");
    } catch {
      setErr("Couldn't read the clipboard — paste with ⌘V into the field.");
    }
  };

  const submit = async () => {
    setBusy(true);
    setErr(null);
    const doSend = () => api.account.send(to.trim(), amt);
    try {
      let r;
      try {
        r = await doSend();
      } catch (e) {
        // The server holds signing keys in memory only (self-custody) and loses
        // them on restart/redeploy. If it can't find our wallet, re-arm it with
        // the seed from the OS keychain, then retry once.
        const msg = (e as Error).message || "";
        if (/fan wallet|unknown wallet|sign in first/i.test(msg) && keychainAvailable) {
          const seed = await keychainGet(SEED_KEY);
          if (!seed) throw e;
          await restoreAccount(seed);
          r = await doSend();
        } else throw e;
      }
      setTx(r.txHash);
      onSent();
    } catch (e) {
      setErr(friendlySendError((e as Error).message, net));
    } finally {
      setBusy(false);
    }
  };

  // Sanitised amount entry — a real input field (desktop card): digits + one dot,
  // max 2 decimals, no leading zero. The keyboard types straight in.
  const onAmount = (raw: string) => {
    setErr(null);
    let v = raw.replace(/[^0-9.]/g, "");
    const dot = v.indexOf(".");
    if (dot !== -1) {
      const dec = v.slice(dot + 1).replace(/\./g, "").slice(0, 2);
      v = v.slice(0, dot) + "." + dec;
    }
    v = v.replace(/^0(\d)/, "$1");
    if (v.replace(".", "").length > 12) return;
    setAmount(v);
  };

  // Keyboard: Enter sends, Esc closes — the amount/recipient inputs type natively.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "Enter" && valid && !busy) submit();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valid, busy]);

  // Safety: restore text-selection if we unmount mid-drag.
  useEffect(() => () => void (document.body.style.userSelect = ""), []);

  return createPortal(
    // No scrim — the app behind stays fully normal and interactive (Solflare-style
    // floating window). pointer-events pass through except on the card itself.
    <div ref={boundsRef} className="pointer-events-none fixed inset-0 z-[90] grid place-items-center px-6 py-6">
      <motion.div
        drag
        dragListener={false}
        dragControls={dragControls}
        dragConstraints={boundsRef}
        dragMomentum={false}
        dragElastic={0.06}
        initial={{ opacity: 0, scale: 0.94 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
        className="pointer-events-auto relative w-full max-w-[400px]"
      >
        {/* desktop wallet card — a floating window (Solflare-style), not a phone */}
        <div className="relative overflow-hidden rounded-[24px] border border-edge-2 bg-panel shadow-[0_40px_120px_-24px_rgba(0,0,0,0.92)] ring-1 ring-white/[0.05]">
          {/* soft green wash across the top */}
          <div
            className="pointer-events-none absolute inset-x-0 top-0 h-28"
            style={{
              backgroundImage:
                "radial-gradient(90% 100% at 50% 0%, color-mix(in srgb, var(--color-live) 11%, transparent), transparent 74%)",
            }}
          />

          {/* header — doubles as the drag handle (grab anywhere here to move it) */}
          <div
            onPointerDown={(e) => {
              // Kill page text-selection for the duration of the drag.
              document.body.style.userSelect = "none";
              window.addEventListener("pointerup", () => (document.body.style.userSelect = ""), { once: true });
              dragControls.start(e);
            }}
            className="relative flex cursor-grab touch-none select-none items-center justify-between gap-3 border-b border-edge/70 px-4 py-3 active:cursor-grabbing"
          >
            <div className="flex items-center gap-2.5">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-live/15 text-live ring-1 ring-live/25">
                <ArrowUpRight size={16} />
              </span>
              <div className="leading-tight">
                <div className="font-display text-[15px] font-semibold text-chalk">Send USD₮</div>
                {net && (
                  <div
                    className={`mt-0.5 flex items-center gap-1 font-mono text-[9px] uppercase tracking-[0.14em] ${net.kind === "mainnet" ? "text-live" : "text-faint"}`}
                  >
                    <span className={`h-1 w-1 rounded-full ${net.kind === "mainnet" ? "bg-live" : "bg-steel"}`} />
                    {net.label} · {netTag}
                  </div>
                )}
              </div>
            </div>
            <button
              onClick={onClose}
              className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-steel transition-colors hover:bg-white/[0.06] hover:text-chalk"
            >
              <X size={16} />
            </button>
          </div>

          {tx ? (
            <div className="relative flex flex-col items-center gap-4 px-6 py-8 text-center">
              <div className="grid h-16 w-16 place-items-center rounded-full bg-live/15 ring-1 ring-live/30">
                <Check size={30} className="text-live" />
              </div>
              <div>
                <div className="font-display text-[22px] font-semibold text-chalk">Sent</div>
                <div className="mt-0.5 font-mono text-[13px] text-live">
                  {amt} USD₮{net ? ` · ${net.label}` : ""}
                </div>
              </div>
              {net?.explorer ? (
                <a
                  href={`${net.explorer}/tx/${tx}`}
                  target="_blank"
                  rel="noreferrer"
                  className="max-w-full break-all font-mono text-[9.5px] leading-relaxed text-steel underline decoration-dotted underline-offset-2 hover:text-live"
                >
                  {tx}
                </a>
              ) : (
                <p className="max-w-full break-all font-mono text-[9.5px] leading-relaxed text-steel">{tx}</p>
              )}
              <button
                onClick={onClose}
                className="mt-1 w-full rounded-[14px] bg-live py-3.5 font-mono text-[12px] uppercase tracking-[0.14em] text-void transition-all hover:brightness-105"
              >
                Done
              </button>
            </div>
          ) : (
            <div className="relative flex flex-col gap-3.5 p-5">
              {/* amount */}
              <div className="rounded-[16px] border border-edge-2 bg-void/40 px-4 py-3.5">
                <div className="flex items-center justify-between">
                  <span className="label-mono text-faint">you send</span>
                  <button
                    onClick={() => onAmount(String(wallet.usdtHuman))}
                    className="rounded-full bg-live/10 px-2.5 py-1 font-mono text-[9.5px] uppercase tracking-[0.1em] text-live transition-colors hover:bg-live/[0.16]"
                  >
                    Max · {usdt(wallet.usdtHuman)}
                  </button>
                </div>
                <div className="mt-1.5 flex items-baseline gap-2">
                  <input
                    value={amount}
                    onChange={(e) => onAmount(e.target.value)}
                    inputMode="decimal"
                    placeholder="0"
                    autoFocus
                    className="min-w-0 flex-1 bg-transparent font-display text-[34px] font-semibold leading-none tracking-tight text-chalk placeholder:text-faint focus:outline-none"
                  />
                  <span className="font-mono text-[13px] text-steel">USD₮</span>
                </div>
              </div>

              {/* recipient — paste-first, since nobody types 42 hex chars */}
              <div className="flex items-center gap-2 rounded-[14px] border border-edge-2 bg-void/40 pl-4 pr-2 focus-within:border-live/40">
                <input
                  value={to}
                  onChange={(e) => {
                    setTo(e.target.value);
                    setErr(null);
                  }}
                  placeholder="Recipient · 0x…"
                  spellCheck={false}
                  className="min-w-0 flex-1 truncate bg-transparent py-3 font-mono text-[12px] text-chalk placeholder:text-faint focus:outline-none"
                />
                <button
                  onClick={paste}
                  className="flex shrink-0 items-center gap-1.5 rounded-[10px] bg-white/[0.06] px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.1em] text-chalk transition-colors hover:bg-white/[0.12]"
                >
                  <ClipboardPaste size={12} /> Paste
                </button>
              </div>

              {err && <p className="font-mono text-[10.5px] leading-relaxed text-live/90">{err}</p>}

              {/* CTA */}
              <button
                onClick={submit}
                disabled={busy || !valid}
                className="mt-0.5 flex w-full items-center justify-center gap-2 rounded-[14px] bg-live py-3.5 font-mono text-[12.5px] uppercase tracking-[0.14em] text-void transition-all hover:brightness-105 disabled:pointer-events-none disabled:opacity-30"
              >
                {busy ? <Loader2 size={15} className="animate-spin" /> : <ArrowUpRight size={15} />}
                {busy ? "Sending" : "Send"}
              </button>
            </div>
          )}
        </div>
      </motion.div>
    </div>,
    document.body,
  );
}

function ReceiveModal({ address, onClose }: { address: string; onClose: () => void }) {
  const { health, walletNetwork } = useApp();
  const net = resolveNetwork(health, walletNetwork);
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
        {net && (
          <div className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-steel">
            <span className={`h-1.5 w-1.5 rounded-full ${net.kind === "mainnet" ? "bg-live shadow-[0_0_8px_var(--color-live)]" : net.kind === "testnet" ? "bg-chalk" : "bg-steel"}`} />
            Send only on <span className="text-chalk">{net.label}</span>
          </div>
        )}
        <div className="break-all rounded-[12px] border border-edge-2 bg-panel-2 px-3 py-3 font-mono text-[12px] leading-relaxed text-chalk">
          {address}
        </div>
        <Button variant="solid" className="w-full rounded-[12px]" onClick={copy}>
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
      className={`group relative flex h-full flex-col overflow-hidden rounded-lg border p-5 transition-all duration-300 ${
        soon
          ? "border-edge bg-panel/30"
          : "border-edge-2 bg-panel/60 hover:-translate-y-0.5 hover:border-live/30 hover:bg-panel"
      }`}
    >
      {/* green shade on hover — the inspo glow */}
      {!soon && (
        <div
          className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
          style={{
            backgroundImage:
              "radial-gradient(120% 92% at 50% 0%, color-mix(in srgb, var(--color-live) 14%, transparent), transparent 62%)",
          }}
        />
      )}
      <div className="relative flex flex-1 flex-col gap-3">
        <div className="flex items-start justify-between">
          <div
            className={`grid h-10 w-10 place-items-center rounded-lg border transition-colors ${
              soon ? "border-edge text-steel" : "border-edge-2 text-chalk group-hover:border-live/40 group-hover:text-live"
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
      <div className="flex items-start justify-between gap-8">
        <Reveal className="min-w-0 flex-1">
          <Eyebrow className="mb-2">predikt · the football economy</Eyebrow>
          <h1 className="max-w-2xl font-display text-[40px] font-semibold leading-[1.02] tracking-[-0.03em] text-chalk">
            One wallet. <span className="text-gradient">Every way to play</span> the World Cup.
          </h1>
          <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-silver">
            Predict, organize, and play fantasy — all on one self-custodial USD₮ wallet. Real money in,
            real money out. Your keys, your money, no custody.
          </p>
        </Reveal>
        {/* the football: a rotating point-cloud ball, with a faint green halo */}
        <div className="relative hidden h-[196px] w-[280px] shrink-0 lg:block" aria-hidden>
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              backgroundImage:
                "radial-gradient(52% 52% at 56% 44%, color-mix(in srgb, var(--color-live) 18%, transparent), transparent 70%)",
            }}
          />
          <AsciiBall className="relative h-full w-full opacity-80" />
        </div>
      </div>

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
