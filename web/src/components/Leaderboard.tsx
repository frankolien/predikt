import { useEffect, useState } from "react";
import { Coins } from "lucide-react";
import { api, type Account } from "../lib/api";
import { Card, Eyebrow } from "./ui";
import { usdt } from "../lib/format";
import { cn } from "../lib/cn";

/** Compact global points leaderboard. `refreshKey` bumps to re-pull after a settle. */
export function Leaderboard({ meId, refreshKey }: { meId?: string; refreshKey?: number }) {
  const [rows, setRows] = useState<Account[]>([]);
  useEffect(() => {
    api.leaderboard()
      .then((r) => setRows(r.leaderboard))
      .catch(() => {});
  }, [refreshKey]);

  if (rows.length === 0) return null;

  return (
    <Card className="overflow-hidden">
      <div className="border-b border-edge px-4 py-3">
        <Eyebrow>leaderboard · top players</Eyebrow>
      </div>
      <div className="px-4 py-1.5">
        {rows.slice(0, 8).map((u, i) => (
          <div
            key={u.id}
            className={cn(
              "-mx-2 flex items-center justify-between rounded-default px-2 py-1.5",
              meId === u.id && "bg-live-soft",
            )}
          >
            <span className="flex items-center gap-2.5">
              <span className="w-4 text-right font-mono text-[11px] text-steel">{i + 1}</span>
              <span className="text-[13px] text-chalk">{u.handle}</span>
              {meId === u.id && (
                <span className="rounded-[2px] bg-live px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-wide text-void">
                  you
                </span>
              )}
            </span>
            <span className="flex items-center gap-1 font-mono text-[12px] tabular-nums text-live">
              <Coins size={10} /> {usdt(u.points, 0)}
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
}
