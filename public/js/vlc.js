/* Win95 NAS - VLC-style media player.
 *
 * A dark, VLC-flavoured player that replaces the plain <video controls>
 * element: transport controls, seek/volume, speed, playlist, subtitles,
 * snapshots, fullscreen and keyboard shortcuts.
 */
(function () {
  "use strict";

  const VLC = (window.VLC = {});
  const VOLUME_KEY = "nas.vlc.volume";
  const SPEED_KEY = "nas.vlc.speed";
  const PLAYLIST_KEY = "nas.vlc.playlist";
  const MEDIA_KINDS = { audio: true, video: true };

  let pending = null;
  let blobUrls = [];

  function isMedia(entry) {
    return entry && entry.type === "file" && MEDIA_KINDS[entry.kind];
  }

  function formatTime(seconds) {
    if (!isFinite(seconds) || seconds < 0) seconds = 0;
    const total = Math.floor(seconds);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    const pad = (n) => (n < 10 ? "0" + n : String(n));
    return (h ? h + ":" + pad(m) : pad(m)) + ":" + pad(s);
  }

  function readNumber(key, fallback) {
    const raw = Number(localStorage.getItem(key));
    return isFinite(raw) && raw > 0 ? raw : fallback;
  }

  function srtToVtt(source) {
    let text = String(source || "").replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
    text = text.replace(/(\d{1,2}:\d{2}:\d{2}),(\d{3})/g, "$1.$2");
    text = text.replace(/(\d{1,2}:\d{2}),(\d{3})/g, "00:$1.$2");
    // Cue numbers are legal identifiers, but blank them for a cleaner file.
    text = text.replace(/^\s*\d+\s*$/gm, "");
    text = text.replace(/\n{3,}/g, "\n\n").trim();
    if (!/^WEBVTT/.test(text)) text = "WEBVTT\n\n" + text;
    return text + "\n";
  }

  function releaseBlobs() {
    blobUrls.forEach((url) => { try { URL.revokeObjectURL(url); } catch (_err) { /* ignore */ } });
    blobUrls = [];
  }

  // ------------------------------------------------------------------ player
  function player() {
    return WM.open({
      singleton: "vlc",
      title: "VLC media player",
      icon: "vlc",
      width: 860,
      height: 600,
      minWidth: 560,
      minHeight: 380,
      className: "vlc-win",
      reuse(win) {
        if (pending && win.vlcPlay) win.vlcPlay(pending);
      },
      build(body, w) {
        const app = U.el("div", { class: "vlc-app" });
        const main = U.el("div", { class: "vlc-main" });
        const stage = U.el("div", { class: "vlc-stage" });
        const video = U.el("video", { class: "vlc-video", playsinline: true, preload: "metadata" });
        const art = U.el("div", { class: "vlc-art" });
        const artIcon = U.el("div", { class: "vlc-art-icon", html: Icons.get("vlc", 128) });
        const artTitle = U.el("div", { class: "vlc-art-title" });
        const artSub = U.el("div", { class: "vlc-art-sub", text: "VLC media player" });
        const eq = U.el("div", { class: "vlc-eq" });
        for (let i = 0; i < 7; i += 1) eq.append(U.el("i"));
        art.append(artIcon, artTitle, artSub, eq);

        const spinner = U.el("div", { class: "vlc-spinner", hidden: true });
        const message = U.el("div", { class: "vlc-message", hidden: true });
        const messageIcon = U.el("div", { class: "vlc-message-icon" });
        const messageTitle = U.el("div", { class: "vlc-message-title" });
        const messageText = U.el("div", { class: "vlc-message-text" });
        const messageActions = U.el("div", { class: "vlc-message-actions" });
        message.append(messageIcon, messageTitle, messageText, messageActions);

        const osd = U.el("div", { class: "vlc-osd" });
        stage.append(video, art, spinner, message, osd);

        const playlistPane = U.el("aside", { class: "vlc-playlist", hidden: true });
        const playlistHead = U.el("div", { class: "vlc-pl-head" });
        const playlistCount = U.el("span", { class: "vlc-pl-count" });
        const playlistClose = U.el("button", { type: "button", class: "vlc-pl-close", title: "Hide playlist", text: "\u00D7" });
        playlistHead.append(U.el("span", { class: "vlc-pl-title", text: "Playlist" }), playlistCount, playlistClose);
        const playlistList = U.el("div", { class: "vlc-pl-list" });
        playlistPane.append(playlistHead, playlistList);
        main.append(stage, playlistPane);

        // ---------------------------------------------------------- controls
        const controls = U.el("div", { class: "vlc-controls" });
        const seekRow = U.el("div", { class: "vlc-seek-row" });
        const seek = U.el("input", { type: "range", class: "vlc-seek", min: "0", max: "1000", step: "1", value: "0", title: "Seek" });
        const progress = U.el("div", { class: "vlc-progress" });
        const buffer = U.el("div", { class: "vlc-buffer" });
        const seekWrap = U.el("div", { class: "vlc-seek-wrap" });
        seekWrap.append(progress, buffer, seek);
        const timeLabel = U.el("span", { class: "vlc-time", text: "00:00 / 00:00" });
        seekRow.append(seekWrap, timeLabel);

        const buttons = U.el("div", { class: "vlc-buttons" });
        const prevBtn = U.el("button", { type: "button", class: "vlc-btn vlc-prev", title: "Previous (P)", text: "\u25C0\u25C0" });
        const playBtn = U.el("button", { type: "button", class: "vlc-btn vlc-play", title: "Play / Pause (Space)" });
        playBtn.append(U.el("span", { class: "vlc-glyph vlc-glyph-play" }));
        const stopBtn = U.el("button", { type: "button", class: "vlc-btn vlc-stop", title: "Stop (S)" });
        stopBtn.append(U.el("span", { class: "vlc-glyph vlc-glyph-stop" }));
        const nextBtn = U.el("button", { type: "button", class: "vlc-btn vlc-next", title: "Next (N)", text: "\u25B6\u25B6" });
        const muteBtn = U.el("button", { type: "button", class: "vlc-btn vlc-mute", title: "Mute (M)", html: Icons.get("volume", 16) });
        const volume = U.el("input", { type: "range", class: "vlc-volume", min: "0", max: "100", step: "1", title: "Volume" });
        const speedWrap = U.el("label", { class: "vlc-speed-wrap", title: "Playback speed" });
        const speed = U.el("select", { class: "vlc-speed" });
        [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2].forEach((rate) => {
          speed.append(U.el("option", { value: String(rate), text: rate + "\u00D7" }));
        });
        speedWrap.append(U.el("span", { text: "Speed" }), speed);

        const subBtn = U.el("button", { type: "button", class: "vlc-btn vlc-textbtn vlc-sub", title: "Subtitles", text: "CC" });
        const audioBtn = U.el("button", { type: "button", class: "vlc-btn vlc-textbtn vlc-audio", title: "Audio track", text: "AUD" });
        const shotBtn = U.el("button", { type: "button", class: "vlc-btn vlc-textbtn vlc-shot", title: "Snapshot", text: "SNAP" });
        const plBtn = U.el("button", { type: "button", class: "vlc-btn vlc-textbtn vlc-pl-toggle", title: "Playlist (L)", text: "PL" });
        const fsBtn = U.el("button", { type: "button", class: "vlc-btn vlc-textbtn vlc-fs", title: "Fullscreen (F)", text: "FS" });

        buttons.append(
          prevBtn, playBtn, stopBtn, nextBtn,
          U.el("span", { class: "vlc-sep" }),
          muteBtn, volume,
          U.el("span", { class: "vlc-sep" }),
          speedWrap,
          U.el("span", { class: "vlc-spacer" }),
          subBtn, audioBtn, shotBtn, plBtn, fsBtn
        );

        const status = U.el("div", { class: "vlc-status", text: "Ready" });
        controls.append(seekRow, buttons, status);
        app.append(main, controls);
        body.append(app);

        // ---------------------------------------------------------- state
        let playlist = [];
        let folderFiles = [];
        let index = -1;
        let current = null;
        let currentSub = null;
        let seeking = false;
        let osdTimer = 0;
        let clickTimer = 0;
        let autoSub = true;

        let volumeValue = U.clamp(readNumber(VOLUME_KEY, 80), 0, 100);
        let muted = false;
        let speedValue = readNumber(SPEED_KEY, 1);
        if (![0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2].includes(speedValue)) speedValue = 1;
        volume.value = String(volumeValue);
        speed.value = String(speedValue);
        video.volume = volumeValue / 100;
        video.playbackRate = speedValue;

        const subtitleItems = [];
        const audioItems = [];
        const speedItems = [];

        // ---------------------------------------------------------- helpers
        function osdMessage(text, ms) {
          osd.textContent = text;
          osd.classList.add("show");
          clearTimeout(osdTimer);
          osdTimer = setTimeout(() => osd.classList.remove("show"), ms || 1800);
        }

        function setPlayingUI(playing) {
          playBtn.classList.toggle("is-playing", playing);
          art.classList.toggle("is-playing", playing);
          eq.classList.toggle("paused", !playing);
        }

        function showMessage(icon, title, text, actions) {
          messageIcon.innerHTML = Icons.get(icon || "vlc", 48);
          messageTitle.textContent = title || "";
          messageText.textContent = text || "";
          messageActions.innerHTML = "";
          (actions || []).forEach((action) => {
            const button = U.el("button", { type: "button", text: action.label });
            button.addEventListener("click", action.action);
            messageActions.append(button);
          });
          message.hidden = false;
        }

        function hideMessage() {
          message.hidden = true;
        }

        function emptyMessage() {
          video.removeAttribute("src");
          video.load();
          art.hidden = true;
          video.hidden = true;
          showMessage("vlc", "No media loaded", "Open a video or audio file from your NAS to start playing.", [
            { label: "Open Media...", action: () => VLC.pick() },
            { label: "Browse Videos", action: () => Explorer.open("/Videos") },
          ]);
          w.setTitle("VLC media player");
          timeLabel.textContent = "00:00 / 00:00";
          status.textContent = "Ready";
          setPlayingUI(false);
          current = null;
          index = -1;
        }

        function renderPlaylist() {
          playlistList.innerHTML = "";
          playlistCount.textContent = playlist.length ? "(" + playlist.length + ")" : "";
          if (!playlist.length) {
            playlistList.append(U.el("div", { class: "vlc-pl-empty", text: "No media in this folder." }));
            return;
          }
          playlist.forEach((entry, i) => {
            const row = U.el("button", {
              type: "button",
              class: "vlc-pl-item" + (i === index ? " active" : ""),
              title: entry.path,
            });
            row.append(
              U.el("span", { class: "vlc-pl-ico", html: Icons.forEntry(entry) }),
              U.el("span", { class: "vlc-pl-name", text: entry.name }),
              U.el("span", { class: "vlc-pl-kind", text: entry.kind === "audio" ? "audio" : "video" })
            );
            row.addEventListener("click", () => play(entry, { keepList: true }));
            row.addEventListener("dblclick", () => play(entry, { keepList: true }));
            playlistList.append(row);
          });
          const active = playlistList.querySelector(".vlc-pl-item.active");
          if (active) active.scrollIntoView({ block: "nearest" });
        }

        function refreshSubtitleMenu() {
          subtitleItems.length = 0;
          subtitleItems.push({
            label: "Disable subtitles",
            checked: !currentSub,
            action: () => loadSubtitle(null),
          });
          subtitleItems.push({ separator: true });
          const files = folderFiles.filter((entry) => /\.(srt|vtt)$/i.test(entry.name));
          if (!files.length) {
            subtitleItems.push({ label: "No .srt or .vtt files in this folder", disabled: true });
          } else {
            files.forEach((file) => {
              subtitleItems.push({
                label: file.name,
                checked: currentSub === file.path,
                action: () => loadSubtitle(file),
              });
            });
          }
          subtitleItems.push({ separator: true });
          subtitleItems.push({
            label: "Find subtitles again",
            action: () => { refreshFolder().then(() => { refreshSubtitleMenu(); U.toast("Subtitle list refreshed", "info"); }); },
          });
          subBtn.classList.toggle("on", !!currentSub);
        }

        function refreshAudioMenu() {
          audioItems.length = 0;
          const tracks = video.audioTracks;
          if (tracks && tracks.length) {
            for (let i = 0; i < tracks.length; i += 1) {
              const track = tracks[i];
              audioItems.push({
                label: track.label || track.language || ("Track " + (i + 1)),
                checked: !!track.enabled,
                action: () => {
                  for (let j = 0; j < tracks.length; j += 1) tracks[j].enabled = j === i;
                  U.toast("Audio track: " + (track.label || track.language || (i + 1)), "info");
                },
              });
            }
          } else {
            audioItems.push({ label: "Default audio track", checked: true, disabled: true });
          }
          audioItems.push({ separator: true });
          audioItems.push({ label: "Volume up", shortcut: "+", action: () => nudgeVolume(5) });
          audioItems.push({ label: "Volume down", shortcut: "\u2212", action: () => nudgeVolume(-5) });
          audioItems.push({ label: "Mute", shortcut: "M", checked: muted, action: toggleMute });
        }

        function buildSpeedItems() {
          speedItems.length = 0;
          [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2].forEach((rate) => {
            speedItems.push({
              label: rate + "\u00D7",
              checked: Math.abs(speedValue - rate) < 0.001,
              action: () => setSpeed(rate),
            });
          });
        }

        function setSpeed(rate) {
          speedValue = rate;
          video.playbackRate = rate;
          speed.value = String(rate);
          localStorage.setItem(SPEED_KEY, String(rate));
          buildSpeedItems();
          osdMessage("Speed " + rate + "\u00D7");
        }

        function nudgeVolume(delta) {
          setVolume(U.clamp(volumeValue + delta, 0, 100));
        }

        function setVolume(value, silent) {
          volumeValue = U.clamp(Math.round(value), 0, 100);
          if (volumeValue > 0) muted = false;
          video.muted = muted;
          video.volume = volumeValue / 100;
          volume.value = String(volumeValue);
          localStorage.setItem(VOLUME_KEY, String(volumeValue));
          muteBtn.innerHTML = Icons.get(muted || volumeValue === 0 ? "mute" : "volume", 16);
          if (!silent) osdMessage(muted || volumeValue === 0 ? "Muted" : "Volume " + volumeValue + "%");
          refreshAudioMenu();
        }

        function toggleMute() {
          muted = !muted;
          video.muted = muted;
          muteBtn.innerHTML = Icons.get(muted ? "mute" : "volume", 16);
          osdMessage(muted ? "Muted" : "Volume " + volumeValue + "%");
          refreshAudioMenu();
        }

        function updateTime() {
          const duration = isFinite(video.duration) ? video.duration : 0;
          const now = video.currentTime || 0;
          if (!seeking && duration > 0) {
            seek.value = String(Math.round((now / duration) * 1000));
          }
          if (duration > 0) progress.style.width = Math.min(100, (now / duration) * 100) + "%";
          else progress.style.width = "0%";
          timeLabel.textContent = formatTime(now) + " / " + formatTime(duration);
          if (video.buffered && video.buffered.length && duration > 0) {
            let end = 0;
            for (let i = 0; i < video.buffered.length; i += 1) end = Math.max(end, video.buffered.end(i));
            buffer.style.width = Math.min(100, (end / duration) * 100) + "%";
          } else {
            buffer.style.width = "0%";
          }
        }

        function mediaStatus() {
          if (!current) return "Ready";
          const bits = [];
          if (video.videoWidth && video.videoHeight) bits.push(video.videoWidth + "\u00D7" + video.videoHeight);
          if (isFinite(video.duration) && video.duration > 0) bits.push(formatTime(video.duration));
          bits.push(current.kind === "audio" ? "Audio" : "Video");
          bits.push(U.fmtSize(current.size || 0));
          return bits.join("  \u00B7  ");
        }

        function audioMode(on) {
          art.hidden = !on;
          video.hidden = on;
          artTitle.textContent = current ? current.name : "";
          artSub.textContent = current ? (current.kind === "audio" ? "Audio track" : "") : "VLC media player";
        }

        // ---------------------------------------------------------- subtitles
        function loadSubtitle(file) {
          U.qsa("track", video).forEach((track) => track.remove());
          currentSub = file ? file.path : null;
          refreshSubtitleMenu();
          if (!file) { osdMessage("Subtitles off"); return; }
          API.text(file.path).then((data) => {
            let text = data.text;
            if (/\.srt$/i.test(file.name)) text = srtToVtt(text);
            else if (!/^WEBVTT/.test(text.trim())) text = "WEBVTT\n\n" + text;
            releaseBlobs();
            const url = URL.createObjectURL(new Blob([text], { type: "text/vtt;charset=utf-8" }));
            blobUrls.push(url);
            const track = document.createElement("track");
            track.kind = "subtitles";
            track.label = file.name.replace(/\.[^.]+$/, "");
            track.srclang = "en";
            track.src = url;
            track.default = true;
            track.addEventListener("load", () => {
              try { track.track.mode = "showing"; } catch (_err) { /* ignore */ }
            });
            video.append(track);
            setTimeout(() => {
              try { if (track.track) track.track.mode = "showing"; } catch (_err) { /* ignore */ }
            }, 250);
            osdMessage("Subtitles: " + file.name);
          }).catch((err) => {
            currentSub = null;
            refreshSubtitleMenu();
            U.toast("Could not load subtitles: " + err.message, "error");
          });
        }

        function autoSubtitle() {
          if (!autoSub || !current) return;
          const stem = current.name.replace(/\.[^.]+$/, "").toLowerCase();
          const match = folderFiles.find((entry) =>
            /\.(srt|vtt)$/i.test(entry.name) &&
            entry.name.replace(/\.[^.]+$/, "").toLowerCase() === stem);
          if (match) loadSubtitle(match);
          else {
            currentSub = null;
            refreshSubtitleMenu();
          }
        }

        // ---------------------------------------------------------- playlist
        async function refreshFolder() {
          if (!current) return;
          try {
            const data = await API.list(U.dirname(current.path));
            folderFiles = data.entries || [];
          } catch (_err) {
            folderFiles = [];
          }
        }

        async function loadFolderPlaylist(entry) {
          try {
            const data = await API.list(U.dirname(entry.path));
            folderFiles = data.entries || [];
          } catch (_err) {
            folderFiles = [];
          }
          const list = folderFiles.filter(isMedia);
          list.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
          if (!list.some((item) => item.path === entry.path)) list.unshift(entry);
          playlist = list;
          localStorage.setItem(PLAYLIST_KEY, "1");
        }

        // ---------------------------------------------------------- playback
        function play(entry, opts) {
          opts = opts || {};
          if (!entry) { emptyMessage(); return; }
          pending = null;
          hideMessage();
          spinner.hidden = false;
          current = entry;
          currentSub = null;
          autoSub = true;
          w.setTitle(entry.name + " - VLC media player");
          if (opts.keepList) {
            index = playlist.findIndex((item) => item.path === entry.path);
            if (index < 0) { index = playlist.length; playlist.push(entry); }
            refreshFolder().then(() => { autoSubtitle(); refreshSubtitleMenu(); });
          } else {
            loadFolderPlaylist(entry).then(() => {
              index = playlist.findIndex((item) => item.path === entry.path);
              renderPlaylist();
              autoSubtitle();
              refreshSubtitleMenu();
            });
          }
          audioMode(entry.kind === "audio");
          artTitle.textContent = entry.name;
          renderPlaylist();
          video.src = API.rawUrl(entry.path);
          video.load();
          video.playbackRate = speedValue;
          video.volume = volumeValue / 100;
          video.muted = muted;
          updateTime();
          refreshAudioMenu();
          const attempt = video.play();
          if (attempt && attempt.catch) {
            attempt.catch(() => {
              setPlayingUI(false);
              status.textContent = "Paused  \u00B7  press Play to start";
            });
          }
          osdMessage(entry.name, 2600);
        }

        function togglePlay() {
          if (!current) { VLC.pick(); return; }
          if (video.paused || video.ended) {
            const attempt = video.play();
            if (attempt && attempt.catch) attempt.catch((err) => U.toast("Cannot play: " + err.message, "error"));
          } else {
            video.pause();
          }
        }

        function stop() {
          if (!current) return;
          video.pause();
          try { video.currentTime = 0; } catch (_err) { /* ignore */ }
          setPlayingUI(false);
          updateTime();
          osdMessage("Stopped");
        }

        function step(delta) {
          if (!playlist.length) return;
          let next = index + delta;
          if (next < 0) next = playlist.length - 1;
          if (next >= playlist.length) next = 0;
          play(playlist[next], { keepList: true });
        }

        function snapshot() {
          if (!current) return;
          if (!video.videoWidth || !video.videoHeight) {
            U.toast("Snapshots need a video stream", "warning");
            return;
          }
          const canvas = document.createElement("canvas");
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
          canvas.toBlob((blob) => {
            if (!blob) { U.toast("Could not take a snapshot", "error"); return; }
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = (current.name.replace(/\.[^.]+$/, "") || "snapshot") + " - " +
              formatTime(video.currentTime).replace(/:/g, "-") + ".png";
            document.body.append(link);
            link.click();
            link.remove();
            setTimeout(() => URL.revokeObjectURL(url), 4000);
            osdMessage("Snapshot saved");
          }, "image/png");
        }

        function toggleFullscreen() {
          if (document.fullscreenElement) {
            document.exitFullscreen().catch(() => {});
          } else if (app.requestFullscreen) {
            app.requestFullscreen().catch((err) => U.toast("Fullscreen unavailable: " + err.message, "error"));
          }
        }

        function togglePlaylist(force) {
          const show = force === undefined ? playlistPane.hidden : force;
          playlistPane.hidden = !show;
          plBtn.classList.toggle("on", show);
          if (show) renderPlaylist();
        }

        // ---------------------------------------------------------- wiring
        playBtn.addEventListener("click", togglePlay);
        stopBtn.addEventListener("click", stop);
        prevBtn.addEventListener("click", () => step(-1));
        nextBtn.addEventListener("click", () => step(1));
        muteBtn.addEventListener("click", toggleMute);
        volume.addEventListener("input", () => setVolume(Number(volume.value)));
        speed.addEventListener("change", () => setSpeed(Number(speed.value)));
        shotBtn.addEventListener("click", snapshot);
        plBtn.addEventListener("click", () => togglePlaylist());
        playlistClose.addEventListener("click", () => togglePlaylist(false));
        fsBtn.addEventListener("click", toggleFullscreen);
        subBtn.addEventListener("click", () => {
          const rect = subBtn.getBoundingClientRect();
          U.contextMenu(rect.left, rect.top - 4, subtitleItems);
        });
        audioBtn.addEventListener("click", () => {
          const rect = audioBtn.getBoundingClientRect();
          U.contextMenu(rect.left, rect.top - 4, audioItems);
        });

        seek.addEventListener("input", () => {
          seeking = true;
          const duration = isFinite(video.duration) ? video.duration : 0;
          if (duration > 0) {
            video.currentTime = (Number(seek.value) / 1000) * duration;
            timeLabel.textContent = formatTime(video.currentTime) + " / " + formatTime(duration);
          }
        });
        seek.addEventListener("change", () => { seeking = false; });

        video.addEventListener("timeupdate", updateTime);
        video.addEventListener("durationchange", updateTime);
        video.addEventListener("progress", updateTime);
        video.addEventListener("play", () => { setPlayingUI(true); status.textContent = mediaStatus(); spinner.hidden = true; });
        video.addEventListener("pause", () => { setPlayingUI(false); status.textContent = "Paused  \u00B7  " + mediaStatus(); });
        video.addEventListener("ended", () => {
          setPlayingUI(false);
          if (playlist.length > 1 && index < playlist.length - 1) step(1);
          else status.textContent = "Finished  \u00B7  " + mediaStatus();
        });
        video.addEventListener("waiting", () => { spinner.hidden = false; });
        video.addEventListener("playing", () => { spinner.hidden = true; hideMessage(); });
        video.addEventListener("canplay", () => { spinner.hidden = true; });
        video.addEventListener("loadedmetadata", () => {
          spinner.hidden = true;
          updateTime();
          status.textContent = mediaStatus();
          refreshAudioMenu();
        });
        video.addEventListener("error", () => {
          spinner.hidden = true;
          setPlayingUI(false);
          const code = video.error ? video.error.code : 0;
          let text = "This file could not be played.";
          if (code === 2) text = "A network error stopped playback. The file may have moved.";
          else if (code === 3) text = "The audio or video data is damaged.";
          else if (code === 4) text = "This file uses a format or codec the browser cannot decode.";
          showMessage("warning", "Cannot play this file", text + "\n\nTry downloading it and opening it in a desktop player.", [
            { label: "Download", action: () => API.download(current.path, current.name) },
            { label: "Open folder", action: () => Explorer.open(U.dirname(current.path)) },
          ]);
          status.textContent = "Playback error";
        });

        stage.addEventListener("click", (event) => {
          if (event.target.closest("button") || event.target.closest("input")) return;
          clearTimeout(clickTimer);
          clickTimer = setTimeout(togglePlay, 200);
        });
        stage.addEventListener("dblclick", (event) => {
          if (event.target.closest("button") || event.target.closest("input")) return;
          clearTimeout(clickTimer);
          toggleFullscreen();
        });
        stage.addEventListener("wheel", (event) => {
          if (!current) return;
          event.preventDefault();
          nudgeVolume(event.deltaY < 0 ? 5 : -5);
        }, { passive: false });

        document.addEventListener("fullscreenchange", onFullscreen);
        function onFullscreen() {
          const on = document.fullscreenElement === app;
          fsBtn.classList.toggle("on", on);
          osdMessage(on ? "Fullscreen  \u00B7  Esc to exit" : "Windowed");
        }

        w.onKey = (event) => {
          const tag = event.target && event.target.tagName;
          if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
          if (event.ctrlKey || event.altKey || event.metaKey) return;
          switch (event.key) {
            case " ":
            case "k":
              event.preventDefault(); togglePlay(); break;
            case "ArrowRight":
              event.preventDefault(); if (current) video.currentTime = Math.min((video.duration || 0), video.currentTime + 5); break;
            case "ArrowLeft":
              event.preventDefault(); if (current) video.currentTime = Math.max(0, video.currentTime - 5); break;
            case "ArrowUp":
              event.preventDefault(); nudgeVolume(5); break;
            case "ArrowDown":
              event.preventDefault(); nudgeVolume(-5); break;
            case "m": toggleMute(); break;
            case "f": toggleFullscreen(); break;
            case "s": stop(); break;
            case "n": step(1); break;
            case "p": step(-1); break;
            case "l": togglePlaylist(); break;
            case "[":
              event.preventDefault(); setSpeed(Math.max(0.25, Math.round((speedValue - 0.25) * 100) / 100)); break;
            case "]":
              event.preventDefault(); setSpeed(Math.min(2, Math.round((speedValue + 0.25) * 100) / 100)); break;
            case "Escape":
              if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
              break;
            default: break;
          }
        };

        w.opts.onClose = () => {
          clearTimeout(clickTimer);
          clearTimeout(osdTimer);
          document.removeEventListener("fullscreenchange", onFullscreen);
          releaseBlobs();
          video.pause();
          video.removeAttribute("src");
          video.load();
        };

        // ---------------------------------------------------------- menu
        buildSpeedItems();
        refreshSubtitleMenu();
        refreshAudioMenu();

        U.menuBar(w, [
          { label: "Media", items: [
            { label: "Open Media...", icon: "vlc", action: () => VLC.pick() },
            { label: "Open Folder in Explorer", icon: "folder", action: () => {
              if (current) Explorer.open(U.dirname(current.path)); else Explorer.open("/Videos");
            } },
            { separator: true },
            { label: "Download", icon: "download", action: () => { if (current) API.download(current.path, current.name); } },
            { label: "Properties", icon: "settings", action: () => { if (current) Apps.properties(current.path); } },
            { separator: true },
            { label: "Quit", shortcut: "Ctrl+W", action: () => w.close() },
          ] },
          { label: "Playback", items: [
            { label: "Play / Pause", shortcut: "Space", action: togglePlay },
            { label: "Stop", shortcut: "S", action: stop },
            { separator: true },
            { label: "Previous", shortcut: "P", action: () => step(-1) },
            { label: "Next", shortcut: "N", action: () => step(1) },
            { separator: true },
            { label: "Speed", submenu: speedItems },
          ] },
          { label: "Audio", items: [
            { label: "Audio Track", submenu: audioItems },
            { separator: true },
            { label: "Volume Up", shortcut: "\u2191", action: () => nudgeVolume(5) },
            { label: "Volume Down", shortcut: "\u2193", action: () => nudgeVolume(-5) },
            { label: "Mute", shortcut: "M", action: toggleMute },
          ] },
          { label: "Video", items: [
            { label: "Fullscreen", shortcut: "F", action: toggleFullscreen },
            { label: "Snapshot", action: snapshot },
            { separator: true },
            { label: "Fit to window", checked: true, disabled: true },
          ] },
          { label: "Subtitle", items: subtitleItems },
          { label: "Help", items: [
            { label: "About VLC media player", icon: "vlc", action: () => U.alert(
              "VLC media player",
              "A VLC-style player for Win95 NAS. Playback uses the browser's own audio and video " +
              "decoders, so MP4 (H.264/AAC), WebM, Ogg, MP3 and WAV all work. Formats the browser " +
              "cannot decode are reported with a download link instead of failing silently.",
              "vlc") },
          ] },
        ]);

        w.vlcPlay = (entry) => play(entry);
        if (pending) play(pending);
        else emptyMessage();
        setVolume(volumeValue, true);
        setPlayingUI(false);
      },
    });
  }

  // ------------------------------------------------------------------ public
  VLC.open = async function open(entry) {
    let item = entry;
    if (typeof item === "string") {
      try { item = await API.stat(item); }
      catch (err) { U.alert("VLC media player", err.message, "error"); return null; }
    }
    pending = item || null;
    return player();
  };

  VLC.pick = async function pick() {
    const folders = ["/Videos", "/Music", "/", "/Shared", "/Desktop"];
    const found = [];
    await Promise.all(folders.map(async (folder) => {
      try {
        const data = await API.list(folder);
        (data.entries || []).forEach((entry) => { if (isMedia(entry)) found.push(entry); });
      } catch (_err) { /* folder may not exist */ }
    }));
    const seen = new Set();
    const files = found.filter((entry) => {
      if (seen.has(entry.path)) return false;
      seen.add(entry.path);
      return true;
    }).sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true }));

    let chosen = null;
    let win = null;
    const openChosen = (entry) => {
      if (!entry) return;
      if (win) win.close();
      VLC.open(entry);
    };

    await U.dialog({
      title: "Open Media",
      icon: "vlc",
      width: 560,
      height: files.length ? 420 : 210,
      autoHeight: false,
      message: files.length
        ? "Choose a video or audio file from your NAS."
        : "There are no video or audio files yet. Upload some to the Videos or Music folder.",
      content: () => {
        const wrap = U.el("div", { class: "vlc-picker" });
        const list = U.el("div", { class: "vlc-picker-list" });
        if (!files.length) {
          list.append(U.el("div", { class: "vlc-picker-empty", text: "Nothing to play yet." }));
        }
        files.forEach((entry) => {
          const row = U.el("button", { type: "button", class: "vlc-picker-row", title: entry.path });
          row.append(
            U.el("span", { class: "vlc-picker-ico", html: Icons.forEntry(entry) }),
            U.el("span", { class: "vlc-picker-name", text: entry.name }),
            U.el("span", { class: "vlc-picker-path", text: U.dirname(entry.path) }),
            U.el("span", { class: "vlc-picker-size", text: U.fmtSize(entry.size) })
          );
          row.addEventListener("dblclick", () => openChosen(entry));
          row.addEventListener("click", () => {
            chosen = entry;
            U.qsa(".vlc-picker-row", list).forEach((node) => node.classList.remove("selected"));
            row.classList.add("selected");
            if (win) {
              const button = win.el.querySelector(".dialog-buttons .vlc-open-btn");
              if (button) button.disabled = false;
            }
          });
          list.append(row);
        });
        wrap.append(list);
        return wrap;
      },
      buttons: [
        { label: "Open", value: "open", primary: true, close: false, action: () => {
          if (!chosen) return;
          const entry = chosen;
          if (win) win.close();
          VLC.open(entry);
        } },
        { label: "Cancel", value: "cancel" },
      ],
      onBuild(w, text, buttonEls) {
        win = w;
        if (buttonEls[0]) {
          buttonEls[0].classList.add("vlc-open-btn");
          buttonEls[0].disabled = !files.length;
        }
        if (files.length) {
          const first = text.querySelector(".vlc-picker-row");
          if (first) {
            chosen = files[0];
            first.classList.add("selected");
            if (buttonEls[0]) buttonEls[0].disabled = false;
          }
        }
      },
    });
  };

  VLC.isMedia = isMedia;
})();
