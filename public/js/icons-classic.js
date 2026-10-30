/* Win95 NAS - Classic icon set: the original hand-drawn SVG icons.
 *
 * These are the icons the NAS shipped with before the V2 pixel-art rewrite.
 * Registers itself as window.IconSets.classic; /js/icons.js picks the active set.
 */
(function () {
  "use strict";

  const rect = (x, y, w, h, fill, extra = "") =>
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" ${extra}/>`;
  const path = (d, fill, extra = "") => `<path d="${d}" fill="${fill}" ${extra}/>`;
  const line = (x1, y1, x2, y2, stroke, width = 1) =>
    `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${width}"/>`;
  const svg = (body) =>
    `<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges">${body}</svg>`;

  const ICONS = {};

  ICONS.computer = svg(
    rect(2, 2, 28, 21, "#000") +
    rect(3, 3, 26, 19, "#c0c0c0") +
    rect(3, 3, 26, 2, "#dfdfdf") +
    rect(5, 6, 22, 13, "#000") +
    rect(6, 7, 20, 11, "#008080") +
    rect(6, 7, 20, 2, "#00a8a8") +
    rect(7, 9, 5, 1, "#40d0d0") +
    rect(11, 23, 10, 3, "#808080") +
    rect(8, 26, 16, 3, "#000") +
    rect(9, 26, 14, 2, "#c0c0c0") +
    rect(24, 20, 2, 2, "#00d000")
  );

  ICONS.folder = svg(
    path("M3 6h9l3 3h14v18H3z", "#e0b048", 'stroke="#000" stroke-width="1"') +
    path("M3 11h26v16H3z", "#ffd75e", 'stroke="#000" stroke-width="1"') +
    rect(4, 12, 24, 2, "#fff0a8") +
    rect(4, 25, 24, 1, "#d8a838")
  );

  ICONS["folder-open"] = svg(
    path("M3 6h9l3 3h13v5H3z", "#c89838", 'stroke="#000"') +
    path("M2 12h27l-4 17H6z", "#ffd75e", 'stroke="#000"') +
    rect(7, 14, 19, 2, "#fff0a8") +
    rect(5, 12, 24, 1, "#ffe98a")
  );

  ICONS.file = svg(
    path("M7 2h12l6 6v22H7z", "#ffffff", 'stroke="#000"') +
    path("M19 2v6h6", "#dfdfdf", 'stroke="#000"') +
    path("M19 2l6 6h-6z", "#f0f0f0", 'stroke="#000"') +
    rect(10, 14, 12, 1, "#a0a0a0") +
    rect(10, 17, 12, 1, "#a0a0a0") +
    rect(10, 20, 8, 1, "#a0a0a0")
  );

  ICONS.text = svg(
    path("M7 2h12l6 6v22H7z", "#ffffff", 'stroke="#000"') +
    path("M19 2v6h6", "#dfdfdf", 'stroke="#000"') +
    path("M19 2l6 6h-6z", "#f0f0f0", 'stroke="#000"') +
    rect(10, 12, 12, 1, "#000080") +
    rect(10, 15, 12, 1, "#000080") +
    rect(10, 18, 12, 1, "#000080") +
    rect(10, 21, 12, 1, "#000080") +
    rect(10, 24, 7, 1, "#000080")
  );

  ICONS.image = svg(
    path("M7 2h12l6 6v22H7z", "#ffffff", 'stroke="#000"') +
    path("M19 2v6h6", "#dfdfdf", 'stroke="#000"') +
    rect(9, 12, 14, 12, "#bfe8ff", 'stroke="#000"') +
    path("M9 22l4-6 3 4 2-2 5 6z", "#2a9d3a") +
    rect(18, 14, 3, 3, "#ffd000", 'stroke="#c09000"')
  );

  ICONS.audio = svg(
    path("M7 2h12l6 6v22H7z", "#ffffff", 'stroke="#000"') +
    path("M19 2v6h6", "#dfdfdf", 'stroke="#000"') +
    path("M13 22V13l7-2v9", "none", 'stroke="#000080" stroke-width="2"') +
    rect(10, 21, 4, 3, "#000080") +
    rect(17, 19, 4, 3, "#000080")
  );

  ICONS.video = svg(
    path("M7 2h12l6 6v22H7z", "#ffffff", 'stroke="#000"') +
    path("M19 2v6h6", "#dfdfdf", 'stroke="#000"') +
    rect(9, 12, 14, 11, "#000080") +
    path("M14 15l5 3-5 3z", "#ffffff")
  );

  ICONS.pdf = svg(
    path("M7 2h12l6 6v22H7z", "#ffffff", 'stroke="#000"') +
    path("M19 2v6h6", "#dfdfdf", 'stroke="#000"') +
    rect(8, 14, 16, 8, "#d02020") +
    `<text x="16" y="21" font-family="Arial" font-size="7" font-weight="bold" text-anchor="middle" fill="#fff">PDF</text>`
  );

  ICONS.code = svg(
    path("M7 2h12l6 6v22H7z", "#ffffff", 'stroke="#000"') +
    path("M19 2v6h6", "#dfdfdf", 'stroke="#000"') +
    `<text x="16" y="22" font-family="Consolas,monospace" font-size="8" font-weight="bold" text-anchor="middle" fill="#000080">&lt;/&gt;</text>`
  );

  ICONS.archive = svg(
    path("M7 2h12l6 6v22H7z", "#ffffff", 'stroke="#000"') +
    path("M19 2v6h6", "#dfdfdf", 'stroke="#000"') +
    rect(13, 8, 4, 2, "#808080") + rect(13, 11, 4, 2, "#808080") +
    rect(13, 14, 4, 2, "#808080") + rect(13, 17, 4, 2, "#808080") +
    rect(13, 20, 4, 4, "#c0a020", 'stroke="#000"')
  );

  ICONS.exe = svg(
    path("M7 2h12l6 6v22H7z", "#ffffff", 'stroke="#000"') +
    path("M19 2v6h6", "#dfdfdf", 'stroke="#000"') +
    rect(9, 12, 14, 12, "#c0c0c0", 'stroke="#000"') +
    rect(9, 12, 14, 2, "#dfdfdf") +
    rect(11, 16, 4, 4, "#000080") +
    rect(17, 16, 4, 2, "#808080")
  );

  ICONS.settings = svg(
    `<g fill="#808080" stroke="#000">` +
    rect(13, 2, 6, 6, "#808080", 'stroke="#000"') +
    rect(13, 24, 6, 6, "#808080", 'stroke="#000"') +
    rect(2, 13, 6, 6, "#808080", 'stroke="#000"') +
    rect(24, 13, 6, 6, "#808080", 'stroke="#000"') +
    `</g>` +
    `<g transform="rotate(45 16 16)">` +
    rect(13, 1, 6, 5, "#808080", 'stroke="#000"') +
    rect(13, 26, 6, 5, "#808080", 'stroke="#000"') +
    rect(1, 13, 5, 6, "#808080", 'stroke="#000"') +
    rect(26, 13, 5, 6, "#808080", 'stroke="#000"') +
    `</g>` +
    `<circle cx="16" cy="16" r="9" fill="#c0c0c0" stroke="#000"/>` +
    `<circle cx="16" cy="16" r="6" fill="#dfdfdf" stroke="#808080"/>` +
    `<circle cx="16" cy="16" r="3" fill="#000080"/>`
  );

  ICONS.docker = svg(
    path("M9 9q1-5 6-4 1 3 0 4", "none", 'stroke="#4aa3ff" stroke-width="2" fill="none"') +
    path("M2 18q0 8 9 8h10q8 0 9-8z", "#1d63ed", 'stroke="#0a2f80"') +
    path("M27 19l4-4v8z", "#1d63ed", 'stroke="#0a2f80"') +
    rect(8, 13, 4, 4, "#8fd0ff", 'stroke="#0a3a8c"') +
    rect(13, 13, 4, 4, "#8fd0ff", 'stroke="#0a3a8c"') +
    rect(18, 13, 4, 4, "#8fd0ff", 'stroke="#0a3a8c"') +
    rect(11, 8, 4, 4, "#8fd0ff", 'stroke="#0a3a8c"') +
    `<circle cx="26" cy="20" r="2" fill="#fff"/><circle cx="26" cy="20" r="1" fill="#000"/>` +
    path("M4 24q7 3 22 0", "none", 'stroke="#0a2f80" stroke-width="1"')
  );

  ICONS.tailscale = svg(
    rect(2, 2, 28, 28, "#0b1220", 'stroke="#000"') +
    `<g fill="#ffffff">` +
    `<circle cx="9" cy="9" r="2.6"/><circle cx="16" cy="9" r="2.6"/><circle cx="23" cy="9" r="2.6"/>` +
    `<circle cx="9" cy="16" r="2.6"/><circle cx="16" cy="16" r="3.4"/>` +
    `<circle cx="9" cy="23" r="2.6"/><circle cx="16" cy="23" r="2.6"/><circle cx="23" cy="23" r="2.6"/>` +
    `</g>` +
    `<circle cx="23" cy="16" r="2.6" fill="#5ad1ff"/>` +
    path("M9 9l14 14M23 9L9 23M9 16h14", "none", 'stroke="#5ad1ff" stroke-width="1" stroke-opacity=".55"')
  );

  ICONS.cmd = svg(
    rect(2, 4, 28, 23, "#000", 'stroke="#000"') +
    rect(2, 4, 28, 3, "#000080") +
    rect(4, 8, 24, 17, "#000") +
    `<text x="5" y="16" font-family="Consolas,monospace" font-size="7" fill="#c0c0c0">C:\\&gt;</text>` +
    rect(14, 14, 5, 2, "#c0c0c0") +
    `<text x="5" y="23" font-family="Consolas,monospace" font-size="6" fill="#808080">dir</text>` +
    rect(11, 24, 10, 3, "#808080") +
    rect(8, 27, 16, 2, "#c0c0c0")
  );

  ICONS.notepad = svg(
    rect(6, 3, 20, 27, "#000") +
    rect(7, 4, 18, 25, "#ffffff") +
    rect(8, 2, 2, 5, "#808080") + rect(12, 2, 2, 5, "#808080") +
    rect(16, 2, 2, 5, "#808080") + rect(20, 2, 2, 5, "#808080") +
    rect(9, 10, 14, 1, "#a0a0a0") + rect(9, 13, 14, 1, "#a0a0a0") +
    rect(9, 16, 14, 1, "#a0a0a0") + rect(9, 19, 9, 1, "#a0a0a0") +
    `<g transform="rotate(45 22 23)">` +
    rect(20, 17, 4, 12, "#e0c000", 'stroke="#000"') +
    path("M20 29h4l-2 2z", "#f0d8a0", 'stroke="#000"') +
    rect(20, 17, 4, 2, "#d08080", 'stroke="#000"') +
    `</g>`
  );

  ICONS.mine = svg(
    rect(2, 2, 28, 28, "#c0c0c0", 'stroke="#000"') +
    rect(2, 2, 28, 2, "#dfdfdf") +
    rect(2, 28, 28, 2, "#808080") +
    `<circle cx="16" cy="17" r="7" fill="#000"/>` +
    rect(15, 7, 2, 20, "#000") +
    rect(6, 16, 20, 2, "#000") +
    `<g transform="rotate(45 16 17)">` + rect(15, 7, 2, 20, "#000") + rect(6, 16, 20, 2, "#000") + `</g>` +
    rect(12, 12, 3, 3, "#fff") +
    rect(19, 10, 2, 2, "#ff2020")
  );

  ICONS.recycle = svg(
    path("M8 9h16l-2 21H10z", "#c0c0c0", 'stroke="#000"') +
    rect(6, 6, 20, 4, "#dfdfdf", 'stroke="#000"') +
    rect(12, 3, 8, 3, "#808080", 'stroke="#000"') +
    rect(11, 12, 2, 14, "#808080") + rect(16, 12, 2, 14, "#808080") + rect(21, 12, 2, 14, "#808080") +
    path("M13 17l4-2 2 4z", "#008000") +
    path("M21 21l-4 2-2-4z", "#008000") +
    path("M14 24l-3-4 4-1z", "#008000")
  );

  ICONS.network = svg(
    rect(2, 5, 12, 9, "#000") + rect(3, 6, 10, 7, "#c0c0c0") +
    rect(4, 7, 8, 5, "#008080") +
    rect(18, 5, 12, 9, "#000") + rect(19, 6, 10, 7, "#c0c0c0") +
    rect(20, 7, 8, 5, "#008080") +
    rect(7, 14, 2, 4, "#808080") + rect(23, 14, 2, 4, "#808080") +
    rect(4, 18, 24, 2, "#000080") +
    rect(4, 20, 2, 5, "#808080") + rect(26, 20, 2, 5, "#808080") +
    rect(3, 25, 4, 2, "#000") + rect(25, 25, 4, 2, "#000")
  );

  ICONS.drive = svg(
    rect(2, 9, 28, 15, "#000") +
    rect(3, 10, 26, 13, "#c0c0c0") +
    rect(3, 10, 26, 2, "#dfdfdf") +
    rect(3, 21, 26, 2, "#808080") +
    rect(6, 15, 17, 4, "#808080", 'stroke="#000"') +
    rect(25, 15, 2, 2, "#00d000") +
    rect(6, 12, 12, 1, "#fff")
  );

  ICONS.floppy = svg(
    rect(3, 3, 26, 26, "#000") +
    rect(4, 4, 24, 24, "#202020") +
    rect(8, 4, 14, 10, "#c0c0c0") +
    rect(16, 4, 4, 10, "#808080") +
    rect(7, 17, 18, 11, "#dfdfdf") +
    rect(9, 19, 14, 1, "#808080") + rect(9, 21, 14, 1, "#808080") +
    rect(9, 23, 14, 1, "#808080") +
    rect(22, 6, 2, 4, "#404040")
  );

  ICONS.shutdown = svg(
    rect(2, 3, 28, 21, "#000") +
    rect(3, 4, 26, 19, "#c0c0c0") +
    rect(3, 4, 26, 2, "#dfdfdf") +
    rect(5, 7, 22, 13, "#000080") +
    path("M20 9a5 5 0 1 0 4 7 5 5 0 0 1-4-7z", "#ffe060") +
    `<text x="11" y="17" font-family="Arial" font-size="7" fill="#fff" font-weight="bold">z</text>` +
    `<text x="14" y="13" font-family="Arial" font-size="5" fill="#fff" font-weight="bold">z</text>` +
    rect(11, 23, 10, 3, "#808080") +
    rect(8, 26, 16, 3, "#c0c0c0", 'stroke="#000"')
  );

  ICONS.user = svg(
    `<circle cx="16" cy="10" r="6" fill="#e8c860" stroke="#000" stroke-width="1.5"/>` +
    path("M4 29c0-7 5-11 12-11s12 4 12 11z", "#4a7fb5", 'stroke="#000" stroke-width="1.5"') +
    rect(11, 20, 10, 2, "#7fb0e8") +
    rect(12, 6, 3, 2, "#fff8c0")
  );

  ICONS.keys = svg(
    `<circle cx="10" cy="10" r="6" fill="none" stroke="#000" stroke-width="4"/>` +
    `<circle cx="10" cy="10" r="6" fill="none" stroke="#e8c860" stroke-width="2"/>` +
    `<circle cx="10" cy="10" r="2.5" fill="#008080"/>` +
    line(14, 14, 27, 27, "#000", 4) +
    line(14, 14, 27, 27, "#e8c860", 2) +
    line(21, 21, 25, 17, "#000", 4) +
    line(21, 21, 25, 17, "#e8c860", 2) +
    line(25, 25, 29, 21, "#000", 4) +
    line(25, 25, 29, 21, "#e8c860", 2) +
    rect(6, 8, 3, 1, "#fff8c0")
  );

  ICONS.help = svg(
    rect(4, 3, 24, 26, "#000") +
    rect(5, 4, 22, 24, "#ffff80") +
    rect(5, 4, 3, 24, "#d0d040") +
    `<text x="17" y="23" font-family="Arial" font-size="17" font-weight="bold" text-anchor="middle" fill="#000080">?</text>` +
    rect(9, 8, 14, 1, "#c8c860")
  );

  ICONS.clock = svg(
    `<circle cx="16" cy="17" r="12" fill="#000"/>` +
    `<circle cx="16" cy="17" r="11" fill="#e8e8e8"/>` +
    `<circle cx="16" cy="17" r="11" fill="none" stroke="#808080"/>` +
    rect(15, 7, 2, 2, "#000") + rect(15, 25, 2, 2, "#000") +
    rect(6, 16, 2, 2, "#000") + rect(24, 16, 2, 2, "#000") +
    rect(15, 10, 2, 8, "#000") +
    rect(16, 16, 6, 2, "#000") +
    `<circle cx="16" cy="17" r="1.6" fill="#c00000"/>` +
    rect(11, 1, 10, 3, "#808080") +
    rect(15, 3, 2, 2, "#404040")
  );

  ICONS.msdos = svg(
    rect(2, 4, 28, 23, "#000", 'stroke="#808080"') +
    rect(2, 4, 28, 2, "#c0c0c0") +
    `<text x="5" y="15" font-family="Consolas,monospace" font-size="7" fill="#fff">C:\\&gt;</text>` +
    rect(6, 19, 7, 2, "#fff") +
    rect(11, 24, 10, 3, "#808080") +
    rect(8, 27, 16, 2, "#c0c0c0")
  );

  ICONS.find = svg(
    path("M3 6h9l3 3h14v18H3z", "#e0b048", 'stroke="#000"') +
    path("M3 11h26v16H3z", "#ffd75e", 'stroke="#000"') +
    `<circle cx="21" cy="17" r="6" fill="#bfe8ff" fill-opacity=".75" stroke="#000" stroke-width="2"/>` +
    rect(25, 21, 2, 7, "#000", 'transform="rotate(-45 26 24)"')
  );

  ICONS.run = svg(
    rect(2, 5, 28, 21, "#000") +
    rect(3, 6, 26, 19, "#c0c0c0") +
    rect(3, 6, 26, 3, "#000080") +
    rect(4, 11, 24, 12, "#fff", 'stroke="#808080"') +
    `<text x="6" y="21" font-family="Consolas,monospace" font-size="8" fill="#000">C:\\&gt;</text>` +
    path("M18 16l6 3-6 3z", "#008000")
  );

  ICONS.display = svg(
    rect(2, 3, 28, 20, "#000") +
    rect(3, 4, 26, 18, "#c0c0c0") +
    rect(5, 6, 22, 13, "#008080") +
    path("M5 19l7-9 4 5 3-3 8 7z", "#20a060") +
    rect(10, 23, 12, 3, "#808080") +
    rect(8, 26, 16, 3, "#c0c0c0", 'stroke="#000"')
  );

  ICONS.sound = svg(
    path("M4 12h5l6-5v18l-6-5H4z", "#c0c0c0", 'stroke="#000"') +
    path("M18 11q3 5 0 10", "none", 'stroke="#000" stroke-width="2"') +
    path("M22 8q6 8 0 16", "none", 'stroke="#000" stroke-width="2"')
  );

  ICONS.mute = svg(
    path("M4 12h5l6-5v18l-6-5H4z", "#c0c0c0", 'stroke="#000"') +
    path("M19 12l8 8M27 12l-8 8", "none", 'stroke="#c00000" stroke-width="2"')
  );

  ICONS.warning = svg(
    path("M16 3L30 28H2z", "#ffff00", 'stroke="#000"') +
    path("M16 5L28 27H4z", "none", 'stroke="#808000"') +
    `<text x="16" y="25" font-family="Arial" font-size="16" font-weight="bold" text-anchor="middle" fill="#000">!</text>`
  );

  ICONS.error = svg(
    `<circle cx="16" cy="16" r="14" fill="#d00000" stroke="#000"/>` +
    `<circle cx="16" cy="16" r="12" fill="#ff2020"/>` +
    path("M10 10l12 12M22 10L10 22", "none", 'stroke="#fff" stroke-width="3"')
  );

  ICONS.info = svg(
    `<circle cx="16" cy="16" r="14" fill="#000080" stroke="#000"/>` +
    `<circle cx="16" cy="16" r="12" fill="#2050d0"/>` +
    rect(14, 13, 4, 11, "#fff") +
    rect(14, 7, 4, 4, "#fff")
  );

  ICONS.question = svg(
    `<circle cx="16" cy="16" r="14" fill="#000080" stroke="#000"/>` +
    `<circle cx="16" cy="16" r="12" fill="#2050d0"/>` +
    `<text x="16" y="23" font-family="Arial" font-size="16" font-weight="bold" text-anchor="middle" fill="#fff">?</text>`
  );

  ICONS.volume = svg(
    rect(3, 8, 26, 18, "#c0c0c0", 'stroke="#000"') +
    rect(3, 8, 26, 2, "#dfdfdf") +
    rect(6, 12, 20, 8, "#000080") +
    rect(7, 13, 8, 6, "#1084d0") +
    rect(17, 13, 8, 2, "#fff") +
    rect(17, 16, 8, 1, "#808080")
  );

  ICONS.shield = svg(
    path("M16 2l12 4v10c0 8-6 12-12 14C10 28 4 24 4 16V6z", "#c0c0c0", 'stroke="#000"') +
    path("M16 4l10 3v9c0 6-5 10-10 12C11 26 6 22 6 16V7z", "#000080") +
    path("M11 16l4 4 7-8", "none", 'stroke="#40ff40" stroke-width="3"')
  );

  ICONS.folderUp = svg(
    path("M3 6h9l3 3h14v18H3z", "#e0b048", 'stroke="#000"') +
    path("M3 11h26v16H3z", "#ffd75e", 'stroke="#000"') +
    path("M16 14l6 7h-4v5h-4v-5h-4z", "#000080", 'stroke="#000"')
  );

  ICONS.refresh = svg(
    path("M25 16a9 9 0 1 1-3-7", "none", 'stroke="#008000" stroke-width="3"') +
    path("M23 4v7h-7", "none", 'stroke="#008000" stroke-width="3"')
  );

  ICONS.up = svg(
    path("M16 4l10 11h-6v13h-8V15H6z", "#008000", 'stroke="#000"')
  );

  ICONS.back = svg(
    path("M14 5L3 16l11 11v-7h14v-8H14z", "#008000", 'stroke="#000"')
  );

  ICONS.forward = svg(
    path("M18 5l11 11-11 11v-7H4v-8h14z", "#008000", 'stroke="#000"')
  );

  ICONS.download = svg(
    path("M13 3h6v12h6l-9 10-9-10h6z", "#000080", 'stroke="#000"') +
    rect(4, 26, 24, 3, "#c0c0c0", 'stroke="#000"')
  );

  ICONS.upload = svg(
    path("M16 2l9 10h-6v11h-6V12H7z", "#000080", 'stroke="#000"') +
    rect(4, 26, 24, 3, "#c0c0c0", 'stroke="#000"')
  );

  ICONS.newfolder = svg(
    path("M3 6h9l3 3h14v18H3z", "#e0b048", 'stroke="#000"') +
    path("M3 11h26v16H3z", "#ffd75e", 'stroke="#000"') +
    path("M14 14h4v4h4v4h-4v4h-4v-4H10v-4h4z", "#008000", 'stroke="#000"')
  );

  ICONS.search = svg(
    `<circle cx="13" cy="13" r="8" fill="#bfe8ff" fill-opacity=".8" stroke="#000" stroke-width="2"/>` +
    rect(19, 21, 3, 9, "#000", 'transform="rotate(-45 20 25)"')
  );

  ICONS.cut = svg(
    `<circle cx="8" cy="25" r="4" fill="none" stroke="#000" stroke-width="2"/>` +
    `<circle cx="24" cy="25" r="4" fill="none" stroke="#000" stroke-width="2"/>` +
    path("M11 22L24 4M21 22L8 4", "none", 'stroke="#808080" stroke-width="2"')
  );

  ICONS.copy = svg(
    rect(6, 3, 16, 20, "#fff", 'stroke="#000"') +
    rect(10, 8, 16, 20, "#dfdfdf", 'stroke="#000"') +
    rect(13, 12, 10, 1, "#808080") + rect(13, 15, 10, 1, "#808080")
  );

  ICONS.paste = svg(
    path("M6 6h20v24H6z", "#c0a020", 'stroke="#000"') +
    rect(9, 2, 14, 7, "#dfdfdf", 'stroke="#000"') +
    rect(10, 12, 12, 12, "#fff", 'stroke="#000"')
  );

  ICONS.trash = svg(
    path("M8 9h16l-2 21H10z", "#c0c0c0", 'stroke="#000"') +
    rect(6, 6, 20, 4, "#dfdfdf", 'stroke="#000"') +
    rect(12, 3, 8, 3, "#808080", 'stroke="#000"') +
    path("M13 14l6 10M19 14l-6 10", "none", 'stroke="#c00000" stroke-width="2"')
  );

  ICONS.power = svg(
    `<circle cx="16" cy="16" r="13" fill="none" stroke="#c00000" stroke-width="3"/>` +
    rect(14, 3, 4, 12, "#c00000") +
    path("M7 9a12 12 0 1 0 18 0", "none", 'stroke="#c00000" stroke-width="3"')
  );

  ICONS.wallpaper = svg(
    rect(2, 4, 28, 22, "#808080", 'stroke="#000"') +
    rect(4, 6, 24, 16, "#008080") +
    path("M4 20l7-8 4 4 3-3 10 9z", "#40c080") +
    `<circle cx="22" cy="10" r="2" fill="#ffe060"/>` +
    rect(10, 26, 12, 3, "#c0c0c0", 'stroke="#000"')
  );

  ICONS.monitor = svg(
    rect(2, 3, 28, 20, "#000") + rect(3, 4, 26, 18, "#c0c0c0") +
    rect(5, 6, 22, 13, "#008080") + rect(11, 23, 10, 3, "#808080") +
    rect(8, 26, 16, 3, "#c0c0c0", 'stroke="#000"')
  );

  ICONS.key = svg(
    `<circle cx="11" cy="12" r="7" fill="none" stroke="#c0a000" stroke-width="4"/>` +
    path("M16 17l11 11M23 24l3-3M26 27l3-3", "none", 'stroke="#c0a000" stroke-width="4"')
  );

  ICONS.chip = svg(
    rect(6, 6, 20, 20, "#202020", 'stroke="#000"') +
    rect(9, 9, 14, 14, "#808080", 'stroke="#000"') +
    rect(12, 12, 8, 8, "#c0c0c0") +
    rect(2, 10, 4, 2, "#c0a000") + rect(2, 16, 4, 2, "#c0a000") + rect(2, 22, 4, 2, "#c0a000") +
    rect(26, 10, 4, 2, "#c0a000") + rect(26, 16, 4, 2, "#c0a000") + rect(26, 22, 4, 2, "#c0a000") +
    rect(10, 2, 2, 4, "#c0a000") + rect(16, 2, 2, 4, "#c0a000") + rect(22, 2, 2, 4, "#c0a000") +
    rect(10, 26, 2, 4, "#c0a000") + rect(16, 26, 2, 4, "#c0a000") + rect(22, 26, 2, 4, "#c0a000")
  );

  ICONS.flag = `<svg viewBox="0 0 32 30" xmlns="http://www.w3.org/2000/svg">
    <path d="M1 5q7-4 14 0v8q-7-4-14 0z" fill="#ff3b30"/>
    <path d="M16 5q7-4 14 0v8q-7-4-14 0z" fill="#4cd964"/>
    <path d="M1 14q7-4 14 0v8q-7-4-14 0z" fill="#2f7bff"/>
    <path d="M16 14q7-4 14 0v8q-7-4-14 0z" fill="#ffd60a"/>
  </svg>`;

  ICONS.windowsLogo = `<svg viewBox="0 0 64 60" xmlns="http://www.w3.org/2000/svg">
    <path d="M2 10Q16 3 30 10v16Q16 19 2 26z" fill="#ff3b30"/>
    <path d="M32 10Q46 3 60 10v16Q46 19 32 26z" fill="#4cd964"/>
    <path d="M2 29Q16 22 30 29v16Q16 38 2 45z" fill="#2f7bff"/>
    <path d="M32 29Q46 22 60 29v16Q46 38 32 45z" fill="#ffd60a"/>
  </svg>`;

  const BY_KIND = {
    folder: "folder",
    image: "image",
    text: "text",
    audio: "audio",
    video: "video",
    archive: "archive",
    pdf: "pdf",
    doc: "file",
    code: "code",
    exe: "exe",
    file: "file",
  };

  const cache = new Map();

  function get(name, size) {
    const key = name + "@" + (size || 0);
    if (cache.has(key)) return cache.get(key);
    let markup = ICONS[name] || ICONS.file;
    if (size) {
      markup = markup.replace("<svg ", `<svg width="${size}" height="${size}" `);
    }
    cache.set(key, markup);
    return markup;
  }

  function forEntry(entry) {
    if (!entry) return get("file");
    if (entry.type === "dir") return get("folder");
    return get(BY_KIND[entry.kind] || "file");
  }

  window.IconSets = window.IconSets || {};
  window.IconSets.classic = {
    get,
    forEntry,
    has: (name) => !!ICONS[name],
    names: () => Object.keys(ICONS),
  };
})();
