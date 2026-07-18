#!/usr/bin/env bash
# Deep-sign the OpenKlip macOS .app for notarization (CRAFT-6262).
#
# WHY THIS EXISTS: `tauri build` (with APPLE_SIGNING_IDENTITY set) signs the app
# shell and Contents/MacOS/* but NOT the native binaries bundled deep inside
# Contents/Resources/app/node_modules (ffmpeg, ffprobe, onnxruntime, sharp,
# next-swc, esbuild, the vision-focus helper, …). Apple notarization rejects
# the app unless EVERY Mach-O is individually signed with a Developer ID cert,
# hardened runtime, and a secure timestamp. `codesign --deep` does not reach
# node_modules, so we enumerate every Mach-O by file *content* (not the execute
# bit — the bundle copy strips +x off some binaries like ffprobe) and sign each.
#
# Prerequisites:
#   - A "Developer ID Application" certificate in the login keychain
#     (security find-identity -v -p codesigning must list it).
#   - The Developer ID G2 intermediate installed (Xcode does this; without full
#     Xcode: security import DeveloperIDG2CA.cer from apple.com/certificateauthority).
#   - src-tauri already built: bunx @tauri-apps/cli build --bundles app
#     (run non-sandboxed — see docs/desktop-packaging-runbook.md).
#
# Usage: scripts/sign-desktop-bundle.sh [path/to/OpenKlip.app]
#   APPLE_SIGNING_IDENTITY env overrides the identity (default: Craftled Team ID).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP="${1:-$ROOT/src-tauri/target/release/bundle/macos/OpenKlip.app}"
ENT="$ROOT/src-tauri/entitlements.plist"
IDENTITY="${APPLE_SIGNING_IDENTITY:-Developer ID Application: Craftled, MB (4RRUYWAP8F)}"

[ -d "$APP" ] || { echo "error: app not found: $APP" >&2; exit 1; }
[ -f "$ENT" ] || { echo "error: entitlements not found: $ENT" >&2; exit 1; }
security find-identity -v -p codesigning | grep -qF "$IDENTITY" \
  || { echo "error: signing identity not in keychain: $IDENTITY" >&2; exit 1; }

echo "Signing bundle: $APP"
echo "Identity:       $IDENTITY"

# 1. Every nested Mach-O, leaf-first. Helpers get hardened runtime + timestamp
#    but no entitlements — only the executables that need JIT/library-loading do.
echo "[1/4] Signing nested Mach-O binaries (by content)…"
signed=0
while IFS= read -r f; do
  [ "$f" = "$APP/Contents/MacOS/bun" ] && continue
  [ "$f" = "$APP/Contents/MacOS/openklip-desktop" ] && continue
  case "$(file -b "$f" 2>/dev/null)" in
    *Mach-O*)
      codesign --force --timestamp --options runtime -s "$IDENTITY" "$f"
      signed=$((signed + 1))
      ;;
  esac
done < <(find "$APP" -type f ! -type l)
echo "      signed $signed nested binaries"

# 2. bun + the shell binary need the entitlements (JavaScriptCore JIT +
#    disable-library-validation so bun can load the native .node addons).
echo "[2/4] Signing bun + shell with entitlements…"
codesign --force --timestamp --options runtime --entitlements "$ENT" -s "$IDENTITY" "$APP/Contents/MacOS/bun"
codesign --force --timestamp --options runtime --entitlements "$ENT" -s "$IDENTITY" "$APP/Contents/MacOS/openklip-desktop"

# 3. Seal the outer bundle last (its seal covers every nested signature above).
echo "[3/4] Sealing the app bundle…"
codesign --force --timestamp --options runtime --entitlements "$ENT" -s "$IDENTITY" "$APP"

# 4. Every Mach-O must carry OUR Developer ID (catches leftover adhoc/linker
#    signatures that `codesign -v` alone would pass). </dev/null stops codesign
#    from consuming the while-loop's stdin.
echo "[4/4] Verifying every Mach-O carries the Developer ID…"
bad=0
while IFS= read -r f; do
  case "$(file -b "$f" 2>/dev/null)" in
    *Mach-O*)
      codesign -dvv "$f" </dev/null 2>&1 | grep -qF "Authority=$IDENTITY" \
        || { echo "      NOT SIGNED WITH DEVELOPER ID: ${f#"$APP"/}"; bad=$((bad + 1)); }
      ;;
  esac
done < <(find "$APP" -type f ! -type l)
codesign --verify --deep --strict "$APP"
[ "$bad" -eq 0 ] || { echo "error: $bad binaries not Developer-ID-signed" >&2; exit 1; }

echo "OK — bundle is fully Developer-ID signed and passes deep strict verify."
echo "Next: repackage the DMG from this signed app, then notarize + staple"
echo "      (see docs/desktop-packaging-runbook.md, Stage C)."
