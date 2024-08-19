// popup.js

const screenWidth = window.screen.availWidth;
const screenHeight = window.screen.availHeight;

const windowWidth = 800;
const windowHeight = 600;

const leftPosition = Math.round((screenWidth - windowWidth) / 2);
const topPosition = Math.round((screenHeight - windowHeight) / 2);

const cropshotWindow = {
  url: "desktopCapture.html",
  type: "popup",
  width: windowWidth,
  height: windowHeight,
  left: leftPosition,
  top: topPosition,
  focused: true,
};

chrome.windows.create(cropshotWindow);
