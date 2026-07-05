/**
 * The Gaffer as fantasy manager — on-device squad review + captain advice.
 * Reuses the QVAC engine (streamChat); the squad itself is chosen by the
 * deterministic draft/validator, the Gaffer just reads it and gives an opinion.
 */
import type { ChatMessage } from '../qvac/pundit.js';
import { status as aiStatus, streamChat } from '../qvac/engine.js';
import { getPlayer } from './squads.js';

export type FantasyAiKind = 'review' | 'captain';
export type FantasyAiEvent =
  | { type: 'status'; onDevice: boolean; state: string }
  | { type: 'delta'; text: string }
  | { type: 'done'; text: string }
  | { type: 'error'; message: string };

const PERSONA =
  "You are 'the Gaffer' — a gruff, sharp veteran football manager giving fantasy advice. " +
  'Short, characterful, opinionated. No emojis, no lists. Two sentences maximum.';

function squadLines(playerIds: string[]): string {
  return playerIds
    .map((id) => getPlayer(id))
    .filter(Boolean)
    .map((p) => `${p!.name} (${p!.teamCode} ${p!.position}, ${p!.price.toFixed(1)})`)
    .join(', ');
}

function buildPrompt(playerIds: string[], captainId: string, kind: FantasyAiKind): ChatMessage[] {
  const squad = squadLines(playerIds);
  const cap = getPlayer(captainId);
  if (kind === 'captain') {
    return [
      { role: 'system', content: PERSONA },
      {
        role: 'user',
        content: `My fantasy XI: ${squad}. I've captained ${cap?.name ?? 'nobody'}. Is that the right armband, or who should wear it? One sharp verdict.`,
      },
    ];
  }
  return [
    { role: 'system', content: PERSONA },
    { role: 'user', content: `Cast your eye over my fantasy XI: ${squad}. Captain: ${cap?.name ?? '—'}. Give me your honest verdict.` },
  ];
}

export async function* streamFantasyAI(
  playerIds: string[],
  captainId: string,
  kind: FantasyAiKind,
): AsyncGenerator<FantasyAiEvent> {
  if (!playerIds.length) {
    yield { type: 'error', message: 'no squad' };
    return;
  }
  const st = aiStatus();
  yield { type: 'status', onDevice: st.onDevice, state: st.state };
  let full = '';
  try {
    for await (const chunk of streamChat(buildPrompt(playerIds, captainId, kind))) {
      full += chunk;
      yield { type: 'delta', text: chunk };
    }
    yield { type: 'done', text: full.trim() };
  } catch (err) {
    yield { type: 'error', message: (err as Error).message };
  }
}
