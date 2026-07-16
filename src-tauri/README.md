# OpenKlip desktop shell (Tauri v2) — CRAFT-6187

Wraps OpenKlip as a macOS app. It spawns the existing production server
(`openklip serve`, CRAFT-6185) as a **Bun sidecar** on a private loopback port
and loads the editor in the system WebView (WKWebView).

## Status: Stage A (walking skeleton) — working, verified

- `cargo build` succeeds against the system WebKit (no bundled Chromium).
- `main.rs` spawns the Bun production server, shows an instant splash, and
  navigates to the editor once the server is listening; the sidecar is killed
  on app exit.
- **De-risked:** the full editor + real video playback + WebGL + MediaSource
  render correctly in WKWebView (the reason Tauri was chosen over Electron —
  no bundled Chromium — is validated).
- Signing/notarization is wired (`entitlements.plist` + `tauri.conf.json`
  macOS block) and documented in `docs/desktop-packaging-runbook.md`.

### Run the skeleton (dev)

```bash
bun run build                                   # build the Next production app
# seed a project, then:
OPENKLIP_APP_ROOT="$(pwd)" OPENKLIP_SLUG=<slug> OPENKLIP_PROJECTS_ROOT=<root> \
  src-tauri/target/debug/openklip-desktop
```

## Remaining

### Stage B — self-contained bundling (agent-doable, the big lift)
The skeleton runs `bun run src/cli.ts serve` from `OPENKLIP_APP_ROOT` (a repo
checkout). To ship, bundle the runtime **into the app** so it needs no repo:

- Bundle Bun + the built `.next` + the runtime `node_modules` subset + ffmpeg
  (`ffmpeg-static`, `@ffprobe-installer`) + the `.mjs` model scripts + assets
  (`graphics`/`templates`/`luts`/`brands`/`ingesters`/`tools`) into the app's
  `Resources`, as an `externalBin`/resource set.
- Point `OPENKLIP_APP_ROOT` at that Resources dir; `appRoot()` (CRAFT-6185)
  already resolves read-only assets from it.
- Relocate **writable** state to Application Support: `.openklip`
  (workspace root + integration keys) and the model cache (`OPENKLIP_MODEL_CACHE`),
  never inside the read-only app bundle or Caches.
- Sidecar hardening: kill the whole process group on exit (the `next start`
  grandchild currently orphans on hard-kill), single-instance lock, per-launch
  token between webview and sidecar (loopback trust guard already exists,
  CRAFT-6175).
- First-run: workspace picker with a `~/Movies/OpenKlip` default; resumable,
  checksummed model download that doesn't block reaching the editor.

### Stage C — sign / notarize / release [human-only final step]
Fully scripted; runs on the human's Developer ID. See
`docs/desktop-packaging-runbook.md`.
