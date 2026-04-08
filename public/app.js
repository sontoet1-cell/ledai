const form = document.getElementById("download-form");
const input = document.getElementById("url");
const submitBtn = document.getElementById("submit-btn");
const statusText = document.getElementById("status");
const resultSection = document.getElementById("result");
const cover = document.getElementById("cover");
const itemIdEl = document.getElementById("item-id");
const titleEl = document.getElementById("title");
const downloadBest = document.getElementById("download-best");
const qualityList = document.getElementById("quality-list");

function setStatus(message, isError = false) {
  statusText.textContent = message;
  statusText.style.color = isError ? "#f87171" : "#facc15";
}

function makeDownloadUrl(source, name) {
  const qs = new URLSearchParams({ url: source, name });
  return `/api/download?${qs.toString()}`;
}

function resetResult() {
  resultSection.classList.add("hidden");
  cover.removeAttribute("src");
  itemIdEl.textContent = "";
  titleEl.textContent = "";
  downloadBest.setAttribute("href", "#");
  qualityList.innerHTML = "";
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeJimengInput(rawInput) {
  const trimmed = String(rawInput || "").trim();
  const urlRegex = /(https?:\/\/jimeng\.jianying\.com\/s\/[a-zA-Z0-9_-]+\/?(?:\?[^\s]*)?)/i;
  const match = trimmed.match(urlRegex);
  return match ? match[0] : "";
}

function humanWatermarkStatus(status) {
  if (status === "likely_no_watermark") return "co the khong watermark";
  if (status === "likely_watermark") return "co watermark";
  return "khong ro watermark";
}

function qualityClassByIndex(index) {
  if (index === 0) return "background:#166534;border-color:#22c55e";
  if (index === 1) return "background:#1d4ed8;border-color:#3b82f6";
  if (index === 2) return "background:#7c2d12;border-color:#fb923c";
  return "background:#1f2937;border-color:#475569";
}

function renderQualities(itemId, qualities) {
  qualityList.innerHTML = "";

  qualities.forEach((item, index) => {
    if (!item || !item.url) return;
    const qualityKey = item.quality || String(index + 1);
    const name = `jimeng_${itemId || Date.now()}_${qualityKey}.mp4`;
    const label = item.label || `Nguon ${index + 1}`;
    const wm = humanWatermarkStatus(item.watermark_status);

    const a = document.createElement("a");
    a.href = makeDownloadUrl(item.url, name);
    a.target = "_blank";
    a.rel = "noopener";
    a.style.cssText = qualityClassByIndex(index);
    a.textContent = `${label} - ${wm}`;
    qualityList.appendChild(a);
  });
}

async function resolveWithRetry(url) {
  let lastError = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetch("/api/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url })
      });

      let payload = null;
      try {
        payload = await response.json();
      } catch {
        payload = null;
      }

      if (!response.ok) {
        if (response.status >= 500 && attempt === 0) {
          setStatus("Server ban dau loi, dang thu lai...");
          await sleep(900);
          continue;
        }
        throw new Error(payload?.error || "Khong the xu ly link nay.");
      }

      return payload || {};
    } catch (error) {
      lastError = error;
      const message = String(error?.message || "").toLowerCase();
      const retryable = message.includes("failed to fetch") || message.includes("network");
      if (retryable && attempt === 0) {
        setStatus("Ket noi chua on dinh, dang thu lai...");
        await sleep(900);
        continue;
      }
      throw error;
    }
  }
  throw lastError || new Error("Khong the xu ly link nay.");
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const finalUrl = normalizeJimengInput(input.value);
  if (!finalUrl) {
    setStatus("Khong tim thay link Jimeng hop le.", true);
    resetResult();
    return;
  }
  input.value = finalUrl;

  submitBtn.disabled = true;
  setStatus("Dang phan tich link...");
  resetResult();

  try {
    const payload = await resolveWithRetry(finalUrl);
    const qualities = Array.isArray(payload.qualities) ? payload.qualities : [];
    if (qualities.length === 0) {
      throw new Error("Khong tim thay file de tai.");
    }

    const itemId = payload.item_id || "N/A";
    const best = qualities[0];
    const bestStatus = humanWatermarkStatus(best.watermark_status);
    const resolver = payload.resolver || "unknown";

    if (payload.cover_url) {
      cover.src = payload.cover_url;
    }

    itemIdEl.textContent = `item_id: ${itemId}`;
    titleEl.textContent = `Da tim thay video. Nguon uu tien: ${bestStatus}. Resolver: ${resolver}.`;
    downloadBest.href = makeDownloadUrl(best.url, `jimeng_${itemId}_best.mp4`);

    renderQualities(itemId, qualities);
    resultSection.classList.remove("hidden");

    if (best.watermark_status === "likely_watermark") {
      setStatus("Nguon uu tien tu Jimeng dang co watermark.", true);
    } else {
      setStatus("Phan tich thanh cong.");
    }
  } catch (error) {
    setStatus(error.message || "Da co loi trong qua trinh xu ly.", true);
    resetResult();
  } finally {
    submitBtn.disabled = false;
  }
});
