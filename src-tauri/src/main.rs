// OpenKlip desktop shell (CRAFT-6187, walking skeleton).
//
// Spawns the existing OpenKlip production server (`openklip serve`, CRAFT-6185)
// as a sidecar on a private loopback port, shows an instant splash window, then
// navigates the window to the editor once the server is accepting connections.
// The sidecar is killed when the app exits so no orphaned Bun process is left.
//
// This skeleton spawns `bun run src/cli.ts serve` from OPENKLIP_APP_ROOT (the
// repo in dev). The packaged app will instead run a bundled Bun sidecar against
// the built server inside the app bundle (Stage B).
#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

use std::net::{TcpListener, TcpStream};
use std::process::{Child, Command};
use std::sync::Mutex;
use std::time::Duration;
use tauri::{Manager, RunEvent, Url};

/// Holds the sidecar child so the exit handler can terminate it.
struct SidecarState(Mutex<Option<Child>>);

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

fn main() {
    let port = pick_free_port();
    let slug = std::env::var("OPENKLIP_SLUG").unwrap_or_default();
    // App root: repo in dev; a Resources dir inside the bundle in Stage B.
    let app_root = std::env::var("OPENKLIP_APP_ROOT").unwrap_or_else(|_| ".".to_string());

    let editor_url = if slug.is_empty() {
        format!("http://127.0.0.1:{port}/")
    } else {
        format!("http://127.0.0.1:{port}/{slug}")
    };

    tauri::Builder::default()
        .manage(SidecarState(Mutex::new(None)))
        .setup(move |app| {
            // Spawn the Bun production server as a sidecar on the private port.
            let mut cmd = Command::new("bun");
            cmd.args(["run", "src/cli.ts", "serve"]);
            if !slug.is_empty() {
                cmd.arg(&slug);
            }
            cmd.current_dir(&app_root)
                .env("PORT", port.to_string())
                .env("OPENKLIP_APP_ROOT", &app_root);
            if let Ok(root) = std::env::var("OPENKLIP_PROJECTS_ROOT") {
                cmd.env("OPENKLIP_PROJECTS_ROOT", root);
            }
            let child = cmd.spawn().expect("failed to spawn the OpenKlip sidecar");
            app.state::<SidecarState>().0.lock().unwrap().replace(child);

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
                    eprintln!(
                        "[openklip-desktop] sidecar never became ready on port {port}"
                    );
                }
            });
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building the OpenKlip desktop app")
        .run(|handle, event| {
            if let RunEvent::Exit = event {
                if let Some(mut child) =
                    handle.state::<SidecarState>().0.lock().unwrap().take()
                {
                    let _ = child.kill();
                }
            }
        });
}
