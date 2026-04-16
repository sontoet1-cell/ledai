const form = document.getElementById("tts-form");
const input = document.getElementById("input");
const speaker = document.getElementById("speaker_id");
const speed = document.getElementById("speed");
const filename = document.getElementById("filename");
const player = document.getElementById("player");
const statusEl = document.getElementById("status");
const resultMeta = document.getElementById("result-meta");
const rawOutput = document.getElementById("raw-output");
const charCount = document.getElementById("char-count");
const speedValue = document.getElementById("speed-value");
const submitBtn = document.getElementById("submit-btn");
const resetBtn = document.getElementById("reset-btn");
const listenLink = document.getElementById("listen-link");
const downloadLink = document.getElementById("download-link");

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

function setLinksDisabled(disabled) {
  [listenLink, downloadLink].forEach((node) => {
    node.classList.toggle("disabled", disabled);
    if (disabled) node.setAttribute("aria-disabled", "true");
    else node.removeAttribute("aria-disabled");
  });
}

function resetResult() {
  player.removeAttribute("src");
  player.load();
  resultMeta.textContent = "Chua co audio. Bam Tao audio de goi API.";
  resultMeta.classList.add("is-empty");
  rawOutput.textContent = "Chua co du lieu.";
  listenLink.href = "#";
  downloadLink.href = "#";
  downloadLink.removeAttribute("download");
  setLinksDisabled(true);
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
  rawOutput.textContent = "Dang doi response...";
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
      `<strong>File:</strong> ${data.filename}<br>` +
      `<strong>Giong:</strong> ${voiceLabel}<br>` +
      `<strong>Toc do:</strong> ${data.speed}<br>` +
      `<strong>Encode type:</strong> ${data.encode_type}`;
    resultMeta.classList.remove("is-empty");

    listenLink.href = data.audio_path;
    downloadLink.href = data.audio_path;
    downloadLink.download = data.filename || "zalo-tts.wav";
    setLinksDisabled(false);

    rawOutput.textContent = JSON.stringify(data.raw || data, null, 2);
    setStatus("Tao audio thanh cong.", "is-success");
  } catch (error) {
    resetResult();
    setStatus(error.message || "Co loi xay ra khi goi API.", "is-error");
    rawOutput.textContent = String(error.message || error);
  } finally {
    submitBtn.disabled = false;
    resetBtn.disabled = false;
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
}

input.addEventListener("input", updateCharCount);
speed.addEventListener("input", updateSpeedValue);
form.addEventListener("submit", createAudio);
resetBtn.addEventListener("click", resetForm);

updateCharCount();
updateSpeedValue();
resetResult();
