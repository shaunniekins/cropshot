// desktopCapture.js

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

  setTimeout(() => {
    mediaRecorder.stop();
  }, 5000); // Stop recording after 5 seconds
}

// chrome.windows.getCurrent({}, (w) => {
//   chrome.windows.update(w.id, { focused: true }, () => {
//     document.getElementById("capture").onclick = () => {
//       const sources = ["tab", "window", "screen"];
//       chrome.tabs.getCurrent((tab) => {
//         chrome.desktopCapture.chooseDesktopMedia(sources, tab, (streamId) => {
//           let track, canvas;
//           navigator.mediaDevices
//             .getUserMedia({
//               video: {
//                 mandatory: {
//                   chromeMediaSource: "desktop",
//                   chromeMediaSourceId: streamId,
//                 },
//               },
//             })
//             .then((stream) => {
//               track = stream.getVideoTracks()[0];
//               const imageCapture = new ImageCapture(track);
//               return imageCapture.grabFrame();
//             })
//             .then((bitmap) => {
//               track.stop();
//               canvas = document.createElement("canvas");
//               canvas.width = bitmap.width;
//               canvas.height = bitmap.height;
//               let context = canvas.getContext("2d");
//               context.drawImage(bitmap, 0, 0, bitmap.width, bitmap.height);
//               return canvas.toDataURL();
//             })
//             .then((url) => {
//               chrome.downloads.download(
//                 {
//                   filename: "screenshot.png",
//                   url: url,
//                 },
//                 () => {
//                   canvas.remove();
//                 }
//               );
//             })
//             .catch((err) => {
//               console.log(err);
//             });
//         });
//       });
//     };
//   });
// });
