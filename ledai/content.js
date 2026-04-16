(function () {
  "use strict";

  const DEFAULT_DOWNLOADER_URL = "https://ledai-364n.onrender.com/giongnoi/";
  let latestUrl = "";
  let panel = null;
  let isDownloading = false;

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

  function renderPanel() {
    if (panel) return panel;
    panel = document.createElement("section");
    panel.id = "ledai-zalo-grabber";
    panel.innerHTML = `
      <style>
        #ledai-zalo-grabber {
          position: fixed;
          right: 18px;
          bottom: 18px;
          width: min(360px, calc(100vw - 32px));
          z-index: 2147483647;
          background: rgba(16, 20, 36, 0.95);
          color: #fff;
          border-radius: 18px;
          padding: 16px;
          box-shadow: 0 18px 50px rgba(0, 0, 0, 0.35);
          font-family: Arial, sans-serif;
        }
        #ledai-zalo-grabber .lg-title {
          margin: 0 0 8px;
          font-size: 16px;
          font-weight: 700;
        }
        #ledai-zalo-grabber .lg-note {
          margin: 0;
          color: #c8d1ff;
          font-size: 12px;
          line-height: 1.5;
        }
        #ledai-zalo-grabber .lg-url {
          margin: 12px 0;
          padding: 10px;
          border-radius: 12px;
          background: rgba(255,255,255,0.08);
          font-size: 12px;
          line-height: 1.5;
          word-break: break-all;
          max-height: 96px;
          overflow: auto;
        }
        #ledai-zalo-grabber .lg-actions {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }
        #ledai-zalo-grabber button, #ledai-zalo-grabber a {
          min-height: 40px;
          padding: 0 14px;
          border-radius: 12px;
          border: 0;
          text-decoration: none;
          font-size: 13px;
          font-weight: 700;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
        }
        #ledai-zalo-grabber .primary {
          background: linear-gradient(90deg, #4f88f7, #6750e8);
          color: #fff;
        }
        #ledai-zalo-grabber .secondary {
          background: #e9eeff;
          color: #2f3e79;
        }
        #ledai-zalo-grabber .disabled {
          opacity: 0.45;
          pointer-events: none;
        }
        #ledai-zalo-grabber .lg-status {
          margin: 10px 0 0;
          color: #c8d1ff;
          font-size: 12px;
          line-height: 1.5;
        }
        #ledai-zalo-grabber .lg-status.error {
          color: #ffb5b5;
        }
        #ledai-zalo-grabber .lg-status.success {
          color: #b8ffd7;
        }
      </style>
      <p class="lg-title">Le Dai Zalo Grabber</p>
      <p class="lg-note">Khi trang phát audio, extension sẽ bắt link m3u8 mới nhất tại đây.</p>
      <div class="lg-url" id="lg-url">Chưa bắt được link m3u8.</div>
      <div class="lg-actions">
        <button type="button" class="primary disabled" id="lg-copy">Copy link</button>
        <a class="secondary disabled" id="lg-open" href="#" target="_blank" rel="noopener noreferrer">Mở downloader</a>
        <button type="button" class="primary disabled" id="lg-download">Tải MP3</button>
      </div>
      <p class="lg-status" id="lg-status">Sẵn sàng.</p>
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

  async function triggerDirectDownload() {
    if (!latestUrl || isDownloading) return;
    isDownloading = true;
    const root = renderPanel();
    const button = root.querySelector("#lg-download");
    button.classList.add("disabled");
    setStatus("Đang gửi backend xử lý MP3...");
    try {
      const result = await chrome.runtime.sendMessage({
        type: "ledai-download-mp3",
        url: latestUrl
      });
      if (!result?.ok) {
        throw new Error(result?.error || "Backend khong tai duoc audio.");
      }
      setStatus(`Đã gửi file tải: ${result.filename}`, "success");
    } catch (error) {
      setStatus(error.message || "Backend khong tai duoc audio.", "error");
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
    destination.searchParams.set("url", url);
    destination.searchParams.set("format", "mp3");
    destination.searchParams.set("autostart", "1");

    urlBox.innerHTML = escapeHtml(url);
    [copyButton, openLink, downloadButton].forEach((node) => node.classList.remove("disabled"));
    openLink.href = destination.toString();
    setStatus("Đã bắt được link m3u8 mới nhất.");
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
