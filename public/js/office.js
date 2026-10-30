/* Win95 NAS - Microsoft Word / Excel / PowerPoint viewers */
(function () {
  "use strict";

  const Office = (window.Office = {});

  const APPS = {
    word: { name: "Microsoft Word", icon: "word", ext: ".docx" },
    excel: { name: "Microsoft Excel", icon: "excel", ext: ".xlsx" },
    powerpoint: { name: "Microsoft PowerPoint", icon: "powerpoint", ext: ".pptx" },
  };
  const NEW_NAMES = {
    word: "New Word Document.docx",
    excel: "New Excel Worksheet.xlsx",
    powerpoint: "New PowerPoint Presentation.pptx",
  };
  const KIND_BY_EXT = {
    docx: "word", doc: "word", docm: "word", rtf: "word",
    xlsx: "excel", xls: "excel", xlsm: "excel",
    pptx: "powerpoint", ppt: "powerpoint", pptm: "powerpoint", pps: "powerpoint", ppsx: "powerpoint",
  };

  const mediaUrl = (path, name) => API.officeMediaUrl(path, name);

  function kindOfPath(path) {
    const ext = String(path || "").split(".").pop().toLowerCase();
    return KIND_BY_EXT[ext] || "";
  }

  function download(item) {
    API.download(item.path, item.name);
  }

  function menuFor(win, item, kind, extra) {
    U.menuBar(win, [
      { label: "File", items: [
        { label: "New", icon: kind, action: () => Office.createAt(U.dirname(item.path), kind) },
        { label: "Open...", icon: "folder", action: () => Office.launch(kind) },
        { separator: true },
        { label: "Download", icon: "download", action: () => download(item) },
        { label: "Properties", icon: "settings", action: () => Apps.properties(item.path) },
        { separator: true },
        { label: "Close", action: () => win.close() },
      ] },
      ...(extra ? extra(win) : []),
      { label: "Help", items: [
        { label: "About " + APPS[kind].name, icon: "info", action: () => U.alert(
          APPS[kind].name,
          "A small " + APPS[kind].name + " viewer built into Win95 NAS. It reads ." +
          APPS[kind].ext.slice(1) + " files with the Python standard library, so nothing extra needs installing.",
          APPS[kind].icon) },
      ] },
    ]);
  }

  // ------------------------------------------------------------------ open
  Office.open = async function open(entry) {
    let item = entry;
    if (typeof item === "string") {
      try { item = await API.stat(item); }
      catch (err) { U.alert("Cannot open document", err.message, "error"); return; }
    }
    if (!item) return;
    const kind = item.kind && APPS[item.kind] ? item.kind : kindOfPath(item.name || item.path);
    if (!kind) { U.alert("Open Document", "That file is not a Word, Excel or PowerPoint document.", "warning"); return; }
    let model;
    try {
      model = await API.office(item.path);
    } catch (err) {
      U.alert(APPS[kind].name, err.message, "error");
      return;
    }
    if (model.unsupported) { Office.unsupported(item, model, kind); return; }
    if (model.type === "word") Office.word(item, model);
    else if (model.type === "excel") Office.excel(item, model);
    else if (model.type === "powerpoint") Office.powerpoint(item, model);
  };

  Office.unsupported = function unsupported(item, model, kind) {
    const win = WM.open({
      title: item.name + " - " + APPS[kind].name,
      icon: APPS[kind].icon,
      width: 620,
      height: 480,
      minWidth: 360,
      minHeight: 260,
      build(body, w) {
        const app = U.el("div", { class: "office-app office-unsupported" });
        const note = U.el("div", { class: "office-note" });
        note.append(
          U.el("div", { class: "office-note-title", text: "This is an old binary Office file" }),
          U.el("div", { text: "Win95 NAS can only fully read the modern XML formats (.docx, .xlsx, .pptx). " +
            "This file uses the pre-2007 format, so here is a best-effort text preview." }),
          U.el("div", { class: "office-note-actions" },
            U.el("button", { type: "button", text: "Download", onclick: () => download(item) }),
            U.el("button", { type: "button", text: "Open folder", onclick: () => Explorer.open(U.dirname(item.path)) }))
        );
        const pre = U.el("pre", { class: "office-legacy-text", text: model.text || "(No readable text found in this file.)" });
        app.append(note, pre);
        body.append(app);
        menuFor(w, item, kind);
      },
    });
    return win;
  };

  // ------------------------------------------------------------------ word
  function runSpan(run) {
    const style = {};
    if (run.bold) style.fontWeight = "bold";
    if (run.italic) style.fontStyle = "italic";
    if (run.underline) style.textDecoration = "underline";
    if (run.strike) style.textDecoration = (style.textDecoration ? style.textDecoration + " " : "") + "line-through";
    if (run.color) style.color = run.color;
    if (run.background) style.background = run.background;
    if (run.font) style.fontFamily = "'" + run.font + "', serif";
    if (run.size) style.fontSize = run.size + "px";
    if (run.script === "super") { style.verticalAlign = "super"; style.fontSize = "smaller"; }
    if (run.script === "sub") { style.verticalAlign = "sub"; style.fontSize = "smaller"; }
    const span = U.el("span", { text: run.text });
    Object.assign(span.style, style);
    if (run.href) {
      span.style.color = span.style.color || "#0000ee";
      span.style.textDecoration = "underline";
      span.style.cursor = "pointer";
      span.title = run.href;
      span.addEventListener("click", () => window.open(run.href, "_blank", "noopener"));
    }
    return span;
  }

  function wordBlock(block, path, counters) {
    if (block.type === "image") {
      const wrap = U.el("div", { class: "doc-image" });
      const img = U.el("img", {
        src: mediaUrl(path, block.src),
        alt: "",
        loading: "lazy",
        style: {
          width: block.width ? block.width + "px" : "auto",
          height: block.height ? block.height + "px" : "auto",
          maxWidth: "100%",
        },
      });
      img.addEventListener("error", () => { wrap.textContent = "(image could not be shown)"; });
      wrap.append(img);
      return wrap;
    }
    if (block.type === "table") {
      const table = U.el("table", { class: "doc-table" });
      block.rows.forEach((row) => {
        const tr = U.el("tr");
        row.forEach((cell) => {
          if (cell.vmerge === "continue") return;
          const td = U.el("td", { text: cell.text || "" });
          if (cell.colspan > 1) td.colSpan = cell.colspan;
          if (cell.rowspan > 1) td.rowSpan = cell.rowspan;
          if (cell.bold) td.style.fontWeight = "bold";
          if (cell.background) td.style.background = cell.background;
          if (cell.width) td.style.width = cell.width + "px";
          tr.append(td);
        });
        table.append(tr);
      });
      return table;
    }
    const p = U.el("p", { class: "doc-p" });
    if (block.heading !== undefined) p.classList.add("doc-h" + Math.min(4, block.heading));
    if (block.align) p.style.textAlign = block.align;
    if (block.indent) p.style.marginLeft = block.indent + "px";
    if (block.before) p.style.marginTop = block.before + "px";
    if (block.after) p.style.marginBottom = block.after + "px";
    if (block.lineHeight) p.style.lineHeight = block.lineHeight;
    if (block.background) p.style.background = block.background;
    if (block.blank) p.append(U.el("span", { html: "&nbsp;" }));
    if (block.list) {
      const level = block.level || 0;
      p.style.marginLeft = (level * 22 + (block.indent || 0)) + "px";
      p.style.textIndent = "-16px";
      let marker = "\u2022  ";
      if (block.list === "number") {
        counters[level] = (counters[level] || 0) + 1;
        Object.keys(counters).forEach((key) => { if (Number(key) > level) delete counters[key]; });
        marker = counters[level] + ".  ";
      }
      p.append(U.el("span", { class: "doc-bullet", text: marker }));
    } else if (!block.indent) {
      Object.keys(counters).forEach((key) => { delete counters[key]; });
    }
    (block.runs || []).forEach((run) => p.append(runSpan(run)));
    if (block.pageBreakBefore) p.classList.add("doc-page-break");
    return p;
  }

  Office.word = function word(item, model) {
    const page = model.page || { width: 8.5, height: 11, margins: { top: 1, right: 1, bottom: 1, left: 1 } };
    const margins = page.margins || { top: 1, right: 1, bottom: 1, left: 1 };
    const pageW = Math.round((page.width || 8.5) * 96);
    const pageH = Math.round((page.height || 11) * 96);
    let zoom = 1;
    let autoFit = true;

    const win = WM.open({
      title: item.name + " - Microsoft Word",
      icon: "word",
      width: 880,
      height: 720,
      minWidth: 460,
      minHeight: 340,
      build(body, w) {
        const app = U.el("div", { class: "office-app word-app" });
        const bar = U.el("div", { class: "office-toolbar" });
        const zoomOut = U.el("button", { type: "button", title: "Zoom out", text: "\u2212" });
        const zoomIn = U.el("button", { type: "button", title: "Zoom in", text: "+" });
        const zoomLabel = U.el("span", { class: "office-zoom-label", text: "100%" });
        const fitBtn = U.el("button", { type: "button", text: "Fit width" });
        const pages = U.el("span", { class: "office-muted", text: "1 page" });
        const saveBtn = U.el("button", { type: "button", class: "office-save-btn", text: "Save", disabled: "true" });
        const editBtn = U.el("button", { type: "button", text: "Edit" });
        const boldBtn = U.el("button", { type: "button", title: "Bold (Ctrl+B)", text: "B", style: { fontWeight: "bold" } });
        const italicBtn = U.el("button", { type: "button", title: "Italic (Ctrl+I)", text: "I", style: { fontStyle: "italic" } });
        const underBtn = U.el("button", { type: "button", title: "Underline (Ctrl+U)", text: "U", style: { textDecoration: "underline" } });
        const alignBtn = U.el("button", { type: "button", title: "Cycle alignment", text: "\u2261" });
        const bulletBtn = U.el("button", { type: "button", title: "Bulleted list", text: "\u2022" });
        const sizeSelect = U.el("select", { class: "office-size-select", title: "Font size" });
        [["", "Size"], ["10", "10"], ["12", "12"], ["14", "14"], ["18", "18"], ["24", "24"], ["32", "32"]].forEach(([value, label]) => {
          sizeSelect.append(U.el("option", { value, text: label }));
        });
        const wordCount = U.el("span", { class: "office-muted", text: "" });
        bar.append(
          U.el("span", { class: "office-app-icon", html: Icons.get("word", 16) }),
          U.el("span", { class: "office-doc-name", text: item.name }),
          U.el("span", { class: "office-spacer" }),
          saveBtn, editBtn, U.el("span", { class: "office-sep" }),
          boldBtn, italicBtn, underBtn, alignBtn, bulletBtn, sizeSelect,
          U.el("span", { class: "office-sep" }),
          zoomOut, zoomLabel, zoomIn, fitBtn,
          U.el("span", { class: "office-sep" }),
          pages, wordCount
        );

        const scroll = U.el("div", { class: "word-scroll" });
        const stage = U.el("div", { class: "word-stage" });
        const sheet = U.el("div", { class: "word-page" });
        sheet.style.width = pageW + "px";
        sheet.style.minHeight = pageH + "px";
        sheet.style.padding = [margins.top, margins.right, margins.bottom, margins.left]
          .map((v) => Math.round((v || 1) * 96) + "px").join(" ");
        const listCounters = {};
        (model.blocks || []).forEach((block) => sheet.append(wordBlock(block, item.path, listCounters)));
        if (!model.blocks || !model.blocks.length) {
          sheet.append(U.el("p", { class: "doc-empty", text: "This document is empty. Open it in Word to start writing." }));
        }
        stage.append(sheet);
        scroll.append(stage);
        app.append(bar, scroll);
        body.append(app);

        let editing = false;
        let dirty = false;
        let currentPath = item.path;

        function setDirty(value) {
          dirty = value;
          saveBtn.disabled = !dirty;
          w.setTitle((dirty ? "*" : "") + item.name + " - Microsoft Word");
        }

        function updateWordCount() {
          const text = (sheet.innerText || "").trim();
          const words = text ? text.split(/\s+/).filter(Boolean).length : 0;
          wordCount.textContent = words + " word" + (words === 1 ? "" : "s");
        }

        function setEditing(value) {
          editing = value;
          sheet.contentEditable = value ? "true" : "false";
          sheet.classList.toggle("doc-editing", value);
          editBtn.textContent = value ? "Stop editing" : "Edit";
          if (value) {
            // The "empty document" hint is only a hint: never save it as text.
            const hint = sheet.querySelector(".doc-empty");
            if (hint) hint.remove();
            sheet.focus();
            updateWordCount();
          }
        }

        function exec(command, value) {
          if (!editing) setEditing(true);
          sheet.focus();
          try {
            document.execCommand("styleWithCSS", false, true);
            document.execCommand(command, false, value || null);
          } catch (_e) { /* not supported */ }
          setDirty(true);
          updateWordCount();
        }

        async function save() {
          if (!dirty) return true;
          try {
            const model = { html: sheet.innerHTML, page };
            await API.officeSave(currentPath, "word", model);
            setDirty(false);
            U.toast("Saved " + item.name, "success");
            window.dispatchEvent(new CustomEvent("nas:files-changed"));
            return true;
          } catch (err) {
            U.alert("Microsoft Word", err.message, "error");
            return false;
          }
        }

        saveBtn.addEventListener("click", save);
        editBtn.addEventListener("click", () => setEditing(!editing));
        boldBtn.addEventListener("click", () => exec("bold"));
        italicBtn.addEventListener("click", () => exec("italic"));
        underBtn.addEventListener("click", () => exec("underline"));
        bulletBtn.addEventListener("click", () => exec("insertUnorderedList"));
        let alignIndex = 0;
        alignBtn.addEventListener("click", () => {
          const modes = ["justifyLeft", "justifyCenter", "justifyRight", "justifyFull"];
          exec(modes[alignIndex % modes.length]);
          alignIndex += 1;
        });
        sizeSelect.addEventListener("change", () => {
          if (!sizeSelect.value) return;
          if (!editing) setEditing(true);
          sheet.focus();
          const sel = window.getSelection();
          if (sel && sel.rangeCount && !sel.isCollapsed) {
            const range = sel.getRangeAt(0);
            const span = document.createElement("span");
            span.style.fontSize = sizeSelect.value + "px";
            try {
              span.appendChild(range.extractContents());
              range.insertNode(span);
              setDirty(true);
              updateWordCount();
            } catch (_e) { /* ignore */ }
          }
          sizeSelect.value = "";
        });
        sheet.addEventListener("input", () => { setDirty(true); updateWordCount(); });
        sheet.addEventListener("keydown", (event) => {
          if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
            event.preventDefault();
            save();
          }
        });
        updateWordCount();

        function apply() {
          sheet.style.zoom = zoom;
          zoomLabel.textContent = Math.round(zoom * 100) + "%";
        }
        function fit() {
          autoFit = true;
          const available = Math.max(200, scroll.clientWidth - 46);
          zoom = Math.min(1, available / pageW);
          apply();
        }
        function bump(factor) {
          autoFit = false;
          zoom = U.clamp(zoom * factor, 0.25, 3);
          apply();
        }
        zoomOut.addEventListener("click", () => bump(1 / 1.15));
        zoomIn.addEventListener("click", () => bump(1.15));
        fitBtn.addEventListener("click", fit);
        scroll.addEventListener("wheel", (event) => {
          if (!event.ctrlKey) return;
          event.preventDefault();
          bump(event.deltaY < 0 ? 1.1 : 1 / 1.1);
        }, { passive: false });
        const ro = new ResizeObserver(() => { if (autoFit) fit(); });
        ro.observe(scroll);
        w.opts.onClose = () => ro.disconnect();
        requestAnimationFrame(() => {
          fit();
          const padTop = Math.round((margins.top || 1) * 96);
          const padBottom = Math.round((margins.bottom || 1) * 96);
          const pageContent = Math.max(1, pageH - padTop - padBottom);
          const used = Math.max(1, sheet.scrollHeight - padTop - padBottom);
          const count = Math.max(1, Math.ceil(used / pageContent));
          pages.textContent = count + " page" + (count === 1 ? "" : "s");
        });

        menuFor(w, item, "word", () => [
          { label: "Edit", items: [
            { label: "Save", shortcut: "Ctrl+S", action: save },
            { label: "Edit document", checked: editing, action: () => setEditing(!editing) },
            { separator: true },
            { label: "Undo", shortcut: "Ctrl+Z", action: () => exec("undo") },
            { label: "Redo", shortcut: "Ctrl+Y", action: () => exec("redo") },
            { separator: true },
            { label: "Cut", action: () => exec("cut") },
            { label: "Copy", action: () => exec("copy") },
            { label: "Paste", action: () => exec("paste") },
            { label: "Select All", action: () => exec("selectAll") },
            { separator: true },
            { label: "Insert date", action: () => exec("insertText", new Date().toLocaleDateString()) },
            { label: "Insert time", action: () => exec("insertText", new Date().toLocaleTimeString()) },
          ] },
          { label: "Format", items: [
            { label: "Bold", shortcut: "Ctrl+B", action: () => exec("bold") },
            { label: "Italic", shortcut: "Ctrl+I", action: () => exec("italic") },
            { label: "Underline", shortcut: "Ctrl+U", action: () => exec("underline") },
            { separator: true },
            { label: "Align left", action: () => exec("justifyLeft") },
            { label: "Center", action: () => exec("justifyCenter") },
            { label: "Align right", action: () => exec("justifyRight") },
            { label: "Justify", action: () => exec("justifyFull") },
            { separator: true },
            { label: "Bulleted list", action: () => exec("insertUnorderedList") },
            { label: "Numbered list", action: () => exec("insertOrderedList") },
            { separator: true },
            { label: "Heading 1", action: () => exec("formatBlock", "<h1>") },
            { label: "Heading 2", action: () => exec("formatBlock", "<h2>") },
            { label: "Normal text", action: () => exec("formatBlock", "<p>") },
            { separator: true },
            { label: "Text color...", action: async () => {
              const color = await U.prompt("Text color", "Enter a colour (name or #rrggbb):", "#000080");
              if (color) exec("foreColor", color);
            } },
            { label: "Highlight...", action: async () => {
              const color = await U.prompt("Highlight", "Enter a colour (name or #rrggbb):", "#ffff00");
              if (color) exec("hiliteColor", color);
            } },
            { label: "Clear formatting", action: () => exec("removeFormat") },
          ] },
          { label: "View", items: [
            { label: "Zoom In", action: () => bump(1.15) },
            { label: "Zoom Out", action: () => bump(1 / 1.15) },
            { label: "Fit Width", action: fit },
            { separator: true },
            { label: "Word count", action: () => U.alert("Word Count", wordCount.textContent || "0 words", "word") },
          ] },
          { label: "Insert", items: [
            { label: "New Word Document", icon: "word", action: () => Office.createAt(U.dirname(item.path), "word") },
          ] },
        ]);
      },
    });
    return win;
  };

  // ------------------------------------------------------------------ excel
  const COL_LETTERS = (() => {
    const out = [""];
    for (let i = 1; i <= 80; i += 1) {
      let n = i, s = "";
      while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); }
      out[i] = s;
    }
    return out;
  })();

  // ------------------------------------------------------ spreadsheet formulas
  // A small but real formula engine: cell refs, ranges, arithmetic, comparisons,
  // text concatenation and the usual spreadsheet functions.
  const XL_FUNCS = {
    SUM: (args) => args.flat(Infinity).reduce((a, b) => a + (num(b) || 0), 0),
    AVERAGE: (args) => {
      const values = args.flat(Infinity).map(num).filter((v) => v !== null);
      return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
    },
    MIN: (args) => {
      const values = args.flat(Infinity).map(num).filter((v) => v !== null);
      return values.length ? Math.min(...values) : 0;
    },
    MAX: (args) => {
      const values = args.flat(Infinity).map(num).filter((v) => v !== null);
      return values.length ? Math.max(...values) : 0;
    },
    COUNT: (args) => args.flat(Infinity).filter((v) => num(v) !== null).length,
    COUNTA: (args) => args.flat(Infinity).filter((v) => v !== "" && v !== null && v !== undefined).length,
    PRODUCT: (args) => args.flat(Infinity).map(num).filter((v) => v !== null).reduce((a, b) => a * b, 1),
    ABS: (args) => Math.abs(num(args[0]) || 0),
    SQRT: (args) => Math.sqrt(Math.max(0, num(args[0]) || 0)),
    ROUND: (args) => {
      const digits = num(args[1]) || 0;
      const factor = Math.pow(10, digits);
      return Math.round((num(args[0]) || 0) * factor) / factor;
    },
    INT: (args) => Math.floor(num(args[0]) || 0),
    MOD: (args) => (num(args[0]) || 0) % (num(args[1]) || 1),
    POWER: (args) => Math.pow(num(args[0]) || 0, num(args[1]) || 0),
    IF: (args) => (truthy(args[0]) ? args[1] : (args.length > 2 ? args[2] : "")),
    AND: (args) => args.flat(Infinity).every(truthy),
    OR: (args) => args.flat(Infinity).some(truthy),
    NOT: (args) => !truthy(args[0]),
    LEN: (args) => String(args[0] == null ? "" : args[0]).length,
    UPPER: (args) => String(args[0] == null ? "" : args[0]).toUpperCase(),
    LOWER: (args) => String(args[0] == null ? "" : args[0]).toLowerCase(),
    TRIM: (args) => String(args[0] == null ? "" : args[0]).trim(),
    CONCAT: (args) => args.flat(Infinity).map((v) => (v == null ? "" : String(v))).join(""),
    CONCATENATE: (args) => args.flat(Infinity).map((v) => (v == null ? "" : String(v))).join(""),
    TODAY: () => new Date().toLocaleDateString(),
    NOW: () => new Date().toLocaleString(),
  };

  function num(value) {
    if (typeof value === "number") return isFinite(value) ? value : null;
    if (value === null || value === undefined || value === "") return null;
    if (typeof value === "boolean") return value ? 1 : 0;
    const cleaned = String(value).replace(/[,\s$%]/g, "");
    if (cleaned === "") return null;
    const parsed = Number(cleaned);
    return isFinite(parsed) ? parsed : null;
  }

  function truthy(value) {
    if (Array.isArray(value)) return value.some(truthy);
    if (typeof value === "boolean") return value;
    if (typeof value === "number") return value !== 0;
    return !!value && String(value).toLowerCase() !== "false";
  }

  function colIndex(letters) {
    let n = 0;
    for (const ch of letters.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
    return n;
  }

  function tokenizeFormula(text) {
    const tokens = [];
    let i = 0;
    while (i < text.length) {
      const ch = text[i];
      if (/\s/.test(ch)) { i += 1; continue; }
      if (/[0-9.]/.test(ch)) {
        let j = i;
        while (j < text.length && /[0-9.]/.test(text[j])) j += 1;
        tokens.push({ type: "number", value: Number(text.slice(i, j)) });
        i = j;
        continue;
      }
      if (ch === '"') {
        let j = i + 1;
        let value = "";
        while (j < text.length) {
          if (text[j] === '"') {
            if (text[j + 1] === '"') { value += '"'; j += 2; continue; }
            break;
          }
          value += text[j];
          j += 1;
        }
        tokens.push({ type: "string", value });
        i = j + 1;
        continue;
      }
      if (/[A-Za-z_]/.test(ch)) {
        let j = i;
        while (j < text.length && /[A-Za-z0-9_.]/.test(text[j])) j += 1;
        const word = text.slice(i, j);
        const ref = /^\$?([A-Za-z]+)\$?([0-9]+)$/.exec(word);
        if (ref) {
          tokens.push({ type: "ref", col: colIndex(ref[1]), row: Number(ref[2]) });
        } else {
          tokens.push({ type: "name", value: word.toUpperCase() });
        }
        i = j;
        continue;
      }
      const two = text.slice(i, i + 2);
      if (["<=", ">=", "<>"].includes(two)) { tokens.push({ type: "op", value: two }); i += 2; continue; }
      if ("+-*/^&(),:<>=%".includes(ch)) { tokens.push({ type: "op", value: ch }); i += 1; continue; }
      i += 1;
    }
    return tokens;
  }

  function evaluateFormula(text, getValue) {
    const tokens = tokenizeFormula(String(text || ""));
    let pos = 0;
    const peek = () => tokens[pos];
    const eat = (value) => {
      const token = tokens[pos];
      if (token && (value === undefined || token.value === value)) { pos += 1; return token; }
      return null;
    };

    function parseExpression() { return parseCompare(); }

    function parseCompare() {
      let left = parseAdd();
      while (peek() && peek().type === "op" && ["=", "<>", "<", ">", "<=", ">="].includes(peek().value)) {
        const op = eat().value;
        const right = parseAdd();
        if (op === "=") left = left === right || String(left) === String(right);
        else if (op === "<>") left = !(left === right || String(left) === String(right));
        else if (op === "<") left = num(left) < num(right);
        else if (op === ">") left = num(left) > num(right);
        else if (op === "<=") left = num(left) <= num(right);
        else if (op === ">=") left = num(left) >= num(right);
      }
      return left;
    }

    function parseAdd() {
      let left = parseMul();
      while (peek() && peek().type === "op" && (peek().value === "+" || peek().value === "-" || peek().value === "&")) {
        const op = eat().value;
        const right = parseMul();
        if (op === "&") left = String(left == null ? "" : left) + String(right == null ? "" : right);
        else if (op === "+") left = (num(left) || 0) + (num(right) || 0);
        else left = (num(left) || 0) - (num(right) || 0);
      }
      return left;
    }

    function parseMul() {
      let left = parsePow();
      while (peek() && peek().type === "op" && (peek().value === "*" || peek().value === "/")) {
        const op = eat().value;
        const right = parsePow();
        if (op === "*") left = (num(left) || 0) * (num(right) || 0);
        else left = (num(left) || 0) / (num(right) || 1);
      }
      return left;
    }

    function parsePow() {
      let left = parseUnary();
      while (peek() && peek().type === "op" && peek().value === "^") {
        eat();
        left = Math.pow(num(left) || 0, num(parseUnary()) || 0);
      }
      return left;
    }

    function parseUnary() {
      if (peek() && peek().type === "op" && (peek().value === "-" || peek().value === "+")) {
        const op = eat().value;
        const value = num(parseUnary()) || 0;
        return op === "-" ? -value : value;
      }
      return parsePrimary();
    }

    function readRange(token) {
      if (token.type !== "ref") return null;
      // Consume the reference that got us here; otherwise the caller keeps
      // seeing it and never reaches the ":" or the next operator.
      eat();
      let r1 = token.row, c1 = token.col, r2 = r1, c2 = c1;
      let isRange = false;
      if (peek() && peek().type === "op" && peek().value === ":") {
        eat(":");
        const next = eat();
        if (next && next.type === "ref") { r2 = next.row; c2 = next.col; isRange = true; }
      }
      if (!isRange) return { range: false, values: [getValue(r1, c1)] };
      const values = [];
      for (let r = Math.min(r1, r2); r <= Math.max(r1, r2); r += 1) {
        for (let c = Math.min(c1, c2); c <= Math.max(c1, c2); c += 1) {
          values.push(getValue(r, c));
        }
      }
      return { range: true, values };
    }

    function parsePrimary() {
      const token = peek();
      if (!token) return "";
      if (token.type === "number") { eat(); return token.value; }
      if (token.type === "string") { eat(); return token.value; }
      if (token.type === "ref") {
        const range = readRange(token);
        if (range) return range.range ? range.values : range.values[0];
        return getValue(token.row, token.col);
      }
      if (token.type === "name") {
        eat();
        const name = token.value;
        if (peek() && peek().value === "(") {
          eat("(");
          const args = [];
          if (peek() && peek().value !== ")") {
            do { args.push(parseExpression()); } while (eat(","));
          }
          eat(")");
          const fn = XL_FUNCS[name];
          if (!fn) return "#NAME?";
          try { return fn(args); } catch (_e) { return "#ERROR!"; }
        }
        if (name === "TRUE") return true;
        if (name === "FALSE") return false;
        return "#NAME?";
      }
      if (token.type === "op" && token.value === "(") {
        eat("(");
        const value = parseExpression();
        eat(")");
        return value;
      }
      eat();
      return "";
    }

    if (!tokens.length) return "";
    try {
      const result = parseExpression();
      return Array.isArray(result) ? result[0] : result;
    } catch (_e) {
      return "#ERROR!";
    }
  }

  // Recalculate every formula cell in a sheet map, in place.
  function recalcSheet(map) {    const memo = new Map();
    const visiting = new Set();
    function cellValue(r, c) {
      const key = r + ":" + c;
      const cell = map.get(key);
      if (!cell) return 0;
      if (cell.f) {
        if (memo.has(key)) return memo.get(key);
        if (visiting.has(key)) return "#CYCLE!";
        visiting.add(key);
        let value;
        try { value = evaluateFormula(cell.f, cellValue); }
        catch (_e) { value = "#ERROR!"; }
        visiting.delete(key);
        if (Array.isArray(value)) value = value[0];
        memo.set(key, value);
        cell.v = value;
        cell.t = typeof value === "number" ? "n" : "s";
        return value;
      }
      return cell.v;
    }
    map.forEach((cell, key) => {
      if (!cell.f) return;
      const [r, c] = key.split(":").map(Number);
      cellValue(r, c);
    });
  }

  Office.excel = function excel(item, model) {
    const sheets = model.sheets || [];
    let active = U.clamp(model.active || 0, 0, Math.max(0, sheets.length - 1));
    let selected = { r: 1, c: 1 };
    let cellsBySheet = [];

    const win = WM.open({
      title: item.name + " - Microsoft Excel",
      icon: "excel",
      width: 940,
      height: 660,
      minWidth: 480,
      minHeight: 320,
      build(body, w) {
        const app = U.el("div", { class: "office-app excel-app" });
        const bar = U.el("div", { class: "office-toolbar excel-toolbar" });
        const nameBox = U.el("div", { class: "xl-name", text: "A1" });
        const fx = U.el("span", { class: "xl-fx", text: "fx" });
        const formula = U.el("input", { class: "xl-formula", value: "", spellcheck: "false" });
        const saveBtn = U.el("button", { type: "button", class: "office-save-btn", text: "Save", disabled: "true" });
        const boldBtn = U.el("button", { type: "button", title: "Bold", text: "B", style: { fontWeight: "bold" } });
        const italicBtn = U.el("button", { type: "button", title: "Italic", text: "I", style: { fontStyle: "italic" } });
        const underBtn = U.el("button", { type: "button", title: "Underline", text: "U", style: { textDecoration: "underline" } });
        const alignBtn = U.el("button", { type: "button", title: "Cycle alignment", text: "\u2261" });
        const fillBtn = U.el("button", { type: "button", title: "Fill colour", text: "\u25A0" });
        const clearBtn = U.el("button", { type: "button", title: "Clear cell", text: "\u2715" });
        bar.append(
          U.el("span", { class: "office-app-icon", html: Icons.get("excel", 16) }),
          U.el("span", { class: "office-doc-name", text: item.name }),
          U.el("span", { class: "office-spacer" }),
          saveBtn, U.el("span", { class: "office-sep" }),
          boldBtn, italicBtn, underBtn, alignBtn, fillBtn, clearBtn,
          U.el("span", { class: "office-sep" }),
          U.el("span", { class: "office-muted", text: sheets.length + " sheet" + (sheets.length === 1 ? "" : "s") })
        );

        const formulaRow = U.el("div", { class: "xl-formula-row" });
        formulaRow.append(nameBox, fx, formula);

        const gridWrap = U.el("div", { class: "xl-grid-wrap", tabindex: "0" });
        const tabs = U.el("div", { class: "xl-tabs" });
        const status = U.el("div", { class: "xl-status" });

        app.append(bar, formulaRow, gridWrap, tabs, status);
        body.append(app);

        function buildCells(sheet) {
          const map = new Map();
          (sheet.rows || []).forEach((row) => {
            (row.cells || []).forEach((cell) => map.set(row.r + ":" + cell.c, cell));
          });
          return map;
        }
        cellsBySheet = sheets.map(buildCells);
        cellsBySheet.forEach(recalcSheet);

        let dirty = false;
        function setDirty(value) {
          dirty = value;
          saveBtn.disabled = !dirty;
          w.setTitle((dirty ? "*" : "") + item.name + " - Microsoft Excel");
        }

        function currentCell() {
          return cellsBySheet[active].get(selected.r + ":" + selected.c) || null;
        }

        function ensureCell(r, c) {
          const key = r + ":" + c;
          let cell = cellsBySheet[active].get(key);
          if (!cell) {
            cell = { c, v: "" };
            cellsBySheet[active].set(key, cell);
          }
          return cell;
        }

        function commitValue(r, c, text) {
          const map = cellsBySheet[active];
          const key = r + ":" + c;
          const value = String(text == null ? "" : text);
          if (value === "") {
            map.delete(key);
          } else if (value.charAt(0) === "=") {
            const cell = ensureCell(r, c);
            cell.f = value.slice(1);
            cell.v = "";
            cell.t = "n";
          } else {
            const cell = ensureCell(r, c);
            cell.f = null;
            const numeric = num(value);
            if (numeric !== null && String(numeric) === value.replace(/^\+/, "").trim()) {
              cell.v = numeric;
              cell.t = "n";
            } else {
              cell.v = value;
              cell.t = "s";
            }
          }
          recalcSheet(map);
          setDirty(true);
          render();
          paintSelection();
        }

        function applyFormat(patch) {
          const cell = ensureCell(selected.r, selected.c);
          Object.assign(cell, patch);
          recalcSheet(cellsBySheet[active]);
          setDirty(true);
          render();
          paintSelection();
        }

        async function save() {
          if (!dirty) return true;
          try {
            const modelSheets = sheets.map((sheet, index) => {
              const map = cellsBySheet[index];
              const rowsMap = new Map();
              map.forEach((cell, key) => {
                const [r, c] = key.split(":").map(Number);
                if (!rowsMap.has(r)) rowsMap.set(r, []);
                rowsMap.get(r).push({
                  c,
                  v: cell.v == null ? "" : cell.v,
                  f: cell.f || undefined,
                  t: cell.t || (typeof cell.v === "number" ? "n" : "s"),
                  bold: cell.bold || undefined,
                  italic: cell.italic || undefined,
                  underline: cell.underline || undefined,
                  color: cell.color || undefined,
                  background: cell.background || undefined,
                  align: cell.align || undefined,
                  size: cell.size || undefined,
                  wrap: cell.wrap || undefined,
                });
              });
              const rows = Array.from(rowsMap.entries())
                .sort((a, b) => a[0] - b[0])
                .map(([r, cells]) => ({ r, cells: cells.sort((a, b) => a.c - b.c) }));
              return { name: sheet.name, widths: sheet.widths || {}, rows };
            });
            await API.officeSave(item.path, "excel", { sheets: modelSheets, active });
            setDirty(false);
            U.toast("Saved " + item.name, "success");
            window.dispatchEvent(new CustomEvent("nas:files-changed"));
            return true;
          } catch (err) {
            U.alert("Microsoft Excel", err.message, "error");
            return false;
          }
        }

        function colWidth(sheet, c) {
          const value = sheet.widths && sheet.widths[String(c)];
          return value ? U.clamp(value, 28, 320) : 68;
        }

        function render() {
          const sheet = sheets[active];
          if (!sheet) return;
          const map = cellsBySheet[active];
          const rowLimit = Math.min(400, Math.max(30, (sheet.maxRow || 0) + 12));
          const colLimit = Math.min(60, Math.max(14, (sheet.maxCol || 0) + 4));
          const covered = new Set();
          const table = U.el("table", { class: "xl-grid" });
          const colgroup = U.el("colgroup");
          colgroup.append(U.el("col", { style: { width: "42px" } }));
          for (let c = 1; c <= colLimit; c += 1) {
            colgroup.append(U.el("col", { style: { width: colWidth(sheet, c) + "px" } }));
          }
          table.append(colgroup);
          const thead = U.el("thead");
          const headRow = U.el("tr");
          headRow.append(U.el("th", { class: "xl-corner" }));
          for (let c = 1; c <= colLimit; c += 1) {
            headRow.append(U.el("th", { class: "xl-colhead", text: COL_LETTERS[c] || String(c) }));
          }
          thead.append(headRow);
          table.append(thead);

          const tbody = U.el("tbody");
          for (let r = 1; r <= rowLimit; r += 1) {
            const tr = U.el("tr");
            tr.append(U.el("th", { class: "xl-rowhead", text: String(r) }));
            for (let c = 1; c <= colLimit; c += 1) {
              if (covered.has(r + ":" + c)) continue;
              const cell = map.get(r + ":" + c);
              const td = U.el("td", { class: "xl-cell" });
              td.dataset.r = String(r);
              td.dataset.c = String(c);
              if (cell) {
                if (cell.colspan > 1 || cell.rowspan > 1) {
                  td.colSpan = cell.colspan || 1;
                  td.rowSpan = cell.rowspan || 1;
                  for (let rr = r; rr < r + (cell.rowspan || 1); rr += 1) {
                    for (let cc = c; cc < c + (cell.colspan || 1); cc += 1) {
                      if (rr !== r || cc !== c) covered.add(rr + ":" + cc);
                    }
                  }
                }
                td.textContent = cell.v === "" ? "" : String(cell.v);
                if (cell.align) td.style.textAlign = cell.align === "centerContinuous" ? "center" : cell.align;
                if (cell.bold) td.style.fontWeight = "bold";
                if (cell.italic) td.style.fontStyle = "italic";
                if (cell.underline) td.style.textDecoration = "underline";
                if (cell.color) td.style.color = cell.color;
                if (cell.background) td.style.background = cell.background;
                if (cell.size) td.style.fontSize = U.clamp(cell.size, 8, 26) + "px";
                if (cell.wrap) td.style.whiteSpace = "pre-wrap";
                if (cell.f) td.title = "=" + cell.f;
              }
              tr.append(td);
            }
            tbody.append(tr);
          }
          table.append(tbody);
          gridWrap.innerHTML = "";
          gridWrap.append(table);
          if (selected.r > rowLimit || selected.c > colLimit) selected = { r: 1, c: 1 };
          paintSelection();
          renderTabs();
          status.textContent = "Ready" +
            ((sheet.maxRow || 0) > rowLimit || (sheet.maxCol || 0) > colLimit
              ? "  \u00B7  showing the first " + rowLimit + " rows and " + colLimit + " columns"
              : "") +
            (sheet.truncated ? "  \u00B7  large sheet, preview truncated" : "");
        }

        function paintSelection() {
          U.qsa(".xl-cell.selected", gridWrap).forEach((n) => n.classList.remove("selected"));
          const td = gridWrap.querySelector('.xl-cell[data-r="' + selected.r + '"][data-c="' + selected.c + '"]');
          if (td) {
            td.classList.add("selected");
            nameBox.textContent = (COL_LETTERS[selected.c] || selected.c) + selected.r;
            const cell = cellsBySheet[active].get(selected.r + ":" + selected.c);
            formula.value = cell ? (cell.f ? "=" + cell.f : (cell.v == null ? "" : String(cell.v))) : "";
            td.scrollIntoView({ block: "nearest", inline: "nearest" });
          } else {
            nameBox.textContent = (COL_LETTERS[selected.c] || selected.c) + selected.r;
            formula.value = "";
          }
        }

        function renderTabs() {
          tabs.innerHTML = "";
          sheets.forEach((sheet, index) => {
            const button = U.el("button", {
              type: "button",
              class: "xl-tab" + (index === active ? " active" : ""),
              text: sheet.name || ("Sheet" + (index + 1)),
              title: "Double-click to rename",
            });
            button.addEventListener("click", () => {
              active = index;
              selected = { r: 1, c: 1 };
              render();
            });
            button.addEventListener("dblclick", async () => {
              const name = await U.prompt("Rename Sheet", "New sheet name:", sheet.name || ("Sheet" + (index + 1)));
              if (!name) return;
              sheet.name = name.slice(0, 31);
              setDirty(true);
              renderTabs();
            });
            button.addEventListener("contextmenu", async (event) => {
              event.preventDefault();
              if (sheets.length <= 1) { U.alert("Microsoft Excel", "A workbook needs at least one sheet.", "info"); return; }
              if (!await U.confirm("Delete Sheet", "Delete the sheet \"" + (sheet.name || "Sheet") + "\"?", "warning")) return;
              sheets.splice(index, 1);
              cellsBySheet.splice(index, 1);
              active = Math.max(0, Math.min(active, sheets.length - 1));
              selected = { r: 1, c: 1 };
              setDirty(true);
              render();
            });
            tabs.append(button);
          });
          const add = U.el("button", { type: "button", class: "xl-tab xl-tab-add", text: "+", title: "Add a sheet" });
          add.addEventListener("click", () => {
            const number = sheets.length + 1;
            sheets.push({ name: "Sheet" + number, rows: [], widths: {}, maxRow: 0, maxCol: 0 });
            cellsBySheet.push(new Map());
            active = sheets.length - 1;
            selected = { r: 1, c: 1 };
            setDirty(true);
            render();
          });
          tabs.append(add);
        }

        let editingCell = null;

        function beginEdit(r, c, initial) {
          const td = gridWrap.querySelector('.xl-cell[data-r="' + r + '"][data-c="' + c + '"]');
          if (!td) return;
          const map = cellsBySheet[active];
          const cell = map.get(r + ":" + c);
          const original = cell ? (cell.f ? "=" + cell.f : (cell.v == null ? "" : String(cell.v))) : "";
          editingCell = { r, c };
          td.textContent = "";
          td.contentEditable = "true";
          td.classList.add("xl-editing");
          td.textContent = initial !== undefined ? initial : original;
          td.focus();
          const range = document.createRange();
          range.selectNodeContents(td);
          range.collapse(false);
          const sel = window.getSelection();
          sel.removeAllRanges();
          sel.addRange(range);

          function finish(commit) {
            if (!editingCell || editingCell.r !== r || editingCell.c !== c) return;
            const text = td.innerText.replace(/\r?\n$/, "");
            td.contentEditable = "false";
            td.classList.remove("xl-editing");
            editingCell = null;
            document.removeEventListener("mousedown", onOutside, true);
            if (commit) commitValue(r, c, text);
            else { render(); paintSelection(); gridWrap.focus(); }
          }
          function onOutside(event) {
            if (!td.contains(event.target)) finish(true);
          }
          td.addEventListener("keydown", (event) => {
            if (event.key === "Enter") { event.preventDefault(); finish(true); }
            else if (event.key === "Escape") { event.preventDefault(); finish(false); }
            else if (event.key === "Tab") {
              event.preventDefault();
              finish(true);
              selected.c += event.shiftKey ? -1 : 1;
              selected.c = Math.max(1, selected.c);
              paintSelection();
            }
          });
          td.addEventListener("blur", () => finish(true), { once: true });
          setTimeout(() => document.addEventListener("mousedown", onOutside, true), 0);
        }

        gridWrap.addEventListener("click", (event) => {
          const td = event.target.closest(".xl-cell");
          if (!td || editingCell) return;
          selected = { r: Number(td.dataset.r), c: Number(td.dataset.c) };
          paintSelection();
          gridWrap.focus();
        });
        gridWrap.addEventListener("dblclick", (event) => {
          const td = event.target.closest(".xl-cell");
          if (!td) return;
          selected = { r: Number(td.dataset.r), c: Number(td.dataset.c) };
          beginEdit(selected.r, selected.c);
        });
        gridWrap.addEventListener("keydown", (event) => {
          if (editingCell) return;
          const keys = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
          if (keys[event.key]) {
            event.preventDefault();
            selected.r = Math.max(1, selected.r + keys[event.key][0]);
            selected.c = Math.max(1, selected.c + keys[event.key][1]);
            paintSelection();
          } else if (event.key === "Home") {
            event.preventDefault(); selected.c = 1; paintSelection();
          } else if (event.key === "End") {
            event.preventDefault(); selected.c = 14; paintSelection();
          } else if (event.key === "PageDown") {
            event.preventDefault(); selected.r += 20; paintSelection();
          } else if (event.key === "PageUp") {
            event.preventDefault(); selected.r = Math.max(1, selected.r - 20); paintSelection();
          } else if (event.key === "Delete" || event.key === "Backspace") {
            event.preventDefault();
            commitValue(selected.r, selected.c, "");
          } else if (event.key === "Enter") {
            event.preventDefault();
            beginEdit(selected.r, selected.c);
          } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
            event.preventDefault();
            beginEdit(selected.r, selected.c, event.key);
          }
        });

        formula.addEventListener("keydown", (event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            commitValue(selected.r, selected.c, formula.value);
            gridWrap.focus();
          } else if (event.key === "Escape") {
            event.preventDefault();
            paintSelection();
            gridWrap.focus();
          }
        });
        formula.addEventListener("focus", () => { formula.select(); });

        saveBtn.addEventListener("click", save);
        boldBtn.addEventListener("click", () => applyFormat({ bold: !(currentCell() && currentCell().bold) }));
        italicBtn.addEventListener("click", () => applyFormat({ italic: !(currentCell() && currentCell().italic) }));
        underBtn.addEventListener("click", () => applyFormat({ underline: !(currentCell() && currentCell().underline) }));
        const aligns = ["left", "center", "right", ""];
        let alignIndex = 0;
        alignBtn.addEventListener("click", () => {
          applyFormat({ align: aligns[alignIndex % aligns.length] });
          alignIndex += 1;
        });
        fillBtn.addEventListener("click", async () => {
          const color = await U.prompt("Fill Colour", "Enter a colour (name or #rrggbb), or leave blank to clear:", "#ffff99");
          if (color === null) return;
          applyFormat({ background: color || "" });
        });
        clearBtn.addEventListener("click", () => commitValue(selected.r, selected.c, ""));

        render();
        requestAnimationFrame(() => gridWrap.focus());

        menuFor(w, item, "excel", () => [
          { label: "Edit", items: [
            { label: "Save", shortcut: "Ctrl+S", action: save },
            { label: "Edit cell", shortcut: "Enter", action: () => beginEdit(selected.r, selected.c) },
            { label: "Clear cell", shortcut: "Del", action: () => commitValue(selected.r, selected.c, "") },
            { separator: true },
            { label: "Recalculate", action: () => { cellsBySheet.forEach(recalcSheet); render(); U.toast("Recalculated"); } },
          ] },
          { label: "Format", items: [
            { label: "Bold", action: () => applyFormat({ bold: !(currentCell() && currentCell().bold) }) },
            { label: "Italic", action: () => applyFormat({ italic: !(currentCell() && currentCell().italic) }) },
            { label: "Underline", action: () => applyFormat({ underline: !(currentCell() && currentCell().underline) }) },
            { separator: true },
            { label: "Align left", action: () => applyFormat({ align: "left" }) },
            { label: "Center", action: () => applyFormat({ align: "center" }) },
            { label: "Align right", action: () => applyFormat({ align: "right" }) },
            { separator: true },
            { label: "Wrap text", action: () => applyFormat({ wrap: !(currentCell() && currentCell().wrap) }) },
          ] },
          { label: "Insert", items: [
            { label: "New sheet", action: () => {
              const number = sheets.length + 1;
              sheets.push({ name: "Sheet" + number, rows: [], widths: {}, maxRow: 0, maxCol: 0 });
              cellsBySheet.push(new Map());
              active = sheets.length - 1;
              setDirty(true);
              render();
            } },
          ] },
          { label: "View", items: [
            { label: "Sheet tabs", checked: true, disabled: true },
            { label: "Formula help", action: () => U.alert("Microsoft Excel",
              "Formulas start with = and support cell references (A1), ranges (A1:B9) and functions:\n\n" +
              "SUM, AVERAGE, MIN, MAX, COUNT, COUNTA, PRODUCT, ABS, SQRT, ROUND, INT, MOD, POWER, IF, AND, OR, NOT, LEN, UPPER, LOWER, TRIM, CONCAT, TODAY, NOW.\n\n" +
              "Example: =SUM(B2:B10)  or  =IF(A1>5,\"Big\",\"Small\")", "excel") },
          ] },
        ]);
      },
    });
    return win;
  };

  // ------------------------------------------------------------------ powerpoint
  function pptShape(shape, path, editable, onChange) {
    const node = U.el("div", { class: "ppt-shape" });
    node.style.left = shape.x + "px";
    node.style.top = shape.y + "px";
    node.style.width = Math.max(1, shape.w) + "px";
    node.style.height = Math.max(1, shape.h) + "px";
    if (shape.rot) node.style.transform = "rotate(" + shape.rot + "deg)";
    if (shape.fill) node.style.background = shape.fill;
    if (shape.line) node.style.border = (shape.lineWidth || 1) + "px solid " + shape.line;
    if (shape.geom === "ellipse") node.style.borderRadius = "50%";
    else if (shape.geom && shape.geom.toLowerCase().indexOf("round") === 0) node.style.borderRadius = "10px";

    if (shape.type === "image") {
      const img = U.el("img", { src: mediaUrl(path, shape.src), alt: "", draggable: "false" });
      img.style.width = "100%";
      img.style.height = "100%";
      node.append(img);
      return node;
    }
    if (shape.type === "table") {
      const table = U.el("table", { class: "ppt-table" });
      (shape.rows || []).forEach((row) => {
        const tr = U.el("tr");
        row.forEach((text) => tr.append(U.el("td", { text })));
        table.append(tr);
      });
      node.append(table);
      return node;
    }
    if (shape.paragraphs && shape.paragraphs.length) {
      const text = U.el("div", { class: "ppt-text" });
      text.style.justifyContent = shape.valign === "ctr" ? "center" : (shape.valign === "b" ? "flex-end" : "flex-start");
      text.style.textAlign = shape.align || "left";
      shape.paragraphs.forEach((para) => {
        const p = U.el("div", { class: "ppt-p" });
        if (para.bullet) {
          p.style.paddingLeft = ((para.level || 0) * 18) + "px";
          p.append(U.el("span", { class: "ppt-bullet", text: para.bullet === "number" ? "1. " : "\u2022 " }));
        }
        const runs = para.runs || [];
        if (!runs.length) p.append(U.el("span", { html: "&nbsp;" }));
        runs.forEach((run) => {
          const span = U.el("span", { text: run.text });
          if (run.bold) span.style.fontWeight = "bold";
          if (run.italic) span.style.fontStyle = "italic";
          if (run.underline) span.style.textDecoration = "underline";
          if (run.color) span.style.color = run.color;
          if (run.font) span.style.fontFamily = "'" + run.font + "', sans-serif";
          if (run.size) span.style.fontSize = run.size + "px";
          else if (para.size) span.style.fontSize = para.size + "px";
          p.append(span);
        });
        text.append(p);
      });
      if (editable) {
        text.contentEditable = "true";
        text.classList.add("ppt-editing");
        text.title = "Click to edit this text";
        text.addEventListener("mousedown", (event) => event.stopPropagation());
        text.addEventListener("blur", () => { if (onChange) onChange(shape, text); });
      }
      node.append(text);
    }
    return node;
  }

  function renderPptSlide(slide, model, path, editable, onChange) {
    const node = U.el("div", { class: "ppt-slide" });
    node.style.width = model.size.w + "px";
    node.style.height = model.size.h + "px";
    node.style.background = slide.background || "#ffffff";
    (slide.shapes || []).forEach((shape) => node.append(pptShape(shape, path, editable, onChange)));
    return node;
  }

  Office.powerpoint = function powerpoint(item, model) {
    let index = 0;
    const size = model.size || { w: 960, h: 720 };
    let autoFit = true;
    let zoom = 1;
    let slideNode = null;

    const win = WM.open({
      title: item.name + " - Microsoft PowerPoint",
      icon: "powerpoint",
      width: 1000,
      height: 720,
      minWidth: 520,
      minHeight: 360,
      build(body, w) {
        const app = U.el("div", { class: "office-app ppt-app" });
        const bar = U.el("div", { class: "office-toolbar" });
        const prev = U.el("button", { type: "button", title: "Previous slide", text: "\u25C0" });
        const next = U.el("button", { type: "button", title: "Next slide", text: "\u25B6" });
        const counter = U.el("span", { class: "office-muted" });
        const show = U.el("button", { type: "button", text: "Slideshow" });
        const fitBtn = U.el("button", { type: "button", text: "Fit" });
        const saveBtn = U.el("button", { type: "button", class: "office-save-btn", text: "Save", disabled: "true" });
        const addSlide = U.el("button", { type: "button", title: "New slide", text: "New slide" });
        const dupSlide = U.el("button", { type: "button", title: "Duplicate slide", text: "Duplicate" });
        const delSlide = U.el("button", { type: "button", title: "Delete slide", text: "Delete" });
        const upSlide = U.el("button", { type: "button", title: "Move slide up", text: "\u25B2" });
        const downSlide = U.el("button", { type: "button", title: "Move slide down", text: "\u25BC" });
        const bgBtn = U.el("button", { type: "button", title: "Slide background colour", text: "Background" });
        bar.append(
          U.el("span", { class: "office-app-icon", html: Icons.get("powerpoint", 16) }),
          U.el("span", { class: "office-doc-name", text: item.name }),
          U.el("span", { class: "office-spacer" }),
          saveBtn, U.el("span", { class: "office-sep" }),
          prev, next, counter, U.el("span", { class: "office-sep" }),
          addSlide, dupSlide, delSlide, upSlide, downSlide, bgBtn,
          U.el("span", { class: "office-sep" }),
          show, fitBtn
        );

        const main = U.el("div", { class: "ppt-main" });
        const thumbs = U.el("div", { class: "ppt-thumbs" });
        const stage = U.el("div", { class: "ppt-stage" });
        main.append(thumbs, stage);
        const status = U.el("div", { class: "ppt-status" });
        app.append(bar, main, status);
        body.append(app);

        let dirty = false;
        function setDirty(value) {
          dirty = value;
          saveBtn.disabled = !dirty;
          w.setTitle((dirty ? "*" : "") + item.name + " - Microsoft PowerPoint");
        }

        function syncShapeText(shape, node) {
          const lines = String(node.innerText || "").replace(/\r/g, "").split("\n");
          const previous = shape.paragraphs || [];
          shape.paragraphs = lines.map((line, i) => {
            const source = previous[i] || previous[0] || { runs: [] };
            const baseRun = (source.runs && source.runs[0]) || (previous[0] && previous[0].runs && previous[0].runs[0]) || {};
            const para = { runs: line ? [Object.assign({}, baseRun, { text: line })] : [] };
            if (source.align) para.align = source.align;
            if (source.bullet) para.bullet = source.bullet;
            if (source.level) para.level = source.level;
            if (source.size) para.size = source.size;
            return para;
          });
          if (shape.align) shape.align = shape.align;
          setDirty(true);
          renderThumbs();
        }

        async function save() {
          if (!dirty) return true;
          const hasComplex = (model.slides || []).some((slide) =>
            (slide.shapes || []).some((shape) => shape.type && shape.type !== "shape"));
          if (hasComplex) {
            const ok = await U.confirm("Microsoft PowerPoint",
              "This slide contains pictures or tables. Saving rebuilds the file from the editable text and shapes, so those items will be removed.\n\nSave anyway?",
              "warning");
            if (!ok) return false;
          }
          try {
            const payload = {
              size: model.size,
              slides: (model.slides || []).map((slide) => ({
                background: slide.background || "#ffffff",
                shapes: (slide.shapes || []).filter((shape) => !shape.type || shape.type === "shape").map((shape) => ({
                  x: shape.x, y: shape.y, w: shape.w, h: shape.h,
                  geom: shape.geom, rot: shape.rot,
                  fill: shape.fill, line: shape.line, lineWidth: shape.lineWidth,
                  valign: shape.valign,
                  paragraphs: (shape.paragraphs || []).map((para) => ({
                    align: para.align, bullet: para.bullet, level: para.level,
                    runs: (para.runs || []).map((run) => ({
                      text: run.text, bold: run.bold, italic: run.italic,
                      underline: run.underline, color: run.color, size: run.size, font: run.font,
                    })),
                  })),
                })),
              })),
            };
            await API.officeSave(item.path, "powerpoint", payload);
            setDirty(false);
            U.toast("Saved " + item.name, "success");
            window.dispatchEvent(new CustomEvent("nas:files-changed"));
            return true;
          } catch (err) {
            U.alert("Microsoft PowerPoint", err.message, "error");
            return false;
          }
        }

        function blankSlide() {
          return {
            background: "#ffffff",
            shapes: [{
              type: "shape", x: 60, y: 60, w: size.w - 120, h: 120,
              geom: "rect", valign: "t",
              paragraphs: [{ runs: [{ text: "Click to add a title", size: 36, bold: true, color: "#000080" }] }],
            }, {
              type: "shape", x: 60, y: 210, w: size.w - 120, h: size.h - 280,
              geom: "rect", valign: "t",
              paragraphs: [{ runs: [{ text: "Click to add text", size: 20, color: "#000000" }] }],
            }],
          };
        }

        function thumbFor(slide, i) {
          const box = U.el("div", { class: "ppt-thumb" + (i === index ? " active" : "") });
          box.dataset.index = String(i);
          const holder = U.el("div", { class: "ppt-thumb-holder" });
          const node = renderPptSlide(slide, model, item.path);
          const scale = 138 / size.w;
          node.style.zoom = scale;
          holder.append(node);
          box.append(holder, U.el("span", { class: "ppt-thumb-num", text: String(i + 1) }));
          box.addEventListener("click", () => go(i));
          return box;
        }

        function renderThumbs() {
          thumbs.innerHTML = "";
          model.slides.forEach((slide, i) => thumbs.append(thumbFor(slide, i)));
        }

        function applyZoom() {
          if (slideNode) slideNode.style.zoom = zoom;
        }

        function fit() {
          autoFit = true;
          const availableW = Math.max(160, stage.clientWidth - 26);
          const availableH = Math.max(120, stage.clientHeight - 26);
          zoom = Math.min(1, availableW / size.w, availableH / size.h);
          applyZoom();
        }

        function go(nextIndex) {
          index = U.clamp(nextIndex, 0, model.slides.length - 1);
          slideNode = renderPptSlide(model.slides[index], model, item.path, true, syncShapeText);
          stage.innerHTML = "";
          const holder = U.el("div", { class: "ppt-slide-holder" });
          holder.append(slideNode);
          stage.append(holder);
          applyZoom();
          counter.textContent = "Slide " + (index + 1) + " of " + model.slides.length;
          status.textContent = "Slide " + (index + 1) + " of " + model.slides.length +
            "  \u00B7  double-click text to edit it";
          U.qsa(".ppt-thumb", thumbs).forEach((n) => n.classList.toggle("active", Number(n.dataset.index) === index));
          const activeThumb = thumbs.querySelector('.ppt-thumb[data-index="' + index + '"]');
          if (activeThumb) activeThumb.scrollIntoView({ block: "nearest" });
        }

        function afterSlideChange(nextIndex) {
          renderThumbs();
          go(nextIndex);
          setDirty(true);
        }

        saveBtn.addEventListener("click", save);
        addSlide.addEventListener("click", () => {
          model.slides.splice(index + 1, 0, blankSlide());
          afterSlideChange(index + 1);
        });
        dupSlide.addEventListener("click", () => {
          const copy = JSON.parse(JSON.stringify(model.slides[index] || blankSlide()));
          model.slides.splice(index + 1, 0, copy);
          afterSlideChange(index + 1);
        });
        delSlide.addEventListener("click", async () => {
          if (model.slides.length <= 1) { U.alert("Microsoft PowerPoint", "A presentation needs at least one slide.", "info"); return; }
          if (!await U.confirm("Delete Slide", "Delete slide " + (index + 1) + "?", "warning")) return;
          model.slides.splice(index, 1);
          afterSlideChange(Math.max(0, index - 1));
        });
        upSlide.addEventListener("click", () => {
          if (index <= 0) return;
          const slide = model.slides[index];
          model.slides[index] = model.slides[index - 1];
          model.slides[index - 1] = slide;
          afterSlideChange(index - 1);
        });
        downSlide.addEventListener("click", () => {
          if (index >= model.slides.length - 1) return;
          const slide = model.slides[index];
          model.slides[index] = model.slides[index + 1];
          model.slides[index + 1] = slide;
          afterSlideChange(index + 1);
        });
        bgBtn.addEventListener("click", async () => {
          const color = await U.prompt("Slide Background", "Enter a colour (name or #rrggbb):", model.slides[index].background || "#ffffff");
          if (!color) return;
          model.slides[index].background = color;
          renderThumbs();
          go(index);
          setDirty(true);
        });

        function startShow() {
          const overlay = U.el("div", { class: "ppt-show" });
          const canvas = U.el("div", { class: "ppt-show-stage" });
          overlay.append(canvas, U.el("div", { class: "ppt-show-hint", text: "Esc to exit  \u00B7  arrow keys to move" }));
          document.body.append(overlay);
          let showIndex = index;
          let showNode = null;
          let showZoom = 1;
          function paint() {
            canvas.innerHTML = "";
            showNode = renderPptSlide(model.slides[showIndex], model, item.path);
            const w = window.innerWidth - 40;
            const h = window.innerHeight - 40;
            showZoom = Math.min(w / size.w, h / size.h);
            showNode.style.zoom = showZoom;
            canvas.append(showNode);
          }
          function onKey(event) {
            if (event.key === "Escape") { event.preventDefault(); close(); }
            else if (event.key === "ArrowRight" || event.key === " " || event.key === "PageDown") {
              event.preventDefault();
              if (showIndex < model.slides.length - 1) { showIndex += 1; paint(); }
            } else if (event.key === "ArrowLeft" || event.key === "PageUp") {
              event.preventDefault();
              if (showIndex > 0) { showIndex -= 1; paint(); }
            }
          }
          function close() {
            window.removeEventListener("keydown", onKey);
            overlay.remove();
            if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
          }
          overlay.addEventListener("click", () => {
            if (showIndex < model.slides.length - 1) { showIndex += 1; paint(); }
            else close();
          });
          window.addEventListener("keydown", onKey);
          paint();
          if (overlay.requestFullscreen) overlay.requestFullscreen().catch(() => {});
        }

        prev.addEventListener("click", () => go(index - 1));
        next.addEventListener("click", () => go(index + 1));
        show.addEventListener("click", startShow);
        fitBtn.addEventListener("click", fit);
        stage.addEventListener("wheel", (event) => {
          if (!event.ctrlKey) return;
          event.preventDefault();
          autoFit = false;
          zoom = U.clamp(zoom * (event.deltaY < 0 ? 1.1 : 1 / 1.1), 0.2, 2);
          applyZoom();
        }, { passive: false });
        const ro = new ResizeObserver(() => { if (autoFit) fit(); });
        ro.observe(stage);
        w.opts.onClose = () => ro.disconnect();
        w.onKey = (event) => {
          if (event.key === "ArrowRight" || event.key === "PageDown") { event.preventDefault(); go(index + 1); }
          else if (event.key === "ArrowLeft" || event.key === "PageUp") { event.preventDefault(); go(index - 1); }
          else if (event.key === "F5") { event.preventDefault(); startShow(); }
        };

        renderThumbs();
        go(0);
        requestAnimationFrame(fit);

        menuFor(w, item, "powerpoint", () => [
          { label: "Edit", items: [
            { label: "Save", shortcut: "Ctrl+S", action: save },
            { separator: true },
            { label: "New slide", action: () => { model.slides.splice(index + 1, 0, blankSlide()); afterSlideChange(index + 1); } },
            { label: "Duplicate slide", action: () => {
              const copy = JSON.parse(JSON.stringify(model.slides[index] || blankSlide()));
              model.slides.splice(index + 1, 0, copy);
              afterSlideChange(index + 1);
            } },
            { label: "Delete slide", action: () => delSlide.click() },
            { separator: true },
            { label: "Move slide up", action: () => upSlide.click() },
            { label: "Move slide down", action: () => downSlide.click() },
            { separator: true },
            { label: "Slide background...", action: () => bgBtn.click() },
          ] },
          { label: "View", items: [
            { label: "Slideshow", shortcut: "F5", action: startShow },
            { label: "Fit to window", action: fit },
          ] },
          { label: "Slide Show", items: [
            { label: "Play from start", action: () => { index = 0; startShow(); } },
            { label: "Play from current slide", action: startShow },
          ] },
        ]);
      },
    });
    return win;
  };

  // ------------------------------------------------------------------ create
  Office.createAt = async function createAt(folder, kind, opts) {
    opts = opts || {};
    const app = APPS[kind];
    if (!app) return null;
    const name = await U.prompt("New " + app.name + " Document",
      "Type a name for the new file:", opts.name || NEW_NAMES[kind]);
    if (!name) return null;
    try {
      const result = await API.newdoc(folder || "/Documents", name, kind);
      if (window.Desktop) Desktop.refresh();
      window.dispatchEvent(new CustomEvent("nas:files-changed"));
      U.toast("Created " + result.entry.name, "success");
      if (opts.open !== false) Office.open(result.entry);
      return result.entry;
    } catch (err) {
      U.alert("Could Not Create File", err.message, "error");
      return null;
    }
  };

  // ------------------------------------------------------------------ launcher
  Office.launch = async function launch(kind) {
    const app = APPS[kind];
    if (!app) return;
    const folders = ["/Documents", "/Desktop", "/"];
    const found = [];
    await Promise.all(folders.map(async (folder) => {
      try {
        const data = await API.list(folder);
        (data.entries || []).forEach((entry) => {
          if (entry.type === "file" && (entry.kind === kind || kindOfPath(entry.name) === kind)) {
            found.push(entry);
          }
        });
      } catch (_err) { /* folder may not exist */ }
    }));
    const seen = new Set();
    const files = found.filter((entry) => {
      if (seen.has(entry.path)) return false;
      seen.add(entry.path);
      return true;
    }).sort((a, b) => a.name.localeCompare(b.name));

    let chosen = null;
    let win = null;
    const openChosen = (entry) => {
      if (!entry) return;
      if (win) win.close();
      Office.open(entry);
    };

    await U.dialog({
      title: app.name,
      icon: app.icon,
      width: 540,
      height: files.length ? 400 : 210,
      autoHeight: false,
      message: files.length
        ? "Open a document, or start a new one."
        : "There are no " + app.name + " documents yet.",
      content: () => {
        const wrap = U.el("div", { class: "office-launcher" });
        const list = U.el("div", { class: "office-launcher-list" });
        if (!files.length) {
          list.append(U.el("div", { class: "office-launcher-empty",
            text: "Use the New button below, or right-click the Desktop and choose New." }));
        }
        files.forEach((entry) => {
          const row = U.el("button", { type: "button", class: "office-launcher-row", title: entry.path });
          row.append(
            U.el("span", { class: "office-launcher-ico", html: Icons.forEntry(entry) }),
            U.el("span", { class: "office-launcher-name", text: entry.name }),
            U.el("span", { class: "office-launcher-size", text: U.fmtSize(entry.size) })
          );
          row.addEventListener("dblclick", () => openChosen(entry));
          row.addEventListener("click", () => {
            chosen = entry;
            U.qsa(".office-launcher-row", list).forEach((n) => n.classList.remove("selected"));
            row.classList.add("selected");
            if (win) {
              const openBtn = win.el.querySelector(".dialog-buttons .office-open-btn");
              if (openBtn) openBtn.disabled = false;
            }
          });
          list.append(row);
        });
        wrap.append(list);
        return wrap;
      },
      buttons: [
        { label: "New...", value: "new", primary: true, action: () => {
          Office.createAt("/Documents", kind);
        } },
        { label: "Open", value: "open", close: false, action: () => {
          if (!chosen) return;
          const entry = chosen;
          if (win) win.close();
          Office.open(entry);
        } },
        { label: "Cancel", value: "cancel" },
      ],
      onBuild(w, text, buttonEls) {
        win = w;
        if (buttonEls[1]) {
          buttonEls[1].classList.add("office-open-btn");
          buttonEls[1].disabled = !files.length;
        }
        if (files.length) {
          const first = text.querySelector(".office-launcher-row");
          if (first) {
            chosen = files[0];
            first.classList.add("selected");
            if (buttonEls[1]) buttonEls[1].disabled = false;
          }
        }
        w.onKey = (event) => {
          if (event.key !== "Enter" || !chosen) return;
          const target = event.target;
          if (target && target.classList && target.classList.contains("office-launcher-row")) {
            event.preventDefault();
            if (win) win.close();
            Office.open(chosen);
          }
        };
      },
    });
  };

  Office.kindOfPath = kindOfPath;
})();
