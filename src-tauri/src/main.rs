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

use std::io::Read;
use std::net::{TcpListener, TcpStream};
use std::os::unix::process::CommandExt;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{Manager, RunEvent, Url};

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

fn main() {
    let port = pick_free_port();
    let slug = std::env::var("OPENKLIP_SLUG").unwrap_or_default();

    let editor_url = if slug.is_empty() {
        format!("http://127.0.0.1:{port}/")
    } else {
        format!("http://127.0.0.1:{port}/{slug}")
    };

    tauri::Builder::default()
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

            // Pipe stderr instead of inheriting it: launched from Finder,
            // inherited stderr goes nowhere, which is exactly how an
            // instantly-exiting engine used to leave the splash spinning
            // forever with zero diagnostics. The tee thread below echoes it
            // to our own stderr AND keeps a bounded tail to show on the
            // splash if the engine dies before becoming ready.
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
                std::thread::spawn(move || {
                    let mut buf = [0u8; 4096];
                    loop {
                        match err.read(&mut buf) {
                            Ok(0) | Err(_) => break,
                            Ok(n) => {
                                let chunk = String::from_utf8_lossy(&buf[..n]).into_owned();
                                eprint!("{chunk}");
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
                std::thread::spawn(move || {
                    let status = child.wait();
                    gone.store(true, Ordering::SeqCst);
                    if ready.load(Ordering::SeqCst) {
                        return;
                    }
                    // Give the reader up to ~1s to drain what the dead
                    // process left buffered in the pipe before snapshotting.
                    for _ in 0..20 {
                        if drained.load(Ordering::SeqCst) {
                            break;
                        }
                        std::thread::sleep(Duration::from_millis(50));
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
