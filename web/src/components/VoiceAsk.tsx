import { useRef, useState } from "react";
import { Mic, Square, Loader2, Cpu } from "lucide-react";
import { voice, streamAsk, type VoiceStatus } from "../lib/api";
import { startWavRecording, type WavRecorder } from "../lib/audio";
import { Card, Eyebrow, Pill } from "./ui";
import { SpeakButton } from "./SpeakButton";
import { cn } from "../lib/cn";

type Phase = "idle" | "recording" | "transcribing" | "answering";

export function VoiceAsk({ fixtureId, status }: { fixtureId: string; status: VoiceStatus | null }) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [transcript, setTranscript] = useState("");
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState<string | null>(null);
  const recorder = useRef<WavRecorder | null>(null);
  const cleanupAsk = useRef<null | (() => void)>(null);

  // Hide entirely if STT will never be available.
  if (status?.stt === "unavailable") return null;

  const loading = status?.stt === "loading" || !status;

  const start = async () => {
    setError(null);
    setTranscript("");
    setAnswer("");
    try {
      recorder.current = await startWavRecording();
      setPhase("recording");
    } catch {
      setError("Microphone permission denied.");
    }
  };

  const stopAndAsk = async () => {
    if (!recorder.current) return;
    setPhase("transcribing");
    try {
      const wav = await recorder.current.stop();
      recorder.current = null;
      const { text } = await voice.transcribe(wav);
      const q = text.trim();
      setTranscript(q);
      if (!q) {
        setPhase("idle");
        setError("Didn't catch that — try again.");
        return;
      }
      setPhase("answering");
      cleanupAsk.current?.();
      cleanupAsk.current = streamAsk(fixtureId, q, (e) => {
        if (e.type === "analysis") setAnswer((a) => a + e.delta);
        else if (e.type === "done" || e.type === "error") setPhase("idle");
      });
    } catch (err) {
      setPhase("idle");
      setError((err as Error).message);
    }
  };

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-edge px-4 py-3">
        <div className="flex items-center gap-2.5">
          <span className="grid h-7 w-7 place-items-center rounded-default border border-edge-2 text-chalk">
            <Mic size={14} />
          </span>
          <div>
            <div className="font-display text-[16px] font-semibold leading-none text-chalk">Ask by voice</div>
            <div className="label-mono mt-1 !text-[9px]">talk to the Gaffer · on-device</div>
          </div>
        </div>
        <Pill strong={!loading}>
          <Cpu size={10} /> {loading ? "loading model" : "whisper · local"}
        </Pill>
      </div>

      <div className="px-4 py-4">
        <div className="flex items-center gap-3">
          {phase === "recording" ? (
            <button
              onClick={stopAndAsk}
              className="inline-flex items-center gap-2 rounded-default bg-white px-4 py-2.5 font-mono text-[11px] uppercase tracking-[0.1em] text-void"
            >
              <Square size={12} /> Stop & ask
            </button>
          ) : (
            <button
              onClick={start}
              disabled={loading || phase === "transcribing" || phase === "answering"}
              className="inline-flex items-center gap-2 rounded-default border border-edge-2 px-4 py-2.5 font-mono text-[11px] uppercase tracking-[0.1em] text-chalk hover:border-edge-3 disabled:opacity-50"
            >
              {phase === "transcribing" ? <Loader2 size={12} className="animate-spin" /> : <Mic size={12} />}
              {phase === "transcribing" ? "Transcribing…" : "Hold a question — tap to record"}
            </button>
          )}
          {phase === "recording" && (
            <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-chalk">
              <span className="h-2 w-2 animate-pulse rounded-full bg-white" /> recording
            </span>
          )}
        </div>

        {transcript && (
          <p className="mt-3 text-[13px] text-steel">
            <span className="label-mono !text-[9px]">you asked</span>{" "}
            <span className="text-chalk">“{transcript}”</span>
          </p>
        )}

        {(answer || phase === "answering") && (
          <div className="mt-3 border-t border-edge pt-3">
            <Eyebrow className="mb-1.5">the Gaffer</Eyebrow>
            <p className={cn("text-[14px] leading-relaxed text-silver", phase === "answering" && "caret")}>
              {answer}
            </p>
            {answer && phase !== "answering" && (
              <div className="mt-2">
                <SpeakButton text={answer} label="Hear it" />
              </div>
            )}
          </div>
        )}

        {error && <p className="mt-2 text-[13px] text-steel">{error}</p>}
      </div>
    </Card>
  );
}
