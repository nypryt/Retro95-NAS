Win95 NAS 1.0 - source code
===========================

This folder is the complete source of the app that the three installers
carry. Nothing here is compiled: it is plain Python plus static HTML, CSS,
JS, PNG and WAV/MP3 files.

Layout
------
  server.py          HTTP server + REST API (port 4040)
  launcher.py        first-run setup wizard, then starts the server
  setup_gui.py       the Windows 95-style setup wizard ("Retro95 Setup")
  tray.py            system-tray icon and menu
  office.py          built-in document/text helpers
  terms.py           loads TERMS.md, renders it, records acceptance
  TERMS.md           the Terms and Conditions (version 1.0)
  LICENSE            PolyForm Noncommercial License 1.0.0
  start.bat          double-click entry point for Windows
  setup.bat          Windows helper script
  README.txt         user-facing readme
  public/            the web desktop
    index.html
    css/win95.css
    js/              23 scripts (desktop, explorer, Paint, archives, ...)
    icons/win95/     121 PNG icons at 16/32/48/64/96/128 px
    sounds/          7 sound files

The two newer apps live in public/js:

  paint.js           classic Windows 95 Paint: 16 tools, 28-colour palette,
                     five line widths, File/Edit/View/Image/Colors/Help
                     menus, selections, text, flip/rotate, stretch/skew,
                     invert, zoom, undo/redo and PNG save/open.
  winrar.js          WinRAR-style archive manager: create, list, extract,
                     add, delete and test ZIP/TAR archives.

Paint saves through POST /api/image/save (base64 data URL, PNG). The archive
API is under /api/archive/*. Both are implemented in server.py with the
Python standard library only (zipfile, tarfile, gzip, bz2, lzma).

Not included: data/ (your settings and accounts) and nas-data/ (your files).
They are created on first run, so the app starts with a fresh setup wizard.

Run from source
---------------
    cd Win95NAS-Source
    python launcher.py

Requires Python 3.11 or newer. On Windows you can also double-click
start.bat.

Terms and Conditions
--------------------
TERMS.md is the single source of truth. terms.py turns it into plain text
for the wizard and console, and stores the acceptance in data/setup.json:

    "termsAccepted": true,
    "termsVersion": "1.0",
    "termsAcceptedAt": "2026-10-30T12:34:56"

The wizard's Terms page keeps "Next" disabled until the checkbox is ticked.
The box is never pre-ticked, even on a re-run. Machines without Tkinter get
the same text in the console and must type I AGREE. An install whose
setup.json predates the terms (or whose termsVersion is old) reopens the
wizard before the server starts.

Headless use:
    python setup_gui.py --no-gui --accept-terms --root <folder>
    python launcher.py --accept-terms      # accept an existing install

Bump TERMS_VERSION in terms.py whenever TERMS.md changes, so existing
installs are asked to accept the new version.

installers/
-----------
The build files used to make each single-file installer:

  windows/install.bat   what the EXE runs after extracting
  windows/setup.sed     IExpress recipe (built with iexpress.exe /N /Q)
  linux/installer.c     static ELF with the tar.gz payload embedded
  macos/Info.plist      bundle metadata for "Win95 NAS.app"
  macos/Win95 NAS       the .app launcher script
  macos/Read Me.txt     the note placed next to the app in the DMG
  macos/Dockerfile      Ubuntu image with libdmg-hfsplus + hfsprogs

How the installers are built
----------------------------
Windows
  1. Copy the app (minus data, nas-data, __pycache__) into build/win/payload.
  2. Compress it to build/win/payload.zip with the files at the archive root
     (launcher.py, server.py, public/... - no wrapper folder).
  3. Point setup.sed at build/win/ and run:
       %WINDIR%\System32\iexpress.exe /N /Q setup.sed
     setup.sed writes D:\TEMP\Retro95-Setup.exe with FriendlyName
     "Retro95 Setup" and AppLaunched "cmd.exe /c install.bat".

Linux (x86_64, static)
  1. tar -czf payload.tar.gz *   (from inside the payload folder)
  2. Turn payload.tar.gz into payload.h:
       static const unsigned char payload[] = { ... };
       static const size_t payload_len = N;
  3. In an Alpine container with build-base:
       gcc -O2 -static -s -o Win95NAS-Installer.elf installer.c

macOS
  1. Build the app bundle: Contents/{Info.plist,MacOS/Win95 NAS,
     Resources/app/...} plus Read Me.txt.
  2. docker build -t win95nas-dmg .   (in macos/)
  3. Create a 160 MB HFS+ image:
       dd if=/dev/zero of=image.hfs bs=1M count=160
       mkfs.hfsplus -v "Win95 NAS" image.hfs
       hfsplus image.hfs addall stage /
       hfsplus image.hfs chmod 755 "/Win95 NAS.app/Contents/MacOS/Win95 NAS"
  4. Wrap it in a UDIF disk image:
       dmg build image.hfs Win95NAS.dmg

Test overrides understood by the installers
-------------------------------------------
  WIN95NAS_INSTALL_DIR   install to another folder
  WIN95NAS_NO_LAUNCH=1   install but do not start the app
  WIN95NAS_NO_SHORTCUTS  skip Desktop/Start Menu shortcuts (Windows)
  WIN95NAS_SILENT=1      never pause for a keypress (Windows)
