// DesktopCaptureFiles/capture.js

let hasAudioPermission = false;
let hasCameraPermission = false;
let liveCameraStream = null; // For the live preview
let liveCameraDeviceId = null;

// DOM elements for live preview
let liveCameraPreviewContainer;
let liveCameraVideo;

// Draw the camera bubble into photos when a camera stream is supplied
const USE_CAMERA_OVERLAY = true;

const NO_CAMERA = "noCamera";
const CAMERA_ONLY = "cameraOnly";
const NO_MIC = "noMic";

// LocalStorage keys for user preferences
const STORAGE_KEYS = {
  CAPTURE_TYPE: "cropshot_capture_type",
  SCREENSHOT_TYPE: "cropshot_screenshot_type",
  CAMERA_ID: "cropshot_camera_id",
  MICROPHONE_ID: "cropshot_microphone_id",
  BACKGROUND_COLOR: "cropshot_background_color",
};

function savePreference(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch (err) {
    console.warn("Failed to save preference:", key, err);
  }
}

function loadPreference(key, defaultValue = null) {
  try {
    return localStorage.getItem(key) || defaultValue;
  } catch (err) {
    console.warn("Failed to load preference:", key, err);
    return defaultValue;
  }
}

const $ = (id) => document.getElementById(id);

document.addEventListener("DOMContentLoaded", async () => {
  liveCameraPreviewContainer = $("liveCameraPreviewContainer");
  liveCameraVideo = $("liveCameraVideo");

  setupModeControls();
  setupDeviceControls();

  await refreshPermissions();
  await refreshDevices();
  watchPermission("camera");
  watchPermission("microphone");
  // Plugging in or removing a camera/mic updates the lists right away
  navigator.mediaDevices.addEventListener("devicechange", refreshDevices);
});

// ---------- Mode: video or screenshot ----------

function currentCaptureType() {
  return $("captureType").value; // video | photo
}

function setupModeControls() {
  $("captureType").value = loadPreference(STORAGE_KEYS.CAPTURE_TYPE, "video");
  $("screenshotType").value = loadPreference(
    STORAGE_KEYS.SCREENSHOT_TYPE,
    "fullscreen"
  );
  $("backgroundColorSelect").value = loadPreference(
    STORAGE_KEYS.BACKGROUND_COLOR,
    "#000000"
  );

  $("tabVideo").addEventListener("click", () => setMode("video"));
  $("tabPhoto").addEventListener("click", () => setMode("photo"));

  $("screenshotType").addEventListener("change", (e) => {
    savePreference(STORAGE_KEYS.SCREENSHOT_TYPE, e.target.value);
    renderMode();
  });
  $("backgroundColorSelect").addEventListener("change", (e) => {
    savePreference(STORAGE_KEYS.BACKGROUND_COLOR, e.target.value);
    renderMode();
  });

  setMode(currentCaptureType());
}

function setMode(type) {
  if (activeSession) return; // don't switch modes mid-recording
  $("captureType").value = type;
  savePreference(STORAGE_KEYS.CAPTURE_TYPE, type);

  $("tabVideo").setAttribute("aria-pressed", String(type === "video"));
  $("tabPhoto").setAttribute("aria-pressed", String(type === "photo"));
  showField("screenshot", type === "photo");
  showField("camera", type === "video");
  showField("microphone", type === "video");

  applyCameraSelection();
  applyMicSelection();
}

function showField(name, visible) {
  const field = document.querySelector(`[data-field="${name}"]`);
  if (field) field.classList.toggle("hidden", !visible);
}

function currentModeKey() {
  if (currentCaptureType() === "photo") {
    return $("screenshotType").value === "custom" ? "area" : "fullscreen";
  }
  return $("cameraSelect").value === CAMERA_ONLY ? "cameraOnly" : "screen";
}

function modeCopy(key) {
  const hasPip = "documentPictureInPicture" in window;
  const controlsStep = hasPip
    ? "A small floating window shows your bubble, a timer, Pause and Stop. It stays on top of every app."
    : 'Stop with the "Stop recording" button on this page or Chrome\'s "Stop sharing" bar.';
  const copy = {
    screen: {
      headline: "Record your screen, <em>talk over it.</em>",
      lead: "Your screen, your voice and a bubble of you, saved as a video file.",
      button: "Choose screen and record",
      steps: [
        "Chrome asks what to share: your entire screen, one window or one tab.",
        controlsStep,
        "Recording starts after a 3, 2, 1 countdown.",
        "Press Stop and the video (.webm) downloads.",
      ],
    },
    cameraOnly: {
      headline: "Record just you, <em>no screen.</em>",
      lead: "Only your camera, centered on the background color you pick.",
      button: "Start camera recording",
      steps: [
        controlsStep,
        "Recording starts after a 3, 2, 1 countdown.",
        "Press Stop and the video (.webm) downloads.",
      ],
    },
    fullscreen: {
      headline: "Capture your screen, <em>instantly.</em>",
      lead: "A full-size picture of whatever you share, saved as a PNG.",
      button: "Choose screen and capture",
      steps: [
        "Chrome asks what to capture: your entire screen, one window or one tab.",
        "The screenshot (.png) downloads right away.",
      ],
    },
    area: {
      headline: "Capture your screen, <em>crop it.</em>",
      lead: "Grab the screen, then keep only the part that matters.",
      button: "Choose screen, then select area",
      steps: [
        "Chrome asks what to capture: your entire screen, one window or one tab.",
        "The screenshot opens here. Drag over the area you want to keep.",
        "Press Download and only that area (.png) is saved.",
      ],
    },
  };
  return copy[key];
}

function renderMode() {
  const key = currentModeKey();
  const copy = modeCopy(key);

  $("modeHeadline").innerHTML = copy.headline;
  $("modeLead").textContent = copy.lead;
  $("nextSteps").replaceChildren(
    ...copy.steps.map((text) => {
      const li = document.createElement("li");
      li.textContent = text;
      return li;
    })
  );
  if (!activeSession) setCaptureButtonRecording(false);

  // Preview stage
  const stage = $("stage");
  const cameraOn =
    currentCaptureType() === "video" && $("cameraSelect").value !== NO_CAMERA;
  stage.classList.toggle("is-camera-only", key === "cameraOnly");
  stage.style.backgroundColor =
    key === "cameraOnly" ? $("backgroundColorSelect").value : "";

  let placeholder;
  if (key === "fullscreen" || key === "area") {
    placeholder =
      "Screenshots don't use the camera or microphone. Choose a screen and the picture is taken right away.";
  } else if (cameraOn) {
    placeholder =
      "This is your bubble. It appears in the corner of the video. For a single window or tab, it's added to the video for you.";
  } else {
    placeholder =
      "Camera off. Pick a camera to add a round bubble of you to the corner of the video.";
  }
  $("stagePlaceholder").textContent = placeholder;
  showField("background", key === "cameraOnly");

  const cameraHelp = $("cameraHelp");
  if (!cameraHelp.classList.contains("is-error")) {
    cameraHelp.textContent =
      key === "cameraOnly"
        ? "Records only your camera, centered on the background you pick below."
        : "Adds a round bubble of you to the corner of the video.";
  }
}

// ---------- Permissions ----------

async function queryPermission(name) {
  try {
    return (await navigator.permissions.query({ name })).state; // granted | prompt | denied
  } catch {
    return "prompt";
  }
}

async function refreshPermissions() {
  hasCameraPermission = (await queryPermission("camera")) === "granted";
  hasAudioPermission = (await queryPermission("microphone")) === "granted";
}

async function watchPermission(name) {
  try {
    const status = await navigator.permissions.query({ name });
    status.addEventListener("change", async () => {
      await refreshPermissions();
      await refreshDevices();
    });
  } catch {
    // Permissions API unavailable: the Allow buttons still work
  }
}

async function requestDeviceAccess(kind) {
  const constraints = kind === "camera" ? { video: true } : { audio: true };
  try {
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    stream.getTracks().forEach((t) => t.stop());
  } catch (err) {
    console.warn(`${kind} access not granted:`, err);
  }
  await refreshPermissions();
  await refreshDevices();
}

async function renderPermission(kind) {
  const box = $(`${kind}Permission`);
  const text = $(`${kind}PermissionText`);
  const button = $(`${kind}PermissionButton`);
  const label = kind === "camera" ? "camera" : "microphone";
  const state = await queryPermission(kind);

  box.classList.toggle("hidden", state === "granted");
  if (state === "denied") {
    text.textContent = `Chrome is blocking the ${label}. Allow it in site settings, then come back to this tab.`;
    button.textContent = "Open site settings";
    button.onclick = () => $("openSiteSettings").click();
  } else if (state === "prompt") {
    text.textContent = `Allow ${label} access so Cropshot can list your ${label}s by name.`;
    button.textContent = `Allow ${label}`;
    button.onclick = () => requestDeviceAccess(kind);
  }
}

// ---------- Device lists ----------

function setupDeviceControls() {
  $("cameraSelect").addEventListener("change", (e) => {
    savePreference(STORAGE_KEYS.CAMERA_ID, e.target.value);
    applyCameraSelection();
  });
  $("microphoneSelect").addEventListener("change", (e) => {
    savePreference(STORAGE_KEYS.MICROPHONE_ID, e.target.value);
    applyMicSelection();
  });
}

// Rebuilds both lists from what is plugged in right now. Called on load,
// after permission changes and on every devicechange.
async function refreshDevices() {
  // Permission prompts first: they shouldn't wait on the device lookup
  await Promise.all([renderPermission("camera"), renderPermission("microphone")]);

  let devices = [];
  try {
    devices = await navigator.mediaDevices.enumerateDevices();
  } catch (err) {
    console.error("Error enumerating devices:", err);
  }
  // Without permission Chrome returns placeholders with empty ids: skip them
  const cameras = devices.filter((d) => d.kind === "videoinput" && d.deviceId);
  const mics = devices.filter((d) => d.kind === "audioinput" && d.deviceId);

  const cameraFixed = [[NO_CAMERA, "Camera off"]];
  if (cameras.length > 0) cameraFixed.push([CAMERA_ONLY, "Camera only (no screen)"]);

  fillDeviceSelect($("cameraSelect"), cameraFixed, cameras, "Camera", STORAGE_KEYS.CAMERA_ID);
  fillDeviceSelect($("microphoneSelect"), [[NO_MIC, "Microphone off"]], mics, "Microphone", STORAGE_KEYS.MICROPHONE_ID);

  applyCameraSelection();
  applyMicSelection();
}

function fillDeviceSelect(select, fixed, devices, fallbackName, storageKey) {
  // First fill restores the saved choice; later fills keep the current one
  const wanted = select.dataset.filled
    ? select.value
    : loadPreference(storageKey, fixed[0][0]);

  select.replaceChildren(
    ...fixed.map(([value, text]) => new Option(text, value)),
    ...devices.map(
      (d, i) => new Option(d.label || `${fallbackName} ${i + 1}`, d.deviceId)
    )
  );
  const values = [...select.options].map((o) => o.value);
  // A device that was unplugged falls back to "off"
  select.value = values.includes(wanted) ? wanted : fixed[0][0];
  select.dataset.filled = "true";
}

function firstCameraId() {
  const option = [...$("cameraSelect").options].find(
    (o) => o.value !== NO_CAMERA && o.value !== CAMERA_ONLY
  );
  return option ? option.value : null;
}

async function applyCameraSelection() {
  renderMode();
  if (activeSession) return;

  const value = $("cameraSelect").value;
  if (currentCaptureType() !== "video" || value === NO_CAMERA) {
    stopLiveCameraPreview();
    return;
  }
  const deviceId = value === CAMERA_ONLY ? firstCameraId() : value;
  if (!deviceId) {
    stopLiveCameraPreview();
    return;
  }
  if (liveCameraStream && liveCameraStream.active && liveCameraDeviceId === deviceId) {
    liveCameraPreviewContainer.classList.remove("hidden");
    return;
  }
  await startLiveCameraPreview(deviceId);
}

async function startLiveCameraPreview(deviceId) {
  if (!liveCameraPreviewContainer || !liveCameraVideo) return;
  if (liveCameraStream) liveCameraStream.getTracks().forEach((t) => t.stop());
  liveCameraStream = null;
  liveCameraDeviceId = null;

  const help = $("cameraHelp");
  try {
    liveCameraStream = await navigator.mediaDevices.getUserMedia({
      video: { deviceId: { exact: deviceId } },
    });
    liveCameraDeviceId = deviceId;
    hasCameraPermission = true;
    liveCameraVideo.srcObject = liveCameraStream;
    await liveCameraVideo.play();
    liveCameraPreviewContainer.classList.remove("hidden");
    help.classList.remove("is-error");
    renderMode(); // restores the normal help text
  } catch (err) {
    console.error("Error starting camera preview:", err);
    stopLiveCameraPreview();
    help.classList.add("is-error");
    help.textContent =
      "Couldn't start this camera. Another app may be using it, or access is blocked.";
  }
}

function stopLiveCameraPreview() {
  if (!liveCameraPreviewContainer || !liveCameraVideo) return;
  if (liveCameraStream) {
    liveCameraStream.getTracks().forEach((track) => track.stop());
    liveCameraStream = null;
  }
  liveCameraDeviceId = null;
  liveCameraVideo.srcObject = null;
  liveCameraPreviewContainer.classList.add("hidden");
}

// ---------- Microphone level meter ----------

let micMeter = null;
let micMeterToken = 0;

async function applyMicSelection() {
  stopMicMeter();
  const token = ++micMeterToken;
  const micId = $("microphoneSelect").value;
  const help = $("micHelp");
  const meter = $("micLevel").parentElement;
  const active =
    currentCaptureType() === "video" && micId !== NO_MIC && hasAudioPermission;

  meter.classList.toggle("hidden", !active);
  help.classList.remove("is-error");
  help.textContent = active
    ? "Say something: the bar moves when this mic hears you."
    : "Turn on a microphone to record your voice.";
  if (!active || activeSession) return;

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { deviceId: { exact: micId } },
    });
    if (token !== micMeterToken) {
      stream.getTracks().forEach((t) => t.stop()); // a newer choice won
      return;
    }
    const audioCtx = new AudioContext();
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 512;
    audioCtx.createMediaStreamSource(stream).connect(analyser);
    const samples = new Uint8Array(analyser.fftSize);
    const level = $("micLevel");

    const tick = () => {
      analyser.getByteTimeDomainData(samples);
      let peak = 0;
      for (const v of samples) peak = Math.max(peak, Math.abs(v - 128));
      level.style.transform = `scaleX(${Math.min(1, peak / 64)})`;
      micMeter.frame = requestAnimationFrame(tick);
    };
    micMeter = { stream, audioCtx, frame: requestAnimationFrame(tick) };
  } catch (err) {
    console.error("Error opening microphone:", err);
    help.classList.add("is-error");
    help.textContent =
      "Couldn't open this microphone. Pick another one or check access.";
    meter.classList.add("hidden");
  }
}

function stopMicMeter() {
  if (!micMeter) return;
  cancelAnimationFrame(micMeter.frame);
  micMeter.stream.getTracks().forEach((t) => t.stop());
  micMeter.audioCtx.close();
  micMeter = null;
  $("micLevel").style.transform = "scaleX(0)";
}


document.addEventListener("click", (event) => {
  if (!event.target.closest("#capture")) return;

  // While recording, the capture button doubles as the stop button
  if (activeSession) {
    activeSession.stop();
    return;
  }

  const captureType = document.getElementById("captureType").value; // photo | video
  const screenshotType = document.getElementById("screenshotType").value; // fullscreen | custom
  const selectedMicId = document.getElementById("microphoneSelect").value;
  const selectedCameraId = document.getElementById("cameraSelect").value;
  const selectedBackgroundColor = document.getElementById(
    "backgroundColorSelect"
  ).value;

  if (captureType === "photo") {
    handlePhotoCapture(screenshotType);
    return;
  }

  const isCameraOnly = selectedCameraId === "cameraOnly";
  const cameraId =
    selectedCameraId === "noCamera" || isCameraOnly ? null : selectedCameraId;

  // Picture-in-Picture needs the click's user activation, so request it
  // before anything async (the screen picker, permissions) happens.
  const pipPromise = openRecorderWindow(Boolean(cameraId) || isCameraOnly);

  if (isCameraOnly) {
    handleCameraOnlyCapture(
      selectedMicId,
      selectedBackgroundColor,
      pipPromise
    ).then((started) => {
      if (!started) pipPromise.then((pipWin) => pipWin && pipWin.close());
    });
    return;
  }

  startScreenRecording({ cameraId, micId: selectedMicId, pipPromise });
});

function startScreenRecording({ cameraId, micId, pipPromise }) {
  chrome.desktopCapture.chooseDesktopMedia(
    ["screen", "window", "tab"],
    async (streamId) => {
      const pipWin = await pipPromise;
      if (!streamId) {
        console.log("User cancelled or failed to choose a screen");
        if (pipWin) pipWin.close();
        return;
      }

      let screenStream;
      try {
        screenStream = await getDesktopStream(streamId);
      } catch (err) {
        console.error("Error capturing screen:", err);
        if (pipWin) pipWin.close();
        alert("Couldn't start the screen capture. Please try again.");
        return;
      }

      // The floating bubble window is only part of the video when a whole
      // screen is shared. For a single window or tab, draw the camera in.
      const surface = screenStream.getVideoTracks()[0].getSettings()
        .displaySurface;
      const bubbleIsCaptured =
        Boolean(pipWin) && surface !== "window" && surface !== "browser";

      const cameraStream =
        cameraId && hasCameraPermission && !bubbleIsCaptured
          ? await getCameraStream(cameraId)
          : null;
      const audioStream = await getMicStream(micId);

      startRecordingSession({
        sourceKind: "screen",
        sourceStream: screenStream,
        cameraStream,
        audioStream,
        pipWin,
        previewCameraId: cameraId,
      });
    }
  );
}

async function getDesktopStream(streamId) {
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        mandatory: {
          chromeMediaSource: "desktop",
          chromeMediaSourceId: streamId,
          maxWidth: Math.max(1920, screen.width),
          maxHeight: Math.max(1080, screen.height),
          maxFrameRate: 60,
        },
      },
    });
  } catch (err) {
    console.warn("HD screen constraints failed, retrying with defaults:", err);
    return navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        mandatory: {
          chromeMediaSource: "desktop",
          chromeMediaSourceId: streamId,
        },
      },
    });
  }
}

async function getCameraStream(deviceId) {
  try {
    return await navigator.mediaDevices.getUserMedia({
      video: {
        deviceId: { exact: deviceId },
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
    });
  } catch (err) {
    console.error("Error getting camera stream:", err);
    return null;
  }
}

async function getMicStream(micId) {
  if (!micId || micId === "noMic" || !hasAudioPermission) return null;
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: { deviceId: { exact: micId } },
    });
  } catch (err) {
    console.error("Error capturing audio:", err);
    return null;
  }
}

// Handle photo capture without screen sharing
async function handlePhotoCapture(screenshotType) {
  try {
    // Use Chrome's desktop capture API to take a screenshot
    chrome.desktopCapture.chooseDesktopMedia(
      ["screen", "window", "tab"],
      async (streamId) => {
        if (!streamId) {
          console.log("User cancelled or failed to choose a screen");
          return;
        }

        const videoConstraints = {
          mandatory: {
            chromeMediaSource: "desktop",
            chromeMediaSourceId: streamId,
            maxWidth: Math.max(1920, screen.width),
            maxHeight: Math.max(1080, screen.height),
          },
        };

        try {
          const screenStream = await navigator.mediaDevices.getUserMedia({
            video: videoConstraints,
            audio: false,
          });

          // No camera stream for photo mode
          if (screenshotType === "custom") {
            await capturePhoto(screenStream, null, true);
          } else {
            await capturePhoto(screenStream, null, false);
          }
        } catch (err) {
          console.error("Error capturing screen for photo:", err);
        }
      }
    );
  } catch (err) {
    console.error("Error in photo capture:", err);
  }
}

// Handle camera-only capture for video mode
// Resolves true once recording has started, false if it could not
async function handleCameraOnlyCapture(selectedMicId, backgroundColor, pipPromise) {
  try {
    // Get first available camera
    const cameraSelect = document.getElementById("cameraSelect");
    const firstCameraOption = [...cameraSelect.options].find(
      (o) =>
        o.value !== "noCamera" && o.value !== "cameraOnly" && o.value !== ""
    );

    if (!firstCameraOption) {
      console.error("No camera available for camera-only mode");
      alert(
        "No camera available for camera-only mode. Please select a specific camera."
      );
      return false;
    }

    // Ensure we have camera permission
    if (!hasCameraPermission) {
      try {
        const tempStream = await navigator.mediaDevices.getUserMedia({
          video: true,
        });
        hasCameraPermission = true;
        tempStream.getTracks().forEach((track) => track.stop());
      } catch (permErr) {
        console.error("Camera permission denied:", permErr);
        alert("Camera permission is required for camera-only mode.");
        return false;
      }
    }

    let cameraStream = null;
    try {
      cameraStream = await navigator.mediaDevices.getUserMedia({
        video: {
          deviceId: { exact: firstCameraOption.value },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });
    } catch (camErr) {
      console.error("Error getting camera stream:", camErr);
      // Fallback: try without device constraint
      try {
        cameraStream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        });
      } catch (fallbackErr) {
        console.error("Error getting any camera stream:", fallbackErr);
        alert("Unable to access camera. Please check your camera permissions.");
        return false;
      }
    }

    const audioStream = await getMicStream(selectedMicId);

    // The camera is drawn centered on the chosen background color
    startRecordingSession({
      sourceKind: "cameraOnly",
      sourceStream: null,
      cameraStream,
      audioStream,
      backgroundColor,
      pipWin: await pipPromise,
      previewCameraId: firstCameraOption.value,
    });
    return true;
  } catch (err) {
    console.error("Error in camera-only capture:", err);
    alert(
      "An error occurred while starting camera-only capture. Please try again."
    );
    return false;
  }
}

async function capturePhoto(screenStream, cameraStream, allowCustom = false) {
  let screenVideo = null;
  let cameraVideo = null;

  try {
    // playStream waits for real frames, so the screenshot is never blank
    screenVideo = await playStream(screenStream);
    if (cameraStream) cameraVideo = await playStream(cameraStream);

    const fullCanvas = document.createElement("canvas");
    fullCanvas.width = screenVideo.videoWidth;
    fullCanvas.height = screenVideo.videoHeight;
    const fullCtx = fullCanvas.getContext("2d");
    fullCtx.drawImage(screenVideo, 0, 0, fullCanvas.width, fullCanvas.height);

    if (
      USE_CAMERA_OVERLAY &&
      cameraStream &&
      cameraVideo &&
      cameraVideo.videoWidth > 0
    ) {
      // For photos, always use the overlay approach since live preview
      // position may not match desired overlay position
      drawCameraOverlay(
        fullCtx,
        cameraVideo,
        fullCanvas.width,
        fullCanvas.height
      );
    }

    if (allowCustom) {
      await openCropModal(fullCanvas);
    } else {
      await downloadCanvas(
        fullCanvas,
        `screenshot_${getFormattedDateTime()}.png`
      );
    }

    screenStream.getTracks().forEach((track) => track.stop());
    if (cameraStream) cameraStream.getTracks().forEach((track) => track.stop());
    // Don't stop live preview - keep it running for next capture
    screenVideo.srcObject = null;
    if (cameraVideo) cameraVideo.srcObject = null;
  } catch (error) {
    console.error("Error capturing photo:", error);
    screenStream.getTracks().forEach((track) => track.stop());
    if (cameraStream) cameraStream.getTracks().forEach((track) => track.stop());
    // Don't stop live preview on error - keep it running
  }
}

function drawCameraOverlay(context, cameraVideo, canvasW, canvasH) {
  drawCameraOverlayOnCanvas(context, cameraVideo, canvasW, canvasH);
}

function drawCameraOverlayOnCanvas(context, cameraVideo, canvasW, canvasH) {
  // Loom-style bubble in the bottom-left corner
  const camSize = Math.min(300, Math.min(canvasW, canvasH) / 3);
  drawCameraCircle(
    context,
    cameraVideo,
    30 + camSize / 2,
    canvasH - camSize / 2 - 30,
    camSize
  );
}

// Draws the camera as a cover-fit circle centered at (cx, cy)
function drawCameraCircle(context, cameraVideo, cx, cy, diameter) {
  const radius = diameter / 2;
  context.save();

  // Soft shadow, then a white ring
  context.beginPath();
  context.arc(cx, cy, radius + 8, 0, 2 * Math.PI);
  context.fillStyle = "rgba(0, 0, 0, 0.3)";
  context.fill();

  context.beginPath();
  context.arc(cx, cy, radius + 4, 0, 2 * Math.PI);
  context.fillStyle = "rgba(255, 255, 255, 0.9)";
  context.fill();

  context.beginPath();
  context.arc(cx, cy, radius, 0, 2 * Math.PI);
  context.clip();

  const aspectRatio = cameraVideo.videoWidth / cameraVideo.videoHeight;
  const drawWidth = aspectRatio > 1 ? diameter * aspectRatio : diameter;
  const drawHeight = aspectRatio > 1 ? diameter : diameter / aspectRatio;
  context.drawImage(
    cameraVideo,
    cx - drawWidth / 2,
    cy - drawHeight / 2,
    drawWidth,
    drawHeight
  );
  context.restore();
}

async function downloadCanvas(canvas, filename) {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      resolve();
    }, "image/png");
  });
}

async function openCropModal(fullCanvas) {
  return new Promise((resolve) => {
    const modal = document.getElementById("cropModal");
    const cropCanvas = document.getElementById("cropCanvas");
    const selection = document.getElementById("cropSelection");
    const confirmBtn = document.getElementById("confirmCrop");
    const cancelBtn = document.getElementById("cancelCrop");

    // Set canvas size
    cropCanvas.width = fullCanvas.width;
    cropCanvas.height = fullCanvas.height;
    const ctx = cropCanvas.getContext("2d");
    ctx.drawImage(fullCanvas, 0, 0);

    // Scaling is handled by .crop-canvas (max-width/max-height keep aspect ratio)

    let startX = 0,
      startY = 0,
      currentX = 0,
      currentY = 0,
      dragging = false;
    function updateSelection() {
      const x = Math.min(startX, currentX);
      const y = Math.min(startY, currentY);
      const w = Math.abs(startX - currentX);
      const h = Math.abs(startY - currentY);
      if (w < 5 || h < 5) {
        selection.classList.add("hidden");
        return;
      }
      selection.classList.remove("hidden");
      // The selection is tracked in full-resolution pixels, but the canvas is
      // shown scaled down, so convert back to on-screen pixels for the box.
      const displayScale =
        cropCanvas.getBoundingClientRect().width / fullCanvas.width;
      selection.style.left = cropCanvas.offsetLeft + x * displayScale + "px";
      selection.style.top = cropCanvas.offsetTop + y * displayScale + "px";
      selection.style.width = w * displayScale + "px";
      selection.style.height = h * displayScale + "px";
    }

    function canvasRelative(e) {
      const rect = cropCanvas.getBoundingClientRect();
      const scaleX = fullCanvas.width / rect.width;
      const scaleY = fullCanvas.height / rect.height;
      // Clamp so dragging past an edge can't select outside the image
      const clamp = (v, max) => Math.min(Math.max(v, 0), max);
      return {
        x: clamp((e.clientX - rect.left) * scaleX, fullCanvas.width),
        y: clamp((e.clientY - rect.top) * scaleY, fullCanvas.height),
      };
    }

    cropCanvas.onmousedown = (e) => {
      dragging = true;
      const p = canvasRelative(e);
      startX = currentX = p.x;
      startY = currentY = p.y;
      updateSelection();
    };
    window.onmousemove = (e) => {
      if (!dragging) return;
      const p = canvasRelative(e);
      currentX = p.x;
      currentY = p.y;
      updateSelection();
    };
    window.onmouseup = () => {
      dragging = false;
    };

    cancelBtn.onclick = close;
    function close() {
      modal.classList.add("hidden");
      selection.classList.add("hidden");
      cropCanvas.onmousedown = null;
      window.onmousemove = null;
      window.onmouseup = null;
      cancelBtn.onclick = null;
      confirmBtn.onclick = null;
      window.onkeydown = null;
      resolve();
    }

    // Esc cancels, like any dialog
    window.onkeydown = (e) => {
      if (e.key === "Escape") close();
    };

    confirmBtn.onclick = async () => {
      const x = Math.min(startX, currentX);
      const y = Math.min(startY, currentY);
      const w = Math.abs(startX - currentX);
      const h = Math.abs(startY - currentY);
      const outCanvas = document.createElement("canvas");
      if (w >= 5 && h >= 5) {
        outCanvas.width = w;
        outCanvas.height = h;
        outCanvas
          .getContext("2d")
          .drawImage(fullCanvas, x, y, w, h, 0, 0, w, h);
      } else {
        outCanvas.width = fullCanvas.width;
        outCanvas.height = fullCanvas.height;
        outCanvas.getContext("2d").drawImage(fullCanvas, 0, 0);
      }
      await downloadCanvas(
        outCanvas,
        `screenshot_${getFormattedDateTime()}.png`
      );
      close();
    };

    modal.classList.remove("hidden");
    confirmBtn.focus();
  });
}

// ---------- Recording session (Loom-style) ----------
//
// - The camera bubble and controls live in a Document Picture-in-Picture
//   window: always on top, so it is visible over every app and shows up in
//   full-screen recordings naturally.
// - When the bubble isn't part of the capture (a single window/tab, Camera
//   Only, or no PiP support), the camera is drawn onto a canvas instead.
// - Frames are driven by a worker timer, because requestAnimationFrame stops
//   when this tab is in the background — which it is while you record.

const RECORDING_FPS = 30;
const COUNTDOWN_SECONDS = 3;
let activeSession = null;

function openRecorderWindow(withCamera) {
  if (!("documentPictureInPicture" in window)) return Promise.resolve(null);
  return window.documentPictureInPicture
    .requestWindow({ width: 260, height: withCamera ? 330 : 90 })
    .catch((err) => {
      console.warn("Picture-in-Picture window unavailable:", err);
      return null;
    });
}

async function startRecordingSession({
  sourceKind, // "screen" | "cameraOnly"
  sourceStream,
  cameraStream,
  audioStream,
  backgroundColor = "#000000",
  pipWin,
  previewCameraId,
}) {
  const ownedStreams = [sourceStream, cameraStream, audioStream].filter(
    Boolean
  );
  const screenTrack = sourceStream ? sourceStream.getVideoTracks()[0] : null;
  const needsCanvas = !screenTrack || Boolean(cameraStream);
  const ticker = new Worker("/DesktopCaptureFiles/frameTicker.js");
  const chunks = [];

  let finished = false;
  let recorder = null;
  let controls = null;
  let elapsedMs = 0;
  let runningSince = null;
  let canvas = null;
  let ctx = null;
  let screenVideo = null;
  let cameraVideo = null;
  let videoTrack = screenTrack;

  activeSession = { stop };
  setCaptureButtonRecording(true);
  hideInPagePreview();
  stopMicMeter(); // the recording opens its own mic stream
  if (screenTrack) screenTrack.addEventListener("ended", stop); // Chrome's "Stop sharing"

  try {
    if (needsCanvas) {
      canvas = document.createElement("canvas");
      if (screenTrack) {
        screenVideo = await playStream(sourceStream);
        canvas.width = screenVideo.videoWidth || 1920;
        canvas.height = screenVideo.videoHeight || 1080;
      } else {
        canvas.width = 1920;
        canvas.height = 1080;
      }
      if (cameraStream) cameraVideo = await playStream(cameraStream);
      ctx = canvas.getContext("2d");
      drawCompositeFrame();
      videoTrack = canvas.captureStream(RECORDING_FPS).getVideoTracks()[0];
    }
  } catch (err) {
    console.error("Error preparing the recording:", err);
    finish();
    alert("Couldn't start the recording. Please try again.");
    return;
  }
  if (finished) return;

  ticker.onmessage = () => {
    if (ctx) drawCompositeFrame();
    updateTimer();
  };
  ticker.postMessage({ interval: needsCanvas ? 1000 / RECORDING_FPS : 250 });

  if (pipWin) {
    controls = buildRecorderControls(pipWin, {
      onPause: togglePause,
      onStop: stop,
    });
    pipWin.addEventListener("pagehide", stop); // closing the window stops too
    if (previewCameraId) {
      controls.showCamera(await ensurePreviewStream(previewCameraId));
      hideInPagePreview(); // the bubble lives in the PiP window now
    }
    for (let n = COUNTDOWN_SECONDS; n > 0 && !finished; n--) {
      controls.showCountdown(n);
      await sleep(1000);
    }
  }
  if (finished) return;

  const recordedStream = new MediaStream([
    videoTrack,
    ...(audioStream ? audioStream.getAudioTracks() : []),
  ]);
  recorder = new MediaRecorder(recordedStream, pickRecorderOptions());
  recorder.ondataavailable = (event) => {
    if (event.data && event.data.size > 0) chunks.push(event.data);
  };
  recorder.onstop = finish;
  recorder.start(1000);
  runningSince = performance.now();
  if (controls) controls.start();

  function drawCompositeFrame() {
    const w = canvas.width;
    const h = canvas.height;
    if (screenVideo) {
      ctx.drawImage(screenVideo, 0, 0, w, h);
    } else {
      ctx.fillStyle = backgroundColor;
      ctx.fillRect(0, 0, w, h);
    }
    if (cameraVideo && cameraVideo.videoWidth > 0) {
      if (screenVideo) {
        drawCameraOverlayOnCanvas(ctx, cameraVideo, w, h);
      } else {
        drawCameraCircle(ctx, cameraVideo, w / 2, h / 2, Math.min(w, h) * 0.7);
      }
    }
  }

  function togglePause() {
    if (!recorder) return;
    if (recorder.state === "recording") {
      recorder.pause();
      elapsedMs += performance.now() - runningSince;
      runningSince = null;
      controls.setPaused(true);
    } else if (recorder.state === "paused") {
      recorder.resume();
      runningSince = performance.now();
      controls.setPaused(false);
    }
  }

  function updateTimer() {
    if (!recorder) return;
    const ms = elapsedMs + (runningSince ? performance.now() - runningSince : 0);
    const text = formatDuration(ms);
    if (controls) controls.setTime(text);
    setCaptureButtonRecording(true, text);
  }

  function stop() {
    if (finished) return;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop(); // onstop -> finish(), after the last chunk arrives
    } else {
      finish();
    }
  }

  function finish() {
    if (finished) return;
    finished = true;
    ticker.terminate();

    if (chunks.length > 0) {
      downloadBlob(
        new Blob(chunks, { type: "video/webm" }),
        `recording_${getFormattedDateTime()}.webm`
      );
    }

    ownedStreams.forEach((s) => s.getTracks().forEach((t) => t.stop()));
    if (canvas && videoTrack) videoTrack.stop();
    if (screenVideo) screenVideo.srcObject = null;
    if (cameraVideo) cameraVideo.srcObject = null;
    if (pipWin && !pipWin.closed) pipWin.close();

    activeSession = null;
    setCaptureButtonRecording(false);
    restoreInPagePreview();
    applyMicSelection(); // bring the level meter back
  }
}

function buildRecorderControls(pipWin, { onPause, onStop }) {
  const doc = pipWin.document;
  doc.title = "Cropshot recording";

  const style = doc.createElement("style");
  style.textContent = RECORDER_WINDOW_CSS;
  doc.head.append(style);

  doc.body.innerHTML = `
    <main class="recorder">
      <div class="bubble" hidden>
        <video autoplay muted playsinline></video>
      </div>
      <div class="bar">
        <span class="status" aria-hidden="true"></span>
        <span class="time" role="timer">0:00</span>
        <button type="button" class="pause" aria-pressed="false" disabled>Pause</button>
        <button type="button" class="stop">Stop</button>
      </div>
      <div class="countdown" role="status" aria-live="assertive" hidden></div>
    </main>`;

  const root = doc.querySelector(".recorder");
  const bubble = doc.querySelector(".bubble");
  const video = doc.querySelector("video");
  const time = doc.querySelector(".time");
  const pauseBtn = doc.querySelector(".pause");
  const stopBtn = doc.querySelector(".stop");
  const countdown = doc.querySelector(".countdown");

  pauseBtn.addEventListener("click", onPause);
  stopBtn.addEventListener("click", onStop);

  return {
    showCamera(stream) {
      if (!stream) return;
      video.srcObject = stream;
      bubble.hidden = false;
      video.play().catch(() => {});
    },
    showCountdown(n) {
      countdown.hidden = false;
      countdown.textContent = String(n);
    },
    start() {
      countdown.hidden = true;
      pauseBtn.disabled = false;
      root.classList.add("is-recording");
      stopBtn.focus();
    },
    setPaused(paused) {
      pauseBtn.textContent = paused ? "Resume" : "Pause";
      pauseBtn.setAttribute("aria-pressed", String(paused));
      root.classList.toggle("is-paused", paused);
    },
    setTime(text) {
      if (time.textContent !== text) time.textContent = text;
    },
  };
}

const RECORDER_WINDOW_CSS = `
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  [hidden] { display: none !important; }
  html, body {
    margin: 0;
    height: 100%;
    background: #111827;
    color: #fff;
    font: 600 15px/1.2 system-ui, -apple-system, "Segoe UI", sans-serif;
  }
  .recorder {
    position: relative;
    height: 100%;
    padding: 12px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
  }
  .bubble {
    flex: none;
    width: min(100%, calc(100vh - 92px));
    aspect-ratio: 1 / 1;
    border-radius: 50%;
    overflow: hidden;
    background: #000;
    border: 4px solid rgba(255, 255, 255, 0.9);
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
  }
  .bubble video { display: block; width: 100%; height: 100%; object-fit: cover; }
  .bar { flex: none; width: 100%; display: flex; align-items: center; gap: 8px; }
  .status { flex: none; width: 10px; height: 10px; border-radius: 50%; background: #6b7280; }
  .is-recording .status { background: #ef4444; animation: pulse 1.2s ease-in-out infinite; }
  .is-recording.is-paused .status { background: #f59e0b; animation: none; }
  .time { min-width: 3.5em; font-variant-numeric: tabular-nums; }
  button {
    min-height: 44px;
    padding: 0 16px;
    border: 0;
    border-radius: 999px;
    color: #fff;
    font: inherit;
    cursor: pointer;
    transition: background-color 150ms ease;
  }
  .pause { margin-left: auto; background: #374151; }
  .pause:hover:not(:disabled) { background: #4b5563; }
  .pause:disabled { opacity: 0.5; cursor: default; }
  .stop { background: #ef4444; }
  .stop:hover { background: #dc2626; }
  button:focus-visible { outline: 2px solid #a78bfa; outline-offset: 2px; }
  .countdown {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(17, 24, 39, 0.75);
    font-size: min(72px, 60vh);
    font-weight: 800;
    font-variant-numeric: tabular-nums;
  }
  @keyframes pulse { 50% { opacity: 0.35; } }
  @media (prefers-reduced-motion: reduce) {
    .is-recording .status { animation: none; }
    button { transition: none; }
  }
`;

async function playStream(stream) {
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.srcObject = stream;
  await video.play();
  if (!video.videoWidth) {
    await new Promise((resolve) => {
      video.addEventListener("resize", resolve, { once: true });
      setTimeout(resolve, 2000);
    });
  }
  // Wait for a decoded frame too; drawing before one arrives gives a blank image
  if (video.requestVideoFrameCallback) {
    await new Promise((resolve) => {
      video.requestVideoFrameCallback(() => resolve());
      setTimeout(resolve, 1000);
    });
  }
  return video;
}

async function ensurePreviewStream(deviceId) {
  if (!liveCameraStream || !liveCameraStream.active) {
    await startLiveCameraPreview(deviceId);
  }
  return liveCameraStream;
}

function hideInPagePreview() {
  if (liveCameraPreviewContainer) {
    liveCameraPreviewContainer.classList.add("hidden");
  }
}

function restoreInPagePreview() {
  if (liveCameraPreviewContainer && liveCameraStream && liveCameraStream.active) {
    liveCameraPreviewContainer.classList.remove("hidden");
  }
}

function setCaptureButtonRecording(recording, time) {
  const btn = document.getElementById("capture");
  if (!btn) return;
  const text = recording
    ? time
      ? `Stop recording · ${time}`
      : "Stop recording"
    : modeCopy(currentModeKey()).button;
  if (btn.textContent !== text) btn.textContent = text;
  btn.classList.toggle("is-recording", recording);
}

function pickRecorderOptions() {
  const candidates = [
    {
      mimeType: "video/webm;codecs=vp9,opus",
      videoBitsPerSecond: 8000000,
      audioBitsPerSecond: 128000,
    },
    {
      mimeType: "video/webm;codecs=vp8,opus",
      videoBitsPerSecond: 5000000,
      audioBitsPerSecond: 128000,
    },
  ];
  return (
    candidates.find((o) => MediaRecorder.isTypeSupported(o.mimeType)) || {
      mimeType: "video/webm",
    }
  );
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

function formatDuration(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getFormattedDateTime() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const seconds = String(now.getSeconds()).padStart(2, "0");
  return `${year}${month}${day}_${hours}${minutes}${seconds}`;
}
