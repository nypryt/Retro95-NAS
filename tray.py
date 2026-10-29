"""Win95 NAS - Windows system tray icon.

Pure standard library (ctypes).  The tray icon lets the server keep running
after its console window is closed: closing the console spawns a hidden
pythonw instance which re-binds the port and lives in the notification area.
Right-clicking the tray icon offers Open / NAS folder / Console / Exit.
"""

from __future__ import annotations

import ctypes
import ctypes.wintypes as wt
import os
import struct
import subprocess
import sys
import threading
import time
from pathlib import Path

IS_WINDOWS = os.name == "nt"

# ---------------------------------------------------------------- constants
WM_DESTROY = 0x0002
WM_CLOSE = 0x0010
WM_COMMAND = 0x0111
WM_NULL = 0x0000
WM_APP = 0x8000
WM_TRAY = WM_APP + 1
WM_LBUTTONUP = 0x0202
WM_LBUTTONDBLCLK = 0x0203
WM_RBUTTONUP = 0x0205
WM_CONTEXTMENU = 0x007B

NIM_ADD, NIM_MODIFY, NIM_DELETE = 0, 1, 2
NIF_MESSAGE, NIF_ICON, NIF_TIP, NIF_INFO = 1, 2, 4, 0x10
NIIF_INFO = 0x00000001
MF_STRING, MF_SEPARATOR, MF_DEFAULT = 0, 0x800, 0
TPM_RIGHTBUTTON, TPM_RETURNCMD, TPM_NONOTIFY = 0x0002, 0x0100, 0x0080
IMAGE_ICON, LR_LOADFROMFILE, LR_DEFAULTSIZE = 1, 0x10, 0x40
SW_HIDE, SW_SHOW, SW_RESTORE = 0, 5, 9
CTRL_C_EVENT, CTRL_BREAK_EVENT, CTRL_CLOSE_EVENT = 0, 1, 2
CTRL_LOGOFF_EVENT, CTRL_SHUTDOWN_EVENT = 5, 6

DETACHED_PROCESS = 0x00000008
CREATE_NEW_PROCESS_GROUP = 0x00000200

CMD_OPEN = 1
CMD_FOLDER = 2
CMD_CONSOLE = 3
CMD_EXIT = 4

CURRENT = None  # the active TrayIcon, if any


# ---------------------------------------------------------------- win32 glue
if IS_WINDOWS:
    user32 = ctypes.WinDLL("user32", use_last_error=True)
    shell32 = ctypes.WinDLL("shell32", use_last_error=True)
    kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)

    WNDPROC = ctypes.WINFUNCTYPE(ctypes.c_ssize_t, wt.HWND, wt.UINT, wt.WPARAM, wt.LPARAM)

    class GUID(ctypes.Structure):
        _fields_ = [
            ("Data1", wt.DWORD),
            ("Data2", wt.WORD),
            ("Data3", wt.WORD),
            ("Data4", ctypes.c_ubyte * 8),
        ]

    class WNDCLASSW(ctypes.Structure):
        _fields_ = [
            ("style", wt.UINT),
            ("lpfnWndProc", WNDPROC),
            ("cbClsExtra", ctypes.c_int),
            ("cbWndExtra", ctypes.c_int),
            ("hInstance", wt.HINSTANCE),
            ("hIcon", wt.HICON),
            ("hCursor", wt.HANDLE),
            ("hbrBackground", wt.HBRUSH),
            ("lpszMenuName", wt.LPCWSTR),
            ("lpszClassName", wt.LPCWSTR),
        ]

    class NOTIFYICONDATAW(ctypes.Structure):
        _fields_ = [
            ("cbSize", wt.DWORD),
            ("hWnd", wt.HWND),
            ("uID", wt.UINT),
            ("uFlags", wt.UINT),
            ("uCallbackMessage", wt.UINT),
            ("hIcon", wt.HICON),
            ("szTip", wt.WCHAR * 128),
            ("dwState", wt.DWORD),
            ("dwStateMask", wt.DWORD),
            ("szInfo", wt.WCHAR * 256),
            ("uTimeoutOrVersion", wt.UINT),
            ("szInfoTitle", wt.WCHAR * 64),
            ("dwInfoFlags", wt.DWORD),
            ("guidItem", GUID),
            ("hBalloonIcon", wt.HICON),
        ]

    user32.RegisterClassW.argtypes = [ctypes.POINTER(WNDCLASSW)]
    user32.RegisterClassW.restype = wt.ATOM
    user32.CreateWindowExW.argtypes = [
        wt.DWORD, wt.LPCWSTR, wt.LPCWSTR, wt.DWORD, ctypes.c_int, ctypes.c_int,
        ctypes.c_int, ctypes.c_int, wt.HWND, wt.HMENU, wt.HINSTANCE, wt.LPVOID,
    ]
    user32.CreateWindowExW.restype = wt.HWND
    user32.DefWindowProcW.argtypes = [wt.HWND, wt.UINT, wt.WPARAM, wt.LPARAM]
    user32.DefWindowProcW.restype = ctypes.c_ssize_t
    user32.DestroyWindow.argtypes = [wt.HWND]
    user32.PostQuitMessage.argtypes = [ctypes.c_int]
    user32.LoadImageW.argtypes = [wt.HINSTANCE, wt.LPCWSTR, wt.UINT, ctypes.c_int,
                                  ctypes.c_int, wt.UINT]
    user32.LoadImageW.restype = wt.HANDLE
    shell32.Shell_NotifyIconW.argtypes = [wt.DWORD, ctypes.POINTER(NOTIFYICONDATAW)]
    shell32.Shell_NotifyIconW.restype = wt.BOOL
    user32.CreatePopupMenu.restype = wt.HMENU
    user32.AppendMenuW.argtypes = [wt.HMENU, wt.UINT, ctypes.c_size_t, wt.LPCWSTR]
    user32.SetMenuDefaultItem.argtypes = [wt.HMENU, wt.UINT, wt.UINT]
    user32.TrackPopupMenu.argtypes = [wt.HMENU, wt.UINT, ctypes.c_int, ctypes.c_int,
                                      ctypes.c_int, wt.HWND, wt.LPVOID]
    user32.TrackPopupMenu.restype = ctypes.c_int
    user32.DestroyMenu.argtypes = [wt.HMENU]
    user32.SetForegroundWindow.argtypes = [wt.HWND]
    user32.GetCursorPos.argtypes = [ctypes.POINTER(wt.POINT)]
    user32.PostMessageW.argtypes = [wt.HWND, wt.UINT, wt.WPARAM, wt.LPARAM]
    user32.LoadIconW.argtypes = [wt.HINSTANCE, wt.LPCWSTR]
    user32.LoadIconW.restype = wt.HICON
    user32.DestroyIcon.argtypes = [wt.HICON]
    user32.DestroyIcon.restype = wt.BOOL
    user32.GetMessageW.argtypes = [ctypes.POINTER(wt.MSG), wt.HWND, wt.UINT, wt.UINT]
    user32.GetMessageW.restype = ctypes.c_int
    user32.TranslateMessage.argtypes = [ctypes.POINTER(wt.MSG)]
    user32.DispatchMessageW.argtypes = [ctypes.POINTER(wt.MSG)]
    user32.DispatchMessageW.restype = ctypes.c_ssize_t
    kernel32.GetConsoleWindow.restype = wt.HWND
    user32.ShowWindow.argtypes = [wt.HWND, ctypes.c_int]
    user32.IsWindowVisible.argtypes = [wt.HWND]
    user32.SetWindowTextW.argtypes = [wt.HWND, wt.LPCWSTR]

    kernel32.GetModuleHandleW.argtypes = [wt.LPCWSTR]
    kernel32.GetModuleHandleW.restype = wt.HINSTANCE
    kernel32.SetConsoleCtrlHandler.argtypes = [ctypes.c_void_p, wt.BOOL]
    kernel32.SetConsoleCtrlHandler.restype = wt.BOOL

    _WNDPROC_REF = None
    _CONSOLE_REF = None


# ---------------------------------------------------------------- icon file
def _draw_computer(size: int) -> list[list[tuple[int, int, int, int]]]:
    """A tiny Win95 monitor, drawn on a 16x16 grid and nearest-neighbour scaled."""
    BLACK = (0, 0, 0, 255)
    GRAY = (192, 192, 192, 255)
    WHITE = (255, 255, 255, 255)
    DARK = (128, 128, 128, 255)
    TEAL = (0, 128, 128, 255)
    TEAL_HI = (0, 168, 168, 255)
    GREEN = (0, 220, 0, 255)
    TRANS = (0, 0, 0, 0)

    img = [[TRANS for _ in range(size)] for _ in range(size)]

    def rect(x, y, w, h, color):
        x0, y0 = round(x * size / 16), round(y * size / 16)
        x1, y1 = round((x + w) * size / 16), round((y + h) * size / 16)
        for yy in range(max(0, y0), min(size, y1)):
            for xx in range(max(0, x0), min(size, x1)):
                img[yy][xx] = color

    # monitor body + bevels
    rect(1, 1, 14, 11, BLACK)
    rect(2, 2, 12, 9, GRAY)
    rect(2, 2, 12, 1, WHITE)
    rect(2, 2, 1, 9, WHITE)
    rect(13, 3, 1, 8, DARK)
    rect(3, 11, 10, 1, DARK)
    # screen
    rect(3, 3, 10, 7, BLACK)
    rect(4, 4, 8, 5, TEAL)
    rect(4, 4, 8, 1, TEAL_HI)
    rect(5, 6, 3, 1, TEAL_HI)
    rect(12, 9, 1, 1, GREEN)
    # stand
    rect(6, 12, 4, 1, BLACK)
    rect(6, 12, 4, 1, GRAY)
    rect(5, 13, 6, 1, BLACK)
    rect(5, 13, 6, 1, GRAY)
    rect(4, 14, 8, 1, BLACK)
    rect(4, 14, 8, 1, GRAY)
    return img


def _ico_frame(img) -> bytes:
    size = len(img)
    header = struct.pack("<IiiHHIIiiII", 40, size, size * 2, 1, 32, 0, size * size * 4, 0, 0, 0, 0)
    pixels = bytearray()
    for y in range(size - 1, -1, -1):
        for x in range(size):
            r, g, b, a = img[y][x]
            pixels += bytes((b, g, r, a))
    mask_row = ((size + 31) // 32) * 4
    mask = bytes(mask_row * size)
    return header + bytes(pixels) + mask


def write_icon(path: Path) -> Path:
    """Write a multi-resolution .ico (16, 32 and 48 px) for the tray/window icon."""
    frames = [_ico_frame(_draw_computer(n)) for n in (16, 32, 48)]
    header = struct.pack("<HHH", 0, 1, len(frames))
    entries = b""
    offset = 6 + 16 * len(frames)
    for size, data in zip((16, 32, 48), frames):
        entries += struct.pack("<BBBBHHII", size if size < 256 else 0, size if size < 256 else 0,
                               0, 0, 1, 32, len(data), offset)
        offset += len(data)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(header + entries + b"".join(frames))
    return path


# ---------------------------------------------------------------- console
def console_hwnd():
    if not IS_WINDOWS:
        return None
    try:
        return kernel32.GetConsoleWindow() or None
    except Exception:
        return None


def hide_console() -> bool:
    hwnd = console_hwnd()
    if not hwnd:
        return False
    user32.ShowWindow(hwnd, SW_HIDE)
    return True


def show_console() -> bool:
    hwnd = console_hwnd()
    if not hwnd:
        return False
    user32.ShowWindow(hwnd, SW_SHOW)
    user32.ShowWindow(hwnd, SW_RESTORE)
    user32.SetForegroundWindow(hwnd)
    return True


def toggle_console() -> bool:
    hwnd = console_hwnd()
    if not hwnd:
        return False
    if user32.IsWindowVisible(hwnd):
        return hide_console()
    return show_console()


# ---------------------------------------------------------------- tray icon
class TrayIcon:
    def __init__(self, title: str, icon_path: Path, port: int, on_open=None,
                 on_folder=None, on_console=None, on_exit=None):
        self.title = title
        self.icon_path = Path(icon_path)
        self.port = port
        self.on_open = on_open
        self.on_folder = on_folder
        self.on_console = on_console
        self.on_exit = on_exit
        self.hwnd = None
        self.hicon = None
        self.active = False
        self._thread = None
        self._nid = None
        self._ready = threading.Event()
        self._error = None
        self._proc = None

    # -- public ---------------------------------------------------------
    def start(self, timeout: float = 4.0) -> bool:
        if not IS_WINDOWS:
            self._error = "not running on Windows"
            return False
        global CURRENT
        write_icon(self.icon_path)
        self._thread = threading.Thread(target=self._run, name="nas-tray", daemon=True)
        self._thread.start()
        self._ready.wait(timeout)
        if self.active:
            CURRENT = self
        return self.active

    def stop(self):
        if not IS_WINDOWS or not self.hwnd:
            return
        try:
            user32.PostMessageW(self.hwnd, WM_CLOSE, 0, 0)
        except Exception:
            pass
        if self._thread and self._thread.is_alive() and threading.current_thread() is not self._thread:
            self._thread.join(2.0)
        self.active = False

    def balloon(self, text: str, title: str = ""):
        if not self.active or self._nid is None:
            return
        try:
            nid = self._nid
            nid.uFlags = NIF_INFO
            nid.szInfo = text[:255]
            nid.szInfoTitle = (title or self.title)[:63]
            nid.dwInfoFlags = NIIF_INFO
            shell32.Shell_NotifyIconW(NIM_MODIFY, ctypes.byref(nid))
            nid.uFlags = NIF_MESSAGE | NIF_ICON | NIF_TIP
        except Exception:
            pass

    # -- internals ------------------------------------------------------
    def _call(self, fn, *args):
        if not fn:
            return
        try:
            fn(*args)
        except Exception:
            pass

    def _menu(self):
        menu = user32.CreatePopupMenu()
        user32.AppendMenuW(menu, MF_STRING, CMD_OPEN, "Open Win95 NAS")
        user32.AppendMenuW(menu, MF_STRING, CMD_FOLDER, "Open NAS folder")
        user32.AppendMenuW(menu, MF_SEPARATOR, 0, None)
        user32.AppendMenuW(menu, MF_STRING, CMD_CONSOLE, "Show / hide console")
        user32.AppendMenuW(menu, MF_SEPARATOR, 0, None)
        user32.AppendMenuW(menu, MF_STRING, CMD_EXIT, "Exit")
        user32.SetMenuDefaultItem(menu, CMD_OPEN, 0)
        pt = wt.POINT()
        user32.GetCursorPos(ctypes.byref(pt))
        user32.SetForegroundWindow(self.hwnd)
        cmd = user32.TrackPopupMenu(menu, TPM_RIGHTBUTTON | TPM_RETURNCMD | TPM_NONOTIFY,
                                    pt.x, pt.y, 0, self.hwnd, None)
        user32.PostMessageW(self.hwnd, WM_NULL, 0, 0)
        user32.DestroyMenu(menu)
        if cmd == CMD_OPEN:
            self._call(self.on_open)
        elif cmd == CMD_FOLDER:
            self._call(self.on_folder)
        elif cmd == CMD_CONSOLE:
            self._call(self.on_console)
        elif cmd == CMD_EXIT:
            self.active = False
            self._remove()
            self._call(self.on_exit)

    def _remove(self):
        if self._nid is not None:
            try:
                shell32.Shell_NotifyIconW(NIM_DELETE, ctypes.byref(self._nid))
            except Exception:
                pass
        if self.hicon:
            try:
                user32.DestroyIcon(self.hicon)
            except Exception:
                pass
            self.hicon = None

    def _run(self):
        global _WNDPROC_REF
        try:
            hinst = kernel32.GetModuleHandleW(None)
            self._proc = WNDPROC(self._wndproc)
            wc = WNDCLASSW()
            wc.style = 0
            wc.lpfnWndProc = self._proc
            wc.cbClsExtra = 0
            wc.cbWndExtra = 0
            wc.hInstance = hinst
            wc.hIcon = None
            wc.hCursor = None
            wc.hbrBackground = None
            wc.lpszMenuName = None
            wc.lpszClassName = "Win95NASTrayWindow"
            _WNDPROC_REF = self._wndproc
            atom = user32.RegisterClassW(ctypes.byref(wc))
            if not atom:
                err = ctypes.get_last_error()
                # Class may already exist from a previous start in this process.
                if err not in (0, 1410):
                    raise OSError(f"RegisterClassW failed ({err})")
            self.hwnd = user32.CreateWindowExW(0, "Win95NASTrayWindow", self.title, 0,
                                               0, 0, 0, 0, None, None, hinst, None)
            if not self.hwnd:
                raise OSError(f"CreateWindowExW failed ({ctypes.get_last_error()})")

            self.hicon = user32.LoadImageW(None, str(self.icon_path), IMAGE_ICON,
                                           0, 0, LR_LOADFROMFILE | LR_DEFAULTSIZE)
            if not self.hicon:
                self.hicon = user32.LoadIconW(None, ctypes.cast(32512, wt.LPCWSTR))  # IDI_APPLICATION

            nid = NOTIFYICONDATAW()
            nid.cbSize = ctypes.sizeof(NOTIFYICONDATAW)
            nid.hWnd = self.hwnd
            nid.uID = 1
            nid.uFlags = NIF_MESSAGE | NIF_ICON | NIF_TIP
            nid.uCallbackMessage = WM_TRAY
            nid.hIcon = self.hicon
            nid.szTip = (self.title + " - right-click for Exit")[:127]
            if not shell32.Shell_NotifyIconW(NIM_ADD, ctypes.byref(nid)):
                raise OSError(f"Shell_NotifyIconW failed ({ctypes.get_last_error()})")
            self._nid = nid
            self.active = True
            self._ready.set()

            msg = wt.MSG()
            while user32.GetMessageW(ctypes.byref(msg), None, 0, 0) > 0:
                user32.TranslateMessage(ctypes.byref(msg))
                user32.DispatchMessageW(ctypes.byref(msg))
        except Exception as exc:  # pragma: no cover - platform specific
            self._error = str(exc)
            self.active = False
            self._ready.set()
        finally:
            self._remove()
            self.active = False
            if self.hwnd:
                try:
                    user32.DestroyWindow(self.hwnd)
                except Exception:
                    pass
                self.hwnd = None

    def _wndproc(self, hwnd, msg, wparam, lparam):
        if msg == WM_TRAY:
            event = int(lparam) & 0xFFFF
            if event in (WM_LBUTTONUP, WM_LBUTTONDBLCLK):
                self._call(self.on_open)
            elif event in (WM_RBUTTONUP, WM_CONTEXTMENU):
                self._menu()
            return 0
        if msg == WM_COMMAND:
            cmd = int(wparam) & 0xFFFF
            if cmd == CMD_OPEN:
                self._call(self.on_open)
            elif cmd == CMD_FOLDER:
                self._call(self.on_folder)
            elif cmd == CMD_CONSOLE:
                self._call(self.on_console)
            elif cmd == CMD_EXIT:
                self.active = False
                self._remove()
                self._call(self.on_exit)
            return 0
        if msg == WM_CLOSE:
            user32.DestroyWindow(hwnd)
            return 0
        if msg == WM_DESTROY:
            user32.PostQuitMessage(0)
            return 0
        return user32.DefWindowProcW(hwnd, msg, wparam, lparam)


# ---------------------------------------------------------------- close to tray
def wait_for_port_free(port: int, timeout: float = 20.0) -> bool:
    """Wait until nothing answers on 127.0.0.1:port (the old server is gone)."""
    end = time.time() + timeout
    import socket as _socket
    while time.time() < end:
        try:
            with _socket.create_connection(("127.0.0.1", port), timeout=0.4):
                pass
            time.sleep(0.4)
        except OSError:
            return True
    return False


def spawn_detached_tray(port: int, script: Path) -> bool:
    """Start a console-less copy of the server which will take over the port."""
    if not IS_WINDOWS:
        return False
    exe = Path(sys.executable)
    pyw = exe.with_name("pythonw.exe")
    if pyw.exists():
        exe = pyw
    env = os.environ.copy()
    env["NAS_TRAY_CHILD"] = "1"
    args = [str(exe), str(script), "--tray", "--no-browser",
            "--port", str(port), "--wait-port", "20"]
    flags = DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP
    try:
        subprocess.Popen(
            args,
            cwd=str(Path(script).resolve().parent),
            env=env,
            creationflags=flags,
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            close_fds=True,
        )
        return True
    except Exception:
        return False


def install_close_to_tray(port: int, script: Path) -> bool:
    """When the console window is closed, hand over to a tray-only instance."""
    if not IS_WINDOWS:
        return False
    global _CONSOLE_REF

    def _handler(event):
        if event == CTRL_CLOSE_EVENT:
            if os.environ.get("NAS_TRAY_CHILD") != "1":
                if CURRENT is not None:
                    try:
                        CURRENT._remove()
                    except Exception:
                        pass
                spawn_detached_tray(port, script)
        return False

    _CONSOLE_REF = ctypes.WINFUNCTYPE(wt.BOOL, wt.DWORD)(_handler)
    try:
        return bool(kernel32.SetConsoleCtrlHandler(_CONSOLE_REF, True))
    except Exception:
        return False


def status() -> dict:
    tray = CURRENT
    return {
        "supported": IS_WINDOWS,
        "active": bool(tray and tray.active),
        "hwnd": int(tray.hwnd) if tray and tray.hwnd else 0,
        "child": os.environ.get("NAS_TRAY_CHILD") == "1",
        "console": bool(console_hwnd()),
    }


