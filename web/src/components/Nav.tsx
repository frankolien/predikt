import { useState } from "react";
import { Link, NavLink } from "react-router-dom";
import { Cpu, Coins, User, Sun, Moon, Wallet as WalletIcon, Copy, Check, LayoutGrid, Radio, Trophy, Users, type LucideIcon } from "lucide-react";
import type { AiStatus, Account, Wallet } from "../lib/api";
import type { Theme } from "../lib/theme";
import { usdt, shortAddr } from "../lib/format";
import { cn } from "../lib/cn";
import { Pill, LiveDot, Avatar } from "./ui";

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

export function Nav({
  ai,
  account,
  wallet,
  theme,
  onToggleTheme,
}: {
  ai?: AiStatus;
  account?: Account | null;
  wallet?: Wallet | null;
  theme?: Theme;
  onToggleTheme?: () => void;
}) {
  return (
    <>
    <header className="fixed inset-x-0 top-0 z-50 border-b border-edge bg-void/80 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-[1180px] items-center justify-between px-6">
        <div className="flex items-center gap-5">
          <Link to="/" className="font-display text-[19px] font-semibold tracking-[-0.04em] text-chalk">
            Predikt
          </Link>
          <nav className="hidden items-center gap-0.5 md:flex">
            {LINKS.map((l) => (
              <NavItem key={l.to} to={l.to} label={l.label} />
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-2.5">
          <AiPill ai={ai} />
          {wallet && <WalletChip wallet={wallet} />}
          {account ? (
            <div className="flex items-center gap-2 rounded-chip border border-edge-2 py-1 pl-1 pr-2.5">
              <Avatar seed={account.handle} size={20} />
              <span className="hidden font-mono text-[11px] text-chalk sm:inline">{account.handle}</span>
              <span className="flex items-center gap-1 font-mono text-[11px] text-live">
                <Coins size={10} /> {usdt(account.points, 0)} <span className="text-faint">pts</span>
              </span>
            </div>
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
