/**
 * On-device AI engine — wraps Tether's QVAC SDK (@qvac/sdk).
 *
 * Everything here runs locally on the user's machine. No cloud, no API keys,
 * no data leaving the device — that's the whole point of the QVAC track.
 *
 * The SDK is imported dynamically so the server can boot (and the rest of the
 * app can be demoed) before the model weights finish downloading. Real QVAC is
 * the default path; a scripted fallback (GAFFER_MOCK_AI=1, or automatic if the
 * SDK/model can't load) keeps a live demo resilient and is clearly logged.
 */
import type { ChatMessage } from './pundit.js';

const MODEL_SRC = process.env.GAFFER_QVAC_MODEL || 'LLAMA_3_2_1B_INST_Q4_0';
const FORCE_MOCK = process.env.GAFFER_MOCK_AI === '1';

export type LoadState = 'idle' | 'loading' | 'ready' | 'mock' | 'error';

interface EngineStatus {
  state: LoadState;
  model: string;
  progress: number; // 0..1
  detail: string;
  onDevice: boolean;
}

let state: LoadState = 'idle';
let progress = 0;
let detail = 'not started';
let modelId: unknown = null;
let sdk: any = null;
let loadPromise: Promise<void> | null = null;

export function status(): EngineStatus {
  return {
    state,
    model: MODEL_SRC,
    progress,
    detail,
    onDevice: state === 'ready' || state === 'loading',
  };
}

/** Kick off (idempotent) loading of the on-device model. */
export function ensureLoaded(): Promise<void> {
  if (loadPromise) return loadPromise;
  loadPromise = load();
  return loadPromise;
}

async function load(): Promise<void> {
  if (FORCE_MOCK) {
    state = 'mock';
    detail = 'GAFFER_MOCK_AI=1 — using scripted pundit (no on-device model)';
    console.warn(`[qvac] ${detail}`);
    return;
  }
  try {
    state = 'loading';
    detail = `importing @qvac/sdk`;
    sdk = await import('@qvac/sdk');
    detail = `downloading / loading model ${MODEL_SRC} on-device`;
    console.log(`[qvac] loading model "${MODEL_SRC}" locally — first run downloads weights (~773MB, cached in ~/.qvac/models)…`);

    // Named model constants (e.g. LLAMA_3_2_1B_INST_Q4_0) are exported registry
    // descriptors; modelType is inferred from them. If MODEL_SRC isn't a known
    // constant, treat it as a raw path/URL and name the completion model type.
    const descriptor = (sdk as any)[MODEL_SRC];
    const loadArgs: any = descriptor
      ? { modelSrc: descriptor }
      : { modelSrc: MODEL_SRC, modelType: 'llamacpp-completion' };
    // QVAC reports { downloaded, total, percentage (0-100), shardInfo? }.
    loadArgs.onProgress = (p: any) => {
      const pctRaw =
        typeof p === 'number'
          ? p * 100
          : p?.shardInfo?.overallPercentage ?? p?.percentage ?? 0;
      progress = Math.max(0, Math.min(1, pctRaw / 100));
    };

    // QVAC: loadModel returns a modelId used by completion()/unloadModel().
    modelId = await sdk.loadModel(loadArgs);
    progress = 1;
    state = 'ready';
    detail = `model ${MODEL_SRC} loaded on-device`;
    console.log(`[qvac] ${detail} ✅`);
  } catch (err) {
    state = 'mock';
    detail = `QVAC unavailable (${(err as Error).message}) — falling back to scripted pundit`;
    console.warn(`[qvac] ${detail}`);
  }
}

/**
 * Stream a chat completion token-by-token from the on-device model.
 * Yields raw text chunks. Falls back to a scripted stream if not on real QVAC.
 */
export async function* streamChat(history: ChatMessage[]): AsyncGenerator<string> {
  await ensureLoaded();

  if (state === 'ready' && sdk && modelId != null) {
    const run: any = sdk.completion({ modelId, history, stream: true });
    // Canonical QVAC 0.14.x streaming surface: run.events (contentDelta).
    if (run?.events) {
      for await (const ev of run.events) {
        if (ev?.type === 'contentDelta' && ev.text) yield ev.text as string;
      }
      return;
    }
    // Legacy/deprecated surface still shipped: run.tokenStream (string tokens).
    if (run?.tokenStream) {
      for await (const tok of run.tokenStream) {
        yield typeof tok === 'string' ? tok : (tok?.text ?? tok?.content ?? '');
      }
      return;
    }
    // Non-streaming fallback.
    const final = run?.final ? await run.final : null;
    yield String(final?.content ?? run?.text ?? run ?? '');
    return;
  }

  // Scripted fallback — believable pundit reply, streamed word-by-word.
  yield* scriptedStream(history);
}

export async function unload(): Promise<void> {
  if (state === 'ready' && sdk && modelId != null) {
    try {
      await sdk.unloadModel({ modelId });
      console.log('[qvac] model unloaded, resources freed');
    } catch { /* best-effort */ }
  }
  modelId = null;
  state = 'idle';
  loadPromise = null;
}

// ---- scripted fallback -------------------------------------------------------

async function* scriptedStream(history: ChatMessage[]): AsyncGenerator<string> {
  const user = history.find((m) => m.role === 'user')?.content ?? '';
  const [home, away] = extractTeams(user);
  const reply =
    `${home} shade this one. They're the more settled side and control games through midfield, ` +
    `where ${away} can be got at when their full-backs push high. The key battle is in the ` +
    `half-spaces: whoever wins the second balls dictates the tempo. It stays tight, and I fancy ` +
    `the side with the cooler heads late on to nick it.\n` +
    `PREDICTION: 2-1\n` +
    `CONFIDENCE: 61\n` +
    `HOTTAKE: ${away} bottle the big moment and ${home} punish them on the break.`;
  for (const word of reply.split(/(\s+)/)) {
    yield word;
    await sleep(18);
  }
}

function extractTeams(user: string): [string, string] {
  const m = user.match(/Match:\s*(.+?)\s+vs\s+(.+?)\s*[—-]/i);
  return m ? [m[1].trim(), m[2].trim()] : ['The favourites', 'the underdogs'];
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
