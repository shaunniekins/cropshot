// DesktopCaptureFiles/capture.js

let hasAudioPermission = false;

document.addEventListener("DOMContentLoaded", () => {
  requestAudioPermission();
});

function requestAudioPermission() {
  navigator.mediaDevices
    .getUserMedia({ audio: true })
    .then((stream) => {
      hasAudioPermission = true;
      stream.getTracks().forEach((track) => track.stop());
      populateMicrophoneSelect();
    })
    .catch((err) => {
      console.error("Error requesting audio permission:", err);
      hasAudioPermission = false;
    });
}

function populateMicrophoneSelect() {
  const microphoneSelect = document.getElementById("microphoneSelect");
  navigator.mediaDevices
    .enumerateDevices()
    .then((devices) => {
      devices.forEach((device) => {
        if (device.kind === "audioinput") {
          const option = document.createElement("option");
          option.value = device.deviceId;
          option.text =
            device.label || `Microphone ${microphoneSelect.length + 1}`;
          microphoneSelect.add(option);
        }
      });
    })
    .catch((err) => {
      console.error("Error enumerating devices:", err);
    });
}

document.getElementById("captureType").addEventListener("change", (event) => {
  const microphoneSelect = document.getElementById("microphoneSelect");
  if (event.target.value === "video" && hasAudioPermission) {
    microphoneSelect.classList.remove("hidden");
  } else {
    microphoneSelect.classList.add("hidden");
  }
});

document.getElementById("capture").addEventListener("click", () => {
  const captureType = document.getElementById("captureType").value;
  const microphoneSelect = document.getElementById("microphoneSelect");
  const selectedMicId = microphoneSelect.value;

  chrome.desktopCapture.chooseDesktopMedia(
    ["tab", "window", "screen"],
    (streamId) => {
      if (!streamId) {
        console.log("User cancelled or failed to choose a screen");
        return;
      }

      const videoConstraints = {
        mandatory: {
          chromeMediaSource: "desktop",
          chromeMediaSourceId: streamId,
        },
      };

      navigator.mediaDevices
        .getUserMedia({
          video: videoConstraints,
          audio: false,
        })
        .then((videoStream) => {
          if (captureType === "photo") {
            capturePhoto(videoStream);
          } else {
            if (selectedMicId !== "noMic") {
              navigator.mediaDevices
                .getUserMedia({
                  audio: { deviceId: { exact: selectedMicId } },
                })
                .then((audioStream) => {
                  const combinedStream = new MediaStream([
                    ...videoStream.getVideoTracks(),
                    ...audioStream.getAudioTracks(),
                  ]);
                  captureVideo(combinedStream);

                  // Clean up the audio stream when video ends
                  videoStream
                    .getVideoTracks()[0]
                    .addEventListener("ended", () => {
                      audioStream.getTracks().forEach((track) => track.stop());
                    });
                })
                .catch((err) => {
                  console.error("Error capturing audio:", err);
                  captureVideo(videoStream);
                });
            } else {
              captureVideo(videoStream);
            }
          }
        })
        .catch((err) => {
          console.error("Error capturing video:", err);
        });
    }
  );
});

function capturePhoto(stream) {
  const video = document.createElement("video");
  video.srcObject = stream;
  video.play();

  video.addEventListener("loadeddata", () => {
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext("2d");
    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob((blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `screenshot_${getFormattedDateTime()}.png`;
      a.click();
      URL.revokeObjectURL(url);
      stream.getTracks().forEach((track) => track.stop());
    });
  });
}

function captureVideo(stream) {
  const mediaRecorder = new MediaRecorder(stream);
  const chunks = [];

  mediaRecorder.ondataavailable = (event) => {
    if (event.data.size > 0) {
      chunks.push(event.data);
    }
  };

  mediaRecorder.onstop = () => {
    const blob = new Blob(chunks, { type: "video/webm" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `recording_${getFormattedDateTime()}.webm`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Add this: Listen for the 'ended' event on the video track
  stream.getVideoTracks()[0].addEventListener("ended", () => {
    if (mediaRecorder.state !== "inactive") {
      mediaRecorder.stop();
    }
  });

  mediaRecorder.start();

  console.log('Recording started. Click "Stop sharing" to end the recording.');
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
