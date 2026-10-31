/* Win95 NAS - WinRAR-style archive manager.
 *
 * Open, create, extract, test and edit ZIP archives, and read/extract TAR,
 * TAR.GZ, TAR.BZ2, TAR.XZ, GZ, BZ2 and XZ files. The look follows the
 * classic WinRAR window: menu bar, command toolbar, file list and status bar.
 */
(function () {
  "use strict";

  const WinRAR = (window.WinRAR = window.WinRAR || {});

  const CREATE_FORMATS = [
    { value: "zip", label: "ZIP" },
    { value: "tar", label: "TAR" },
    { value: "tar.gz", label: "TAR.GZ" },
    { value: "tar.bz2", label: "TAR.BZ2" },
    { value: "tar.xz", label: "TAR.XZ" },
  ];

  const FORMAT_LABEL = {
    zip: "ZIP", zipx: "ZIP", tar: "TAR", "tar.gz": "TAR.GZ", tgz: "TAR.GZ",
    "tar.bz2": "TAR.BZ2", tbz2: "TAR.BZ2", "tar.xz": "TAR.XZ", txz: "TAR.XZ",
    gz: "GZIP", bz2: "BZIP2", xz: "XZ", rar: "RAR", "7z": "7-ZIP", iso: "ISO",
  };

  const IMAGE_EXT = new Set(["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "ico", "avif"]);
  const TEXT_EXT = new Set(["txt", "md", "log", "json", "js", "ts", "css", "html", "htm",
    "py", "bat", "cmd", "ps1", "sh", "ini", "cfg", "conf", "yml", "yaml", "xml", "csv",
    "c", "h", "cpp", "java", "rs", "go", "sql"]);
  const AUDIO_EXT = new Set(["mp3", "wav", "ogg", "flac", "m4a", "aac", "wma"]);
  const VIDEO_EXT = new Set(["mp4", "webm", "mkv", "mov", "avi", "m4v"]);
  const ARCHIVE_EXT = new Set(["zip", "zipx", "rar", "7z", "tar", "gz", "tgz", "bz2",
    "tbz2", "xz", "txz", "iso"]);

  const baseName = (path) => String(path || "").split("/").filter(Boolean).pop() || "/";
  const dirName = (path) => {
    const clean = String(path || "/").replace(/\/+$/, "") || "/";
    const i = clean.lastIndexOf("/");
    return i <= 0 ? "/" : clean.slice(0, i);
  };
  const extOf = (name) => {
    const leaf = String(name || "").split("/").pop() || "";
    const i = leaf.lastIndexOf(".");
    return i <= 0 ? "" : leaf.slice(i + 1).toLowerCase();
  };

  function stripArchiveName(name) {
    return String(name || "").replace(
      /\.(tar\.gz|tar\.bz2|tar\.xz|tgz|tbz2|txz|tar|zipx|zip|gz|bz2|xz|rar|7z|iso)$/i,
      ""
    );
  }

  function entryIcon(entry) {
    if (entry.dir) return "folder";
    const ext = extOf(entry.name);
    if (IMAGE_EXT.has(ext)) return "image";
    if (TEXT_EXT.has(ext)) return "text";
    if (AUDIO_EXT.has(ext)) return "audio";
    if (VIDEO_EXT.has(ext)) return "video";
    if (ARCHIVE_EXT.has(ext)) return "archive";
    if (ext === "pdf") return "pdf";
    if (["doc", "docx", "rtf"].includes(ext)) return "word";
    if (["xls", "xlsx"].includes(ext)) return "excel";
    if (["ppt", "pptx"].includes(ext)) return "powerpoint";
    return "file";
  }

  function archiveFormatOf(name) {
    const low = String(name || "").toLowerCase();
    const pairs = [
      [".tar.gz", "tar.gz"], [".tar.bz2", "tar.bz2"], [".tar.xz", "tar.xz"],
      [".tgz", "tgz"], [".tbz2", "tbz2"], [".txz", "txz"], [".tar", "tar"],
      [".zipx", "zipx"], [".zip", "zip"], [".gz", "gz"], [".bz2", "bz2"],
      [".xz", "xz"], [".rar", "rar"], [".7z", "7z"], [".iso", "iso"],
    ];
    for (const [suffix, fmt] of pairs) if (low.endsWith(suffix)) return fmt;
    return "";
  }

  function fmtSize(bytes) {
    if (bytes === null || bytes === undefined || bytes < 0) return "";
    return U.fmtSize(bytes);
  }

  function fmtDate(ms) {
    if (!ms) return "";
    try { return new Date(ms).toLocaleString(); } catch (_err) { return ""; }
  }

  // ---------------------------------------------------------------- window

  WinRAR.open = function open(path, options) {
    if (!path) return WinRAR.pick();
    const opts = options || {};

    let archivePath = String(path);
    let data = null;
    let entries = [];
    let selected = new Set();
    let lastIndex = -1;
    let listHost = null;
    let statusLeft = null;
    let statusRight = null;
    let pathField = null;
    let formatField = null;
    let addBtn = null;
    let extractBtn = null;
    let viewBtn = null;
    let deleteBtn = null;
    let win = null;

    const isZip = () => !!data && data.format === "zip";
    const selectedEntries = () => entries.filter((entry) => selected.has(entry.name));

    function expandNames(list) {
      const names = new Set();
      list.forEach((entry) => {
        names.add(entry.name);
        if (entry.dir) {
          const prefix = entry.name.replace(/\/+$/, "") + "/";
          entries.forEach((other) => {
            if (other.name.startsWith(prefix)) names.add(other.name);
          });
        }
      });
      return names;
    }

    function updateStatus() {
      if (!statusLeft) return;
      const sel = selectedEntries();
      const files = entries.filter((entry) => !entry.dir);
      const total = files.reduce((sum, entry) => sum + Math.max(0, entry.size || 0), 0);
      statusLeft.textContent = entries.length + " item(s), " + U.fmtSize(total);
      if (sel.length) {
        const selSize = sel.reduce((sum, entry) => sum + Math.max(0, entry.size || 0), 0);
        statusRight.textContent = sel.length + " selected, " + U.fmtSize(selSize);
      } else {
        const packed = data ? data.compressedSize : 0;
        const ratio = total > 0 && packed > 0 ? Math.max(0, 100 - (packed / total) * 100) : 0;
        statusRight.textContent = data
          ? fmtSize(packed) + " packed, " + Math.round(ratio) + "% saved"
          : "";
      }
      if (viewBtn) viewBtn.disabled = !(sel.length === 1 && !sel[0].dir);
      if (deleteBtn) deleteBtn.disabled = !sel.length || !isZip();
      if (addBtn) addBtn.disabled = !isZip();
    }

    function render() {
      if (!listHost) return;
      listHost.innerHTML = "";
      if (!entries.length) {
        listHost.append(U.el("div", {
          class: "archive-empty",
          text: data ? "This archive is empty." : "Reading archive...",
        }));
        updateStatus();
        return;
      }
      entries.forEach((entry, index) => {
        const row = U.el("div", {
          class: "archive-row" + (selected.has(entry.name) ? " selected" : ""),
          dataset: { index: String(index) },
        });
        row.append(
          U.el("span", { class: "a-ico", html: Icons.get(entryIcon(entry), 16) }),
          U.el("span", { class: "a-name", text: entry.name }),
          U.el("span", { class: "a-size", text: entry.dir ? "" : fmtSize(entry.size) }),
          U.el("span", { class: "a-packed", text: entry.dir ? "" : fmtSize(entry.compressed) }),
          U.el("span", { class: "a-date", text: fmtDate(entry.mtime) })
        );
        row.addEventListener("click", (event) => {
          if (event.ctrlKey || event.metaKey) {
            if (selected.has(entry.name)) selected.delete(entry.name);
            else selected.add(entry.name);
            lastIndex = index;
          } else if (event.shiftKey && lastIndex >= 0) {
            const from = Math.min(lastIndex, index);
            const to = Math.max(lastIndex, index);
            selected = new Set(entries.slice(from, to + 1).map((item) => item.name));
          } else {
            selected = new Set([entry.name]);
            lastIndex = index;
          }
          render();
        });
        row.addEventListener("dblclick", () => {
          if (!entry.dir) preview(entry);
        });
        row.addEventListener("contextmenu", (event) => {
          event.preventDefault();
          event.stopPropagation();
          if (!selected.has(entry.name)) {
            selected = new Set([entry.name]);
            lastIndex = index;
            render();
          }
          itemMenu(event.clientX, event.clientY);
        });
        listHost.append(row);
      });
      updateStatus();
    }

    async function load() {
      listHost.innerHTML = "";
      listHost.append(U.el("div", { class: "archive-empty", text: "Reading archive..." }));
      try {
        const info = await API.archive.list(archivePath);
        data = info;
        archivePath = info.path;
        entries = info.entries || [];
        selected = new Set();
        lastIndex = -1;
        if (pathField) pathField.value = archivePath;
        if (formatField) formatField.textContent = FORMAT_LABEL[info.format] || info.format.toUpperCase();
        if (win) win.setTitle(baseName(archivePath) + " - WinRAR");
        render();
        if (opts.extract) {
          opts.extract = false;
          extractDialog([]);
        } else if (opts.add) {
          opts.add = false;
          addFiles();
        }
      } catch (err) {
        data = null;
        entries = [];
        listHost.innerHTML = "";
        listHost.append(U.el("div", { class: "archive-empty", text: err.message }));
        updateStatus();
        U.alert("WinRAR", err.message, "error");
      }
    }

    // ------------------------------------------------------------ commands
    async function addFiles() {
      if (!isZip()) {
        U.alert("Add to Archive", "Files can only be added to ZIP archives.", "warning");
        return;
      }
      const picked = await U.nasPicker({ title: "Add to Archive", mode: "any", start: "/" });
      if (!picked) return;
      U.toast("Adding " + baseName(picked) + "...");
      try {
        const res = await API.archive.add({ path: archivePath, paths: [picked] });
        U.toast("Added " + res.added + " file(s)", "success");
        await load();
      } catch (err) {
        U.alert("Add to Archive", err.message, "error");
      }
    }

    async function deleteSelected() {
      const sel = selectedEntries();
      if (!sel.length) return;
      if (!isZip()) {
        U.alert("Delete", "Entries can only be removed from ZIP archives.", "warning");
        return;
      }
      const names = expandNames(sel);
      const ok = await U.confirm(
        "Delete from Archive",
        "Delete " + names.size + " item(s) from " + baseName(archivePath) + "?\n\n" +
        "This changes the archive file itself.",
        "warning"
      );
      if (!ok) return;
      try {
        const res = await API.archive.remove({ path: archivePath, members: Array.from(names) });
        U.toast("Removed " + res.removed + " item(s)", "success");
        await load();
      } catch (err) {
        U.alert("Delete from Archive", err.message, "error");
      }
    }

    async function testArchive() {
      U.toast("Testing " + baseName(archivePath) + "...");
      try {
        const res = await API.archive.test({ path: archivePath });
        if (res.ok) {
          U.alert("Test Archive", "No errors found.\n\n" + res.checked + " file(s) tested.", "info");
        } else {
          const body = [res.message, ""].concat(res.errors || []).join("\n");
          U.alert("Test Archive", body, "warning");
        }
      } catch (err) {
        U.alert("Test Archive", err.message, "error");
      }
    }

    function showInfo() {
      if (!data) return;
      const files = entries.filter((entry) => !entry.dir);
      const total = files.reduce((sum, entry) => sum + Math.max(0, entry.size || 0), 0);
      const packed = data.compressedSize || 0;
      const ratio = total > 0 ? Math.max(0, 100 - (packed / total) * 100) : 0;
      const rows = [
        ["Archive", data.name],
        ["Path", data.path],
        ["Format", FORMAT_LABEL[data.format] || data.format.toUpperCase()],
        ["Items", entries.length + " (" + files.length + " file(s))"],
        ["Original size", U.fmtSize(total)],
        ["Archive size", U.fmtSize(packed)],
        ["Compression", Math.round(ratio) + "% saved"],
        ["Encrypted", data.encrypted ? "Yes (password protected)" : "No"],
      ];
      WM.open({
        title: "Archive Information",
        icon: "winrar",
        width: 430,
        height: 300,
        resizable: false,
        maximizable: false,
        minimizable: false,
        dialog: true,
        build(body, w) {
          const app = U.el("div", { class: "archive-props" });
          rows.forEach(([label, value]) => {
            app.append(U.el("label", { text: label + ":" }), U.el("span", { text: String(value) }));
          });
          const buttons = U.el("div", { class: "archive-dialog-buttons" });
          const ok = U.el("button", { type: "button", class: "default", text: "OK" });
          ok.addEventListener("click", () => w.close());
          buttons.append(ok);
          const wrap = U.el("div", { class: "archive-dialog" }, app, buttons);
          body.append(wrap);
          setTimeout(() => ok.focus(), 40);
        },
      });
    }

    function preview(entry) {
      const url = API.archive.memberUrl(archivePath, entry.name);
      const ext = extOf(entry.name);
      WM.open({
        title: entry.name + " - Viewer",
        icon: entryIcon(entry),
        width: 640,
        height: 480,
        minWidth: 320,
        minHeight: 240,
        build(body) {
          const app = U.el("div", { class: "viewer-app" });
          const toolbar = U.el("div", { class: "viewer-toolbar" });
          const download = U.el("button", { type: "button", text: "Extract to folder..." });
          download.addEventListener("click", () => extractDialog([entry.name]));
          toolbar.append(
            download,
            U.el("span", { class: "spacer" }),
            U.el("span", { class: "muted", text: fmtSize(entry.size) })
          );
          const stage = U.el("div", { class: "viewer-stage" });
          app.append(toolbar, stage);
          body.append(app);

          if (IMAGE_EXT.has(ext)) {
            stage.append(U.el("img", { src: url, alt: entry.name, draggable: "false" }));
          } else if (TEXT_EXT.has(ext) || ext === "nfo" || ext === "cue") {
            const pre = U.el("pre", { class: "viewer-text", text: "Loading..." });
            stage.append(pre);
            fetch(url).then((res) => res.text()).then((text) => {
              pre.textContent = text.length > 400000 ? text.slice(0, 400000) + "\n\n[...truncated]" : text;
            }).catch((err) => { pre.textContent = "Cannot read this entry: " + err.message; });
          } else if (AUDIO_EXT.has(ext) || VIDEO_EXT.has(ext)) {
            const tag = AUDIO_EXT.has(ext) ? "audio" : "video";
            stage.append(U.el(tag, { src: url, controls: true }));
          } else if (ext === "pdf") {
            stage.append(U.el("iframe", { src: url, title: entry.name }));
          } else {
            stage.append(U.el("div", {
              class: "archive-empty",
              text: "No preview for this file type. Use \u201cExtract to folder...\u201d.",
            }));
          }
        },
      });
    }

    function extractDialog(names) {
      const list = names && names.length
        ? names
        : entries.map((entry) => entry.name);
      const target = archivePath;
      const defaultDest = dirName(target) === "/"
        ? "/" + stripArchiveName(baseName(target))
        : dirName(target) + "/" + stripArchiveName(baseName(target));

      WM.open({
        title: "Extract " + baseName(target),
        icon: "winrar",
        width: 470,
        height: 240,
        resizable: false,
        maximizable: false,
        minimizable: false,
        dialog: true,
        build(body, w) {
          const destInput = U.el("input", { type: "text", value: defaultDest });
          const browse = U.el("button", { type: "button", text: "Browse..." });
          const overwrite = U.el("input", { type: "checkbox", id: "arc-overwrite" });
          const extract = U.el("button", { type: "button", class: "default", text: "Extract" });
          const cancel = U.el("button", { type: "button", text: "Cancel" });
          const explicit = !!(names && names.length);
          const note = U.el("div", {
            class: "muted",
            text: explicit
              ? list.length + " of " + entries.length + " item(s) selected"
              : "All " + entries.length + " item(s) will be extracted",
          });

          browse.addEventListener("click", async () => {
            const picked = await U.nasPicker({ title: "Extract To", mode: "dir", start: dirName(target) });
            if (picked) destInput.value = picked;
          });
          cancel.addEventListener("click", () => w.close());
          extract.addEventListener("click", async () => {
            const dest = destInput.value.trim() || "/";
            extract.disabled = true;
            extract.textContent = "Extracting...";
            try {
              const res = await API.archive.extract({
                path: target,
                dest,
                members: list.length === entries.length ? [] : list,
                overwrite: overwrite.checked,
              });
              w.close();
              const skipped = res.skipped && res.skipped.length
                ? "\n\n" + res.skipped.length + " item(s) were skipped (unsafe or special entries)."
                : "";
              if (window.Explorer) Explorer.open(res.dest);
              U.alert(
                "Extract",
                "Extracted " + res.extracted + " file(s) to:\n" + res.dest + skipped,
                skipped ? "warning" : "info"
              );
            } catch (err) {
              U.alert("Extract", err.message, "error");
              extract.disabled = false;
              extract.textContent = "Extract";
            }
          });

          const row = (label, ...children) => U.el("div", { class: "row" },
            U.el("label", { text: label }), ...children);
          const wrap = U.el("div", { class: "archive-dialog" },
            U.el("div", { class: "archive-dialog-title", text: "Extract to:" }),
            row("Destination:", destInput, browse),
            row("Options:", U.el("label", { class: "archive-check" }, overwrite,
              U.el("span", { text: "Overwrite existing files" }))),
            note,
            U.el("div", { class: "archive-dialog-buttons" }, cancel, extract)
          );
          body.append(wrap);
          setTimeout(() => { destInput.focus(); destInput.select(); }, 40);
        },
      });
    }

    function itemMenu(x, y) {
      const sel = selectedEntries();
      const single = sel.length === 1 && !sel[0].dir;
      U.contextMenu(x, y, [
        { label: "View", icon: "file", disabled: !single, action: () => preview(sel[0]) },
        { label: "Extract Selected...", icon: "winrar", disabled: !sel.length, action: () => extractDialog(expandNames(sel).size ? Array.from(expandNames(sel)) : []) },
        { label: "Extract All...", icon: "winrar", action: () => extractDialog([]) },
        { separator: true },
        { label: "Delete from Archive", icon: "trash", disabled: !sel.length || !isZip(), action: deleteSelected },
        { separator: true },
        { label: "Test Archive", icon: "winrar", action: testArchive },
        { label: "Information...", icon: "info", action: showInfo },
      ]);
    }

    function menu(x, y, which) {
      if (which === "file") {
        U.contextMenu(x, y, [
          { label: "Open Archive...", icon: "winrar", action: WinRAR.pick },
          { label: "Create Archive...", icon: "newfolder", action: () => WinRAR.chooseAndCreate(dirName(archivePath)) },
          { separator: true },
          { label: "Close", icon: "file", action: () => win.close() },
        ]);
      } else if (which === "commands") {
        const sel = selectedEntries();
        U.contextMenu(x, y, [
          { label: "Add Files...", icon: "upload", disabled: !isZip(), action: addFiles },
          { label: "Extract To...", icon: "winrar", action: () => extractDialog([]) },
          { label: "Extract Selected...", icon: "winrar", disabled: !sel.length, action: () => extractDialog(Array.from(expandNames(sel))) },
          { separator: true },
          { label: "Test Archive", icon: "shield", action: testArchive },
          { label: "Delete Files", icon: "trash", disabled: !sel.length || !isZip(), action: deleteSelected },
          { separator: true },
          { label: "Refresh", icon: "refresh", action: load },
        ]);
      } else {
        U.contextMenu(x, y, [
          { label: "Help", icon: "help", action: help },
          { label: "About WinRAR...", icon: "winrar", action: WinRAR.about },
        ]);
      }
    }

    function help() {
      U.alert(
        "WinRAR Help",
        "Open an archive to see what is inside.\n\n" +
        "Double-click an entry to view it, or select entries and use\n" +
        "\u201cExtract To...\u201d to unpack them.\n\n" +
        "ZIP archives can also be changed: add files, delete entries and\n" +
        "test their integrity. TAR, TAR.GZ, TAR.BZ2, TAR.XZ, GZ, BZ2 and\n" +
        "XZ archives can be opened, tested and extracted.\n\n" +
        "RAR, 7-Zip and ISO files need an external tool first.",
        "info"
      );
    }

    win = WM.open({
      title: baseName(archivePath) + " - WinRAR",
      icon: "winrar",
      width: 720,
      height: 470,
      minWidth: 540,
      minHeight: 300,
      build(body, w) {
        const app = U.el("div", { class: "archive-app" });

        const menubar = U.el("div", { class: "archive-menubar" });
        [["file", "File"], ["commands", "Commands"], ["help", "Help"]].forEach(([key, label]) => {
          const button = U.el("button", { type: "button", text: label });
          button.addEventListener("click", (event) => {
            const rect = button.getBoundingClientRect();
            menu(rect.left, rect.bottom, key);
            event.stopPropagation();
          });
          menubar.append(button);
        });

        const toolbar = U.el("div", { class: "archive-toolbar" });
        const tool = (label, icon, handler) => {
          const button = U.el("button", { type: "button" });
          button.append(
            U.el("span", { class: "t-ico", html: Icons.get(icon, 16) }),
            U.el("span", { text: label })
          );
          button.addEventListener("click", handler);
          toolbar.append(button);
          return button;
        };
        addBtn = tool("Add", "newfolder", addFiles);
        extractBtn = tool("Extract To", "winrar", () => extractDialog([]));
        viewBtn = tool("View", "file", () => {
          const sel = selectedEntries();
          if (sel.length === 1 && !sel[0].dir) preview(sel[0]);
        });
        deleteBtn = tool("Delete", "trash", deleteSelected);
        toolbar.append(U.el("span", { class: "spacer" }));
        tool("Test", "shield", testArchive);
        tool("Info", "info", showInfo);
        tool("Refresh", "refresh", load);

        const pathRow = U.el("div", { class: "archive-path" });
        pathField = U.el("input", { type: "text", readonly: true, value: archivePath });
        formatField = U.el("span", { class: "archive-format", text: "..." });
        pathRow.append(U.el("label", { text: "Archive:" }), pathField, formatField);

        const head = U.el("div", { class: "archive-head" },
          U.el("span", { class: "a-ico" }),
          U.el("span", { class: "a-name", text: "Name" }),
          U.el("span", { class: "a-size", text: "Size" }),
          U.el("span", { class: "a-packed", text: "Packed" }),
          U.el("span", { class: "a-date", text: "Modified" })
        );

        listHost = U.el("div", { class: "archive-list", tabindex: "0" });
        listHost.addEventListener("keydown", (event) => {
          if (event.key === "a" && (event.ctrlKey || event.metaKey)) {
            event.preventDefault();
            selected = new Set(entries.map((entry) => entry.name));
            render();
          } else if (event.key === "Delete") {
            event.preventDefault();
            deleteSelected();
          } else if (event.key === "Enter") {
            const sel = selectedEntries();
            if (sel.length === 1 && !sel[0].dir) preview(sel[0]);
          }
        });

        const status = U.el("div", { class: "archive-status" });
        statusLeft = U.el("span", { text: "" });
        statusRight = U.el("span", { text: "" });
        status.append(statusLeft, U.el("span", { class: "spacer" }), statusRight);

        app.append(menubar, toolbar, pathRow, head, listHost, status);
        body.append(app);
        win = w;
        load();
      },
    });
    return win;
  };

  // ---------------------------------------------------------------- create

  WinRAR.create = function create(paths, dest) {
    const sources = (Array.isArray(paths) ? paths : [paths]).filter(Boolean);
    const destPath = dest || (sources.length ? dirName(sources[0]) : "/");
    if (!sources.length) {
      U.alert("Create Archive", "Select the files or folders you want to compress first.", "warning");
      return;
    }
    const single = sources.length === 1 ? stripArchiveName(baseName(sources[0])) : "Archive";
    const defaultName = (single || "Archive") + ".zip";

    WM.open({
      title: "Create Archive",
      icon: "winrar",
      width: 490,
      height: 320,
      resizable: false,
      maximizable: false,
      minimizable: false,
      dialog: true,
      build(body, w) {
        const nameInput = U.el("input", { type: "text", value: defaultName });
        const destInput = U.el("input", { type: "text", value: destPath });
        const formatSelect = U.el("select");
        CREATE_FORMATS.forEach((format) => {
          formatSelect.append(U.el("option", { value: format.value, text: format.label }));
        });
        const levelSelect = U.el("select");
        [["0", "Store (no compression)"], ["1", "Fastest"], ["6", "Normal"], ["9", "Best"]]
          .forEach(([value, label], index) => {
            levelSelect.append(U.el("option", { value, text: label, selected: index === 2 }));
          });

        const browse = U.el("button", { type: "button", text: "Browse..." });
        const createBtn = U.el("button", { type: "button", class: "default", text: "Create" });
        const cancel = U.el("button", { type: "button", text: "Cancel" });
        const note = U.el("div", {
          class: "muted",
          text: sources.length + " source item(s): " + sources.map(baseName).join(", "),
        });

        function applyFormat() {
          const fmt = CREATE_FORMATS.find((item) => item.value === formatSelect.value) || CREATE_FORMATS[0];
          const current = nameInput.value.trim() || "Archive";
          const bare = stripArchiveName(current) || "Archive";
          nameInput.value = bare + (fmt.value === "zip" ? ".zip"
            : fmt.value === "tar" ? ".tar"
              : "." + fmt.value);
        }

        formatSelect.addEventListener("change", applyFormat);
        browse.addEventListener("click", async () => {
          const picked = await U.nasPicker({ title: "Archive Destination", mode: "dir", start: destInput.value || "/" });
          if (picked) destInput.value = picked;
        });
        cancel.addEventListener("click", () => w.close());
        createBtn.addEventListener("click", async () => {
          const name = nameInput.value.trim();
          if (!name) {
            U.alert("Create Archive", "Type a name for the archive.", "warning");
            return;
          }
          createBtn.disabled = true;
          createBtn.textContent = "Creating...";
          try {
            const res = await API.archive.create({
              paths: sources,
              dest: destInput.value.trim() || "/",
              name,
              format: formatSelect.value,
              level: Number(levelSelect.value),
            });
            w.close();
            U.toast("Created " + res.entry.name, "success");
            if (window.Explorer) Explorer.open(dirName(res.entry.path));
            WinRAR.open(res.entry.path);
          } catch (err) {
            U.alert("Create Archive", err.message, "error");
            createBtn.disabled = false;
            createBtn.textContent = "Create";
          }
        });

        const row = (label, ...children) => U.el("div", { class: "row" },
          U.el("label", { text: label }), ...children);
        const wrap = U.el("div", { class: "archive-dialog" },
          row("Archive name:", nameInput),
          row("Destination:", destInput, browse),
          row("Format:", formatSelect),
          row("Compression:", levelSelect),
          note,
          U.el("div", { class: "archive-dialog-buttons" }, cancel, createBtn)
        );
        body.append(wrap);
        setTimeout(() => { nameInput.focus(); nameInput.select(); }, 40);
      },
    });
  };

  // ---------------------------------------------------------------- helpers

  WinRAR.extractHere = async function extractHere(path) {
    try {
      const res = await API.archive.extract({ path, dest: dirName(path) });
      U.toast("Extracted " + res.extracted + " file(s) to " + res.dest, "success");
    } catch (err) {
      U.alert("Extract Here", err.message, "error");
    }
  };

  WinRAR.extractTo = function extractTo(path) {
    WinRAR.open(path, { extract: true });
  };

  WinRAR.chooseAndCreate = async function chooseAndCreate(dest) {
    const picked = await U.nasPicker({
      title: "Choose Files or Folder to Archive",
      mode: "any",
      start: dest || "/",
    });
    if (picked) WinRAR.create([picked], dest || dirName(picked));
  };

  WinRAR.testPath = async function testPath(path) {
    U.toast("Testing " + baseName(path) + "...");
    try {
      const res = await API.archive.test({ path });
      if (res.ok) {
        U.alert("Test Archive", "No errors found.\n\n" + res.checked + " file(s) tested.", "info");
      } else {
        U.alert("Test Archive", [res.message, ""].concat(res.errors || []).join("\n"), "warning");
      }
    } catch (err) {
      U.alert("Test Archive", err.message, "error");
    }
  };

  WinRAR.pick = async function pick() {
    const path = await U.nasPicker({ title: "Open Archive", mode: "file", start: "/" });
    if (path) WinRAR.open(path);
  };

  WinRAR.about = function about() {
    WM.open({
      title: "About WinRAR",
      icon: "winrar",
      width: 440,
      height: 300,
      resizable: false,
      maximizable: false,
      minimizable: false,
      dialog: true,
      build(body, w) {
        const app = U.el("div", { class: "archive-about" });
        const top = U.el("div", { class: "archive-about-top" },
          U.el("div", { class: "archive-about-icon", html: Icons.get("winrar", 64) }),
          U.el("div", { class: "archive-about-text" },
            U.el("h2", { text: "WinRAR-compatible Archive Manager" }),
            U.el("p", { text: "Part of Win95 NAS 1.0" }),
            U.el("p", { text: "ZIP, TAR, TAR.GZ, TAR.BZ2, TAR.XZ, GZ, BZ2 and XZ." }),
            U.el("p", { class: "muted", text: "RAR, 7-Zip and ISO archives need an external tool." }),
            U.el("p", { class: "muted", text: "The WinRAR name and icon belong to win.rar GmbH. This is an independent, look-alike archive tool." })
          )
        );
        app.append(top);
        const buttons = U.el("div", { class: "archive-dialog-buttons" });
        const ok = U.el("button", { type: "button", class: "default", text: "OK" });
        ok.addEventListener("click", () => w.close());
        buttons.append(ok);
        app.append(buttons);
        body.append(app);
        setTimeout(() => ok.focus(), 40);
      },
    });
  };
})();
