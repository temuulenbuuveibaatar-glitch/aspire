# Aspire Desktop

A small helper that lets Aspire do things on your computer: open an app or a web page, type
text into a window, save a text file, or fill a form. **Nothing happens until you allow it.**
Every job is printed in full in the helper's window and runs only when you type `y`
(Enter alone, anything else, or no answer within 5 minutes means no). Typed text and file
content are shown as numbered lines with a summary (characters, lines, how often Enter is
pressed) right above the question. For an app, the exact shortcut or program it starts is
shown; uninstall, setup and repair shortcuts are never picked unless asked for by name.

- Node.js 20 or newer, no other installs (no npm packages).
- Files are saved only in the `Aspire` folder in your home folder, never anywhere else, and
  never over an existing file. Only plain text files: .txt .md .csv .tsv .json .log .ics .vcf.
- When something fails, only a short reason goes back to Aspire, never a local folder path.
- Web pages open only for `https://` addresses.
- The helper never runs commands sent by the server. It only starts apps by name, opens
  links, types text and saves files.

## Start

1. In Aspire, open **Settings, Desktop** and press **Get pairing code**.
2. From the Aspire repository folder, run:

   ```
   node desktop/index.mjs
   ```

3. Type the 10-character code (letters and digits; dashes and spaces do not matter). The helper stores its device token in your config folder
   (readable only by you) and then waits for jobs. Keep the window open; Ctrl+C stops it.

Options:

- `--server https://your-aspire.example` talks to another Aspire server (http is allowed
  only for `localhost`). The `ASPIRE_URL` environment variable does the same.
- `--unpair` forgets the token on this computer. Also press **Unlink** in Aspire.

Where the token is stored:

| System  | Folder                                                  |
| ------- | ------------------------------------------------------- |
| Windows | `%APPDATA%\aspire-desktop\config.json`                  |
| macOS   | `~/Library/Application Support/aspire-desktop/config.json` |
| Linux   | `$XDG_CONFIG_HOME/aspire-desktop/config.json` (or `~/.config/...`) |

## Typing text and filling forms

After you type `y` you have 5 seconds to click the window (and the first field) to type into.
A form is filled by typing each value and pressing Tab between them.

### Windows

Uses PowerShell (built in). Apps open by common name (Notepad, Calculator, Paint, Edge, Word,
Excel...) or by the name of their Start menu shortcut.

### macOS

Apps open from `/Applications`, `/System/Applications` (and their Utilities folders) or
`~/Applications`. Text is pasted (Cmd+V) so every language comes out right, then your previous
text clipboard is put back (a picture on the clipboard is not kept). The first time, macOS asks
to let your terminal control the computer. Allow it in **System Settings, Privacy and Security,
Accessibility**.

### Linux

Apps open through their `.desktop` entry with `gtk-launch`, links with `xdg-open`. Typing needs
`xdotool` on an X11 session (for example `sudo apt install xdotool`); Wayland is not supported.
