const form = document.getElementById("m3u8-form");
const urlInput = document.getElementById("m3u8-url");
const formatInput = document.getElementById("m3u8-format");
const filenameInput = document.getElementById("m3u8-filename");
const submitButton = document.getElementById("m3u8-submit");
const downloadLink = document.getElementById("m3u8-download-link");
const resultBox = document.getElementById("m3u8-result");
const statusBox = document.getElementById("m3u8-status");
const progressLabel = document.getElementById("m3u8-progress-label");
const progressValue = document.getElementById("m3u8-progress-value");
const progressFill = document.getElementById("m3u8-progress-fill");
const fbUrl = document.getElementById("fb-url");
const fbSubmit = document.getElementById("fb-submit");
const fbDownload = document.getElementById("fb-download");
const fbStatus = document.getElementById("fb-status");
const ttUrl = document.getElementById("tt-url");
const ttSubmit = document.getElementById("tt-submit");
const ttDownload = document.getElementById("tt-download");
const ttStatus = document.getElementById("tt-status");
const ytUrl = document.getElementById("yt-url");
const ytSubmit = document.getElementById("yt-submit");
const ytDownload = document.getElementById("yt-download");
const ytStatus = document.getElementById("yt-status");

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

function setProgress(progress, stage = "Tiến độ xử lý") {
  const safe = Math.max(0, Math.min(100, Math.floor(progress || 0)));
  progressLabel.textContent = stage;
  progressValue.textContent = `${safe}%`;
  progressFill.style.width = `${safe}%`;
}

async function pollJob(jobId) {
  while (true) {
    const response = await fetch(`/api/giongnoi/jobs/${encodeURIComponent(jobId)}`);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || "Không đọc được tiến độ job.");
    }
    setProgress(data.progress || 0, data.stage || "Đang xử lý");
    if (data.status === "done") return data;
    if (data.status === "error") {
      throw new Error(data.error || "Job xử lý thất bại.");
    }
    await new Promise((resolve) => setTimeout(resolve, 1200));
  }
}

function setQuickStatus(node, message, type = "") {
  node.textContent = message;
  node.classList.remove("is-error", "is-success");
  if (type) node.classList.add(type);
}

function resetQuickDownload(node) {
  node.href = "#";
  node.removeAttribute("download");
  node.classList.add("disabled");
  node.setAttribute("aria-disabled", "true");
}

async function startQuickDownload(urlValue, button, linkNode, statusNode, label) {
  const url = String(urlValue.value || "").trim();
  if (!url) {
    setQuickStatus(statusNode, `Cần dán link ${label}.`, "is-error");
    urlValue.focus();
    return;
  }
  button.disabled = true;
  resetQuickDownload(linkNode);
  setQuickStatus(statusNode, `Đang tạo file từ ${label}...`);
  try {
    const response = await fetch("/api/giongnoi/media-download", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ url, format: "video" })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || `Không tải được ${label}.`);
    }
    const jobId = data.job_id;
    while (true) {
      const statusResponse = await fetch(`/api/status/${encodeURIComponent(jobId)}`);
      const statusData = await statusResponse.json().catch(() => ({}));
      if (!statusResponse.ok) {
        throw new Error(statusData.error || `Không đọc được trạng thái ${label}.`);
      }
      if (statusData.status === "done") {
        const href = `/api/file/${encodeURIComponent(jobId)}`;
        linkNode.href = href;
        linkNode.download = statusData.filename || `${label}.mp4`;
        linkNode.classList.remove("disabled");
        linkNode.removeAttribute("aria-disabled");
        setQuickStatus(statusNode, `Đã xong. Bấm tải file ${label}.`, "is-success");
        return;
      }
      if (statusData.status === "error") {
        throw new Error(statusData.error || `Tải ${label} thất bại.`);
      }
      setQuickStatus(statusNode, `Đang xử lý ${label}...`);
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
  } catch (error) {
    setQuickStatus(statusNode, error.message || `Không tải được ${label}.`, "is-error");
  } finally {
    button.disabled = false;
  }
}

async function handleSubmit(event) {
  if (event) event.preventDefault();
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
  setProgress(0, "Đang tạo job");

  try {
    const response = await fetch("/api/giongnoi/jobs", {
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
    const finalData = await pollJob(data.job_id);

    downloadLink.href = finalData.file_path;
    downloadLink.download = finalData.filename || `zalo-audio.${formatInput.value || "mp3"}`;
    downloadLink.classList.remove("disabled");
    downloadLink.removeAttribute("aria-disabled");

    resultBox.innerHTML =
      `<strong>File:</strong> ${finalData.filename}<br>` +
      `<strong>Định dạng:</strong> ${String(formatInput.value || "").toUpperCase()}<br>` +
      `<strong>Trạng thái:</strong> Sẵn sàng tải xuống`;
    resultBox.classList.remove("is-empty");
    setProgress(100, "Hoàn tất");
    setStatus("Đã xử lý xong. Bấm nút tải file để lưu về máy.", "is-success");
  } catch (error) {
    resultBox.textContent = "Chưa có file nào được tạo.";
    resultBox.classList.add("is-empty");
    setProgress(0, "Tiến độ xử lý");
    setStatus(error.message || "Không thể tải audio từ link này.", "is-error");
  } finally {
    submitButton.disabled = false;
  }
}

form.addEventListener("submit", handleSubmit);
resetDownloadState();
resetQuickDownload(fbDownload);
resetQuickDownload(ttDownload);
resetQuickDownload(ytDownload);
setProgress(0, "Tiến độ xử lý");
fbSubmit.addEventListener("click", () => startQuickDownload(fbUrl, fbSubmit, fbDownload, fbStatus, "Facebook"));
ttSubmit.addEventListener("click", () => startQuickDownload(ttUrl, ttSubmit, ttDownload, ttStatus, "TikTok"));
ytSubmit.addEventListener("click", () => startQuickDownload(ytUrl, ytSubmit, ytDownload, ytStatus, "YouTube"));

(function hydrateFromQuery() {
  try {
    const params = new URLSearchParams(window.location.search);
    const url = String(params.get("url") || "").trim();
    const format = String(params.get("format") || "").trim().toLowerCase();
    const autostart = params.get("autostart") === "1";
    if (!url) return;
    urlInput.value = url;
    if (["mp3", "wav", "aac"].includes(format)) {
      formatInput.value = format;
    }
    if (autostart) {
      handleSubmit();
    }
  } catch {
    // Ignore bad query params.
  }
})();
