import { useState } from "react";
import { motion } from "motion/react";
import { Eye, EyeOff, KeyRound, ShieldCheck, Copy, Check } from "lucide-react";
import { api, type Wallet } from "../lib/api";
import { Button, Card, Eyebrow } from "./ui";
import { usdt } from "../lib/format";

export function WalletCreate({ onCreated }: { onCreated: (w: Wallet) => void }) {
  const [name, setName] = useState("You");
  const [loading, setLoading] = useState(false);
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async () => {
    setLoading(true);
    setError(null);
    try {
      setWallet(await api.createWallet(name.trim() || "You"));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const copy = () => {
    if (!wallet) return;
    navigator.clipboard?.writeText(wallet.mnemonic);
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  };

  if (!wallet) {
    return (
      <Card className="p-5">
        <Eyebrow className="mb-2 flex items-center gap-2">
          <KeyRound size={12} className="text-chalk" /> step 1 · own your keys
        </Eyebrow>
        <h3 className="font-display text-[22px] font-semibold text-chalk">Create a self-custodial wallet</h3>
        <p className="mt-1.5 max-w-md text-[14px] text-silver">
          Generated locally with the Tether <span className="text-chalk">WDK</span>. Your seed never
          leaves this machine — we never see your private key.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-2.5">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={24}
            placeholder="Your name"
            className="w-44 rounded-default border border-edge-2 bg-panel-2 px-3 py-2.5 font-mono text-[13px] text-chalk outline-none placeholder:text-faint focus:border-edge-3"
          />
          <Button variant="solid" onClick={create} disabled={loading}>
            {loading ? "Generating…" : "Create wallet"}
          </Button>
        </div>
        {error && <p className="mt-2 text-[13px] text-steel">{error}</p>}
      </Card>
    );
  }

  const words = wallet.mnemonic.split(" ");
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <Eyebrow className="flex items-center gap-2">
          <ShieldCheck size={12} className="text-chalk" /> wallet ready ·{" "}
          {wallet.backend === "wdk" ? "Tether WDK" : "viem"}
        </Eyebrow>
        <span className="font-mono text-[12px] text-chalk">{usdt(wallet.usdtHuman, 0)} USDT</span>
      </div>

      <div className="mt-3 rounded-default border border-edge bg-panel-2 px-3 py-2">
        <span className="label-mono !text-[9px]">your address</span>
        <div className="break-all font-mono text-[13px] text-silver">{wallet.address}</div>
      </div>

      <div className="mt-3">
        <div className="flex items-center justify-between">
          <span className="label-mono !text-[9px]">recovery phrase · only you hold this</span>
          <div className="flex gap-1.5">
            <button onClick={() => setRevealed((r) => !r)} className="text-steel hover:text-chalk">
              {revealed ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
            <button onClick={copy} className="text-steel hover:text-chalk">
              {copied ? <Check size={14} className="text-chalk" /> : <Copy size={14} />}
            </button>
          </div>
        </div>
        <div className="relative mt-1.5">
          <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
            {words.map((w, i) => (
              <div key={i} className="flex items-center gap-1.5 rounded-[3px] border border-edge bg-void px-2 py-1.5">
                <span className="font-mono text-[9px] text-ghost">{i + 1}</span>
                <span className="font-mono text-[12px] text-silver">{w}</span>
              </div>
            ))}
          </div>
          {!revealed && (
            <button
              onClick={() => setRevealed(true)}
              className="absolute inset-0 grid place-items-center rounded-default bg-void/80 backdrop-blur-md"
            >
              <span className="label-mono flex items-center gap-1.5">
                <Eye size={12} /> tap to reveal
              </span>
            </button>
          )}
        </div>
      </div>

      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-4">
        <Button variant="solid" className="w-full" onClick={() => onCreated(wallet)}>
          Enter the match room
        </Button>
      </motion.div>
    </Card>
  );
}
