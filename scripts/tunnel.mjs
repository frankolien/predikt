#!/usr/bin/env node
/**
 * One-command PUBLIC demo with REAL on-device QVAC — for sharing over ngrok.
 *
 *   npm run tunnel
 *
 * Unlike `npm run demo` (which runs the Vite dev server on a second port), this
 * boots the *single-service* server: one Fastify process serves the built SPA
 * AND the /api + SSE endpoints on ONE port (8787). That matters for ngrok — a
 * single tunnel exposes the whole app, and Fastify (unlike Vite dev) serves any
 * Host header, so the ngrok domain isn't blocked.
 *
 * The AI runs on THIS machine, so the pundit is the real on-device model — not
 * the scripted fallback you get on the cloud container.
 *
 * Shared database: set DATABASE_URL (e.g. in .env) to your Railway Postgres
 * PUBLIC url + DATABASE_SSL=require, and this backend and your hosted Railway
 * backend read/write the SAME accounts, pools, leagues and tournaments.
 * (The anvil chain is still per-backend — on-chain USD₮ balances live on
 * whichever backend's chain; accounts/points/pools/fantasy are shared via the DB.)
 */
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

// Mirror the repo-root .env into this process so the DB label below reflects what
// the server will actually connect to. (The server loads .env itself too; Node
// does not override already-set vars, so the value stays consistent.)
try {
  process.loadEnvFile(resolve(root, ".env"));
} catch {
  /* no .env — server falls back to the local default */
}

const PORT = process.env.PORT || "8787";
const RPC = "http://127.0.0.1:8545";
const children = [];
let shuttingDown = false;

const c = {
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  cyan: (s) => `\x1b[36m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
};

function run(cmd, args, opts = {}) {
  const child = spawn(cmd, args, { cwd: root, stdio: "inherit", ...opts });
  children.push(child);
  child.on("exit", (code) => {
    if (!shuttingDown && code && !opts.allowExit) {
      console.error(c.yellow(`\n[${cmd}] exited with code ${code}`));
    }
  });
  return child;
}

function which(cmd) {
  return new Promise((res) => {
    const p = spawn(process.platform === "win32" ? "where" : "which", [cmd]);
    p.on("exit", (code) => res(code === 0));
    p.on("error", () => res(false));
  });
}

async function rpcUp() {
  try {
    const r = await fetch(RPC, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_blockNumber", params: [] }),
    });
    return r.ok;
  } catch {
    return false;
  }
}

async function apiUp() {
  try {
    return (await fetch(`http://127.0.0.1:${PORT}/api/health`)).ok;
  } catch {
    return false;
  }
}

async function waitFor(fn, label, tries = 120, delay = 500) {
  for (let i = 0; i < tries; i++) {
    if (await fn()) return true;
    await new Promise((r) => setTimeout(r, delay));
  }
  throw new Error(`Timed out waiting for ${label}`);
}

function runOnce(cmd, args, opts = {}) {
  return new Promise((res, rej) => {
    const p = spawn(cmd, args, { cwd: root, stdio: "inherit", ...opts });
    p.on("exit", (code) => (code === 0 ? res() : rej(new Error(`${cmd} failed (${code})`))));
    p.on("error", rej);
  });
}

function dbLabel() {
  const url = process.env.DATABASE_URL;
  if (!url) return c.yellow("local default (127.0.0.1:5433) — set DATABASE_URL to your Railway Postgres to share data");
  try {
    const host = new URL(url).host;
    return c.green(`${host}`) + (/railway|rlwy\.net/i.test(host) ? c.dim("  (shared with hosted Railway ✓)") : "");
  } catch {
    return c.green("custom DATABASE_URL");
  }
}

async function main() {
  console.log(c.bold("\n  🏴 Gaffer — public tunnel demo (REAL on-device QVAC)\n"));
  console.log(c.dim("  database: ") + dbLabel() + "\n");

  if (!(await which("anvil")) || !(await which("forge"))) {
    console.error(c.yellow("  Foundry (anvil + forge) is required for the local chain."));
    console.error(c.dim("  Install:  curl -L https://foundry.paradigm.xyz | bash && foundryup\n"));
    process.exit(1);
  }

  // 1) contracts + SPA build (both needed before the single-service server boots).
  console.log(c.cyan("  → compiling contracts (forge build)"));
  await runOnce("forge", ["build", "--root", "contracts"]);
  console.log(c.cyan("  → building web (vite build → web/dist)"));
  await runOnce("npm", ["-w", "web", "run", "build"]);

  // 2) local chain.
  if (await rpcUp()) {
    console.log(c.dim("  → anvil already running on 8545"));
  } else {
    console.log(c.cyan("  → starting anvil (local EVM)"));
    run("anvil", ["--silent"], { stdio: "ignore" });
    await waitFor(rpcUp, "anvil RPC");
    console.log(c.green("  ✓ chain up"));
  }

  // 3) single-service server: serves the SPA + /api + SSE, loads the real model.
  console.log(c.cyan("  → starting single-service server (SPA + API + on-device QVAC)"));
  run("npm", ["-w", "server", "run", "start"], {
    env: { ...process.env, GAFFER_SERVE_WEB: "1", PORT },
  });
  await waitFor(apiUp, "API server");
  console.log(c.green(`  ✓ app up on http://127.0.0.1:${PORT}  (SPA + API, one origin)`));

  // 4) public tunnel.
  if (await which("ngrok")) {
    console.log(c.cyan("  → opening ngrok tunnel…\n"));
    run("ngrok", ["http", PORT]);
  } else {
    console.log(
      c.bold(c.green("\n  ✓ Ready to tunnel. In another terminal run:\n")) +
        c.bold(c.cyan(`      ngrok http ${PORT}\n`)) +
        c.dim("    (install: brew install ngrok  ·  then: ngrok config add-authtoken <token>)\n"),
    );
  }

  console.log(
    c.dim("\n  Model warms up on first run (~773 MB, cached). Check readiness at ") +
      c.cyan(`http://127.0.0.1:${PORT}/api/health`) +
      c.dim(" → ai.state:\"ready\".\n"),
  );
}

function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(c.dim("\n  shutting down…"));
  for (const ch of children) {
    try {
      ch.kill("SIGINT");
    } catch {
      /* ignore */
    }
  }
  setTimeout(() => process.exit(0), 400);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

main().catch((err) => {
  console.error(c.yellow(`\n  tunnel failed: ${err.message}`));
  shutdown();
});
