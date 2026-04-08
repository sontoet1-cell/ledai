const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, "public");

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

function normalizeVideoResult(raw) {
  const urls = Array.isArray(raw?.qualities) ? raw.qualities : [];
  const normalized = dedupeQualities(
    urls
      .filter((item) => typeof item?.url === "string" && /^https?:\/\//i.test(item.url))
      .map((item, index) => ({
        label: item.label || (index === 0 ? "Origin (No Watermark)" : `Quality ${index + 1}`),
        quality: item.quality || `q${index + 1}`,
        url: item.url,
        width: Number(item.width) || 0,
        height: Number(item.height) || 0,
        size: Number(item.size) || 0,
        fps: Number(item.fps) || 0,
        is_clean: item.is_clean !== false
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

async function resolveRedirectInfo(url) {
  const response = await fetch(url, {
    method: "GET",
    redirect: "manual",
    headers: { "User-Agent": "Mozilla/5.0" }
  });

  const location = response.headers.get("location") || "";
  if (!location) return { itemId: "", location: "" };

  const redirected = new URL(location, url);
  const itemId = redirected.searchParams.get("id") || "";
  return { itemId, location: redirected.toString() };
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
  const downloadInfo = metadata.download_info || {};

  const qualities = [];
  if (typeof downloadInfo.watermark_ending_url === "string") {
    qualities.push({
      label: "Origin (No Watermark)",
      quality: "origin",
      url: downloadInfo.watermark_ending_url,
      width: Number(metadata.width) || 0,
      height: Number(metadata.height) || 0,
      is_clean: true
    });
  }

  if (typeof metadata.video_url === "string") {
    qualities.push({
      label: "Fallback",
      quality: "fallback",
      url: metadata.video_url,
      width: Number(metadata.width) || 0,
      height: Number(metadata.height) || 0,
      is_clean: true
    });
  }

  if (qualities.length === 0) return null;

  return normalizeVideoResult({
    item_id: metadata.video_id || itemId,
    cover_url: metadata.cover_url || "",
    qualities
  });
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

function extractFromLandingPayload(payload) {
  const root = payload?.data?.page_info?.creation || payload?.data?.creation || null;
  const list = payload?.data?.page_info?.creation_list || payload?.data?.creation_list || [];
  const candidates = [root, ...list].filter(Boolean);

  for (const item of candidates) {
    const metadata = item?.metadata || {};
    const downloadInfo = metadata.download_info || {};
    const qualities = [];

    if (typeof downloadInfo.watermark_ending_url === "string") {
      qualities.push({
        label: "Origin (No Watermark)",
        quality: "origin",
        url: downloadInfo.watermark_ending_url,
        width: Number(metadata.width) || 0,
        height: Number(metadata.height) || 0,
        is_clean: true
      });
    }

    if (typeof metadata.video_url === "string") {
      qualities.push({
        label: "Fallback",
        quality: "fallback",
        url: metadata.video_url,
        width: Number(metadata.width) || 0,
        height: Number(metadata.height) || 0,
        is_clean: true
      });
    }

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
  // Lazy-load to avoid failing startup if dependency is missing.
  const puppeteer = require("puppeteer-core");
  const executablePath = findBrowserExecutable();

  if (!executablePath) {
    throw new Error("Khong tim thay Chrome/Edge. Dat CHROME_PATH hoac cai trinh duyet Chromium.");
  }

  const browser = await puppeteer.launch({
    executablePath,
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu"
    ]
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent("Mozilla/5.0");
    let extracted = null;

    page.on("response", async (response) => {
      if (extracted) return;
      const responseUrl = response.url();
      if (
        !responseUrl.includes("/luckycat/cn/jianying/campaign/v1/dreamina/share/landing_page")
        && !responseUrl.includes("/mproject/creation/list_by_ids")
      ) {
        return;
      }

      try {
        const json = await response.json();
        const parsed = extractFromLandingPayload(json);
        if (parsed) {
          extracted = parsed;
        }
      } catch {
        // Ignore non-JSON or blocked responses.
      }
    });

    const targetResponse = page.waitForResponse((response) => {
      const responseUrl = response.url();
      return responseUrl.includes("/luckycat/cn/jianying/campaign/v1/dreamina/share/landing_page")
        || responseUrl.includes("/mproject/creation/list_by_ids");
    }, { timeout: 30000 }).catch(() => null);

    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90000 });
    await targetResponse;
    await new Promise((resolve) => setTimeout(resolve, 4000));

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
            label: "Origin (No Watermark)",
            quality: "origin",
            url: domVideo.url,
            width: 0,
            height: 0,
            is_clean: true
          }]
        };
      }
    }

    if (!extracted) {
      throw new Error("Khong trich xuat duoc video tu trang chia se Jimeng.");
    }

    return normalizeVideoResult(extracted);
  } finally {
    await browser.close();
  }
}

async function resolveJimengVideo(url) {
  const apiResult = await tryResolveViaJimengApi(url).catch(() => null);
  if (apiResult) return apiResult;

  let lastError = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await resolveViaBrowserAutomation(url);
    } catch (error) {
      lastError = error;
      const message = String(error?.message || "").toLowerCase();
      const shouldRetry = message.includes("timeout") || message.includes("fetch") || message.includes("network");
      if (attempt === 0 && shouldRetry) {
        await new Promise((resolve) => setTimeout(resolve, 1200));
        continue;
      }
      throw error;
    }
  }

  throw lastError || new Error("Khong the phan tich link Jimeng.");
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

    req.on("end", () => {
      resolve(raw);
    });

    req.on("error", reject);
  });
}

const server = http.createServer(async (req, res) => {
  if (req.method === "POST" && req.url === "/api/resolve") {
    try {
      const rawBody = await readRequestBody(req);
      const body = rawBody ? JSON.parse(rawBody) : {};
      const url = typeof body.url === "string" ? body.url.trim() : "";

      if (!url) {
        sendJson(res, 400, { error: "Vui long nhap link Jimeng." });
        return;
      }

      if (!isJimengUrl(url)) {
        sendJson(res, 400, { error: "Link khong phai Jimeng hop le." });
        return;
      }

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

      if (!sourceUrl) {
        sendJson(res, 400, { error: "Thieu tham so url." });
        return;
      }

      const sourceParsed = new URL(sourceUrl);
      if (!/^https?:$/i.test(sourceParsed.protocol) || isUnsafeHostname(sourceParsed.hostname)) {
        sendJson(res, 400, { error: "Nguon tai khong hop le." });
        return;
      }

      const upstream = await fetch(sourceUrl, {
        method: "GET",
        headers: { "User-Agent": "Mozilla/5.0" },
        redirect: "follow"
      });

      if (!upstream.ok || !upstream.body) {
        sendJson(res, 502, { error: "Khong the tai video tu nguon." });
        return;
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
  console.log(`Server running at http://localhost:${PORT}`);
});
