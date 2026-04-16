chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "ledai-download-mp3") return undefined;

  (async () => {
    try {
      const data = await chrome.storage.local.get(["ledai_downloader_url"]);
      const downloaderBase = String(
        data.ledai_downloader_url || "https://ledai-364n.onrender.com/giongnoi/"
      ).trim() || "https://ledai-364n.onrender.com/giongnoi/";
      const endpoint = new URL("/api/giongnoi/from-link", downloaderBase);
      endpoint.searchParams.set("url", String(message.url || "").trim());
      endpoint.searchParams.set("format", "mp3");
      endpoint.searchParams.set("filename", "zalo-audio-link");

      const response = await fetch(endpoint.toString(), {
        method: "GET"
      });

      const json = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(json.error || "Backend khong tai duoc audio.");
      }

      const fileUrl = new URL(json.file_path, downloaderBase).toString();
      sendResponse({ ok: true, fileUrl, filename: json.filename || "zalo-audio-link.mp3" });
    } catch (error) {
      sendResponse({ ok: false, error: error?.message || "Failed to fetch" });
    }
  })();

  return true;
});
