// Snowly — a transparent, click-through, always-on-top overlay that covers the
// desktop work area. Its bottom edge is the top edge of the Windows taskbar, so the
// snow piles up right on top of the taskbar.
const { app, BrowserWindow, screen, Tray, Menu, nativeImage, globalShortcut } = require('electron');
const path = require('path');
const fs = require('fs');

if (!app.requestSingleInstanceLock()) { app.quit(); }
app.setAppUserModelId('Snowly');

const { execFile } = require('child_process');

const defaults = { snow: 2, plow: true, plowSize: 1, paused: false, wallpaper: true, prevWallpaper: null, wallpaperVersion: 0 };
let settings = { ...defaults };
const settingsFile = () => path.join(app.getPath('userData'), 'settings.json');
function loadSettings() {
  try { Object.assign(settings, JSON.parse(fs.readFileSync(settingsFile(), 'utf8'))); } catch { /* first run */ }
}
function saveSettings() {
  try { fs.writeFileSync(settingsFile(), JSON.stringify(settings, null, 2)); } catch { /* ignore */ }
}

let win = null;
let tray = null;

function workArea() {
  // workArea excludes the taskbar. If the taskbar auto-hides, this is the whole screen.
  return screen.getPrimaryDisplay().workArea;
}

function placeWindow() {
  if (!win) return;
  const wa = workArea();
  win.setBounds({ x: wa.x, y: wa.y, width: wa.width, height: wa.height });
}

function pushSettings() {
  if (win) win.webContents.send('settings', settings);
}

function createWindow() {
  const wa = workArea();
  win = new BrowserWindow({
    x: wa.x, y: wa.y, width: wa.width, height: wa.height,
    transparent: true,
    backgroundColor: '#00000000',
    frame: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    focusable: false,
    skipTaskbar: true,
    hasShadow: false,
    alwaysOnTop: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });
  win.setIgnoreMouseEvents(true);          // clicks go straight through to the desktop
  win.setAlwaysOnTop(true, 'screen-saver');
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.once('ready-to-show', () => {
    win.showInactive();
    pushSettings();
  });
  win.webContents.on('did-finish-load', pushSettings);
}

// ---------------- wallpaper ----------------
const isWin = process.platform === 'win32';
const WALL_NAME = 'snowly-wallpaper';
const WALLPAPER_VERSION = 2;   // bump when assets/wallpaper.jpg changes so it gets re-applied

function powershell(script) {
  return new Promise((resolve, reject) => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
      { windowsHide: true }, (err, stdout, stderr) => (err ? reject(new Error(stderr || err.message)) : resolve(stdout.trim())));
  });
}
const psQuote = (s) => "'" + String(s).replace(/'/g, "''") + "'";

async function getCurrentWallpaper() {
  return powershell("(Get-ItemProperty -Path 'HKCU:\\Control Panel\\Desktop' -Name WallPaper).WallPaper");
}

async function setWindowsWallpaper(file) {
  // style 10 = Fill (cover the screen, keep aspect ratio)
  const script = [
    "Set-ItemProperty -Path 'HKCU:\\Control Panel\\Desktop' -Name WallpaperStyle -Value '10'",
    "Set-ItemProperty -Path 'HKCU:\\Control Panel\\Desktop' -Name TileWallpaper -Value '0'",
    "Add-Type -TypeDefinition 'using System.Runtime.InteropServices; public class SnowWP { [DllImport(\"user32.dll\", CharSet=CharSet.Unicode, SetLastError=true)] public static extern bool SystemParametersInfo(int a, int b, string c, int d); }'",
    `if (-not [SnowWP]::SystemParametersInfo(20, 0, ${psQuote(file)}, 3)) { throw 'SystemParametersInfo failed' }`,
  ].join('; ');
  await powershell(script);
}

// Windows can't read files inside app.asar, so copy the bundled wallpaper to a real file first.
function installWallpaperFile() {
  const file = path.join(app.getPath('userData'), `${WALL_NAME}.jpg`);
  fs.writeFileSync(file, fs.readFileSync(path.join(__dirname, 'assets', 'wallpaper.jpg')));
  return file;
}

let wallpaperBusy = false;
async function applyWallpaper() {
  if (!isWin || wallpaperBusy) return;
  wallpaperBusy = true;
  try {
    const current = await getCurrentWallpaper().catch(() => '');
    if (current && !current.includes(WALL_NAME) && !current.includes('snow-cabin-wallpaper')) settings.prevWallpaper = current;
    const file = installWallpaperFile();
    await setWindowsWallpaper(file);
    settings.wallpaper = true; settings.wallpaperVersion = WALLPAPER_VERSION; saveSettings();
  } catch (e) {
    notify('Could not set the wallpaper', String(e.message || e).slice(0, 200));
  } finally {
    wallpaperBusy = false;
    if (tray) buildMenu();
  }
}

async function restoreWallpaper() {
  settings.wallpaper = false; saveSettings();
  if (!isWin) return;
  const prev = settings.prevWallpaper;
  if (prev && fs.existsSync(prev)) {
    try { await setWindowsWallpaper(prev); } catch (e) { notify('Could not restore the wallpaper', String(e.message || e).slice(0, 200)); }
  } else {
    notify('Previous wallpaper not found', 'Pick a wallpaper in Settings > Personalization > Background.');
  }
  if (tray) buildMenu();
}

function notify(title, content) {
  if (tray && isWin) tray.displayBalloon({ title, content, iconType: 'info' });
}

function loginItemOptions() {
  return app.isPackaged
    ? { path: process.execPath, args: [] }
    : { path: process.execPath, args: [path.resolve(__dirname)] };
}

function buildMenu() {
  const set = (patch) => { Object.assign(settings, patch); saveSettings(); pushSettings(); buildMenu(); };
  const snowNames = ['Off (keep the snow on the taskbar)', 'Light', 'Medium', 'Heavy'];
  const sizeNames = [[0.8, 'Small'], [1, 'Medium'], [1.3, 'Large']];
  const autostart = app.getLoginItemSettings(loginItemOptions()).openAtLogin;
  const menu = Menu.buildFromTemplate([
    { label: '❄ Snowly', enabled: false },
    { type: 'separator' },
    {
      label: 'Snowfall',
      submenu: snowNames.map((n, i) => ({ label: n, type: 'radio', checked: settings.snow === i, click: () => set({ snow: i }) })),
    },
    { label: 'Snowplow', type: 'checkbox', checked: settings.plow, click: (m) => set({ plow: m.checked }) },
    {
      label: 'Snowplow size',
      submenu: sizeNames.map(([v, n]) => ({ label: n, type: 'radio', checked: settings.plowSize === v, click: () => set({ plowSize: v }) })),
    },
    { label: 'Clear snow', click: () => win && win.webContents.send('command', 'clear') },
    { type: 'separator' },
    {
      label: wallpaperBusy ? 'Winter wallpaper (applying…)' : 'Winter wallpaper', type: 'checkbox', checked: settings.wallpaper, enabled: isWin && !wallpaperBusy,
      click: (m) => { if (m.checked) applyWallpaper(); else restoreWallpaper(); buildMenu(); },
    },
    { label: 'Restore my previous wallpaper', enabled: isWin && settings.wallpaper, click: () => restoreWallpaper() },
    { type: 'separator' },
    { label: 'Pause', type: 'checkbox', checked: settings.paused, click: (m) => set({ paused: m.checked }) },
    {
      label: 'Show / hide (Ctrl+Alt+S)',
      click: toggleVisible,
    },
    {
      label: 'Start with Windows', type: 'checkbox', checked: autostart,
      click: (m) => { app.setLoginItemSettings({ openAtLogin: m.checked, ...loginItemOptions() }); buildMenu(); },
    },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() },
  ]);
  tray.setContextMenu(menu);
}

function toggleVisible() {
  if (!win) return;
  if (win.isVisible()) win.hide(); else { win.showInactive(); win.setAlwaysOnTop(true, 'screen-saver'); }
}

app.whenReady().then(() => {
  loadSettings();
  createWindow();

  const icon = nativeImage.createFromPath(path.join(__dirname, 'assets', 'tray.png'));
  tray = new Tray(icon);
  tray.setToolTip('Snowly — click for options');
  tray.on('click', () => tray.popUpContextMenu());
  buildMenu();

  globalShortcut.register('Control+Alt+S', toggleVisible);

  // set the winter wallpaper on first run (or when a new wallpaper ships with an update)
  if (settings.wallpaper && settings.wallpaperVersion !== WALLPAPER_VERSION) applyWallpaper();

  screen.on('display-metrics-changed', placeWindow);
  screen.on('display-added', placeWindow);
  screen.on('display-removed', placeWindow);

  // Some apps grab the top-most slot; quietly take it back now and then.
  setInterval(() => { if (win && win.isVisible()) win.setAlwaysOnTop(true, 'screen-saver'); }, 10000);
});

app.on('second-instance', () => { if (win) { win.showInactive(); } });
app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('window-all-closed', () => app.quit());

// exported for automated checks
module.exports = { installWallpaperFile };
