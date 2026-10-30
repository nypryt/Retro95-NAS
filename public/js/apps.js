/* Win95 NAS - file viewer, properties, about, help, recycle bin, run, find, shutdown, screensaver */
(function () {
  "use strict";

  const Apps = (window.Apps = window.Apps || {});

  Apps.openFile = async function openFile(entry) {
    let item = entry;
    if (typeof item === "string") {
      try { item = await API.stat(item); }
      catch (err) { U.alert("Cannot open file", err.message, "error"); return; }
    }
    if (!item) return;
    if (item.type === "dir") { Explorer.open(item.path); return; }
    if (item.kind === "text" || item.kind === "code") { Apps.notepad(item.path); return; }
    if (item.kind === "audio" || item.kind === "video") { VLC.open(item); return; }
    if (item.kind === "word" || item.kind === "excel" || item.kind === "powerpoint") { Office.open(item); return; }
    if (["image", "pdf"].includes(item.kind)) { Apps.viewer(item); return; }
    Apps.properties(item.path);
  };

  Apps.viewer = function viewer(entry) {
    let scale = 1;
    let img = null;
    let stage = null;
    let scaleLabel = null;
    const win = WM.open({
      title: entry.name + " - Viewer",
      icon: entry.kind === "image" ? "image" : (entry.kind === "text" ? "text" : "file"),
      width: 640,
      height: 480,
      minWidth: 320,
      minHeight: 240,
      build(body, w) {
        const app = U.el("div", { class: "viewer-app" });
        const toolbar = U.el("div", { class: "viewer-toolbar" });
        const download = U.el("button", { type: "button", text: "Download" });
        download.addEventListener("click", () => API.download(entry.path, entry.name));
        toolbar.append(download);
        if (entry.kind === "text" || entry.kind === "code") {
          const edit = U.el("button", { type: "button", text: "Open in Notepad" });
          edit.addEventListener("click", () => { w.close(); Apps.notepad(entry.path); });
          toolbar.append(edit);
        }
        if (entry.kind === "image") {
          const fit = U.el("button", { type: "button", text: "Fit" });
          const actual = U.el("button", { type: "button", text: "100%" });
          const zoomIn = U.el("button", { type: "button", text: "+" });
          const zoomOut = U.el("button", { type: "button", text: "\u2212" });
          scaleLabel = U.el("span", { class: "muted", text: "100%" });
          fit.addEventListener("click", () => { scale = 1; if (img) { img.style.width = ""; img.style.maxWidth = "100%"; img.style.maxHeight = "100%"; } scaleLabel.textContent = "Fit"; });
          actual.addEventListener("click", () => { scale = 1; applyScale(); });
          zoomIn.addEventListener("click", () => { scale = Math.min(8, scale * 1.25); applyScale(); });
          zoomOut.addEventListener("click", () => { scale = Math.max(0.1, scale / 1.25); applyScale(); });
          toolbar.append(fit, actual, zoomIn, zoomOut, scaleLabel);
        }
        toolbar.append(U.el("span", { class: "spacer" }), U.el("span", { class: "muted", text: U.fmtSize(entry.size) }));

        stage = U.el("div", { class: "viewer-stage" });
        app.append(toolbar, stage);
        body.append(app);

        function applyScale() {
          if (!img) return;
          img.style.maxWidth = "none";
          img.style.maxHeight = "none";
          img.style.width = Math.round(img.naturalWidth * scale) + "px";
          if (scaleLabel) scaleLabel.textContent = Math.round(scale * 100) + "%";
        }

        if (entry.kind === "image") {
          img = U.el("img", { src: API.rawUrl(entry.path), alt: entry.name, draggable: "false" });
          img.addEventListener("load", () => {
            if (img.naturalWidth * img.naturalHeight < 400 * 300) {
              scale = 1;
              applyScale();
            }
          });
          stage.append(img);
        } else if (entry.kind === "audio") {
          stage.append(U.el("audio", { controls: true, src: API.rawUrl(entry.path), style: { width: "70%" } }));
        } else if (entry.kind === "video") {
          stage.append(U.el("video", { controls: true, src: API.rawUrl(entry.path), style: { maxWidth: "100%", maxHeight: "100%" } }));
        } else if (entry.kind === "pdf") {
          stage.append(U.el("iframe", { src: API.rawUrl(entry.path), title: entry.name }));
        } else {
          const pre = U.el("pre", { class: "viewer-text selectable", text: "Loading..." });
          stage.style.background = "#fff";
          stage.append(pre);
          API.text(entry.path).then((data) => { pre.textContent = data.text; })
            .catch((err) => { pre.textContent = "Could not preview this file.\n\n" + err.message; });
        }

        U.menuBar(w, [
          { label: "File", items: [
            { label: "Download", icon: "download", action: () => API.download(entry.path, entry.name) },
            { label: "Properties", icon: "settings", action: () => Apps.properties(entry.path) },
            { separator: true },
            { label: "Close", action: () => w.close() },
          ] },
          { label: "View", items: [
            { label: "Zoom In", disabled: entry.kind !== "image", action: () => { scale = Math.min(8, scale * 1.25); applyScale(); } },
            { label: "Zoom Out", disabled: entry.kind !== "image", action: () => { scale = Math.max(0.1, scale / 1.25); applyScale(); } },
            { label: "Actual Size", disabled: entry.kind !== "image", action: () => { scale = 1; applyScale(); } },
          ] },
          { label: "Help", items: [
            { label: "About Viewer", action: () => U.alert("Viewer", "A tiny viewer for images, text, audio, video and PDF files stored on your NAS.", "image") },
          ] },
        ]);
      },
    });
    return win;
  };

  Apps.properties = async function properties(path) {
    let data;
    try {
      data = await API.stat(path);
    } catch (err) {
      U.alert("Properties", err.message, "error");
      return;
    }
    const isDir = data.type === "dir";
    U.dialog({
      title: data.name + " Properties",
      icon: isDir ? "folder" : (Icons.has(data.kind) ? data.kind : "file"),
      width: 410,
      message: "",
      content: () => {
        const wrap = U.el("div", { style: { width: "100%" } });
        const head = U.el("div", { class: "about-logo", style: { marginBottom: "8px" } });
        head.append(
          U.el("span", { style: { width: "32px", height: "32px", flex: "0 0 32px" }, html: Icons.forEntry(data) }),
          U.el("div", { style: { minWidth: "0" } },
            U.el("div", { text: data.name, style: { fontWeight: "bold", wordBreak: "break-all" } }),
            U.el("div", { class: "muted", text: isDir ? "File Folder" : (TYPE_NAMES[data.kind] || "File") }))
        );
        const grid = U.el("dl", { class: "props-grid" });
        const rows = [
          ["Location", data.parent || "/"],
          ["Size", U.fmtSize(data.size || 0) + " (" + Number(data.size || 0).toLocaleString() + " bytes)"],
        ];
        if (isDir) {
          const files = data.fileCount || 0;
          const folders = data.folderCount || 0;
          rows.push(["Contains", files + " file" + (files === 1 ? "" : "s") + ", " + folders + " folder" + (folders === 1 ? "" : "s")]);
        }
        rows.push(
          ["Modified", U.fmtDate(data.mtime)],
          ["Created", U.fmtDate(data.created)],
          ["Attributes", isDir ? "Directory" : "Archive"]
        );
        rows.forEach(([key, value]) => grid.append(U.el("dt", { text: key }), U.el("dd", { text: String(value) })));
        wrap.append(head, U.el("div", { class: "hr" }), grid);
        return wrap;
      },
      buttons: [
        { label: "OK", value: "ok", primary: true },
        { label: "Open", value: "open", action: () => Apps.openFile(data) },
        { label: "Download", value: "download", action: () => API.download(data.path, data.name) },
      ],
    });
  };

  const TYPE_NAMES = {
    folder: "File Folder", image: "Bitmap Image", text: "Text Document", audio: "Sound",
    video: "Video Clip", archive: "Compressed Archive", pdf: "PDF Document", doc: "Document", file: "File",
    word: "Microsoft Word Document", excel: "Microsoft Excel Worksheet",
    powerpoint: "Microsoft PowerPoint Presentation", code: "Source Code",
  };

  Apps.about = async function about() {
    let info = null;
    try { info = await API.info(); } catch (_err) { info = null; }
    U.dialog({
      title: "About Win95 NAS",
      icon: "computer",
      width: 470,
      message: "",
      content: () => {
        const wrap = U.el("div", { style: { width: "100%" } });
        const logo = U.el("div", { class: "about-logo" });
        logo.innerHTML = Icons.windowsLogo;
        logo.append(
          U.el("div", {},
            U.el("div", { style: { fontFamily: "'Times New Roman', serif", fontSize: "24px", lineHeight: "1.1" }, html: "Windows <i>95</i>" }),
            U.el("div", { class: "muted", text: "NAS Edition  \u00B7  version 1.0" })
          )
        );
        wrap.append(logo);
        wrap.append(U.el("div", { class: "settings-note", text: "A love letter to 1995, hiding a very practical network drive. Everything you upload is stored on this PC. No cloud, no accounts, no telemetry." }));
        const dl = U.el("dl", { class: "sysinfo" });
        const rows = info ? [
          ["Computer", info.hostname],
          ["User", (Settings.get().user || "Guest")],
          ["NAS folder", info.root],
          ["Address", "http://localhost:" + info.port],
          ["Network", "http://" + info.ip + ":" + info.port],
          ["Python", info.python],
          ["Docker", info.docker && info.docker.running ? "Connected (v" + info.docker.version + ")" : "Offline"],
          ["Uptime", Math.floor(info.uptime / 60) + " minutes"],
        ] : [["Status", "Could not read system information"]];
        rows.forEach(([key, value]) => dl.append(U.el("dt", { text: key }), U.el("dd", { text: String(value) })));
        wrap.append(dl);
        wrap.append(U.el("div", { class: "hr" }));
        wrap.append(U.el("div", { class: "muted", text: "Made with pure Python, vanilla JavaScript and an unreasonable amount of bevel." }));
        return wrap;
      },
      buttons: [{ label: "OK", value: true, primary: true }],
    });
  };

  Apps.help = function help() {
    const win = WM.open({
      title: "Help Topics - Win95 NAS",
      icon: "help",
      pinId: "help",
      width: 570,
      height: 470,
      build(body, w) {
        const html = `
          <div class="help-app">
            <h2>Win95 NAS Help</h2>
            <p>This is a Windows 95 styled network drive. Files live in the <b>nas-data</b> folder on this PC.</p>
            <h3>Getting around</h3>
            <ul>
              <li><b>Double-click</b> a desktop icon or a file to open it.</li>
              <li><b>Drag a box</b> on the desktop or in a folder to select several items at once.</li>
              <li><b>Right-click</b> anything for a context menu.</li>
              <li>Drag a window by its title bar. Drag the edges to resize. Double-click the title bar to maximize.</li>
              <li>The <b>Start</b> button has Programs, Documents, Settings, Find and Run.</li>
            </ul>
            <h3>Uploading files and folders</h3>
            <ul>
              <li>Open <b>My Computer</b>, then use <b>Upload</b> or <b>Upload Folder</b> in the toolbar.</li>
              <li>You can also drag files and whole folders from Windows straight onto an Explorer window.</li>
              <li>Use <b>New</b> to create a folder, and right-click &rarr; <b>New Text Document</b> for a note.</li>
              <li>Delete sends things to the <b>Recycle Bin</b>, where they can be restored.</li>
            </ul>
            <h3>Docker</h3>
            <ul>
              <li>Open <b>Docker Manager</b> from the desktop or Start &rarr; Programs.</li>
              <li>Browse containers, read logs, and save files from a container onto this PC.</li>
              <li>Right-click any NAS file &rarr; <b>Send to Docker container</b> to copy it in.</li>
              <li>Back up Docker volumes to <b>/Docker Backups/volumes</b> as .tar.gz files.</li>
            </ul>
            <h3>Making it look right</h3>
            <ul>
              <li>Start &rarr; Settings &rarr; <b>Control Panel</b>.</li>
              <li><b>Background</b>: patterns, colours and your own pictures.</li>
              <li><b>Display Effects</b>: CRT scanlines, flicker, colour bleed, curvature, bezel and a power-on animation.</li>
              <li><b>Sounds</b>: synthesized clicks, dings and the startup chime.</li>
              <li><b>Desktop</b>: icon size, clock, boot animation and screensaver.</li>
            </ul>
            <h3>Keyboard shortcuts</h3>
            <p>
              <kbd>Ctrl</kbd>+<kbd>Esc</kbd> Start menu &nbsp;
              <kbd>Alt</kbd>+<kbd>F4</kbd> close window &nbsp;
              <kbd>F2</kbd> rename &nbsp;
              <kbd>Delete</kbd> recycle &nbsp;
              <kbd>Ctrl</kbd>+<kbd>A</kbd> select all &nbsp;
              <kbd>F5</kbd> refresh &nbsp;
              <kbd>Backspace</kbd> up a folder &nbsp;
              <kbd>Enter</kbd> open
            </p>
            <h3>Where are my files?</h3>
            <p>The storage root is shown in Control Panel &rarr; System. Use <b>Open NAS folder</b> there to open it in Windows Explorer. Other devices on your network can reach the same address shown under Network.</p>
            <div class="hr"></div>
            <p class="muted">Tip: try the CRT effect and the screensaver. Then try to beat Minesweeper on Expert. Good luck.</p>
          </div>`;
        body.append(U.el("div", { html, style: { height: "100%", overflow: "auto" } }));
        U.menuBar(w, [
          { label: "File", items: [{ label: "Close", action: () => w.close() }] },
          { label: "Help", items: [{ label: "About Win95 NAS", action: () => Apps.about() }] },
        ]);
      },
    });
    return win;
  };

  // ------------------------------------------------------------ Recycle Bin
  Apps.recycle = function recycle() {
    let items = [];
    let listHost = null;
    let statusHost = null;
    const selected = new Set();
    let win = null;

    function updateStatus() {
      if (!statusHost) return;
      const total = items.reduce((sum, item) => sum + (item.size || 0), 0);
      statusHost.textContent = items.length + " object(s), " + U.fmtSize(total);
    }

    function render() {
      if (!listHost) return;
      listHost.innerHTML = "";
      if (!items.length) {
        listHost.append(U.el("div", { class: "empty-folder", text: "The Recycle Bin is empty." }));
        updateStatus();
        return;
      }
      items.forEach((item) => {
        const row = U.el("div", { class: "recycle-row" });
        const icon = item.type === "dir" ? "folder" : (Icons.has(item.kind) ? item.kind : "file");
        row.innerHTML = `<span class="r-ico">${Icons.get(icon, 16)}</span><span class="r-name"></span><span class="r-meta"></span>`;
        row.querySelector(".r-name").textContent = item.name;
        row.querySelector(".r-meta").textContent = U.fmtDate(item.deletedAt) + (item.size ? "  \u00B7  " + U.fmtSize(item.size) : "");
        row.title = "Originally: " + item.original;
        if (!item.exists) row.style.opacity = "0.55";
        row.addEventListener("click", (event) => {
          if (!event.ctrlKey) selected.clear();
          if (selected.has(item.id)) selected.delete(item.id);
          else selected.add(item.id);
          updateSelection();
        });
        row.addEventListener("dblclick", () => restoreOne(item));
        row.addEventListener("contextmenu", (event) => {
          event.preventDefault();
          selected.clear();
          selected.add(item.id);
          updateSelection();
          U.contextMenu(event.clientX, event.clientY, [
            { label: "Restore", icon: "recycle", action: () => restoreSelected() },
            { separator: true },
            { label: "Delete permanently", icon: "trash", action: () => deleteSelected(true) },
            { separator: true },
            { label: "Properties", icon: "settings", action: () => showInfo(item) },
          ]);
        });
        row.dataset.id = item.id;
        row.classList.toggle("selected", selected.has(item.id));
        listHost.append(row);
      });
      updateStatus();
    }

    function updateSelection() {
      U.qsa(".recycle-row", listHost).forEach((row) => {
        row.classList.toggle("selected", selected.has(row.dataset.id));
      });
    }

    async function reload() {
      try {
        const data = await API.recycle();
        items = data.items;
        render();
      } catch (err) { U.error(err); }
    }

    async function restoreOne(item) {
      try {
        await API.restore(item.id);
        U.toast("Restored " + item.name + " to " + item.original, "success");
        selected.clear();
        await reload();
      } catch (err) { U.alert("Restore failed", err.message, "error"); }
    }

    async function restoreSelected() {
      const chosen = items.filter((item) => selected.has(item.id));
      if (!chosen.length) return;
      for (const item of chosen) {
        try { await API.restore(item.id); }
        catch (err) { U.toast("Could not restore " + item.name + ": " + err.message, "error", 6000); }
      }
      selected.clear();
      await reload();
      U.toast("Restored " + chosen.length + " item(s)", "success");
    }

    async function deleteSelected(permanent) {
      if (!permanent) return;
      if (!await U.confirm("Confirm Delete", "Permanently delete the selected item(s)? This cannot be undone.", "warning")) return;
      for (const item of items.filter((entry) => selected.has(entry.id))) {
        try {
          if (item.exists) await API.removePermanently(item.id);
          else await API.removePermanently(item.id);
        } catch (err) { U.toast(err.message, "error", 6000); }
      }
      selected.clear();
      await reload();
    }

    function showInfo(item) {
      U.alert(item.name + " Properties",
        "Original location: " + item.original +
        "\nType: " + (item.type === "dir" ? "File Folder" : "File") +
        "\nSize: " + (item.size ? U.fmtSize(item.size) : "n/a") +
        "\nDeleted: " + U.fmtDate(item.deletedAt),
        item.type === "dir" ? "folder" : "file");
    }

    const onFilesChanged = () => { if (win && !win.closed) reload(); };
    window.addEventListener("nas:files-changed", onFilesChanged);

    win = WM.open({
      title: "Recycle Bin",
      icon: "recycle",
      pinId: "recycle",
      width: 580,
      height: 400,
      minWidth: 380,
      minHeight: 240,
      onClose() { window.removeEventListener("nas:files-changed", onFilesChanged); },
      build(body, w) {
        const app = U.el("div", { class: "recycle-app" });
        const toolbar = U.el("div", { class: "exp-toolbar" });
        const restoreBtn = U.el("button", { type: "button", text: "Restore" });
        const emptyBtn = U.el("button", { type: "button", text: "Empty Recycle Bin" });
        const refreshBtn = U.el("button", { type: "button", text: "Refresh" });
        restoreBtn.addEventListener("click", restoreSelected);
        emptyBtn.addEventListener("click", async () => {
          if (!items.length) { U.toast("The Recycle Bin is already empty"); return; }
          if (!await U.confirm("Confirm Delete", "Permanently delete all " + items.length + " item(s)?", "warning")) return;
          try {
            await API.emptyRecycle();
            selected.clear();
            await reload();
            U.toast("Recycle Bin emptied", "success");
          } catch (err) { U.alert("Error", err.message, "error"); }
        });
        refreshBtn.addEventListener("click", reload);
        toolbar.append(restoreBtn, emptyBtn, U.el("span", { class: "sep" }), refreshBtn);
        listHost = U.el("div", { class: "recycle-list" });
        const status = U.el("div", { class: "exp-status" });
        statusHost = U.el("div", { class: "status-panel grow", text: "" });
        status.append(statusHost);
        app.append(toolbar, listHost, status);
        body.append(app);

        U.menuBar(w, [
          { label: "File", items: [
            { label: "Restore", action: restoreSelected },
            { label: "Empty Recycle Bin", action: () => emptyBtn.click() },
            { separator: true },
            { label: "Close", action: () => w.close() },
          ] },
          { label: "View", items: [
            { label: "Refresh", shortcut: "F5", action: reload },
          ] },
          { label: "Help", items: [
            { label: "About Recycle Bin", action: () => U.alert("Recycle Bin", "Deleted files wait here until you restore them or empty the bin. They are stored in the data/recycle folder on this PC.", "recycle") },
          ] },
        ]);

        w.onKey = (event) => {
          if (event.key === "F5") { event.preventDefault(); reload(); }
          if (event.key === "Delete") { event.preventDefault(); deleteSelected(true); }
        };
        reload();
      },
    });
    return win;
  };

  // ------------------------------------------------------------ Run
  Apps.run = function run(prefill) {
    let input = null;
    const win = WM.open({
      title: "Run",
      icon: "run",
      width: 400,
      height: 172,
      resizable: false,
      maximizable: false,
      minimizable: false,
      modal: true,
      build(body, w) {
        const wrap = U.el("div", { style: { padding: "12px" } });
        const top = U.el("div", { class: "row", style: { alignItems: "flex-start", gap: "10px" } });
        top.append(U.el("span", { style: { width: "32px", height: "32px", flex: "0 0 32px" }, html: Icons.get("run", 32) }));
        const right = U.el("div", { style: { flex: "1", minWidth: "0" } });
        right.append(U.el("div", { text: "Type the name of a program, folder or document, and Windows will open it for you.", style: { lineHeight: "1.4" } }));
        const row = U.el("div", { class: "row", style: { marginTop: "8px" } });
        row.append(U.el("label", { text: "Open:", style: { flex: "0 0 auto" } }));
        input = U.el("input", { type: "text", value: prefill || "", style: { flex: "1" }, spellcheck: "false" });
        row.append(input);
        right.append(row);
        top.append(right);
        wrap.append(top);

        const buttons = U.el("div", { class: "row", style: { justifyContent: "flex-end", marginTop: "10px", gap: "6px" } });
        const ok = U.el("button", { type: "button", text: "OK", class: "default" });
        const cancel = U.el("button", { type: "button", text: "Cancel" });
        const browse = U.el("button", { type: "button", text: "Browse..." });
        buttons.append(ok, cancel, browse);
        wrap.append(buttons);
        body.append(wrap);

        const history = U.el("div", { class: "settings-note", style: { marginTop: "6px" }, text: "Try: notepad, control, docker, minesweeper, find, recycle, help" });
        wrap.append(history);

        function submit() {
          const value = (input.value || "").trim();
          if (!value) return;
          w.close();
          Apps.execute(value);
        }

        ok.addEventListener("click", submit);
        cancel.addEventListener("click", () => w.close());
        browse.addEventListener("click", async () => {
          const path = await U.nasPicker({ title: "Browse", mode: "any", start: "/" });
          if (path) input.value = path;
        });
        input.addEventListener("keydown", (event) => {
          if (event.key === "Enter") { event.preventDefault(); submit(); }
          if (event.key === "Escape") { event.preventDefault(); w.close(); }
        });
        setTimeout(() => { input.focus(); input.select(); }, 60);
      },
    });
    return win;
  };

  Apps.execute = function execute(raw) {
    const value = String(raw || "").trim();
    if (!value) return;
    const lower = value.toLowerCase();
    if (/^https?:\/\//i.test(value)) {
      window.open(value, "_blank", "noopener");
      return;
    }
    if (lower.startsWith("/") || lower.includes("\\")) {
      const path = value.replace(/\\/g, "/");
      Apps.openFile(path.startsWith("/") ? path : "/" + path);
      return;
    }
    const commands = {
      notepad: () => Apps.notepad(),
      "notepad.exe": () => Apps.notepad(),
      clock: () => Apps.clock(),
      "clock.exe": () => Apps.clock(),
      time: () => Apps.clock(),
      control: () => Settings.open(),
      "control.exe": () => Settings.open(),
      settings: () => Settings.open(),
      docker: () => Docker.open(),
      "docker.exe": () => Docker.open(),
      tailscale: () => Tailscale.open(),
      "tailscale.exe": () => Tailscale.open(),
      minesweeper: () => Apps.minesweeper("beginner"),
      "winmine.exe": () => Apps.minesweeper("beginner"),
      find: () => Apps.find(),
      recycle: () => Apps.recycle(),
      "recycle.exe": () => Apps.recycle(),
      help: () => Apps.help(),
      explorer: () => Explorer.open("/"),
      "explorer.exe": () => Explorer.open("/"),
      "my computer": () => Explorer.open("/"),
      "cmd": () => Apps.commandPrompt(),
      "command.com": () => Apps.commandPrompt(),
      "winver": () => Apps.about(),
      about: () => Apps.about(),
      "taskmgr": () => U.alert("Task Manager", "This 1995 PC runs one very enthusiastic web page.\n\nOpen windows: " + WM.list().length, "info"),
      "shutdown": () => Apps.shutdownDialog(),
      "screensaver": () => Screensaver.start(true),
      "crt": () => { Settings.toggleCRT(); U.toast("CRT effect toggled"); },
      "starfield": () => Screensaver.start(true),
    };
    const command = commands[lower];
    if (command) { command(); return; }
    U.alert("Run", "Windows cannot find \u201C" + value + "\u201D.\n\nCheck the spelling and try again, or use one of the built-in commands.", "warning");
  };

  Apps.msdosPrompt = function msdosPrompt() {
    const win = WM.open({
      title: "MS-DOS Prompt",
      icon: "msdos",
      width: 560,
      height: 360,
      build(body, w) {
        const screen = U.el("pre", {
          class: "docker-log selectable",
          style: { margin: "0", background: "#000", color: "#c0c0c0", padding: "5px", height: "100%" },
        });
        body.append(screen);
        const prompt = "C:\\NAS>";
        const lines = [
          "Microsoft(R) Windows 95 NAS",
          "   (C)Copyright Microsoft Corp 1981-1995. (Sort of.)",
          "",
          "Type HELP for a list of commands.",
          "",
        ];
        let buffer = "";
        let busy = false;

        function paint() {
          screen.textContent = lines.join("\n") + "\n" + prompt + " " + buffer;
          screen.scrollTop = screen.scrollHeight;
        }

        function write(text) { lines.push(text); }

        async function runCommand(raw) {
          const parts = raw.trim().split(/\s+/).filter(Boolean);
          const cmd = (parts[0] || "").toLowerCase();
          const arg = parts.slice(1).join(" ");
          write(prompt + " " + raw);
          if (!cmd) return;
          if (cmd === "help") {
            write("Available commands:");
            write("  DIR [path]     list files        CD [path]     change folder");
            write("  TYPE <file>    show a file       CLS           clear screen");
            write("  VER            version info      DATE / TIME   show date or time");
            write("  ECHO <text>    print text        WHOAMI        current user");
            write("  DOCKER         open Docker       EXIT          close this prompt");
            write("  START <app>    open an app       FORMAT        do not.");
            write("");
          } else if (cmd === "dir" || cmd === "ls") {
            try {
              const data = await API.list(arg || "/");
              write(" Directory of " + data.path);
              write("");
              data.entries.forEach((entry) => {
                const date = new Date(entry.mtime || Date.now());
                const stamp = date.toLocaleDateString() + "  " + date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
                const label = entry.type === "dir" ? "<DIR>         " : String(entry.size).padStart(13, " ");
                write(stamp + "  " + label + "  " + entry.name);
              });
              write("");
              write(data.entries.length + " file(s)");
              write("");
            } catch (err) { write("Error: " + err.message); write(""); }
          } else if (cmd === "cd" || cmd === "chdir") {
            if (!arg) write("Usage: cd <path>");
            else write("(Folders are virtual here. Use DIR with a path instead.)");
            write("");
          } else if (cmd === "type" || cmd === "cat") {
            if (!arg) { write("Usage: type <file>"); write(""); }
            else {
              try {
                const data = await API.text(arg);
                data.text.split("\n").forEach((line) => write(line));
                write("");
              } catch (err) { write("Error: " + err.message); write(""); }
            }
          } else if (cmd === "cls" || cmd === "clear") {
            lines.length = 0;
          } else if (cmd === "ver") {
            write("Windows 95 NAS [Version 4.00.950]");
            write("");
          } else if (cmd === "date") {
            write("Current date is " + new Date().toDateString());
            write("");
          } else if (cmd === "time") {
            write("Current time is " + new Date().toLocaleTimeString());
            write("");
          } else if (cmd === "echo") {
            write(arg);
            write("");
          } else if (cmd === "whoami") {
            write((Settings.get().user || "Guest").toLowerCase() + "\\guest");
            write("");
          } else if (cmd === "docker") {
            write("Opening Docker Manager...");
            write("");
            setTimeout(() => Docker.open(), 120);
          } else if (cmd === "start") {
            if (arg) Apps.execute(arg);
            write("");
          } else if (cmd === "exit") {
            w.close();
            return;
          } else if (cmd === "format") {
            write("Bad command or file name. (Nice try.)");
            write("");
          } else if (cmd === "format c:" || cmd === "del *.*") {
            write("Access denied. The 1990s called.");
            write("");
          } else {
            write("Bad command or file name: " + cmd);
            write("");
          }
        }

        screen.addEventListener("keydown", async (event) => {
          if (busy) return;
          if (event.key === "Enter") {
            event.preventDefault();
            const line = buffer;
            buffer = "";
            busy = true;
            await runCommand(line);
            busy = false;
            paint();
          } else if (event.key === "Backspace") {
            event.preventDefault();
            buffer = buffer.slice(0, -1);
            paint();
          } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey) {
            event.preventDefault();
            buffer += event.key;
            paint();
          }
        });
        screen.tabIndex = 0;
        paint();
        setTimeout(() => screen.focus(), 80);
        U.menuBar(w, [
          { label: "File", items: [{ label: "Close", action: () => w.close() }] },
          { label: "Help", items: [{ label: "About MS-DOS Prompt", action: () => U.alert("MS-DOS Prompt", "A pretend command prompt that talks to your real NAS.\n\nTry DIR, TYPE, VER and ECHO.", "msdos") }] },
        ]);
      },
    });
    return win;
  };

  // ------------------------------------------------------------ Find
  Apps.find = function find(startPath) {
    let listHost = null;
    let termInput = null;
    let pathInput = null;
    let statusHost = null;
    let results = [];

    function renderResults() {
      if (!listHost) return;
      listHost.innerHTML = "";
      if (!results.length) {
        listHost.append(U.el("div", { class: "empty-folder", text: "No matching files." }));
        return;
      }
      results.forEach((entry) => {
        const row = U.el("div", { class: "recycle-row" });
        row.innerHTML = `<span class="r-ico">${Icons.forEntry(entry)}</span><span class="r-name"></span><span class="r-meta"></span>`;
        row.querySelector(".r-name").textContent = entry.name;
        row.querySelector(".r-meta").textContent = entry.path;
        row.addEventListener("dblclick", () => Apps.openFile(entry));
        row.addEventListener("contextmenu", (event) => {
          event.preventDefault();
          U.contextMenu(event.clientX, event.clientY, [
            { label: "Open", action: () => Apps.openFile(entry) },
            { label: "Open containing folder", icon: "folder", action: () => Explorer.open(U.dirname(entry.path)) },
            { separator: true },
            { label: "Download", icon: "download", action: () => API.download(entry.path, entry.name) },
            { label: "Properties", icon: "settings", action: () => Apps.properties(entry.path) },
          ]);
        });
        listHost.append(row);
      });
    }

    async function search() {
      const term = termInput.value.trim();
      if (!term) { U.toast("Type something to search for", "warning"); return; }
      const base = pathInput.value.trim() || "/";
      statusHost.textContent = "Searching...";
      listHost.innerHTML = "";
      try {
        const data = await API.search(base, term);
        results = data.entries;
        renderResults();
        statusHost.textContent = results.length + " item(s) found" + (data.truncated ? " (showing the first 300)" : "");
      } catch (err) {
        statusHost.textContent = "Search failed";
        U.alert("Find", err.message, "error");
      }
    }

    const win = WM.open({
      title: "Find: All Files",
      icon: "find",
      pinId: "find",
      width: 560,
      height: 420,
      build(body, w) {
        const app = U.el("div", { style: { display: "flex", flexDirection: "column", height: "100%", minHeight: "0" } });
        const form = U.el("div", { style: { padding: "8px" } });
        form.append(U.el("div", { class: "settings-note", text: "Search every folder on the NAS. Wildcards are not required." }));
        const row1 = U.el("div", { class: "settings-row" });
        termInput = U.el("input", { type: "text", placeholder: "e.g. report, .png, notes", style: { flex: "1" } });
        row1.append(U.el("label", { text: "Named:" }), termInput);
        const row2 = U.el("div", { class: "settings-row" });
        pathInput = U.el("input", { type: "text", value: startPath || "/", style: { flex: "1" } });
        row2.append(U.el("label", { text: "Look in:" }), pathInput);
        const row3 = U.el("div", { class: "row", style: { marginTop: "6px", justifyContent: "flex-end" } });
        const goBtn = U.el("button", { type: "button", text: "Find Now", class: "default" });
        const stopBtn = U.el("button", { type: "button", text: "New Search" });
        row3.append(goBtn, stopBtn);
        form.append(row1, row2, row3);
        listHost = U.el("div", { class: "recycle-list", style: { flex: "1", minHeight: "0" } });
        const status = U.el("div", { class: "exp-status" });
        statusHost = U.el("div", { class: "status-panel grow", text: "Ready" });
        status.append(statusHost);
        app.append(form, listHost, status);
        body.append(app);

        goBtn.addEventListener("click", search);
        stopBtn.addEventListener("click", () => {
          results = [];
          termInput.value = "";
          renderResults();
          statusHost.textContent = "Ready";
          termInput.focus();
        });
        termInput.addEventListener("keydown", (event) => { if (event.key === "Enter") search(); });

        U.menuBar(w, [
          { label: "File", items: [
            { label: "Find Now", action: search },
            { label: "New Search", action: () => stopBtn.click() },
            { separator: true },
            { label: "Close", action: () => w.close() },
          ] },
          { label: "Help", items: [
            { label: "About Find", action: () => U.alert("Find", "Searches file and folder names anywhere under the chosen NAS path.\n\nTry .png, note, or a project name.", "find") },
          ] },
        ]);
        setTimeout(() => termInput.focus(), 80);
      },
    });
    return win;
  };

  // ------------------------------------------------------------ Shut down
  Apps.shutdownDialog = function shutdownDialog() {
    let select = null;
    let result = null;
    const win = WM.open({
      title: "Shut Down Windows",
      icon: "shutdown",
      width: 380,
      height: 236,
      resizable: false,
      maximizable: false,
      minimizable: false,
      modal: true,
      build(body, w) {
        const wrap = U.el("div", { style: { padding: "12px" } });
        const top = U.el("div", { class: "row", style: { alignItems: "flex-start", gap: "10px" } });
        top.append(U.el("span", { style: { width: "40px", height: "40px", flex: "0 0 40px" }, html: Icons.get("shutdown", 40) }));
        top.append(U.el("div", { text: "Are you sure you want to shut down the computer?", style: { lineHeight: "1.4", paddingTop: "4px" } }));
        wrap.append(top);
        const row = U.el("div", { class: "row", style: { marginTop: "10px" } });
        select = U.el("select", { style: { flex: "1" } });
        [
          ["shutdown", "Shut down the computer?"],
          ["restart", "Restart the computer?"],
          ["dos", "Restart the computer in MS-DOS mode?"],
          ["logoff", "Close all programs and log on as a different user?"],
        ].forEach(([value, label]) => select.append(U.el("option", { value, text: label })));
        row.append(U.el("label", { text: "What do you want the computer to do?" }), select);
        wrap.append(row);
        const buttons = U.el("div", { class: "row", style: { justifyContent: "flex-end", marginTop: "14px", gap: "6px" } });
        const ok = U.el("button", { type: "button", text: "OK", class: "default" });
        const cancel = U.el("button", { type: "button", text: "Cancel" });
        const help = U.el("button", { type: "button", text: "Help" });
        buttons.append(ok, cancel, help);
        wrap.append(buttons);
        body.append(wrap);

        ok.addEventListener("click", () => {
          result = select.value;
          w.close();
          perform(result);
        });
        cancel.addEventListener("click", () => w.close());
        help.addEventListener("click", () => U.alert("Shut Down", "Shut down shows the classic orange farewell screen.\nRestart reloads the page with a fresh boot sequence.\nMS-DOS mode opens a command prompt instead.", "help"));
        setTimeout(() => ok.focus(), 60);
      },
    });

    function perform(action) {
      if (action === "dos") {
        w2close();
        Apps.msdosPrompt();
        return;
      }
      if (action === "logoff") {
        window.location.reload();
        return;
      }
      const screen = document.getElementById("shutdown-screen");
      const text = screen && screen.querySelector(".shutdown-text");
      Sound.play("shutdown");
      if (text) {
        text.innerHTML = action === "restart"
          ? "Please wait while your computer restarts."
          : "It&rsquo;s now safe to turn off<br>your computer.";
      }
      if (screen) screen.hidden = false;
      if (window.Screensaver) Screensaver.stop();
      setTimeout(() => {
        WM.closeAll();
        if (window.Screensaver) Screensaver.stop();
      }, 400);
    }

    function w2close() { win.close(); }
    return win;
  };

  // ------------------------------------------------------------ Welcome tips
  const TIPS = [
    ["Drag a selection box", "Click an empty spot on the desktop or in a folder, hold the mouse button down and drag. A dotted box appears and everything inside gets selected. Just like 1995."],
    ["Change the wallpaper", "Start \u2192 Settings \u2192 Control Panel \u2192 Background. Choose a pattern, a solid colour, or upload one of your own pictures. It applies instantly."],
    ["Turn on the CRT", "Control Panel \u2192 Display Effects. Scanlines, flicker, colour bleed, curvature, even a monitor bezel. There is a power-on animation too."],
    ["Drag files from Windows", "You can drag files or whole folders from Windows Explorer straight onto a NAS folder window and they upload in the background."],
    ["Folders keep their shape", "Upload Folder preserves the folder tree. Create folders with the New button, rename with F2, delete with Delete."],
    ["Send files into Docker", "Right-click any NAS file \u2192 Send to Docker container. The file is copied with docker cp into the running container."],
    ["Save files out of Docker", "Docker Manager \u2192 Files lets you browse a container's filesystem and save anything onto this PC."],
    ["Back up a volume", "Docker Manager \u2192 Volumes. Pick a volume, press Back up to NAS, and get a .tar.gz in /Docker Backups/volumes."],
    ["The Recycle Bin works", "Deleted files go to the Recycle Bin and can be restored to their original folder. Empty it when you are feeling brave."],
    ["Screensaver", "Leave the mouse alone for a few minutes. Starfield, Mystify or Flying Windows will take over. Move the mouse to come back."],
    ["Right-click everything", "Desktop, files, folders, the taskbar, task buttons. Almost everything has a context menu with useful things in it."],
    ["Run anything", "Start \u2192 Run. Try notepad, control, docker, minesweeper, find, recycle, help, or even cmd for a DOS prompt."],
    ["Double-click the title bar", "Maximizes or restores a window. Drag the edges to resize. The window buttons are exactly where you remember them."],
    ["Minesweeper is still hard", "Start \u2192 Programs \u2192 Games \u2192 Minesweeper. Expert mode remains undefeated since 1995."],
    ["Your files are just files", "Everything lives in the nas-data folder on this PC. Open it from Control Panel \u2192 System \u2192 Open NAS folder."],
    ["It works on your network", "The address shown in Control Panel \u2192 System under Network works from other devices on the same network."],
  ];

  Apps.tips = function tips() {
    const existing = WM.find("tips");
    if (existing) { existing.focus(); return existing; }
    let bodyHost = null;
    let index = Math.floor(Math.random() * TIPS.length);

    const win = WM.open({
      title: "Welcome to Win95 NAS",
      icon: "help",
      width: 480,
      height: 330,
      singleton: "tips",
      build(body, w) {
        const app = U.el("div", { style: { display: "flex", flexDirection: "column", height: "100%", padding: "10px", gap: "8px" } });
        const head = U.el("div", { class: "row", style: { gap: "10px", alignItems: "flex-start" } });
        head.append(
          U.el("span", { style: { width: "48px", height: "48px", flex: "0 0 48px" }, html: Icons.windowsLogo }),
          U.el("div", {},
            U.el("div", { style: { fontFamily: "'Times New Roman', serif", fontSize: "20px" }, html: "Welcome to Windows <i>95</i> NAS" }),
            U.el("div", { class: "muted", text: "Your own network drive, with all the bevels." }))
        );
        bodyHost = U.el("div", {
          style: {
            flex: "1", minHeight: "0", overflow: "auto", padding: "8px",
            background: "#ffffe1", border: "1px solid #000",
          },
        });
        const buttons = U.el("div", { class: "row", style: { justifyContent: "space-between" } });
        const left = U.el("div", { class: "row" });
        const next = U.el("button", { type: "button", text: "Next Tip" });
        const close = U.el("button", { type: "button", text: "Close", class: "default" });
        const disable = U.el("button", { type: "button", text: "Don't show tips" });
        left.append(next, disable);
        buttons.append(left, close);
        app.append(head, bodyHost, buttons);
        body.append(app);

        function show() {
          const [title, text] = TIPS[index % TIPS.length];
          bodyHost.innerHTML = "";
          bodyHost.append(
            U.el("div", { style: { fontWeight: "bold", marginBottom: "5px" }, text: "Did you know..." }),
            U.el("div", { style: { fontWeight: "bold", marginBottom: "6px", color: "#000080" }, text: title }),
            U.el("div", { style: { lineHeight: "1.55" }, text })
          );
          bodyHost.scrollTop = 0;
          index += 1;
        }
        next.addEventListener("click", show);
        close.addEventListener("click", () => w.close());
        disable.addEventListener("click", async () => {
          await Settings.patch({ desktop: { showTips: false } });
          U.toast("Tips disabled. Re-enable them in Control Panel > Desktop.");
          w.close();
        });
        show();
      },
    });
    return win;
  };

  // ------------------------------------------------------------ Screensaver
  const Screensaver = (window.Screensaver = window.Screensaver || {});
  let ssWin = null;
  let ssActive = false;
  let ssRaf = 0;
  let ssCanvas = null;
  let ssCtx = null;
  let ssStyle = "starfield";
  let ssTimer = null;
  let ssMinutes = 8;
  let ssLastInput = Date.now();
  let ssStartedAt = 0;
  let ssStars = [];
  let ssLines = [];
  let ssWindows = [];

  function ssResize() {
    if (!ssCanvas) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    ssCanvas.width = Math.floor(window.innerWidth * dpr);
    ssCanvas.height = Math.floor(window.innerHeight * dpr);
    ssCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function ssInit() {
    ssStars = [];
    for (let i = 0; i < 320; i += 1) {
      ssStars.push({
        x: (Math.random() - 0.5) * window.innerWidth,
        y: (Math.random() - 0.5) * window.innerHeight,
        z: Math.random() * window.innerWidth + 1,
        speed: 0.6 + Math.random() * 1.8,
      });
    }
    ssLines = [];
    for (let i = 0; i < 8; i += 1) {
      ssLines.push({
        x: Math.random() * window.innerWidth,
        y: Math.random() * window.innerHeight,
        dx: (Math.random() - 0.5) * 3.4,
        dy: (Math.random() - 0.5) * 3.4,
        color: ["#00ffff", "#ff00ff", "#ffff00", "#00ff00", "#ff4040"][i % 5],
        points: [],
      });
    }
    ssWindows = [];
    const colors = ["#ff3b30", "#4cd964", "#2f7bff", "#ffd60a"];
    for (let i = 0; i < 14; i += 1) {
      ssWindows.push({
        x: Math.random() * window.innerWidth,
        y: Math.random() * window.innerHeight,
        vx: (Math.random() - 0.5) * 4.2,
        vy: (Math.random() - 0.5) * 4.2,
        size: 26 + Math.random() * 26,
        color: colors[i % 4],
        phase: Math.random() * Math.PI * 2,
      });
    }
  }

  function drawStarfield() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    ssCtx.fillStyle = "rgba(0, 0, 0, 0.32)";
    ssCtx.fillRect(0, 0, w, h);
    const cx = w / 2;
    const cy = h / 2;
    ssStars.forEach((star) => {
      star.z -= star.speed * 2.6;
      if (star.z < 1) {
        star.x = (Math.random() - 0.5) * w;
        star.y = (Math.random() - 0.5) * h;
        star.z = w;
      }
      const scale = w / star.z;
      const sx = cx + star.x * scale;
      const sy = cy + star.y * scale;
      if (sx < 0 || sx > w || sy < 0 || sy > h) return;
      const size = Math.max(0.6, (1 - star.z / w) * 2.6);
      const shade = Math.floor(120 + (1 - star.z / w) * 135);
      ssCtx.fillStyle = "rgb(" + shade + "," + shade + "," + Math.min(255, shade + 30) + ")";
      ssCtx.fillRect(sx, sy, size, size);
    });
  }

  function drawMystify() {
    ssCtx.fillStyle = "rgba(0,0,0,0.12)";
    ssCtx.fillRect(0, 0, window.innerWidth, window.innerHeight);
    ssLines.forEach((line) => {
      line.points.push({ x: line.x, y: line.y });
      if (line.points.length > 44) line.points.shift();
      line.x += line.dx;
      line.y += line.dy;
      if (line.x < 0 || line.x > window.innerWidth) line.dx *= -1;
      if (line.y < 0 || line.y > window.innerHeight) line.dy *= -1;
      ssCtx.strokeStyle = line.color;
      ssCtx.lineWidth = 1.6;
      ssCtx.beginPath();
      line.points.forEach((point, index) => {
        if (index === 0) ssCtx.moveTo(point.x, point.y);
        else ssCtx.lineTo(point.x, point.y);
      });
      ssCtx.stroke();
    });
  }

  function drawFlying() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    ssCtx.fillStyle = "rgba(0,0,0,0.16)";
    ssCtx.fillRect(0, 0, w, h);
    ssWindows.forEach((item) => {
      item.x += item.vx;
      item.y += item.vy;
      item.phase += 0.03;
      if (item.x < -item.size) item.x = w + item.size;
      if (item.x > w + item.size) item.x = -item.size;
      if (item.y < -item.size) item.y = h + item.size;
      if (item.y > h + item.size) item.y = -item.size;
      const wobble = Math.sin(item.phase) * 0.35;
      const size = item.size;
      ssCtx.save();
      ssCtx.translate(item.x, item.y);
      ssCtx.rotate(wobble);
      ssCtx.globalAlpha = 0.9;
      ssCtx.fillStyle = item.color;
      const half = size / 2;
      ssCtx.beginPath();
      ssCtx.moveTo(-half, -half + 2);
      ssCtx.lineTo(0, -half - 1);
      ssCtx.lineTo(half, -half + 2);
      ssCtx.lineTo(half, half - 2);
      ssCtx.lineTo(0, half + 1);
      ssCtx.lineTo(-half, half - 2);
      ssCtx.closePath();
      ssCtx.fill();
      ssCtx.globalAlpha = 0.35;
      ssCtx.fillStyle = "#ffffff";
      ssCtx.fillRect(-half + 2, -half + 3, size - 4, 2);
      ssCtx.restore();
    });
  }

  function ssFrame() {
    if (!ssActive) return;
    if (ssStyle === "starfield") drawStarfield();
    else if (ssStyle === "mystify") drawMystify();
    else if (ssStyle === "flying") drawFlying();
    else { ssCtx.fillStyle = "#000"; ssCtx.fillRect(0, 0, window.innerWidth, window.innerHeight); }
    ssRaf = requestAnimationFrame(ssFrame);
  }

  Screensaver.configure = function configure(minutes, style) {
    ssMinutes = Number(minutes) || 0;
    ssStyle = style || "starfield";
    if (ssTimer) { clearInterval(ssTimer); ssTimer = null; }
    if (ssMinutes > 0) {
      ssTimer = setInterval(() => {
        if (ssActive) return;
        if (Date.now() - ssLastInput >= ssMinutes * 60 * 1000) Screensaver.start();
      }, 5000);
    }
  };

  Screensaver.start = function start(preview) {
    if (ssActive) return;
    const host = document.getElementById("screensaver");
    ssCanvas = document.getElementById("screensaver-canvas");
    if (!host || !ssCanvas) return;
    ssActive = true;
    ssStartedAt = Date.now();
    host.hidden = false;
    host.style.cursor = "none";
    ssCtx = ssCanvas.getContext("2d");
    ssResize();
    ssInit();
    ssStyle = preview ? (Settings.get().desktop.screensaverStyle || "starfield") : (Settings.get().desktop.screensaverStyle || "starfield");
    ssCtx.fillStyle = "#000";
    ssCtx.fillRect(0, 0, window.innerWidth, window.innerHeight);
    ssFrame();
    Sound.play("ding");
    const hint = host.querySelector(".ss-hint");
    if (hint) hint.style.opacity = "0.0";
  };

  Screensaver.stop = function stop() {
    if (!ssActive) return;
    ssActive = false;
    cancelAnimationFrame(ssRaf);
    ssRaf = 0;
    const host = document.getElementById("screensaver");
    if (host) host.hidden = true;
    ssLastInput = Date.now();
  };

  Screensaver.active = () => ssActive;
  Screensaver.noteActivity = () => { ssLastInput = Date.now(); };

  window.addEventListener("resize", () => { if (ssActive) { ssResize(); ssInit(); } });
  ["mousemove", "mousedown", "wheel", "keydown", "touchstart"].forEach((type) => {
    window.addEventListener(type, () => {
      ssLastInput = Date.now();
      if (ssActive && Date.now() - ssStartedAt > 450) Screensaver.stop();
    }, { passive: true });
  });
})();
