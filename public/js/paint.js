/* Win95 NAS - Paint
 *
 * A Windows 95 style Paint: the classic two-column tool box, a 28-colour
 * palette, line-width options and the familiar File / Edit / View / Image /
 * Colors / Help menus. Pictures open from and save to the NAS as PNG.
 */
(function () {
  "use strict";

  const Apps = (window.Apps = window.Apps || {});

  const PALETTE = [
    ["#000000", "#808080", "#800000", "#808000", "#008000", "#008080", "#000080",
      "#800080", "#808040", "#004040", "#0080ff", "#004080", "#8000ff", "#804000"],
    ["#ffffff", "#c0c0c0", "#ff0000", "#ffff00", "#00ff00", "#00ffff", "#0000ff",
      "#ff00ff", "#ffff80", "#00ff80", "#80ffff", "#8080ff", "#ff0080", "#ff8040"],
  ];

  const SHAPE_TOOLS = new Set(["line", "curve", "rect", "polygon", "ellipse", "roundRect"]);
  const MAX_UNDO = 15;

  const TOOL_HINT = {
    freeSelect: "Drag to select a free-form area. Drag inside it to move it.",
    select: "Drag to select a rectangle. Drag inside it to move it.",
    eraser: "Drag to erase with the background colour.",
    fill: "Click an area to fill it with the current colour.",
    pick: "Click a colour on the picture to pick it up.",
    magnifier: "Click to zoom in. Right-click to zoom out.",
    pencil: "Drag to draw a one-pixel line.",
    brush: "Drag to paint with a round brush.",
    airbrush: "Drag to spray colour.",
    text: "Click, then type. Press Enter to place the text.",
    line: "Drag to draw a straight line.",
    curve: "Drag a line, then drag again to bend it, then click to finish.",
    rect: "Drag to draw a rectangle. Right-drag for a filled box.",
    polygon: "Click to add corners. Double-click to finish.",
    ellipse: "Drag to draw an ellipse. Right-drag for a filled one.",
    roundRect: "Drag to draw a rounded rectangle. Right-drag for a filled one.",
  };

  function svg(inner) {
    return '<svg width="16" height="16" viewBox="0 0 16 16" ' +
      'xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges">' + inner + "</svg>";
  }

  const TOOL_ICON = {
    freeSelect: svg('<path d="M3 4l3-2 3 2 2 3-1 3 2 2-3 2-4-1-2-4z" fill="none" stroke="#000" stroke-dasharray="2 1"/>'),
    select: svg('<rect x="2.5" y="3.5" width="11" height="9" fill="none" stroke="#000" stroke-dasharray="2 1"/>'),
    eraser: svg('<path d="M2 11l6-7 5 4-6 7H4z" fill="#fff" stroke="#000"/><path d="M8 4l5 4" stroke="#000"/><path d="M3 15h10" stroke="#000"/>'),
    fill: svg('<path d="M3 7l4-4 5 5-4 4z" fill="#fff" stroke="#000"/><path d="M12 8c0 2 2 2 2 4a1.5 1.5 0 1 1-3 0c0-2 1-2 1-4z" fill="#000"/>'),
    pick: svg('<path d="M4 12l6-6 2 2-6 6H4z" fill="#fff" stroke="#000"/><path d="M9 3l4 4" stroke="#000" stroke-width="2"/>'),
    magnifier: svg('<circle cx="6.5" cy="6.5" r="4" fill="#fff" stroke="#000"/><path d="M9.5 9.5L14 14" stroke="#000" stroke-width="2"/>'),
    pencil: svg('<path d="M3 13l2-4 6-6 2 2-6 6z" fill="#ffd75e" stroke="#000"/><path d="M3 13l1-2 1 1z" fill="#000"/>'),
    brush: svg('<path d="M12 2l2 2-7 7-2-2z" fill="#c0a020" stroke="#000"/><path d="M4 9l3 3-2 3H2z" fill="#000"/>'),
    airbrush: svg('<rect x="5" y="4" width="6" height="10" rx="1" fill="#c0c0c0" stroke="#000"/><rect x="7" y="2" width="2" height="2" fill="#000"/><circle cx="12.5" cy="4" r=".7" fill="#000"/><circle cx="13.5" cy="6.5" r=".7" fill="#000"/><circle cx="12" cy="9" r=".7" fill="#000"/>'),
    text: svg('<text x="4" y="12" font-family="Times New Roman, serif" font-size="12" fill="#000">A</text>'),
    line: svg('<path d="M2 13L13 2" stroke="#000"/>'),
    curve: svg('<path d="M2 12q4-10 11-9" fill="none" stroke="#000"/>'),
    rect: svg('<rect x="2.5" y="4.5" width="11" height="8" fill="none" stroke="#000"/>'),
    polygon: svg('<path d="M3 12l2-8 6-2 3 6-5 5z" fill="none" stroke="#000"/>'),
    ellipse: svg('<ellipse cx="8" cy="8" rx="6" ry="4.5" fill="none" stroke="#000"/>'),
    roundRect: svg('<rect x="2.5" y="4.5" width="11" height="8" rx="2.5" fill="none" stroke="#000"/>'),
  };

  const TOOLS = [
    ["freeSelect", "Free-Form Select"],
    ["select", "Select"],
    ["eraser", "Eraser/Color Eraser"],
    ["fill", "Fill With Color"],
    ["pick", "Pick Color"],
    ["magnifier", "Magnifier"],
    ["pencil", "Pencil"],
    ["brush", "Brush"],
    ["airbrush", "Airbrush"],
    ["text", "Text"],
    ["line", "Line"],
    ["curve", "Curve"],
    ["rect", "Rectangle"],
    ["polygon", "Polygon"],
    ["ellipse", "Ellipse"],
    ["roundRect", "Rounded Rectangle"],
  ];

  function hexToRgb(hex) {
    const value = String(hex || "#000000").replace("#", "");
    const full = value.length === 3
      ? value.split("").map((c) => c + c).join("")
      : value.padEnd(6, "0").slice(0, 6);
    return [
      parseInt(full.slice(0, 2), 16) || 0,
      parseInt(full.slice(2, 4), 16) || 0,
      parseInt(full.slice(4, 6), 16) || 0,
    ];
  }

  function rgbToHex(data, i) {
    const to = (n) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, "0");
    return "#" + to(data[i]) + to(data[i + 1]) + to(data[i + 2]);
  }

  function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }

  Apps.paint = function paint(startPath) {
    let canvas = null;
    let overlay = null;
    let host = null;
    let ctx = null;
    let octx = null;
    let wrap = null;
    let win = null;

    let docW = 640;
    let docH = 480;
    let zoom = 1;
    let tool = "pencil";
    let fg = "#000000";
    let bg = "#ffffff";
    let size = 1;
    let dirty = false;
    let currentPath = null;

    let undoStack = [];
    let redoStack = [];
    let drawing = false;
    let startPoint = null;
    let lastPoint = null;
    let strokeColor = "#000000";
    let snapshot = null;
    let filledShape = false;

    let selection = null;
    let floating = null;
    let moveOffset = null;
    let clipboard = null;
    let lasso = null;
    let polygon = null;
    let pendingPoint = null;
    let pendingCurve = null;
    let textBox = null;
    let airTimer = null;
    let ants = 0;
    let antTimer = null;
    let toolButtons = {};
    let fgChip = null;
    let bgChip = null;
    let statusHint = null;
    let statusPos = null;
    let statusSize = null;
    let toolBox = null;
    let colorBox = null;
    let statusBar = null;

    const name = () => (currentPath ? U.basename(currentPath) : "untitled");

    function updateTitle() {
      if (win) win.setTitle((dirty ? "*" : "") + name() + " - Paint");
    }

    function markDirty() {
      if (!dirty) { dirty = true; updateTitle(); }
    }

    function updateSizeStatus() {
      if (statusSize) statusSize.textContent = docW + " x " + docH;
    }

    function updateHint() {
      if (statusHint) statusHint.textContent = TOOL_HINT[tool] || "";
    }

    // ------------------------------------------------------------ document
    function applyZoom() {
      if (!canvas) return;
      canvas.style.width = docW * zoom + "px";
      canvas.style.height = docH * zoom + "px";
      overlay.style.width = docW * zoom + "px";
      overlay.style.height = docH * zoom + "px";
      const render = zoom > 1 ? "pixelated" : "auto";
      canvas.style.imageRendering = render;
      overlay.style.imageRendering = render;
      if (host) {
        host.style.width = docW * zoom + "px";
        host.style.height = docH * zoom + "px";
      }
    }

    function bindContext() {
      ctx = canvas.getContext("2d", { willReadFrequently: true });
      octx = overlay.getContext("2d", { willReadFrequently: true });
    }

    function setDocSize(w, h, fill) {
      docW = clamp(Math.round(w), 1, 4096);
      docH = clamp(Math.round(h), 1, 4096);
      canvas.width = docW;
      canvas.height = docH;
      overlay.width = docW;
      overlay.height = docH;
      bindContext();
      if (fill !== false) {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, docW, docH);
      }
      applyZoom();
      updateSizeStatus();
    }

    function resetDocument() {
      setDocSize(640, 480, true);
      currentPath = null;
      dirty = false;
      undoStack = [];
      redoStack = [];
      selection = null;
      floating = null;
      lasso = null;
      polygon = null;
      pendingCurve = null;
      updateTitle();
      drawOverlay();
    }

    function snapshotState() {
      return {
        w: canvas.width,
        h: canvas.height,
        data: ctx.getImageData(0, 0, canvas.width, canvas.height),
      };
    }

    function pushUndo() {
      try {
        undoStack.push(snapshotState());
        if (undoStack.length > MAX_UNDO) undoStack.shift();
        redoStack.length = 0;
      } catch (_err) { /* canvas too large for a snapshot */ }
    }

    function applyState(state) {
      if (!state) return;
      if (canvas.width !== state.w || canvas.height !== state.h) {
        docW = state.w;
        docH = state.h;
        canvas.width = docW;
        canvas.height = docH;
        overlay.width = docW;
        overlay.height = docH;
        bindContext();
        applyZoom();
        updateSizeStatus();
      }
      ctx.putImageData(state.data, 0, 0);
    }

    function undo() {
      if (!undoStack.length) { U.toast("Nothing to undo"); return; }
      redoStack.push(snapshotState());
      applyState(undoStack.pop());
      selection = null;
      floating = null;
      markDirty();
      drawOverlay();
    }

    function redo() {
      if (!redoStack.length) { U.toast("Nothing to redo"); return; }
      undoStack.push(snapshotState());
      applyState(redoStack.pop());
      selection = null;
      floating = null;
      markDirty();
      drawOverlay();
    }

    // ------------------------------------------------------------ overlay
    function dashedRect(c, x, y, w, h) {
      if (w < 1 || h < 1) return;
      c.save();
      c.lineWidth = 1;
      c.setLineDash([]);
      c.strokeStyle = "#ffffff";
      c.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
      c.strokeStyle = "#000000";
      c.setLineDash([4, 4]);
      c.lineDashOffset = ants;
      c.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
      c.restore();
    }

    function dashedPoly(c, points, close) {
      if (!points || points.length < 2) return;
      const path = () => {
        c.beginPath();
        points.forEach((p, i) => (i ? c.lineTo(p.x + 0.5, p.y + 0.5) : c.moveTo(p.x + 0.5, p.y + 0.5)));
        if (close) c.closePath();
      };
      c.save();
      c.lineWidth = 1;
      c.setLineDash([]);
      c.strokeStyle = "#ffffff";
      path(); c.stroke();
      c.strokeStyle = "#000000";
      c.setLineDash([4, 4]);
      c.lineDashOffset = ants;
      path(); c.stroke();
      c.restore();
    }

    function floatingCanvas(item) {
      if (!item._canvas) {
        const c = document.createElement("canvas");
        c.width = item.w;
        c.height = item.h;
        c.getContext("2d").putImageData(item.image, 0, 0);
        item._canvas = c;
      }
      return item._canvas;
    }

    function drawOverlay() {
      if (!octx) return;
      octx.clearRect(0, 0, docW, docH);
      if (lasso && lasso.length > 1) dashedPoly(octx, lasso, false);
      if (selection) {
        if (selection.points) dashedPoly(octx, selection.points, true);
        else dashedRect(octx, selection.x, selection.y, selection.w, selection.h);
      }
      if (floating) {
        octx.drawImage(floatingCanvas(floating), floating.x, floating.y);
        dashedRect(octx, floating.x, floating.y, floating.w, floating.h);
      }
      if (polygon && polygon.length) {
        const pts = pendingPoint ? polygon.concat([pendingPoint]) : polygon;
        dashedPoly(octx, pts, false);
      }
    }

    // ------------------------------------------------------------ selection
    function applyMaskAlpha(image, mask) {
      const data = image.data;
      for (let i = 0; i < mask.length; i += 1) {
        if (!mask[i]) data[i * 4 + 3] = 0;
      }
    }

    function clearSelectionPixels() {
      if (!selection) return;
      const rgb = hexToRgb(bg);
      if (!selection.mask) {
        ctx.fillStyle = bg;
        ctx.fillRect(selection.x, selection.y, selection.w, selection.h);
        return;
      }
      const image = ctx.getImageData(selection.x, selection.y, selection.w, selection.h);
      const data = image.data;
      for (let i = 0; i < selection.mask.length; i += 1) {
        if (!selection.mask[i]) continue;
        const j = i * 4;
        data[j] = rgb[0];
        data[j + 1] = rgb[1];
        data[j + 2] = rgb[2];
        data[j + 3] = 255;
      }
      ctx.putImageData(image, selection.x, selection.y);
    }

    function lassoMask(points, minX, minY, w, h) {
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      const g = c.getContext("2d");
      g.fillStyle = "#ffffff";
      g.beginPath();
      points.forEach((p, i) => (i
        ? g.lineTo(p.x - minX, p.y - minY)
        : g.moveTo(p.x - minX, p.y - minY)));
      g.closePath();
      g.fill();
      const data = g.getImageData(0, 0, w, h).data;
      const mask = new Uint8Array(w * h);
      for (let i = 0; i < mask.length; i += 1) mask[i] = data[i * 4 + 3] > 0 ? 1 : 0;
      return mask;
    }

    function finishLasso() {
      if (!lasso || lasso.length < 3) { lasso = null; drawOverlay(); return; }
      const xs = lasso.map((p) => p.x);
      const ys = lasso.map((p) => p.y);
      const minX = clamp(Math.min(...xs), 0, docW - 1);
      const minY = clamp(Math.min(...ys), 0, docH - 1);
      const maxX = clamp(Math.max(...xs), 0, docW - 1);
      const maxY = clamp(Math.max(...ys), 0, docH - 1);
      const w = maxX - minX + 1;
      const h = maxY - minY + 1;
      if (w < 2 || h < 2) { lasso = null; drawOverlay(); return; }
      const points = lasso.map((p) => ({ x: p.x, y: p.y }));
      selection = { x: minX, y: minY, w, h, points, mask: lassoMask(points, minX, minY, w, h) };
      lasso = null;
      drawOverlay();
    }

    function insideSelection(p) {
      if (!selection) return false;
      if (p.x < selection.x || p.y < selection.y ||
          p.x >= selection.x + selection.w || p.y >= selection.y + selection.h) return false;
      if (!selection.mask) return true;
      return !!selection.mask[(p.y - selection.y) * selection.w + (p.x - selection.x)];
    }

    function beginMove(p) {
      pushUndo();
      let item;
      if (floating) {
        item = floating;
      } else {
        const image = ctx.getImageData(selection.x, selection.y, selection.w, selection.h);
        if (selection.mask) applyMaskAlpha(image, selection.mask);
        clearSelectionPixels();
        item = {
          image,
          x: selection.x,
          y: selection.y,
          ox: selection.x,
          oy: selection.y,
          w: selection.w,
          h: selection.h,
          points: selection.points,
        };
      }
      if (item.ox === undefined) { item.ox = item.x; item.oy = item.y; }
      floating = item;
      moveOffset = { x: p.x - floating.x, y: p.y - floating.y };
      selection = null;
      drawOverlay();
    }

    function commitFloating() {
      if (!floating) return;
      ctx.drawImage(floatingCanvas(floating), floating.x, floating.y);
      const dx = floating.x - (floating.ox === undefined ? floating.x : floating.ox);
      const dy = floating.y - (floating.oy === undefined ? floating.y : floating.oy);
      const points = floating.points
        ? floating.points.map((pt) => ({ x: pt.x + dx, y: pt.y + dy }))
        : null;
      selection = {
        x: floating.x,
        y: floating.y,
        w: floating.w,
        h: floating.h,
        points,
      };
      floating = null;
      moveOffset = null;
      markDirty();
      drawOverlay();
    }

    function cancelSelection() {
      selection = null;
      floating = null;
      lasso = null;
      drawOverlay();
    }

    function copySelection() {
      if (!selection) { U.toast("Select an area first"); return; }
      const image = ctx.getImageData(selection.x, selection.y, selection.w, selection.h);
      if (selection.mask) applyMaskAlpha(image, selection.mask);
      clipboard = { image, w: selection.w, h: selection.h };
      U.toast("Copied " + selection.w + " x " + selection.h + " pixels");
    }

    function cutSelection() {
      if (!selection) { U.toast("Select an area first"); return; }
      copySelection();
      pushUndo();
      clearSelectionPixels();
      markDirty();
      drawOverlay();
    }

    function pasteClipboard() {
      if (!clipboard) { U.toast("Nothing to paste"); return; }
      pushUndo();
      const copy = new ImageData(
        new Uint8ClampedArray(clipboard.image.data),
        clipboard.w,
        clipboard.h
      );
      floating = {
        image: copy,
        x: 0,
        y: 0,
        ox: 0,
        oy: 0,
        w: clipboard.w,
        h: clipboard.h,
        points: null,
      };
      selection = null;
      tool = "select";
      setTool("select");
      drawOverlay();
      U.toast("Pasted - drag it where you want it, then click outside");
    }

    function deleteSelection() {
      if (!selection) return;
      pushUndo();
      clearSelectionPixels();
      markDirty();
      drawOverlay();
    }

    function selectAll() {
      selection = { x: 0, y: 0, w: docW, h: docH };
      floating = null;
      lasso = null;
      setTool("select");
      drawOverlay();
    }

    // ------------------------------------------------------------ drawing
    function pos(event) {
      const rect = canvas.getBoundingClientRect();
      return {
        x: clamp(Math.floor((event.clientX - rect.left) / zoom), 0, docW - 1),
        y: clamp(Math.floor((event.clientY - rect.top) / zoom), 0, docH - 1),
      };
    }

    function dot(x, y, color, radius) {
      ctx.save();
      ctx.fillStyle = color;
      if (radius <= 0.5) ctx.fillRect(x, y, 1, 1);
      else {
        ctx.beginPath();
        ctx.arc(x + 0.5, y + 0.5, radius, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    function strokeLine(a, b, color, width, round) {
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.lineCap = round ? "round" : "butt";
      ctx.lineJoin = round ? "round" : "miter";
      ctx.beginPath();
      ctx.moveTo(a.x + 0.5, a.y + 0.5);
      ctx.lineTo(b.x + 0.5, b.y + 0.5);
      ctx.stroke();
      ctx.restore();
    }

    function floodFill(x, y, color) {
      if (x < 0 || y < 0 || x >= docW || y >= docH) return;
      const image = ctx.getImageData(0, 0, docW, docH);
      const data = image.data;
      const index = (y * docW + x) * 4;
      const target = [data[index], data[index + 1], data[index + 2], data[index + 3]];
      const fill = hexToRgb(color);
      if (target[0] === fill[0] && target[1] === fill[1] && target[2] === fill[2] &&
          target[3] === 255) return;
      const seen = new Uint8Array(docW * docH);
      const stack = [x, y];
      while (stack.length) {
        const py = stack.pop();
        const px = stack.pop();
        if (px < 0 || py < 0 || px >= docW || py >= docH) continue;
        const cell = py * docW + px;
        if (seen[cell]) continue;
        seen[cell] = 1;
        const j = cell * 4;
        if (data[j] !== target[0] || data[j + 1] !== target[1] ||
            data[j + 2] !== target[2] || data[j + 3] !== target[3]) continue;
        data[j] = fill[0];
        data[j + 1] = fill[1];
        data[j + 2] = fill[2];
        data[j + 3] = 255;
        stack.push(px + 1, py, px - 1, py, px, py + 1, px, py - 1);
      }
      ctx.putImageData(image, 0, 0);
    }

    function drawShape(from, to, color, filled) {
      const x = Math.min(from.x, to.x);
      const y = Math.min(from.y, to.y);
      const w = Math.abs(to.x - from.x);
      const h = Math.abs(to.y - from.y);
      ctx.save();
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = size;
      ctx.lineJoin = "miter";
      ctx.lineCap = "butt";
      if (tool === "line") {
        ctx.beginPath();
        ctx.moveTo(from.x + 0.5, from.y + 0.5);
        ctx.lineTo(to.x + 0.5, to.y + 0.5);
        ctx.stroke();
      } else if (tool === "rect") {
        if (filled) ctx.fillRect(x, y, w + 1, h + 1);
        else ctx.strokeRect(x + 0.5, y + 0.5, w, h);
      } else if (tool === "roundRect") {
        const r = Math.min(10, w / 4, h / 4);
        ctx.beginPath();
        ctx.roundRect(x + 0.5, y + 0.5, w, h, Math.max(0, r));
        if (filled) ctx.fill();
        else ctx.stroke();
      } else if (tool === "ellipse") {
        ctx.beginPath();
        ctx.ellipse(x + w / 2, y + h / 2, Math.max(0.5, w / 2), Math.max(0.5, h / 2),
          0, 0, Math.PI * 2);
        if (filled) ctx.fill();
        else ctx.stroke();
      }
      ctx.restore();
    }

    function drawCurve(a, b, control, color) {
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = size;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(a.x + 0.5, a.y + 0.5);
      ctx.quadraticCurveTo(control.x, control.y, b.x + 0.5, b.y + 0.5);
      ctx.stroke();
      ctx.restore();
    }

    function spray(p, color) {
      const radius = 5 + size * 2;
      ctx.save();
      ctx.fillStyle = color;
      for (let i = 0; i < 14; i += 1) {
        const angle = Math.random() * Math.PI * 2;
        const r = Math.random() * radius;
        ctx.fillRect(Math.round(p.x + Math.cos(angle) * r),
          Math.round(p.y + Math.sin(angle) * r), 1, 1);
      }
      ctx.restore();
    }

    function startAirbrush(p) {
      stopAirbrush();
      airTimer = setInterval(() => {
        if (!drawing || tool !== "airbrush") { stopAirbrush(); return; }
        spray(lastPoint, strokeColor);
      }, 45);
    }

    function stopAirbrush() {
      if (airTimer) { clearInterval(airTimer); airTimer = null; }
    }

    // ------------------------------------------------------------ text
    function textFontSize() { return Math.max(11, 8 + size * 4); }

    function startText(p) {
      commitText();
      const area = document.createElement("textarea");
      area.className = "paint-text-input";
      area.spellcheck = false;
      area.style.left = p.x * zoom + "px";
      area.style.top = p.y * zoom + "px";
      area.style.fontSize = textFontSize() * zoom + "px";
      area.style.color = fg;
      area.style.background = "rgba(255,255,255,0.85)";
      area.style.width = Math.max(90, 160) + "px";
      area.style.height = textFontSize() * 1.6 * zoom + "px";
      host.append(area);
      textBox = area;
      setTimeout(() => area.focus(), 20);
      area.addEventListener("keydown", (event) => {
        if (event.key === "Escape") { event.preventDefault(); cancelText(); }
        else if (event.key === "Enter" && !event.shiftKey) {
          event.preventDefault();
          commitText();
        }
      });
      area.addEventListener("blur", () => { if (textBox === area) commitText(); });
    }

    function commitText() {
      if (!textBox) return;
      const area = textBox;
      textBox = null;
      const text = area.value;
      const left = parseFloat(area.style.left) / zoom;
      const top = parseFloat(area.style.top) / zoom;
      const fontSize = textFontSize();
      area.remove();
      if (!text) return;
      pushUndo();
      ctx.save();
      ctx.fillStyle = fg;
      ctx.font = fontSize + 'px "MS Sans Serif", "Microsoft Sans Serif", Tahoma, sans-serif';
      ctx.textBaseline = "top";
      text.split("\n").forEach((line, index) => {
        ctx.fillText(line, left, top + index * fontSize * 1.25);
      });
      ctx.restore();
      markDirty();
    }

    function cancelText() {
      if (textBox) { textBox.remove(); textBox = null; }
    }

    // ------------------------------------------------------------ tools
    function setTool(next) {
      if (tool === "text" && next !== "text") commitText();
      if (tool !== next) { polygon = null; pendingCurve = null; pendingPoint = null; }
      tool = next;
      Object.entries(toolButtons).forEach(([key, button]) => {
        button.classList.toggle("active", key === tool);
      });
      if (canvas) {
        canvas.style.cursor = tool === "text" ? "text"
          : (tool === "pick" ? "crosshair"
            : (tool === "select" || tool === "freeSelect") ? "default" : "crosshair");
      }
      updateHint();
      drawOverlay();
    }

    function setFg(color) {
      fg = color;
      if (fgChip) fgChip.style.background = color;
    }

    function setBg(color) {
      bg = color;
      if (bgChip) bgChip.style.background = color;
    }

    function cycleZoom(direction) {
      const steps = [1, 2, 4, 8];
      const index = steps.indexOf(zoom);
      const next = clamp(index + direction, 0, steps.length - 1);
      zoom = steps[next];
      applyZoom();
      updateHint();
    }

    // ------------------------------------------------------------ pointer
    function onPointerDown(event) {
      if (event.button !== 0 && event.button !== 2) return;
      event.preventDefault();
      if (textBox) { commitText(); return; }
      const p = pos(event);
      if (pendingCurve) {
        const control = pendingPoint || pendingCurve.b;
        ctx.putImageData(snapshot, 0, 0);
        drawCurve(pendingCurve.a, pendingCurve.b, control, strokeColor);
        pendingCurve = null;
        pendingPoint = null;
        snapshot = null;
        markDirty();
        drawOverlay();
        return;
      }
      drawing = true;
      try { canvas.setPointerCapture(event.pointerId); } catch (_err) { /* synthetic events */ }
      if (floating) {
        if (insideFloating(event)) { beginMove(p); return; }
        // clicking outside a floating piece drops it first
        drawing = false;
        commitFloating();
        return;
      }
      if (polygon && polygon.length > 2 && nearFirst(event)) {
        drawing = false;
        finishPolygon();
        return;
      }

      const color = event.button === 2 ? bg : fg;
      startPoint = p;
      lastPoint = p;
      // Right-dragging a shape fills it with the foreground colour.
      strokeColor = event.button === 2 && SHAPE_TOOLS.has(tool) ? fg : color;
      filledShape = event.button === 2;

      if (tool === "pick") {
        const data = ctx.getImageData(p.x, p.y, 1, 1).data;
        const picked = rgbToHex(data, 0);
        if (event.button === 2) setBg(picked); else setFg(picked);
        drawing = false;
        return;
      }
      if (tool === "fill") {
        pushUndo();
        floodFill(p.x, p.y, color);
        markDirty();
        drawing = false;
        return;
      }
      if (tool === "magnifier") {
        cycleZoom(event.button === 2 ? -1 : 1);
        drawing = false;
        return;
      }
      if (tool === "text") {
        drawing = false;
        startText(p);
        return;
      }
      if (tool === "select" || tool === "freeSelect") {
        if (selection && insideSelection(p)) { beginMove(p); return; }
        selection = null;
        floating = null;
        if (tool === "select") {
          selection = { x: p.x, y: p.y, w: 1, h: 1 };
        } else {
          lasso = [p];
        }
        drawOverlay();
        return;
      }
      if (tool === "polygon") {
        if (!polygon) { pushUndo(); polygon = [p]; }
        else polygon.push(p);
        pendingPoint = p;
        drawOverlay();
        drawing = false;
        return;
      }

      pushUndo();
      snapshot = ctx.getImageData(0, 0, docW, docH);
      if (tool === "pencil") dot(p.x, p.y, color, 0);
      else if (tool === "brush") dot(p.x, p.y, color, size);
      else if (tool === "eraser") dot(p.x, p.y, color, 1 + size);
      else if (tool === "airbrush") startAirbrush(p);
    }

    function insideFloating(event) {
      if (!floating) return false;
      const p = pos(event);
      return p.x >= floating.x && p.y >= floating.y &&
        p.x < floating.x + floating.w && p.y < floating.y + floating.h;
    }

    function nearFirst(event) {
      if (!polygon || !polygon.length) return false;
      const p = pos(event);
      const first = polygon[0];
      return Math.abs(p.x - first.x) <= 4 && Math.abs(p.y - first.y) <= 4;
    }

    function onPointerMove(event) {
      if (!canvas) return;
      const p = pos(event);
      if (statusPos) statusPos.textContent = p.x + "," + p.y;

      if (floating && drawing) {
        floating.x = clamp(p.x - moveOffset.x, -floating.w + 1, docW - 1);
        floating.y = clamp(p.y - moveOffset.y, -floating.h + 1, docH - 1);
        drawOverlay();
        return;
      }
      if (pendingCurve) {
        pendingPoint = p;
        ctx.putImageData(snapshot, 0, 0);
        drawCurve(pendingCurve.a, pendingCurve.b, p, strokeColor);
        drawOverlay();
        return;
      }
      if (polygon && !drawing) {
        pendingPoint = p;
        drawOverlay();
        return;
      }
      if (!drawing) return;

      if (tool === "select") {
        const x = Math.min(startPoint.x, p.x);
        const y = Math.min(startPoint.y, p.y);
        selection = {
          x,
          y,
          w: Math.abs(p.x - startPoint.x) + 1,
          h: Math.abs(p.y - startPoint.y) + 1,
        };
        drawOverlay();
        return;
      }
      if (tool === "freeSelect") {
        if (!lasso) lasso = [startPoint];
        lasso.push(p);
        drawOverlay();
        return;
      }
      if (SHAPE_TOOLS.has(tool)) {
        ctx.putImageData(snapshot, 0, 0);
        if (tool === "curve") {
          ctx.save();
          ctx.strokeStyle = strokeColor;
          ctx.lineWidth = size;
          ctx.beginPath();
          ctx.moveTo(startPoint.x + 0.5, startPoint.y + 0.5);
          ctx.lineTo(p.x + 0.5, p.y + 0.5);
          ctx.stroke();
          ctx.restore();
        } else {
          drawShape(startPoint, p, strokeColor, filledShape);
        }
        lastPoint = p;
        return;
      }
      if (tool === "pencil") {
        strokeLine(lastPoint, p, strokeColor, 1, false);
      } else if (tool === "brush") {
        strokeLine(lastPoint, p, strokeColor, Math.max(1, size * 2), true);
      } else if (tool === "eraser") {
        strokeLine(lastPoint, p, strokeColor, 2 + size * 2, false);
      } else if (tool === "airbrush") {
        spray(p, strokeColor);
      }
      lastPoint = p;
    }

    function onPointerUp() {
      if (!drawing) {
        if (lasso) finishLasso();
        return;
      }
      drawing = false;
      stopAirbrush();
      if (floating) { commitFloating(); return; }
      if (tool === "select") {
        if (!selection || selection.w < 2 || selection.h < 2) selection = null;
        drawOverlay();
        return;
      }
      if (tool === "freeSelect") { finishLasso(); return; }
      if (tool === "curve" && startPoint) {
        pendingCurve = { a: startPoint, b: lastPoint };
        snapshot = ctx.getImageData(0, 0, docW, docH);
        markDirty();
        drawOverlay();
        return;
      }
      if (SHAPE_TOOLS.has(tool)) markDirty();
      if (tool === "pencil" || tool === "brush" || tool === "eraser" || tool === "airbrush") {
        markDirty();
      }
      snapshot = null;
      drawOverlay();
    }

    function finishPolygon() {
      if (!polygon || polygon.length < 3) { polygon = null; drawOverlay(); return; }
      const points = polygon.slice();
      const filled = filledShape;
      ctx.save();
      ctx.strokeStyle = strokeColor;
      ctx.fillStyle = strokeColor;
      ctx.lineWidth = size;
      ctx.beginPath();
      points.forEach((p, i) => (i ? ctx.lineTo(p.x + 0.5, p.y + 0.5) : ctx.moveTo(p.x + 0.5, p.y + 0.5)));
      ctx.closePath();
      if (filled) ctx.fill(); else ctx.stroke();
      ctx.restore();
      polygon = null;
      pendingPoint = null;
      markDirty();
      drawOverlay();
    }

    // ------------------------------------------------------------ files
    async function openFile() {
      if (dirty && !await U.confirm("Paint", "Discard unsaved changes?", "warning")) return;
      const path = await U.nasPicker({
        title: "Open Picture",
        mode: "file",
        start: currentPath ? U.dirname(currentPath) : "/Pictures",
      });
      if (path) loadPicture(path);
    }

    function loadPicture(path) {
      return new Promise((resolve) => {
        const image = new Image();
        image.onload = () => {
          setDocSize(image.naturalWidth, image.naturalHeight, true);
          ctx.drawImage(image, 0, 0);
          currentPath = path;
          dirty = false;
          undoStack = [];
          redoStack = [];
          selection = null;
          floating = null;
          updateTitle();
          drawOverlay();
          resolve(true);
        };
        image.onerror = () => {
          U.alert("Paint", "That picture could not be opened.", "error");
          resolve(false);
        };
        image.src = API.rawUrl(path) + "&t=" + Date.now();
      });
    }

    async function writePicture(path) {
      try {
        const data = canvas.toDataURL("image/png");
        await API.saveImage(path, data);
        currentPath = path;
        dirty = false;
        updateTitle();
        U.toast("Saved " + U.basename(path), "success");
        return true;
      } catch (err) {
        U.alert("Paint", err.message, "error");
        return false;
      }
    }

    async function save() {
      if (!currentPath || !/\.png$/i.test(currentPath)) return saveAs();
      return writePicture(currentPath);
    }

    async function saveAs() {
      const suggested = currentPath || "/Pictures/untitled.png";
      const target = await U.prompt("Save As", "Save the picture on the NAS as:", suggested);
      if (!target) return false;
      let full = target.trim();
      if (!full.startsWith("/")) full = "/Pictures/" + full;
      full = full.replace(/\.(png|bmp|jpe?g|gif|webp)$/i, "") + ".png";
      return writePicture(full);
    }

    async function newPicture() {
      if (dirty && !await U.confirm("Paint", "Discard unsaved changes?", "warning")) return;
      resetDocument();
    }

    async function requestClose() {
      if (!dirty) { win.opts.__close(); return; }
      const result = await U.dialog({
        title: "Paint",
        icon: "warning",
        message: "Save changes to " + name() + "?",
        buttons: [
          { label: "Yes", value: "yes", primary: true },
          { label: "No", value: "no" },
          { label: "Cancel", value: null },
        ],
      });
      if (result === "yes") { if (await save()) win.opts.__close(); }
      else if (result === "no") win.opts.__close();
    }

    // ------------------------------------------------------------ image menu
    function flip(horizontal) {
      pushUndo();
      const source = document.createElement("canvas");
      source.width = docW;
      source.height = docH;
      source.getContext("2d").drawImage(canvas, 0, 0);
      ctx.save();
      ctx.clearRect(0, 0, docW, docH);
      ctx.translate(horizontal ? docW : 0, horizontal ? 0 : docH);
      ctx.scale(horizontal ? -1 : 1, horizontal ? 1 : -1);
      ctx.drawImage(source, 0, 0);
      ctx.restore();
      cancelSelection();
      markDirty();
    }

    function rotate(degrees) {
      pushUndo();
      const source = document.createElement("canvas");
      source.width = docW;
      source.height = docH;
      source.getContext("2d").drawImage(canvas, 0, 0);
      const oldW = docW;
      const oldH = docH;
      const swapped = degrees % 180 !== 0;
      const newW = swapped ? oldH : oldW;
      const newH = swapped ? oldW : oldH;
      setDocSize(newW, newH, true);
      ctx.save();
      ctx.translate(newW / 2, newH / 2);
      ctx.rotate((degrees * Math.PI) / 180);
      ctx.drawImage(source, -oldW / 2, -oldH / 2);
      ctx.restore();
      cancelSelection();
      markDirty();
    }

    function stretchSkew(sx, sy, skewX, skewY) {
      pushUndo();
      const source = document.createElement("canvas");
      source.width = docW;
      source.height = docH;
      source.getContext("2d").drawImage(canvas, 0, 0);
      const newW = Math.max(1, Math.round((docW * sx) / 100));
      const newH = Math.max(1, Math.round((docH * sy) / 100));
      setDocSize(newW, newH, true);
      ctx.save();
      ctx.transform(
        1,
        Math.tan((skewY * Math.PI) / 180),
        Math.tan((skewX * Math.PI) / 180),
        1,
        0,
        0
      );
      ctx.drawImage(source, 0, 0, newW, newH);
      ctx.restore();
      cancelSelection();
      markDirty();
    }

    function invertColors() {
      pushUndo();
      const image = ctx.getImageData(0, 0, docW, docH);
      const data = image.data;
      for (let i = 0; i < data.length; i += 4) {
        data[i] = 255 - data[i];
        data[i + 1] = 255 - data[i + 1];
        data[i + 2] = 255 - data[i + 2];
      }
      ctx.putImageData(image, 0, 0);
      markDirty();
    }

    function clearImage() {
      pushUndo();
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, docW, docH);
      cancelSelection();
      markDirty();
    }

    function attributes() {
      showForm("Attributes", [
        { name: "w", label: "Width:", type: "number", value: docW },
        { name: "h", label: "Height:", type: "number", value: docH },
      ], (values) => {
        const w = parseInt(values.w, 10);
        const h = parseInt(values.h, 10);
        if (!(w > 0 && h > 0)) { U.alert("Attributes", "Width and height must be positive numbers.", "warning"); return false; }
        if (w > 4096 || h > 4096) { U.alert("Attributes", "The maximum size is 4096 x 4096.", "warning"); return false; }
        pushUndo();
        const source = document.createElement("canvas");
        source.width = docW;
        source.height = docH;
        source.getContext("2d").drawImage(canvas, 0, 0);
        setDocSize(w, h, true);
        ctx.drawImage(source, 0, 0);
        cancelSelection();
        markDirty();
        return true;
      });
    }

    function editColors() {
      const rgb = hexToRgb(fg);
      showForm("Edit Colors", [
        { name: "r", label: "Red:", type: "number", value: rgb[0] },
        { name: "g", label: "Green:", type: "number", value: rgb[1] },
        { name: "b", label: "Blue:", type: "number", value: rgb[2] },
      ], (values) => {
        const parts = ["r", "g", "b"].map((key) => parseInt(values[key], 10));
        if (parts.some((n) => !(n >= 0 && n <= 255))) {
          U.alert("Edit Colors", "Red, green and blue must be between 0 and 255.", "warning");
          return false;
        }
        setFg("#" + parts.map((n) => n.toString(16).padStart(2, "0")).join(""));
        return true;
      });
    }

    // ------------------------------------------------------------ dialogs
    function showForm(title, fields, onOk) {
      WM.open({
        title,
        icon: "paint",
        width: 340,
        height: 96 + fields.length * 28 + 46,
        resizable: false,
        maximizable: false,
        minimizable: false,
        dialog: true,
        build(body, w) {
          const wrap = U.el("div", { class: "paint-dialog" });
          const inputs = {};
          fields.forEach((field) => {
            const row = U.el("div", { class: "paint-dialog-row" });
            row.append(U.el("label", { text: field.label }));
            let input;
            if (field.type === "select") {
              input = U.el("select");
              (field.options || []).forEach((option) => {
                input.append(U.el("option", { value: option.value, text: option.text }));
              });
              input.value = field.value;
            } else {
              input = U.el("input", {
                type: field.type || "text",
                value: String(field.value),
                min: field.min,
                max: field.max,
              });
            }
            inputs[field.name] = input;
            row.append(input);
            wrap.append(row);
          });
          const buttons = U.el("div", { class: "paint-dialog-buttons" });
          const cancel = U.el("button", { type: "button", text: "Cancel" });
          const ok = U.el("button", { type: "button", class: "default", text: "OK" });
          cancel.addEventListener("click", () => w.close());
          ok.addEventListener("click", () => {
            const values = {};
            Object.keys(inputs).forEach((key) => { values[key] = inputs[key].value; });
            if (onOk(values) !== false) w.close();
          });
          buttons.append(cancel, ok);
          wrap.append(buttons);
          body.append(wrap);
          setTimeout(() => {
            const first = inputs[Object.keys(inputs)[0]];
            if (first) { first.focus(); if (first.select) first.select(); }
          }, 50);
        },
      });
    }

    function flipRotateDialog() {
      showForm("Flip and Rotate", [
        {
          name: "mode",
          label: "Operation:",
          type: "select",
          value: "h",
          options: [
            { value: "h", text: "Flip horizontal" },
            { value: "v", text: "Flip vertical" },
            { value: "90", text: "Rotate 90 degrees" },
            { value: "180", text: "Rotate 180 degrees" },
            { value: "270", text: "Rotate 270 degrees" },
          ],
        },
      ], (values) => {
        if (values.mode === "h") flip(true);
        else if (values.mode === "v") flip(false);
        else rotate(parseInt(values.mode, 10));
        return true;
      });
    }

    function stretchSkewDialog() {
      showForm("Stretch and Skew", [
        { name: "sx", label: "Stretch %:", type: "number", value: 100 },
        { name: "sy", label: "Stretch %:", type: "number", value: 100 },
        { name: "kx", label: "Skew X:", type: "number", value: 0 },
        { name: "ky", label: "Skew Y:", type: "number", value: 0 },
      ], (values) => {
        const sx = clamp(parseInt(values.sx, 10) || 0, 1, 1000);
        const sy = clamp(parseInt(values.sy, 10) || 0, 1, 1000);
        const kx = clamp(parseInt(values.kx, 10) || 0, -89, 89);
        const ky = clamp(parseInt(values.ky, 10) || 0, -89, 89);
        stretchSkew(sx, sy, kx, ky);
        return true;
      });
    }

    // ------------------------------------------------------------ menus
    function buildMenus(w) {
      U.menuBar(w, [
        {
          label: "File",
          items: [
            { label: "New", shortcut: "Ctrl+N", action: newPicture },
            { label: "Open...", shortcut: "Ctrl+O", action: openFile },
            { label: "Save", shortcut: "Ctrl+S", action: save },
            { label: "Save As...", action: saveAs },
            { separator: true },
            { label: "Exit", action: () => win.close() },
          ],
        },
        {
          label: "Edit",
          items: [
            { label: "Undo", shortcut: "Ctrl+Z", action: undo },
            { label: "Redo", shortcut: "Ctrl+Y", action: redo },
            { separator: true },
            { label: "Cut", shortcut: "Ctrl+X", action: cutSelection },
            { label: "Copy", shortcut: "Ctrl+C", action: copySelection },
            { label: "Paste", shortcut: "Ctrl+V", action: pasteClipboard },
            { label: "Delete", shortcut: "Del", action: deleteSelection },
            { separator: true },
            { label: "Select All", shortcut: "Ctrl+A", action: selectAll },
          ],
        },
        {
          label: "View",
          items: [
            {
              label: "Tool Box",
              checked: toolBox && toolBox.style.display !== "none",
              action: () => {
                const hidden = toolBox.style.display === "none";
                toolBox.style.display = hidden ? "" : "none";
              },
            },
            {
              label: "Color Box",
              checked: colorBox && colorBox.style.display !== "none",
              action: () => {
                const hidden = colorBox.style.display === "none";
                colorBox.style.display = hidden ? "" : "none";
              },
            },
            {
              label: "Status Bar",
              checked: statusBar && statusBar.style.display !== "none",
              action: () => {
                const hidden = statusBar.style.display === "none";
                statusBar.style.display = hidden ? "" : "none";
              },
            },
            { separator: true },
            {
              label: "Zoom",
              submenu: [
                { label: "Normal Size (100%)", checked: zoom === 1, action: () => { zoom = 1; applyZoom(); } },
                { label: "Large Size (200%)", checked: zoom === 2, action: () => { zoom = 2; applyZoom(); } },
                { label: "400%", checked: zoom === 4, action: () => { zoom = 4; applyZoom(); } },
                { label: "800%", checked: zoom === 8, action: () => { zoom = 8; applyZoom(); } },
              ],
            },
          ],
        },
        {
          label: "Image",
          items: [
            { label: "Flip/Rotate...", shortcut: "Ctrl+R", action: flipRotateDialog },
            { label: "Stretch/Skew...", shortcut: "Ctrl+W", action: stretchSkewDialog },
            { label: "Invert Colors", shortcut: "Ctrl+I", action: invertColors },
            { label: "Attributes...", shortcut: "Ctrl+E", action: attributes },
            { label: "Clear Image", shortcut: "Ctrl+Shift+N", action: clearImage },
          ],
        },
        {
          label: "Colors",
          items: [
            { label: "Edit Colors...", action: editColors },
          ],
        },
        {
          label: "Help",
          items: [
            { label: "Help Topics", action: helpTopics },
            { label: "About Paint", action: aboutPaint },
          ],
        },
      ]);
    }

    function helpTopics() {
      U.alert(
        "Paint Help",
        "Paint lets you draw and touch up pictures, then save them on the NAS.\n\n" +
        "Left mouse button uses the foreground colour; the right button uses " +
        "the background colour. Right-dragging a rectangle, ellipse, rounded " +
        "rectangle or polygon fills it.\n\n" +
        "Select an area with Select or Free-Form Select, then drag inside it " +
        "to move it. Ctrl+X / Ctrl+C / Ctrl+V cut, copy and paste.\n\n" +
        "Pictures are saved as PNG files in your NAS folders.",
        "paint"
      );
    }

    function aboutPaint() {
      WM.open({
        title: "About Paint",
        icon: "paint",
        width: 400,
        height: 250,
        resizable: false,
        maximizable: false,
        minimizable: false,
        dialog: true,
        build(body, w) {
          const app = U.el("div", { class: "paint-about" });
          app.append(
            U.el("div", { class: "paint-about-icon", html: Icons.get("paint", 48) }),
            U.el("div", { class: "paint-about-text" },
              U.el("h2", { text: "Paint" }),
              U.el("p", { text: "Part of Win95 NAS 1.0" }),
              U.el("p", { text: "A faithful Windows 95 style paint program." }),
              U.el("p", { class: "muted", text: "Draw, erase, fill, select, rotate, stretch and save straight to your NAS." })
            )
          );
          const buttons = U.el("div", { class: "paint-dialog-buttons" });
          const ok = U.el("button", { type: "button", class: "default", text: "OK" });
          ok.addEventListener("click", () => w.close());
          buttons.append(ok);
          app.append(buttons);
          body.append(app);
          setTimeout(() => ok.focus(), 40);
        },
      });
    }

    // ------------------------------------------------------------ build
    win = WM.open({
      title: "untitled - Paint",
      icon: "paint",
      pinId: "paint",
      width: 820,
      height: 600,
      minWidth: 520,
      minHeight: 360,
      build(body, w) {
        const app = U.el("div", { class: "paint-app" });

        const main = U.el("div", { class: "paint-main" });
        toolBox = U.el("div", { class: "paint-toolbox" });
        const tools = U.el("div", { class: "paint-tools" });
        TOOLS.forEach(([id, label]) => {
          const button = U.el("button", {
            type: "button",
            class: "paint-tool",
            title: label,
            html: TOOL_ICON[id],
            dataset: { tool: id },
          });
          button.addEventListener("click", () => setTool(id));
          toolButtons[id] = button;
          tools.append(button);
        });
        const options = U.el("div", { class: "paint-options" });
        [1, 2, 3, 4, 5].forEach((width) => {
          const button = U.el("button", {
            type: "button",
            class: "paint-option" + (width === 1 ? " active" : ""),
            title: width + " pixel line",
            dataset: { size: String(width) },
          });
          button.append(U.el("span", {
            class: "paint-option-bar",
            style: { height: width + "px" },
          }));
          button.addEventListener("click", () => {
            size = width;
            options.querySelectorAll(".paint-option").forEach((node) => {
              node.classList.toggle("active", node === button);
            });
          });
          options.append(button);
        });
        toolBox.append(tools, options);

        wrap = U.el("div", { class: "paint-canvas-wrap" });
        host = U.el("div", { class: "paint-canvas-host" });
        canvas = document.createElement("canvas");
        canvas.className = "paint-canvas";
        overlay = document.createElement("canvas");
        overlay.className = "paint-overlay";
        host.append(canvas, overlay);
        wrap.append(host);
        main.append(toolBox, wrap);

        colorBox = U.el("div", { class: "paint-colors" });
        const current = U.el("div", { class: "paint-current", title: "Foreground / background colours" });
        fgChip = U.el("div", { class: "paint-chip fg" });
        bgChip = U.el("div", { class: "paint-chip bg" });
        current.append(bgChip, fgChip);
        const swatches = U.el("div", { class: "paint-swatches" });
        PALETTE.forEach((row) => {
          row.forEach((color) => {
            const swatch = U.el("div", {
              class: "paint-swatch",
              title: color,
              style: { background: color },
            });
            swatch.addEventListener("mousedown", (event) => {
              event.preventDefault();
              if (event.button === 2) setBg(color); else setFg(color);
            });
            swatch.addEventListener("contextmenu", (event) => event.preventDefault());
            swatches.append(swatch);
          });
        });
        colorBox.append(current, swatches);

        statusBar = U.el("div", { class: "statusbar paint-status" });
        statusHint = U.el("div", { class: "status-panel grow", text: TOOL_HINT.pencil });
        statusPos = U.el("div", { class: "status-panel", text: "0,0" });
        statusSize = U.el("div", { class: "status-panel", text: "640 x 480" });
        statusBar.append(statusHint, statusPos, statusSize);

        app.append(main, colorBox, statusBar);
        body.append(app);

        setDocSize(640, 480, true);
        setFg("#000000");
        setBg("#ffffff");
        setTool("pencil");
        updateTitle();

        canvas.addEventListener("pointerdown", onPointerDown);
        canvas.addEventListener("pointermove", onPointerMove);
        canvas.addEventListener("pointerup", onPointerUp);
        canvas.addEventListener("pointercancel", onPointerUp);
        canvas.addEventListener("contextmenu", (event) => event.preventDefault());
        host.addEventListener("contextmenu", (event) => event.preventDefault());
        overlay.addEventListener("contextmenu", (event) => event.preventDefault());
        canvas.addEventListener("dblclick", (event) => {
          if (tool === "polygon" && polygon) { event.preventDefault(); finishPolygon(); }
        });

        antTimer = setInterval(() => {
          if (selection || floating) { ants = (ants + 1) % 8; drawOverlay(); }
        }, 120);

        buildMenus(w);

        w.onKey = (event) => {
          const tag = (document.activeElement && document.activeElement.tagName) || "";
          if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
          const key = event.key.toLowerCase();
          if (event.ctrlKey && key === "z") { event.preventDefault(); undo(); }
          else if (event.ctrlKey && (key === "y")) { event.preventDefault(); redo(); }
          else if (event.ctrlKey && key === "s") { event.preventDefault(); save(); }
          else if (event.ctrlKey && key === "o") { event.preventDefault(); openFile(); }
          else if (event.ctrlKey && key === "n" && !event.shiftKey) { event.preventDefault(); newPicture(); }
          else if (event.ctrlKey && key === "a") { event.preventDefault(); selectAll(); }
          else if (event.ctrlKey && key === "c") { event.preventDefault(); copySelection(); }
          else if (event.ctrlKey && key === "x") { event.preventDefault(); cutSelection(); }
          else if (event.ctrlKey && key === "v") { event.preventDefault(); pasteClipboard(); }
          else if (event.ctrlKey && key === "i") { event.preventDefault(); invertColors(); }
          else if (event.ctrlKey && key === "r") { event.preventDefault(); flipRotateDialog(); }
          else if (event.ctrlKey && key === "w") { event.preventDefault(); stretchSkewDialog(); }
          else if (event.ctrlKey && key === "e") { event.preventDefault(); attributes(); }
          else if (key === "delete") { event.preventDefault(); deleteSelection(); }
          else if (key === "escape") { event.preventDefault(); cancelSelection(); }
        };
      },
      onClose() {
        if (antTimer) { clearInterval(antTimer); antTimer = null; }
        stopAirbrush();
      },
    });

    win.opts.__close = win.close.bind(win);
    win.close = function () { requestClose(); };
    win.openPath = loadPicture;
    if (startPath) loadPicture(startPath);
    return win;
  };
})();
