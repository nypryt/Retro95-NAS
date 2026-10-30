/* Win95 NAS - Docker Manager */
(function () {
  "use strict";

  const Docker = {};
  let win = null;
  let status = null;
  let containers = [];
  let selected = null;
  let activeTab = "details";
  let filesPath = "/";
  let volumes = [];
  let selectedVolume = null;
  let logsTimer = null;
  let els = {};
  let busyDialog = null;

  function stateLed(state) {
    if (state === "running") return "led";
    if (state === "paused") return "led warn";
    if (state === "restarting") return "led warn";
    return "led off";
  }

  function busy(title, text) {
    const dialog = U.progressDialog(title, text || "Please wait...");
    const bar = dialog.win.el.querySelector(".progress");
    if (bar) bar.classList.add("indeterminate");
    const cancel = dialog.win.el.querySelector(".dialog-buttons, .progress");
    void cancel;
    dialog.close = function () { dialog.win.close(); };
    return dialog;
  }

  async function loadStatus() {
    try {
      status = await API.docker.status();
    } catch (err) {
      status = { installed: false, running: false, error: err.message };
    }
    renderBanner();
    if (status.running) await loadContainers();
    else {
      containers = [];
      selected = null;
      renderContainers();
      renderRight();
    }
  }

  async function loadContainers() {
    try {
      const data = await API.docker.containers();
      containers = data.containers || [];
      // Re-point the selection at the freshly fetched object. Keeping the old
      // object makes the details pane (and its Start/Stop buttons) go stale.
      const keepId = selected && selected.id;
      selected = keepId ? (containers.find((c) => c.id === keepId) || null) : null;
      if (!selected && containers.length) {
        selected = containers.find((c) => c.state === "running") || containers[0];
      }
      renderContainers();
      renderRight();
    } catch (err) {
      U.toast("Could not list containers: " + err.message, "error", 6000);
    }
  }

  function renderBanner() {
    if (!els.banner) return;
    els.banner.innerHTML = "";
    const running = status && status.running;
    const installed = status && status.installed;
    const led = U.el("span", { class: running ? "led" : (installed ? "led warn" : "led err") });
    const text = U.el("div", { style: { flex: "1", minWidth: "0" } });
    if (running) {
      text.append(
        U.el("div", { text: "Docker engine connected", style: { fontWeight: "bold" } }),
        U.el("div", { class: "muted", text: "v" + (status.version || "?") + " - " + (status.info && status.info.operatingSystem || "Docker") + " - " + (containers.length) + " container(s)" })
      );
    } else if (installed) {
      text.append(
        U.el("div", { text: "Docker is installed but the engine is not running", style: { fontWeight: "bold" } }),
        U.el("div", { class: "muted", text: status.error || "Start Docker Desktop and press Refresh." })
      );
    } else {
      text.append(
        U.el("div", { text: "Docker CLI not found", style: { fontWeight: "bold" } }),
        U.el("div", { class: "muted", text: status && status.error || "Install Docker Desktop to use these features." })
      );
    }
    els.banner.append(led, text);
    const refresh = U.el("button", { type: "button", text: "Refresh" });
    refresh.addEventListener("click", loadStatus);
    els.banner.append(refresh);
    if (installed && !running) {
      const start = U.el("button", { type: "button", text: "Start Docker Desktop" });
      start.addEventListener("click", async () => {
        try {
          await API.docker.startDesktop();
          U.toast("Starting Docker Desktop. This can take a minute...", "info", 6000);
          let tries = 0;
          const poll = setInterval(async () => {
            tries += 1;
            await loadStatus();
            if ((status && status.running) || tries > 20) clearInterval(poll);
          }, 4000);
        } catch (err) { U.alert("Docker", err.message, "error"); }
      });
      els.banner.append(start);
    }
    const help = U.el("button", { type: "button", text: "Help" });
    help.addEventListener("click", () => U.alert("Docker Manager",
      "This program talks to the Docker CLI installed on this PC.\n\n" +
      "- Browse containers and their filesystems\n" +
      "- Save files from a container onto this NAS (your PC)\n" +
      "- Copy NAS files into a container\n" +
      "- Back up and restore named volumes as .tar.gz files\n\n" +
      "Nothing leaves your machine.", "docker"));
    els.banner.append(help);
  }

  function renderContainers() {
    if (!els.list) return;
    els.list.innerHTML = "";
    if (!containers.length) {
      els.list.append(U.el("div", { class: "muted", style: { padding: "8px" }, text: status && status.running ? "No containers." : "Docker is offline." }));
      return;
    }
    containers.forEach((container) => {
      const row = U.el("div", { class: "d-item" + (selected && selected.id === container.id ? " selected" : "") });
      row.innerHTML =
        `<span class="${stateLed(container.state)}"></span>` +
        `<div style="min-width:0;flex:1"><div class="d-name"></div><div class="d-img"></div></div>`;
      row.querySelector(".d-name").textContent = container.name;
      row.querySelector(".d-img").textContent = container.image;
      row.title = container.name + "\n" + container.status + "\n" + container.ports;
      row.addEventListener("click", () => {
        selected = container;
        filesPath = "/";
        renderContainers();
        renderRight();
      });
      els.list.append(row);
    });
  }

  function switchTab(tab) {
    activeTab = tab;
    U.qsa(".docker-tab", els.tabs).forEach((node) => node.classList.toggle("active", node.dataset.tab === tab));
    ["details", "files", "logs", "volumes"].forEach((name) => {
      const pane = els.panes[name];
      if (pane) pane.hidden = name !== tab;
    });
    if (tab === "files") loadFiles(filesPath);
    if (tab === "logs") loadLogs();
    if (tab === "volumes") loadVolumes();
    if (tab === "details") renderDetails();
    if (tab !== "logs" && logsTimer) { clearInterval(logsTimer); logsTimer = null; }
  }

  function renderRight() {
    if (!els.tabs) return;
    renderDetails();
    if (activeTab === "files") loadFiles(filesPath);
    if (activeTab === "volumes") loadVolumes();
    if (activeTab === "logs") loadLogs();
  }

  function actionButtons(container) {
    const row = U.el("div", { class: "docker-actions" });
    function add(label, action, enabled) {
      const button = U.el("button", { type: "button", text: label });
      button.disabled = enabled === false;
      button.addEventListener("click", async () => {
        try {
          button.disabled = true;
          await API.docker.action(container.id, action);
          U.toast("docker " + action + " " + container.name, "success");
          // Refresh straight away: docker start/stop return after the state
          // change, so the buttons can be rebuilt from the real state.
          await loadContainers();
        } catch (err) { button.disabled = false; U.alert("Docker", err.message, "error"); }
      });
      row.append(button);
    }
    const running = container.state === "running";
    const paused = container.state === "paused";
    add("Start", "start", !running);
    add("Stop", "stop", running);
    add("Restart", "restart", running);
    add("Pause", "pause", running && !paused);
    add("Resume", "unpause", paused);
    const remove = U.el("button", { type: "button", text: "Remove" });
    remove.addEventListener("click", async () => {
      if (!await U.confirm("Remove container", "Force-remove container \u201C" + container.name + "\u201D? Its data inside the container will be lost.", "warning")) return;
      try {
        await API.docker.action(container.id, "remove");
        selected = null;
        U.toast("Container removed", "success");
        setTimeout(loadContainers, 500);
      } catch (err) { U.alert("Docker", err.message, "error"); }
    });
    row.append(remove);
    return row;
  }

  function renderDetails() {
    if (!els.details) return;
    els.details.innerHTML = "";
    if (!selected) {
      els.details.append(U.el("div", { class: "muted", style: { padding: "12px" }, text: "Select a container on the left." }));
      return;
    }
    const c = selected;
    const meta = U.el("dl", { class: "docker-meta" });
    const rows = [
      ["Name", c.name],
      ["Image", c.image],
      ["State", c.state + "  (" + c.status + ")"],
      ["Ports", c.ports || "-"],
      ["Mounts", c.mounts || "-"],
      ["Networks", c.networks || "-"],
      ["Container ID", c.shortId],
    ];
    rows.forEach(([key, value]) => {
      meta.append(U.el("dt", { text: key }), U.el("dd", { text: String(value) }));
    });
    els.details.append(meta, actionButtons(c));

    const inspectBtn = U.el("button", { type: "button", text: "Inspect JSON" });
    inspectBtn.addEventListener("click", async () => {
      try {
        const data = await API.docker.inspect(c.id);
        const text = JSON.stringify(data.inspect, null, 2);
        U.dialog({
          title: "Inspect - " + c.name,
          icon: "docker",
          width: 640,
          height: 420,
          autoHeight: false,
          message: "",
          content: () => U.el("pre", { class: "selectable", text, style: { height: "300px", overflow: "auto", background: "#fff", padding: "6px", boxShadow: "inset 1px 1px #808080", fontSize: "10px" } }),
          buttons: [{ label: "Close", value: true, primary: true }],
        });
      } catch (err) { U.alert("Docker", err.message, "error"); }
    });
    els.details.append(U.el("div", { class: "row", style: { marginTop: "8px" } }, inspectBtn));
    els.details.append(U.el("div", { class: "settings-note", style: { marginTop: "8px" }, text: "Use the Files tab to browse this container and copy files onto the NAS or back into the container." }));
  }

  async function loadFiles(path) {
    if (!els.files || !selected) return;
    els.files.innerHTML = "";
    els.files.append(U.el("div", { class: "muted", text: "Reading " + path + " ..." }));
    try {
      const data = await API.docker.ls(selected.id, path);
      filesPath = data.path;
      els.filePath.value = filesPath;
      renderFiles(data.entries);
    } catch (err) {
      els.files.innerHTML = "";
      els.files.append(U.el("div", { class: "muted", style: { padding: "8px" }, text: err.message }));
    }
  }

  function renderFiles(entries) {
    els.files.innerHTML = "";
    const table = U.el("table", { class: "docker-files" });
    const body = U.el("tbody");
    entries.forEach((entry) => {
      const row = U.el("tr");
      const nameCell = U.el("td");
      const wrap = U.el("div", { class: "f-name" });
      wrap.innerHTML = Icons.get(entry.type === "dir" ? "folder" : (Icons.has(entry.kind) ? entry.kind : "file"), 16);
      wrap.append(U.el("span", { text: entry.name }));
      nameCell.append(wrap);
      const sizeCell = U.el("td", { class: "num", text: entry.type === "dir" ? "" : U.fmtSize(entry.size) });
      const dateCell = U.el("td", { text: entry.mtime ? U.fmtDate(entry.mtime) : "" });
      row.append(nameCell, sizeCell, dateCell);
      row.addEventListener("dblclick", () => {
        if (entry.type === "dir") loadFiles(entry.path);
        else saveEntry(entry);
      });
      row.addEventListener("click", () => {
        U.qsa("tr", body).forEach((r) => r.classList.remove("selected"));
        row.classList.add("selected");
      });
      row.addEventListener("contextmenu", (event) => {
        event.preventDefault();
        U.contextMenu(event.clientX, event.clientY, [
          { label: "Save to NAS...", icon: "download", action: () => saveEntry(entry) },
          { label: "Download to browser", icon: "download", action: () => { window.location.href = API.docker.downloadUrl(selected.id, entry.path); } },
          { separator: true },
          { label: "Copy container path", action: () => { navigator.clipboard.writeText(entry.path).then(() => U.toast("Path copied")); } },
        ]);
      });
      body.append(row);
    });
    table.append(body);
    els.files.append(table);
    if (!entries.length) els.files.append(U.el("div", { class: "muted", style: { padding: "8px" }, text: "This folder is empty." }));
  }

  async function saveEntry(entry) {
    const defaultDest = "/Docker Backups/" + selected.name;
    const dest = await U.prompt("Save to NAS",
      "Save \u201C" + entry.name + "\u201D from container \u201C" + selected.name + "\u201D into this NAS folder:",
      defaultDest);
    if (!dest) return;
    const progress = busy("Saving from container", entry.name);
    try {
      const result = await API.docker.saveToNas(selected.id, entry.path, dest);
      progress.close();
      U.toast("Saved to " + result.dest, "success");
    } catch (err) {
      progress.close();
      U.alert("Docker", err.message, "error");
    }
  }

  async function loadLogs() {
    if (!els.logs || !selected) return;
    els.logs.textContent = "Loading logs...";
    try {
      const data = await API.docker.logs(selected.id, Number(els.logTail.value) || 300);
      els.logs.textContent = data.logs || "(no output)";
      els.logs.scrollTop = els.logs.scrollHeight;
    } catch (err) {
      els.logs.textContent = err.message;
    }
  }

  async function loadVolumes() {
    if (!els.volumes) return;
    els.volumes.innerHTML = "";
    els.volumes.append(U.el("div", { class: "muted", text: "Loading volumes..." }));
    try {
      const data = await API.docker.volumes();
      volumes = data.volumes || [];
      renderVolumes();
    } catch (err) {
      els.volumes.innerHTML = "";
      els.volumes.append(U.el("div", { class: "muted", style: { padding: "8px" }, text: err.message }));
    }
  }

  function renderVolumes() {
    els.volumes.innerHTML = "";
    const toolbar = U.el("div", { class: "docker-actions" });
    const createBtn = U.el("button", { type: "button", text: "Create volume" });
    const backupBtn = U.el("button", { type: "button", text: "Back up to NAS" });
    const restoreBtn = U.el("button", { type: "button", text: "Restore from NAS" });
    const inspectBtn = U.el("button", { type: "button", text: "Inspect" });
    const removeBtn = U.el("button", { type: "button", text: "Remove" });
    const helperBtn = U.el("button", { type: "button", text: "Prepare helper image" });
    toolbar.append(createBtn, backupBtn, restoreBtn, inspectBtn, removeBtn, helperBtn);
    els.volumes.append(toolbar);

    const list = U.el("div", { style: { marginTop: "6px" } });
    volumes.forEach((volume) => {
      const row = U.el("div", { class: "volume-row" + (selectedVolume === volume.name ? " selected" : "") });
      row.innerHTML = `<span class="t-ico">${Icons.get("drive", 16)}</span><span class="v-name"></span><span class="muted"></span>`;
      row.querySelector(".v-name").textContent = volume.name;
      row.querySelector(".muted").textContent = volume.driver;
      row.addEventListener("click", () => {
        selectedVolume = volume.name;
        renderVolumes();
      });
      row.addEventListener("dblclick", () => inspectVolume(volume.name));
      list.append(row);
    });
    if (!volumes.length) list.append(U.el("div", { class: "muted", style: { padding: "8px" }, text: "No named volumes." }));
    els.volumes.append(list);
    els.volumes.append(U.el("div", { class: "settings-note", style: { marginTop: "8px" }, text: "Backups are written to /Docker Backups/volumes on this PC. A small busybox helper container is used to read the volume." }));

    createBtn.addEventListener("click", async () => {
      const name = await U.prompt("Create volume", "Name for the new Docker volume:", "nas-volume");
      if (!name) return;
      try { await API.docker.createVolume(name); U.toast("Volume created", "success"); loadVolumes(); }
      catch (err) { U.alert("Docker", err.message, "error"); }
    });
    backupBtn.addEventListener("click", async () => {
      if (!selectedVolume) { U.toast("Select a volume first", "warning"); return; }
      const name = await U.prompt("Back up volume", "Archive name (saved in /Docker Backups/volumes):", selectedVolume + "-" + new Date().toISOString().slice(0, 10) + ".tar.gz");
      if (!name) return;
      const progress = busy("Backing up " + selectedVolume, "Reading volume into a tar.gz archive...");
      try {
        const result = await API.docker.backupVolume(selectedVolume, name);
        progress.close();
        U.toast("Backup saved: " + result.path + " (" + U.fmtSize(result.size) + ")", "success", 7000);
      } catch (err) {
        progress.close();
        U.alert("Backup failed", err.message, "error");
      }
    });
    restoreBtn.addEventListener("click", async () => {
      if (!selectedVolume) { U.toast("Select a volume first", "warning"); return; }
      const file = await U.nasPicker({ title: "Restore volume from NAS", mode: "file", start: "/Docker Backups/volumes" });
      if (!file) return;
      if (!await U.confirm("Restore volume", "Restore \u201C" + file + "\u201D into volume \u201C" + selectedVolume + "\u201D?\nExisting files with the same names will be overwritten.", "warning")) return;
      const progress = busy("Restoring " + selectedVolume, "Unpacking archive into the volume...");
      try {
        await API.docker.restoreVolume(selectedVolume, file);
        progress.close();
        U.toast("Volume restored", "success");
      } catch (err) {
        progress.close();
        U.alert("Restore failed", err.message, "error");
      }
    });
    inspectBtn.addEventListener("click", () => { if (selectedVolume) inspectVolume(selectedVolume); else U.toast("Select a volume first", "warning"); });
    removeBtn.addEventListener("click", async () => {
      if (!selectedVolume) { U.toast("Select a volume first", "warning"); return; }
      if (!await U.confirm("Remove volume", "Delete Docker volume \u201C" + selectedVolume + "\u201D?\nThe data will be gone. Back it up first.", "warning")) return;
      try {
        await API.docker.removeVolume(selectedVolume);
        selectedVolume = null;
        U.toast("Volume removed", "success");
        loadVolumes();
      } catch (err) { U.alert("Docker", err.message, "error"); }
    });
    helperBtn.addEventListener("click", async () => {
      const progress = busy("Preparing helper image", "Looking for busybox or alpine...");
      try {
        const result = await API.docker.helper();
        progress.close();
        U.toast("Helper image ready: " + result.image, "success");
      } catch (err) {
        progress.close();
        U.alert("Helper image", err.message, "error");
      }
    });
  }

  async function inspectVolume(name) {
    try {
      const data = await API.docker.volume(name);
      const vol = data.volume;
      U.dialog({
        title: "Volume - " + name,
        icon: "drive",
        width: 480,
        message: "",
        content: () => {
          const dl = U.el("dl", { class: "props-grid" });
          Object.entries(vol).forEach(([key, value]) => {
            if (value === null || value === undefined) return;
            dl.append(U.el("dt", { text: key }), U.el("dd", { text: typeof value === "object" ? JSON.stringify(value) : String(value) }));
          });
          return dl;
        },
        buttons: [{ label: "Close", value: true, primary: true }],
      });
    } catch (err) { U.alert("Docker", err.message, "error"); }
  }

  // ===DOCKER2===

  Docker.open = function open(startContainer) {
    if (win && !win.closed) {
      win.focus();
      if (startContainer) {
        const found = containers.find((c) => c.name === startContainer || c.id === startContainer);
        if (found) { selected = found; renderContainers(); renderRight(); }
      }
      return win;
    }
    filesPath = "/";
    win = WM.open({
      title: "Docker Manager",
      icon: "docker",
      pinId: "docker",
      width: 820,
      height: 560,
      minWidth: 560,
      minHeight: 380,
      singleton: "docker",
      build(body, w) {
        const app = U.el("div", { class: "docker-app" });
        els.banner = U.el("div", { class: "docker-banner" });
        const main = U.el("div", { class: "docker-main" });
        els.list = U.el("div", { class: "docker-list" });
        const right = U.el("div", { class: "docker-right" });
        els.tabs = U.el("div", { class: "docker-tabs" });
        [["details", "Details"], ["files", "Files"], ["logs", "Logs"], ["volumes", "Volumes"]].forEach(([id, label]) => {
          const tab = U.el("div", { class: "docker-tab" + (id === activeTab ? " active" : ""), text: label, dataset: { tab: id } });
          tab.addEventListener("click", () => switchTab(id));
          els.tabs.append(tab);
        });

        const panes = U.el("div", { style: { flex: "1", minHeight: "0", display: "flex", flexDirection: "column" } });
        els.panes = {};

        // details
        const details = U.el("div", { class: "docker-pane" });
        els.details = details;
        els.panes.details = details;

        // files
        const files = U.el("div", { class: "docker-pane", hidden: true, style: { display: "flex", flexDirection: "column", padding: "0" } });
        const fileBar = U.el("div", { class: "docker-toolbar" });
        const upBtn = U.el("button", { type: "button", text: "Up" });
        els.filePath = U.el("input", { type: "text", value: filesPath });
        const goBtn = U.el("button", { type: "button", text: "Go" });
        const refreshBtn = U.el("button", { type: "button", text: "Refresh" });
        const saveBtn = U.el("button", { type: "button", text: "Save to NAS" });
        const sendBtn = U.el("button", { type: "button", text: "Send from NAS" });
        fileBar.append(upBtn, els.filePath, goBtn, refreshBtn, saveBtn, sendBtn);
        els.files = U.el("div", { style: { flex: "1", overflow: "auto", padding: "4px" } });
        files.append(fileBar, els.files);
        els.panes.files = files;

        upBtn.addEventListener("click", () => {
          if (filesPath === "/") return;
          const parts = filesPath.replace(/\/+$/, "").split("/");
          parts.pop();
          loadFiles(parts.join("/") || "/");
        });
        goBtn.addEventListener("click", () => loadFiles(els.filePath.value || "/"));
        els.filePath.addEventListener("keydown", (event) => { if (event.key === "Enter") loadFiles(els.filePath.value || "/"); });
        refreshBtn.addEventListener("click", () => loadFiles(filesPath));
        saveBtn.addEventListener("click", () => {
          if (!selected) return;
          U.prompt("Save folder to NAS", "Save this container folder into the NAS:", "/Docker Backups/" + selected.name)
            .then(async (dest) => {
              if (!dest) return;
              const progress = busy("Saving from container", filesPath);
              try {
                const result = await API.docker.saveToNas(selected.id, filesPath, dest);
                progress.close();
                U.toast("Saved to " + result.dest, "success");
              } catch (err) { progress.close(); U.alert("Docker", err.message, "error"); }
            });
        });
        sendBtn.addEventListener("click", async () => {
          if (!selected) return;
          const file = await U.nasPicker({ title: "Send a NAS item into the container", mode: "any", start: "/" });
          if (!file) return;
          const dest = await U.prompt("Send to container", "Destination folder inside the container:", filesPath);
          if (!dest) return;
          const progress = busy("Copying into container", file);
          try {
            await API.docker.upload(selected.id, dest, file);
            progress.close();
            U.toast("Copied into " + selected.name + ":" + dest, "success");
            loadFiles(filesPath);
          } catch (err) { progress.close(); U.alert("Docker", err.message, "error"); }
        });

        // logs
        const logs = U.el("div", { class: "docker-pane", hidden: true, style: { display: "flex", flexDirection: "column", padding: "0" } });
        const logBar = U.el("div", { class: "docker-toolbar" });
        const logRefresh = U.el("button", { type: "button", text: "Refresh" });
        els.logTail = U.el("select", {});
        [["100", "Last 100 lines"], ["300", "Last 300 lines"], ["1000", "Last 1000 lines"], ["5000", "Last 5000 lines"]].forEach(([value, label]) => els.logTail.append(U.el("option", { value, text: label })));
        els.logTail.value = "300";
        const autoLabel = U.el("label", { class: "row", style: { gap: "3px" } });
        const autoCheck = U.el("input", { type: "checkbox" });
        autoLabel.append(autoCheck, document.createTextNode("Auto refresh"));
        logBar.append(logRefresh, els.logTail, autoLabel);
        els.logs = U.el("pre", { class: "docker-log selectable" });
        logs.append(logBar, els.logs);
        els.panes.logs = logs;
        logRefresh.addEventListener("click", loadLogs);
        els.logTail.addEventListener("change", loadLogs);
        autoCheck.addEventListener("change", () => {
          if (logsTimer) { clearInterval(logsTimer); logsTimer = null; }
          if (autoCheck.checked) logsTimer = setInterval(loadLogs, 3000);
        });

        // volumes
        const volumePane = U.el("div", { class: "docker-pane", hidden: true });
        els.volumes = volumePane;
        els.panes.volumes = volumePane;

        panes.append(details, files, logs, volumePane);
        right.append(els.tabs, panes);
        main.append(els.list, right);
        app.append(els.banner, main);
        body.append(app);

        w.onKey = (event) => {
          if (event.key === "F5") { event.preventDefault(); loadStatus(); }
        };
        loadStatus();
      },
      onClose() {
        if (logsTimer) { clearInterval(logsTimer); logsTimer = null; }
        win = null;
        els = {};
      },
    });
    return win;
  };

  Docker.sendToContainer = async function sendToContainer(paths) {
    if (!paths || !paths.length) return;
    let list = [];
    try {
      const st = await API.docker.status();
      if (!st.running) {
        U.alert("Docker is offline", "Start Docker Desktop, then try again.", "warning");
        return;
      }
      list = (await API.docker.containers()).containers;
    } catch (err) {
      U.alert("Docker", err.message, "error");
      return;
    }
    if (!list.length) {
      U.alert("No containers", "There are no containers to send files to.", "warning");
      return;
    }
    let select = null;
    let destInput = null;
    const result = await U.dialog({
      title: "Send to Docker container",
      icon: "docker",
      width: 390,
      message: "Copy " + paths.length + " NAS item(s) into a container:",
      content: () => {
        const wrap = U.el("div", { style: { width: "100%" } });
        select = U.el("select", { style: { width: "100%" } });
        list.forEach((c) => select.append(U.el("option", { value: c.id, text: c.name + "  (" + c.state + ")" })));
        destInput = U.el("input", { type: "text", value: "/tmp/", class: "dialog-input" });
        wrap.append(
          U.el("div", { class: "settings-row" }, U.el("label", { text: "Container:" }), select),
          U.el("div", { class: "settings-row" }, U.el("label", { text: "Folder:" }), destInput),
          U.el("div", { class: "settings-note", text: "The folder must already exist inside the container. /tmp usually works." })
        );
        return wrap;
      },
      buttons: [{ label: "Send", value: "ok", primary: true }, { label: "Cancel", value: null }],
    });
    if (result !== "ok" || !select || !destInput) return;
    const containerId = select.value;
    const dest = destInput.value || "/tmp/";
    const progress = busy("Sending to container", paths.length + " item(s)");
    try {
      for (const path of paths) {
        await API.docker.upload(containerId, dest, path);
      }
      progress.close();
      U.toast("Sent " + paths.length + " item(s) to the container", "success");
    } catch (err) {
      progress.close();
      U.alert("Docker", err.message, "error");
    }
  };

  window.Docker = Docker;
})();
