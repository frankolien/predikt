import { useEffect, useRef, useState } from "react";
import { Cpu, RotateCw } from "lucide-react";
import { Eyebrow, LiveDot } from "../ui";
import { SpeakButton } from "../SpeakButton";
import { streamDirector, type DirectorEvent } from "../../lib/api";

/**
 * The Gaffer narrating a tournament beat (draw / preview / recap / trophy),
 * generated on-device via QVAC and streamed token-by-token. Speak-aloud too.
 */
export function GafferDirector({
  tournamentId,
  kind,
  matchId,
  title,
  auto = true,
}: {
  tournamentId: string;
  kind: "draw" | "preview" | "recap" | "trophy";
  matchId?: string;
  title?: string;
  auto?: boolean;
}) {
  const [text, setText] = useState("");
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const [onDevice, setOnDevice] = useState(false);
  const [runKey, setRunKey] = useState(auto ? 1 : 0);
  const stopRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (runKey === 0) return;
    setText("");
    setRunning(true);
    setDone(false);
    const stop = streamDirector(
      tournamentId,
      kind,
      (e: DirectorEvent) => {
        if (e.type === "status") setOnDevice(e.onDevice);
        else if (e.type === "delta") setText((t) => t + e.text);
        else if (e.type === "done") {
          if (e.text) setText(e.text);
          setRunning(false);
          setDone(true);
        } else if (e.type === "error") {
          setRunning(false);
          setDone(true);
          setText((prev) => prev || `The Gaffer's lost his voice — ${e.message}.`);
        }
      },
      matchId,
    );
    stopRef.current = stop;
    return () => stop();
  }, [tournamentId, kind, matchId, runKey]);

  return (
    <div className="rounded-lg border border-edge bg-panel/60 p-4">
      <div className="flex items-center justify-between">
        <Eyebrow>{title ?? "the gaffer · tournament director"}</Eyebrow>
        {running ? (
          <span className="inline-flex items-center gap-1.5 font-mono text-[9.5px] uppercase tracking-[0.14em] text-live">
            <LiveDot /> {onDevice ? "on-device" : "thinking"}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 font-mono text-[9.5px] uppercase tracking-[0.14em] text-faint">
            <Cpu size={10} /> QVAC
          </span>
        )}
      </div>

      <p className={`mt-2.5 text-[14px] leading-relaxed ${text ? "text-silver" : "text-faint"} ${running ? "caret" : ""}`}>
        {text || (running ? "" : "…")}
      </p>

      {done && text && (
        <div className="mt-3 flex items-center gap-2">
          <SpeakButton text={text} label="Hear it" />
          <button
            onClick={() => setRunKey((k) => k + 1)}
            className="inline-flex items-center gap-1.5 rounded-default border border-edge-2 px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.1em] text-steel hover:border-edge-3 hover:text-chalk"
          >
            <RotateCw size={11} /> Again
          </button>
        </div>
      )}
      {!auto && runKey === 0 && (
        <button
          onClick={() => setRunKey(1)}
          className="mt-2 inline-flex items-center gap-1.5 rounded-default border border-edge-2 px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.1em] text-steel hover:border-edge-3 hover:text-chalk"
        >
          <Cpu size={11} /> Ask the Gaffer
        </button>
      )}
    </div>
  );
}
