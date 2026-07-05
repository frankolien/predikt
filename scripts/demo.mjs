#!/usr/bin/env node
/**
 * One-command demo orchestrator for judges.
 *
 *   npm run demo
 *
 * Boots everything locally: a local anvil chain, compiles + (via the server)
 * deploys the escrow contracts, starts the API (which loads the on-device QVAC
 * model and creates self-custodial WDK wallets), and starts the web UI.
 *
 * Everything runs on this machine — no cloud, no API keys, no real funds.
 */
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

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

async function waitFor(fn, label, tries = 60, delay = 500) {
  for (let i = 0; i < tries; i++) {
    if (await fn()) return true;
    await new Promise((r) => setTimeout(r, delay));
  }
  throw new Error(`Timed out waiting for ${label}`);
}

function runOnce(cmd, args) {
  return new Promise((res, rej) => {
    const p = spawn(cmd, args, { cwd: root, stdio: "inherit" });
    p.on("exit", (code) => (code === 0 ? res() : rej(new Error(`${cmd} failed (${code})`))));
    p.on("error", rej);
  });
}

async function main() {
  console.log(c.bold("\n  🏴 Gaffer — booting the full local demo\n"));

  if (!(await which("anvil")) || !(await which("forge"))) {
    console.error(c.yellow("  Foundry (anvil + forge) is required for the local chain."));
    console.error(c.dim("  Install:  curl -L https://foundry.paradigm.xyz | bash && foundryup\n"));
    process.exit(1);
  }

  // 1) Compile contracts (fast if cached).
  console.log(c.cyan("  → compiling contracts (forge build)"));
  await runOnce("forge", ["build", "--root", "contracts"]);

  // 2) Local chain.
  if (await rpcUp()) {
    console.log(c.dim("  → anvil already running on 8545"));
  } else {
    console.log(c.cyan("  → starting anvil (local EVM)"));
    run("anvil", ["--silent"], { stdio: "ignore" });
    await waitFor(rpcUp, "anvil RPC");
    console.log(c.green("  ✓ chain up"));
  }

  // 3) API server (deploys contracts, loads on-device model, seeds pool).
  console.log(c.cyan("  → starting API server (QVAC + WDK + escrow)"));
  run("npm", ["-w", "server", "run", "start"]);
  await waitFor(async () => {
    try {
      const r = await fetch("http://127.0.0.1:8787/api/health");
      return r.ok;
    } catch {
      return false;
    }
  }, "API server");
  console.log(c.green("  ✓ API up on http://127.0.0.1:8787"));

  // 4) Web UI.
  console.log(c.cyan("  → starting web UI (Vite)"));
  run("npm", ["-w", "web", "run", "dev"]);

  console.log(
    c.bold(c.green("\n  ✓ Gaffer is live → ")) +
      c.bold(c.cyan("http://localhost:5173")) +
      c.dim("\n    (first run downloads the on-device model — the UI shows progress)\n"),
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
  console.error(c.yellow(`\n  demo failed: ${err.message}`));
  shutdown();
});
