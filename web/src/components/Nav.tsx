import { useEffect, useRef, useState } from "react";
import { Link, NavLink } from "react-router-dom";
import { Cpu, Coins, User, Sun, Moon, Wallet as WalletIcon, Copy, Check, LayoutGrid, Radio, Trophy, Users, Pencil, LogOut, Loader2, ChevronsUpDown, type LucideIcon } from "lucide-react";
import { api, type AiStatus, type Account, type Wallet, type NetworkInfo } from "../lib/api";
import type { Theme } from "../lib/theme";
import { useApp } from "../context";
import { usdt, shortAddr } from "../lib/format";
import { cn } from "../lib/cn";
import { Pill, LiveDot, Avatar } from "./ui";
import { Wordmark } from "./Logo";
import { NetworkSwitcher } from "./NetworkSwitcher";

const LINKS: { to: string; label: string; icon: LucideIcon }[] = [
  { to: "/app", label: "Hub", icon: LayoutGrid },
  { to: "/predict", label: "Predict", icon: Radio },
  { to: "/organize", label: "Organize", icon: Trophy },
  { to: "/fantasy", label: "Fantasy", icon: Users },
];

function NavItem({ to, label }: { to: string; label: string }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        cn(
          "rounded-chip px-2.5 py-1 font-mono text-[11px] uppercase tracking-[0.1em] transition-colors",
          isActive ? "text-chalk" : "text-steel hover:text-chalk",
        )
      }
    >
      {label}
    </NavLink>
  );
}

/** Primary navigation on mobile — the top-bar links are md-only, so phones get a
   thumb-reachable bottom tab bar (sports-app convention). */
function MobileTabBar() {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 grid grid-cols-4 border-t border-edge bg-void/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden">
      {LINKS.map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) =>
            cn(
              "flex flex-col items-center gap-1 py-2 font-mono text-[9px] uppercase tracking-[0.14em] transition-colors",
              isActive ? "text-chalk" : "text-steel",
            )
          }
        >
          {({ isActive }) => (
            <>
              <Icon size={19} className={cn("transition-colors", isActive && "text-live")} />
              {label}
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}

function AiPill({ ai }: { ai?: AiStatus }) {
  if (!ai) return <Pill><Cpu size={11} /> AI · booting</Pill>;
  if (ai.state === "ready")
    return (
      <Pill strong>
        <LiveDot /> On-device · {label(ai.model)}
      </Pill>
    );
  if (ai.state === "loading")
    return <Pill><Cpu size={11} /> Model {Math.round(ai.progress * 100)}%</Pill>;
  if (ai.state === "mock") return null; // scripted fallback → hide AI chrome; the product leads with WDK
  return <Pill><Cpu size={11} /> AI · {ai.state}</Pill>;
}

function label(model: string) {
  return model.replace(/_/g, " ").replace(/ INST.*$/i, "").trim().slice(0, 14);
}

// Which chain the wallet is on (DEMO · TESTNET · LIVE) is now an interactive
// control — see <NetworkSwitcher>, which reads the active network from context
// and lets the user switch (with a real-money gate for mainnet).

/** Your self-custodial USD₮ balance + a click-to-copy address. */
function WalletChip({ wallet }: { wallet: Wallet }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard
      ?.writeText(wallet.address)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1400);
      })
      .catch(() => {
        /* clipboard blocked — address is in the title tooltip */
      });
  };
  return (
    <button
      onClick={copy}
      title={copied ? "Address copied" : `Copy wallet address · ${wallet.address}`}
      className="group flex items-center gap-1.5 rounded-chip border border-edge-2 px-2 py-1 font-mono text-[11px] transition-colors hover:border-edge-3"
    >
      <WalletIcon size={11} className="text-live" />
      <span className="text-chalk">{usdt(wallet.usdtHuman)}</span>
      <span className="text-steel">USD₮</span>
      <span className="hidden text-faint sm:inline">·</span>
      <span className="hidden text-steel sm:inline">{shortAddr(wallet.address)}</span>
      {copied ? (
        <Check size={11} className="text-live" />
      ) : (
        <Copy size={11} className="text-steel transition-colors group-hover:text-chalk" />
      )}
    </button>
  );
}

/** Account chip → dropdown to rename your handle or sign out. In the desktop
 *  sidebar the chip sits at the bottom, so the menu opens upward (`dropUp`). */
function AccountMenu({ account, dropUp = false }: { account: Account; dropUp?: boolean }) {
  const { signOut, refreshAccount } = useApp();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(account.handle);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  // Keep the draft in sync if the handle changes underneath us.
  useEffect(() => setDraft(account.handle), [account.handle]);

  // Close on outside-click / Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const save = async () => {
    const next = draft.trim();
    if (next === account.handle) {
      setEditing(false);
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await api.account.rename(next);
      refreshAccount();
      setEditing(false);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-chip border border-edge-2 py-1 pl-1 pr-2.5 transition-colors hover:border-edge-3"
      >
        <Avatar seed={account.handle} size={20} />
        <span className="hidden font-mono text-[11px] text-chalk sm:inline">{account.handle}</span>
        <span className="flex items-center gap-1 font-mono text-[11px] text-live">
          <Coins size={10} /> {usdt(account.points, 0)} <span className="text-faint">pts</span>
        </span>
      </button>

      {open && (
        <div
          className={cn(
            "absolute right-0 z-50 w-64 rounded-default border border-edge-2 bg-void/95 p-3 shadow-[0_20px_60px_-20px_rgba(0,0,0,0.8)] backdrop-blur-md",
            dropUp ? "bottom-[calc(100%+8px)]" : "top-[calc(100%+8px)]",
          )}
        >
          <div className="flex items-center gap-2.5">
            <Avatar seed={account.handle} size={34} />
            <div className="min-w-0">
              <div className="truncate font-display text-[14px] font-semibold text-chalk">{account.handle}</div>
              <div className="font-mono text-[10px] text-live">{usdt(account.points, 0)} pts</div>
            </div>
          </div>

          {editing ? (
            <div className="mt-3">
              <span className="label-mono mb-1 block">new username</span>
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") save();
                  if (e.key === "Escape") {
                    setEditing(false);
                    setDraft(account.handle);
                    setErr(null);
                  }
                }}
                maxLength={24}
                autoFocus
                className="w-full rounded-default border border-edge-2 bg-panel-2 px-2.5 py-2 font-mono text-[13px] text-chalk placeholder:text-faint focus:border-edge-3 focus:outline-none"
              />
              {err && <p className="mt-1.5 font-mono text-[10px] text-steel">{err}</p>}
              <div className="mt-2 flex gap-2">
                <button
                  onClick={() => {
                    setEditing(false);
                    setDraft(account.handle);
                    setErr(null);
                  }}
                  className="flex-1 rounded-default px-2.5 py-1.5 font-mono text-[11px] uppercase tracking-[0.1em] text-steel hover:text-chalk"
                >
                  Cancel
                </button>
                <button
                  onClick={save}
                  disabled={busy || draft.trim().length < 2}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-default bg-white px-2.5 py-1.5 font-mono text-[11px] uppercase tracking-[0.1em] text-void disabled:opacity-40"
                >
                  {busy ? <Loader2 size={12} className="animate-spin" /> : "Save"}
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-3 flex flex-col gap-0.5 border-t border-edge pt-2">
              <button
                onClick={() => setEditing(true)}
                className="flex items-center gap-2 rounded-default px-2 py-2 font-mono text-[12px] text-chalk hover:bg-white/[0.04]"
              >
                <Pencil size={12} className="text-steel" /> Change username
              </button>
              <button
                onClick={signOut}
                className="flex items-center gap-2 rounded-default px-2 py-2 font-mono text-[12px] text-steel hover:bg-white/[0.04] hover:text-chalk"
              >
                <LogOut size={12} /> Sign out
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Desktop sidebar account control — the foot of the rail shows just your name +
 * points; clicking it opens a profile panel (wallet, network, AI, rename, theme,
 * sign out). Keeps the rail clean and gives the familiar "click your name" feel.
 */
function ProfileMenu({
  account,
  wallet,
  ai,
  theme,
  onToggleTheme,
}: {
  account: Account;
  wallet?: Wallet | null;
  ai?: AiStatus;
  theme?: Theme;
  onToggleTheme?: () => void;
}) {
  const { signOut, refreshAccount } = useApp();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(account.handle);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => setDraft(account.handle), [account.handle]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setEditing(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        setEditing(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const save = async () => {
    const next = draft.trim();
    if (next === account.handle) {
      setEditing(false);
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await api.account.rename(next);
      refreshAccount();
      setEditing(false);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative w-full" ref={ref}>
      {/* trigger — just your name + points */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2.5 rounded-default border border-edge-2 px-2.5 py-2 transition-colors hover:border-edge-3"
      >
        <Avatar seed={account.handle} size={26} />
        <div className="min-w-0 flex-1 text-left">
          <div className="truncate font-mono text-[12px] text-chalk">{account.handle}</div>
          <div className="flex items-center gap-1 font-mono text-[10px] text-live">
            <Coins size={9} /> {usdt(account.points, 0)} <span className="text-faint">pts</span>
          </div>
        </div>
        <ChevronsUpDown size={14} className="shrink-0 text-steel" />
      </button>

      {open && (
        <div className="absolute bottom-[calc(100%+8px)] left-0 z-50 w-72 rounded-default border border-edge-2 bg-void/95 p-3 shadow-[0_20px_60px_-20px_rgba(0,0,0,0.8)] backdrop-blur-md">
          <div className="flex items-center gap-2.5">
            <Avatar seed={account.handle} size={34} />
            <div className="min-w-0">
              <div className="truncate font-display text-[14px] font-semibold text-chalk">{account.handle}</div>
              <div className="font-mono text-[10px] text-live">{usdt(account.points, 0)} pts</div>
            </div>
          </div>

          {editing ? (
            <div className="mt-3">
              <span className="label-mono mb-1 block">new username</span>
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") save();
                  if (e.key === "Escape") {
                    setEditing(false);
                    setDraft(account.handle);
                    setErr(null);
                  }
                }}
                maxLength={24}
                autoFocus
                className="w-full rounded-default border border-edge-2 bg-panel-2 px-2.5 py-2 font-mono text-[13px] text-chalk placeholder:text-faint focus:border-edge-3 focus:outline-none"
              />
              {err && <p className="mt-1.5 font-mono text-[10px] text-steel">{err}</p>}
              <div className="mt-2 flex gap-2">
                <button
                  onClick={() => {
                    setEditing(false);
                    setDraft(account.handle);
                    setErr(null);
                  }}
                  className="flex-1 rounded-default px-2.5 py-1.5 font-mono text-[11px] uppercase tracking-[0.1em] text-steel hover:text-chalk"
                >
                  Cancel
                </button>
                <button
                  onClick={save}
                  disabled={busy || draft.trim().length < 2}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-default bg-white px-2.5 py-1.5 font-mono text-[11px] uppercase tracking-[0.1em] text-void disabled:opacity-40"
                >
                  {busy ? <Loader2 size={12} className="animate-spin" /> : "Save"}
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* profile detail — wallet, chain, on-device AI */}
              <div className="mt-3 flex flex-col gap-2 border-t border-edge pt-3">
                {wallet && <WalletChip wallet={wallet} />}
                <NetworkSwitcher inline />
                <div className="flex flex-wrap items-center gap-2">
                  <AiPill ai={ai} />
                </div>
              </div>

              {/* actions */}
              <div className="mt-2 flex flex-col gap-0.5 border-t border-edge pt-2">
                <button
                  onClick={() => setEditing(true)}
                  className="flex items-center gap-2 rounded-default px-2 py-2 font-mono text-[12px] text-chalk hover:bg-white/[0.04]"
                >
                  <Pencil size={12} className="text-steel" /> Change username
                </button>
                {onToggleTheme && (
                  <button
                    onClick={onToggleTheme}
                    className="flex items-center gap-2 rounded-default px-2 py-2 font-mono text-[12px] text-chalk hover:bg-white/[0.04]"
                  >
                    {theme === "light" ? <Moon size={12} className="text-steel" /> : <Sun size={12} className="text-steel" />}
                    {theme === "light" ? "Dark mode" : "Light mode"}
                  </button>
                )}
                <button
                  onClick={signOut}
                  className="flex items-center gap-2 rounded-default px-2 py-2 font-mono text-[12px] text-steel hover:bg-white/[0.04] hover:text-chalk"
                >
                  <LogOut size={12} /> Sign out
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

type NavProps = {
  ai?: AiStatus;
  account?: Account | null;
  wallet?: Wallet | null;
  network?: NetworkInfo;
  theme?: Theme;
  onToggleTheme?: () => void;
};

/**
 * Desktop shell navigation — a left sidebar instead of the web's top bar, so the
 * app reads as a native app, not a website. Same destinations + status chips,
 * stacked vertically: brand at the top, nav in the middle, wallet/AI/account at
 * the foot. Rendered only in the Tauri shell (see AppShell).
 */
/** The on-device AI signature, pinned in the rail — the thing that makes this a
 *  desktop app, not a web tab. Honest about state (live / loading / cloud). */
function SidebarAi({ ai }: { ai?: AiStatus }) {
  const ready = ai?.state === "ready";
  const detail = ready
    ? `${label(ai!.model)} · live`
    : ai?.state === "loading"
      ? `loading · ${Math.round(ai.progress * 100)}%`
      : ai?.state === "mock" || ai?.state === "error"
        ? "cloud fallback"
        : "warming up";
  return (
    <div className="mx-3 mb-3 rounded-default border border-edge-2 bg-white/[0.02] px-3 py-2.5">
      <div className="flex items-center gap-2">
        <span className={cn("h-1.5 w-1.5 rounded-full", ready ? "bg-live shadow-[0_0_8px_var(--color-live)]" : "bg-steel")} />
        <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-chalk">On-device AI</span>
      </div>
      <div className="mt-1 truncate font-mono text-[10px] text-steel">{detail}</div>
    </div>
  );
}

export function DesktopSidebar({ ai, account, wallet, theme, onToggleTheme }: NavProps) {
  return (
    <aside className="fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-edge bg-void/70 backdrop-blur-xl">
      {/* brand — a drag region that also clears the macOS traffic lights (overlay title bar) */}
      <div data-tauri-drag-region className="flex shrink-0 items-center px-5 pb-4 pt-8">
        <Link to="/app" aria-label="Predikt — home">
          <Wordmark />
        </Link>
      </div>

      <nav className="flex flex-1 flex-col gap-0.5 px-3">
        {LINKS.map(({ to, label: lbl, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/app"}
            className={({ isActive }) =>
              cn(
                "group flex items-center gap-3 rounded-default px-3 py-2.5 font-mono text-[12px] uppercase tracking-[0.1em] transition-colors",
                isActive ? "bg-white/[0.05] text-chalk" : "text-steel hover:bg-white/[0.03] hover:text-chalk",
              )
            }
          >
            {({ isActive }) => (
              <>
                <Icon
                  size={16}
                  className={cn("shrink-0 transition-colors", isActive ? "text-live" : "text-steel group-hover:text-chalk")}
                />
                <span className="flex-1">{lbl}</span>
                {isActive && <span className="h-1.5 w-1.5 rounded-full bg-live shadow-[0_0_8px_var(--color-live)]" />}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <SidebarAi ai={ai} />

      <div className="border-t border-edge p-3">
        {account ? (
          <ProfileMenu account={account} wallet={wallet} ai={ai} theme={theme} onToggleTheme={onToggleTheme} />
        ) : (
          <Pill>
            <User size={11} /> guest
          </Pill>
        )}
      </div>
    </aside>
  );
}

export function Nav({ ai, account, wallet, theme, onToggleTheme }: NavProps) {
  return (
    <>
    <header className="fixed inset-x-0 top-0 z-50 border-b border-edge bg-void/80 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-[1180px] 2xl:max-w-[1440px] items-center justify-between px-6">
        <div className="flex items-center gap-5">
          <Link to="/" aria-label="Predikt — home">
            <Wordmark />
          </Link>
          <nav className="hidden items-center gap-0.5 md:flex">
            {LINKS.map((l) => (
              <NavItem key={l.to} to={l.to} label={l.label} />
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-2.5">
          <AiPill ai={ai} />
          <NetworkSwitcher />
          {wallet && <WalletChip wallet={wallet} />}
          {account ? (
            <AccountMenu account={account} />
          ) : (
            <Pill>
              <User size={11} /> guest
            </Pill>
          )}
          {onToggleTheme && (
            <button
              onClick={onToggleTheme}
              aria-label="Toggle theme"
              className="grid h-7 w-7 place-items-center rounded-chip border border-edge-2 text-steel hover:border-edge-3 hover:text-chalk"
            >
              {theme === "light" ? <Moon size={13} /> : <Sun size={13} />}
            </button>
          )}
        </div>
      </div>
    </header>
    <MobileTabBar />
    </>
  );
}
