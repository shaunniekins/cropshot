// DesktopCaptureFiles/locationSettings.js
//
// Settings dialog. Files always go to Chrome's downloads folder, so this
// explains that and links to the Chrome pages where it (and camera/mic
// access) can be changed.

(function setupSettingsDialog() {
  const dialog = document.getElementById("settingsDialog");
  const openChromePage = (url) => chrome.tabs.create({ url });

  document
    .getElementById("settingsButton")
    .addEventListener("click", () => dialog.showModal());

  document
    .getElementById("closeSettings")
    .addEventListener("click", () => dialog.close());

  // Clicking the backdrop closes it too (Esc is handled by <dialog>)
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });

  document
    .getElementById("openDownloadSettings")
    .addEventListener("click", () =>
      openChromePage("chrome://settings/downloads")
    );

  document
    .getElementById("openSiteSettings")
    .addEventListener("click", () =>
      openChromePage(
        "chrome://settings/content/siteDetails?site=" +
          encodeURIComponent(`chrome-extension://${chrome.runtime.id}`)
      )
    );
})();
