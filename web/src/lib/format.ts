export function shortAddr(a?: string | null): string {
  if (!a) return "—";
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

export function usdt(n?: number | null, dp = 2): string {
  if (n === null || n === undefined) return "—";
  return n.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });
}

export function shortHash(h?: string | null): string {
  if (!h) return "—";
  return `${h.slice(0, 10)}…${h.slice(-6)}`;
}

export function kickoffLabel(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Result of an outcome comparison for badges. */
export function outcomeLabel(h: number, a: number): "HOME" | "DRAW" | "AWAY" {
  if (h > a) return "HOME";
  if (h < a) return "AWAY";
  return "DRAW";
}

/** Human phrase for an outcome, e.g. "Canada win" / "a draw". */
export function outcomeText(o: "HOME" | "DRAW" | "AWAY", home: string, away: string): string {
  if (o === "HOME") return `${home} win`;
  if (o === "AWAY") return `${away} win`;
  return "a draw";
}

export interface ImpliedReturn {
  outcome: "HOME" | "DRAW" | "AWAY";
  payout: number; // USDT you'd receive if your outcome lands
  multiple: number; // payout ÷ your stake
  winners: number; // fans sharing that outcome (incl. you)
  pot: number; // total pot this is drawn from
}

/**
 * Pari-mutuel implied return for a prospective pick. NOT a fixed odds quote —
 * it's "if this OUTCOME is the result and the pool locked as-is". With equal
 * buy-ins the pot splits evenly, so payout = pot ÷ winners. `joining` adds your
 * own stake+seat to the projection (use false when you're already in the pool).
 */
export function impliedReturn(
  entries: Array<{ prediction: { homeGoals: number; awayGoals: number } }>,
  stake: number,
  currentPot: number,
  myHome: number,
  myAway: number,
  joining = true,
): ImpliedReturn {
  const outcome = outcomeLabel(myHome, myAway);
  const sameOutcome = entries.filter(
    (e) => outcomeLabel(e.prediction.homeGoals, e.prediction.awayGoals) === outcome,
  ).length;
  const winners = sameOutcome + (joining ? 1 : 0);
  const pot = currentPot + (joining ? stake : 0);
  const payout = winners > 0 ? pot / winners : 0;
  const multiple = stake > 0 ? payout / stake : 0;
  return { outcome, payout, multiple, winners, pot };
}

/** Format a payout multiple like 3.0×, 1.5×, 12×. */
export function oddsLabel(multiple: number): string {
  if (!Number.isFinite(multiple) || multiple <= 0) return "—";
  return `${multiple >= 10 ? Math.round(multiple) : multiple.toFixed(1)}×`;
}
