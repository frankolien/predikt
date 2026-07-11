import { useState } from "react";
import { Coins, ArrowRight, Wallet, KeyRound, Copy, Check, Loader2, Lock } from "lucide-react";
import { Button, Card, Eyebrow, Pill } from "./ui";
import { useApp } from "../context";
import { saveSeed } from "../lib/vault";
import { generateWallet, addressOf, registerWallet, signInWallet, setSessionSeed } from "../lib/custody";

type View = "create" | "reveal" | "restore" | "setpin";

/**
 * Wallet-as-identity onboarding. Your self-custodial WDK wallet IS your account:
 * sign up mints one and shows a 12-word recovery phrase ONCE (save → commit),
 * and that same phrase signs you back in — and recovers you — on any device.
 */
export function Onboard({ onDone }: { onDone?: () => void }) {
  const { commitAuth } = useApp();
  const [view, setView] = useState<View>("create");
  const [handle, setHandle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // create → reveal
  const [genMnemonic, setGenMnemonic] = useState(""); // seed generated on-device
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);

  // restore
  const [phrase, setPhrase] = useState("");

  // set-PIN (secures the seed on this device, then the session goes live)
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      // Generate the wallet ON THIS DEVICE — no account exists yet, nothing is sent.
      // We reveal the phrase, then register (sign a SIWE challenge) on commit.
      const { mnemonic } = generateWallet();
      setGenMnemonic(mnemonic);
      setSaved(false);
      setView("reveal");
    } catch {
      setError("Couldn't create your wallet — try again.");
    } finally {
      setBusy(false);
    }
  };

  // The seed being onboarded: create → generated on-device; restore → the phrase typed.
  const seed = genMnemonic || phrase.trim();

  const copyPhrase = async () => {
    if (!seed) return;
    try {
      await navigator.clipboard.writeText(seed);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard blocked — the words are on screen to copy by hand */
    }
  };

  // After the phrase is saved (create) or entered (restore), secure it on this
  // device with a PIN before the session goes live — so the signing key can be
  // re-loaded on a later visit without re-typing 12 words.
  const finishReveal = () => {
    if (!genMnemonic) return;
    setView("setpin");
  };

  const restore = async () => {
    const m = phrase.trim();
    if (!m) return;
    setBusy(true);
    setError(null);
    try {
      addressOf(m); // derive locally — throws on an invalid phrase (no server call)
      setView("setpin");
    } catch (e) {
      setError((e as Error).message?.match(/mnemonic|word/i) ? "That doesn't look like a valid 12-word phrase." : (e as Error).message || "Couldn't restore — check your phrase.");
    } finally {
      setBusy(false);
    }
  };

  // Commit the session: sign a SIWE challenge (register for a fresh wallet, verify
  // for a restore) and keep the seed in session memory to sign this device's txs.
  const commitSession = async () => {
    const r = genMnemonic ? await registerWallet(seed, handle.trim() || undefined) : await signInWallet(seed);
    commitAuth(r);
    setSessionSeed(seed);
  };

  const setPinAndGo = async () => {
    if (!seed || pin.length < 4 || pin !== pin2) return;
    setBusy(true);
    setError(null);
    try {
      await saveSeed(seed, pin);
      await commitSession(); // session goes live, seed secured on-device + in memory
      onDone?.();
    } catch {
      setError("Couldn't finish — try again.");
      setBusy(false);
    }
  };

  const skipPin = async () => {
    if (!seed) return;
    setBusy(true);
    setError(null);
    try {
      await commitSession();
      onDone?.();
    } catch {
      setError("Couldn't sign in — try again.");
      setBusy(false);
    }
  };

  const inputCls =
    "flex-1 rounded-default border border-edge-2 bg-panel-2 px-3 py-2.5 font-mono text-[14px] text-chalk placeholder:text-faint focus:border-edge-3 focus:outline-none";

  /* ---------------- reveal: save your recovery phrase (shown once) --------- */
  if (view === "reveal" && genMnemonic) {
    const words = seed.split(" ");
    const addr = addressOf(genMnemonic);
    return (
      <Card className="p-5">
        <div className="flex items-center justify-between">
          <Eyebrow className="mb-0 text-live">save this · shown once</Eyebrow>
          <Pill strong>
            <KeyRound size={11} /> recovery phrase
          </Pill>
        </div>
        <h3 className="mt-2 font-display text-[20px] font-semibold text-chalk">Your recovery phrase</h3>
        <p className="mt-1 text-[13px] leading-relaxed text-silver">
          Write these 12 words down, in order, and keep them safe. They're the{" "}
          <span className="text-chalk">only</span> way back into your account — we can't reset them, and
          anyone who has them controls your funds.
        </p>

        <div className="mt-3 grid grid-cols-2 gap-1.5 sm:grid-cols-3">
          {words.map((w, i) => (
            <div
              key={i}
              className="flex items-center gap-2 rounded-default border border-edge bg-panel-2/60 px-2.5 py-2"
            >
              <span className="w-4 shrink-0 text-right font-mono text-[10px] text-faint">{i + 1}</span>
              <span className="font-mono text-[12.5px] text-chalk">{w}</span>
            </div>
          ))}
        </div>

        <div className="mt-3 flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={copyPhrase}>
            {copied ? (
              <>
                <Check size={12} /> Copied
              </>
            ) : (
              <>
                <Copy size={12} /> Copy phrase
              </>
            )}
          </Button>
          <span className="font-mono text-[10px] text-faint">
            {addr.slice(0, 6)}…{addr.slice(-4)}
          </span>
        </div>

        <label className="mt-3.5 flex cursor-pointer select-none items-start gap-2.5">
          <input
            type="checkbox"
            checked={saved}
            onChange={(e) => setSaved(e.target.checked)}
            style={{ accentColor: "var(--color-live)" }}
            className="mt-0.5 h-3.5 w-3.5 shrink-0"
          />
          <span className="text-[12.5px] leading-snug text-silver">
            I've saved my recovery phrase somewhere safe.
          </span>
        </label>

        <Button variant="solid" onClick={finishReveal} disabled={!saved} className="mt-3.5 w-full">
          Enter Predikt <ArrowRight size={13} />
        </Button>
      </Card>
    );
  }

  /* ---------------- setpin: secure the seed on this device ---------------- */
  if (view === "setpin") {
    const mismatch = pin2.length > 0 && pin !== pin2;
    const ok = pin.length >= 4 && pin === pin2;
    return (
      <Card className="p-5">
        <div className="flex items-center justify-between">
          <Eyebrow className="mb-0 text-live">last step · on this device</Eyebrow>
          <Pill strong>
            <Lock size={11} /> set a PIN
          </Pill>
        </div>
        <h3 className="mt-2 font-display text-[20px] font-semibold text-chalk">Secure your wallet</h3>
        <p className="mt-1 text-[13px] leading-relaxed text-silver">
          Pick a PIN to encrypt your keys on this device. You'll enter it to unlock the wallet on your
          next visit — it never leaves your device, and it's what lets you stake real USD₮ without
          re-typing your phrase.
        </p>

        <input
          type="password"
          inputMode="numeric"
          autoFocus
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          placeholder="choose a PIN (4+ digits)"
          className="mt-3.5 w-full rounded-default border border-edge-2 bg-panel-2 px-3 py-2.5 text-center font-mono text-[16px] tracking-[0.3em] text-chalk placeholder:tracking-normal placeholder:text-faint focus:border-edge-3 focus:outline-none"
        />
        <input
          type="password"
          inputMode="numeric"
          value={pin2}
          onChange={(e) => setPin2(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && ok && setPinAndGo()}
          placeholder="confirm PIN"
          className="mt-2 w-full rounded-default border border-edge-2 bg-panel-2 px-3 py-2.5 text-center font-mono text-[16px] tracking-[0.3em] text-chalk placeholder:tracking-normal placeholder:text-faint focus:border-edge-3 focus:outline-none"
        />
        {mismatch && <p className="mt-2 text-[12.5px] text-steel">PINs don't match.</p>}
        {error && <p className="mt-2 text-[12.5px] text-steel">{error}</p>}

        <Button variant="solid" onClick={setPinAndGo} disabled={busy || !ok} className="mt-3.5 w-full">
          {busy ? <Loader2 size={13} className="animate-spin" /> : (<>Set PIN &amp; enter <ArrowRight size={13} /></>)}
        </Button>
        <button
          onClick={skipPin}
          className="mt-3 w-full text-center text-[12px] text-faint transition-colors hover:text-steel"
        >
          Skip — I'll re-enter my phrase next time
        </button>
      </Card>
    );
  }

  /* ---------------- restore: sign back in with a phrase -------------------- */
  if (view === "restore") {
    return (
      <Card className="p-5">
        <div className="flex items-center justify-between">
          <Eyebrow className="mb-0">recover · self-custodial</Eyebrow>
          <Pill>
            <KeyRound size={11} /> restore
          </Pill>
        </div>
        <h3 className="mt-2 font-display text-[20px] font-semibold text-chalk">Restore your account</h3>
        <p className="mt-1 text-[13.5px] leading-relaxed text-silver">
          Enter your 12-word recovery phrase to sign back in — on any device, no password needed.
        </p>
        <textarea
          value={phrase}
          onChange={(e) => setPhrase(e.target.value)}
          rows={3}
          spellCheck={false}
          autoCapitalize="none"
          placeholder="twelve words separated by spaces"
          className="mt-3 w-full resize-none rounded-default border border-edge-2 bg-panel-2 px-3 py-2.5 font-mono text-[13px] leading-relaxed text-chalk placeholder:text-faint focus:border-edge-3 focus:outline-none"
        />
        <div className="mt-2 flex items-center gap-2">
          <Button variant="solid" onClick={restore} disabled={busy || !phrase.trim()}>
            {busy ? <Loader2 size={13} className="animate-spin" /> : (<>Restore <ArrowRight size={13} /></>)}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setError(null);
              setPhrase("");
              setView("create");
            }}
          >
            Back
          </Button>
        </div>
        {error && <p className="mt-2 text-[12.5px] text-steel">{error}</p>}
      </Card>
    );
  }

  /* ---------------- create: your wallet is your login --------------------- */
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <Eyebrow className="mb-0">start playing · self-custodial</Eyebrow>
        <Pill>
          <Wallet size={11} /> WDK
        </Pill>
      </div>
      <h3 className="mt-2 font-display text-[20px] font-semibold text-chalk">Create your account</h3>
      <p className="mt-1 text-[13.5px] leading-relaxed text-silver">
        Your <span className="text-chalk">wallet is your login</span>. We spin up a self-custodial USD₮
        wallet — the keys stay with you — and hand you a recovery phrase that signs you back in on any
        device. No email, no password.
      </p>
      <div className="mt-3 flex gap-2">
        <input
          value={handle}
          onChange={(e) => setHandle(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && create()}
          maxLength={24}
          placeholder="handle (optional)"
          className={inputCls}
        />
        <Button variant="solid" onClick={create} disabled={busy}>
          {busy ? <Loader2 size={13} className="animate-spin" /> : (<>Create <ArrowRight size={13} /></>)}
        </Button>
      </div>
      <div className="mt-3 flex items-center gap-1.5 text-[12.5px] text-silver">
        <Coins size={12} className="text-live" /> 1,000 points + a funded USD₮ wallet to start
      </div>
      {error && <p className="mt-2 text-[12.5px] text-steel">{error}</p>}
      <button
        onClick={() => {
          setError(null);
          setView("restore");
        }}
        className="mt-3 text-left text-[12.5px] text-steel transition-colors hover:text-chalk"
      >
        Already have a recovery phrase? <span className="text-chalk">Restore →</span>
      </button>
    </Card>
  );
}
