/**
 * "The Gaffer" — prompt construction + robust parsing for the on-device pundit.
 * This layer is model-agnostic: it turns fixture context into a chat prompt and
 * parses the model's reply into a structured GafferRead. The actual on-device
 * inference is done by ./engine.ts via @qvac/sdk.
 */
import type { Fixture, Team, GafferRead, Prediction } from '../types.js';
import { formString } from '../football/index.js';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

const SYSTEM = `You are "The Gaffer", a razor-sharp, witty football pundit in the vein of a seasoned manager doing punditry. You give confident, opinionated match reads. You are concise and never hedge into mush. You ALWAYS finish your answer with these three lines, exactly formatted, on their own lines:
PREDICTION: <home_goals>-<away_goals>
CONFIDENCE: <0-100>
HOTTAKE: <one punchy sentence>`;

export function buildPrompt(fixture: Fixture, home: Team, away: Team): ChatMessage[] {
  const user = `Match: ${home.name} vs ${away.name} — ${fixture.stage}, at ${fixture.venue}.

${home.name} (FIFA #${home.fifaRank}) — recent form ${formString(home.recentForm)}, key player ${home.keyPlayer}. ${home.styleNote}
${away.name} (FIFA #${away.fifaRank}) — recent form ${formString(away.recentForm)}, key player ${away.keyPlayer}. ${away.styleNote}

Give me your read in 3-4 tight sentences: who has the edge and why, the key tactical battle, and one thing that decides it. Then give your scoreline, confidence and a hot take in the required format.`;

  return [
    { role: 'system', content: SYSTEM },
    { role: 'user', content: user },
  ];
}

const LIVE_SYSTEM = `You are "The Gaffer", a razor-sharp football co-commentator reacting LIVE during a match. Be punchy, opinionated and in-the-moment. Exactly 2 short sentences. No preamble, no scoreline predictions, no formatting — just the live reaction.`;

/** Prompt for an in-play live reaction given the current score + minute. */
export function buildLivePrompt(
  home: Team,
  away: Team,
  live: { homeGoals: number; awayGoals: number; minute: number | string | null },
): ChatMessage[] {
  const clock = live.minute != null ? `${live.minute}'` : 'in play';
  const user = `LIVE — ${clock}: ${home.name} ${live.homeGoals}-${live.awayGoals} ${away.name} (${home.name} form ${formString(home.recentForm)}, ${away.name} form ${formString(away.recentForm)}). React in 2 sharp sentences: who's on top right now and what the trailing side needs to change.`;
  return [
    { role: 'system', content: LIVE_SYSTEM },
    { role: 'user', content: user },
  ];
}

const ASK_SYSTEM = `You are "The Gaffer", a sharp, witty football pundit. Answer the user's question about this specific match directly and with conviction in 2-3 punchy sentences. No preamble, no lists, no formatting.`;

/** Prompt for a freeform question about a fixture (powers voice Q&A). */
export function buildAskPrompt(home: Team, away: Team, question: string): ChatMessage[] {
  const user = `Match: ${home.name} vs ${away.name}. ${home.name} — form ${formString(home.recentForm)}, key player ${home.keyPlayer}. ${away.name} — form ${formString(away.recentForm)}, key player ${away.keyPlayer}.

Question: ${question}`;
  return [
    { role: 'system', content: ASK_SYSTEM },
    { role: 'user', content: user },
  ];
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

/**
 * Parse the model's full reply into a structured read. Tolerant of a small
 * model that may format loosely — falls back to sane defaults.
 */
export function parseRead(fullText: string, fixtureId: string): GafferRead {
  const text = fullText.trim();

  const scoreMatch = text.match(/PREDICTION:\s*(\d+)\s*[-–:]\s*(\d+)/i);
  const predictedScore: Prediction = scoreMatch
    ? { homeGoals: clamp(+scoreMatch[1], 0, 20), awayGoals: clamp(+scoreMatch[2], 0, 20) }
    : { homeGoals: 1, awayGoals: 1 };

  const confMatch = text.match(/CONFIDENCE:\s*(\d{1,3})/i);
  const confidence = confMatch ? clamp(+confMatch[1], 0, 100) / 100 : 0.55;

  const takeMatch = text.match(/HOTTAKE:\s*(.+)/i);
  const hotTake = (takeMatch?.[1] ?? "It's going to the wire.").trim().replace(/^["']|["']$/g, '');

  // Analysis = everything before the structured trailer.
  const cut = text.search(/PREDICTION:/i);
  const analysis = (cut > 0 ? text.slice(0, cut) : text).trim();

  return {
    fixtureId,
    predictedScore,
    confidence,
    analysis,
    hotTake,
    onDevice: true,
  };
}

/** The structured trailer lines we ask the model to emit — hidden from the streamed analysis view. */
export const TRAILER_RE = /(PREDICTION|CONFIDENCE|HOTTAKE):/i;
