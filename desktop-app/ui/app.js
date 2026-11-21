// Aspire Desktop settings page. Talks to Rust only through invoke(); keys go straight to the
// OS keychain and are never shown again. All text is set with textContent.
"use strict";

const { invoke } = window.__TAURI__.core;
const $ = (id) => document.getElementById(id);

const T = {
  en: {
    brain: "Brain",
    brainHint: "Which AI answers. The local model is private and works offline.",
    local: "Local Qwen2.5 1.5B (default, private)",
    claude: "Claude API key",
    openai: "OpenAI API key",
    keyPh: "Paste the API key",
    modelPh: "OpenAI model, e.g. gpt-5-mini",
    save: "Save",
    forget: "Remove the saved key",
    keyHint: "The key is stored only in your system keychain, never in a file.",
    brainReady: "Ready: {model}",
    brainWaiting: "Not ready yet: {model}",
    localTitle: "Local model",
    localWhat: "Downloads the official llama.cpp server ({server}, github.com/ggml-org/llama.cpp) and Qwen2.5 1.5B Instruct ({model}, huggingface.co/Qwen). Downloads resume if interrupted and are checked with SHA-256.",
    download: "Download and start",
    resume: "Resume download",
    startAgain: "Start again",
    setupAll: "Download and install everything",
    setupHint: "One click downloads the local model (Qwen2.5 1.5B with the llama.cpp server) and installs Hermes Agent. Nothing is downloaded before you click.",
    localRunning: "Installed and running.",
    localInstalled: "Installed. It starts when needed.",
    localMissing: "Not downloaded yet.",
    step_server: "Downloading the llama.cpp server",
    step_model: "Downloading Qwen2.5 1.5B",
    step_verify: "Checking the file",
    step_extract: "Unpacking",
    step_starting: "Starting the local model",
    step_ready: "Ready.",
    hermesHint: "Nous Research's open-source agent. It is installed with its official installer. It needs a model with 64K context, so it uses your Claude or OpenAI key; the local 1.5B model is too small for it.",
    install: "Install Hermes Agent",
    reinstall: "Reinstall",
    hermesInstalled: "Installed. Tasks use: {provider}",
    hermesNeedsCloud: "Installed. Add a Claude or OpenAI key to run tasks.",
    hermesMissing: "Not installed.",
    hstep_download: "Downloading the official installer",
    hstep_install: "Installing. This can take several minutes.",
    hstep_ready: "Installed.",
    taskPh: "Try a task, e.g. list the files on my Desktop",
    run: "Run",
    working: "Working...",
    pairTitle: "Link to your Aspire account",
    pairHint: "In Aspire, open Settings > Desktop to get a 10-character code. Every action from Aspire asks you first in a window here.",
    pair: "Link",
    unpair: "Unlink this computer",
    p_unpaired: "Not linked.",
    p_connected: "Linked as {device}.",
    p_offline: "Linked as {device}, but offline. Retrying.",
    p_unlinked: "This computer was unlinked in Aspire. Get a new code to link again.",
    p_server_missing: "Linked as {device}. The Aspire server does not offer desktop actions yet.",
    autostart: "Run Aspire when I log in",
    dataDir: "Data folder: {dir}",
  },
  mn: {
    brain: "Тархи",
    brainHint: "Аль AI хариулах вэ. Дотоод загвар нууцлалтай, интернэтгүй ажиллана.",
    local: "Дотоод Qwen2.5 1.5B (үндсэн, нууцлалтай)",
    claude: "Claude API түлхүүр",
    openai: "OpenAI API түлхүүр",
    keyPh: "API түлхүүрээ буулгана уу",
    modelPh: "OpenAI загвар, жишээ нь gpt-5-mini",
    save: "Хадгалах",
    forget: "Хадгалсан түлхүүрийг устгах",
    keyHint: "Түлхүүр зөвхөн системийн түлхүүрийн санд хадгалагдана, файлд биш.",
    brainReady: "Бэлэн: {model}",
    brainWaiting: "Одоогоор бэлэн биш: {model}",
    localTitle: "Дотоод загвар",
    localWhat: "Албан ёсны llama.cpp сервер ({server}, github.com/ggml-org/llama.cpp) болон Qwen2.5 1.5B Instruct ({model}, huggingface.co/Qwen)-ийг татна. Тасарвал үргэлжлүүлж, SHA-256-аар шалгана.",
    download: "Татаж эхлүүлэх",
    resume: "Татахыг үргэлжлүүлэх",
    startAgain: "Дахин асаах",
    setupAll: "Бүгдийг татаж суулгах",
    setupHint: "Нэг товшилтоор дотоод загвар (llama.cpp сервертэй Qwen2.5 1.5B)-ыг татаж, Hermes Agent-ийг суулгана. Таныг дарахаас өмнө юу ч татахгүй.",
    localRunning: "Суусан, ажиллаж байна.",
    localInstalled: "Суусан. Хэрэгтэй үед асна.",
    localMissing: "Хараахан татаагүй.",
    step_server: "llama.cpp серверийг татаж байна",
    step_model: "Qwen2.5 1.5B-г татаж байна",
    step_verify: "Файлыг шалгаж байна",
    step_extract: "Задалж байна",
    step_starting: "Дотоод загварыг асааж байна",
    step_ready: "Бэлэн.",
    hermesHint: "Nous Research-ийн нээлттэй эхийн агент. Албан ёсны суулгагчаар суулгана. 64K контексттэй загвар шаарддаг тул таны Claude эсвэл OpenAI түлхүүрийг ашиглана; дотоод 1.5B загвар хэтэрхий жижиг.",
    install: "Hermes Agent суулгах",
    reinstall: "Дахин суулгах",
    hermesInstalled: "Суусан. Ашиглах: {provider}",
    hermesNeedsCloud: "Суусан. Ажил хийлгэхийн тулд Claude эсвэл OpenAI түлхүүр нэмнэ үү.",
    hermesMissing: "Суугаагүй.",
    hstep_download: "Албан ёсны суулгагчийг татаж байна",
    hstep_install: "Суулгаж байна. Хэдэн минут болж магадгүй.",
    hstep_ready: "Суусан.",
    taskPh: "Ажил туршаад үзээрэй, жишээ нь ширээний файлуудыг жагсаа",
    run: "Ажиллуулах",
    working: "Ажиллаж байна...",
    pairTitle: "Aspire бүртгэлтэй холбох",
    pairHint: "Aspire-ийн Тохиргоо > Desktop хэсгээс 10 тэмдэгттэй код авна. Aspire-аас ирсэн үйлдэл бүр энд цонхоор эхлээд асууна.",
    pair: "Холбох",
    unpair: "Энэ компьютерийг салгах",
    p_unpaired: "Холбогдоогүй.",
    p_connected: "{device} нэрээр холбогдсон.",
    p_offline: "{device} нэрээр холбогдсон ч интернэтгүй байна. Дахин оролдож байна.",
    p_unlinked: "Энэ компьютерийг Aspire дээр салгасан. Дахин холбохын тулд шинэ код аваарай.",
    p_server_missing: "{device} нэрээр холбогдсон. Aspire сервер компьютерийн үйлдлийг одоогоор дэмжээгүй байна.",
    autostart: "Нэвтрэх үед Aspire-ийг асаах",
    dataDir: "Өгөгдлийн хавтас: {dir}",
  },
  zh: {
    brain: "大脑",
    brainHint: "由哪个 AI 回答。本地模型保护隐私，可离线使用。",
    local: "本地 Qwen2.5 1.5B（默认，私密）",
    claude: "Claude API 密钥",
    openai: "OpenAI API 密钥",
    keyPh: "粘贴 API 密钥",
    modelPh: "OpenAI 模型，例如 gpt-5-mini",
    save: "保存",
    forget: "删除已保存的密钥",
    keyHint: "密钥只保存在系统钥匙串中，不会写入文件。",
    brainReady: "就绪：{model}",
    brainWaiting: "尚未就绪：{model}",
    localTitle: "本地模型",
    localWhat: "下载官方 llama.cpp 服务器（{server}，github.com/ggml-org/llama.cpp）和 Qwen2.5 1.5B Instruct（{model}，huggingface.co/Qwen）。中断后可继续下载，并用 SHA-256 校验。",
    download: "下载并启动",
    resume: "继续下载",
    startAgain: "重新启动",
    setupAll: "全部下载并安装",
    setupHint: "一键下载本地模型（Qwen2.5 1.5B 及 llama.cpp 服务器）并安装 Hermes Agent。点击之前不会下载任何内容。",
    localRunning: "已安装，正在运行。",
    localInstalled: "已安装，需要时自动启动。",
    localMissing: "尚未下载。",
    step_server: "正在下载 llama.cpp 服务器",
    step_model: "正在下载 Qwen2.5 1.5B",
    step_verify: "正在校验文件",
    step_extract: "正在解压",
    step_starting: "正在启动本地模型",
    step_ready: "就绪。",
    hermesHint: "Nous Research 的开源智能体，使用官方安装程序安装。它需要 64K 上下文的模型，因此会使用你的 Claude 或 OpenAI 密钥；本地 1.5B 模型对它来说太小。",
    install: "安装 Hermes Agent",
    reinstall: "重新安装",
    hermesInstalled: "已安装。任务使用：{provider}",
    hermesNeedsCloud: "已安装。添加 Claude 或 OpenAI 密钥后即可运行任务。",
    hermesMissing: "未安装。",
    hstep_download: "正在下载官方安装程序",
    hstep_install: "正在安装，可能需要几分钟。",
    hstep_ready: "已安装。",
    taskPh: "试一个任务，例如列出桌面上的文件",
    run: "运行",
    working: "正在处理...",
    pairTitle: "关联你的 Aspire 账号",
    pairHint: "在 Aspire 的 设置 > Desktop 中获取 10 位字符代码。来自 Aspire 的每个操作都会先在这里弹窗询问你。",
    pair: "关联",
    unpair: "取消关联此电脑",
    p_unpaired: "未关联。",
    p_connected: "已关联为 {device}。",
    p_offline: "已关联为 {device}，但当前离线，正在重试。",
    p_unlinked: "此电脑已在 Aspire 中取消关联。请获取新代码重新关联。",
    p_server_missing: "已关联为 {device}。Aspire 服务器暂不支持电脑操作。",
    autostart: "登录时启动 Aspire",
    dataDir: "数据文件夹：{dir}",
  },
  ru: {
    brain: "Мозг",
    brainHint: "Какой ИИ отвечает. Локальная модель приватна и работает без интернета.",
    local: "Локальная Qwen2.5 1.5B (по умолчанию, приватно)",
    claude: "Ключ Claude API",
    openai: "Ключ OpenAI API",
    keyPh: "Вставьте ключ API",
    modelPh: "Модель OpenAI, например gpt-5-mini",
    save: "Сохранить",
    forget: "Удалить сохранённый ключ",
    keyHint: "Ключ хранится только в системной связке ключей, не в файле.",
    brainReady: "Готово: {model}",
    brainWaiting: "Ещё не готово: {model}",
    localTitle: "Локальная модель",
    localWhat: "Скачивает официальный сервер llama.cpp ({server}, github.com/ggml-org/llama.cpp) и Qwen2.5 1.5B Instruct ({model}, huggingface.co/Qwen). Загрузка продолжается после обрыва и проверяется по SHA-256.",
    download: "Скачать и запустить",
    resume: "Продолжить загрузку",
    startAgain: "Запустить снова",
    setupAll: "Скачать и установить всё",
    setupHint: "Одним нажатием скачивается локальная модель (Qwen2.5 1.5B с сервером llama.cpp) и устанавливается Hermes Agent. До нажатия ничего не скачивается.",
    localRunning: "Установлено и работает.",
    localInstalled: "Установлено. Запускается при необходимости.",
    localMissing: "Ещё не скачано.",
    step_server: "Скачивание сервера llama.cpp",
    step_model: "Скачивание Qwen2.5 1.5B",
    step_verify: "Проверка файла",
    step_extract: "Распаковка",
    step_starting: "Запуск локальной модели",
    step_ready: "Готово.",
    hermesHint: "Открытый агент от Nous Research. Ставится официальным установщиком. Ему нужна модель с контекстом 64K, поэтому он использует ваш ключ Claude или OpenAI; локальная модель 1.5B для него слишком мала.",
    install: "Установить Hermes Agent",
    reinstall: "Переустановить",
    hermesInstalled: "Установлено. Задачи использует: {provider}",
    hermesNeedsCloud: "Установлено. Добавьте ключ Claude или OpenAI, чтобы запускать задачи.",
    hermesMissing: "Не установлено.",
    hstep_download: "Скачивание официального установщика",
    hstep_install: "Установка. Это может занять несколько минут.",
    hstep_ready: "Установлено.",
    taskPh: "Попробуйте задачу, например перечисли файлы на рабочем столе",
    run: "Запустить",
    working: "Выполняется...",
    pairTitle: "Связать с аккаунтом Aspire",
    pairHint: "В Aspire откройте Настройки > Desktop и получите 10-символьный код. Каждое действие из Aspire сначала спросит вас в окне здесь.",
    pair: "Связать",
    unpair: "Отвязать этот компьютер",
    p_unpaired: "Не связано.",
    p_connected: "Связано как {device}.",
    p_offline: "Связано как {device}, но нет сети. Повтор.",
    p_unlinked: "Этот компьютер отвязан в Aspire. Получите новый код, чтобы связать снова.",
    p_server_missing: "Связано как {device}. Сервер Aspire пока не поддерживает действия на компьютере.",
    autostart: "Запускать Aspire при входе в систему",
    dataDir: "Папка данных: {dir}",
  },
  de: {
    brain: "Gehirn",
    brainHint: "Welche KI antwortet. Das lokale Modell ist privat und funktioniert offline.",
    local: "Lokales Qwen2.5 1.5B (Standard, privat)",
    claude: "Claude-API-Schlüssel",
    openai: "OpenAI-API-Schlüssel",
    keyPh: "API-Schlüssel einfügen",
    modelPh: "OpenAI-Modell, z. B. gpt-5-mini",
    save: "Speichern",
    forget: "Gespeicherten Schlüssel entfernen",
    keyHint: "Der Schlüssel liegt nur im Schlüsselbund des Systems, nie in einer Datei.",
    brainReady: "Bereit: {model}",
    brainWaiting: "Noch nicht bereit: {model}",
    localTitle: "Lokales Modell",
    localWhat: "Lädt den offiziellen llama.cpp-Server ({server}, github.com/ggml-org/llama.cpp) und Qwen2.5 1.5B Instruct ({model}, huggingface.co/Qwen). Downloads werden nach Abbruch fortgesetzt und per SHA-256 geprüft.",
    download: "Laden und starten",
    resume: "Download fortsetzen",
    startAgain: "Erneut starten",
    setupAll: "Alles laden und installieren",
    setupHint: "Ein Klick lädt das lokale Modell (Qwen2.5 1.5B mit dem llama.cpp-Server) und installiert Hermes Agent. Vor dem Klick wird nichts geladen.",
    localRunning: "Installiert und aktiv.",
    localInstalled: "Installiert. Startet bei Bedarf.",
    localMissing: "Noch nicht geladen.",
    step_server: "Lade den llama.cpp-Server",
    step_model: "Lade Qwen2.5 1.5B",
    step_verify: "Prüfe die Datei",
    step_extract: "Entpacke",
    step_starting: "Starte das lokale Modell",
    step_ready: "Bereit.",
    hermesHint: "Der Open-Source-Agent von Nous Research, installiert mit dem offiziellen Installer. Er braucht ein Modell mit 64K Kontext und nutzt daher deinen Claude- oder OpenAI-Schlüssel; das lokale 1.5B-Modell ist dafür zu klein.",
    install: "Hermes Agent installieren",
    reinstall: "Neu installieren",
    hermesInstalled: "Installiert. Aufgaben nutzen: {provider}",
    hermesNeedsCloud: "Installiert. Füge einen Claude- oder OpenAI-Schlüssel hinzu, um Aufgaben auszuführen.",
    hermesMissing: "Nicht installiert.",
    hstep_download: "Lade den offiziellen Installer",
    hstep_install: "Installiere. Das kann einige Minuten dauern.",
    hstep_ready: "Installiert.",
    taskPh: "Probier eine Aufgabe, z. B. liste die Dateien auf meinem Schreibtisch",
    run: "Ausführen",
    working: "Arbeite...",
    pairTitle: "Mit deinem Aspire-Konto verbinden",
    pairHint: "Öffne in Aspire Einstellungen > Desktop für einen 10-stelligen Code. Jede Aktion von Aspire fragt dich hier zuerst in einem Fenster.",
    pair: "Verbinden",
    unpair: "Diesen Computer trennen",
    p_unpaired: "Nicht verbunden.",
    p_connected: "Verbunden als {device}.",
    p_offline: "Verbunden als {device}, aber offline. Neuer Versuch läuft.",
    p_unlinked: "Dieser Computer wurde in Aspire getrennt. Hol dir einen neuen Code zum Verbinden.",
    p_server_missing: "Verbunden als {device}. Der Aspire-Server bietet Desktop-Aktionen noch nicht an.",
    autostart: "Aspire beim Anmelden starten",
    dataDir: "Datenordner: {dir}",
  },
};

let lang = "en";
let last = null;
let busy = false;
let pending = null; // a cloud brain picked before its key is saved

const t = (key, vars = {}) =>
  (T[lang][key] ?? T.en[key] ?? key).replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ""));

function mb(bytes) {
  return bytes >= 1e9 ? `${(bytes / 1073741824).toFixed(2)} GB` : `${Math.round(bytes / 1048576)} MB`;
}

function setState(el, text, kind) {
  el.textContent = text;
  el.className = `state${kind ? ` ${kind}` : ""}`;
}

// The last error of an action, by status element id; render() keeps showing it for a while.
const errs = {};

function show(el, text, kind) {
  const e = errs[el.id];
  if (e && Date.now() < e.until) setState(el, e.msg, "bad");
  else setState(el, text, kind);
}

function applyLang() {
  document.documentElement.lang = lang;
  $("lang").value = lang;
  for (const el of document.querySelectorAll("[data-t]")) el.textContent = t(el.dataset.t);
  $("key").placeholder = t("keyPh");
  $("model").placeholder = t("modelPh");
  $("task").placeholder = t("taskPh");
  if (last) render(last);
}

function render(s) {
  last = s;
  $("version").textContent = `Aspire Desktop ${s.version}`;

  // Brain
  const chosen = pending ?? s.brain.provider;
  for (const r of document.querySelectorAll('input[name="provider"]')) r.checked = r.value === chosen;
  $("key-box").hidden = chosen === "local";
  $("model-row").hidden = chosen !== "openai";
  $("forget-key").hidden = chosen === "local" || !s.keys[chosen];
  if (document.activeElement !== $("model")) $("model").value = s.openaiModel;
  show($("brain-state"), t(s.brain.ready ? "brainReady" : "brainWaiting", { model: s.brain.model }), s.brain.ready ? "ok" : "");

  // Local model
  const L = s.local;
  const p = L.progress;
  $("local-what").textContent = t("localWhat", { server: mb(L.serverBytes), model: mb(L.modelBytes) });
  $("install-local").hidden = L.installed && !p.error;
  $("install-local").disabled = p.running;
  // "Start again" when the files are there but the server failed; "Resume" when a download stopped.
  $("install-local").textContent = t(L.installed && p.error ? "startAgain" : p.error || L.partial > 0 ? "resume" : "download");
  const bar = $("local-bar");
  bar.hidden = !(p.running && p.total > 0);
  bar.firstElementChild.style.width = p.total ? `${Math.min(100, (p.done / p.total) * 100).toFixed(1)}%` : "0";
  if (p.running) {
    const pct = p.total ? ` ${mb(p.done)} / ${mb(p.total)}` : "";
    show($("local-state"), `${t(`step_${p.step}`)}${pct}`);
  } else if (p.error) {
    show($("local-state"), p.error, "bad");
  } else {
    show($("local-state"), t(L.running ? "localRunning" : L.installed ? "localInstalled" : "localMissing"), L.running ? "ok" : "");
  }

  // Hermes
  const H = s.hermes;
  const hp = H.progress;
  $("install-hermes").disabled = hp.running;
  $("install-hermes").textContent = t(H.installed ? "reinstall" : "install");
  if (hp.running) show($("hermes-state"), t(`hstep_${hp.step}`));
  else if (hp.error) show($("hermes-state"), hp.error, "bad");
  else if (!H.installed) show($("hermes-state"), t("hermesMissing"));
  else if (H.provider) show($("hermes-state"), t("hermesInstalled", { provider: H.provider === "anthropic" ? "Claude" : "OpenAI" }), "ok");
  else show($("hermes-state"), t("hermesNeedsCloud"));
  $("setup-box").hidden = (L.installed && H.installed) || p.running || hp.running;
  $("hermes-note").textContent = hp.note ?? "";
  $("run-task").disabled = busy || H.busy || !H.installed || !H.provider;

  // Pairing
  const P = s.pairing;
  const device = P.device ?? "";
  show($("pair-state"), t(`p_${P.status}`, { device }), P.status === "connected" ? "ok" : P.status === "unlinked" ? "bad" : "");
  $("unpair").hidden = !P.paired;

  if (document.activeElement !== $("autostart")) $("autostart").checked = s.autostart;
  $("data-dir").textContent = t("dataDir", { dir: s.dataDir });
}

async function refresh() {
  try {
    render(await invoke("app_status"));
  } catch (e) {
    console.error(e);
  }
}

async function act(fn, stateEl) {
  if (stateEl) delete errs[stateEl.id];
  try {
    await fn();
  } catch (e) {
    if (stateEl) errs[stateEl.id] = { msg: String(e), until: Date.now() + 10000 };
    return false;
  } finally {
    await refresh();
  }
  return true;
}

function bind() {
  $("lang").addEventListener("change", async () => {
    lang = $("lang").value;
    applyLang();
    await invoke("set_lang", { lang }).catch(() => {});
  });

  for (const r of document.querySelectorAll('input[name="provider"]')) {
    r.addEventListener("change", async () => {
      if (r.value === "local" || (last && last.keys[r.value])) {
        pending = null;
        await act(() => invoke("brain_set", { provider: r.value }), $("brain-state"));
      } else if (last) {
        pending = r.value; // keep the key box open until a key is saved
        render(last);
        $("key").focus();
      }
    });
  }

  $("save-key").addEventListener("click", async () => {
    const provider = pending ?? last?.brain.provider;
    if (!provider || provider === "local") return;
    const key = $("key").value.trim();
    const model = $("model").value.trim();
    const ok = await act(() => invoke("brain_set", { provider, key: key || null, model: model || null }), $("brain-state"));
    if (ok) {
      pending = null;
      $("key").value = "";
      refresh();
    }
  });

  $("forget-key").addEventListener("click", () => {
    const provider = pending ?? last?.brain.provider;
    pending = null;
    if (provider && provider !== "local") act(() => invoke("brain_forget", { provider }), $("brain-state"));
  });

  $("install-local").addEventListener("click", () => act(() => invoke("local_install"), $("local-state")));
  $("install-hermes").addEventListener("click", () => act(() => invoke("hermes_install"), $("hermes-state")));
  $("setup-all").addEventListener("click", () => {
    act(() => invoke("local_install"), $("local-state"));
    act(() => invoke("hermes_install"), $("hermes-state"));
  });

  $("run-task").addEventListener("click", async () => {
    const task = $("task").value.trim();
    if (!task) return;
    busy = true;
    const out = $("task-out");
    out.hidden = false;
    out.textContent = t("working");
    try {
      out.textContent = await invoke("hermes_run", { task });
    } catch (e) {
      out.textContent = String(e);
    } finally {
      busy = false;
      refresh();
    }
  });

  $("pair").addEventListener("click", async () => {
    // Sent as typed (ABCDE-FGHJK); Rust normalises it the way the server does.
    const code = $("code").value;
    const ok = await act(() => invoke("pair", { code }), $("pair-state"));
    if (ok) $("code").value = "";
  });
  $("code").addEventListener("keydown", (e) => {
    if (e.key === "Enter") $("pair").click();
  });
  $("unpair").addEventListener("click", () => act(() => invoke("unpair"), $("pair-state")));

  $("autostart").addEventListener("change", (e) => act(() => invoke("set_autostart", { enabled: e.target.checked })));
}

async function start() {
  bind();
  let s = null;
  try {
    s = await invoke("app_status");
  } catch (e) {
    console.error(e);
  }
  const guess = (navigator.language || "en").slice(0, 2).toLowerCase();
  lang = s && T[s.lang] ? s.lang : T[guess] ? guess : "en";
  if (s && !T[s.lang]) invoke("set_lang", { lang }).catch(() => {});
  applyLang();
  if (s) render(s);
  setInterval(refresh, 1000);
}

start();
