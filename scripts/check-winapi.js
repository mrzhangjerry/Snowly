// CI smoke test on a real Windows machine: make sure every Windows API binding loads and runs.
const winapi = require('../winapi');
if (!winapi.init()) { console.error('winapi.init() returned false'); process.exit(1); }
const list = winapi.listWindows(0);
console.log(`listWindows: ${list.length} window(s)`);
for (const w of list.slice(0, 10)) console.log(' ', JSON.stringify(w));
console.log('desktopHost:', winapi.desktopHost());
console.log('Windows API bindings OK');
