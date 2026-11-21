// Desktop actions for the person's Aspire account. Pairing trades the 10-character code from
// Aspire Settings > Desktop for a device token (kept in the OS keychain). Then Aspire polls for
// jobs every 2 seconds; each job is checked here, resolved (open_app finds the exact app first),
// shown in full in the Allow / Deny window (confirm.rs) and runs only on Allow, before the job
// expires. Only five fixed kinds exist (open_app, open_url, type_text, save_file, fill_form);
// nothing from the server is ever run as a command.
use crate::confirm::confirm;
use crate::state::{lock, Shared, DESKTOP_TOKEN, SITE};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::path::PathBuf;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Manager};
use tauri_plugin_opener::OpenerExt;

// The same limits as the server (web/lib/desktop.ts).
const TEXT_MAX: usize = 2000;
const LABEL_MAX: usize = 100;
const VALUE_MAX: usize = 500;
const FILE_MAX: usize = 200 * 1024;
const FIELDS_MAX: usize = 20;
const JOB_TTL_MS: u64 = 5 * 60_000;
const TEXT_EXT: [&str; 8] = ["txt", "md", "csv", "tsv", "json", "log", "ics", "vcf"];
const CODE_ALPHABET: &str = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_LEN: usize = 10;
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
    /// Time left before the server expires the job.
    #[serde(default, rename = "expiresInMs")]
    expires_in_ms: Option<u64>,
}

#[derive(Deserialize)]
struct Next {
    job: Option<Job>,
}

// ---------------------------------------------------------------------------------------------
// Words for the Allow / Deny window, in the five Aspire languages.

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
    open_app: "Open the app \"{app}\":\n{target}",
    open_url: "Open this page in your browser:\n{url}",
    type_text: "Type this text. After you allow it, click the window to type into within 3 seconds. [Enter] and [Tab] mark the keys that will be pressed:\n\n{text}",
    save_file: "Save the file \"{name}\" ({kb} KB) in {dir}.",
    fill_form: "Fill a form. After you allow it, click its first field within 3 seconds; Aspire types each value and presses Tab between them:\n\n{fields}",
    hermes: "Let Hermes Agent do this task on your computer? For up to 10 minutes it may run programs and change files. Commands Hermes considers dangerous are blocked.\n\nTask:\n{task}",
};
const MN: Words = Words {
    title: "Aspire таны компьютер дээр үүнийг хийх гэж байна",
    allow: "Зөвшөөрөх",
    deny: "Татгалзах",
    open_app: "\"{app}\" програмыг нээх:\n{target}",
    open_url: "Энэ хуудсыг хөтөч дээр нээх:\n{url}",
    type_text: "Энэ текстийг бичих. Зөвшөөрснөөс хойш 3 секундэд бичих цонхоо дарна уу. [Enter], [Tab] нь дарагдах товчийг заана:\n\n{text}",
    save_file: "\"{name}\" файлыг ({kb} KB) {dir} хавтсанд хадгалах.",
    fill_form: "Маягт бөглөх. Зөвшөөрснөөс хойш 3 секундэд эхний талбарыг нь дарна уу. Aspire утга бүрийг бичээд хооронд нь Tab дарна:\n\n{fields}",
    hermes: "Hermes Agent энэ ажлыг таны компьютер дээр хийх үү? Тэр 10 минут хүртэл програм ажиллуулж, файл өөрчилж болно. Hermes аюултай гэж үзсэн командууд хаагдана.\n\nДаалгавар:\n{task}",
};
const ZH: Words = Words {
    title: "Aspire 想在你的电脑上执行以下操作",
    allow: "允许",
    deny: "拒绝",
    open_app: "打开应用“{app}”：\n{target}",
    open_url: "在浏览器中打开此网页：\n{url}",
    type_text: "输入这段文字。允许后请在 3 秒内点击要输入的窗口。[Enter] 和 [Tab] 表示将按下的键：\n\n{text}",
    save_file: "将文件“{name}”（{kb} KB）保存到 {dir}。",
    fill_form: "填写表单。允许后请在 3 秒内点击第一个输入框；Aspire 会逐项输入，并在每项之间按 Tab：\n\n{fields}",
    hermes: "让 Hermes Agent 在你的电脑上执行此任务吗？在最多 10 分钟内，它可能运行程序和修改文件。Hermes 认为危险的命令会被阻止。\n\n任务：\n{task}",
};
const RU: Words = Words {
    title: "Aspire хочет сделать это на вашем компьютере",
    allow: "Разрешить",
    deny: "Отклонить",
    open_app: "Открыть приложение «{app}»:\n{target}",
    open_url: "Открыть эту страницу в браузере:\n{url}",
    type_text: "Напечатать этот текст. После разрешения в течение 3 секунд щёлкните окно, куда печатать. [Enter] и [Tab] показывают клавиши, которые будут нажаты:\n\n{text}",
    save_file: "Сохранить файл «{name}» ({kb} КБ) в {dir}.",
    fill_form: "Заполнить форму. После разрешения в течение 3 секунд щёлкните первое поле; Aspire введёт каждое значение и нажмёт Tab между ними:\n\n{fields}",
    hermes: "Разрешить Hermes Agent выполнить эту задачу на вашем компьютере? До 10 минут он может запускать программы и менять файлы. Команды, которые Hermes считает опасными, блокируются.\n\nЗадача:\n{task}",
};
const DE: Words = Words {
    title: "Aspire möchte das auf deinem Computer tun",
    allow: "Erlauben",
    deny: "Ablehnen",
    open_app: "Die App „{app}“ öffnen:\n{target}",
    open_url: "Diese Seite im Browser öffnen:\n{url}",
    type_text: "Diesen Text tippen. Klicke nach dem Erlauben innerhalb von 3 Sekunden in das Zielfenster. [Enter] und [Tab] zeigen die Tasten, die gedrückt werden:\n\n{text}",
    save_file: "Die Datei „{name}“ ({kb} KB) in {dir} speichern.",
    fill_form: "Ein Formular ausfüllen. Klicke nach dem Erlauben innerhalb von 3 Sekunden in das erste Feld; Aspire tippt jeden Wert und drückt dazwischen Tab:\n\n{fields}",
    hermes: "Soll Hermes Agent diese Aufgabe auf deinem Computer erledigen? Bis zu 10 Minuten lang kann er Programme starten und Dateien ändern. Befehle, die Hermes für gefährlich hält, werden blockiert.\n\nAufgabe:\n{task}",
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

/// Characters that change what the person reads without showing: zero-width, joiners, soft
/// hyphen, bidi marks and overrides, line and paragraph separators, BOM.
fn invisible(c: char) -> bool {
    matches!(c, '\u{00ad}' | '\u{061c}' | '\u{180e}' | '\u{200b}'..='\u{200f}' | '\u{2028}'..='\u{202e}' | '\u{2060}'..='\u{2069}' | '\u{feff}')
}

/// No control or invisible characters (tab and newline kept); other spaces become a plain
/// space. So the Allow window shows exactly what will be typed or run.
pub fn clean(s: &str) -> String {
    s.replace("\r\n", "\n")
        .chars()
        .filter(|&c| matches!(c, '\n' | '\t') || !(c.is_control() || invisible(c)))
        .map(|c| if c.is_whitespace() && !matches!(c, '\n' | '\t') { ' ' } else { c })
        .collect()
}

/// For status lines only, never for text the person approves.
pub fn preview(s: &str, max: usize) -> String {
    let n = s.chars().count();
    if n <= max {
        return s.to_string();
    }
    format!("{}... ({n} characters)", s.chars().take(max).collect::<String>())
}

/// Typed text as the Allow window shows it: every Enter and Tab key press is visible.
fn keys_visible(t: &str) -> String {
    t.replace('\t', "[Tab]").replace('\n', "[Enter]\n")
}

// ---------------------------------------------------------------------------------------------
// Job payload checks (the server checks too; this side does not trust it).

/// A checked job, ready to run exactly as it was shown.
enum Action {
    OpenApp { name: String, target: String },
    OpenUrl(tauri::Url),
    Type(String),
    Save { name: String, content: String },
    Fill(Vec<String>),
}

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

/// A plain text file name in one folder: no separators, no "..", no Windows device names
/// (also COM¹-COM³ / LPT¹-LPT³ and "con .txt"), and a text extension only.
fn safe_file_name(n: &str) -> bool {
    let stem: String = n.split('.').next().unwrap_or("").trim_end().to_lowercase();
    let c: Vec<char> = stem.chars().collect();
    let reserved = matches!(stem.as_str(), "con" | "prn" | "aux" | "nul")
        || ((stem.starts_with("com") || stem.starts_with("lpt")) && c.len() == 4 && (c[3].is_ascii_digit() || "¹²³".contains(c[3])));
    let text_ext = n.rsplit_once('.').is_some_and(|(_, e)| TEXT_EXT.contains(&e.to_ascii_lowercase().as_str()));
    n.chars().next().is_some_and(char::is_alphanumeric)
        && n.chars().count() <= 100
        && n.chars().all(|c| c.is_alphanumeric() || " ._()-".contains(c))
        && !n.ends_with('.')
        && !n.ends_with(' ')
        && !n.contains("..")
        && !reserved
        && text_ext
}

fn file(p: &Value) -> Result<(String, String), String> {
    let name = clean(s(p, "name")).trim().to_string();
    if !safe_file_name(&name) {
        return Err("Only text files (.txt .md .csv .tsv .json .log .ics .vcf) with a plain name can be saved.".into());
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
    let mut out = Vec::new();
    for f in list {
        // A tab or newline inside a value would move to another field.
        let label = clean(s(f, "label")).replace(['\t', '\n'], " ").trim().to_string();
        let value = clean(s(f, "value")).replace(['\t', '\n'], " ").trim().to_string();
        if label.is_empty() || label.chars().count() > LABEL_MAX || value.chars().count() > VALUE_MAX {
            return Err(format!("Every field needs a label of up to {LABEL_MAX} characters and a value of up to {VALUE_MAX}."));
        }
        out.push((label, value));
    }
    if out.iter().map(|(_, v)| v.chars().count()).sum::<usize>() > TEXT_MAX {
        return Err(format!("The form values are longer than {TEXT_MAX} characters."));
    }
    Ok(out)
}

fn aspire_dir(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app.path().home_dir().map_err(|e| e.to_string())?.join("Aspire"))
}

/// Checks a job and returns the full text for the Allow window and the exact action to run.
async fn prepare(app: &AppHandle, job: &Job) -> Result<(String, Action), String> {
    let w = words(&app.state::<Shared>().settings().lang);
    let p = &job.payload;
    Ok(match job.kind.as_str() {
        "open_app" => {
            let (name, target) = resolve_app(&app_name(p)?).await?;
            (fill(w.open_app, &[("app", name.as_str()), ("target", target.as_str())]), Action::OpenApp { name, target })
        }
        "open_url" => {
            let u = https_url(p)?;
            (fill(w.open_url, &[("url", u.as_str())]), Action::OpenUrl(u))
        }
        "type_text" => {
            let t = text(p)?;
            (fill(w.type_text, &[("text", keys_visible(&t).as_str())]), Action::Type(t))
        }
        "save_file" => {
            let (name, content) = file(p)?;
            let kb = content.len().div_ceil(1024).to_string();
            let dir = aspire_dir(app)?.display().to_string();
            (fill(w.save_file, &[("name", name.as_str()), ("kb", kb.as_str()), ("dir", dir.as_str())]), Action::Save { name, content })
        }
        "fill_form" => {
            let f = fields(p)?;
            let lines: Vec<String> = f.iter().enumerate().map(|(i, (l, v))| format!("{}. {l}: {v}", i + 1)).collect();
            (fill(w.fill_form, &[("fields", lines.join("\n").as_str())]), Action::Fill(f.into_iter().map(|(_, v)| v).collect()))
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
fn best<T>(name: &str, items: impl Iterator<Item = (String, T)>) -> Option<(String, T)> {
    let want = name.to_lowercase();
    let mut pick: Option<(u8, usize, String, T)> = None;
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
        if pick.as_ref().map_or(true, |(r, len, _, _)| (rank, l.len()) < (*r, *len)) {
            pick = Some((rank, l.len(), label, item));
        }
    }
    pick.map(|(_, _, label, t)| (label, t))
}

/// Shells, terminals and script hosts are never opened from a job, whatever they are called.
fn is_shell(name: &str, target: &str) -> bool {
    const ANY: [&str; 13] = [
        "powershell", "pwsh", "terminal", "command prompt", "iterm", "script editor", "wscript", "cscript", "mshta", "osascript",
        "git bash", "wezterm", "alacritty",
    ];
    const EXACT: [&str; 9] = ["cmd", "bash", "zsh", "sh", "console", "kitty", "warp", "hyper", "ghostty"];
    let (n, t) = (name.to_lowercase(), target.to_lowercase());
    ANY.iter().any(|x| n.contains(x) || t.contains(x)) || EXACT.contains(&n.as_str()) || t.ends_with("cmd.exe") || t.ends_with("\\cmd.lnk")
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

/// (Name to show, exact target): a Start menu shortcut, or an installed app's AppID.
#[cfg(windows)]
async fn find_app(name: &str) -> Result<(String, String), String> {
    // 1. Start menu shortcuts (all users and this user).
    let mut links = Vec::new();
    for var in ["APPDATA", "ProgramData"] {
        if let Some(base) = std::env::var_os(var) {
            collect_links(&PathBuf::from(base).join(r"Microsoft\Windows\Start Menu\Programs"), 4, &mut links);
        }
    }
    if let Some((label, path)) = best(name, links.into_iter().filter_map(|p| Some((p.file_stem()?.to_string_lossy().to_string(), p)))) {
        return Ok((label, path.display().to_string()));
    }
    // 2. Installed apps (Notepad, Calculator, ...): a fixed PowerShell query with no input from the job.
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
    match best(name, apps) {
        Some((label, id)) if id.chars().all(|c| c.is_alphanumeric() || "._-!{}\\:~ ".contains(c)) => Ok((label, format!("shell:AppsFolder\\{id}"))),
        _ => Err(format!("No app named \"{name}\" was found on this computer.")),
    }
}

/// (Name to show, exact target): an .app bundle in the usual folders.
#[cfg(target_os = "macos")]
async fn find_app(name: &str) -> Result<(String, String), String> {
    let mut dirs: Vec<PathBuf> = ["/Applications", "/Applications/Utilities", "/System/Applications", "/System/Applications/Utilities"]
        .into_iter()
        .map(PathBuf::from)
        .collect();
    if let Some(h) = std::env::var_os("HOME") {
        dirs.push(PathBuf::from(h).join("Applications"));
    }
    let is_app = |p: &PathBuf| p.extension().is_some_and(|x| x == "app");
    let mut apps = Vec::new();
    for d in &dirs {
        for p in std::fs::read_dir(d).into_iter().flatten().flatten().map(|e| e.path()) {
            if is_app(&p) {
                apps.push(p);
            } else if p.is_dir() {
                // One level of folders, e.g. /Applications/Microsoft Office/...
                apps.extend(std::fs::read_dir(&p).into_iter().flatten().flatten().map(|e| e.path()).filter(is_app));
            }
        }
    }
    best(name, apps.into_iter().filter_map(|p| Some((p.file_stem()?.to_string_lossy().to_string(), p))))
        .map(|(label, p)| (label, p.display().to_string()))
        .ok_or_else(|| format!("No app named \"{name}\" was found on this computer."))
}

/// Finds the exact app before asking, so the Allow window names what will really open.
async fn resolve_app(name: &str) -> Result<(String, String), String> {
    let (label, target) = find_app(name).await?;
    let (label, target) = (clean(&label), clean(&target));
    if is_shell(&label, &target) {
        return Err(format!("Aspire does not open terminals or script hosts (\"{label}\")."));
    }
    Ok((label, target))
}

async fn launch(app: &AppHandle, target: &str) -> Result<(), String> {
    #[cfg(windows)]
    {
        if target.starts_with("shell:AppsFolder\\") {
            use std::os::windows::process::CommandExt;
            std::process::Command::new("explorer.exe")
                .arg(target)
                .creation_flags(crate::local::CREATE_NO_WINDOW)
                .spawn()
                .map_err(|e| e.to_string())?;
        } else {
            app.opener().open_path(target, None::<&str>).map_err(|e| e.to_string())?;
        }
        Ok(())
    }
    #[cfg(target_os = "macos")]
    {
        let _ = app;
        let ok = tokio::process::Command::new("/usr/bin/open").arg(target).status().await.map_err(|e| e.to_string())?.success();
        if ok { Ok(()) } else { Err("The app did not open.".into()) }
    }
}

async fn run(app: &AppHandle, action: Action) -> Result<String, String> {
    match action {
        Action::OpenApp { name, target } => {
            launch(app, &target).await?;
            Ok(format!("Opened {name}."))
        }
        Action::OpenUrl(u) => {
            app.opener().open_url(u.as_str(), None::<&str>).map_err(|e| e.to_string())?;
            Ok(format!("Opened {}.", u.host_str().unwrap_or("the page")))
        }
        Action::Type(t) => {
            let n = t.chars().count();
            tokio::time::sleep(FOCUS_DELAY).await;
            type_parts(app, vec![t]).await?;
            Ok(format!("Typed {n} characters."))
        }
        Action::Save { name, content } => save_file(app, &name, &content),
        Action::Fill(values) => {
            let n = values.len();
            tokio::time::sleep(FOCUS_DELAY).await;
            type_parts(app, values).await?;
            Ok(format!("Filled {n} fields."))
        }
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

#[cfg(target_os = "macos")]
fn host_name() -> Option<String> {
    let run = |cmd: &str, args: &[&str]| {
        std::process::Command::new(cmd)
            .args(args)
            .output()
            .ok()
            .filter(|o| o.status.success())
            .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
            .filter(|s| !s.is_empty())
    };
    run("/usr/sbin/scutil", &["--get", "ComputerName"]).or_else(|| run("/bin/hostname", &[]))
}

#[cfg(windows)]
fn host_name() -> Option<String> {
    std::env::var("COMPUTERNAME").ok()
}

/// The computer's own name, so two computers of one person never replace each other's link.
fn device_name(st: &Shared) -> String {
    let os = if cfg!(windows) { "Windows" } else { "Mac" };
    if let Some(h) = host_name().map(|h| clean(&h).trim().to_string()).filter(|h| !h.is_empty()) {
        return format!("{} ({os})", preview(&h, 40));
    }
    let mut s = st.settings();
    if s.machine_tag.is_empty() {
        s.machine_tag = crate::local::random_hex()[..4].to_string();
        let _ = st.save_settings(s.clone());
    }
    format!("Aspire Desktop {} ({os})", s.machine_tag)
}

/// Trades the 10-character code from Aspire Settings > Desktop for a device token.
#[tauri::command]
pub async fn pair(app: AppHandle, code: String) -> Result<String, String> {
    // Normalised the way the server does it: upper case, no spaces or dashes.
    let code: String = code.to_uppercase().chars().filter(|c| !c.is_whitespace() && *c != '-').collect();
    if code.chars().count() != CODE_LEN || !code.chars().all(|c| CODE_ALPHABET.contains(c)) {
        return Err("Enter the 10-character code from Aspire Settings > Desktop.".into());
    }
    let st = app.state::<Shared>();
    let device = device_name(&st);
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
        503 => return Err("Desktop linking is not available on the Aspire server right now.".into()),
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
    // Timed on this computer's clock, and never longer than the server keeps a job.
    let deadline = Instant::now() + Duration::from_millis(job.expires_in_ms.unwrap_or(JOB_TTL_MS).min(JOB_TTL_MS));
    let expired = || (false, "expired", "The request expired before it was allowed.".to_string());
    let (ok, outcome, message) = match prepare(app, &job).await {
        Err(e) => (false, "failed", e),
        Ok((text, action)) => {
            let allowed = confirm(app, &text, deadline).await;
            if Instant::now() >= deadline {
                expired()
            } else if !allowed {
                (false, "denied", "The person did not allow it.".to_string())
            } else {
                match run(app, action).await {
                    Ok(m) => (true, "done", m),
                    Err(e) => (false, "failed", e),
                }
            }
        }
    };
    lock(&st.pairing).last = Some(format!("{}: {outcome}", preview(&clean(&job.kind), 20)));
    let _ = st
        .http
        .post(format!("{SITE}/api/desktop/result"))
        .bearer_auth(token)
        .json(&json!({
            "jobId": job.id,
            "ok": ok,
            "denied": outcome == "denied",
            "expired": outcome == "expired",
            "message": preview(&message, 500),
        }))
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
            // 404: the routes are not deployed; 503: the server cannot link devices (no database).
            404 | 503 => {
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
