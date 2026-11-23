---
title: "The bundled stylesheet is a static Tailwind v2 build, so v3-only class syntax silently does nothing"
author: Shaunniekins
date: 2026-11-23
branch: main
cost: { minutes: 4, tokens: 63961 }
id: l-01b53276
scope: repo
status: active
src: agent
touches:
  - desktopCapture.html
  - DesktopCaptureFiles/capture.js
  - tailwind.css
---

## Decided
- The capture page has no Tailwind build step: it loads a prebuilt Tailwind v2.2.19 full CSS file. Any v3/JIT syntax (opacity slash like `bg-black/70`, arbitrary values like `max-h-[70vh]`) has no matching rule and silently does nothing.
- For styles the v2 file lacks, write small plain-CSS classes in the page's `<style>` block instead of adding a build step.
## Watch out
- The page shows up unstyled when `tailwind.css` is missing: every layout and `hidden` toggle depends on it.
- The crop canvas must scale with `max-width`/`max-height` and `width/height: auto`. Forcing `width: 100%` along with a max-height distorts the screenshot's aspect ratio.
## In the code:
- `desktopCapture.html` `<link href="tailwind.css">`, `.crop-backdrop`, `.crop-canvas`, `.crop-selection`
- `DesktopCaptureFiles/capture.js` `openCropModal`
