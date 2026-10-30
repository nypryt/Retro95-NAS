/* Win95 NAS - real Command Prompt (talks to the NAS shell API) */
(function () {
  "use strict";

  const Apps = window.Apps || (window.Apps = {});
  const MAX_LINES = 3000;

  function promptFor(cwd) {
    const rel = (cwd || "/").replace(/\//g, "\\");
    return rel === "\\" ? "C:\\NAS>" : "C:\\NAS" + rel + ">";
  }

  Apps.commandPrompt = function commandPrompt(startCwd) {
    let cwd = startCwd && startCwd.charAt(0) === "/" ? startCwd : "/";
    let buffer = "";
    let busy = false;
    let lines = [];
    const history = [];
    let historyIndex = 0;

    const win = WM.open({
      title: "Command Prompt",
      icon: "cmd",
      pinId: "cmd",
      width: 660,
      height: 430,
      build(body, w) {
        const screen = U.el("pre", {
          class: "cmd-screen selectable",
          tabindex: "0",
          spellcheck: "false",
        });
        body.append(screen);

        function write(text) {
          String(text === undefined || text === null ? "" : text)
            .replace(/\r\n/g, "\n")
            .replace(/\r/g, "\n")
            .split("\n")
            .forEach((line) => lines.push(line));
          if (lines.length > MAX_LINES) lines = lines.slice(lines.length - MAX_LINES);
        }

        function paint() {
          screen.textContent = lines.join("\n") + (lines.length ? "\n" : "") + promptFor(cwd) + " " + buffer;
          screen.scrollTop = screen.scrollHeight;
        }

        function banner() {
          lines = [];
          write("Microsoft(R) Windows 95 NAS Command Prompt");
          write("   (C)Copyright Microsoft Corp 1981-1995. (Sort of.)");
          write("");
          write("Type HELP for the list of commands. All paths live inside this NAS.");
          write("");
        }

        async function handleAction(action) {
          if (!action) return;
          if (action.type === "close") {
            setTimeout(() => w.close(), 120);
          } else if (action.type === "docker") {
            setTimeout(() => { if (window.Docker) Docker.open(); }, 150);
          } else if (action.type === "tailscale") {
            setTimeout(() => { if (window.Tailscale) Tailscale.open(); }, 150);
          } else if (action.type === "start") {
            const target = action.target || "";
            setTimeout(() => {
              if (!target) return;
              if (window.Apps && Apps.execute) Apps.execute(target);
              else write("Windows cannot find \u201C" + target + "\u201D.");
              paint();
            }, 120);
          }
        }

        async function submit(raw) {
          write(promptFor(cwd) + " " + raw);
          if (raw.trim()) {
            history.push(raw);
            if (history.length > 200) history.shift();
          }
          historyIndex = history.length;
          busy = true;
          try {
            const result = await API.shell(raw, cwd);
            if (result.clear) {
              lines = [];
            } else {
              (result.output || []).forEach((line) => write(line));
              if (result.output && result.output.length) write("");
            }
            if (result.cwd) cwd = result.cwd;
            if (result.action) await handleAction(result.action);
          } catch (err) {
            write("Error: " + (err && err.message ? err.message : String(err)));
          }
          busy = false;
          paint();
        }

        screen.addEventListener("keydown", (event) => {
          if (busy) {
            event.preventDefault();
            return;
          }
          if (event.key === "Enter") {
            event.preventDefault();
            const line = buffer;
            buffer = "";
            submit(line);
          } else if (event.key === "Backspace") {
            event.preventDefault();
            buffer = buffer.slice(0, -1);
            paint();
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            if (history.length) {
              historyIndex = Math.max(0, historyIndex - 1);
              buffer = history[historyIndex] || "";
              paint();
            }
          } else if (event.key === "ArrowDown") {
            event.preventDefault();
            if (history.length) {
              historyIndex = Math.min(history.length, historyIndex + 1);
              buffer = historyIndex >= history.length ? "" : history[historyIndex];
              paint();
            }
          } else if (event.key === "Tab") {
            event.preventDefault();
            const partial = buffer.split(/\s+/).pop() || "";
            if (!partial) return;
            const slash = partial.lastIndexOf("/");
            const dir = slash >= 0 ? partial.slice(0, slash + 1) : "";
            const stem = slash >= 0 ? partial.slice(slash + 1) : partial;
            API.list(cwd).then((data) => {
              const match = (data.entries || []).find((entry) => entry.name.toLowerCase().startsWith(stem.toLowerCase()));
              if (match) {
                const completed = dir + match.name + (match.type === "dir" ? "/" : "");
                buffer = buffer.slice(0, buffer.length - partial.length) + completed;
                paint();
              }
            }).catch(() => {});
          } else if (event.ctrlKey && (event.key === "c" || event.key === "C")) {
            event.preventDefault();
            write(promptFor(cwd) + " " + buffer + "^C");
            buffer = "";
            paint();
          } else if (event.ctrlKey && (event.key === "l" || event.key === "L")) {
            event.preventDefault();
            lines = [];
            paint();
          } else if (!event.ctrlKey && !event.metaKey && !event.altKey && event.key.length === 1) {
            event.preventDefault();
            buffer += event.key;
            paint();
          }
        });

        screen.addEventListener("mousedown", () => screen.focus());
        screen.addEventListener("paste", (event) => {
          event.preventDefault();
          const text = (event.clipboardData || window.clipboardData).getData("text");
          buffer += String(text || "").replace(/[\r\n]+/g, " ");
          paint();
        });

        banner();
        paint();
        setTimeout(() => screen.focus(), 80);

        U.menuBar(w, [
          { label: "File", items: [
            { label: "New Window", action: () => Apps.commandPrompt(cwd) },
            { separator: true },
            { label: "Close", action: () => w.close() },
          ] },
          { label: "Edit", items: [
            { label: "Copy", action: () => {
              const selection = window.getSelection();
              if (selection && selection.toString()) navigator.clipboard.writeText(selection.toString()).catch(() => {});
            } },
            { label: "Paste", action: async () => {
              try {
                buffer += String(await navigator.clipboard.readText()).replace(/[\r\n]+/g, " ");
                paint();
              } catch (_err) { /* clipboard blocked */ }
            } },
            { separator: true },
            { label: "Clear Screen", action: () => { lines = []; paint(); } },
          ] },
          { label: "Help", items: [
            { label: "About Command Prompt", action: () => U.alert("Command Prompt",
              "A real command prompt for your NAS.\n\nIt runs a safe, whitelisted set of commands " +
              "inside the NAS folder. Type HELP to see them.\n\nArrow Up/Down recall history, Tab completes file names.",
              "cmd") },
          ] },
        ]);
      },
    });
    return win;
  };

  window.Apps = Apps;
})();
