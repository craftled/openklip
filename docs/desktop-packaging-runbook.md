# macOS packaging runbook (CRAFT-6187)

How to produce a signed + notarized OpenKlip.app / DMG. Steps marked **[human-only]** require an Apple Developer account and cannot be automated by an agent (they involve private credentials).

> **Prerequisite — complete.** The desktop shell in `src-tauri/` is verified self-contained (Stage B): the bundled `.app` runs its own copy of the runtime (`Contents/Resources/app/`) and its own Bun binary (`Contents/MacOS/bun`) with zero reference to the repo checkout or a system-installed Bun — proved by driving a real ffmpeg export entirely through a `cargo tauri build --debug` output. Process-group teardown on quit is also verified (no orphaned `next start` after a real AppleEvent quit). See `src-tauri/README.md` for the full verification writeup and the still-open items (first-run UX, single-instance guard, log-file redirection) that don't block this runbook. The release `.app` **and** a valid DMG both build cleanly (CRAFT-6261) — an earlier "DMG hangs" caveat was a misdiagnosis of two release-build failures (a sandbox corrupting the Rust compile, and aggressive `[profile.release]` settings breaking proc-macro dylibs). Both are fixed; build non-sandboxed. See `src-tauri/README.md` for the full write-up.

> **Status:** The release automation is implemented. The latest published
> release (v0.44.1) still carries only the downloadable DMGs; the updater feed
> becomes active after the first successful `release:desktop` run.

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

## Cut a release

**Important:** `tauri build` (even with `APPLE_SIGNING_IDENTITY` set) signs the app shell and `Contents/MacOS/*` but **NOT** the native binaries bundled deep in `Contents/Resources/app/node_modules` (ffmpeg, ffprobe, onnxruntime, sharp, next-swc, esbuild, …). `codesign --deep` doesn't reach them either. Notarization rejects the app until every one is signed. So the flow is: tauri build → **deep-sign script** → repackage the DMG → notarize → staple. Run everything **non-sandboxed** (see CRAFT-6261).

Before running a binary release, bump the same SemVer in `VERSION`,
`package.json`, `src-tauri/tauri.conf.json`, and `src-tauri/Cargo.toml`, commit
it, and create the matching `vX.Y.Z` tag at `HEAD`. Load the updater private
key from 1Password into `TAURI_SIGNING_PRIVATE_KEY` (and its password, if
needed, into `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`), without writing either to
disk or the repository.

```bash
bun run release:desktop
```

The command refuses a dirty or untagged worktree, validates the Developer ID
identity, `openklip-notary` keychain profile, and both updater-key environment
variables, then builds, deep-signs,
notarizes and staples the app; repackages, signs, notarizes and staples the
DMG; rebuilds the updater archive from the final stapled app; and signs it.
It creates a **draft** GitHub release, uploads the versioned DMG, stable
`OpenKlip-macos-arm64.dmg` alias, updater archive/signature, and `latest.json`,
checks that every asset exists, then publishes the draft and verifies both the
marketing DMG alias and `latest.json` through the `releases/latest/download`
URLs. `bun run release:desktop --dry-run` checks version alignment and prints
the release target; it intentionally does not run machine, credential, or
GitHub preflight checks.

The hardened runtime + Bun-JIT entitlements (`com.apple.security.cs.allow-jit`, `allow-unsigned-executable-memory`, `disable-library-validation`) are in `src-tauri/entitlements.plist`; the deep-sign script applies them to `bun` + the shell.

## Auto-update (CRAFT-6266)

The app checks for updates on launch (Rust-driven, `spawn_update_check` in `src-tauri/src/main.rs`) against the feed in `tauri.conf.json` → `plugins.updater.endpoints`:
`https://github.com/craftled/openklip/releases/latest/download/latest.json`. On finding a newer signed version it prompts, then downloads + installs + relaunches. **It stays dormant until a release actually publishes the feed** — no feed = a logged skip, never a crash.

The updater **public** key is committed in `tauri.conf.json`. The **private** key was generated to `src-tauri/.tauri/openklip-updater.key` — this is **gitignored and must be moved somewhere secret** (a password manager / secure store). If you lose it, you can never sign updates again and must ship a new pubkey (breaking auto-update for installed apps).

`release:desktop` enables Tauri updater-artifact generation only for the
release build, then replaces Tauri's pre-notarization archive with one made
from the final stapled app and signs that exact archive. It writes and publishes
the `latest.json` manifest with a `darwin-aarch64` entry and the `.sig`
**contents**. Normal development and CI builds never need the updater key.

Until that publish step runs for a release, installed apps simply find no update and carry on. The Apple Developer ID signing/notarization (above) and the Tauri updater signature are **separate keys** — an update artifact needs both: notarized *and* updater-signed.

## Publish the DMG (required each release)

`release:desktop` attaches the notarized DMG to the GitHub release under the
versioned filename and the stable `OpenKlip-macos-arm64.dmg` alias.

Forgetting the version-less alias silently breaks the site's download button (404 on `releases/latest/download/OpenKlip-macos-arm64.dmg`).

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

## Status

- **Automation:** `bun run release:desktop` is the canonical build, signing,
  notarization, packaging, updater-feed, and GitHub publishing path.
- **Human-only:** the release Mac still needs the Developer ID certificate,
  notarytool keychain profile, and updater key from the secret store; a clean-Mac
  install and Gatekeeper smoke test remain manual verification.
- **Next release verification:** run CRAFT-6272 against an installed v0.44.0
  app after the first release publishes `latest.json`.
- **Separate product work:** first-run workspace/model UX and single-instance
  protection remain tracked in Linear (see `src-tauri/README.md`).
