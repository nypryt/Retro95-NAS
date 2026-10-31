#!/usr/bin/env python3
"""
Windows 95 NAS
================
A Windows 95 styled Network Attached Storage for your own PC.

* Pure Python standard library - no pip install, no node, no build step.
* Files are stored in ./nas-data on this machine.
* Docker integration via the Docker CLI (containers, volumes, logs, file copy).
* Settings, wallpapers and the recycle bin live in ./data.

Run:  python server.py            (http://localhost:4040)
"""

from __future__ import annotations

import base64
import bz2
import gzip
import hashlib
import hmac
import io
import json
import lzma
import mimetypes
import os
import re
import secrets
import shutil
import socket
import struct
import subprocess
import sys
import tarfile
import tempfile
import threading
import time
import traceback
import urllib.parse
import webbrowser
import zipfile
import zlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import tray
import office

# ---------------------------------------------------------------------------
# Paths / constants
# ---------------------------------------------------------------------------

BASE_DIR = Path(__file__).resolve().parent
PUBLIC_DIR = BASE_DIR / "public"
DATA_DIR = BASE_DIR / "data"
NAS_ROOT = Path(os.environ.get("NAS_ROOT", BASE_DIR / "nas-data")).resolve()
WALLPAPER_DIR = DATA_DIR / "wallpapers"
RECYCLE_DIR = DATA_DIR / "recycle"
TMP_DIR = DATA_DIR / "tmp"
SETTINGS_FILE = DATA_DIR / "settings.json"
USERS_FILE = DATA_DIR / "users.json"
SESSION_KEY_FILE = DATA_DIR / "session.key"

APP_NAME = "Win95 NAS"
APP_VERSION = "1.0"
START_TIME = time.time()

SESSION_COOKIE = "win95nas_session"
SESSION_TTL = 7 * 24 * 60 * 60
LOGIN_WINDOW = 5 * 60
LOGIN_MAX_FAILS = 12

# The NAS refuses new files once it reaches this size. Override with NAS_LIMIT_GB
# (handy for testing) - the normal value is 64 GB.
try:
    STORAGE_LIMIT_BYTES = int(float(os.environ.get("NAS_LIMIT_GB", "64")) * 1024 ** 3)
except ValueError:
    STORAGE_LIMIT_BYTES = 64 * 1024 ** 3

for d in (PUBLIC_DIR, DATA_DIR, NAS_ROOT, WALLPAPER_DIR, RECYCLE_DIR, TMP_DIR):
    d.mkdir(parents=True, exist_ok=True)

IS_WINDOWS = os.name == "nt"
CREATE_NO_WINDOW = 0x08000000 if IS_WINDOWS else 0

DEFAULT_SETTINGS = {
    "user": "Guest",
    "wallpaper": {"type": "pattern", "value": "teal", "fit": "fill"},
    "crt": {
        "enabled": False,
        "scanlines": 0.55,
        "flicker": 0.25,
        "vignette": 0.55,
        "curvature": 0.4,
        "aberration": 0.3,
        "bezel": False,
        "powerOn": True,
    },
    "sound": {"enabled": True, "volume": 0.35},
    "desktop": {
        "showIcons": True,
        "iconSize": 48,
        "snap": True,
        "showClock": True,
        "boot": True,
        "screensaver": 8,
        "screensaverStyle": "starfield",
        "dragFull": True,
        "showTips": True,
        "iconStyle": "v2",
    },
}

SETTINGS_LOCK = threading.Lock()
SETTINGS_CACHE = None


class ApiError(Exception):
    def __init__(self, message, code=400):
        super().__init__(message)
        self.code = code


# ---------------------------------------------------------------------------
# Accounts / sessions
# ---------------------------------------------------------------------------

USERS_LOCK = threading.RLock()
LOGIN_LOCK = threading.Lock()
LOGIN_FAILURES: dict[str, list[float]] = {}
_SESSION_SECRET = None

USERNAME_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9 ._-]{1,31}$")


def load_users() -> dict:
    with USERS_LOCK:
        if USERS_FILE.exists():
            try:
                data = json.loads(USERS_FILE.read_text("utf-8"))
                if isinstance(data, dict) and isinstance(data.get("users"), list):
                    return data
            except Exception:
                pass
        return {"version": 1, "users": []}


def save_users(data: dict) -> None:
    with USERS_LOCK:
        tmp = USERS_FILE.with_suffix(".json.tmp")
        tmp.write_text(json.dumps(data, indent=2, ensure_ascii=False), "utf-8")
        os.replace(tmp, USERS_FILE)


def find_user(username: str):
    needle = (username or "").strip().lower()
    if not needle:
        return None
    for user in load_users()["users"]:
        if str(user.get("username", "")).lower() == needle:
            return user
    return None


def public_user(user: dict) -> dict:
    return {
        "username": user.get("username", ""),
        "admin": bool(user.get("admin")),
        "created": user.get("created", 0),
    }


def hash_password(password: str, salt_hex: str = "") -> tuple[str, str]:
    salt = bytes.fromhex(salt_hex) if salt_hex else secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 210_000)
    return salt.hex(), digest.hex()


def verify_password(password: str, user: dict) -> bool:
    try:
        _, actual = hash_password(password, str(user.get("salt", "")))
        return hmac.compare_digest(actual, str(user.get("hash", "")))
    except Exception:
        return False


def validate_credentials(username: str, password: str) -> tuple[str, str]:
    username = (username or "").strip()
    password = password or ""
    if not username:
        raise ApiError("Type a user name.", 400)
    if not USERNAME_RE.match(username):
        raise ApiError("User names are 2-32 characters: letters, numbers, spaces, dots, dashes or underscores.", 400)
    if len(password) < 4:
        raise ApiError("Use a password with at least 4 characters.", 400)
    if len(password) > 200:
        raise ApiError("That password is too long.", 400)
    return username, password


def session_secret() -> str:
    global _SESSION_SECRET
    if _SESSION_SECRET:
        return _SESSION_SECRET
    try:
        if SESSION_KEY_FILE.exists():
            value = SESSION_KEY_FILE.read_text("utf-8").strip()
            if len(value) >= 32:
                _SESSION_SECRET = value
                return value
        value = secrets.token_hex(32)
        SESSION_KEY_FILE.write_text(value, "utf-8")
        _SESSION_SECRET = value
    except OSError:
        _SESSION_SECRET = secrets.token_hex(32)
    return _SESSION_SECRET


def b64encode(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")


def b64decode(text: str) -> bytes:
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


def make_session(username: str) -> str:
    payload = json.dumps(
        {"u": username, "exp": int(time.time()) + SESSION_TTL},
        separators=(",", ":"),
    ).encode("utf-8")
    body = b64encode(payload)
    sig = hmac.new(session_secret().encode("utf-8"), body.encode("ascii"), hashlib.sha256).hexdigest()
    return body + "." + sig


def read_session(token: str):
    try:
        body, sig = (token or "").split(".", 1)
        expected = hmac.new(session_secret().encode("utf-8"), body.encode("ascii"), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(sig, expected):
            return None
        payload = json.loads(b64decode(body).decode("utf-8"))
        if int(payload.get("exp", 0)) < time.time():
            return None
        user = find_user(str(payload.get("u", "")))
        return user.get("username") if user else None
    except Exception:
        return None


def parse_cookies(header: str) -> dict:
    out = {}
    for part in (header or "").split(";"):
        if "=" not in part:
            continue
        key, value = part.split("=", 1)
        out[key.strip()] = value.strip()
    return out


def login_blocked(ip: str) -> bool:
    now = time.time()
    with LOGIN_LOCK:
        stamps = [t for t in LOGIN_FAILURES.get(ip, []) if now - t < LOGIN_WINDOW]
        LOGIN_FAILURES[ip] = stamps
        return len(stamps) >= LOGIN_MAX_FAILS


def note_login_failure(ip: str) -> None:
    with LOGIN_LOCK:
        LOGIN_FAILURES.setdefault(ip, []).append(time.time())


def clear_login_failures(ip: str) -> None:
    with LOGIN_LOCK:
        LOGIN_FAILURES.pop(ip, None)



# ---------------------------------------------------------------------------
# Small helpers
# ---------------------------------------------------------------------------

def json_bytes(obj) -> bytes:
    return json.dumps(obj, ensure_ascii=False).encode("utf-8")


def deep_merge(base: dict, patch: dict) -> dict:
    out = dict(base)
    for key, value in (patch or {}).items():
        if isinstance(value, dict) and isinstance(out.get(key), dict):
            out[key] = deep_merge(out[key], value)
        else:
            out[key] = value
    return out


def load_settings() -> dict:
    global SETTINGS_CACHE
    with SETTINGS_LOCK:
        if SETTINGS_CACHE is None:
            data = {}
            if SETTINGS_FILE.exists():
                try:
                    data = json.loads(SETTINGS_FILE.read_text("utf-8"))
                except Exception:
                    data = {}
            SETTINGS_CACHE = deep_merge(DEFAULT_SETTINGS, data)
        return json.loads(json.dumps(SETTINGS_CACHE))


def save_settings(patch: dict) -> dict:
    global SETTINGS_CACHE
    with SETTINGS_LOCK:
        current = SETTINGS_CACHE or deep_merge(DEFAULT_SETTINGS, {})
        SETTINGS_CACHE = deep_merge(current, patch)
        SETTINGS_FILE.write_text(
            json.dumps(SETTINGS_CACHE, indent=2, ensure_ascii=False), "utf-8"
        )
        return json.loads(json.dumps(SETTINGS_CACHE))


def safe_path(rel: str) -> Path:
    """Resolve a NAS-relative path, refusing anything outside the NAS root."""
    rel = urllib.parse.unquote(rel or "")
    rel = rel.replace("\\", "/").lstrip("/")
    parts = [p for p in rel.split("/") if p not in ("", ".")]
    if any(p == ".." for p in parts):
        raise ApiError("Invalid path", 400)
    target = NAS_ROOT.joinpath(*parts)
    resolved = target.resolve()
    root_n = os.path.normcase(str(NAS_ROOT))
    target_n = os.path.normcase(str(resolved))
    if target_n != root_n and os.path.commonpath([root_n, target_n]) != root_n:
        raise ApiError("Invalid path", 400)
    return resolved


def rel_of(path: Path) -> str:
    if path == NAS_ROOT:
        return "/"
    try:
        return "/" + path.relative_to(NAS_ROOT).as_posix()
    except ValueError:
        return "/"


def unique_path(directory: Path, name: str, is_dir: bool = False) -> Path:
    candidate = directory / name
    if not candidate.exists():
        return candidate
    if is_dir:
        base, ext = name, ""
    else:
        base, ext = os.path.splitext(name)
    i = 1
    while True:
        candidate = directory / f"{base} ({i}){ext}"
        if not candidate.exists():
            return candidate
        i += 1


RESERVED_NAMES = {
    "CON", "PRN", "AUX", "NUL",
    *(f"COM{i}" for i in range(1, 10)),
    *(f"LPT{i}" for i in range(1, 10)),
}


def sanitize_name(name: str, is_dir: bool = False) -> str:
    name = (name or "").replace("\\", "/").split("/")[-1]
    name = "".join(ch for ch in name if ord(ch) >= 32 and ch not in '<>:"|?*')
    name = name.strip().rstrip(".")
    if not name:
        name = "New Folder" if is_dir else "untitled"
    if name.upper() in RESERVED_NAMES:
        name = "_" + name
    if len(name) > 180:
        base, ext = os.path.splitext(name)
        name = base[:160] + ext[:15]
    return name


def sanitize_rel(rel: str) -> list[str]:
    out = []
    for part in (rel or "").replace("\\", "/").split("/"):
        if part in ("", ".", ".."):
            continue
        out.append(sanitize_name(part, is_dir=True))
    return out


IMAGE_EXT = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".svg", ".ico", ".avif"}
TEXT_EXT = {".txt", ".md", ".log", ".json", ".js", ".ts", ".css", ".html", ".htm",
            ".py", ".bat", ".cmd", ".ps1", ".sh", ".ini", ".cfg", ".conf", ".yml",
            ".yaml", ".xml", ".csv", ".c", ".h", ".cpp", ".java", ".rs", ".go", ".sql"}
AUDIO_EXT = {".mp3", ".wav", ".ogg", ".flac", ".m4a", ".aac", ".wma"}
VIDEO_EXT = {".mp4", ".webm", ".mkv", ".mov", ".avi", ".m4v"}
ARCHIVE_EXT = {".zip", ".zipx", ".rar", ".7z", ".tar", ".gz", ".tgz", ".bz2",
               ".tbz2", ".xz", ".txz", ".iso"}
WORD_EXT = {".doc", ".docx", ".docm", ".rtf"}
EXCEL_EXT = {".xls", ".xlsx", ".xlsm"}
POWERPOINT_EXT = {".ppt", ".pptx", ".pptm", ".pps", ".ppsx"}
OFFICE_EXT = WORD_EXT | EXCEL_EXT | POWERPOINT_EXT
DOC_EXT = {".pdf"} | OFFICE_EXT


def kind_of(path: Path) -> str:
    if path.is_dir():
        return "folder"
    ext = path.suffix.lower()
    if ext in IMAGE_EXT:
        return "image"
    if ext in TEXT_EXT:
        return "text"
    if ext in AUDIO_EXT:
        return "audio"
    if ext in VIDEO_EXT:
        return "video"
    if ext in ARCHIVE_EXT:
        return "archive"
    if ext == ".pdf":
        return "pdf"
    if ext in WORD_EXT:
        return "word"
    if ext in EXCEL_EXT:
        return "excel"
    if ext in POWERPOINT_EXT:
        return "powerpoint"
    return "file"


def describe(path: Path) -> dict:
    st = path.stat()
    is_dir = path.is_dir()
    return {
        "name": path.name,
        "path": rel_of(path),
        "type": "dir" if is_dir else "file",
        "kind": kind_of(path),
        "size": 0 if is_dir else st.st_size,
        "mtime": int(st.st_mtime * 1000),
        "ext": "" if is_dir else path.suffix.lower().lstrip("."),
    }


def human_size(n: int) -> str:
    for unit in ("bytes", "KB", "MB", "GB", "TB"):
        if n < 1024 or unit == "TB":
            return f"{n:.0f} {unit}" if unit == "bytes" else f"{n:.1f} {unit}"
        n /= 1024.0
    return f"{n:.1f} TB"


def content_disposition(name: str, inline: bool = False) -> str:
    disp = "inline" if inline else "attachment"
    ascii_name = "".join(ch if 32 <= ord(ch) < 127 and ch not in '"\\' else "_" for ch in name)
    quoted = urllib.parse.quote(name, safe="")
    return f"{disp}; filename=\"{ascii_name}\"; filename*=UTF-8''{quoted}"


# ---------------------------------------------------------------------------
# First-run content: folders, sample notes and generated pictures
# ---------------------------------------------------------------------------

def write_png(path: Path, width: int, height: int, pixel_fn) -> None:
    rows = bytearray()
    for y in range(height):
        rows.append(0)
        for x in range(width):
            r, g, b = pixel_fn(x, y, width, height)
            rows.extend((max(0, min(255, int(r))), max(0, min(255, int(g))), max(0, min(255, int(b)))))

    def chunk(tag: bytes, data: bytes) -> bytes:
        return (struct.pack(">I", len(data)) + tag + data +
                struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF))

    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(bytes(rows), 7))
    png += chunk(b"IEND", b"")
    path.write_bytes(png)


def seed_content() -> None:
    folders = ["Desktop", "Documents", "Documents/Notes", "Pictures", "Music",
               "Videos", "Projects", "Shared", "Docker Backups"]
    for folder in folders:
        (NAS_ROOT / folder).mkdir(parents=True, exist_ok=True)

    welcome = NAS_ROOT / "Desktop" / "Read Me.txt"
    if not welcome.exists():
        welcome.write_text(
            "Welcome to Win95 NAS!\n"
            "========================\n\n"
            "This is your personal network drive, wearing its favourite 1995 outfit.\n\n"
            "Quick start\n"
            "-----------\n"
            "* Double-click a desktop icon to open it.\n"
            "* Drag a box on the desktop or in a folder to select several items.\n"
            "* Right-click almost anything for a context menu.\n"
            "* In Explorer use Upload Files / Upload Folder, or drag files straight\n"
            "  from Windows onto the window.\n"
            "* Right-click a file -> Send to Docker to copy it into a container.\n"
            "* Open Settings (Start > Settings > Control Panel) to change the\n"
            "  wallpaper, switch on the CRT filter, sounds and screensaver.\n\n"
            "Everything you upload is stored on this PC in the nas-data folder.\n"
            "Have fun!\n",
            "utf-8",
        )

    doc = NAS_ROOT / "Documents" / "Welcome.txt"
    if not doc.exists():
        doc.write_text(
            "MY NAS\n"
            "======\n\n"
            "Storage root: this PC (nas-data folder)\n"
            "Docker:       Start > Programs > Docker Manager\n\n"
            "Try the CRT effect in Control Panel > Display Effects.\n"
            "Try Minesweeper. It is still impossible.\n",
            "utf-8",
        )

    notes = NAS_ROOT / "Documents" / "Notes"
    if not (notes / "todo.txt").exists():
        (notes / "todo.txt").write_text(
            "TODO\n----\n[x] Install Windows 95 NAS\n[ ] Upload the holiday photos\n"
            "[ ] Back up the pihole container\n[ ] Beat Minesweeper on Expert\n",
            "utf-8",
        )
    if not (notes / "ideas.txt").exists():
        (notes / "ideas.txt").write_text(
            "Ideas for the NAS\n-----------------\n"
            "* A screensaver made of flying windows\n"
            "* CRT scanlines so strong you can smell 1995\n"
            "* Docker volume backups with one click\n",
            "utf-8",
        )

    if not (NAS_ROOT / "Shared" / "README.txt").exists():
        (NAS_ROOT / "Shared" / "README.txt").write_text(
            "Shared folder\n=============\nDrop anything here that other devices on your\n"
            "network should be able to reach.\n",
            "utf-8",
        )

    pictures = NAS_ROOT / "Pictures"
    if not (pictures / "Aurora.png").exists():
        def aurora(x, y, w, h):
            t = y / h
            band = (1 + ((x / w) * 3 + t * 2)) % 1
            r = 20 + 40 * t + 30 * band
            g = 40 + 110 * (1 - t) + 60 * band
            b = 90 + 90 * (1 - t)
            if t > 0.55:
                r += 60 * (t - 0.55)
            return r, g, b
        write_png(pictures / "Aurora.png", 480, 360, aurora)

    if not (pictures / "Sunset.png").exists():
        def sunset(x, y, w, h):
            t = y / h
            r = 255 - 60 * t
            g = 120 + 90 * (1 - t) - 60 * t
            b = 70 + 120 * t
            cx, cy = w * 0.62, h * 0.58
            if (x - cx) ** 2 + (y - cy) ** 2 < (h * 0.14) ** 2:
                r, g, b = 255, 235, 150
            return r, g, b
        write_png(pictures / "Sunset.png", 480, 360, sunset)

    if not (pictures / "Grid.png").exists():
        def grid(x, y, w, h):
            if x % 24 == 0 or y % 24 == 0:
                return 70, 190, 170
            if x % 6 == 0 or y % 6 == 0:
                return 20, 110, 100
            return 8, 70, 68
        write_png(pictures / "Grid.png", 480, 360, grid)

    if not (WALLPAPER_DIR / "Aurora.png").exists():
        shutil.copy2(pictures / "Aurora.png", WALLPAPER_DIR / "Aurora.png")
    if not (WALLPAPER_DIR / "Sunset.png").exists():
        shutil.copy2(pictures / "Sunset.png", WALLPAPER_DIR / "Sunset.png")


# ---------------------------------------------------------------------------
# Streaming multipart/form-data parser (cgi module no longer exists in 3.13+)
# ---------------------------------------------------------------------------

class MultipartPart:
    def __init__(self, reader: "MultipartReader", headers: dict):
        self.reader = reader
        self.headers = headers
        cd = headers.get("content-disposition", "")
        params = self._params(cd)
        self.name = params.get("name", "")
        self.filename = None
        if "filename*" in params:
            raw = params["filename*"]
            try:
                _charset, _lang, value = raw.split("'", 2)
                self.filename = urllib.parse.unquote(value)
            except ValueError:
                self.filename = raw
        elif "filename" in params:
            self.filename = params["filename"]

    @staticmethod
    def _params(value: str) -> dict:
        out = {}
        for m in re.finditer(r';\s*([\w*]+)\s*=\s*(?:"((?:[^"\\]|\\.)*)"|([^;]*))', value):
            key = m.group(1).lower()
            val = m.group(2) if m.group(2) is not None else (m.group(3) or "").strip()
            out[key] = val.replace('\\"', '"')
        return out

    def stream_to(self, out) -> None:
        self.reader.stream_to(out)

    def value(self) -> bytes:
        buf = io.BytesIO()
        self.stream_to(buf)
        return buf.getvalue()

    def text(self) -> str:
        return self.value().decode("utf-8", "replace")


class MultipartReader:
    def __init__(self, rfile, boundary: str, length: int):
        self.rfile = rfile
        self.boundary = ("--" + boundary).encode("utf-8")
        self.delim = b"\r\n--" + boundary.encode("utf-8")
        self.remaining = max(0, length)
        self.buf = b""
        self.finished = False

    def _read(self, size: int = 262144) -> bytes:
        if self.remaining <= 0:
            return b""
        size = min(size, self.remaining)
        data = self.rfile.read(size)
        self.remaining -= len(data)
        return data

    def _fill(self, target: int) -> None:
        while len(self.buf) < target and self.remaining > 0:
            data = self._read()
            if not data:
                break
            self.buf += data

    def _readline(self) -> bytes:
        while True:
            idx = self.buf.find(b"\r\n")
            if idx >= 0:
                line = self.buf[:idx]
                self.buf = self.buf[idx + 2:]
                return line
            data = self._read()
            if not data:
                line = self.buf
                self.buf = b""
                return line
            self.buf += data

    def start(self) -> None:
        self._fill(65536)
        while True:
            idx = self.buf.find(self.boundary)
            if idx >= 0:
                self.buf = self.buf[idx + len(self.boundary):]
                break
            keep = len(self.boundary) - 1
            if len(self.buf) > keep:
                self.buf = self.buf[-keep:]
            data = self._read()
            if not data:
                raise ApiError("Malformed multipart body", 400)
            self.buf += data
        self._fill(2)
        if self.buf.startswith(b"\r\n"):
            self.buf = self.buf[2:]
        elif self.buf.startswith(b"--"):
            self.finished = True

    def parts(self):
        self.start()
        while not self.finished:
            headers = {}
            while True:
                line = self._readline()
                if not line:
                    break
                text = line.decode("utf-8", "replace")
                if ":" in text:
                    key, val = text.split(":", 1)
                    headers[key.strip().lower()] = val.strip()
            part = MultipartPart(self, headers)
            yield part
            self._fill(2)
            if self.buf.startswith(b"--"):
                self.finished = True
                break
            if self.buf.startswith(b"\r\n"):
                self.buf = self.buf[2:]

    def stream_to(self, out) -> None:
        while True:
            idx = self.buf.find(self.delim)
            if idx >= 0:
                out.write(self.buf[:idx])
                self.buf = self.buf[idx + len(self.delim):]
                return
            keep = len(self.delim) - 1
            if len(self.buf) > keep:
                out.write(self.buf[:-keep])
                self.buf = self.buf[-keep:]
            if self.remaining <= 0:
                out.write(self.buf)
                self.buf = b""
                return
            data = self._read()
            if not data:
                out.write(self.buf)
                self.buf = b""
                return
            self.buf += data


# ---------------------------------------------------------------------------
# Docker bridge (talks to the Docker CLI installed on this PC)
# ---------------------------------------------------------------------------

DOCKER_EXE = None
DOCKER_LOCK = threading.Lock()


def find_docker() -> str | None:
    global DOCKER_EXE
    if DOCKER_EXE:
        return DOCKER_EXE
    candidates = [
        shutil.which("docker"),
        r"C:\Program Files\Docker\Docker\resources\bin\docker.exe",
        r"C:\Program Files\Docker\Docker\resources\bin\docker",
        "/usr/bin/docker",
        "/usr/local/bin/docker",
    ]
    for candidate in candidates:
        if candidate and Path(candidate).exists():
            DOCKER_EXE = candidate
            return candidate
    return None


def docker_run(args, timeout: float = 60, check_container: str | None = None):
    exe = find_docker()
    if not exe:
        raise ApiError("Docker CLI not found on this PC", 503)
    if check_container:
        if not re.match(r"^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$", check_container):
            raise ApiError("Invalid container id", 400)
    try:
        proc = subprocess.run(
            [exe, *args],
            capture_output=True,
            timeout=timeout,
            creationflags=CREATE_NO_WINDOW,
        )
    except subprocess.TimeoutExpired:
        raise ApiError("Docker command timed out", 504)
    except OSError as exc:
        raise ApiError(f"Could not run docker: {exc}", 503)
    return proc.returncode, proc.stdout.decode("utf-8", "replace"), proc.stderr.decode("utf-8", "replace")


def docker_ok(args, timeout: float = 60):
    code, out, err = docker_run(args, timeout=timeout)
    if code != 0:
        message = (err or out or "docker command failed").strip()
        raise ApiError(message.splitlines()[-1][:400], 400)
    return out


def docker_status() -> dict:
    exe = find_docker()
    if not exe:
        return {"installed": False, "running": False, "error": "Docker CLI not found",
                "exe": None, "version": None, "info": None}
    code, out, err = docker_run(["info", "--format", "{{json .}}"], timeout=10)
    if code != 0:
        return {"installed": True, "running": False, "exe": exe,
                "error": (err or out).strip().splitlines()[-1][:300] if (err or out).strip() else "Docker engine is not running",
                "version": None, "info": None}
    try:
        info = json.loads(out.strip().splitlines()[-1])
    except Exception:
        info = {"raw": out.strip()}
    slim = {
        "serverVersion": info.get("ServerVersion"),
        "operatingSystem": info.get("OperatingSystem"),
        "name": info.get("Name"),
        "cpus": info.get("NCPU"),
        "memory": info.get("MemTotal"),
        "containers": info.get("Containers"),
        "containersRunning": info.get("ContainersRunning"),
        "images": info.get("Images"),
        "driver": info.get("Driver"),
        "architecture": info.get("Architecture"),
    }
    return {"installed": True, "running": True, "exe": exe, "error": None,
            "version": slim.get("serverVersion"), "info": slim}


def docker_containers() -> list[dict]:
    out = docker_ok(["ps", "-a", "--no-trunc", "--format", "{{json .}}"], timeout=20)
    containers = []
    for line in out.splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            row = json.loads(line)
        except Exception:
            continue
        containers.append({
            "id": row.get("ID", ""),
            "shortId": (row.get("ID") or "")[:12],
            "name": row.get("Names", ""),
            "image": row.get("Image", ""),
            "state": (row.get("State") or "").lower(),
            "status": row.get("Status", ""),
            "ports": row.get("Ports", ""),
            "created": row.get("CreatedAt", ""),
            "runningFor": row.get("RunningFor", ""),
            "mounts": row.get("Mounts", ""),
            "networks": row.get("Networks", ""),
            "labels": row.get("Labels", ""),
        })
    return containers


LS_SCRIPT = r'''
d="$1"
cd "$d" 2>/dev/null || { echo "__NAS_ERR__"; exit 3; }
for f in * .[!.]*; do
  [ -e "$f" ] || continue
  if [ -d "$f" ]; then t=d; s=0; else t=f; s=$(wc -c < "$f" 2>/dev/null || echo 0); fi
  m=$(date -r "$f" +%s 2>/dev/null || echo 0)
  printf '%s\t%s\t%s\t%s\n' "$t" "$s" "$m" "$f"
done
'''


def docker_ls(container: str, path: str) -> list[dict]:
    path = path or "/"
    code, out, err = docker_run(
        ["exec", container, "sh", "-c", LS_SCRIPT, "sh", path], timeout=30,
        check_container=container,
    )
    if "__NAS_ERR__" in out:
        raise ApiError(f"Cannot open {path} inside the container", 404)
    if code != 0:
        raise ApiError((err or out).strip().splitlines()[-1][:300] if (err or out).strip() else "docker exec failed", 400)
    entries = []
    for line in out.splitlines():
        bits = line.split("\t", 3)
        if len(bits) != 4:
            continue
        t, size, mtime, name = bits
        if name in (".", ".."):
            continue
        is_dir = t == "d"
        ext = "" if is_dir else os.path.splitext(name)[1].lower().lstrip(".")
        entries.append({
            "name": name,
            "path": (path.rstrip("/") + "/" + name) if path != "/" else "/" + name,
            "type": "dir" if is_dir else "file",
            "kind": "folder" if is_dir else ("image" if "." + ext in IMAGE_EXT else "file"),
            "size": 0 if is_dir else int(size or 0),
            "mtime": int(float(mtime or 0) * 1000),
            "ext": ext,
        })
    entries.sort(key=lambda e: (e["type"] != "dir", e["name"].lower()))
    return entries


def docker_path_kind(container: str, path: str) -> str:
    code, out, err = docker_run(
        ["exec", container, "sh", "-c", 'test -d "$1" && echo dir || (test -e "$1" && echo file || echo none)', "sh", path],
        timeout=20, check_container=container,
    )
    value = out.strip().splitlines()[-1] if out.strip() else "none"
    return value


def docker_container_action(container: str, action: str) -> dict:
    if not re.match(r"^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$", container or ""):
        raise ApiError("Invalid container id", 400)
    if action not in ("start", "stop", "restart", "pause", "unpause", "kill", "remove"):
        raise ApiError("Unknown action", 400)
    args = ["rm", "-f", container] if action == "remove" else [action, container]
    code, out, err = docker_run(args, timeout=90)
    if code != 0:
        raise ApiError((err or out).strip().splitlines()[-1][:400], 400)
    return {"ok": True, "output": (out or err).strip()}


def docker_logs(container: str, tail: int = 300) -> str:
    tail = max(10, min(5000, int(tail or 300)))
    out = docker_ok(["logs", "--tail", str(tail), container], timeout=40)
    return out


def docker_find(containers: list[dict], name: str) -> dict | None:
    """Resolve a container by name, exact id, short id or name prefix."""
    want = (name or "").strip()
    if not want:
        return None
    lowered = want.lower()
    for c in containers:
        if c.get("name", "").lower() == lowered:
            return c
    for c in containers:
        if c.get("shortId", "").lower() == lowered or c.get("id", "").lower() == lowered:
            return c
    for c in containers:
        if c.get("id", "").lower().startswith(lowered) or c.get("name", "").lower().startswith(lowered):
            return c
    return None


def docker_info_lines(c: dict) -> list[str]:
    state = (c.get("state") or "unknown").upper()
    lines = [
        f"Container:  {c.get('name', '')}",
        f"ID:         {c.get('shortId') or c.get('id', '')}",
        f"Image:      {c.get('image', '')}",
        f"State:      {state}",
        f"Status:     {c.get('status', '')}",
    ]
    if c.get("ports"):
        lines.append(f"Ports:      {c['ports']}")
    if c.get("created"):
        lines.append(f"Created:    {c['created']}")
    if c.get("mounts"):
        lines.append(f"Mounts:     {c['mounts']}")
    if c.get("networks"):
        lines.append(f"Networks:   {c['networks']}")
    return lines


def docker_shell(args: list[str]) -> tuple[list[str], dict | None]:
    """Handle `docker ...` typed into the Command Prompt.

    Returns (output lines, optional UI action).
    """
    sub = (args[0] if args else "").lower()
    if not args:
        return ["Opening Docker Manager..."], {"type": "docker"}

    try:
        if sub in ("ps", "list", "ls", "containers"):
            containers = docker_containers()
            if not containers:
                return ["No containers found."], None
            lines = [f"{'CONTAINER':<24} {'STATE':<10} IMAGE", "-" * 70]
            for c in containers:
                lines.append(f"{c.get('name', '')[:23]:<24} {c.get('state', ''):<10} {c.get('image', '')}")
            return lines, None

        # `docker logs <name> [tail]`
        if sub == "logs":
            if len(args) < 2:
                return ["Usage: docker logs <container> [lines]"], None
            tail = int(args[2]) if len(args) > 2 and args[2].isdigit() else 200
            text = docker_logs(args[1], tail)
            body = text.replace("\r\n", "\n").split("\n")
            return (body[-tail:] if body else ["(no log output)"]), None

        # Support both `docker <name> start` and `docker start <name>`.
        action_words = {"start", "stop", "restart", "pause", "unpause", "kill"}
        if sub in action_words and len(args) >= 2:
            name, action = args[1], sub
        else:
            name = args[0]
            action = (args[1].lower() if len(args) > 1 else "")

        containers = docker_containers()
        c = docker_find(containers, name)
        if not c:
            return [f'No such container: {name}', "Try `docker ps` to list containers."], None

        if not action:
            return docker_info_lines(c), None

        if action not in action_words:
            return [f"Unknown docker action: {action}",
                    "Usage: docker <container> [start|stop|restart]"], None

        running = (c.get("state") or "").lower() == "running"
        if action == "start":
            if running:
                return ["Docker Container is Already Running"], None
            docker_container_action(c["name"], "start")
            return [f"Docker Container Started: {c['name']}"], None
        if action == "stop":
            if not running:
                return ["Docker Container is Already Stopped"], None
            docker_container_action(c["name"], "stop")
            return [f"Docker Container Stopped: {c['name']}"], None
        if action == "restart":
            docker_container_action(c["name"], "restart")
            return [f"Docker Container Restarted: {c['name']}"], None
        docker_container_action(c["name"], action)
        return [f"Docker Container {action.capitalize()}ed: {c['name']}"], None
    except ApiError as exc:
        return [f"Docker: {exc.message}"], None
    except Exception as exc:  # pragma: no cover - defensive
        return [f"Docker error: {exc}"], None


def docker_volumes() -> list[dict]:
    out = docker_ok(["volume", "ls", "--format", "{{json .}}"], timeout=20)
    volumes = []
    for line in out.splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            row = json.loads(line)
        except Exception:
            continue
        volumes.append({
            "name": row.get("Name", ""),
            "driver": row.get("Driver", ""),
            "scope": row.get("Scope", ""),
            "mountpoint": row.get("Mountpoint", ""),
        })
    volumes.sort(key=lambda v: v["name"].lower())
    return volumes


def docker_helper_image() -> str:
    for image in ("busybox:latest", "busybox", "alpine:latest", "alpine"):
        code, _out, _err = docker_run(["image", "inspect", image], timeout=20)
        if code == 0:
            return image
    code, out, err = docker_run(["pull", "busybox:latest"], timeout=180)
    if code == 0:
        return "busybox:latest"
    raise ApiError("No busybox/alpine helper image and pull failed. Check your internet connection.", 400)


def volume_backup(name: str, dest_name: str = "") -> dict:
    if not re.match(r"^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$", name or ""):
        raise ApiError("Invalid volume name", 400)
    image = docker_helper_image()
    backup_dir = NAS_ROOT / "Docker Backups" / "volumes"
    backup_dir.mkdir(parents=True, exist_ok=True)
    safe_dest = sanitize_name(dest_name or f"{name}-{time.strftime('%Y%m%d-%H%M%S')}.tar.gz")
    if not safe_dest.endswith((".tar.gz", ".tgz")):
        safe_dest += ".tar.gz"
    target = unique_path(backup_dir, safe_dest)
    code, out, err = docker_run([
        "run", "--rm", "-v", f"{name}:/data:ro",
        "-v", f"{backup_dir.as_posix()}:/backup",
        image, "tar", "czf", f"/backup/{target.name}", "-C", "/data", ".",
    ], timeout=900)
    if code != 0:
        raise ApiError((err or out).strip().splitlines()[-1][:400], 400)
    return {"ok": True, "path": rel_of(target), "size": target.stat().st_size, "image": image}


def volume_restore(name: str, nas_path: str) -> dict:
    if not re.match(r"^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$", name or ""):
        raise ApiError("Invalid volume name", 400)
    source = safe_path(nas_path)
    if not source.is_file():
        raise ApiError("Backup archive not found", 404)
    image = docker_helper_image()
    code, out, err = docker_run([
        "run", "--rm", "-v", f"{name}:/data",
        "-v", f"{source.parent.as_posix()}:/backup:ro",
        image, "tar", "xzf", f"/backup/{source.name}", "-C", "/data",
    ], timeout=900)
    if code != 0:
        raise ApiError((err or out).strip().splitlines()[-1][:400], 400)
    return {"ok": True}


def start_docker_desktop() -> dict:
    exe = find_docker()
    if exe:
        code, out, err = docker_run(["desktop", "start"], timeout=60)
        if code == 0:
            return {"ok": True, "method": "docker desktop start"}
    candidates = [
        r"C:\Program Files\Docker\Docker\Docker Desktop.exe",
        r"C:\Program Files\Docker\Docker\Docker Desktop.exe",
    ]
    for candidate in candidates:
        if Path(candidate).exists():
            subprocess.Popen([candidate], creationflags=CREATE_NO_WINDOW)
            return {"ok": True, "method": "Docker Desktop.exe"}
    raise ApiError("Could not find Docker Desktop on this PC", 404)


# ---------------------------------------------------------------------------
# NAS API implementation
# ---------------------------------------------------------------------------

def qv(q: dict, key: str, default: str = "") -> str:
    values = q.get(key)
    return values[0] if values else default


def qlist(q: dict, key: str) -> list[str]:
    return list(q.get(key) or [])


def list_entries(directory: Path) -> list[dict]:
    entries = []
    try:
        children = list(directory.iterdir())
    except OSError as exc:
        raise ApiError(f"Cannot read folder: {exc}", 403)
    for child in children:
        if child.name.startswith(".recycle"):
            continue
        try:
            entries.append(describe(child))
        except OSError:
            continue
    entries.sort(key=lambda e: (e["type"] != "dir", e["name"].lower()))
    return entries


def storage_stats() -> dict:
    total_size = 0
    files = 0
    folders = 0
    for root, dirs, names in os.walk(NAS_ROOT):
        dirs[:] = [d for d in dirs if not d.startswith(".recycle")]
        folders += len(dirs)
        for name in names:
            try:
                total_size += (Path(root) / name).stat().st_size
                files += 1
            except OSError:
                pass
    usage = shutil.disk_usage(NAS_ROOT)
    limit = STORAGE_LIMIT_BYTES
    return {
        "used": total_size, "files": files, "folders": folders,
        "limit": limit, "limitFree": max(0, limit - total_size),
        "percent": round(min(100.0, (total_size / limit) * 100.0), 2) if limit else 0,
        "diskTotal": usage.total, "diskFree": usage.free, "diskUsed": usage.used,
    }


def storage_used() -> int:
    total = 0
    for root, dirs, names in os.walk(NAS_ROOT):
        dirs[:] = [d for d in dirs if not d.startswith(".recycle")]
        for name in names:
            try:
                total += (Path(root) / name).stat().st_size
            except OSError:
                pass
    return total


def path_size(path: Path) -> int:
    if path.is_file():
        try:
            return path.stat().st_size
        except OSError:
            return 0
    total = 0
    for root, _dirs, names in os.walk(path):
        for name in names:
            try:
                total += (Path(root) / name).stat().st_size
            except OSError:
                pass
    return total


def ensure_storage(extra: int, replacing: int = 0) -> None:
    """Refuse a write that would push the NAS past its storage limit."""
    extra = max(0, int(extra or 0))
    used = max(0, storage_used() - max(0, int(replacing or 0)))
    if used + extra > STORAGE_LIMIT_BYTES:
        raise ApiError(
            f"The {human_size(STORAGE_LIMIT_BYTES)} storage limit would be exceeded. "
            f"{human_size(used)} is already used and this needs {human_size(extra)}. "
            "Delete some files, empty the Recycle Bin, or raise the limit with NAS_LIMIT_GB.",
            507,
        )


def api_storage(h, q):
    return storage_stats()


# ---------------------------------------------------------------------------
# Command Prompt - a whitelisted, NAS-only command interpreter
# ---------------------------------------------------------------------------

SHELL_OUTPUT_LIMIT = 4000


def _inside_root(path: Path) -> bool:
    root_n = os.path.normcase(str(NAS_ROOT))
    path_n = os.path.normcase(str(path))
    try:
        return path_n == root_n or os.path.commonpath([root_n, path_n]) == root_n
    except ValueError:
        return False


def shell_path(cwd: str, arg: str = "") -> Path:
    """Resolve a prompt path relative to cwd, never leaving the NAS root."""
    base = safe_path(cwd or "/")
    arg = (arg or "").strip()
    if len(arg) >= 2 and arg[0] == arg[-1] and arg[0] in "\"'":
        arg = arg[1:-1]
    # Accept Windows-style paths (C:\NAS\Documents) and map them into the NAS.
    arg = re.sub(r"^[A-Za-z]:", "", arg)
    arg = arg.replace("\\", "/")
    if arg.lower() == "/nas":
        arg = "/"
    elif arg.lower().startswith("/nas/"):
        arg = arg[4:]
    if not arg or arg == ".":
        return base
    current = NAS_ROOT if arg.startswith("/") else base
    for part in arg.split("/"):
        if part in ("", "."):
            continue
        if part == "..":
            if current != NAS_ROOT:
                current = current.parent
            continue
        current = current / part
    try:
        resolved = current.resolve()
    except OSError:
        raise ApiError("Invalid path", 400)
    if not _inside_root(resolved):
        raise ApiError("Invalid path", 400)
    return resolved


def shell_tokens(raw: str) -> list[str]:
    tokens: list[str] = []
    buf: list[str] = []
    quote = None
    for ch in raw:
        if quote:
            if ch == quote:
                quote = None
            else:
                buf.append(ch)
        elif ch in "\"'":
            quote = ch
        elif ch.isspace():
            if buf:
                tokens.append("".join(buf))
                buf = []
        else:
            buf.append(ch)
    if buf:
        tokens.append("".join(buf))
    return tokens


def _dos_time(ms: int) -> str:
    try:
        return time.strftime("%m/%d/%Y  %I:%M %p", time.localtime((ms or 0) / 1000.0))
    except (OSError, ValueError, OverflowError):
        return "01/01/1995  12:00 AM"


def shell_dir_lines(target: Path, pattern: str = "") -> list[str]:
    lines: list[str] = []
    if target.is_file():
        st = target.stat()
        lines.append(f" Directory of {rel_of(target.parent)}")
        lines.append("")
        lines.append(f"{_dos_time(int(st.st_mtime * 1000))}  {st.st_size:>14,}  {target.name}")
        lines.append("")
        lines.append("        1 File(s)")
        lines.append("        0 Dir(s)")
        return lines
    if not target.is_dir():
        return ["File Not Found"]
    lines.append(f" Directory of {rel_of(target)}")
    lines.append("")
    entries = list_entries(target)
    if pattern and pattern not in ("*", "*.*"):
        import fnmatch
        entries = [e for e in entries if fnmatch.fnmatch(e["name"].lower(), pattern.lower())]
    entries.sort(key=lambda e: (e["type"] != "dir", e["name"].lower()))
    dirs = 0
    files = 0
    total = 0
    for entry in entries:
        stamp = _dos_time(entry.get("mtime") or 0)
        if entry["type"] == "dir":
            dirs += 1
            lines.append(f"{stamp}  <DIR>          {entry['name']}")
        else:
            files += 1
            size = int(entry.get("size") or 0)
            total += size
            lines.append(f"{stamp}  {size:>14,}  {entry['name']}")
    lines.append("")
    lines.append(f"        {files} File(s)  {total:,} bytes")
    lines.append(f"        {dirs} Dir(s)")
    return lines


def shell_tree_lines(target: Path, max_depth: int = 4, max_entries: int = 400) -> list[str]:
    lines = [rel_of(target) if target != NAS_ROOT else "/"]
    count = 0

    def walk(directory: Path, prefix: str, depth: int) -> None:
        nonlocal count
        if depth > max_depth or count >= max_entries:
            return
        try:
            children = sorted(
                (c for c in directory.iterdir() if not c.name.startswith(".recycle")),
                key=lambda c: (not c.is_dir(), c.name.lower()),
            )
        except OSError:
            return
        for index, child in enumerate(children):
            if count >= max_entries:
                lines.append(prefix + "...")
                return
            last = index == len(children) - 1
            connector = "\\---" if last else "+---"
            label = child.name + ("\\" if child.is_dir() else "")
            lines.append(prefix + connector + label)
            count += 1
            if child.is_dir():
                walk(child, prefix + ("    " if last else "|   "), depth + 1)

    walk(target, "", 1)
    if count >= max_entries:
        lines.append("(tree truncated)")
    return lines


def shell_ipconfig_lines() -> list[str]:
    lines = ["", "Windows IP Configuration", ""]
    try:
        hostname = socket.gethostname()
        lines.append(f"Host Name . . . . . . . . . . . . : {hostname}")
        infos = socket.getaddrinfo(hostname, None)
        v4 = sorted({info[4][0] for info in infos if info[0] == socket.AF_INET})
        v6 = sorted({info[4][0] for info in infos if info[0] == socket.AF_INET6})
    except OSError as exc:
        return lines + [f"Could not read network configuration: {exc}"]
    if v4:
        lines.append("")
        lines.append("IPv4 Address. . . . . . . . . . . : " + v4[0])
        for extra in v4[1:]:
            lines.append("           . . . . . . . . . . . : " + extra)
    if v6:
        lines.append("")
        for addr in v6[:4]:
            lines.append("IPv6 Address. . . . . . . . . . . : " + addr.split("%")[0])
    try:
        ts = tailscale_status()
        me = ts.get("self") or {}
        if ts.get("installed") and me:
            lines.append("")
            lines.append("Tailscale:")
            lines.append("   Host Name . . . . . . . . . . . : " + str(me.get("hostname", "")))
            for addr in me.get("ips") or []:
                lines.append("   Tailscale IP. . . . . . . . . . : " + str(addr))
            lines.append("   Status  . . . . . . . . . . . . : " + str(ts.get("backendState", "")))
    except Exception:
        pass
    return lines


def shell_storage_lines() -> list[str]:
    stats = storage_stats()
    return [
        " Volume in drive C is NAS",
        " Volume Serial Number is 1995-9500",
        "",
        f" NAS storage used . . . . . . . . : {human_size(stats['used'])}",
        f" NAS storage limit  . . . . . . . : {human_size(stats['limit'])}",
        f" Free on the NAS  . . . . . . . . : {human_size(stats['limitFree'])} ({stats['percent']}% used)",
        f" Files / folders  . . . . . . . . : {stats['files']} / {stats['folders']}",
        f" Disk free / total  . . . . . . . : {human_size(stats['diskFree'])} / {human_size(stats['diskTotal'])}",
    ]


def api_shell(h, q):
    body = h.read_json()
    raw = str(body.get("command", "") or "").strip()
    cwd = safe_path(str(body.get("cwd", "/") or "/"))
    if not cwd.is_dir():
        cwd = NAS_ROOT

    result = {"cwd": rel_of(cwd), "output": [], "clear": False, "action": None}
    output: list[str] = result["output"]
    if not raw:
        return result

    tokens = shell_tokens(raw)
    cmd = (tokens[0] if tokens else "").lower()
    args = tokens[1:]
    rest = raw[len(tokens[0]):].strip() if tokens else ""

    if cmd in ("help", "?"):
        output.extend([
            "Available commands:",
            "  DIR [path] [pattern]   list files        CD [path]      show/change folder",
            "  TYPE <file>            show a text file  TREE [path]    show folder tree",
            "  MKDIR <name>           make a folder     RMDIR <name>   remove a folder",
            "  DEL <file>             delete to Recycle COPY <src> <dst> copy a file",
            "  MOVE <src> <dst>       move a file       REN <old> <new> rename",
            "  ECHO <text>            print text        CLS            clear screen",
            "  PWD                    current folder    VOL            storage usage",
            "  VER                    version info      DATE / TIME    date or time",
            "  WHOAMI                 current user      HOSTNAME       computer name",
            "  IPCONFIG               network + Tailscale addresses",
            "  PING <host>            ping a host       TASKLIST       running processes",
            "  START <app>            open an app       EXIT           close the prompt",
            "",
            "Docker:",
            "  DOCKER                 open Docker Manager",
            "  DOCKER PS              list containers",
            "  DOCKER <name>          show container info",
            "  DOCKER <name> START    start it  (STOP / RESTART also work)",
            "  DOCKER LOGS <name> [n] show the last n log lines",
            "",
            "All paths are inside the NAS. Deleting sends items to the Recycle Bin.",
        ])
    elif cmd in ("dir", "ls"):
        target = shell_path(rel_of(cwd), args[0] if args else "")
        pattern = args[1] if len(args) > 1 else ""
        output.extend(shell_dir_lines(target, pattern))
    elif cmd in ("cd", "chdir"):
        if not args:
            output.append(rel_of(cwd))
        else:
            target = shell_path(rel_of(cwd), args[0])
            if target.is_dir():
                cwd = target
                result["cwd"] = rel_of(cwd)
            else:
                output.append("The system cannot find the path specified.")
    elif cmd in ("type", "cat"):
        if not args:
            output.append("Usage: TYPE <file>")
        else:
            target = shell_path(rel_of(cwd), args[0])
            if not target.is_file():
                output.append("File Not Found")
            elif target.stat().st_size > 2 * 1024 * 1024:
                output.append("File is too large for the prompt (2 MB max).")
            else:
                data = target.read_bytes()
                try:
                    text = data.decode("utf-8")
                except UnicodeDecodeError:
                    text = data.decode("latin-1", "replace")
                output.extend(text.replace("\r\n", "\n").replace("\r", "\n").split("\n"))
    elif cmd in ("mkdir", "md"):
        if not args:
            output.append("Usage: MKDIR <name>")
        else:
            target = shell_path(rel_of(cwd), " ".join(args))
            if target.exists():
                output.append("A file or folder with that name already exists.")
            else:
                target.mkdir(parents=True)
                output.append(f"Created {rel_of(target)}")
    elif cmd in ("rmdir", "rd"):
        if not args:
            output.append("Usage: RMDIR <name>")
        else:
            target = shell_path(rel_of(cwd), " ".join(args))
            if not target.is_dir():
                output.append("The system cannot find the path specified.")
            elif target == NAS_ROOT:
                output.append("Access denied.")
            elif any(target.iterdir()):
                output.append("The folder is not empty.")
            else:
                recycle_paths([rel_of(target)])
                output.append(f"Moved {rel_of(target)} to the Recycle Bin.")
    elif cmd in ("del", "erase", "rm"):
        if not args:
            output.append("Usage: DEL <file>")
        else:
            target = shell_path(rel_of(cwd), " ".join(args))
            if not target.exists():
                output.append("File Not Found")
            elif target == NAS_ROOT:
                output.append("Access denied.")
            else:
                recycle_paths([rel_of(target)])
                output.append(f"Moved {rel_of(target)} to the Recycle Bin.")
    elif cmd == "copy":
        if len(args) < 2:
            output.append("Usage: COPY <source> <destination>")
        else:
            source = shell_path(rel_of(cwd), args[0])
            dest = shell_path(rel_of(cwd), args[1])
            if not source.is_file():
                output.append("File Not Found")
            else:
                if dest.is_dir():
                    dest = unique_path(dest, source.name)
                size = source.stat().st_size
                ensure_storage(size)
                dest.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(source, dest)
                output.append(f"        1 file(s) copied  ({human_size(size)})")
    elif cmd in ("move", "mv"):
        if len(args) < 2:
            output.append("Usage: MOVE <source> <destination>")
        else:
            source = shell_path(rel_of(cwd), args[0])
            dest = shell_path(rel_of(cwd), args[1])
            if not source.exists():
                output.append("File Not Found")
            elif source == NAS_ROOT:
                output.append("Access denied.")
            else:
                if dest.is_dir():
                    dest = unique_path(dest, source.name, source.is_dir())
                dest.parent.mkdir(parents=True, exist_ok=True)
                shutil.move(str(source), str(dest))
                output.append(f"Moved to {rel_of(dest)}")
    elif cmd in ("ren", "rename"):
        if len(args) < 2:
            output.append("Usage: REN <old> <new>")
        else:
            source = shell_path(rel_of(cwd), args[0])
            if not source.exists():
                output.append("File Not Found")
            else:
                name = sanitize_name(args[1], source.is_dir())
                dest = source.parent / name
                if dest.exists():
                    output.append("A file with that name already exists.")
                else:
                    source.rename(dest)
                    output.append(f"Renamed to {name}")
    elif cmd == "echo":
        output.append(rest)
    elif cmd == "cls":
        result["clear"] = True
    elif cmd == "ver":
        output.extend(["", f"Windows 95 NAS [Version 4.00.950]", f"NAS service {APP_VERSION}", ""])
    elif cmd == "date":
        output.append("Current date is " + time.strftime("%a %m/%d/%Y"))
    elif cmd == "time":
        output.append("Current time is " + time.strftime("%I:%M:%S %p"))
    elif cmd == "whoami":
        me = find_user(getattr(h, "user", "")) or {}
        name = me.get("username") or getattr(h, "user", None) or "guest"
        output.append(f"nas\\{name}")
    elif cmd == "hostname":
        output.append(socket.gethostname())
    elif cmd == "pwd":
        output.append(rel_of(cwd))
    elif cmd in ("vol", "df", "storage"):
        output.extend(shell_storage_lines())
    elif cmd == "ipconfig":
        output.extend(shell_ipconfig_lines())
    elif cmd == "ping":
        if not args:
            output.append("Usage: PING <host>")
        elif not re.match(r"^[A-Za-z0-9.:_-]{1,253}$", args[0]):
            output.append("Invalid host name.")
        else:
            host = args[0]
            ping_args = ["-n", "3", host] if IS_WINDOWS else ["-c", "3", host]
            code, out, err = run_cli("ping", ping_args, timeout=30)
            text = (out or "") + (("\n" + err) if err else "")
            output.extend(text.replace("\r\n", "\n").split("\n"))
            if code != 0:
                output.append(f"Ping failed (exit code {code}).")
    elif cmd == "tasklist":
        if not IS_WINDOWS:
            output.append("TASKLIST is only available on Windows.")
        else:
            code, out, err = run_cli("tasklist", ["/FO", "TABLE"], timeout=30)
            text = (out or err or "").replace("\r\n", "\n")
            output.extend(text.split("\n")[:120])
    elif cmd == "tree":
        target = shell_path(rel_of(cwd), args[0] if args else "")
        if not target.is_dir():
            output.append("Invalid path - not a folder.")
        else:
            output.extend(shell_tree_lines(target))
    elif cmd in ("start", "notepad", "explorer"):
        if cmd == "start":
            if not args:
                output.append("Usage: START <app>")
            else:
                result["action"] = {"type": "start", "target": " ".join(args)}
                output.append(f"Starting {' '.join(args)}...")
        else:
            result["action"] = {"type": "start", "target": cmd}
            output.append(f"Starting {cmd}...")
    elif cmd == "docker":
        lines, action = docker_shell(args)
        output.extend(lines)
        if action:
            result["action"] = action
    elif cmd == "tailscale":
        result["action"] = {"type": "tailscale"}
        output.append("Opening Tailscale...")
    elif cmd == "exit":
        result["action"] = {"type": "close"}
    elif cmd == "format":
        output.append("Access denied. The 1990s called.")
    else:
        output.append(f"Bad command or file name: {tokens[0]}")

    if len(output) > SHELL_OUTPUT_LIMIT:
        result["output"] = output[:SHELL_OUTPUT_LIMIT] + ["(output truncated)"]
    return result


def api_info(h, q):
    stats = storage_stats()
    try:
        hostname = socket.gethostname()
        local_ip = socket.gethostbyname(hostname)
    except Exception:
        hostname, local_ip = "localhost", "127.0.0.1"
    me = find_user(getattr(h, "user", "")) or {}
    return {
        "app": APP_NAME, "version": APP_VERSION,
        "root": str(NAS_ROOT), "rootPath": NAS_ROOT.as_posix(),
        "hostname": hostname, "ip": local_ip,
        "port": h.server.server_address[1],
        "python": sys.version.split()[0],
        "platform": sys.platform,
        "uptime": int(time.time() - START_TIME),
        "storage": stats,
        "docker": docker_status(),
        "tray": tray.status(),
        "ffmpeg": shutil.which("ffmpeg") or "",
        "user": me.get("username") or getattr(h, "user", None) or "Guest",
        "admin": bool(me.get("admin")),
    }


def api_list(h, q):
    directory = safe_path(qv(q, "path", "/"))
    if not directory.exists():
        raise ApiError("Folder not found", 404)
    if not directory.is_dir():
        raise ApiError("Not a folder", 400)
    return {"path": rel_of(directory), "entries": list_entries(directory)}


def api_stat(h, q):
    target = safe_path(qv(q, "path", "/"))
    if not target.exists():
        raise ApiError("Not found", 404)
    info = describe(target)
    info["parent"] = rel_of(target.parent) if target != NAS_ROOT else "/"
    info["created"] = int(target.stat().st_ctime * 1000)
    if target.is_dir():
        count = 0
        folder_count = 0
        size = 0
        for root, dirs, names in os.walk(target):
            folder_count += len(dirs)
            for name in names:
                try:
                    size += (Path(root) / name).stat().st_size
                    count += 1
                except OSError:
                    pass
        info["size"] = size
        info["fileCount"] = count
        info["folderCount"] = folder_count
    return info


def api_search(h, q):
    term = qv(q, "q", "").strip().lower()
    start = safe_path(qv(q, "path", "/"))
    if not term:
        return {"entries": []}
    results = []
    for root, dirs, names in os.walk(start):
        dirs[:] = [d for d in dirs if not d.startswith(".recycle")]
        for name in names + dirs:
            if term in name.lower():
                try:
                    results.append(describe(Path(root) / name))
                except OSError:
                    pass
                if len(results) >= 300:
                    return {"entries": results, "truncated": True}
    results.sort(key=lambda e: e["name"].lower())
    return {"entries": results, "truncated": False}


def api_mkdir(h, q):
    body = h.read_json()
    parent = safe_path(body.get("path", "/"))
    if not parent.is_dir():
        raise ApiError("Parent folder not found", 404)
    name = sanitize_name(body.get("name", "New Folder"), is_dir=True)
    target = unique_path(parent, name, is_dir=True)
    target.mkdir(parents=True)
    return {"ok": True, "entry": describe(target)}


def api_newfile(h, q):
    body = h.read_json()
    parent = safe_path(body.get("path", "/"))
    name = sanitize_name(body.get("name", "New Text Document.txt"))
    content = body.get("content", "")
    ensure_storage(len(str(content).encode("utf-8")))
    target = unique_path(parent, name)
    target.write_text(content, "utf-8")
    return {"ok": True, "entry": describe(target)}


def api_rename(h, q):
    body = h.read_json()
    source = safe_path(body.get("path", ""))
    if source == NAS_ROOT or not source.exists():
        raise ApiError("Item not found", 404)
    new_name = sanitize_name(body.get("name", ""), is_dir=source.is_dir())
    target = source.parent / new_name
    if target.exists() and target != source:
        raise ApiError("An item with that name already exists", 409)
    source.rename(target)
    return {"ok": True, "entry": describe(target)}


def recycle_paths(paths) -> list[dict]:
    """Move NAS items into the Recycle Bin and return their metadata."""
    deleted = []
    for rel in paths:
        source = safe_path(rel)
        if source == NAS_ROOT or not source.exists():
            continue
        rid = f"{int(time.time() * 1000)}_{secrets.token_hex(3)}"
        holder = RECYCLE_DIR / rid
        holder.mkdir(parents=True, exist_ok=True)
        meta = {
            "id": rid, "name": source.name, "original": rel_of(source),
            "type": "dir" if source.is_dir() else "file",
            "size": 0, "deletedAt": int(time.time() * 1000),
        }
        if source.is_file():
            meta["size"] = source.stat().st_size
        shutil.move(str(source), str(holder / source.name))
        (RECYCLE_DIR / f"{rid}.json").write_text(json.dumps(meta), "utf-8")
        deleted.append(meta)
    return deleted


def api_delete(h, q):
    body = h.read_json()
    paths = body.get("paths") or []
    return {"ok": True, "deleted": recycle_paths(paths)}


def api_move(h, q):
    body = h.read_json()
    sources = body.get("srcs") or []
    dest_dir = safe_path(body.get("dest", "/"))
    mode = body.get("op", "move")
    if not dest_dir.is_dir():
        raise ApiError("Destination folder not found", 404)
    moved = []
    errors = []
    for rel in sources:
        source = safe_path(rel)
        if source == NAS_ROOT or not source.exists():
            errors.append(f"{rel}: not found")
            continue
        if source.parent == dest_dir:
            continue
        if dest_dir == source or (source.is_dir() and dest_dir.is_relative_to(source)):
            errors.append(f"{source.name}: cannot move a folder into itself")
            continue
        target = unique_path(dest_dir, source.name, is_dir=source.is_dir())
        try:
            if mode == "copy":
                if source.is_dir():
                    shutil.copytree(source, target)
                else:
                    shutil.copy2(source, target)
            else:
                shutil.move(str(source), str(target))
            moved.append(describe(target))
        except OSError as exc:
            errors.append(f"{source.name}: {exc}")
    return {"ok": True, "moved": moved, "errors": errors}


def api_upload(h, q):
    ctype = h.headers.get("Content-Type", "")
    match = re.search(r'boundary=(?:"([^"]+)"|([^;]+))', ctype)
    if not match:
        raise ApiError("Expected multipart/form-data", 400)
    boundary = (match.group(1) or match.group(2) or "").strip()
    length = int(h.headers.get("Content-Length") or 0)
    if length <= 0:
        raise ApiError("Empty upload", 400)
    # Content-Length is an upper bound (it includes multipart framing), so this
    # refuses early rather than writing until the disk fills up.
    ensure_storage(length)

    reader = MultipartReader(h.rfile, boundary, length)
    dest_rel = "/"
    manifest = None
    saved = []
    file_index = 0
    dirs_created = []

    for part in reader.parts():
        if part.filename is None:
            data = part.value()
            if part.name == "dest":
                dest_rel = data.decode("utf-8", "replace")
            elif part.name == "manifest":
                try:
                    manifest = json.loads(data.decode("utf-8", "replace"))
                except Exception:
                    manifest = None
            continue

        dest_dir = safe_path(dest_rel)
        if not dest_dir.is_dir():
            raise ApiError("Upload destination not found", 404)

        rel_parts = None
        if manifest and file_index < len(manifest.get("files", [])):
            rel_parts = sanitize_rel(manifest["files"][file_index])
        file_index += 1
        if not rel_parts:
            rel_parts = [sanitize_name(part.filename)]

        target_dir = dest_dir
        for part_name in rel_parts[:-1]:
            target_dir = target_dir / part_name
            if not target_dir.exists():
                target_dir.mkdir(parents=True, exist_ok=True)
                dirs_created.append(rel_of(target_dir))
        final_name = sanitize_name(rel_parts[-1])
        target = unique_path(target_dir, final_name)
        with open(target, "wb") as out:
            part.stream_to(out)
        saved.append(describe(target))

    if manifest:
        dest_dir = safe_path(dest_rel)
        for raw_dir in manifest.get("dirs", []):
            parts = sanitize_rel(raw_dir)
            if not parts:
                continue
            target_dir = dest_dir.joinpath(*parts)
            if not target_dir.exists():
                target_dir.mkdir(parents=True, exist_ok=True)
                dirs_created.append(rel_of(target_dir))

    return {"ok": True, "files": saved, "dirs": dirs_created, "dest": dest_rel}


def build_zip(paths: list[Path], root_label: str = "") -> Path:
    tmp = TMP_DIR / f"{int(time.time() * 1000)}_{secrets.token_hex(4)}.zip"
    used = set()
    with zipfile.ZipFile(tmp, "w", zipfile.ZIP_DEFLATED, allowZip64=True) as zf:
        for source in paths:
            arc_root = source.name
            if arc_root in used:
                arc_root = f"{arc_root}-{secrets.token_hex(2)}"
            used.add(arc_root)
            if source.is_dir():
                for child in source.rglob("*"):
                    if child.is_file():
                        zf.write(child, f"{arc_root}/{child.relative_to(source).as_posix()}")
            elif source.is_file():
                zf.write(source, arc_root)
    return tmp


def api_download(h, q):
    rels = qlist(q, "paths") or ([qv(q, "path")] if qv(q, "path") else [])
    if not rels:
        raise ApiError("No path given", 400)
    paths = [safe_path(r) for r in rels]
    for path in paths:
        if not path.exists():
            raise ApiError("File not found", 404)
    if len(paths) == 1 and paths[0].is_file():
        h.send_disk_file(paths[0], download_name=paths[0].name)
        return
    if len(paths) == 1:
        label = paths[0].name
    else:
        label = qv(q, "name", "download")
    archive = build_zip(paths, label)
    try:
        h.send_disk_file(archive, download_name=f"{label}.zip", cleanup=archive)
    except Exception:
        archive.unlink(missing_ok=True)
        raise


# ---------------------------------------------------------------------------
# Archive manager (WinRAR-style)
# ---------------------------------------------------------------------------

ARCHIVE_LOCK = threading.Lock()

ARCHIVE_WRITE_FORMATS = {
    "zip": ".zip",
    "tar": ".tar",
    "tar.gz": ".tar.gz",
    "tgz": ".tgz",
    "tar.bz2": ".tar.bz2",
    "tbz2": ".tbz2",
    "tar.xz": ".tar.xz",
    "txz": ".txz",
}

TAR_WRITE_MODES = {
    "tar": "w",
    "tar.gz": "w:gz",
    "tgz": "w:gz",
    "tar.bz2": "w:bz2",
    "tbz2": "w:bz2",
    "tar.xz": "w:xz",
    "txz": "w:xz",
}

SINGLE_FORMATS = {"gz": "gzip", "bz2": "bzip2", "xz": "xz"}
EXTERNAL_FORMATS = {"rar": "RAR", "7z": "7-Zip", "iso": "ISO"}

ARCHIVE_SUFFIXES = (
    ".tar.gz", ".tar.bz2", ".tar.xz", ".tgz", ".tbz2", ".txz",
    ".tar", ".zip", ".zipx", ".gz", ".bz2", ".xz", ".rar", ".7z", ".iso",
)


def archive_format(path: Path) -> str:
    """'zip', 'tar.gz', 'gz', 'rar'... for a file name, or '' if unknown."""
    name = path.name.lower()
    for suffix in ARCHIVE_SUFFIXES:
        if name.endswith(suffix):
            return suffix[1:]
    return ""


def _strip_archive_suffix(name: str) -> str:
    low = name.lower()
    for suffix in ARCHIVE_SUFFIXES:
        if low.endswith(suffix):
            return name[: len(name) - len(suffix)] or name
    return name


def _require_archive(path: Path) -> str:
    if not path.exists():
        raise ApiError("Archive not found", 404)
    if not path.is_file():
        raise ApiError("That is a folder, not an archive", 400)
    fmt = archive_format(path)
    if not fmt:
        raise ApiError(f"\u201c{path.name}\u201d is not a supported archive.", 415)
    if fmt in EXTERNAL_FORMATS:
        raise ApiError(
            f"{path.name} is a {EXTERNAL_FORMATS[fmt]} archive. Win95 NAS opens "
            "ZIP, TAR, TAR.GZ, TAR.BZ2, TAR.XZ, GZ, BZ2 and XZ archives. "
            f"Convert it with {EXTERNAL_FORMATS[fmt]} first.",
            415,
        )
    return fmt


def _safe_member(name: str):
    """Normalise an archive entry name; None when it would escape the folder."""
    text = (name or "").replace("\\", "/").split("\x00")[0]
    parts = []
    for part in text.split("/"):
        if part in ("", "."):
            continue
        if part == "..":
            return None
        if len(part) >= 2 and part[1] == ":":
            return None
        parts.append(part)
    return "/".join(parts) or None


def _inside(base: Path, target: Path) -> bool:
    try:
        return target.resolve().is_relative_to(base.resolve())
    except (OSError, ValueError):
        return False


def _zip_mtime(info: zipfile.ZipInfo) -> int:
    try:
        return int(time.mktime(tuple(info.date_time) + (0, 0, -1)) * 1000)
    except (OverflowError, ValueError, TypeError):
        return 0


def _walk_source(source: Path):
    """Yield (disk path, archive name) for a file or folder, links skipped."""
    if source.is_file():
        yield source, source.name
        return
    base = source.name
    for root, dirs, files in os.walk(source):
        root_path = Path(root)
        dirs[:] = [d for d in dirs if not (root_path / d).is_symlink()]
        rel_root = root_path.relative_to(source)
        for name in files:
            item = root_path / name
            if item.is_symlink():
                continue
            rel = name if str(rel_root) == "." else f"{rel_root.as_posix()}/{name}"
            yield item, f"{base}/{rel}"


def _tree_size(path: Path) -> int:
    if path.is_file():
        try:
            return path.stat().st_size
        except OSError:
            return 0
    total = 0
    for root, _dirs, files in os.walk(path):
        for name in files:
            try:
                total += (Path(root) / name).stat().st_size
            except OSError:
                pass
    return total


def _copy_limited(src, dst, limit=None) -> int:
    written = 0
    while True:
        chunk = src.read(1 << 20)
        if not chunk:
            break
        written += len(chunk)
        if limit is not None and written > limit:
            raise ApiError("An archive entry is larger than its header says", 400)
        dst.write(chunk)
    return written


def _zip_entries(target: Path) -> list[dict]:
    entries = []
    with zipfile.ZipFile(target, "r") as zf:
        for info in zf.infolist():
            entries.append({
                "name": info.filename,
                "size": info.file_size,
                "compressed": info.compress_size,
                "mtime": _zip_mtime(info),
                "dir": info.is_dir(),
                "crc": "%08X" % (info.CRC & 0xFFFFFFFF),
                "encrypted": bool(info.flag_bits & 0x1),
            })
    return entries


def _tar_entries(target: Path) -> list[dict]:
    entries = []
    with tarfile.open(target, "r:*") as tf:
        for member in tf.getmembers():
            entries.append({
                "name": member.name,
                "size": member.size,
                "compressed": 0,
                "mtime": int(member.mtime * 1000) if member.mtime else 0,
                "dir": member.isdir(),
                "crc": "",
                "encrypted": False,
            })
    return entries


def _single_size(target: Path, fmt: str) -> int:
    """Uncompressed size of a .gz/.bz2/.xz, or -1 when it is too big to scan."""
    if target.stat().st_size > 64 * 1024 * 1024:
        return -1
    opener = {"gz": gzip.open, "bz2": bz2.open, "xz": lzma.open}[fmt]
    total = 0
    try:
        with opener(target, "rb") as fh:
            while True:
                chunk = fh.read(1 << 20)
                if not chunk:
                    break
                total += len(chunk)
    except (OSError, EOFError) as exc:
        raise ApiError(f"Cannot read {target.name}: {exc}", 400)
    return total


def api_archive_list(h, q):
    target = safe_path(qv(q, "path", ""))
    fmt = _require_archive(target)
    encrypted = False
    if fmt == "zip":
        entries = _zip_entries(target)
        encrypted = any(entry["encrypted"] for entry in entries)
    elif fmt in TAR_WRITE_MODES:
        entries = _tar_entries(target)
    else:
        size = _single_size(target, fmt)
        entries = [{
            "name": _strip_archive_suffix(target.name),
            "size": size,
            "compressed": target.stat().st_size,
            "mtime": int(target.stat().st_mtime * 1000),
            "dir": False,
            "crc": "",
            "encrypted": False,
        }]
    total = sum(max(0, entry["size"]) for entry in entries if not entry["dir"])
    return {
        "path": rel_of(target),
        "name": target.name,
        "format": fmt,
        "entries": entries,
        "count": len(entries),
        "totalSize": total,
        "compressedSize": target.stat().st_size,
        "encrypted": encrypted,
    }


def _create_format(raw: str, name: str) -> str:
    fmt = (raw or "").strip().lower().lstrip(".")
    if not fmt and name:
        fmt = archive_format(Path(name))
    if fmt == "zipx":
        fmt = "zip"
    if fmt not in ARCHIVE_WRITE_FORMATS:
        raise ApiError("Choose ZIP, TAR, TAR.GZ, TAR.BZ2 or TAR.XZ.", 400)
    return fmt


def api_archive_create(h, q):
    body = h.read_json()
    rels = [str(r) for r in (body.get("paths") or []) if str(r).strip()]
    if not rels:
        raise ApiError("Choose at least one file or folder to compress.", 400)
    sources = [safe_path(r) for r in rels]
    for source in sources:
        if source == NAS_ROOT:
            raise ApiError("Choose files or folders inside the NAS, not the whole drive.", 400)
        if not source.exists():
            raise ApiError(f"\u201c{source.name}\u201d was not found.", 404)

    dest = safe_path(body.get("dest") or "/")
    if not dest.is_dir():
        raise ApiError("Destination folder not found", 404)

    fmt = _create_format(body.get("format") or "", body.get("name") or "")
    name = sanitize_name(body.get("name") or "", is_dir=False)
    if not name or name == "untitled":
        name = sources[0].name if len(sources) == 1 else "Archive"
    low = name.lower()
    for suffix in ARCHIVE_SUFFIXES:
        if low.endswith(suffix):
            name = name[: -len(suffix)]
            break
    name = (name or "Archive") + ARCHIVE_WRITE_FORMATS[fmt]
    target = unique_path(dest, name)

    total = sum(_tree_size(source) for source in sources)
    ensure_storage(total)

    level = int(body.get("level") if body.get("level") is not None else 6)
    level = max(0, min(9, level))

    TMP_DIR.mkdir(parents=True, exist_ok=True)
    tmp = TMP_DIR / f"arc_{secrets.token_hex(8)}{ARCHIVE_WRITE_FORMATS[fmt]}"
    try:
        with ARCHIVE_LOCK:
            if fmt == "zip":
                method = zipfile.ZIP_STORED if level == 0 else zipfile.ZIP_DEFLATED
                with zipfile.ZipFile(tmp, "w", method, allowZip64=True,
                                     compresslevel=None if level == 0 else level) as zf:
                    for source in sources:
                        for path, arc in _walk_source(source):
                            zf.write(path, arc)
            else:
                mode = TAR_WRITE_MODES[fmt]
                with tarfile.open(tmp, mode) as tf:
                    for source in sources:
                        for path, arc in _walk_source(source):
                            tf.add(path, arcname=arc, recursive=False)
        shutil.move(str(tmp), str(target))
    finally:
        tmp.unlink(missing_ok=True)
    return {"ok": True, "entry": describe(target), "format": fmt,
            "count": 0, "totalSize": total}


def _extract_dest(target: Path, fmt: str, dest_rel: str):
    base = _strip_archive_suffix(target.name)
    if fmt in SINGLE_FORMATS:
        if dest_rel:
            return safe_path(dest_rel), base
        return target.parent, base
    if dest_rel:
        return safe_path(dest_rel), None
    return target.parent / base, None


def api_archive_extract(h, q):
    body = h.read_json()
    target = safe_path(body.get("path") or "")
    fmt = _require_archive(target)

    wanted = None
    raw_members = [str(m) for m in (body.get("members") or []) if str(m).strip()]
    if raw_members:
        wanted = set()
        for member in raw_members:
            safe = _safe_member(member)
            if safe:
                wanted.add(safe)
        if not wanted:
            raise ApiError("No valid archive entries were selected.", 400)

    overwrite = bool(body.get("overwrite"))
    dest, single_name = _extract_dest(target, fmt, (body.get("dest") or "").strip())

    if dest.exists() and not dest.is_dir():
        raise ApiError("The destination is a file, not a folder.", 400)

    if fmt == "zip":
        with zipfile.ZipFile(target, "r") as zf:
            total = sum(
                info.file_size for info in zf.infolist()
                if not info.is_dir() and (wanted is None or _safe_member(info.filename) in wanted)
            )
    elif fmt in TAR_WRITE_MODES:
        with tarfile.open(target, "r:*") as tf:
            total = sum(
                member.size for member in tf.getmembers()
                if member.isfile() and (wanted is None or _safe_member(member.name) in wanted)
            )
    else:
        total = max(0, _single_size(target, fmt))
    ensure_storage(total)

    dest.mkdir(parents=True, exist_ok=True)
    extracted = []
    skipped = []

    if fmt == "zip":
        with zipfile.ZipFile(target, "r") as zf:
            for info in zf.infolist():
                safe = _safe_member(info.filename)
                if safe is None:
                    skipped.append(info.filename)
                    continue
                if wanted is not None and safe not in wanted:
                    continue
                out = dest / safe
                if info.is_dir():
                    out.mkdir(parents=True, exist_ok=True)
                    continue
                if not _inside(dest, out):
                    skipped.append(info.filename)
                    continue
                out.parent.mkdir(parents=True, exist_ok=True)
                if out.exists() and not overwrite:
                    out = unique_path(out.parent, out.name)
                try:
                    with zf.open(info) as src, open(out, "wb") as dst:
                        _copy_limited(src, dst, info.file_size)
                except RuntimeError as exc:
                    raise ApiError(
                        f"{info.filename}: {exc}. Password-protected archives are not supported.",
                        400,
                    ) from exc
                extracted.append(rel_of(out))
    elif fmt in TAR_WRITE_MODES:
        with tarfile.open(target, "r:*") as tf:
            for member in tf:
                safe = _safe_member(member.name)
                if safe is None:
                    skipped.append(member.name)
                    continue
                if wanted is not None and safe not in wanted:
                    continue
                out = dest / safe
                if member.isdir():
                    out.mkdir(parents=True, exist_ok=True)
                    continue
                if not member.isfile():
                    skipped.append(member.name + " (link or special file)")
                    continue
                if not _inside(dest, out):
                    skipped.append(member.name)
                    continue
                out.parent.mkdir(parents=True, exist_ok=True)
                if out.exists() and not overwrite:
                    out = unique_path(out.parent, out.name)
                src = tf.extractfile(member)
                if src is None:
                    skipped.append(member.name)
                    continue
                with src, open(out, "wb") as dst:
                    _copy_limited(src, dst, member.size)
                extracted.append(rel_of(out))
    else:
        opener = {"gz": gzip.open, "bz2": bz2.open, "xz": lzma.open}[fmt]
        out = dest / single_name
        if out.exists() and not overwrite:
            out = unique_path(dest, out.name)
        with opener(target, "rb") as src, open(out, "wb") as dst:
            _copy_limited(src, dst, None)
        extracted.append(rel_of(out))

    return {
        "ok": True,
        "dest": rel_of(dest),
        "extracted": len(extracted),
        "files": extracted[:200],
        "skipped": skipped[:100],
    }


def _copy_zip_except(source: Path, dest: Path, skip: set) -> None:
    with zipfile.ZipFile(source, "r") as src, \
            zipfile.ZipFile(dest, "w", zipfile.ZIP_DEFLATED, allowZip64=True) as dst:
        for info in src.infolist():
            safe = _safe_member(info.filename) or info.filename
            if safe in skip:
                continue
            try:
                if info.is_dir():
                    dst.writestr(info, b"")
                else:
                    with src.open(info) as rf, dst.open(info, "w") as wf:
                        shutil.copyfileobj(rf, wf, 1 << 20)
            except RuntimeError as exc:
                raise ApiError(
                    f"{info.filename}: {exc}. Password-protected archives are not supported.",
                    400,
                ) from exc


def api_archive_add(h, q):
    body = h.read_json()
    target = safe_path(body.get("path") or "")
    fmt = _require_archive(target)
    if fmt != "zip":
        raise ApiError("Files can only be added to .zip archives in Win95 NAS.", 400)

    rels = [str(r) for r in (body.get("paths") or []) if str(r).strip()]
    if not rels:
        raise ApiError("Choose at least one file or folder to add.", 400)
    sources = [safe_path(r) for r in rels]
    for source in sources:
        if not source.exists():
            raise ApiError(f"\u201c{source.name}\u201d was not found.", 404)

    base = _safe_member(body.get("base") or "") or ""
    entries = []
    for source in sources:
        for path, arc in _walk_source(source):
            entries.append((path, f"{base}/{arc}" if base else arc))
    if not entries:
        raise ApiError("There are no files to add.", 400)
    ensure_storage(sum(path.stat().st_size for path, _arc in entries))

    TMP_DIR.mkdir(parents=True, exist_ok=True)
    tmp = target.parent / f".win95nas-add-{secrets.token_hex(6)}.zip"
    try:
        with ARCHIVE_LOCK:
            _copy_zip_except(target, tmp, {arc for _path, arc in entries})
            with zipfile.ZipFile(tmp, "a", zipfile.ZIP_DEFLATED, allowZip64=True) as zf:
                for path, arc in entries:
                    zf.write(path, arc)
            os.replace(tmp, target)
    finally:
        tmp.unlink(missing_ok=True)
    return {"ok": True, "entry": describe(target), "added": len(entries)}


def api_archive_delete(h, q):
    body = h.read_json()
    target = safe_path(body.get("path") or "")
    fmt = _require_archive(target)
    if fmt != "zip":
        raise ApiError("Entries can only be removed from .zip archives.", 400)

    names = set()
    for member in body.get("members") or []:
        safe = _safe_member(str(member))
        if safe:
            names.add(safe)
    if not names:
        raise ApiError("Select at least one entry to delete.", 400)

    with zipfile.ZipFile(target, "r") as zf:
        existing = {(_safe_member(info.filename) or info.filename) for info in zf.infolist()}
    removed = sorted(names & existing)
    if not removed:
        raise ApiError("Those entries are not in the archive.", 404)

    TMP_DIR.mkdir(parents=True, exist_ok=True)
    tmp = target.parent / f".win95nas-del-{secrets.token_hex(6)}.zip"
    try:
        with ARCHIVE_LOCK:
            _copy_zip_except(target, tmp, set(removed))
            os.replace(tmp, target)
    finally:
        tmp.unlink(missing_ok=True)
    return {"ok": True, "entry": describe(target), "removed": len(removed), "names": removed}


def api_archive_test(h, q):
    body = h.read_json()
    target = safe_path(body.get("path") or "")
    fmt = _require_archive(target)
    errors = []
    checked = 0
    encrypted = False

    if fmt == "zip":
        with zipfile.ZipFile(target, "r") as zf:
            for info in zf.infolist():
                if info.is_dir():
                    continue
                if info.flag_bits & 0x1:
                    encrypted = True
                    continue
                try:
                    with zf.open(info) as fh:
                        while fh.read(1 << 20):
                            pass
                    checked += 1
                except Exception as exc:  # noqa: BLE001 - report every failure
                    errors.append(f"{info.filename}: {exc}")
    elif fmt in TAR_WRITE_MODES:
        try:
            with tarfile.open(target, "r:*") as tf:
                for member in tf:
                    if not member.isfile():
                        continue
                    fh = tf.extractfile(member)
                    if fh is None:
                        errors.append(f"{member.name}: cannot read entry")
                        continue
                    with fh:
                        while fh.read(1 << 20):
                            pass
                    checked += 1
        except (tarfile.TarError, OSError, EOFError) as exc:
            errors.append(str(exc))
    else:
        opener = {"gz": gzip.open, "bz2": bz2.open, "xz": lzma.open}[fmt]
        try:
            with opener(target, "rb") as fh:
                while fh.read(1 << 20):
                    pass
            checked = 1
        except (OSError, EOFError) as exc:
            errors.append(str(exc))

    message = ""
    if encrypted:
        message = "This archive is password-protected; entries cannot be tested."
    elif errors:
        message = f"{len(errors)} problem(s) found."
    else:
        message = "No errors found."
    return {"ok": not errors and not encrypted, "checked": checked,
            "errors": errors[:50], "encrypted": encrypted, "message": message}


def api_archive_member(h, q):
    target = safe_path(qv(q, "path", ""))
    fmt = _require_archive(target)
    member = qv(q, "member", "")
    safe = _safe_member(member)
    TMP_DIR.mkdir(parents=True, exist_ok=True)

    if fmt == "zip":
        with zipfile.ZipFile(target, "r") as zf:
            info = next(
                (i for i in zf.infolist()
                 if (_safe_member(i.filename) or i.filename) == (safe or member)),
                None,
            )
            if info is None:
                raise ApiError("Entry not found", 404)
            if info.is_dir():
                raise ApiError("That entry is a folder", 400)
            name = os.path.basename(info.filename.replace("\\", "/")) or "member"
            out = TMP_DIR / f"{secrets.token_hex(6)}_{sanitize_name(name)}"
            try:
                with zf.open(info) as src, open(out, "wb") as dst:
                    _copy_limited(src, dst, info.file_size)
            except RuntimeError as exc:
                out.unlink(missing_ok=True)
                raise ApiError("This entry is password-protected.", 400) from exc
    elif fmt in TAR_WRITE_MODES:
        with tarfile.open(target, "r:*") as tf:
            found = next(
                (m for m in tf.getmembers()
                 if (_safe_member(m.name) or m.name) == (safe or member)),
                None,
            )
            if found is None:
                raise ApiError("Entry not found", 404)
            if not found.isfile():
                raise ApiError("That entry is a folder", 400)
            name = os.path.basename(found.name) or "member"
            out = TMP_DIR / f"{secrets.token_hex(6)}_{sanitize_name(name)}"
            src = tf.extractfile(found)
            if src is None:
                raise ApiError("Cannot read that entry", 400)
            with src, open(out, "wb") as dst:
                _copy_limited(src, dst, found.size)
    else:
        name = _strip_archive_suffix(target.name)
        out = TMP_DIR / f"{secrets.token_hex(6)}_{sanitize_name(name)}"
        opener = {"gz": gzip.open, "bz2": bz2.open, "xz": lzma.open}[fmt]
        with opener(target, "rb") as src, open(out, "wb") as dst:
            _copy_limited(src, dst, None)

    h.send_disk_file(out, download_name=name, inline=True, cleanup=out)


def api_raw(h, q):
    target = safe_path(qv(q, "path", ""))
    if not target.is_file():
        raise ApiError("File not found", 404)
    h.send_disk_file(target, download_name=target.name, inline=True, ranged=True)


def api_text_get(h, q):
    target = safe_path(qv(q, "path", ""))
    if not target.is_file():
        raise ApiError("File not found", 404)
    if target.stat().st_size > 4 * 1024 * 1024:
        raise ApiError("File is too large for the editor", 413)
    data = target.read_bytes()
    try:
        text = data.decode("utf-8")
    except UnicodeDecodeError:
        text = data.decode("latin-1", "replace")
    return {"path": rel_of(target), "name": target.name, "text": text,
            "size": target.stat().st_size, "mtime": int(target.stat().st_mtime * 1000)}


def api_tray(h, q):
    return tray.status()


def api_office(h, q):
    target = safe_path(qv(q, "path", ""))
    if not target.is_file():
        raise ApiError("File not found", 404)
    if target.suffix.lower() not in OFFICE_EXT:
        raise ApiError("That is not an Office document", 415)
    try:
        return office.render(target)
    except office.OfficeError as exc:
        raise ApiError(str(exc), 415)
    except Exception as exc:
        raise ApiError(f"Could not read this document: {exc}", 500)


def api_office_media(h, q):
    target = safe_path(qv(q, "path", ""))
    if not target.is_file():
        raise ApiError("File not found", 404)
    try:
        data, ctype = office.read_part(target, qv(q, "name", ""))
    except office.OfficeError as exc:
        raise ApiError(str(exc), 404)
    h.send_response(200)
    h.send_header("Content-Type", ctype)
    h.send_header("Content-Length", str(len(data)))
    h.send_header("Cache-Control", "private, max-age=600")
    h.end_headers()
    h.wfile.write(data)
    h._sent = True


def api_office_save(h, q):
    body = h.read_json()
    target = safe_path(body.get("path", ""))
    if not target.is_file():
        raise ApiError("File not found", 404)
    if target.suffix.lower() not in OFFICE_EXT:
        raise ApiError("That is not an Office document", 415)
    kind = str(body.get("type") or "").lower()
    if kind not in office.EXTENSIONS:
        raise ApiError("Unknown document type", 400)
    model = body.get("model") or {}
    if not isinstance(model, dict):
        raise ApiError("Invalid document data", 400)
    try:
        data = office.build(kind, model)
    except office.OfficeError as exc:
        raise ApiError(str(exc), 400)
    except Exception as exc:
        raise ApiError(f"Could not save this document: {exc}", 500)
    if len(data) > 64 * 1024 * 1024:
        raise ApiError("Document is too large", 413)
    old_size = target.stat().st_size
    ensure_storage(len(data), replacing=old_size)
    target.write_bytes(data)
    return {"ok": True, "entry": describe(target)}


def api_newdoc(h, q):
    body = h.read_json()
    folder = safe_path(body.get("path", "/"))
    if not folder.is_dir():
        raise ApiError("Folder not found", 404)
    kind = str(body.get("type") or "word").lower()
    if kind not in office.EXTENSIONS:
        raise ApiError("Unknown document type", 400)
    name = sanitize_name(body.get("name") or office.default_name(kind))
    expected = office.EXTENSIONS[kind]
    if Path(name).suffix.lower() not in expected:
        name += expected[0]
    data = office.create(kind)
    ensure_storage(len(data))
    target = unique_path(folder, name)
    target.write_bytes(data)
    return {"ok": True, "entry": describe(target)}


def api_text_put(h, q):
    body = h.read_json()
    target = safe_path(body.get("path", ""))
    if not target.parent.is_dir():
        raise ApiError("Folder not found", 404)
    if target.exists() and target.is_dir():
        raise ApiError("That is a folder", 400)
    text = body.get("text", "")
    encoded_size = len(text.encode("utf-8"))
    if encoded_size > 16 * 1024 * 1024:
        raise ApiError("Text is too large", 413)
    old_size = target.stat().st_size if target.exists() else 0
    ensure_storage(encoded_size, replacing=old_size)
    target.write_text(text, "utf-8")
    return {"ok": True, "entry": describe(target)}


IMAGE_SAVE_EXT = {".png", ".bmp", ".jpg", ".jpeg", ".gif", ".webp"}


def api_image_put(h, q):
    """Save a picture from Paint (base64 data URL) to the NAS."""
    body = h.read_json()
    target = safe_path(body.get("path", ""))
    if target.suffix.lower() not in IMAGE_SAVE_EXT:
        raise ApiError("Save the picture as a PNG, BMP, JPEG, GIF or WebP file.", 400)
    if not target.parent.is_dir():
        raise ApiError("Folder not found", 404)
    if target.exists() and target.is_dir():
        raise ApiError("That is a folder", 400)
    data = body.get("data") or ""
    if not isinstance(data, str) or not data:
        raise ApiError("The picture is empty.", 400)
    if "," in data[:64]:
        data = data.split(",", 1)[1]
    try:
        raw = base64.b64decode(data, validate=False)
    except Exception as exc:
        raise ApiError("The picture data is not valid.", 400) from exc
    if not raw:
        raise ApiError("The picture is empty.", 400)
    if len(raw) > 32 * 1024 * 1024:
        raise ApiError("That picture is too large to save.", 413)
    old_size = target.stat().st_size if target.exists() else 0
    ensure_storage(len(raw), replacing=old_size)
    tmp = target.parent / f".win95nas-img-{secrets.token_hex(6)}.tmp"
    try:
        tmp.write_bytes(raw)
        os.replace(tmp, target)
    finally:
        tmp.unlink(missing_ok=True)
    return {"ok": True, "entry": describe(target)}


def api_settings_get(h, q):
    return {"settings": load_settings()}


def api_settings_put(h, q):
    body = h.read_json()
    return {"ok": True, "settings": save_settings(body)}


def api_wallpapers(h, q):
    files = []
    for item in sorted(WALLPAPER_DIR.iterdir()):
        if item.is_file() and item.suffix.lower() in IMAGE_EXT:
            try:
                files.append({"name": item.name, "url": f"/wallpapers/{urllib.parse.quote(item.name)}",
                              "size": item.stat().st_size,
                              "mtime": int(item.stat().st_mtime * 1000)})
            except OSError:
                pass
    return {"wallpapers": files}


def api_wallpaper_upload(h, q):
    name = sanitize_name(qv(q, "name", "wallpaper.png"))
    if not name.lower().endswith(tuple(IMAGE_EXT)):
        name += ".png"
    length = int(h.headers.get("Content-Length") or 0)
    if length <= 0 or length > 30 * 1024 * 1024:
        raise ApiError("Wallpaper must be under 30 MB", 413)
    target = unique_path(WALLPAPER_DIR, name)
    with open(target, "wb") as out:
        left = length
        while left > 0:
            chunk = h.rfile.read(min(262144, left))
            if not chunk:
                break
            out.write(chunk)
            left -= len(chunk)
    return {"ok": True, "name": target.name,
            "url": f"/wallpapers/{urllib.parse.quote(target.name)}"}


def api_wallpaper_delete(h, q):
    name = sanitize_name(qv(q, "name", ""))
    target = WALLPAPER_DIR / name
    if target.is_file():
        target.unlink()
    return {"ok": True}


def api_recycle(h, q):
    items = []
    for meta_file in RECYCLE_DIR.glob("*.json"):
        try:
            meta = json.loads(meta_file.read_text("utf-8"))
            holder = RECYCLE_DIR / meta["id"] / meta["name"]
            meta["exists"] = holder.exists()
            items.append(meta)
        except Exception:
            continue
    items.sort(key=lambda m: m.get("deletedAt", 0), reverse=True)
    return {"items": items}


def api_recycle_restore(h, q):
    body = h.read_json()
    rid = str(body.get("id", ""))
    if not re.match(r"^[A-Za-z0-9_]+$", rid):
        raise ApiError("Invalid id", 400)
    meta_file = RECYCLE_DIR / f"{rid}.json"
    if not meta_file.exists():
        raise ApiError("Item not found", 404)
    meta = json.loads(meta_file.read_text("utf-8"))
    holder = RECYCLE_DIR / rid / meta["name"]
    if not holder.exists():
        raise ApiError("Recycled file is missing", 404)
    original = safe_path(meta["original"])
    ensure_storage(path_size(holder))
    original.parent.mkdir(parents=True, exist_ok=True)
    target = unique_path(original.parent, original.name, is_dir=holder.is_dir())
    shutil.move(str(holder), str(target))
    meta_file.unlink(missing_ok=True)
    shutil.rmtree(RECYCLE_DIR / rid, ignore_errors=True)
    return {"ok": True, "entry": describe(target)}


def api_recycle_empty(h, q):
    for item in RECYCLE_DIR.iterdir():
        if item.is_dir():
            shutil.rmtree(item, ignore_errors=True)
        else:
            item.unlink(missing_ok=True)
    return {"ok": True}


def api_recycle_delete(h, q):
    body = h.read_json()
    rid = str(body.get("id", ""))
    if not re.match(r"^[A-Za-z0-9_]+$", rid):
        raise ApiError("Invalid id", 400)
    shutil.rmtree(RECYCLE_DIR / rid, ignore_errors=True)
    (RECYCLE_DIR / f"{rid}.json").unlink(missing_ok=True)
    return {"ok": True}


def api_open_folder(h, q):
    body = h.read_json()
    target = safe_path(body.get("path", "/"))
    if not target.exists():
        raise ApiError("Not found", 404)
    try:
        if IS_WINDOWS:
            os.startfile(str(target))
        elif sys.platform == "darwin":
            subprocess.Popen(["open", str(target)])
        else:
            subprocess.Popen(["xdg-open", str(target)])
    except Exception as exc:
        raise ApiError(f"Could not open folder: {exc}", 500)
    return {"ok": True, "path": str(target)}


# ---------------------------------------------------------------------------
# Docker API
# ---------------------------------------------------------------------------

def api_docker_status(h, q):
    return docker_status()


def api_docker_containers(h, q):
    return {"containers": docker_containers()}


def api_docker_action(h, q):
    body = h.read_json()
    return docker_container_action(body.get("id", ""), body.get("action", ""))


def api_docker_logs(h, q):
    body = h.read_json()
    return {"logs": docker_logs(body.get("id", ""), body.get("tail", 300))}


def api_docker_inspect(h, q):
    body = h.read_json()
    cid = body.get("id", "")
    if not re.match(r"^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$", cid):
        raise ApiError("Invalid container id", 400)
    out = docker_ok(["inspect", cid], timeout=30)
    try:
        return {"inspect": json.loads(out)[0]}
    except Exception:
        return {"inspect": out}


def api_docker_ls(h, q):
    container = qv(q, "id", "")
    path = qv(q, "path", "/")
    return {"path": path, "entries": docker_ls(container, path)}


def api_docker_upload(h, q):
    body = h.read_json()
    container = body.get("id", "")
    container_path = body.get("containerPath", "/tmp")
    nas_path = body.get("nasPath", "")
    source = safe_path(nas_path)
    if not source.exists():
        raise ApiError("NAS item not found", 404)
    if not re.match(r"^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$", container):
        raise ApiError("Invalid container id", 400)
    code, out, err = docker_run(
        ["cp", str(source), f"{container}:{container_path}"], timeout=600,
        check_container=container,
    )
    if code != 0:
        raise ApiError((err or out).strip().splitlines()[-1][:400] if (err or out).strip() else "docker cp failed", 400)
    return {"ok": True, "output": (out or err).strip()}


def api_docker_save(h, q):
    body = h.read_json()
    container = body.get("id", "")
    container_path = body.get("path", "")
    dest = body.get("dest") or "/Docker Backups"
    if not re.match(r"^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$", container):
        raise ApiError("Invalid container id", 400)
    dest_dir = safe_path(dest)
    if dest_dir.exists() and not dest_dir.is_dir():
        raise ApiError("Destination is not a folder", 400)
    dest_dir.mkdir(parents=True, exist_ok=True)
    code, out, err = docker_run(
        ["cp", f"{container}:{container_path}", str(dest_dir)], timeout=1800,
        check_container=container,
    )
    if code != 0:
        raise ApiError((err or out).strip().splitlines()[-1][:400] if (err or out).strip() else "docker cp failed", 400)
    return {"ok": True, "dest": rel_of(dest_dir), "output": (out or err).strip()}


def api_docker_download(h, q):
    container = qv(q, "id", "")
    path = qv(q, "path", "")
    if not re.match(r"^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$", container):
        raise ApiError("Invalid container id", 400)
    kind = docker_path_kind(container, path)
    if kind == "none":
        raise ApiError("Path not found in container", 404)
    if kind == "dir":
        temp_holder = Path(tempfile.mkdtemp(dir=TMP_DIR))
        try:
            code, out, err = docker_run(
                ["cp", f"{container}:{path}", str(temp_holder)], timeout=900,
                check_container=container,
            )
            if code != 0:
                raise ApiError((err or out).strip().splitlines()[-1][:400] if (err or out).strip() else "docker cp failed", 400)
            children = list(temp_holder.iterdir())
            source = children[0] if children else temp_holder
            archive = build_zip([source])
            h.send_disk_file(archive, download_name=f"{source.name}.zip", cleanup=archive)
        finally:
            shutil.rmtree(temp_holder, ignore_errors=True)
        return

    exe = find_docker()
    if not exe:
        raise ApiError("Docker CLI not found", 503)
    name = os.path.basename(path.rstrip("/")) or "download"
    proc = subprocess.Popen(
        [exe, "exec", container, "sh", "-c", 'cat -- "$1"', "sh", path],
        stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        creationflags=CREATE_NO_WINDOW,
    )
    self_headers = [
        ("Content-Type", "application/octet-stream"),
        ("Content-Disposition", content_disposition(name)),
        ("Cache-Control", "no-store"),
    ]
    h.send_response(200)
    for key, value in self_headers:
        h.send_header(key, value)
    h.end_headers()
    h._sent = True
    try:
        assert proc.stdout is not None
        while True:
            chunk = proc.stdout.read(262144)
            if not chunk:
                break
            h.wfile.write(chunk)
        h.wfile.flush()
    finally:
        try:
            proc.stdout and proc.stdout.close()
        except Exception:
            pass
        try:
            proc.wait(timeout=10)
        except Exception:
            proc.kill()


def api_docker_volumes(h, q):
    return {"volumes": docker_volumes()}


def api_docker_volume_inspect(h, q):
    name = qv(q, "name", "")
    if not re.match(r"^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$", name):
        raise ApiError("Invalid volume name", 400)
    out = docker_ok(["volume", "inspect", name], timeout=20)
    try:
        return {"volume": json.loads(out)[0]}
    except Exception:
        return {"volume": out}


def api_docker_volume_create(h, q):
    body = h.read_json()
    name = sanitize_name(body.get("name", ""), is_dir=True).replace(" ", "_")
    if not name:
        raise ApiError("Name required", 400)
    out = docker_ok(["volume", "create", name], timeout=30)
    return {"ok": True, "name": name, "output": out.strip()}


def api_docker_volume_remove(h, q):
    body = h.read_json()
    name = body.get("name", "")
    if not re.match(r"^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$", name):
        raise ApiError("Invalid volume name", 400)
    out = docker_ok(["volume", "rm", name], timeout=30)
    return {"ok": True, "output": out.strip()}


def api_docker_volume_backup(h, q):
    body = h.read_json()
    return volume_backup(body.get("name", ""), body.get("dest", ""))


def api_docker_volume_restore(h, q):
    body = h.read_json()
    return volume_restore(body.get("name", ""), body.get("nasPath", ""))


def api_docker_helper(h, q):
    return {"ok": True, "image": docker_helper_image()}


def api_docker_start_desktop(h, q):
    return start_docker_desktop()


# ---------------------------------------------------------------------------
# Tailscale
# ---------------------------------------------------------------------------

TAILSCALE_CANDIDATES = (
    r"C:\Program Files\Tailscale\tailscale.exe",
    r"C:\Program Files (x86)\Tailscale\tailscale.exe",
)


def find_tailscale():
    exe = shutil.which("tailscale") or shutil.which("tailscale.exe")
    if exe:
        return exe
    for candidate in TAILSCALE_CANDIDATES:
        path = Path(candidate)
        if path.is_file():
            return str(path)
    return None


def run_cli(exe: str, args: list[str], timeout: float = 30) -> tuple[int, str, str]:
    try:
        proc = subprocess.run(
            [exe, *args],
            capture_output=True,
            timeout=timeout,
            creationflags=CREATE_NO_WINDOW,
        )
    except subprocess.TimeoutExpired:
        raise ApiError("The command timed out", 504)
    except OSError as exc:
        raise ApiError(f"Could not run {Path(exe).name}: {exc}", 503)
    return (
        proc.returncode,
        proc.stdout.decode("utf-8", "replace"),
        proc.stderr.decode("utf-8", "replace"),
    )


def _ts_ip_list(raw) -> list[str]:
    if not isinstance(raw, list):
        return []
    return [str(ip) for ip in raw if ip]


def _ts_peer(key: str, peer: dict) -> dict:
    ips = _ts_ip_list(peer.get("TailscaleIPs"))
    dns_name = str(peer.get("DNSName", "")).rstrip(".")
    nickname = str(peer.get("Nickname") or "").strip() or (dns_name.split(".")[0] if dns_name else "")
    return {
        "id": key,
        "hostname": peer.get("HostName") or dns_name or key,
        "nickname": nickname,
        "dnsName": dns_name,
        "ips": ips,
        "ip": next((ip for ip in ips if ":" not in ip), ips[0] if ips else ""),
        "os": peer.get("OS", ""),
        "online": bool(peer.get("Online")),
        "active": bool(peer.get("Active")),
        "exitNode": bool(peer.get("ExitNode")),
        "exitNodeOption": bool(peer.get("ExitNodeOption")),
        "lastSeen": peer.get("LastSeen", ""),
        "relay": peer.get("Relay", ""),
        "curAddr": peer.get("CurAddr", ""),
        "rxBytes": peer.get("RxBytes", 0),
        "txBytes": peer.get("TxBytes", 0),
    }


def tailscale_prefs(exe: str) -> dict:
    try:
        code, out, _err = run_cli(exe, ["debug", "prefs"], timeout=15)
        if code == 0 and out.strip():
            data = json.loads(out)
            return {
                "hostname": data.get("Hostname") or "",
                "exitNodeIP": data.get("ExitNodeIP") or "",
                "exitNodeID": data.get("ExitNodeID") or "",
                "acceptRoutes": bool(data.get("RouteAll")),
                "advertiseRoutes": data.get("AdvertiseRoutes") or [],
                "advertiseExitNode": bool(data.get("AdvertiseRoutes") and "0.0.0.0/0" in data.get("AdvertiseRoutes")),
                "shieldsUp": bool(data.get("ShieldsUp")),
                "wantRunning": bool(data.get("WantRunning")),
                "loggedOut": bool(data.get("LoggedOut")),
                "runSSH": bool(data.get("RunSSH")),
                "autoUpdate": bool((data.get("AutoUpdate") or {}).get("Check")),
            }
    except Exception:
        pass
    return {}


def tailscale_status() -> dict:
    exe = find_tailscale()
    if not exe:
        return {
            "installed": False, "running": False, "backendState": "NotInstalled",
            "error": "Tailscale is not installed on this PC.",
            "self": None, "peers": [], "version": None,
            "magicDNS": "", "tailnet": "", "prefs": {}, "exe": None,
        }
    code, out, err = run_cli(exe, ["status", "--json"], timeout=20)
    if code != 0:
        return {
            "installed": True, "running": False, "backendState": "Unknown",
            "error": (err or out or "Tailscale is not running").strip().splitlines()[-1][:400],
            "self": None, "peers": [], "version": None,
            "magicDNS": "", "tailnet": "", "prefs": {}, "exe": exe,
        }
    try:
        data = json.loads(out)
    except Exception:
        return {
            "installed": True, "running": False, "backendState": "Unknown",
            "error": "Could not read Tailscale status output.",
            "self": None, "peers": [], "version": None,
            "magicDNS": "", "tailnet": "", "prefs": {}, "exe": exe,
        }

    self_raw = data.get("Self") or {}
    self_info = _ts_peer("self", self_raw) if self_raw else None
    if self_info:
        self_info["hostname"] = self_raw.get("HostName") or self_info["hostname"]

    peers = []
    for key, peer in (data.get("Peer") or {}).items():
        if isinstance(peer, dict):
            peers.append(_ts_peer(str(key), peer))
    peers.sort(key=lambda p: (not p["online"], p["hostname"].lower()))

    backend = str(data.get("BackendState") or "Unknown")
    return {
        "installed": True,
        "running": backend == "Running",
        "backendState": backend,
        "error": None,
        "version": data.get("Version"),
        "magicDNS": str(data.get("MagicDNSSuffix") or "").rstrip("."),
        "tailnet": str((data.get("CurrentTailnet") or {}).get("Name") or ""),
        "self": self_info,
        "peers": peers,
        "prefs": tailscale_prefs(exe),
        "exe": exe,
    }


def tailscale_action(action: str, value: str = "") -> dict:
    exe = find_tailscale()
    if not exe:
        raise ApiError("Tailscale is not installed on this PC.", 503)
    action = (action or "").strip().lower()
    value = (value or "").strip()

    if action == "up":
        args = ["up"]
    elif action == "down":
        args = ["down"]
    elif action == "set-hostname":
        if not re.match(r"^[A-Za-z0-9][A-Za-z0-9-]{0,62}$", value):
            raise ApiError("Device names are 1-63 letters, numbers or dashes.", 400)
        args = ["set", f"--hostname={value}"]
    elif action == "set-exit-node":
        if value and not re.match(r"^[A-Za-z0-9.:_-]{1,253}$", value):
            raise ApiError("Invalid exit node.", 400)
        args = ["set", f"--exit-node={value}"]
    elif action in ("accept-routes", "advertise-exit-node"):
        enabled = str(value).lower() not in ("0", "false", "off", "no", "")
        flag = "--accept-routes" if action == "accept-routes" else "--advertise-exit-node"
        args = ["set", flag if enabled else f"{flag}=false"]
    elif action == "ping":
        if not re.match(r"^[A-Za-z0-9.:_-]{1,253}$", value):
            raise ApiError("Invalid device address.", 400)
        args = ["ping", "--c", "3", value]
    elif action == "netcheck":
        args = ["netcheck"]
    else:
        raise ApiError("Unknown Tailscale action.", 400)

    code, out, err = run_cli(exe, args, timeout=60)
    output = (out or "") + (("\n" + err) if err.strip() else "")
    if code != 0:
        message = (err or out or "Tailscale command failed").strip().splitlines()
        raise ApiError(message[-1][:400] if message else "Tailscale command failed", 400)
    return {"ok": True, "output": output.strip()[:20000], "status": tailscale_status()}


def api_tailscale_status(h, q):
    return tailscale_status()


def api_tailscale_action(h, q):
    body = h.read_json()
    return tailscale_action(str(body.get("action", "")), str(body.get("value", "")))


# ---------------------------------------------------------------------------
# Auth API
# ---------------------------------------------------------------------------

def api_auth_status(h, q):
    data = load_users()
    users = data["users"]
    username = getattr(h, "user", None)
    me = find_user(username) if username else None
    return {
        "authenticated": bool(username and me),
        "username": me.get("username") if me else None,
        "admin": bool(me.get("admin")) if me else False,
        "needsSetup": len(users) == 0,
        "userCount": len(users),
        "app": APP_NAME,
        "version": APP_VERSION,
    }


def api_auth_login(h, q):
    body = h.read_json()
    username = str(body.get("username", "")).strip()
    password = str(body.get("password", ""))
    if not username or not password:
        raise ApiError("Type your user name and password.", 400)
    ip = h.client_address[0]
    if login_blocked(ip):
        raise ApiError("Too many sign-in attempts. Wait five minutes and try again.", 429)
    user = find_user(username)
    if not user or not verify_password(password, user):
        note_login_failure(ip)
        time.sleep(0.35)
        raise ApiError("The user name or password is incorrect.", 401)
    clear_login_failures(ip)
    h.set_cookie(username)
    return {"ok": True, "username": user["username"], "admin": bool(user.get("admin"))}


def api_auth_register(h, q):
    data = load_users()
    if data["users"]:
        raise ApiError("This PC already has an account. Sign in instead.", 403)
    body = h.read_json()
    username, password = validate_credentials(body.get("username"), body.get("password"))
    salt, digest = hash_password(password)
    user = {
        "username": username,
        "salt": salt,
        "hash": digest,
        "admin": True,
        "created": int(time.time() * 1000),
    }
    data["users"].append(user)
    save_users(data)
    clear_login_failures(h.client_address[0])
    h.set_cookie(username)
    return {"ok": True, "username": username, "admin": True, "created": True}


def api_auth_logout(h, q):
    h.clear_cookie()
    return {"ok": True}


def api_auth_users(h, q):
    users = load_users()["users"]
    me = find_user(getattr(h, "user", "")) or {}
    return {
        "users": [public_user(u) for u in users],
        "me": public_user(me) if me else None,
    }


def api_auth_user_add(h, q):
    me = find_user(getattr(h, "user", ""))
    if not me or not me.get("admin"):
        raise ApiError("Only an administrator can add users.", 403)
    body = h.read_json()
    username, password = validate_credentials(body.get("username"), body.get("password"))
    if find_user(username):
        raise ApiError("That user name is already taken.", 409)
    data = load_users()
    salt, digest = hash_password(password)
    user = {
        "username": username,
        "salt": salt,
        "hash": digest,
        "admin": bool(body.get("admin")),
        "created": int(time.time() * 1000),
    }
    data["users"].append(user)
    save_users(data)
    return {"ok": True, "user": public_user(user)}


def api_auth_user_remove(h, q):
    me = find_user(getattr(h, "user", ""))
    if not me or not me.get("admin"):
        raise ApiError("Only an administrator can remove users.", 403)
    body = h.read_json()
    target = find_user(str(body.get("username", "")))
    if not target:
        raise ApiError("User not found.", 404)
    if target["username"].lower() == me["username"].lower():
        raise ApiError("You cannot remove the account you are signed in with.", 400)
    data = load_users()
    data["users"] = [u for u in data["users"] if u.get("username", "").lower() != target["username"].lower()]
    if not any(u.get("admin") for u in data["users"]):
        raise ApiError("At least one administrator must remain.", 400)
    save_users(data)
    return {"ok": True}


def api_auth_password(h, q):
    me = find_user(getattr(h, "user", ""))
    if not me:
        raise ApiError("Not signed in.", 401)
    body = h.read_json()
    current = str(body.get("current", ""))
    new_password = str(body.get("new", ""))
    if not verify_password(current, me):
        raise ApiError("Your current password is incorrect.", 401)
    if len(new_password) < 4:
        raise ApiError("Use a new password with at least 4 characters.", 400)
    data = load_users()
    for user in data["users"]:
        if user.get("username", "").lower() == me["username"].lower():
            salt, digest = hash_password(new_password)
            user["salt"] = salt
            user["hash"] = digest
            break
    save_users(data)
    return {"ok": True}



# ---------------------------------------------------------------------------
# HTTP handler
# ---------------------------------------------------------------------------

ROUTES = {
    ("GET", "/api/auth/status"): api_auth_status,
    ("POST", "/api/auth/login"): api_auth_login,
    ("POST", "/api/auth/register"): api_auth_register,
    ("POST", "/api/auth/logout"): api_auth_logout,
    ("GET", "/api/auth/users"): api_auth_users,
    ("POST", "/api/auth/users"): api_auth_user_add,
    ("POST", "/api/auth/users/remove"): api_auth_user_remove,
    ("POST", "/api/auth/password"): api_auth_password,
    ("GET", "/api/info"): api_info,
    ("GET", "/api/storage"): api_storage,
    ("POST", "/api/shell"): api_shell,
    ("GET", "/api/list"): api_list,
    ("GET", "/api/stat"): api_stat,
    ("GET", "/api/search"): api_search,
    ("POST", "/api/mkdir"): api_mkdir,
    ("POST", "/api/newfile"): api_newfile,
    ("POST", "/api/rename"): api_rename,
    ("POST", "/api/delete"): api_delete,
    ("POST", "/api/move"): api_move,
    ("POST", "/api/upload"): api_upload,
    ("GET", "/api/download"): api_download,
    ("GET", "/api/archive/list"): api_archive_list,
    ("POST", "/api/archive/create"): api_archive_create,
    ("POST", "/api/archive/extract"): api_archive_extract,
    ("POST", "/api/archive/add"): api_archive_add,
    ("POST", "/api/archive/delete"): api_archive_delete,
    ("POST", "/api/archive/test"): api_archive_test,
    ("GET", "/api/archive/member"): api_archive_member,
    ("GET", "/api/raw"): api_raw,
    ("GET", "/api/text"): api_text_get,
    ("POST", "/api/text"): api_text_put,
    ("POST", "/api/image/save"): api_image_put,
    ("GET", "/api/tray"): api_tray,
    ("GET", "/api/office"): api_office,
    ("GET", "/api/office/media"): api_office_media,
    ("POST", "/api/newdoc"): api_newdoc,
    ("POST", "/api/office/save"): api_office_save,
    ("GET", "/api/settings"): api_settings_get,
    ("POST", "/api/settings"): api_settings_put,
    ("GET", "/api/wallpapers"): api_wallpapers,
    ("POST", "/api/wallpapers"): api_wallpaper_upload,
    ("DELETE", "/api/wallpapers"): api_wallpaper_delete,
    ("GET", "/api/recycle"): api_recycle,
    ("POST", "/api/recycle/restore"): api_recycle_restore,
    ("POST", "/api/recycle/empty"): api_recycle_empty,
    ("POST", "/api/recycle/delete"): api_recycle_delete,
    ("POST", "/api/open-folder"): api_open_folder,
    ("GET", "/api/docker/status"): api_docker_status,
    ("GET", "/api/docker/containers"): api_docker_containers,
    ("POST", "/api/docker/action"): api_docker_action,
    ("POST", "/api/docker/logs"): api_docker_logs,
    ("POST", "/api/docker/inspect"): api_docker_inspect,
    ("GET", "/api/docker/ls"): api_docker_ls,
    ("POST", "/api/docker/upload"): api_docker_upload,
    ("POST", "/api/docker/save"): api_docker_save,
    ("GET", "/api/docker/download"): api_docker_download,
    ("GET", "/api/docker/volumes"): api_docker_volumes,
    ("GET", "/api/docker/volume"): api_docker_volume_inspect,
    ("POST", "/api/docker/volume/create"): api_docker_volume_create,
    ("POST", "/api/docker/volume/remove"): api_docker_volume_remove,
    ("POST", "/api/docker/volume/backup"): api_docker_volume_backup,
    ("POST", "/api/docker/volume/restore"): api_docker_volume_restore,
    ("POST", "/api/docker/helper"): api_docker_helper,
    ("POST", "/api/docker/start-desktop"): api_docker_start_desktop,
    ("GET", "/api/tailscale/status"): api_tailscale_status,
    ("POST", "/api/tailscale/action"): api_tailscale_action,
}

AUTH_PUBLIC = {
    ("GET", "/api/auth/status"),
    ("POST", "/api/auth/login"),
    ("POST", "/api/auth/register"),
    ("POST", "/api/auth/logout"),
}


class Handler(BaseHTTPRequestHandler):
    server_version = "Win95NAS/1.0"
    protocol_version = "HTTP/1.0"

    def log_message(self, fmt, *args):
        stamp = time.strftime("%H:%M:%S")
        sys.stderr.write(f"[{stamp}] {self.address_string()} {fmt % args}\n")

    # -- helpers ---------------------------------------------------------
    def read_json(self) -> dict:
        length = int(self.headers.get("Content-Length") or 0)
        if length > 8 * 1024 * 1024:
            raise ApiError("Request body too large", 413)
        raw = self.rfile.read(length) if length else b"{}"
        if not raw.strip():
            return {}
        try:
            return json.loads(raw.decode("utf-8"))
        except Exception:
            raise ApiError("Invalid JSON body", 400)

    def send_json(self, obj, code: int = 200):
        payload = json_bytes(obj)
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("Cache-Control", "no-store")
        for key, value in getattr(self, "_extra_headers", []):
            self.send_header(key, value)
        self.end_headers()
        self.wfile.write(payload)
        self._sent = True

    def send_disk_file(self, target: Path, download_name: str = "", inline: bool = False,
                       ranged: bool = False, cleanup: Path | None = None):
        try:
            stat = target.stat()
            size = stat.st_size
            ctype = mimetypes.guess_type(target.name)[0] or "application/octet-stream"
            if target.suffix.lower() == ".js":
                ctype = "text/javascript; charset=utf-8"
            elif target.suffix.lower() in (".html", ".htm"):
                ctype = "text/html; charset=utf-8"
            elif target.suffix.lower() == ".css":
                ctype = "text/css; charset=utf-8"
            start, end = 0, size - 1
            partial = False
            if ranged:
                header = self.headers.get("Range", "").strip()
                match = re.match(r"bytes=(\d*)-(\d*)$", header)
                if match:
                    first, last = match.group(1), match.group(2)
                    if first:
                        start = int(first)
                        end = int(last) if last else size - 1
                    elif last:
                        start = max(0, size - int(last))
                    start = max(0, min(start, max(0, size - 1)))
                    end = max(start, min(end, size - 1))
                    partial = True
            length = end - start + 1 if size else 0
            self.send_response(206 if partial else 200)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(length))
            self.send_header("Accept-Ranges", "bytes")
            if partial:
                self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
            if download_name:
                self.send_header("Content-Disposition", content_disposition(download_name, inline=inline))
            if not inline:
                self.send_header("Cache-Control", "no-store")
            for key, value in getattr(self, "_extra_headers", []):
                self.send_header(key, value)
            self.end_headers()
            self._sent = True
            with open(target, "rb") as handle:
                handle.seek(start)
                left = length
                while left > 0:
                    chunk = handle.read(min(262144, left))
                    if not chunk:
                        break
                    self.wfile.write(chunk)
                    left -= len(chunk)
        finally:
            if cleanup is not None:
                cleanup.unlink(missing_ok=True)

    # -- auth helpers ----------------------------------------------------
    def set_cookie(self, username: str):
        token = make_session(username)
        self._extra_headers = getattr(self, "_extra_headers", [])
        self._extra_headers.append((
            "Set-Cookie",
            f"{SESSION_COOKIE}={token}; Path=/; HttpOnly; SameSite=Lax; Max-Age={SESSION_TTL}",
        ))

    def clear_cookie(self):
        self._extra_headers = getattr(self, "_extra_headers", [])
        self._extra_headers.append((
            "Set-Cookie",
            f"{SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0",
        ))

    def current_user(self):
        token = parse_cookies(self.headers.get("Cookie", "")).get(SESSION_COOKIE)
        return read_session(token) if token else None

    def _redirect(self, location: str):
        self.send_response(302)
        self.send_header("Location", location)
        self.send_header("Content-Length", "0")
        self.send_header("Cache-Control", "no-store")
        for key, value in getattr(self, "_extra_headers", []):
            self.send_header(key, value)
        self.end_headers()
        self._sent = True

    def _serve_login(self):
        target = PUBLIC_DIR / "login.html"
        if not target.is_file():
            raise ApiError("Login page missing", 500)
        self.send_disk_file(target)

    # -- routing ---------------------------------------------------------
    def do_GET(self):
        self._dispatch("GET")

    def do_POST(self):
        self._dispatch("POST")

    def do_DELETE(self):
        self._dispatch("DELETE")

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Allow", "GET, POST, DELETE, OPTIONS")
        self.send_header("Content-Length", "0")
        self.end_headers()

    def _dispatch(self, method: str):
        self._sent = False
        self._extra_headers = []
        self.user = None
        parsed = urllib.parse.urlsplit(self.path)
        path = parsed.path
        if len(path) > 1:
            path = path.rstrip("/")
        query = urllib.parse.parse_qs(parsed.query, keep_blank_values=True)
        try:
            # Public: the logon screen, its stylesheet and the icon set.
            if method == "GET" and path in ("/login", "/login.html"):
                if self.current_user():
                    self._redirect("/")
                else:
                    self._serve_login()
                return
            if method == "GET" and (
                path.startswith("/css/")
                or path.startswith("/icons/")
                or path in ("/js/icons.js", "/js/icons-classic.js", "/js/icons-v2.js", "/js/icons-win95.js", "/favicon.ico")
            ):
                self._serve_static(path)
                return
            if (method, path) in AUTH_PUBLIC:
                self.user = self.current_user()
                result = ROUTES[(method, path)](self, query)
                if result is not None:
                    self.send_json(result)
                return

            # Everything else needs an account.
            self.user = self.current_user()
            if not self.user:
                if path.startswith("/api/"):
                    self.send_json({"error": "Please sign in to continue.", "login": True}, 401)
                else:
                    self._redirect("/login")
                return

            if path == "/api/upload" and method == "POST":
                self.send_json(api_upload(self, query))
                return
            route = ROUTES.get((method, path))
            if route:
                result = route(self, query)
                if result is not None:
                    self.send_json(result)
                return
            if path.startswith("/wallpapers/"):
                name = urllib.parse.unquote(path[len("/wallpapers/"):])
                target = WALLPAPER_DIR / sanitize_name(name)
                if not target.is_file():
                    raise ApiError("Wallpaper not found", 404)
                self.send_disk_file(target, inline=True)
                return
            if path.startswith("/api/"):
                raise ApiError("Unknown API endpoint", 404)
            self._serve_static(path)
        except ApiError as exc:
            if not self._sent:
                self.send_json({"error": str(exc)}, exc.code)
        except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
            pass
        except Exception as exc:
            traceback.print_exc()
            if not self._sent:
                self.send_json({"error": f"{type(exc).__name__}: {exc}"}, 500)

    def _serve_static(self, path: str):
        if path in ("", "/"):
            target = PUBLIC_DIR / "index.html"
        else:
            target = (PUBLIC_DIR / urllib.parse.unquote(path).lstrip("/")).resolve()
            if not str(target).startswith(str(PUBLIC_DIR.resolve())):
                raise ApiError("Forbidden", 403)
        if target.is_dir():
            target = target / "index.html"
        if not target.is_file():
            raise ApiError("Not found", 404)
        self.send_disk_file(target)


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def local_ip() -> str:
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        sock.connect(("8.8.8.8", 80))
        ip = sock.getsockname()[0]
        sock.close()
        return ip
    except Exception:
        return "127.0.0.1"


def main() -> None:
    port = int(os.environ.get("PORT", "4040"))
    wait_port = 0
    for i, arg in enumerate(sys.argv):
        if arg == "--port" and i + 1 < len(sys.argv):
            port = int(sys.argv[i + 1])
        elif arg == "--wait-port" and i + 1 < len(sys.argv):
            wait_port = int(sys.argv[i + 1])
    no_browser = "--no-browser" in sys.argv or os.environ.get("NO_BROWSER") == "1"
    use_tray = os.name == "nt" and "--no-tray" not in sys.argv

    # pythonw.exe (used when the console closes) has no stdout/stderr at all.
    if sys.stdout is None or sys.stderr is None or os.environ.get("NAS_TRAY_CHILD") == "1":
        try:
            DATA_DIR.mkdir(parents=True, exist_ok=True)
            log = open(DATA_DIR / "server.log", "a", buffering=1, encoding="utf-8")
        except Exception:
            log = open(os.devnull, "w")
        if sys.stdout is None:
            sys.stdout = log
        if sys.stderr is None:
            sys.stderr = log

    seed_content()

    if wait_port:
        tray.wait_for_port_free(port, wait_port)

    server = None
    for attempt in range(12):
        try:
            server = ThreadingHTTPServer(("0.0.0.0", port), Handler)
            break
        except OSError:
            if wait_port and attempt < 11:
                time.sleep(0.5)
            else:
                raise
    assert server is not None
    server.daemon_threads = True

    docker_line = "CLI not found" if not find_docker() else "CLI found (open Docker Manager in the UI)"
    banner = f"""
  ==========================================================
     {APP_NAME} {APP_VERSION}  -  a 1995 network drive
  ==========================================================
     Local:   http://localhost:{port}
     Network: http://{local_ip()}:{port}
     Files:   {NAS_ROOT}
     Data:    {DATA_DIR}
     Docker:  {docker_line}
  ==========================================================
     Closing this window keeps the server in the system tray.
     Right-click the tray icon and choose Exit to stop it.
"""
    print(banner, flush=True)

    if not no_browser:
        def _open():
            time.sleep(0.9)
            try:
                webbrowser.open(f"http://localhost:{port}")
            except Exception:
                pass
        threading.Thread(target=_open, daemon=True).start()

    tray_icon = None
    if use_tray:
        def _open_ui():
            try:
                webbrowser.open(f"http://localhost:{port}")
            except Exception:
                pass

        def _open_folder():
            try:
                os.startfile(str(NAS_ROOT))
            except Exception:
                pass

        def _toggle_console():
            if not tray.toggle_console():
                _open_ui()

        def _quit():
            print("\nExit from the system tray. Goodbye!", flush=True)
            threading.Thread(target=server.shutdown, daemon=True).start()

        try:
            tray_icon = tray.TrayIcon(
                APP_NAME, DATA_DIR / "nas.ico", port,
                on_open=_open_ui, on_folder=_open_folder,
                on_console=_toggle_console, on_exit=_quit,
            )
            if tray_icon.start():
                print("     Tray:    running - right-click the tray icon for Exit", flush=True)
                if os.environ.get("NAS_TRAY_CHILD") != "1":
                    tray.install_close_to_tray(port, Path(__file__).resolve())
            else:
                print(f"     Tray:    unavailable ({tray_icon._error or 'unknown error'})", flush=True)
                tray_icon = None
        except Exception as exc:
            print(f"     Tray:    unavailable ({exc})", flush=True)
            tray_icon = None

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down. Goodbye!")
    finally:
        if tray_icon is not None:
            tray_icon.stop()
        server.server_close()


if __name__ == "__main__":
    main()




