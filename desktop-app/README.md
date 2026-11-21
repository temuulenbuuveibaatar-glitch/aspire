# Aspire Desktop

A small native app for Windows and macOS, built with Rust and [Tauri 2](https://v2.tauri.app).

- Aspire (https://aspire-mn.vercel.app) opens in its own window. Sign in with the email code; Google or Apple sign-in may not work inside the app (Google limits sign-in in embedded windows). The window stays on Aspire and its sign-in pages; other links open in your browser after you click Allow. The app remembers the window size, has a tray (menu bar) icon with Show, Settings and Quit, and only one copy runs at a time. Closing the window keeps Aspire in the tray.
- **Brain.** By default a private local model, Qwen2.5 1.5B Instruct, runs on your computer through the official llama.cpp server. You can switch to Claude (`claude-opus-5-5`) or OpenAI with your own API key.
- **Hermes Agent** (Nous Research, MIT licence) is installed with its official installer, pinned to one release.
- **Desktop actions.** Link the app to your Aspire account and Aspire can open an app, open a link, type text, save a file or fill a form on your computer. Each action asks you first in an Allow / Deny window.

## Install

Download the installer only from this repository's **GitHub Releases** page, never from another site or a copy someone sends you.

- **Windows:** `Aspire_x.y.z_x64-setup.exe`, or the `.msi`.
- **macOS:** `Aspire_x.y.z_universal.dmg` (Apple Silicon and Intel). Drag Aspire to Applications.

### Check the download, then the unsigned app warning

The installers are free and not code-signed yet (signing certificates cost money; they come after the hackathon). So first check that the file really was built by this repository:

```
gh attestation verify <the downloaded file> --repo <owner>/<repo>
```

Only if that passes, get past the warning the system shows the first time:

- **Windows SmartScreen** ("Windows protected your PC"): click **More info**, then **Run anyway**.
- **macOS** ("cannot be opened because the developer cannot be verified"): in Applications, **right-click** (or Control-click) Aspire, choose **Open**, then **Open** again. On recent macOS versions you may instead need System Settings > Privacy & Security > **Open Anyway**.

## First run

1. Aspire opens, and so does the **Settings** window (you can reopen it from the tray icon).
2. Click **Download and install everything**: it downloads the local model and installs Hermes Agent. Nothing is downloaded until you click. (**Download and start** under **Local model** and **Install Hermes Agent** do each part on its own.)
3. Optional: to link your account, open Settings > Desktop in Aspire, copy the 10-character code (like `ABCDE-FGHJK`), paste it under **Link to your Aspire account**, and click **Link**.
4. Optional: turn on **Run Aspire when I log in**. Aspire then starts quietly in the tray.

## What is downloaded, and from where

| What | From | Size | Check |
|---|---|---|---|
| llama.cpp server, build `b12600` (Windows CPU x64 zip) | github.com/ggml-org/llama.cpp releases | 25.0 MB | SHA-256 pinned in code |
| llama.cpp server, build `b12600` (macOS arm64 / x64 tar.gz) | same | 16.6 MB / 12.4 MB | SHA-256 pinned in code |
| Qwen2.5-1.5B-Instruct `q4_k_m` GGUF (Apache-2.0) | huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF, commit `91cad51` | 1.04 GiB (1,117,320,736 bytes) | SHA-256 pinned in code |
| Hermes Agent installer script (`install.ps1` / `install.sh`) | raw.githubusercontent.com/NousResearch/hermes-agent, commit `caafe53` (release v0.23.3) | about 70-95 KB | SHA-256 pinned in code; it is not run if it does not match |

Downloads resume after an interruption: click the button again. A file whose size or SHA-256 does not match is deleted. Files are kept in the app data folder, which Settings shows (`%LOCALAPPDATA%\mn.aspire.desktop` on Windows, `~/Library/Application Support/mn.aspire.desktop` on macOS). The Hermes installer is told to install that same commit (`-Commit` / `--commit`), checks the uv it downloads against its own pinned SHA-256, and then downloads Python, git (when needed) and Hermes' Python packages into `%LOCALAPPDATA%\hermes` or `~/.hermes`. It runs without its browser and computer-use extras. To move to a newer Hermes release, update `HERMES_COMMIT` and both SHA-256 values in `src-tauri/src/hermes.rs` and ship a new Aspire release.

## Privacy

- With the local brain, your messages never leave your computer. llama-server listens only on `127.0.0.1`, on a free port, without its web page, and requires a random key that changes at every start. It stops when you quit Aspire, and also if Aspire crashes or is ended (on macOS at the next start). Choosing Claude or OpenAI stops it to free its memory.
- Your Claude and OpenAI API keys and the device token are stored **only in the system keychain** (Windows Credential Manager, macOS Keychain). They are never written to a file or a log, and never sent to the Aspire page. A key is sent only to its own provider (api.anthropic.com or api.openai.com). Hermes Agent gets a key only as an environment variable of the task it is running.
- Desktop actions: the app asks aspire-mn.vercel.app every 2 seconds for the next job, using its device token. A job can only be one of five fixed kinds. Each job is checked again on your computer and shown in full in an **Allow / Deny** window that stays on top. **Deny** is the default button (Enter or Space denies), **Allow** works only after 1.5 seconds, counted again every time the window gets the focus, and a job you do not answer is denied when it expires (5 minutes). Only one Allow / Deny window is ever open, whoever asked for it (a job, the Aspire page, a link or Hermes), so a click can never land on a hidden one. It runs only if you click Allow:
  - `open_app`: the app is found first, and the window names the exact program or app it will open: for a Start menu shortcut, the program it really runs (a shortcut that is not a plain `.exe` or passes arguments is refused), then Windows' installed-app list (a fixed PowerShell query with no input from the job); on macOS the `.app` bundles in /Applications and similar folders, opened with `open`. Terminals, shells, script hosts and interpreters (cmd, PowerShell, WSL and Linux distributions, Windows Terminal, wscript, mshta, rundll32, Python, Node.js, Terminal, Script Editor, Automator and others) are never opened, checked on both the name and the program.
  - `open_url`: opens `https://` links to public websites only (no IP addresses, `localhost` or local network names). The window shows the site on its own line above the full link.
  - `type_text`: types up to 2,000 characters; the window marks every key press of Enter and Tab. Click the target window within 3 seconds after you allow it.
  - `save_file`: saves a text file (`.txt .md .csv .tsv .json .log .ics .vcf`) with a plain name in `~/Aspire` only, and the window shows how it starts (up to 1,500 characters). It never overwrites a file and is limited to 200 KB. In `.csv` and `.tsv` files, a cell that starts with `=`, `+`, `-` or `@` (and is not a number) gets a leading `'`, so a spreadsheet app never runs it as a formula.
  - `fill_form`: types each value and presses Tab between them.
  The server can never run a command on your computer.
- The Aspire page in the main window can only check the brain's status, chat with the brain you chose (at most one request at a time and 20 a minute, with smaller requests and answers, and on your Claude or OpenAI key at most 300 requests and 3 million characters a day, counted across restarts; the local model has no daily limit), check the link status, and ask to open a page or an app. It cannot run Hermes, read keys, install anything or touch files.
- Opening a page or an app from the page (`desktop_open_url`, `desktop_open_app`) uses the same checks and Allow / Deny window as the `open_url` and `open_app` jobs above, and the window names exactly the link or the app it will open. At most 10 a minute; while any Allow / Deny window is open, more requests are refused, not queued. Links to other sites open in your browser, also after Allow. Mail links open your mail app only after Allow, with the recipient, subject and text shown decoded (links that add more recipients or attachments are refused); nothing is sent until you send it there. Links and popups from frames inside the page have a limit of their own, so they cannot use up the page's.

## Security

- **No secrets ship in the app.** The installers contain no API keys, passwords or tokens. Your Claude and OpenAI keys and the device token live in the OS keychain on your computer; the keys Aspire itself uses stay on the Aspire server.
- **Reverse engineering.** Release builds are compiled Rust with symbols and debug information stripped, whole-program (fat LTO) optimisation, one code unit and `panic = "abort"`, which makes the binary much harder to read. It is never impossible: anyone with the binary and enough time can study it. That is why nothing in the app is secret and every action is checked on your computer and asked of you first.
- **No developer tools.** Release builds have no web inspector, so the right-click menu has no "Inspect", and they ship no source maps. On Windows, Aspire also clears the WebView2 environment variables that could turn on remote debugging or load another browser build, and refuses to start with a remote-debugging argument. The main window loads Aspire from https://aspire-mn.vercel.app; only the small Settings and Allow / Deny pages are bundled. The build replaces the build machine's folder names in the paths compiled into the app.
- **The main window stays on Aspire.** It only shows Aspire, the sign-in pages Aspire's login needs (Aspire's own Clerk instance, Google, Apple, Cloudflare's bot check) and the players Aspire embeds. Only Aspire itself can use Aspire's commands. Any other page opens in your browser after you click Allow.
- **System programs by full path.** On Windows, PowerShell, Explorer, tasklist and taskkill are started from the Windows folder by full path, never by bare name (which would look in Aspire's own folder first).
- **Downloads.** llama-server and the model are checked against SHA-256 values pinned in the code, and llama-server runs only from Aspire's own data folder. The Hermes installer is checked the same way, saved to a new folder and checked again just before it runs; Hermes then lives where its installer puts it (see above).

## Choosing Claude or OpenAI

1. In Settings, under **Brain**, choose **Claude API key** or **OpenAI API key**.
2. Paste your key from console.anthropic.com or platform.openai.com, then click **Save**. For OpenAI you can also set the model (default `gpt-5-mini`).
3. To go back to the private local model, choose **Local Qwen2.5 1.5B**. **Remove the saved key** deletes the key from the keychain.

## Hermes Agent: what works

- Install runs only the pinned official installer (see the table above), as a saved file with fixed arguments: `powershell -ExecutionPolicy Bypass -File install.ps1 -Commit <commit> -NonInteractive -SkipBrowser -SkipComputerUse` on Windows, `bash install.sh --commit <commit> --non-interactive --skip-browser --skip-computer-use` on macOS. The installer's output goes to `hermes-install.log` in the data folder.
- Hermes Agent needs a model with at least 64K tokens of context. Qwen2.5 1.5B has 32K, so **Hermes tasks use your Claude or OpenAI key**. Without a key, Settings says so and Hermes does not run.
- Hermes and every program it starts can read the Claude or OpenAI key of the task, so a task that reads web pages or files could be tricked into sending the key elsewhere. The Allow window says so; give Hermes a key with a spending limit.
- Tasks run from the Settings window only. A task runs as `hermes chat -q "<task>" -Q --provider <anthropic|openai-api> -m <model> --max-turns 30`, limited to 10 minutes, after you click Allow. Without `--yolo`, Hermes keeps its own safety rules: in this unattended mode it blocks the commands it considers dangerous and looks for another way. Everything the task started is stopped at the time limit.
- On macOS the installer needs git. If Apple's Command Line Tools are not installed, macOS offers to install them.
- Hermes Agent's native Windows support is in early beta upstream.

## Building

Rust is not needed on your computer. `.github/workflows/desktop.yml` builds on GitHub Actions for every push to the `desktop-app` branch, and you can also start it by hand. It builds from the committed `src-tauri/Cargo.lock` (`--locked`), uses actions pinned to commit SHAs, and writes `SHA256SUMS` next to the installers. A `v*` tag also creates a draft GitHub Release with `SHA256SUMS.txt` and build provenance attestations (`gh attestation verify <file> --repo <owner>/<repo>`); only that release job can write to the repository. Code signing (Authenticode, Apple Developer ID with the hardened runtime and notarization) and an updater with a pinned signing key come after the hackathon; they need certificates and keys the owner adds as release-job secrets. To build locally instead, install Rust and run:

```
cd desktop-app
npm ci
npm run tauri build -- -- --locked
```

The icons in `src-tauri/icons` were generated from `app-icon.svg` with `npm run icons`.
