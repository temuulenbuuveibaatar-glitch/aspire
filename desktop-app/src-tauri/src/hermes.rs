// Hermes Agent (Nous Research, MIT). Install runs the official installer script from a pinned
// commit of github.com/NousResearch/hermes-agent, only after its SHA-256 matches the one in this
// file, saved to a new folder, checked again just before it runs and run with fixed arguments
// (never a shell string); the installer is told to install that same commit. A task runs as `hermes chat -q <task> -Q` from the settings
// window only, after the Allow window, with a time limit. Without --yolo, Hermes blocks the
// commands it considers dangerous in this unattended mode. Hermes needs a model with at least
// 64K context: Qwen2.5 1.5B has 32K, so tasks use the Claude or OpenAI key from the keychain,
// passed to the child process as an environment variable only (never written to Hermes files).
// Hermes and what it starts can read that key, and the Allow window says so.
use crate::brain::CLAUDE_MODEL;
use crate::confirm::confirm;
use crate::desktop::{clean, fill, words};
use crate::state::{lock, Busy, Progress, Shared, CLAUDE_KEY, OPENAI_KEY};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::atomic::Ordering;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Manager};

/// Release v0.23.3 of hermes-agent. To update: pick a release commit on main, then update the
/// commit and both SHA-256 values (sha256sum of scripts/install.sh and scripts/install.ps1).
const HERMES_COMMIT: &str = "caafe5389ae585ef77387a962aee05b1bcf17029";
#[cfg(windows)]
const INSTALLER: (&str, &str) = ("install.ps1", "9bd2c1402427414a2ac9a3c3f33c66d78073ba81bb2d15634c13a52e9615d2d7");
#[cfg(not(windows))]
const INSTALLER: (&str, &str) = ("install.sh", "c73dad4dcf7c9ecadb98578e28cc763d23d7be3fa1b513545319038795493214");
const INSTALL_LIMIT: Duration = Duration::from_secs(30 * 60);
const RUN_LIMIT: Duration = Duration::from_secs(10 * 60);
const TASK_MAX: usize = 4000;
const NEEDS_CLOUD: &str = "Hermes Agent needs a model with at least 64K tokens of context. The local Qwen2.5 1.5B has 32K, so add a Claude or OpenAI API key in Aspire Settings to use Hermes.";

pub fn installer_url() -> String {
    format!("https://raw.githubusercontent.com/NousResearch/hermes-agent/{HERMES_COMMIT}/scripts/{}", INSTALLER.0)
}

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

/// macOS: stops a timed-out task's whole process group (the child leads it, see process_group).
/// On Windows the task's job object does this when it is dropped.
#[cfg(unix)]
fn kill_group(pid: Option<u32>) {
    if let Some(pid) = pid {
        let _ = std::process::Command::new("/bin/kill").args(["-KILL", "--", &format!("-{pid}")]).status();
    }
}

async fn install(app: &AppHandle) -> Result<(), String> {
    let st = app.state::<Shared>();
    let (file, want) = INSTALLER;
    let resp = st
        .http
        .get(installer_url())
        .timeout(Duration::from_secs(60))
        .send()
        .await
        .map_err(|_| "Could not reach raw.githubusercontent.com.".to_string())?;
    if !resp.status().is_success() {
        return Err(format!("raw.githubusercontent.com answered {}.", resp.status().as_u16()));
    }
    let script = resp.bytes().await.map_err(|e| e.to_string())?;
    if format!("{:x}", Sha256::digest(&script)) != want {
        return Err("The Hermes installer failed its SHA-256 check, so it was not run.".into());
    }
    let dir = st.data_dir.join(format!("hermes-installer-{}", &crate::local::random_hex()[..16]));
    std::fs::create_dir(&dir).map_err(|e| e.to_string())?;
    let path = dir.join(file);
    std::fs::write(&path, &script).map_err(|e| e.to_string())?;
    let r = run_installer(app, &st, &path, want).await;
    let _ = std::fs::remove_dir_all(&dir);
    r?;
    binary(app).map(|_| ()).ok_or_else(|| format!("The installer finished but the hermes command was not found. See {}.", st.data_dir.join("hermes-install.log").display()))
}

async fn run_installer(app: &AppHandle, st: &Shared, path: &Path, want: &str) -> Result<(), String> {
    let file = INSTALLER.0;
    #[cfg(windows)]
    let _ = app;
    step(st, "install", Some(format!("{file} {} (SHA-256 verified)", &HERMES_COMMIT[..12])));

    let log_path = st.data_dir.join("hermes-install.log");
    let log = std::fs::File::create(&log_path).map_err(|e| e.to_string())?;
    let log2 = log.try_clone().map_err(|e| e.to_string())?;
    #[cfg(windows)]
    let mut cmd = {
        let mut c = tokio::process::Command::new(crate::local::sys32(r"WindowsPowerShell\v1.0\powershell.exe"));
        c.args(["-NoProfile", "-ExecutionPolicy", "Bypass", "-File"])
            .arg(path)
            .args(["-Commit", HERMES_COMMIT, "-NonInteractive", "-SkipBrowser", "-SkipComputerUse"])
            .creation_flags(crate::local::CREATE_NO_WINDOW);
        c
    };
    #[cfg(not(windows))]
    let mut cmd = {
        let mut c = tokio::process::Command::new("/bin/bash");
        c.arg(path).args(["--commit", HERMES_COMMIT, "--non-interactive", "--skip-browser", "--skip-computer-use"]);
        if let Ok(home) = app.path().home_dir() {
            c.env("PATH", child_path(&home.join(".local").join("bin")));
        }
        c
    };
    cmd.stdin(Stdio::null()).stdout(Stdio::from(log)).stderr(Stdio::from(log2)).kill_on_drop(true);
    // Checked again just before it runs, in case the file changed after the download.
    if format!("{:x}", Sha256::digest(std::fs::read(path).map_err(|e| e.to_string())?)) != want {
        return Err("The Hermes installer changed after its SHA-256 check, so it was not run.".into());
    }
    let mut child = cmd.spawn().map_err(|e| format!("Could not start the Hermes installer: {e}"))?;
    let status = tokio::time::timeout(INSTALL_LIMIT, child.wait())
        .await
        .map_err(|_| "The Hermes installer ran for 30 minutes and was stopped.".to_string())?
        .map_err(|e| e.to_string())?;
    if !status.success() {
        return Err(format!("The Hermes installer stopped with an error. See {}.", log_path.display()));
    }
    Ok(())
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

fn tail(s: &str, max: usize) -> String {
    let n = s.chars().count();
    s.chars().skip(n.saturating_sub(max)).collect()
}

/// Runs one Hermes Agent task (after the Allow window) and returns its final answer. Only the
/// bundled settings window may call this (capabilities/local.json).
#[tauri::command]
pub async fn hermes_run(app: AppHandle, task: String) -> Result<String, String> {
    let task = clean(task.trim());
    if task.is_empty() || task.chars().count() > TASK_MAX {
        return Err(format!("The task must be 1 to {TASK_MAX} characters."));
    }
    let st = app.state::<Shared>();
    let bin = binary(&app).ok_or("Hermes Agent is not installed. Open Aspire Settings and choose Install.")?;
    let (provider, model, env, key) = pick(&st)?;
    // A .cmd or .bat shim runs through cmd.exe, which reads these characters in arguments itself.
    let shim = cfg!(windows) && bin.extension().is_some_and(|e| !e.eq_ignore_ascii_case("exe"));
    if shim && task.contains(['\r', '\n', '%', '^', '&', '|', '<', '>', '"', '!']) {
        return Err("With this Hermes install, a task cannot contain line breaks or these characters: % ^ & | < > \" !".into());
    }
    let _busy = Busy::take(&st.hermes_busy).ok_or("Hermes Agent is already working on a task.")?;
    let w = words(&st.settings().lang);
    if !confirm(&app, &fill(w.hermes, &[("task", task.as_str())]), Instant::now() + Duration::from_secs(300), true).await {
        return Err("The person did not allow it, or another Allow window stayed open.".into());
    }
    let query = if task.starts_with('-') { format!("Task: {task}") } else { task };
    let mut cmd = tokio::process::Command::new(&bin);
    cmd.args(["chat", "-q"])
        .arg(&query)
        .args(["-Q", "--provider", provider, "-m", model.as_str(), "--max-turns", "30"])
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
    #[cfg(unix)]
    cmd.process_group(0);
    let child = cmd.spawn().map_err(|e| format!("Could not start Hermes Agent: {e}"))?;
    // Everything the task starts ends with it: at the time limit, at the end, or if Aspire quits.
    #[cfg(windows)]
    let _job = child.raw_handle().and_then(crate::local::KillJob::with);
    #[cfg(unix)]
    let pid = child.id();
    let out = match tokio::time::timeout(RUN_LIMIT, child.wait_with_output()).await {
        Ok(r) => r.map_err(|e| e.to_string())?,
        Err(_) => {
            #[cfg(unix)]
            kill_group(pid);
            return Err("Hermes Agent took longer than 10 minutes and was stopped.".into());
        }
    };
    let stdout = String::from_utf8_lossy(&out.stdout);
    if out.status.success() {
        Ok(tail(stdout.trim(), 20_000))
    } else {
        let stderr = String::from_utf8_lossy(&out.stderr);
        let why = if stderr.trim().is_empty() { stdout.trim() } else { stderr.trim() };
        Err(format!("Hermes Agent stopped with an error: {}", tail(why, 1500)))
    }
}
