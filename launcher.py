"""Win95 NAS launcher.

Runs the first-time GUI setup when ``data/setup.json`` is missing, then starts
``server.py`` with the saved storage folder and options.

Usage:
    python launcher.py                # normal start
    python launcher.py --setup        # re-run the setup wizard, then start
    python launcher.py --port 5050    # override the saved port
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

import terms

BASE_DIR = Path(__file__).resolve().parent
SETUP_FILE = BASE_DIR / "data" / "setup.json"
DEFAULT_ROOT = BASE_DIR / "nas-data"


def load_config() -> dict:
    try:
        data = json.loads(SETUP_FILE.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except (OSError, ValueError):
        return {}


def _has_tk() -> bool:
    try:
        import tkinter  # noqa: F401
        return True
    except Exception:
        return False


def _show_console(visible: bool) -> None:
    """Hide the console behind the setup wizard, then bring it back."""
    if sys.platform != "win32":
        return
    try:
        import ctypes
        hwnd = ctypes.windll.kernel32.GetConsoleWindow()
        if hwnd:
            ctypes.windll.user32.ShowWindow(hwnd, 5 if visible else 0)
    except Exception:
        pass


def _console_terms() -> bool:
    """Print the terms and require an explicit acceptance."""
    print()
    print("  " + "=" * 62)
    print("   Terms and Conditions - version %s" % terms.TERMS_VERSION)
    print("  " + "=" * 62)
    for line in terms.plain().splitlines():
        print(("  " + line).rstrip())
    print()
    print("  Type I AGREE to accept these terms.")
    print("  Press Enter without typing anything to cancel setup.")
    try:
        answer = input("  > ").strip()
    except EOFError:
        return False
    return answer.lower().replace(" ", "") in ("iagree", "agree", "yes", "y")


def console_setup() -> int:
    """Fallback wizard for machines without Tkinter."""
    import setup_gui

    print()
    print("  ============================================")
    print("     Win95 NAS - first-run setup")
    print("  ============================================")
    print("  The graphical wizard is unavailable, so here")
    print("  are the same questions in the console.")
    if not _console_terms():
        print()
        print("  Terms not accepted. Setup cancelled.")
        return 1
    print()
    root = input("  NAS storage folder [%s]: " % DEFAULT_ROOT).strip()
    root = root or str(DEFAULT_ROOT)
    port = input("  Web port [4040]: ").strip() or "4040"
    limit = input("  Storage limit in GB [64]: ").strip() or "64"
    tray = input("  Keep running in the system tray? [Y/n]: ").strip().lower()
    browser = input("  Open the browser after start? [Y/n]: ").strip().lower()
    try:
        config = setup_gui.write_config(
            Path(root),
            port=int(port),
            tray=tray not in ("n", "no"),
            open_browser=browser not in ("n", "no"),
            limit_gb=float(limit),
            terms_accepted=True,
        )
    except Exception as exc:
        print("  Setup failed: %s" % exc)
        return 1
    print("  Saved to %s" % SETUP_FILE)
    print("  NAS folder: %s" % config["root"])
    return 0


def run_setup() -> int:
    print("  First run: opening the Win95 NAS setup wizard...")
    print("  Choose where your NAS files should live, then click Finish.")
    if not _has_tk():
        return console_setup()
    _show_console(False)
    try:
        import setup_gui
        return setup_gui.main([])
    except Exception as exc:
        _show_console(True)
        print("  The setup wizard could not start: %s" % exc)
        return console_setup()
    finally:
        _show_console(True)


def main(argv=None) -> int:
    args = list(sys.argv[1:] if argv is None else argv)
    force_setup = "--setup" in args
    args = [arg for arg in args if arg != "--setup"]
    accept_terms = "--accept-terms" in args
    args = [arg for arg in args if arg != "--accept-terms"]

    def prepare_setup() -> int:
        code = run_setup()
        if code == 2:
            print("  Win95 NAS is already running. Nothing to start.")
            return 2
        if code != 0:
            print()
            print("  Setup was cancelled. Run start.bat again to retry.")
            return 1
        return 0

    env_root = os.environ.get("NAS_ROOT", "").strip()
    if force_setup or (not SETUP_FILE.exists() and not env_root):
        status = prepare_setup()
        if status:
            return 0 if status == 2 else 1
        env_root = ""

    config = load_config()
    # A corrupt or empty setup file should reopen the wizard instead of
    # silently falling back to the default folder.
    if not config and not env_root:
        status = prepare_setup()
        if status:
            return 0 if status == 2 else 1
        config = load_config()
    # Installations made before the terms existed, or ones whose terms changed,
    # have to accept them before the server starts.
    if config and not env_root and not terms.is_accepted(config):
        if accept_terms:
            config.update(terms.acceptance())
            tmp = SETUP_FILE.with_suffix(".json.tmp")
            tmp.write_text(json.dumps(config, indent=2) + "\n", encoding="utf-8")
            os.replace(tmp, SETUP_FILE)
            print("  Terms and Conditions accepted (version %s)." % terms.TERMS_VERSION)
        else:
            print()
            print("  The Terms and Conditions have not been accepted yet.")
            print("  Opening the setup wizard so you can read and accept them.")
            status = prepare_setup()
            if status:
                return 0 if status == 2 else 1
            config = load_config()
    root = env_root or str(config.get("root") or DEFAULT_ROOT)
    try:
        root_path = Path(root).expanduser().resolve()
    except OSError:
        root_path = DEFAULT_ROOT

    try:
        port = int(config.get("port", 4040))
    except (TypeError, ValueError):
        port = 4040
    try:
        limit = float(config.get("storageLimitGb", 64))
    except (TypeError, ValueError):
        limit = 64.0

    server_args = list(args)
    if "--port" not in server_args:
        server_args += ["--port", str(port)]
    if not config.get("tray", True) and "--no-tray" not in server_args:
        server_args.append("--no-tray")
    if not config.get("openBrowser", True) and "--no-browser" not in server_args:
        server_args.append("--no-browser")

    display_port = port
    if "--port" in server_args:
        try:
            display_port = int(server_args[server_args.index("--port") + 1])
        except (ValueError, IndexError):
            pass

    env = os.environ.copy()
    env["NAS_ROOT"] = str(root_path)
    env["NAS_LIMIT_GB"] = str(limit)
    env["PORT"] = str(display_port)

    command = [sys.executable, str(BASE_DIR / "server.py")] + server_args
    print()
    print("  Starting Win95 NAS on http://localhost:%d" % display_port)
    print("  Files: %s" % root_path)
    print("  Closing this window keeps the server running in the system tray.")
    print("  Right-click the tray icon and choose Exit to stop it.")
    print("  (Run setup.bat to change the folder or options.)")
    print()
    try:
        return subprocess.call(command, cwd=str(BASE_DIR), env=env)
    except KeyboardInterrupt:
        return 0


if __name__ == "__main__":
    raise SystemExit(main())
