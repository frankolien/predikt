import { Link, NavLink } from "react-router-dom";
import { Cpu, Coins, User, Sun, Moon } from "lucide-react";
import type { AiStatus, Account } from "../lib/api";
import type { Theme } from "../lib/theme";
import { usdt } from "../lib/format";
import { cn } from "../lib/cn";
import { Pill, LiveDot, Avatar } from "./ui";

const LINKS = [
  { to: "/app", label: "Hub" },
  { to: "/predict", label: "Predict" },
  { to: "/organize", label: "Organize" },
  { to: "/fantasy", label: "Fantasy" },
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

export function Nav({
  ai,
  account,
  theme,
  onToggleTheme,
}: {
  ai?: AiStatus;
  account?: Account | null;
  theme?: Theme;
  onToggleTheme?: () => void;
}) {
  return (
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
          {account ? (
            <div className="flex items-center gap-2 rounded-chip border border-edge-2 py-1 pl-1 pr-2.5">
              <Avatar seed={account.handle} size={20} />
              <span className="font-mono text-[11px] text-chalk">{account.handle}</span>
              <span className="flex items-center gap-1 font-mono text-[11px] text-live">
                <Coins size={10} /> {usdt(account.points, 0)}
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
  );
}
