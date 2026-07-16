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

use std::net::{TcpListener, TcpStream};
use std::os::unix::process::CommandExt;
use std::path::PathBuf;
use std::sync::Mutex;
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

/// Poll until the sidecar is accepting TCP connections (server bound its port).
fn wait_until_listening(port: u16, attempts: u32) -> bool {
    for _ in 0..attempts {
        if TcpStream::connect(("127.0.0.1", port)).is_ok() {
            return true;
        }
        std::thread::sleep(Duration::from_millis(300));
    }
    false
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

            let mut child = cmd.spawn().unwrap_or_else(|e| {
                panic!(
                    "failed to spawn the OpenKlip sidecar ({}): {e}",
                    if packaged { "packaged" } else { "dev" }
                )
            });
            let pid = child.id();
            // Reap in the background regardless of how the child ends up
            // exiting (normal exit, or killed via the group-kill in our own
            // exit handler below) — std::process::Child does not auto-wait
            // on drop, so an un-reaped exited child sits as a zombie
            // process-table entry until something calls wait().
            std::thread::spawn(move || {
                let _ = child.wait();
            });
            app.state::<SidecarState>().0.lock().unwrap().replace(pid);

            // Once the server is listening, swap the splash for the editor.
            let handle = app.handle().clone();
            let url = editor_url.clone();
            std::thread::spawn(move || {
                if wait_until_listening(port, 200) {
                    if let Ok(parsed) = url.parse::<Url>() {
                        if let Some(win) = handle.get_webview_window("main") {
                            let _ = win.navigate(parsed);
                        }
                    }
                } else {
                    eprintln!("[openklip-desktop] sidecar never became ready on port {port}");
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
