import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Loader2, TriangleAlert } from "lucide-react";
import { useApp } from "../context";
import { cn } from "../lib/cn";
import { resolveNetwork, type NetworkInfo } from "../lib/api";

/** DEMO (local) · TESTNET · LIVE (mainnet). */
const tagOf = (k: NetworkInfo["kind"]) => (k === "mainnet" ? "LIVE" : k === "testnet" ? "TESTNET" : "DEMO");

function tone(kind: NetworkInfo["kind"]) {
  if (kind === "mainnet") return { text: "text-live", border: "border-live/40", dot: "bg-live shadow-[0_0_8px_var(--color-live)]" };
  if (kind === "testnet") return { text: "text-chalk", border: "border-edge-3", dot: "bg-chalk" };
  return { text: "text-steel", border: "border-edge-2", dot: "bg-steel" };
}

/**
 * Wallet network switch — the Solflare-style control. Shows the active chain and,
 * on click, a list of every network the wallet can move to. The SAME self-custodial
 * address is used on each; only the balance you read and the chain you send on
 * change. Switching to mainnet ("LIVE") passes through a real-money confirm gate.
 *
 * The floating menu is portalled to <body> and positioned under the trigger, so it
 * escapes clipping ancestors (the nav's backdrop-blur, the money card's
 * overflow-hidden). `inline` instead renders the panel in-flow — for the profile
 * popover, which is itself a floating panel.
 */
export function NetworkSwitcher({
  inline = false,
  align = "right",
  className,
}: {
  inline?: boolean;
  align?: "left" | "right";
  className?: string;
}) {
  const { health, walletNetwork, switchWalletNetwork } = useApp();
  const active = resolveNetwork(health, walletNetwork);
  const activeKey = active?.key;
  // Only offer networks you can actually switch to (boot net + any with a known
  // USD₮). Hides disabled "soon" rows like Local on a testnet deploy.
  const networks: NetworkInfo[] = (health?.networks ?? (health?.network ? [health.network] : [])).filter(
    (n) => n.available !== false || n.key === activeKey,
  );

  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState<NetworkInfo | null>(null); // mainnet pending confirmation
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [coords, setCoords] = useState<{ top: number; left: number; width: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const close = () => {
    setOpen(false);
    setConfirm(null);
  };

  // Position the portalled menu under the trigger; keep it aligned on scroll/resize.
  useLayoutEffect(() => {
    if (!open || inline) return;
    const place = () => {
      const el = triggerRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const width = 256;
      const left = align === "right" ? Math.max(8, r.right - width) : r.left;
      setCoords({ top: r.bottom + 8, left, width });
    };
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open, inline, align]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      close();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!active) return null;

  const pick = (n: NetworkInfo) => {
    if (!n.available || n.key === activeKey) return;
    if (n.kind === "mainnet") {
      setConfirm(n); // real money — gate it
      return;
    }
    void doSwitch(n.key);
  };

  const doSwitch = async (key: string) => {
    setBusyKey(key);
    try {
      await switchWalletNetwork(key);
    } finally {
      setBusyKey(null);
      close();
    }
  };

  const at = tone(active.kind);

  const list = (
    <div className="flex flex-col gap-0.5">
      {!confirm &&
        networks.map((n) => {
          const t = tone(n.kind);
          const isActive = n.key === activeKey;
          const disabled = !n.available;
          return (
            <button
              key={n.key}
              onClick={() => pick(n)}
              disabled={disabled || busyKey !== null}
              title={disabled ? "Not configured on this build" : `${n.label} · chain ${n.chainId}`}
              className={cn(
                "flex items-center gap-2.5 rounded-default px-2 py-2 text-left transition-colors",
                disabled ? "cursor-not-allowed opacity-40" : "hover:bg-white/[0.04]",
              )}
            >
              <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", t.dot)} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-mono text-[12px] text-chalk">{n.label}</span>
                <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-faint">
                  {tagOf(n.kind)}
                  {n.faucet ? " · free test USD₮" : n.kind === "mainnet" ? " · real USD₮" : ""}
                </span>
              </span>
              {busyKey === n.key ? (
                <Loader2 size={13} className="shrink-0 animate-spin text-steel" />
              ) : isActive ? (
                <Check size={13} className="shrink-0 text-live" />
              ) : disabled ? (
                <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-faint">soon</span>
              ) : null}
            </button>
          );
        })}

      {confirm && (
        <div className="px-1 py-1">
          <div className="flex items-center gap-2 text-live">
            <TriangleAlert size={14} />
            <span className="font-mono text-[11px] uppercase tracking-[0.12em]">Go live?</span>
          </div>
          <p className="mt-2 font-mono text-[11px] leading-relaxed text-steel">
            Switching to <span className="text-chalk">{confirm.label}</span> uses <span className="text-live">real USD₮</span>.
            Balances and sends are real money — there's no faucet, so you fund your own wallet. Your address stays the same.
          </p>
          <div className="mt-3 flex gap-2">
            <button
              onClick={() => setConfirm(null)}
              className="flex-1 rounded-default border border-edge-2 px-2.5 py-1.5 font-mono text-[11px] uppercase tracking-[0.1em] text-steel transition-colors hover:text-chalk"
            >
              Cancel
            </button>
            <button
              onClick={() => doSwitch(confirm.key)}
              disabled={busyKey !== null}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-default bg-live px-2.5 py-1.5 font-mono text-[11px] uppercase tracking-[0.1em] text-void shadow-[0_8px_24px_-10px_var(--color-live)] transition-transform hover:-translate-y-px disabled:opacity-50"
            >
              {busyKey ? <Loader2 size={12} className="animate-spin" /> : "Switch to Live"}
            </button>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className={cn("relative", inline && "w-full", className)}>
      <button
        ref={triggerRef}
        onClick={() => (open ? close() : setOpen(true))}
        title={`${active.label} · chain ${active.chainId} — switch network`}
        className={cn(
          "group flex items-center gap-2 rounded-full border bg-white/[0.03] px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.12em] transition-colors hover:bg-white/[0.06]",
          at.border,
          inline && "w-full",
        )}
      >
        <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", at.dot)} />
        <span className="hidden text-steel md:inline">{active.label}</span>
        <span className={cn("hidden opacity-40 md:inline", at.text)}>·</span>
        <span className={at.text}>{tagOf(active.kind)}</span>
        <ChevronDown
          size={11}
          className={cn(
            "shrink-0 text-steel transition-all group-hover:text-chalk",
            open && "rotate-180",
            inline && "ml-auto",
          )}
        />
      </button>

      {open && inline && (
        <div ref={menuRef} className="mt-2 rounded-default border border-edge-2 bg-white/[0.02] p-1">
          {list}
        </div>
      )}

      {open &&
        !inline &&
        coords &&
        createPortal(
          <div
            ref={menuRef}
            style={{ position: "fixed", top: coords.top, left: coords.left, width: coords.width }}
            className="z-[95] rounded-default border border-edge-2 bg-void/95 p-1.5 shadow-[0_20px_60px_-20px_rgba(0,0,0,0.8)] backdrop-blur-md"
          >
            <div className="px-2 pb-1.5 pt-1 font-mono text-[9px] uppercase tracking-[0.16em] text-faint">Wallet network</div>
            {list}
          </div>,
          document.body,
        )}
    </div>
  );
}
