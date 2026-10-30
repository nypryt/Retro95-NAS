# Win95 NAS

A Windows 95–styled Network Attached Storage for your own PC, living at
**`D:\NAS`**.

Upload files and folders, browse them in a fake 1995 Explorer, plug into your local
Docker engine, change the wallpaper, and switch on a CRT filter that smells faintly
of ozone. Files stay on your machine. Accounts are local too.

```
  ==========================================================
     Win95 NAS 1.0  -  a 1995 network drive
  ==========================================================
     Local:   http://localhost:4040
     Network: http://<your-ip>:4040
     Files:   D:\NAS\nas-data
     Data:    D:\NAS\data
  ==========================================================
```

## Start it

Double-click **`start.bat`** in `D:\NAS`.

The **first time** it runs, a Windows 95-style setup wizard appears and asks where
your NAS files should be stored. Pick any folder (the default is `D:\NAS\nas-data`),
choose the web port and tray options, then click **Finish**. The answer is saved to
`data\setup.json`; later starts go straight to the server.

To change the folder or options later, double-click **`setup.bat`** (or run
`start.bat --setup`). The wizard never deletes existing files or settings. If you
pick a different folder while files exist in the old one, it warns you first and
leaves the old files untouched.

Prefer the console? Run the server directly:

```bat
cd /d D:\NAS
python server.py
```

Then open <http://localhost:4040>. The browser opens automatically unless you pass
`--no-browser`.

Requirements: **Python 3.11+** (tested on 3.15). Everything else is the Python
standard library. Docker features need Docker Desktop with the `docker` CLI on PATH.

### Closing the console keeps the server running

On Windows the server also lives in the **system tray**. If you close the console
window, the server does not stop: it hands itself over to a hidden `pythonw.exe`
process, which waits for the port to be released and then keeps serving the NAS.
The tray icon stays in the notification area.

Right-click the tray icon for:

- **Open Win95 NAS** — open the web UI in your browser.
- **Open NAS folder** — show `nas-data` in Windows Explorer.
- **Show / hide console** — toggle a real console window for log output.
- **Exit** — really stop the server and remove the tray icon.

Server output from the tray process is written to **`data\server.log`**.

Optional flags:

```bat
python server.py --port 5050 --no-browser
python server.py --no-tray        # stay in the console; closing it stops the server
set NAS_ROOT=D:\MyStorage && python server.py
set NAS_LIMIT_GB=128 && python server.py
```

Use `--no-tray` when you want the old console-owned behaviour, for example while
debugging or running under a service wrapper.

`NAS_LIMIT_GB` changes the NAS size limit (default **64 GB**). It is mainly useful
for testing the "disk full" behaviour with a small value.

## First run and accounts

The first time you open the site, Win95 NAS shows its own Windows 95–style
**logon window** and asks you to create the first account. That account is the
administrator.

- The user name and password are saved locally in **`data\users.json`**.
- Passwords are hashed with **PBKDF2-SHA256** (210,000 iterations, random salt).
  The plain password is never written to disk.
- Sign-in sessions last **7 days** and are signed with a key in `data\session.key`.
  The cookie is `HttpOnly` and `SameSite=Lax`.
- Add more people, remove accounts, or change your password in
  **Control Panel → Users**.
- **Log off** from **Start → Log Off <name>…**.
- There is no email reset. If you forget the password, stop the server, delete
  `data\users.json`, and start it again to create a fresh first account.
- Every account shares the same NAS files for now. There are no per-user folders.

The logon screen is part of the website (`/login`), not a browser popup. Visiting
any page while signed out redirects there.

## Where everything lives

| Path | What it is |
| --- | --- |
| `nas-data\` | Your actual files and folders. Back this up. |
| `nas-data\Desktop\` | What you see on the Win95 desktop. |
| `data\settings.json` | Wallpaper, CRT, sound and desktop settings. |
| `data\users.json` | Local accounts (hashed passwords). Delete it to reset accounts. |
| `data\session.key` | Key used to sign login cookies. |
| `data\wallpapers\` | Uploaded wallpaper images. |
| `data\recycle\` | The Recycle Bin. |
| `data\tmp\` | Temporary ZIP archives. |
| `data\nas.ico` | Tray icon, generated automatically on first run. |
| `data\server.log` | Output from the tray process after the console is closed. |
| `public\icons\win95\` | The Windows 95 icon set (16/32/48 px transparent PNGs). |

The NAS root can be changed with the `NAS_ROOT` environment variable.

## What's inside

**The desktop**
- Classic desktop shortcuts with double-click to open.
- Real files and folders from `nas-data\Desktop` appear as desktop icons.
  Creating **New Folder** or **New Text Document** from the desktop menu shows the
  new icon immediately.
- Drag files from Windows straight onto the desktop to copy them in.
- Drag a selection box (marquee) on the desktop or in a folder.
- Drag icons around; positions are remembered.
- **Drag a file onto the Recycle Bin icon** to send it to the bin, with a red
  drop highlight while you hover.
- Right-click anywhere for a period-correct context menu, including rename,
  delete to the Recycle Bin, download, properties and **Send to Docker container**.
- Start menu with Programs, Documents, Settings, Find, Help, Run, Log Off and
  Shut Down.
- Taskbar with task buttons, pinned apps, CRT toggle, sound toggle and clock.
- **Pin apps to the taskbar**: right-click an app in the Start menu, a desktop
  shortcut, a window title bar or its task button, and choose **Pin to taskbar**.
  Pinned buttons open the app and show a pressed look while it is running.
- Draggable, resizable windows with minimize / maximize / close.
- **Window tiling / grid snapping**: drag a window to the left or right edge for
  a half-screen tile, or to a corner for a quarter tile. A blue preview shows
  where it will land. Drag the title bar to pull a tiled window back out, or
  right-click the title bar for explicit left / right / quarter snap choices.
- **Display scaling** in Control Panel → Desktop (75% to 150%) shrinks or
  enlarges the whole interface, so large monitors can show smaller icons and
  more windows. Windows keep their snapped positions when the scale changes.
- **Icon set** in Control Panel → Desktop switches every icon in the UI between
  **Classic** (the original hand-drawn set), **V2** (the current pixel art) and
  **Windows 95** (the real Windows 95 icons, stored as 16/32/48 px bitmaps in
  `public\icons\win95`). The Windows flag itself is the authentic 1992–2001
  logo, rasterised at 16–128 px so the About box and logon screen stay sharp.
  The choice is saved with the rest of the settings and applies to the desktop,
  Explorer, taskbar, Start menu, dialogs and apps. The page reloads once so
  every open window picks up the new set.

**The NAS**
- Upload files **and whole folders** (the folder tree is preserved).
- Drag files from Windows straight onto an Explorer window or the desktop.
- Create folders and text documents, rename with F2, delete to the Recycle Bin.
- Icon and Details views, sortable columns, address bar, folder tree, history.
- Download single files or selections as a ZIP.
- Image thumbnails, built-in viewer for images / text / PDF; audio and video open
  in the VLC-style player.
- Notepad that saves straight to the NAS.
- Recycle Bin with restore, permanent delete and empty.
- Find: search file and folder names across the NAS.
- `Open NAS folder` in Control Panel → System opens the real folder in Windows.
- **64 GB storage limit.** My Computer shows a storage banner and the status bar
  shows used / limit / free space. Control Panel → System shows the same numbers.
  Uploads, new text files and saves are refused with a clear message once the
  limit would be exceeded. Set `NAS_LIMIT_GB` to change it.
- **File Properties** show the friendly size, the exact byte count, and for
  folders the number of files and subfolders they contain.

**Microsoft Office**
- **Word, Excel and PowerPoint** are real apps in the Start menu
  (**Programs → Microsoft Office**), can be pinned to the taskbar, and appear in
  the New menus.
- Double-click a `.docx`, `.xlsx` or `.pptx` file to open it in its app.
- **Word**: read-only page layout with headings, numbered and bulleted lists,
  tables, inline images, zoom and fit-to-width. `.docx` and `.docm` are supported;
  `.rtf` is rendered as text.
- **Excel**: real grid with sheet tabs, column/row headers, a formula bar,
  cell selection and keyboard navigation, plus frozen headings. `.xlsx` and
  `.xlsm` are supported.
- **PowerPoint**: slide thumbnails, a fitted slide stage, text boxes, tables,
  pictures and backgrounds, plus a full-screen slideshow. `.pptx`, `.pptm` and
  `.ppsx` are supported.
- **Create new documents**: right-click the Desktop or a folder and choose
  **New Word Document / New Excel Worksheet / New PowerPoint Presentation**, or
  use **New...** in an Office app. The files are valid Office Open XML and open in
  real Microsoft Office.
- Legacy binary `.doc`, `.xls`, `.ppt` and `.pps` files show a best-effort text
  notice with a download option instead of failing silently.
- No Office installation, no `python-docx` and no external converters are needed;
  parsing and creation use the Python standard library.

**VLC media player**
- Audio and video files open in a dedicated dark, VLC-style player instead of the
  browser's plain `<video>` element.
- Play / pause, stop, previous / next, seek bar with buffered range, volume and
  mute, playback speed (0.25× to 2×), and a status line with resolution, length
  and file size.
- **Playlist** built automatically from the other audio and video files in the
  same folder, with auto-advance to the next track.
- **Subtitles**: `.srt` and `.vtt` files in the same folder are listed in the
  Subtitle menu, and a matching same-name subtitle is loaded automatically.
  `.srt` is converted to WebVTT in the browser.
- Audio-track menu, **snapshot** to PNG, full-screen mode, and a media picker
  (**Open Media...**) that searches Videos, Music, Shared, Desktop and the NAS root.
- Playback uses the browser's own decoders. MP4 (H.264/AAC), WebM, Ogg, MP3 and
  WAV work; unsupported formats show a clear message with a download link.
- The player is a single window: opening another file retargets the existing
  player instead of stacking up windows.

**Command Prompt**
- Start → Programs → Accessories → **Command Prompt**, or the desktop shortcut.
- A real prompt backed by a safe, whitelisted command interpreter. Every path is
  confined to the NAS folder; there is no arbitrary shell access.
- Commands: `DIR`, `CD`, `TYPE`, `TREE`, `MKDIR`, `RMDIR`, `DEL`, `COPY`, `MOVE`,
  `REN`, `ECHO`, `CLS`, `PWD`, `VOL`, `VER`, `DATE`, `TIME`, `WHOAMI`,
  `HOSTNAME`, `IPCONFIG`, `PING`, `TASKLIST`, `START`, `DOCKER`, `TAILSCALE`,
  `EXIT` and `HELP`.
- Arrow Up / Down recall history, Tab completes file names, and `VOL` prints the
  current storage usage. Windows-style paths such as `C:\NAS\Documents` also work.
- `DEL` and `RMDIR` move things to the Recycle Bin rather than erasing them.
- The old pretend prompt is still available as **MS-DOS Prompt**.

**Tailscale**
- Start → Programs → **Tailscale**, the desktop shortcut, or run `tailscale`.
- Shows the client state, your tailnet, MagicDNS name, this PC's Tailscale IPs,
  and every peer device with its IP, OS and online state.
- Device names show the Tailscale **nickname plus the PC name**, for example
  `Cool-Pc (Desktop-TEE123)`. When the admin console has no nickname set, the
  first part of the MagicDNS name is used instead.
- **Connect / Disconnect**, **Refresh** and **Net check**.
- Select a device to see its details, copy its IP, **ping** it, or use it as an
  **exit node**.
- Settings tab: change this device's name, choose an exit node, accept subnet
  routes, and advertise this PC as an exit node.
- Uses the Tailscale CLI already installed on this PC
  (`C:\Program Files\Tailscale\tailscale.exe`). Nothing is sent anywhere except
  through Tailscale itself.

**Docker**
- Docker Manager: list containers, start / stop / restart / pause / remove.
- Browse a container's filesystem, read logs with auto-refresh, inspect JSON.
- Save files or folders from a container onto this PC (`/Docker Backups/...`).
- Right-click any NAS file → **Send to Docker container**.
- List, create and remove volumes; back up a volume to `.tar.gz` on the NAS;
  restore a backup into a volume. A small `busybox`/`alpine` helper is used.

**The fun stuff**
- Control Panel with Background, Display Effects, Sounds, Desktop, System,
  Users and Advanced tabs.
- 16 wallpaper patterns, solid colours, and your own pictures. Upload a picture
  with **Upload picture…** or drag an image onto the preview
  (PNG, JPG, GIF, WebP or BMP; stored in `data\wallpapers`).
- Fill / tile / center / stretch for image wallpapers.
- CRT simulation: scanlines, vignette, flicker, colour bleed, curvature, bezel,
  and a power-on animation. Toggle it from the system tray.
- Synthesized sound effects (Web Audio): startup chime, clicks, errors, shutdown.
- Screensavers: Starfield, Mystify, Flying Windows, or blank. Idle timeout is
  configurable.
- Boot screen, shutdown screen, welcome tips, About box.
- Minesweeper, including Expert mode, because tradition demands it.
- **Hand-drawn pixel-art icons**: every icon (My Computer, folders, files,
  Word / Excel / PowerPoint, VLC, Docker, Tailscale, the Recycle Bin and the rest)
  is drawn as 32×32 pixel art on a limited Windows 95 palette, then emitted as
  crisp SVG. Icons stay sharp at 16, 32, 48 and 64 pixels and follow the desktop
  icon-size setting.

## Keyboard shortcuts

| Keys | Action |
| --- | --- |
| `Ctrl`+`Esc` | Start menu |
| `Alt`+`F4` | Close the focused window |
| `F1` | Help |
| `F2` | Rename selected item |
| `Delete` | Send selected item to the Recycle Bin |
| `Ctrl`+`A` | Select all |
| `Ctrl`+`C` / `X` / `V` | Copy / cut / paste |
| `F5` | Refresh |
| `Backspace` | Up one folder |
| `Enter` | Open selected item |
| `Ctrl`+`Alt`+`D` | Docker Manager |
| `Ctrl`+`Alt`+`T` | Tailscale |
| `Ctrl`+`Alt`+`C` | Command Prompt |
| `Ctrl`+`Alt`+`Left` / `Right` | Snap the focused window to the left / right half |
| `Ctrl`+`Alt`+`Up` | Maximize the focused window |
| `Ctrl`+`Alt`+`Down` | Restore the focused window |

While the VLC-style player is focused:

| Keys | Action |
| --- | --- |
| `Space` / `K` | Play / pause |
| `S` | Stop |
| `N` / `P` | Next / previous track |
| `←` / `→` | Seek back / forward 5 seconds |
| `↑` / `↓` | Volume up / down |
| `M` | Mute |
| `F` | Full-screen |
| `L` | Show / hide the playlist |
| `[` / `]` | Slower / faster |
| `Esc` | Leave full-screen |

While Word, Excel or PowerPoint is focused:

| Keys | Action |
| --- | --- |
| `←` `→` `↑` `↓` | Move the selected cell (Excel) or scroll (Word / PowerPoint) |
| `Page Up` / `Page Down` | Previous / next slide (PowerPoint) |
| `F5` | Start the slideshow from the current slide (PowerPoint) |

## Notes and honesty

- This is a LAN tool with **local accounts**, not enterprise security. Use a real
  password. Anyone who can read `data\users.json` or the `data` folder on this PC
  can reset accounts, so keep Windows itself secure.
- Keep it on your own network. Do not expose the port directly to the internet.
- Docker actions are real. Removing a container or volume really removes it.
- The server binds `0.0.0.0` so other devices on your network can use it.
- Files are stored as ordinary files; there is no database and no lock-in.
- Python's `http.server` is fine for a home NAS, but it is not a hardened
  production web server.
