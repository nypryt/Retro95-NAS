/* Win95 NAS - API client */
(function () {
  "use strict";

  async function request(method, url, body) {
    const options = { method, headers: {} };
    if (body !== undefined) {
      options.headers["Content-Type"] = "application/json";
      options.body = JSON.stringify(body);
    }
    const res = await fetch(url, options);
    const text = await res.text();
    let data = {};
    if (text) {
      try { data = JSON.parse(text); }
      catch (_err) { throw new Error(text.slice(0, 300) || res.statusText); }
    }
    if (res.status === 401 && data.login) {
      const here = location.pathname + location.search;
      location.href = "/login?next=" + encodeURIComponent(here);
      throw new Error("Please sign in again.");
    }
    if (!res.ok) throw new Error(data.error || res.statusText || ("HTTP " + res.status));
    return data;
  }

  function upload(dest, files, dirs, onProgress, signal) {
    return new Promise((resolve, reject) => {
      const form = new FormData();
      form.append("dest", dest);
      form.append("manifest", JSON.stringify({ files: files.map((f) => f.rel), dirs: dirs || [] }));
      files.forEach((item) => form.append("file", item.file, item.file.name));

      const xhr = new XMLHttpRequest();
      xhr.open("POST", "/api/upload");
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable && onProgress) {
          onProgress(event.loaded / event.total, event.loaded, event.total);
        }
      };
      xhr.onload = () => {
        let data = {};
        try { data = JSON.parse(xhr.responseText || "{}"); } catch (_e) { data = {}; }
        if (xhr.status === 401 && data.login) {
          const here = location.pathname + location.search;
          location.href = "/login?next=" + encodeURIComponent(here);
          reject(new Error("Please sign in again."));
          return;
        }
        if (xhr.status >= 200 && xhr.status < 300) resolve(data);
        else reject(new Error(data.error || ("Upload failed (" + xhr.status + ")")));
      };
      xhr.onerror = () => reject(new Error("Network error while uploading"));
      xhr.onabort = () => reject(new Error("Upload cancelled"));
      if (signal) {
        if (signal.aborted) { xhr.abort(); return; }
        signal.addEventListener("abort", () => xhr.abort(), { once: true });
      }
      xhr.send(form);
    });
  }

  function download(paths, name) {
    const params = new URLSearchParams();
    (Array.isArray(paths) ? paths : [paths]).forEach((p) => params.append("paths", p));
    if (name) params.set("name", name);
    const link = document.createElement("a");
    link.href = "/api/download?" + params.toString();
    link.download = name || "";
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  window.API = {
    request,
    get: (url, params) => {
      const q = new URLSearchParams(params || {}).toString();
      return request("GET", url + (q ? "?" + q : ""));
    },
    post: (url, body) => request("POST", url, body || {}),
    del: (url, params) => {
      const q = new URLSearchParams(params || {}).toString();
      return request("DELETE", url + (q ? "?" + q : ""));
    },
    upload,
    download,
    list: (path) => request("GET", "/api/list?path=" + encodeURIComponent(path || "/")),
    stat: (path) => request("GET", "/api/stat?path=" + encodeURIComponent(path)),
    info: () => request("GET", "/api/info"),
    storage: () => request("GET", "/api/storage"),
    shell: (command, cwd) => request("POST", "/api/shell", { command, cwd: cwd || "/" }),
    tailscale: {
      status: () => request("GET", "/api/tailscale/status"),
      action: (action, value) => request("POST", "/api/tailscale/action", { action, value: value || "" }),
    },
    auth: {
      status: () => request("GET", "/api/auth/status"),
      login: (username, password) => request("POST", "/api/auth/login", { username, password }),
      register: (username, password) => request("POST", "/api/auth/register", { username, password }),
      logout: () => request("POST", "/api/auth/logout"),
      users: () => request("GET", "/api/auth/users"),
      addUser: (username, password, admin) => request("POST", "/api/auth/users", { username, password, admin }),
      removeUser: (username) => request("POST", "/api/auth/users/remove", { username }),
      changePassword: (current, newPassword) => request("POST", "/api/auth/password", { current, new: newPassword }),
    },
    settings: () => request("GET", "/api/settings"),
    saveSettings: (patch) => request("POST", "/api/settings", patch),
    wallpapers: () => request("GET", "/api/wallpapers"),
    uploadWallpaper: async (file) => {
      const res = await fetch("/api/wallpapers?name=" + encodeURIComponent(file.name), { method: "POST", body: file });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Wallpaper upload failed");
      return data;
    },
    deleteWallpaper: (name) => request("DELETE", "/api/wallpapers?name=" + encodeURIComponent(name)),
    rawUrl: (path) => "/api/raw?path=" + encodeURIComponent(path),
    mkdir: (path, name) => request("POST", "/api/mkdir", { path, name }),
    newfile: (path, name, content) => request("POST", "/api/newfile", { path, name, content }),
    rename: (path, name) => request("POST", "/api/rename", { path, name }),
    remove: (paths) => request("POST", "/api/delete", { paths }),
    move: (srcs, dest, op) => request("POST", "/api/move", { srcs, dest, op: op || "move" }),
    text: (path) => request("GET", "/api/text?path=" + encodeURIComponent(path)),
    saveText: (path, text) => request("POST", "/api/text", { path, text }),
    saveImage: (path, data) => request("POST", "/api/image/save", { path, data }),
    tray: () => request("GET", "/api/tray"),
    office: (path) => request("GET", "/api/office?path=" + encodeURIComponent(path)),
    officeMediaUrl: (path, name) => "/api/office/media?path=" + encodeURIComponent(path) + "&name=" + encodeURIComponent(name),
    newdoc: (path, name, type) => request("POST", "/api/newdoc", { path, name, type }),
    officeSave: (path, type, model) => request("POST", "/api/office/save", { path, type, model }),
    search: (path, q) => request("GET", "/api/search?path=" + encodeURIComponent(path) + "&q=" + encodeURIComponent(q)),
    archive: {
      list: (path) => request("GET", "/api/archive/list?path=" + encodeURIComponent(path)),
      create: (body) => request("POST", "/api/archive/create", body || {}),
      extract: (body) => request("POST", "/api/archive/extract", body || {}),
      add: (body) => request("POST", "/api/archive/add", body || {}),
      remove: (body) => request("POST", "/api/archive/delete", body || {}),
      test: (body) => request("POST", "/api/archive/test", body || {}),
      memberUrl: (path, member) => "/api/archive/member?path=" + encodeURIComponent(path) +
        "&member=" + encodeURIComponent(member),
    },
    recycle: () => request("GET", "/api/recycle"),
    restore: (id) => request("POST", "/api/recycle/restore", { id }),
    emptyRecycle: () => request("POST", "/api/recycle/empty"),
    removePermanently: (id) => request("POST", "/api/recycle/delete", { id }),
    openFolder: (path) => request("POST", "/api/open-folder", { path }),
    docker: {
      status: () => request("GET", "/api/docker/status"),
      containers: () => request("GET", "/api/docker/containers"),
      action: (id, action) => request("POST", "/api/docker/action", { id, action }),
      logs: (id, tail) => request("POST", "/api/docker/logs", { id, tail }),
      inspect: (id) => request("POST", "/api/docker/inspect", { id }),
      ls: (id, path) => request("GET", "/api/docker/ls?id=" + encodeURIComponent(id) + "&path=" + encodeURIComponent(path)),
      upload: (id, containerPath, nasPath) => request("POST", "/api/docker/upload", { id, containerPath, nasPath }),
      saveToNas: (id, path, dest) => request("POST", "/api/docker/save", { id, path, dest }),
      downloadUrl: (id, path) => "/api/docker/download?id=" + encodeURIComponent(id) + "&path=" + encodeURIComponent(path),
      volumes: () => request("GET", "/api/docker/volumes"),
      volume: (name) => request("GET", "/api/docker/volume?name=" + encodeURIComponent(name)),
      createVolume: (name) => request("POST", "/api/docker/volume/create", { name }),
      removeVolume: (name) => request("POST", "/api/docker/volume/remove", { name }),
      backupVolume: (name, dest) => request("POST", "/api/docker/volume/backup", { name, dest }),
      restoreVolume: (name, nasPath) => request("POST", "/api/docker/volume/restore", { name, nasPath }),
      helper: () => request("POST", "/api/docker/helper", {}),
      startDesktop: () => request("POST", "/api/docker/start-desktop", {}),
    },
  };
})();
