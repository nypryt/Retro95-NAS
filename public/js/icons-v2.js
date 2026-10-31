/* Win95 NAS - V2 icon set: Windows 95 pixel-art icons.
 *
 * Every icon is drawn on a 32x32 pixel grid with a small Windows 95 palette
 * (black outlines, chunky bevels, saturated fills) and emitted as run-length
 * SVG rectangles with crisp edges, so it stays blocky at 16, 32, 48 and 64 px.
 *
 * Registers itself as window.IconSets.v2; /js/icons.js picks the active set.
 */
(function () {
  "use strict";

  const PAL = {
    k: "#000000", w: "#ffffff", e: "#e8e8e8", g: "#c0c0c0", d: "#808080",
    D: "#404040", q: "#a0a0a0", z: "#dfdfdf",
    t: "#008080", T: "#00a8a8", b: "#000080", B: "#0000ff", l: "#1084d0",
    y: "#ffff00", Y: "#ffd75e", O: "#e0a000", o: "#ff8000",
    r: "#ff0000", R: "#c00000", m: "#800000",
    G: "#008000", n: "#00a000", L: "#00ff00", c: "#00ffff",
    p: "#800080", v: "#c0c0ff", s: "#ffcc99", f: "#f8f8f8",
    W: "#2b579a", E: "#217346", P: "#d24726", N: "#ffb900",
  };

  const S = 32;
  const grid = () => {
    const g = [];
    for (let y = 0; y < S; y += 1) g.push(new Array(S).fill("."));
    return g;
  };

  function put(g, x, y, ch) {
    x = Math.round(x); y = Math.round(y);
    if (x >= 0 && x < S && y >= 0 && y < S) g[y][x] = ch;
  }
  function rect(g, x, y, w, h, ch) {
    for (let j = 0; j < h; j += 1) for (let i = 0; i < w; i += 1) put(g, x + i, y + j, ch);
  }
  const hline = (g, x, y, w, ch) => rect(g, x, y, w, 1, ch);
  const vline = (g, x, y, h, ch) => rect(g, x, y, 1, h, ch);
  function frame(g, x, y, w, h, ch) {
    hline(g, x, y, w, ch); hline(g, x, y + h - 1, w, ch);
    vline(g, x, y, h, ch); vline(g, x + w - 1, y, h, ch);
  }
  function bevel(g, x, y, w, h, fill, hi, lo) {
    rect(g, x, y, w, h, fill);
    hline(g, x, y, w, hi || "w"); vline(g, x, y, h, hi || "w");
    hline(g, x, y + h - 1, w, lo || "d"); vline(g, x + w - 1, y, h, lo || "d");
  }
  function disc(g, cx, cy, r, ch) {
    for (let y = -r; y <= r; y += 1) {
      for (let x = -r; x <= r; x += 1) if (x * x + y * y <= r * r) put(g, cx + x, cy + y, ch);
    }
  }
  function ring(g, cx, cy, ro, ri, ch) {
    for (let y = -ro; y <= ro; y += 1) {
      for (let x = -ro; x <= ro; x += 1) {
        const d = x * x + y * y;
        if (d <= ro * ro && d > ri * ri) put(g, cx + x, cy + y, ch);
      }
    }
  }
  function line(g, x0, y0, x1, y1, ch) {
    let dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1;
    let dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      put(g, x0, y0, ch);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }
  function blit(g, rows, ox, oy, ch) {
    rows.forEach((row, y) => {
      for (let x = 0; x < row.length; x += 1) if (row[x] === "#") put(g, ox + x, oy + y, ch);
    });
  }
  // Draw a pixel mask with a 1px black outline (colour inset one pixel).
  function solid(rows, color) {
    const g = grid();
    const pts = new Set();
    rows.forEach((row, y) => {
      for (let x = 0; x < row.length; x += 1) if (row[x] === "#") pts.add(x + "," + y);
    });
    pts.forEach((p) => { const [x, y] = p.split(",").map(Number); put(g, x, y, "k"); });
    pts.forEach((p) => {
      const [x, y] = p.split(",").map(Number);
      if (pts.has((x + 1) + "," + y) && pts.has((x - 1) + "," + y) &&
          pts.has(x + "," + (y + 1)) && pts.has(x + "," + (y - 1))) put(g, x, y, color);
    });
    return g;
  }

  // 5x7 letters for document badges.
  const FONT = {
    W: ["10001", "10001", "10001", "10101", "10101", "11011", "10001"],
    X: ["10001", "01010", "00100", "00100", "00100", "01010", "10001"],
    P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
    T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
    A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  };
  function glyph(g, letter, x, y, scale, ch) {
    const rows = FONT[letter] || FONT.X;
    rows.forEach((row, j) => {
      for (let i = 0; i < row.length; i += 1) if (row[i] === "1") rect(g, x + i * scale, y + j * scale, scale, scale, ch);
    });
  }

  const ICONS = {};

  // ---------------------------------------------------------------- documents
  function docPage(accent, letter, opts) {
    opts = opts || {};
    const g = grid();
    rect(g, 8, 4, 19, 26, "q");                 // drop shadow
    rect(g, 5, 2, 19, 27, "k");
    rect(g, 6, 3, 17, 25, "w");
    // folded corner
    rect(g, 17, 3, 6, 6, "g");
    line(g, 17, 3, 22, 8, "k");
    hline(g, 18, 8, 4, "k");
    // text lines
    if (opts.lines !== false) {
      hline(g, 9, 8, 10, "d");
      hline(g, 9, 11, 10, "d");
      if (!letter) {
        hline(g, 9, 14, 10, "d");
        hline(g, 9, 17, 8, "d");
        hline(g, 9, 20, 10, "d");
        hline(g, 9, 23, 6, "d");
      }
    }
    if (letter) {
      // big pixel letter, with a one-pixel black shadow for the classic look
      glyph(g, letter, 12, 11, 2, "k");
      glyph(g, letter, 11, 10, 2, accent);
      hline(g, 9, 26, 10, accent);
    }
    return g;
  }

  ICONS.file = docPage(null, null, { lines: false });
  ICONS.text = docPage(null, null);
  ICONS.pdf = (() => {
    const g = docPage(null, null);
    rect(g, 7, 20, 16, 8, "R");
    hline(g, 7, 20, 16, "r");
    const MINI = {
      P: ["110", "101", "110", "100", "100"],
      D: ["110", "101", "101", "101", "110"],
      F: ["111", "100", "110", "100", "100"],
    };
    let x = 9;
    ["P", "D", "F"].forEach((letter) => {
      MINI[letter].forEach((row, j) => {
        for (let i = 0; i < row.length; i += 1) if (row[i] === "1") put(g, x + i, 21 + j, "w");
      });
      x += 4;
    });
    return g;
  })();
  ICONS.word = docPage(PAL.W, "W");
  ICONS.excel = docPage(PAL.E, "X");
  ICONS.powerpoint = docPage(PAL.P, "P");
  ICONS.office = (() => {
    const g = docPage(null, null, { lines: false });
    rect(g, 10, 12, 16, 16, "k");
    rect(g, 11, 13, 14, 14, "w");
    rect(g, 13, 15, 4, 4, PAL.W); rect(g, 18, 15, 4, 4, PAL.E);
    rect(g, 13, 20, 4, 4, PAL.P); rect(g, 18, 20, 4, 4, PAL.N);
    hline(g, 12, 13, 12, "z");
    return g;
  })();

  ICONS.code = (() => {
    const g = docPage(null, null, { lines: false });
    hline(g, 9, 8, 10, "d");
    line(g, 12, 12, 8, 17, "G"); line(g, 8, 17, 12, 22, "G");
    line(g, 20, 12, 24, 17, "G"); line(g, 24, 17, 20, 22, "G");
    vline(g, 16, 16, 6, "G");
    return g;
  })();

  // ---------------------------------------------------------------- folders
  function folderShape(tab, body, front) {
    const g = grid();
    rect(g, 4, 8, 26, 18, "q");
    rect(g, 2, 6, 11, 4, "k");
    rect(g, 2, 9, 27, 19, "k");
    rect(g, 3, 7, 9, 2, tab);
    rect(g, 3, 10, 25, 17, body);
    rect(g, 3, 12, 25, 15, front);
    hline(g, 4, 12, 23, "w"); vline(g, 3, 13, 13, "w");
    hline(g, 4, 26, 23, "O"); vline(g, 27, 13, 13, "O");
    return g;
  }
  ICONS.folder = folderShape(PAL.Y, PAL.O, PAL.y);
  ICONS.newfolder = (() => {
    const g = folderShape(PAL.Y, PAL.O, PAL.y);
    rect(g, 13, 14, 6, 6, "k");
    rect(g, 14, 15, 4, 4, "G");
    rect(g, 15, 16, 2, 2, "w");
    return g;
  })();
  ICONS.folderUp = (() => {
    const g = folderShape(PAL.Y, PAL.O, PAL.y);
    blit(g, [
      "..#####..",
      ".#######.",
      "#########",
      "...###...",
      "...###...",
      "...###...",
    ], 11, 14, "G");
    return g;
  })();

  // ---------------------------------------------------------------- screens
  function monitorBody(screenFn) {
    const g = grid();
    rect(g, 2, 3, 28, 20, "k");
    bevel(g, 3, 4, 26, 18, "g");
    rect(g, 6, 7, 20, 12, "k");
    rect(g, 7, 8, 18, 10, "t");
    if (screenFn) screenFn(g, 7, 8, 18, 10);
    rect(g, 13, 23, 6, 3, "k"); rect(g, 14, 23, 4, 2, "g");
    rect(g, 9, 26, 14, 3, "k"); rect(g, 10, 26, 12, 2, "g");
    hline(g, 10, 26, 12, "w");
    rect(g, 25, 19, 2, 2, "L");
    return g;
  }

  ICONS.computer = monitorBody((g, x, y, w, h) => {
    hline(g, x, y, w, "T");
    rect(g, x + 2, y + 2, 3, 3, "w");
    rect(g, x + 7, y + 2, 3, 3, "Y");
    rect(g, x + 2, y + 7, 3, 3, "w");
    hline(g, x + 2, y + 6, 6, "T");
  });
  ICONS.monitor = monitorBody((g, x, y, w, h) => {
    hline(g, x, y, w, "T");
    rect(g, x + 3, y + 3, 12, 1, "T");
    rect(g, x + 3, y + 6, 8, 1, "T");
  });
  ICONS.display = monitorBody((g, x, y, w, h) => {
    hline(g, x, y, w, "k");
    rect(g, x + 2, y + 2, 3, 6, "r");
    rect(g, x + 6, y + 2, 3, 6, "G");
    rect(g, x + 10, y + 2, 3, 6, "B");
    rect(g, x + 14, y + 2, 3, 6, "Y");
    hline(g, x + 2, y + 9, 15, "w");
  });
  ICONS.wallpaper = monitorBody((g, x, y, w, h) => {
    rect(g, x, y, w, 5, "B");
    hline(g, x, y, w, "c");
    disc(g, x + 13, y + 2, 1, "y");
    for (let i = 0; i < 7; i += 1) hline(g, x + i, y + 9 - i, w - 2 * i, "G");
    hline(g, x, y + 9, w, "n");
  });
  ICONS.cmd = monitorBody((g, x, y, w, h) => {
    rect(g, x, y, w, h, "k");
    hline(g, x + 2, y + 3, 6, "w");
    vline(g, x + 7, y + 2, 3, "w");
    rect(g, x + 9, y + 3, 3, 1, "w");
    rect(g, x + 2, y + 7, 4, 2, "G");
  });
  ICONS.msdos = monitorBody((g, x, y, w, h) => {
    rect(g, x, y, w, h, "k");
    rect(g, x, y, w, 2, "Y");
    hline(g, x + 2, y + 4, 7, "w");
    hline(g, x + 2, y + 6, 4, "w");
    hline(g, x + 2, y + 8, 9, "G");
  });
  ICONS.run = (() => {
    const g = monitorBody((gg, x, y, w, h) => {
      rect(gg, x, y, w, h, "g");
      rect(gg, x + 1, y + 1, w - 2, 2, "b");
      rect(gg, x + 2, y + 4, w - 4, h - 5, "w");
    });
    blit(g, [
      "....#####....",
      "...#######...",
      "..#########..",
      ".###########.",
      "#############",
      "...#######...",
      "...#######...",
      "...#######...",
    ], 10, 13, "G");
    return g;
  })();

  // ---------------------------------------------------------------- dialogs
  function dialogIcon(fill, draw) {
    const g = grid();
    disc(g, 16, 16, 13, "k");
    disc(g, 16, 16, 12, fill);
    draw(g);
    return g;
  }
  ICONS.error = dialogIcon(PAL.r, (g) => {
    for (let i = 0; i < 12; i += 1) {
      rect(g, 9 + i, 10 + i, 3, 2, "w");
      rect(g, 21 - i, 10 + i, 3, 2, "w");
    }
  });
  ICONS.info = dialogIcon(PAL.B, (g) => {
    rect(g, 14, 9, 4, 4, "w");
    rect(g, 14, 15, 4, 9, "w");
  });
  ICONS.question = dialogIcon(PAL.B, (g) => {
    blit(g, [
      "..#####..",
      ".#######.",
      ".##...##.",
      "......##.",
      ".....##..",
      "....##...",
      "....##...",
      ".........",
      "....##...",
    ], 12, 8, "w");
  });
  ICONS.warning = (() => {
    const g = grid();
    for (let y = 4; y < 29; y += 1) {
      const t = (y - 4) / 25;
      const half = 2 + Math.round(t * 12);
      hline(g, 16 - half, y, half * 2 + 1, "k");
    }
    for (let y = 6; y < 28; y += 1) {
      const t = (y - 6) / 22;
      const half = 1 + Math.round(t * 11);
      hline(g, 16 - half, y, half * 2 + 1, "y");
    }
    rect(g, 14, 11, 4, 9, "k");
    rect(g, 14, 23, 4, 3, "k");
    return g;
  })();
  ICONS.shield = (() => {
    const g = grid();
    const rows = [];
    for (let y = 0; y < 22; y += 1) {
      let half;
      if (y < 4) half = 8 + y;
      else if (y < 14) half = 12;
      else half = Math.max(1, 12 - (y - 14) * 1.6);
      rows.push([16 - Math.round(half), y + 4, Math.round(half) * 2]);
    }
    rows.forEach(([x, y, w]) => hline(g, x - 1, y, w + 2, "k"));
    rows.forEach(([x, y, w]) => hline(g, x, y, w, "g"));
    rows.forEach(([x, y, w]) => hline(g, x + 1, y, Math.max(0, w - 2), "b"));
    line(g, 11, 16, 15, 20, "L"); line(g, 15, 20, 22, 12, "L");
    line(g, 11, 17, 15, 21, "L"); line(g, 15, 21, 22, 13, "L");
    return g;
  })();

  // ---------------------------------------------------------------- arrows
  // Toolbar arrows are drawn across the whole 32x32 grid, not in a corner, so
  // they stay centred and readable at 16 px. A one-pixel black outline keeps
  // the silhouette crisp against the grey toolbar.
  function arrowMask(opts) {
    const mask = [];
    for (let y = 0; y < S; y += 1) mask.push(new Array(S).fill(false));
    const cx = S / 2;
    const headEnd = opts.top + opts.headH;
    for (let y = opts.top; y < headEnd; y += 1) {
      const half = Math.max(1, Math.round((opts.headW / 2) * ((y - opts.top) / (opts.headH - 1))));
      for (let x = Math.round(cx - half); x < Math.round(cx + half); x += 1) {
        if (x >= 0 && x < S) mask[y][x] = true;
      }
    }
    for (let y = headEnd; y <= opts.bottom; y += 1) {
      for (let x = Math.round(cx - opts.shaftW / 2); x < Math.round(cx + opts.shaftW / 2); x += 1) {
        if (x >= 0 && x < S) mask[y][x] = true;
      }
    }
    return mask;
  }
  // Rotate a full-grid mask clockwise by whole quarter turns.
  function turnMask(mask, quarters) {
    let src = mask;
    for (let n = 0; n < ((quarters % 4) + 4) % 4; n += 1) {
      const out = [];
      for (let y = 0; y < S; y += 1) out.push(new Array(S).fill(false));
      for (let y = 0; y < S; y += 1) {
        for (let x = 0; x < S; x += 1) out[x][S - 1 - y] = src[y][x];
      }
      src = out;
    }
    return src;
  }
  function paintMask(g, mask, color) {
    const on = (x, y) => x >= 0 && x < S && y >= 0 && y < S && mask[y][x];
    for (let y = 0; y < S; y += 1) {
      for (let x = 0; x < S; x += 1) {
        if (!mask[y][x]) continue;
        const edge = !on(x - 1, y) || !on(x + 1, y) || !on(x, y - 1) || !on(x, y + 1);
        put(g, x, y, edge ? "k" : color);
      }
    }
  }
  // Back / forward / up: chunky green arrows, centred and 26 px tall.
  const NAV_ARROW = arrowMask({ top: 3, bottom: 28, headH: 11, headW: 24, shaftW: 8 });
  ICONS.up = (() => { const g = grid(); paintMask(g, NAV_ARROW, "G"); return g; })();
  ICONS.back = (() => { const g = grid(); paintMask(g, turnMask(NAV_ARROW, 3), "G"); return g; })();
  ICONS.forward = (() => { const g = grid(); paintMask(g, turnMask(NAV_ARROW, 1), "G"); return g; })();
  // Upload / download: blue arrow above a shelf line.
  const SAVE_ARROW = arrowMask({ top: 6, bottom: 25, headH: 9, headW: 20, shaftW: 6 });
  function saveIcon(mask) {
    const g = grid();
    paintMask(g, mask, "b");
    rect(g, 6, 28, 21, 1, "k");
    rect(g, 7, 29, 19, 1, "g");
    return g;
  }
  ICONS.upload = saveIcon(SAVE_ARROW);
  ICONS.download = saveIcon(turnMask(SAVE_ARROW, 2));
  ICONS.refresh = (() => {
    const g = grid();
    ring(g, 16, 16, 11, 8, "k");
    ring(g, 16, 16, 10, 9, "G");
    // erase the top-right quarter to leave a gap
    for (let y = 2; y < 16; y += 1) for (let x = 17; x < 30; x += 1) {
      if (x * x + y * y > 0) put(g, x, y, ".");
    }
    blit(g, [
      "..####",
      ".#####",
      "######",
      "..####",
      "..###.",
    ], 20, 3, "G");
    return g;
  })();

  // ---------------------------------------------------------------- tools
  ICONS.find = (() => {
    const g = grid();
    rect(g, 3, 3, 16, 20, "k");
    rect(g, 4, 4, 14, 18, "w");
    for (let y = 8; y <= 18; y += 3) hline(g, 6, y, 10, "d");
    ring(g, 19, 18, 8, 6, "k");
    ring(g, 19, 18, 7, 6, "B");
    disc(g, 19, 18, 5, "#bfe8ff");
    ring(g, 19, 18, 8, 7, "g");
    line(g, 24, 23, 29, 29, "k"); line(g, 25, 23, 29, 28, "k");
    line(g, 24, 24, 28, 29, "d"); line(g, 25, 24, 28, 28, "d");
    return g;
  })();
  ICONS.search = ICONS.find;
  ICONS.settings = (() => {
    const g = grid();
    rect(g, 2, 4, 28, 24, "k");
    bevel(g, 3, 5, 26, 22, "g");
    rect(g, 3, 5, 26, 3, "b");
    hline(g, 4, 5, 24, "l");
    for (let i = 0; i < 3; i += 1) {
      const y = 12 + i * 5;
      rect(g, 7, y, 18, 2, "k");
      rect(g, 8, y, 16, 1, "w");
      rect(g, 10 + i * 6, y - 2, 4, 6, "k");
      rect(g, 11 + i * 6, y - 1, 2, 4, "g");
    }
    return g;
  })();
  ICONS.cut = (() => {
    const g = grid();
    line(g, 10, 8, 24, 24, "k"); line(g, 11, 8, 25, 24, "d");
    line(g, 22, 8, 8, 24, "k"); line(g, 21, 8, 7, 24, "d");
    ring(g, 8, 26, 4, 2, "k"); ring(g, 8, 26, 3, 2, "r");
    ring(g, 24, 26, 4, 2, "k"); ring(g, 24, 26, 3, 2, "r");
    return g;
  })();
  ICONS.copy = (() => {
    const g = grid();
    rect(g, 4, 4, 17, 21, "k"); rect(g, 5, 5, 15, 19, "e");
    rect(g, 9, 8, 17, 21, "k"); rect(g, 10, 9, 15, 19, "w");
    for (let y = 12; y <= 24; y += 3) hline(g, 12, y, 11, "d");
    return g;
  })();
  ICONS.paste = (() => {
    const g = grid();
    rect(g, 5, 6, 22, 24, "k");
    rect(g, 6, 7, 20, 22, "#c0a020");
    rect(g, 9, 4, 14, 7, "k"); rect(g, 10, 5, 12, 5, "g");
    hline(g, 10, 5, 12, "w");
    rect(g, 9, 13, 14, 13, "k"); rect(g, 10, 14, 12, 11, "w");
    for (let y = 17; y <= 23; y += 3) hline(g, 12, y, 8, "d");
    return g;
  })();
  ICONS.trash = (() => {
    const g = grid();
    rect(g, 7, 7, 18, 3, "k");
    rect(g, 12, 4, 8, 3, "k"); rect(g, 13, 5, 6, 1, "d");
    rect(g, 8, 10, 16, 18, "k");
    rect(g, 9, 11, 14, 16, "g");
    for (let x = 12; x <= 21; x += 3) vline(g, x, 13, 12, "d");
    hline(g, 9, 11, 14, "w");
    return g;
  })();
  ICONS.recycle = (() => {
    const g = grid();
    rect(g, 7, 8, 18, 3, "k"); rect(g, 8, 9, 16, 1, "g");
    rect(g, 8, 11, 16, 16, "k");
    rect(g, 9, 12, 14, 14, "d");
    for (let x = 12; x <= 21; x += 3) vline(g, x, 13, 12, "q");
    // green recycle arrows
    blit(g, ["..###..", ".#####.", "###.###", "..###..", "..###.."], 10, 14, "G");
    blit(g, ["..###..", "..###..", "###.###", ".#####.", "..###.."], 17, 14, "G");
    return g;
  })();
  ICONS.archive = (() => {
    const g = grid();
    rect(g, 3, 8, 26, 19, "k");
    rect(g, 4, 9, 24, 17, "#c0a020");
    rect(g, 4, 9, 24, 5, "#e0c060");
    rect(g, 14, 14, 4, 13, "k");
    for (let y = 15; y <= 25; y += 2) hline(g, 15, y, 2, "g");
    rect(g, 13, 12, 6, 3, "k"); rect(g, 14, 13, 4, 1, "d");
    return g;
  })();
  ICONS.paint = (() => {
    const g = grid();
    // Wooden artist's palette with dabs of paint and a thumb hole.
    rect(g, 3, 12, 18, 14, "k");
    rect(g, 4, 13, 16, 12, "s");
    rect(g, 4, 13, 16, 3, "#e8c8a0");
    rect(g, 8, 18, 5, 4, "k");
    rect(g, 5, 15, 2, 2, "r");
    rect(g, 9, 14, 2, 2, "G");
    rect(g, 13, 15, 2, 2, "b");
    rect(g, 6, 20, 2, 2, "y");
    rect(g, 12, 20, 2, 2, "p");
    rect(g, 15, 18, 2, 2, "o");
    // Brush crossing the palette.
    for (let i = 0; i < 11; i += 1) {
      put(g, 20 + i, 3 + i, "k");
      put(g, 21 + i, 3 + i, "O");
    }
    rect(g, 17, 12, 6, 4, "k");
    rect(g, 18, 13, 4, 2, "q");
    rect(g, 14, 16, 6, 5, "k");
    rect(g, 15, 17, 4, 3, "Y");
    return g;
  })();
  ICONS.winrar = (() => {
    const g = grid();
    // Metal clamp holding the stack together.
    rect(g, 2, 3, 5, 26, "k");
    rect(g, 3, 4, 3, 24, "d");
    rect(g, 3, 4, 1, 24, "q");
    rect(g, 2, 2, 5, 3, "k");
    rect(g, 3, 3, 3, 1, "q");
    rect(g, 2, 27, 5, 3, "k");
    rect(g, 3, 28, 3, 1, "q");
    // Three books: red, green, blue, with white page blocks.
    [[5, "R", "r"], [12, "G", "n"], [19, "b", "l"]].forEach(([y, dark, light]) => {
      rect(g, 6, y, 23, 6, "k");
      rect(g, 7, y + 1, 15, 4, dark);
      hline(g, 7, y + 1, 15, light);
      rect(g, 22, y + 1, 5, 4, "w");
      hline(g, 23, y + 2, 4, "z");
      hline(g, 23, y + 3, 4, "z");
    });
    return g;
  })();
  ICONS.chip = (() => {
    const g = grid();
    rect(g, 8, 8, 16, 16, "k");
    rect(g, 9, 9, 14, 14, "D");
    rect(g, 12, 12, 8, 8, "k"); rect(g, 13, 13, 6, 6, "g");
    for (let i = 0; i < 3; i += 1) {
      const p = 11 + i * 5;
      rect(g, 2, p, 6, 2, "k"); rect(g, 3, p, 4, 1, "O");
      rect(g, 24, p, 6, 2, "k"); rect(g, 25, p, 4, 1, "O");
      rect(g, p, 2, 2, 6, "k"); rect(g, p, 3, 1, 4, "O");
      rect(g, p, 24, 2, 6, "k"); rect(g, p, 25, 1, 4, "O");
    }
    return g;
  })();
  ICONS.exe = (() => {
    const g = grid();
    rect(g, 3, 4, 26, 24, "k");
    bevel(g, 4, 5, 24, 22, "g");
    rect(g, 4, 5, 24, 4, "b"); hline(g, 5, 5, 22, "l");
    rect(g, 7, 11, 18, 13, "k"); rect(g, 8, 12, 16, 11, "w");
    rect(g, 10, 14, 4, 4, "B"); hline(g, 10, 17, 12, "d");
    return g;
  })();
  ICONS.notepad = (() => {
    const g = grid();
    rect(g, 5, 3, 22, 26, "k");
    rect(g, 6, 4, 20, 24, "b");
    rect(g, 8, 6, 16, 20, "k");
    rect(g, 9, 7, 14, 18, "w");
    for (let y = 11; y <= 22; y += 3) hline(g, 11, y, 10, "l");
    for (let x = 8; x <= 23; x += 4) {
      rect(g, x, 2, 2, 5, "k"); rect(g, x, 3, 1, 3, "g");
    }
    return g;
  })();
  ICONS.user = (() => {
    const g = grid();
    disc(g, 16, 10, 7, "k"); disc(g, 16, 10, 6, "s");
    rect(g, 9, 10, 14, 3, "k"); rect(g, 10, 10, 12, 2, "#804000");
    for (let i = 0; i < 9; i += 1) hline(g, 5 + i, 29 - i, 22 - 2 * i, "k");
    for (let i = 0; i < 8; i += 1) hline(g, 6 + i, 29 - i, 20 - 2 * i, "b");
    return g;
  })();
  ICONS.keys = (() => {
    const g = grid();
    ring(g, 9, 10, 7, 4, "k"); ring(g, 9, 10, 6, 5, "O");
    rect(g, 13, 12, 3, 3, "k"); rect(g, 14, 13, 2, 2, "O");
    line(g, 15, 15, 27, 27, "k"); line(g, 16, 15, 27, 26, "k");
    line(g, 16, 16, 26, 26, "O");
    rect(g, 22, 23, 5, 3, "k"); rect(g, 23, 24, 3, 1, "O");
    rect(g, 25, 19, 5, 3, "k"); rect(g, 26, 20, 3, 1, "O");
    return g;
  })();
  ICONS.key = ICONS.keys;
  ICONS.help = (() => {
    const g = grid();
    rect(g, 4, 4, 24, 25, "k");
    rect(g, 5, 5, 22, 23, "b");
    rect(g, 5, 5, 4, 23, "l");
    hline(g, 9, 5, 18, "w");
    hline(g, 5, 28, 22, "k");
    blit(g, [
      "..#####..",
      ".#######.",
      ".##...##.",
      "......##.",
      ".....##..",
      "....##...",
      "....##...",
      ".........",
      "....##...",
    ], 12, 8, "y");
    return g;
  })();
  ICONS.power = (() => {
    const g = grid();
    ring(g, 16, 17, 12, 9, "k");
    ring(g, 16, 17, 11, 10, "R");
    rect(g, 14, 3, 4, 12, "k"); rect(g, 15, 4, 2, 10, "R");
    return g;
  })();
  ICONS.shutdown = (() => {
    const g = monitorBody((gg, x, y, w, h) => {
      rect(gg, x, y, w, h, "k");
      ring(gg, x + 9, y + 5, 4, 2, "r");
      rect(gg, x + 8, y + 1, 2, 4, "r");
    });
    return g;
  })();

  // ---------------------------------------------------------------- media
  const SPK = [
    ".........###", "........####", ".......#####", "......######",
    ".....#######", "....########", "...#########", "..##########",
    "..##########", "..##########", "..##########", "..##########",
    "..##########", "..##########", "..##########", "..##########",
    "...#########", "....########", ".....#######", "......######",
    ".......#####", "........####", ".........###",
  ];
  function speakerIcon(mode) {
    const g = grid();
    rect(g, 2, 11, 8, 10, "k"); rect(g, 3, 12, 6, 8, "g");
    const horn = solid(SPK, "g");
    for (let y = 0; y < S; y += 1) for (let x = 0; x < S; x += 1) {
      if (horn[y][x] !== ".") put(g, x + 1, y + 5, horn[y][x]);
    }
    if (mode !== "mute") {
      line(g, 17, 11, 18, 12, "k"); line(g, 18, 12, 18, 19, "k"); line(g, 18, 19, 17, 20, "k");
      line(g, 20, 9, 22, 11, "k"); line(g, 22, 11, 22, 20, "k"); line(g, 22, 20, 20, 22, "k");
      line(g, 24, 7, 26, 9, "k"); line(g, 26, 9, 26, 22, "k"); line(g, 26, 22, 24, 24, "k");
    } else {
      line(g, 19, 12, 27, 20, "r"); line(g, 27, 12, 19, 20, "r");
      line(g, 20, 12, 27, 19, "r"); line(g, 26, 12, 19, 19, "r");
    }
    return g;
  }
  ICONS.audio = (() => {
    const g = speakerIcon("sound");
    disc(g, 22, 8, 2, "k");
    vline(g, 24, 3, 6, "k");
    hline(g, 25, 3, 3, "k");
    vline(g, 27, 3, 3, "k");
    return g;
  })();
  ICONS.video = (() => {
    const g = grid();
    rect(g, 2, 7, 28, 18, "k");
    rect(g, 3, 8, 26, 16, "D");
    for (let y = 9; y <= 22; y += 3) {
      rect(g, 4, y, 3, 2, "w"); rect(g, 25, y, 3, 2, "w");
    }
    rect(g, 8, 9, 16, 14, "b");
    blit(g, ["..##..", ".####.", "######", "######", ".####.", "..##.."], 13, 12, "w");
    return g;
  })();
  ICONS.image = (() => {
    const g = grid();
    rect(g, 2, 4, 28, 24, "k");
    bevel(g, 3, 5, 26, 22, "w");
    rect(g, 5, 7, 22, 18, "c");
    hline(g, 5, 7, 22, "#bfe8ff");
    disc(g, 22, 11, 3, "y");
    for (let i = 0; i < 9; i += 1) hline(g, 5 + i, 23 - i, 22 - 2 * i, "G");
    hline(g, 5, 24, 22, "n");
    return g;
  })();
  ICONS.volume = (() => {
    const g = grid();
    rect(g, 2, 6, 28, 20, "k");
    bevel(g, 3, 7, 26, 18, "g");
    rect(g, 5, 11, 22, 10, "k"); rect(g, 6, 12, 20, 8, "b");
    rect(g, 8, 14, 8, 4, "l");
    rect(g, 18, 14, 6, 2, "w");
    hline(g, 18, 17, 6, "d");
    return g;
  })();
  ICONS.sound = speakerIcon("sound");
  ICONS.mute = speakerIcon("mute");

  // ---------------------------------------------------------------- network / storage
  ICONS.network = (() => {
    const g = grid();
    function pc(x, y) {
      rect(g, x, y, 13, 10, "k"); rect(g, x + 1, y + 1, 11, 8, "g");
      rect(g, x + 3, y + 3, 7, 4, "k"); rect(g, x + 4, y + 4, 5, 2, "t");
      rect(g, x + 5, y + 10, 3, 2, "k"); rect(g, x + 2, y + 12, 9, 2, "k");
    }
    pc(3, 4); pc(16, 17);
    line(g, 15, 9, 21, 9, "d"); line(g, 21, 9, 21, 17, "d");
    rect(g, 20, 12, 3, 3, "G");
    return g;
  })();
  ICONS.drive = (() => {
    const g = grid();
    rect(g, 3, 8, 26, 17, "k");
    rect(g, 4, 9, 24, 15, "g");
    rect(g, 4, 9, 24, 5, "z"); hline(g, 5, 9, 22, "w");
    hline(g, 4, 15, 24, "d");
    rect(g, 6, 18, 12, 3, "k"); rect(g, 7, 19, 10, 1, "D");
    rect(g, 23, 18, 3, 3, "k"); rect(g, 24, 19, 1, 1, "L");
    return g;
  })();
  ICONS.floppy = (() => {
    const g = grid();
    rect(g, 3, 4, 26, 25, "k");
    rect(g, 4, 5, 24, 23, "b");
    rect(g, 10, 5, 12, 8, "k"); rect(g, 11, 6, 10, 6, "g");
    rect(g, 15, 6, 3, 5, "D");
    rect(g, 6, 17, 20, 11, "k"); rect(g, 7, 18, 18, 9, "w");
    for (let y = 20; y <= 24; y += 3) hline(g, 9, y, 14, "d");
    return g;
  })();
  ICONS.docker = (() => {
    const g = grid();
    rect(g, 3, 16, 26, 10, "k");
    rect(g, 4, 17, 24, 8, "B");
    rect(g, 4, 17, 24, 3, "l");
    // tail
    blit(g, ["##..", "###.", "####", "###.", "##.."], 1, 16, "B");
    // containers
    [[7, 11], [13, 11], [19, 11], [10, 7], [16, 7]].forEach(([x, y]) => {
      rect(g, x, y, 5, 4, "k"); rect(g, x + 1, y + 1, 3, 2, "w");
    });
    disc(g, 25, 19, 1, "w");
    hline(g, 6, 23, 8, "k");
    return g;
  })();
  ICONS.tailscale = (() => {
    const g = grid();
    line(g, 10, 11, 22, 11, "d");
    line(g, 10, 11, 16, 21, "d");
    line(g, 22, 11, 16, 21, "d");
    [[10, 10, 4], [22, 10, 3], [16, 22, 4]].forEach(([x, y, r]) => {
      disc(g, x, y, r, "k"); disc(g, x, y, r - 1, "b"); disc(g, x, y, 1, "w");
    });
    return g;
  })();
  ICONS.mine = (() => {
    const g = grid();
    disc(g, 14, 18, 9, "k"); disc(g, 14, 18, 8, "D");
    disc(g, 11, 15, 2, "q");
    line(g, 19, 11, 24, 6, "k"); line(g, 20, 11, 25, 6, "n");
    disc(g, 26, 5, 2, "k"); disc(g, 26, 5, 1, "y");
    return g;
  })();
  ICONS.vlc = (() => {
    const g = grid();
    const rows = [];
    for (let y = 4; y <= 26; y += 1) {
      const t = (y - 4) / 22;
      const w = Math.max(2, Math.round(2 + t * 22));
      const x = 16 - Math.round(w / 2);
      rows.push([x, y, w]);
    }
    rows.forEach(([x, y, w]) => hline(g, x - 1, y, w + 2, "k"));
    rows.forEach(([x, y, w]) => hline(g, x, y, w, "o"));
    rows.forEach(([x, y, w]) => hline(g, x + 1, y, Math.max(0, w - 2), "#ffb03a"));
    [10, 17].forEach((y0) => {
      for (let y = y0; y < y0 + 3; y += 1) {
        const t = (y - 4) / 22;
        const w = Math.max(2, Math.round(2 + t * 22));
        const x = 16 - Math.round(w / 2);
        hline(g, x, y, w, "w");
      }
    });
    rect(g, 6, 27, 20, 3, "k");
    rect(g, 7, 27, 18, 2, "g");
    return g;
  })();

  // ---------------------------------------------------------------- flags
  function flagGrid() {
    const g = grid();
    for (let x = 2; x <= 29; x += 1) {
      const off = Math.round(Math.sin((x - 2) / 3.4) * 2);
      const y0 = 5 + off;
      const top = x < 16 ? "r" : "G";
      const bottom = x < 16 ? "B" : "Y";
      hline(g, x, y0 - 1, 1, "k");
      rect(g, x, y0, 1, 8, top);
      rect(g, x, y0 + 8, 1, 8, bottom);
      hline(g, x, y0 + 16, 1, "k");
    }
    // white cross
    for (let y = 4; y <= 26; y += 1) put(g, 16, y, "w");
    for (let x = 2; x <= 29; x += 1) {
      const off = Math.round(Math.sin((x - 2) / 3.4) * 2);
      put(g, x, 13 + off, "w");
    }
    return g;
  }
  const FLAG = flagGrid();
  ICONS.flag = FLAG;
  ICONS.windowsLogo = FLAG;

  // ---------------------------------------------------------------- output
  function toSvg(g) {
    const parts = [];
    for (let y = 0; y < S; y += 1) {
      let x = 0;
      while (x < S) {
        const ch = g[y][x];
        if (ch === ".") { x += 1; continue; }
        let run = 1;
        while (x + run < S && g[y][x + run] === ch) run += 1;
        parts.push(`<rect x="${x}" y="${y}" width="${run}" height="1" fill="${PAL[ch] || ch}"/>`);
        x += run;
      }
    }
    return `<svg viewBox="0 0 ${S} ${S}" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges">${parts.join("")}</svg>`;
  }

  const cache = new Map();
  function get(name, size) {
    const key = name + "@" + (size || 0);
    if (cache.has(key)) return cache.get(key);
    const gridOrMarkup = ICONS[name] || ICONS.file;
    let markup = typeof gridOrMarkup === "string" ? gridOrMarkup : toSvg(gridOrMarkup);
    if (size) {
      markup = markup.replace("<svg ", `<svg width="${size}" height="${size}" `);
    }
    cache.set(key, markup);
    return markup;
  }

  const BY_KIND = {
    folder: "folder", image: "image", text: "text", audio: "audio", video: "video",
    archive: "archive", pdf: "pdf", doc: "file", code: "code", exe: "exe",
    file: "file", word: "word", excel: "excel", powerpoint: "powerpoint",
  };

  function forEntry(entry) {
    if (!entry) return get("file");
    if (entry.type === "dir") return get("folder");
    return get(BY_KIND[entry.kind] || "file");
  }

  window.IconSets = window.IconSets || {};
  window.IconSets.v2 = {
    get,
    forEntry,
    has: (name) => !!ICONS[name],
    names: () => Object.keys(ICONS),
  };
})();
