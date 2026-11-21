// Desktop actions for the person's Aspire account. Pairing trades the 6-digit code from Aspire
// Settings > Desktop for a device token (kept in the OS keychain). Then Aspire polls for jobs
// every 2 seconds; each job is shown in a native dialog that says exactly what will happen and
// runs only on Allow. Only five fixed kinds exist (open_app, open_url, type_text, save_file,
// fill_form), each checked again here; nothing from the server is ever run as a command.
use crate::state::{lock, Shared, DESKTOP_TOKEN, SITE};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::path::PathBuf;
use std::time::Duration;
use tauri::{AppHandle, Manager};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};
use tauri_plugin_opener::OpenerExt;

const TEXT_MAX: usize = 2000;
const FILE_MAX: usize = 200 * 1024;
const FIELDS_MAX: usize = 20;
const FOCUS_DELAY: Duration = Duration::from_secs(3);

#[derive(Clone, Default, Serialize)]
pub struct PairState {
    /// unpaired, connected, offline, unlinked or server_missing.
    pub status: &'static str,
    pub last: Option<String>,
}

#[derive(Deserialize)]
struct Job {
    id: String,
    kind: String,
    #[serde(default)]
    payload: Value,
}

#[derive(Deserialize)]
struct Next {
    job: Option<Job>,
}

// ---------------------------------------------------------------------------------------------
// Words for the native dialogs, in the five Aspire languages.

pub struct Words {
    pub title: &'static str,
    pub allow: &'static str,
    pub deny: &'static str,
    open_app: &'static str,
    open_url: &'static str,
    type_text: &'static str,
    save_file: &'static str,
    fill_form: &'static str,
    pub hermes: &'static str,
}

const EN: Words = Words {
    title: "Aspire wants to do this on your computer",
    allow: "Allow",
    deny: "Deny",
    open_app: "Open the app \"{app}\".",
    open_url: "Open this page in your browser:\n{url}",
    type_text: "Type this text. After you allow it, click the window to type into within 3 seconds:\n\n{text}",
    save_file: "Save the file \"{name}\" ({kb} KB) in {dir}.",
    fill_form: "Fill a form. After you allow it, click its first field within 3 seconds; Aspire types each value and presses Tab between them:\n\n{fields}",
    hermes: "Let Hermes Agent do this task on your computer? For up to 10 minutes it may run programs and change files without asking again.\n\nTask:\n{task}",
};
const MN: Words = Words {
    title: "Aspire таны компьютер дээр үүнийг хийх гэж байна",
    allow: "Зөвшөөрөх",
    deny: "Татгалзах",
    open_app: "\"{app}\" програмыг нээх.",
    open_url: "Энэ хуудсыг хөтөч дээр нээх:\n{url}",
    type_text: "Энэ текстийг бичих. Зөвшөөрснөөс хойш 3 секундэд бичих цонхоо дарна уу:\n\n{text}",
    save_file: "\"{name}\" файлыг ({kb} KB) {dir} хавтсанд хадгалах.",
    fill_form: "Маягт бөглөх. Зөвшөөрснөөс хойш 3 секундэд эхний талбарыг нь дарна уу. Aspire утга бүрийг бичээд хооронд нь Tab дарна:\n\n{fields}",
    hermes: "Hermes Agent энэ ажлыг таны компьютер дээр хийх үү? Тэр 10 минут хүртэл дахин асуулгүйгээр програм ажиллуулж, файл өөрчилж болно.\n\nДаалгавар:\n{task}",
};
const ZH: Words = Words {
    title: "Aspire 想在你的电脑上执行以下操作",
    allow: "允许",
    deny: "拒绝",
    open_app: "打开应用“{app}”。",
    open_url: "在浏览器中打开此网页：\n{url}",
    type_text: "输入这段文字。允许后请在 3 秒内点击要输入的窗口：\n\n{text}",
    save_file: "将文件“{name}”（{kb} KB）保存到 {dir}。",
    fill_form: "填写表单。允许后请在 3 秒内点击第一个输入框；Aspire 会逐项输入，并在每项之间按 Tab：\n\n{fields}",
    hermes: "让 Hermes Agent 在你的电脑上执行此任务吗？在最多 10 分钟内，它可能不再询问就运行程序和修改文件。\n\n任务：\n{task}",
};
const RU: Words = Words {
    title: "Aspire хочет сделать это на вашем компьютере",
    allow: "Разрешить",
    deny: "Отклонить",
    open_app: "Открыть приложение «{app}».",
    open_url: "Открыть эту страницу в браузере:\n{url}",
    type_text: "Напечатать этот текст. После разрешения в течение 3 секунд щёлкните окно, куда печатать:\n\n{text}",
    save_file: "Сохранить файл «{name}» ({kb} КБ) в {dir}.",
    fill_form: "Заполнить форму. После разрешения в течение 3 секунд щёлкните первое поле; Aspire введёт каждое значение и нажмёт Tab между ними:\n\n{fields}",
    hermes: "Разрешить Hermes Agent выполнить эту задачу на вашем компьютере? До 10 минут он может запускать программы и менять файлы, не спрашивая снова.\n\nЗадача:\n{task}",
};
const DE: Words = Words {
    title: "Aspire möchte das auf deinem Computer tun",
    allow: "Erlauben",
    deny: "Ablehnen",
    open_app: "Die App „{app}“ öffnen.",
    open_url: "Diese Seite im Browser öffnen:\n{url}",
    type_text: "Diesen Text tippen. Klicke nach dem Erlauben innerhalb von 3 Sekunden in das Zielfenster:\n\n{text}",
    save_file: "Die Datei „{name}“ ({kb} KB) in {dir} speichern.",
    fill_form: "Ein Formular ausfüllen. Klicke nach dem Erlauben innerhalb von 3 Sekunden in das erste Feld; Aspire tippt jeden Wert und drückt dazwischen Tab:\n\n{fields}",
    hermes: "Soll Hermes Agent diese Aufgabe auf deinem Computer erledigen? Bis zu 10 Minuten lang kann er Programme starten und Dateien ändern, ohne erneut zu fragen.\n\nAufgabe:\n{task}",
};

pub fn words(lang: &str) -> &'static Words {
    match lang {
        "mn" => &MN,
        "zh" => &ZH,
        "ru" => &RU,
        "de" => &DE,
        _ => &EN,
    }
}

/// Fills {name} placeholders in one pass, so text from a job can never fill another placeholder.
pub fn fill(t: &str, vars: &[(&str, &str)]) -> String {
    let mut out = String::new();
    let mut rest = t;
    while let Some(i) = rest.find('{') {
        out.push_str(&rest[..i]);
        let tail = &rest[i..];
        match vars.iter().find(|(k, _)| tail[1..].starts_with(k) && tail[1 + k.len()..].starts_with('}')) {
            Some((k, v)) => {
                out.push_str(v);
                rest = &tail[k.len() + 2..];
            }
            None => {
                out.push('{');
                rest = &tail[1..];
            }
        }
    }
    out.push_str(rest);
    out
}

/// No control characters (tab and newline kept) and no bidi overrides, so the dialog shows
/// exactly what will run.
pub fn clean(s: &str) -> String {
    s.replace("\r\n", "\n")
        .chars()
        .filter(|&c| {
            (c == '\n' || c == '\t' || !c.is_control())
                && !matches!(c, '\u{200e}' | '\u{200f}' | '\u{202a}'..='\u{202e}' | '\u{2066}'..='\u{2069}')
        })
        .collect()
}

pub fn preview(s: &str, max: usize) -> String {
    let n = s.chars().count();
    if n <= max {
        return s.to_string();
    }
    format!("{}... ({n} characters)", s.chars().take(max).collect::<String>())
}

/// A native Allow / Deny dialog; false when closed.
pub async fn confirm(app: &AppHandle, text: &str) -> bool {
    let w = words(&app.state::<Shared>().settings().lang);
    let (tx, rx) = tokio::sync::oneshot::channel();
    app.dialog()
        .message(text)
        .title(w.title)
        .kind(MessageDialogKind::Warning)
        .buttons(MessageDialogButtons::OkCancelCustom(w.allow.to_string(), w.deny.to_string()))
        .show(move |ok| {
            let _ = tx.send(ok);
        });
    rx.await.unwrap_or(false)
}

// ---------------------------------------------------------------------------------------------
// Job payload checks (the server checks too; this side does not trust it).

fn s<'a>(p: &'a Value, k: &str) -> &'a str {
    p[k].as_str().unwrap_or("")
}

fn app_name(p: &Value) -> Result<String, String> {
    let a = clean(s(p, "app")).trim().to_string();
    let ok = a.chars().next().is_some_and(char::is_alphanumeric)
        && a.chars().count() <= 80
        && a.chars().all(|c| c.is_alphanumeric() || " ._+&'-".contains(c));
    if ok { Ok(a) } else { Err("The app name is not valid.".into()) }
}

fn https_url(p: &Value) -> Result<tauri::Url, String> {
    let raw = s(p, "url").trim();
    let u = tauri::Url::parse(raw).map_err(|_| "The link is not valid.".to_string())?;
    if raw.len() > 2048 || u.scheme() != "https" || !u.username().is_empty() || u.password().is_some() || u.host_str().is_none() {
        return Err("Only https:// links can be opened.".into());
    }
    Ok(u)
}

fn text(p: &Value) -> Result<String, String> {
    let t = clean(s(p, "text"));
    if t.trim().is_empty() || t.chars().count() > TEXT_MAX {
        return Err(format!("The text must be 1 to {TEXT_MAX} characters."));
    }
    Ok(t)
}

fn safe_file_name(n: &str) -> bool {
    let stem = n.split('.').next().unwrap_or("").to_ascii_lowercase();
    let reserved = matches!(stem.as_str(), "con" | "prn" | "aux" | "nul")
        || ((stem.starts_with("com") || stem.starts_with("lpt")) && stem.len() == 4 && stem.as_bytes()[3].is_ascii_digit());
    n.chars().next().is_some_and(char::is_alphanumeric)
        && n.chars().count() <= 100
        && n.chars().all(|c| c.is_alphanumeric() || " ._()-".contains(c))
        && !n.ends_with('.')
        && !n.ends_with(' ')
        && !n.contains("..")
        && !reserved
}

fn file(p: &Value) -> Result<(String, String), String> {
    let name = clean(s(p, "name")).trim().to_string();
    if !safe_file_name(&name) {
        return Err("The file name is not valid.".into());
    }
    let content = p["content"].as_str().ok_or("The file has no content.")?;
    if content.len() > FILE_MAX {
        return Err("The file is larger than 200 KB.".into());
    }
    Ok((name, content.to_string()))
}

fn fields(p: &Value) -> Result<Vec<(String, String)>, String> {
    let list = p["fields"].as_array().ok_or("The form has no fields.")?;
    if list.is_empty() || list.len() > FIELDS_MAX {
        return Err(format!("A form needs 1 to {FIELDS_MAX} fields."));
    }
    let out: Vec<(String, String)> = list.iter().map(|f| (clean(s(f, "label")), clean(s(f, "value")))).collect();
    if out.iter().map(|(_, v)| v.chars().count()).sum::<usize>() > TEXT_MAX {
        return Err(format!("The form values are longer than {TEXT_MAX} characters."));
    }
    Ok(out)
}

fn aspire_dir(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app.path().home_dir().map_err(|e| e.to_string())?.join("Aspire"))
}

fn describe(app: &AppHandle, job: &Job) -> Result<String, String> {
    let w = words(&app.state::<Shared>().settings().lang);
    let p = &job.payload;
    Ok(match job.kind.as_str() {
        "open_app" => fill(w.open_app, &[("app", app_name(p)?.as_str())]),
        "open_url" => fill(w.open_url, &[("url", https_url(p)?.as_str())]),
        "type_text" => fill(w.type_text, &[("text", preview(&text(p)?, 700).as_str())]),
        "save_file" => {
            let (name, content) = file(p)?;
            let kb = content.len().div_ceil(1024).to_string();
            let dir = aspire_dir(app)?.display().to_string();
            fill(w.save_file, &[("name", name.as_str()), ("kb", kb.as_str()), ("dir", dir.as_str())])
        }
        "fill_form" => {
            let lines: Vec<String> = fields(p)?
                .iter()
                .enumerate()
                .map(|(i, (l, v))| format!("{}. {}: {}", i + 1, preview(l, 60), preview(v, 120)))
                .collect();
            fill(w.fill_form, &[("fields", lines.join("\n").as_str())])
        }
        k => return Err(format!("Unknown job kind \"{}\".", preview(&clean(k), 40))),
    })
}

// ---------------------------------------------------------------------------------------------
// Actions

/// Types each part, pressing Tab between parts. Runs on the main thread (required on macOS).
async fn type_parts(app: &AppHandle, parts: Vec<String>) -> Result<(), String> {
    use enigo::{Direction, Enigo, Key, Keyboard};
    let (tx, rx) = tokio::sync::oneshot::channel();
    app.run_on_main_thread(move || {
        let run = || -> Result<(), String> {
            let mut e = Enigo::new(&enigo::Settings::default())
                .map_err(|e| format!("Keyboard control is not allowed for Aspire ({e}). On macOS, allow it in System Settings > Privacy & Security > Accessibility."))?;
            for (i, part) in parts.iter().enumerate() {
                if i > 0 {
                    e.key(Key::Tab, Direction::Click).map_err(|e| e.to_string())?;
                    std::thread::sleep(Duration::from_millis(80));
                }
                if !part.is_empty() {
                    e.text(part).map_err(|e| e.to_string())?;
                }
            }
            Ok(())
        };
        let _ = tx.send(run());
    })
    .map_err(|e| e.to_string())?;
    rx.await.map_err(|_| "Typing was interrupted.".to_string())?
}

fn save_file(app: &AppHandle, name: &str, content: &str) -> Result<String, String> {
    use std::io::Write;
    let dir = aspire_dir(app)?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let (stem, ext) = match name.rfind('.') {
        Some(i) if i > 0 => (&name[..i], &name[i..]),
        _ => (name, ""),
    };
    let mut path = dir.join(name);
    let mut n = 2;
    while path.exists() {
        if n > 999 {
            return Err("Too many files with this name.".into());
        }
        path = dir.join(format!("{stem} ({n}){ext}"));
        n += 1;
    }
    let mut f = std::fs::OpenOptions::new().write(true).create_new(true).open(&path).map_err(|e| e.to_string())?;
    f.write_all(content.as_bytes()).map_err(|e| e.to_string())?;
    Ok(format!("Saved {}", path.display()))
}

/// Best label match: exact, then starts with, then contains (3+ letters); shortest wins.
fn best<T>(name: &str, items: impl Iterator<Item = (String, T)>) -> Option<T> {
    let want = name.to_lowercase();
    let mut pick: Option<(u8, usize, T)> = None;
    for (label, item) in items {
        let l = label.to_lowercase();
        if l.contains("uninstall") {
            continue;
        }
        let rank = if l == want {
            0
        } else if l.starts_with(&want) {
            1
        } else if want.chars().count() >= 3 && l.contains(&want) {
            2
        } else {
            continue;
        };
        if pick.as_ref().map_or(true, |(r, len, _)| (rank, l.len()) < (*r, *len)) {
            pick = Some((rank, l.len(), item));
        }
    }
    pick.map(|(_, _, t)| t)
}

#[cfg(windows)]
fn collect_links(dir: &std::path::Path, depth: u8, out: &mut Vec<PathBuf>) {
    let Ok(rd) = std::fs::read_dir(dir) else { return };
    for e in rd.flatten() {
        let p = e.path();
        if p.is_dir() {
            if depth > 0 {
                collect_links(&p, depth - 1, out);
            }
        } else if p.extension().is_some_and(|x| x.eq_ignore_ascii_case("lnk")) {
            out.push(p);
        }
    }
}

#[cfg(windows)]
async fn open_app(app: &AppHandle, name: &str) -> Result<String, String> {
    // 1. Start menu shortcuts (all users and this user): instant.
    let mut links = Vec::new();
    for var in ["APPDATA", "ProgramData"] {
        if let Some(base) = std::env::var_os(var) {
            collect_links(&PathBuf::from(base).join(r"Microsoft\Windows\Start Menu\Programs"), 4, &mut links);
        }
    }
    let found = best(name, links.into_iter().filter_map(|p| Some((p.file_stem()?.to_string_lossy().to_string(), p))));
    if let Some(path) = found {
        app.opener().open_path(path.to_string_lossy().to_string(), None::<&str>).map_err(|e| e.to_string())?;
        return Ok(format!("Opened {name}."));
    }
    // 2. Store apps (Notepad, Calculator, ...): a fixed PowerShell query, then the AppsFolder.
    let out = tokio::process::Command::new("powershell.exe")
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            "[Console]::OutputEncoding=[Text.Encoding]::UTF8; Get-StartApps | Select-Object Name,AppID | ConvertTo-Json -Compress",
        ])
        .creation_flags(crate::local::CREATE_NO_WINDOW)
        .stdin(std::process::Stdio::null())
        .output()
        .await
        .map_err(|e| e.to_string())?;
    let raw = String::from_utf8_lossy(&out.stdout);
    let list = match serde_json::from_str::<Value>(raw.trim_start_matches('\u{feff}').trim()) {
        Ok(Value::Array(a)) => a,
        Ok(one @ Value::Object(_)) => vec![one],
        _ => Vec::new(),
    };
    let apps = list.iter().filter_map(|a| Some((a["Name"].as_str()?.to_string(), a["AppID"].as_str()?.to_string())));
    if let Some(id) = best(name, apps) {
        if id.chars().all(|c| c.is_alphanumeric() || "._-!{}\\:~ ".contains(c)) {
            use std::os::windows::process::CommandExt;
            std::process::Command::new("explorer.exe")
                .arg(format!("shell:AppsFolder\\{id}"))
                .creation_flags(crate::local::CREATE_NO_WINDOW)
                .spawn()
                .map_err(|e| e.to_string())?;
            return Ok(format!("Opened {name}."));
        }
    }
    Err(format!("No app named \"{name}\" was found on this computer."))
}

#[cfg(target_os = "macos")]
async fn open_app(app: &AppHandle, name: &str) -> Result<String, String> {
    let mut dirs: Vec<PathBuf> = ["/Applications", "/Applications/Utilities", "/System/Applications", "/System/Applications/Utilities"]
        .into_iter()
        .map(PathBuf::from)
        .collect();
    if let Ok(h) = app.path().home_dir() {
        dirs.push(h.join("Applications"));
    }
    let mut apps = Vec::new();
    for d in &dirs {
        for e in std::fs::read_dir(d).into_iter().flatten().flatten() {
            let p = e.path();
            if p.extension().is_some_and(|x| x == "app") {
                apps.push(p);
            }
        }
    }
    let found = best(name, apps.into_iter().filter_map(|p| Some((p.file_stem()?.to_string_lossy().to_string(), p))));
    let mut cmd = tokio::process::Command::new("/usr/bin/open");
    match &found {
        Some(p) => cmd.arg(p),
        None => cmd.arg("-a").arg(name),
    };
    let ok = cmd.status().await.map_err(|e| e.to_string())?.success();
    if ok {
        Ok(format!("Opened {name}."))
    } else {
        Err(format!("No app named \"{name}\" was found on this computer."))
    }
}

async fn run(app: &AppHandle, job: &Job) -> Result<String, String> {
    let p = &job.payload;
    match job.kind.as_str() {
        "open_app" => open_app(app, &app_name(p)?).await,
        "open_url" => {
            let u = https_url(p)?;
            app.opener().open_url(u.as_str(), None::<&str>).map_err(|e| e.to_string())?;
            Ok(format!("Opened {}.", u.host_str().unwrap_or("the page")))
        }
        "type_text" => {
            let t = text(p)?;
            let n = t.chars().count();
            tokio::time::sleep(FOCUS_DELAY).await;
            type_parts(app, vec![t]).await?;
            Ok(format!("Typed {n} characters."))
        }
        "save_file" => {
            let (name, content) = file(p)?;
            save_file(app, &name, &content)
        }
        "fill_form" => {
            let f = fields(p)?;
            let n = f.len();
            tokio::time::sleep(FOCUS_DELAY).await;
            type_parts(app, f.into_iter().map(|(_, v)| v).collect()).await?;
            Ok(format!("Filled {n} fields."))
        }
        k => Err(format!("Unknown job kind \"{}\".", preview(&clean(k), 40))),
    }
}

// ---------------------------------------------------------------------------------------------
// Pairing and polling

fn set_status(st: &Shared, status: &'static str) {
    lock(&st.pairing).status = status;
}

pub fn status(app: &AppHandle) -> Value {
    let st = app.state::<Shared>();
    let p = lock(&st.pairing).clone();
    let state = if p.status.is_empty() { "unpaired" } else { p.status };
    json!({
        "paired": st.secret(DESKTOP_TOKEN).is_some(),
        "device": st.settings().device_name,
        "status": state,
        "last": p.last,
    })
}

#[tauri::command]
pub fn pairing_status(app: AppHandle) -> Value {
    status(&app)
}

fn device_name() -> String {
    let os = if cfg!(windows) { "Windows" } else { "Mac" };
    match std::env::var("COMPUTERNAME").ok().filter(|h| !h.trim().is_empty()) {
        Some(h) => format!("{} ({os})", preview(h.trim(), 40)),
        None => format!("Aspire Desktop ({os})"),
    }
}

/// Trades the 6-digit code from Aspire Settings > Desktop for a device token.
#[tauri::command]
pub async fn pair(app: AppHandle, code: String) -> Result<String, String> {
    let code = code.trim().to_string();
    if code.len() != 6 || !code.chars().all(|c| c.is_ascii_digit()) {
        return Err("Enter the 6-digit code from Aspire Settings > Desktop.".into());
    }
    let st = app.state::<Shared>();
    let device = device_name();
    let resp = st
        .http
        .post(format!("{SITE}/api/desktop/pair"))
        .json(&json!({ "code": code, "deviceName": device }))
        .timeout(Duration::from_secs(20))
        .send()
        .await
        .map_err(|_| "Could not reach Aspire. Check the internet connection.".to_string())?;
    match resp.status().as_u16() {
        200..=299 => {}
        404 => return Err("Desktop pairing is not available on the Aspire server yet.".into()),
        400 => return Err("That code is wrong or expired. Get a new one in Aspire Settings > Desktop.".into()),
        429 => return Err("Too many tries. Wait a minute and try again.".into()),
        s => return Err(format!("Aspire answered {s}.")),
    }
    let v: Value = resp.json().await.map_err(|_| "Aspire sent an unexpected answer.".to_string())?;
    let token = v["token"].as_str().unwrap_or("");
    if token.len() < 20 || token.len() > 200 || !token.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_') {
        return Err("Aspire sent an unexpected answer.".into());
    }
    st.set_secret(DESKTOP_TOKEN, token)?;
    let name = v["name"].as_str().map(|n| preview(&clean(n), 60)).unwrap_or(device);
    let mut s = st.settings();
    s.device_name = Some(name.clone());
    st.save_settings(s)?;
    set_status(&st, "connected");
    Ok(name)
}

#[tauri::command]
pub fn unpair(app: AppHandle) -> Result<(), String> {
    let st = app.state::<Shared>();
    st.clear_secret(DESKTOP_TOKEN);
    let mut s = st.settings();
    s.device_name = None;
    st.save_settings(s)?;
    set_status(&st, "unpaired");
    Ok(())
}

async fn handle(app: &AppHandle, st: &Shared, token: &str, job: Job) {
    let (ok, denied, message) = match describe(app, &job) {
        Err(e) => (false, false, e),
        Ok(text) => {
            if confirm(app, &text).await {
                match run(app, &job).await {
                    Ok(m) => (true, false, m),
                    Err(e) => (false, false, e),
                }
            } else {
                (false, true, "The person did not allow it.".to_string())
            }
        }
    };
    lock(&st.pairing).last = Some(format!("{}: {}", job.kind, if ok { "done" } else if denied { "denied" } else { "failed" }));
    let _ = st
        .http
        .post(format!("{SITE}/api/desktop/result"))
        .bearer_auth(token)
        .json(&json!({ "jobId": job.id, "ok": ok, "denied": denied, "message": preview(&message, 500) }))
        .timeout(Duration::from_secs(20))
        .send()
        .await;
}

/// Polls for jobs every 2 seconds while paired; backs off when offline or not deployed yet.
pub async fn poll_loop(app: AppHandle) {
    let mut wait = Duration::from_secs(2);
    loop {
        tokio::time::sleep(wait).await;
        wait = Duration::from_secs(2);
        let st = app.state::<Shared>();
        let Some(token) = st.secret(DESKTOP_TOKEN) else {
            let mut p = lock(&st.pairing);
            if p.status != "unlinked" {
                p.status = "unpaired";
            }
            continue;
        };
        let resp = st
            .http
            .get(format!("{SITE}/api/desktop/next"))
            .bearer_auth(&token)
            .timeout(Duration::from_secs(25))
            .send()
            .await;
        let Ok(resp) = resp else {
            set_status(&st, "offline");
            wait = Duration::from_secs(10);
            continue;
        };
        match resp.status().as_u16() {
            200 => {
                set_status(&st, "connected");
                if let Ok(Next { job: Some(job) }) = resp.json::<Next>().await {
                    handle(&app, &st, &token, job).await;
                    wait = Duration::from_millis(300);
                }
            }
            204 => set_status(&st, "connected"),
            401 => {
                st.clear_secret(DESKTOP_TOKEN);
                set_status(&st, "unlinked");
            }
            404 => {
                set_status(&st, "server_missing");
                wait = Duration::from_secs(60);
            }
            429 => wait = Duration::from_secs(15),
            _ => {
                set_status(&st, "offline");
                wait = Duration::from_secs(10);
            }
        }
    }
}
