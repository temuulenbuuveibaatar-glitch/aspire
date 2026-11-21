// Aspire Desktop: the Aspire web app in a native window, plus a tray, a bundled settings page,
// a local AI brain (llama.cpp + Qwen2.5 1.5B), optional Claude / OpenAI, Hermes Agent and fast
// desktop actions the person approves one by one.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod brain;
mod desktop;
mod hermes;
mod local;
mod state;

use serde_json::{json, Value};
use state::{Shared, CLAUDE_KEY, LANGS, OPENAI_KEY};
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager, RunEvent, WebviewUrl, WebviewWindowBuilder, WindowEvent};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt};
use tauri_plugin_window_state::StateFlags;

fn show_main(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
    }
}

fn open_settings(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("settings") {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
        return;
    }
    let _ = WebviewWindowBuilder::new(app, "settings", WebviewUrl::App("index.html".into()))
        .title("Aspire Settings")
        .inner_size(560.0, 780.0)
        .min_inner_size(400.0, 480.0)
        .theme(Some(tauri::Theme::Dark))
        .build();
}

fn build_tray(app: &AppHandle) -> tauri::Result<()> {
    let show = MenuItem::with_id(app, "show", "Show Aspire", true, None::<&str>)?;
    let settings = MenuItem::with_id(app, "settings", "Settings", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit Aspire", true, None::<&str>)?;
    let sep = PredefinedMenuItem::separator(app)?;
    let menu = Menu::with_items(app, &[&show, &settings, &sep, &quit])?;
    let mut tray = TrayIconBuilder::with_id("aspire")
        .tooltip("Aspire")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, e| match e.id.as_ref() {
            "show" => show_main(app),
            "settings" => open_settings(app),
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, e| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = e {
                show_main(tray.app_handle());
            }
        });
    if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }
    tray.build(app)?;
    Ok(())
}

/// Everything the settings page shows. Never includes keys or the device token.
#[tauri::command]
fn app_status(app: AppHandle) -> Value {
    let st = app.state::<Shared>();
    let s = st.settings();
    json!({
        "version": app.package_info().version.to_string(),
        "lang": s.lang,
        "openaiModel": s.openai_model,
        "keys": { "claude": st.secret(CLAUDE_KEY).is_some(), "openai": st.secret(OPENAI_KEY).is_some() },
        "brain": brain::status(&app),
        "local": local::status(&app),
        "hermes": hermes::status(&app),
        "pairing": desktop::status(&app),
        "autostart": app.autolaunch().is_enabled().unwrap_or(false),
        "dataDir": st.data_dir,
    })
}

#[tauri::command]
fn set_autostart(app: AppHandle, enabled: bool) -> Result<bool, String> {
    let a = app.autolaunch();
    let changed = if enabled { a.enable() } else { a.disable() };
    changed.map_err(|e| e.to_string())?;
    a.is_enabled().map_err(|e| e.to_string())
}

#[tauri::command]
fn set_lang(app: AppHandle, lang: String) -> Result<(), String> {
    if !LANGS.contains(&lang.as_str()) {
        return Err("Unknown language.".into());
    }
    let st = app.state::<Shared>();
    let mut s = st.settings();
    s.lang = lang;
    st.save_settings(s)
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| show_main(app)))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, None))
        .plugin(
            tauri_plugin_window_state::Builder::default()
                .with_state_flags(StateFlags::SIZE | StateFlags::POSITION | StateFlags::MAXIMIZED)
                .with_denylist(&["settings"])
                .build(),
        )
        .setup(|app| {
            let shared = Shared::load(app.handle())?;
            let first_run = shared.settings().provider == "local" && !local::installed(&shared);
            app.manage(shared);
            build_tray(app.handle())?;
            tauri::async_runtime::spawn(local::warm(app.handle().clone()));
            tauri::async_runtime::spawn(desktop::poll_loop(app.handle().clone()));
            if first_run {
                open_settings(app.handle());
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            // Closing the main window keeps Aspire in the tray; Quit is in the tray menu.
            if let WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "main" {
                    let _ = window.hide();
                    api.prevent_close();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            app_status,
            set_autostart,
            set_lang,
            brain::brain_status,
            brain::brain_set,
            brain::brain_forget,
            brain::brain_chat,
            local::local_install,
            hermes::hermes_install,
            hermes::hermes_run,
            desktop::pair,
            desktop::unpair,
            desktop::pairing_status,
        ])
        .build(tauri::generate_context!())
        .expect("failed to start Aspire")
        .run(|app, event| match event {
            RunEvent::Exit => local::stop(app),
            #[cfg(target_os = "macos")]
            RunEvent::Reopen { .. } => show_main(app),
            _ => {}
        });
}
