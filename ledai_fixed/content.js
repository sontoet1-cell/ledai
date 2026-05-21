(function () {
  "use strict";

  const DEFAULT_DOWNLOADER_URL = "https://ledai-cmda.onrender.com/";
  let latestUrl = "";
  let panel = null;
  let isDownloading = false;

  const TEXT = {
    title: "Lê Đại - Free TTS Zalo",
    note: "Khi trang phát audio, extension sẽ bắt link m3u8 mới nhất tại đây.",
    noLink: "Chưa bắt được link m3u8.",
    copy: "Copy link",
    open: "Mở downloader",
    download: "Tải MP3",
    progress: "Tiến độ xử lý",
    ready: "Sẵn sàng.",
    creatingJob: "Đang tạo job",
    sendingBackend: "Đang gửi backend xử lý MP3...",
    unableCreate: "Không thể tạo job MP3.",
    unableReadProgress: "Không đọc được tiến độ xử lý.",
    processing: "Đang xử lý",
    complete: "Hoàn tất",
    downloadedPrefix: "Đã tải xong: ",
    failed: "Job MP3 thất bại.",
    backendFailed: "Backend không tải được audio.",
    gotLatest: "Đã bắt được link m3u8 mới nhất."
  };

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  async function getDownloaderUrl() {
    try {
      const data = await chrome.storage.local.get(["ledai_downloader_url"]);
      return String(data.ledai_downloader_url || DEFAULT_DOWNLOADER_URL).trim() || DEFAULT_DOWNLOADER_URL;
    } catch {
      return DEFAULT_DOWNLOADER_URL;
    }
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function renderPanel() {
    if (panel) return panel;
    panel = document.createElement("section");
    panel.id = "ledai-zalo-grabber";
    panel.innerHTML = `
      <style>
        #ledai-zalo-grabber { position: fixed; right: 18px; bottom: 18px; width: min(360px, calc(100vw - 32px)); z-index: 2147483647; background: rgba(16, 20, 36, 0.95); color: #fff; border-radius: 18px; padding: 16px; box-shadow: 0 18px 50px rgba(0, 0, 0, 0.35); font-family: Arial, sans-serif; }
        #ledai-zalo-grabber .lg-title { margin: 0 0 8px; font-size: 16px; font-weight: 700; }
        #ledai-zalo-grabber .lg-note { margin: 0; color: #c8d1ff; font-size: 12px; line-height: 1.5; }
        #ledai-zalo-grabber .lg-url { margin: 12px 0; padding: 10px; border-radius: 12px; background: rgba(255,255,255,0.08); font-size: 12px; line-height: 1.5; word-break: break-all; max-height: 96px; overflow: auto; }
        #ledai-zalo-grabber .lg-actions { display: flex; gap: 8px; flex-wrap: wrap; }
        #ledai-zalo-grabber button, #ledai-zalo-grabber a { min-height: 40px; padding: 0 14px; border-radius: 12px; border: 0; text-decoration: none; font-size: 13px; font-weight: 700; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; }
        #ledai-zalo-grabber .primary { background: linear-gradient(90deg, #4f88f7, #6750e8); color: #fff; }
        #ledai-zalo-grabber .secondary { background: #e9eeff; color: #2f3e79; }
        #ledai-zalo-grabber .disabled { opacity: 0.45; pointer-events: none; }
        #ledai-zalo-grabber .lg-status { margin: 10px 0 0; color: #c8d1ff; font-size: 12px; line-height: 1.5; }
        #ledai-zalo-grabber .lg-status.error { color: #ffb5b5; }
        #ledai-zalo-grabber .lg-status.success { color: #b8ffd7; }
        #ledai-zalo-grabber .progress { margin-top: 10px; }
        #ledai-zalo-grabber .progress-top { display: flex; justify-content: space-between; gap: 10px; color: #dbe3ff; font-size: 12px; }
        #ledai-zalo-grabber .progress-bar { margin-top: 6px; height: 10px; border-radius: 999px; background: rgba(255,255,255,0.12); overflow: hidden; }
        #ledai-zalo-grabber .progress-fill { width: 0%; height: 100%; background: linear-gradient(90deg, #4f88f7, #6750e8); transition: width 220ms ease; }
      </style>
      <p class="lg-title">${TEXT.title}</p>
      <p class="lg-note">${TEXT.note}</p>
      <div class="lg-url" id="lg-url">${TEXT.noLink}</div>
      <div class="lg-actions">
        <button type="button" class="primary disabled" id="lg-copy">${TEXT.copy}</button>
        <a class="secondary disabled" id="lg-open" href="#" target="_blank" rel="noopener noreferrer">${TEXT.open}</a>
        <button type="button" class="primary disabled" id="lg-download">${TEXT.download}</button>
      </div>
      <div class="progress">
        <div class="progress-top">
          <span id="lg-progress-stage">${TEXT.progress}</span>
          <span id="lg-progress-value">0%</span>
        </div>
        <div class="progress-bar"><div class="progress-fill" id="lg-progress-fill"></div></div>
      </div>
      <p class="lg-status" id="lg-status">${TEXT.ready}</p>
    `;
    document.documentElement.appendChild(panel);
    panel.querySelector("#lg-copy").addEventListener("click", async () => {
      if (!latestUrl) return;
      await navigator.clipboard.writeText(latestUrl).catch(() => {});
    });
    panel.querySelector("#lg-download").addEventListener("click", () => {
      triggerDirectDownload().catch(() => {});
    });
    return panel;
  }

  function setStatus(message, type = "") {
    const root = renderPanel();
    const status = root.querySelector("#lg-status");
    status.textContent = message;
    status.classList.remove("error", "success");
    if (type) status.classList.add(type);
  }

  function setProgress(progress, stage = TEXT.progress) {
    const root = renderPanel();
    const safe = Math.max(0, Math.min(100, Math.floor(progress || 0)));
    root.querySelector("#lg-progress-stage").textContent = stage;
    root.querySelector("#lg-progress-value").textContent = `${safe}%`;
    root.querySelector("#lg-progress-fill").style.width = `${safe}%`;
  }

  async function triggerDirectDownload() {
    if (!latestUrl || isDownloading) return;
    isDownloading = true;
    const root = renderPanel();
    const button = root.querySelector("#lg-download");
    button.classList.add("disabled");
    setProgress(0, TEXT.creatingJob);
    setStatus(TEXT.sendingBackend);
    try {
      const started = await chrome.runtime.sendMessage({ type: "ledai-start-m3u8-job", url: latestUrl, format: "audio", filename: "zalo-audio-link" });
      if (!started?.ok) throw new Error(started?.error || TEXT.unableCreate);
      const jobId = started.job_id;
      setProgress(started.progress || 5, started.stage || TEXT.creatingJob);
      setStatus(`${started.stage || TEXT.creatingJob} (${started.progress || 5}%)`);
      while (true) {
        await sleep(1200);
        const state = await chrome.runtime.sendMessage({ type: "ledai-get-m3u8-job", jobId });
        if (!state?.ok) throw new Error(state?.error || TEXT.unableReadProgress);
        setProgress(state.progress || 0, state.stage || TEXT.processing);
        setStatus(`${state.stage || TEXT.processing} (${state.progress || 0}%)`);
        if (state.status === "done") {
          await chrome.runtime.sendMessage({ type: "ledai-download-file", url: state.file_url, filename: state.filename || "zalo-audio-link.mp3" });
          setProgress(100, TEXT.complete);
          setStatus(`${TEXT.downloadedPrefix}${state.filename || "zalo-audio-link.mp3"}`, "success");
          break;
        }
        if (state.status === "error") throw new Error(state.error || TEXT.failed);
      }
    } catch (error) {
      setStatus(error.message || TEXT.backendFailed, "error");
    } finally {
      isDownloading = false;
      if (latestUrl) button.classList.remove("disabled");
    }
  }

  async function updatePanel(url) {
    latestUrl = url;
    const root = renderPanel();
    const urlBox = root.querySelector("#lg-url");
    const copyButton = root.querySelector("#lg-copy");
    const openLink = root.querySelector("#lg-open");
    const downloadButton = root.querySelector("#lg-download");
    const downloaderUrl = await getDownloaderUrl();
    const destination = new URL(downloaderUrl);

    urlBox.innerHTML = escapeHtml(url);
    [copyButton, openLink, downloadButton].forEach((node) => node.classList.remove("disabled"));
    openLink.href = destination.toString();
    setProgress(0, TEXT.progress);
    setStatus(TEXT.gotLatest);
  }

  function injectPageScript() {
    const script = document.createElement("script");
    script.src = chrome.runtime.getURL("injected.js");
    script.onload = () => script.remove();
    (document.head || document.documentElement).appendChild(script);
  }

  window.addEventListener("ledai-zalo-m3u8", (event) => {
    const url = String(event.detail?.url || "").trim();
    if (!url) return;
    updatePanel(url).catch(() => {});
  });

  injectPageScript();
  renderPanel();
})();



