Win95 NAS 1.0 - source code
===========================

This folder is the complete source of the app that the three installers
carry. Nothing here is compiled: it is plain Python plus static HTML, CSS,
JS, PNG and WAV/MP3 files.

Layout
------
  server.py          HTTP server + REST API (port 4040)
  launcher.py        first-run setup wizard, then starts the server
  setup_gui.py       the Windows 95-style setup wizard window
  tray.py            system-tray icon and menu
  office.py          built-in document/text helpers
  start.bat          double-click entry point for Windows
  setup.bat          Windows helper script
  README.txt         user-facing readme
  public/            the web desktop
    index.html
    css/win95.css
    js/              21 scripts (desktop, explorer, settings, games, ...)
    icons/win95/     124 PNG icons at 16/32/48/64/96/128 px
    sounds/          7 sound files

Not included: data/ (your settings and accounts) and nas-data/ (your files).
They are created on first run, so the app starts with a fresh setup wizard.

Run from source
---------------
    cd Win95NAS-Source
    python launcher.py

Requires Python 3.11 or newer. On Windows you can also double-click
start.bat.

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
  1. Copy the app (minus data, nas-data, __pycache__) to build/payload.
  2. Compress it to build/win/payload.zip.
  3. Point setup.sed at build/win/ and run:
       %WINDIR%\System32\iexpress.exe /N /Q setup.sed

Linux (x86_64, static)
  1. tar -czf payload.tar.gz *   (from inside the payload folder)
  2. Turn payload.tar.gz into payload.h:
       static const unsigned char payload[] = { ... };
       static const size_t payload_len = N;
  3. In an Alpine container:
       gcc -O2 -static -s -o Win95NAS-Installer.elf installer.c

macOS
  1. Build the app bundle: Contents/{Info.plist,MacOS/Win95 NAS,
     Resources/app/...} plus an Applications symlink and Read Me.txt.
  2. docker build -t win95nas-dmg .   (in macos/)
  3. Create a 64 MB HFS+ image:
       dd if=/dev/zero of=image.hfs bs=1M count=64
       mkfs.hfsplus -v "Win95 NAS" image.hfs
       hfsplus image.hfs addall root /
       hfsplus image.hfs chmod 755 "/Win95 NAS.app/Contents/MacOS/Win95 NAS"
  4. Wrap it in a UDIF disk image:
       dmg build image.hfs Win95NAS.dmg

Test overrides understood by the installers
-------------------------------------------
  WIN95NAS_INSTALL_DIR   install to another folder
  WIN95NAS_NO_LAUNCH=1   install but do not start the app
  WIN95NAS_NO_SHORTCUTS  skip Desktop/Start Menu shortcuts (Windows)
  WIN95NAS_SILENT=1      never pause for a keypress (Windows)
