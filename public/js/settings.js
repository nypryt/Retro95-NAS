/* Win95 NAS - settings, wallpaper, CRT and Control Panel */
(function () {
  "use strict";

  const DEFAULTS = {
    user: "Guest",
    wallpaper: { type: "pattern", value: "teal", fit: "fill" },
    crt: { enabled: false, scanlines: 0.55, flicker: 0.25, vignette: 0.55, curvature: 0.4, aberration: 0.3, bezel: false, powerOn: true },
    sound: { enabled: true, volume: 0.35 },
    desktop: { showIcons: true, iconSize: 48, snap: true, showClock: true, boot: true, screensaver: 8, screensaverStyle: "starfield", dragFull: true, showTips: true, uiScale: 1, iconStyle: "v2", resolution: "default", taskbarPins: ["computer", "docker", "tailscale"] },
  };

  // Emulated screen modes. "default" means "fill this browser window".
  const RESOLUTIONS = {
    "640x480": [640, 480],
    "800x600": [800, 600],
    "1024x768": [1024, 768],
    "1280x1024": [1280, 1024],
    "1366x768": [1366, 768],
    "1600x900": [1600, 900],
    "1920x1080": [1920, 1080],
    "2560x1440": [2560, 1440],
    "3840x2160": [3840, 2160],
  };

  const PATTERNS = [
    { id: "teal", name: "Teal", css: { backgroundColor: "#008080" } },
    { id: "win95", name: "Windows Blue", css: { backgroundColor: "#3a6ea5" } },
    { id: "clouds", name: "Clouds", css: {
      backgroundColor: "#4a7fb5",
      backgroundImage: "radial-gradient(circle at 18% 28%, rgba(255,255,255,.95) 0 16px, transparent 17px), radial-gradient(circle at 30% 32%, rgba(255,255,255,.9) 0 24px, transparent 25px), radial-gradient(circle at 45% 25%, rgba(255,255,255,.75) 0 18px, transparent 19px), radial-gradient(circle at 72% 62%, rgba(255,255,255,.85) 0 22px, transparent 23px), radial-gradient(circle at 84% 58%, rgba(255,255,255,.7) 0 30px, transparent 31px), radial-gradient(circle at 55% 78%, rgba(255,255,255,.45) 0 26px, transparent 27px), linear-gradient(180deg, #6fa3d8, #2f5f96)",
    } },
    { id: "rivets", name: "Blue Rivets", css: {
      backgroundColor: "#2a5b8c",
      backgroundImage: "radial-gradient(circle at 50% 50%, #d8e4f0 0 1.5px, #6b8fb5 2px 3px, transparent 3.5px), linear-gradient(135deg, rgba(255,255,255,.10), rgba(0,0,0,.18))",
      backgroundSize: "26px 26px, 100% 100%",
    } },
    { id: "bricks", name: "Bricks", css: {
      backgroundColor: "#8b3a2a",
      backgroundImage: "linear-gradient(0deg, transparent 0 17px, #5e2419 17px 19px), linear-gradient(90deg, transparent 0 33px, #5e2419 33px 35px)",
      backgroundSize: "35px 19px, 70px 38px",
      backgroundPosition: "0 0, 17px 19px",
    } },
    { id: "tiles", name: "Tiles", css: {
      backgroundColor: "#c0c0c0",
      backgroundImage: "linear-gradient(45deg, #a8a8a8 25%, transparent 25% 75%, #a8a8a8 75%), linear-gradient(45deg, #a8a8a8 25%, transparent 25% 75%, #a8a8a8 75%)",
      backgroundSize: "32px 32px",
      backgroundPosition: "0 0, 16px 16px",
    } },
    { id: "stars", name: "Starry Night", css: {
      backgroundColor: "#000018",
      backgroundImage: "radial-gradient(circle at 20% 30%, #fff 0 1px, transparent 2px), radial-gradient(circle at 70% 20%, #cfe4ff 0 1px, transparent 2px), radial-gradient(circle at 45% 70%, #fff 0 1.5px, transparent 2.5px), radial-gradient(circle at 85% 75%, #aac8ff 0 1px, transparent 2px), radial-gradient(circle at 10% 85%, #fff 0 1px, transparent 2px), radial-gradient(circle at 60% 50%, #8fb0ff 0 1px, transparent 2px)",
      backgroundSize: "120px 120px, 160px 160px, 200px 200px, 140px 140px, 180px 180px, 220px 220px",
    } },
    { id: "grid", name: "Grid", css: {
      backgroundColor: "#004040",
      backgroundImage: "linear-gradient(rgba(0,255,200,.22) 1px, transparent 1px), linear-gradient(90deg, rgba(0,255,200,.22) 1px, transparent 1px)",
      backgroundSize: "24px 24px",
    } },
    { id: "circuit", name: "Circuit", css: {
      backgroundColor: "#05201c",
      backgroundImage: "linear-gradient(90deg, transparent 0 22px, #0f6b52 22px 23px, transparent 23px), linear-gradient(0deg, transparent 0 22px, #0f6b52 22px 23px, transparent 23px), radial-gradient(circle at 23px 23px, #29d3a3 0 2px, transparent 3px)",
      backgroundSize: "48px 48px, 48px 48px, 48px 48px",
    } },
    { id: "forest", name: "Forest", css: { backgroundImage: "linear-gradient(180deg, #2e6b3a 0%, #173d21 100%)", backgroundColor: "#173d21" } },
    { id: "sunset", name: "Sunset", css: { backgroundImage: "linear-gradient(180deg, #ff9a4a 0%, #d8466a 45%, #3a1e5c 100%)", backgroundColor: "#3a1e5c" } },
    { id: "ocean", name: "Ocean", css: { backgroundImage: "linear-gradient(180deg, #4fc3f7 0%, #1565c0 55%, #062a52 100%)", backgroundColor: "#062a52" } },
    { id: "slate", name: "Slate", css: { backgroundImage: "linear-gradient(135deg, #5a5a5a, #2e2e2e)", backgroundColor: "#3a3a3a" } },
    { id: "purple", name: "Purple Haze", css: { backgroundImage: "linear-gradient(135deg, #6a2c91, #2a0f4a)", backgroundColor: "#4a1f70" } },
    { id: "black", name: "Black", css: { backgroundColor: "#000000" } },
    { id: "paper", name: "Paper", css: { backgroundColor: "#e8e0c8" } },
  ];

  const COLORS = ["#008080", "#000080", "#3a6ea5", "#800080", "#008000", "#808000", "#800000", "#404040", "#000000", "#c0c0c0", "#ff8000", "#004040", "#4b0082", "#a0522d"];

  const listeners = new Set();
  let state = JSON.parse(JSON.stringify(DEFAULTS));
  let loaded = false;
  let appliedOnce = false;
  let saveTimer = null;

  function merge(base, patch) {
    const out = Object.assign({}, base);
    Object.keys(patch || {}).forEach((key) => {
      const value = patch[key];
      if (value && typeof value === "object" && !Array.isArray(value) && base && typeof base[key] === "object" && !Array.isArray(base[key])) {
        out[key] = merge(base[key], value);
      } else {
        out[key] = value;
      }
    });
    return out;
  }

  function cssToStyle(node, css) {
    Object.keys(css || {}).forEach((key) => { node.style[key] = css[key]; });
  }

  function clearBackground(node) {
    ["backgroundImage", "backgroundColor", "backgroundSize", "backgroundRepeat", "backgroundPosition"].forEach((key) => {
      node.style[key] = "";
    });
  }

  function wallpaperCSS(wp) {
    if (!wp) return { backgroundColor: "#008080" };
    if (wp.type === "color") return { backgroundColor: wp.value || "#008080" };
    if (wp.type === "pattern") {
      const pattern = PATTERNS.find((p) => p.id === wp.value) || PATTERNS[0];
      return pattern.css;
    }
    if (wp.type === "image") {
      const fit = wp.fit || "fill";
      const css = { backgroundImage: `url("${wp.value}")`, backgroundColor: "#000" };
      if (fit === "tile") { css.backgroundRepeat = "repeat"; css.backgroundSize = "auto"; }
      else if (fit === "center") { css.backgroundRepeat = "no-repeat"; css.backgroundPosition = "center"; css.backgroundSize = "auto"; }
      else if (fit === "stretch") { css.backgroundRepeat = "no-repeat"; css.backgroundSize = "100% 100%"; }
      else { css.backgroundRepeat = "no-repeat"; css.backgroundSize = "cover"; css.backgroundPosition = "center"; }
      return css;
    }
    return { backgroundColor: "#008080" };
  }

  function apply() {
    // Icon markup is baked into open windows, so a set change needs a reload.
    let iconChanged = false;
    if (window.Icons && state.desktop) {
      const wanted = Icons.styles().some((s) => s.id === state.desktop.iconStyle) ? state.desktop.iconStyle : "v2";
      if (wanted !== state.desktop.iconStyle) state.desktop.iconStyle = wanted;
      if (Icons.style() !== wanted) {
        Icons.setStyle(wanted);
        iconChanged = true;
      }
    }

    const desktop = document.getElementById("desktop");
    if (desktop) {
      clearBackground(desktop);
      cssToStyle(desktop, wallpaperCSS(state.wallpaper));
    }

    const overlay = document.getElementById("crt-overlay");
    const screen = document.getElementById("screen");
    const bezel = document.getElementById("crt-bezel");
    const crt = state.crt || {};
    if (overlay) {
      overlay.classList.toggle("on", !!crt.enabled);
      overlay.style.setProperty("--scan", String(crt.scanlines));
      overlay.style.setProperty("--vig", String(crt.vignette));
      overlay.style.setProperty("--flick", String(crt.flicker));
    }
    if (screen) {
      screen.classList.toggle("crt-on", !!crt.enabled);
      screen.classList.toggle("crt-aberration", !!crt.enabled && Number(crt.aberration) > 0.02);
      screen.style.borderRadius = crt.enabled ? Math.round(Number(crt.curvature || 0) * 22) + "px" : "";
    }
    if (bezel) bezel.classList.toggle("on", !!crt.enabled && !!crt.bezel);

    const trayCrt = document.getElementById("tray-crt");
    if (trayCrt) {
      trayCrt.innerHTML = Icons.get("monitor", 15);
      trayCrt.classList.toggle("muted", !crt.enabled);
      trayCrt.title = crt.enabled ? "CRT effect: on" : "CRT effect: off";
    }
    const traySound = document.getElementById("tray-sound");
    if (traySound) {
      traySound.classList.toggle("muted", !state.sound.enabled);
      traySound.innerHTML = Icons.get(state.sound.enabled ? "sound" : "mute", 15);
      traySound.title = state.sound.enabled ? "Sound: on" : "Sound: off";
    }
    const clock = document.getElementById("clock");
    if (clock) clock.classList.toggle("hidden", !state.desktop.showClock);

    applyResolution();

    if (window.Desktop && Desktop.applySettings) Desktop.applySettings(state);
    if (window.Screensaver && Screensaver.configure) {
      Screensaver.configure(state.desktop.screensaver, state.desktop.screensaverStyle);
    }
    listeners.forEach((fn) => {
      try { fn(state); } catch (err) { console.error(err); }
    });
    window.dispatchEvent(new CustomEvent("settings:change", { detail: state }));

    if (iconChanged) {
      // On the first pass the value came from the server, so just reload with
      // the new set. Later passes are user changes: save, then reload.
      if (appliedOnce) saveNow().then(() => window.location.reload());
      else window.location.reload();
    }
    appliedOnce = true;
  }

  // The "screen resolution" setting is emulated: the desktop becomes a fixed
  // stage of that many pixels and is scaled to fit the browser window.
  function applyResolution() {
    if (!window.U || !U.setScale) return;
    const screen = document.getElementById("screen");
    const value = String((state.desktop && state.desktop.resolution) || "default");
    const mode = RESOLUTIONS[value];
    if (!mode) {
      if (screen) {
        screen.style.width = "";
        screen.style.height = "";
        screen.style.inset = "";
        screen.style.left = "";
        screen.style.top = "";
      }
      U.setScale(Number(state.desktop.uiScale) || 1);
      return;
    }
    const [w, h] = mode;
    const fit = Math.min(window.innerWidth / w, window.innerHeight / h);
    if (screen) {
      screen.style.inset = "auto";
      screen.style.left = "0";
      screen.style.top = "0";
      screen.style.width = w + "px";
      screen.style.height = h + "px";
    }
    U.setScale(Math.max(0.05, fit));
  }

  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      try { await API.saveSettings(state); }
      catch (err) { console.warn("Could not save settings", err); }
    }, 250);
  }

  window.addEventListener("resize", () => {
    if (!loaded) return;
    applyResolution();
    if (window.Desktop && Desktop.applySettings) Desktop.applySettings(state);
  });

  // Ask the user to confirm a screen-mode change; revert automatically.
  async function changeResolution(next) {
    const previous = (state.desktop && state.desktop.resolution) || "default";
    if (next === previous) return;
    await patch({ desktop: { resolution: next } });
    let left = 5;
    let timer = null;
    const keep = await U.dialog({
      title: "Display Settings",
      icon: "monitor",
      width: 430,
      message: "Windows has changed the screen resolution.\n\n" +
        "If the picture looks wrong or you cannot read the screen, do nothing: " +
        "the previous resolution comes back automatically.",
      content: () => U.el("div", { class: "res-count", text: "Reverting in 5 seconds..." }),
      buttons: [
        { label: "Keep this resolution", value: true, primary: true },
        { label: "Revert", value: false },
      ],
      cancelValue: false,
      onBuild(w) {
        timer = setInterval(() => {
          left -= 1;
          const node = w.el.querySelector(".res-count");
          if (node) {
            node.textContent = left > 0
              ? "Reverting in " + left + " second" + (left === 1 ? "" : "s") + "..."
              : "Reverting...";
          }
          if (left <= 0) {
            clearInterval(timer);
            w.close();
          }
        }, 1000);
        const previousClose = w.opts.onClose;
        w.opts.onClose = () => {
          clearInterval(timer);
          if (previousClose) previousClose();
        };
      },
    });
    if (!keep) await patch({ desktop: { resolution: previous } });
  }

  async function load() {
    try {
      const data = await API.settings();
      state = merge(DEFAULTS, data.settings || {});
    } catch (err) {
      console.warn("Using default settings", err);
    }
    loaded = true;
    apply();
    return state;
  }

  async function patch(partial) {
    state = merge(state, partial);
    apply();
    scheduleSave();
    return state;
  }

  async function replace(next) {
    state = merge(DEFAULTS, next);
    apply();
    await saveNow();
    return state;
  }

  async function saveNow() {
    clearTimeout(saveTimer);
    try { await API.saveSettings(state); } catch (err) { console.warn(err); }
  }

  function setWallpaper(wp) {
    return patch({ wallpaper: wp });
  }

  function toggleCRT() {
    return patch({ crt: { enabled: !state.crt.enabled } });
  }

  function toggleSound() {
    return patch({ sound: { enabled: !state.sound.enabled } });
  }

  function powerOn() {
    if (!state.crt.powerOn) return;
    const node = document.getElementById("crt-power");
    if (!node) return;
    node.classList.add("on");
    node.innerHTML = '<div class="line"></div>';
    setTimeout(() => { node.classList.remove("on"); node.innerHTML = ""; }, 700);
  }

  // ------------------------------------------------------------- Control Panel
  const TABS = [
    { id: "background", label: "Background" },
    { id: "effects", label: "Display Effects" },
    { id: "sounds", label: "Sounds" },
    { id: "desktop", label: "Desktop" },
    { id: "system", label: "System" },
    { id: "users", label: "Users" },
    { id: "advanced", label: "Advanced" },
  ];

  function openApp(startTab) {
    const existing = WM.find("settings");
    if (existing) {
      existing.focus();
      if (startTab && existing.showTab) existing.showTab(startTab);
      return existing;
    }
    const snapshot = JSON.parse(JSON.stringify(state));
    let activeTab = startTab || "background";
    let detach = null;

    const win = WM.open({
      title: "Control Panel",
      icon: "settings",
      pinId: "control",
      width: 580,
      height: 480,
      minWidth: 460,
      minHeight: 340,
      singleton: "settings",
      build(body, w) {
        const app = U.el("div", { class: "settings-app" });
        const strip = U.el("div", { class: "tab-strip" });
        const panes = U.el("div", { class: "settings-panes" });
        const tabButtons = {};

        const paneNodes = {};
        TABS.forEach((tab) => {
          const button = U.el("div", { class: "tab", text: tab.label });
          button.addEventListener("click", () => selectTab(tab.id));
          strip.append(button);
          tabButtons[tab.id] = button;
          const pane = U.el("div", { class: "settings-pane", dataset: { pane: tab.id } });
          panes.append(pane);
          paneNodes[tab.id] = pane;
        });

        function selectTab(id) {
          activeTab = id;
          Object.entries(tabButtons).forEach(([key, node]) => node.classList.toggle("active", key === id));
          Object.entries(paneNodes).forEach(([key, node]) => node.classList.toggle("active", key === id));
          if (id === "system") refreshSystem();
          if (id === "users") refreshUsers();
        }
        w.showTab = selectTab;

        // ---------------------------------------------------- Background pane
        const bg = paneNodes.background;
        bg.append(U.el("h3", { text: "Pick a wallpaper" }));
        bg.append(U.el("div", { class: "settings-note", text: "Choose a classic pattern, a solid colour, or one of your own pictures. Changes are applied instantly." }));

        const previewWrap = U.el("div", { class: "row", style: { alignItems: "flex-start", gap: "12px", flexWrap: "wrap" } });
        const preview = U.el("div", { class: "wp-swatch", style: { width: "168px", height: "104px" } });
        const previewInner = U.el("div", { class: "wp-preview" });
        preview.append(previewInner);
        previewWrap.append(preview);

        const previewInfo = U.el("div", { style: { flex: "1", minWidth: "160px" } });
        const fitRow = U.el("div", { class: "settings-row" });
        const fitSelect = U.el("select", {});
        [["fill", "Fill screen"], ["tile", "Tile"], ["center", "Center"], ["stretch", "Stretch"]].forEach(([value, label]) => {
          fitSelect.append(U.el("option", { value, text: label }));
        });
        fitRow.append(U.el("label", { text: "Picture size:" }), fitSelect);
        const removeBtn = U.el("button", { type: "button", text: "Remove picture" });
        const browseBtn = U.el("button", { type: "button", text: "Upload picture..." });
        const fileInput = U.el("input", { type: "file", accept: "image/*", style: { display: "none" } });
        previewInfo.append(fitRow, U.el("div", { class: "row", style: { marginTop: "8px" } }, browseBtn, removeBtn), fileInput);
        previewInfo.append(U.el("div", { class: "settings-note", style: { marginTop: "6px" }, text: "PNG, JPG, GIF, WebP or BMP. Or drag an image straight onto the preview. Uploads are stored in data\\wallpapers." }));
        previewWrap.append(previewInfo);
        bg.append(previewWrap);

        function paintPreview() {
          clearBackground(previewInner);
          cssToStyle(previewInner, wallpaperCSS(state.wallpaper));
          fitSelect.value = state.wallpaper.fit || "fill";
          fitSelect.disabled = state.wallpaper.type !== "image";
          removeBtn.disabled = state.wallpaper.type !== "image";
        }

        fitSelect.addEventListener("change", () => {
          Settings.patch({ wallpaper: { fit: fitSelect.value } }).then(paintPreview);
        });

        browseBtn.addEventListener("click", () => fileInput.click());
        async function uploadWallpaper(file) {
          if (!file) return;
          if (!/^image\//i.test(file.type || "")) {
            U.alert("Wallpaper", "That does not look like an image. Pick a PNG, JPG, GIF, WebP or BMP file.", "warning");
            return;
          }
          const progress = U.progressDialog("Uploading wallpaper", file.name);
          try {
            const result = await API.uploadWallpaper(file);
            progress.set(1, "Done");
            setTimeout(() => progress.close(), 200);
            await Settings.setWallpaper({ type: "image", value: result.url, fit: "fill" });
            await buildWallpaperGallery();
            paintPreview();
            U.toast("Wallpaper added: " + result.name, "success");
          } catch (err) {
            progress.close();
            U.error(err);
          }
        }
        fileInput.addEventListener("change", () => {
          const file = fileInput.files && fileInput.files[0];
          fileInput.value = "";
          uploadWallpaper(file);
        });
        preview.addEventListener("dragover", (event) => {
          if (!event.dataTransfer || !Array.from(event.dataTransfer.types || []).includes("Files")) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = "copy";
          preview.classList.add("drop-target");
        });
        preview.addEventListener("dragleave", () => preview.classList.remove("drop-target"));
        preview.addEventListener("drop", (event) => {
          if (!event.dataTransfer || !event.dataTransfer.files || !event.dataTransfer.files.length) return;
          event.preventDefault();
          preview.classList.remove("drop-target");
          uploadWallpaper(event.dataTransfer.files[0]);
        });

        removeBtn.addEventListener("click", async () => {
          if (state.wallpaper.type !== "image") return;
          await Settings.setWallpaper({ type: "pattern", value: "teal", fit: "fill" });
          paintPreview();
          buildWallpaperGallery();
        });

        bg.append(U.el("h4", { text: "Colours" }));
        const colorGrid = U.el("div", { class: "color-grid" });
        COLORS.forEach((color) => {
          const swatch = U.el("div", { class: "color-swatch", style: { background: color }, title: color, dataset: { color } });
          swatch.addEventListener("click", async () => {
            await Settings.setWallpaper({ type: "color", value: color, fit: "fill" });
            paintPreview();
            buildWallpaperGallery();
          });
          colorGrid.append(swatch);
        });
        bg.append(colorGrid);

        bg.append(U.el("h4", { text: "Patterns" }));
        const patternGrid = U.el("div", { class: "wp-grid" });
        PATTERNS.forEach((pattern) => {
          const swatch = U.el("div", { class: "wp-swatch", title: pattern.name, dataset: { pattern: pattern.id } });
          const inner = U.el("div", { class: "wp-preview" });
          cssToStyle(inner, pattern.css);
          swatch.append(inner, U.el("div", { class: "wp-name", text: pattern.name }));
          swatch.addEventListener("click", async () => {
            await Settings.setWallpaper({ type: "pattern", value: pattern.id, fit: "fill" });
            paintPreview();
            buildWallpaperGallery();
          });
          patternGrid.append(swatch);
        });
        bg.append(patternGrid);

        bg.append(U.el("h4", { text: "Your pictures" }));
        const imageGrid = U.el("div", { class: "wp-grid" });
        bg.append(imageGrid);

        function markSelected() {
          const wp = state.wallpaper;
          U.qsa(".wp-swatch", bg).forEach((node) => {
            let selected = false;
            if (wp.type === "pattern" && node.dataset.pattern) selected = node.dataset.pattern === wp.value;
            if (wp.type === "image" && node.dataset.url) selected = node.dataset.url === wp.value;
            if (wp.type === "color" && node.dataset.color) selected = node.dataset.color === wp.value;
            node.classList.toggle("selected", selected);
          });
          U.qsa(".color-swatch", bg).forEach((node) => {
            node.classList.toggle("selected", wp.type === "color" && node.dataset.color === wp.value);
          });
        }

        async function buildWallpaperGallery() {
          imageGrid.innerHTML = "";
          try {
            const data = await API.wallpapers();
            data.wallpapers.forEach((item) => {
              const swatch = U.el("div", { class: "wp-swatch", title: item.name, dataset: { url: item.url } });
              const inner = U.el("div", { class: "wp-preview", style: { backgroundImage: `url("${item.url}")` } });
              swatch.append(inner, U.el("div", { class: "wp-name", text: item.name }));
              swatch.addEventListener("click", async () => {
                await Settings.setWallpaper({ type: "image", value: item.url, fit: state.wallpaper.fit || "fill" });
                paintPreview();
                markSelected();
              });
              imageGrid.append(swatch);
            });
            if (!data.wallpapers.length) {
              imageGrid.append(U.el("div", { class: "muted", text: "No pictures yet. Use Browse... to add one." }));
            }
          } catch (err) {
            imageGrid.append(U.el("div", { class: "muted", text: "Could not list pictures." }));
          }
          markSelected();
        }

        // ---------------------------------------------------- Effects pane
        const fx = paneNodes.effects;
        fx.append(U.el("h3", { text: "CRT monitor simulation" }));
        fx.append(U.el("div", { class: "settings-note", text: "Scanlines, phosphor glow, flicker and a chunky glass tube. Purely decorative. Obviously essential." }));
        const crtPreview = U.el("div", { class: "crt-preview" });
        crtPreview.innerHTML = '<div class="fake-win"><div class="fake-title">My Computer</div><div class="fake-lines">File&nbsp;&nbsp;Edit&nbsp;&nbsp;View<br>C:\\&gt; dir<br>&nbsp;WINDOWS<br>&nbsp;PROGRAMS</div></div><div class="scan"></div><div class="vig"></div>';
        fx.append(crtPreview);

        const crtToggle = U.el("input", { type: "checkbox" });
        const crtRow = U.el("div", { class: "settings-row" }, crtToggle, U.el("label", { text: "Enable CRT effect" }));
        crtToggle.addEventListener("change", () => Settings.patch({ crt: { enabled: crtToggle.checked } }).then(syncFX));
        fx.append(crtRow);

        function slider(label, key, min, max, step, suffix) {
          const input = U.el("input", { type: "range", min, max, step, style: { width: "190px" } });
          const valueLabel = U.el("span", { class: "muted", style: { minWidth: "42px", display: "inline-block" } });
          input.addEventListener("input", () => {
            valueLabel.textContent = Math.round(Number(input.value) * 100) + (suffix || "%");
            Settings.patch({ crt: { [key]: Number(input.value) } });
          });
          const row = U.el("div", { class: "settings-row" },
            U.el("label", { text: label }), input, valueLabel);
          row.dataset.key = key;
          fx.append(row);
          return { input, valueLabel };
        }

        const scan = slider("Scanlines", "scanlines", 0, 1, 0.01, "%");
        const vignette = slider("Vignette", "vignette", 0, 1, 0.01, "%");
        const flicker = slider("Flicker", "flicker", 0, 1, 0.01, "%");
        const aberration = slider("Colour bleed", "aberration", 0, 1, 0.01, "%");
        const curvature = slider("Curvature", "curvature", 0, 1, 0.01, "%");

        const bezelToggle = U.el("input", { type: "checkbox" });
        const bezelRow = U.el("div", { class: "settings-row" }, bezelToggle, U.el("label", { text: "Draw monitor bezel around the screen" }));
        bezelToggle.addEventListener("change", () => Settings.patch({ crt: { bezel: bezelToggle.checked } }));
        fx.append(bezelRow);

        const powerToggle = U.el("input", { type: "checkbox" });
        const powerRow = U.el("div", { class: "settings-row" }, powerToggle, U.el("label", { text: "Play power-on animation when enabling CRT" }));
        powerToggle.addEventListener("change", () => Settings.patch({ crt: { powerOn: powerToggle.checked } }));
        fx.append(powerRow);

        const testBtn = U.el("button", { type: "button", text: "Test power-on" });
        testBtn.addEventListener("click", () => {
          if (!state.crt.enabled) Settings.patch({ crt: { enabled: true } }).then(() => Settings.powerOn());
          else Settings.powerOn();
        });
        fx.append(U.el("div", { class: "row", style: { marginTop: "10px" } }, testBtn));

        function syncFX() {
          const crt = state.crt;
          crtToggle.checked = !!crt.enabled;
          bezelToggle.checked = !!crt.bezel;
          powerToggle.checked = !!crt.powerOn;
          scan.input.value = crt.scanlines;
          scan.valueLabel.textContent = Math.round(crt.scanlines * 100) + "%";
          vignette.input.value = crt.vignette;
          vignette.valueLabel.textContent = Math.round(crt.vignette * 100) + "%";
          flicker.input.value = crt.flicker;
          flicker.valueLabel.textContent = Math.round(crt.flicker * 100) + "%";
          aberration.input.value = crt.aberration;
          aberration.valueLabel.textContent = Math.round(crt.aberration * 100) + "%";
          curvature.input.value = crt.curvature;
          curvature.valueLabel.textContent = Math.round(crt.curvature * 100) + "%";
        }

        // ---------------------------------------------------- Sounds pane
        const snd = paneNodes.sounds;
        snd.append(U.el("h3", { text: "Sound events" }));
        const soundToggle = U.el("input", { type: "checkbox" });
        const soundRow = U.el("div", { class: "settings-row" }, soundToggle, U.el("label", { text: "Enable sound effects" }));
        soundToggle.addEventListener("change", () => Settings.patch({ sound: { enabled: soundToggle.checked } }).then(syncSound));
        snd.append(soundRow);

        const volInput = U.el("input", { type: "range", min: "0", max: "1", step: "0.01", style: { width: "190px" } });
        const volLabel = U.el("span", { class: "muted", style: { minWidth: "42px" } });
        volInput.addEventListener("input", () => {
          volLabel.textContent = Math.round(Number(volInput.value) * 100) + "%";
          Settings.patch({ sound: { volume: Number(volInput.value) } });
        });
        snd.append(U.el("div", { class: "settings-row" }, U.el("label", { text: "Volume" }), volInput, volLabel));

        const soundButtons = [
          ["Startup", "startup"], ["Click", "click"], ["Open window", "open"], ["Error", "error"],
          ["Ding", "ding"], ["Shut down", "shutdown"],
        ];
        const soundGrid = U.el("div", { class: "row wrap", style: { marginTop: "8px" } });
        soundButtons.forEach(([label, name]) => {
          const button = U.el("button", { type: "button", text: label });
          button.addEventListener("click", () => {
            Sound.resume();
            Sound.test(name);
          });
          soundGrid.append(button);
        });
        snd.append(soundGrid);
        snd.append(U.el("div", { class: "settings-note", style: { marginTop: "10px" }, text: "Sounds are generated live with the Web Audio API. No .wav files were harmed." }));

        function syncSound() {
          soundToggle.checked = !!state.sound.enabled;
          volInput.value = state.sound.volume;
          volLabel.textContent = Math.round(state.sound.volume * 100) + "%";
        }

        // ---------------------------------------------------- Desktop pane
        const desk = paneNodes.desktop;
        desk.append(U.el("h3", { text: "Desktop & screensaver" }));

        function checkRow(label, getValue, onChange, note) {
          const input = U.el("input", { type: "checkbox" });
          input.checked = !!getValue();
          input.addEventListener("change", () => onChange(input.checked));
          const row = U.el("div", { class: "settings-row" }, input, U.el("label", { text: label }));
          desk.append(row);
          if (note) desk.append(U.el("div", { class: "settings-note", style: { marginLeft: "20px" }, text: note }));
          return input;
        }

        checkRow("Show desktop icons", () => state.desktop.showIcons, (v) => Settings.patch({ desktop: { showIcons: v } }));
        checkRow("Show clock in the system tray", () => state.desktop.showClock, (v) => Settings.patch({ desktop: { showClock: v } }));
        desk.append(U.el("div", { class: "settings-note", style: { marginLeft: "0" }, text: "The Windows 95 boot screen plays on every visit (2-8 seconds, click to skip)." }));
        checkRow("Show welcome tips", () => state.desktop.showTips, (v) => Settings.patch({ desktop: { showTips: v } }));
        checkRow("Snap icons to the grid", () => state.desktop.snap, (v) => Settings.patch({ desktop: { snap: v } }));

        const iconSizeRow = U.el("div", { class: "settings-row" });
        const iconSizeSelect = U.el("select", {});
        [["32", "Small (32 px)"], ["48", "Medium (48 px)"], ["64", "Large (64 px)"]].forEach(([value, label]) => iconSizeSelect.append(U.el("option", { value, text: label })));
        iconSizeSelect.value = String(state.desktop.iconSize);
        iconSizeSelect.addEventListener("change", () => Settings.patch({ desktop: { iconSize: Number(iconSizeSelect.value) } }));
        iconSizeRow.append(U.el("label", { text: "Desktop icon size" }), iconSizeSelect);
        desk.append(iconSizeRow);

        const iconSetRow = U.el("div", { class: "settings-row" });
        const iconSetSelect = U.el("select", {});
        Icons.styles().forEach((style) => iconSetSelect.append(U.el("option", { value: style.id, text: style.label })));
        iconSetSelect.value = state.desktop.iconStyle || "v2";
        iconSetSelect.addEventListener("change", () => Settings.patch({ desktop: { iconStyle: iconSetSelect.value } }));
        iconSetRow.append(U.el("label", { text: "Icon set" }), iconSetSelect);
        desk.append(iconSetRow);
        desk.append(U.el("div", { class: "settings-note", style: { marginLeft: "20px" }, text: "Classic: the original hand-drawn icons. V2: the current pixel art. Windows 95: the real Windows 95 icons. Changing the set refreshes the desktop." }));

        const scaleRow = U.el("div", { class: "settings-row" });
        const scaleSelect = U.el("select", {});
        [["75", "75% - Tiny"], ["80", "80% - Very small"], ["90", "90% - Small"], ["100", "100% - Normal"], ["110", "110% - Large"], ["125", "125% - Larger"], ["150", "150% - Huge"]].forEach(([value, label]) => scaleSelect.append(U.el("option", { value, text: label })));
        scaleSelect.value = String(Math.round((Number(state.desktop.uiScale) || 1) * 100));
        if (!scaleSelect.value) scaleSelect.value = "100";
        scaleSelect.addEventListener("change", () => Settings.patch({ desktop: { uiScale: Number(scaleSelect.value) / 100 } }));
        scaleRow.append(U.el("label", { text: "Display scaling" }), scaleSelect);
        desk.append(scaleRow);
        desk.append(U.el("div", { class: "settings-note", style: { marginLeft: "20px" }, text: "Shrinks or enlarges the whole interface. Use a smaller value on large monitors to fit more windows and icons on screen." }));

        const resRow = U.el("div", { class: "settings-row" });
        const resSelect = U.el("select", {});
        [["default", "Use Default (fill window)"],
          ["640x480", "640 x 480"],
          ["800x600", "800 x 600"],
          ["1024x768", "1024 x 768"],
          ["1280x1024", "1280 x 1024"],
          ["1366x768", "1366 x 768"],
          ["1600x900", "1600 x 900"],
          ["1920x1080", "1920 x 1080"],
          ["2560x1440", "2560 x 1440"],
          ["3840x2160", "3840 x 2160"],
        ].forEach(([value, label]) => resSelect.append(U.el("option", { value, text: label })));
        resSelect.value = state.desktop.resolution || "default";
        resSelect.addEventListener("change", () => { changeResolution(resSelect.value); });
        resRow.append(U.el("label", { text: "Screen resolution" }), resSelect);
        desk.append(resRow);
        desk.append(U.el("div", { class: "settings-note", style: { marginLeft: "20px" }, text: "Emulates a classic screen mode. The desktop is laid out at that resolution and scaled to fit this window. Display scaling is ignored while a fixed resolution is selected." }));

        const ssRow = U.el("div", { class: "settings-row" });
        const ssSelect = U.el("select", {});
        [["0", "Never"], ["1", "After 1 minute"], ["3", "After 3 minutes"], ["5", "After 5 minutes"], ["8", "After 8 minutes"], ["15", "After 15 minutes"], ["30", "After 30 minutes"]].forEach(([value, label]) => ssSelect.append(U.el("option", { value, text: label })));
        ssSelect.value = String(state.desktop.screensaver);
        ssSelect.addEventListener("change", () => Settings.patch({ desktop: { screensaver: Number(ssSelect.value) } }));
        ssRow.append(U.el("label", { text: "Screensaver" }), ssSelect);
        desk.append(ssRow);

        const styleRow = U.el("div", { class: "settings-row" });
        const styleSelect = U.el("select", {});
        [["starfield", "Starfield"], ["mystify", "Mystify"], ["flying", "Flying Windows"], ["blank", "Blank screen"]].forEach(([value, label]) => styleSelect.append(U.el("option", { value, text: label })));
        styleSelect.value = state.desktop.screensaverStyle;
        styleSelect.addEventListener("change", () => Settings.patch({ desktop: { screensaverStyle: styleSelect.value } }));
        styleRow.append(U.el("label", { text: "Screensaver style" }), styleSelect);
        desk.append(styleRow);

        const ssPreview = U.el("button", { type: "button", text: "Preview screensaver" });
        ssPreview.addEventListener("click", () => { if (window.Screensaver) Screensaver.start(true); });
        const resetIcons = U.el("button", { type: "button", text: "Reset icon positions" });
        resetIcons.addEventListener("click", () => { if (window.Desktop) Desktop.resetIconPositions(); });
        desk.append(U.el("div", { class: "row", style: { marginTop: "10px" } }, ssPreview, resetIcons));

        // ---------------------------------------------------- System pane
        const sys = paneNodes.system;
        sys.append(U.el("h3", { text: "System" }));
        const sysInfo = U.el("div", { class: "sysinfo" });
        sys.append(sysInfo);
        const storageHost = U.el("div", { style: { marginTop: "10px" } });
        sys.append(storageHost);
        const sysButtons = U.el("div", { class: "row", style: { marginTop: "10px" } });
        const refreshBtn = U.el("button", { type: "button", text: "Refresh" });
        const openRootBtn = U.el("button", { type: "button", text: "Open NAS folder" });
        const aboutBtn = U.el("button", { type: "button", text: "About..." });
        sysButtons.append(refreshBtn, openRootBtn, aboutBtn);
        sys.append(sysButtons);

        refreshBtn.addEventListener("click", refreshSystem);
        openRootBtn.addEventListener("click", async () => {
          try { await API.openFolder("/"); U.toast("Opened the NAS folder in Windows Explorer", "success"); }
          catch (err) { U.error(err); }
        });
        aboutBtn.addEventListener("click", () => { if (window.Apps) Apps.about(); });

        let infoCache = null;
        async function refreshSystem() {
          sysInfo.innerHTML = "<dt>Loading...</dt><dd></dd>";
          try {
            const info = await API.info();
            infoCache = info;
            const storage = info.storage;
            const limit = storage.limit || storage.diskTotal || 1;
            sysInfo.innerHTML = "";
            const rows = [
              ["Computer", info.hostname],
              ["User", info.user || state.user || "Guest"],
              ["Win95 NAS", info.version + " (" + info.python + ")"],
              ["Address", "http://localhost:" + info.port],
              ["Network", "http://" + info.ip + ":" + info.port],
              ["NAS folder", info.root],
              ["Storage limit", U.fmtSize(limit) + " (" + Number(limit).toLocaleString() + " bytes)"],
              ["Docker", info.docker && info.docker.running ? "Connected - v" + info.docker.version : (info.docker && info.docker.installed ? "Installed, engine offline" : "Not installed")],
            ];
            rows.forEach(([key, value]) => {
              sysInfo.append(U.el("dt", { text: key }), U.el("dd", { text: String(value) }));
            });
            storageHost.innerHTML = "";
            storageHost.append(
              U.el("div", { class: "settings-row", style: { justifyContent: "space-between" } },
                U.el("span", { text: "NAS storage" }),
                U.el("span", { class: "muted", text: U.fmtSize(storage.used) + " of " + U.fmtSize(limit) + " used (" + (storage.percent || 0) + "%)" })),
              U.bytesBar(storage.used, limit),
              U.el("div", { class: "settings-row", style: { justifyContent: "space-between", marginTop: "4px" } },
                U.el("span", { class: "muted", text: storage.files + " files, " + storage.folders + " folders" }),
                U.el("span", { class: "muted", text: U.fmtSize(storage.limitFree) + " free on the NAS  \u2022  " + U.fmtSize(storage.diskFree) + " free on disk" }))
            );
          } catch (err) {
            sysInfo.innerHTML = "";
            sysInfo.append(U.el("dt", { text: "Error" }), U.el("dd", { text: String(err.message || err) }));
          }
        }

        // ---------------------------------------------------- Users pane
        const us = paneNodes.users;
        us.append(U.el("h3", { text: "User accounts" }));
        us.append(U.el("div", { class: "settings-note", text: "These accounts protect this website. Passwords are hashed with PBKDF2-SHA256 and stored in data\\users.json on this PC. There is no cloud account and no password-reset email." }));
        const usersHost = U.el("div", { class: "user-list" });
        us.append(usersHost);
        const usersActions = U.el("div", { class: "row", style: { marginTop: "10px" } });
        const addUserBtn = U.el("button", { type: "button", text: "Add user..." });
        const passBtn = U.el("button", { type: "button", text: "Change my password..." });
        const refreshUsersBtn = U.el("button", { type: "button", text: "Refresh" });
        usersActions.append(addUserBtn, passBtn, refreshUsersBtn);
        us.append(usersActions);
        const usersFoot = U.el("div", { class: "settings-note", style: { marginTop: "8px" } });
        us.append(usersFoot);

        function fmtCreated(ms) {
          if (!ms) return "";
          try { return new Date(ms).toLocaleDateString(); } catch (_err) { return ""; }
        }

        function renderUsers(data) {
          usersHost.innerHTML = "";
          if (!data.users || !data.users.length) {
            usersHost.append(U.el("div", { class: "user-empty", text: "No accounts found. Sign out and create one from the logon screen." }));
            return;
          }
          data.users.forEach((user) => {
            const row = U.el("div", { class: "user-row" });
            row.append(U.el("span", { class: "u-ico", html: Icons.get(user.admin ? "keys" : "user", 24) }));
            const main = U.el("div", { class: "u-main" });
            const name = U.el("div", { class: "u-name" });
            name.append(document.createTextNode(user.username));
            if (user.admin) name.append(U.el("span", { class: "u-tag", text: "Administrator" }));
            if (data.me && user.username.toLowerCase() === data.me.username.toLowerCase()) {
              name.append(U.el("span", { class: "u-you", text: " (you)" }));
            }
            main.append(name);
            main.append(U.el("div", { class: "u-meta", text: "Created " + (fmtCreated(user.created) || "unknown") }));
            row.append(main);
            if (data.me && data.me.admin && user.username.toLowerCase() !== data.me.username.toLowerCase()) {
              const removeBtn = U.el("button", { type: "button", text: "Remove" });
              removeBtn.addEventListener("click", async () => {
                if (!await U.confirm("Remove user", "Remove the account \u201C" + user.username + "\u201D?\n\nFiles on the NAS are not deleted.", "warning")) return;
                try {
                  await API.auth.removeUser(user.username);
                  U.toast("Removed " + user.username, "success");
                  refreshUsers();
                } catch (err) { U.alert("Remove user", err.message, "error"); }
              });
              row.append(removeBtn);
            }
            usersHost.append(row);
          });
          if (data.me && !data.me.admin) {
            addUserBtn.disabled = true;
            usersFoot.textContent = "Only an administrator can add or remove accounts. You can still change your own password.";
          } else {
            addUserBtn.disabled = false;
            usersFoot.textContent = "The first account created is the administrator. At least one administrator must remain.";
          }
        }

        async function refreshUsers() {
          usersHost.innerHTML = "";
          usersHost.append(U.el("div", { class: "user-empty", text: "Loading accounts..." }));
          try {
            renderUsers(await API.auth.users());
          } catch (err) {
            usersHost.innerHTML = "";
            usersHost.append(U.el("div", { class: "user-empty", text: String(err.message || err) }));
          }
        }

        function passwordFields(includeCurrent) {
          const wrap = U.el("div", { style: { display: "flex", flexDirection: "column", gap: "6px", marginTop: "6px" } });
          const make = (label, type) => {
            const row = U.el("div", { class: "settings-row" });
            const input = U.el("input", { type, style: { flex: "1" }, spellcheck: "false" });
            row.append(U.el("label", { text: label, style: { flex: "0 0 118px" } }), input);
            wrap.append(row);
            return input;
          };
          return {
            wrap,
            username: includeCurrent ? null : make("User name:", "text"),
            current: includeCurrent ? make("Current password:", "password") : null,
            password: make(includeCurrent ? "New password:" : "Password:", "password"),
            confirm: make("Confirm:", "password"),
          };
        }

        addUserBtn.addEventListener("click", () => {
          let fields = null;
          let box = null;
          let wref = null;
          async function submit() {
            if (!fields || !wref) return;
            const username = fields.username.value.trim();
            const password = fields.password.value;
            box.hidden = true;
            if (!username) { box.textContent = "Type a user name."; box.hidden = false; return; }
            if (password.length < 4) { box.textContent = "Use a password with at least 4 characters."; box.hidden = false; return; }
            if (password !== fields.confirm.value) { box.textContent = "The two passwords do not match."; box.hidden = false; return; }
            try {
              await API.auth.addUser(username, password, false);
              U.toast("Added " + username, "success");
              wref.close();
              refreshUsers();
            } catch (err) {
              box.textContent = err.message || String(err);
              box.hidden = false;
            }
          }
          U.dialog({
            title: "Add User",
            icon: "user",
            width: 400,
            message: "Create another account for Win95 NAS. New accounts are standard users; the first account stays the administrator.",
            buttons: [
              { label: "Create", value: "ok", primary: true, close: false, action: submit },
              { label: "Cancel", value: null },
            ],
            content: (w) => {
              wref = w;
              fields = passwordFields(false);
              box = U.el("div", { hidden: true, style: { color: "#800000", fontWeight: "bold", marginTop: "4px" } });
              fields.wrap.append(box);
              setTimeout(() => fields.username.focus(), 60);
              return fields.wrap;
            },
          });
        });

        passBtn.addEventListener("click", () => {
          let fields = null;
          let box = null;
          let wref = null;
          async function submit() {
            if (!fields || !wref) return;
            const current = fields.current.value;
            const password = fields.password.value;
            box.hidden = true;
            if (!current) { box.textContent = "Type your current password."; box.hidden = false; return; }
            if (password.length < 4) { box.textContent = "Use a new password with at least 4 characters."; box.hidden = false; return; }
            if (password !== fields.confirm.value) { box.textContent = "The two passwords do not match."; box.hidden = false; return; }
            try {
              await API.auth.changePassword(current, password);
              U.toast("Password changed", "success");
              wref.close();
            } catch (err) {
              box.textContent = err.message || String(err);
              box.hidden = false;
            }
          }
          U.dialog({
            title: "Change Password",
            icon: "keys",
            width: 400,
            message: "Change the password for the account you are signed in with.",
            buttons: [
              { label: "Change", value: "ok", primary: true, close: false, action: submit },
              { label: "Cancel", value: null },
            ],
            content: (w) => {
              wref = w;
              fields = passwordFields(true);
              box = U.el("div", { hidden: true, style: { color: "#800000", fontWeight: "bold", marginTop: "4px" } });
              fields.wrap.append(box);
              setTimeout(() => fields.current.focus(), 60);
              return fields.wrap;
            },
          });
        });

        refreshUsersBtn.addEventListener("click", refreshUsers);

        // ---------------------------------------------------- Advanced pane
        const adv = paneNodes.advanced;
        adv.append(U.el("h3", { text: "Advanced" }));
        adv.append(U.el("div", { class: "settings-note", text: "Backups, resets and dangerous buttons. Handle with care, or at least with a floppy disk." }));
        const exportBtn = U.el("button", { type: "button", text: "Export settings" });
        exportBtn.addEventListener("click", () => {
          const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
          const link = U.el("a", { href: URL.createObjectURL(blob), download: "win95nas-settings.json" });
          document.body.append(link);
          link.click();
          link.remove();
          setTimeout(() => URL.revokeObjectURL(link.href), 1000);
        });
        const importBtn = U.el("button", { type: "button", text: "Import settings" });
        const importInput = U.el("input", { type: "file", accept: "application/json", style: { display: "none" } });
        importInput.addEventListener("change", async () => {
          const file = importInput.files && importInput.files[0];
          if (!file) return;
          try {
            const text = await file.text();
            const parsed = JSON.parse(text);
            await Settings.replace(parsed);
            syncAll();
            U.toast("Settings imported", "success");
          } catch (err) { U.error(new Error("Could not import settings: " + err.message)); }
        });
        importBtn.addEventListener("click", () => importInput.click());

        const resetBtn = U.el("button", { type: "button", text: "Restore defaults" });
        resetBtn.addEventListener("click", async () => {
          if (!await U.confirm("Restore defaults", "Reset every setting, including wallpaper and CRT options?", "warning")) return;
          await Settings.replace(DEFAULTS);
          syncAll();
          buildWallpaperGallery();
          paintPreview();
          U.toast("Settings restored to defaults", "success");
        });

        const emptyBinBtn = U.el("button", { type: "button", text: "Empty Recycle Bin" });
        emptyBinBtn.addEventListener("click", async () => {
          if (!await U.confirm("Confirm Delete", "Permanently delete everything in the Recycle Bin?", "warning")) return;
          try { await API.emptyRecycle(); U.toast("Recycle Bin emptied", "success"); }
          catch (err) { U.error(err); }
        });

        const clearIconsBtn = U.el("button", { type: "button", text: "Clear icon positions" });
        clearIconsBtn.addEventListener("click", () => {
          if (window.Desktop) Desktop.resetIconPositions();
          U.toast("Desktop icon positions reset", "success");
        });

        adv.append(U.el("div", { class: "row wrap", style: { marginTop: "8px" } }, exportBtn, importBtn, importInput));
        adv.append(U.el("div", { class: "hr" }));
        adv.append(U.el("div", { class: "row wrap" }, resetBtn, emptyBinBtn, clearIconsBtn));
        adv.append(U.el("div", { class: "hr" }));
        adv.append(U.el("h4", { text: "Keyboard shortcuts" }));
        adv.append(U.el("div", { class: "settings-note", text: "Ctrl+Esc Start menu  |  Alt+F4 close window  |  F2 rename  |  Delete send to Recycle Bin  |  Ctrl+A select all  |  F5 refresh  |  Backspace up one folder  |  Enter open" }));

        // ---------------------------------------------------- assemble
        app.append(strip, panes);

        const actions = U.el("div", { class: "settings-actions" });
        const okBtn = U.el("button", { type: "button", text: "OK", class: "default" });
        const applyBtn = U.el("button", { type: "button", text: "Apply" });
        const cancelBtn = U.el("button", { type: "button", text: "Cancel" });
        okBtn.addEventListener("click", async () => { await Settings.saveNow(); w.close(); });
        applyBtn.addEventListener("click", async () => {
          await Settings.saveNow();
          U.toast("Settings applied", "success");
        });
        cancelBtn.addEventListener("click", async () => {
          await Settings.replace(snapshot);
          w.close();
        });
        actions.append(okBtn, applyBtn, cancelBtn);
        app.append(actions);
        body.append(app);

        U.menuBar(w, [
          { label: "File", items: [
            { label: "Apply", action: () => Settings.saveNow() },
            { label: "Close", action: () => w.close() },
          ] },
          { label: "View", items: TABS.map((tab) => ({ label: tab.label, action: () => selectTab(tab.id) })) },
          { label: "Help", items: [
            { label: "About Control Panel", action: () => Apps.about() },
          ] },
        ]);

        function syncAll() {
          syncFX();
          syncSound();
          paintPreview();
          markSelected();
          iconSizeSelect.value = String(state.desktop.iconSize);
          ssSelect.value = String(state.desktop.screensaver);
          styleSelect.value = state.desktop.screensaverStyle;
        }

        selectTab(activeTab);
        syncAll();
        buildWallpaperGallery();
        refreshSystem();
        Settings.onChange(syncFX);
        Settings.onChange(syncSound);
        Settings.onChange(markSelected);
        detach = () => {
          Settings.offChange(syncFX);
          Settings.offChange(syncSound);
          Settings.offChange(markSelected);
        };
      },
      onClose() {
        if (detach) detach();
      },
    });
    return win;
  }

  const Settings = {
    DEFAULTS, PATTERNS, COLORS,
    get: () => state,
    load,
    patch,
    replace,
    saveNow,
    setWallpaper,
    toggleCRT,
    toggleSound,
    powerOn,
    open: openApp,
    onChange(fn) { listeners.add(fn); },
    offChange(fn) { listeners.delete(fn); },
    apply,
    wallpaperCSS,
    ready: () => loaded,
  };

  window.Settings = Settings;
})();
