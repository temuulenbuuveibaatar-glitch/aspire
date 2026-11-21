// App-wide state: settings (a small JSON file), secrets (OS keychain only, cached in memory),
// progress of downloads and installs, the local model process and the pairing status.
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::{Mutex, MutexGuard};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Manager};

pub const SERVICE: &str = "mn.aspire.desktop";
pub const SITE: &str = "https://aspire-mn.vercel.app";
pub const CLAUDE_KEY: &str = "claude_key";
pub const OPENAI_KEY: &str = "openai_key";
pub const DESKTOP_TOKEN: &str = "desktop_token";
pub const LANGS: [&str; 5] = ["mn", "zh", "en", "ru", "de"];

/// Locks a mutex even if a panic poisoned it: the data is plain state, still usable.
pub fn lock<T>(m: &Mutex<T>) -> MutexGuard<'_, T> {
    m.lock().unwrap_or_else(|e| e.into_inner())
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct Settings {
    /// "local" (Qwen2.5 1.5B on this computer), "claude" or "openai".
    pub provider: String,
    pub openai_model: String,
    pub device_name: Option<String>,
    /// UI and dialog language, one of LANGS, or empty until the settings page picks one.
    pub lang: String,
    /// A random tag for the device name when the computer has no usable name.
    pub machine_tag: String,
    /// What the remote page spent today on a Claude or OpenAI key: (UTC day number, calls, characters).
    pub remote_spend: (u64, u32, u64),
}

impl Default for Settings {
    fn default() -> Self {
        Self { provider: "local".into(), openai_model: "gpt-5-mini".into(), device_name: None, lang: String::new(), machine_tag: String::new(), remote_spend: (0, 0, 0) }
    }
}

#[derive(Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Progress {
    pub running: bool,
    /// A short code the settings page translates (server, model, verify, extract, starting, ready, ...).
    pub step: String,
    pub done: u64,
    pub total: u64,
    pub error: Option<String>,
    pub note: Option<String>,
}

pub struct Shared {
    pub data_dir: PathBuf,
    pub http: reqwest::Client,
    /// For 127.0.0.1 only: never goes through a proxy.
    pub local_http: reqwest::Client,
    pub settings: Mutex<Settings>,
    secrets: Mutex<HashMap<&'static str, String>>,
    pub local_progress: Mutex<Progress>,
    pub hermes_progress: Mutex<Progress>,
    pub llama: Mutex<Option<crate::local::Llama>>,
    pub llama_start: tokio::sync::Mutex<()>,
    pub pairing: Mutex<crate::desktop::PairState>,
    pub hermes_busy: AtomicBool,
    /// Held while an Allow / Deny window is open, so only one is ever open (see confirm.rs).
    pub prompt_gate: tokio::sync::Mutex<()>,
    /// The open Allow / Deny window, by id (see confirm.rs).
    pub prompts: Mutex<HashMap<u32, crate::confirm::Prompt>>,
    pub next_prompt: AtomicU32,
    /// brain_chat from the remote page: one call at a time, a limited number per minute.
    pub chat_busy: AtomicBool,
    pub chat_rate: Mutex<(Instant, u32)>,
    /// Open-a-page-or-app requests from the remote page: one at a time, limited per minute.
    pub bridge: Slot,
    /// Links and popups from any frame in the main window: a separate limit, so third-party
    /// frames cannot use up the page's own.
    pub popups: Slot,
}

/// One request at a time and a number per minute.
#[derive(Default)]
pub struct Slot {
    busy: AtomicBool,
    rate: Mutex<Option<(Instant, u32)>>,
}

impl Slot {
    pub fn take(&self, per_minute: u32) -> Option<Busy<'_>> {
        let mut rate = lock(&self.rate);
        let (start, n) = (*rate).filter(|r| r.0.elapsed() < Duration::from_secs(60)).unwrap_or((Instant::now(), 0));
        if n >= per_minute {
            return None;
        }
        let busy = Busy::take(&self.busy)?;
        *rate = Some((start, n + 1));
        Some(busy)
    }
}

/// Clears a busy flag when dropped, so an error or a panic never leaves it set.
pub struct Busy<'a>(&'a AtomicBool);

impl<'a> Busy<'a> {
    /// None when the flag is already set.
    pub fn take(flag: &'a AtomicBool) -> Option<Self> {
        (!flag.swap(true, Ordering::SeqCst)).then_some(Self(flag))
    }
}

impl Drop for Busy<'_> {
    fn drop(&mut self) {
        self.0.store(false, Ordering::SeqCst);
    }
}

impl Shared {
    pub fn load(app: &AppHandle) -> Result<Self, String> {
        let data_dir = app.path().app_local_data_dir().map_err(|e| e.to_string())?;
        std::fs::create_dir_all(&data_dir).map_err(|e| e.to_string())?;
        let settings = std::fs::read(data_dir.join("settings.json"))
            .ok()
            .and_then(|b| serde_json::from_slice(&b).ok())
            .unwrap_or_default();
        let mut secrets = HashMap::new();
        for name in [CLAUDE_KEY, OPENAI_KEY, DESKTOP_TOKEN] {
            if let Ok(v) = keyring::Entry::new(SERVICE, name).and_then(|e| e.get_password()) {
                secrets.insert(name, v);
            }
        }
        let http = reqwest::Client::builder()
            .user_agent(concat!("AspireDesktop/", env!("CARGO_PKG_VERSION")))
            .connect_timeout(Duration::from_secs(20))
            .build()
            .map_err(|e| e.to_string())?;
        let local_http = reqwest::Client::builder().no_proxy().build().map_err(|e| e.to_string())?;
        Ok(Self {
            data_dir,
            http,
            local_http,
            settings: Mutex::new(settings),
            secrets: Mutex::new(secrets),
            local_progress: Mutex::default(),
            hermes_progress: Mutex::default(),
            llama: Mutex::new(None),
            llama_start: tokio::sync::Mutex::new(()),
            pairing: Mutex::default(),
            hermes_busy: AtomicBool::new(false),
            prompt_gate: tokio::sync::Mutex::new(()),
            prompts: Mutex::default(),
            next_prompt: AtomicU32::new(1),
            chat_busy: AtomicBool::new(false),
            chat_rate: Mutex::new((Instant::now(), 0)),
            bridge: Slot::default(),
            popups: Slot::default(),
        })
    }

    pub fn settings(&self) -> Settings {
        lock(&self.settings).clone()
    }

    pub fn save_settings(&self, s: Settings) -> Result<(), String> {
        let json = serde_json::to_vec_pretty(&s).map_err(|e| e.to_string())?;
        std::fs::write(self.data_dir.join("settings.json"), json).map_err(|e| e.to_string())?;
        *lock(&self.settings) = s;
        Ok(())
    }

    pub fn secret(&self, name: &str) -> Option<String> {
        lock(&self.secrets).get(name).cloned()
    }

    /// Stores a secret in the OS keychain (Windows Credential Manager, macOS Keychain).
    pub fn set_secret(&self, name: &'static str, value: &str) -> Result<(), String> {
        keyring::Entry::new(SERVICE, name)
            .and_then(|e| e.set_password(value))
            .map_err(|_| "Could not save to the system keychain.".to_string())?;
        lock(&self.secrets).insert(name, value.to_string());
        Ok(())
    }

    pub fn clear_secret(&self, name: &'static str) {
        if let Ok(e) = keyring::Entry::new(SERVICE, name) {
            let _ = e.delete_credential();
        }
        lock(&self.secrets).remove(name);
    }
}
