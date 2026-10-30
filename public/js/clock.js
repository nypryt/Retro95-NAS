/* Win95 NAS - Clock: analog + digital time, stopwatch and world clocks.
 * Deliberately no alarms: the app only ever displays time. */
(function () {
  "use strict";

  const Apps = (window.Apps = window.Apps || {});

  const WORLD = [
    { city: "Local", zone: undefined },
    { city: "London", zone: "Europe/London" },
    { city: "New York", zone: "America/New_York" },
    { city: "Los Angeles", zone: "America/Los_Angeles" },
    { city: "Tokyo", zone: "Asia/Tokyo" },
    { city: "Sydney", zone: "Australia/Sydney" },
  ];

  function pad(n) {
    return String(n).padStart(2, "0");
  }

  function clockMarkup() {
    let ticks = "";
    for (let i = 0; i < 60; i += 1) {
      const big = i % 5 === 0;
      const angle = (i / 60) * Math.PI * 2;
      const r1 = big ? 78 : 84;
      const r2 = 88;
      const x1 = 100 + Math.sin(angle) * r1;
      const y1 = 100 - Math.cos(angle) * r1;
      const x2 = 100 + Math.sin(angle) * r2;
      const y2 = 100 - Math.cos(angle) * r2;
      ticks += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${big ? "#000" : "#808080"}" stroke-width="${big ? 2 : 1}"/>`;
    }
    let numbers = "";
    for (let h = 1; h <= 12; h += 1) {
      const angle = (h / 12) * Math.PI * 2;
      const x = 100 + Math.sin(angle) * 66;
      const y = 100 - Math.cos(angle) * 66 + 5;
      numbers += `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="middle" font-family="MS Sans Serif, Tahoma, sans-serif" font-size="13" font-weight="bold" fill="#000">${h}</text>`;
    }
    return `<svg class="clock-face" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
      <circle cx="100" cy="100" r="96" fill="#c0c0c0" stroke="#000" stroke-width="3"/>
      <circle cx="100" cy="100" r="90" fill="#f8f8f0" stroke="#808080" stroke-width="1"/>
      ${ticks}
      ${numbers}
      <line class="hand-hour" x1="100" y1="100" x2="100" y2="52" stroke="#000" stroke-width="5" stroke-linecap="round"/>
      <line class="hand-min" x1="100" y1="100" x2="100" y2="32" stroke="#000" stroke-width="3" stroke-linecap="round"/>
      <line class="hand-sec" x1="100" y1="108" x2="100" y2="24" stroke="#c00000" stroke-width="1.5" stroke-linecap="round"/>
      <circle cx="100" cy="100" r="4" fill="#000"/>
      <circle cx="100" cy="100" r="1.6" fill="#c00000"/>
    </svg>`;
  }

  function fmtTime(date, use24) {
    let h = date.getHours();
    const m = pad(date.getMinutes());
    const s = pad(date.getSeconds());
    if (use24) return pad(h) + ":" + m + ":" + s;
    const suffix = h >= 12 ? "PM" : "AM";
    h = h % 12 || 12;
    return h + ":" + m + ":" + s + " " + suffix;
  }

  function fmtStopwatch(ms) {
    const total = Math.max(0, ms);
    const hundredths = Math.floor((total % 1000) / 10);
    const seconds = Math.floor(total / 1000) % 60;
    const minutes = Math.floor(total / 60000) % 60;
    const hours = Math.floor(total / 3600000);
    return (hours ? pad(hours) + ":" : "") + pad(minutes) + ":" + pad(seconds) + "." + pad(hundredths);
  }

  Apps.clock = function clockApp() {
    let use24 = true;
    let ticker = null;
    let stopTicker = null;

    // Stopwatch state
    let swRunning = false;
    let swElapsed = 0;
    let swStarted = 0;
    let laps = [];

    const win = WM.open({
      title: "Clock",
      icon: "clock",
      pinId: "clock",
      width: 470,
      height: 500,
      minWidth: 380,
      minHeight: 420,
      build(body, w) {
        const app = U.el("div", { class: "clock-app" });

        // ---- tabs
        const tabs = U.el("div", { class: "clock-tabs" });
        const panes = U.el("div", { class: "clock-panes" });
        const tabDefs = [
          { id: "clock", label: "Clock" },
          { id: "stopwatch", label: "Stopwatch" },
          { id: "world", label: "World Clock" },
        ];
        const paneMap = {};
        const tabMap = {};
        function selectTab(id) {
          tabDefs.forEach((def) => {
            tabMap[def.id].classList.toggle("active", def.id === id);
            paneMap[def.id].hidden = def.id !== id;
          });
        }
        tabDefs.forEach((def) => {
          const btn = U.el("button", { type: "button", class: "clock-tab", text: def.label });
          btn.addEventListener("click", () => selectTab(def.id));
          tabMap[def.id] = btn;
          tabs.append(btn);
          const pane = U.el("div", { class: "clock-pane" });
          paneMap[def.id] = pane;
          panes.append(pane);
        });

        // ---- clock pane
        const clockPane = paneMap.clock;
        const faceWrap = U.el("div", { class: "clock-face-wrap", html: clockMarkup() });
        const digital = U.el("div", { class: "clock-digital", text: "--:--:--" });
        const dateLine = U.el("div", { class: "clock-date", text: "" });
        const zoneLine = U.el("div", { class: "clock-zone", text: "" });
        const controls = U.el("div", { class: "clock-controls" });
        const toggle24 = U.el("button", { type: "button", class: "clock-btn", text: "24-hour" });
        toggle24.addEventListener("click", () => {
          use24 = !use24;
          toggle24.textContent = use24 ? "24-hour" : "12-hour";
          renderClock();
        });
        controls.append(toggle24);
        clockPane.append(faceWrap, digital, dateLine, zoneLine, controls);

        // ---- stopwatch pane
        const swPane = paneMap.stopwatch;
        const swDisplay = U.el("div", { class: "clock-digital", text: "00:00.00" });
        const swButtons = U.el("div", { class: "clock-controls" });
        const startBtn = U.el("button", { type: "button", class: "clock-btn", text: "Start" });
        const lapBtn = U.el("button", { type: "button", class: "clock-btn", text: "Lap", disabled: "true" });
        const resetBtn = U.el("button", { type: "button", class: "clock-btn", text: "Reset" });
        const lapList = U.el("div", { class: "clock-laps" });
        swButtons.append(startBtn, lapBtn, resetBtn);
        swPane.append(swDisplay, swButtons, lapList);

        function swCurrent() {
          return swElapsed + (swRunning ? performance.now() - swStarted : 0);
        }
        function renderSw() {
          swDisplay.textContent = fmtStopwatch(swCurrent());
        }
        startBtn.addEventListener("click", () => {
          if (swRunning) {
            swElapsed = swCurrent();
            swRunning = false;
            startBtn.textContent = "Start";
            lapBtn.disabled = true;
            clearInterval(stopTicker);
            stopTicker = null;
          } else {
            swRunning = true;
            swStarted = performance.now();
            startBtn.textContent = "Stop";
            lapBtn.disabled = false;
            stopTicker = setInterval(renderSw, 40);
          }
          renderSw();
        });
        lapBtn.addEventListener("click", () => {
          if (!swRunning) return;
          laps.unshift(swCurrent());
          if (laps.length > 50) laps.pop();
          lapList.innerHTML = "";
          laps.forEach((value, index) => {
            lapList.append(U.el("div", {
              class: "clock-lap",
              text: "Lap " + (laps.length - index) + "   " + fmtStopwatch(value),
            }));
          });
        });
        resetBtn.addEventListener("click", () => {
          swRunning = false;
          swElapsed = 0;
          laps = [];
          startBtn.textContent = "Start";
          lapBtn.disabled = true;
          clearInterval(stopTicker);
          stopTicker = null;
          lapList.innerHTML = "";
          renderSw();
        });

        // ---- world pane
        const worldPane = paneMap.world;
        const worldRows = WORLD.map((entry) => {
          const row = U.el("div", { class: "clock-world-row" });
          const name = U.el("span", { class: "clock-world-city", text: entry.city });
          const time = U.el("span", { class: "clock-world-time", text: "--:--" });
          row.append(name, time);
          worldPane.append(row);
          return { entry, time };
        });
        const worldNote = U.el("div", {
          class: "clock-note",
          text: "World clocks use this computer's clock and timezone data. No alarms, no surprises.",
        });
        worldPane.append(worldNote);

        app.append(tabs, panes);
        body.append(app);

        function renderClock() {
          const now = new Date();
          digital.textContent = fmtTime(now, use24);
          dateLine.textContent = now.toLocaleDateString(undefined, {
            weekday: "long", year: "numeric", month: "long", day: "numeric",
          });
          try {
            zoneLine.textContent = Intl.DateTimeFormat().resolvedOptions().timeZone || "Local time";
          } catch (_e) {
            zoneLine.textContent = "Local time";
          }
          const seconds = now.getSeconds() + now.getMilliseconds() / 1000;
          const minutes = now.getMinutes() + seconds / 60;
          const hours = (now.getHours() % 12) + minutes / 60;
          const secEl = faceWrap.querySelector(".hand-sec");
          const minEl = faceWrap.querySelector(".hand-min");
          const hourEl = faceWrap.querySelector(".hand-hour");
          if (secEl) secEl.setAttribute("transform", `rotate(${seconds * 6} 100 100)`);
          if (minEl) minEl.setAttribute("transform", `rotate(${minutes * 6} 100 100)`);
          if (hourEl) hourEl.setAttribute("transform", `rotate(${hours * 30} 100 100)`);

          worldRows.forEach((row) => {
            try {
              row.time.textContent = new Intl.DateTimeFormat(undefined, {
                hour: "2-digit", minute: "2-digit", hour12: !use24,
                timeZone: row.entry.zone,
              }).format(now);
            } catch (_e) {
              row.time.textContent = "--:--";
            }
          });
        }

        selectTab("clock");
        renderClock();
        renderSw();
        ticker = setInterval(renderClock, 500);

        U.menuBar(w, [
          { label: "File", items: [
            { label: "Exit", action: () => w.close() },
          ] },
          { label: "View", items: [
            { label: "Clock", action: () => selectTab("clock") },
            { label: "Stopwatch", action: () => selectTab("stopwatch") },
            { label: "World Clock", action: () => selectTab("world") },
            { separator: true },
            { label: "24-hour time", checked: use24, action: () => {
              use24 = !use24;
              toggle24.textContent = use24 ? "24-hour" : "12-hour";
              renderClock();
            } },
          ] },
          { label: "Help", items: [
            { label: "About Clock", action: () => U.alert("About Clock",
              "Clock\nDisplays the current time, a stopwatch and world clocks.\n\nThis clock has no alarms.", "clock") },
          ] },
        ]);
      },
      onClose() {
        clearInterval(ticker);
        clearInterval(stopTicker);
      },
    });

    return win;
  };
})();
