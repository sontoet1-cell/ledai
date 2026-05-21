const DEFAULT_DOWNLOADER_URL = "https://ledai-cmda.onrender.com/";

async function getDownloaderBase() {
  const data = await chrome.storage.local.get(["ledai_downloader_url"]);
  return String(data.ledai_downloader_url || DEFAULT_DOWNLOADER_URL).trim() || DEFAULT_DOWNLOADER_URL;
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(json.error || `HTTP ${response.status}`);
  }
  return json;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message?.type) return undefined;

  (async () => {
    try {
      const downloaderBase = await getDownloaderBase();

      if (message.type === "ledai-start-m3u8-job") {
        const endpoint = new URL("/api/giongnoi/jobs", downloaderBase).toString();
        const json = await fetchJson(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            url: String(message.url || "").trim(),
            format: String(message.format || "mp3").trim(),
            filename: String(message.filename || "zalo-audio-link").trim()
          })
        });
        sendResponse({ ok: true, job_id: json.job_id, progress: 5, stage: "Đang tạo job" });
        return;
      }

      if (message.type === "ledai-get-m3u8-job") {
        const jobId = encodeURIComponent(String(message.jobId || ""));
        const endpoint = new URL(`/api/giongnoi/jobs/${jobId}`, downloaderBase).toString();
        const json = await fetchJson(endpoint, { method: "GET" });
        const progress = Number.isFinite(Number(json.progress)) ? Number(json.progress) : 0;
        const stage = String(json.stage || (json.status === "done" ? "Hoàn tất" : "Đang xử lý"));
        const fileUrl = json.file_path
          ? new URL(String(json.file_path), downloaderBase).toString()
          : new URL(`/api/giongnoi/file?id=${jobId}`, downloaderBase).toString();

        sendResponse({
          ok: true,
          status: json.status,
          error: json.error || "",
          filename: json.filename || "zalo-audio-link.mp3",
          progress,
          stage,
          file_url: fileUrl
        });
        return;
      }

      if (message.type === "ledai-download-file") {
        const fileUrl = String(message.url || "").trim();
        await chrome.downloads.download({
          url: fileUrl,
          filename: String(message.filename || "").trim() || undefined,
          saveAs: false
        });
        sendResponse({ ok: true });
        return;
      }

      sendResponse({ ok: false, error: "Unknown message type." });
    } catch (error) {
      sendResponse({ ok: false, error: error?.message || "Backend request failed." });
    }
  })();

  return true;
});
