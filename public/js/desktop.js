/* Win95 NAS - desktop icons, real /Desktop files, shortcuts and wallpaper surface */
(function () {
  "use strict";

  const host = document.getElementById("desktop-icons");
  const desktop = document.getElementById("desktop");
  const POS_KEY = "nas.desktop.positions";
  const LABEL_KEY = "nas.desktop.labels";

  let positions = {};
  let labels = {};
  let entries = [];
  let lastSignature = "";
  let selected = new Set();
  let iconSize = 48;
  let snap = true;
  let built = false;
  let lastScale = 1;
  let layout = {};

  try { positions = JSON.parse(localStorage.getItem(POS_KEY) || "{}") || {}; } catch (_e) { positions = {}; }
  try { labels = JSON.parse(localStorage.getItem(LABEL_KEY) || "{}") || {}; } catch (_e) { labels = {}; }

  const SHORTCUTS = [
    {
      id: "computer", label: "My Computer", icon: "computer",
      open: () => Explorer.open("/"),
    },
    {
      id: "recycle", label: "Recycle Bin", icon: "recycle",
      open: () => Apps.recycle(),
    },
    {
      id: "documents", label: "My Documents", icon: "folder",
      open: () => Explorer.open("/Documents"),
    },
    {
      id: "pictures", label: "My Pictures", icon: "image",
      open: () => Explorer.open("/Pictures"),
    },
    {
      id: "docker", label: "Docker Manager", icon: "docker",
      open: () => Docker.open(),
    },
    {
      id: "tailscale", label: "Tailscale", icon: "tailscale",
      open: () => Tailscale.open(),
    },
    {
      id: "cmd", label: "Command Prompt", icon: "cmd",
      open: () => Apps.commandPrompt(),
    },
    {
      id: "control", label: "Control Panel", icon: "settings",
      open: () => Settings.open(),
    },
    {
      id: "notepad", label: "Notepad", icon: "notepad",
      open: () => Apps.notepad(),
    },
    {
      id: "clock", label: "Clock", icon: "clock",
      open: () => Apps.clock(),
    },
    {
      id: "mines", label: "Minesweeper", icon: "mine",
      open: () => Apps.minesweeper("beginner"),
    },
    {
      id: "help", label: "Help", icon: "help",
      open: () => Apps.help(),
    },
  ];

  function savePositions() {
    try { localStorage.setItem(POS_KEY, JSON.stringify(positions)); } catch (_e) { /* ignore */ }
  }

  function saveLabels() {
    try { localStorage.setItem(LABEL_KEY, JSON.stringify(labels)); } catch (_e) { /* ignore */ }
  }

  function labelFor(shortcut) {
    return labels[shortcut.id] || shortcut.label;
  }

  function entryId(entry) {
    return "file:" + entry.path;
  }

  function entryIcon(entry) {
    if (entry.type === "dir") return "folder";
    return Icons.has(entry.kind) ? entry.kind : "file";
  }

  function allItems() {
    return [
      ...SHORTCUTS.map((shortcut) => ({ ...shortcut, kind: "shortcut" })),
      ...entries.map((entry) => ({
        id: entryId(entry),
        kind: "entry",
        entry,
        label: entry.name,
        icon: entryIcon(entry),
      })),
    ];
  }

  const GRID_PAD = 8;

  // The tile grid follows the chosen icon size, so small icons pack tighter.
  function cellSize() {
    return {
      w: Math.max(88, iconSize + 28),
      h: Math.max(76, iconSize + 44),
    };
  }

  function cellKey(pos) {
    const cell = cellSize();
    return Math.round((pos.x - GRID_PAD) / cell.w) + ":" + Math.round((pos.y - GRID_PAD) / cell.h);
  }

  function columnCount() {
    const b = host.getBoundingClientRect();
    const z = U.scale();
    const cell = cellSize();
    return Math.max(1, Math.floor((b.height / z - GRID_PAD * 2) / cell.h));
  }

  function defaultPosition(index) {
    const cell = cellSize();
    const perColumn = columnCount();
    const col = Math.floor(index / perColumn);
    const row = index % perColumn;
    return { x: GRID_PAD + col * cell.w, y: GRID_PAD + row * cell.h };
  }

  // First free tile, scanning column by column from `index`.
  function freePosition(index, used) {
    const cell = cellSize();
    const perColumn = columnCount();
    for (let i = Math.max(0, index); i < index + 800; i += 1) {
      const col = Math.floor(i / perColumn);
      const row = i % perColumn;
      if (!used.has(col + ":" + row)) {
        return { x: GRID_PAD + col * cell.w, y: GRID_PAD + row * cell.h };
      }
    }
    return defaultPosition(index);
  }

  function clampPosition(x, y) {
    const b = host.getBoundingClientRect();
    const z = U.scale();
    const cell = cellSize();
    return {
      x: Math.max(2, Math.min(x, Math.max(2, b.width / z - cell.w - 2))),
      y: Math.max(2, Math.min(y, Math.max(2, b.height / z - cell.h + 4))),
    };
  }

  // Find the nearest free tile to (x, y) so icons never stack on each other.
  function nearestFree(x, y, exceptId, usedSet) {
    const used = usedSet || new Set();
    if (!usedSet) {
      Object.keys(layout).forEach((id) => {
        if (id !== exceptId && layout[id]) used.add(cellKey(layout[id]));
      });
    }
    const cell = cellSize();
    const b = host.getBoundingClientRect();
    const z = U.scale();
    const maxX = Math.max(2, b.width / z - cell.w - 2);
    const maxY = Math.max(2, b.height / z - cell.h + 4);
    const maxCol = Math.max(0, Math.floor((maxX - GRID_PAD) / cell.w));
    const maxRow = Math.max(0, Math.floor((maxY - GRID_PAD) / cell.h));
    const posAt = (col, row) => ({ x: GRID_PAD + col * cell.w, y: GRID_PAD + row * cell.h });
    const base = clampPosition(x, y);
    const baseCol = U.clamp(Math.round((base.x - GRID_PAD) / cell.w), 0, maxCol);
    const baseRow = U.clamp(Math.round((base.y - GRID_PAD) / cell.h), 0, maxRow);
    if (!used.has(baseCol + ":" + baseRow)) return posAt(baseCol, baseRow);
    for (let radius = 1; radius < 80; radius += 1) {
      let best = null;
      let bestDist = Infinity;
      for (let dc = -radius; dc <= radius; dc += 1) {
        for (let dr = -radius; dr <= radius; dr += 1) {
          if (Math.max(Math.abs(dc), Math.abs(dr)) !== radius) continue;
          const col = baseCol + dc;
          const row = baseRow + dr;
          // Skip anything off the visible grid instead of clamping it into a
          // corner (which used to fake a "free" cell at 8,2).
          if (col < 0 || row < 0 || col > maxCol || row > maxRow) continue;
          if (used.has(col + ":" + row)) continue;
          const pos = posAt(col, row);
          const dist = (pos.x - base.x) ** 2 + (pos.y - base.y) ** 2;
          if (dist < bestDist) { bestDist = dist; best = pos; }
        }
      }
      if (best) return best;
    }
    return base;
  }

  function snapPosition(x, y) {
    if (!snap) return { x, y };
    const cell = cellSize();
    return {
      x: GRID_PAD + Math.round((x - GRID_PAD) / cell.w) * cell.w,
      y: GRID_PAD + Math.round((y - GRID_PAD) / cell.h) * cell.h,
    };
  }

  function updateSelection() {
    if (!host) return;
    Array.from(host.children).forEach((node) => {
      node.classList.toggle("selected", selected.has(node.dataset.id));
    });
  }

  function selectOnly(id) {
    selected.clear();
    if (id) selected.add(id);
    updateSelection();
  }

  function updateIconScale() {
    if (!host) return;
    Array.from(host.children).forEach((node) => {
      const ico = node.querySelector(".ico");
      if (ico) {
        ico.style.width = iconSize + "px";
        ico.style.height = iconSize + "px";
        ico.innerHTML = Icons.get(node.dataset.icon, iconSize);
      }
    });
  }

  function beginShortcutRename(shortcut, node) {
    const label = node.querySelector(".label");
    if (!label || node.querySelector(".rename-input")) return;
    const input = U.el("input", { type: "text", class: "rename-input", value: labelFor(shortcut) });
    label.replaceWith(input);
    input.focus();
    input.select();
    let done = false;
    const finish = (commit) => {
      if (done) return;
      done = true;
      const value = input.value.trim();
      if (commit && value) {
        labels[shortcut.id] = value;
        saveLabels();
      }
      const span = U.el("span", { class: "label", text: labelFor(shortcut) });
      input.replaceWith(span);
    };
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") { event.preventDefault(); finish(true); }
      else if (event.key === "Escape") { event.preventDefault(); finish(false); }
    });
    input.addEventListener("blur", () => finish(true));
    input.addEventListener("mousedown", (event) => event.stopPropagation());
    input.addEventListener("dblclick", (event) => event.stopPropagation());
  }

  async function renameEntry(entry) {
    const name = await U.prompt("Rename", "New name for \u201C" + entry.name + "\u201D:", entry.name);
    if (!name || name === entry.name) return;
    try {
      const result = await API.rename(entry.path, name);
      const oldId = entryId(entry);
      const newId = "file:" + result.entry.path;
      if (positions[oldId]) {
        positions[newId] = positions[oldId];
        delete positions[oldId];
        savePositions();
      }
      await refresh();
    } catch (err) { U.alert("Rename Error", err.message, "error"); }
  }

  async function deleteEntry(entry) {
    const ok = await U.confirm(
      "Confirm File Delete",
      "Send \u201C" + entry.name + "\u201D to the Recycle Bin?",
      "warning"
    );
    if (!ok) return;
    try {
      await API.remove([entry.path]);
      U.toast("Moved " + entry.name + " to the Recycle Bin");
      await refresh();
    } catch (err) { U.alert("Delete Error", err.message, "error"); }
  }

  function openItem(item) {
    if (item.kind === "shortcut") {
      item.open();
      return;
    }
    if (item.entry.type === "dir") Explorer.open(item.entry.path);
    else Apps.openFile(item.entry);
  }

  function entryMenu(item, node, event) {
    const entry = item.entry;
    const items = [
      { label: "Open", icon: item.icon, action: () => openItem(item) },
      { label: "Open containing folder", icon: "folder", action: () => Explorer.open(U.dirname(entry.path)) },
      { separator: true },
    ];
    if (entry.type === "file") {
      items.push({ label: "Download", icon: "download", action: () => API.download(entry.path, entry.name) });
    }
    items.push(
      { label: "Rename", icon: "text", action: () => renameEntry(entry) },
      { label: "Delete", icon: "trash", action: () => deleteEntry(entry) },
      { separator: true }
    );
    if (window.Docker && Docker.sendToContainer) {
      items.push({
        label: "Send to Docker container...",
        icon: "docker",
        action: () => Docker.sendToContainer([entry.path]),
      });
      items.push({ separator: true });
    }
    items.push({ label: "Properties", icon: "settings", action: () => Apps.properties(entry.path) });
    U.contextMenu(event.clientX, event.clientY, items);
  }

  function shortcutMenu(item, node, event) {
    const items = [
      { label: "Open", icon: item.icon, action: () => item.open() },
      { separator: true },
      { label: "Rename", icon: "text", action: () => beginShortcutRename(item, node) },
      { label: "Reset icon position", action: () => {
        delete positions[item.id];
        savePositions();
        build();
      } },
    ];
    if (window.Taskbar && window.Taskbar.apps && window.Taskbar.apps[item.id]) {
      items.push({ separator: true }, {
        label: window.Taskbar.isPinned(item.id) ? "Unpin from taskbar" : "Pin to taskbar",
        action: () => window.Taskbar.togglePin(item.id),
      });
    }
    items.push({ separator: true }, { label: "Properties", icon: "settings", action: () => shortcutProperties(item) });
    U.contextMenu(event.clientX, event.clientY, items);
  }

  function buildNode(item, pos) {
    const node = U.el("div", {
      class: "desk-icon",
      draggable: "false",
      dataset: { id: item.id, icon: item.icon, kind: item.kind },
      title: item.kind === "entry" ? item.entry.path : labelFor(item),
      style: { left: pos.x + "px", top: pos.y + "px" },
    });
    const cell = cellSize();
    node.style.width = (cell.w - 6) + "px";
    const ico = U.el("div", { class: "ico", html: Icons.get(item.icon, iconSize) });
    ico.style.width = iconSize + "px";
    ico.style.height = iconSize + "px";
    const label = U.el("div", {
      class: "label",
      text: item.kind === "shortcut" ? labelFor(item) : item.label,
    });
    label.style.maxWidth = (cell.w - 8) + "px";
    node.append(ico, label);

    node.addEventListener("mousedown", (event) => {
      if (event.button !== 0) return;
      event.stopPropagation();
      if (event.ctrlKey) {
        if (selected.has(item.id)) selected.delete(item.id);
        else selected.add(item.id);
      } else if (!selected.has(item.id)) {
        selectOnly(item.id);
      }
      updateSelection();
      startDrag(event, item, node);
    });

    node.addEventListener("dblclick", (event) => {
      event.preventDefault();
      event.stopPropagation();
      try { openItem(item); } catch (err) { U.error(err); }
    });

    node.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (!selected.has(item.id)) selectOnly(item.id);
      updateSelection();
      if (item.kind === "entry") entryMenu(item, node, event);
      else shortcutMenu(item, node, event);
    });

    if (item.kind === "shortcut" && item.id === "recycle") {
      const highlight = () => node.classList.add("trash-target");
      const clear = () => node.classList.remove("trash-target");
      node.addEventListener("dragenter", (event) => {
        if (!event.dataTransfer) return;
        event.preventDefault();
        highlight();
      });
      node.addEventListener("dragover", (event) => {
        // Always accept the drag so the cursor shows "move" and the bin lights up.
        event.preventDefault();
        event.stopPropagation();
        if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
        highlight();
      });
      node.addEventListener("dragleave", (event) => {
        if (event.target === node || !node.contains(event.relatedTarget)) clear();
      });
      node.addEventListener("drop", (event) => {
        event.preventDefault();
        event.stopPropagation();
        clear();
        const dt = event.dataTransfer;
        if (!dt) return;
        let paths = [];
        const raw = dt.getData("application/x-nas-paths");
        if (raw) {
          try {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) paths = parsed;
          } catch (_err) { /* fall through to text/plain */ }
        }
        if (!paths.length) {
          const text = dt.getData("text/plain");
          if (text) paths = text.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
        }
        if (paths.length) trashPaths(paths);
      });
    }

    return node;
  }

  function startDrag(event, item, node) {
    const z = U.scale();
    const startX = event.clientX;
    const startY = event.clientY;
    const originLeft = node.offsetLeft;
    const originTop = node.offsetTop;
    let dragging = false;
    let moved = false;
    let lastX = startX;
    let lastY = startY;
    let ghost = null;
    let ghostX = originLeft;
    let ghostY = originTop;
    const trashNode = item.kind === "entry" ? host.querySelector('.desk-icon[data-id="recycle"]') : null;

    const overTrash = () => {
      if (!trashNode) return false;
      const r = trashNode.getBoundingClientRect();
      return lastX >= r.left && lastX <= r.right && lastY >= r.top && lastY <= r.bottom;
    };

    const move = (ev) => {
      lastX = ev.clientX;
      lastY = ev.clientY;
      const dx = (ev.clientX - startX) / z;
      const dy = (ev.clientY - startY) / z;
      if (!dragging && Math.abs(dx) + Math.abs(dy) < 4) return;
      if (!dragging) {
        dragging = true;
        // The icon stays where it is; a translucent copy follows the pointer.
        ghost = node.cloneNode(true);
        ghost.classList.remove("selected");
        ghost.classList.add("drag-ghost");
        ghost.removeAttribute("data-id");
        ghost.style.left = originLeft + "px";
        ghost.style.top = originTop + "px";
        ghost.style.width = node.offsetWidth + "px";
        host.append(ghost);
        node.classList.add("drag-origin");
      }
      moved = true;
      const next = clampPosition(originLeft + dx, originTop + dy);
      ghostX = next.x;
      ghostY = next.y;
      ghost.style.left = next.x + "px";
      ghost.style.top = next.y + "px";
      if (trashNode) trashNode.classList.toggle("trash-target", overTrash());
    };

    const up = () => {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", up);
      node.classList.remove("drag-origin");
      if (ghost) { ghost.remove(); ghost = null; }
      if (trashNode) trashNode.classList.remove("trash-target");
      if (!moved) return;
      if (trashNode && overTrash()) {
        const paths = selected.has(item.id)
          ? Array.from(selected).filter((id) => id.indexOf("file:") === 0).map((id) => id.slice(5))
          : [item.entry.path];
        if (paths.length) { trashPaths(paths); return; }
      }
      const snapped = snapPosition(ghostX, ghostY);
      const clamped = nearestFree(snapped.x, snapped.y, item.id);
      node.style.left = clamped.x + "px";
      node.style.top = clamped.y + "px";
      positions[item.id] = clamped;
      layout[item.id] = clamped;
      savePositions();
    };
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", up, { once: true });
  }

  async function trashPaths(paths) {
    if (!paths || !paths.length) return;
    try {
      await API.remove(paths);
      U.toast(paths.length === 1
        ? "Moved " + U.basename(paths[0]) + " to the Recycle Bin"
        : "Moved " + paths.length + " items to the Recycle Bin", "success");
      await refresh();
      window.dispatchEvent(new CustomEvent("nas:files-changed"));
    } catch (err) {
      U.alert("Delete Error", err.message, "error");
    }
  }

  function shortcutProperties(shortcut) {
    U.dialog({
      title: labelFor(shortcut) + " Properties",
      icon: shortcut.icon,
      width: 380,
      message: "",
      content: () => {
        const dl = U.el("dl", { class: "props-grid" });
        [
          ["Type", "Shortcut"],
          ["Target", shortcut.label],
          ["Location", "Desktop"],
          ["Icon", shortcut.icon],
        ].forEach(([key, value]) => dl.append(U.el("dt", { text: key }), U.el("dd", { text: value })));
        return dl;
      },
      buttons: [{ label: "OK", value: true, primary: true }],
    });
  }

  function build() {
    if (!host) return;
    const items = allItems();
    // Reserve every tile that already has a saved position, then give the rest
    // the first free tile so new files never land on top of another icon.
    const used = new Set();
    items.forEach((item) => {
      const pos = positions[item.id];
      if (pos) used.add(cellKey(pos));
    });
    const resolved = new Map();
    items.forEach((item, index) => {
      let pos = positions[item.id];
      if (!pos) {
        pos = freePosition(index, used);
        used.add(cellKey(pos));
      }
      resolved.set(item.id, pos);
    });
    host.innerHTML = "";
    layout = {};
    items.forEach((item) => {
      const pos = resolved.get(item.id);
      layout[item.id] = pos;
      host.append(buildNode(item, pos));
    });
    built = true;
    updateSelection();
  }

  function arrange() {
    positions = {};
    allItems().forEach((item, index) => { positions[item.id] = defaultPosition(index); });
    savePositions();
    build();
  }

  function lineUp() {
    Array.from(host.children).forEach((node) => {
      const snapped = snapPosition(parseFloat(node.style.left) || 0, parseFloat(node.style.top) || 0);
      node.style.left = snapped.x + "px";
      node.style.top = snapped.y + "px";
      positions[node.dataset.id] = snapped;
    });
    savePositions();
  }

  function desktopMenu(x, y) {
    const selectedIds = Array.from(selected);
    U.contextMenu(x, y, [
      { label: "Arrange Icons", icon: "display", action: arrange },
      { label: "Line up Icons", icon: "display", action: lineUp },
      { label: "Refresh", shortcut: "F5", action: () => { refresh(); if (window.Sound) Sound.play("click"); } },
      { separator: true },
      { label: "New Folder", icon: "newfolder", action: async () => {
        const name = await U.prompt("New Folder", "Name for the new desktop folder:", "New Folder");
        if (!name) return;
        try {
          const result = await API.mkdir("/Desktop", name);
          await refresh();
          selectOnly("file:" + result.entry.path);
          U.toast("Created " + result.entry.name + " on the Desktop", "success");
        } catch (err) { U.error(err); }
      } },
      { label: "New Text Document", icon: "text", action: async () => {
        const name = await U.prompt("New Text Document", "Name for the new document:", "New Text Document.txt");
        if (!name) return;
        try {
          const result = await API.newfile("/Desktop", name, "");
          await refresh();
          selectOnly("file:" + result.entry.path);
          Apps.notepad(result.entry.path);
        } catch (err) { U.error(err); }
      } },
      { label: "New Word Document", icon: "word", action: () => Office.createAt("/Desktop", "word") },
      { label: "New Excel Worksheet", icon: "excel", action: () => Office.createAt("/Desktop", "excel") },
      { label: "New PowerPoint Presentation", icon: "powerpoint", action: () => Office.createAt("/Desktop", "powerpoint") },
      { separator: true },
      { label: "Open Desktop folder", icon: "folder", action: () => Explorer.open("/Desktop") },
      { label: "Change Wallpaper...", icon: "wallpaper", action: () => Settings.open("background") },
      { label: "Display Effects...", icon: "monitor", action: () => Settings.open("effects") },
      { label: "Screensaver", icon: "display", action: () => Screensaver.start(true) },
      { separator: true },
      { label: "Open Docker Manager", icon: "docker", action: () => Docker.open() },
      { label: "Open My Computer", icon: "computer", action: () => Explorer.open("/") },
      { separator: true },
      { label: selectedIds.length ? "Properties" : "Desktop Properties", icon: "settings", action: () => Settings.open("background") },
      { label: "About Win95 NAS", icon: "info", action: () => Apps.about() },
    ]);
  }

  async function uploadToDesktop(dataTransfer) {
    const files = [];
    Array.from(dataTransfer.files || []).forEach((file) => {
      files.push({ file, rel: file.webkitRelativePath || file.name });
    });
    if (!files.length) return;
    const progress = U.progressDialog("Copying to Desktop", "Uploading " + files.length + " file(s)...");
    try {
      await API.upload("/Desktop", files, [], (fraction, loaded, total) => {
        progress.set(fraction, U.fmtSize(loaded) + " of " + U.fmtSize(total));
      });
      progress.set(1, "Done");
      setTimeout(() => progress.close(), 220);
      await refresh();
      U.toast("Copied " + files.length + " file(s) to the Desktop", "success");
    } catch (err) {
      progress.close();
      U.error(err);
    }
  }

  function wireDesktop() {
    if (!desktop) return;
    desktop.addEventListener("mousedown", (event) => {
      if (event.button !== 0) return;
      if (event.target.closest(".desk-icon")) return;
      selectOnly(null);
      U.marquee({
        container: desktop,
        event,
        items: Array.from(host.children),
        onSelect(nodes, additive) {
          if (!additive) selected.clear();
          nodes.forEach((node) => selected.add(node.dataset.id));
          updateSelection();
        },
      });
    });

    desktop.addEventListener("contextmenu", (event) => {
      if (event.target.closest(".desk-icon")) return;
      event.preventDefault();
      desktopMenu(event.clientX, event.clientY);
    });

    desktop.addEventListener("dragover", (event) => {
      if (!event.dataTransfer || !Array.from(event.dataTransfer.types || []).includes("Files")) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
      desktop.classList.add("drop-target");
    });
    desktop.addEventListener("dragleave", (event) => {
      if (event.target === desktop) desktop.classList.remove("drop-target");
    });
    desktop.addEventListener("drop", async (event) => {
      if (!event.dataTransfer || !event.dataTransfer.files || !event.dataTransfer.files.length) return;
      event.preventDefault();
      desktop.classList.remove("drop-target");
      await uploadToDesktop(event.dataTransfer);
    });

    window.addEventListener("resize", () => {
      if (!built) return;
      Array.from(host.children).forEach((node) => {
        if (node.classList.contains("drag-ghost")) return;
        const snapped = clampPosition(parseFloat(node.style.left) || 0, parseFloat(node.style.top) || 0);
        node.style.left = snapped.x + "px";
        node.style.top = snapped.y + "px";
        if (node.dataset.id) layout[node.dataset.id] = snapped;
      });
    });

    document.addEventListener("click", (event) => {
      if (selected.size && (event.target === desktop || event.target === host)) selectOnly(null);
    });

    window.addEventListener("focus", () => { loadEntries(); });
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) loadEntries();
    });
  }

  async function loadEntries() {
    if (!host) return;
    try {
      const data = await API.list("/Desktop");
      const list = (data.entries || []).filter((entry) => !entry.name.startsWith("."));
      const signature = list.map((entry) => entry.path + "|" + entry.mtime + "|" + entry.size).join("~");
      if (signature === lastSignature && built) return;
      lastSignature = signature;
      entries = list;
      build();
    } catch (_err) {
      if (!built) build();
    }
  }

  async function refresh() {
    await loadEntries();
    build();
  }

  const Desktop = {
    build,
    arrange,
    refresh,
    loadEntries,
    resetIconPositions() {
      positions = {};
      labels = {};
      savePositions();
      saveLabels();
      build();
    },
    applySettings(state) {
      const desk = (state && state.desktop) || {};
      const nextSize = Number(desk.iconSize) || 48;
      const sizeChanged = built && nextSize !== iconSize;
      iconSize = nextSize;
      snap = desk.snap !== false;
      const z = U.scale();
      if (z !== lastScale) {
        lastScale = z;
        const b = host.getBoundingClientRect();
        const maxX = Math.max(2, b.width / z - 84);
        const maxY = Math.max(2, b.height / z - 74);
        let changed = false;
        Object.keys(positions).forEach((id) => {
          const pos = positions[id];
          if (!pos) return;
          const x = Math.max(2, Math.min(pos.x, maxX));
          const y = Math.max(2, Math.min(pos.y, maxY));
          if (x !== pos.x || y !== pos.y) { positions[id] = { x, y }; changed = true; }
        });
        if (changed) savePositions();
        if (built) build();
      }
      if (host) host.hidden = desk.showIcons === false;
      if (sizeChanged) {
        // Re-pack the saved positions onto the new grid so larger tiles never
        // overlap each other.
        const used = new Set();
        const next = {};
        Object.keys(layout).forEach((id) => {
          const old = layout[id] || positions[id];
          if (!old) return;
          const snapped = snapPosition(old.x, old.y);
          const pos = nearestFree(snapped.x, snapped.y, id, used);
          next[id] = pos;
          used.add(cellKey(pos));
        });
        Object.assign(positions, next);
        savePositions();
        build();
      } else if (built) {
        updateIconScale();
      }
    },
    icons: SHORTCUTS,
    open(id) {
      const shortcut = SHORTCUTS.find((s) => s.id === id);
      if (shortcut) shortcut.open();
    },
  };

  window.Desktop = Desktop;

  if (host && desktop) {
    build();
    wireDesktop();
    loadEntries();
  }
})();
