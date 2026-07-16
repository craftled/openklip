#!/usr/bin/env bash
# Verify a signed + notarized OpenKlip.app (CRAFT-6187). Run this AFTER a
# credentialed `cargo tauri build` (see docs/desktop-packaging-runbook.md).
# Usage: scripts/verify-macos-signature.sh /path/to/OpenKlip.app
set -euo pipefail

APP="${1:-src-tauri/target/release/bundle/macos/OpenKlip.app}"
if [ ! -d "$APP" ]; then
  echo "error: app bundle not found: $APP" >&2
  exit 1
fi

echo "== codesign: deep, strict verification =="
codesign --verify --deep --strict --verbose=2 "$APP"

echo
echo "== codesign: signing identity + hardened runtime + entitlements =="
codesign --display --verbose=4 --entitlements - "$APP" 2>&1 | grep -Ei "Authority|Runtime|allow-jit|library-validation|TeamIdentifier" || true

echo
echo "== Gatekeeper (spctl): would this launch on a clean Mac? =="
# 'accepted' + 'Notarized Developer ID' is the pass state.
spctl -a -t exec -vvv "$APP"

echo
echo "== notarization ticket stapled? =="
xcrun stapler validate "$APP"

echo
echo "ALL CHECKS PASSED — the bundle is Developer-ID signed, hardened, and notarized."
