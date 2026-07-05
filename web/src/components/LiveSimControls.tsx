import { useEffect, useState } from "react";
import { Play, Plus, Square, RotateCcw, Clock } from "lucide-react";
import { api, type FixtureSummary } from "../lib/api";
import { Eyebrow } from "./ui";

/**
 * Demo-only control. Real matches go live at their real kickoff; this drives the
 * live in-play experience on demand so it can be shown any time. Local mode only.
 */
export function LiveSimControls({
  fixture,
  onChanged,
}: {
  fixture: FixtureSummary;
  onChanged: () => void;
}) {
  const [minute, setMinute] = useState(1);
  const [home, setHome] = useState(0);
  const [away, setAway] = useState(0);

  // Seed from the current live score when switching fixtures.
  useEffect(() => {
    setMinute(typeof fixture.minute === "number" ? fixture.minute : fixture.isLive ? 1 : 1);
    setHome(fixture.result?.homeGoals ?? 0);
    setAway(fixture.result?.awayGoals ?? 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fixture.id]);

  const push = async (m: number, h: number, a: number, status: "live" | "finished" = "live") => {
    setMinute(m);
    setHome(h);
    setAway(a);
    await api.simulateLive(fixture.id, m, h, a, status).catch(() => {});
    onChanged();
  };

  const btn =
    "inline-flex items-center gap-1.5 rounded-default border border-edge-2 px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.1em] text-silver hover:border-edge-3 hover:text-chalk";

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-edge-2 px-3 py-2.5">
      <Eyebrow className="mr-1 !text-[9px]">demo · simulate live</Eyebrow>
      <button className={btn} onClick={() => push(1, 0, 0, "live")}>
        <Play size={11} /> kick off
      </button>
      <button className={btn} onClick={() => push(minute, home + 1, away, "live")}>
        <Plus size={11} /> {fixture.home.code}
      </button>
      <button className={btn} onClick={() => push(minute, home, away + 1, "live")}>
        <Plus size={11} /> {fixture.away.code}
      </button>
      <button className={btn} onClick={() => push(Math.min(90, minute + 15), home, away, "live")}>
        <Clock size={11} /> +15'
      </button>
      <button className={btn} onClick={() => push(90, home, away, "finished")}>
        <Square size={11} /> full time
      </button>
      <button className={btn} onClick={async () => { await api.clearLive(fixture.id).catch(() => {}); onChanged(); }}>
        <RotateCcw size={11} /> reset
      </button>
    </div>
  );
}
