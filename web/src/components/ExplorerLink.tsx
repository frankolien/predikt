import { ArrowUpRight } from "lucide-react";
import { useApp } from "../context";
import { shortHash } from "../lib/format";

/**
 * A transaction hash. Links out to the network's block explorer when there is
 * one (testnet / mainnet — e.g. Arbiscan); on the local demo chain there's no
 * public explorer, so it renders the short hash as plain text. Reads the
 * explorer base from /api/health (network.explorer), so it lights up
 * automatically the moment the backend is pointed at a real chain.
 */
export function ExplorerLink({ hash, size = 10 }: { hash?: string | null; size?: number }) {
  const { health } = useApp();
  if (!hash) return null;
  const base = health?.network?.explorer;
  if (!base) return <span>{shortHash(hash)}</span>;
  return (
    <a
      href={`${base}/tx/${hash}`}
      target="_blank"
      rel="noreferrer"
      onClick={(e) => e.stopPropagation()}
      className="inline-flex items-center gap-1 underline decoration-dotted underline-offset-2 transition-colors hover:text-chalk"
    >
      {shortHash(hash)}
      <ArrowUpRight size={size} />
    </a>
  );
}
