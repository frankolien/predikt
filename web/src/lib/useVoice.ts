import { useEffect, useState } from "react";
import { voice, type VoiceStatus } from "./api";

/** Polls /api/voice/status; keeps polling while a capability is still loading. */
export function useVoiceStatus() {
  const [status, setStatus] = useState<VoiceStatus | null>(null);

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      try {
        const s = await voice.status();
        if (!active) return;
        setStatus(s);
        if (s.tts === "loading" || s.stt === "loading") timer = setTimeout(tick, 1800);
      } catch {
        if (active) setStatus({ tts: "unavailable", stt: "unavailable" });
      }
    };
    tick();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, []);

  return status;
}
