const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, "public");
const RESOLVE_CACHE_TTL_MS = 90 * 1000;

const resolveCache = new Map();
const inFlightResolves = new Map();
let sharedBrowserPromise = null;

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".webp": "image/webp",
  ".mp4": "video/mp4"
};

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function isJimengUrl(value) {
  try {
    const parsed = new URL(value);
    return /(^|\.)jimeng\.jianying\.com$/i.test(parsed.hostname);
  } catch {
    return false;
  }
}

function dedupeQualities(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = `${item.quality}::${item.url}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function scoreSourceUrl(url) {
  const value = String(url || "").toLowerCase();
  if (!value.startsWith("http")) return -1000;

  let score = 0;
  if (value.includes(".mp4")) score += 5;
  if (value.includes("watermark")) score -= 100;
  if (value.includes("display_watermark")) score -= 120;
  if (value.includes("no_watermark") || value.includes("without_watermark")) score += 120;
  if (value.includes("origin")) score += 10;
  return score;
}

function isWatermarkUrl(url) {
  const value = String(url || "").toLowerCase();
  return /display_watermark|watermark/i.test(value);
}

function normalizeVideoResult(raw) {
  const urls = Array.isArray(raw?.qualities) ? raw.qualities : [];
  const normalized = dedupeQualities(
    urls
      .filter((item) => typeof item?.url === "string" && /^https?:\/\//i.test(item.url))
      .sort((a, b) => scoreSourceUrl(b.url) - scoreSourceUrl(a.url))
      .map((item, index) => ({
        label: item.label || (index === 0 ? "Nguon uu tien" : `Quality ${index + 1}`),
        quality: item.quality || `q${index + 1}`,
        url: item.url,
        width: Number(item.width) || 0,
        height: Number(item.height) || 0,
        size: Number(item.size) || 0,
        fps: Number(item.fps) || 0,
        watermark_status: item.watermark_status || "unknown"
      }))
  );

  if (normalized.length === 0) {
    throw new Error("Khong tim thay URL video hop le.");
  }

  return {
    item_id: String(raw?.item_id || ""),
    cover_url: String(raw?.cover_url || ""),
    qualities: normalized
  };
}

function collectUrlsDeep(value, bucket = []) {
  if (!value) return bucket;
  if (typeof value === "string") {
    if (/^https?:\/\//i.test(value)) bucket.push(value);
    return bucket;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectUrlsDeep(item, bucket);
    return bucket;
  }
  if (typeof value === "object") {
    for (const v of Object.values(value)) collectUrlsDeep(v, bucket);
  }
  return bucket;
}

async function resolveRedirectInfo(url) {
  const response = await fetch(url, {
    method: "GET",
    redirect: "follow",
    headers: { "User-Agent": "Mozilla/5.0" }
  });

  const finalUrl = response.url || url;
  const redirected = new URL(finalUrl, url);
  const itemId = redirected.searchParams.get("id") || "";
  return { itemId, location: redirected.toString() };
}

function extractFromMetadata(metadata) {
  const downloadInfo = metadata?.download_info || {};
  const allUrls = collectUrlsDeep(downloadInfo, []);

  if (typeof metadata?.video_url === "string") {
    allUrls.push(metadata.video_url);
  }

  const unique = [...new Set(allUrls)];
  return unique
    .map((url, index) => {
      const isLikelyNoWatermark = /without_watermark|no_watermark/i.test(url) || !isWatermarkUrl(url);
      return {
        label: index === 0 ? "Nguon Jimeng" : `Nguon ${index + 1}`,
        quality: index === 0 ? "origin" : `alt_${index + 1}`,
        url,
        width: Number(metadata?.width) || 0,
        height: Number(metadata?.height) || 0,
        watermark_status: isLikelyNoWatermark ? "likely_no_watermark" : "likely_watermark"
      };
    });
}

async function tryResolveViaJimengApi(url) {
  const { itemId } = await resolveRedirectInfo(url);
  if (!itemId) return null;

  const endpoint = "https://jimeng.jianying.com/mweb/v1/get_item_info?uid=0&aid=581595&app_name=dreamina&duanwai_huiliu_page=1";
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "sign-ver": "1",
      "appid": "581595",
      "User-Agent": "Mozilla/5.0"
    },
    body: JSON.stringify({
      published_item_id: itemId,
      pack_item_opt: { need_follow_info: true }
    })
  });

  if (!response.ok) return null;
  const payload = await response.json().catch(() => null);
  if (!payload || payload.ret !== "0" || !payload.data) return null;

  const item = payload.data;
  const metadata = item.metadata || {};
  const qualities = extractFromMetadata(metadata);
  if (qualities.length === 0) return null;

  return normalizeVideoResult({
    item_id: metadata.video_id || itemId,
    cover_url: metadata.cover_url || "",
    qualities
  });
}

function parseSoraJsonPayload(payload) {
  if (!payload || typeof payload !== "object") return null;

  const candidates = [];
  const list = Array.isArray(payload?.qualities) ? payload.qualities : [];
  for (const item of list) {
    if (!item || typeof item.url !== "string") continue;
    candidates.push({
      label: item.label || "Nguon Sora",
      quality: item.quality || "sora",
      url: item.url,
      width: Number(item.width) || 0,
      height: Number(item.height) || 0,
      watermark_status: item.watermark_status || "unknown"
    });
  }

  const directKeys = ["url", "download_url", "video_url", "nowm", "origin"];
  for (const key of directKeys) {
    const value = payload[key];
    if (typeof value === "string" && /^https?:\/\//i.test(value)) {
      candidates.push({
        label: "Nguon Sora",
        quality: key,
        url: value,
        width: 0,
        height: 0,
        watermark_status: "unknown"
      });
    }
  }

  if (candidates.length === 0) return null;
  return {
    item_id: String(payload.item_id || payload.id || ""),
    cover_url: String(payload.cover_url || payload.cover || payload.thumbnail || ""),
    qualities: candidates
  };
}

function parseSoraTextPayload(text, sourceUrl) {
  const urls = new Set();
  const matches = String(text || "").match(/https?:\/\/[^\s"'<>]+/g) || [];
  for (const m of matches) {
    if (/\.mp4(\?|$)/i.test(m) || /mime_type=video_mp4/i.test(m)) {
      urls.add(m);
    }
  }

  if (urls.size === 0) return null;
  return {
    item_id: "",
    cover_url: "",
    qualities: [...urls].slice(0, 4).map((u, idx) => ({
      label: idx === 0 ? "Nguon Sora" : `Nguon Sora ${idx + 1}`,
      quality: `sora_${idx + 1}`,
      url: u,
      width: 0,
      height: 0,
      watermark_status: "unknown"
    })),
    source_url: sourceUrl
  };
}

async function resolveViaSoraFallback(url) {
  const endpoint = `https://sora2dl.com/downloadi.php?url=${encodeURIComponent(url)}`;
  const response = await fetch(endpoint, {
    method: "GET",
    headers: {
      "User-Agent": "Mozilla/5.0",
      Referer: "https://sora2dl.com/jimeng"
    }
  });

  if (!response.ok) {
    throw new Error(`Sora fallback loi HTTP ${response.status}.`);
  }

  const contentType = String(response.headers.get("content-type") || "").toLowerCase();
  if (contentType.includes("application/json")) {
    const json = await response.json().catch(() => null);
    const parsed = parseSoraJsonPayload(json);
    if (parsed) return normalizeVideoResult(parsed);
    throw new Error("Sora fallback khong tra JSON hop le.");
  }

  const text = await response.text();
  try {
    const json = JSON.parse(text);
    const parsedFromJsonText = parseSoraJsonPayload(json);
    if (parsedFromJsonText) return normalizeVideoResult(parsedFromJsonText);
  } catch {
    // Not JSON text, continue parse by regex.
  }

  const parsedText = parseSoraTextPayload(text, endpoint);
  if (parsedText) return normalizeVideoResult(parsedText);
  throw new Error("Sora fallback khong lay duoc URL video.");
}

function findBrowserExecutable() {
  const candidates = [
    process.env.CHROME_PATH,
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/usr/bin/google-chrome",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"
  ].filter(Boolean);

  return candidates.find((candidate) => {
    try {
      return fs.existsSync(candidate);
    } catch {
      return false;
    }
  }) || "";
}

async function getSharedBrowser() {
  if (sharedBrowserPromise) return sharedBrowserPromise;

  const puppeteer = require("puppeteer-core");
  const executablePath = findBrowserExecutable();
  if (!executablePath) {
    throw new Error("Khong tim thay Chrome/Edge. Dat CHROME_PATH hoac cai Chromium.");
  }

  sharedBrowserPromise = puppeteer.launch({
    executablePath,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"]
  });

  try {
    const browser = await sharedBrowserPromise;
    browser.on("disconnected", () => {
      sharedBrowserPromise = null;
    });
    return browser;
  } catch (error) {
    sharedBrowserPromise = null;
    throw error;
  }
}

function extractFromLandingPayload(payload) {
  const root = payload?.data?.page_info?.creation || payload?.data?.creation || null;
  const list = payload?.data?.page_info?.creation_list || payload?.data?.creation_list || [];
  const candidates = [root, ...list].filter(Boolean);

  for (const item of candidates) {
    const metadata = item?.metadata || {};
    const qualities = extractFromMetadata(metadata);
    if (qualities.length > 0) {
      return {
        item_id: metadata.video_id || "",
        cover_url: metadata.cover_url || "",
        qualities
      };
    }
  }

  return null;
}

async function resolveViaBrowserAutomation(url) {
  const browser = await getSharedBrowser();
  const page = await browser.newPage();

  try {
    await page.setUserAgent("Mozilla/5.0");
    await page.setRequestInterception(true);
    page.on("request", (request) => {
      const type = request.resourceType();
      if (type === "image" || type === "font" || type === "stylesheet" || type === "media") {
        request.abort().catch(() => {});
        return;
      }
      request.continue().catch(() => {});
    });

    let extracted = null;

    page.on("response", async (response) => {
      if (extracted) return;
      const responseUrl = response.url();
      const isTarget = responseUrl.includes("/luckycat/cn/jianying/campaign/v1/dreamina/share/landing_page")
        || responseUrl.includes("/mproject/creation/list_by_ids");
      if (!isTarget) return;

      try {
        const json = await response.json();
        const parsed = extractFromLandingPayload(json);
        if (parsed) extracted = parsed;
      } catch {
        // Ignore parse errors.
      }
    });

    const targetResponse = page.waitForResponse((response) => {
      const responseUrl = response.url();
      return responseUrl.includes("/luckycat/cn/jianying/campaign/v1/dreamina/share/landing_page")
        || responseUrl.includes("/mproject/creation/list_by_ids");
    }, { timeout: 12000 }).catch(() => null);

    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 25000 });
    await targetResponse;

    const waitUntil = Date.now() + 3500;
    while (!extracted && Date.now() < waitUntil) {
      await new Promise((resolve) => setTimeout(resolve, 120));
    }

    if (!extracted) {
      const domVideo = await page.evaluate(() => {
        const video = document.querySelector("video");
        const poster = document.querySelector("meta[property='og:image']");
        return {
          url: video?.getAttribute("src") || "",
          cover: poster?.getAttribute("content") || ""
        };
      });

      if (domVideo?.url) {
        const idMatch = /\/s\/([^/?#]+)/i.exec(url) || null;
        extracted = {
          item_id: idMatch?.[1] || "",
          cover_url: domVideo.cover || "",
          qualities: [{
            label: "Video tren trang chia se",
            quality: "origin",
            url: domVideo.url,
            width: 0,
            height: 0,
            watermark_status: /watermark/i.test(domVideo.url) ? "likely_watermark" : "unknown"
          }]
        };
      }
    }

    if (!extracted) {
      throw new Error("Khong trich xuat duoc video tu trang chia se Jimeng.");
    }

    return normalizeVideoResult(extracted);
  } finally {
    await page.close().catch(() => {});
  }
}

function getCachedResolve(url) {
  const cached = resolveCache.get(url);
  if (!cached) return null;
  if (cached.expiresAt <= Date.now()) {
    resolveCache.delete(url);
    return null;
  }
  return cached.value;
}

function putCachedResolve(url, value) {
  resolveCache.set(url, {
    value,
    expiresAt: Date.now() + RESOLVE_CACHE_TTL_MS
  });
}

async function resolveJimengVideo(url) {
  const cached = getCachedResolve(url);
  if (cached) return cached;

  const inFlight = inFlightResolves.get(url);
  if (inFlight) return inFlight;

  const work = (async () => {
    const soraResult = await resolveViaSoraFallback(url);
    const finalResult = { ...soraResult, resolver: "sora2dl" };
    putCachedResolve(url, finalResult);
    return finalResult;
  })();

  inFlightResolves.set(url, work);
  try {
    return await work;
  } finally {
    inFlightResolves.delete(url);
  }
}

function isUnsafeHostname(hostname) {
  const host = String(hostname || "").toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost")) return true;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
    const [a, b] = host.split(".").map(Number);
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 192 && b === 168) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
  }
  return false;
}

function isLikelyVodHost(hostname) {
  const host = String(hostname || "").toLowerCase();
  return host.includes("vlabvod.com") || host.includes("bytecdn") || host.includes("bytedancevod.com");
}

function sanitizeFilename(input) {
  const raw = String(input || "").trim();
  if (!raw) return `jimeng_${Date.now()}.mp4`;
  const cleaned = raw.replace(/[<>:"/\\|?*\x00-\x1F]/g, "_").slice(0, 120);
  return cleaned.toLowerCase().endsWith(".mp4") ? cleaned : `${cleaned}.mp4`;
}

function serveStaticFile(req, res) {
  const requestedPath = req.url === "/" ? "/index.html" : req.url;
  const safePath = path.normalize(requestedPath).replace(/^(\.\.[\\/])+/, "");
  const filePath = path.join(PUBLIC_DIR, safePath);

  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === "ENOENT") {
        res.writeHead(404);
        res.end("Not found");
        return;
      }
      res.writeHead(500);
      res.end("Internal server error");
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { "Content-Type": MIME_TYPES[ext] || "application/octet-stream" });
    res.end(content);
  });
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 1024 * 1024) {
        reject(new Error("Payload too large"));
        req.destroy();
      }
    });
    req.on("end", () => resolve(raw));
    req.on("error", reject);
  });
}

const server = http.createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/healthz") {
    sendJson(res, 200, { ok: true, uptime: process.uptime() });
    return;
  }

  if (req.method === "POST" && req.url === "/api/resolve") {
    try {
      const rawBody = await readRequestBody(req);
      const body = rawBody ? JSON.parse(rawBody) : {};
      const url = typeof body.url === "string" ? body.url.trim() : "";

      if (!url) return sendJson(res, 400, { error: "Vui long nhap link Jimeng." });
      if (!isJimengUrl(url)) return sendJson(res, 400, { error: "Link khong phai Jimeng hop le." });

      const result = await resolveJimengVideo(url);
      sendJson(res, 200, result);
    } catch (error) {
      const message = error instanceof SyntaxError
        ? "Request JSON khong hop le."
        : error.message || "Khong the xu ly link Jimeng luc nay.";
      sendJson(res, 500, { error: message });
    }
    return;
  }

  if (req.method === "GET" && req.url.startsWith("/api/download?")) {
    try {
      const base = `http://${req.headers.host || `localhost:${PORT}`}`;
      const parsed = new URL(req.url, base);
      const sourceUrl = parsed.searchParams.get("url") || "";
      const filename = sanitizeFilename(parsed.searchParams.get("name"));

      if (!sourceUrl) return sendJson(res, 400, { error: "Thieu tham so url." });

      const sourceParsed = new URL(sourceUrl);
      if (!/^https?:$/i.test(sourceParsed.protocol) || isUnsafeHostname(sourceParsed.hostname)) {
        return sendJson(res, 400, { error: "Nguon tai khong hop le." });
      }
      const upstream = await fetch(sourceUrl, {
        method: "GET",
        headers: {
          "User-Agent": "Mozilla/5.0",
          Referer: "https://jimeng.jianying.com/",
          Origin: "https://jimeng.jianying.com"
        },
        redirect: "follow"
      });

      if (!upstream.ok || !upstream.body) {
        if ((upstream.status === 403 || upstream.status === 404) && isLikelyVodHost(sourceParsed.hostname)) {
          res.writeHead(302, { Location: sourceUrl, "Cache-Control": "no-store" });
          res.end();
          return;
        }
        return sendJson(res, 502, { error: "Khong the tai video tu nguon." });
      }

      const contentType = upstream.headers.get("content-type") || "video/mp4";
      res.writeHead(200, {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store"
      });

      upstream.body.pipeTo(new WritableStream({
        write(chunk) {
          res.write(Buffer.from(chunk));
        },
        close() {
          res.end();
        },
        abort(err) {
          res.destroy(err);
        }
      })).catch((err) => {
        if (!res.headersSent) {
          sendJson(res, 500, { error: "Loi khi stream file." });
        } else {
          res.destroy(err);
        }
      });
    } catch (error) {
      sendJson(res, 500, { error: error.message || "Khong the tai file." });
    }
    return;
  }

  if (req.method === "GET") {
    serveStaticFile(req, res);
    return;
  }

  res.writeHead(405);
  res.end("Method not allowed");
});

server.listen(PORT, () => {
  const chromeCandidate = findBrowserExecutable() || process.env.CHROME_PATH || "(not found)";
  console.log(`[boot] Node ${process.version}`);
  console.log(`[boot] PORT=${PORT}`);
  console.log(`[boot] CHROME_PATH=${chromeCandidate}`);
  console.log(`Server running at http://localhost:${PORT}`);
});
