import { useState } from "react";
import { Lock, ArrowRight, Loader2 } from "lucide-react";
import { Button, Card, Eyebrow, Pill } from "./ui";
import { openSeed } from "../lib/vault";

/**
 * PIN gate shown on app open when an encrypted seed exists on this device but the
 * signing key isn't loaded into the session (e.g. after a reload or a server
 * restart). Entering the PIN decrypts the seed locally and hands it to `onUnlock`,
 * which re-loads the signing key server-side so real-USD₮ actions work again.
 */
export function WalletUnlock({
  onUnlock,
  onForgot,
  onSkip,
}: {
  onUnlock: (seed: string) => Promise<void>;
  onForgot: () => void;
  onSkip: () => void;
}) {
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!pin.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const seed = await openSeed(pin);
      await onUnlock(seed);
    } catch (e) {
      const msg = (e as Error).message;
      setError(msg === "wrong PIN" ? "Wrong PIN — try again." : "Couldn't unlock — try again.");
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] grid place-items-center bg-coal/80 px-4 backdrop-blur-sm">
      <Card className="w-full max-w-sm p-5">
        <div className="flex items-center justify-between">
          <Eyebrow className="mb-0">welcome back · self-custodial</Eyebrow>
          <Pill strong>
            <Lock size={11} /> locked
          </Pill>
        </div>
        <h3 className="mt-2 font-display text-[20px] font-semibold text-chalk">Unlock your wallet</h3>
        <p className="mt-1 text-[13px] leading-relaxed text-silver">
          Enter your PIN to unlock the wallet on this device. Your keys are encrypted here — the PIN
          decrypts them locally so you can stake real USD₮.
        </p>

        <input
          type="password"
          inputMode="numeric"
          autoFocus
          value={pin}
          onChange={(e) => {
            setPin(e.target.value);
            setError(null);
          }}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="PIN"
          className="mt-3.5 w-full rounded-default border border-edge-2 bg-panel-2 px-3 py-2.5 text-center font-mono text-[16px] tracking-[0.3em] text-chalk placeholder:tracking-normal placeholder:text-faint focus:border-edge-3 focus:outline-none"
        />
        {error && <p className="mt-2 text-[12.5px] text-steel">{error}</p>}

        <Button variant="solid" onClick={submit} disabled={busy || !pin.trim()} className="mt-3.5 w-full">
          {busy ? <Loader2 size={13} className="animate-spin" /> : (<>Unlock <ArrowRight size={13} /></>)}
        </Button>

        <div className="mt-3 flex items-center justify-between">
          <button
            onClick={onForgot}
            className="text-left text-[12px] text-steel transition-colors hover:text-chalk"
          >
            Forgot PIN? <span className="text-chalk">Restore with phrase</span>
          </button>
          <button
            onClick={onSkip}
            className="text-[12px] text-faint transition-colors hover:text-steel"
          >
            Browse without unlocking
          </button>
        </div>
      </Card>
    </div>
  );
}
