# Predikt Desktop — build, sign & notarize

The desktop app is a Tauri v2 shell around the same web client, plus an **on-device
AI sidecar** (Tether QVAC — Llama-3.2 chat, Supertonic TTS, Whisper STT) that runs
locally on the user's machine. Money + multiplayer stay on the hosted backend; the
AI runs on-device.

```
web/src-tauri/            Tauri app (Rust)
  ├─ src/lib.rs           spawns the sidecar, OS keychain, tray, notifications
  ├─ tauri.conf.json      window + bundle + macOS signing config
  ├─ entitlements.plist   hardened-runtime exceptions Node/V8 needs
  └─ resources/sidecar/   the packed sidecar (built by scripts/pack-sidecar.sh)
scripts/pack-sidecar.sh   bundles node + libnode + pruned @qvac + sidecar.mjs
server/src/sidecar.ts     the DB-free AI/voice server (127.0.0.1:8799)
```

## What the sidecar bundle contains (~127 MB)

- `sidecar.mjs` — the AI/voice server, esbuild'd to ~50 KB.
- `node` + `libnode.141.dylib` — a self-contained Node runtime (an `@executable_path`
  rpath makes it find the dylib beside it, so no system Node is required).
- `node_modules/@qvac/*` — the SDK **plus only the three engines we run**
  (`llm-llamacpp`, `tts-ggml`, `transcription-whispercpp`). The other eight engines
  are dropped via a custom worker (`predikt-worker.js`, selected with
  `QVAC_WORKER_PATH`) — that's the difference between ~127 MB and multiple GB.
- The ~773 MB model weights are **not** bundled — they download on first run into
  `~/.qvac/models` (the onboarding "provisioning" step shows progress).

## Dev

```bash
cd web && npm run tauri:dev
```

Talks to the hosted backend (Railway) for money/data and spawns the sidecar from
source (`npm run sidecar`, uses the repo `.env` for the live football feed).

## Local release build (unsigned / adhoc)

```bash
cd web && npm run tauri:build
```

Runs `pack-sidecar.sh` (adhoc-signs the nested binaries so they run on arm64),
builds the web app, compiles Rust in release, and bundles:

- `web/src-tauri/target/release/bundle/macos/Predikt.app`
- `web/src-tauri/target/release/bundle/dmg/Predikt_0.1.0_aarch64.dmg`

The packaged app spawns the bundled sidecar, which **mirrors fixtures from the
hosted backend** (`GAFFER_FIXTURES_URL`) so on-device AI reads the exact fixtures
the user sees — no data-provider key is shipped in the app.

> **If the `.dmg` step fails** (`error running bundle_dmg.sh`): Tauri styles the
> disk window with AppleScript, which is flaky in non-GUI/CI shells. `Predikt.app`
> is still built. Produce a clean compressed installer with:
> ```bash
> scripts/make-dmg.sh
> ```
> On a normal logged-in desktop session Tauri's styled DMG works; `make-dmg.sh`
> is the reliable fallback (and honours `APPLE_SIGNING_IDENTITY` for signing).

## Signed + notarized build (for distribution)

Prereqs (one-time):

1. A **Developer ID Application** certificate in your login Keychain
   (Xcode ▸ Settings ▸ Accounts ▸ Manage Certificates, or the Developer portal).
2. An **app-specific password** for your Apple ID (appleid.apple.com ▸ Sign-In & Security).

Set these, then run the same build command:

```bash
export APPLE_SIGNING_IDENTITY="Developer ID Application: Your Name (TEAMID)"
export APPLE_ID="you@example.com"
export APPLE_PASSWORD="abcd-efgh-ijkl-mnop"   # the app-specific password
export APPLE_TEAM_ID="TEAMID"

cd web && npm run tauri:build
```

What happens, inside-out (this ordering is why it notarizes cleanly):

1. `pack-sidecar.sh` sees `APPLE_SIGNING_IDENTITY` and signs every nested Mach-O
   (`node`, `libnode.141.dylib`, the QVAC `.bare` addons) with your Developer ID,
   the **hardened runtime**, `entitlements.plist`, and a secure timestamp.
2. Tauri copies the already-signed sidecar into `Predikt.app` and signs the outer
   bundle with the same identity.
3. Tauri submits the app to Apple's notary service (`notarytool`) and **staples**
   the ticket to the `.dmg`.

Find the certificate name with:

```bash
security find-identity -v -p codesigning
```

### Why the entitlements are required

Node's V8 JITs machine code and `dlopen`s native addons. Under the hardened runtime
that notarization mandates, that needs three exceptions (in `entitlements.plist`):
`allow-jit`, `allow-unsigned-executable-memory`, and `disable-library-validation`
(to load `libnode` + the `.bare` addons, which aren't part of the app's team
signature). Without them the signed app is killed the instant the sidecar starts.

### Verify a finished build

```bash
APP=web/src-tauri/target/release/bundle/macos/Predikt.app
codesign --verify --deep --strict --verbose=2 "$APP"
spctl -a -vvv "$APP"                 # should say: accepted / Notarized Developer ID
xcrun stapler validate "$APP"        # should say: The validate action worked
```
