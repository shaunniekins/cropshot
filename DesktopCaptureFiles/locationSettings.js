// DesktopCaptureFiles/locationSettings.js

// Store the initial HTML content of the first div
const initialContent = document.querySelector("body > div").innerHTML;

// Function to restore initial content and reattach event listeners
function restoreInitialContent() {
  const firstDiv = document.querySelector("body > div");
  firstDiv.innerHTML = initialContent;
  attachSettingsButtonListener();
}

function getDefaultSavePath() {
  const userAgent = navigator.userAgent;
  let browserName = "Unknown";

  if (userAgent.includes("Chrome") && !userAgent.includes("Edg")) {
    browserName = "Chrome";
  } else if (userAgent.includes("Firefox")) {
    browserName = "Firefox";
  } else if (userAgent.includes("Safari") && !userAgent.includes("Chrome")) {
    browserName = "Safari";
  } else if (userAgent.includes("Edg")) {
    browserName = "Edge";
  } else if (userAgent.includes("OPR") || userAgent.includes("Opera")) {
    browserName = "Opera";
  } else if (userAgent.includes("MSIE") || userAgent.includes("Trident")) {
    browserName = "Internet Explorer";
  }

  console.log("userAgent:", userAgent);

  return `${browserName}'s download location`;
}

// Function to attach event listener to the settings button
function attachSettingsButtonListener() {
  document
    .getElementById("settingsButton")
    .addEventListener("click", function () {
      const firstDiv = document.querySelector("body > div");
      const saveLocation =
        localStorage.getItem("saveLocation") || "askEverytime";
      const savePath = getDefaultSavePath();

      firstDiv.innerHTML = `
        <div class="w-full flex justify-between items-center">
          <button id="backButton" class="flex items-center gap-1 cursor-pointer">
            <span class="material-symbols-outlined h-5 w-5 text-white">
              arrow_back_ios
            </span>
            <h1 class="font-bold text-xl">Settings</h1>
          </button>
        </div>

        <div class="w-full mt-5 mb-2 gap-3 flex flex-col">
          <h3 class="text-white text-lg font-semibold">Save Location</h3>
          <div class="flex flex-col gap-2">
             <!-- <label class="text-white text-lg">
              <input type="radio" name="saveLocation" value="askEverytime" ${
                saveLocation === "askEverytime" ? "checked" : ""
              } />
              Ask everytime
            </label>
            <label class="text-white text-lg">
              <input type="radio" name="saveLocation" value="setPath" ${
                saveLocation === "setPath" ? "checked" : ""
              } />
              <span id="savePath">${savePath}</span>
            </label> -->
            <div class="text-white text-lg">${savePath}</div>
          </div>
        </div>
      `;

      // Add event listener for the back button
      document
        .getElementById("backButton")
        .addEventListener("click", restoreInitialContent);

      document
        .querySelectorAll('input[name="saveLocation"]')
        .forEach((radio) => {
          radio.addEventListener("change", function () {
            localStorage.setItem("saveLocation", this.value);
          });
        });
    });
}

// Initial attachment of the settings button listener
attachSettingsButtonListener();
