import { useState } from "react";
import { Coins, ArrowRight, Wallet, KeyRound, Copy, Check, Loader2 } from "lucide-react";
import { Button, Card, Eyebrow, Pill } from "./ui";
import { useApp } from "../context";
import { api, type WalletAuth } from "../lib/api";

type View = "create" | "reveal" | "restore";

/**
 * Wallet-as-identity onboarding. Your self-custodial WDK wallet IS your account:
 * sign up mints one and shows a 12-word recovery phrase ONCE (save → commit),
 * and that same phrase signs you back in — and recovers you — on any device.
 */
export function Onboard({ onDone }: { onDone?: () => void }) {
  const { commitAuth, restoreAccount } = useApp();
  const [view, setView] = useState<View>("create");
  const [handle, setHandle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // create → reveal
  const [auth, setAuth] = useState<WalletAuth | null>(null);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);

  // restore
  const [phrase, setPhrase] = useState("");

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      // Creates the account server-side and starts funding; we hold the result
      // and reveal the phrase BEFORE the session goes live.
      const r = await api.auth.newWallet(handle.trim() || undefined);
      setAuth(r);
      setSaved(false);
      setView("reveal");
    } catch {
      setError("Couldn't create your wallet — try again.");
    } finally {
      setBusy(false);
    }
  };

  const copyPhrase = async () => {
    if (!auth?.mnemonic) return;
    try {
      await navigator.clipboard.writeText(auth.mnemonic);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard blocked — the words are on screen to copy by hand */
    }
  };

  const finishReveal = () => {
    if (!auth) return;
    commitAuth(auth); // session goes live now that the phrase is saved
    onDone?.();
  };

  const restore = async () => {
    const m = phrase.trim();
    if (!m) return;
    setBusy(true);
    setError(null);
    try {
      await restoreAccount(m);
      onDone?.();
    } catch (e) {
      setError((e as Error).message || "Couldn't restore — check your phrase.");
    } finally {
      setBusy(false);
    }
  };

  const inputCls =
    "flex-1 rounded-default border border-edge-2 bg-panel-2 px-3 py-2.5 font-mono text-[14px] text-chalk placeholder:text-faint focus:border-edge-3 focus:outline-none";

  /* ---------------- reveal: save your recovery phrase (shown once) --------- */
  if (view === "reveal" && auth) {
    const words = (auth.mnemonic ?? "").split(" ");
    const addr = auth.wallet.address;
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
