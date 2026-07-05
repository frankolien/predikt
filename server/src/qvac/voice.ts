/**
 * On-device voice — QVAC TTS (Supertonic) + Whisper STT. All local, no cloud.
 *
 * Models are lazy-loaded on first use (kicked off when the client first polls
 * /api/voice/status) so the server boot + the LLM are unaffected and non-voice
 * users never download speech weights. Failures degrade gracefully to
 * 'unavailable' — the rest of the app keeps working.
 */
import { writeFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const TTS_MODEL = process.env.GAFFER_TTS_MODEL || 'TTS_MULTILINGUAL_SUPERTONIC3_Q8_0';
const STT_MODEL = process.env.GAFFER_STT_MODEL || 'WHISPER_EN_BASE_Q8_0';
const TTS_SAMPLE_RATE = 44100;

type Cap = 'idle' | 'loading' | 'ready' | 'unavailable';

let sdk: any = null;
let ttsState: Cap = 'idle';
let sttState: Cap = 'idle';
let ttsModelId: string | null = null;
let sttModelId: string | null = null;
let ttsPromise: Promise<void> | null = null;
let sttPromise: Promise<void> | null = null;
let tmpCounter = 0;

async function ensureSdk() {
  if (!sdk) sdk = await import('@qvac/sdk');
  return sdk;
}

function ensureTts(): Promise<void> {
  if (ttsPromise) return ttsPromise;
  ttsState = 'loading';
  ttsPromise = (async () => {
    try {
      const s = await ensureSdk();
      console.log(`[voice] loading TTS model ${TTS_MODEL} on-device…`);
      ttsModelId = await s.loadModel({
        modelSrc: s[TTS_MODEL] ?? TTS_MODEL,
        modelConfig: { ttsEngine: 'supertonic', language: 'en', voice: 'F1', ttsSpeed: 1.06, ttsNumInferenceSteps: 5 } as any,
      });
      ttsState = 'ready';
      console.log('[voice] TTS ready ✅');
    } catch (err) {
      ttsState = 'unavailable';
      console.warn(`[voice] TTS unavailable: ${(err as Error).message}`);
      throw err;
    }
  })();
  return ttsPromise;
}

function ensureStt(): Promise<void> {
  if (sttPromise) return sttPromise;
  sttState = 'loading';
  sttPromise = (async () => {
    try {
      const s = await ensureSdk();
      console.log(`[voice] loading STT model ${STT_MODEL} on-device…`);
      sttModelId = await s.loadModel({ modelSrc: s[STT_MODEL] ?? STT_MODEL });
      sttState = 'ready';
      console.log('[voice] STT ready ✅');
    } catch (err) {
      sttState = 'unavailable';
      console.warn(`[voice] STT unavailable: ${(err as Error).message}`);
      throw err;
    }
  })();
  return sttPromise;
}

export function voiceStatus() {
  // Polling status kicks off the lazy load in the background.
  if (ttsState === 'idle') ensureTts().catch(() => {});
  if (sttState === 'idle') ensureStt().catch(() => {});
  return {
    tts: ttsState === 'idle' ? 'loading' : ttsState,
    stt: sttState === 'idle' ? 'loading' : sttState,
    ttsModel: TTS_MODEL,
    sttModel: STT_MODEL,
  };
}

/** Synthesize speech on-device; returns a WAV buffer (16-bit mono @ 44.1kHz). */
export async function speak(text: string): Promise<Buffer> {
  await ensureTts();
  const result: any = sdk.textToSpeech({ modelId: ttsModelId, text, inputType: 'text', stream: false });
  const samples = await result.buffer; // Int16Array of PCM samples
  return wavFromInt16(samples, TTS_SAMPLE_RATE);
}

/** Transcribe a WAV buffer on-device (Whisper). */
export async function transcribeWav(wav: Buffer): Promise<string> {
  await ensureStt();
  const tmp = join(tmpdir(), `gaffer-stt-${process.pid}-${tmpCounter++}.wav`);
  await writeFile(tmp, wav);
  try {
    const out = await sdk.transcribe({ modelId: sttModelId, audioChunk: tmp });
    return (typeof out === 'string' ? out : out?.text ?? '').trim();
  } finally {
    await unlink(tmp).catch(() => {});
  }
}

function wavFromInt16(samples: Int16Array | number[], rate: number): Buffer {
  const int16 = samples instanceof Int16Array ? samples : Int16Array.from(samples);
  const dataLen = int16.length * 2;
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + dataLen, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(dataLen, 40);
  const data = Buffer.from(int16.buffer, int16.byteOffset, dataLen);
  return Buffer.concat([header, data]);
}
