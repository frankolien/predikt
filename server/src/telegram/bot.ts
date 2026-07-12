/**
 * Gaffer — Telegram COMPANION bot (read-only; no custody, no funds).
 *
 * A thin grammy client over Gaffer's HTTP API. It informs and funnels: live
 * fixtures, the on-device Gaffer's AI read, pool standings, and a full-time
 * settlement ping — then DEEP-LINKS into the Predikt app to stake, where the fan
 * signs with their OWN self-custodial wallet on their own device. The bot never
 * holds a key, a seed, or a user's money. Real value only moves inside the app.
 *
 * (This is deliberate: a Telegram bot has no secure device context to custody a
 * seed, so the bot stays informational and hands off to the app for signing.)
 *
 * Env:
 *   TELEGRAM_BOT_TOKEN  (required) — from @BotFather
 *   GAFFER_API          (optional) — API base, default http://127.0.0.1:8787
 *   GAFFER_APP_URL      (optional) — Predikt web app, default https://www.prediktt.xyz
 */
import { Bot, InlineKeyboard, type Context } from 'grammy';
import * as api from './api.js';
import * as fmt from './format.js';

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
if (!TOKEN) {
  // Friendly, non-fatal: explain how to get a token, then exit cleanly.
  console.log(fmt.noTokenMessage());
  process.exit(0); // `never` — narrows TOKEN to string below
}

/** The Predikt app the bot deep-links to for staking (self-custody signing). */
const APP_URL = (process.env.GAFFER_APP_URL ?? 'https://www.prediktt.xyz').replace(/\/$/, '');
const roomLink = (fixtureId: string): string => `${APP_URL}/room/${encodeURIComponent(fixtureId)}`;

const bot = new Bot(TOKEN);

/* ------------------------------------------------------ settlement notifier
 *
 * Read-only. A fan taps "🔔 Ping me at FT" on a fixture/pool; we watch that pool
 * and DM everyone subscribed when it flips to `settled` — result + pot + a link to
 * the receipt in the app. No wallet, no stake: the bot only tells you it happened.
 */
interface Watch {
  subscribers: Map<number, number>; // userId -> chatId
  lastStatus?: string;
}
const watches = new Map<string, Watch>();

function watchPool(fixtureId: string, userId: number, chatId: number): void {
  let w = watches.get(fixtureId);
  if (!w) {
    w = { subscribers: new Map() };
    watches.set(fixtureId, w);
  }
  w.subscribers.set(userId, chatId);
}

async function pollSettlements(): Promise<void> {
  for (const [fixtureId, w] of [...watches.entries()]) {
    let pool: api.PoolView | null;
    try {
      pool = await api.getPool(fixtureId);
    } catch {
      continue; // transient; try again next tick
    }
    if (!pool) continue;
    if (w.lastStatus === undefined) {
      w.lastStatus = pool.status;
      continue;
    }
    if (pool.status === 'settled' && w.lastStatus !== 'settled') {
      const kb = new InlineKeyboard().url('📊 View in Predikt', roomLink(fixtureId));
      for (const chatId of w.subscribers.values()) {
        await bot.api
          .sendMessage(chatId, fmt.settledNotice(pool), { parse_mode: 'HTML', reply_markup: kb })
          .catch(() => {});
      }
      watches.delete(fixtureId);
    } else {
      w.lastStatus = pool.status;
    }
  }
}

/* ----------------------------------------------------------------- helpers */

function fixtureButtons(id: string): InlineKeyboard {
  return new InlineKeyboard()
    .text('🧠 Ask the Gaffer', `gaffer:${id}`)
    .text('📊 Standings', `pool:${id}`)
    .row()
    .url('⚽ Stake in Predikt', roomLink(id))
    .text('🔔 Ping me at FT', `watch:${id}`);
}

async function showFixturesList(ctx: Context): Promise<void> {
  const all = await api.getFixtures();
  const shown = all
    .filter((f) => f.isLive || f.status !== 'settled')
    .sort((a, b) => +new Date(a.kickoff) - +new Date(b.kickoff))
    .slice(0, 8);

  const kb = new InlineKeyboard();
  for (const f of shown) kb.text(fmt.fixtureShort(f), `fx:${f.id}`).row();

  await ctx.reply(fmt.fixturesHeader(shown.length), {
    parse_mode: 'HTML',
    reply_markup: shown.length ? kb : undefined,
  });
}

async function showFixtureDetail(ctx: Context, id: string): Promise<void> {
  const f = await api.getFixture(id);
  const pool = await api.getPool(id).catch(() => null);
  await ctx.reply(fmt.fixtureDetail(f, pool), {
    parse_mode: 'HTML',
    reply_markup: fixtureButtons(id),
  });
}

/** Run the on-device Gaffer: placeholder message, live-ish edits, final read. */
async function runGaffer(ctx: Context, fixtureId: string): Promise<void> {
  const chatId = ctx.chat!.id;
  let fixture: api.FixtureSummary | null = null;
  try {
    fixture = await api.getFixture(fixtureId);
  } catch {
    /* still stream; header falls back to generic text */
  }

  const placeholder = await ctx.reply(fmt.gafferThinking(fixture), { parse_mode: 'HTML' });
  let lastEdit = 0;

  try {
    const read = await api.streamGaffer(fixtureId, {
      onDelta: (_delta, full) => {
        const now = Date.now();
        if (now - lastEdit < 1500) return; // throttle to dodge Telegram limits
        lastEdit = now;
        ctx.api
          .editMessageText(chatId, placeholder.message_id, fmt.gafferProgress(fixture, full), {
            parse_mode: 'HTML',
          })
          .catch(() => {}); // ignore "message not modified" / rate limits
      },
    });
    await ctx.api.editMessageText(
      chatId,
      placeholder.message_id,
      fmt.gafferRead(fixture, read),
      { parse_mode: 'HTML' },
    );
  } catch (err) {
    await ctx.api
      .editMessageText(
        chatId,
        placeholder.message_id,
        `⚠️ The Gaffer couldn’t finish: ${fmt.esc((err as Error).message)}`,
        { parse_mode: 'HTML' },
      )
      .catch(() => {});
  }
}

/* ---------------------------------------------------------------- commands */

bot.command('start', async (ctx) => {
  await ctx.reply(fmt.welcome(ctx.from?.first_name || 'there'), { parse_mode: 'HTML' });
});

bot.command('help', async (ctx) => {
  await ctx.reply(fmt.help(), { parse_mode: 'HTML' });
});

bot.command('fixtures', async (ctx) => {
  try {
    await showFixturesList(ctx);
  } catch (err) {
    await ctx.reply(`⚠️ Couldn’t load fixtures: ${fmt.esc((err as Error).message)}`, {
      parse_mode: 'HTML',
    });
  }
});

bot.command('gaffer', async (ctx) => {
  const id = ctx.match.trim();
  if (!id) {
    await ctx.reply('Usage: <code>/gaffer &lt;fixtureId&gt;</code> — find one with /fixtures.', {
      parse_mode: 'HTML',
    });
    return;
  }
  await runGaffer(ctx, id);
});

bot.command('pool', async (ctx) => {
  const id = ctx.match.trim();
  if (!id) {
    await ctx.reply('Usage: <code>/pool &lt;fixtureId&gt;</code>', { parse_mode: 'HTML' });
    return;
  }
  try {
    const pool = await api.getPool(id);
    if (!pool) {
      await ctx.reply('No pool for that fixture yet — start one in the app.', {
        parse_mode: 'HTML',
        reply_markup: new InlineKeyboard().url('⚽ Open in Predikt', roomLink(id)),
      });
      return;
    }
    await ctx.reply(fmt.poolStandings(pool), {
      parse_mode: 'HTML',
      reply_markup: new InlineKeyboard()
        .url('⚽ Stake in Predikt', roomLink(id))
        .text('🔔 Ping me at FT', `watch:${id}`),
    });
  } catch (err) {
    await ctx.reply(`⚠️ Couldn’t load pool: ${fmt.esc((err as Error).message)}`, {
      parse_mode: 'HTML',
    });
  }
});

/* -------------------------------------------------------- inline callbacks */

bot.callbackQuery(/^fx:(.+)$/, async (ctx) => {
  const id = ctx.match![1];
  await ctx.answerCallbackQuery().catch(() => {});
  try {
    await showFixtureDetail(ctx, id);
  } catch (err) {
    await ctx.reply(`⚠️ ${fmt.esc((err as Error).message)}`, { parse_mode: 'HTML' });
  }
});

bot.callbackQuery(/^gaffer:(.+)$/, async (ctx) => {
  const id = ctx.match![1];
  await ctx.answerCallbackQuery({ text: 'Waking the Gaffer…' }).catch(() => {});
  await runGaffer(ctx, id);
});

bot.callbackQuery(/^pool:(.+)$/, async (ctx) => {
  const id = ctx.match![1];
  await ctx.answerCallbackQuery().catch(() => {});
  try {
    const pool = await api.getPool(id);
    if (!pool) {
      await ctx.reply('No pool for that fixture yet.', { parse_mode: 'HTML' });
      return;
    }
    await ctx.reply(fmt.poolStandings(pool), {
      parse_mode: 'HTML',
      reply_markup: new InlineKeyboard()
        .url('⚽ Stake in Predikt', roomLink(id))
        .text('🔔 Ping me at FT', `watch:${id}`),
    });
  } catch (err) {
    await ctx.reply(`⚠️ ${fmt.esc((err as Error).message)}`, { parse_mode: 'HTML' });
  }
});

// Subscribe to a pool's full-time settlement ping. Read-only — no stake, no wallet.
bot.callbackQuery(/^watch:(.+)$/, async (ctx) => {
  const id = ctx.match![1];
  watchPool(id, ctx.from.id, ctx.chat!.id);
  await ctx.answerCallbackQuery({ text: '🔔 I’ll ping you when it settles.' }).catch(() => {});
});

/* ----------------------------------------------------------------- free text */

bot.on('message:text', async (ctx) => {
  const text = ctx.message.text.trim();
  if (text.startsWith('/')) {
    await ctx.reply(fmt.unknownCommand(), { parse_mode: 'HTML' });
    return;
  }
  // Non-command chatter — gentle nudge.
  await ctx.reply(fmt.help(), { parse_mode: 'HTML' });
});

/* ---------------------------------------------------------------- lifecycle */

bot.catch((err) => {
  console.error('[gaffer-bot] handler error:', err.error);
});

let poller: ReturnType<typeof setInterval> | undefined;

function shutdown(signal: string): void {
  console.log(`\n[gaffer-bot] ${signal} — shutting down…`);
  if (poller) clearInterval(poller);
  bot.stop();
}
process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));

// Warm sanity check against the API (non-fatal if the server isn't up yet).
api
  .getHealth()
  .then((h) => console.log(`[gaffer-bot] API ${api.apiBase()} — ${fmt.healthLine(h)}`))
  .catch((e) =>
    console.warn(`[gaffer-bot] warning: API ${api.apiBase()} unreachable (${e.message})`),
  );

poller = setInterval(() => {
  pollSettlements().catch(() => {});
}, 30_000);

await bot.start({
  onStart: (info) => console.log(`[gaffer-bot] @${info.username} up — long polling.`),
});
