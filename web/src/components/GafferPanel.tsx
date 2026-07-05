import { useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Cpu, Lock, Sparkles } from "lucide-react";
import { streamGaffer, type GafferEvent, type AiStatus } from "../lib/api";
import { Button, Card, Eyebrow, Pill } from "./ui";
import { SpeakButton } from "./SpeakButton";
import { cn } from "../lib/cn";

type Read = Extract<GafferEvent, { type: "done" }>["read"];

export function GafferPanel({
  fixtureId,
  ai,
  onUsePick,
  disabled,
  voiceReady,
}: {
  fixtureId: string;
  ai?: AiStatus;
  onUsePick: (p: { homeGoals: number; awayGoals: number }) => void;
  disabled?: boolean;
  voiceReady?: boolean;
}) {
  const [text, setText] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [read, setRead] = useState<Read | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [onDevice, setOnDevice] = useState(true);
  const cleanup = useRef<null | (() => void)>(null);

  const ask = () => {
    setText("");
    setRead(null);
    setError(null);
    setStreaming(true);
    cleanup.current?.();
    cleanup.current = streamGaffer(fixtureId, (e) => {
      if (e.type === "status") setOnDevice(e.onDevice);
      else if (e.type === "analysis") setText((t) => t + e.delta);
      else if (e.type === "done") {
        setRead(e.read);
        setStreaming(false);
      } else if (e.type === "error") {
        setError(e.message);
        setStreaming(false);
      }
    });
  };

  const busy = streaming;
  const modelLoading = ai?.state === "loading";

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-edge px-4 py-3">
        <div className="flex items-center gap-2.5">
          <span className="grid h-7 w-7 place-items-center rounded-default border border-edge-2 text-chalk">
            <Sparkles size={14} />
          </span>
          <div>
            <div className="font-display text-[16px] font-semibold leading-none text-chalk">The Gaffer</div>
            <div className="label-mono mt-1 !text-[9px]">your private AI pundit</div>
          </div>
        </div>
        <Pill strong={onDevice}>
          {onDevice ? <Lock size={10} /> : <Cpu size={10} />}
          {onDevice ? "on-device · private" : "scripted"}
        </Pill>
      </div>

      <div className="px-4 py-4">
        {!text && !busy && !read && (
          <div className="flex flex-col items-start gap-3">
            <p className="max-w-md text-[14px] text-silver">
              Get a private read on this tie — form, tactical battle, a called scoreline and a hot
              take. It runs <span className="text-chalk">entirely on your device</span>. Your bets
              never leave your laptop.
            </p>
            <Button variant="solid" onClick={ask} disabled={disabled || modelLoading}>
              <Sparkles size={13} />
              {modelLoading ? `Loading model ${Math.round((ai?.progress ?? 0) * 100)}%` : "Ask the Gaffer"}
            </Button>
            {modelLoading && (
              <span className="label-mono !text-[9px]">first run downloads the model once, then it's instant</span>
            )}
          </div>
        )}

        {(busy || text) && (
          <div className="min-h-[64px]">
            <Eyebrow className="mb-2 flex items-center gap-2">
              <Cpu size={11} className="text-chalk" />
              {busy ? "thinking on-device…" : "the read"}
            </Eyebrow>
            <p className={cn("whitespace-pre-wrap text-[14.5px] leading-relaxed text-silver", busy && "caret")}>
              {text}
            </p>
          </div>
        )}

        {error && <p className="mt-2 text-[13px] text-steel">{error}</p>}

        <AnimatePresence>
          {read && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
              className="mt-4 border-t border-edge pt-4"
            >
              <div className="flex flex-wrap items-end gap-5">
                <div>
                  <Eyebrow className="mb-1.5">called scoreline</Eyebrow>
                  <div className="font-mono text-[30px] font-bold leading-none text-chalk tabular-nums">
                    {read.predictedScore.homeGoals}
                    <span className="mx-1 text-ghost">:</span>
                    {read.predictedScore.awayGoals}
                  </div>
                </div>
                <div className="min-w-[120px] flex-1">
                  <Eyebrow className="mb-1.5">confidence</Eyebrow>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-panel-2">
                    <motion.div
                      className="h-full rounded-full bg-chalk"
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.round(read.confidence * 100)}%` }}
                      transition={{ duration: 0.8, ease: "easeOut" }}
                    />
                  </div>
                  <span className="label-mono mt-1 block">{Math.round(read.confidence * 100)}%</span>
                </div>
                <Button variant="outline" size="sm" onClick={() => onUsePick(read.predictedScore)} disabled={disabled}>
                  Use this pick
                </Button>
              </div>

              <div className="relative mt-4 rounded-default border border-edge bg-white/[0.02] p-4">
                <span className="label-mono absolute -top-2 left-3 bg-panel px-1.5">hot take</span>
                <p className="font-display text-[19px] font-medium leading-snug text-chalk">
                  “{read.hotTake}”
                </p>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2.5">
                <Button variant="ghost" size="sm" onClick={ask}>
                  Ask again
                </Button>
                {voiceReady && <SpeakButton text={`${read.analysis} ${read.hotTake}`} label="Hear the read" />}
                <span className="label-mono !text-[9px]">generated locally — no cloud</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </Card>
  );
}
