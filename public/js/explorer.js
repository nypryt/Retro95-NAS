/* Win95 NAS - Explorer */
(function () {
  "use strict";

  const TYPE_LABEL = {
    folder: "File Folder", image: "Bitmap Image", text: "Text Document", audio: "Sound",
    video: "Video Clip", archive: "Compressed Archive", pdf: "PDF Document", doc: "Document", file: "File",
    word: "Microsoft Word Document", excel: "Microsoft Excel Worksheet",
    powerpoint: "Microsoft PowerPoint Presentation", code: "Source Code",
  };

  const Explorer = {};
  let clipboard = null;
  const openExplorers = new Set();

  function toolButton(icon, label, title, onClick) {
    const button = U.el("button", { type: "button", title: title || label });
    button.innerHTML = Icons.get(icon, 16) + (label ? `<span>${U.escapeHtml(label)}</span>` : "");
    button.addEventListener("click", onClick);
    return button;
  }

  function sortEntries(entries, sort) {
    const list = entries.slice();
    list.sort((a, b) => {
      if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
      let result;
      if (sort.key === "size") result = (a.size || 0) - (b.size || 0);
      else if (sort.key === "mtime") result = (a.mtime || 0) - (b.mtime || 0);
      else if (sort.key === "type") result = String(a.kind).localeCompare(String(b.kind));
      else result = a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
      return result * (sort.dir || 1);
    });
    return list;
  }

  Explorer.open = function open(startPath, options) {
    const opts = options || {};
    const state = {
      path: startPath || "/",
      history: [startPath || "/"],
      histIndex: 0,
      entries: [],
      ordered: [],
      selection: new Set(),
      anchor: null,
      view: opts.view || "icons",
      sort: { key: "name", dir: 1 },
      filter: "",
      loading: false,
    };
    const treeNodes = new Map();
    let contentHost = null;
    let statusCount = null;
    let statusInfo = null;
    let statusPath = null;
    let addressInput = null;
    let treeHost = null;
    let filterInput = null;
    let backBtn = null;
    let forwardBtn = null;
    let upBtn = null;
    let win = null;
    let storageCache = null;

    const fileInput = U.el("input", { type: "file", multiple: true, style: { display: "none" } });
    const folderInput = U.el("input", { type: "file", multiple: true, webkitdirectory: true, style: { display: "none" } });

    // ------------------------------------------------------------ navigation
    function navigate(path, addHistory) {
      if (addHistory !== false) {
        state.history = state.history.slice(0, state.histIndex + 1);
        state.history.push(path);
        state.histIndex = state.history.length - 1;
      }
      state.path = path;
      state.selection.clear();
      state.anchor = null;
      state.filter = "";
      if (filterInput) filterInput.value = "";
      refresh();
    }

    function goBack() {
      if (state.histIndex <= 0) return;
      state.histIndex -= 1;
      state.path = state.history[state.histIndex];
      state.selection.clear();
      refresh();
    }

    function goForward() {
      if (state.histIndex >= state.history.length - 1) return;
      state.histIndex += 1;
      state.path = state.history[state.histIndex];
      state.selection.clear();
      refresh();
    }

    function goUp() {
      if (state.path === "/") return;
      navigate(U.dirname(state.path));
    }

    async function refresh() {
      state.loading = true;
      try {
        const data = await API.list(state.path);
        state.path = data.path;
        state.entries = data.entries;
        if (state.path === "/") storageCache = null;
        const valid = new Set(data.entries.map((e) => e.path));
        state.selection = new Set(Array.from(state.selection).filter((p) => valid.has(p)));
        state.loading = false;
        render();
        revealTree(state.path);
      } catch (err) {
        state.loading = false;
        U.error(err);
        if (state.path !== "/") navigate("/", false);
      }
    }

    // ------------------------------------------------------------ selection
    function orderedVisible() {
      const term = state.filter.trim().toLowerCase();
      const filtered = term ? state.entries.filter((e) => e.name.toLowerCase().includes(term)) : state.entries;
      return sortEntries(filtered, state.sort);
    }

    function selectOnly(path) {
      state.selection.clear();
      if (path) state.selection.add(path);
      state.anchor = path;
      updateSelectionUI();
    }

    function toggle(path) {
      if (state.selection.has(path)) state.selection.delete(path);
      else state.selection.add(path);
      state.anchor = path;
      updateSelectionUI();
    }

    function selectRange(path) {
      const list = state.ordered.map((e) => e.path);
      const from = list.indexOf(state.anchor);
      const to = list.indexOf(path);
      if (from < 0 || to < 0) { selectOnly(path); return; }
      state.selection.clear();
      const [a, b] = from < to ? [from, to] : [to, from];
      for (let i = a; i <= b; i += 1) state.selection.add(list[i]);
      updateSelectionUI();
    }

    function updateSelectionUI() {
      if (!contentHost) return;
      U.qsa("[data-path]", contentHost).forEach((node) => {
        node.classList.toggle("selected", state.selection.has(node.dataset.path));
      });
      updateStatus();
    }

    function selectedEntries() {
      return state.entries.filter((e) => state.selection.has(e.path));
    }

    function updateStatus() {
      if (!statusCount) return;
      const selected = selectedEntries();
      statusCount.textContent = state.entries.length + " object(s)";
      const total = state.entries.reduce((sum, e) => sum + (e.size || 0), 0);
      if (selected.length) {
        const size = selected.reduce((sum, e) => sum + (e.size || 0), 0);
        statusInfo.textContent = selected.length + " selected, " + U.fmtSize(size);
      } else if (state.path === "/" && storageCache) {
        statusInfo.textContent = U.fmtSize(total) + " in this folder  \u2022  " +
          U.fmtSize(storageCache.used) + " of " + U.fmtSize(storageCache.limit) + " used (" +
          storageCache.percent + "%)  \u2022  " + U.fmtSize(storageCache.limitFree) + " free";
      } else {
        statusInfo.textContent = U.fmtSize(total);
      }
      statusPath.textContent = state.path === "/" ? "My Computer" : state.path;
    }

    function storageBanner() {
      const banner = U.el("div", { class: "storage-banner" });
      const title = U.el("div", { class: "storage-banner-title", text: "My Computer - NAS storage" });
      const barHost = U.el("div", { class: "storage-banner-bar" });
      const detail = U.el("div", { class: "storage-banner-detail", text: "Reading storage..." });
      banner.append(title, barHost, detail);
      if (storageCache) fill(storageCache);
      else {
        API.storage().then((stats) => {
          storageCache = stats;
          fill(stats);
          updateStatus();
        }).catch((err) => { detail.textContent = "Storage unavailable: " + err.message; });
      }
      function fill(stats) {
        barHost.innerHTML = "";
        barHost.append(U.bytesBar(stats.used, stats.limit));
        detail.textContent = U.fmtSize(stats.used) + " of " + U.fmtSize(stats.limit) + " used (" +
          stats.percent + "%)  \u2022  " + U.fmtSize(stats.limitFree) + " free  \u2022  " +
          stats.files + " files, " + stats.folders + " folders";
      }
      return banner;
    }

    // ------------------------------------------------------------ rendering
    function render() {
      state.ordered = orderedVisible();
      win.setTitle(state.path === "/" ? "My Computer" : "Exploring - " + U.basename(state.path));
      win.setIcon(state.path === "/" ? "computer" : "folder-open");
      if (addressInput) addressInput.value = state.path;
      if (backBtn) backBtn.disabled = state.histIndex <= 0;
      if (forwardBtn) forwardBtn.disabled = state.histIndex >= state.history.length - 1;
      if (upBtn) upBtn.disabled = state.path === "/";
      renderContent();
      updateStatus();
      highlightTree(state.path);
    }

    function renderContent() {
      contentHost.innerHTML = "";
      contentHost.scrollTop = 0;

      if (state.path === "/") contentHost.append(storageBanner());

      if (!state.ordered.length) {
        const empty = U.el("div", { class: "empty-folder", text: state.filter ? "No matching files." : "This folder is empty." });
        contentHost.append(empty);
        return;
      }

      if (state.view === "details") {
        renderDetails();
      } else {
        renderIcons();
      }
    }

    function entryIcon(entry, size) {
      if (entry.type === "file" && entry.kind === "image") {
        return `<img class="thumb" loading="lazy" src="/api/raw?path=${encodeURIComponent(entry.path)}" alt="">`;
      }
      return Icons.forEntry(entry);
    }

    function bindItem(node, entry) {
      node.dataset.path = entry.path;
      node.addEventListener("mousedown", (event) => {
        if (event.button !== 0) return;
        event.stopPropagation();
        if (event.ctrlKey) toggle(entry.path);
        else if (event.shiftKey) selectRange(entry.path);
        else if (!state.selection.has(entry.path)) selectOnly(entry.path);
        else state.anchor = entry.path;
      });
      node.addEventListener("dblclick", (event) => {
        event.preventDefault();
        event.stopPropagation();
        openEntry(entry);
      });
      node.addEventListener("contextmenu", (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (!state.selection.has(entry.path)) selectOnly(entry.path);
        showItemMenu(event.clientX, event.clientY, entry);
      });
      node.addEventListener("dragstart", (event) => {
        const paths = state.selection.has(entry.path) ? Array.from(state.selection) : [entry.path];
        if (!state.selection.has(entry.path)) selectOnly(entry.path);
        event.dataTransfer.setData("application/x-nas-paths", JSON.stringify(paths));
        event.dataTransfer.setData("text/plain", paths.join("\n"));
        event.dataTransfer.effectAllowed = "copyMove";
        node.classList.add("dragging");
      });
      node.addEventListener("dragend", () => node.classList.remove("dragging"));
      if (entry.type === "dir") {
        node.addEventListener("dragover", (event) => {
          event.preventDefault();
          event.stopPropagation();
          event.dataTransfer.dropEffect = event.ctrlKey ? "copy" : "move";
          node.classList.add("drag-over");
        });
        node.addEventListener("dragleave", () => node.classList.remove("drag-over"));
        node.addEventListener("drop", async (event) => {
          event.preventDefault();
          event.stopPropagation();
          node.classList.remove("drag-over");
          await handleDrop(event, entry.path);
        });
      }
    }

    function renderIcons() {
      const grid = U.el("div", { class: "file-grid" });
      state.ordered.forEach((entry) => {
        const item = U.el("div", { class: "file-item", draggable: "true", title: entry.name });
        item.innerHTML = `<span class="ico">${entryIcon(entry)}</span><span class="label"></span>`;
        item.querySelector(".label").textContent = entry.name;
        bindItem(item, entry);
        item.classList.toggle("selected", state.selection.has(entry.path));
        grid.append(item);
      });
      contentHost.append(grid);
    }

    function renderDetails() {
      const table = U.el("table", { class: "details-view" });
      const head = U.el("thead");
      const headRow = U.el("tr");
      const columns = [
        ["name", "Name"], ["size", "Size"], ["type", "Type"], ["mtime", "Modified"],
      ];
      columns.forEach(([key, label]) => {
        const th = U.el("th", { text: label });
        if (state.sort.key === key) th.append(U.el("span", { class: "sort-arrow", text: state.sort.dir > 0 ? "\u25B2" : "\u25BC" }));
        th.addEventListener("click", () => {
          if (state.sort.key === key) state.sort.dir *= -1;
          else { state.sort.key = key; state.sort.dir = 1; }
          render();
        });
        headRow.append(th);
      });
      head.append(headRow);
      table.append(head);

      const body = U.el("tbody");
      state.ordered.forEach((entry) => {
        const row = U.el("tr", { draggable: "true" });
        const nameCell = U.el("td");
        const nameWrap = U.el("div", { class: "cell-name" });
        nameWrap.innerHTML = entryIcon(entry);
        nameWrap.append(U.el("span", { text: entry.name }));
        nameCell.append(nameWrap);
        const sizeCell = U.el("td", { class: "num", text: entry.type === "dir" ? "" : U.fmtSize(entry.size) });
        const typeCell = U.el("td", { text: TYPE_LABEL[entry.kind] || "File" });
        const dateCell = U.el("td", { text: U.fmtDate(entry.mtime) });
        row.append(nameCell, sizeCell, typeCell, dateCell);
        bindItem(row, entry);
        row.classList.toggle("selected", state.selection.has(entry.path));
        body.append(row);
      });
      table.append(body);
      contentHost.append(table);
    }

    // ------------------------------------------------------------ tree
    function makeTreeNode(entry, depth) {
      const holder = U.el("div", { class: "tree-holder" });
      const node = U.el("div", { class: "tree-node", style: { paddingLeft: depth * 12 + "px" } });
      const twisty = U.el("span", { class: "twisty empty", text: "" });
      const ico = U.el("span", { class: "t-ico", html: entry.path === "/" ? Icons.get("computer", 16) : Icons.get("folder", 16) });
      const label = U.el("span", { class: "t-label", text: entry.name });
      node.append(twisty, ico, label);
      holder.append(node);
      const childrenHost = U.el("div", { class: "tree-children", hidden: true });
      holder.append(childrenHost);

      const info = {
        path: entry.path,
        holder,
        node,
        childrenHost,
        twisty,
        expanded: false,
        loaded: false,
        async load() {
          if (info.loaded) return;
          info.loaded = true;
          try {
            const data = await API.list(entry.path);
            const dirs = data.entries.filter((e) => e.type === "dir");
            dirs.forEach((child) => {
              const childNode = makeTreeNode({ name: child.name, path: child.path }, depth + 1);
              childrenHost.append(childNode.holder);
              treeNodes.set(child.path, childNode);
            });
            twisty.classList.toggle("empty", dirs.length === 0);
            if (dirs.length) twisty.textContent = "+";
          } catch (err) {
            twisty.classList.add("empty");
          }
        },
        async expand() {
          await info.load();
          if (!childrenHost.children.length) return;
          info.expanded = true;
          childrenHost.hidden = false;
          twisty.textContent = "\u2212";
        },
        collapse() {
          info.expanded = false;
          childrenHost.hidden = true;
          if (childrenHost.children.length) twisty.textContent = "+";
        },
      };

      twisty.addEventListener("click", (event) => {
        event.stopPropagation();
        if (info.expanded) info.collapse();
        else info.expand();
      });
      node.addEventListener("click", () => navigate(entry.path));
      return info;
    }

    function highlightTree(path) {
      treeNodes.forEach((node) => node.node.classList.remove("selected"));
      const node = treeNodes.get(path);
      if (node) node.node.classList.add("selected");
    }

    async function revealTree(path) {
      if (path === "/") { highlightTree(path); return; }
      const parts = path.split("/").filter(Boolean);
      let acc = "";
      for (const part of parts) {
        acc += "/" + part;
        const node = treeNodes.get(acc);
        if (!node) break;
        await node.expand();
      }
      highlightTree(path);
    }

    // ------------------------------------------------------------ menus
    function showBackgroundMenu(x, y) {
      U.contextMenu(x, y, [
        { label: "View", submenu: [
          { label: "Large Icons", checked: state.view === "icons", action: () => { state.view = "icons"; render(); } },
          { label: "Details", checked: state.view === "details", action: () => { state.view = "details"; render(); } },
        ] },
        { label: "Arrange By", submenu: [
          { label: "Name", checked: state.sort.key === "name", action: () => { state.sort = { key: "name", dir: 1 }; render(); } },
          { label: "Size", checked: state.sort.key === "size", action: () => { state.sort = { key: "size", dir: 1 }; render(); } },
          { label: "Type", checked: state.sort.key === "type", action: () => { state.sort = { key: "type", dir: 1 }; render(); } },
          { label: "Date Modified", checked: state.sort.key === "mtime", action: () => { state.sort = { key: "mtime", dir: 1 }; render(); } },
        ] },
        { label: "Refresh", shortcut: "F5", action: refresh },
        { separator: true },
        { label: "New Folder", icon: "newfolder", action: newFolder },
        { label: "New Text Document", icon: "text", action: newTextFile },
        { label: "New Word Document", icon: "word", action: () => Office.createAt(state.path, "word") },
        { label: "New Excel Worksheet", icon: "excel", action: () => Office.createAt(state.path, "excel") },
        { label: "New PowerPoint Presentation", icon: "powerpoint", action: () => Office.createAt(state.path, "powerpoint") },
        { separator: true },
        { label: "Upload Files...", icon: "upload", action: () => fileInput.click() },
        { label: "Upload Folder...", icon: "folderUp", action: () => folderInput.click() },
        { label: "Paste", icon: "paste", disabled: !clipboard, action: pasteClipboard },
        { separator: true },
        { label: "Properties", icon: "settings", action: () => Apps.properties(state.path) },
      ]);
    }

    function showItemMenu(x, y, entry) {
      const selected = selectedEntries();
      const multi = selected.length > 1;
      const items = [
        { label: multi ? "Open" : (entry.type === "dir" ? "Open" : "Open"), icon: entry.type === "dir" ? "folder-open" : "file", action: () => openEntry(entry) },
      ];
      if (!multi && entry.type === "file" && (entry.kind === "text" || entry.kind === "code")) {
        items.push({ label: "Open in Notepad", icon: "notepad", action: () => Apps.notepad(entry.path) });
      }
      if (!multi && entry.type === "file" && entry.kind === "image") {
        items.push({ label: "Edit in Paint", icon: "paint", action: () => Apps.paint(entry.path) });
      }
      if (!multi && entry.type === "file" && entry.kind === "archive") {
        const stem = entry.name.replace(/\.[^.]+$/, "");
        items.push({ separator: true });
        items.push({ label: "Extract Here", icon: "winrar", action: () => WinRAR.extractHere(entry.path) });
        items.push({ label: "Extract to " + stem + "\\", icon: "winrar", action: () => WinRAR.extractTo(entry.path) });
        items.push({ label: "Test Archive", icon: "shield", action: () => WinRAR.testPath(entry.path) });
        items.push({ label: "Add Files to Archive...", icon: "upload", action: () => WinRAR.open(entry.path, { add: true }) });
      } else {
        items.push({ separator: true });
        items.push({
          label: "Add to Archive...",
          icon: "winrar",
          action: () => WinRAR.create(selected.map((item) => item.path), state.path),
        });
      }
      items.push({ separator: true });
      items.push({ label: multi ? "Download as ZIP" : "Download", icon: "download", action: () => downloadSelection() });
      items.push({ separator: true });
      items.push({ label: "Cut", icon: "cut", shortcut: "Ctrl+X", action: () => { clipboard = { mode: "move", paths: Array.from(state.selection) }; U.toast("Cut " + state.selection.size + " item(s)"); } });
      items.push({ label: "Copy", icon: "copy", shortcut: "Ctrl+C", action: () => { clipboard = { mode: "copy", paths: Array.from(state.selection) }; U.toast("Copied " + state.selection.size + " item(s)"); } });
      items.push({ label: "Paste", icon: "paste", shortcut: "Ctrl+V", disabled: !clipboard, action: pasteClipboard });
      items.push({ separator: true });
      items.push({ label: "Rename", icon: "text", shortcut: "F2", disabled: multi, action: () => renameEntry(entry) });
      items.push({ label: "Delete", icon: "trash", shortcut: "Del", action: deleteSelection });
      items.push({ separator: true });
      items.push({ label: "Send to Docker container...", icon: "docker", action: () => { if (window.Docker) Docker.sendToContainer(Array.from(state.selection)); } });
      items.push({ label: "Properties", icon: "settings", action: () => Apps.properties(multi ? state.path : entry.path) });
      U.contextMenu(x, y, items);
    }

    // ------------------------------------------------------------ actions
    function openEntry(entry) {
      if (entry.type === "dir") navigate(entry.path);
      else Apps.openFile(entry);
    }

    function downloadSelection() {
      const selected = selectedEntries();
      if (!selected.length) return;
      if (selected.length === 1) API.download(selected[0].path, selected[0].name);
      else API.download(selected.map((e) => e.path), "selection");
    }

    async function newFolder() {
      const name = await U.prompt("New Folder", "Type a name for the new folder:", "New Folder");
      if (!name) return;
      try {
        const result = await API.mkdir(state.path, name);
        await refresh();
        selectOnly(result.entry.path);
      } catch (err) { U.alert("Error Creating Folder", err.message, "error"); }
    }

    async function newTextFile() {
      const name = await U.prompt("New Text Document", "Type a name for the new document:", "New Text Document.txt");
      if (!name) return;
      try {
        const result = await API.newfile(state.path, name, "");
        await refresh();
        selectOnly(result.entry.path);
        Apps.notepad(result.entry.path);
      } catch (err) { U.alert("Error Creating File", err.message, "error"); }
    }

    async function renameEntry(entry) {
      const target = entry || selectedEntries()[0];
      if (!target) return;
      const name = await U.prompt("Rename", "New name for \u201C" + target.name + "\u201D:", target.name);
      if (!name || name === target.name) return;
      try {
        const result = await API.rename(target.path, name);
        state.selection.clear();
        state.selection.add(result.entry.path);
        await refresh();
      } catch (err) { U.alert("Rename Error", err.message, "error"); }
    }

    async function deleteSelection() {
      const selected = selectedEntries();
      if (!selected.length) return;
      const message = selected.length === 1
        ? "Are you sure you want to send \u201C" + selected[0].name + "\u201D to the Recycle Bin?"
        : "Send these " + selected.length + " items to the Recycle Bin?";
      if (!await U.confirm("Confirm File Delete", message, "warning")) return;
      try {
        await API.remove(selected.map((e) => e.path));
        state.selection.clear();
        await refresh();
        U.toast(selected.length + " item(s) moved to the Recycle Bin");
      } catch (err) { U.alert("Delete Error", err.message, "error"); }
    }

    async function pasteClipboard() {
      if (!clipboard) return;
      try {
        const result = await API.move(clipboard.paths, state.path, clipboard.mode === "copy" ? "copy" : "move");
        if (result.errors && result.errors.length) U.toast(result.errors[0], "warning", 6000);
        clipboard = null;
        await refresh();
      } catch (err) { U.alert("Paste Error", err.message, "error"); }
    }

    async function moveTo(paths, dest, op) {
      if (!paths.length) return;
      try {
        const result = await API.move(paths, dest, op || "move");
        if (result.errors && result.errors.length) U.toast(result.errors[0], "warning", 6000);
        await refresh();
      } catch (err) { U.alert(op === "copy" ? "Copy Error" : "Move Error", err.message, "error"); }
    }

    // ------------------------------------------------------------ uploads
    async function uploadItems(files, dirs, destPath) {
      const dest = destPath || state.path;
      if (!files.length && !dirs.length) return;
      const progress = U.progressDialog("Copying...", "Preparing upload...");
      const controller = new AbortController();
      progress.setCancel(() => controller.abort());
      try {
        await API.upload(dest, files, dirs, (fraction, loaded, total) => {
          progress.set(fraction, U.fmtSize(loaded) + " of " + U.fmtSize(total) + "  (" + files.length + " file(s))");
        }, controller.signal);
        progress.set(1, "Done");
        setTimeout(() => progress.close(), 260);
        await refresh();
        if (files.length) U.toast("Uploaded " + files.length + " file(s) to " + (dest === "/" ? "My Computer" : dest), "success");
        else U.toast("Created folder(s)", "success");
      } catch (err) {
        progress.close();
        if (/cancel/i.test(err.message)) U.toast("Upload cancelled", "warning");
        else U.alert("Copy Error", err.message, "error");
      }
    }

    function filesFromInput(input) {
      const files = [];
      Array.from(input.files || []).forEach((file) => {
        files.push({ file, rel: file.webkitRelativePath || file.name });
      });
      return files;
    }

    async function readEntryTree(entry, base, files, dirs) {
      if (entry.isFile) {
        const file = await new Promise((resolve, reject) => entry.file(resolve, reject));
        files.push({ file, rel: base + entry.name });
      } else if (entry.isDirectory) {
        dirs.push(base + entry.name);
        const reader = entry.createReader();
        while (true) {
          const batch = await new Promise((resolve, reject) => reader.readEntries(resolve, reject));
          if (!batch.length) break;
          for (const child of batch) await readEntryTree(child, base + entry.name + "/", files, dirs);
        }
      }
    }

    async function uploadDataTransfer(dataTransfer, destPath) {
      const files = [];
      const dirs = [];
      const entries = Array.from(dataTransfer.items || [])
        .map((item) => (item.webkitGetAsEntry ? item.webkitGetAsEntry() : null))
        .filter(Boolean);
      if (entries.length) {
        for (const entry of entries) await readEntryTree(entry, "", files, dirs);
      } else {
        Array.from(dataTransfer.files || []).forEach((file) => files.push({ file, rel: file.name }));
      }
      await uploadItems(files, dirs, destPath);
    }

    async function handleDrop(event, destPath) {
      const hasFiles = event.dataTransfer.files && event.dataTransfer.files.length;
      if (hasFiles) {
        await uploadDataTransfer(event.dataTransfer, destPath);
        return;
      }
      const raw = event.dataTransfer.getData("application/x-nas-paths");
      if (raw) {
        try {
          const paths = JSON.parse(raw);
          if (paths.length) await moveTo(paths, destPath || state.path, event.ctrlKey ? "copy" : "move");
        } catch (_err) { /* ignore */ }
      }
    }

    // ------------------------------------------------------------ window
    win = WM.open({
      title: startPath === "/" ? "My Computer" : "Exploring - " + U.basename(startPath || "/"),
      icon: startPath === "/" ? "computer" : "folder-open",
      pinId: startPath === "/" ? "computer" : (startPath === "/Documents" ? "documents" : (startPath === "/Pictures" ? "pictures" : undefined)),
      width: 720,
      height: 480,
      minWidth: 420,
      minHeight: 280,
      build(body, w) {
        const app = U.el("div", { class: "explorer" });

        // toolbar
        const toolbar = U.el("div", { class: "exp-toolbar" });
        backBtn = toolButton("back", "", "Back", goBack);
        backBtn.classList.add("icon-only");
        forwardBtn = toolButton("forward", "", "Forward", goForward);
        forwardBtn.classList.add("icon-only");
        upBtn = toolButton("up", "", "Up One Level", goUp);
        upBtn.classList.add("icon-only");
        const newFolderBtn = toolButton("newfolder", "New", "New Folder", newFolder);
        const uploadBtn = toolButton("upload", "Upload", "Upload Files", () => fileInput.click());
        const uploadFolderBtn = toolButton("folderUp", "", "Upload Folder", () => folderInput.click());
        uploadFolderBtn.classList.add("icon-only");
        const viewBtn = toolButton("display", "", "Views", (event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          U.contextMenu(rect.left, rect.bottom, [
            { label: "Large Icons", checked: state.view === "icons", action: () => { state.view = "icons"; render(); } },
            { label: "Details", checked: state.view === "details", action: () => { state.view = "details"; render(); } },
          ]);
        });
        viewBtn.classList.add("icon-only");
        const deleteBtn = toolButton("trash", "", "Delete", deleteSelection);
        deleteBtn.classList.add("icon-only");

        filterInput = U.el("input", { type: "text", placeholder: "Find in this folder...", style: { width: "130px", marginLeft: "auto" } });
        filterInput.addEventListener("input", () => { state.filter = filterInput.value; render(); });

        toolbar.append(backBtn, forwardBtn, upBtn, U.el("span", { class: "sep" }), newFolderBtn, uploadBtn, uploadFolderBtn, U.el("span", { class: "sep" }), viewBtn, deleteBtn, filterInput);

        // address bar
        const addressBar = U.el("div", { class: "exp-address" });
        addressBar.append(U.el("span", { class: "addr-label", text: "Address" }));
        const addrWrap = U.el("div", { class: "addr-field" });
        addressInput = U.el("input", { type: "text", spellcheck: "false" });
        const goBtn = U.el("button", { type: "button", class: "go-btn", text: "\u2192" });
        addrWrap.append(addressInput, goBtn);
        addressBar.append(addrWrap);
        addressInput.addEventListener("keydown", (event) => {
          if (event.key === "Enter") navigate(addressInput.value.trim() || "/");
        });
        goBtn.addEventListener("click", () => navigate(addressInput.value.trim() || "/"));

        // main
        const main = U.el("div", { class: "exp-main" });
        treeHost = U.el("div", { class: "exp-tree" });
        contentHost = U.el("div", { class: "exp-content", tabindex: "0" });
        main.append(treeHost, contentHost);

        // status
        const status = U.el("div", { class: "exp-status" });
        statusCount = U.el("div", { class: "status-panel", text: "0 object(s)", style: { width: "120px" } });
        statusInfo = U.el("div", { class: "status-panel grow", text: "" });
        statusPath = U.el("div", { class: "status-panel", text: "/", style: { width: "190px" } });
        status.append(statusCount, statusInfo, statusPath);

        app.append(toolbar, addressBar, main, status);
        body.append(app, fileInput, folderInput);

        // content interactions
        contentHost.addEventListener("mousedown", (event) => {
          if (event.button !== 0) return;
          if (event.target.closest(".file-item, .details-view")) return;
          if (!event.ctrlKey) selectOnly(null);
          const items = U.qsa(".file-item, .details-view tbody tr", contentHost);
          U.marquee({
            container: contentHost,
            event,
            items,
            onSelect(selected, additive) {
              if (!additive) state.selection.clear();
              selected.forEach((node) => state.selection.add(node.dataset.path));
              state.anchor = selected.length ? selected[selected.length - 1].dataset.path : state.anchor;
              updateSelectionUI();
            },
          });
        });
        contentHost.addEventListener("contextmenu", (event) => {
          if (event.target.closest(".file-item, .details-view tbody tr")) return;
          event.preventDefault();
          showBackgroundMenu(event.clientX, event.clientY);
        });
        contentHost.addEventListener("dragover", (event) => {
          event.preventDefault();
          event.dataTransfer.dropEffect = event.ctrlKey ? "copy" : "move";
          contentHost.classList.add("drop-target");
        });
        contentHost.addEventListener("dragleave", (event) => {
          if (event.target === contentHost) contentHost.classList.remove("drop-target");
        });
        contentHost.addEventListener("drop", async (event) => {
          event.preventDefault();
          contentHost.classList.remove("drop-target");
          await handleDrop(event, state.path);
        });

        // tree root
        const rootNode = makeTreeNode({ name: "My Computer", path: "/" }, 0);
        treeHost.append(rootNode.holder);
        treeNodes.set("/", rootNode);
        rootNode.expand();

        fileInput.addEventListener("change", async () => {
          const files = filesFromInput(fileInput);
          fileInput.value = "";
          await uploadItems(files, []);
        });
        folderInput.addEventListener("change", async () => {
          const files = filesFromInput(folderInput);
          folderInput.value = "";
          await uploadItems(files, []);
        });

        U.menuBar(w, [
          { label: "File", items: [
            { label: "Open", action: () => { const e = selectedEntries()[0]; if (e) openEntry(e); } },
            { separator: true },
            { label: "New Folder", icon: "newfolder", action: newFolder },
            { label: "New Text Document", icon: "text", action: newTextFile },
            { label: "New Word Document", icon: "word", action: () => Office.createAt(state.path, "word") },
            { label: "New Excel Worksheet", icon: "excel", action: () => Office.createAt(state.path, "excel") },
            { label: "New PowerPoint Presentation", icon: "powerpoint", action: () => Office.createAt(state.path, "powerpoint") },
            { separator: true },
            { label: "Upload Files...", icon: "upload", action: () => fileInput.click() },
            { label: "Upload Folder...", icon: "folderUp", action: () => folderInput.click() },
            { separator: true },
            { label: "Download", icon: "download", action: downloadSelection },
            { label: "Delete", icon: "trash", action: deleteSelection },
            { label: "Rename", icon: "text", action: () => renameEntry(selectedEntries()[0]) },
            { separator: true },
            { label: "Close", action: () => w.close() },
          ] },
          { label: "Edit", items: [
            { label: "Cut", icon: "cut", shortcut: "Ctrl+X", action: () => { clipboard = { mode: "move", paths: Array.from(state.selection) }; } },
            { label: "Copy", icon: "copy", shortcut: "Ctrl+C", action: () => { clipboard = { mode: "copy", paths: Array.from(state.selection) }; } },
            { label: "Paste", icon: "paste", shortcut: "Ctrl+V", disabled: !clipboard, action: pasteClipboard },
            { separator: true },
            { label: "Select All", shortcut: "Ctrl+A", action: () => { state.selection = new Set(state.ordered.map((e) => e.path)); updateSelectionUI(); } },
            { label: "Invert Selection", action: () => {
              state.selection = new Set(state.ordered.filter((e) => !state.selection.has(e.path)).map((e) => e.path));
              updateSelectionUI();
            } },
          ] },
          { label: "View", items: [
            { label: "Large Icons", checked: state.view === "icons", action: () => { state.view = "icons"; render(); } },
            { label: "Details", checked: state.view === "details", action: () => { state.view = "details"; render(); } },
            { separator: true },
            { label: "Refresh", shortcut: "F5", action: refresh },
            { separator: true },
            { label: "Arrange by Name", action: () => { state.sort = { key: "name", dir: 1 }; render(); } },
            { label: "Arrange by Size", action: () => { state.sort = { key: "size", dir: 1 }; render(); } },
            { label: "Arrange by Type", action: () => { state.sort = { key: "type", dir: 1 }; render(); } },
            { label: "Arrange by Date", action: () => { state.sort = { key: "mtime", dir: 1 }; render(); } },
          ] },
          { label: "Go", items: [
            { label: "Back", shortcut: "Backspace", action: goBack },
            { label: "Forward", action: goForward },
            { label: "Up One Level", action: goUp },
            { separator: true },
            { label: "My Computer", icon: "computer", action: () => navigate("/") },
            { label: "Desktop", icon: "folder", action: () => navigate("/Desktop") },
            { label: "Documents", icon: "folder", action: () => navigate("/Documents") },
            { label: "Pictures", icon: "folder", action: () => navigate("/Pictures") },
            { label: "Docker Backups", icon: "docker", action: () => navigate("/Docker Backups") },
          ] },
          { label: "Help", items: [
            { label: "About Win95 NAS", action: () => Apps.about() },
            { label: "Help Topics", action: () => Apps.help() },
          ] },
        ]);

        // keyboard
        w.onKey = (event) => {
          const tag = (event.target.tagName || "").toLowerCase();
          if (tag === "input" || tag === "textarea") return;
          if (event.key === "Delete") { event.preventDefault(); deleteSelection(); }
          else if (event.key === "F2") { event.preventDefault(); renameEntry(selectedEntries()[0]); }
          else if (event.key === "F5") { event.preventDefault(); refresh(); }
          else if (event.key === "Backspace") { event.preventDefault(); goUp(); }
          else if (event.key === "Enter") { const e = selectedEntries()[0]; if (e) openEntry(e); }
          else if (event.key === "Escape") { selectOnly(null); }
          else if (event.ctrlKey && event.key.toLowerCase() === "a") { event.preventDefault(); state.selection = new Set(state.ordered.map((e) => e.path)); updateSelectionUI(); }
          else if (event.ctrlKey && event.key.toLowerCase() === "c") { clipboard = { mode: "copy", paths: Array.from(state.selection) }; }
          else if (event.ctrlKey && event.key.toLowerCase() === "x") { clipboard = { mode: "move", paths: Array.from(state.selection) }; }
          else if (event.ctrlKey && event.key.toLowerCase() === "v") { pasteClipboard(); }
        };
      },
      onClose() { openExplorers.delete(win); },
    });

    win.refresh = refresh;
    win.navigate = navigate;
    win.state = state;
    openExplorers.add(win);
    refresh();
    return win;
  };

  Explorer.clipboard = () => clipboard;
  Explorer.setClipboard = (value) => { clipboard = value; };

  window.addEventListener("nas:files-changed", () => {
    openExplorers.forEach((win) => {
      if (win && !win.closed && typeof win.refresh === "function") win.refresh();
    });
  });

  window.Explorer = Explorer;
})();
