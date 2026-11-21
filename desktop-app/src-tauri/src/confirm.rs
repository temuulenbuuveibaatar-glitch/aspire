// The Allow / Deny window for desktop jobs and Hermes tasks. It is a small bundled page rather
// than a native message box, so the whole text is always shown (it scrolls, nothing is cut),
// Deny is the default button (Enter or Space while typing elsewhere denies), Allow works only
// after ALLOW_DELAY, it stays on top, and an unanswered prompt is denied at its deadline.
// The page can only read and answer its own prompt: the id comes from the window label.
use crate::desktop::words;
use crate::state::{lock, Shared};
use serde_json::{json, Value};
use std::sync::atomic::Ordering;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Manager, UserAttentionType, WebviewUrl, WebviewWindow, WebviewWindowBuilder, WindowEvent};

const ALLOW_DELAY: Duration = Duration::from_millis(1500);

pub struct Prompt {
    text: String,
    shown: Instant,
    reply: tokio::sync::oneshot::Sender<bool>,
}

fn id_of(w: &WebviewWindow) -> Option<u32> {
    w.label().strip_prefix("confirm-")?.parse().ok()
}

/// Shows `text` and waits: true on Allow; false on Deny, on closing the window or at `deadline`.
pub async fn confirm(app: &AppHandle, text: &str, deadline: Instant) -> bool {
    let st = app.state::<Shared>();
    let id = st.next_prompt.fetch_add(1, Ordering::Relaxed);
    let (tx, rx) = tokio::sync::oneshot::channel();
    lock(&st.prompts).insert(id, Prompt { text: text.to_string(), shown: Instant::now(), reply: tx });
    let built = WebviewWindowBuilder::new(app, format!("confirm-{id}"), WebviewUrl::App("confirm.html".into()))
        .title(words(&st.settings().lang).title)
        .inner_size(540.0, 480.0)
        .min_inner_size(380.0, 320.0)
        .center()
        .always_on_top(true)
        .focused(true)
        .theme(Some(tauri::Theme::Dark))
        .build();
    let Ok(win) = built else {
        lock(&st.prompts).remove(&id);
        return false;
    };
    let h = app.clone();
    win.on_window_event(move |e| {
        if let WindowEvent::Destroyed = e {
            // Dropping the sender answers false.
            lock(&h.state::<Shared>().prompts).remove(&id);
        }
    });
    let _ = win.set_focus();
    let _ = win.request_user_attention(Some(UserAttentionType::Critical));
    let left = deadline.saturating_duration_since(Instant::now());
    let allowed = matches!(tokio::time::timeout(left, rx).await, Ok(Ok(true)));
    lock(&st.prompts).remove(&id);
    let _ = win.destroy();
    allowed
}

/// For confirm.html: the text and button labels of this window's prompt.
#[tauri::command]
pub fn confirm_info(window: WebviewWindow) -> Result<Value, String> {
    let st = window.state::<Shared>();
    let id = id_of(&window).ok_or("No prompt.")?;
    let text = lock(&st.prompts).get(&id).map(|p| p.text.clone()).ok_or("No prompt.")?;
    let lang = st.settings().lang;
    let w = words(&lang);
    Ok(json!({ "lang": lang, "title": w.title, "text": text, "allow": w.allow, "deny": w.deny, "delayMs": ALLOW_DELAY.as_millis() as u64 }))
}

/// For confirm.html: the person's answer. Allow is refused before ALLOW_DELAY has passed.
#[tauri::command]
pub fn confirm_answer(window: WebviewWindow, allow: bool) -> Result<(), String> {
    let st = window.state::<Shared>();
    let id = id_of(&window).ok_or("No prompt.")?;
    {
        let mut prompts = lock(&st.prompts);
        if allow && prompts.get(&id).is_some_and(|p| p.shown.elapsed() < ALLOW_DELAY) {
            return Err("Too soon.".into());
        }
        if let Some(p) = prompts.remove(&id) {
            let _ = p.reply.send(allow);
        }
    }
    let _ = window.destroy();
    Ok(())
}
