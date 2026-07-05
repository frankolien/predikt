import { useEffect, useRef, useState } from "react";
import { Cpu } from "lucide-react";
import { streamLiveCommentary } from "../lib/api";
import { Card, Eyebrow } from "./ui";
import { cn } from "../lib/cn";

/** The on-device Gaffer reacting to a live match; re-runs when the score changes. */
export function LiveReaction({ fixtureId, scoreKey }: { fixtureId: string; scoreKey: string }) {
  const [text, setText] = useState("");
  const [streaming, setStreaming] = useState(false);
  const cleanup = useRef<null | (() => void)>(null);

  useEffect(() => {
    setText("");
    setStreaming(true);
    cleanup.current?.();
    cleanup.current = streamLiveCommentary(fixtureId, (e) => {
      if (e.type === "reaction") setText((t) => t + e.delta);
      else if (e.type === "done" || e.type === "error") setStreaming(false);
    });
    return () => cleanup.current?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fixtureId, scoreKey]);

  return (
    <Card className="px-4 py-3.5">
      <Eyebrow className="mb-1.5 flex items-center gap-2">
        <Cpu size={11} className="text-live" /> the Gaffer, reacting on-device
      </Eyebrow>
      <p className={cn("min-h-[20px] text-[14px] leading-relaxed text-silver", streaming && "caret")}>
        {text || (streaming ? "" : "…")}
      </p>
    </Card>
  );
}
