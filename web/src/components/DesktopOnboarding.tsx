import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { KeyRound, Copy, Check, Cpu, ShieldCheck, ArrowRight, Loader2, Lock } from "lucide-react";
import { aiStatusLocal, type WalletAuth, type AiStatus } from "../lib/api";
import { useApp } from "../context";
import { keychainSet, SEED_KEY } from "../lib/keychain";
import { generateWallet, addressOf, registerWallet, signInWallet, setSessionSeed } from "../lib/custody";
import { Mark } from "./Logo";
import { Button } from "./ui";
import onboardingVideo from "../assets/onboarding.mp4";

type Step = "welcome" | "reveal" | "restore" | "provision";

/**
 * Desktop first-run wizard. Unlike the web's inline card, this is a full-window
 * setup that earns the native install: your recovery phrase goes in the OS
 * Keychain (not a browser blob), and your private AI is provisioned on-device
 * before you ever hit the app. Shown only in the Tauri shell, only on first run.
 */
export function DesktopOnboarding({ onClose }: { onClose: () => void }) {
  const { commitAuth } = useApp();
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [step, setStep] = useState<Step>("welcome");

  // Force the ambient loop to play in the WKWebView: React doesn't reliably apply
  // the muted/loop props to the DOM element, and WKWebView blocks autoplay unless
  // the element is already muted when play() is called. Retry as the data lands.
  //
  // WKWebView also PAUSES a looping video after a while (loop hiccups, app
  // backgrounding, power/Low-Power-Mode events) and never resumes it on its own — so
  // the ambient loop dies mid-onboarding. Keep it alive belt-and-suspenders: replay on
  // end, resume when the window becomes visible, and a low-frequency watchdog that
  // restarts it whenever it's found paused.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = true;
    v.defaultMuted = true;
    v.loop = true;
    const play = () => {
      if (v.paused) v.play().catch(() => {});
    };
    const onEnded = () => {
      v.currentTime = 0; // in case WKWebView drops the loop
      play();
    };
    const onVisible = () => {
      if (!document.hidden) play();
    };
    play();
    v.addEventListener("loadeddata", play);
    v.addEventListener("canplay", play);
    v.addEventListener("ended", onEnded);
    document.addEventListener("visibilitychange", onVisible);
    const watchdog = window.setInterval(play, 2000); // catch-all: resume any unexpected pause
    return () => {
      v.removeEventListener("loadeddata", play);
      v.removeEventListener("canplay", play);
      v.removeEventListener("ended", onEnded);
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(watchdog);
    };
  }, []);
  const [handle, setHandle] = useState("");
  const [auth, setAuth] = useState<WalletAuth | null>(null); // registered session, committed on Enter
  const [genMnemonic, setGenMnemonic] = useState(""); // seed generated on-device
  const [phrase, setPhrase] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const create = async () => {
    setBusy(true);
    setErr(null);
    try {
      // Generate the wallet ON THIS MACHINE — nothing is sent. We reveal the phrase,
      // then register (sign a SIWE challenge) after they've saved it.
      const { mnemonic } = generateWallet();
      setGenMnemonic(mnemonic);
      setStep("reveal");
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const restore = async () => {
    const m = phrase.trim();
    if (m.split(/\s+/).length < 12) return setErr("A recovery phrase is 12 words.");
    setBusy(true);
    setErr(null);
    try {
      addressOf(m); // derive locally — throws on an invalid phrase (no server call)
      await secure(m);
      const r = await signInWallet(m); // SIWE challenge — the seed never leaves the device
      setAuth(r);
      setSessionSeed(m);
      setStep("provision");
    } catch (e) {
      setErr((e as Error).message?.match(/mnemonic|word/i) ? "That doesn't look like a valid 12-word phrase." : (e as Error).message || "Couldn't restore — check your phrase.");
    } finally {
      setBusy(false);
    }
  };

  // Save the seed to the OS keychain. Non-fatal — the session still commits.
  const secure = async (seed: string) => {
    try {
      await keychainSet(SEED_KEY, seed);
    } catch {
      /* keychain unavailable — the phrase is still the source of truth */
    }
  };

  const afterReveal = async () => {
    setBusy(true);
    setErr(null);
    try {
      await secure(genMnemonic);
      const r = await registerWallet(genMnemonic, handle.trim() || undefined); // client-signed register
      setAuth(r);
      setSessionSeed(genMnemonic);
      setStep("provision");
    } catch (e) {
      setErr((e as Error).message || "Couldn't finish — try again.");
    } finally {
      setBusy(false);
    }
  };

  const enter = () => {
    if (auth) commitAuth(auth);
    navigate("/app"); // land in the Hub, not the web marketing landing
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] grid place-items-center overflow-y-auto bg-void px-6 py-12">
      {/* ambient background loop — play/loop forced in the effect above */}
      <video
        ref={videoRef}
        className="pointer-events-none fixed inset-0 h-full w-full object-cover"
        src={onboardingVideo}
        autoPlay
        loop
        muted
        playsInline
        preload="auto"
      />
      {/* scrim: darken the video so the white setup copy stays legible */}
      <div className="pointer-events-none fixed inset-0 bg-gradient-to-b from-void/80 via-void/60 to-void/85" />
      {/* faint pitch grid over the scrim */}
      <div
        className="pointer-events-none fixed inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            "linear-gradient(var(--color-chalk) 1px, transparent 1px), linear-gradient(90deg, var(--color-chalk) 1px, transparent 1px)",
          backgroundSize: "56px 56px",
        }}
      />
      <div className="relative z-10 w-full max-w-[460px]">
        {step === "welcome" && (
          <Welcome
            handle={handle}
            setHandle={setHandle}
            busy={busy}
            err={err}
            onCreate={create}
            onRestore={() => {
              setErr(null);
              setStep("restore");
            }}
            onSkip={onClose}
          />
        )}
        {step === "reveal" && genMnemonic && (
          <Reveal mnemonic={genMnemonic} busy={busy} err={err} copied={copied} setCopied={setCopied} onContinue={afterReveal} />
        )}
        {step === "restore" && (
          <Restore
            phrase={phrase}
            setPhrase={setPhrase}
            busy={busy}
            err={err}
            onRestore={restore}
            onBack={() => {
              setErr(null);
              setStep("welcome");
            }}
          />
        )}
        {step === "provision" && <Provision onEnter={enter} />}
      </div>
    </div>
  );
}

/* ---------------- step 1: welcome ---------------- */
function Welcome({
  handle,
  setHandle,
  busy,
  err,
  onCreate,
  onRestore,
  onSkip,
}: {
  handle: string;
  setHandle: (v: string) => void;
  busy: boolean;
  err: string | null;
  onCreate: () => void;
  onRestore: () => void;
  onSkip: () => void;
}) {
  return (
    <div className="text-center">
      <div className="mb-6 flex justify-center">
        <Mark className="h-14 w-14 text-chalk" />
      </div>
      <h1 className="font-display text-[32px] font-semibold leading-[1.05] tracking-[-0.03em] text-chalk">
        Your keys, your AI,<br />your money — <span className="text-live">on this machine.</span>
      </h1>
      <p className="mx-auto mt-3 max-w-[380px] text-[14px] leading-relaxed text-silver">
        Predikt Desktop runs your wallet and your football pundit locally. Nothing sits with us — set it up once.
      </p>

      <div className="mt-7 space-y-2 text-left">
        <span className="label-mono">pick a handle</span>
        <input
          value={handle}
          onChange={(e) => setHandle(e.target.value)}
          maxLength={24}
          placeholder="handle (optional)"
          className="w-full rounded-default border border-edge-2 bg-panel-2 px-3 py-2.5 text-[14px] text-chalk placeholder:text-faint focus:border-edge-3 focus:outline-none"
        />
      </div>

      <Button variant="solid" className="mt-4 w-full" onClick={onCreate} disabled={busy}>
        {busy ? <Loader2 size={14} className="animate-spin" /> : <><KeyRound size={14} /> Create my wallet</>}
      </Button>
      {err && <p className="mt-2 font-mono text-[11px] text-steel">{err}</p>}

      <div className="mt-4 flex items-center justify-center gap-4 font-mono text-[11px]">
        <button onClick={onRestore} className="text-steel underline underline-offset-2 hover:text-chalk">
          I have a recovery phrase
        </button>
        <span className="text-edge-3">·</span>
        <button onClick={onSkip} className="text-steel underline underline-offset-2 hover:text-chalk">
          Browse first
        </button>
      </div>
    </div>
  );
}

/* ---------------- step 2: reveal + keychain ---------------- */
function Reveal({
  mnemonic,
  busy,
  err,
  copied,
  setCopied,
  onContinue,
}: {
  mnemonic: string;
  busy: boolean;
  err: string | null;
  copied: boolean;
  setCopied: (v: boolean) => void;
  onContinue: () => void;
}) {
  const [saved, setSaved] = useState(false);
  const words = mnemonic.trim().split(/\s+/);
  const copy = () => {
    navigator.clipboard?.writeText(mnemonic).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <div>
      <span className="label-mono flex items-center gap-1.5 text-live">
        <KeyRound size={12} /> recovery phrase
      </span>
      <h2 className="mt-2 font-display text-[22px] font-semibold text-chalk">Your recovery phrase</h2>
      <p className="mt-1.5 text-[13px] leading-relaxed text-silver">
        Twelve words that <span className="text-chalk">are</span> your account. We store them in your Mac's Keychain —
        never on a server. Write them down as a backup; anyone with them controls your funds.
      </p>

      <div className="mt-4 grid grid-cols-3 gap-2 rounded-default border border-edge-2 bg-panel-2 p-3">
        {words.map((w, i) => (
          <div key={i} className="flex items-center gap-1.5 rounded-chip bg-white/[0.03] px-2 py-1.5">
            <span className="font-mono text-[9px] text-faint">{i + 1}</span>
            <span className="font-mono text-[12px] text-chalk">{w}</span>
          </div>
        ))}
      </div>

      <button
        onClick={copy}
        className="mt-2 flex items-center gap-1.5 font-mono text-[11px] text-steel hover:text-chalk"
      >
        {copied ? <Check size={12} className="text-live" /> : <Copy size={12} />} {copied ? "Copied" : "Copy phrase"}
      </button>

      <label className="mt-4 flex items-start gap-2.5 text-[12.5px] text-silver">
        <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} className="mt-0.5 accent-[var(--color-live)]" />
        I've written my recovery phrase somewhere safe.
      </label>

      <Button variant="solid" className="mt-4 w-full" onClick={onContinue} disabled={!saved || busy}>
        {busy ? <Loader2 size={14} className="animate-spin" /> : (<><ShieldCheck size={14} /> Save to Keychain & continue</>)}
      </Button>
      {err && <p className="mt-2 font-mono text-[11px] text-steel">{err}</p>}
    </div>
  );
}

/* ---------------- restore path ---------------- */
function Restore({
  phrase,
  setPhrase,
  busy,
  err,
  onRestore,
  onBack,
}: {
  phrase: string;
  setPhrase: (v: string) => void;
  busy: boolean;
  err: string | null;
  onRestore: () => void;
  onBack: () => void;
}) {
  return (
    <div>
      <h2 className="font-display text-[22px] font-semibold text-chalk">Restore your wallet</h2>
      <p className="mt-1.5 text-[13px] leading-relaxed text-silver">
        Enter your 12-word recovery phrase. It's re-secured in this Mac's Keychain.
      </p>
      <textarea
        value={phrase}
        onChange={(e) => setPhrase(e.target.value)}
        rows={3}
        placeholder="word1 word2 word3 …"
        className="mt-4 w-full resize-none rounded-default border border-edge-2 bg-panel-2 px-3 py-2.5 font-mono text-[13px] text-chalk placeholder:text-faint focus:border-edge-3 focus:outline-none"
      />
      {err && <p className="mt-2 font-mono text-[11px] text-steel">{err}</p>}
      <div className="mt-3 flex gap-2">
        <Button variant="ghost" className="flex-1" onClick={onBack} disabled={busy}>
          Back
        </Button>
        <Button variant="solid" className="flex-1" onClick={onRestore} disabled={busy || !phrase.trim()}>
          {busy ? <Loader2 size={14} className="animate-spin" /> : <>Restore <ArrowRight size={14} /></>}
        </Button>
      </div>
    </div>
  );
}

/* ---------------- step 3: on-device AI provision (the hero) ---------------- */
function Provision({ onEnter }: { onEnter: () => void }) {
  const [ai, setAi] = useState<AiStatus | null>(null);
  useEffect(() => {
    let active = true;
    const tick = async () => {
      const s = await aiStatusLocal();
      if (active && s) setAi(s);
    };
    tick();
    const id = setInterval(tick, 1200);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, []);

  const ready = ai?.state === "ready";
  const pct = Math.round((ai?.progress ?? 0) * 100);
  const failed = ai?.state === "mock" || ai?.state === "error";

  return (
    <div className="text-center">
      <div className="mb-5 flex justify-center">
        <div className="grid h-14 w-14 place-items-center rounded-default border border-edge-2 bg-panel-2">
          {ready ? <Check size={26} className="text-live" /> : <Cpu size={24} className="text-chalk" />}
        </div>
      </div>
      <h2 className="font-display text-[22px] font-semibold text-chalk">
        {ready ? "Your AI is ready" : "Setting up your private AI"}
      </h2>
      <p className="mx-auto mt-1.5 max-w-[380px] text-[13px] leading-relaxed text-silver">
        Your football pundit runs entirely on this machine — no cloud, no cost, works offline. Powered by Tether's QVAC.
      </p>

      {/* progress */}
      <div className="mt-5 h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
        <div
          className="h-full rounded-full bg-live transition-all duration-500"
          style={{ width: ready ? "100%" : `${Math.max(6, pct)}%` }}
        />
      </div>
      <p className="mt-2 font-mono text-[10px] leading-relaxed text-faint">
        {failed
          ? "On-device model unavailable — the app will use the cloud fallback."
          : ready
            ? `${ai?.model ?? "Llama-3.2"} · loaded on-device`
            : ai?.detail || "warming up the model…"}
      </p>

      <Button variant="solid" className="mt-5 w-full" onClick={onEnter} disabled={!ready && !failed}>
        {!ready && !failed ? (
          <><Loader2 size={14} className="animate-spin" /> Provisioning…</>
        ) : (
          <><Lock size={13} /> Enter Predikt</>
        )}
      </Button>
    </div>
  );
}
