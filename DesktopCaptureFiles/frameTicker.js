// DesktopCaptureFiles/frameTicker.js
//
// Steady tick source for the recorder. Timers inside a worker keep firing
// while the extension tab is in the background, unlike requestAnimationFrame
// (paused) or page timers (throttled) — and the tab is almost always in the
// background while someone records.

let timer = null;

self.onmessage = (event) => {
  clearInterval(timer);
  timer = null;
  const interval = event.data && event.data.interval;
  if (interval > 0) {
    timer = setInterval(() => self.postMessage("tick"), interval);
  }
};
