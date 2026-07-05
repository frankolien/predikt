import { motion } from "motion/react";
import type { Health } from "../lib/api";

export function BootScreen({ health }: { health: Health | null }) {
  const ai = health?.ai;
  const steps = [
    { label: "Localhost API", done: !!health },
    { label: "Loading live football feed + deploying escrow on-chain", done: !!health?.chainReady },
    {
      label: "Loading the on-device model",
      done: ai?.state === "ready" || ai?.state === "mock",
      note:
        ai?.state === "loading"
          ? `${Math.round((ai.progress || 0) * 100)}% · first run downloads weights`
          : ai?.state === "mock"
            ? "scripted fallback"
            : undefined,
    },
  ];

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden">
      <div className="grid-lines grid-fade absolute inset-0" aria-hidden />
      <div className="relative z-10 w-full max-w-md px-6">
        <div className="font-display text-[40px] font-semibold tracking-[-0.04em] text-chalk">Predikt</div>
        <div className="label-mono mt-1 mb-8">warming up…</div>
        <div className="space-y-3">
          {steps.map((s, i) => (
            <motion.div
              key={s.label}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.1 }}
              className="flex items-center gap-3"
            >
              <span
                className={`grid h-5 w-5 place-items-center rounded-full border text-[10px] ${
                  s.done ? "border-edge-3 bg-white/10 text-chalk" : "border-edge-2 text-faint"
                }`}
              >
                {s.done ? "✓" : <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-steel" />}
              </span>
              <div className="flex-1">
                <div className={`text-[14px] ${s.done ? "text-silver" : "text-steel"}`}>{s.label}</div>
                {s.note && <div className="label-mono !text-[9px]">{s.note}</div>}
              </div>
            </motion.div>
          ))}
        </div>
        <p className="mt-8 text-[12px] leading-relaxed text-faint">
          Everything runs locally — the AI never touches a cloud, and your keys never leave your
          device.
        </p>
      </div>
    </div>
  );
}
