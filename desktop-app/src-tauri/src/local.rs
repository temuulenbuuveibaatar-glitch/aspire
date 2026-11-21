// The local brain: the official llama.cpp server build (pinned release) and Qwen2.5 1.5B Instruct
// (Q4_K_M GGUF from the official Qwen repo). Both are downloaded only after the person clicks
// Download in Settings, resumed when interrupted, and checked against the published size and
// SHA-256. llama-server runs as a child process on 127.0.0.1 with a random key and is killed
// when Aspire quits.
use crate::state::{lock, Progress, Shared};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::fs::{self, File, OpenOptions};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::time::Duration;
use tauri::{AppHandle, Manager};

pub struct Asset {
    pub name: &'static str,
    pub size: u64,
    pub sha256: &'static str,
}

pub const LLAMA_TAG: &str = "b12600";
#[cfg(windows)]
pub const LLAMA: Asset = Asset {
    name: "llama-b12600-bin-win-cpu-x64.zip",
    size: 25_012_254,
    sha256: "a31a14f1630408422228d02ff2a3fc41c06a6b3b3849d8d2782c37f0f6e30951",
};
#[cfg(all(target_os = "macos", target_arch = "aarch64"))]
pub const LLAMA: Asset = Asset {
    name: "llama-b12600-bin-macos-arm64.tar.gz",
    size: 16_578_695,
    sha256: "9ced6f8cbce915968a865ded7718c2c4d14a69876bf9abf544533aec9b76e975",
};
#[cfg(all(target_os = "macos", target_arch = "x86_64"))]
pub const LLAMA: Asset = Asset {
    name: "llama-b12600-bin-macos-x64.tar.gz",
    size: 12_364_702,
    sha256: "1a76c5393ebf51ee8e067de9042fe628303b976be639912a9bcf80feb71044af",
};
#[cfg(not(any(windows, target_os = "macos")))]
compile_error!("Aspire Desktop is built for Windows and macOS.");

pub const MODEL: Asset = Asset {
    name: "qwen2.5-1.5b-instruct-q4_k_m.gguf",
    size: 1_117_320_736,
    sha256: "6a1a2eb6d15622bf3c96857206351ba97e1af16c30d7a74ee38970e434e9407e",
};
pub const MODEL_URL: &str =
    "https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/qwen2.5-1.5b-instruct-q4_k_m.gguf";
pub const MODEL_ALIAS: &str = "qwen2.5-1.5b";
const EXE: &str = if cfg!(windows) { "llama-server.exe" } else { "llama-server" };
const NOT_INSTALLED: &str = "The local model is not downloaded yet. Open Aspire Settings and choose Download.";
#[cfg(windows)]
pub const CREATE_NO_WINDOW: u32 = 0x0800_0000;

pub struct Llama {
    child: Child,
    port: u16,
    key: String,
}

fn io(e: std::io::Error) -> String {
    e.to_string()
}

pub fn server_url() -> String {
    format!("https://github.com/ggml-org/llama.cpp/releases/download/{LLAMA_TAG}/{}", LLAMA.name)
}

fn llama_dir(st: &Shared) -> PathBuf {
    st.data_dir.join("llama").join(LLAMA_TAG)
}

fn model_path(st: &Shared) -> PathBuf {
    st.data_dir.join("models").join(MODEL.name)
}

fn find(dir: &Path, name: &str, depth: u8) -> Option<PathBuf> {
    let mut subdirs = Vec::new();
    for e in fs::read_dir(dir).ok()?.flatten() {
        let p = e.path();
        if p.is_dir() {
            subdirs.push(p);
        } else if e.file_name().to_str() == Some(name) {
            return Some(p);
        }
    }
    if depth == 0 {
        return None;
    }
    subdirs.iter().find_map(|d| find(d, name, depth - 1))
}

fn server_exe(st: &Shared) -> Option<PathBuf> {
    find(&llama_dir(st), EXE, 2)
}

pub fn installed(st: &Shared) -> bool {
    server_exe(st).is_some() && model_path(st).is_file()
}

/// The running server's port and key, clearing it if the process has exited.
fn alive(st: &Shared) -> Option<(u16, String)> {
    let mut g = lock(&st.llama);
    if let Some(l) = g.as_mut() {
        if matches!(l.child.try_wait(), Ok(None)) {
            return Some((l.port, l.key.clone()));
        }
    }
    *g = None;
    None
}

pub fn running(st: &Shared) -> bool {
    alive(st).is_some()
}

pub fn status(app: &AppHandle) -> Value {
    let st = app.state::<Shared>();
    json!({
        "installed": installed(&st),
        "running": running(&st),
        "progress": lock(&st.local_progress).clone(),
        "serverBytes": LLAMA.size,
        "modelBytes": MODEL.size,
        "serverSource": server_url(),
        "modelSource": MODEL_URL,
    })
}

fn set_progress(st: &Shared, step: &str, done: u64, total: u64) {
    let mut p = lock(&st.local_progress);
    p.step = step.to_string();
    p.done = done;
    p.total = total;
}

fn sha256_file(path: &Path) -> Result<String, String> {
    let mut f = File::open(path).map_err(io)?;
    let mut h = Sha256::new();
    let mut buf = vec![0u8; 1 << 20];
    loop {
        let n = f.read(&mut buf).map_err(io)?;
        if n == 0 {
            break;
        }
        h.update(&buf[..n]);
    }
    Ok(format!("{:x}", h.finalize()))
}

/// Downloads `url` to `dest`, resuming a `.part` file, then checks size and SHA-256.
async fn download(st: &Shared, url: &str, dest: &Path, asset: &Asset, step: &str) -> Result<(), String> {
    let dir = dest.parent().ok_or("bad path")?;
    fs::create_dir_all(dir).map_err(io)?;
    let part = dir.join(format!("{}.part", asset.name));
    let mut have = fs::metadata(&part).map(|m| m.len()).unwrap_or(0);
    if have > asset.size {
        fs::remove_file(&part).map_err(io)?;
        have = 0;
    }
    if have < asset.size {
        let mut req = st.http.get(url);
        if have > 0 {
            req = req.header(reqwest::header::RANGE, format!("bytes={have}-"));
        }
        let mut resp = req.send().await.map_err(|_| format!("Could not reach {}.", host(url)))?;
        let status = resp.status();
        if !status.is_success() {
            return Err(format!("{} answered {}.", host(url), status.as_u16()));
        }
        let append = status == reqwest::StatusCode::PARTIAL_CONTENT;
        let mut file = if append {
            OpenOptions::new().append(true).open(&part)
        } else {
            have = 0;
            File::create(&part)
        }
        .map_err(io)?;
        set_progress(st, step, have, asset.size);
        loop {
            let chunk = tokio::time::timeout(Duration::from_secs(60), resp.chunk())
                .await
                .map_err(|_| "The download stalled. Choose Download again to resume.".to_string())?
                .map_err(|_| "The download was interrupted. Choose Download again to resume.".to_string())?;
            let Some(bytes) = chunk else { break };
            have += bytes.len() as u64;
            if have > asset.size {
                drop(file);
                let _ = fs::remove_file(&part);
                return Err(format!("{} is larger than expected; it was deleted.", asset.name));
            }
            file.write_all(&bytes).map_err(io)?;
            set_progress(st, step, have, asset.size);
        }
        file.flush().map_err(io)?;
    }
    if have != asset.size {
        return Err("The download ended early. Choose Download again to resume.".into());
    }
    set_progress(st, "verify", have, asset.size);
    let p = part.clone();
    let sum = tauri::async_runtime::spawn_blocking(move || sha256_file(&p)).await.map_err(|e| e.to_string())??;
    if sum != asset.sha256 {
        let _ = fs::remove_file(&part);
        return Err(format!("{} failed its SHA-256 check and was deleted.", asset.name));
    }
    fs::rename(&part, dest).map_err(io)
}

fn host(url: &str) -> &str {
    url.split('/').nth(2).unwrap_or(url)
}

#[cfg(windows)]
fn extract(archive: &Path, dir: &Path) -> Result<(), String> {
    let mut zip = zip::ZipArchive::new(File::open(archive).map_err(io)?).map_err(|e| e.to_string())?;
    for i in 0..zip.len() {
        let mut entry = zip.by_index(i).map_err(|e| e.to_string())?;
        let Some(rel) = entry.enclosed_name() else { continue };
        let out = dir.join(rel);
        if entry.is_dir() {
            fs::create_dir_all(&out).map_err(io)?;
            continue;
        }
        if entry.unix_mode().is_some_and(|m| m & 0o170000 == 0o120000) {
            continue; // symlink: not needed on Windows
        }
        if let Some(p) = out.parent() {
            fs::create_dir_all(p).map_err(io)?;
        }
        let mut f = File::create(&out).map_err(io)?;
        std::io::copy(&mut entry, &mut f).map_err(io)?;
    }
    Ok(())
}

#[cfg(target_os = "macos")]
fn extract(archive: &Path, dir: &Path) -> Result<(), String> {
    let gz = flate2::read::GzDecoder::new(File::open(archive).map_err(io)?);
    let mut tar = tar::Archive::new(gz);
    tar.set_preserve_permissions(true);
    tar.unpack(dir).map_err(io)
}

async fn install(app: &AppHandle) -> Result<(), String> {
    let st = app.state::<Shared>();
    if server_exe(&st).is_none() {
        let archive = st.data_dir.join("downloads").join(LLAMA.name);
        download(&st, &server_url(), &archive, &LLAMA, "server").await?;
        set_progress(&st, "extract", 0, 0);
        let dir = llama_dir(&st);
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).map_err(io)?;
        let (a, d) = (archive.clone(), dir.clone());
        tauri::async_runtime::spawn_blocking(move || extract(&a, &d)).await.map_err(|e| e.to_string())??;
        let _ = fs::remove_file(&archive);
        let exe = server_exe(&st).ok_or("llama-server was not found in the downloaded archive.")?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            fs::set_permissions(&exe, fs::Permissions::from_mode(0o755)).map_err(io)?;
        }
        let _ = exe;
    }
    let model = model_path(&st);
    if !model.is_file() {
        download(&st, MODEL_URL, &model, &MODEL, "model").await?;
    }
    set_progress(&st, "starting", 0, 0);
    ensure_running(app).await.map(|_| ())
}

/// Starts the download and install in the background; the settings page polls the progress.
#[tauri::command]
pub fn local_install(app: AppHandle) {
    let st = app.state::<Shared>();
    {
        let mut p = lock(&st.local_progress);
        if p.running {
            return;
        }
        *p = Progress { running: true, step: "starting".into(), ..Default::default() };
    }
    let h = app.clone();
    tauri::async_runtime::spawn(async move {
        let r = install(&h).await;
        let st = h.state::<Shared>();
        let mut p = lock(&st.local_progress);
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

fn random_hex() -> String {
    let mut b = [0u8; 24];
    let _ = getrandom::getrandom(&mut b);
    b.iter().map(|x| format!("{x:02x}")).collect()
}

/// Port and key of a ready llama-server, starting it first when needed.
pub async fn ensure_running(app: &AppHandle) -> Result<(u16, String), String> {
    let st = app.state::<Shared>();
    let _one_at_a_time = st.llama_start.lock().await;
    if let Some(x) = alive(&st) {
        return Ok(x);
    }
    let exe = server_exe(&st).ok_or(NOT_INSTALLED)?;
    let model = model_path(&st);
    if !model.is_file() {
        return Err(NOT_INSTALLED.into());
    }
    let port = std::net::TcpListener::bind("127.0.0.1:0").and_then(|l| l.local_addr()).map_err(io)?.port();
    let port_s = port.to_string();
    let key = random_hex();
    let log = File::create(st.data_dir.join("llama-server.log")).map(Stdio::from).unwrap_or_else(|_| Stdio::null());
    let mut cmd = Command::new(&exe);
    cmd.arg("-m")
        .arg(&model)
        .args(["--host", "127.0.0.1", "--port", port_s.as_str(), "-c", "8192", "--jinja", "-a", MODEL_ALIAS])
        .env("LLAMA_API_KEY", &key)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(log);
    if let Some(dir) = exe.parent() {
        cmd.current_dir(dir);
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    let child = cmd.spawn().map_err(|e| format!("Could not start llama-server: {e}"))?;
    *lock(&st.llama) = Some(Llama { child, port, key: key.clone() });
    let health = format!("http://127.0.0.1:{port}/health");
    for _ in 0..240 {
        tokio::time::sleep(Duration::from_millis(500)).await;
        if alive(&st).is_none() {
            return Err("llama-server stopped while loading. See llama-server.log in the Aspire data folder.".into());
        }
        if let Ok(r) = st.local_http.get(&health).timeout(Duration::from_secs(2)).send().await {
            if r.status().is_success() {
                return Ok((port, key));
            }
        }
    }
    stop_inner(&st);
    Err("The local model took too long to load.".into())
}

/// At launch: warm the local model when it is the chosen brain and already downloaded.
pub async fn warm(app: AppHandle) {
    let st = app.state::<Shared>();
    if st.settings().provider != "local" || !installed(&st) {
        return;
    }
    if let Err(e) = ensure_running(&app).await {
        lock(&st.local_progress).error = Some(e);
    }
}

fn stop_inner(st: &Shared) {
    if let Some(mut l) = lock(&st.llama).take() {
        let _ = l.child.kill();
        let _ = l.child.wait();
    }
}

pub fn stop(app: &AppHandle) {
    if let Some(st) = app.try_state::<Shared>() {
        stop_inner(&st);
    }
}
