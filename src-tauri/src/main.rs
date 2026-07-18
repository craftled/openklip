// OpenKlip desktop shell (CRAFT-6187).
//
// Spawns the existing OpenKlip production server (`openklip serve`, CRAFT-6185)
// as a sidecar on a private loopback port, shows an instant splash window, then
// navigates the window to the editor once the server is accepting connections.
// The sidecar (and its own `next start` grandchild — see src/cli.ts) is killed
// as a whole process group when the app exits, so nothing is left orphaned.
//
// Two runtime modes, auto-detected (never a compile-time flag, so a stray
// build config can't silently mismatch what's actually on disk):
//   - PACKAGED: a real `tauri build`/`tauri build --debug` bundled
//     `resources/app` (the full runtime tree — see
//     scripts/prepare-desktop-bundle.ts) into the app's Resources dir, and a
//     bundled Bun binary (tauri.conf.json's `bundle.externalBin`, vendored
//     per-target under src-tauri/binaries/) next to this executable —
//     macOS's externalBin convention places it at Contents/MacOS/bun,
//     confirmed empirically. Detected by BOTH the resources dir and the
//     sidecar binary actually existing on disk.
//   - DEV: a raw `cargo build`/`cargo run` with no bundled resources. Spawns
//     `bun` from PATH against OPENKLIP_APP_ROOT (or cwd) exactly like the
//     original walking skeleton.
//
// Both paths spawn via plain std::process::Command with `.process_group(0)`
// (atomic, pre-exec — sets pgid = the child's own pid at fork time). An
// earlier version tried tauri-plugin-shell's Command::sidecar() for the
// packaged path, which has no equivalent pre-exec option; a RETROACTIVE
// setpgid() after spawn() returns was tried and empirically found to
// silently fail 100% of the time (not just as a rare race): POSIX only
// allows a parent to change a child's process group before that child has
// exec'd, and spawn()/fork()+exec() completes long before Rust code can
// react. Verified via `open`-launched real .app + AppleEvent quit: the
// bundled `next start` grandchild survived as an orphan under the old
// approach, and is correctly reaped under this one. Unifying onto std's
// Command (which DOES expose the atomic option) for both paths avoids the
// whole problem rather than working around it.
#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

use std::fs::{self, File, OpenOptions};
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::os::unix::process::CommandExt;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{Manager, RunEvent, Url};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons};
use tauri_plugin_updater::UpdaterExt;

/// Base filename for the sidecar's tee'd log, under `app.path().app_log_dir()`
/// (`~/Library/Logs/com.craftled.openklip/` on macOS). Findable, persistent
/// diagnostics for a Finder-launched app with no attached terminal — the
/// privacy-respecting alternative to telemetry: everything stays on local
/// disk, nothing phones home.
const LOG_FILE_NAME: &str = "openklip-engine.log";

/// Resolve (and create) the OS log directory for this run. Best-effort: any
/// failure (permission denied, resolver error on an unusual platform, etc.)
/// returns `None` and the caller silently skips file logging rather than
/// panicking — a missing log file must never block the app from launching.
fn resolve_log_dir(app: &tauri::App) -> Option<PathBuf> {
    let dir = app.path().app_log_dir().ok()?;
    fs::create_dir_all(&dir).ok()?;
    Some(dir)
}

/// Append `suffix` to the log file's name (not extension: `with_extension`
/// would clobber the existing `.log`, giving `openklip-engine.1` instead of
/// the intended `openklip-engine.log.1`).
fn sibling_log_path(log_path: &Path, suffix: &str) -> PathBuf {
    let mut name = log_path.file_name().unwrap_or_default().to_os_string();
    name.push(suffix);
    log_path.with_file_name(name)
}

/// Rotate the previous run's log before opening a fresh one for this run:
/// `.log.1` -> `.log.2` -> gone, `.log` -> `.log.1`. Keeps the last two runs
/// without pulling in a rotation crate. Best-effort: a failed rename just
/// means the old log is lost, never a reason to fail startup.
fn rotate_log(log_path: &Path) {
    let gen1 = sibling_log_path(log_path, ".1");
    let gen2 = sibling_log_path(log_path, ".2");
    let _ = fs::remove_file(&gen2);
    let _ = fs::rename(&gen1, &gen2);
    let _ = fs::rename(log_path, &gen1);
}

/// Delete any previously retained crash log(s) so retention stays bounded to
/// the single most recent crash, then copy the current (already-flushed) log
/// file to `openklip-engine.crash-<exitcode>.log` so a failing run's log
/// survives the next launch's rotation. Best-effort throughout.
fn retain_crash_log(log_dir: &Path, log_path: &Path, exit_label: &str) {
    if let Ok(entries) = fs::read_dir(log_dir) {
        for entry in entries.flatten() {
            let name = entry.file_name();
            let name = name.to_string_lossy();
            if name.starts_with("openklip-engine.crash-") && name.ends_with(".log") {
                let _ = fs::remove_file(entry.path());
            }
        }
    }
    let crash_path = log_dir.join(format!("openklip-engine.crash-{exit_label}.log"));
    let _ = fs::copy(log_path, crash_path);
}

/// Append a chunk of tee'd sidecar output to the shared log file, when one
/// was successfully opened. Flushed immediately so a subsequent crash
/// doesn't lose the tail sitting in a userspace write buffer.
fn append_to_log(log_file: &Arc<Mutex<Option<File>>>, chunk: &str) {
    let Ok(mut guard) = log_file.lock() else {
        return;
    };
    let Some(file) = guard.as_mut() else {
        return;
    };
    let _ = file.write_all(chunk.as_bytes());
    let _ = file.flush();
}

/// Holds the sidecar's pid so the exit handler can terminate its whole
/// process group (negative pid addresses the group, not just the one
/// process) — reaches `bun` and the `next start` grandchild it spawns,
/// since `.process_group(0)` at spawn gives pgid == the child's own pid.
struct SidecarState(Mutex<Option<u32>>);

fn kill_process_group(pid: u32) {
    // SAFETY: kill(2) with a plain integer signal/pid is not memory-unsafe;
    // failure (e.g. ESRCH if it already exited) is intentionally ignored,
    // this is best-effort teardown on app exit.
    unsafe {
        libc::kill(-(pid as libc::pid_t), libc::SIGKILL);
    }
}

/// Ask the OS for a free loopback port (bind :0, read it back, drop).
fn pick_free_port() -> u16 {
    TcpListener::bind("127.0.0.1:0")
        .and_then(|l| l.local_addr())
        .map(|a| a.port())
        .unwrap_or(4399)
}

/// Poll until the sidecar is accepting TCP connections (server bound its
/// port), bailing out early if the sidecar process already exited (`gone`) —
/// a dead engine will never bind, so waiting out the full budget just leaves
/// the user staring at the splash spinner.
fn wait_until_listening(port: u16, attempts: u32, gone: &AtomicBool) -> bool {
    for _ in 0..attempts {
        if TcpStream::connect(("127.0.0.1", port)).is_ok() {
            return true;
        }
        if gone.load(Ordering::SeqCst) {
            return false;
        }
        std::thread::sleep(Duration::from_millis(300));
    }
    false
}

/// Replace the splash's spinner/status with a visible failure message (plus
/// the sidecar's captured stderr tail, when there is one). The splash page is
/// ours (src-tauri/loading/index.html), so driving it with a snippet of eval'd
/// JS is safe; all interpolated text goes through serde_json string encoding.
fn show_splash_error(handle: &tauri::AppHandle, message: &str, detail: &str) {
    eprintln!("[openklip-desktop] {message}");
    let Some(win) = handle.get_webview_window("main") else {
        return;
    };
    let js = format!(
        "(function() {{\
           document.body.classList.add('engine-error');\
           var sp = document.querySelector('.spinner'); if (sp) sp.remove();\
           var s = document.querySelector('.status');\
           if (s) {{ s.textContent = {msg}; }}\
           var detail = {detail};\
           if (detail && !document.querySelector('.engine-error-detail')) {{\
             var d = document.createElement('pre');\
             d.className = 'engine-error-detail';\
             d.textContent = detail;\
             d.style.cssText = 'margin:16px auto 0;max-width:540px;max-height:220px;overflow:auto;text-align:left;white-space:pre-wrap;font:11px/1.4 ui-monospace,monospace;color:#9aa0a6;';\
             var w = document.querySelector('.wrap'); if (w) w.appendChild(d);\
           }}\
         }})();",
        msg = serde_json::to_string(message).unwrap_or_else(|_| "\"engine failed\"".into()),
        detail = serde_json::to_string(detail.trim()).unwrap_or_else(|_| "\"\"".into()),
    );
    let _ = win.eval(&js);
}

/// The bundled runtime tree's root, if `tauri build` actually populated it
/// (see scripts/prepare-desktop-bundle.ts + tauri.conf.json's
/// `bundle.resources` mapping `resources/app` -> `app`). `None` in dev.
fn packaged_app_root(app: &tauri::App) -> Option<PathBuf> {
    let dir = app.path().resource_dir().ok()?.join("app");
    dir.join("src").join("cli.ts").exists().then_some(dir)
}

/// The bundled `bun` sidecar binary, if `tauri build` placed one (macOS
/// externalBin convention: same directory as this executable). `None` in dev.
fn bundled_bun_path() -> Option<PathBuf> {
    let exe = std::env::current_exe().ok()?;
    let candidate = exe.parent()?.join("bun");
    candidate.exists().then_some(candidate)
}

/// Resolves (bun binary to run, app root to run it against, whether this is
/// the packaged runtime). Packaged only when BOTH the bundled binary and the
/// bundled resource tree are present; any partial/mismatched build state
/// falls back to dev (PATH bun, OPENKLIP_APP_ROOT/cwd) rather than half-using
/// a broken packaged layout.
fn resolve_runtime(app: &tauri::App) -> (PathBuf, PathBuf, bool) {
    if let (Some(bun), Some(app_root)) = (bundled_bun_path(), packaged_app_root(app)) {
        return (bun, app_root, true);
    }
    let app_root = std::env::var("OPENKLIP_APP_ROOT").unwrap_or_else(|_| ".".to_string());
    (PathBuf::from("bun"), PathBuf::from(app_root), false)
}

/// Check the GitHub Releases feed for a newer version shortly after launch, and
/// on the user's confirmation download + install it, then relaunch. Entirely
/// Rust-driven (the webview loads a remote localhost URL, so there is no JS
/// updater to call) and entirely best-effort: no feed published yet, offline,
/// or a malformed manifest are all logged and ignored — never a crash, never a
/// blocked launch. The install/relaunch branch only runs when the feed actually
/// carries a signed update (see docs/desktop-packaging-runbook.md for how a
/// release publishes `latest.json` + the signed artifact), so it stays dormant
/// until then.
fn spawn_update_check(handle: tauri::AppHandle) {
    std::thread::spawn(move || {
        // Let the editor finish loading before any prompt could interrupt.
        std::thread::sleep(Duration::from_secs(4));
        tauri::async_runtime::block_on(async move {
            let updater = match handle.updater() {
                Ok(u) => u,
                Err(e) => {
                    eprintln!("[openklip-desktop] updater unavailable: {e}");
                    return;
                }
            };
            match updater.check().await {
                Ok(Some(update)) => {
                    let version = update.version.clone();
                    let confirmed = handle
                        .dialog()
                        .message(format!(
                            "OpenKlip {version} is available. Download and install it now? OpenKlip will restart."
                        ))
                        .title("Update available")
                        .buttons(MessageDialogButtons::OkCancelCustom(
                            "Update".to_string(),
                            "Later".to_string(),
                        ))
                        .blocking_show();
                    if !confirmed {
                        return;
                    }
                    match update.download_and_install(|_chunk, _total| {}, || {}).await {
                        Ok(_) => handle.restart(),
                        Err(e) => eprintln!("[openklip-desktop] update install failed: {e}"),
                    }
                }
                Ok(None) => eprintln!("[openklip-desktop] up to date"),
                Err(e) => eprintln!("[openklip-desktop] update check skipped: {e}"),
            }
        });
    });
}

fn main() {
    let port = pick_free_port();
    let slug = std::env::var("OPENKLIP_SLUG").unwrap_or_default();

    let editor_url = if slug.is_empty() {
        format!("http://127.0.0.1:{port}/")
    } else {
        format!("http://127.0.0.1:{port}/{slug}")
    };

    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .manage(SidecarState(Mutex::new(None)))
        .setup(move |app| {
            let projects_root = std::env::var("OPENKLIP_PROJECTS_ROOT").ok();
            let cli_args: Vec<String> = if slug.is_empty() {
                vec!["run".into(), "src/cli.ts".into(), "serve".into()]
            } else {
                vec![
                    "run".into(),
                    "src/cli.ts".into(),
                    "serve".into(),
                    slug.clone(),
                ]
            };

            let (bun_path, app_root, packaged) = resolve_runtime(app);
            let mut cmd = std::process::Command::new(&bun_path);
            cmd.args(&cli_args)
                .current_dir(&app_root)
                .env("PORT", port.to_string())
                .env("OPENKLIP_APP_ROOT", &app_root)
                // Atomic, race-free: sets pgid = the new child's own pid at
                // fork time, before exec runs (see the module doc comment
                // for why this must be pre-exec, not a retroactive setpgid).
                .process_group(0);
            if let Some(root) = &projects_root {
                cmd.env("OPENKLIP_PROJECTS_ROOT", root);
            }
            if packaged {
                // Writable state lives in OS-standard locations, never
                // inside the read-only app bundle: workspace root +
                // integration provider keys in Application Support
                // (stateDir(), CRAFT-6187 Stage B); the Whisper/CLIP model
                // download cache in Caches (OPENKLIP_MODEL_CACHE, already
                // consumed by src/model-env.mjs since CRAFT-6243). Dev mode
                // deliberately keeps the old cwd-relative behavior.
                if let Ok(config_dir) = app.path().app_config_dir() {
                    cmd.env("OPENKLIP_STATE_DIR", &config_dir);
                }
                if let Ok(cache_dir) = app.path().app_cache_dir() {
                    cmd.env("OPENKLIP_MODEL_CACHE", cache_dir.join("models"));
                }
            }

            // Resolve the findable on-disk log before spawning: rotate the
            // previous run's file out of the way, then open a fresh one.
            // Best-effort throughout (resolve_log_dir already swallows
            // errors) so an unwritable log dir never blocks launch, it just
            // means this run has no file logging.
            let log_dir = resolve_log_dir(app);
            let log_path = log_dir.as_ref().map(|dir| dir.join(LOG_FILE_NAME));
            if let Some(path) = &log_path {
                rotate_log(path);
            }
            let log_file: Arc<Mutex<Option<File>>> = Arc::new(Mutex::new(
                log_path
                    .as_ref()
                    .and_then(|path| OpenOptions::new().create(true).append(true).open(path).ok()),
            ));
            append_to_log(
                &log_file,
                &format!("[openklip-desktop] engine starting, port={port}, packaged={packaged}\n"),
            );

            // Pipe stdout and stderr instead of inheriting them: launched
            // from Finder, inherited streams go nowhere, which is exactly
            // how an instantly-exiting engine used to leave the splash
            // spinning forever with zero diagnostics. The tee threads below
            // echo each stream to our own stdout/stderr AND append it to the
            // log file opened above; the stderr thread additionally keeps a
            // bounded tail to show on the splash if the engine dies before
            // becoming ready.
            cmd.stdout(std::process::Stdio::piped());
            cmd.stderr(std::process::Stdio::piped());

            let mut child = cmd.spawn().unwrap_or_else(|e| {
                panic!(
                    "failed to spawn the OpenKlip sidecar ({}): {e}",
                    if packaged { "packaged" } else { "dev" }
                )
            });
            let pid = child.id();
            app.state::<SidecarState>().0.lock().unwrap().replace(pid);

            let ready = Arc::new(AtomicBool::new(false));
            let sidecar_gone = Arc::new(AtomicBool::new(false));
            let stderr_tail = Arc::new(Mutex::new(String::new()));
            // Set once the reader thread has drained the pipe to EOF. The
            // child-wait thread below polls this (bounded) before it
            // snapshots the tail: child.wait() returns the moment the
            // process dies, which can beat the reader to the last buffered
            // stderr — exactly the bytes that say WHY a fast-failing engine
            // died. A bounded wait (not a join) because the `next start`
            // grandchild inherits the write end of this pipe, so EOF may
            // never come while it lives.
            let stderr_done = Arc::new(AtomicBool::new(child.stderr.is_none()));

            if let Some(mut err) = child.stderr.take() {
                let tail = Arc::clone(&stderr_tail);
                let done = Arc::clone(&stderr_done);
                let log_file = Arc::clone(&log_file);
                std::thread::spawn(move || {
                    let mut buf = [0u8; 4096];
                    loop {
                        match err.read(&mut buf) {
                            Ok(0) | Err(_) => break,
                            Ok(n) => {
                                let chunk = String::from_utf8_lossy(&buf[..n]).into_owned();
                                eprint!("{chunk}");
                                append_to_log(&log_file, &chunk);
                                let mut t = tail.lock().unwrap();
                                t.push_str(&chunk);
                                if t.len() > 4000 {
                                    let mut cut = t.len() - 4000;
                                    while !t.is_char_boundary(cut) {
                                        cut += 1;
                                    }
                                    t.replace_range(..cut, "");
                                }
                            }
                        }
                    }
                    done.store(true, Ordering::SeqCst);
                });
            }

            // Symmetric stdout tee: no error-splash tail needed (that's
            // stderr's job, matching src/logger.ts writing there), just echo
            // to our own stdout and append to the same log file so the
            // engine's stdout (e.g. the `next start` banner) ends up in one
            // place alongside stderr.
            if let Some(mut out) = child.stdout.take() {
                let log_file = Arc::clone(&log_file);
                std::thread::spawn(move || {
                    let mut buf = [0u8; 4096];
                    loop {
                        match out.read(&mut buf) {
                            Ok(0) | Err(_) => break,
                            Ok(n) => {
                                let chunk = String::from_utf8_lossy(&buf[..n]).into_owned();
                                print!("{chunk}");
                                append_to_log(&log_file, &chunk);
                            }
                        }
                    }
                });
            }

            // Reap in the background regardless of how the child ends up
            // exiting (normal exit, or killed via the group-kill in our own
            // exit handler below) — std::process::Child does not auto-wait
            // on drop, so an un-reaped exited child sits as a zombie
            // process-table entry until something calls wait(). If it exits
            // BEFORE the server ever became ready, that's a startup failure:
            // surface it on the splash instead of spinning forever.
            {
                let handle = app.handle().clone();
                let ready = Arc::clone(&ready);
                let gone = Arc::clone(&sidecar_gone);
                let tail = Arc::clone(&stderr_tail);
                let drained = Arc::clone(&stderr_done);
                let log_dir = log_dir.clone();
                let log_path = log_path.clone();
                std::thread::spawn(move || {
                    let status = child.wait();
                    gone.store(true, Ordering::SeqCst);
                    let was_ready = ready.load(Ordering::SeqCst);
                    let exit_ok = status.as_ref().map(|s| s.success()).unwrap_or(true);

                    // A crash is either dying before ever becoming ready, or
                    // a non-zero exit at any point (including after ready,
                    // e.g. the engine dies mid-session). Either way, retain
                    // this run's log distinctly so it survives the next
                    // launch's rotation, purely local, no telemetry.
                    if !was_ready || !exit_ok {
                        // Give the readers up to ~1s to drain what the dead
                        // process left buffered in the pipes before
                        // snapshotting/copying.
                        for _ in 0..20 {
                            if drained.load(Ordering::SeqCst) {
                                break;
                            }
                            std::thread::sleep(Duration::from_millis(50));
                        }
                        if let (Some(dir), Some(path)) = (&log_dir, &log_path) {
                            let label = status
                                .as_ref()
                                .ok()
                                .and_then(|s| s.code())
                                .map(|c| c.to_string())
                                .unwrap_or_else(|| "unknown".into());
                            retain_crash_log(dir, path, &label);
                        }
                    }

                    if was_ready {
                        return;
                    }
                    let code = status
                        .ok()
                        .and_then(|s| s.code())
                        .map(|c| format!(" (exit {c})"))
                        .unwrap_or_default();
                    let detail = tail.lock().unwrap().clone();
                    show_splash_error(
                        &handle,
                        &format!("The local engine stopped before it became ready{code}."),
                        &detail,
                    );
                });
            }

            // Once the server is listening, swap the splash for the editor.
            let handle = app.handle().clone();
            let url = editor_url.clone();
            std::thread::spawn(move || {
                if wait_until_listening(port, 200, &sidecar_gone) {
                    ready.store(true, Ordering::SeqCst);
                    if let Ok(parsed) = url.parse::<Url>() {
                        if let Some(win) = handle.get_webview_window("main") {
                            let _ = win.navigate(parsed);
                        }
                    }
                } else if !sidecar_gone.load(Ordering::SeqCst) {
                    // Still running but never bound the port within the
                    // budget (~60s). The exit path above owns the message
                    // when the process died; this covers a live-but-stuck
                    // engine.
                    show_splash_error(
                        &handle,
                        &format!("The local engine never became ready on port {port}."),
                        &stderr_tail.lock().unwrap().clone(),
                    );
                }
            });

            // Auto-update check (CRAFT-6266): dormant until a release publishes
            // a signed feed; a no-op/logged skip otherwise.
            spawn_update_check(app.handle().clone());
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building the OpenKlip desktop app")
        .run(|handle, event| {
            if let RunEvent::Exit = event {
                if let Some(pid) = handle.state::<SidecarState>().0.lock().unwrap().take() {
                    kill_process_group(pid);
                }
            }
        });
}
