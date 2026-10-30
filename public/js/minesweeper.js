/* Win95 NAS - Minesweeper */
(function () {
  "use strict";

  const Apps = (window.Apps = window.Apps || {});

  const LEVELS = {
    beginner: { label: "Beginner", cols: 9, rows: 9, mines: 10 },
    intermediate: { label: "Intermediate", cols: 16, rows: 16, mines: 40 },
    expert: { label: "Expert", cols: 30, rows: 16, mines: 99 },
  };

  Apps.minesweeper = function minesweeper(levelName) {
    const level = LEVELS[levelName] || LEVELS.beginner;
    const cols = level.cols;
    const rows = level.rows;
    const total = cols * rows;
    const mineTotal = level.mines;

    let cells = [];
    let cellEls = [];
    let started = false;
    let over = false;
    let won = false;
    let flags = 0;
    let opened = 0;
    let seconds = 0;
    let timer = null;
    let face = null;
    let mineLed = null;
    let timeLed = null;
    let grid = null;
    let win = null;

    const existing = WM.find("mines");
    if (existing) {
      existing.focus();
      return existing;
    }

    function neighbors(index) {
      const x = index % cols;
      const y = Math.floor(index / cols);
      const list = [];
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (!dx && !dy) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx >= 0 && nx < cols && ny >= 0 && ny < rows) list.push(ny * cols + nx);
        }
      }
      return list;
    }

    function newBoard() {
      cells = Array.from({ length: total }, () => ({ mine: false, open: false, flag: false, count: 0 }));
      started = false;
      over = false;
      won = false;
      flags = 0;
      opened = 0;
      seconds = 0;
      if (timer) { clearInterval(timer); timer = null; }
      renderBoard();
      updateLeds();
      if (face) face.textContent = "\uD83D\uDE42";
    }

    function placeMines(safeIndex) {
      const forbidden = new Set([safeIndex, ...neighbors(safeIndex)]);
      const pool = [];
      for (let i = 0; i < total; i += 1) if (!forbidden.has(i)) pool.push(i);
      for (let i = pool.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
      }
      pool.slice(0, mineTotal).forEach((index) => { cells[index].mine = true; });
      cells.forEach((cell, index) => {
        if (cell.mine) return;
        cell.count = neighbors(index).filter((n) => cells[n].mine).length;
      });
    }

    function startTimer() {
      if (timer) return;
      timer = setInterval(() => {
        if (over) return;
        seconds = Math.min(999, seconds + 1);
        updateLeds();
      }, 1000);
    }

    function updateLeds() {
      if (mineLed) mineLed.textContent = String(Math.max(-99, mineTotal - flags)).padStart(3, "0");
      if (timeLed) timeLed.textContent = String(seconds).padStart(3, "0");
    }

    function openCell(index) {
      if (over) return;
      const cell = cells[index];
      if (!cell || cell.open || cell.flag) return;
      if (!started) {
        started = true;
        placeMines(index);
        startTimer();
      }
      if (cell.mine) { lose(index); return; }
      const stack = [index];
      while (stack.length) {
        const current = stack.pop();
        const c = cells[current];
        if (!c || c.open || c.flag) continue;
        c.open = true;
        opened += 1;
        if (c.count === 0) {
          neighbors(current).forEach((n) => { if (!cells[n].open && !cells[n].flag) stack.push(n); });
        }
      }
      checkWin();
      renderBoard();
    }

    function toggleFlag(index) {
      if (over) return;
      const cell = cells[index];
      if (!cell || cell.open) return;
      cell.flag = !cell.flag;
      flags += cell.flag ? 1 : -1;
      updateLeds();
      renderBoard();
    }

    function checkWin() {
      if (opened === total - mineTotal) {
        won = true;
        over = true;
        if (timer) { clearInterval(timer); timer = null; }
        cells.forEach((cell) => { if (cell.mine) cell.flag = true; });
        flags = mineTotal;
        updateLeds();
        renderBoard();
        if (face) face.textContent = "\uD83D\uDE0E";
        Sound.play("tada");
        const key = "nas.mines.best." + levelName;
        const best = Number(localStorage.getItem(key) || 0);
        if (!best || seconds < best) {
          localStorage.setItem(key, String(seconds));
          U.toast("New best time: " + seconds + " seconds!", "success", 6000);
        } else {
          U.toast("You win! " + seconds + " seconds.", "success");
        }
      }
    }

    function lose(boomIndex) {
      over = true;
      if (timer) { clearInterval(timer); timer = null; }
      cells.forEach((cell) => { if (cell.mine) cell.open = true; });
      if (face) face.textContent = "\uD83D\uDE35";
      Sound.play("error");
      renderBoard(boomIndex);
    }

    function renderBoard(boomIndex) {
      if (!grid) return;
      cells.forEach((cell, index) => {
        const button = cellEls[index];
        if (!button) return;
        button.className = "mine-cell";
        button.textContent = "";
        if (cell.flag && !cell.open) {
          button.classList.add("flag");
          button.textContent = "\uD83D\uDEA9";
        } else if (cell.open) {
          button.classList.add("open");
          if (cell.mine) {
            button.textContent = "\uD83D\uDCA3";
            if (index === boomIndex) button.classList.add("boom");
          } else if (cell.count > 0) {
            button.textContent = String(cell.count);
            button.classList.add("n" + cell.count);
          }
        }
      });
    }

    function changeLevel(next) {
      win.close();
      setTimeout(() => Apps.minesweeper(next), 30);
    }

    win = WM.open({
      title: "Minesweeper",
      icon: "mine",
      pinId: "mines",
      width: cols * 16 + 52,
      height: rows * 16 + 178,
      resizable: false,
      maximizable: false,
      minimizable: true,
      singleton: "mines",
      build(body, w) {
        const app = U.el("div", { class: "mine-app" });
        const frame = U.el("div", { class: "mine-frame" });
        const top = U.el("div", { class: "mine-top" });
        mineLed = U.el("div", { class: "mine-led", text: "010" });
        face = U.el("button", { type: "button", class: "mine-face", text: "\uD83D\uDE42" });
        timeLed = U.el("div", { class: "mine-led", text: "000" });
        top.append(mineLed, face, timeLed);

        grid = U.el("div", { class: "mine-grid", style: { gridTemplateColumns: `repeat(${cols}, 16px)` } });
        cellEls = [];
        for (let i = 0; i < total; i += 1) {
          const button = U.el("button", { type: "button", class: "mine-cell" });
          button.addEventListener("click", () => openCell(i));
          button.addEventListener("contextmenu", (event) => { event.preventDefault(); toggleFlag(i); });
          button.addEventListener("mousedown", () => { if (!over) face.textContent = "\uD83D\uDE2E"; });
          cellEls.push(button);
          grid.append(button);
        }
        document.addEventListener("mouseup", () => {
          if (!over && face) face.textContent = "\uD83D\uDE42";
        });

        face.addEventListener("click", newBoard);
        frame.append(top, grid);
        app.append(frame);
        body.append(app);

        U.menuBar(w, [
          { label: "Game", items: [
            { label: "New", shortcut: "F2", action: newBoard },
            { separator: true },
            { label: "Beginner", checked: levelName === "beginner", action: () => changeLevel("beginner") },
            { label: "Intermediate", checked: levelName === "intermediate", action: () => changeLevel("intermediate") },
            { label: "Expert", checked: levelName === "expert", action: () => changeLevel("expert") },
            { separator: true },
            { label: "Exit", action: () => win.close() },
          ] },
          { label: "Help", items: [
            { label: "How to play", action: () => U.alert("Minesweeper",
              "Left-click a square to open it.\nRight-click to place a flag.\n\nNumbers tell you how many mines touch that square.\nClear every safe square to win.", "mine") },
            { label: "About Minesweeper", action: () => {
              const best = localStorage.getItem("nas.mines.best." + levelName);
              U.alert("About Minesweeper", "Minesweeper for Win95 NAS.\n\nLevel: " + level.label + "\nBest time: " + (best ? best + " seconds" : "none yet") + "\n\nStill impossible after all these years.", "mine");
            } },
          ] },
        ]);

        w.onKey = (event) => {
          if (event.key === "F2") { event.preventDefault(); newBoard(); }
        };
      },
    });

    newBoard();
    return win;
  };
})();
