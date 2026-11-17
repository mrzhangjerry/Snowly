// After packaging: put wallpaper.png next to Snowly.exe so it is easy to find and replace.
const fs = require('fs');
const path = require('path');
const out = path.join(__dirname, '..', 'dist', 'Snowly-win32-x64');
fs.copyFileSync(path.join(__dirname, '..', 'wallpaper.png'), path.join(out, 'wallpaper.png'));
console.log('Copied wallpaper.png to', out);
