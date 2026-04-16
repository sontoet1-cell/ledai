const form = document.getElementById("tts-form");
const m3u8Form = document.getElementById("m3u8-form");
const input = document.getElementById("input");
const speaker = document.getElementById("speaker_id");
const speed = document.getElementById("speed");
const filename = document.getElementById("filename");
const m3u8Url = document.getElementById("m3u8-url");
const m3u8Format = document.getElementById("m3u8-format");
const m3u8Filename = document.getElementById("m3u8-filename");
const player = document.getElementById("player");
const statusEl = document.getElementById("status");
const m3u8StatusEl = document.getElementById("m3u8-status");
const resultMeta = document.getElementById("result-meta");
const charCount = document.getElementById("char-count");
const speedValue = document.getElementById("speed-value");
const submitBtn = document.getElementById("submit-btn");
const resetBtn = document.getElementById("reset-btn");
const listenLink = document.getElementById("listen-link");
const downloadLink = document.getElementById("download-link");
const mergedLink = document.getElementById("merged-link");
const m3u8DownloadLink = document.getElementById("m3u8-download-link");
const partsPanel = document.getElementById("parts-panel");
const partsCount = document.getElementById("parts-count");
const partsList = document.getElementById("parts-list");

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function updateCharCount() {
  charCount.textContent = String(input.value.length);
}

function updateSpeedValue() {
  speedValue.textContent = `${Number(speed.value).toFixed(1)}x`;
}

function setStatus(message, type = "") {
  statusEl.textContent = message;
  statusEl.classList.remove("is-error", "is-success");
  if (type) statusEl.classList.add(type);
}

function setM3u8Status(message, type = "") {
  m3u8StatusEl.textContent = message;
  m3u8StatusEl.classList.remove("is-error", "is-success");
  if (type) m3u8StatusEl.classList.add(type);
}

function setLinksDisabled(disabled) {
  [listenLink, downloadLink, mergedLink].forEach((node) => {
    node.classList.toggle("disabled", disabled);
    if (disabled) node.setAttribute("aria-disabled", "true");
    else node.removeAttribute("aria-disabled");
  });
}

function renderParts(parts) {
  partsList.innerHTML = "";
  const items = Array.isArray(parts) ? parts : [];
  partsCount.textContent = `${items.length} phần`;
  partsPanel.classList.toggle("is-empty", items.length === 0);
  if (!items.length) return;

  for (const part of items) {
    const item = document.createElement("article");
    item.className = "part-item";
    item.innerHTML =
      `<div class="part-top">` +
        `<p class="part-title">Phần ${part.index}</p>` +
        `<span class="part-size">${part.text_length} ký tự</span>` +
      `</div>` +
      `<div class="part-text">${escapeHtml(part.text)}</div>` +
      `<div class="part-actions">` +
        `<a class="action-link action-link-primary" href="${part.audio_path}" target="_blank" rel="noopener noreferrer">Nghe phần này</a>` +
        `<a class="action-link action-link-secondary" href="${part.audio_path}" download="${part.filename || ""}">Tải phần này</a>` +
      `</div>`;
    partsList.appendChild(item);
  }
}

function resetResult() {
  player.removeAttribute("src");
  player.load();
  resultMeta.textContent = "Chua co audio. Bam Tao audio de goi API.";
  resultMeta.classList.add("is-empty");
  listenLink.href = "#";
  downloadLink.href = "#";
  mergedLink.href = "#";
  downloadLink.removeAttribute("download");
  mergedLink.removeAttribute("download");
  setLinksDisabled(true);
  renderParts([]);
}

async function createAudio(event) {
  event.preventDefault();

  const payload = {
    input: input.value.trim(),
    speaker_id: speaker.value,
    speed: speed.value,
    filename: filename.value.trim() || "giongnoi-zalo-demo",
    encode_type: "0"
  };

  if (!payload.input) {
    setStatus("Can nhap noi dung truoc khi tao audio.", "is-error");
    input.focus();
    return;
  }

  submitBtn.disabled = true;
  resetBtn.disabled = true;
  setStatus("Dang goi Zalo TTS API...", "");
  resultMeta.textContent = "Dang tao audio...";
  resultMeta.classList.add("is-empty");
  setLinksDisabled(true);

  try {
    const response = await fetch("/api/giongnoi/synthesize", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || "Khong tao duoc audio.");
    }

    player.src = data.audio_path;
    player.load();

    const voiceLabel = speaker.options[speaker.selectedIndex]?.textContent || speaker.value;
    resultMeta.innerHTML =
      `<strong>Số phần:</strong> ${data.part_count}<br>` +
      `<strong>File đầu:</strong> ${data.filename}<br>` +
      `<strong>Giong:</strong> ${voiceLabel}<br>` +
      `<strong>Toc do:</strong> ${data.speed}<br>` +
      `<strong>Encode type:</strong> ${data.encode_type}` +
      (data.merged_audio_path ? `<br><strong>Bản ghép:</strong> Có sẵn` : `<br><strong>Bản ghép:</strong> ${data.merged_supported ? "Chưa tạo được" : "Máy chủ chưa có ffmpeg"}`);
    resultMeta.classList.remove("is-empty");

    listenLink.href = data.audio_path;
    downloadLink.href = data.audio_path;
    downloadLink.download = data.filename || "zalo-tts.wav";
    if (data.merged_audio_path) {
      mergedLink.href = data.merged_audio_path;
      mergedLink.download = data.merged_filename || "zalo-tts.wav";
      mergedLink.classList.remove("disabled");
      mergedLink.removeAttribute("aria-disabled");
    } else {
      mergedLink.href = "#";
      mergedLink.removeAttribute("download");
      mergedLink.classList.add("disabled");
      mergedLink.setAttribute("aria-disabled", "true");
    }
    listenLink.classList.remove("disabled");
    downloadLink.classList.remove("disabled");
    listenLink.removeAttribute("aria-disabled");
    downloadLink.removeAttribute("aria-disabled");
    renderParts(data.parts || []);
    setStatus("Tao audio thanh cong.", "is-success");
  } catch (error) {
    resetResult();
    setStatus(error.message || "Co loi xay ra khi goi API.", "is-error");
  } finally {
    submitBtn.disabled = false;
    resetBtn.disabled = false;
  }
}

async function downloadFromM3u8(event) {
  event.preventDefault();
  const url = String(m3u8Url.value || "").trim();
  if (!url) {
    setM3u8Status("Can dan link .m3u8 truoc khi tai.", "is-error");
    m3u8Url.focus();
    return;
  }

  const submitButton = document.getElementById("m3u8-submit");
  submitButton.disabled = true;
  m3u8DownloadLink.href = "#";
  m3u8DownloadLink.removeAttribute("download");
  m3u8DownloadLink.classList.add("disabled");
  m3u8DownloadLink.setAttribute("aria-disabled", "true");
  setM3u8Status("Dang tai va xu ly audio tu link m3u8...", "");

  try {
    const response = await fetch("/api/giongnoi/from-link", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        url,
        format: m3u8Format.value,
        filename: m3u8Filename.value.trim() || "zalo-audio-link"
      })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || "Khong tai duoc audio tu link nay.");
    }

    m3u8DownloadLink.href = data.file_path;
    m3u8DownloadLink.download = data.filename || `zalo-audio.${data.format || "mp3"}`;
    m3u8DownloadLink.classList.remove("disabled");
    m3u8DownloadLink.removeAttribute("aria-disabled");
    setM3u8Status("Da xu ly xong. Bam nut tai file de luu ve may.", "is-success");
  } catch (error) {
    setM3u8Status(error.message || "Khong tai duoc audio tu link nay.", "is-error");
  } finally {
    submitButton.disabled = false;
  }
}

function resetForm() {
  form.reset();
  speaker.value = "5";
  speed.value = "1";
  filename.value = "giongnoi-zalo-demo";
  input.value = "Xin chào, đây là trang demo Zalo AI Text to Audio được phát triển bởi Lê Đại.";
  updateCharCount();
  updateSpeedValue();
  setStatus("Da dat lai mau demo.");
  resetResult();
  m3u8Url.value = "";
  m3u8Format.value = "mp3";
  m3u8Filename.value = "zalo-audio-link";
  m3u8DownloadLink.href = "#";
  m3u8DownloadLink.removeAttribute("download");
  m3u8DownloadLink.classList.add("disabled");
  m3u8DownloadLink.setAttribute("aria-disabled", "true");
  setM3u8Status("Dùng khi bạn đã có link `.m3u8` từ trang Zalo.");
}

input.addEventListener("input", updateCharCount);
speed.addEventListener("input", updateSpeedValue);
form.addEventListener("submit", createAudio);
m3u8Form.addEventListener("submit", downloadFromM3u8);
resetBtn.addEventListener("click", resetForm);

updateCharCount();
updateSpeedValue();
resetResult();
setM3u8Status("Dùng khi bạn đã có link `.m3u8` từ trang Zalo.");
