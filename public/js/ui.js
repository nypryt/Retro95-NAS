/* Win95 NAS - UI toolkit (elements, menus, dialogs, toasts) */
(function () {
  "use strict";

  const U = {};

  // ---------------------------------------------------------------- elements
  U.el = function el(tag, attrs, ...children) {
    const node = document.createElement(tag);
    if (attrs) {
      for (const [key, value] of Object.entries(attrs)) {
        if (value === undefined || value === null || value === false) continue;
        if (key === "class") node.className = value;
        else if (key === "html") node.innerHTML = value;
        else if (key === "text") node.textContent = value;
        else if (key === "style" && typeof value === "object") Object.assign(node.style, value);
        else if (key === "dataset") Object.assign(node.dataset, value);
        else if (key.startsWith("on") && typeof value === "function") {
          node.addEventListener(key.slice(2).toLowerCase(), value);
        } else if (value === true) node.setAttribute(key, "");
        else node.setAttribute(key, value);
      }
    }
    for (const child of children.flat(Infinity)) {
      if (child === null || child === undefined || child === false) continue;
      node.append(child instanceof Node ? child : document.createTextNode(String(child)));
    }
    return node;
  };

  U.qs = (sel, root) => (root || document).querySelector(sel);
  U.qsa = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  U.on = (target, type, fn, opts) => target.addEventListener(type, fn, opts);
  U.clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  U.uid = () => "id" + Math.random().toString(36).slice(2, 9);
  U.debounce = (fn, ms) => {
    let t = null;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  };

  // ---------------------------------------------------------------- scaling
  // The whole UI is scaled with the CSS `zoom` property. Mouse events arrive in
  // viewport pixels while layout values stay in local pixels, so every piece of
  // drag/menu maths divides by this factor.
  let uiScale = 1;
  U.setScale = function setScale(value) {
    const next = Number(value);
    uiScale = next > 0 ? next : 1;
    document.documentElement.style.setProperty("--ui-scale", String(uiScale));
    return uiScale;
  };
  U.scale = () => uiScale;
  // Convert a viewport coordinate into the zoomed layout space.
  U.toLocal = (value) => value / uiScale;

  U.escapeHtml = (str) => String(str == null ? "" : str)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

  U.fmtSize = function fmtSize(bytes) {
    if (bytes === null || bytes === undefined || isNaN(bytes)) return "";
    if (bytes < 1024) return bytes + " bytes";
    const units = ["KB", "MB", "GB", "TB"];
    let value = bytes / 1024;
    let i = 0;
    while (value >= 1024 && i < units.length - 1) { value /= 1024; i += 1; }
    return (value >= 10 ? value.toFixed(1) : value.toFixed(2)).replace(/\.0+$/, "") + " " + units[i];
  };

  U.fmtDate = function fmtDate(ms) {
    if (!ms) return "";
    const d = new Date(ms);
    return d.toLocaleDateString() + " " + d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  };

  U.fmtTime = (date) => {
    const d = date || new Date();
    return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  };

  U.fmtLongDate = (date) => (date || new Date()).toLocaleDateString([], {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });

  U.basename = (path) => {
    const clean = String(path || "").replace(/\/+$/, "");
    const idx = clean.lastIndexOf("/");
    return idx < 0 ? clean : clean.slice(idx + 1);
  };

  U.dirname = (path) => {
    const clean = String(path || "/").replace(/\/+$/, "") || "/";
    const idx = clean.lastIndexOf("/");
    return idx <= 0 ? "/" : clean.slice(0, idx);
  };

  U.joinPath = (base, name) => {
    const b = String(base || "/").replace(/\/+$/, "");
    const n = String(name || "").replace(/^\/+/, "");
    return (b ? b : "") + "/" + n;
  };

  U.icon = (name, size) => U.el("span", { class: "ico", html: window.Icons.get(name, size || 16) });
  U.iconHtml = (name, size) => window.Icons.get(name, size || 16);

  // ---------------------------------------------------------------- toasts
  U.toast = function toast(message, kind, ms) {
    const host = document.getElementById("toasts");
    if (!host) return;
    const icons = { info: "info", error: "error", warning: "warning", success: "info", docker: "docker" };
    const node = U.el("div", { class: "toast" },
      U.el("span", { class: "t-ico", html: U.iconHtml(icons[kind] || "info", 16) }),
      U.el("span", { text: message })
    );
    host.append(node);
    setTimeout(() => {
      node.style.transition = "opacity .25s";
      node.style.opacity = "0";
      setTimeout(() => node.remove(), 260);
    }, ms || 4200);
    return node;
  };

  U.error = (err) => U.toast(err && err.message ? err.message : String(err), "error", 6000);

  // ---------------------------------------------------------------- menus
  let openMenus = [];

  function clearOpenFlags() {
    document.querySelectorAll(".menubar-item.open").forEach((n) => n.classList.remove("open"));
    document.querySelectorAll(".start-item.open").forEach((n) => n.classList.remove("open"));
  }

  U.closeMenus = function closeMenus() {
    openMenus.forEach((menu) => menu.remove());
    openMenus = [];
    clearOpenFlags();
  };

  function positionMenu(menu, x, y) {
    const z = U.scale();
    menu.style.left = "0px";
    menu.style.top = "0px";
    const width = menu.offsetWidth;
    const height = menu.offsetHeight;
    const vw = window.innerWidth / z;
    const vh = window.innerHeight / z;
    menu.style.left = U.clamp(x / z, 0, Math.max(0, vw - width - 2)) + "px";
    menu.style.top = U.clamp(y / z, 0, Math.max(0, vh - height - 2)) + "px";
  }

  function openSubmenu(row, items) {
    while (openMenus.length > 1) openMenus.pop().remove();
    const pop = buildMenu(items);
    document.body.append(pop);
    const z = U.scale();
    const rect = row.getBoundingClientRect();
    const width = pop.offsetWidth * z;
    const height = pop.offsetHeight * z;
    let x = rect.right - 2;
    let y = rect.top;
    if (x + width > window.innerWidth) x = rect.left - width + 2;
    if (y + height > window.innerHeight) y = Math.max(2, window.innerHeight - height - 2);
    pop.style.left = Math.max(2, x / z) + "px";
    pop.style.top = Math.max(2, y / z) + "px";
    openMenus.push(pop);
  }

  function buildMenu(items) {
    const pop = U.el("div", { class: "menu-pop", role: "menu" });
    (items || []).forEach((item) => {
      if (item.separator) { pop.append(U.el("div", { class: "dd-sep" })); return; }
      if (item.title) { pop.append(U.el("div", { class: "dd-title", text: item.title })); return; }
      const row = U.el("div", {
        class: "dd-item" + (item.disabled ? " disabled" : ""),
        role: "menuitem",
      });
      row.append(U.el("span", { class: "dd-check", text: item.checked ? "\u2713" : "" }));
      if (item.icon) row.append(U.el("span", { class: "dd-ico", html: U.iconHtml(item.icon, 16) }));
      else row.append(U.el("span", { class: "dd-ico" }));
      row.append(U.el("span", { class: "dd-label", text: item.label }));
      if (item.shortcut) row.append(U.el("span", { class: "dd-key", text: item.shortcut }));
      if (item.submenu) row.append(U.el("span", { class: "dd-arrow", text: "\u25B6" }));

      if (!item.disabled) {
        row.addEventListener("mouseenter", () => {
          if (item.submenu) openSubmenu(row, item.submenu);
          else while (openMenus.length > 1) openMenus.pop().remove();
        });
        row.addEventListener("click", (event) => {
          event.stopPropagation();
          if (item.submenu) { openSubmenu(row, item.submenu); return; }
          U.closeMenus();
          if (item.action) item.action();
        });
      }
      pop.append(row);
    });
    return pop;
  }

  U.contextMenu = function contextMenu(x, y, items) {
    U.closeMenus();
    const pop = buildMenu(items);
    document.body.append(pop);
    positionMenu(pop, x, y);
    openMenus.push(pop);
    return pop;
  };

  U.menuAt = function menuAt(anchor, items) {
    U.closeMenus();
    const pop = buildMenu(items);
    document.body.append(pop);
    const rect = anchor.getBoundingClientRect();
    positionMenu(pop, rect.left, rect.bottom + 1);
    openMenus.push(pop);
    if (anchor.classList.contains("menubar-item") || anchor.classList.contains("start-item")) {
      anchor.classList.add("open");
    }
    return pop;
  };

  U.menuBar = function menuBar(win, menus) {
    const bar = U.el("div", { class: "menubar" });
    menus.forEach((menu) => {
      const item = U.el("div", { class: "menubar-item", text: menu.label, tabindex: "0" });
      item.addEventListener("mousedown", (event) => {
        event.preventDefault();
        event.stopPropagation();
        const wasOpen = item.classList.contains("open");
        U.closeMenus();
        if (wasOpen) return;
        item.classList.add("open");
        const pop = buildMenu(menu.items);
        document.body.append(pop);
        const rect = item.getBoundingClientRect();
        positionMenu(pop, rect.left, rect.bottom);
        openMenus.push(pop);
      });
      bar.append(item);
    });
    const titlebar = win.el.querySelector(".titlebar");
    titlebar.after(bar);
    return bar;
  };

  // ---------------------------------------------------------------- dialogs
  U.dialog = function dialog(options) {
    const opts = options || {};
    const buttons = opts.buttons || [{ label: "OK", value: true, primary: true }];
    return new Promise((resolve) => {
      let settled = false;
      const finish = (value) => {
        if (settled) return;
        settled = true;
        resolve(value);
      };

      const win = window.WM.open({
        title: opts.title || "Message",
        icon: opts.icon || "info",
        width: opts.width || 330,
        height: opts.height || 120,
        autoHeight: opts.autoHeight !== false,
        resizable: false,
        maximizable: false,
        minimizable: false,
        modal: opts.modal !== false,
        dialog: true,
        className: "dialog-win",
        build(body, w) {
          const wrap = U.el("div", { style: { display: "flex", flexDirection: "column", height: "100%" } });
          const row = U.el("div", { class: "dialog-body" });
          row.append(U.el("div", { class: "dialog-icon", html: U.iconHtml(opts.icon || "info", 32) }));
          const text = U.el("div", { class: "dialog-text selectable" });
          if (opts.message) {
            String(opts.message).split("\n").forEach((line, index, arr) => {
              text.append(document.createTextNode(line));
              if (index < arr.length - 1) text.append(U.el("br"));
            });
          }
          if (opts.content) {
            const extra = typeof opts.content === "function" ? opts.content(w, text) : opts.content;
            if (extra) text.append(extra);
          }
          row.append(text);
          wrap.append(row);

          const buttonRow = U.el("div", { class: "dialog-buttons" });
          const buttonEls = [];
          buttons.forEach((btn) => {
            const button = U.el("button", {
              type: "button",
              class: btn.primary ? "default" : "",
              text: btn.label,
            });
            button.addEventListener("click", () => {
              const value = btn.value !== undefined ? btn.value : btn.label;
              finish(value);
              if (btn.action) {
                try { btn.action(); } catch (err) { U.error(err); }
              }
              if (btn.close !== false) w.close();
            });
            buttonEls.push(button);
            buttonRow.append(button);
          });
          wrap.append(buttonRow);
          body.append(wrap);

          if (opts.onBuild) opts.onBuild(w, text, buttonEls);
          if (opts.focus) {
            setTimeout(() => {
              const target = w.el.querySelector(opts.focus);
              if (target) { target.focus(); if (target.select) target.select(); }
            }, 40);
          }
        },
        onClose() { finish(opts.cancelValue !== undefined ? opts.cancelValue : null); },
      });
      win.dialogButtons = buttons;
    });
  };

  U.alert = (title, message, icon) => U.dialog({
    title, message, icon: icon || "info",
    buttons: [{ label: "OK", value: true, primary: true }],
  });

  U.confirm = async (title, message, icon) => {
    const result = await U.dialog({
      title, message, icon: icon || "question",
      buttons: [
        { label: "OK", value: true, primary: true },
        { label: "Cancel", value: false },
      ],
    });
    return result === true;
  };

  U.prompt = function prompt(title, message, defaultValue, options) {
    const opts = options || {};
    let input = null;
    return U.dialog({
      title,
      message,
      icon: opts.icon || "question",
      width: opts.width || 340,
      buttons: [
        { label: "OK", value: "ok", primary: true },
        { label: "Cancel", value: null },
      ],
      content: (w) => {
        input = U.el("input", {
          type: "text",
          class: "dialog-input",
          value: defaultValue === undefined ? "" : defaultValue,
          spellcheck: "false",
        });
        input.addEventListener("keydown", (event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            const ok = w.el.querySelector(".dialog-buttons .default");
            if (ok) ok.click();
          } else if (event.key === "Escape") {
            event.preventDefault();
            w.close();
          }
        });
        setTimeout(() => { input.focus(); input.select(); }, 50);
        return input;
      },
    }).then((result) => (result === "ok" && input ? input.value : null));
  };

  // ---------------------------------------------------------------- misc
  U.progressDialog = function progressDialog(title, label) {
    let fill = null;
    let caption = null;
    let percent = null;
    let cancelHandler = null;
    let cancelled = false;
    const win = window.WM.open({
      title: title || "Copying...",
      icon: "file",
      width: 350,
      height: 142,
      resizable: false,
      maximizable: false,
      minimizable: false,
      modal: true,
      build(body, w) {
        const wrap = U.el("div", { style: { padding: "12px 12px 8px" } });
        caption = U.el("div", { text: label || "Please wait...", style: { marginBottom: "8px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } });
        fill = U.el("div", { class: "progress-fill" });
        percent = U.el("div", { text: "0%", style: { marginTop: "5px", textAlign: "right" } });
        const cancel = U.el("button", { type: "button", text: "Cancel", style: { marginTop: "8px" } });
        cancel.addEventListener("click", () => {
          cancelled = true;
          if (cancelHandler) cancelHandler();
          w.close();
        });
        wrap.append(caption, U.el("div", { class: "progress" }, fill), percent, U.el("div", { class: "row", style: { justifyContent: "flex-end" } }, cancel));
        body.append(wrap);
      },
      onClose() {
        if (!cancelled && cancelHandler) cancelHandler();
      },
    });
    return {
      win,
      set(value, text) {
        const pct = Math.max(0, Math.min(100, Math.round(value * 100)));
        if (fill) fill.style.width = pct + "%";
        if (percent) percent.textContent = pct + "%";
        if (caption && text) caption.textContent = text;
      },
      setText(text) { if (caption) caption.textContent = text; },
      setCancel(fn) { cancelHandler = fn; },
      close() { cancelled = true; win.close(); },
    };
  };

  U.marquee = function marquee(options) {
    const { container, event, items, onSelect } = options;
    const z = U.scale();
    const startX = event.clientX;
    const startY = event.clientY;
    const additive = !!event.ctrlKey;
    const rect = container.getBoundingClientRect();
    const originX = (startX - rect.left) / z + container.scrollLeft;
    const originY = (startY - rect.top) / z + container.scrollTop;
    const box = U.el("div", { class: "marquee" });
    box.style.left = originX + "px";
    box.style.top = originY + "px";
    box.style.width = "0px";
    box.style.height = "0px";
    container.append(box);
    event.preventDefault();

    const move = (ev) => {
      const left = Math.min(startX, ev.clientX);
      const top = Math.min(startY, ev.clientY);
      const width = Math.abs(ev.clientX - startX);
      const height = Math.abs(ev.clientY - startY);
      box.style.left = ((left - rect.left) / z + container.scrollLeft) + "px";
      box.style.top = ((top - rect.top) / z + container.scrollTop) + "px";
      box.style.width = (width / z) + "px";
      box.style.height = (height / z) + "px";
      const chosen = items.filter((item) => {
        const r = item.getBoundingClientRect();
        return r.right >= left && r.left <= left + width && r.bottom >= top && r.top <= top + height;
      });
      onSelect(chosen, additive);
    };
    const up = () => {
      box.remove();
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", up);
    };
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", up, { once: true });
  };

  U.nasPicker = function nasPicker(options) {
    const opts = options || {};
    const mode = opts.mode || "file";
    let current = opts.start || "/";
    let selected = null;
    let listHost = null;
    let pathField = null;
    let okButton = null;

    function selectPath(path) {
      selected = path;
      if (pathField) pathField.value = path;
      if (okButton) okButton.disabled = false;
    }

    async function load(path) {
      try {
        const data = await window.API.list(path);
        current = data.path;
        if (pathField) pathField.value = current;
        selected = mode === "dir" ? current : null;
        render(data.entries);
      } catch (err) { U.error(err); }
    }

    function render(entries) {
      if (!listHost) return;
      listHost.innerHTML = "";
      if (current !== "/") {
        const up = U.el("div", { class: "li", dataset: { path: U.dirname(current) } },
          U.el("span", { html: U.iconHtml("folderUp", 16) }),
          U.el("span", { text: ".." }));
        up.addEventListener("dblclick", () => load(U.dirname(current)));
        up.addEventListener("click", () => selectPath(U.dirname(current)));
        listHost.append(up);
      }
      const visible = entries.filter((e) => (mode === "file" ? e.type === "file" : true));
      visible.forEach((entry) => {
        const row = U.el("div", { class: "li" },
          U.el("span", { html: U.iconHtml(entry.type === "dir" ? "folder" : (window.Icons.has(entry.kind) ? entry.kind : "file"), 16) }),
          U.el("span", { text: entry.name }));
        row.addEventListener("click", () => selectPath(entry.path));
        row.addEventListener("dblclick", () => {
          if (entry.type === "dir") load(entry.path);
          else {
            selectPath(entry.path);
            const ok = document.querySelector(".nas-picker-ok");
            if (ok) ok.click();
          }
        });
        listHost.append(row);
      });
      if (!visible.length) listHost.append(U.el("div", { class: "li muted", text: "(empty)" }));
    }

    return U.dialog({
      title: opts.title || "Select a file",
      icon: "find",
      width: 420,
      height: 330,
      autoHeight: false,
      buttons: [
        {
          label: "OK", value: "ok", primary: true,
          action() {},
        },
        { label: "Cancel", value: null },
      ],
      content: (w) => {
        const wrap = U.el("div", { style: { width: "100%" } });
        const bar = U.el("div", { class: "row", style: { marginBottom: "5px" } });
        const upBtn = U.el("button", { type: "button", class: "btn-small", text: "Up" });
        pathField = U.el("input", { type: "text", value: current, style: { flex: "1" } });
        const goBtn = U.el("button", { type: "button", class: "btn-small", text: "Go" });
        bar.append(upBtn, pathField, goBtn);
        listHost = U.el("div", { class: "settings-list", style: { height: "190px" } });
        wrap.append(bar, listHost);

        upBtn.addEventListener("click", () => load(U.dirname(current)));
        goBtn.addEventListener("click", () => load(pathField.value || "/"));
        pathField.addEventListener("keydown", (event) => {
          if (event.key === "Enter") load(pathField.value || "/");
        });
        setTimeout(() => {
          const buttons = w.el.querySelectorAll(".dialog-buttons button");
          okButton = buttons[0];
          if (okButton) {
            okButton.classList.add("nas-picker-ok");
            okButton.disabled = mode === "file";
          }
        }, 30);
        load(current);
        return wrap;
      },
    }).then((result) => {
      if (result !== "ok") return null;
      if (mode === "dir") return selected || current;
      return selected;
    });
  };

  U.bytesBar = function bytesBar(used, total) {
    const pct = total ? Math.max(0, Math.min(100, (used / total) * 100)) : 0;
    return U.el("div", { class: "storage-bar" },
      U.el("div", { class: "used", style: { width: pct + "%" } }),
      U.el("div", { class: "free" })
    );
  };

  window.U = U;
})();
