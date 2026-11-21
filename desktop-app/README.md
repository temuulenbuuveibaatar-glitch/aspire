# Aspire Desktop

A small native app for Windows and macOS, built with Rust and [Tauri 2](https://v2.tauri.app).

- Aspire (https://aspire-mn.vercel.app) opens in its own window. Sign-in works as it does in the browser. The app remembers the window size, has a tray (menu bar) icon with Show, Settings and Quit, and only one copy runs at a time. Closing the window keeps Aspire in the tray.
- **Brain.** By default a private local model, Qwen2.5 1.5B Instruct, runs on your computer through the official llama.cpp server. You can switch to Claude (`claude-opus-5-5`) or OpenAI with your own API key.
- **Hermes Agent** (Nous Research, MIT licence) can be installed with its official installer.
- **Desktop actions.** Link the app to your Aspire account and Aspire can open an app, open a link, type text, save a file or fill a form on your computer. Each action asks you first in a native window.

## Install

Download the installer from the repository's GitHub Actions run (artifact `aspire-desktop-Windows` or `aspire-desktop-macOS`) or from a GitHub Release.

- **Windows:** `Aspire_x.y.z_x64-setup.exe`, or the `.msi`.
- **macOS:** `Aspire_x.y.z_universal.dmg` (Apple Silicon and Intel). Drag Aspire to Applications.

### Unsigned app warnings

The installers are not code-signed yet, so the system warns you the first time:

- **Windows SmartScreen** ("Windows protected your PC"): click **More info**, then **Run anyway**.
- **macOS** ("cannot be opened because the developer cannot be verified"): in Applications, **right-click** (or Control-click) Aspire, choose **Open**, then **Open** again. On recent macOS versions you may instead need System Settings > Privacy & Security > **Open Anyway**.

## First run

1. Aspire opens, and so does the **Settings** window (you can reopen it from the tray icon).
2. Under **Local model**, click **Download and start**. Nothing is downloaded until you click it.
3. Optional: to link your account, open Settings > Desktop in Aspire, copy the 6-digit code, paste it under **Link to your Aspire account**, and click **Link**.
4. Optional: click **Install Hermes Agent**.
5. Optional: turn on **Run Aspire when I log in**.

## What is downloaded, and from where

| What | From | Size | Check |
|---|---|---|---|
| llama.cpp server, build `b12600` (Windows CPU x64 zip) | github.com/ggml-org/llama.cpp releases | 25.0 MB | SHA-256 pinned in code |
| llama.cpp server, build `b12600` (macOS arm64 / x64 tar.gz) | same | 16.6 MB / 12.4 MB | SHA-256 pinned in code |
| Qwen2.5-1.5B-Instruct `q4_k_m` GGUF (Apache-2.0) | huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF | 1.04 GiB (1,117,320,736 bytes) | SHA-256 pinned in code |
| Hermes Agent installer script (`install.ps1` / `install.sh`) | hermes-agent.nousresearch.com | small | SHA-256 shown in Settings; the script changes over time, so it cannot be pinned |

Downloads resume after an interruption: click the button again. A file whose size or SHA-256 does not match is deleted. Files are kept in the app data folder, which Settings shows (`%LOCALAPPDATA%\mn.aspire.desktop` on Windows, `~/Library/Application Support/mn.aspire.desktop` on macOS). The Hermes installer then downloads its own parts (uv, Python and git when needed) into `%LOCALAPPDATA%\hermes` or `~/.hermes`. It runs without its browser and computer-use extras.

## Privacy

- With the local brain, your messages never leave your computer. llama-server listens only on `127.0.0.1`, on a free port, and requires a random key that changes at every start. It stops when you quit Aspire.
- Your Claude and OpenAI API keys and the device token are stored **only in the system keychain** (Windows Credential Manager, macOS Keychain). They are never written to a file or a log, and never sent to the Aspire page. A key is sent only to its own provider (api.anthropic.com or api.openai.com). Hermes Agent gets a key only as an environment variable of the task it is running.
- Desktop actions: the app asks aspire-mn.vercel.app every 2 seconds for the next job, using its device token. A job can only be one of five fixed kinds. Each job is checked again on your computer, shown in a native **Allow / Deny** window, and runs only if you click Allow:
  - `open_app`: opens an app found by name among the Start menu shortcuts (Windows) or in /Applications (macOS). No shell is used.
  - `open_url`: opens `https://` links only.
  - `type_text`: types up to 2,000 characters. Click the target window within 3 seconds after you allow it.
  - `save_file`: saves a plain file name in `~/Aspire` only. It never overwrites a file and is limited to 200 KB.
  - `fill_form`: types each value and presses Tab between them.
  The server can never run a command on your computer.
- The Aspire page in the main window can only check the brain's status, chat with the brain you chose, check the link status and ask Hermes Agent for a task. Each Hermes task needs your Allow first. The page cannot read keys, install anything or touch files.

## Choosing Claude or OpenAI

1. In Settings, under **Brain**, choose **Claude API key** or **OpenAI API key**.
2. Paste your key from console.anthropic.com or platform.openai.com, then click **Save**. For OpenAI you can also set the model (default `gpt-5-mini`).
3. To go back to the private local model, choose **Local Qwen2.5 1.5B**. **Remove the saved key** deletes the key from the keychain.

## Hermes Agent: what works

- Install runs only the official installer, as a saved file with fixed arguments: `powershell -ExecutionPolicy Bypass -File install.ps1 -NonInteractive -SkipBrowser -SkipComputerUse` on Windows, `bash install.sh --non-interactive --skip-browser --skip-computer-use` on macOS. The installer's output goes to `hermes-install.log` in the data folder.
- Hermes Agent needs a model with at least 64K tokens of context. Qwen2.5 1.5B has 32K, so **Hermes tasks use your Claude or OpenAI key**. Without a key, Settings says so and Hermes does not run.
- A task runs as `hermes chat -q "<task>" -Q --yolo --provider <anthropic|openai-api> -m <model> --max-turns 30`, limited to 10 minutes, after you click Allow. `--yolo` means Hermes does not ask again during that task. The Allow window says this.
- On macOS the installer needs git. If Apple's Command Line Tools are not installed, macOS offers to install them.
- Hermes Agent's native Windows support is in early beta upstream.

## Building

Rust is not needed on your computer. `.github/workflows/desktop.yml` builds on GitHub Actions for every push to the `desktop-app` branch, and you can also start it by hand. A `v*` tag also creates a draft GitHub Release. To build locally instead, install Rust and run:

```
cd desktop-app
npm ci
npm run tauri build
```

The icons in `src-tauri/icons` were generated from `app-icon.svg` with `npm run icons`.
