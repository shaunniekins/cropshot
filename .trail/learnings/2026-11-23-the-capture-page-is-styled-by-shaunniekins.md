---
title: "The capture page is styled by one hand-written stylesheet, not Tailwind"
author: Shaunniekins
date: 2026-11-23
branch: main
cost: { minutes: 21, tokens: 224619 }
id: l-314779ee
scope: repo
status: active
replaces: l-01b53276
src: agent
touches:
  - DesktopCaptureFiles/frameTicker.js
  - DesktopCaptureFiles/capture.js
  - styles/cropshot.css
  - desktopCapture.html
  - DesktopCaptureFiles/locationSettings.js
---

## Decided
- The capture page dropped the prebuilt Tailwind v2 file for a small plain-CSS stylesheet built on the kinetic-ui tokens (black, warm white, hairlines, Archivo) with Cropshot purple `#a78bfa` as the only accent. The extension has no build step, and the v2 file silently ignored v3 class syntax.
- JavaScript toggles meaning-based classes (`hidden`, `is-recording`, `is-camera-only`, `aria-pressed`), not utility color classes, so restyling stays in the CSS.
- Step numbers come from a CSS counter on `.step-no`, so hidden steps aren't counted and the numbering stays 01, 02, 03 in every mode.
## Tried and ruled out
- Headless Chrome with `--virtual-time-budget`/`--dump-dom` to check device lists: `enumerateDevices()` and `permissions.query()` don't resolve under virtual time, so the page looks broken when it isn't. Drive Chrome over the debugging protocol in real time instead, with `--use-fake-device-for-media-stream --use-fake-ui-for-media-stream`.
## Watch out
- Before permission is granted, `enumerateDevices()` returns placeholders with empty deviceIds. The lists skip those and show an "Allow camera/microphone" prompt instead of fake "Camera 1" entries.
## In the code:
- `styles/cropshot.css`, `assets/fonts/` (Archivo, OFL)
- `desktopCapture.html` (`.step-no`, `data-field`, `#stage`)
- `DesktopCaptureFiles/capture.js` `refreshDevices`, `fillDeviceSelect`, `renderPermission`, `renderMode`, `modeCopy`
