// The brain: one chat call that goes to the local Qwen2.5 1.5B (default), Claude or OpenAI,
// whichever the person chose in Settings. API keys come from the keychain cache, never from
// the page, and are never logged.
use crate::local;
use crate::state::{Shared, CLAUDE_KEY, OPENAI_KEY};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::time::Duration;
use tauri::{AppHandle, Manager};

pub const CLAUDE_MODEL: &str = "claude-opus-5-5";
const MAX_MESSAGES: usize = 200;
const MAX_CHARS: usize = 400_000;

#[derive(Clone, Serialize, Deserialize)]
pub struct Msg {
    pub role: String,
    pub content: String,
}

pub fn status(app: &AppHandle) -> Value {
    let st = app.state::<Shared>();
    let s = st.settings();
    let (ready, model) = match s.provider.as_str() {
        "claude" => (st.secret(CLAUDE_KEY).is_some(), CLAUDE_MODEL.to_string()),
        "openai" => (st.secret(OPENAI_KEY).is_some(), s.openai_model.clone()),
        _ => (local::running(&st), local::MODEL_ALIAS.to_string()),
    };
    json!({ "provider": s.provider, "ready": ready, "model": model, "localInstalled": local::installed(&st) })
}

#[tauri::command]
pub fn brain_status(app: AppHandle) -> Value {
    status(&app)
}

fn slot(provider: &str) -> Result<Option<&'static str>, String> {
    match provider {
        "local" => Ok(None),
        "claude" => Ok(Some(CLAUDE_KEY)),
        "openai" => Ok(Some(OPENAI_KEY)),
        _ => Err("Unknown brain.".into()),
    }
}

/// Chooses the brain. A key, when given, goes straight to the OS keychain.
#[tauri::command]
pub fn brain_set(app: AppHandle, provider: String, key: Option<String>, model: Option<String>) -> Result<Value, String> {
    let st = app.state::<Shared>();
    let slot = slot(&provider)?;
    if let (Some(slot), Some(k)) = (slot, key.as_deref().map(str::trim).filter(|k| !k.is_empty())) {
        if k.len() > 400 || k.chars().any(|c| c.is_whitespace() || c.is_control()) {
            return Err("That key does not look right.".into());
        }
        st.set_secret(slot, k)?;
    }
    if let Some(slot) = slot {
        if st.secret(slot).is_none() {
            return Err("Paste an API key first.".into());
        }
    }
    let mut s = st.settings();
    s.provider = provider.clone();
    if let Some(m) = model.map(|m| m.trim().to_string()).filter(|m| !m.is_empty()) {
        if m.len() > 80 || !m.chars().all(|c| c.is_ascii_alphanumeric() || "-._:/".contains(c)) {
            return Err("That model name does not look right.".into());
        }
        s.openai_model = m;
    }
    st.save_settings(s)?;
    if provider == "local" && local::installed(&st) {
        let h = app.clone();
        tauri::async_runtime::spawn(async move {
            let _ = local::ensure_running(&h).await;
        });
    }
    Ok(status(&app))
}

/// Removes a stored key; if that brain was chosen, Aspire goes back to the local one.
#[tauri::command]
pub fn brain_forget(app: AppHandle, provider: String) -> Result<Value, String> {
    let st = app.state::<Shared>();
    let Some(slot) = slot(&provider)? else { return Ok(status(&app)) };
    st.clear_secret(slot);
    let mut s = st.settings();
    if s.provider == provider {
        s.provider = "local".into();
        st.save_settings(s)?;
    }
    Ok(status(&app))
}

fn check(msgs: &[Msg]) -> Result<(), String> {
    if msgs.is_empty() || msgs.len() > MAX_MESSAGES {
        return Err("Send between 1 and 200 messages.".into());
    }
    if msgs.iter().any(|m| !matches!(m.role.as_str(), "system" | "user" | "assistant")) {
        return Err("Message roles must be system, user or assistant.".into());
    }
    if msgs.iter().map(|m| m.content.len()).sum::<usize>() > MAX_CHARS {
        return Err("The conversation is too long.".into());
    }
    Ok(())
}

/// One chat turn with the chosen brain; returns the reply text.
#[tauri::command]
pub async fn brain_chat(app: AppHandle, messages: Vec<Msg>) -> Result<String, String> {
    check(&messages)?;
    let st = app.state::<Shared>();
    let s = st.settings();
    match s.provider.as_str() {
        "claude" => claude(&st, &messages).await,
        "openai" => openai(&st, &s.openai_model, &messages).await,
        _ => local_chat(&app, &messages).await,
    }
}

async fn read_json(resp: reqwest::Response, who: &str) -> Result<Value, String> {
    let status = resp.status();
    let v: Value = resp.json().await.unwrap_or(Value::Null);
    if status.is_success() {
        return Ok(v);
    }
    let msg = v["error"]["message"].as_str().or_else(|| v["error"].as_str()).unwrap_or("request failed");
    Err(format!("{who}: {msg} ({})", status.as_u16()))
}

async fn local_chat(app: &AppHandle, msgs: &[Msg]) -> Result<String, String> {
    let (port, key) = local::ensure_running(app).await?;
    let st = app.state::<Shared>();
    let body = json!({ "model": local::MODEL_ALIAS, "messages": msgs, "max_tokens": 1024 });
    let resp = st
        .local_http
        .post(format!("http://127.0.0.1:{port}/v1/chat/completions"))
        .bearer_auth(key)
        .json(&body)
        .timeout(Duration::from_secs(180))
        .send()
        .await
        .map_err(|_| "The local model did not answer.".to_string())?;
    let v = read_json(resp, "Local model").await?;
    v["choices"][0]["message"]["content"].as_str().map(str::to_string).ok_or_else(|| "The local model sent no text.".into())
}

async fn claude(st: &Shared, msgs: &[Msg]) -> Result<String, String> {
    let key = st.secret(CLAUDE_KEY).ok_or("Add a Claude API key in Aspire Settings.")?;
    let system: Vec<&str> = msgs.iter().filter(|m| m.role == "system").map(|m| m.content.as_str()).collect();
    let rest: Vec<Value> = msgs
        .iter()
        .filter(|m| m.role != "system")
        .map(|m| json!({ "role": m.role, "content": m.content }))
        .collect();
    let mut body = json!({
        "model": CLAUDE_MODEL,
        "max_tokens": 16000,
        "messages": rest,
        "output_config": { "effort": "low" },
        "fallbacks": "default",
    });
    if !system.is_empty() {
        body["system"] = json!(system.join("\n\n"));
    }
    let resp = st
        .http
        .post("https://api.anthropic.com/v1/messages")
        .header("x-api-key", key)
        .header("anthropic-version", "2026-10-21")
        .header("anthropic-beta", "server-side-fallback-2026-07-01")
        .json(&body)
        .timeout(Duration::from_secs(300))
        .send()
        .await
        .map_err(|_| "Could not reach the Claude API.".to_string())?;
    let v = read_json(resp, "Claude").await?;
    if v["stop_reason"] == "refusal" {
        return Err("Claude declined this request.".into());
    }
    let text: String = v["content"]
        .as_array()
        .into_iter()
        .flatten()
        .filter(|b| b["type"] == "text")
        .filter_map(|b| b["text"].as_str())
        .collect();
    if text.is_empty() {
        Err("Claude sent no text.".into())
    } else {
        Ok(text)
    }
}

async fn openai(st: &Shared, model: &str, msgs: &[Msg]) -> Result<String, String> {
    let key = st.secret(OPENAI_KEY).ok_or("Add an OpenAI API key in Aspire Settings.")?;
    let resp = st
        .http
        .post("https://api.openai.com/v1/chat/completions")
        .bearer_auth(key)
        .json(&json!({ "model": model, "messages": msgs }))
        .timeout(Duration::from_secs(300))
        .send()
        .await
        .map_err(|_| "Could not reach the OpenAI API.".to_string())?;
    let v = read_json(resp, "OpenAI").await?;
    v["choices"][0]["message"]["content"].as_str().map(str::to_string).ok_or_else(|| "OpenAI sent no text.".into())
}
