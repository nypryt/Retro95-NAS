/* Win95 NAS - window manager */
(function () {
  "use strict";

  const layer = document.getElementById("windows");
  const taskHost = document.getElementById("task-buttons");
  const windows = new Map();
  let zCounter = 200;
  let focused = null;
  let cascade = 0;
  let modalShades = 0;

  const TASKBAR_H = 28;

  function bounds() {
    const z = U.scale();
    return { w: window.innerWidth / z, h: window.innerHeight / z - TASKBAR_H };
  }

  // ---- tiling / edge snapping -------------------------------------------
  const snapPreview = U.el("div", { class: "snap-preview", hidden: true });
  layer.append(snapPreview);
  let previewZone = null;

  function snapRect(name, b) {
    const halfW = Math.floor(b.w / 2);
    const halfH = Math.floor(b.h / 2);
    switch (name) {
      case "left": return { name, left: 0, top: 0, width: halfW, height: b.h };
      case "right": return { name, left: halfW, top: 0, width: b.w - halfW, height: b.h };
      case "tl": return { name, left: 0, top: 0, width: halfW, height: halfH };
      case "tr": return { name, left: halfW, top: 0, width: b.w - halfW, height: halfH };
      case "bl": return { name, left: 0, top: halfH, width: halfW, height: b.h - halfH };
      case "br": return { name, left: halfW, top: halfH, width: b.w - halfW, height: b.h - halfH };
      case "max": return { name, left: 0, top: 0, width: b.w, height: b.h };
      default: return null;
    }
  }

  function snapZoneAt(clientX, clientY) {
    const b = bounds();
    const z = U.scale();
    const bottom = window.innerHeight - TASKBAR_H * z;
    const edge = 8;
    const nearLeft = clientX <= edge;
    const nearRight = clientX >= window.innerWidth - edge;
    const nearTop = clientY <= edge;
    const nearBottom = clientY >= bottom - edge;
    if (nearTop && nearLeft) return snapRect("tl", b);
    if (nearTop && nearRight) return snapRect("tr", b);
    if (nearTop) return snapRect("max", b);
    if (nearBottom && nearLeft) return snapRect("bl", b);
    if (nearBottom && nearRight) return snapRect("br", b);
    if (nearLeft) return snapRect("left", b);
    if (nearRight) return snapRect("right", b);
    return null;
  }

  function showSnapPreview(zone) {
    previewZone = zone;
    if (!zone) { snapPreview.hidden = true; return; }
    snapPreview.hidden = false;
    snapPreview.style.left = zone.left + "px";
    snapPreview.style.top = zone.top + "px";
    snapPreview.style.width = zone.width + "px";
    snapPreview.style.height = zone.height + "px";
  }

  function hideSnapPreview() {
    previewZone = null;
    snapPreview.hidden = true;
  }

  function emit() {
    window.dispatchEvent(new CustomEvent("wm:change"));
  }

  function makeTaskButton(win) {
    if (win.opts.dialog) return null;
    const button = U.el("button", {
      type: "button",
      class: "task-btn" + (win === focused && !win.isMinimized ? " active" : ""),
      title: win.title,
    });
    button.innerHTML =
      `<span class="t-ico">${Icons.get(win.iconName, 16)}</span>` +
      `<span class="t-label"></span>`;
    button.querySelector(".t-label").textContent = win.title;
    button.addEventListener("click", () => {
      if (win === focused && !win.isMinimized) win.minimize();
      else { win.restore(); win.focus(); }
    });
    button.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const items = [
        { label: "Restore", action: () => { win.unsnap(); win.restore(); win.focus(); }, disabled: !win.isMinimized && !win.isSnapped && !win.isMaximized },
        { label: "Minimize", action: () => win.minimize(), disabled: win.isMinimized },
        { label: "Maximize", action: () => { win.restore(); win.maximize(); }, disabled: win.isMaximized || !win.opts.maximizable },
      ];
      if (win.opts.resizable && !win.opts.dialog) {
        items.push(
          { separator: true },
          { label: "Snap left half", action: () => { win.restore(); win.snapTo("left"); } },
          { label: "Snap right half", action: () => { win.restore(); win.snapTo("right"); } },
          { label: "Snap to top-left", action: () => { win.restore(); win.snapTo("tl"); } },
          { label: "Snap to top-right", action: () => { win.restore(); win.snapTo("tr"); } },
          { label: "Snap to bottom-left", action: () => { win.restore(); win.snapTo("bl"); } },
          { label: "Snap to bottom-right", action: () => { win.restore(); win.snapTo("br"); } }
        );
      }
      items.push({ separator: true });
      if (win.opts.pinId && window.Taskbar) {
        items.push({
          label: window.Taskbar.isPinned(win.opts.pinId) ? "Unpin from taskbar" : "Pin to taskbar",
          action: () => window.Taskbar.togglePin(win.opts.pinId),
        });
        items.push({ separator: true });
      }
      items.push(
        { label: "Close", action: () => win.close() },
        { separator: true },
        { label: "Cascade windows", action: () => WM.arrange("cascade") },
        { label: "Tile windows", action: () => WM.arrange("tile") },
        { label: "Minimize all", action: () => WM.minimizeAll() }
      );
      U.contextMenu(event.clientX, event.clientY, items);
    });
    return button;
  }

  function updateTaskbar() {
    if (!taskHost) return;
    taskHost.innerHTML = "";
    if (window.Taskbar && typeof window.Taskbar.renderPins === "function") {
      try { window.Taskbar.renderPins(taskHost); } catch (err) { console.error(err); }
    }
    windows.forEach((win) => {
      const button = makeTaskButton(win);
      if (button) taskHost.append(button);
    });
  }

  function updateWindowChrome(win) {
    win.el.classList.toggle("focused", win === focused);
    win.el.classList.toggle("inactive", win !== focused);
    const maxBtn = win.el.querySelector(".tb-btn.max");
    if (maxBtn) maxBtn.classList.toggle("restore", win.isMaximized);
    if (maxBtn) maxBtn.title = win.isMaximized ? "Restore" : "Maximize";
  }

  function focus(win) {
    if (!win || win.closed) return;
    if (focused === win && !win.isMinimized) {
      win.el.style.zIndex = String(++zCounter);
      return;
    }
    focused = win;
    win.el.style.zIndex = String(++zCounter);
    if (win.shade) win.shade.style.zIndex = String(zCounter - 1);
    windows.forEach((other) => updateWindowChrome(other));
    if (win.opts.onFocus) {
      try { win.opts.onFocus(win); } catch (err) { console.error(err); }
    }
    updateTaskbar();
    emit();
  }

  function topmostWindow(exclude) {
    let best = null;
    let bestZ = -1;
    windows.forEach((win) => {
      if (win === exclude || win.isMinimized || win.opts.dialog) return;
      const z = parseInt(win.el.style.zIndex || "0", 10);
      if (z > bestZ) { bestZ = z; best = win; }
    });
    return best;
  }

  function place(win) {
    const b = bounds();
    const el = win.el;
    const width = win.opts.width || 520;
    const height = win.opts.autoHeight ? el.offsetHeight : (win.opts.height || 360);
    el.style.width = Math.min(width, b.w - 6) + "px";
    if (!win.opts.autoHeight) {
      el.style.height = Math.min(height, b.h - 6) + "px";
    }

    let x;
    let y;
    if (win.opts.x !== undefined && win.opts.y !== undefined) {
      x = win.opts.x;
      y = win.opts.y;
    } else if (win.opts.dialog) {
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      x = Math.round((b.w - w) / 2);
      y = Math.round((b.h - h) / 2.4);
    } else {
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      x = Math.round((b.w - w) / 2) + ((cascade % 6) * 22) - 55;
      y = Math.round((b.h - h) / 2) + ((cascade % 6) * 18) - 45;
      cascade += 1;
    }
    x = U.clamp(x, 2, Math.max(2, b.w - el.offsetWidth - 2));
    y = U.clamp(y, 2, Math.max(2, b.h - el.offsetHeight - 2));
    el.style.left = x + "px";
    el.style.top = y + "px";
  }

  function open(options) {
    const opts = Object.assign({ resizable: true, maximizable: true, minimizable: true }, options || {});

    if (opts.singleton) {
      const existing = windows.get(opts.singleton);
      if (existing) {
        existing.restore();
        existing.focus();
        if (opts.reuse) opts.reuse(existing);
        return existing;
      }
    }

    const id = opts.singleton || U.uid();
    const el = U.el("div", {
      class: "win" + (opts.dialog ? " dialog-win" : "") + (opts.className ? " " + opts.className : ""),
      tabindex: "-1",
      style: { visibility: "hidden" },
    });

    const titlebar = U.el("div", { class: "titlebar" });
    titlebar.innerHTML =
      `<span class="tb-icon">${Icons.get(opts.icon || "file", 16)}</span>` +
      `<span class="tb-title"></span>` +
      `<span class="tb-buttons">` +
      (opts.minimizable ? `<button type="button" class="tb-btn min" title="Minimize"></button>` : "") +
      (opts.maximizable ? `<button type="button" class="tb-btn max" title="Maximize"></button>` : "") +
      `<button type="button" class="tb-btn close" title="Close"></button>` +
      `</span>`;
    titlebar.querySelector(".tb-title").textContent = opts.title || "Window";
    el.append(titlebar);

    const body = U.el("div", { class: "win-body" });
    el.append(body);

    if (opts.resizable) {
      ["n", "s", "e", "w", "ne", "nw", "se", "sw"].forEach((dir) => {
        el.append(U.el("div", { class: "resize-handle rh-" + dir, dataset: { dir } }));
      });
    }

    const win = {
      id,
      el,
      body,
      title: opts.title || "Window",
      iconName: opts.icon || "file",
      opts,
      isMinimized: false,
      isMaximized: false,
      isSnapped: false,
      snapName: null,
      closed: false,
      prevRect: null,
      shade: null,

      setTitle(text) {
        win.title = text;
        const node = el.querySelector(".tb-title");
        if (node) node.textContent = text;
        updateTaskbar();
      },
      setIcon(name) {
        win.iconName = name;
        const node = el.querySelector(".tb-icon");
        if (node) node.innerHTML = Icons.get(name, 16);
        updateTaskbar();
      },
      focus() { focus(win); },
      minimize() {
        if (win.isMinimized || !opts.minimizable) return;
        win.isMinimized = true;
        el.classList.add("minimized");
        Sound.play("minimize");
        if (focused === win) {
          focused = null;
          const next = topmostWindow(win);
          if (next) focus(next);
          else { windows.forEach((w) => updateWindowChrome(w)); updateTaskbar(); emit(); }
        }
      },
      restore() {
        if (!win.isMinimized) return;
        win.isMinimized = false;
        el.classList.remove("minimized");
        Sound.play("maximize");
        focus(win);
      },
      maximize() {
        if (win.isMaximized || !opts.maximizable) return;
        hideSnapPreview();
        if (win.isSnapped) { win.isSnapped = false; win.snapName = null; }
        win.prevRect = { left: el.style.left, top: el.style.top, width: el.style.width, height: el.style.height };
        win.isMaximized = true;
        el.classList.add("maximized");
        el.style.left = "0px";
        el.style.top = "0px";
        el.style.width = "100%";
        el.style.height = "100%";
        updateWindowChrome(win);
        Sound.play("maximize");
        emit();
      },
      unmaximize() {
        if (!win.isMaximized) return;
        win.isMaximized = false;
        el.classList.remove("maximized");
        if (win.prevRect) {
          el.style.left = win.prevRect.left;
          el.style.top = win.prevRect.top;
          el.style.width = win.prevRect.width;
          el.style.height = win.prevRect.height;
        }
        updateWindowChrome(win);
        emit();
      },
      snapTo(zone) {
        const name = typeof zone === "string" ? zone : (zone && zone.name);
        if (!name) return;
        if (name === "max") { win.restore(); win.maximize(); return; }
        const rect = snapRect(name, bounds());
        if (!rect) return;
        if (win.isMaximized) win.unmaximize();
        if (!win.isSnapped) {
          win.prevRect = { left: el.style.left, top: el.style.top, width: el.style.width, height: el.style.height };
        }
        win.isSnapped = true;
        win.snapName = name;
        el.classList.remove("maximized");
        el.style.left = rect.left + "px";
        el.style.top = rect.top + "px";
        el.style.width = rect.width + "px";
        el.style.height = rect.height + "px";
        updateWindowChrome(win);
        Sound.play("maximize");
        emit();
      },
      unsnap() {
        if (!win.isSnapped) return;
        win.isSnapped = false;
        win.snapName = null;
        if (win.prevRect) {
          el.style.left = win.prevRect.left;
          el.style.top = win.prevRect.top;
          el.style.width = win.prevRect.width;
          el.style.height = win.prevRect.height;
        }
        updateWindowChrome(win);
        emit();
      },
      toggleMaximize() { if (win.isMaximized) win.unmaximize(); else win.maximize(); },
      close() {
        if (win.closed) return;
        win.closed = true;
        if (win.shade) { win.shade.remove(); modalShades = Math.max(0, modalShades - 1); }
        if (opts.onClose) {
          try { opts.onClose(win); } catch (err) { console.error(err); }
        }
        el.remove();
        windows.delete(id);
        if (focused === win) {
          focused = null;
          const next = topmostWindow(win);
          if (next) focus(next);
        }
        updateTaskbar();
        emit();
        Sound.play("close");
      },
    };

    // ---- titlebar buttons
    const minBtn = titlebar.querySelector(".tb-btn.min");
    const maxBtn = titlebar.querySelector(".tb-btn.max");
    const closeBtn = titlebar.querySelector(".tb-btn.close");
    if (minBtn) minBtn.addEventListener("click", (event) => { event.stopPropagation(); win.minimize(); });
    if (maxBtn) maxBtn.addEventListener("click", (event) => { event.stopPropagation(); win.toggleMaximize(); });
    if (closeBtn) closeBtn.addEventListener("click", (event) => { event.stopPropagation(); win.close(); });

    // ---- dragging
    titlebar.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 || event.target.closest(".tb-btn")) return;
      focus(win);
      if (win.isMaximized) return;
      const z = U.scale();
      if (win.isSnapped) {
        // Pull a tiled window out of its slot, keeping it under the cursor.
        const before = el.getBoundingClientRect();
        const ratioX = (event.clientX - before.left) / Math.max(1, before.width);
        win.unsnap();
        const width = parseFloat(el.style.width) || 520;
        const top = Math.max(0, event.clientY / z - 10);
        el.style.left = U.clamp(event.clientX / z - width * ratioX, 2, Math.max(2, bounds().w - width - 2)) + "px";
        el.style.top = U.clamp(top, 0, bounds().h - 24) + "px";
      }
      const rect = el.getBoundingClientRect();
      const ox = (event.clientX - rect.left) / z;
      const oy = (event.clientY - rect.top) / z;
      const b = bounds();
      el.classList.add("dragging");
      let zone = null;
      const move = (ev) => {
        const x = U.clamp(ev.clientX / z - ox, -rect.width / z + 80, b.w - 60);
        const y = U.clamp(ev.clientY / z - oy, 0, b.h - 24);
        el.style.left = x + "px";
        el.style.top = y + "px";
        if (opts.dialog || !opts.resizable) { return; }
        zone = snapZoneAt(ev.clientX, ev.clientY);
        showSnapPreview(zone);
      };
      const up = () => {
        el.classList.remove("dragging");
        document.removeEventListener("pointermove", move);
        document.removeEventListener("pointerup", up);
        hideSnapPreview();
        if (zone) win.snapTo(zone);
        zone = null;
      };
      document.addEventListener("pointermove", move);
      document.addEventListener("pointerup", up, { once: true });
      event.preventDefault();
    });
    titlebar.addEventListener("dblclick", (event) => {
      if (event.target.closest(".tb-btn")) return;
      win.toggleMaximize();
    });
    titlebar.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      event.stopPropagation();
      focus(win);
      const items = [
        { label: "Restore", action: () => { win.unsnap(); win.restore(); win.focus(); }, disabled: !win.isMinimized && !win.isSnapped && !win.isMaximized },
        { label: "Minimize", action: () => win.minimize(), disabled: win.isMinimized },
        { label: "Maximize", action: () => win.maximize(), disabled: win.isMaximized || !opts.maximizable },
      ];
      if (opts.resizable && !opts.dialog) {
        items.push(
          { separator: true },
          { label: "Snap left half", action: () => win.snapTo("left") },
          { label: "Snap right half", action: () => win.snapTo("right") },
          { label: "Snap to top-left", action: () => win.snapTo("tl") },
          { label: "Snap to top-right", action: () => win.snapTo("tr") },
          { label: "Snap to bottom-left", action: () => win.snapTo("bl") },
          { label: "Snap to bottom-right", action: () => win.snapTo("br") }
        );
      }
      items.push(
        { separator: true },
        { label: "Cascade windows", action: () => WM.arrange("cascade") },
        { label: "Tile windows", action: () => WM.arrange("tile") }
      );
      if (opts.pinId && window.Taskbar) {
        items.push({ separator: true }, {
          label: window.Taskbar.isPinned(opts.pinId) ? "Unpin from taskbar" : "Pin to taskbar",
          action: () => window.Taskbar.togglePin(opts.pinId),
        });
      }
      items.push({ separator: true }, { label: "Close", action: () => win.close() });
      U.contextMenu(event.clientX, event.clientY, items);
    });

    // ---- resizing
    if (opts.resizable) {
      el.querySelectorAll(".resize-handle").forEach((handle) => {
        handle.addEventListener("pointerdown", (event) => {
          if (event.button !== 0) return;
          event.preventDefault();
          event.stopPropagation();
          focus(win);
          if (win.isMaximized) return;
          const dir = handle.dataset.dir;
          const z = U.scale();
          const raw = el.getBoundingClientRect();
          const rect = { left: raw.left / z, top: raw.top / z, right: raw.right / z, bottom: raw.bottom / z, width: raw.width / z, height: raw.height / z };
          if (win.isSnapped) { win.isSnapped = false; win.snapName = null; win.prevRect = null; }
          const startX = event.clientX;
          const startY = event.clientY;
          const minW = opts.minWidth || 220;
          const minH = opts.minHeight || 120;
          const b = bounds();
          const move = (ev) => {
            let left = rect.left;
            let top = rect.top;
            let width = rect.width;
            let height = rect.height;
            const dx = (ev.clientX - startX) / z;
            const dy = (ev.clientY - startY) / z;
            if (dir.includes("e")) width = Math.max(minW, Math.min(b.w - left - 2, rect.width + dx));
            if (dir.includes("s")) height = Math.max(minH, Math.min(b.h - top - 2, rect.height + dy));
            if (dir.includes("w")) {
              width = Math.max(minW, rect.width - dx);
              left = Math.max(2, rect.right - width);
              width = rect.right - left;
            }
            if (dir.includes("n")) {
              height = Math.max(minH, rect.height - dy);
              top = Math.max(2, rect.bottom - height);
              height = rect.bottom - top;
            }
            el.style.left = left + "px";
            el.style.top = top + "px";
            el.style.width = width + "px";
            el.style.height = height + "px";
          };
          const up = () => {
            document.removeEventListener("pointermove", move);
            document.removeEventListener("pointerup", up);
          };
          document.addEventListener("pointermove", move);
          document.addEventListener("pointerup", up, { once: true });
        });
      });
    }

    el.addEventListener("mousedown", () => focus(win));
    el.addEventListener("keydown", (event) => {
      if (focused !== win) return;
      if (win.onKey) {
        try { win.onKey(event); } catch (err) { console.error(err); }
      }
      if (!event.defaultPrevented && event.key === "Escape" && opts.dialog) win.close();
    });

    // ---- build content
    layer.append(el);
    if (opts.build) {
      try { opts.build(body, win); }
      catch (err) { console.error(err); body.append(U.el("div", { style: { padding: "10px", color: "#a00000" }, text: String(err) })); }
    }

    if (opts.autoHeight) {
      el.style.height = "auto";
      const natural = el.offsetHeight;
      el.style.height = Math.min(bounds().h - 6, Math.max(opts.height || 80, natural)) + "px";
    }

    if (opts.modal) {
      const shade = U.el("div", { class: "modal-shade" });
      shade.addEventListener("mousedown", (event) => {
        event.stopPropagation();
        Sound.play("ding");
      });
      layer.append(shade);
      win.shade = shade;
      modalShades += 1;
    }

    windows.set(id, win);
    place(win);
    el.style.visibility = "";
    updateWindowChrome(win);
    focus(win);
    updateTaskbar();
    Sound.play("open");
    emit();
    return win;
  }

  function arrange(mode) {
    const list = [];
    windows.forEach((win) => { if (!win.opts.dialog) list.push(win); });
    if (!list.length) return;
    const b = bounds();
    if (mode === "cascade") {
      list.forEach((win, index) => {
        win.unmaximize();
        win.restore();
        win.isSnapped = false;
        win.snapName = null;
        const w = Math.min(620, Math.round(b.w * 0.66));
        const h = Math.min(430, Math.round(b.h * 0.7));
        win.el.style.width = w + "px";
        win.el.style.height = h + "px";
        win.el.style.left = Math.min(b.w - w - 4, 16 + index * 26) + "px";
        win.el.style.top = Math.min(b.h - h - 4, 10 + index * 22) + "px";
      });
      focus(list[list.length - 1]);
    } else if (mode === "tile") {
      const cols = Math.ceil(Math.sqrt(list.length));
      const rows = Math.ceil(list.length / cols);
      const w = Math.floor(b.w / cols);
      const h = Math.floor(b.h / rows);
      list.forEach((win, index) => {
        win.unmaximize();
        win.restore();
        win.isSnapped = false;
        win.snapName = null;
        const col = index % cols;
        const row = Math.floor(index / cols);
        win.el.style.width = w + "px";
        win.el.style.height = h + "px";
        win.el.style.left = col * w + "px";
        win.el.style.top = row * h + "px";
      });
      focus(list[0]);
    }
    emit();
  }

  // Re-apply snapped geometry and keep every window inside the screen after a
  // resize or a change of display scaling.
  function reflow() {
    const b = bounds();
    // A minimized or mid-transition browser window can report a zero-sized
    // viewport; resizing every window to the 160x80 floor would be wrong.
    if (!isFinite(b.w) || !isFinite(b.h) || b.w < 120 || b.h < 90) return;
    windows.forEach((win) => {
      if (win.isMaximized) return;
      if (win.isSnapped) {
        const rect = snapRect(win.snapName, b);
        if (rect) {
          win.el.style.left = rect.left + "px";
          win.el.style.top = rect.top + "px";
          win.el.style.width = rect.width + "px";
          win.el.style.height = rect.height + "px";
        }
        return;
      }
      const currentW = parseFloat(win.el.style.width) || win.el.offsetWidth || 520;
      const currentH = parseFloat(win.el.style.height) || win.el.offsetHeight || 360;
      const maxW = Math.max(160, b.w - 4);
      const maxH = Math.max(80, b.h - 4);
      const minW = Math.min(win.opts.minWidth || 160, maxW);
      const minH = Math.min(win.opts.minHeight || 80, maxH);
      const width = U.clamp(currentW, minW, maxW);
      const height = U.clamp(currentH, minH, maxH);
      win.el.style.width = width + "px";
      win.el.style.height = height + "px";
      const left = parseFloat(win.el.style.left) || 0;
      const top = parseFloat(win.el.style.top) || 0;
      win.el.style.left = U.clamp(left, 2, Math.max(2, b.w - width - 2)) + "px";
      win.el.style.top = U.clamp(top, 2, Math.max(2, b.h - height - 2)) + "px";
    });
    hideSnapPreview();
  }

  const WM = {
    open,
    focus,
    get focused() { return focused; },
    list: () => Array.from(windows.values()),
    find: (id) => windows.get(id),
    minimizeAll() {
      windows.forEach((win) => { if (!win.opts.dialog) win.minimize(); });
    },
    arrange,
    reflow,
    snapFocused(name) {
      const win = focused && !focused.isMinimized ? focused : topmostWindow(null);
      if (!win || win.opts.dialog || !win.opts.resizable) return;
      win.restore();
      win.snapTo(name);
    },
    unsnapFocused() {
      const win = focused && !focused.isMinimized ? focused : topmostWindow(null);
      if (!win) return;
      if (win.isMaximized) win.unmaximize();
      else win.unsnap();
    },
    closeAll() {
      Array.from(windows.values()).forEach((win) => win.close());
    },
    activeCount: () => Array.from(windows.values()).filter((w) => !w.opts.dialog).length,
    updateTaskbar,
  };

  window.addEventListener("resize", reflow);

  window.addEventListener("settings:change", (event) => {
    // Scaling is owned by Settings.applyResolution(): it either uses the
    // emulated screen mode's fit factor or the desktop.uiScale setting.
    // Re-applying uiScale here would undo the fixed-resolution zoom.
    reflow();
    updateTaskbar();
  });

  window.WM = WM;
})();
