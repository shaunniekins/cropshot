// capture.js

document.getElementById("capture").addEventListener("click", () => {
  const captureType = document.getElementById("captureType").value;

  chrome.desktopCapture.chooseDesktopMedia(
    ["tab", "window", "screen"],
    (streamId) => {
      if (!streamId) {
        console.log("User cancelled or failed to choose a screen");
        return;
      }

      navigator.mediaDevices
        .getUserMedia({
          video: {
            mandatory: {
              chromeMediaSource: "desktop",
              chromeMediaSourceId: streamId,
            },
          },
        })
        .then((stream) => {
          if (captureType === "photo") {
            capturePhoto(stream);
          } else {
            captureVideo(stream);
          }
        })
        .catch((err) => {
          console.error("Error capturing media:", err);
        });
    }
  );
});

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
    stream.getTracks().forEach((track) => track.stop());
  };

  mediaRecorder.start();
}
