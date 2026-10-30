/* Win95 NAS - Notepad */
(function () {
  "use strict";

  const Apps = (window.Apps = window.Apps || {});

  Apps.notepad = function notepad(startPath) {
    let currentPath = startPath || null;
    let dirty = false;
    let textarea = null;
    let status = null;
    let win = null;
    let wrap = true;
    let baseClose = null;

    function name() {
      return currentPath ? U.basename(currentPath) : "untitled";
    }

    function updateTitle() {
      if (!win) return;
      win.setTitle((dirty ? "*" : "") + name() + " - Notepad");
    }

    function updateStatus() {
      if (!status || !textarea) return;
      const pos = textarea.selectionStart || 0;
      const before = textarea.value.slice(0, pos);
      const line = before.split("\n").length;
      const col = pos - before.lastIndexOf("\n");
      status.textContent = "Ln " + line + ", Col " + col + "     " + textarea.value.length + " chars";
    }

    async function load(path) {
      try {
        const data = await API.text(path);
        currentPath = data.path;
        textarea.value = data.text;
        dirty = false;
        wrap = false;
        textarea.wrap = "off";
        updateTitle();
        updateStatus();
      } catch (err) {
        U.alert("Notepad", err.message, "error");
      }
    }

    async function save() {
      if (!currentPath) return saveAs();
      try {
        await API.saveText(currentPath, textarea.value);
        dirty = false;
        updateTitle();
        U.toast("Saved " + U.basename(currentPath), "success");
        return true;
      } catch (err) {
        U.alert("Notepad", err.message, "error");
        return false;
      }
    }

    async function saveAs() {
      const suggested = currentPath || "/Documents/untitled.txt";
      const target = await U.prompt("Save As", "Save the document on the NAS as:", suggested);
      if (!target) return false;
      let full = target.trim();
      if (!full.startsWith("/")) full = "/Documents/" + full;
      try {
        await API.saveText(full, textarea.value);
        currentPath = full;
        dirty = false;
        updateTitle();
        U.toast("Saved " + U.basename(full), "success");
        return true;
      } catch (err) {
        U.alert("Notepad", err.message, "error");
        return false;
      }
    }

    async function openFile() {
      const path = await U.nasPicker({ title: "Open", mode: "file", start: currentPath ? U.dirname(currentPath) : "/Documents" });
      if (!path) return;
      if (dirty && !await U.confirm("Notepad", "Discard unsaved changes?", "warning")) return;
      await load(path);
    }

    async function requestClose() {
      if (!dirty) { baseClose(); return; }
      const result = await U.dialog({
        title: "Notepad",
        icon: "warning",
        message: "Save changes to " + name() + "?",
        buttons: [
          { label: "Yes", value: "yes", primary: true },
          { label: "No", value: "no" },
          { label: "Cancel", value: null },
        ],
      });
      if (result === "yes") { if (await save()) baseClose(); }
      else if (result === "no") baseClose();
    }

    win = WM.open({
      title: "untitled - Notepad",
      icon: "notepad",
      pinId: "notepad",
      width: 560,
      height: 420,
      minWidth: 300,
      minHeight: 180,
      build(body, w) {
        const app = U.el("div", { class: "notepad-app" });
        textarea = U.el("textarea", { class: "notepad-text", spellcheck: "false", wrap: "soft" });
        const statusbar = U.el("div", { class: "statusbar" });
        status = U.el("div", { class: "status-panel grow", text: "Ln 1, Col 1" });
        statusbar.append(status);
        app.append(textarea, statusbar);
        body.append(app);

        textarea.addEventListener("input", () => {
          if (!dirty) { dirty = true; updateTitle(); }
          updateStatus();
        });
        textarea.addEventListener("keyup", updateStatus);
        textarea.addEventListener("click", updateStatus);
        textarea.addEventListener("keydown", (event) => {
          if (event.key === "Tab") {
            event.preventDefault();
            const start = textarea.selectionStart;
            const end = textarea.selectionEnd;
            textarea.value = textarea.value.slice(0, start) + "\t" + textarea.value.slice(end);
            textarea.selectionStart = textarea.selectionEnd = start + 1;
            textarea.dispatchEvent(new Event("input"));
          } else if (event.ctrlKey && event.key.toLowerCase() === "s") {
            event.preventDefault();
            save();
          }
        });

        function edit(command) {
          textarea.focus();
          try { document.execCommand(command); } catch (_e) { /* ignore */ }
        }

        U.menuBar(w, [
          { label: "File", items: [
            { label: "New", shortcut: "Ctrl+N", action: async () => {
              if (dirty && !await U.confirm("Notepad", "Discard unsaved changes?", "warning")) return;
              currentPath = null; textarea.value = ""; dirty = false; updateTitle(); updateStatus();
            } },
            { label: "Open...", shortcut: "Ctrl+O", action: openFile },
            { label: "Save", shortcut: "Ctrl+S", action: save },
            { label: "Save As...", action: saveAs },
            { separator: true },
            { label: "Exit", action: () => win.close() },
          ] },
          { label: "Edit", items: [
            { label: "Undo", shortcut: "Ctrl+Z", action: () => edit("undo") },
            { separator: true },
            { label: "Cut", shortcut: "Ctrl+X", action: () => edit("cut") },
            { label: "Copy", shortcut: "Ctrl+C", action: () => edit("copy") },
            { label: "Paste", shortcut: "Ctrl+V", action: () => edit("paste") },
            { label: "Delete", shortcut: "Del", action: () => edit("delete") },
            { separator: true },
            { label: "Select All", shortcut: "Ctrl+A", action: () => edit("selectAll") },
            { label: "Time/Date", shortcut: "F5", action: () => {
              const stamp = new Date().toLocaleString();
              const start = textarea.selectionStart;
              textarea.value = textarea.value.slice(0, start) + stamp + textarea.value.slice(textarea.selectionEnd);
              textarea.selectionStart = textarea.selectionEnd = start + stamp.length;
              textarea.dispatchEvent(new Event("input"));
            } },
          ] },
          { label: "Format", items: [
            { label: "Word Wrap", checked: wrap, action: () => {
              wrap = !wrap;
              textarea.wrap = wrap ? "soft" : "off";
              U.toast("Word wrap " + (wrap ? "on" : "off"));
            } },
          ] },
          { label: "Help", items: [
            { label: "About Notepad", action: () => U.alert("About Notepad", "Notepad\nA faithful-ish text editor for Win95 NAS.\n\nSaves straight to your NAS folder.", "notepad") },
          ] },
        ]);

        w.onKey = (event) => {
          if (event.ctrlKey && event.key.toLowerCase() === "s") { event.preventDefault(); save(); }
        };
      },
    });

    baseClose = win.close.bind(win);
    win.close = function () { requestClose(); };
    win.openPath = load;
    if (startPath) load(startPath);
    setTimeout(() => { if (textarea) textarea.focus(); }, 120);
    return win;
  };
})();
