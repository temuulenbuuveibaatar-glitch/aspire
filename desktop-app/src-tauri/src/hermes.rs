// Hermes Agent (Nous Research, MIT). Install uses only the official installer script from
// hermes-agent.nousresearch.com, saved to a file and run with fixed arguments (never a shell
// string). A task runs as `hermes chat -q <task> -Q --yolo` with a time limit, after a native
// Allow dialog. Hermes needs a model with at least 64K context: Qwen2.5 1.5B has 32K, so tasks
// use the Claude or OpenAI key from the keychain, passed to the child process as an environment
// variable only (never written to Hermes config files).
use crate::brain::CLAUDE_MODEL;
use crate::desktop::{clean, confirm, fill, preview, words};
use crate::state::{lock, Progress, Shared, CLAUDE_KEY, OPENAI_KEY};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;
use tauri::{AppHandle, Manager};

#[cfg(windows)]
const INSTALLER: (&str, &str) = ("https://hermes-agent.nousresearch.com/install.ps1", "install.ps1");
#[cfg(not(windows))]
const INSTALLER: (&str, &str) = ("https://hermes-agent.nousresearch.com/install.sh", "install.sh");
const INSTALL_LIMIT: Duration = Duration::from_secs(30 * 60);
const RUN_LIMIT: Duration = Duration::from_secs(10 * 60);
const NEEDS_CLOUD: &str = "Hermes Agent needs a model with at least 64K tokens of context. The local Qwen2.5 1.5B has 32K, so add a Claude or OpenAI API key in Aspire Settings to use Hermes.";

/// Where the official installer puts the CLI.
pub fn binary(app: &AppHandle) -> Option<PathBuf> {
    #[cfg(windows)]
    {
        let bin = app.path().local_data_dir().ok()?.join("hermes").join("bin");
        ["hermes.exe", "hermes.cmd", "hermes.bat"].iter().map(|n| bin.join(n)).find(|p| p.is_file())
    }
    #[cfg(not(windows))]
    {
        let p = app.path().home_dir().ok()?.join(".local").join("bin").join("hermes");
        p.is_file().then_some(p)
    }
}

/// PATH for Hermes: its own bin folder first (it may be newer than Aspire's environment).
fn child_path(bin_dir: &Path) -> std::ffi::OsString {
    let mut dirs = vec![bin_dir.to_path_buf()];
    #[cfg(target_os = "macos")]
    dirs.extend(["/opt/homebrew/bin", "/usr/local/bin"].into_iter().map(PathBuf::from));
    if let Some(p) = std::env::var_os("PATH") {
        dirs.extend(std::env::split_paths(&p));
    }
    std::env::join_paths(dirs).unwrap_or_default()
}

/// (Hermes provider id, model, key variable, key): the chosen cloud brain first, then the other.
fn pick(st: &Shared) -> Result<(&'static str, String, &'static str, String), String> {
    let s = st.settings();
    let claude = st.secret(CLAUDE_KEY).map(|k| ("anthropic", CLAUDE_MODEL.to_string(), "ANTHROPIC_API_KEY", k));
    let openai = st.secret(OPENAI_KEY).map(|k| ("openai-api", s.openai_model.clone(), "OPENAI_API_KEY", k));
    let order = if s.provider == "openai" { [openai, claude] } else { [claude, openai] };
    order.into_iter().flatten().next().ok_or_else(|| NEEDS_CLOUD.to_string())
}

pub fn status(app: &AppHandle) -> Value {
    let st = app.state::<Shared>();
    json!({
        "installed": binary(app).is_some(),
        "progress": lock(&st.hermes_progress).clone(),
        "provider": pick(&st).ok().map(|p| p.0),
        "busy": st.hermes_busy.load(Ordering::Relaxed),
    })
}

fn step(st: &Shared, step: &str, note: Option<String>) {
    let mut p = lock(&st.hermes_progress);
    p.step = step.to_string();
    if note.is_some() {
        p.note = note;
    }
}

async fn install(app: &AppHandle) -> Result<(), String> {
    let st = app.state::<Shared>();
    let (url, file) = INSTALLER;
    let resp = st
        .http
        .get(url)
        .timeout(Duration::from_secs(60))
        .send()
        .await
        .map_err(|_| "Could not reach hermes-agent.nousresearch.com.".to_string())?;
    if !resp.status().is_success() {
        return Err(format!("hermes-agent.nousresearch.com answered {}.", resp.status().as_u16()));
    }
    let script = resp.bytes().await.map_err(|e| e.to_string())?;
    if script.is_empty() || script.len() > 2 * 1024 * 1024 {
        return Err("The Hermes installer download looks wrong.".into());
    }
    let sha = format!("{:x}", Sha256::digest(&script));
    let dir = st.data_dir.join("hermes-installer");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join(file);
    std::fs::write(&path, &script).map_err(|e| e.to_string())?;
    step(&st, "install", Some(format!("{file} sha256 {sha}")));

    let log_path = st.data_dir.join("hermes-install.log");
    let log = std::fs::File::create(&log_path).map_err(|e| e.to_string())?;
    let log2 = log.try_clone().map_err(|e| e.to_string())?;
    #[cfg(windows)]
    let mut cmd = {
        let mut c = tokio::process::Command::new("powershell.exe");
        c.args(["-NoProfile", "-ExecutionPolicy", "Bypass", "-File"])
            .arg(&path)
            .args(["-NonInteractive", "-SkipBrowser", "-SkipComputerUse"])
            .creation_flags(crate::local::CREATE_NO_WINDOW);
        c
    };
    #[cfg(not(windows))]
    let mut cmd = {
        let mut c = tokio::process::Command::new("/bin/bash");
        c.arg(&path).args(["--non-interactive", "--skip-browser", "--skip-computer-use"]);
        if let Ok(home) = app.path().home_dir() {
            c.env("PATH", child_path(&home.join(".local").join("bin")));
        }
        c
    };
    cmd.stdin(Stdio::null()).stdout(Stdio::from(log)).stderr(Stdio::from(log2)).kill_on_drop(true);
    let mut child = cmd.spawn().map_err(|e| format!("Could not start the Hermes installer: {e}"))?;
    let status = tokio::time::timeout(INSTALL_LIMIT, child.wait())
        .await
        .map_err(|_| "The Hermes installer ran for 30 minutes and was stopped.".to_string())?
        .map_err(|e| e.to_string())?;
    if !status.success() {
        return Err(format!("The Hermes installer stopped with an error. See {}.", log_path.display()));
    }
    binary(app).map(|_| ()).ok_or_else(|| format!("The installer finished but the hermes command was not found. See {}.", log_path.display()))
}

#[tauri::command]
pub fn hermes_install(app: AppHandle) {
    let st = app.state::<Shared>();
    {
        let mut p = lock(&st.hermes_progress);
        if p.running {
            return;
        }
        *p = Progress { running: true, step: "download".into(), ..Default::default() };
    }
    let h = app.clone();
    tauri::async_runtime::spawn(async move {
        let r = install(&h).await;
        let st = h.state::<Shared>();
        let mut p = lock(&st.hermes_progress);
        p.running = false;
        match r {
            Ok(()) => {
                p.step = "ready".into();
                p.error = None;
            }
            Err(e) => p.error = Some(e),
        }
    });
}

struct Busy<'a>(&'a AtomicBool);
impl Drop for Busy<'_> {
    fn drop(&mut self) {
        self.0.store(false, Ordering::SeqCst);
    }
}

fn tail(s: &str, max: usize) -> String {
    let n = s.chars().count();
    s.chars().skip(n.saturating_sub(max)).collect()
}

/// Runs one Hermes Agent task (after a native Allow) and returns its final answer.
#[tauri::command]
pub async fn hermes_run(app: AppHandle, task: String) -> Result<String, String> {
    let task = clean(task.trim());
    if task.is_empty() || task.chars().count() > 4000 {
        return Err("The task must be 1 to 4000 characters.".into());
    }
    let st = app.state::<Shared>();
    let bin = binary(&app).ok_or("Hermes Agent is not installed. Open Aspire Settings and choose Install.")?;
    let (provider, model, env, key) = pick(&st)?;
    if st.hermes_busy.swap(true, Ordering::SeqCst) {
        return Err("Hermes Agent is already working on a task.".into());
    }
    let _busy = Busy(&st.hermes_busy);
    let w = words(&st.settings().lang);
    if !confirm(&app, &fill(w.hermes, &[("task", preview(&task, 800).as_str())])).await {
        return Err("The person did not allow it.".into());
    }
    let query = if task.starts_with('-') { format!("Task: {task}") } else { task };
    let mut cmd = tokio::process::Command::new(&bin);
    cmd.args(["chat", "-q"])
        .arg(&query)
        .args(["-Q", "--yolo", "--provider", provider, "-m", model.as_str(), "--max-turns", "30"])
        .env(env, key)
        .env("PATH", child_path(bin.parent().unwrap_or(Path::new("."))))
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);
    if let Ok(home) = app.path().home_dir() {
        cmd.current_dir(home);
    }
    #[cfg(windows)]
    cmd.creation_flags(crate::local::CREATE_NO_WINDOW);
    let child = cmd.spawn().map_err(|e| format!("Could not start Hermes Agent: {e}"))?;
    let out = tokio::time::timeout(RUN_LIMIT, child.wait_with_output())
        .await
        .map_err(|_| "Hermes Agent took longer than 10 minutes and was stopped.".to_string())?
        .map_err(|e| e.to_string())?;
    let stdout = String::from_utf8_lossy(&out.stdout);
    if out.status.success() {
        Ok(tail(stdout.trim(), 20_000))
    } else {
        let stderr = String::from_utf8_lossy(&out.stderr);
        let why = if stderr.trim().is_empty() { stdout.trim() } else { stderr.trim() };
        Err(format!("Hermes Agent stopped with an error: {}", tail(why, 1500)))
    }
}
