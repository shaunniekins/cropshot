// popup.js

const createDate = {
  url: "desktopCapture.html",
  type: "popup",
  width: 800,
  height: 600,
};
chrome.windows.create(createDate);
