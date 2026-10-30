/* Win95 NAS - Windows 95 icon set.
 *
 * These are the real Windows 95 icons: the shell icons are extracted from the
 * original .ico resources at their native 16, 32 and 48 px sizes, and the
 * Windows flag is the authentic 1992-2001 logo rasterised at 16-128 px. All are
 * stored as transparent PNGs in /icons/win95. Names the set does not cover
 * (Office, Docker, Tailscale, VLC and the toolbar arrows) fall back to the V2
 * set in icons.js.
 *
 * Registers itself as window.IconSets.win95; /js/icons.js picks the active set.
 */
(function () {
  "use strict";

  const SIZES = {
    archive: [16, 32, 48],
    audio: [16, 32],
    chip: [16, 32],
    cmd: [16, 32],
    code: [16, 32],
    computer: [16, 32, 48],
    display: [16, 32, 48],
    drive: [16, 32, 48],
    error: [16, 32],
    exe: [16, 32],
    file: [16, 32, 48],
    find: [16, 32],
    flag: [16, 32, 48, 64, 96, 128],
    floppy: [16, 32, 48],
    folder: [16, 32, 48],
    folderUp: [16, 32, 48],
    help: [16, 32],
    image: [16, 32, 48],
    info: [16, 32],
    key: [16, 32],
    keys: [16, 32, 48],
    mine: [32],
    monitor: [16, 32],
    msdos: [16, 32],
    mute: [16, 32],
    network: [16, 32, 48],
    newfolder: [16, 32, 48],
    notepad: [16, 32, 48],
    pdf: [16, 32],
    power: [16, 32],
    question: [16, 32],
    recycle: [16, 32, 48],
    refresh: [16, 32],
    run: [16, 32],
    search: [16, 32],
    settings: [16, 32, 48],
    shield: [16, 32],
    shutdown: [16, 32],
    sound: [16, 32],
    text: [16, 32, 48],
    trash: [16, 32, 48],
    user: [16, 32, 48],
    video: [16, 32, 48],
    volume: [16, 32],
    wallpaper: [16, 32, 48],
    warning: [16, 32],
    windowsLogo: [16, 32, 48, 64, 96, 128],
  };

  const BASE = "/icons/win95/";

  // Pick the smallest stored bitmap that still covers the requested size.
  function sourceSize(name, size) {
    const avail = SIZES[name];
    for (let i = 0; i < avail.length; i += 1) {
      if (avail[i] >= size) return avail[i];
    }
    return avail[avail.length - 1];
  }

  const cache = new Map();

  function get(name, size) {
    const key = name + "@" + (size || 0);
    if (cache.has(key)) return cache.get(key);
    const target = size || 32;
    const src = sourceSize(name, target);
    // Nearest-neighbour only for whole-number upscales, smooth otherwise.
    const crisp = target !== src && target % src === 0;
    const markup =
      `<img class="ic-img" src="${BASE}${name}-${src}.png" width="${target}" height="${target}" alt="" draggable="false"` +
      (crisp ? ' style="image-rendering:pixelated"' : "") + ">";
    cache.set(key, markup);
    return markup;
  }

  window.IconSets = window.IconSets || {};
  window.IconSets.win95 = {
    get,
    has: (name) => !!SIZES[name],
    names: () => Object.keys(SIZES),
  };
})();
