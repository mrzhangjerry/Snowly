# Snowly ❄

A winter desktop for Windows: a 4K snowy village wallpaper, snow falling across the screen, snow piling up on top of the taskbar, and a little yellow snowplow that pushes it into drifts.

![Preview](docs/preview.png)

## Features

- **4K winter wallpaper.** On first run Snowly sets a 3840 × 2160 snowy village scene as your Windows wallpaper. Your previous wallpaper is remembered so you can switch back with one click.
- **Falling snow.** Flakes come in two depth layers, each with its own size, speed and drift.
- **Snow on the taskbar.** Flakes that reach the taskbar stay there. Snow slides when a slope gets too steep, so the drifts form natural slopes and mounds.
- **A snowplow that really pushes.** Snow in front of the blade builds into a growing wedge, and the plow slows down as the load gets heavier. Once the pile is taller than the blade, clumps tumble over the top and roll ahead. At the edge of the screen the plow leaves a drift behind, backs up, turns around and plows the other way.
- **Stays out of your way.** The overlay is transparent and click-through, and it never covers the taskbar itself.

## Download (no Node.js needed)

Download `Snowly-win-x64.zip` from the latest **Release**, unzip it and run `Snowly.exe`.

Every push to `main` builds the app and publishes a release named after the version in `package.json` (for example `v1.1.0`). To ship a new release, bump `version` and push.

> The app is not code-signed, so Windows SmartScreen may warn you the first time. Click **More info → Run anyway**.

## Run from source

1. Install Node.js LTS from https://nodejs.org
2. Open a terminal in the project folder and run:

```bash
npm install
```

```bash
npm start
```

Afterwards you can double-click `start-hidden.vbs` to start Snowly without a console window.

To build the `.exe` yourself:

```bash
npm run pack
```

The app is written to `dist\Snowly-win32-x64\Snowly.exe`.

## Tray menu

Click the ❄ icon in the notification area:

| Item | What it does |
|---|---|
| Snowfall | Off / Light / Medium / Heavy. "Off" stops new snow but keeps the snow on the taskbar and the plow |
| Snowplow / Snowplow size | Turn the plow on or off, change its size |
| Clear snow | Remove all snow from the taskbar |
| Winter wallpaper | Checked: use the winter wallpaper. Unchecked: go back to your previous wallpaper |
| Restore my previous wallpaper | Switch back to the wallpaper you had before Snowly |
| Pause | Freeze the animation |
| Show / hide | Also **Ctrl + Alt + S** |
| Start with Windows | Launch Snowly when you sign in |
| Quit | Close Snowly |

Settings are saved in `%APPDATA%\snowly\settings.json`.

## Use your own wallpaper

Replace `assets/wallpaper.jpg` with any image (3840 × 2160 recommended), then raise `WALLPAPER_VERSION` in `main.js` so the new image is applied on the next start.

## Web version

`web/index.html` is the original browser version: a Mac-style desktop where snow settles on top of the windows and snowmen stand on them. Open it in any browser.

## Project layout

```
main.js              Transparent always-on-top overlay, tray menu, shortcut, autostart, wallpaper
preload.js           Passes settings from the main process to the page
renderer/snow.js     Snow physics and drawing (falling snow, snow height map, sliding, the plow)
renderer/index.html  Overlay page. Opened in a browser it shows a preview with a mock taskbar
assets/wallpaper.jpg 4K wallpaper
web/index.html       Browser version
.github/workflows/   Builds the Windows app and publishes releases
```

Browser preview: open `renderer/index.html`. Add `?fast=4` to the address to play it at 4× speed.

To change how the snow behaves, edit the constants at the top of `renderer/snow.js`:

- `REPOSE`: how steep a drift can get
- `SNOW_RATE`: how fast snow builds up
- `BLADE_H`: blade height

## Known limitations

- Primary monitor only.
- If the taskbar is on the side or top of the screen, snow collects along the bottom edge of the screen instead.
- Snow also falls over full-screen games and videos. Press Ctrl + Alt + S to hide it.
- The wallpaper was upscaled to 4K from a 1671 × 941 image with an AI super-resolution model (EDSR ×4). It is sharper than a plain resize, but it does not have the detail of a native 4K image.
