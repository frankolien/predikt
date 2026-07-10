use std::process::{Child, Command};
use std::sync::Mutex;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::Manager;

const KEYCHAIN_SERVICE: &str = "xyz.prediktt.app";

/// Store a secret (the wallet seed) in the OS keychain — macOS Keychain,
/// Windows Credential Manager, or libsecret. The seed never touches a server.
#[tauri::command]
fn keychain_set(key: String, value: String) -> Result<(), String> {
    keyring::Entry::new(KEYCHAIN_SERVICE, &key)
        .and_then(|e| e.set_password(&value))
        .map_err(|e| e.to_string())
}

/// Read a secret back from the OS keychain. Returns null if nothing is stored.
#[tauri::command]
fn keychain_get(key: String) -> Result<Option<String>, String> {
    let entry = keyring::Entry::new(KEYCHAIN_SERVICE, &key).map_err(|e| e.to_string())?;
    match entry.get_password() {
        Ok(v) => Ok(Some(v)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

/// Remove a secret from the OS keychain (sign-out). No-op if absent.
#[tauri::command]
fn keychain_delete(key: String) -> Result<(), String> {
    let entry = keyring::Entry::new(KEYCHAIN_SERVICE, &key).map_err(|e| e.to_string())?;
    match entry.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

/// Handle to the on-device AI sidecar so it can be shut down with the window.
struct Sidecar(Mutex<Option<Child>>);

/// The hosted backend the desktop client talks to for money + fixtures. The
/// sidecar mirrors this feed so its on-device AI reads the same fixtures (same
/// ids) the user is looking at — without shipping a data-provider key.
const RAILWAY_URL: &str = "https://glistening-reverence-production-c01a.up.railway.app";
/// The sidecar's localhost port — must match `AI_BASE` in the web client.
const SIDECAR_PORT: &str = "8799";

/// Spawn the local QVAC AI sidecar (on-device pundit + voice). Non-fatal: if it
/// can't start, the app still runs and the AI falls back to the hosted backend.
///
/// Packaged build: run the bundled Node runtime + esbuild'd sidecar (with the
/// pruned @qvac engines) from the app's resources. Dev build: run it from source
/// via `npm run sidecar` (tsx), which uses the repo `.env` for the live feed.
fn spawn_sidecar(app: &tauri::AppHandle) -> Option<Child> {
    if !cfg!(debug_assertions) {
        if let Ok(res) = app.path().resource_dir() {
            let dir = res.join("resources/sidecar");
            let node = dir.join("node");
            let entry = dir.join("sidecar.mjs");
            if node.exists() && entry.exists() {
                // Tauri's resource copy can drop the executable bit — restore it.
                #[cfg(unix)]
                {
                    use std::os::unix::fs::PermissionsExt;
                    let _ = std::fs::set_permissions(&node, std::fs::Permissions::from_mode(0o755));
                }
                return Command::new(&node)
                    .arg(&entry)
                    .current_dir(&dir)
                    .env("GAFFER_SIDECAR_PORT", SIDECAR_PORT)
                    .env("GAFFER_FIXTURES_URL", RAILWAY_URL)
                    .env("NODE_PATH", dir.join("node_modules"))
                    // Use our slim worker (llm+tts+whisper only) so the bundle
                    // can ship without the eight unused QVAC engines.
                    .env(
                        "QVAC_WORKER_PATH",
                        dir.join("node_modules/@qvac/sdk/dist/server/predikt-worker.js"),
                    )
                    .spawn()
                    .ok();
            }
        }
    }
    // Dev fallback: run the sidecar from source (uses .env for the live feed).
    let server_dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../server");
    Command::new("npm")
        .args(["run", "sidecar"])
        .current_dir(server_dir)
        .spawn()
        .ok()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .invoke_handler(tauri::generate_handler![
            keychain_set,
            keychain_get,
            keychain_delete
        ])
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            // Boot the on-device AI alongside the window.
            app.manage(Sidecar(Mutex::new(spawn_sidecar(app.handle()))));

            // Menu-bar tray: click the icon or "Open Predikt" to focus the window.
            let show = MenuItem::with_id(app, "show", "Open Predikt", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show, &quit])?;
            TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip("Predikt")
                .menu(&menu)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => {
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = w.show();
                            let _ = w.set_focus();
                        }
                    }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .build(app)?;
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                if let Some(state) = window.app_handle().try_state::<Sidecar>() {
                    if let Ok(mut guard) = state.0.lock() {
                        if let Some(mut child) = guard.take() {
                            let _ = child.kill();
                        }
                    }
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
