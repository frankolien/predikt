/**
 * Message formatting for the Gaffer Telegram bot. Everything is rendered with
 * Telegram's HTML parse mode, so all dynamic strings are escaped with esc().
 */
import type {
  FixtureSummary,
  GafferRead,
  HealthView,
  PoolEntryView,
  PoolView,
  WalletCreated,
} from './api.js';

/** Escape user/data strings for Telegram HTML parse mode. */
export function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function shortAddr(addr: string): string {
  if (!addr || addr.length < 12) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function score(r: { homeGoals: number; awayGoals: number } | null | undefined): string {
  if (!r) return '–';
  return `${r.homeGoals}–${r.awayGoals}`; // en dash
}

export function kickoffLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return esc(iso);
  const fmt = new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'UTC',
  });
  return `${fmt.format(d)} UTC`;
}

function liveLine(f: FixtureSummary): string | null {
  if (!f.isLive) return null;
  const mins =
    typeof f.minute === 'number' ? `${f.minute}'` : f.minute ? String(f.minute) : 'LIVE';
  return `🔴 <b>LIVE ${esc(mins)}</b> — ${esc(score(f.result))}`;
}

/** "🇨🇦 CAN v MAR 🇲🇦" — compact one-liner for lists/buttons. */
export function fixtureShort(f: FixtureSummary): string {
  const live = f.isLive ? '🔴 ' : '';
  return `${live}${f.home.flag} ${f.home.code} v ${f.away.code} ${f.away.flag}`;
}

export function teamName(t: FixtureSummary['home']): string {
  return `${t.flag} ${esc(t.name)}`;
}

/* --------------------------------------------------------------- messages */

export function welcome(name: string): string {
  return [
    `👋 Alright ${esc(name)} — welcome to <b>Predikt</b>.`,
    '',
    'Your football sidekick in Telegram: browse live fixtures, get a read on any',
    'match from <b>the Gaffer</b> — a private <b>on-device AI</b> pundit — watch pool',
    'standings, and get pinged the moment a pool settles. When you want to <b>stake',
    'real USDt</b>, tap through to the Predikt app — you sign with your <b>own',
    'self-custodial wallet</b> on your own device. The bot never touches your keys.',
    '',
    '<b>Commands</b>',
    '/fixtures — browse upcoming &amp; live matches',
    '/gaffer &lt;fixtureId&gt; — the on-device pundit’s read',
    '/pool &lt;fixtureId&gt; — pool standings &amp; payouts',
    '',
    'Tap /fixtures to get started — then “Stake in Predikt” to play.',
  ].join('\n');
}

export function help(): string {
  return [
    '<b>Predikt bot — commands</b>',
    '/fixtures — browse upcoming &amp; live matches',
    '/gaffer &lt;fixtureId&gt; — the Gaffer\'s on-device AI read',
    '/pool &lt;fixtureId&gt; — pool standings',
    '',
    '<i>Staking happens in the Predikt app, where you sign with your own wallet — tap “Stake in Predikt” on any fixture.</i>',
  ].join('\n');
}

export function unknownCommand(): string {
  return `🤔 I don’t know that one.\n\n${help()}`;
}

export function fixturesHeader(count: number): string {
  if (count === 0) return 'No upcoming or live fixtures right now. Check back later.';
  return `⚽ <b>Upcoming &amp; live fixtures</b>\nTap a match for detail, the Gaffer’s read, or to join its pool.`;
}

export function fixtureDetail(f: FixtureSummary, pool: PoolView | null): string {
  const lines: string[] = [];
  lines.push(`<b>${teamName(f.home)} v ${teamName(f.away)}</b>`);
  lines.push(`${esc(f.stage)} · ${esc(f.league ?? 'Match')}`);
  const live = liveLine(f);
  if (live) lines.push(live);
  else if (f.status === 'settled' && f.result)
    lines.push(`🏁 Full time — <b>${esc(score(f.result))}</b>`);
  else lines.push(`🗓 ${kickoffLabel(f.kickoff)}`);
  lines.push(`📍 ${esc(f.venue)}`);
  lines.push(`🆔 <code>${esc(f.id)}</code>`);
  lines.push('');

  if (pool) {
    lines.push(
      `💰 Pot <b>${pool.potHuman} USDt</b> · ${pool.playerCount} in @ ${pool.stake} USDt each`,
    );
    lines.push(`Pool status: <b>${esc(pool.status)}</b>`);
  } else if (f.poolExists) {
    lines.push(`💰 ${f.playerCount} in @ ${f.stake} USDt each`);
  } else {
    lines.push(`💰 No pool yet — be the first in (stake ${f.stake} USDt).`);
  }
  return lines.join('\n');
}

export function gafferThinking(f: FixtureSummary | null): string {
  const who = f ? `${teamName(f.home)} v ${teamName(f.away)}` : 'this match';
  return [
    `🧠 <b>The Gaffer is thinking…</b>`,
    who,
    '',
    '<i>Running privately on-device 🔒 — no cloud.</i>',
  ].join('\n');
}

export function gafferProgress(f: FixtureSummary | null, partial: string): string {
  const who = f ? `${teamName(f.home)} v ${teamName(f.away)}` : 'this match';
  const text = partial.trim();
  return [
    `🧠 <b>The Gaffer…</b> (on-device 🔒)`,
    who,
    '',
    esc(text.length > 3500 ? text.slice(0, 3500) + '…' : text) || '<i>warming up…</i>',
  ].join('\n');
}

export function gafferRead(f: FixtureSummary | null, read: GafferRead): string {
  const pct = Math.round(Math.max(0, Math.min(1, read.confidence)) * 100);
  const who = f ? `${teamName(f.home)} v ${teamName(f.away)}` : 'Match read';
  const lines: string[] = [];
  lines.push(`🧠 <b>The Gaffer’s read</b> — on-device 🔒`);
  lines.push(who);
  lines.push('');
  if (read.analysis?.trim()) lines.push(esc(read.analysis.trim()));
  lines.push('');
  lines.push(
    `📣 Called it: <b>${esc(score(read.predictedScore))}</b> · confidence <b>${pct}%</b>`,
  );
  if (read.hotTake?.trim()) lines.push(`🔥 <i>${esc(read.hotTake.trim())}</i>`);
  lines.push('');
  lines.push(
    `<i>Ran privately on your device — the model never left the box, no cloud inference.</i>`,
  );
  return lines.join('\n');
}

export function walletCreated(w: WalletCreated): string {
  return [
    `✅ <b>Your self-custodial wallet is ready</b>`,
    `Name: ${esc(w.displayName)}`,
    `Address: <code>${esc(w.address)}</code>`,
    `Balance: <b>${w.usdtHuman} USDt</b>`,
    `Backend: ${esc(w.backend)}`,
    '',
    'This wallet is yours — Gaffer’s server never custodies your funds.',
  ].join('\n');
}

export function seedWarning(mnemonic: string): string {
  return [
    '🔑 <b>Your seed phrase — DEMO ONLY</b>',
    '',
    `<code>${esc(mnemonic)}</code>`,
    '',
    '⚠️ These are <b>your keys</b>. This hackathon demo bot keeps them only in',
    'server memory so you can play instantly — a real bot must <b>NEVER</b> hold or',
    'send seed phrases. Do not reuse this phrase for anything you care about.',
  ].join('\n');
}

export function walletExisting(address: string, usdtHuman: number): string {
  return [
    '👛 <b>Your wallet</b>',
    `Address: <code>${esc(address)}</code>`,
    `Balance: <b>${usdtHuman} USDt</b>`,
  ].join('\n');
}

export function joinResult(pool: PoolView, entry: PoolEntryView | undefined): string {
  const lines: string[] = [];
  const pred = entry ? score(entry.prediction) : '?';
  lines.push(`✅ <b>You’re in!</b>`);
  lines.push(
    `${teamName(pool.fixture.home)} v ${teamName(pool.fixture.away)} — your call <b>${esc(pred)}</b>`,
  );
  lines.push(`Staked: <b>${entry?.stake ?? pool.stake} USDt</b> (on-chain escrow)`);
  if (entry?.approveTx) lines.push(`approve: <code>${esc(entry.approveTx)}</code>`);
  if (entry?.depositTx) lines.push(`deposit: <code>${esc(entry.depositTx)}</code>`);
  lines.push('');
  lines.push(`💰 Pot now <b>${pool.potHuman} USDt</b> · ${pool.playerCount} players`);
  lines.push(`I’ll ping you here when it settles.`);
  return lines.join('\n');
}

export function poolStandings(pool: PoolView): string {
  const f = pool.fixture;
  const lines: string[] = [];
  lines.push(`📊 <b>${teamName(f.home)} v ${teamName(f.away)}</b>`);
  lines.push(
    `Pot <b>${pool.potHuman} USDt</b> · ${pool.playerCount} in · status <b>${esc(pool.status)}</b>`,
  );
  if (pool.status === 'settled' && pool.result)
    lines.push(`🏁 Result: <b>${esc(score(pool.result))}</b>`);
  lines.push('');
  if (pool.entries.length === 0) {
    lines.push('<i>No entries yet.</i>');
  } else {
    for (const e of pool.entries) {
      const tag = e.isBot ? ' 🤖' : '';
      let line = `• ${esc(e.displayName)}${tag} — <b>${esc(score(e.prediction))}</b>`;
      if (pool.status === 'settled') {
        if (e.won) {
          const exact = e.exactScore ? ' 🎯' : '';
          line += ` → ✅ <b>+${e.winnings ?? 0} USDt</b>${exact}`;
        } else {
          line += ` → ❌`;
        }
      }
      lines.push(line);
    }
  }
  if (pool.settleTx) {
    lines.push('');
    lines.push(`settle tx: <code>${esc(pool.settleTx)}</code>`);
  }
  return lines.join('\n');
}

export function meSummary(
  address: string,
  usdtHuman: number,
  pools: Array<{ pool: PoolView; entry: PoolEntryView | undefined }>,
): string {
  const lines: string[] = [];
  lines.push('👤 <b>You</b>');
  lines.push(`Address: <code>${esc(address)}</code>`);
  lines.push(`Balance: <b>${usdtHuman} USDt</b>`);
  lines.push('');
  if (pools.length === 0) {
    lines.push('<i>You haven’t joined any pools yet — try /fixtures.</i>');
  } else {
    lines.push('<b>Your pools</b>');
    for (const { pool, entry } of pools) {
      const f = pool.fixture;
      const pick = entry ? score(entry.prediction) : '?';
      let line = `• ${f.home.code} v ${f.away.code} — call <b>${esc(pick)}</b> · <i>${esc(pool.status)}</i>`;
      if (pool.status === 'settled' && entry) {
        line += entry.won ? ` · ✅ +${entry.winnings ?? 0} USDt` : ' · ❌';
      }
      lines.push(line);
    }
  }
  return lines.join('\n');
}

export function settledNotice(pool: PoolView, entry?: PoolEntryView): string {
  const f = pool.fixture;
  const lines: string[] = [];
  lines.push(`🏁 <b>Full-time — ${teamName(f.home)} v ${teamName(f.away)}</b>`);
  lines.push(`Result: <b>${esc(score(pool.result))}</b> · pot ${pool.potHuman} USDt`);
  lines.push('');
  if (entry?.won) {
    const exact = entry.exactScore ? ' 🎯 exact score!' : '';
    lines.push(`🎉 You called it <b>${esc(score(entry.prediction))}</b> — <b>+${entry.winnings ?? 0} USDt</b>${exact}`);
    lines.push('Paid straight to your wallet on-chain.');
  } else if (entry) {
    lines.push(`😖 You had <b>${esc(score(entry.prediction))}</b> — no win this time.`);
  } else {
    // Read-only companion: no wallet in the bot, so summarise the on-chain outcome.
    const winners = pool.entries.filter((e) => e.won).length;
    lines.push(
      winners > 0
        ? `✅ Settled on-chain — ${winners} winner${winners === 1 ? '' : 's'} paid from the pot.`
        : '✅ Settled on-chain — no correct call, stakes refunded.',
    );
    lines.push('Tap below for the on-chain receipt.');
  }
  return lines.join('\n');
}

export function noTokenMessage(): string {
  return [
    '',
    '🤖  Gaffer Telegram bot',
    '────────────────────────────────────────',
    'No TELEGRAM_BOT_TOKEN set, so there’s nothing to connect to.',
    '',
    'To run the bot:',
    '  1. Open Telegram and message @BotFather',
    '  2. Send /newbot and follow the prompts to name your bot',
    '  3. Copy the token it gives you (looks like 123456:ABC-DEF…)',
    '  4. Start the bot with:',
    '',
    '       TELEGRAM_BOT_TOKEN=<your-token> npm run bot',
    '',
    'Optional: set GAFFER_API to point at the app API',
    '(default http://127.0.0.1:8787).',
    '────────────────────────────────────────',
    '',
  ].join('\n');
}

export function healthLine(h: HealthView): string {
  return `mode=${h.mode} chain=${h.chainReady ? 'ready' : 'no'} wallet=${h.walletBackend} ai=${h.ai.state}${h.ai.model ? '/' + h.ai.model : ''} onDevice=${h.ai.onDevice}`;
}
