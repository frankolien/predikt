/**
 * The Gaffer service — orchestrates a full on-device pundit read for a fixture:
 * builds the prompt, streams the analysis token-by-token (hiding the structured
 * trailer), and emits a parsed GafferRead at the end.
 */
import type { GafferRead } from '../types.js';
import { getFixture, getTeam } from '../football/index.js';
import { buildPrompt, buildLivePrompt, buildAskPrompt, parseRead } from './pundit.js';
import { streamChat, status as engineStatus } from './engine.js';

export type GafferEvent =
  | { type: 'status'; onDevice: boolean; state: string }
  | { type: 'analysis'; delta: string }
  | { type: 'done'; read: GafferRead }
  | { type: 'error'; message: string };

const TRAILER = /PREDICTION:/i;

export async function* streamGafferRead(fixtureId: string): AsyncGenerator<GafferEvent> {
  const fixture = getFixture(fixtureId);
  if (!fixture) {
    yield { type: 'error', message: `Unknown fixture: ${fixtureId}` };
    return;
  }
  const home = getTeam(fixture.homeTeamId);
  const away = getTeam(fixture.awayTeamId);
  const history = buildPrompt(fixture, home, away);

  const s = engineStatus();
  yield { type: 'status', onDevice: s.onDevice, state: s.state };

  let full = '';
  let emitted = 0;
  try {
    for await (const tok of streamChat(history)) {
      full += tok;
      // Only reveal the analysis portion; keep the PREDICTION/CONFIDENCE/HOTTAKE
      // trailer hidden until the final structured reveal.
      const idx = full.search(TRAILER);
      const visibleEnd = idx === -1 ? full.length : idx;
      if (visibleEnd > emitted) {
        yield { type: 'analysis', delta: full.slice(emitted, visibleEnd) };
        emitted = visibleEnd;
      }
    }
  } catch (err) {
    yield { type: 'error', message: (err as Error).message };
    return;
  }

  yield { type: 'done', read: parseRead(full, fixtureId) };
}

// ---- live in-play reaction (on-device) ----

export type LiveEvent =
  | { type: 'status'; onDevice: boolean; state: string }
  | { type: 'reaction'; delta: string }
  | { type: 'done'; text: string }
  | { type: 'error'; message: string };

/** Stream a short on-device in-play reaction given the current live score/minute. */
export async function* streamLiveReaction(
  fixtureId: string,
  live: { homeGoals: number; awayGoals: number; minute: number | string | null },
): AsyncGenerator<LiveEvent> {
  const fixture = getFixture(fixtureId);
  if (!fixture) {
    yield { type: 'error', message: `Unknown fixture: ${fixtureId}` };
    return;
  }
  const home = getTeam(fixture.homeTeamId);
  const away = getTeam(fixture.awayTeamId);
  const history = buildLivePrompt(home, away, live);

  const s = engineStatus();
  yield { type: 'status', onDevice: s.onDevice, state: s.state };

  let full = '';
  try {
    for await (const tok of streamChat(history)) {
      full += tok;
      yield { type: 'reaction', delta: tok };
    }
  } catch (err) {
    yield { type: 'error', message: (err as Error).message };
    return;
  }
  yield { type: 'done', text: full.trim() };
}

// ---- freeform question (powers voice Q&A) ----

export async function* streamAsk(fixtureId: string, question: string): AsyncGenerator<GafferEvent> {
  const fixture = getFixture(fixtureId);
  if (!fixture) {
    yield { type: 'error', message: `Unknown fixture: ${fixtureId}` };
    return;
  }
  const home = getTeam(fixture.homeTeamId);
  const away = getTeam(fixture.awayTeamId);
  const history = buildAskPrompt(home, away, question.slice(0, 300));

  const s = engineStatus();
  yield { type: 'status', onDevice: s.onDevice, state: s.state };

  let full = '';
  try {
    for await (const tok of streamChat(history)) {
      full += tok;
      yield { type: 'analysis', delta: tok };
    }
  } catch (err) {
    yield { type: 'error', message: (err as Error).message };
    return;
  }
  yield {
    type: 'done',
    read: {
      fixtureId,
      predictedScore: { homeGoals: 0, awayGoals: 0 },
      confidence: 0,
      analysis: full.trim(),
      hotTake: '',
      onDevice: true,
    },
  };
}
