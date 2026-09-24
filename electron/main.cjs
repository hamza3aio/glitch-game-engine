const { app, BrowserWindow, ipcMain, dialog, shell } = require("electron");
const path = require("path");
const fs = require("fs");

let launcherWin = null;
let gameWin = null;

const PRELOAD = path.join(__dirname, "preload.cjs");
const DIST = path.join(__dirname, "..", "dist");

function projectsFile() {
  return path.join(app.getPath("userData"), "projects.json");
}

function loadRecents() {
  try {
    const r = JSON.parse(fs.readFileSync(projectsFile(), "utf8"));
    if (!Array.isArray(r)) return [];
    return r.filter((p) => p && typeof p.path === "string" && fs.existsSync(p.path));
  } catch {
    return [];
  }
}

function saveRecents(list) {
  try {
    fs.mkdirSync(path.dirname(projectsFile()), { recursive: true });
    fs.writeFileSync(projectsFile(), JSON.stringify(list, null, 2));
  } catch { /* non-fatal */ }
}

function touchRecent(entry) {
  const list = loadRecents().filter((p) => p.path !== entry.path);
  list.unshift({ name: entry.name, path: entry.path, updatedAt: Date.now() });
  saveRecents(list.slice(0, 12));
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name);
    const d = path.join(dest, e.name);
    if (e.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

function sanitize(name) {
  return String(name || "").replace(/[<>:"/\\|?*\x00-\x1F]/g, "").trim().slice(0, 40) || "My Glitch Game";
}

function createLauncher() {
  launcherWin = new BrowserWindow({
    width: 1060,
    height: 660,
    title: "Glitch Engine",
    backgroundColor: "#0b0e14",
    webPreferences: { preload: PRELOAD, contextIsolation: true, nodeIntegration: false },
  });
  launcherWin.setMenu(null);
  launcherWin.loadFile(path.join(DIST, "launcher.html"));
  launcherWin.on("closed", () => { launcherWin = null; });
}

function openGame(query) {
  const q = query || {};
  if (gameWin && !gameWin.isDestroyed()) {
    gameWin.focus();
    gameWin.webContents.send("open-project", q);
    return;
  }
  gameWin = new BrowserWindow({
    width: 1280,
    height: 800,
    title: "Glitch Engine",
    backgroundColor: "#0b0e14",
    webPreferences: { preload: PRELOAD, contextIsolation: true, nodeIntegration: false },
  });
  gameWin.setMenu(null);
  const opts = Object.keys(q).length > 0 ? { query: q } : undefined;
  if (opts) gameWin.loadFile(path.join(DIST, "index.html"), opts);
  else gameWin.loadFile(path.join(DIST, "index.html"));
  gameWin.on("closed", () => { gameWin = null; });
}

ipcMain.handle("glitch:version", () => app.getVersion());

ipcMain.handle("glitch:recents", () => loadRecents());

ipcMain.handle("glitch:new-project", (_e, { name }) => {
  const clean = sanitize(name);
  const dest = path.join(app.getPath("documents"), "GlitchProjects", clean);
  if (fs.existsSync(dest)) throw new Error("A project with that name already exists.");
  copyDir(path.join(__dirname, "..", "project-template"), dest);
  const pj = path.join(dest, "project.json");
  try {
    const data = JSON.parse(fs.readFileSync(pj, "utf8"));
    data.name = clean;
    data.createdAt = new Date().toISOString();
    fs.writeFileSync(pj, JSON.stringify(data, null, 2));
  } catch { /* template stays as-is */ }
  touchRecent({ name: clean, path: dest });
  openGame({ project: dest });
  return { name: clean, path: dest };
});

ipcMain.handle("glitch:open-sample", () => {
  openGame({});
  return true;
});

ipcMain.handle("glitch:open-project", (_e, { path: p }) => {
  if (!p || !fs.existsSync(p)) throw new Error("Folder not found.");
  const stat = fs.statSync(p);
  if (!stat.isDirectory()) throw new Error("Pick a project folder.");
  const name = path.basename(p);
  touchRecent({ name, path: p });
  openGame({ project: p });
  return { name, path: p };
});

ipcMain.handle("glitch:pick-folder", async () => {
  const r = await dialog.showOpenDialog(launcherWin || gameWin, { properties: ["openDirectory"] });
  return r.canceled ? null : r.filePaths[0];
});

ipcMain.handle("glitch:show-in-folder", (_e, { path: p }) => {
  if (p) shell.showItemInFolder(p);
  return true;
});

ipcMain.handle("glitch:read-scene", (_e, { path: p }) => {
  const read = (f) => {
    try { return fs.readFileSync(path.join(p, f), "utf8"); } catch { return null; }
  };
  return { project: read("project.json"), scene: read("scene.json") };
});

ipcMain.handle("glitch:write-scene", (_e, { path: p, scene }) => {
  fs.mkdirSync(p, { recursive: true });
  fs.writeFileSync(path.join(p, "scene.json"), String(scene));
  touchRecent({ name: path.basename(p), path: p });
  return true;
});

app.whenReady().then(() => {
  createLauncher();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createLauncher();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
