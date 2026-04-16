const form = document.getElementById("m3u8-form");
const urlInput = document.getElementById("m3u8-url");
const formatInput = document.getElementById("m3u8-format");
const filenameInput = document.getElementById("m3u8-filename");
const submitButton = document.getElementById("m3u8-submit");
const downloadLink = document.getElementById("m3u8-download-link");
const resultBox = document.getElementById("m3u8-result");
const statusBox = document.getElementById("m3u8-status");

function setStatus(message, type = "") {
  statusBox.textContent = message;
  statusBox.classList.remove("is-error", "is-success");
  if (type) statusBox.classList.add(type);
}

function resetDownloadState() {
  downloadLink.href = "#";
  downloadLink.removeAttribute("download");
  downloadLink.classList.add("disabled");
  downloadLink.setAttribute("aria-disabled", "true");
}

async function handleSubmit(event) {
  event.preventDefault();
  const url = String(urlInput.value || "").trim();
  if (!url) {
    setStatus("Cần dán link .m3u8 trước khi tải.", "is-error");
    urlInput.focus();
    return;
  }

  submitButton.disabled = true;
  resetDownloadState();
  resultBox.textContent = "Đang xử lý link và tạo file audio...";
  resultBox.classList.add("is-empty");
  setStatus("Đang tải từ link m3u8...", "");

  try {
    const response = await fetch("/api/giongnoi/from-link", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        url,
        format: formatInput.value,
        filename: filenameInput.value.trim() || "zalo-audio-link"
      })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || "Không thể tải audio từ link này.");
    }

    downloadLink.href = data.file_path;
    downloadLink.download = data.filename || `zalo-audio.${data.format || "mp3"}`;
    downloadLink.classList.remove("disabled");
    downloadLink.removeAttribute("aria-disabled");

    resultBox.innerHTML =
      `<strong>File:</strong> ${data.filename}<br>` +
      `<strong>Định dạng:</strong> ${String(data.format || "").toUpperCase()}<br>` +
      `<strong>Trạng thái:</strong> Sẵn sàng tải xuống`;
    resultBox.classList.remove("is-empty");
    setStatus("Đã xử lý xong. Bấm nút tải file để lưu về máy.", "is-success");
  } catch (error) {
    resultBox.textContent = "Chưa có file nào được tạo.";
    resultBox.classList.add("is-empty");
    setStatus(error.message || "Không thể tải audio từ link này.", "is-error");
  } finally {
    submitButton.disabled = false;
  }
}

form.addEventListener("submit", handleSubmit);
resetDownloadState();
