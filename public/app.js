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
  // Chỉnh lại màu báo lỗi/thành công cho hợp giao diện tối
  statusText.style.color = isError ? "#f87171" : "#facc15"; 
}

function makeDownloadUrl(source, name) {
  const qs = new URLSearchParams({ url: source, name });
  return `/api/download?${qs.toString()}`;
}

function resetResult() {
  resultSection.classList.add("hidden");
  cover.removeAttribute("src");
  itemIdEl.textContent = "Mã:";
  titleEl.textContent = "Video đã sẵn sàng để tải.";
  downloadBest.setAttribute("href", "#");
  qualityList.innerHTML = "";
}

function renderQualities(itemId, qualities) {
  qualityList.innerHTML = "";

  qualities.forEach((item, index) => {
    if (!item || !item.url) return;
    const label = item.label || `Chất lượng ${index + 1}`;
    const name = `jimeng_${itemId || Date.now()}_${item.quality || index + 1}.mp4`;

    const a = document.createElement("a");
    // Bỏ class button đi vì giao diện mới đã tự CSS cho thẻ <a> trong quality-list rồi
    a.href = makeDownloadUrl(item.url, name);
    a.target = "_blank";
    a.rel = "noopener";
    a.textContent = label;

    qualityList.appendChild(a);
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
        const isRetriableStatus = response.status >= 500;
        if (isRetriableStatus && attempt === 0) {
          setStatus("Đang thử lại kết nối...");
          await sleep(900);
          continue;
        }

        throw new Error(payload?.error || "Không thể xử lý link này.");
      }

      return payload || {};
    } catch (error) {
      lastError = error;
      const message = String(error?.message || "").toLowerCase();
      const isRetriableNetworkError = message.includes("failed to fetch") || message.includes("network");

      if (isRetriableNetworkError && attempt === 0) {
        setStatus("Mạng chưa ổn định, đang thử lại...");
        await sleep(900);
        continue;
      }

      throw error;
    }
  }

  throw lastError || new Error("Không thể xử lý link này.");
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const rawInput = input.value.trim();
  if (!rawInput) {
    setStatus("Vui lòng dán link Jimeng vào ô trống.", true);
    resetResult();
    return;
  }

  // === XỬ LÝ LỌC LINK TỪ ĐOẠN TEXT LỘN XỘN ===
  const linkRegex = /(https?:\/\/jimeng\.jianying\.com\/s\/[a-zA-Z0-9_-]+\/?)/i;
  const match = rawInput.match(linkRegex);

  let finalUrl = "";
  if (match && match[0]) {
    finalUrl = match[0];
    // Thay thế đoạn text dài bằng link sạch vừa lọc được vào ô input
    input.value = finalUrl; 
  } else {
    setStatus("Không tìm thấy link Jimeng hợp lệ nào!", true);
    resetResult();
    return;
  }
  // ===========================================

  submitBtn.disabled = true;
  setStatus(""); // Xóa text thông báo cũ để nhường chỗ cho nút "Đang xử lý"
  resetResult();

  try {
    const payload = await resolveWithRetry(finalUrl);
    const qualities = Array.isArray(payload.qualities) ? payload.qualities : [];
    if (qualities.length === 0) {
      throw new Error("Không tìm thấy file để tải xuống.");
    }

    const itemId = payload.item_id || "";
    const best = qualities[0];

    if (payload.cover_url) {
      cover.src = payload.cover_url;
    }

    itemIdEl.textContent = `Mã hệ thống: ${itemId || "N/A"}`;
    titleEl.textContent = "Đã tìm thấy video. Bạn có thể tải ngay.";
    downloadBest.href = makeDownloadUrl(best.url, `jimeng_${itemId || Date.now()}_origin.mp4`);

    renderQualities(itemId, qualities);
    resultSection.classList.remove("hidden");
    setStatus("Phân tích dữ liệu thành công!");
    
  } catch (error) {
    setStatus(error.message || "Đã có lỗi xảy ra trong quá trình xử lý.", true);
    resetResult();
  } finally {
    submitBtn.disabled = false;
  }
});