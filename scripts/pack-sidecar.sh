#!/usr/bin/env bash
# Assemble the on-device AI sidecar as a self-contained bundle for the desktop
# app: a single esbuild'd JS file + only the deps that can't be bundled (the
# @qvac native engines, fastify, viem) + a Node runtime. Shipped as Tauri
# resources and spawned in the packaged .app. The ~773MB model is NOT bundled —
# it downloads on first run (the onboarding provisioning step shows progress).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/web/src-tauri/resources/sidecar"
NM="$OUT/node_modules"

echo "▸ clean $OUT"
rm -rf "$OUT"; mkdir -p "$NM"

echo "▸ bundle sidecar.ts → sidecar.mjs (only native/dynamic deps external)"
"$ROOT/node_modules/.bin/esbuild" "$ROOT/server/src/sidecar.ts" \
  --bundle --platform=node --format=esm \
  --external:@qvac/* --external:fastify --external:@fastify/* --external:viem --external:@tetherto/* \
  --outfile="$OUT/sidecar.mjs"

echo "▸ copy the external runtime deps"
# The QVAC SDK's DEFAULT Bare worker statically imports (and eagerly native-loads)
# EVERY engine plugin — so with it we'd have to ship all 11 engines. Instead we
# ship a custom worker (see below) that registers ONLY the three model types the
# sidecar runs: chat (llamacpp), TTS (ggml) and STT (whisper). That lets us drop
# the other eight engines ENTIRELY — hundreds of MB of native binaries we never
# touch. Selected at runtime via QVAC_WORKER_PATH.
QVAC_USED_ENGINES="llm-llamacpp tts-ggml transcription-whispercpp"
QVAC_UNUSED_ENGINES="diffusion-cpp ocr-ggml vla-ggml embed-llamacpp translation-nmtcpp transcription-parakeet classification-ggml bci-whispercpp"

copy_dep() { # copy_dep <pkg> [keep_prebuild]  — keep_prebuild=no drops all prebuilds
  local pkg="$1" keep="${2:-yes}"
  local src="$ROOT/node_modules/$pkg"
  [ -d "$src" ] || return 0
  mkdir -p "$NM/$pkg"
  # Drop prebuilds (handled below) plus dev-only cruft — test fixtures alone are
  # tens of MB (e.g. whisper ships 30MB of sample audio under test/).
  rsync -a \
    --exclude 'prebuilds/*' \
    --exclude 'test/' --exclude 'tests/' --exclude '__tests__/' \
    --exclude 'example/' --exclude 'examples/' --exclude 'docs/' \
    --exclude '*.md' --exclude '.github/' --exclude '*.map' \
    "$src/" "$NM/$pkg/" 2>/dev/null || cp -R "$src/" "$NM/$pkg/"
  # keep ONLY the darwin-arm64 prebuild, and only for engines we actually run
  if [ "$keep" = "yes" ] && [ -d "$src/prebuilds/darwin-arm64" ]; then
    mkdir -p "$NM/$pkg/prebuilds"
    cp -R "$src/prebuilds/darwin-arm64" "$NM/$pkg/prebuilds/"
  fi
}
for p in fastify viem; do copy_dep "$p"; done
# scoped packages
for scope in @fastify @tetherto; do
  for dir in "$ROOT/node_modules/$scope"/*; do
    [ -d "$dir" ] && copy_dep "$scope/$(basename "$dir")"
  done
done
# @qvac: ship SDK core + the three engines we run; skip the eight we don't.
for dir in "$ROOT/node_modules/@qvac"/*; do
  [ -d "$dir" ] || continue
  name="$(basename "$dir")"
  case " $QVAC_UNUSED_ENGINES " in
    *" $name "*) echo "   – skip @qvac/$name (unused engine)"; continue;;
  esac
  copy_dep "@qvac/$name" yes
done

echo "▸ install the custom worker (registers only llm + tts + whisper)"
# Mirrors @qvac/sdk's dist/server/worker.js, minus the engines we dropped. Lives
# beside the SDK's worker.js so its relative imports resolve identically; the
# Rust launcher points QVAC_WORKER_PATH here for the packaged app.
WORKER_DIR="$NM/@qvac/sdk/dist/server"
if [ -d "$WORKER_DIR" ]; then
  cat > "$WORKER_DIR/predikt-worker.js" <<'WORKER'
/**
 * Predikt on-device worker — registers ONLY the engines the sidecar runs
 * (chat / TTS / STT). Mirrors @qvac/sdk's default worker.js so the app can ship
 * without the eight unused engines. Selected via QVAC_WORKER_PATH.
 */
import { initializeWorkerCore, ensureRPCSetup } from "./worker-core.js";
import { registerPlugins } from "./plugins/index.js";
import { getServerLogger } from "../logging/index.js";
import { llmPlugin } from "./bare/plugins/llamacpp-completion/plugin.js";
import { ttsPlugin } from "./bare/plugins/tts-ggml/plugin.js";
import { whisperPlugin } from "./bare/plugins/whispercpp-transcription/plugin.js";
const { hasRPCConfig } = initializeWorkerCore();
const logger = getServerLogger();
logger.info("🐻 Predikt on-device worker (llm + tts + whisper)");
registerPlugins([llmPlugin, ttsPlugin, whisperPlugin]);
if (hasRPCConfig) {
  ensureRPCSetup();
} else {
  logger.info("Running in direct mode - RPC setup will be lazy");
}
WORKER
  echo "   + $WORKER_DIR/predikt-worker.js"
else
  echo "   ! @qvac/sdk not found — custom worker not installed"
fi

echo "▸ bundle the Node runtime"
cp "$(command -v node)" "$OUT/node"
# Must be writable (u+w), not just executable: tauri-build copies resources into
# target/ preserving mode, and a read-only copy can't be overwritten on the next
# build (EACCES). Homebrew ships node 555 / libnode 444 — force writable here.
chmod 755 "$OUT/node"
# Homebrew's node links libnode dynamically — ship it beside the binary so the
# packaged app doesn't depend on a system Node. (For a cleaner signed build,
# swap this for the self-contained official node binary from nodejs.org.)
DYLIB="$(otool -L "$OUT/node" 2>/dev/null | grep -o '@rpath/libnode[^ ]*' | head -1 | sed 's#@rpath/##')"
if [ -n "${DYLIB:-}" ]; then
  SRC="$(find /opt/homebrew -name "$DYLIB" 2>/dev/null | head -1)"
  if [ -n "$SRC" ]; then
    cp "$SRC" "$OUT/$DYLIB" && chmod 644 "$OUT/$DYLIB" && echo "   + $DYLIB"
    # Make @rpath/libnode resolve to the dylib sitting beside the binary, so the
    # packaged app works on machines without Homebrew.
    if ! otool -l "$OUT/node" | grep -q "@executable_path"; then
      install_name_tool -add_rpath @executable_path "$OUT/node" 2>/dev/null \
        && echo "   + rpath @executable_path" || echo "   ! could not add rpath (will rely on system libnode)"
    fi
    # NOTE: install_name_tool invalidates node's signature — it gets re-signed in
    # the signing pass at the end of this script (arm64 macOS SIGKILLs binaries
    # whose signature doesn't match).
  fi
fi

# Every bundled file must be user-writable so tauri-build can re-copy resources
# into target/ across rebuilds (read-only copies fail with EACCES). Native
# prebuilds (.bare) and dylibs often arrive 444 — normalise the whole tree.
echo "▸ normalise perms (writable so tauri-build can re-copy)"
chmod -R u+rwX "$OUT"

# ── Sign the nested Mach-O binaries (node, libnode dylib, QVAC .bare addons) ──
# Notarization requires EVERY Mach-O signed inside-out with the hardened runtime;
# Tauri only signs the outer .app, so we sign the nested binaries here — before
# Tauri bundles them (this runs in beforeBuildCommand). With APPLE_SIGNING_IDENTITY
# set we use the real Developer ID + entitlements + secure timestamp (notarizable);
# without it we adhoc-sign so the app still runs locally on arm64.
echo "▸ sign nested binaries"
ENT="$ROOT/web/src-tauri/entitlements.plist"
sign_macho() {
  local f="$1"
  if [ -n "${APPLE_SIGNING_IDENTITY:-}" ]; then
    codesign --force --timestamp --options runtime --entitlements "$ENT" \
      --sign "$APPLE_SIGNING_IDENTITY" "$f" 2>/dev/null
  else
    codesign --force --sign - "$f" 2>/dev/null # adhoc (local only)
  fi
}
# Leaves first (addons + dylib), then the node executable that loads them.
while IFS= read -r f; do sign_macho "$f"; done < <(find "$OUT" \( -name '*.bare' -o -name '*.node' -o -name '*.dylib' \) -type f)
sign_macho "$OUT/node"
if [ -n "${APPLE_SIGNING_IDENTITY:-}" ]; then
  echo "   signed with: $APPLE_SIGNING_IDENTITY (hardened runtime + entitlements)"
else
  echo "   adhoc-signed (set APPLE_SIGNING_IDENTITY for a notarizable build)"
fi

echo "▸ done."
du -sh "$OUT" | awk '{print "   sidecar bundle:", $1}'
