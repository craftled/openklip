# macOS packaging runbook (CRAFT-6187)

How to produce a signed + notarized OpenKlip.app / DMG. Steps marked **[human-only]** require an Apple Developer account and cannot be automated by an agent (they involve private credentials).

> **Prerequisite — complete.** The desktop shell in `src-tauri/` is verified self-contained (Stage B): the bundled `.app` runs its own copy of the runtime (`Contents/Resources/app/`) and its own Bun binary (`Contents/MacOS/bun`) with zero reference to the repo checkout or a system-installed Bun — proved by driving a real ffmpeg export entirely through a `cargo tauri build --debug` output. Process-group teardown on quit is also verified (no orphaned `next start` after a real AppleEvent quit). See `src-tauri/README.md` for the full verification writeup and the still-open items (first-run UX, single-instance guard, log-file redirection) that don't block this runbook. One known caveat: `cargo tauri build`'s DMG step hung in the sandboxed session that built this — see the README's "Known gap" section before assuming a DMG failure on your machine is the same issue.

## One-time setup **[human-only]**

1. Enrol in the Apple Developer Program ($99/yr) if you haven't.
2. Create a **Developer ID Application** certificate (Xcode → Settings → Accounts → Manage Certificates, or the Developer portal). Note the identity string, e.g. `Developer ID Application: Your Name (TEAMID)`.
3. Create an **App Store Connect API key** (App Store Connect → Users and Access → Integrations → App Store Connect API): download the `.p8`, note the **Key ID** and **Issuer ID**. (Alternative: an Apple ID + app-specific password + Team ID.)

## Credentials (env vars, do NOT commit)

Tauri signs + notarizes automatically during `cargo tauri build` when these are set:

```bash
# Signing (Developer ID Application)
export APPLE_SIGNING_IDENTITY="Developer ID Application: Your Name (TEAMID)"
# …or provide a base64 .p12 + password for a headless/CI keychain:
#   export APPLE_CERTIFICATE="$(base64 -i certificate.p12)"
#   export APPLE_CERTIFICATE_PASSWORD="…"

# Notarization (App Store Connect API key — preferred)
export APPLE_API_ISSUER="<issuer-uuid>"
export APPLE_API_KEY="<key-id>"
export APPLE_API_KEY_PATH="/absolute/path/AuthKey_<key-id>.p8"
# …or Apple ID auth instead:
#   export APPLE_ID="you@example.com"
#   export APPLE_PASSWORD="<app-specific-password>"
#   export APPLE_TEAM_ID="TEAMID"
```

## Build + sign + notarize

```bash
bun run build                                  # build the Next production app
bun run scripts/prepare-desktop-bundle.ts       # stage the self-contained runtime tree into src-tauri/resources/app/
bunx @tauri-apps/cli@2 build                    # builds src-tauri, signs, notarizes, staples, makes the DMG
# output: src-tauri/target/release/bundle/{macos/OpenKlip.app, dmg/OpenKlip_<ver>_aarch64.dmg}
```

The hardened runtime + Bun-JIT entitlements are already wired (`src-tauri/entitlements.plist`, referenced from `tauri.conf.json`). Nested binaries (Bun, ffmpeg, `.node`/`.dylib`) are signed by Tauri's bundler; `disable-library-validation` lets the app load the ones signed under other identities.

## Verify **[human-only, on a clean Mac]**

```bash
scripts/verify-macos-signature.sh src-tauri/target/release/bundle/macos/OpenKlip.app
```

This runs `codesign --verify --deep --strict`, checks the signing authority + hardened runtime + entitlements, `spctl -a -t exec` (Gatekeeper), and `xcrun stapler validate`. A pass means the app launches on a Mac that has never seen the repo.

## Clean-machine smoke checklist (10 min)

1. Copy the DMG to a Mac (or macOS user account) that has never had the repo/Bun/Node.
2. Open the DMG, drag OpenKlip to Applications, launch by double-click. **No Gatekeeper warning** should appear.
3. First run: pick a workspace folder; confirm model download progresses (or that the editor is reachable before it finishes).
4. Ingest a short clip → editor loads → make a cut → export → the file exists and plays.
5. Quit the app; confirm no orphaned `bun`/`ffmpeg`/`next` processes remain (`pgrep -fl bun`).

## What the agent delivered vs. what's yours

- **Delivered:** the self-contained Tauri shell + bundled Bun sidecar (verified: no repo/system dependency, a real export proven end-to-end), process-group teardown on quit (verified: no orphans after a real AppleEvent quit), Application-Support-relocated writable state, the entitlements, the signing/notarization wiring, this runbook, and the verification script — the pipeline is "one secret away."
- **Yours [human-only]:** the Developer ID cert + App Store Connect key, the first real notarization run, and the clean-machine Gatekeeper test.
- **Still open (agent-doable, doesn't block this runbook):** first-run workspace picker + model-download UX, single-instance guard, sidecar log-file redirection. See `src-tauri/README.md`'s "Remaining" section.
