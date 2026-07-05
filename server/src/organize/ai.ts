/**
 * The Gaffer as tournament director — on-device narration for Organize.
 *
 * Reuses the exact same QVAC engine as the match pundit (`streamChat`), so every
 * word is generated locally. We build a short prompt from the live bracket state
 * and stream it back token-by-token. Four beats: the draw, a tie preview, a
 * result recap, and the trophy lift.
 */
import type { ChatMessage } from '../qvac/pundit.js';
import { status as aiStatus, streamChat } from '../qvac/engine.js';
import { getTournament } from './store.js';

export type DirectorEvent =
  | { type: 'status'; onDevice: boolean; state: string }
  | { type: 'delta'; text: string }
  | { type: 'done'; text: string }
  | { type: 'error'; message: string };

export type DirectorKind = 'draw' | 'preview' | 'recap' | 'trophy';

const PERSONA =
  "You are 'the Gaffer' — a gruff, quick-witted veteran football manager turned pundit hosting a knockout cup. " +
  'You speak in short, punchy, characterful lines. No emojis, no hashtags, no lists. Two sentences maximum.';

function drawPrompt(name: string, ties: string[]): ChatMessage[] {
  return [
    { role: 'system', content: PERSONA },
    {
      role: 'user',
      content:
        `The draw for "${name}" is complete. First-round ties:\n` +
        ties.map((t, i) => `${i + 1}. ${t}`).join('\n') +
        `\n\nAnnounce the draw like a broadcast: build the drama, call out the standout tie. Two sentences.`,
    },
  ];
}

function previewPrompt(name: string, roundName: string, home: string, away: string): ChatMessage[] {
  return [
    { role: 'system', content: PERSONA },
    { role: 'user', content: `In the ${roundName} of "${name}": ${home} face ${away}. Give a one-line hype preview of this tie.` },
  ];
}

function recapPrompt(roundName: string, home: string, away: string, hs: number, as: number, pens: boolean): ChatMessage[] {
  const result = pens ? `${home} ${hs}-${as} ${away} (won on penalties)` : `${home} ${hs}-${as} ${away}`;
  return [
    { role: 'system', content: PERSONA },
    { role: 'user', content: `${roundName} result: ${result}. Recap the tie with a bit of bite. Two sentences.` },
  ];
}

function trophyPrompt(name: string, champion: string, runnerUp: string, potLabel: string): ChatMessage[] {
  return [
    { role: 'system', content: PERSONA },
    {
      role: 'user',
      content:
        `${champion} have just beaten ${runnerUp} to win "${name}", taking home ${potLabel}. ` +
        `Narrate the trophy lift — make it feel earned. Two sentences.`,
    },
  ];
}

/** Build the prompt for a given beat from live bracket state. */
function buildPrompt(tournamentId: string, kind: DirectorKind, matchId?: string): ChatMessage[] {
  const t = getTournament(tournamentId);
  if (!t) throw new Error('tournament not found');

  if (kind === 'draw') {
    const first = t.rounds[0]?.matches ?? [];
    const ties = first.map((m) =>
      m.home.name && m.away.name ? `${m.home.name} vs ${m.away.name}` : `${m.home.name ?? m.away.name ?? 'TBD'} (bye)`,
    );
    return drawPrompt(t.name, ties);
  }

  if (kind === 'trophy') {
    const champ = t.participants.find((p) => p.id === t.winnerId);
    const runnerUp = t.participants.find((p) => p.placement === 2);
    const potLabel = t.pot > 0 ? `${t.pot} ${t.currency === 'usdt' ? 'USD₮' : 'points'}` : 'the trophy and the bragging rights';
    return trophyPrompt(t.name, champ?.name ?? 'The champions', runnerUp?.name ?? 'the runners-up', potLabel);
  }

  // preview / recap need a specific match
  const match = t.rounds.flatMap((r) => r.matches.map((m) => ({ ...m, roundName: r.name }))).find((m) => m.id === matchId);
  if (!match) throw new Error('match not found');
  const home = match.home.name ?? 'TBD';
  const away = match.away.name ?? 'TBD';
  if (kind === 'preview') return previewPrompt(t.name, match.roundName, home, away);
  return recapPrompt(match.roundName, home, away, match.home.score ?? 0, match.away.score ?? 0, match.decidedBy === 'penalties');
}

/** Stream the Gaffer's narration for a tournament beat. */
export async function* streamDirector(
  tournamentId: string,
  kind: DirectorKind,
  matchId?: string,
): AsyncGenerator<DirectorEvent> {
  let prompt: ChatMessage[];
  try {
    prompt = buildPrompt(tournamentId, kind, matchId);
  } catch (err) {
    yield { type: 'error', message: (err as Error).message };
    return;
  }
  const st = aiStatus();
  yield { type: 'status', onDevice: st.onDevice, state: st.state };
  let full = '';
  try {
    for await (const chunk of streamChat(prompt)) {
      full += chunk;
      yield { type: 'delta', text: chunk };
    }
    yield { type: 'done', text: full.trim() };
  } catch (err) {
    yield { type: 'error', message: (err as Error).message };
  }
}
