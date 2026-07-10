#!/usr/bin/env bash
# Build a clean, compressed .dmg installer from the already-built Predikt.app.
#
# Tauri's own DMG step (create-dmg) styles the disk window with AppleScript,
# which is flaky in non-GUI / CI shells and can leave scratch images attached.
# This makes a plain UDZO image with an /Applications drag-link — smaller and
# reliable. Run AFTER `tauri build` has produced Predikt.app.
#
# For a signed, notarizable installer, pass your identity:
#   APPLE_SIGNING_IDENTITY="Developer ID Application: You (TEAMID)" scripts/make-dmg.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP="$ROOT/web/src-tauri/target/release/bundle/macos/Predikt.app"
OUT="$ROOT/web/src-tauri/target/release/bundle/dmg/Predikt_0.1.0_aarch64.dmg"
[ -d "$APP" ] || { echo "Predikt.app not found — run 'cd web && npm run tauri:build' first."; exit 1; }

echo "▸ staging"
STAGE="$(mktemp -d)/dmg"
mkdir -p "$STAGE"
cp -R "$APP" "$STAGE/"
ln -s /Applications "$STAGE/Applications"

echo "▸ creating compressed image"
mkdir -p "$(dirname "$OUT")"; rm -f "$OUT"
hdiutil create -volname "Predikt" -srcfolder "$STAGE" -ov -format UDZO "$OUT" >/dev/null
rm -rf "$(dirname "$STAGE")"

if [ -n "${APPLE_SIGNING_IDENTITY:-}" ]; then
  echo "▸ signing dmg"
  codesign --force --timestamp --sign "$APPLE_SIGNING_IDENTITY" "$OUT"
  echo "   note: submit to notary with 'xcrun notarytool submit \"$OUT\" --wait' then 'xcrun stapler staple \"$OUT\"'"
fi

echo "▸ done: $OUT ($(du -h "$OUT" | awk '{print $1}'))"
