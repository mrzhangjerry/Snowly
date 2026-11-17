// Windows-only helpers, called through koffi (a prebuilt FFI library, nothing to compile).
//
// listWindows(ownHwnd)       -> visible app windows in z-order (front first), in physical pixels
// keepAboveDesktop(ownHwnd)  -> keeps the Snowly layer directly above the desktop, so it sits
//                               behind every app window and never gets in the way of work
'use strict';

const GW_HWNDNEXT = 2;
const GW_HWNDPREV = 3;
const GWL_EXSTYLE = -20;
const WS_EX_TOOLWINDOW = 0x00000080;
const WS_EX_APPWINDOW = 0x00040000;
const DWMWA_EXTENDED_FRAME_BOUNDS = 9;
const DWMWA_CLOAKED = 14;
const SWP_FLAGS = 0x0001 | 0x0002 | 0x0010 | 0x0200 | 0x0400; // NOSIZE | NOMOVE | NOACTIVATE | NOOWNERZORDER | NOSENDCHANGING

// Shell surfaces that are not app windows.
const SKIP_CLASSES = new Set([
  'Progman', 'WorkerW', 'Shell_TrayWnd', 'Shell_SecondaryTrayWnd', 'Windows.UI.Core.CoreWindow',
  'NotifyIconOverflowWindow', 'TopLevelWindowForOverflowXamlIsland', 'Xaml_WindowedPopupClass',
  'XamlExplorerHostIslandWindow', 'ForegroundStaging', 'MultitaskingViewFrame',
]);

let A = null;
const classBuf = Buffer.alloc(512);

function init() {
  if (process.platform !== 'win32') return false;
  const koffi = require('koffi');
  const user32 = koffi.load('user32.dll');
  const dwmapi = koffi.load('dwmapi.dll');
  const RECT = koffi.struct('SNOWLY_RECT', { left: 'int32', top: 'int32', right: 'int32', bottom: 'int32' });
  const H = 'intptr_t';
  const f = (lib, name, ret, args) => lib.func('__stdcall', name, ret, args);
  A = {
    GetTopWindow: f(user32, 'GetTopWindow', H, [H]),
    GetWindow: f(user32, 'GetWindow', H, [H, 'uint32']),
    IsWindowVisible: f(user32, 'IsWindowVisible', 'int', [H]),
    IsIconic: f(user32, 'IsIconic', 'int', [H]),
    IsZoomed: f(user32, 'IsZoomed', 'int', [H]),
    GetWindowLongPtrW: f(user32, 'GetWindowLongPtrW', 'intptr_t', [H, 'int']),
    GetWindowTextLengthW: f(user32, 'GetWindowTextLengthW', 'int', [H]),
    GetClassNameW: f(user32, 'GetClassNameW', 'int', [H, 'void *', 'int']),
    GetWindowRect: f(user32, 'GetWindowRect', 'int', [H, koffi.out(koffi.pointer(RECT))]),
    FindWindowW: f(user32, 'FindWindowW', H, ['str16', 'str16']),
    FindWindowExW: f(user32, 'FindWindowExW', H, [H, H, 'str16', 'str16']),
    SetWindowPos: f(user32, 'SetWindowPos', 'int', [H, H, 'int', 'int', 'int', 'int', 'uint32']),
    DwmGetRect: f(dwmapi, 'DwmGetWindowAttribute', 'long', [H, 'uint32', koffi.out(koffi.pointer(RECT)), 'uint32']),
    DwmGetInt: f(dwmapi, 'DwmGetWindowAttribute', 'long', [H, 'uint32', koffi.out(koffi.pointer('int32')), 'uint32']),
  };
  return true;
}

function className(h) {
  const n = A.GetClassNameW(h, classBuf, 256);
  return n > 0 ? classBuf.toString('utf16le', 0, n * 2) : '';
}

function listWindows(own) {
  const out = [];
  let h = Number(A.GetTopWindow(0));
  for (let guard = 0; h && guard < 3000; guard++) {
    if (h !== own && A.IsWindowVisible(h) && !A.IsIconic(h)) {
      const ex = Number(A.GetWindowLongPtrW(h, GWL_EXSTYLE));
      const isTool = (ex & WS_EX_TOOLWINDOW) && !(ex & WS_EX_APPWINDOW);
      if (!isTool && A.GetWindowTextLengthW(h) > 0) {
        const cloaked = [0];
        A.DwmGetInt(h, DWMWA_CLOAKED, cloaked, 4);
        if (!cloaked[0] && !SKIP_CLASSES.has(className(h))) {
          const r = {};
          if (A.DwmGetRect(h, DWMWA_EXTENDED_FRAME_BOUNDS, r, 16) !== 0) A.GetWindowRect(h, r);
          const w = r.right - r.left, hh = r.bottom - r.top;
          if (w >= 100 && hh >= 60) out.push({ id: String(h), x: r.left, y: r.top, w, h: hh, maximized: !!A.IsZoomed(h) });
        }
      }
    }
    h = Number(A.GetWindow(h, GW_HWNDNEXT));
  }
  return out;
}

// The top-level window that holds the desktop icons (Progman, or a WorkerW on some setups).
function desktopHost() {
  const progman = Number(A.FindWindowW('Progman', null));
  if (progman && Number(A.FindWindowExW(progman, 0, 'SHELLDLL_DefView', null))) return progman;
  let w = 0;
  for (let guard = 0; guard < 200; guard++) {
    w = Number(A.FindWindowExW(0, w, 'WorkerW', null));
    if (!w) break;
    if (Number(A.FindWindowExW(w, 0, 'SHELLDLL_DefView', null))) return w;
  }
  return progman;
}

function keepAboveDesktop(own) {
  const desk = desktopHost();
  if (!desk) return;
  const prev = Number(A.GetWindow(desk, GW_HWNDPREV));
  if (prev === own) return;
  // SetWindowPos places `own` right below `prev`, i.e. directly on top of the desktop.
  A.SetWindowPos(own, prev || 0, 0, 0, 0, 0, SWP_FLAGS);
}

module.exports = { init, listWindows, keepAboveDesktop, desktopHost };
