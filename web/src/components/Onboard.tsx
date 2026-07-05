import { useState } from "react";
import { Coins, ArrowRight } from "lucide-react";
import { Button, Card, Eyebrow } from "./ui";
import { useApp } from "../context";

/** Free-to-play sign-in: pick a handle, get 1,000 points, start playing. */
export function Onboard({ onDone }: { onDone?: () => void }) {
  const { signIn } = useApp();
  const [handle, setHandle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const go = async () => {
    const name = handle.trim();
    if (!name) return;
    setBusy(true);
    setError(null);
    try {
      await signIn(name);
      onDone?.();
    } catch {
      setError("Couldn't start — try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="p-5">
      <Eyebrow className="mb-2">start playing · free</Eyebrow>
      <h3 className="font-display text-[20px] font-semibold text-chalk">Pick a handle</h3>
      <p className="mt-1 text-[13.5px] leading-relaxed text-silver">
        No signup wall, no wallet to start. Grab{" "}
        <span className="inline-flex items-center gap-1 text-live">
          <Coins size={12} /> 1,000 points
        </span>{" "}
        and predict live ties, run a knockout Cup, or draft a fantasy XI.
      </p>
      <div className="mt-3 flex gap-2">
        <input
          value={handle}
          onChange={(e) => setHandle(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && go()}
          maxLength={24}
          placeholder="e.g. midfield_maestro"
          className="flex-1 rounded-default border border-edge-2 bg-panel-2 px-3 py-2.5 font-mono text-[14px] text-chalk placeholder:text-faint focus:border-edge-3 focus:outline-none"
        />
        <Button variant="solid" onClick={go} disabled={busy || !handle.trim()}>
          {busy ? "…" : (<>Play <ArrowRight size={13} /></>)}
        </Button>
      </div>
      {error && <p className="mt-2 text-[12.5px] text-steel">{error}</p>}
    </Card>
  );
}
