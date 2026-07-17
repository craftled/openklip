# OpenKlip desktop shell (Tauri v2) — CRAFT-6187

Wraps OpenKlip as a macOS app. It spawns the existing production server
(`openklip serve`, CRAFT-6185) as a **Bun sidecar** on a private loopback port
and loads the editor in the system WebView (WKWebView).

## Status: Stage B (self-contained bundling) — working, verified

Verified end-to-end against a REAL `cargo tauri build --debug` output
(`.app`, not just a dev binary), launched the standard way (`open`, going
through LaunchServices) and quit the standard way (a real Quit AppleEvent):

- **Fully self-contained**: the bundled `Contents/Resources/app/` (built
  `.next`, a production-pruned `node_modules`, `src/`, and all runtime asset
  dirs — `scripts/prepare-desktop-bundle.ts`) plus a bundled `bun` binary
  (`Contents/MacOS/bun`, Tauri's `externalBin`) run with **zero reference to
  the live repo checkout or a system-installed Bun**. Proved by running an
  actual export through the bundled CLI + bundled `ffmpeg-static` and
  confirming a real, valid H.264/AAC MP4 came out the other end.
- **No orphaned processes on quit.** `serve` spawns its own `next start`
  grandchild (see `src/cli.ts`); a naive kill of just the direct sidecar
  child leaves it running. Fixed by spawning with `.process_group(0)`
  (atomic, pre-exec) and killing the whole process group on
  `RunEvent::Exit`. Verified via a real AppleEvent quit against a running
  bundle: process tree fully clean afterward, zero orphans.
  - Note for anyone modifying this: a *retroactive* `setpgid()` after
    `spawn()` returns does **not** work here — POSIX only allows a parent to
    change a child's process group before that child has exec'd, and
    exec happens before Rust code can react. This was tried first (via
    `tauri-plugin-shell`'s `Command::sidecar()`, which has no pre-exec
    option) and empirically failed 100% of the time, not just as a rare
    race — see the comment in `src/main.rs`.
- **Writable state relocated** to OS-standard locations, never inside the
  read-only bundle: workspace root + integration provider keys in
  Application Support (`OPENKLIP_STATE_DIR`, `src/repo-paths.ts`'s
  `stateDir()`), the Whisper/CLIP model cache in Caches
  (`OPENKLIP_MODEL_CACHE`, already consumed since CRAFT-6243). Dev mode is
  unchanged (still cwd-relative `.openklip/`).
- **De-risked separately**: the full editor + real video playback + WebGL +
  MediaSource render correctly in WKWebView (the reason Tauri was chosen
  over Electron — no bundled Chromium — is validated).
- Signing/notarization is wired (`entitlements.plist` + `tauri.conf.json`
  macOS block) and documented in `docs/desktop-packaging-runbook.md`.

### Resolved: DMG bundling works; earlier "hang" was a downstream symptom

An earlier note here flagged the DMG step (`bundle_dmg.sh` → `create-dmg`) as
reliably hanging in automated sessions. That was a misdiagnosis: the DMG step
is never reached when the release `.app` fails to compile, and two separate
build failures were masking it (see CRAFT-6261):

1. **Sandboxed compilation corrupted the parallel Rust build.** Running
   `cargo build --release` under a filesystem sandbox produced intermittent
   `E0463: can't find crate for <proc-macro>` errors and outright Mach-O
   dylib corruption (`dlopen: mis-aligned LINKEDIT string pool`), on a
   different crate each run. Building **non-sandboxed** fixed it.
2. **The aggressive `[profile.release]` settings broke proc-macro dylibs.**
   `tauri build` compiles with the production `custom-protocol` feature,
   recompiling `tauri_macros` under `lto = true` / `codegen-units = 1` /
   `strip = true`. Stripped/LTO'd proc-macro dylibs fail to load. Fixed with
   a `[profile.release.build-override]` (opt-level 0, unstripped) that
   exempts host build tools without changing the shipped binary.

With both fixed, `bunx @tauri-apps/cli build --bundles app,dmg` produces a
valid, `hdiutil verify`-clean DMG (~327 MB) in a couple of minutes — no
Finder-automation hang. Build the release artifacts on a normal interactive
Mac session (not inside a sandboxed automation harness).

### Rebuild + test the bundle yourself

```bash
bun run build                                 # production Next build
bun run desktop:prepare-bundle                # stage Resources/app (release)
bunx @tauri-apps/cli@2 build --bundles app,dmg  # release .app + valid DMG (run non-sandboxed)
scripts/verify-macos-signature.sh src-tauri/target/release/bundle/macos/OpenKlip.app  # only meaningful once signed (Stage C)

# functional check, no signing needed:
open -n src-tauri/target/debug/bundle/macos/OpenKlip.app
# ...then, from another terminal, confirm no repo/system deps and a clean quit:
ps -eo pid,ppid,pgid,command | grep -E 'OpenKlip.app|MacOS/bun'
osascript -e 'tell application id "com.craftled.openklip" to quit'
```

### Run the raw dev skeleton (no bundling, fastest iteration loop)

```bash
bun run build
OPENKLIP_APP_ROOT="$(pwd)" OPENKLIP_SLUG=<slug> OPENKLIP_PROJECTS_ROOT=<root> \
  src-tauri/target/debug/openklip-desktop
```

## Remaining

### Still open (agent-doable)
- **First-run UX**: a workspace picker (native folder dialog, default
  `~/Movies/OpenKlip`) and resumable/checksummed model-download UX that
  doesn't block reaching the editor. Not yet built — first launch today
  relies on whatever `openklip serve`'s existing doctor/health gate already
  does, same as the CLI.
- **Single-instance guard**: nothing yet prevents two copies of the app
  running two sidecars. `tauri-plugin-single-instance` is the standard
  building block; a stale-PID-file check in Application Support (same
  mechanism as any future orphan-cleanup-on-relaunch) is a reasonable
  pairing.
- **Log-file redirection**: sidecar stdout/stderr currently inherit this
  process's own (visible only if launched from a terminal, not from
  Finder). Redirecting to a file under `app.path().app_log_dir()` (Application
  Support/Logs) is a small, contained follow-up.
- **Crash resilience beyond graceful quit**: the process-group fix
  guarantees clean teardown on a *graceful* quit (menu Quit, Cmd+Q, an
  AppleEvent). A hard `kill -9`/force-quit of the top-level app process
  itself cannot be intercepted by anything, in any language — this is a
  fundamental OS limitation, not specific to this app. The accepted
  mitigation (not yet implemented) is a stale-sidecar cleanup check on the
  *next* launch, which naturally falls out of the single-instance PID-file
  mechanism above.

### Stage C — sign / notarize / release [human-only final step]
Fully scripted; runs on the human's Developer ID. See
`docs/desktop-packaging-runbook.md`.
