const input = document.getElementById("downloader-url");
const button = document.getElementById("save-btn");
const status = document.getElementById("status");
const DEFAULT_URL = "https://ledai-364n.onrender.com/giongnoi/";

async function init() {
  const data = await chrome.storage.local.get(["ledai_downloader_url"]);
  input.value = data.ledai_downloader_url || DEFAULT_URL;
}

button.addEventListener("click", async () => {
  const value = String(input.value || "").trim() || DEFAULT_URL;
  await chrome.storage.local.set({ ledai_downloader_url: value });
  status.textContent = "Đã lưu downloader URL.";
});

init().catch(() => {
  input.value = DEFAULT_URL;
});
