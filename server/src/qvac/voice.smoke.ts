/** Voice round-trip smoke: TTS → WAV → Whisper STT. Run: tsx src/qvac/voice.smoke.ts */
import { writeFile } from 'node:fs/promises';
import { speak, transcribeWav } from './voice.js';

const TEXT = 'Canada are all over Morocco in this one, the pressure is relentless.';

console.log('[smoke] synthesizing on-device…');
const wav = await speak(TEXT);
console.log(`[smoke] TTS wav bytes: ${wav.length}`);
await writeFile('/tmp/gaffer-tts.wav', wav);
console.log('[smoke] saved /tmp/gaffer-tts.wav');

console.log('[smoke] transcribing it back on-device…');
const text = await transcribeWav(wav);
console.log(`[smoke] said : "${TEXT}"`);
console.log(`[smoke] heard: "${text}"`);
console.log('[smoke] ✅ voice round-trip works');
await new Promise((r) => setTimeout(r, 400)); // let stdout flush before exit
process.exit(0);
