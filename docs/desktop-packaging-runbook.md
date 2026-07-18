# macOS packaging runbook (CRAFT-6187)

How to produce a signed + notarized OpenKlip.app / DMG. Steps marked **[human-only]** require an Apple Developer account and cannot be automated by an agent (they involve private credentials).

> **Prerequisite — complete.** The desktop shell in `src-tauri/` is verified self-contained (Stage B): the bundled `.app` runs its own copy of the runtime (`Contents/Resources/app/`) and its own Bun binary (`Contents/MacOS/bun`) with zero reference to the repo checkout or a system-installed Bun — proved by driving a real ffmpeg export entirely through a `cargo tauri build --debug` output. Process-group teardown on quit is also verified (no orphaned `next start` after a real AppleEvent quit). See `src-tauri/README.md` for the full verification writeup and the still-open items (first-run UX, single-instance guard, log-file redirection) that don't block this runbook. The release `.app` **and** a valid DMG both build cleanly (CRAFT-6261) — an earlier "DMG hangs" caveat was a misdiagnosis of two release-build failures (a sandbox corrupting the Rust compile, and aggressive `[profile.release]` settings breaking proc-macro dylibs). Both are fixed; build non-sandboxed. See `src-tauri/README.md` for the full write-up.

> **Status: DONE for v0.43.0.** `OpenKlip_0.43.0_aarch64.dmg` was signed as
> **Developer ID Application: Craftled, MB (4RRUYWAP8F)**, notarized by Apple,
> and stapled (both the DMG and the app inside). `spctl -a` → *accepted,
> Notarized Developer ID*. The steps below are the reproducible process; the
> earlier "Tauri signs + notarizes automatically" claim was wrong — see Step 2.

## One-time setup **[human-only]**

1. Enrol in the Apple Developer Program ($99/yr). Craftled is enrolled as an **Organization** (`Craftled, MB`, Team ID `4RRUYWAP8F`).
2. Create a **Developer ID Application** certificate. Note: this cert type **can only be created by the Account Holder** (portal shows "This operation can only be performed by the Account Holder"). Without full Xcode, use the CSR hand-off:
   - On the build Mac: **Keychain Access → Certificate Assistant → Request a Certificate From a CA → Saved to disk** (this puts the private key in *this* Mac's keychain).
   - The Account Holder uploads that `.certSigningRequest` at developer.apple.com → Certificates → ＋ → **Developer ID Application** → downloads the `.cer` → sends it back.
   - Double-click the `.cer` to install. Confirm: `security find-identity -v -p codesigning` lists it.
   - **Intermediate:** without full Xcode the Developer ID G2 intermediate is missing and the cert shows as invalid. Install it once: `curl -fsSLO https://www.apple.com/certificateauthority/DeveloperIDG2CA.cer && security import DeveloperIDG2CA.cer -k ~/Library/Keychains/login.keychain-db`.
3. Store notarization credentials in the keychain (any team member's Apple ID works). Run in **your own** Terminal so the password never leaves your machine:
   ```bash
   xcrun notarytool store-credentials "openklip-notary" \
     --apple-id "you@example.com" --team-id "4RRUYWAP8F" --password "<app-specific-password>"
   ```
   (app-specific password: account.apple.com → Sign-In and Security → App-Specific Passwords.)

## Build + sign + notarize + staple

**Important:** `tauri build` (even with `APPLE_SIGNING_IDENTITY` set) signs the app shell and `Contents/MacOS/*` but **NOT** the native binaries bundled deep in `Contents/Resources/app/node_modules` (ffmpeg, ffprobe, onnxruntime, sharp, next-swc, esbuild, …). `codesign --deep` doesn't reach them either. Notarization rejects the app until every one is signed. So the flow is: tauri build → **deep-sign script** → repackage the DMG → notarize → staple. Run everything **non-sandboxed** (see CRAFT-6261).

```bash
# 1. Build the release .app (identity set so the shell is signed).
bun run build
bun run scripts/prepare-desktop-bundle.ts
APPLE_SIGNING_IDENTITY="Developer ID Application: Craftled, MB (4RRUYWAP8F)" \
  bunx @tauri-apps/cli@2 build --bundles app

# 2. Deep-sign EVERY nested Mach-O (the part tauri misses). Idempotent; verifies.
scripts/sign-desktop-bundle.sh

# 3. Repackage the DMG from the fully-signed app (tauri's DMG holds unsigned
#    resources, so rebuild it manually), then sign it. zlib-level=9 keeps it ~324MB.
APP=src-tauri/target/release/bundle/macos/OpenKlip.app
DMG=src-tauri/target/release/bundle/dmg/OpenKlip_0.43.0_aarch64.dmg
STAGE=$(mktemp -d)/r; mkdir -p "$STAGE"; ditto "$APP" "$STAGE/OpenKlip.app"; ln -s /Applications "$STAGE/Applications"
hdiutil create -volname OpenKlip -srcfolder "$STAGE" -ov -format UDBZ "$DMG.tmp"
hdiutil convert "$DMG.tmp" -format UDZO -imagekey zlib-level=9 -o "$DMG"; rm -f "$DMG.tmp"
codesign --force --timestamp -s "Developer ID Application: Craftled, MB (4RRUYWAP8F)" "$DMG"

# 4. Notarize + staple. (For a stapled app INSIDE a stapled DMG: notarize once,
#    `xcrun stapler staple "$APP"`, rebuild the DMG from the stapled app, then
#    notarize + staple the DMG. One extra ~10-min round; covers offline first-launch.)
xcrun notarytool submit "$DMG" --keychain-profile "openklip-notary" --wait
xcrun stapler staple "$DMG"
```

The hardened runtime + Bun-JIT entitlements (`com.apple.security.cs.allow-jit`, `allow-unsigned-executable-memory`, `disable-library-validation`) are in `src-tauri/entitlements.plist`; the deep-sign script applies them to `bun` + the shell.

## Auto-update (CRAFT-6266)

The app checks for updates on launch (Rust-driven, `spawn_update_check` in `src-tauri/src/main.rs`) against the feed in `tauri.conf.json` → `plugins.updater.endpoints`:
`https://github.com/craftled/openklip/releases/latest/download/latest.json`. On finding a newer signed version it prompts, then downloads + installs + relaunches. **It stays dormant until a release actually publishes the feed** — no feed = a logged skip, never a crash.

The updater **public** key is committed in `tauri.conf.json`. The **private** key was generated to `src-tauri/.tauri/openklip-updater.key` — this is **gitignored and must be moved somewhere secret** (a password manager / secure store). If you lose it, you can never sign updates again and must ship a new pubkey (breaking auto-update for installed apps).

To **activate** it, each release must publish updater artifacts + a manifest:

```bash
# In addition to the sign/notarize flow above, at release time:
export TAURI_SIGNING_PRIVATE_KEY="$(cat /path/to/openklip-updater.key)"   # the secret you stored
# (export TAURI_SIGNING_PRIVATE_KEY_PASSWORD=… only if you regenerated the key WITH a passphrase)

# Build with updater artifacts enabled (not on by default, so normal/CI builds
# don't need the key). This emits OpenKlip.app.tar.gz + .sig alongside the .app/.dmg.
APPLE_SIGNING_IDENTITY="Developer ID Application: Craftled, MB (4RRUYWAP8F)" \
  bunx @tauri-apps/cli@2 build --bundles app,dmg \
  --config '{"bundle":{"createUpdaterArtifacts":true}}'

# Write latest.json (the update manifest) — version, notes, pub_date, and a
# platforms."darwin-aarch64" entry with the .sig contents + the .tar.gz URL on
# the GitHub release. Then attach latest.json + OpenKlip.app.tar.gz (+ its .sig)
# to the GitHub release so the endpoint above resolves.
```

Until that publish step runs for a release, installed apps simply find no update and carry on. The Apple Developer ID signing/notarization (above) and the Tauri updater signature are **separate keys** — an update artifact needs both: notarized *and* updater-signed.

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

## Status (v0.43.0)

- **Done:** signed as Developer ID Application: Craftled, MB (4RRUYWAP8F), notarized by Apple, stapled (DMG + app inside), `spctl -a` accepted. The deep-sign step is codified in `scripts/sign-desktop-bundle.sh`. Reproducible for future releases via the process above.
- **Yours [human-only, recurring per release]:** run the deep-sign + notarize flow above (needs the keychain cert + notary profile), and a clean-machine Gatekeeper smoke test.
- **Still open (agent-doable, doesn't block distribution):** first-run workspace picker + model-download UX, single-instance guard, sidecar log-file redirection (see `src-tauri/README.md`); auto-update + install docs (CRAFT-6266).
