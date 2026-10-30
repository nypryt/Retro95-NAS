/* Win95 NAS - Tailscale Manager */
(function () {
  "use strict";

  const Tailscale = {};
  let win = null;
  let status = null;
  let selectedId = "self";
  let activeTab = "devices";
  let els = {};
  let outputLog = null;

  function devices() {
    const list = [];
    if (status && status.self) list.push(Object.assign({ isSelf: true }, status.self));
    (status && status.peers || []).forEach((peer) => list.push(peer));
    return list;
  }

  function findDevice(id) {
    return devices().find((device) => device.id === id) || null;
  }

  // Tailscale calls the admin-console label "Nickname"; when it is unset we
  // fall back to the first label of the MagicDNS name. Show both so devices
  // with generic host names are easy to tell apart.
  function displayName(device) {
    if (!device) return "";
    const nick = String(device.nickname || "").trim();
    const host = String(device.hostname || "").trim();
    if (nick && host && nick.toLowerCase() !== host.toLowerCase()) return nick + " (" + host + ")";
    return nick || host || device.dnsName || device.id || "Unknown device";
  }

  function stateText() {
    if (!status) return "Checking Tailscale...";
    if (!status.installed) return "Tailscale is not installed";
    if (status.backendState === "Running") return "Connected";
    if (status.backendState === "Stopped") return "Disconnected";
    if (status.backendState === "NeedsLogin") return "Sign-in required";
    return status.backendState || "Unknown";
  }

  function fmtSeen(value) {
    if (!value) return "";
    if (/^0001-01-01/.test(value)) return "never";
    const date = new Date(value);
    if (isNaN(date.getTime())) return value;
    const diff = Date.now() - date.getTime();
    if (diff < 0) return date.toLocaleString();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return mins + " min ago";
    const hours = Math.floor(mins / 60);
    if (hours < 24) return hours + " hour" + (hours === 1 ? "" : "s") + " ago";
    const days = Math.floor(hours / 24);
    if (days < 30) return days + " day" + (days === 1 ? "" : "s") + " ago";
    return date.toLocaleDateString();
  }

  function ledClass(online) {
    return online ? "led" : "led off";
  }

  function log(text) {
    if (!outputLog) return;
    outputLog.hidden = false;
    outputLog.textContent = text;
  }

  async function act(action, value, label) {
    try {
      const result = await API.tailscale.action(action, value);
      status = result.status || status;
      renderAll();
      if (result.output) log(result.output);
      if (label) U.toast(label, "success");
      return result;
    } catch (err) {
      U.alert("Tailscale", err.message, "error");
      return null;
    }
  }

  async function refresh(showErrors) {
    try {
      status = await API.tailscale.status();
      if (!findDevice(selectedId)) {
        selectedId = status.self ? "self" : ((status.peers && status.peers[0] && status.peers[0].id) || "");
      }
      renderAll();
    } catch (err) {
      if (showErrors) U.alert("Tailscale", err.message, "error");
    }
  }

  function renderBanner() {
    if (!els.banner) return;
    els.banner.innerHTML = "";
    const running = status && status.backendState === "Running";
    const installed = status && status.installed;
    const led = U.el("span", { class: running ? "led" : (installed ? "led warn" : "led err") });
    const text = U.el("div", { style: { flex: "1", minWidth: "0" } });
    const title = U.el("div", { text: "Tailscale: " + stateText(), style: { fontWeight: "bold" } });
    const sub = U.el("div", { class: "muted" });
    if (running) {
      const me = status.self || {};
      const ip = me.ip || (me.ips && me.ips[0]) || "";
      sub.textContent = (status.tailnet ? status.tailnet : "tailnet") +
        (ip ? "  \u2022  " + ip : "") +
        (status.magicDNS ? "  \u2022  " + status.magicDNS : "") +
        "  \u2022  v" + (status.version || "?");
    } else if (installed) {
      sub.textContent = status.error || "Press Connect to bring Tailscale up.";
    } else {
      sub.textContent = status && status.error || "Install Tailscale on this PC.";
    }
    text.append(title, sub);
    els.banner.append(led, text);

    if (installed) {
      const button = U.el("button", { type: "button", text: running ? "Disconnect" : "Connect" });
      button.addEventListener("click", async () => {
        button.disabled = true;
        if (running) {
          if (!await U.confirm("Disconnect Tailscale", "Turn off Tailscale on this PC?\n\nRemote devices will not be able to reach the NAS until you reconnect.", "network")) {
            button.disabled = false;
            return;
          }
          await act("down", "", "Tailscale disconnected");
        } else {
          await act("up", "", "Tailscale connected");
        }
        button.disabled = false;
      });
      els.banner.append(button);
    }
    const check = U.el("button", { type: "button", text: "Net check" });
    check.addEventListener("click", async () => {
      check.disabled = true;
      const result = await act("netcheck");
      check.disabled = false;
      if (result && result.output) {
        U.dialog({
          title: "Tailscale net check",
          icon: "tailscale",
          width: 560,
          height: 380,
          build(body) {
            body.append(U.el("pre", { class: "ts-output selectable", text: result.output }));
          },
        });
      }
    });
    els.banner.append(check);
    const refreshBtn = U.el("button", { type: "button", text: "Refresh" });
    refreshBtn.addEventListener("click", () => refresh(true));
    els.banner.append(refreshBtn);
  }

  function renderList() {
    if (!els.list) return;
    els.list.innerHTML = "";
    const list = devices();
    if (!list.length) {
      els.list.append(U.el("div", { class: "muted", style: { padding: "8px" }, text: status && status.installed ? "No devices." : "Tailscale is unavailable." }));
      return;
    }
    list.forEach((device) => {
      const row = U.el("div", { class: "ts-item" + (selectedId === device.id ? " selected" : "") });
      row.innerHTML =
        `<span class="${ledClass(device.online)}"></span>` +
        `<div style="min-width:0;flex:1"><div class="ts-name"></div><div class="ts-ip"></div></div>` +
        (device.isSelf ? `<span class="ts-badge">this PC</span>` : "");
      row.querySelector(".ts-name").textContent = displayName(device);
      row.querySelector(".ts-ip").textContent = (device.ip || "") + (device.os ? "  \u2022  " + device.os : "");
      row.title = displayName(device) + "\n" + (device.dnsName || "") + "\n" + (device.ips || []).join("\n");
      row.addEventListener("click", () => {
        selectedId = device.id;
        renderList();
        renderDetail();
      });
      row.addEventListener("dblclick", () => pingDevice(device));
      els.list.append(row);
    });
  }

  async function pingDevice(device) {
    if (!device) return;
    const target = device.ip || device.hostname;
    if (!target) return;
    log("Pinging " + target + " ...");
    const result = await act("ping", target);
    if (result && result.output) log(result.output);
  }

  function infoRow(label, value) {
    return U.el("div", { class: "ts-row" },
      U.el("span", { class: "ts-label", text: label }),
      U.el("span", { class: "ts-value", text: value === undefined || value === null || value === "" ? "\u2014" : String(value) })
    );
  }

  function renderDetail() {
    if (!els.detail) return;
    els.detail.innerHTML = "";
    const device = findDevice(selectedId);
    if (!device) {
      els.detail.append(U.el("div", { class: "muted", style: { padding: "12px" }, text: "Select a device on the left." }));
      return;
    }
    const head = U.el("div", { class: "ts-detail-head" });
    head.innerHTML = `<span class="${ledClass(device.online)}"></span><div><div class="ts-detail-name"></div><div class="muted ts-detail-sub"></div></div>`;
    head.querySelector(".ts-detail-name").textContent = displayName(device);
    head.querySelector(".ts-detail-sub").textContent = device.isSelf ? "This PC" : (device.online ? "Online" : "Offline");
    els.detail.append(head);

    const rows = U.el("div", { class: "ts-rows" });
    rows.append(infoRow("Name", displayName(device)));
    rows.append(infoRow("Host name", device.hostname));
    rows.append(infoRow("Nickname", device.nickname));
    rows.append(infoRow("DNS name", device.dnsName));
    rows.append(infoRow("IP address", device.ip));
    if (device.ips && device.ips.length > 1) rows.append(infoRow("All addresses", device.ips.join(", ")));
    rows.append(infoRow("Operating system", device.os));
    rows.append(infoRow("Status", device.isSelf ? "This device" : (device.online ? "Online" : "Offline")));
    if (!device.isSelf) rows.append(infoRow("Last seen", fmtSeen(device.lastSeen)));
    if (device.curAddr) rows.append(infoRow("Direct address", device.curAddr));
    if (device.relay) rows.append(infoRow("Relay", device.relay));
    if (device.rxBytes || device.txBytes) {
      rows.append(infoRow("Traffic", U.fmtSize(device.rxBytes || 0) + " in / " + U.fmtSize(device.txBytes || 0) + " out"));
    }
    if (device.exitNode) rows.append(infoRow("Exit node", "In use"));
    if (device.exitNodeOption) rows.append(infoRow("Can be exit node", "Yes"));
    els.detail.append(rows);

    const buttons = U.el("div", { class: "ts-actions" });
    if (!device.isSelf) {
      const ping = U.el("button", { type: "button", text: "Ping" });
      ping.addEventListener("click", () => pingDevice(device));
      buttons.append(ping);
    }
    if (device.ip) {
      const copy = U.el("button", { type: "button", text: "Copy IP" });
      copy.addEventListener("click", async () => {
        try { await navigator.clipboard.writeText(device.ip); U.toast("Copied " + device.ip, "success"); }
        catch (_err) { U.alert("Copy", "Could not access the clipboard.", "warning"); }
      });
      buttons.append(copy);
    }
    if (!device.isSelf && device.exitNodeOption && device.ip) {
      const exit = U.el("button", { type: "button", text: device.exitNode ? "Stop using as exit node" : "Use as exit node" });
      exit.addEventListener("click", async () => {
        await act("set-exit-node", device.exitNode ? "" : device.ip,
          device.exitNode ? "Stopped using exit node" : "Routing internet traffic through " + device.hostname);
      });
      buttons.append(exit);
    }
    if (device.isSelf) {
      const openSettings = U.el("button", { type: "button", text: "Settings" });
      openSettings.addEventListener("click", () => switchTab("settings"));
      buttons.append(openSettings);
    }
    els.detail.append(buttons);
  }

  function renderSettings() {
    if (!els.settings) return;
    els.settings.innerHTML = "";
    if (!status || !status.installed) {
      els.settings.append(U.el("div", { class: "muted", style: { padding: "12px" }, text: "Install Tailscale to configure it." }));
      return;
    }
    const prefs = status.prefs || {};
    const me = status.self || {};

    els.settings.append(U.el("h3", { text: "This device" }));
    els.settings.append(U.el("div", { class: "settings-note", text: "Changes apply immediately to the Tailscale client on this PC." }));

    // Hostname
    const hostRow = U.el("div", { class: "ts-field" });
    hostRow.append(U.el("label", { text: "Device name" }));
    const hostInput = U.el("input", { type: "text", value: prefs.hostname || me.hostname || "", maxlength: "63" });
    const hostBtn = U.el("button", { type: "button", text: "Apply" });
    hostBtn.addEventListener("click", async () => {
      const value = hostInput.value.trim();
      if (!value) { U.alert("Tailscale", "Enter a device name.", "warning"); return; }
      hostBtn.disabled = true;
      await act("set-hostname", value, "Device name updated");
      hostBtn.disabled = false;
    });
    hostRow.append(hostInput, hostBtn);
    els.settings.append(hostRow);

    // Exit node
    const exitRow = U.el("div", { class: "ts-field" });
    exitRow.append(U.el("label", { text: "Exit node" }));
    const exitSelect = U.el("select");
    exitSelect.append(U.el("option", { value: "", text: "None (direct internet)" }));
    (status.peers || []).filter((peer) => peer.exitNodeOption).forEach((peer) => {
      exitSelect.append(U.el("option", { value: peer.ip || peer.hostname, text: displayName(peer) + (peer.online ? "" : " (offline)") }));
    });
    if (prefs.exitNodeIP) exitSelect.value = prefs.exitNodeIP;
    const exitBtn = U.el("button", { type: "button", text: "Apply" });
    exitBtn.addEventListener("click", async () => {
      exitBtn.disabled = true;
      await act("set-exit-node", exitSelect.value, exitSelect.value ? "Exit node set" : "Exit node cleared");
      exitBtn.disabled = false;
    });
    exitRow.append(exitSelect, exitBtn);
    els.settings.append(exitRow);

    // Toggles
    const toggles = U.el("div", { class: "ts-toggles" });
    function toggle(label, note, checked, handler) {
      const row = U.el("label", { class: "ts-toggle" });
      const input = U.el("input", { type: "checkbox" });
      input.checked = !!checked;
      input.addEventListener("change", async () => {
        input.disabled = true;
        await handler(input.checked);
        input.disabled = false;
      });
      row.append(input, U.el("span", {}, U.el("b", { text: label }), U.el("span", { class: "muted", text: "  " + note })));
      toggles.append(row);
    }
    toggle("Accept routes", "Use subnet routes advertised by other devices", prefs.acceptRoutes, async (on) => {
      await act("accept-routes", on ? "true" : "false", on ? "Accepting routes" : "Stopped accepting routes");
    });
    toggle("Advertise as exit node", "Let other devices route internet traffic through this PC", prefs.advertiseExitNode, async (on) => {
      await act("advertise-exit-node", on ? "true" : "false", on ? "Advertising exit node" : "Stopped advertising exit node");
    });
    els.settings.append(toggles);

    els.settings.append(U.el("h3", { text: "Tailnet" }));
    const rows = U.el("div", { class: "ts-rows" });
    rows.append(infoRow("Tailnet", status.tailnet));
    rows.append(infoRow("MagicDNS", status.magicDNS));
    rows.append(infoRow("Version", status.version));
    rows.append(infoRow("Backend state", status.backendState));
    rows.append(infoRow("Command line", status.exe));
    els.settings.append(rows);

    const help = U.el("div", { class: "settings-note", style: { marginTop: "8px" } });
    help.textContent = "Tip: double-click a device to ping it. The NAS is reachable from your other Tailscale devices at " +
      ((me.ip || "its 100.x address")) + (window.location.port ? ":" + window.location.port : "") + ".";
    els.settings.append(help);
  }

  function renderAll() {
    renderBanner();
    renderList();
    renderDetail();
    renderSettings();
  }

  function switchTab(tab) {
    activeTab = tab;
    if (!els.tabs) return;
    U.qsa(".ts-tab", els.tabs).forEach((node) => node.classList.toggle("active", node.dataset.tab === tab));
    if (els.panes) {
      Object.keys(els.panes).forEach((name) => { els.panes[name].hidden = name !== tab; });
    }
    if (tab === "settings") renderSettings();
  }

  Tailscale.open = function open() {
    if (win && !win.closed) {
      win.focus();
      return win;
    }
    win = WM.open({
      title: "Tailscale",
      icon: "tailscale",
      pinId: "tailscale",
      width: 760,
      height: 540,
      singleton: "tailscale",
      build(body, w) {
        win = w;
        const app = U.el("div", { class: "ts-app" });
        els.banner = U.el("div", { class: "ts-banner" });
        els.tabs = U.el("div", { class: "ts-tabs" });
        ["devices", "settings"].forEach((id) => {
          const tab = U.el("div", { class: "ts-tab" + (id === activeTab ? " active" : ""), dataset: { tab: id }, text: id === "devices" ? "Devices" : "Settings" });
          tab.addEventListener("click", () => switchTab(id));
          els.tabs.append(tab);
        });

        const devicesPane = U.el("div", { class: "ts-pane" });
        const split = U.el("div", { class: "ts-split" });
        els.list = U.el("div", { class: "ts-list" });
        els.detail = U.el("div", { class: "ts-detail" });
        split.append(els.list, els.detail);
        outputLog = U.el("pre", { class: "ts-output selectable", hidden: true });
        devicesPane.append(split, outputLog);

        const settingsPane = U.el("div", { class: "ts-pane", hidden: true });
        els.settings = U.el("div", { class: "ts-settings" });
        settingsPane.append(els.settings);

        els.panes = { devices: devicesPane, settings: settingsPane };
        app.append(els.banner, els.tabs, devicesPane, settingsPane);
        body.append(app);

        renderAll();
        refresh(false);

        U.menuBar(w, [
          { label: "File", items: [
            { label: "Refresh", action: () => refresh(true) },
            { separator: true },
            { label: "Close", action: () => w.close() },
          ] },
          { label: "Device", items: [
            { label: "Connect", action: () => act("up", "", "Tailscale connected") },
            { label: "Disconnect", action: () => act("down", "", "Tailscale disconnected") },
            { separator: true },
            { label: "Ping selected device", action: () => pingDevice(findDevice(selectedId)) },
          ] },
          { label: "Help", items: [
            { label: "About Tailscale", action: () => U.alert("Tailscale",
              "Manage the Tailscale client installed on this PC.\n\n" +
              "- See every device on your tailnet and its 100.x address\n" +
              "- Connect or disconnect the client\n" +
              "- Change the device name, use an exit node, accept routes\n" +
              "- Ping devices to test the tunnel\n\n" +
              "Tailscale credentials stay on this PC; the NAS only runs the local CLI.", "tailscale") },
          ] },
        ]);
      },
    });
    return win;
  };

  window.Tailscale = Tailscale;
})();
