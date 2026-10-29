"""Win95 NAS - first-run setup wizard.

A small Windows 95-styled Tkinter wizard that asks where NAS files should be
stored (plus a few server options) and saves the answer to ``data/setup.json``.

``start.bat`` runs this automatically the first time, and ``setup.bat`` can be
used later to change the settings.  A headless mode is available for scripts::

    python setup_gui.py --no-gui --root "D:\\NAS\\nas-data" --port 4040
"""

from __future__ import annotations

import json
import os
import shutil
import socket
import sys
from datetime import datetime
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
SETUP_FILE = DATA_DIR / "setup.json"
DEFAULT_ROOT = BASE_DIR / "nas-data"
FLAG_FILE = BASE_DIR / "public" / "icons" / "win95" / "flag-32.png"
ICON_FILE = DATA_DIR / "nas.ico"

# Classic Windows 95 palette.
BG = "#c0c0c0"
FACE = "#c0c0c0"
LIGHT = "#ffffff"
DARK = "#000000"
SHADOW = "#808080"
NAVY = "#000080"
WHITE = "#ffffff"
GRAY = "#404040"

FONT = ("MS Sans Serif", 9)
FONT_BOLD = ("MS Sans Serif", 9, "bold")
FONT_SMALL = ("MS Sans Serif", 8)
FONT_TITLE = ("MS Sans Serif", 15, "bold")
FONT_SUB = ("MS Sans Serif", 9)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def human_size(num: float) -> str:
    value = float(max(0, num))
    for unit in ("bytes", "KB", "MB", "GB", "TB"):
        if value < 1024 or unit == "TB":
            return ("%d %s" % (value, unit)) if unit == "bytes" else ("%.1f %s" % (value, unit))
        value /= 1024
    return "%.1f TB" % value


def folder_summary(path: Path) -> str:
    """A short 'what is in this folder' line for the storage page."""
    try:
        if not path.exists():
            return "This folder does not exist yet - it will be created."
        if not path.is_dir():
            return "This is a file, not a folder."
        count = 0
        for _ in path.iterdir():
            count += 1
        try:
            free = shutil.disk_usage(path).free
            free_text = human_size(free) + " free"
        except OSError:
            free_text = "free space unknown"
        if count:
            return "Existing folder - %d item%s - %s" % (count, "" if count == 1 else "s", free_text)
        return "Empty folder - %s" % free_text
    except OSError as exc:
        return "Cannot read this folder: %s" % exc


def resolve_root(text: str) -> Path:
    raw = (text or "").strip().strip('"').strip("'")
    raw = os.path.expandvars(os.path.expanduser(raw))
    path = Path(raw)
    if not path.is_absolute():
        path = BASE_DIR / path
    return path.resolve()


def looks_like_win95nas(port: int) -> bool:
    """True when the port is already serving the Win95 NAS web desktop."""
    import http.client
    try:
        conn = http.client.HTTPConnection("127.0.0.1", int(port), timeout=0.6)
        conn.request("GET", "/")
        response = conn.getresponse()
        server = response.getheader("Server") or ""
        body = response.read(4096).decode("utf-8", "replace")
        conn.close()
        return "Win95NAS" in server.replace(" ", "") or "Win95 NAS" in body
    except Exception:
        return False


def port_is_busy(port: int) -> bool:
    port = int(port)
    # Something already accepting connections on this port?
    try:
        with socket.create_connection(("127.0.0.1", port), timeout=0.35):
            return True
    except OSError:
        pass
    # Windows allows binding a specific address while 0.0.0.0 is in use, so
    # also try the wildcard bind the server itself uses.
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.settimeout(0.35)
    try:
        sock.bind(("0.0.0.0", port))
        return False
    except OSError:
        return True
    finally:
        try:
            sock.close()
        except OSError:
            pass


def write_config(root: Path, port: int = 4040, tray: bool = True,
                 open_browser: bool = True, limit_gb: float = 64) -> dict:
    """Validate the basics, create the folder and save data/setup.json."""
    root = resolve_root(str(root))
    if root.exists() and not root.is_dir():
        raise ValueError("The NAS storage path is a file, not a folder.")
    root.mkdir(parents=True, exist_ok=True)
    probe = root / ".win95nas-write-test"
    try:
        probe.write_text("ok", encoding="utf-8")
        probe.unlink()
    except OSError as exc:
        raise ValueError("That folder is not writable: %s" % exc) from exc

    config = {
        "version": 1,
        "root": str(root),
        "port": int(port),
        "tray": bool(tray),
        "openBrowser": bool(open_browser),
        "storageLimitGb": float(limit_gb),
        "createdAt": datetime.now().isoformat(timespec="seconds"),
    }
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    tmp = SETUP_FILE.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(config, indent=2) + "\n", encoding="utf-8")
    os.replace(tmp, SETUP_FILE)
    return config


def load_config() -> dict:
    try:
        data = json.loads(SETUP_FILE.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except (OSError, ValueError):
        return {}


# ---------------------------------------------------------------------------
# The wizard
# ---------------------------------------------------------------------------

class Wizard:
    def __init__(self):
        import tkinter as tk
        from tkinter import filedialog, messagebox

        self.tk = tk
        self.filedialog = filedialog
        self.messagebox = messagebox
        self.result = None
        self.page = 0
        self._root_path = DEFAULT_ROOT
        self._confirmed_root = None

        self.root = tk.Tk()
        self.root.title("Win95 NAS Setup")
        self.root.configure(bg=BG)
        self.root.resizable(False, False)
        try:
            self.root.iconbitmap(default=str(ICON_FILE))
        except Exception:
            pass

        self.flag_img = None
        try:
            self.flag_img = tk.PhotoImage(master=self.root, file=str(FLAG_FILE))
        except Exception:
            self.flag_img = None

        self._build()
        self._prefill()
        self._center(640, 500)
        self._show(0)
        self.root.after(60, self._raise_window)
        self.root.bind("<Return>", lambda _e: self._next())
        self.root.bind("<Escape>", lambda _e: self._cancel())
        self.root.protocol("WM_DELETE_WINDOW", self._cancel)

    # -- layout ---------------------------------------------------------
    def _prefill(self) -> None:
        """Show the saved values when setup.bat is run again."""
        config = load_config()
        if not config:
            return
        if config.get("root"):
            self.root_var.set(str(config["root"]))
        if config.get("port"):
            self.port_var.set(str(config["port"]))
        if config.get("storageLimitGb"):
            self.limit_var.set(str(config["storageLimitGb"]))
        self.tray_var.set(bool(config.get("tray", True)))
        self.browser_var.set(bool(config.get("openBrowser", True)))
        try:
            self._confirmed_root = Path(config["root"]).expanduser().resolve()
        except (KeyError, OSError):
            self._confirmed_root = None

    def _raise_window(self) -> None:
        try:
            self.root.lift()
            self.root.focus_force()
        except Exception:
            pass

    def _center(self, width: int, height: int) -> None:
        self.root.update_idletasks()
        x = max(0, (self.root.winfo_screenwidth() - width) // 2)
        y = max(0, (self.root.winfo_screenheight() - height) // 2)
        self.root.geometry("%dx%d+%d+%d" % (width, height, x, y))

    def _build(self) -> None:
        tk = self.tk
        # Header
        header = tk.Frame(self.root, bg=NAVY, height=78)
        header.pack(side="top", fill="x")
        header.pack_propagate(False)
        if self.flag_img is not None:
            tk.Label(header, image=self.flag_img, bg=NAVY, bd=0).pack(side="left", padx=(14, 10), pady=12)
        titles = tk.Frame(header, bg=NAVY)
        titles.pack(side="left", fill="y", pady=14)
        tk.Label(titles, text="Win95 NAS Setup", bg=NAVY, fg=WHITE, font=FONT_TITLE, anchor="w").pack(anchor="w")
        tk.Label(titles, text="Set up your personal 1995 network drive", bg=NAVY, fg="#d7d7ff",
                 font=FONT_SUB, anchor="w").pack(anchor="w", pady=(3, 0))

        # Body
        body = tk.Frame(self.root, bg=BG)
        body.pack(side="top", fill="both", expand=True, padx=10, pady=(10, 0))

        self.sidebar = tk.Frame(body, bg=WHITE, width=150, relief="sunken", bd=2)
        self.sidebar.pack(side="left", fill="y")
        self.sidebar.pack_propagate(False)
        tk.Label(self.sidebar, text="Setup steps", bg=WHITE, fg=GRAY, font=FONT_BOLD,
                 anchor="w").pack(fill="x", padx=12, pady=(14, 8))
        self.step_labels = []
        for text in ("Welcome", "Storage folder", "Server options", "Finish"):
            label = tk.Label(self.sidebar, text="\u25a0  " + text, bg=WHITE, fg=SHADOW,
                             font=FONT, anchor="w")
            label.pack(fill="x", padx=12, pady=4)
            self.step_labels.append(label)
        tk.Label(self.sidebar, text="Your files are never\nuploaded anywhere.",
                 bg=WHITE, fg=SHADOW, font=FONT_SMALL, justify="left",
                 anchor="w").pack(side="bottom", fill="x", padx=12, pady=14)

        content = tk.Frame(body, bg=BG)
        content.pack(side="left", fill="both", expand=True, padx=(10, 0))

        self.host = tk.Frame(content, bg=WHITE, relief="sunken", bd=2)
        self.host.pack(fill="both", expand=True)

        # Footer
        footer = tk.Frame(self.root, bg=BG)
        footer.pack(side="bottom", fill="x", padx=10, pady=10)
        self.back_btn = self._button(footer, "< Back", self._back, width=9)
        self.next_btn = self._button(footer, "Next >", self._next, width=9)
        self.cancel_btn = self._button(footer, "Cancel", self._cancel, width=9)
        self.cancel_btn.pack(side="left")
        self.next_btn.pack(side="right")
        self.back_btn.pack(side="right", padx=(0, 6))

        self.pages = []
        self._build_welcome()
        self._build_storage()
        self._build_options()
        self._build_finish()

    def _button(self, parent, text, command, width=9):
        tk = self.tk
        return tk.Button(parent, text=text, command=command, width=width,
                         font=FONT, relief="raised", bd=2, bg=FACE,
                         activebackground="#d4d0c8", activeforeground=DARK,
                         highlightthickness=0, takefocus=1)

    def _new_page(self):
        tk = self.tk
        page = tk.Frame(self.host, bg=WHITE)
        page.pack(fill="both", expand=True, padx=18, pady=16)
        self.pages.append(page)
        return page

    def _heading(self, page, text, sub=None):
        tk = self.tk
        tk.Label(page, text=text, bg=WHITE, fg=NAVY, font=FONT_BOLD,
                 anchor="w").pack(fill="x")
        if sub:
            tk.Message(page, text=sub, bg=WHITE, fg=GRAY, font=FONT, width=430,
                       justify="left", anchor="w").pack(fill="x", pady=(6, 10))
        else:
            tk.Frame(page, bg=WHITE, height=8).pack(fill="x")

    def _build_welcome(self):
        tk = self.tk
        page = self._new_page()
        self._heading(page, "Welcome to Win95 NAS",
                      "This wizard runs the first time you start Win95 NAS. It decides where "
                      "your network drive lives and how the server behaves. You can run "
                      "setup.bat again at any time to change it.")
        tk.Message(page, text=(
            "You will choose:\n"
            "    \u2022  the folder where NAS files are stored\n"
            "    \u2022  the port the web desktop listens on\n"
            "    \u2022  whether the server keeps running in the system tray\n\n"
            "Your existing settings, accounts and files are never deleted."
        ), bg=WHITE, fg=DARK, font=FONT, width=430, justify="left",
            anchor="w").pack(fill="x", pady=(4, 8))
        tk.Label(page, text="Click Next to begin.", bg=WHITE, fg=SHADOW,
                 font=FONT_SMALL, anchor="w").pack(fill="x", pady=(8, 0))

    def _build_storage(self):
        tk = self.tk
        page = self._new_page()
        self._heading(page, "Where should your files live?",
                      "Pick a folder for the NAS. It can be on any drive, including a USB "
                      "drive or a second hard disk. Win95 NAS will create Desktop, Documents, "
                      "Pictures and the other folders inside it.")
        tk.Label(page, text="NAS storage folder:", bg=WHITE, fg=DARK,
                 font=FONT, anchor="w").pack(fill="x", pady=(2, 3))

        row = tk.Frame(page, bg=WHITE)
        row.pack(fill="x")
        self.root_var = tk.StringVar(value=str(DEFAULT_ROOT))
        self.root_entry = tk.Entry(row, textvariable=self.root_var, font=FONT,
                                   relief="sunken", bd=2, bg=WHITE,
                                   insertbackground=DARK)
        self.root_entry.pack(side="left", fill="x", expand=True, ipady=3)
        self._button(row, "Browse...", self._browse, width=10).pack(side="left", padx=(6, 0))

        self.storage_info = tk.Label(page, text="", bg=WHITE, fg=GRAY,
                                     font=FONT_SMALL, anchor="w")
        self.storage_info.pack(fill="x", pady=(6, 0))
        self.existing_info = tk.Label(page, text="", bg=WHITE, fg=NAVY,
                                      font=FONT_SMALL, anchor="w", justify="left")
        self.existing_info.pack(fill="x", pady=(2, 0))

        actions = tk.Frame(page, bg=WHITE)
        actions.pack(fill="x", pady=(6, 0))
        self._button(actions, "Use default", self._use_default, width=12).pack(side="left")
        self._button(actions, "Open folder", self._open_folder, width=12).pack(side="left", padx=(6, 0))

        tk.Message(page, text=(
            "If you choose a folder that already contains files, they stay exactly where "
            "they are and become part of the NAS. Nothing is moved or deleted."
        ), bg=WHITE, fg=SHADOW, font=FONT_SMALL, width=430, justify="left",
            anchor="w").pack(fill="x", pady=(10, 0))

        self.root_var.trace_add("write", lambda *_: self._update_storage_info())

    def _build_options(self):
        tk = self.tk
        page = self._new_page()
        self._heading(page, "Server options",
                      "These can be changed later by running setup.bat again.")

        form = tk.Frame(page, bg=WHITE)
        form.pack(fill="x", pady=(2, 0))
        form.columnconfigure(1, weight=1)

        tk.Label(form, text="Web port:", bg=WHITE, fg=DARK, font=FONT,
                 anchor="w").grid(row=0, column=0, sticky="w", pady=4)
        self.port_var = tk.StringVar(value="4040")
        tk.Spinbox(form, from_=1024, to=65535, textvariable=self.port_var, width=8,
                   font=FONT, relief="sunken", bd=2, bg=WHITE).grid(row=0, column=1,
                                                                   sticky="w", padx=(10, 0))
        tk.Label(form, text="http://localhost:4040", bg=WHITE, fg=SHADOW,
                 font=FONT_SMALL).grid(row=0, column=2, sticky="w", padx=(10, 0))

        tk.Label(form, text="Storage limit:", bg=WHITE, fg=DARK, font=FONT,
                 anchor="w").grid(row=1, column=0, sticky="w", pady=4)
        self.limit_var = tk.StringVar(value="64")
        tk.Spinbox(form, from_=1, to=4096, textvariable=self.limit_var, width=8,
                   font=FONT, relief="sunken", bd=2, bg=WHITE).grid(row=1, column=1,
                                                                   sticky="w", padx=(10, 0))
        tk.Label(form, text="GB (the NAS refuses new files past this size)", bg=WHITE,
                 fg=SHADOW, font=FONT_SMALL).grid(row=1, column=2, sticky="w", padx=(10, 0))

        self.tray_var = tk.BooleanVar(value=True)
        tk.Checkbutton(page, text="Keep running in the system tray when the console closes",
                       variable=self.tray_var, bg=WHITE, activebackground=WHITE,
                       selectcolor=WHITE, font=FONT, anchor="w",
                       highlightthickness=0).pack(fill="x", pady=(12, 2))
        self.browser_var = tk.BooleanVar(value=True)
        tk.Checkbutton(page, text="Open Win95 NAS in my browser after it starts",
                       variable=self.browser_var, bg=WHITE, activebackground=WHITE,
                       selectcolor=WHITE, font=FONT, anchor="w",
                       highlightthickness=0).pack(fill="x", pady=2)

        tk.Message(page, text=(
            "The tray icon lets you reopen the NAS, show the console, open the storage "
            "folder, or exit the server without closing the console window."
        ), bg=WHITE, fg=SHADOW, font=FONT_SMALL, width=430, justify="left",
            anchor="w").pack(fill="x", pady=(12, 0))

    def _build_finish(self):
        tk = self.tk
        page = self._new_page()
        self._heading(page, "Ready to go",
                      "Review the settings below, then click Finish. Win95 NAS will "
                      "create the folder and start the server.")
        self.summary = tk.Message(page, text="", bg=WHITE, fg=DARK, font=FONT,
                                  width=430, justify="left", anchor="w")
        self.summary.pack(fill="x", pady=(2, 10))
        tk.Label(page, text="You can change these later with setup.bat.",
                 bg=WHITE, fg=SHADOW, font=FONT_SMALL, anchor="w").pack(fill="x")

    # -- navigation -----------------------------------------------------
    def _show(self, index: int) -> None:
        self.page = index
        for page in self.pages:
            page.pack_forget()
        self.pages[index].pack(fill="both", expand=True, padx=18, pady=16)
        for i, label in enumerate(self.step_labels):
            label.configure(fg=NAVY if i == index else SHADOW,
                            font=FONT_BOLD if i == index else FONT)
        self.back_btn.configure(state="normal" if index > 0 else "disabled")
        self.next_btn.configure(text="Finish" if index == len(self.pages) - 1 else "Next >")
        if index == 1:
            self._update_storage_info()
        if index == len(self.pages) - 1:
            self._update_summary()

    def _update_storage_info(self) -> None:
        try:
            path = resolve_root(self.root_var.get())
        except Exception:
            self.storage_info.configure(text="")
            self.existing_info.configure(text="")
            return
        self.storage_info.configure(text=folder_summary(path))

        # Point out where the current files live if a different folder is picked.
        previous = load_config().get("root")
        candidates = []
        for candidate in (previous, str(DEFAULT_ROOT)):
            if not candidate:
                continue
            try:
                candidate_path = Path(candidate).expanduser().resolve()
            except OSError:
                continue
            if candidate_path == path or candidate_path in candidates:
                continue
            try:
                if candidate_path.is_dir() and any(candidate_path.iterdir()):
                    count = sum(1 for _ in candidate_path.iterdir())
                    candidates.append((candidate_path, count))
            except OSError:
                continue
        if candidates:
            lines = ["Existing NAS files: %s (%d item%s)" % (p, c, "" if c == 1 else "s")
                     for p, c in candidates]
            self.existing_info.configure(text="\n".join(lines))
        else:
            self.existing_info.configure(text="")

    def _confirm_folder_change(self, path: Path) -> bool:
        """Warn when the new folder would leave an existing NAS behind."""
        previous = load_config().get("root")
        candidates = []
        for candidate in (previous, str(DEFAULT_ROOT)):
            if not candidate:
                continue
            try:
                candidate_path = Path(candidate).expanduser().resolve()
            except OSError:
                continue
            if candidate_path == path or candidate_path in [p for p, _ in candidates]:
                continue
            try:
                if candidate_path.is_dir() and any(candidate_path.iterdir()):
                    count = sum(1 for _ in candidate_path.iterdir())
                    candidates.append((candidate_path, count))
            except OSError:
                continue
        if not candidates:
            return True
        details = "\n".join("    %s (%d item%s)" % (p, c, "" if c == 1 else "s")
                            for p, c in candidates)
        return self.messagebox.askyesno(
            "Win95 NAS Setup",
            "Existing NAS files were found in:\n\n%s\n\n"
            "The folder you picked is different. Those files will stay where they are "
            "and will not appear in the new NAS.\n\n"
            "Continue with the new folder?" % details,
            parent=self.root)

    def _update_summary(self) -> None:
        root = self.root_var.get().strip() or str(DEFAULT_ROOT)
        self.summary.configure(text=(
            "Storage folder:\n    %s\n\n"
            "Web address:\n    http://localhost:%s\n\n"
            "System tray:\n    %s\n\n"
            "Open browser after start:\n    %s\n\n"
            "Storage limit:\n    %s GB"
        ) % (root, self.port_var.get().strip() or "4040",
             "Yes" if self.tray_var.get() else "No",
             "Yes" if self.browser_var.get() else "No",
             self.limit_var.get().strip() or "64"))

    # -- actions --------------------------------------------------------
    def _browse(self) -> None:
        try:
            start = str(resolve_root(self.root_var.get()))
        except Exception:
            start = str(DEFAULT_ROOT)
        chosen = self.filedialog.askdirectory(parent=self.root,
                                              title="Select the NAS storage folder",
                                              initialdir=start, mustexist=False)
        if chosen:
            self.root_var.set(str(Path(chosen)))

    def _use_default(self) -> None:
        self.root_var.set(str(DEFAULT_ROOT))

    def _open_folder(self) -> None:
        try:
            path = resolve_root(self.root_var.get())
            path.mkdir(parents=True, exist_ok=True)
        except Exception as exc:
            self.messagebox.showerror("Win95 NAS Setup", "Cannot open that folder:\n%s" % exc,
                                      parent=self.root)
            return
        try:
            if sys.platform == "win32":
                os.startfile(str(path))  # type: ignore[attr-defined]
            else:
                import subprocess
                subprocess.Popen(["xdg-open", str(path)])
        except Exception:
            pass

    def _validate_storage(self) -> bool:
        try:
            path = resolve_root(self.root_var.get())
        except Exception as exc:
            self.messagebox.showerror("Win95 NAS Setup", "That path is not valid:\n%s" % exc,
                                      parent=self.root)
            return False
        public_dir = BASE_DIR / "public"
        data_dir = BASE_DIR / "data"
        if (path == BASE_DIR or path == public_dir or path == data_dir
                or public_dir in path.parents or data_dir in path.parents):
            self.messagebox.showerror(
                "Win95 NAS Setup",
                "Please choose a separate folder for your files.\n\n"
                "This folder contains the Win95 NAS program or its settings. "
                "The default D:\\NAS\\nas-data folder is fine.",
                parent=self.root)
            return False
        if path.exists() and not path.is_dir():
            self.messagebox.showerror("Win95 NAS Setup",
                                      "That path points at a file, not a folder.",
                                      parent=self.root)
            return False
        try:
            path.mkdir(parents=True, exist_ok=True)
            probe = path / ".win95nas-write-test"
            probe.write_text("ok", encoding="utf-8")
            probe.unlink()
        except OSError as exc:
            self.messagebox.showerror("Win95 NAS Setup",
                                      "That folder cannot be used:\n%s" % exc,
                                      parent=self.root)
            return False
        if path != self._confirmed_root:
            if not self._confirm_folder_change(path):
                return False
            self._confirmed_root = path
        self._root_path = path
        self.root_var.set(str(path))
        return True

    def _validate_options(self) -> bool:
        try:
            port = int(self.port_var.get().strip())
        except ValueError:
            self.messagebox.showerror("Win95 NAS Setup", "The web port must be a number.",
                                      parent=self.root)
            return False
        if not 1024 <= port <= 65535:
            self.messagebox.showerror("Win95 NAS Setup",
                                      "Choose a port between 1024 and 65535.",
                                      parent=self.root)
            return False
        try:
            limit = float(self.limit_var.get().strip())
        except ValueError:
            limit = 0
        if limit <= 0:
            self.messagebox.showerror("Win95 NAS Setup",
                                      "The storage limit must be greater than zero.",
                                      parent=self.root)
            return False

        if port_is_busy(port):
            if looks_like_win95nas(port):
                open_now = self.messagebox.askyesno(
                    "Win95 NAS is already running",
                    "Win95 NAS is already running at http://localhost:%d.\n\n"
                    "Open it in your browser instead?\n\n"
                    "Choose No to go back and pick a different port." % port,
                    parent=self.root)
                if open_now:
                    # Save these answers so the wizard does not appear again
                    # on the next start.bat.
                    try:
                        write_config(self._root_path, port=port,
                                     tray=bool(self.tray_var.get()),
                                     open_browser=bool(self.browser_var.get()),
                                     limit_gb=limit)
                    except Exception:
                        pass
                    try:
                        import webbrowser
                        webbrowser.open("http://localhost:%d/" % port)
                    except Exception:
                        pass
                    self.result = {"alreadyRunning": True,
                                   "url": "http://localhost:%d/" % port}
                    self.root.destroy()
                return False
            again = self.messagebox.askyesno(
                "Win95 NAS Setup",
                "Port %d is already in use by another program.\n\n"
                "Choose a different port, or continue anyway." % port,
                parent=self.root)
            if not again:
                return False
        return True

    def _next(self) -> None:
        if self.page == 0:
            self._show(1)
        elif self.page == 1:
            if self._validate_storage():
                self._show(2)
        elif self.page == 2:
            if self._validate_options():
                self._show(3)
        else:
            self._finish()

    def _back(self) -> None:
        if self.page > 0:
            self._show(self.page - 1)

    def _finish(self) -> None:
        if not self._validate_storage():
            self._show(1)
            return
        try:
            config = write_config(
                self._root_path,
                port=int(self.port_var.get().strip()),
                tray=bool(self.tray_var.get()),
                open_browser=bool(self.browser_var.get()),
                limit_gb=float(self.limit_var.get().strip()),
            )
        except Exception as exc:
            self.messagebox.showerror("Win95 NAS Setup",
                                      "Could not save the setup:\n%s" % exc,
                                      parent=self.root)
            return
        self.result = config
        self.root.destroy()

    def _cancel(self) -> None:
        if self.messagebox.askyesno("Win95 NAS Setup",
                                    "Setup is not finished. Cancel anyway?",
                                    parent=self.root):
            self.result = None
            self.root.destroy()

    def run(self):
        self.root.mainloop()
        return self.result


# ---------------------------------------------------------------------------
# Entry points
# ---------------------------------------------------------------------------

def _arg(argv, name, default=None):
    if name in argv:
        index = argv.index(name)
        if index + 1 < len(argv):
            return argv[index + 1]
    return default


def _flag(argv, name):
    return name in argv


def main(argv=None) -> int:
    argv = list(sys.argv[1:] if argv is None else argv)

    if "--config" in argv:
        print(json.dumps(load_config(), indent=2))
        return 0

    if "--no-gui" in argv:
        root = _arg(argv, "--root", str(DEFAULT_ROOT))
        port = int(_arg(argv, "--port", "4040"))
        limit = float(_arg(argv, "--limit", "64"))
        try:
            config = write_config(
                Path(root),
                port=port,
                tray=not _flag(argv, "--no-tray"),
                open_browser=not _flag(argv, "--no-browser"),
                limit_gb=limit,
            )
        except Exception as exc:
            print("Setup failed: %s" % exc, file=sys.stderr)
            return 1
        print("Saved %s" % SETUP_FILE)
        print(json.dumps(config, indent=2))
        return 0

    # Make the window crisp on high-DPI displays.
    if sys.platform == "win32":
        try:
            import ctypes
            ctypes.windll.shcore.SetProcessDpiAwareness(1)
        except Exception:
            pass

    try:
        import tkinter  # noqa: F401
    except Exception as exc:
        print("The graphical setup could not start: %s" % exc, file=sys.stderr)
        print("Run: python setup_gui.py --no-gui --root <folder>", file=sys.stderr)
        return 1

    wizard = Wizard()
    result = wizard.run()
    if result is None:
        print("Setup cancelled.", file=sys.stderr)
        return 1
    if isinstance(result, dict) and result.get("alreadyRunning"):
        print("Win95 NAS is already running at %s" % result.get("url"))
        return 2
    print("Setup saved: %s" % result.get("root"))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
