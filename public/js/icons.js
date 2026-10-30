/* Win95 NAS - icon set dispatcher.
 *
 * Three icon sets register themselves as window.IconSets.<id> before this file
 * runs: classic (original SVG art), v2 (pixel-art SVG) and win95 (authentic
 * Windows 95 bitmaps). This file owns the public window.Icons API and picks
 * whichever set the desktop.iconStyle setting asks for.
 *
 * Names a set does not provide fall back to V2, so Office/Docker/Tailscale/VLC
 * and the toolbar arrows still render in the Classic and Win95 sets. Docker and
 * Tailscale always use the Classic artwork (see ALWAYS_CLASSIC).
 */
(function () {
  "use strict";

  const KEY = "nas.iconStyle";
  const DEFAULT = "v2";

  const STYLES = [
    { id: "classic", label: "Classic", note: "The original hand-drawn icons" },
    { id: "v2", label: "V2", note: "The current pixel-art icons" },
    { id: "win95", label: "Windows 95", note: "The real Windows 95 icons" },
  ];

  const sets = window.IconSets || {};

  // Names that always keep the original hand-drawn Classic artwork, whichever
  // set is active: Windows 95 never had a Docker or Tailscale icon, and these
  // two read better as the Classic drawings than as pixel art.
  const ALWAYS_CLASSIC = ["docker", "tailscale"];

  function normalize(id) {
    return sets[id] ? id : DEFAULT;
  }

  let style = DEFAULT;
  try { style = normalize(localStorage.getItem(KEY) || DEFAULT); } catch (_e) { style = DEFAULT; }

  function setStyle(id, opts) {
    style = normalize(id);
    const root = document.documentElement;
    if (root) root.setAttribute("data-icon-style", style);
    if (!opts || opts.persist !== false) {
      try { localStorage.setItem(KEY, style); } catch (_e) { /* private mode */ }
    }
    return style;
  }

  setStyle(style, { persist: false });

  function get(name, size) {
    const classic = sets.classic;
    if (ALWAYS_CLASSIC.indexOf(name) !== -1 && classic && classic.has(name)) {
      return classic.get(name, size);
    }
    const primary = sets[style];
    if (primary && primary.has(name)) return primary.get(name, size);
    const v2 = sets.v2;
    if (v2 && v2.has(name)) return v2.get(name, size);
    if (primary && primary.get) return primary.get("file", size);
    return "";
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

  function has(name) {
    const primary = sets[style];
    if (primary && primary.has(name)) return true;
    return Object.keys(sets).some((id) => sets[id] && sets[id].has && sets[id].has(name));
  }

  function names() {
    const out = new Set();
    Object.keys(sets).forEach((id) => {
      const set = sets[id];
      if (!set || !set.names) return;
      set.names().forEach((name) => out.add(name));
    });
    return Array.from(out).sort();
  }

  const Icons = {
    get,
    forEntry,
    has,
    names,
    setStyle,
    style: () => style,
    styles: () => STYLES.map((s) => ({ ...s })),
  };

  // Read live so a style switch is reflected without re-reading the API.
  // The logo is always shown large (About, logon and shut-down dialogs), so ask
  // for a 64 px bitmap; the CSS sizes it down from there.
  Object.defineProperty(Icons, "flag", { get: () => get("flag"), enumerable: true });
  Object.defineProperty(Icons, "windowsLogo", { get: () => get("windowsLogo", 64), enumerable: true });

  window.Icons = Icons;
})();
