// Aspire Desktop: the Aspire web app in a native window, plus a tray, a bundled settings page,
// a local AI brain (llama.cpp + Qwen2.5 1.5B), optional Claude / OpenAI, Hermes Agent and fast
// desktop actions the person approves one by one.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod brain;
mod confirm;
mod desktop;
mod hermes;
mod local;
mod state;

use serde_json::{json, Value};
use state::{Shared, CLAUDE_KEY, LANGS, OPENAI_KEY, SITE};
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::webview::NewWindowResponse;
use tauri::{AppHandle, Manager, RunEvent, Url, WebviewUrl, WebviewWindowBuilder, WindowEvent};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt};
use tauri_plugin_opener::OpenerExt;
use tauri_plugin_window_state::StateFlags;

const AUTOSTART_ARG: &str = "--autostart";

/// Pages that may load inside the main window: Aspire itself, sign-in (Clerk, Google, Apple,
/// Cloudflare's bot check) and the players Aspire embeds. Everything else opens in the browser.
/// On macOS this check also sees iframes, hence the embed hosts.
fn in_app(u: &Url) -> bool {
    const HOSTS: [&str; 8] = [
        "aspire-mn.vercel.app",
        "accounts.google.com",
        "appleid.apple.com",
        "challenges.cloudflare.com",
        "www.youtube-nocookie.com",
        "www.youtube.com",
        "open.spotify.com",
        "dedtuv.erdenet.mn",
    ];
    match u.scheme() {
        "about" | "blob" | "data" => true,
        "https" => {
            let h = u.host_str().unwrap_or("");
            HOSTS.contains(&h) || h.ends_with(".clerk.accounts.dev") || h.ends_with(".accounts.dev") || h.starts_with("clerk.")
        }
        _ => false,
    }
}

/// Opens a link from the Aspire page in the person's browser (https and mail links only).
fn open_outside(app: &AppHandle, u: &Url) {
    if matches!(u.scheme(), "https" | "mailto") {
        let _ = app.opener().open_url(u.as_str(), None::<&str>);
    }
}

/// The Aspire web app. Built here, not in tauri.conf.json, to limit where it can navigate.
fn build_main(app: &AppHandle, visible: bool) -> tauri::Result<()> {
    let (nav, popup) = (app.clone(), app.clone());
    let b = WebviewWindowBuilder::new(app, "main", WebviewUrl::External(SITE.parse().expect("SITE is a URL")))
        .title("Aspire")
        .inner_size(1200.0, 800.0)
        .min_inner_size(400.0, 560.0)
        .center()
        .theme(Some(tauri::Theme::Dark))
        .background_color(tauri::webview::Color(7, 11, 18, 255))
        .visible(visible)
        .on_navigation(move |u| {
            let ok = in_app(u);
            // Windows reports only top-level navigations here, so a link the person followed;
            // macOS also reports iframes, which must not open browser tabs.
            if !ok && cfg!(windows) {
                open_outside(&nav, u);
            }
            ok
        })
        .on_new_window(move |u, _| {
            open_outside(&popup, &u);
            NewWindowResponse::Deny
        });
    // WKWebView's default user agent has no Safari version, and Google refuses sign-in then.
    #[cfg(target_os = "macos")]
    let b = b.user_agent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15");
    b.build()?;
    Ok(())
}

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
        .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, Some(vec![AUTOSTART_ARG])))
        .plugin(
            tauri_plugin_window_state::Builder::default()
                .with_state_flags(StateFlags::SIZE | StateFlags::POSITION | StateFlags::MAXIMIZED)
                .with_denylist(&["settings"])
                .build(),
        )
        .setup(|app| {
            let shared = Shared::load(app.handle())?;
            let first_run = shared.settings().provider == "local" && !local::installed(&shared);
            local::kill_stale(&shared);
            app.manage(shared);
            // Run at login starts quietly in the tray.
            let autostarted = std::env::args().any(|a| a == AUTOSTART_ARG);
            build_main(app.handle(), !autostarted)?;
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
            confirm::confirm_info,
            confirm::confirm_answer,
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
