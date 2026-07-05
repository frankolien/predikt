/**
 * Gaffer — Telegram companion bot.
 *
 * A thin grammy client over Gaffer's EXISTING localhost HTTP API. It does NOT
 * reimplement pool / wallet / AI logic — every action calls the running server
 * (see ./api.ts). Long-polling; no webhook.
 *
 * Env:
 *   TELEGRAM_BOT_TOKEN  (required) — from @BotFather
 *   GAFFER_API          (optional) — API base, default http://127.0.0.1:8787
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

const bot = new Bot(TOKEN);

/* --------------------------------------------------------- in-memory state
 *
 * DEMO ONLY. This maps a Telegram user to a self-custodial WDK wallet,
 * INCLUDING its seed phrase, in process memory. A real bot must NEVER hold or
 * transmit seed phrases — this exists purely so the hackathon demo is one-tap.
 * All state is lost on restart.
 */
interface WalletRec {
  address: string;
  mnemonic: string;
  displayName: string;
}
const wallets = new Map<number, WalletRec>();
/** tgUserId -> set of fixtureIds they've joined. */
const joined = new Map<number, Set<string>>();
/** tgUserId -> fixtureId awaiting a scoreline reply (inline "Join pool" flow). */
const pendingJoin = new Map<number, string>();

function rememberJoin(userId: number, fixtureId: string): void {
  let set = joined.get(userId);
  if (!set) {
    set = new Set();
    joined.set(userId, set);
  }
  set.add(fixtureId);
}

/* ------------------------------------------------------ settlement notifier
 *
 * Lightweight poller: watch pools users have joined; when one flips to
 * `settled`, DM each participant their result + payout, then stop watching it.
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
      for (const [userId, chatId] of w.subscribers) {
        const wallet = wallets.get(userId);
        const entry = wallet
          ? pool.entries.find((e) => e.address.toLowerCase() === wallet.address.toLowerCase())
          : undefined;
        await bot.api
          .sendMessage(chatId, fmt.settledNotice(pool, entry), { parse_mode: 'HTML' })
          .catch(() => {});
      }
      watches.delete(fixtureId);
    } else {
      w.lastStatus = pool.status;
    }
  }
}

/* ----------------------------------------------------------------- helpers */

/** Ensure the user has a wallet; auto-create + DM seed (once) if not. */
async function ensureWallet(ctx: Context): Promise<WalletRec> {
  const userId = ctx.from!.id;
  const existing = wallets.get(userId);
  if (existing) return existing;

  const name = ctx.from?.first_name || 'You';
  const created = await api.createWallet(name);
  const rec: WalletRec = {
    address: created.address,
    mnemonic: created.mnemonic,
    displayName: created.displayName,
  };
  wallets.set(userId, rec);
  await ctx.reply(fmt.walletCreated(created), { parse_mode: 'HTML' });
  // Separate message, clearly flagged demo-only.
  await ctx.reply(fmt.seedWarning(created.mnemonic), { parse_mode: 'HTML' });
  return rec;
}

function fixtureButtons(id: string): InlineKeyboard {
  return new InlineKeyboard()
    .text('🧠 Ask the Gaffer', `gaffer:${id}`)
    .text('⚽ Join pool', `join:${id}`)
    .row()
    .text('📊 Pool', `pool:${id}`);
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

async function doJoin(
  ctx: Context,
  fixtureId: string,
  homeGoals: number,
  awayGoals: number,
): Promise<void> {
  const chatId = ctx.chat!.id;
  let wallet: WalletRec;
  try {
    wallet = await ensureWallet(ctx);
  } catch (err) {
    await ctx.reply(`⚠️ Couldn’t set up your wallet: ${fmt.esc((err as Error).message)}`, {
      parse_mode: 'HTML',
    });
    return;
  }

  const progress = await ctx.reply('⛓️ Staking on-chain (approve + deposit)…');
  try {
    const pool = await api.joinPool(fixtureId, {
      address: wallet.address,
      displayName: wallet.displayName,
      prediction: { homeGoals, awayGoals },
    });
    rememberJoin(ctx.from!.id, fixtureId);
    watchPool(fixtureId, ctx.from!.id, chatId);
    const entry = pool.entries.find(
      (e) => e.address.toLowerCase() === wallet.address.toLowerCase(),
    );
    await ctx.api.editMessageText(chatId, progress.message_id, fmt.joinResult(pool, entry), {
      parse_mode: 'HTML',
    });
  } catch (err) {
    await ctx.api
      .editMessageText(
        chatId,
        progress.message_id,
        `⚠️ Join failed: ${fmt.esc((err as Error).message)}`,
        { parse_mode: 'HTML' },
      )
      .catch(() => {});
  }
}

const SCORE_RE = /^(\d{1,2})\s*[-:]\s*(\d{1,2})$/;

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

bot.command('wallet', async (ctx) => {
  const userId = ctx.from!.id;
  try {
    const existing = wallets.get(userId);
    if (existing) {
      const bal = await api.getBalance(existing.address).catch(() => null);
      await ctx.reply(fmt.walletExisting(existing.address, bal?.usdtHuman ?? 0), {
        parse_mode: 'HTML',
      });
      return;
    }
    // Creates + DMs address and (separately) the seed with a demo-only warning.
    await ensureWallet(ctx);
  } catch (err) {
    await ctx.reply(`⚠️ Wallet error: ${fmt.esc((err as Error).message)}`, {
      parse_mode: 'HTML',
    });
  }
});

bot.command('join', async (ctx) => {
  const parts = ctx.match.trim().split(/\s+/).filter(Boolean);
  const fixtureId = parts[0];
  const m = parts[1]?.match(SCORE_RE);
  if (!fixtureId || !m) {
    await ctx.reply(
      'Usage: <code>/join &lt;fixtureId&gt; &lt;home&gt;-&lt;away&gt;</code>\nExample: <code>/join 2505624 2-1</code>',
      { parse_mode: 'HTML' },
    );
    return;
  }
  await doJoin(ctx, fixtureId, Number(m[1]), Number(m[2]));
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
      await ctx.reply('No pool for that fixture yet. Be the first: /join it!', {
        parse_mode: 'HTML',
      });
      return;
    }
    await ctx.reply(fmt.poolStandings(pool), { parse_mode: 'HTML' });
  } catch (err) {
    await ctx.reply(`⚠️ Couldn’t load pool: ${fmt.esc((err as Error).message)}`, {
      parse_mode: 'HTML',
    });
  }
});

bot.command('me', async (ctx) => {
  const userId = ctx.from!.id;
  const wallet = wallets.get(userId);
  if (!wallet) {
    await ctx.reply('You don’t have a wallet yet — run /wallet to create one.', {
      parse_mode: 'HTML',
    });
    return;
  }
  try {
    const bal = await api.getBalance(wallet.address).catch(() => null);
    const ids = [...(joined.get(userId) ?? [])];
    const pools = (
      await Promise.all(
        ids.map(async (id) => {
          const pool = await api.getPool(id).catch(() => null);
          if (!pool) return null;
          const entry = pool.entries.find(
            (e) => e.address.toLowerCase() === wallet.address.toLowerCase(),
          );
          return { pool, entry };
        }),
      )
    ).filter((p): p is { pool: api.PoolView; entry: api.PoolEntryView | undefined } => !!p);
    await ctx.reply(fmt.meSummary(wallet.address, bal?.usdtHuman ?? 0, pools), {
      parse_mode: 'HTML',
    });
  } catch (err) {
    await ctx.reply(`⚠️ ${fmt.esc((err as Error).message)}`, { parse_mode: 'HTML' });
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

bot.callbackQuery(/^join:(.+)$/, async (ctx) => {
  const id = ctx.match![1];
  await ctx.answerCallbackQuery().catch(() => {});
  pendingJoin.set(ctx.from.id, id);
  await ctx.reply(
    'Reply with your predicted scoreline as <code>home-away</code>, e.g. <code>2-1</code>.',
    { parse_mode: 'HTML' },
  );
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
    await ctx.reply(fmt.poolStandings(pool), { parse_mode: 'HTML' });
  } catch (err) {
    await ctx.reply(`⚠️ ${fmt.esc((err as Error).message)}`, { parse_mode: 'HTML' });
  }
});

/* ------------------------------------------ free text: join replies + help */

bot.on('message:text', async (ctx) => {
  const text = ctx.message.text.trim();
  const userId = ctx.from.id;

  const pendingFixture = pendingJoin.get(userId);
  const m = text.match(SCORE_RE);
  if (pendingFixture && m) {
    pendingJoin.delete(userId);
    await doJoin(ctx, pendingFixture, Number(m[1]), Number(m[2]));
    return;
  }

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
