// Algebrix as a desktop app: the same single-file build in its own window, drawn by Chromium at
// the screen's own refresh rate (120 Hz on a ProMotion or high-refresh display), with no
// browser tab or artifact frame around it. Your work is saved in the app's own storage.
const { app, BrowserWindow, Menu, shell, nativeTheme } = require('electron');
const path = require('node:path');

function open() {
  const win = new BrowserWindow({
    width: 1440, height: 900, minWidth: 720, minHeight: 480,
    show: false, title: 'Algebrix',
    // the app's own background, so nothing flashes white before the first frame
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#1f1e1d' : '#e9edf1',
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, sandbox: true, spellcheck: false },
  });
  win.once('ready-to-show', () => win.show());
  // links open in the real browser, never inside the app
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('file:')) { e.preventDefault(); shell.openExternal(url); } });
  // F11 full screen on Windows and Linux (the Mac has its green button and ⌃⌘F)
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type === 'keyDown' && input.key === 'F11') { win.setFullScreen(!win.isFullScreen()); e.preventDefault(); }
  });
  win.loadFile(path.join(__dirname, 'app', 'index.html'));
}

// A small menu: the app's own keys (Ctrl + − and =, Ctrl + R …) must reach the math, not zoom or reload.
const mac = process.platform === 'darwin';
Menu.setApplicationMenu(mac ? Menu.buildFromTemplate([
  { role: 'appMenu' },
  { label: 'Edit', submenu: [{ role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
  { label: 'View', submenu: [{ role: 'togglefullscreen' }] },
  { role: 'windowMenu' },
]) : null);

app.whenReady().then(() => {
  open();
  app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) open(); });
});
app.on('window-all-closed', () => { if (!mac) app.quit(); });
