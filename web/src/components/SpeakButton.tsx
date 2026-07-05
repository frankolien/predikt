import { useState } from "react";
import { Volume2, Loader2, AudioLines } from "lucide-react";
import { voice } from "../lib/api";
import { playWav } from "../lib/audio";

/** Speaks the given text on-device (QVAC TTS). */
export function SpeakButton({ text, label = "Speak" }: { text: string; label?: string }) {
  const [state, setState] = useState<"idle" | "synth" | "playing" | "error">("idle");

  const speak = async () => {
    setState("synth");
    try {
      const wav = await voice.speak(text);
      setState("playing");
      await playWav(wav);
      setState("idle");
    } catch {
      setState("error");
      setTimeout(() => setState("idle"), 2200);
    }
  };

  const busy = state === "synth" || state === "playing";
  return (
    <button
      onClick={speak}
      disabled={busy}
      className="inline-flex items-center gap-1.5 rounded-default border border-edge-2 px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.1em] text-silver transition-colors hover:border-edge-3 hover:text-chalk disabled:opacity-70"
    >
      {state === "synth" ? (
        <Loader2 size={12} className="animate-spin" />
      ) : state === "playing" ? (
        <AudioLines size={12} className="text-chalk" />
      ) : (
        <Volume2 size={12} />
      )}
      {state === "synth" ? "Synthesizing…" : state === "playing" ? "Speaking…" : state === "error" ? "Unavailable" : label}
    </button>
  );
}
