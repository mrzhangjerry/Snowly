# Snowly ❄

Windows 冬季桌面：雪夜小木屋壁纸、满屏飘雪、积在任务栏顶上的雪，还有一台小黄铲雪车把雪推成雪堆。

![预览](docs/preview.png)

## 功能

- **雪夜小屋壁纸**：首次运行时按你屏幕的真实分辨率生成高清壁纸，并自动设为 Windows 桌面壁纸。可以一键恢复你原来的壁纸
- **满屏飘雪**：雪花分远近两层，大小、速度和飘动各不相同
- **任务栏积雪**：雪花落到任务栏顶上就积起来。坡太陡时雪会往下滑，所以雪堆是自然的斜坡
- **铲雪车推雪**：铲子挡住的雪都被推到前面，越堆越高，车也越推越慢。雪堆高过铲子后，雪块会从顶上滚下来。推到屏幕边缘就留下一个雪堆，然后倒车、掉头往回推
- **不影响使用**：覆盖层透明，鼠标点击直接穿透，也不会挡住任务栏本身

## 下载（不需要装 Node.js）

到仓库的 **Releases** 页面下载最新版的 `Snowly-win-x64.zip`，解压后双击 `Snowly.exe`。

每次推送到 `main` 都会自动打包，并发布成以 `package.json` 版本号命名的 Release（如 `v1.0.0`）。要发新版本，改 `version` 再推送即可。

> 程序没有代码签名，第一次运行时 Windows SmartScreen 可能拦截。点「更多信息」→「仍要运行」即可。

## 从源码运行

1. 安装 Node.js LTS：https://nodejs.org
2. 在项目文件夹里打开终端，运行：

```bash
npm install
```

```bash
npm start
```

之后双击 `start-hidden.vbs` 可以不带命令行窗口启动。

自己打包 exe：

```bash
npm run pack
```

输出在 `dist\Snowly-win32-x64\Snowly.exe`。

## 托盘菜单

右下角托盘区的 ❄ 图标：

| 菜单 | 作用 |
|---|---|
| 雪量 | 关 / 小 / 中 / 大。选「关」时不再下雪，只保留积雪和铲雪车 |
| 铲雪车 / 铲雪车大小 | 开关铲雪车，调大小 |
| 清空积雪 | 一键清空 |
| 雪夜小屋壁纸 | 勾选时设为壁纸，取消勾选时恢复原来的壁纸 |
| 恢复我原来的壁纸 | 换回第一次运行前的壁纸 |
| 暂停 | 冻结画面 |
| 显示 / 隐藏 | 快捷键 **Ctrl + Alt + S** |
| 开机自动启动 | 登录 Windows 时自动运行 |
| 退出 | 关闭程序 |

设置保存在 `%APPDATA%\snowly\settings.json`。

## 动态壁纸（可选）

Windows 的普通壁纸只能是静态图片，所以小屋的串灯和烟囱冒烟在桌面上是静止的。如果想让它们也动起来，可以安装免费的 [Lively Wallpaper](https://www.rocksdanister.com/lively/)，把 `renderer/wallpaper.html` 拖进去，再在 Snowly 托盘里取消勾选「雪夜小屋壁纸」。

## 网页版

`web/index.html` 是最早的网页版：仿 Mac 桌面，雪会积在窗口顶上，窗口上有雪人。用浏览器直接打开即可。

## 项目结构

```
main.js               透明置顶覆盖窗口、托盘菜单、快捷键、开机自启、设置壁纸
preload.js            主进程和画面之间传设置
renderer/snow.js      积雪物理和绘制（飘雪、积雪高度、雪的滑落、铲雪车推雪）
renderer/wallpaper.js 雪夜小屋壁纸的绘制
renderer/wallpaper.html + wallpaper-page.js  生成壁纸图片 / 动态壁纸页面
renderer/index.html   覆盖层页面（用浏览器打开就是带模拟任务栏的预览）
web/index.html        网页版
.github/workflows/    自动打包 Windows 版
```

浏览器预览：打开 `renderer/index.html`，地址后加 `?fast=4` 可以 4 倍速播放。

想调手感，就改 `renderer/snow.js` 顶部的这几个参数：

- `REPOSE`：雪堆坡度
- `SNOW_RATE`：积雪速度
- `BLADE_H`：铲子高度

## 已知限制

- 只支持主显示器
- 任务栏放在屏幕侧边或顶部时，雪会积在屏幕最底部
- 全屏玩游戏或看视频时雪也会飘在上面，按 Ctrl + Alt + S 可以隐藏
