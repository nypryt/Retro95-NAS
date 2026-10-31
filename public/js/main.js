/* Win95 NAS - startup, Start menu, clock, tray and global keys */
(function () {
  "use strict";

  const startButton = document.getElementById("start-button");
  const startMenu = document.getElementById("start-menu");
  const clock = document.getElementById("clock");
  const bootScreen = document.getElementById("boot-screen");
  const trayCrt = document.getElementById("tray-crt");
  const traySound = document.getElementById("tray-sound");

  let startOpen = false;
  let startPopups = [];
  let booted = false;
  let startupPlayed = false;
  let currentUser = null;

  async function loadCurrentUser() {
    try {
      const status = await API.auth.status();
      currentUser = status.username || null;
    } catch (_err) {
      currentUser = null;
    }
    buildStartMenu();
  }

  async function logOff() {
    const name = currentUser || "this account";
    const sure = await U.confirm(
      "Log Off Windows",
      "Are you sure you want to log off " + name + "?\n\nYour files stay on this PC. You can sign back in at any time.",
      "keys"
    );
    if (!sure) return;
    try { await API.auth.logout(); } catch (_err) { /* the cookie is cleared server-side anyway */ }
    window.location.href = "/login";
  }

  // ------------------------------------------------------------ Start menu
  function closeStartPopups() {
    startPopups.forEach((node) => node.remove());
    startPopups = [];
    U.qsa(".start-item.open", startMenu).forEach((node) => node.classList.remove("open"));
  }

  function closeStart() {
    if (!startOpen) { closeStartPopups(); return; }
    startOpen = false;
    startMenu.hidden = true;
    startButton.classList.remove("open");
    closeStartPopups();
  }

  function pinMenuItems(item) {
    if (!item.pin || !window.Taskbar) return [];
    return [
      { separator: true },
      {
        label: window.Taskbar.isPinned(item.pin) ? "Unpin from taskbar" : "Pin to taskbar",
        action: () => window.Taskbar.togglePin(item.pin),
      },
    ];
  }

  function buildPopup(items, x, y) {
    const pop = U.el("div", { class: "menu-pop", role: "menu" });
    items.forEach((item) => {
      if (item.separator) { pop.append(U.el("div", { class: "dd-sep" })); return; }
      if (item.title) { pop.append(U.el("div", { class: "dd-title", text: item.title })); return; }
      const row = U.el("div", { class: "dd-item" + (item.disabled ? " disabled" : "") });
      row.append(U.el("span", { class: "dd-check", text: item.checked ? "\u2713" : "" }));
      if (item.icon) row.append(U.el("span", { class: "dd-ico", html: Icons.get(item.icon, 16) }));
      else row.append(U.el("span", { class: "dd-ico" }));
      row.append(U.el("span", { class: "dd-label", text: item.label }));
      if (item.shortcut) row.append(U.el("span", { class: "dd-key", text: item.shortcut }));
      if (item.submenu) row.append(U.el("span", { class: "dd-arrow", text: "\u25B6" }));
      if (!item.disabled) {
        row.addEventListener("mouseenter", () => {
          if (item.submenu) openSub(row, item.submenu);
          else closeDeeper(1);
        });
        row.addEventListener("click", (event) => {
          event.stopPropagation();
          if (item.submenu) { openSub(row, item.submenu); return; }
          closeStart();
          closeStartPopups();
          if (item.action) {
            try { item.action(); } catch (err) { U.error(err); }
          }
        });
        row.addEventListener("contextmenu", (event) => {
          if (!item.pin) return;
          event.preventDefault();
          event.stopPropagation();
          U.contextMenu(event.clientX, event.clientY, [
            { label: "Open " + item.label, icon: item.icon, action: () => { closeStart(); closeStartPopups(); try { item.action(); } catch (err) { U.error(err); } } },
            ...pinMenuItems(item),
          ]);
        });
      }
      pop.append(row);
    });
    document.body.append(pop);
    pop.style.left = "0px";
    pop.style.top = "0px";
    const z = U.scale();
    const size = pop.getBoundingClientRect();
    const width = size.width / z;
    const height = size.height / z;
    const left = U.clamp(x / z, 2, Math.max(2, window.innerWidth / z - width - 2));
    const top = U.clamp(y / z, 2, Math.max(2, window.innerHeight / z - height - 2));
    pop.style.left = left + "px";
    pop.style.top = top + "px";
    startPopups.push(pop);
    return pop;
  }

  function closeDeeper(keep) {
    while (startPopups.length > keep) startPopups.pop().remove();
  }

  function openSub(row, items) {
    const rect = row.getBoundingClientRect();
    const index = Array.from(row.parentElement.children).indexOf(row);
    void index;
    const level = startPopups.findIndex((pop) => pop.contains(row));
    if (level >= 0) closeDeeper(level + 1);
    let x = rect.right - 3;
    const pop = buildPopup(items, x, rect.top);
    const z = U.scale();
    const size = pop.getBoundingClientRect();
    if (x + size.width > window.innerWidth - 2) {
      x = rect.left - size.width + 3;
      pop.style.left = Math.max(2, x / z) + "px";
    }
  }

  function startMenuItems() {
    return [
      { label: "Programs", icon: "folder", submenu: [
        { label: "Accessories", icon: "folder", submenu: [
          { label: "Notepad", icon: "notepad", pin: "notepad", action: () => Apps.notepad() },
          { label: "Paint", icon: "paint", pin: "paint", action: () => Apps.paint() },
          { label: "Clock", icon: "clock", pin: "clock", action: () => Apps.clock() },
          { label: "Command Prompt", icon: "cmd", pin: "cmd", action: () => Apps.commandPrompt() },
          { label: "MS-DOS Prompt", icon: "msdos", action: () => Apps.msdosPrompt() },
          { label: "Welcome Tips", icon: "help", action: () => Apps.tips() },
        ] },
        { label: "Games", icon: "folder", submenu: [
          { label: "Minesweeper", icon: "mine", pin: "mines", action: () => Apps.minesweeper("beginner") },
          { label: "Minesweeper - Intermediate", icon: "mine", action: () => Apps.minesweeper("intermediate") },
          { label: "Minesweeper - Expert", icon: "mine", action: () => Apps.minesweeper("expert") },
        ] },
        { label: "Docker Manager", icon: "docker", pin: "docker", action: () => Docker.open() },
        { label: "Tailscale", icon: "tailscale", pin: "tailscale", action: () => Tailscale.open() },
        { label: "WinRAR", icon: "winrar", pin: "winrar", action: () => WinRAR.pick() },
        { label: "Windows Explorer", icon: "computer", pin: "computer", action: () => Explorer.open("/") },
        { separator: true },
        { label: "Microsoft Office", icon: "office", submenu: [
          { label: "Microsoft Word", icon: "word", pin: "word", action: () => Office.launch("word") },
          { label: "Microsoft Excel", icon: "excel", pin: "excel", action: () => Office.launch("excel") },
          { label: "Microsoft PowerPoint", icon: "powerpoint", pin: "powerpoint", action: () => Office.launch("powerpoint") },
        ] },
        { label: "VLC media player", icon: "vlc", pin: "vlc", action: () => VLC.open() },
      ] },
      { label: "Documents", icon: "folder", submenu: [
        { label: "My Documents", icon: "folder", pin: "documents", action: () => Explorer.open("/Documents") },
        { label: "Read Me", icon: "text", action: () => Apps.notepad("/Desktop/Read Me.txt") },
        { label: "My Pictures", icon: "image", pin: "pictures", action: () => Explorer.open("/Pictures") },
        { label: "Shared", icon: "network", action: () => Explorer.open("/Shared") },
        { separator: true },
        { label: "Docker Backups", icon: "docker", action: () => Explorer.open("/Docker Backups") },
      ] },
      { label: "Settings", icon: "settings", submenu: [
        { label: "Control Panel", icon: "settings", pin: "control", action: () => Settings.open() },
        { separator: true },
        { label: "Background...", icon: "wallpaper", action: () => Settings.open("background") },
        { label: "Display Effects...", icon: "monitor", action: () => Settings.open("effects") },
        { label: "Sounds...", icon: "sound", action: () => Settings.open("sounds") },
        { label: "Desktop...", icon: "display", action: () => Settings.open("desktop") },
        { label: "System...", icon: "computer", action: () => Settings.open("system") },
        { label: "Users...", icon: "keys", action: () => Settings.open("users") },
      ] },
      { label: "Find", icon: "find", submenu: [
        { label: "Files or Folders...", icon: "find", pin: "find", action: () => Apps.find() },
        { label: "Docker Containers...", icon: "docker", action: () => Docker.open() },
      ] },
      { label: "Help", icon: "help", pin: "help", action: () => Apps.help() },
      { label: "Run...", icon: "run", action: () => Apps.run() },
      { separator: true },
      { label: "Log Off " + (currentUser || "Windows") + "...", icon: "keys", action: logOff },
      { label: "Shut Down...", icon: "shutdown", action: () => Apps.shutdownDialog() },
      { separator: true },
      { label: "About Win95 NAS", icon: "info", action: () => Apps.about() },
    ];
  }

  function buildStartMenu() {
    if (!startMenu) return;
    startMenu.innerHTML = "";
    const banner = U.el("div", { class: "start-banner" });
    banner.append(
      U.el("img", { class: "start-banner-flag", src: "/icons/win95/windowsLogo-32.png", alt: "", draggable: "false" }),
      U.el("span", { class: "start-banner-text", text: "Windows 95" })
    );
    const items = U.el("div", { class: "start-items" });
    startMenuItems().forEach((item) => {
      if (item.separator) { items.append(U.el("div", { class: "start-sep" })); return; }
      const row = U.el("div", { class: "start-item" });
      row.append(U.el("span", { class: "s-ico", html: Icons.get(item.icon || "folder", 24) }));
      row.append(U.el("span", { class: "s-label", text: item.label }));
      if (item.submenu) row.append(U.el("span", { class: "s-arrow", text: "\u25B6" }));
      row.addEventListener("mouseenter", () => {
        if (item.submenu) {
          const rect = row.getBoundingClientRect();
          closeStartPopups();
          row.classList.add("open");
          const pop = buildPopup(item.submenu, rect.right - 2, rect.top);
          const z = U.scale();
          const size = pop.getBoundingClientRect();
          if (rect.right + size.width > window.innerWidth - 2) {
            pop.style.left = Math.max(2, (rect.left - size.width + 2) / z) + "px";
          }
        } else {
          closeStartPopups();
        }
      });
      row.addEventListener("click", (event) => {
        event.stopPropagation();
        if (item.submenu) {
          const rect = row.getBoundingClientRect();
          closeStartPopups();
          row.classList.add("open");
          buildPopup(item.submenu, rect.right - 2, rect.top);
          return;
        }
        closeStart();
        if (item.action) {
          try { item.action(); } catch (err) { U.error(err); }
        }
      });
      row.addEventListener("contextmenu", (event) => {
        if (!item.pin) return;
        event.preventDefault();
        event.stopPropagation();
        U.contextMenu(event.clientX, event.clientY, [
          { label: "Open " + item.label, icon: item.icon, action: () => { closeStart(); try { item.action(); } catch (err) { U.error(err); } } },
          ...pinMenuItems(item),
        ]);
      });
      items.append(row);
    });
    startMenu.append(banner, items);
  }

  function openStart() {
    if (!startMenu) return;
    U.closeMenus();
    startOpen = true;
    startMenu.hidden = false;
    startButton.classList.add("open");
    closeStartPopups();
    const first = startMenu.querySelector(".start-item");
    if (first) first.classList.add("focus");
    void first;
  }

  function toggleStart() {
    if (startOpen) closeStart();
    else openStart();
  }

  // ------------------------------------------------------------ Clock / tray
  function tickClock() {
    if (!clock) return;
    clock.textContent = U.fmtTime();
    clock.title = U.fmtLongDate();
  }

  function wireTray() {
    if (trayCrt) {
      trayCrt.addEventListener("click", () => {
        const turningOn = !Settings.get().crt.enabled;
        Settings.toggleCRT().then(() => {
          if (turningOn) Settings.powerOn();
          U.toast("CRT effect " + (turningOn ? "enabled" : "disabled"));
        });
      });
    }
    if (traySound) {
      traySound.addEventListener("click", () => {
        Settings.toggleSound().then(() => {
          if (Settings.get().sound.enabled) {
            Sound.resume();
            Sound.play("ding");
            U.toast("Sound on");
          } else {
            U.toast("Sound off");
          }
        });
      });
    }
    if (clock) {
      clock.addEventListener("click", async () => {
        let info = null;
        try { info = await API.info(); } catch (_err) { info = null; }
        U.alert("Date/Time Properties",
          U.fmtLongDate() + "\n" + U.fmtTime() + "\n\n" +
          (info ? "This PC: " + info.hostname + "\nUptime: " + Math.floor(info.uptime / 60) + " minutes\nNAS: " + info.root : "Have a nice day."),
          "info");
      });
    }
  }

  // ------------------------------------------------------------ Boot
  function runBoot() {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      booted = true;
      bootScreen.classList.add("hide");
      setTimeout(() => { bootScreen.hidden = true; bootScreen.classList.remove("hide"); }, 520);
      afterBoot();
    };
    bootScreen.hidden = false;
    bootScreen.addEventListener("click", finish, { once: true });
    // Every visit gets a short, slightly random boot splash (2.6 - 5.0 s).
    setTimeout(finish, 2600 + Math.round(Math.random() * 2400));
  }

  function afterBoot() {
    if (!startupPlayed) {
      startupPlayed = true;
      Sound.resume();
      Sound.play("startup");
    }
    const state = Settings.get();
    if (state.desktop.showTips && !sessionStorage.getItem("nas.tipsShown")) {
      sessionStorage.setItem("nas.tipsShown", "1");
      setTimeout(() => { if (window.Apps) Apps.tips(); }, 700);
    }
    U.toast("Welcome to Win95 NAS. Double-click something.", "info", 5200);
  }

  // ------------------------------------------------------------ Global keys
  function globalKey(event) {
    if (event.key === "Escape") {
      if (startOpen) { event.preventDefault(); closeStart(); return; }
      U.closeMenus();
      return;
    }
    if (event.ctrlKey && event.key === "Escape") {
      event.preventDefault();
      toggleStart();
      return;
    }
    if (event.altKey && event.key === "F4") {
      event.preventDefault();
      const active = WM.focused;
      if (active && !active.closed) active.close();
      return;
    }
    if (event.key === "F1" && !event.ctrlKey && !event.altKey) {
      const tag = (event.target.tagName || "").toLowerCase();
      if (tag === "input" || tag === "textarea") return;
      event.preventDefault();
      Apps.help();
      return;
    }
    if (event.key === "F5") {
      const tag = (event.target.tagName || "").toLowerCase();
      if (tag === "input" || tag === "textarea") return;
      const active = WM.focused;
      if (active && active.onKey) return;
    }
    if (event.ctrlKey && event.altKey && event.key.toLowerCase() === "d") {
      event.preventDefault();
      Docker.open();
    }
    if (event.ctrlKey && event.altKey && event.key.toLowerCase() === "t") {
      event.preventDefault();
      Tailscale.open();
    }
    if (event.ctrlKey && event.altKey && event.key.toLowerCase() === "c") {
      event.preventDefault();
      Apps.commandPrompt();
    }
    if (event.ctrlKey && event.altKey) {
      const key = event.key;
      if (key === "ArrowLeft") { event.preventDefault(); WM.snapFocused("left"); }
      else if (key === "ArrowRight") { event.preventDefault(); WM.snapFocused("right"); }
      else if (key === "ArrowUp") { event.preventDefault(); WM.snapFocused("max"); }
      else if (key === "ArrowDown") { event.preventDefault(); WM.unsnapFocused(); }
    }
  }

  // ------------------------------------------------------------ Taskbar pins
  const TASKBAR_APPS = {
    computer: { label: "My Computer", icon: "computer", open: () => Explorer.open("/") },
    recycle: { label: "Recycle Bin", icon: "recycle", open: () => Apps.recycle() },
    documents: { label: "My Documents", icon: "folder", open: () => Explorer.open("/Documents") },
    pictures: { label: "My Pictures", icon: "image", open: () => Explorer.open("/Pictures") },
    docker: { label: "Docker Manager", icon: "docker", open: () => Docker.open() },
    tailscale: { label: "Tailscale", icon: "tailscale", open: () => Tailscale.open() },
    cmd: { label: "Command Prompt", icon: "cmd", open: () => Apps.commandPrompt() },
    control: { label: "Control Panel", icon: "settings", open: () => Settings.open() },
    notepad: { label: "Notepad", icon: "notepad", open: () => Apps.notepad() },
    mines: { label: "Minesweeper", icon: "mine", open: () => Apps.minesweeper("beginner") },
    help: { label: "Help", icon: "help", open: () => Apps.help() },
    find: { label: "Find", icon: "find", open: () => Apps.find() },
    word: { label: "Microsoft Word", icon: "word", open: () => Office.launch("word") },
    excel: { label: "Microsoft Excel", icon: "excel", open: () => Office.launch("excel") },
    powerpoint: { label: "Microsoft PowerPoint", icon: "powerpoint", open: () => Office.launch("powerpoint") },
    vlc: { label: "VLC media player", icon: "vlc", open: () => VLC.open() },
  };

  function pinnedIds() {
    const list = Settings.get().desktop.taskbarPins;
    return Array.isArray(list) ? list.filter((id) => TASKBAR_APPS[id]) : [];
  }

  const Taskbar = {
    apps: TASKBAR_APPS,
    pins: pinnedIds,
    isPinned: (id) => pinnedIds().includes(id),
    togglePin(id) {
      if (!TASKBAR_APPS[id]) return;
      const current = pinnedIds();
      const next = current.includes(id) ? current.filter((x) => x !== id) : current.concat(id);
      Settings.patch({ desktop: { taskbarPins: next } });
      if (window.WM) WM.updateTaskbar();
      U.toast((current.includes(id) ? "Unpinned " : "Pinned ") + TASKBAR_APPS[id].label + (current.includes(id) ? " from" : " to") + " the taskbar");
    },
    open(id) {
      const app = TASKBAR_APPS[id];
      if (!app) return;
      try { app.open(); } catch (err) { U.error(err); }
    },
    renderPins(host) {
      if (!host) return;
      const pins = pinnedIds();
      if (!pins.length) return;
      pins.forEach((id) => {
        const app = TASKBAR_APPS[id];
        const running = (window.WM ? WM.list() : []).some((w) => w.opts.pinId === id);
        const button = U.el("button", {
          type: "button",
          class: "task-btn pin-btn" + (running ? " running" : ""),
          title: app.label + (running ? " (running)" : "") + "\nClick to open, right-click to unpin",
        });
        button.innerHTML = `<span class="t-ico">${Icons.get(app.icon, 16)}</span><span class="t-label"></span>`;
        button.querySelector(".t-label").textContent = app.label;
        button.addEventListener("click", () => Taskbar.open(id));
        button.addEventListener("contextmenu", (event) => {
          event.preventDefault();
          event.stopPropagation();
          U.contextMenu(event.clientX, event.clientY, [
            { label: "Open " + app.label, icon: app.icon, action: () => Taskbar.open(id) },
            { separator: true },
            { label: "Unpin from taskbar", action: () => Taskbar.togglePin(id) },
          ]);
        });
        host.append(button);
      });
      host.append(U.el("div", { class: "task-sep" }));
    },
  };

  window.Taskbar = Taskbar;

  // ------------------------------------------------------------ Init
  async function init() {
    buildStartMenu();
    tickClock();
    setInterval(tickClock, 5000);
    wireTray();

    startButton.addEventListener("click", (event) => {
      event.stopPropagation();
      toggleStart();
    });
    startButton.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      U.contextMenu(event.clientX, event.clientY, [
        { label: "Open Start Menu", action: openStart },
        { separator: true },
        { label: "Control Panel", icon: "settings", action: () => Settings.open() },
        { label: "Find...", icon: "find", action: () => Apps.find() },
        { label: "Run...", icon: "run", action: () => Apps.run() },
        { separator: true },
        { label: "Shut Down...", icon: "shutdown", action: () => Apps.shutdownDialog() },
      ]);
    });

    document.addEventListener("mousedown", (event) => {
      if (!startOpen) return;
      if (event.target.closest("#start-menu") || event.target.closest("#start-button")) return;
      if (startPopups.some((pop) => pop.contains(event.target))) return;
      closeStart();
    });
    document.addEventListener("mousedown", (event) => {
      if (U.qsa(".menu-pop").length && !event.target.closest(".menu-pop") && !event.target.closest(".menubar-item") && !event.target.closest(".start-item")) {
        U.closeMenus();
      }
    });

    window.addEventListener("keydown", globalKey);

    const shutdownRestart = document.getElementById("shutdown-restart");
    if (shutdownRestart) {
      shutdownRestart.addEventListener("click", () => window.location.reload());
    }

    try {
      await Settings.load();
    } catch (err) {
      console.warn(err);
    }
    loadCurrentUser();

    // First interaction unlocks WebAudio.
    const unlock = () => {
      Sound.resume();
      if (booted && !startupPlayed) {
        startupPlayed = true;
        Sound.play("startup");
      }
      document.removeEventListener("pointerdown", unlock);
      document.removeEventListener("keydown", unlock);
    };
    document.addEventListener("pointerdown", unlock);
    document.addEventListener("keydown", unlock);

    // Every visit starts with the Windows 95 boot screen. Clicking it skips
    // ahead; otherwise it clears itself after a randomised 2.6-5.0 s.
    runBoot();
  }

  init();
})();
