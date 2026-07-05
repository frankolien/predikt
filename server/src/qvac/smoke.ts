/**
 * Standalone proof that on-device QVAC inference works.
 * Run: npm -w server exec tsx src/qvac/smoke.ts   (first run downloads ~773MB)
 */
import * as qvac from "@qvac/sdk";

const pct = (p: any) => {
  if (typeof p === "number") return Math.round(p * 100);
  return Math.round(p?.shardInfo?.overallPercentage ?? p?.percentage ?? 0);
};

console.log("[smoke] loading LLAMA_3_2_1B_INST_Q4_0 on-device…");
const modelId = await qvac.loadModel({
  modelSrc: (qvac as any).LLAMA_3_2_1B_INST_Q4_0,
  onProgress: (p: unknown) => process.stdout.write(`\r[smoke] download/load ${pct(p)}%   `),
});
console.log(`\n[smoke] model ready: ${modelId}`);

const run: any = qvac.completion({
  modelId,
  history: [
    { role: "system", content: "You are a witty football pundit. Be concise." },
    { role: "user", content: "In one sentence: who edges Argentina vs France, and why?" },
  ],
  stream: true,
});

process.stdout.write("[smoke] pundit says: ");
if (run.events) {
  for await (const ev of run.events) if (ev.type === "contentDelta") process.stdout.write(ev.text);
} else if (run.tokenStream) {
  for await (const t of run.tokenStream) process.stdout.write(typeof t === "string" ? t : t?.text ?? "");
}
console.log("\n[smoke] ✅ on-device inference works");
await qvac.unloadModel({ modelId });
process.exit(0);
