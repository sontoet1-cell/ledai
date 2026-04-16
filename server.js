const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { Readable } = require("stream");
const { pipeline } = require("stream/promises");
const { spawn, spawnSync } = require("child_process");
const { URL } = require("url");
let ProxyAgentCtor = null;
try {
  ({ ProxyAgent: ProxyAgentCtor } = require("undici"));
} catch {
  ProxyAgentCtor = null;
}

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, "public");
const RESOLVE_CACHE_TTL_MS = 60 * 1000;
const RUNTIME_TEMP_DIR = path.join(__dirname, "runtime_tmp");
const YTDLP_PROXY = String(process.env.YTDLP_PROXY || "").trim();
const YTDLP_COOKIES_FILE = String(process.env.YTDLP_COOKIES_FILE || "").trim();
const YTDLP_COOKIES_B64 = String(process.env.YTDLP_COOKIES_B64 || "").trim();
const TIKWM_API_BASE = String(process.env.TIKWM_API_BASE || "https://www.tikwm.com").trim().replace(/\/+$/, "");
const SCRAPINGBEE_API_KEY = String(process.env.SCRAPINGBEE_API_KEY || "").trim();
const PROXYXOAY_KEY = String(process.env.PROXYXOAY_KEY || "").trim();
const PROXYXOAY_API_BASE = String(process.env.PROXYXOAY_API_BASE || "https://proxyxoay.shop").trim().replace(/\/+$/, "");
const PROXYXOAY_CACHE_MS = Math.max(10000, Number(process.env.PROXYXOAY_CACHE_MS || 45000));
const RECLIP_DOWNLOAD_DIR = path.join(RUNTIME_TEMP_DIR, "reclip_downloads");
const ZALO_TTS_API_HOST = "https://api.zalo.ai";
const ZALO_TTS_API_PATH = "/v1/tts/synthesize";
const ZALO_TTS_API_KEY = String(process.env.ZALO_TTS_API_KEY || "").trim();
const ZALO_TTS_MAX_RETRIES = Math.max(1, Number(process.env.ZALO_TTS_MAX_RETRIES || 4));
const ZALO_TTS_RETRY_BASE_MS = Math.max(1000, Number(process.env.ZALO_TTS_RETRY_BASE_MS || 5000));
const ZALO_TTS_PART_DELAY_MS = Math.max(0, Number(process.env.ZALO_TTS_PART_DELAY_MS || 4500));
const GIONGNOI_FILE_TTL_MS = Math.max(60 * 1000, Number(process.env.GIONGNOI_FILE_TTL_MS || (15 * 60 * 1000)));

const resolveCache = new Map();
const inFlightResolves = new Map();
const ffmpegExecutable = findFfmpegExecutable();
const ytDlpCommand = findYtDlpCommand();
const processJobs = new Map();
const reclipJobs = new Map();
const giongNoiBundles = new Map();
const giongNoiFiles = new Map();
const giongNoiLinkJobs = new Map();

try {
  fs.mkdirSync(RUNTIME_TEMP_DIR, { recursive: true });
  fs.mkdirSync(RECLIP_DOWNLOAD_DIR, { recursive: true });
} catch {
  // Ignore temp-dir initialization errors.
}

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".webp": "image/webp",
  ".mp4": "video/mp4",
  ".wav": "audio/wav",
  ".mp3": "audio/mpeg"
};

const DEFAULT_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
  "Accept-Language": "en-US,en;q=0.9"
};

function createHttpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = Number(statusCode) || 500;
  return error;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isProcessExecError(error) {
  const code = String(error?.code || "").toUpperCase();
  return code === "EPERM" || code === "EACCES" || code === "ENOENT";
}

function normalizeProcessError(error, fallbackMessage) {
  if (error?.statusCode) return error;
  if (isProcessExecError(error)) {
    return createHttpError(502, "May chu khong the chay yt-dlp (EPERM/EACCES/ENOENT).");
  }
  return createHttpError(502, fallbackMessage || error?.message || "Loi khi chay lenh he thong.");
}

function summarizeYtDlpError(stderrText, actionLabel = "xu ly") {
  const raw = String(stderrText || "").trim();
  const low = raw.toLowerCase();
  if (!raw) return `yt-dlp that bai khi ${actionLabel}.`;
  if (low.includes("the json object must be str") || low.includes("nonetype")) {
    return "Nguon downloader tra du lieu khong hop le. Thu lai sau it phut hoac doi link khac.";
  }
  if (low.includes("sign in to confirm you're not a bot") || low.includes("confirm you\u2019re not a bot")) {
    return "YouTube dang bat xac minh bot. Thu lai sau it phut hoac doi IP/Proxy sach.";
  }
  if (low.includes("this video is private") || low.includes("private video")) {
    return "Video khong cong khai (private), khong the tai truc tiep.";
  }
  if (low.includes("login required") || low.includes("sign in")) {
    return "Video yeu cau dang nhap de truy cap, khong the tai truc tiep.";
  }
  if (low.includes("unsupported url")) {
    return "Link khong duoc downloader ho tro.";
  }
  if (low.includes("unable to extract")) {
    return "Khong trich xuat duoc nguon video tu link nay.";
  }
  return `yt-dlp that bai khi ${actionLabel}.`;
}

function sanitizeClientErrorMessage(message) {
  const text = String(message || "").trim();
  const low = text.toLowerCase();
  if (!text) return "Khong the xu ly link nay luc nay.";
  if (low.includes("the json object must be str") || low.includes("nonetype")) {
    return "Nguon downloader tra du lieu khong hop le. Thu lai sau it phut hoac doi link khac.";
  }
  return text;
}

function platformDisplayName(platform) {
  const p = String(platform || "").toLowerCase();
  if (p === "youtube") return "YouTube";
  if (p === "tiktok") return "TikTok";
  if (p === "facebook") return "Facebook";
  if (p === "douyin") return "Douyin";
  if (p === "jimeng") return "Jimeng";
  return "Nen tang nay";
}

let resolvedYtDlpCookiesFile = "";
function ensureYtDlpCookiesFile() {
  if (resolvedYtDlpCookiesFile) return resolvedYtDlpCookiesFile;
  if (YTDLP_COOKIES_FILE) {
    resolvedYtDlpCookiesFile = YTDLP_COOKIES_FILE;
    return resolvedYtDlpCookiesFile;
  }
  if (!YTDLP_COOKIES_B64) return "";
  try {
    const out = path.join(RUNTIME_TEMP_DIR, "yt-cookies.txt");
    const decoded = Buffer.from(YTDLP_COOKIES_B64, "base64");
    fs.writeFileSync(out, decoded);
    resolvedYtDlpCookiesFile = out;
    return out;
  } catch {
    return "";
  }
}

function appendYtDlpGlobalArgs(baseArgs) {
  return [...baseArgs];
}

let rotatingProxyCache = {
  proxyUrl: "",
  expiresAt: 0
};

function buildProxyUrlFromRaw(raw) {
  const value = String(raw || "").trim();
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value;
  const parts = value.split(":");
  if (parts.length >= 4) {
    const host = parts[0] || "";
    const port = parts[1] || "";
    const user = parts[2] || "";
    const pass = parts.slice(3).join(":") || "";
    if (host && port && user && pass) {
      return `http://${encodeURIComponent(user)}:${encodeURIComponent(pass)}@${host}:${port}`;
    }
    if (host && port) {
      return `http://${host}:${port}`;
    }
  }
  if (parts.length >= 2 && parts[0] && parts[1]) {
    return `http://${parts[0]}:${parts[1]}`;
  }
  return "";
}

async function fetchProxyFromProxyXoay() {
  if (!PROXYXOAY_KEY) return "";
  const endpoint = new URL(`${PROXYXOAY_API_BASE}/api/get.php`);
  endpoint.searchParams.set("key", PROXYXOAY_KEY);
  endpoint.searchParams.set("nhamang", "random");
  endpoint.searchParams.set("tinhthanh", "0");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(endpoint.toString(), {
      method: "GET",
      headers: {
        ...DEFAULT_HEADERS
      },
      signal: controller.signal
    });
    if (!response.ok) return "";
    const json = await response.json().catch(() => null);
    if (!json || Number(json.status) !== 100) return "";
    const rawProxy = String(json.proxyhttp || json.proxysocks || "").trim();
    return buildProxyUrlFromRaw(rawProxy);
  } catch {
    return "";
  } finally {
    clearTimeout(timeout);
  }
}

async function getEffectiveYtDlpProxy(options = {}) {
  const useProxy = options.useProxy === true;
  if (!useProxy) return "";
  if (YTDLP_PROXY) return YTDLP_PROXY;
  if (PROXYXOAY_KEY) {
    if (rotatingProxyCache.proxyUrl && Date.now() < rotatingProxyCache.expiresAt) {
      return rotatingProxyCache.proxyUrl;
    }
    const fresh = await fetchProxyFromProxyXoay();
    if (fresh) {
      rotatingProxyCache = {
        proxyUrl: fresh,
        expiresAt: Date.now() + PROXYXOAY_CACHE_MS
      };
      return fresh;
    }
  }
  return YTDLP_PROXY || "";
}

async function appendYtDlpGlobalArgsAsync(baseArgs, options = {}) {
  const out = [...baseArgs];
  const includeCookies = options.includeCookies !== false;
  const cookiesFile = includeCookies ? ensureYtDlpCookiesFile() : "";
  if (cookiesFile) out.push("--cookies", cookiesFile);
  const proxy = await getEffectiveYtDlpProxy(options);
  if (proxy) out.push("--proxy", proxy);
  return out;
}

async function buildYtDlpResolveArgs(url, platformHint = "unknown", youtubeProfile = "default", options = {}) {
  let args = [
    "--dump-single-json",
    "--no-warnings",
    "--no-playlist",
    "--geo-bypass",
    "--geo-bypass-country", "US"
  ];
  if (platformHint === "youtube") {
    if (youtubeProfile === "default") {
      args.push("--extractor-args", "youtube:player_client=android,web");
    } else if (youtubeProfile === "mobile") {
      args.push("--extractor-args", "youtube:player_client=android,ios,mweb");
    } else if (youtubeProfile === "tv") {
      args.push("--extractor-args", "youtube:player_client=tv,web_safari");
    } else if (youtubeProfile === "tv_embedded") {
      args.push("--extractor-args", "youtube:player_client=tv_embedded,android");
    } else if (youtubeProfile === "skipweb") {
      args.push("--extractor-args", "youtube:player_skip=webpage,configs;player_client=android,ios");
    }
  }
  args.push(url);
  args = await appendYtDlpGlobalArgsAsync(args, options);
  return args;
}

function findExecutableInPath(binaryName) {
  const cmd = process.platform === "win32" ? "where" : "which";
  try {
    const probe = spawnSync(cmd, [binaryName], { stdio: ["ignore", "pipe", "ignore"], windowsHide: true });
    if (probe.status !== 0) return "";
    const first = String(probe.stdout || "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean);
    return first || "";
  } catch {
    return "";
  }
}

function findFfmpegExecutable() {
  const fromEnv = process.env.FFMPEG_PATH;
  if (fromEnv) {
    try {
      if (fs.existsSync(fromEnv)) return fromEnv;
    } catch {
      // Ignore invalid env path.
    }
  }

  const inPath = findExecutableInPath("ffmpeg");
  if (inPath) return inPath;

  try {
    const localAppData = process.env.LOCALAPPDATA || "";
    const wingetPackages = path.join(localAppData, "Microsoft", "WinGet", "Packages");
    if (fs.existsSync(wingetPackages)) {
      const packages = fs.readdirSync(wingetPackages, { withFileTypes: true });
      for (const entry of packages) {
        if (!entry.isDirectory()) continue;
        if (!/Gyan\.FFmpeg/i.test(entry.name)) continue;
        const base = path.join(wingetPackages, entry.name);
        const children = fs.readdirSync(base, { withFileTypes: true });
        for (const child of children) {
          if (!child.isDirectory()) continue;
          const candidate = path.join(base, child.name, "bin", "ffmpeg.exe");
          if (fs.existsSync(candidate)) return candidate;
        }
      }
    }
  } catch {
    // Ignore.
  }

  return "";
}

function hasFfmpeg() {
  return !!ffmpegExecutable;
}

function findPythonExecutable() {
  const candidates = process.platform === "win32"
    ? ["python", "python3", "py"]
    : ["python3", "python"];
  for (const name of candidates) {
    const found = findExecutableInPath(name);
    if (found) return found;
  }
  return "";
}

function canRunCommand(executable, args = []) {
  try {
    const probe = spawnSync(executable, args, {
      stdio: ["ignore", "pipe", "ignore"],
      windowsHide: true
    });
    return probe.status === 0;
  } catch {
    return false;
  }
}

function findYtDlpExecutable() {
  const fromEnv = process.env.YTDLP_PATH;
  if (fromEnv) {
    try {
      if (fs.existsSync(fromEnv)) return fromEnv;
    } catch {
      // Ignore invalid env path.
    }
  }

  const inPath = findExecutableInPath("yt-dlp");
  if (inPath) return inPath;

  try {
    const localAppData = process.env.LOCALAPPDATA || "";
    const wingetPackages = path.join(localAppData, "Microsoft", "WinGet", "Packages");
    if (fs.existsSync(wingetPackages)) {
      const packages = fs.readdirSync(wingetPackages, { withFileTypes: true });
      for (const entry of packages) {
        if (!entry.isDirectory()) continue;
        if (!/yt-dlp/i.test(entry.name)) continue;
        const base = path.join(wingetPackages, entry.name);

        const directCandidate = path.join(base, "yt-dlp.exe");
        if (fs.existsSync(directCandidate)) return directCandidate;

        const children = fs.readdirSync(base, { withFileTypes: true });
        for (const child of children) {
          if (!child.isDirectory()) continue;
          const candidate = path.join(base, child.name, "yt-dlp.exe");
          if (fs.existsSync(candidate)) return candidate;
        }
      }
    }
  } catch {
    // Ignore.
  }

  return "";
}

function findYtDlpCommand() {
  const direct = findYtDlpExecutable();
  if (direct && canRunCommand(direct, ["--version"])) {
    return {
      executable: direct,
      prefixArgs: [],
      mode: "binary"
    };
  }

  const python = findPythonExecutable();
  if (!python) return null;

  try {
    const probe = spawnSync(python, ["-m", "yt_dlp", "--version"], {
      stdio: ["ignore", "pipe", "ignore"],
      windowsHide: true
    });
    if (probe.status === 0) {
      return {
        executable: python,
        prefixArgs: ["-m", "yt_dlp"],
        mode: "python_module"
      };
    }
  } catch {
    // Ignore.
  }
  return null;
}

function getYtDlpVersionText() {
  if (!ytDlpCommand) return "(not found)";
  try {
    const probe = spawnSync(ytDlpCommand.executable, [...ytDlpCommand.prefixArgs, "--version"], {
      stdio: ["ignore", "pipe", "ignore"],
      windowsHide: true
    });
    if (probe.status !== 0) return "(version check failed)";
    const text = String(probe.stdout || "").trim();
    return text || "(empty)";
  } catch {
    return "(version check failed)";
  }
}

function createJobId() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

function getJob(id) {
  const job = processJobs.get(id);
  if (!job) return null;
  return job;
}

function setJobProgress(job, progress, stage) {
  job.progress = Math.max(0, Math.min(100, Math.floor(progress)));
  if (stage) job.stage = stage;
  job.updated_at = Date.now();
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function normalizeInputUrl(value) {
  const raw = String(value || "").trim().replace(/^["']|["']$/g, "");
  if (!raw) return "";

  const extracted = raw.match(/(https?:\/\/[^\s"'<>]+|(?:www\.|m\.|mbasic\.|web\.)?facebook\.com\/[^\s"'<>]+|fb\.watch\/[^\s"'<>]+|(?:www\.)?tiktok\.com\/[^\s"'<>]+|vm\.tiktok\.com\/[^\s"'<>]+|vt\.tiktok\.com\/[^\s"'<>]+|(?:www\.)?douyin\.com\/[^\s"'<>]+|v\.douyin\.com\/[^\s"'<>]+|(?:www\.)?youtube\.com\/[^\s"'<>]+|youtu\.be\/[^\s"'<>]+|jimeng\.jianying\.com\/[^\s"'<>]+)/i);
  const candidate = extracted ? extracted[0].replace(/[)\].,;]+$/, "") : raw;

  if (/^https?:\/\//i.test(candidate)) return candidate;
  if (/^\/\//.test(candidate)) return `https:${candidate}`;
  if (/^(?:www\.|m\.|mbasic\.|web\.)?facebook\.com\//i.test(candidate)
    || /^fb\.watch\//i.test(candidate)
    || /^(?:www\.)?tiktok\.com\//i.test(candidate)
    || /^v[mt]\.tiktok\.com\//i.test(candidate)
    || /^(?:www\.)?douyin\.com\//i.test(candidate)
    || /^v\.douyin\.com\//i.test(candidate)
    || /^(?:www\.)?youtube\.com\//i.test(candidate)
    || /^youtu\.be\//i.test(candidate)
    || /^jimeng\.jianying\.com\//i.test(candidate)) {
    return `https://${candidate}`;
  }
  return candidate;
}

function isFacebookUrl(value) {
  try {
    const parsed = new URL(normalizeInputUrl(value));
    const host = parsed.hostname.toLowerCase();
    return host === "fb.watch"
      || host === "www.fb.watch"
      || host === "web.facebook.com"
      || host === "facebook.com"
      || host.endsWith(".facebook.com");
  } catch {
    return false;
  }
}

function detectPlatform(value) {
  try {
    const parsed = new URL(normalizeInputUrl(value));
    const host = parsed.hostname.toLowerCase();
    if (host === "fb.watch" || host.endsWith(".facebook.com") || host === "facebook.com") return "facebook";
    if (host.endsWith("tiktok.com")) return "tiktok";
    if (host.endsWith("douyin.com")) return "douyin";
    if (host.endsWith("youtube.com") || host === "youtu.be") return "youtube";
    if (host.endsWith("jimeng.jianying.com")) return "jimeng";
  } catch {
    return "unknown";
  }
  return "unknown";
}

function isSupportedUrl(value) {
  const platform = detectPlatform(value);
  return platform !== "unknown" && platform !== "youtube";
}

function isLikelyDirectFacebookVideoUrl(value) {
  const raw = String(value || "");
  return /facebook\.com\/(?:watch\/?\?v=|reel\/|videos\/)/i.test(raw) || /fb\.watch\//i.test(raw);
}

function isFacebookHost(host) {
  const h = String(host || "").toLowerCase();
  return h === "facebook.com" || h.endsWith(".facebook.com") || h === "fb.com" || h.endsWith(".fb.com");
}

const FB_ID_UA_POOL = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:115.0) Gecko/20100101 Firefox/115.0",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Edg/125.0.0.0 Safari/537.36"
];

function pickRandomUserAgent() {
  return FB_ID_UA_POOL[Math.floor(Math.random() * FB_ID_UA_POOL.length)] || DEFAULT_HEADERS["User-Agent"];
}

async function getPublicHttpProxyList() {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    const response = await fetch("https://api.proxyscrape.com/v2/?request=getproxies&protocol=http&timeout=10000&country=all&ssl=all&anonymity=all", {
      method: "GET",
      headers: { "User-Agent": DEFAULT_HEADERS["User-Agent"] },
      signal: controller.signal
    });
    clearTimeout(timeout);
    if (!response.ok) return [];
    const text = await response.text();
    return String(text || "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => /^\d{1,3}(?:\.\d{1,3}){3}:\d{2,5}$/.test(line))
      .slice(0, 60);
  } catch {
    return [];
  }
}

async function fetchFacebookHtmlOnce(url, proxyAddr = "") {
  const controller = new AbortController();
  const timeoutMs = proxyAddr ? 18000 : 12000;
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const options = {
      method: "GET",
      redirect: "follow",
      headers: {
        ...DEFAULT_HEADERS,
        "User-Agent": pickRandomUserAgent(),
        Referer: "https://www.facebook.com/"
      },
      signal: controller.signal
    };
    if (proxyAddr && ProxyAgentCtor) {
      options.dispatcher = new ProxyAgentCtor(`http://${proxyAddr}`);
    }
    const response = await fetch(url, options);
    if (!response.ok) {
      throw createHttpError(response.status >= 400 && response.status < 600 ? response.status : 502, `Facebook tra ve HTTP ${response.status}.`);
    }
    const html = await response.text();
    return {
      html,
      finalUrl: response.url || url,
      viaProxy: !!proxyAddr,
      proxy: proxyAddr || ""
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchFacebookHtmlViaScrapingBee(url) {
  if (!SCRAPINGBEE_API_KEY) return null;
  const endpoint = new URL("https://app.scrapingbee.com/api/v1/");
  endpoint.searchParams.set("api_key", SCRAPINGBEE_API_KEY);
  endpoint.searchParams.set("url", url);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 40000);
  try {
    const response = await fetch(endpoint.toString(), {
      method: "GET",
      headers: {
        "User-Agent": DEFAULT_HEADERS["User-Agent"]
      },
      signal: controller.signal
    });
    if (!response.ok) {
      throw createHttpError(502, `ScrapingBee tra ve HTTP ${response.status}.`);
    }
    const html = await response.text();
    return {
      html,
      finalUrl: url,
      viaProxy: false,
      proxy: "",
      source: "scrapingbee"
    };
  } finally {
    clearTimeout(timeout);
  }
}

function extractFacebookIdFromUrl(value) {
  try {
    const parsed = new URL(normalizeInputUrl(value));
    if (!isFacebookHost(parsed.hostname)) return "";
    const idFromQuery = parsed.searchParams.get("id") || parsed.searchParams.get("story_fbid") || parsed.searchParams.get("fbid") || "";
    if (/^\d{5,}$/.test(idFromQuery)) return idFromQuery;
    const path = parsed.pathname || "";
    const pathId = path.match(/\/(?:profile\.php\/?)?(\d{5,})(?:\/|$)/i);
    if (pathId) return pathId[1];
  } catch {
    return "";
  }
  return "";
}

function buildFacebookProfileProbeUrls(inputUrl) {
  const out = [];
  const push = (u) => {
    const n = normalizeInputUrl(u);
    if (n && !out.includes(n)) out.push(n);
  };
  push(inputUrl);
  try {
    const parsed = new URL(normalizeInputUrl(inputUrl));
    const path = parsed.pathname || "/";
    const q = parsed.search || "";
    push(`https://www.facebook.com${path}${q}`);
    push(`https://m.facebook.com${path}${q}`);
    push(`https://mbasic.facebook.com${path}${q}`);
  } catch {
    // ignore
  }
  return out;
}

async function resolveFacebookProfileId(rawUrl) {
  const normalized = normalizeInputUrl(rawUrl);
  if (!normalized) throw createHttpError(400, "Vui long nhap link Facebook.");

  let parsed;
  try {
    parsed = new URL(normalized);
  } catch {
    throw createHttpError(400, "Link Facebook khong hop le.");
  }

  if (!isFacebookHost(parsed.hostname)) {
    throw createHttpError(400, "Link nay khong phai Facebook.");
  }

  const directId = extractFacebookIdFromUrl(normalized);
  if (directId) {
    return { id: directId, profile_url: normalized, source: "url" };
  }

  const pathname = String(parsed.pathname || "/");
  const usernameMatch = pathname.match(/^\/([A-Za-z0-9.]{3,})(?:\/|$)/);
  const username = usernameMatch ? usernameMatch[1] : "";

  const urlProbes = buildFacebookProfileProbeUrls(normalized);

  let html = "";
  let finalUrl = normalized;
  let lastError = null;

  for (const probeUrl of urlProbes) {
    const scrapingBeeResult = await fetchFacebookHtmlViaScrapingBee(probeUrl).catch(() => null);
    const proxyList = scrapingBeeResult ? [] : await getPublicHttpProxyList();
    const candidates = [];
    if (scrapingBeeResult) {
      candidates.push("__SCRAPINGBEE__");
    }
    candidates.push(""); // try direct before public proxies
    if (proxyList.length > 0) {
      const randomStart = Math.floor(Math.random() * proxyList.length);
      for (let i = 0; i < Math.min(4, proxyList.length); i += 1) {
        const idx = (randomStart + i) % proxyList.length;
        candidates.push(proxyList[idx]);
      }
    }


    for (const proxy of candidates) {
      try {
        const fetched = proxy === "__SCRAPINGBEE__"
          ? scrapingBeeResult
          : await fetchFacebookHtmlOnce(probeUrl, proxy);
        html = fetched.html;
        finalUrl = fetched.finalUrl;
        break;
      } catch (error) {
        lastError = error;
      }
    }
    if (html) break;
  }

  const redirectedId = extractFacebookIdFromUrl(finalUrl);
  if (redirectedId) {
    return {
      id: redirectedId,
      username: username || "",
      profile_url: finalUrl || normalized,
      source: "redirect"
    };
  }

  if (!html) {
    throw createHttpError(502, lastError?.message || "Khong the lay du lieu tu Facebook (co the bi chan IP).");
  }

  const patterns = [
    /"entity_id":"(\d{5,})"/i,
    /"userID":"(\d{5,})"/i,
    /"user_id":"(\d{5,})"/i,
    /"profile_id":"(\d{5,})"/i,
    /"actorID":"(\d{5,})"/i,
    /"delegate_page_id":"(\d{5,})"/i,
    /"pageID":"(\d{5,})"/i,
    /"groupID":"(\d{5,})"/i,
    /"profile_owner":"(\d{5,})"/i,
    /"page_id":(\d{5,})/i,
    /"profile_id":(\d{5,})/i,
    /;sub_id=(\d{5,});/i,
    /profile_id=(\d{5,})/i,
    /fb:\/\/profile\/(\d{5,})/i,
    /owner_id["']?\s*:\s*["']?(\d{5,})/i
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match) {
      return {
        id: match[1],
        username: username || "",
        profile_url: finalUrl || normalized,
        source: "html"
      };
    }
  }

  if (username) {
    throw createHttpError(404, `Khong trich xuat duoc ID so. Username phat hien: ${username}`);
  }

  throw createHttpError(404, "Khong trich xuat duoc Facebook ID tu link nay.");
}

function isLikelyTikTokVideoUrl(value) {
  try {
    const parsed = new URL(normalizeInputUrl(value));
    const host = parsed.hostname.toLowerCase();
    const pathname = parsed.pathname || "";
    if (host === "vm.tiktok.com" || host === "vt.tiktok.com") return true;
    if (!host.endsWith("tiktok.com")) return false;
    if (/\/video\/\d+/i.test(pathname)) return true;
    if (/\/t\/[A-Za-z0-9]+/i.test(pathname)) return true;
    return false;
  } catch {
    return false;
  }
}

function canonicalizeTikTokVideoUrl(value) {
  try {
    const parsed = new URL(normalizeInputUrl(value));
    const host = parsed.hostname.toLowerCase();
    if (host === "vm.tiktok.com" || host === "vt.tiktok.com") {
      return parsed.toString();
    }
    if (!host.endsWith("tiktok.com")) return parsed.toString();

    const match = parsed.pathname.match(/^\/@([^/]+)\/video\/(\d+)/i);
    if (match) {
      const username = match[1];
      const videoId = match[2];
      return `https://www.tiktok.com/@${username}/video/${videoId}`;
    }
    return `https://www.tiktok.com${parsed.pathname}`;
  } catch {
    return normalizeInputUrl(value);
  }
}

function canonicalizeYouTubeVideoUrl(value) {
  const normalized = normalizeInputUrl(value);
  const videoId = extractYouTubeVideoId(normalized);
  if (videoId) return `https://www.youtube.com/watch?v=${videoId}`;
  return normalized;
}

async function buildTikTokProbeUrls(value) {
  const probes = [];
  const pushUnique = (u) => {
    const n = normalizeInputUrl(u);
    if (!n) return;
    if (!probes.includes(n)) probes.push(n);
  };

  const original = normalizeInputUrl(value);
  pushUnique(original);

  const canonical = canonicalizeTikTokVideoUrl(original);
  pushUnique(canonical);

  try {
    const redirect = await resolveRedirectInfo(original);
    pushUnique(redirect.location || original);
    pushUnique(canonicalizeTikTokVideoUrl(redirect.location || original));
  } catch {
    // Ignore redirect expansion errors.
  }

  return probes;
}

function decodeEscapedValue(value) {
  return String(value || "")
    .replace(/\\u0025/g, "%")
    .replace(/\\u002F/gi, "/")
    .replace(/\\u003C/gi, "<")
    .replace(/\\u003E/gi, ">")
    .replace(/\\u0026/gi, "&")
    .replace(/\\u003D/gi, "=")
    .replace(/\\u005C\\\//g, "/")
    .replace(/\\\//g, "/")
    .replace(/\\"/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&#x3C;/gi, "<")
    .replace(/&#x3E;/gi, ">")
    .replace(/&#x26;/gi, "&");
}

function decodeHtmlEntities(value) {
  return String(value || "")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function normalizeVideoUrl(url) {
  const decoded = decodeEscapedValue(url);
  if (!/^https?:\/\//i.test(decoded)) return "";
  return decoded;
}

function dedupeQualities(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = `${item.url}::${item.quality}`;
    if (!item.url || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function dedupeByUrlKeepBest(items) {
  const seen = new Set();
  const output = [];
  for (const item of items) {
    const key = String(item?.url || "");
    if (!key || seen.has(key)) continue;
    seen.add(key);
    output.push(item);
  }
  return output;
}

function detectQualityNumber(input) {
  const value = String(input || "");
  const direct = /(?:^|[^\d])(2160|1440|1080|720|540|480|360|240)p(?:[^\d]|$)/i.exec(value);
  if (direct) return Number(direct[1]);

  const hParam = /(?:^|[?&])(?:height|h)=(2160|1440|1080|720|540|480|360|240)(?:[&#]|$)/i.exec(value);
  if (hParam) return Number(hParam[1]);

  return 0;
}

function isOriginalQualityMarker(input) {
  const value = String(input || "").toLowerCase();
  if (value.includes("origin_std") || value.includes("standard")) return false;
  return value.includes("origin")
    || value.includes("original")
    || value.includes("raw")
    || value.includes("source")
    || value.includes("best");
}

function qualityHeightOf(item) {
  if (isOriginalQualityMarker(item?.quality) || isOriginalQualityMarker(item?.label)) return 10000;
  return Number(item?.height)
    || detectQualityNumber(item?.quality)
    || detectQualityNumber(item?.label)
    || detectQualityNumber(item?.url);
}

function scoreQuality(item) {
  const q = qualityHeightOf(item);
  const text = `${item.label || ""} ${item.quality || ""} ${item.url || ""}`.toLowerCase();

  let score = q * 4;
  if (q >= 720) score += 1200;
  if (isOriginalQualityMarker(item?.quality) || isOriginalQualityMarker(item?.label)) score += 20000;

  if (text.includes("hd")) score += 80;
  if (text.includes("sd")) score -= 30;
  if (text.includes("audio")) score -= 500;
  if (text.includes("dash")) score += 20;
  if (item.has_audio) score += 220;
  if (item.audio_url) score += 140;

  return score;
}

function extractVideoId(url) {
  const text = String(url || "");
  const patterns = [
    /[?&]v=(\d{6,})/,
    /\/videos\/(\d{6,})/,
    /\/reel\/([a-zA-Z0-9_.-]{6,})/,
    /\/reels\/([a-zA-Z0-9_.-]{6,})/
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match[1];
  }
  return "";
}

function extractYouTubeVideoId(url) {
  const normalized = normalizeInputUrl(url);
  try {
    const parsed = new URL(normalized);
    const host = parsed.hostname.toLowerCase();
    const pathName = parsed.pathname || "";

    if (host === "youtu.be") {
      const id = pathName.replace(/^\/+/, "").split("/")[0];
      if (/^[A-Za-z0-9_-]{6,15}$/.test(id)) return id;
    }
    if (host.endsWith("youtube.com")) {
      if (pathName === "/watch") {
        const id = parsed.searchParams.get("v") || "";
        if (/^[A-Za-z0-9_-]{6,15}$/.test(id)) return id;
      }
      const shortMatch = pathName.match(/^\/(?:shorts|embed|live)\/([A-Za-z0-9_-]{6,15})/i);
      if (shortMatch) return shortMatch[1];
    }
  } catch {
    // Ignore URL parse errors and try regex fallback.
  }

  const regexes = [
    /[?&]v=([A-Za-z0-9_-]{6,15})/,
    /youtu\.be\/([A-Za-z0-9_-]{6,15})/i,
    /\/shorts\/([A-Za-z0-9_-]{6,15})/i
  ];
  for (const rx of regexes) {
    const m = String(url || "").match(rx);
    if (m) return m[1];
  }
  return "";
}

function extractCanonicalFacebookVideoUrl(html) {
  const text = String(html || "");
  const patterns = [
    /https?:\/\/(?:www\.|m\.|mbasic\.)?facebook\.com\/reel\/(\d{6,})/i,
    /https?:\/\/(?:www\.|m\.|mbasic\.)?facebook\.com\/videos\/(\d{6,})/i,
    /https?:\/\/(?:www\.|m\.|mbasic\.)?facebook\.com\/watch\/\?v=(\d{6,})/i,
    /\\\/reel\\\/(\d{6,})/i,
    /\\\/videos\\\/(\d{6,})/i,
    /\/reel\/(\d{6,})/i,
    /\/videos\/(\d{6,})/i,
    /["']video_id["']\s*:\s*["']?(\d{6,})["']?/i
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) continue;
    const id = match[1];
    if (!id) continue;
    return `https://www.facebook.com/reel/${id}`;
  }

  return "";
}

function extractMetaTag(html, key) {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name|itemprop)=["']${escapedKey}["'][^>]+content=["']([^"']+)["']`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name|itemprop)=["']${escapedKey}["']`, "i")
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match) return decodeHtmlEntities(match[1]);
  }
  return "";
}

function extractInlineCoverUrl(html) {
  const keys = [
    "preferred_thumbnail",
    "thumbnailImage",
    "thumbnail_url",
    "thumbnailUrl",
    "story_image",
    "image"
  ];
  for (const key of keys) {
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`"${escaped}"\\s*:\\s*"([^"\\n]+)"`, "i");
    const match = html.match(pattern);
    if (!match) continue;
    const url = normalizeVideoUrl(match[1]);
    if (url) return url;
  }
  return "";
}

function extractCoverCandidatesFromHtml(html) {
  const out = new Set();
  const text = String(html || "");

  const urlMatches = text.match(/https?:\/\/[^"'\\\s<>]+/g) || [];
  for (const raw of urlMatches) {
    const url = normalizeVideoUrl(raw);
    if (!url) continue;
    if (!/\.(jpg|jpeg|png|webp)(\?|$)/i.test(url)) continue;
    out.add(url);
  }

  const uriMatches = [...text.matchAll(/"uri"\s*:\s*"([^"\n]+)"/g)];
  for (const match of uriMatches) {
    const url = normalizeVideoUrl(match[1]);
    if (!url) continue;
    if (!/\.(jpg|jpeg|png|webp)(\?|$)/i.test(url)) continue;
    out.add(url);
  }

  return [...out];
}

function scoreCoverUrl(url) {
  const value = String(url || "").toLowerCase();
  let score = 0;
  if (value.includes("scontent")) score += 120;
  if (value.includes("fbcdn")) score += 100;
  if (value.includes("lookaside")) score += 80;
  if (value.includes("video")) score += 40;
  if (value.includes("cover")) score += 30;
  if (value.includes("profile")) score -= 80;
  if (value.includes("emoji")) score -= 80;
  if (value.includes("sprite")) score -= 90;

  const sizeMatch = value.match(/(\d{2,4})x(\d{2,4})/);
  if (sizeMatch) {
    const w = Number(sizeMatch[1]) || 0;
    const h = Number(sizeMatch[2]) || 0;
    score += Math.min(w * h, 3000000) / 12000;
  }

  return score;
}

function extractBestCoverUrl(html) {
  const candidates = extractCoverCandidatesFromHtml(html);
  if (candidates.length === 0) return "";
  return candidates.sort((a, b) => scoreCoverUrl(b) - scoreCoverUrl(a))[0] || "";
}

function extractInlineUrlByKeys(html, keys, qualityHint) {
  const results = [];
  for (const key of keys) {
    const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`"${escapedKey}"\\s*:\\s*"([^"\\n]+)"`, "g");
    let match;
    while ((match = pattern.exec(html)) !== null) {
      const source = normalizeVideoUrl(match[1]);
      if (!source) continue;
      results.push({
        label: key,
        quality: qualityHint || key,
        url: source,
        width: 0,
        height: detectQualityNumber(key) || detectQualityNumber(source),
        fps: 0,
        watermark_status: "unknown"
      });
    }
  }
  return results;
}

function parseRepresentationsInBlock(xmlBlock, typeHint) {
  const videos = [];
  const audios = [];
  const regex = /<Representation\b([^>]*)>([\s\S]*?)<\/Representation>/g;
  let match;

  while ((match = regex.exec(xmlBlock)) !== null) {
    const attrs = match[1] || "";
    const body = match[2] || "";
    const baseUrlMatch = body.match(/<BaseURL>([\s\S]*?)<\/BaseURL>/i);
    if (!baseUrlMatch) continue;

    const source = normalizeVideoUrl(decodeHtmlEntities(baseUrlMatch[1].trim()));
    if (!source) continue;

    const labelMatch = attrs.match(/FBQualityLabel="([^"]+)"/i);
    const heightMatch = attrs.match(/height="(\d+)"/i);
    const widthMatch = attrs.match(/width="(\d+)"/i);
    const fpsMatch = attrs.match(/frameRate="(\d+)"/i);
    const bandwidthMatch = attrs.match(/bandwidth="(\d+)"/i);
    const inferredType = String(typeHint || "").toLowerCase().includes("audio") ? "audio" : "video";

    if (inferredType === "audio") {
      audios.push({
        url: source,
        bitrate: bandwidthMatch ? Number(bandwidthMatch[1]) : 0,
        label: "DASH Audio"
      });
      continue;
    }

    const label = labelMatch ? labelMatch[1] : "DASH";
    const height = heightMatch ? Number(heightMatch[1]) : detectQualityNumber(label) || detectQualityNumber(source);
    videos.push({
      label: `DASH ${label}`,
      quality: label.toLowerCase(),
      url: source,
      width: widthMatch ? Number(widthMatch[1]) : 0,
      height,
      fps: fpsMatch ? Number(fpsMatch[1]) : 0,
      watermark_status: "unknown",
      has_audio: false
    });
  }

  return { videos, audios };
}

function extractFromDashManifest(html) {
  const matches = [];
  const patterns = [
    /"dash_manifest"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/g,
    /"dash_manifest_xml"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/g
  ];

  for (const pattern of patterns) {
    let hit;
    while ((hit = pattern.exec(html)) !== null) {
      const decoded = decodeEscapedValue(hit[1]);
      if (decoded.includes("<Representation")) {
        matches.push(decoded);
      }
    }
  }

  const videos = [];
  const audios = [];
  for (const xml of matches) {
    const adaptationRegex = /<AdaptationSet\b([^>]*)>([\s\S]*?)<\/AdaptationSet>/g;
    let adaptation;
    let hasAdaptation = false;
    while ((adaptation = adaptationRegex.exec(xml)) !== null) {
      hasAdaptation = true;
      const attrs = String(adaptation[1] || "").toLowerCase();
      const hint = attrs.includes("audio") ? "audio" : "video";
      const parsed = parseRepresentationsInBlock(adaptation[2] || "", hint);
      videos.push(...parsed.videos);
      audios.push(...parsed.audios);
    }

    if (!hasAdaptation) {
      const parsed = parseRepresentationsInBlock(xml, "video");
      videos.push(...parsed.videos);
      audios.push(...parsed.audios);
    }
  }

  return {
    videos,
    audios
  };
}

function extractLooseMp4Urls(html) {
  const out = [];
  const matches = html.match(/https?:\/\/[^"'\s<>]+/g) || [];
  const unique = [...new Set(matches.map((item) => decodeEscapedValue(item)))];

  for (const url of unique) {
    if (!/\.mp4(\?|$)/i.test(url)) continue;
    out.push({
      label: "MP4 URL",
      quality: `q${detectQualityNumber(url) || 0}`,
      url,
      width: 0,
      height: detectQualityNumber(url),
      fps: 0,
      watermark_status: "unknown"
    });
  }

  return out;
}

function extractMimeTypedUrls(html) {
  const videos = [];
  const audios = [];
  const matches = html.match(/https?:\/\/[^"'\s<>]+/g) || [];
  const unique = [...new Set(matches.map((item) => decodeEscapedValue(item)))];

  for (const url of unique) {
    const lower = url.toLowerCase();
    if (!lower.includes("mime_type=")) continue;
    if (!/^https?:\/\//i.test(url)) continue;

    if (lower.includes("mime_type=video_mp4")) {
      videos.push({
        label: "MIME Video",
        quality: `${detectQualityNumber(url) || 0}p`,
        url,
        width: 0,
        height: detectQualityNumber(url),
        fps: 0,
        watermark_status: "unknown",
        has_audio: false
      });
    } else if (lower.includes("mime_type=audio_mp4")) {
      audios.push({
        url,
        bitrate: 0,
        label: "MIME Audio"
      });
    }
  }

  return { videos, audios };
}

function pickPreferredQuality(list) {
  return [...list].sort((a, b) => scoreQuality(b) - scoreQuality(a));
}

function normalizeVideoResult(raw, sourceUrl) {
  const allCandidates = dedupeByUrlKeepBest(dedupeQualities(
    (Array.isArray(raw?.qualities) ? raw.qualities : [])
      .filter((item) => typeof item?.url === "string" && /^https?:\/\//i.test(item.url))
      .map((item, index) => {
        const inferredHeight = Number(item.height) || detectQualityNumber(item.label) || detectQualityNumber(item.quality) || detectQualityNumber(item.url);
        return {
          label: item.label || `Nguon ${index + 1}`,
          quality: item.quality || (inferredHeight ? `${inferredHeight}p` : `q${index + 1}`),
          url: item.url,
          width: Number(item.width) || 0,
          height: inferredHeight || 0,
          fps: Number(item.fps) || 0,
          watermark_status: item.watermark_status || "unknown",
          has_audio: Boolean(item.has_audio),
          audio_url: typeof item.audio_url === "string" ? item.audio_url : ""
        };
      })
      .sort((a, b) => scoreQuality(b) - scoreQuality(a))
  ));

  const ffmpegAvailable = hasFfmpeg();
  let candidates = allCandidates.filter((item) => qualityHeightOf(item) >= 720);
  if (candidates.length === 0) {
    candidates = allCandidates;
  }

  // Keep sources that already have audio, or have a separated audio stream (for merge endpoint).
  candidates = candidates.filter((item) => item.has_audio || !!item.audio_url);
  if (candidates.length === 0) {
    candidates = allCandidates;
  }

  // Keep one best source per quality to avoid noisy duplicates.
  const bestByHeight = new Map();
  const unknownHeight = [];
  for (const item of candidates) {
    const h = qualityHeightOf(item) || 0;
    if (!h) {
      unknownHeight.push(item);
      continue;
    }
    const existing = bestByHeight.get(h);
    const itemIsOrigin = isOriginalQualityMarker(item?.quality) || isOriginalQualityMarker(item?.label);
    const existingIsOrigin = isOriginalQualityMarker(existing?.quality) || isOriginalQualityMarker(existing?.label);
    if (!existing) {
      bestByHeight.set(h, item);
      continue;
    }
    if (itemIsOrigin && !existingIsOrigin) {
      bestByHeight.set(h, item);
      continue;
    }
    if (existingIsOrigin && !itemIsOrigin) {
      continue;
    }
    if (scoreQuality(item) > scoreQuality(existing)) {
      bestByHeight.set(h, item);
    }
  }
  candidates = [...bestByHeight.entries()]
    .sort((a, b) => b[0] - a[0])
    .slice(0, 4)
    .map((entry) => entry[1]);
  if (candidates.length < 4 && unknownHeight.length > 0) {
    candidates = [...candidates, ...unknownHeight.slice(0, 4 - candidates.length)];
  }

  if (candidates.length === 0) {
    throw new Error("Khong tim thay nguon video Facebook hop le.");
  }

  const ordered = pickPreferredQuality(candidates);
  const has1080 = ordered.some((item) => qualityHeightOf(item) === 1080);
  const has1440 = ordered.some((item) => qualityHeightOf(item) === 1440);

  return {
    item_id: raw?.item_id || extractVideoId(sourceUrl) || "",
    title: String(raw?.title || ""),
    cover_url: String(raw?.cover_url || ""),
    has_1080: has1080,
    has_1440: has1440,
    ffmpeg_available: ffmpegAvailable,
    qualities: ordered
  };
}

async function resolveRedirectInfo(url) {
  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      headers: {
        ...DEFAULT_HEADERS
      }
    });

    return {
      location: response.url || url
    };
  } catch {
    return {
      location: url
    };
  }
}

async function fetchText(url) {
  const response = await fetch(url, {
    method: "GET",
    redirect: "follow",
    headers: {
      ...DEFAULT_HEADERS,
      Referer: "https://www.facebook.com/"
    }
  });

  if (!response.ok) {
    throw createHttpError(response.status, `Facebook tra ve HTTP ${response.status}.`);
  }

  return response.text();
}

function buildProbeUrls(originalUrl) {
  const out = [];
  try {
    const parsed = new URL(originalUrl);
    const clean = parsed.toString();
    out.push(clean);

    if (/^www\./i.test(parsed.hostname)) {
      out.push(clean.replace(/^https?:\/\/www\./i, "https://m."));
      out.push(clean.replace(/^https?:\/\/www\./i, "https://mbasic."));
    }

    if (parsed.hostname === "facebook.com") {
      out.push(clean.replace(/^https?:\/\/facebook\.com/i, "https://m.facebook.com"));
      out.push(clean.replace(/^https?:\/\/facebook\.com/i, "https://mbasic.facebook.com"));
    }

    if (parsed.hostname === "m.facebook.com") {
      out.push(clean.replace(/^https?:\/\/m\.facebook\.com/i, "https://mbasic.facebook.com"));
      out.push(clean.replace(/^https?:\/\/m\.facebook\.com/i, "https://www.facebook.com"));
    }
  } catch {
    out.push(originalUrl);
  }

  const extractedId = extractVideoId(originalUrl);
  const numericVideoId = /^\d+$/.test(extractedId) ? extractedId : "";
  if (numericVideoId) {
    out.push(`https://www.facebook.com/videos/${numericVideoId}/`);
    out.push(`https://m.facebook.com/videos/${numericVideoId}/`);
    out.push(`https://mbasic.facebook.com/videos/${numericVideoId}/`);
    out.push(`https://www.facebook.com/reel/${numericVideoId}/`);
    out.push(`https://m.facebook.com/reel/${numericVideoId}/`);
    out.push(`https://mbasic.facebook.com/reel/${numericVideoId}/`);
    out.push(`https://www.facebook.com/watch/?v=${extractedId}`);
    out.push(`https://m.facebook.com/watch/?v=${extractedId}`);
    out.push(`https://mbasic.facebook.com/watch/?v=${extractedId}`);
  }

  const pluginCandidates = [originalUrl];
  if (numericVideoId) {
    pluginCandidates.push(`https://www.facebook.com/reel/${numericVideoId}/`);
    pluginCandidates.push(`https://www.facebook.com/videos/${numericVideoId}/`);
    pluginCandidates.push(`https://www.facebook.com/watch/?v=${numericVideoId}`);
  }

  for (const candidate of pluginCandidates) {
    out.push(`https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(candidate)}`);
  }

  return [...new Set(out)];
}

function extractFromFacebookHtml(html, sourceUrl) {
  const title = extractMetaTag(html, "og:title") || extractMetaTag(html, "twitter:title");
  const cover = extractMetaTag(html, "og:image")
    || extractMetaTag(html, "twitter:image")
    || extractMetaTag(html, "image")
    || extractMetaTag(html, "thumbnailUrl")
    || extractInlineCoverUrl(html)
    || extractBestCoverUrl(html);

  const dash = extractFromDashManifest(html);
  const mimeTyped = extractMimeTypedUrls(html);
  const allAudioTracks = [...dash.audios, ...mimeTyped.audios];
  const bestAudio = allAudioTracks.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))[0] || null;
  const dashVideosWithAudio = [...dash.videos, ...mimeTyped.videos].map((item) => ({
    ...item,
    audio_url: bestAudio?.url || "",
    has_audio: false
  }));

  const qualities = [
    ...extractInlineUrlByKeys(html, ["browser_native_hd_url", "playable_url_quality_hd", "hd_src_no_ratelimit", "hd_src"], "hd"),
    ...extractInlineUrlByKeys(html, ["browser_native_sd_url", "playable_url", "sd_src_no_ratelimit", "sd_src"], "sd"),
    ...dashVideosWithAudio,
    ...extractLooseMp4Urls(html)
  ].map((item) => ({
    ...item,
    has_audio: typeof item.has_audio === "boolean" ? item.has_audio : true
  }));

  return normalizeVideoResult({
    item_id: extractVideoId(sourceUrl),
    title,
    cover_url: cover,
    qualities
  }, sourceUrl);
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

function runCommandCapture(executable, args) {
  return new Promise((resolve, reject) => {
    let isolatedTempDir = "";
    try {
      isolatedTempDir = fs.mkdtempSync(path.join(RUNTIME_TEMP_DIR, "yt-"));
    } catch {
      isolatedTempDir = RUNTIME_TEMP_DIR;
    }

    const proc = spawn(executable, args, {
      windowsHide: true,
      env: {
        ...process.env,
        TMP: isolatedTempDir,
        TEMP: isolatedTempDir
      }
    });
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (chunk) => {
      stdout += String(chunk || "");
    });
    proc.stderr.on("data", (chunk) => {
      stderr += String(chunk || "");
    });
    proc.on("error", (error) => {
      reject(normalizeProcessError(error, "Khong the khoi dong yt-dlp."));
    });
    proc.on("close", (code) => {
      fs.promises.rm(isolatedTempDir, { recursive: true, force: true }).catch(() => {});
      if (code === 0) resolve({ stdout, stderr });
      else {
        const userMessage = summarizeYtDlpError(stderr, "phan tich link");
        if (stderr) console.warn(`[yt-dlp] dump-json failed (code ${code}): ${stderr.slice(-500)}`);
        reject(createHttpError(502, userMessage));
      }
    });
  });
}

function pickJsonFromStdout(stdoutText) {
  const lines = String(stdoutText || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    try {
      return JSON.parse(lines[i]);
    } catch {
      // Keep scanning previous lines.
    }
  }
  return null;
}

function buildReclipFormatList(info) {
  const formats = Array.isArray(info?.formats) ? info.formats : [];
  const bestByHeight = new Map();
  for (const fmt of formats) {
    const height = Number(fmt?.height) || 0;
    const formatId = String(fmt?.format_id || "");
    if (!height || !formatId) continue;
    if (!fmt?.vcodec || fmt.vcodec === "none") continue;
    const currentScore = Number(fmt?.tbr) || 0;
    const prev = bestByHeight.get(height);
    const prevScore = Number(prev?.tbr) || 0;
    if (!prev || currentScore >= prevScore) {
      bestByHeight.set(height, fmt);
    }
  }
  return [...bestByHeight.entries()]
    .map(([height, fmt]) => ({
      id: String(fmt.format_id),
      label: `${height}p`,
      height: Number(height) || 0
    }))
    .sort((a, b) => b.height - a.height);
}

function sanitizeReclipDownloadName(title, ext) {
  const cleaned = String(title || "")
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "")
    .trim()
    .slice(0, 80);
  const safeBase = cleaned || `tienich.pro_${Date.now()}`;
  const safeExt = String(ext || ".mp4").startsWith(".") ? String(ext) : `.${ext}`;
  return `${safeBase}${safeExt}`;
}

async function runReclipInfo(url) {
  if (!ytDlpCommand) {
    throw createHttpError(502, "Chua tim thay yt-dlp tren may chu.");
  }
  const baseArgs = ["--no-playlist", "--no-warnings", "-j", url];
  const args = await appendYtDlpGlobalArgsAsync(baseArgs, {
    useProxy: detectPlatform(url) === "youtube"
  });
  const { stdout } = await runCommandCapture(ytDlpCommand.executable, [...ytDlpCommand.prefixArgs, ...args]);
  const info = pickJsonFromStdout(stdout);
  if (!info || typeof info !== "object") {
    throw createHttpError(502, "yt-dlp tra ve JSON khong hop le.");
  }
  return {
    title: String(info.title || ""),
    thumbnail: String(info.thumbnail || ""),
    duration: Number(info.duration) || 0,
    uploader: String(info.uploader || ""),
    formats: buildReclipFormatList(info)
  };
}

async function runReclipDownloadJob(job) {
  if (!ytDlpCommand) {
    job.status = "error";
    job.error = "Chua tim thay yt-dlp tren may chu.";
    return;
  }

  const outTemplate = path.join(RECLIP_DOWNLOAD_DIR, `${job.id}.%(ext)s`);
  let isolatedTempDir = "";
  try {
    isolatedTempDir = fs.mkdtempSync(path.join(RUNTIME_TEMP_DIR, "reclip-yt-"));
  } catch {
    isolatedTempDir = RUNTIME_TEMP_DIR;
  }

  try {
    const baseArgs = ["--no-playlist", "--no-warnings", "-o", outTemplate];
    if (job.format === "audio") {
      baseArgs.push("-x", "--audio-format", "mp3");
    } else if (job.formatId) {
      baseArgs.push("-f", `${job.formatId}+bestaudio/best`, "--merge-output-format", "mp4");
    } else {
      baseArgs.push("-f", "bestvideo+bestaudio/best", "--merge-output-format", "mp4");
    }
    baseArgs.push(job.url);
    const args = await appendYtDlpGlobalArgsAsync(baseArgs, {
      useProxy: detectPlatform(job.url) === "youtube"
    });

    await new Promise((resolve, reject) => {
      const proc = spawn(ytDlpCommand.executable, [...ytDlpCommand.prefixArgs, ...args], {
        windowsHide: true,
        env: {
          ...process.env,
          TMP: isolatedTempDir,
          TEMP: isolatedTempDir
        }
      });
      let stderr = "";
      const timeout = setTimeout(() => {
        try {
          proc.kill("SIGKILL");
        } catch {
          // Ignore kill errors.
        }
        reject(createHttpError(408, "Download timed out (10 min)."));
      }, 10 * 60 * 1000);

      proc.stderr.on("data", (chunk) => {
        stderr += String(chunk || "");
      });
      proc.on("error", (error) => {
        clearTimeout(timeout);
        reject(normalizeProcessError(error, "Khong the chay yt-dlp."));
      });
      proc.on("close", (code) => {
        clearTimeout(timeout);
        if (code === 0) {
          resolve();
          return;
        }
        reject(createHttpError(502, summarizeYtDlpError(stderr, "tai file")));
      });
    });

    const files = (await fs.promises.readdir(RECLIP_DOWNLOAD_DIR))
      .filter((name) => name.startsWith(`${job.id}.`))
      .map((name) => path.join(RECLIP_DOWNLOAD_DIR, name));
    if (!files.length) {
      throw createHttpError(500, "Download xong nhung khong tim thay file.");
    }

    const wantedExt = job.format === "audio" ? ".mp3" : ".mp4";
    const preferred = files.find((f) => f.toLowerCase().endsWith(wantedExt)) || files[0];
    for (const file of files) {
      if (file === preferred) continue;
      await fs.promises.rm(file, { force: true }).catch(() => {});
    }

    const ext = path.extname(preferred) || (job.format === "audio" ? ".mp3" : ".mp4");
    job.status = "done";
    job.file = preferred;
    job.filename = sanitizeReclipDownloadName(job.title || "", ext);
    job.error = "";
    job.updated_at = Date.now();
  } catch (error) {
    job.status = "error";
    job.error = sanitizeClientErrorMessage(error?.message || "Khong the tai file.");
    job.updated_at = Date.now();
  } finally {
    await fs.promises.rm(isolatedTempDir, { recursive: true, force: true }).catch(() => {});
  }
}

function buildQualitiesFromYtDlpInfo(info) {
  const formats = Array.isArray(info?.formats) ? info.formats : [];
  const audios = formats
    .filter((f) => f && typeof f.url === "string" && f.vcodec === "none" && f.acodec && f.acodec !== "none")
    .sort((a, b) => (Number(b.abr) || 0) - (Number(a.abr) || 0));
  const bestAudio = audios[0] || null;

  const bestByHeight = new Map();
  for (const f of formats) {
    if (!f || typeof f.url !== "string") continue;
    const height = Number(f.height) || 0;
    if (!height) continue;
    if (!f.vcodec || f.vcodec === "none") continue;
    if (height < 720) continue;

    const hasAudio = !!(f.acodec && f.acodec !== "none");
    const candidate = {
      label: `yt-dlp ${height}p`,
      quality: `${height}p`,
      url: f.url,
      width: Number(f.width) || 0,
      height,
      fps: Number(f.fps) || 0,
      watermark_status: "unknown",
      has_audio: hasAudio,
      audio_url: hasAudio ? "" : (bestAudio?.url || "")
    };
    const prev = bestByHeight.get(height);
    if (!prev) {
      bestByHeight.set(height, candidate);
      continue;
    }
    const prevScore = (Number(prev.fps) || 0) * 1000 + (Number(prev.width) || 0);
    const nextScore = (Number(candidate.fps) || 0) * 1000 + (Number(candidate.width) || 0);
    if (nextScore >= prevScore) {
      bestByHeight.set(height, candidate);
    }
  }

  return [...bestByHeight.entries()]
    .sort((a, b) => b[0] - a[0])
    .map((entry) => entry[1]);
}

function parseSoraJsonPayload(payload) {
  if (!payload || typeof payload !== "object") return null;
  const candidates = [];

  const list = Array.isArray(payload?.qualities) ? payload.qualities : [];
  for (const item of list) {
    if (!item) continue;
    const resolvedUrl = normalizeVideoUrl(item.url || item.download_url || item.link || "");
    if (!resolvedUrl) continue;
    candidates.push({
      label: item.label || "Sora",
      quality: item.quality || `${Number(item.height) || 0}p`,
      url: resolvedUrl,
      width: Number(item.width) || 0,
      height: Number(item.height) || detectQualityNumber(item.quality),
      fps: Number(item.fps) || 0,
      has_audio: item.has_audio !== false,
      audio_url: typeof item.audio_url === "string" ? item.audio_url : "",
      watermark_status: "unknown"
    });
  }

  const keys = ["url", "video_url", "download_url", "nowm", "origin", "hd", "sd"];
  for (const key of keys) {
    const value = payload[key];
    if (typeof value !== "string") continue;
    const u = normalizeVideoUrl(value);
    if (!u) continue;
    candidates.push({
      label: "Sora",
      quality: key,
      url: u,
      width: 0,
      height: detectQualityNumber(u) || detectQualityNumber(key),
      fps: 0,
      has_audio: true,
      audio_url: "",
      watermark_status: "unknown"
    });
  }

  if (!candidates.length) return null;
  return {
    item_id: String(payload.item_id || payload.id || ""),
    title: String(payload.title || payload.desc || ""),
    cover_url: String(payload.cover_url || payload.cover || payload.thumbnail || ""),
    qualities: candidates
  };
}

function normalizeJimengSoraPayload(payload) {
  if (!payload || typeof payload !== "object" || payload.success !== true) return null;

  const itemId = String(payload.item_id || Date.now());
  const qualities = [];
  const fromQualities = Array.isArray(payload.qualities) ? payload.qualities : [];
  const fromData = Array.isArray(payload.data) ? payload.data : [];

  const allowQuality = (label) => {
    const s = String(label || "").toLowerCase();
    if (s.includes("360")) return false;
    if (s.includes("420")) return false;
    if (s.includes("480")) return false;
    return true;
  };

  const topLevelQualityKeys = [
    "origin",
    "original",
    "raw",
    "best",
    "url",
    "video_url",
    "download_url",
    "hd",
    "sd"
  ];

  for (const key of topLevelQualityKeys) {
    const url = normalizeVideoUrl(payload[key]);
    if (!url) continue;
    const label = key === "url" || key === "video_url" || key === "download_url" ? "origin" : key;
    if (!allowQuality(label)) continue;
    qualities.push({
      label,
      quality: label,
      url,
      width: 0,
      height: isOriginalQualityMarker(label) ? 10000 : (detectQualityNumber(label) || detectQualityNumber(url)),
      fps: 0,
      has_audio: true,
      audio_url: "",
      watermark_status: "unknown"
    });
  }

  for (const item of fromQualities) {
    const url = normalizeVideoUrl(item?.url || item?.download_url || "");
    if (!url) continue;
    const label = String(item?.label || item?.quality || "Jimeng");
    if (!allowQuality(label)) continue;
    qualities.push({
      label,
      quality: String(item?.quality || detectQualityNumber(label) || "origin"),
      url,
      width: Number(item?.width) || 0,
      height: Number(item?.height) || detectQualityNumber(label) || detectQualityNumber(url),
      fps: Number(item?.fps) || 0,
      has_audio: true,
      audio_url: "",
      watermark_status: "unknown"
    });
  }

  for (let i = 0; i < fromData.length; i += 1) {
    const item = fromData[i];
    const url = normalizeVideoUrl(item?.url || item?.download_url || "");
    if (!url) continue;
    const label = String(item?.quality || (i === 0 ? "origin" : `q${i + 1}`));
    if (!allowQuality(label)) continue;
    qualities.push({
      label,
      quality: i === 0 ? "origin" : `q${i + 1}`,
      url,
      width: Number(item?.width) || 0,
      height: Number(item?.height) || detectQualityNumber(label) || detectQualityNumber(url),
      fps: Number(item?.fps) || 0,
      has_audio: true,
      audio_url: "",
      watermark_status: "unknown"
    });
  }

  if (!qualities.length) return null;
  return {
    item_id: itemId,
    title: "",
    cover_url: String(payload.cover_url || ""),
    qualities
  };
}

function summarizeQualityDebug(items) {
  return (Array.isArray(items) ? items : []).slice(0, 8).map((item, index) => ({
    i: index,
    label: String(item?.label || ""),
    quality: String(item?.quality || ""),
    height: Number(item?.height) || 0,
    has_audio: Boolean(item?.has_audio),
    url: String(item?.url || "").slice(0, 180)
  }));
}

function parseSoraTextPayload(text) {
  const matches = String(text || "").match(/https?:\/\/[^\s"'<>]+/g) || [];
  const videoUrls = [...new Set(matches.map((m) => normalizeVideoUrl(m)).filter((u) => u && /\.mp4(\?|$)/i.test(u)))];
  if (!videoUrls.length) return null;
  return {
    item_id: "",
    title: "",
    cover_url: "",
    qualities: videoUrls.slice(0, 8).map((url, index) => ({
      label: "Sora",
      quality: `${detectQualityNumber(url) || 0}p_${index + 1}`,
      url,
      width: 0,
      height: detectQualityNumber(url),
      fps: 0,
      has_audio: true,
      audio_url: "",
      watermark_status: "unknown"
    }))
  };
}

function soraRefererByPlatform(platform) {
  if (platform === "jimeng") return "https://savevideoraw.com/jimeng";
  if (platform === "tiktok") return "https://sora2dl.com/tiktok";
  if (platform === "douyin") return "https://sora2dl.com/douyin";
  if (platform === "youtube") return "https://sora2dl.com/youtube";
  return "https://sora2dl.com/";
}

async function resolveViaSora(url, platform = "unknown") {
  if (platform === "jimeng") {
    const response = await fetch("https://savevideoraw.com/apij.php", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...DEFAULT_HEADERS,
        Referer: "https://savevideoraw.com/jimeng",
        Origin: "https://savevideoraw.com"
      },
      body: JSON.stringify({ text: url })
    });

    if (!response.ok) {
      throw createHttpError(502, `Jimeng gateway tra ve HTTP ${response.status}.`);
    }

    const json = await response.json().catch(() => null);
    console.log("[jimeng] gateway keys", json && typeof json === "object" ? Object.keys(json).slice(0, 30) : []);
    console.log("[jimeng] gateway top-level", {
      origin: Boolean(json?.origin),
      original: Boolean(json?.original),
      raw: Boolean(json?.raw),
      best: Boolean(json?.best),
      url: Boolean(json?.url),
      video_url: Boolean(json?.video_url),
      download_url: Boolean(json?.download_url),
      qualities: Array.isArray(json?.qualities) ? json.qualities.length : 0,
      data: Array.isArray(json?.data) ? json.data.length : 0
    });
    const normalized = normalizeJimengSoraPayload(json);
    if (!normalized) {
      throw createHttpError(502, json?.error || "Jimeng gateway khong tra du lieu hop le.");
    }
    console.log("[jimeng] normalized raw qualities", summarizeQualityDebug(normalized.qualities));
    const finalNormalized = normalizeVideoResult(normalized, url);
    console.log("[jimeng] final qualities", summarizeQualityDebug(finalNormalized.qualities));
    return finalNormalized;
  }

  const endpoint = `https://sora2dl.com/downloadi.php?url=${encodeURIComponent(url)}`;
  const response = await fetch(endpoint, {
    method: "GET",
    headers: {
      ...DEFAULT_HEADERS,
      Referer: soraRefererByPlatform(platform),
      Origin: "https://sora2dl.com"
    }
  });

  if (!response.ok) {
    throw createHttpError(502, `Sora2dl tra ve HTTP ${response.status}.`);
  }

  const contentType = String(response.headers.get("content-type") || "").toLowerCase();
  if (contentType.includes("application/json")) {
    const json = await response.json().catch(() => null);
    const parsed = parseSoraJsonPayload(json);
    if (!parsed) throw createHttpError(502, "Sora2dl JSON khong hop le.");
    return normalizeVideoResult(parsed, url);
  }

  const text = await response.text();
  try {
    const parsedJson = parseSoraJsonPayload(JSON.parse(text));
    if (parsedJson) return normalizeVideoResult(parsedJson, url);
  } catch {
    // Ignore parse JSON error.
  }

  const parsedText = parseSoraTextPayload(text);
  if (!parsedText) {
    throw createHttpError(502, "Sora2dl khong tra ve URL video.");
  }
  return normalizeVideoResult(parsedText, url);
}

async function resolveViaTikwm(url) {
  const endpoint = `${TIKWM_API_BASE}/api/?url=${encodeURIComponent(url)}`;
  const response = await fetch(endpoint, {
    method: "GET",
    headers: {
      ...DEFAULT_HEADERS,
      Referer: `${TIKWM_API_BASE}/`
    }
  });

  if (!response.ok) {
    throw createHttpError(502, `Tikwm tra ve HTTP ${response.status}.`);
  }

  const json = await response.json().catch(() => null);
  if (!json || Number(json.code) !== 0 || !json.data) {
    const msg = String(json?.msg || "").trim();
    if (msg) throw createHttpError(502, `Tikwm loi: ${msg}`);
    throw createHttpError(502, "Tikwm khong tra du lieu hop le.");
  }

  const data = json.data || {};
  const candidates = [];
  const addCandidate = (label, quality, rawUrl) => {
    const u = normalizeVideoUrl(rawUrl);
    if (!u) return;
    candidates.push({
      label,
      quality,
      url: u,
      width: 0,
      height: detectQualityNumber(quality) || detectQualityNumber(u),
      fps: 0,
      has_audio: true,
      audio_url: "",
      watermark_status: "unknown"
    });
  };

  addCandidate("Tikwm HD", "hd", data.hdplay || data.hdplay_url || "");
  addCandidate("Tikwm NoWM", "nowm", data.play || data.play_url || data.nwm_video_url || "");
  addCandidate("Tikwm WM", "wm", data.wmplay || data.wmplay_url || "");

  if (!candidates.length) {
    throw createHttpError(502, "Tikwm khong tim thay URL video.");
  }

  return normalizeVideoResult({
    item_id: String(data.id || extractVideoId(url) || ""),
    title: String(data.title || ""),
    cover_url: String(data.cover || data.origin_cover || ""),
    qualities: candidates
  }, url);
}
async function resolveViaSaveTikDouyin(url) {
  const form = new URLSearchParams({
    q: url,
    cursor: "0",
    page: "0",
    lang: "vi"
  });

  const response = await fetch("https://savetik.io/api/ajaxSearch", {
    method: "POST",
    headers: {
      ...DEFAULT_HEADERS,
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "X-Requested-With": "XMLHttpRequest",
      Referer: "https://savetik.io/vi/douyin-video-downloader",
      Origin: "https://savetik.io"
    },
    body: form.toString()
  });

  if (!response.ok) {
    throw createHttpError(502, `SaveTik Douyin tra ve HTTP ${response.status}.`);
  }

  const json = await response.json().catch(() => null);
  if (!json || json.status !== "ok" || typeof json.data !== "string") {
    throw createHttpError(502, "SaveTik Douyin khong tra du lieu hop le.");
  }

  const html = String(json.data || "");
  const title = decodeHtmlEntities((html.match(/<h3>([\s\S]*?)<\/h3>/i) || [])[1] || "").trim();
  const coverUrl = normalizeVideoUrl(decodeHtmlEntities((html.match(/<img[^>]+src="([^"]+)"/i) || [])[1] || ""));
  const itemId = decodeHtmlEntities((html.match(/id="TikTokId" value="([^"]+)"/i) || [])[1] || extractVideoId(url) || "");

  const qualities = [];
  const seen = new Set();
  const linkPattern = /<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let match = null;
  while ((match = linkPattern.exec(html)) !== null) {
    const href = normalizeVideoUrl(decodeHtmlEntities(match[1] || ""));
    const text = decodeHtmlEntities(String(match[2] || "").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
    if (!href || !text || /mp3/i.test(text)) continue;
    if (!/mp4|download/i.test(text)) continue;
    if (seen.has(href)) continue;
    seen.add(href);

    let quality = "douyin";
    let height = 0;
    if (/hd/i.test(text)) {
      quality = "1080p";
      height = 1080;
    } else if (/\[1\]/.test(text)) {
      quality = "720p";
      height = 720;
    } else if (/\[2\]/.test(text)) {
      quality = "540p";
      height = 540;
    }

    qualities.push({
      label: text,
      quality,
      url: href,
      width: 0,
      height,
      fps: 0,
      has_audio: true,
      audio_url: "",
      watermark_status: "unknown"
    });
  }

  if (!qualities.length) {
    throw createHttpError(502, "SaveTik Douyin khong tim thay link tai video.");
  }

  return normalizeVideoResult({
    item_id: itemId,
    title,
    cover_url: coverUrl,
    qualities
  }, url);
}

function postProcessByPlatform(result, platform) {
  const qualities = Array.isArray(result?.qualities) ? [...result.qualities] : [];

  if (platform === "tiktok") {
    const withAudio = qualities.filter((item) => item?.has_audio);
    const finalList = withAudio.length > 0 ? withAudio : qualities;
    const tuned = finalList.map((item) => ({
      ...item,
      audio_url: "",
      has_audio: true,
      platform: "tiktok",
      page_url: result?.source_page_url || ""
    }));
    return {
      ...result,
      qualities: tuned,
      requires_postprocess: false
    };
  }

  const needMerge = qualities.some((item) => item?.audio_url && !item?.has_audio);
  if (platform === "youtube") {
    const byHeight = new Map();
    for (const item of qualities) {
      const h = qualityHeightOf(item) || 0;
      const key = h || -1;
      const existing = byHeight.get(key);
      if (!existing) {
        byHeight.set(key, item);
        continue;
      }
      const chooseItem = scoreQuality(item) > scoreQuality(existing) ? item : existing;
      byHeight.set(key, chooseItem);
    }
    const normalizedYoutube = [...byHeight.entries()]
      .sort((a, b) => b[0] - a[0])
      .map((entry) => entry[1]);

    const best = normalizedYoutube[0] || null;
    const bestHeight = qualityHeightOf(best);
    const needMerge = normalizedYoutube.some((item) => item?.audio_url && !item?.has_audio);
    if (bestHeight > 0 && bestHeight < 1080) {
      return {
        ...result,
        qualities: normalizedYoutube,
        requires_postprocess: false
      };
    }
    return {
      ...result,
      qualities: normalizedYoutube,
      requires_postprocess: needMerge
    };
  }

  return {
    ...result,
    requires_postprocess: needMerge
  };
}

async function downloadViaYtDlpToFile(pageUrl, outputPath) {
  if (!ytDlpCommand) {
    throw createHttpError(502, "Chua tim thay yt-dlp de tai TikTok.");
  }

  let isolatedTempDir = "";
  try {
    isolatedTempDir = fs.mkdtempSync(path.join(RUNTIME_TEMP_DIR, "yt-dl-"));
  } catch {
    isolatedTempDir = RUNTIME_TEMP_DIR;
  }

  await new Promise((resolve, reject) => {
    const baseArgs = [
      "--no-warnings",
      "--no-playlist",
      "-f", "best[ext=mp4]/best",
      "-o", outputPath,
      pageUrl
    ];
    appendYtDlpGlobalArgsAsync(baseArgs, {
      useProxy: detectPlatform(pageUrl) === "youtube"
    }).then((args) => {
      const proc = spawn(ytDlpCommand.executable, [...ytDlpCommand.prefixArgs, ...args], {
        windowsHide: true,
        env: {
          ...process.env,
          TMP: isolatedTempDir,
          TEMP: isolatedTempDir
        }
      });
      let stderr = "";
      proc.stderr.on("data", (chunk) => {
        stderr += String(chunk || "");
      });
      proc.on("error", (error) => reject(normalizeProcessError(error, "Khong chay duoc yt-dlp.")));
      proc.on("close", (code) => {
        fs.promises.rm(isolatedTempDir, { recursive: true, force: true }).catch(() => {});
        if (code === 0) resolve();
        else {
          const userMessage = summarizeYtDlpError(stderr, "tai video");
          if (stderr) console.warn(`[yt-dlp] download failed (code ${code}): ${stderr.slice(-500)}`);
          reject(createHttpError(502, userMessage));
        }
      });
    }).catch((error) => {
      reject(normalizeProcessError(error, "Khong the khoi tao proxy cho yt-dlp."));
    });
  });
}

async function resolveViaYtDlp(url, platformHint = "unknown") {
  if (!ytDlpCommand) return null;

  const youtubeProfiles = platformHint === "youtube"
    ? ["default", "mobile", "tv", "tv_embedded", "skipweb"]
    : ["default"];
  const attemptPlans = platformHint === "youtube"
    ? [
        { includeCookies: true, label: "with_cookies" },
        { includeCookies: false, label: "without_cookies" }
      ]
    : [{ includeCookies: true, label: "default" }];
  let lastError = null;

  for (const plan of attemptPlans) {
    for (const profile of youtubeProfiles) {
      try {
        const args = await buildYtDlpResolveArgs(url, platformHint, profile, {
          includeCookies: plan.includeCookies,
          useProxy: platformHint === "youtube"
        });
        const { stdout } = await runCommandCapture(ytDlpCommand.executable, [...ytDlpCommand.prefixArgs, ...args]);
        const info = pickJsonFromStdout(stdout);
        if (!info || typeof info !== "object") {
          throw createHttpError(502, "yt-dlp tra ve JSON khong hop le.");
        }
        const qualities = buildQualitiesFromYtDlpInfo(info);
        if (!qualities.length) continue;

        return normalizeVideoResult({
          item_id: String(info?.id || extractVideoId(url) || ""),
          title: String(info?.title || ""),
          cover_url: String(info?.thumbnail || ""),
          qualities
        }, url);
      } catch (error) {
        lastError = error;
        if (platformHint === "youtube") {
          console.warn(`[youtube] yt-dlp fallback failed profile=${profile} mode=${plan.label}: ${error?.message || error}`);
          await sleep(500);
        }
      }
    }
  }
  if (lastError) throw lastError;
  return null;
}

async function resolveYouTubeViaInnertube(url) {
  const videoId = extractYouTubeVideoId(url);
  if (!videoId) return null;

  const apiKey = String(process.env.YT_INNERTUBE_KEY || "AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8");
  const endpoint = `https://www.youtube.com/youtubei/v1/player?key=${encodeURIComponent(apiKey)}`;
  const clients = [
    {
      name: "ANDROID",
      version: "19.44.38",
      ua: "com.google.android.youtube/19.44.38 (Linux; U; Android 11) gzip",
      extra: { androidSdkVersion: 30 }
    },
    {
      name: "IOS",
      version: "19.45.4",
      ua: "com.google.ios.youtube/19.45.4 (iPhone16,2; U; CPU iOS 18_0 like Mac OS X)",
      extra: { deviceModel: "iPhone16,2", osName: "iOS", osVersion: "18.0" }
    }
  ];

  let lastError = null;
  for (const client of clients) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": client.ua,
          "Accept-Language": "en-US,en;q=0.9",
          Origin: "https://www.youtube.com",
          Referer: "https://www.youtube.com/"
        },
        body: JSON.stringify({
          context: {
            client: {
              clientName: client.name,
              clientVersion: client.version,
              hl: "en",
              gl: "US",
              utcOffsetMinutes: -420,
              ...client.extra
            }
          },
          videoId,
          contentCheckOk: true,
          racyCheckOk: true
        })
      });
      if (!response.ok) {
        lastError = createHttpError(502, `YouTube innertube tra ve HTTP ${response.status}.`);
        continue;
      }

      const json = await response.json().catch(() => null);
      const stream = json?.streamingData || {};
      const formats = [
        ...(Array.isArray(stream.formats) ? stream.formats : []),
        ...(Array.isArray(stream.adaptiveFormats) ? stream.adaptiveFormats : [])
      ];
      if (!formats.length) {
        lastError = createHttpError(502, "YouTube innertube khong co streamingData.");
        continue;
      }

      const audioTracks = formats
        .filter((f) => typeof f?.url === "string" && /^audio\//i.test(String(f?.mimeType || "")))
        .sort((a, b) => (Number(b?.bitrate) || 0) - (Number(a?.bitrate) || 0));
      const bestAudio = audioTracks[0] || null;

      const videoTracks = formats
        .filter((f) => typeof f?.url === "string" && /^video\//i.test(String(f?.mimeType || "")))
        .map((f) => {
          const mime = String(f?.mimeType || "").toLowerCase();
          const hasAudio = /mp4a|opus|vorbis/.test(mime);
          const height = Number(f?.height) || detectQualityNumber(f?.qualityLabel) || 0;
          const qualityLabel = String(f?.qualityLabel || (height ? `${height}p` : "yt"));
          return {
            label: `Innertube ${qualityLabel}`,
            quality: qualityLabel,
            url: f.url,
            width: Number(f?.width) || 0,
            height,
            fps: Number(f?.fps) || 0,
            has_audio: hasAudio,
            audio_url: hasAudio ? "" : (bestAudio?.url || ""),
            watermark_status: "unknown"
          };
        });

      if (!videoTracks.length) {
        lastError = createHttpError(502, "YouTube innertube khong co video stream hop le.");
        continue;
      }

      return normalizeVideoResult({
        item_id: videoId,
        title: String(json?.videoDetails?.title || ""),
        cover_url: String(
          (Array.isArray(json?.videoDetails?.thumbnail?.thumbnails)
            ? json.videoDetails.thumbnail.thumbnails[json.videoDetails.thumbnail.thumbnails.length - 1]?.url
            : "") || ""
        ),
        qualities: videoTracks
      }, url);
    } catch (error) {
      lastError = normalizeProcessError(error, "Khong the lay stream YouTube qua innertube.");
    }
  }

  if (lastError) throw lastError;
  return null;
}

async function resolveFacebookVideo(url) {
  const cached = getCachedResolve(url);
  if (cached) return cached;

  const inFlight = inFlightResolves.get(url);
  if (inFlight) return inFlight;

  const job = (async () => {
    const redirect = await resolveRedirectInfo(url);
    const probes = buildProbeUrls(redirect.location);

    if (isLikelyDirectFacebookVideoUrl(redirect.location || url)) {
      try {
        const ytdlpPrimary = await resolveViaYtDlp(redirect.location || url, "facebook");
        if (ytdlpPrimary?.qualities?.length) {
          const finalResult = { ...ytdlpPrimary, resolver: "yt_dlp_fastpath" };
          putCachedResolve(url, finalResult);
          return finalResult;
        }
      } catch {
        // Fall back to HTML probing below.
      }
    }

    const isShareLink = /\/share\/r\//i.test(redirect.location) || /\/share\/v\//i.test(redirect.location);
    if (isShareLink) {
      try {
        const shareHtml = await fetchText(redirect.location);
        const canonical = extractCanonicalFacebookVideoUrl(shareHtml);
        if (canonical) {
          const extraProbes = buildProbeUrls(canonical);
          for (const probe of extraProbes) {
            if (!probes.includes(probe)) probes.push(probe);
          }
        }
      } catch {
        // Ignore share parse errors and continue with default probes.
      }
    }

    let lastError = null;
    for (const probe of probes) {
      try {
        const html = await fetchText(probe);
        const result = extractFromFacebookHtml(html, probe);
        if (result.qualities.length > 0) {
          const finalResult = { ...result, resolver: "facebook_html" };
          putCachedResolve(url, finalResult);
          return finalResult;
        }
      } catch (error) {
        lastError = error;
      }
    }

    if (lastError?.statusCode && lastError.statusCode >= 400 && lastError.statusCode < 500) {
      throw createHttpError(400, "Link Facebook khong hop le, da xoa, hoac khong cong khai.");
    }
    try {
      const ytdlpPrimary = await resolveViaYtDlp(redirect.location || url, "facebook");
      if (ytdlpPrimary?.qualities?.length) {
        const finalResult = { ...ytdlpPrimary, resolver: "yt_dlp_fallback" };
        putCachedResolve(url, finalResult);
        return finalResult;
      }
      const ytdlpOriginal = await resolveViaYtDlp(url, "facebook");
      if (ytdlpOriginal?.qualities?.length) {
        const finalResult = { ...ytdlpOriginal, resolver: "yt_dlp_fallback" };
        putCachedResolve(url, finalResult);
        return finalResult;
      }
    } catch (error) {
      lastError = error;
    }

    throw lastError || createHttpError(500, "Khong the phan tich link Facebook nay.");
  })();

  inFlightResolves.set(url, job);
  try {
    return await job;
  } finally {
    inFlightResolves.delete(url);
  }
}

async function resolveVideoByPlatform(url) {
  const normalized = normalizeInputUrl(url);
  const platform = detectPlatform(normalized);
  const normalizedForResolver = platform === "youtube"
    ? canonicalizeYouTubeVideoUrl(normalized)
    : normalized;
  let lastError = null;

  if (platform === "unknown") {
    throw createHttpError(400, "Link khong thuoc nen tang duoc ho tro.");
  }

  if (platform === "youtube") {
    throw createHttpError(503, "YouTube tam thoi da tat tren may chu nay.");
  }

  if (platform === "facebook") {
    const result = await resolveFacebookVideo(normalizedForResolver);
    return postProcessByPlatform({
      ...result,
      source_page_url: normalizedForResolver,
      platform
    }, platform);
  }

  if (platform === "youtube") {
    try {
      const innertube = await resolveYouTubeViaInnertube(normalizedForResolver);
      if (innertube?.qualities?.length) {
        return postProcessByPlatform({
          ...innertube,
          source_page_url: normalizedForResolver,
          resolver: "youtube_innertube",
          platform
        }, platform);
      }
    } catch (error) {
      lastError = normalizeProcessError(error, "Khong the doc du lieu YouTube bang innertube.");
    }
    try {
      const ytdlpFirst = await resolveViaYtDlp(normalizedForResolver, "youtube");
      if (ytdlpFirst?.qualities?.length) {
        return postProcessByPlatform({
          ...ytdlpFirst,
          source_page_url: normalizedForResolver,
          resolver: "yt_dlp",
          platform
        }, platform);
      }
    } catch (error) {
      lastError = normalizeProcessError(error, "Khong the doc du lieu YouTube bang yt-dlp.");
    }
    if (lastError) {
      const baseMessage = String(lastError.message || "Khong the tai video YouTube luc nay.");
      if ((baseMessage.toLowerCase().includes("xac minh bot") || baseMessage.toLowerCase().includes("stream youtube"))
        && !YTDLP_PROXY
        && !PROXYXOAY_KEY
        && !ensureYtDlpCookiesFile()) {
        throw createHttpError(502, `${baseMessage} (Can cau hinh YTDLP_PROXY/PROXYXOAY_KEY hoac YTDLP_COOKIES_B64 tren Render).`);
      }
      throw createHttpError(Number(lastError.statusCode) || 502, baseMessage);
    }
    throw createHttpError(502, "Khong tim thay stream YouTube hop le.");
  }

  if (platform === "tiktok") {
    const probes = await buildTikTokProbeUrls(normalizedForResolver);
    if (!probes.some((u) => isLikelyTikTokVideoUrl(u))) {
      throw createHttpError(400, "Link TikTok khong phai link video. Hay dan link co dang /video/... hoac vm.tiktok.com.");
    }

    for (const probe of probes) {
      try {
        let tikwm = null;
        try {
          tikwm = await resolveViaTikwm(probe);
        } catch (error) {
          const msg = String(error?.message || "").toLowerCase();
          if (msg.includes("free api limit") || msg.includes("1 request/second")) {
            await sleep(1200);
            tikwm = await resolveViaTikwm(probe);
          } else {
            throw error;
          }
        }
        if (tikwm?.qualities?.length) {
          return postProcessByPlatform({
            ...tikwm,
            source_page_url: probe,
            resolver: "tikwm",
            platform
          }, platform);
        }
      } catch (error) {
        console.warn(`[tikwm] resolve failed for ${probe}: ${error?.message || error}`);
        const normalized = normalizeProcessError(error, "Khong the doc du lieu TikTok bang tikwm.");
        if (!lastError) lastError = normalized;
      }
    }

    for (const probe of probes) {
      try {
        const ytdlpFirst = await resolveViaYtDlp(probe, "tiktok");
        if (ytdlpFirst?.qualities?.length) {
          return postProcessByPlatform({
            ...ytdlpFirst,
            source_page_url: probe,
            resolver: "yt_dlp",
            platform
          }, platform);
        }
      } catch (error) {
        lastError = normalizeProcessError(error, "Khong the doc du lieu TikTok bang yt-dlp.");
      }
    }
  }

  if (platform === "jimeng") {
    const soraJimeng = await resolveViaSora(normalizedForResolver, platform);
    if (soraJimeng?.qualities?.length) {
      return postProcessByPlatform({
        ...soraJimeng,
        source_page_url: normalizedForResolver,
        resolver: "sora2dl_jimeng",
        platform
      }, platform);
    }
    throw createHttpError(500, "Khong lay duoc du lieu Jimeng tu sora2dl.");
  }

  if (platform === "douyin") {
    const redirect = await resolveRedirectInfo(normalizedForResolver);
    const probes = [...new Set([normalizedForResolver, redirect.location || normalizedForResolver].filter(Boolean))];

    for (const probe of probes) {
      try {
        const saveTikDouyin = await resolveViaSaveTikDouyin(probe);
        if (saveTikDouyin?.qualities?.length) {
          return postProcessByPlatform({
            ...saveTikDouyin,
            source_page_url: probe,
            resolver: "savetik_douyin",
            platform
          }, platform);
        }
      } catch (error) {
        lastError = error;
      }
    }

    for (const probe of probes) {
      try {
        const soraDouyin = await resolveViaSora(probe, platform);
        if (soraDouyin?.qualities?.length) {
          return postProcessByPlatform({
            ...soraDouyin,
            source_page_url: probe,
            resolver: "sora2dl_douyin",
            platform
          }, platform);
        }
      } catch (error) {
        lastError = error;
      }
    }

    for (const probe of probes) {
      try {
        const ytdlpDouyin = await resolveViaYtDlp(probe, platform);
        if (ytdlpDouyin?.qualities?.length) {
          return postProcessByPlatform({
            ...ytdlpDouyin,
            source_page_url: probe,
            resolver: "yt_dlp",
            platform
          }, platform);
        }
      } catch (error) {
        lastError = normalizeProcessError(error, "Khong the doc nguon video Douyin.");
      }
    }
  }

  try {
    const ytdlp = await resolveViaYtDlp(normalizedForResolver, platform);
    if (ytdlp?.qualities?.length) {
      return postProcessByPlatform({
        ...ytdlp,
        source_page_url: normalizedForResolver,
        resolver: "yt_dlp",
        platform
      }, platform);
    }
  } catch (error) {
    lastError = normalizeProcessError(error, "Khong the doc nguon video bang yt-dlp.");
  }

  if (lastError) {
    throw createHttpError(
      Number(lastError.statusCode) || 502,
      lastError.message || "Khong tim thay nguon video hop le."
    );
  }

  throw createHttpError(502, "Khong tim thay nguon video hop le.");
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
  if (!raw) return `tienich.pro_${Date.now()}.mp4`;
  const cleaned = raw.replace(/[<>:"/\\|?*\x00-\x1F]/g, "_").slice(0, 120);
  const withExt = cleaned.toLowerCase().endsWith(".mp4") ? cleaned : `${cleaned}.mp4`;
  return /^tienich\.pro_/i.test(withExt) ? withExt : `tienich.pro_${withExt}`;
}

function buildSourceHeaders(sourceUrl, refererOverride = "") {
  const headers = { ...DEFAULT_HEADERS };
  try {
    const parsed = new URL(sourceUrl);
    const host = parsed.hostname.toLowerCase();
    const referer = refererOverride
      || (host.includes("facebook") || host === "fb.watch" ? "https://www.facebook.com/"
        : host.includes("tiktok") ? "https://www.tiktok.com/"
          : host.includes("douyin") ? "https://www.douyin.com/"
            : host.includes("youtube") || host === "youtu.be" ? "https://www.youtube.com/"
              : host.includes("jimeng.jianying.com") ? "https://jimeng.jianying.com/"
                : `${parsed.protocol}//${parsed.host}/`);
    headers.Referer = referer;
    try {
      const refererUrl = new URL(referer);
      headers.Origin = `${refererUrl.protocol}//${refererUrl.host}`;
    } catch {
      // Ignore invalid referer.
    }
  } catch {
    // Ignore URL parse errors and use default headers.
  }
  return headers;
}

async function downloadToFile(sourceUrl, destinationPath, referer) {
  const upstream = await fetch(sourceUrl, {
    method: "GET",
    headers: buildSourceHeaders(sourceUrl, referer),
    redirect: "follow"
  });

  if (!upstream.ok || !upstream.body) {
    throw createHttpError(502, `Khong the tai du lieu nguon (${upstream.status}).`);
  }

  await pipeline(Readable.fromWeb(upstream.body), fs.createWriteStream(destinationPath));
}

async function downloadToFileWithProgress(sourceUrl, destinationPath, referer, onProgress) {
  const upstream = await fetch(sourceUrl, {
    method: "GET",
    headers: buildSourceHeaders(sourceUrl, referer),
    redirect: "follow"
  });

  if (!upstream.ok || !upstream.body) {
    throw createHttpError(502, `Khong the tai du lieu nguon (${upstream.status}).`);
  }

  const total = Number(upstream.headers.get("content-length") || 0);
  const reader = upstream.body.getReader();
  const writer = fs.createWriteStream(destinationPath);
  let received = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      received += value.byteLength;
      writer.write(Buffer.from(value));
      if (typeof onProgress === "function") {
        onProgress(total > 0 ? Math.min(1, received / total) : 0);
      }
    }
  } finally {
    writer.end();
  }
}

async function runFfmpegMerge(videoPath, audioPath, outputPath, onProgress) {
  await new Promise((resolve, reject) => {
    const args = [
      "-y",
      "-i", videoPath,
      "-i", audioPath,
      "-c:v", "copy",
      "-c:a", "aac",
      "-movflags", "+faststart",
      outputPath
    ];
    const proc = spawn(ffmpegExecutable, args, { windowsHide: true });
    let stderr = "";

    proc.stderr.on("data", (chunk) => {
      const line = String(chunk || "");
      stderr += line;
      if (typeof onProgress === "function") {
        const hasTime = /time=\s*([\d:.]+)/i.test(line);
        if (hasTime) onProgress();
      }
    });
    proc.on("error", () => reject(createHttpError(500, "Khong the chay ffmpeg.")));
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(createHttpError(500, `ffmpeg ghep that bai (code ${code}). ${stderr.slice(-240)}`));
    });
  });
}

async function mergeAudioVideo(videoUrl, audioUrl) {
  if (!hasFfmpeg()) {
    throw createHttpError(501, "Can cai ffmpeg de ghep video 1080 voi audio.");
  }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "fbdl-"));
  const videoPath = path.join(tempDir, "video.mp4");
  const audioPath = path.join(tempDir, "audio.mp4");
  const outputPath = path.join(tempDir, "merged.mp4");

  try {
    await downloadToFile(videoUrl, videoPath, "https://www.facebook.com/");
    await downloadToFile(audioUrl, audioPath, "https://www.facebook.com/");
    await runFfmpegMerge(videoPath, audioPath, outputPath);

    return { tempDir, outputPath };
  } catch (error) {
    await fs.promises.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    throw error;
  }
}

async function processDownloadJob(job) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "fbdl-job-"));
  const outputPath = path.join(tempDir, "result.mp4");
  const videoPath = path.join(tempDir, "video.mp4");
  const audioPath = path.join(tempDir, "audio.mp4");

  job.tempDir = tempDir;
  job.outputPath = outputPath;
  job.status = "processing";
  setJobProgress(job, 3, "bat dau xu ly");

  try {
    if (!job.audio_url) {
      setJobProgress(job, 8, "dang tai video");
      await downloadToFileWithProgress(job.video_url, outputPath, "https://www.facebook.com/", (p) => {
        setJobProgress(job, 8 + p * 80, "dang tai video");
      });
      setJobProgress(job, 100, "hoan tat");
      job.status = "done";
      return;
    }

    if (!hasFfmpeg()) {
      throw createHttpError(501, "Can cai ffmpeg de ghep video chat luong cao voi audio.");
    }

    setJobProgress(job, 8, "dang tai luong video");
    await downloadToFileWithProgress(job.video_url, videoPath, "https://www.facebook.com/", (p) => {
      setJobProgress(job, 8 + p * 34, "dang tai luong video");
    });

    setJobProgress(job, 45, "dang tai luong audio");
    await downloadToFileWithProgress(job.audio_url, audioPath, "https://www.facebook.com/", (p) => {
      setJobProgress(job, 45 + p * 30, "dang tai luong audio");
    });

    setJobProgress(job, 78, "dang ghep audio/video");
    await runFfmpegMerge(videoPath, audioPath, outputPath, () => {
      setJobProgress(job, Math.min(96, job.progress + 1), "dang ghep audio/video");
    });

    setJobProgress(job, 100, "hoan tat");
    job.status = "done";
  } catch (error) {
    job.status = "error";
    job.error = error.message || "Khong the xu ly file.";
  }
}

function serveStaticFile(req, res) {
  let requestedPath = "/";
  try {
    const base = `http://${req.headers.host || `localhost:${PORT}`}`;
    const parsed = new URL(req.url, base);
    requestedPath = parsed.pathname || "/";
  } catch {
    requestedPath = req.url || "/";
  }
  if (requestedPath === "/") requestedPath = "/index.html";
  else if (requestedPath.endsWith("/")) requestedPath += "index.html";
  else if (!path.extname(requestedPath)) requestedPath += "/index.html";
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

function normalizeGiongNoiText(value) {
  return String(value || "").replace(/\r\n/g, "\n").trim();
}

function normalizeZaloTtsSpeed(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "1";
  const normalized = Math.max(0.8, Math.min(1.2, parsed));
  return String(Number(normalized.toFixed(2)));
}

function normalizeZaloTtsEncodeType(value) {
  const raw = String(value || "").trim();
  return raw === "1" ? "1" : "0";
}

function normalizeZaloTtsSpeakerId(value) {
  const raw = String(value || "").trim();
  if (!raw) return "1";
  return /^[1-6]$/.test(raw) ? raw : "1";
}

function sanitizeAudioFilename(input, fallbackBase = "zalo-tts", fallbackExt = "wav") {
  const raw = String(input || "").trim();
  const cleaned = raw.replace(/[<>:"/\\|?*\x00-\x1F]/g, "_").replace(/\s+/g, "-").slice(0, 96);
  const base = cleaned || `${fallbackBase}-${Date.now()}`;
  const ext = String(fallbackExt || "wav").replace(/^\.+/, "") || "wav";
  return `${base}.${ext}`;
}

function sanitizeAudioBaseName(input, fallbackBase = "zalo-tts") {
  const raw = String(input || "").trim();
  const cleaned = raw.replace(/[<>:"/\\|?*\x00-\x1F]/g, "_").replace(/\s+/g, "-").slice(0, 96);
  return cleaned || `${fallbackBase}-${Date.now()}`;
}

function parseFfmpegTimestampToSeconds(raw) {
  const match = String(raw || "").match(/(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?/);
  if (!match) return 0;
  const hours = Number(match[1] || 0);
  const minutes = Number(match[2] || 0);
  const seconds = Number(match[3] || 0);
  const fraction = Number(`0.${match[4] || 0}`);
  return (hours * 3600) + (minutes * 60) + seconds + fraction;
}

async function fetchZaloAudioText(url) {
  const response = await fetch(url, {
    method: "GET",
    headers: {
      "Referer": "https://ai.zalo.solutions/",
      "User-Agent": DEFAULT_HEADERS["User-Agent"]
    }
  });
  if (!response.ok) {
    throw createHttpError(502, `Khong the doc playlist audio (${response.status}).`);
  }
  return response.text();
}

async function getM3u8DurationSeconds(sourceUrl, depth = 0) {
  if (depth > 2) return 0;
  const text = await fetchZaloAudioText(sourceUrl);
  const extinfMatches = [...text.matchAll(/#EXTINF:([\d.]+)/g)];
  if (extinfMatches.length) {
    return extinfMatches.reduce((sum, item) => sum + Number(item[1] || 0), 0);
  }
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const child = lines.find((line) => !line.startsWith("#") && /\.m3u8($|\?)/i.test(line));
  if (!child) return 0;
  const nextUrl = new URL(child, sourceUrl).toString();
  return getM3u8DurationSeconds(nextUrl, depth + 1);
}

function splitLongTextForZaloTts(input, maxLength = 2000) {
  const normalized = normalizeGiongNoiText(input);
  if (!normalized) return [];
  if (normalized.length <= maxLength) return [normalized];

  const paragraphs = normalized
    .split(/\n+/)
    .map((part) => part.trim())
    .filter(Boolean);

  const chunks = [];
  for (const paragraph of paragraphs) {
    if (paragraph.length <= maxLength) {
      chunks.push(...splitParagraphForZaloTts(paragraph, maxLength));
      continue;
    }
    chunks.push(...splitParagraphForZaloTts(paragraph, maxLength));
  }

  if (!chunks.length) return [normalized.slice(0, maxLength)];
  return chunks;
}

function splitParagraphForZaloTts(text, maxLength) {
  const sentences = text.split(/(?<=[.!?…])\s+/).filter(Boolean);
  if (sentences.length <= 1) return splitHardByWord(text, maxLength);

  const out = [];
  let current = "";
  for (const sentence of sentences) {
    const candidate = current ? `${current} ${sentence}` : sentence;
    if (candidate.length <= maxLength) {
      current = candidate;
      continue;
    }
    if (current) out.push(current);
    if (sentence.length <= maxLength) current = sentence;
    else {
      out.push(...splitHardByWord(sentence, maxLength));
      current = "";
    }
  }
  if (current) out.push(current);
  return out;
}

function splitHardByWord(text, maxLength) {
  const words = String(text || "").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const out = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= maxLength) {
      current = candidate;
      continue;
    }
    if (current) out.push(current);
    if (word.length <= maxLength) current = word;
    else {
      for (let index = 0; index < word.length; index += maxLength) {
        out.push(word.slice(index, index + maxLength));
      }
      current = "";
    }
  }
  if (current) out.push(current);
  return out;
}

async function runFfmpegConcatAudio(inputPaths, outputPath) {
  if (!hasFfmpeg()) {
    throw createHttpError(501, "Can cai ffmpeg de ghep cac file audio.");
  }

  const listPath = path.join(path.dirname(outputPath), "concat-list.txt");
  const listContent = inputPaths
    .map((inputPath) => `file '${String(inputPath).replace(/'/g, "'\\''")}'`)
    .join("\n");
  await fs.promises.writeFile(listPath, listContent, "utf8");

  await new Promise((resolve, reject) => {
    const args = [
      "-y",
      "-f", "concat",
      "-safe", "0",
      "-i", listPath,
      "-c", "copy",
      outputPath
    ];
    const proc = spawn(ffmpegExecutable, args, { windowsHide: true });
    let stderr = "";

    proc.stderr.on("data", (chunk) => {
      stderr += String(chunk || "");
    });
    proc.on("error", () => reject(createHttpError(500, "Khong the chay ffmpeg de ghep audio.")));
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(createHttpError(500, `ffmpeg ghep audio that bai (code ${code}). ${stderr.slice(-240)}`));
    });
  });
}

async function registerMergedGiongNoiBundle(partUrls, filename) {
  const extension = path.extname(filename).replace(/^\./, "") || "wav";
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "giongnoi-merge-"));
  const inputPaths = [];
  const outputPath = path.join(tempDir, filename);

  try {
    for (let index = 0; index < partUrls.length; index += 1) {
      const inputPath = path.join(tempDir, `part-${index + 1}.${extension}`);
      await downloadToFile(partUrls[index], inputPath, "https://ai.zalo.solutions/");
      inputPaths.push(inputPath);
    }
    await runFfmpegConcatAudio(inputPaths, outputPath);

    const id = createJobId();
    giongNoiBundles.set(id, {
      id,
      outputPath,
      filename,
      tempDir,
      createdAt: Date.now()
    });
    return id;
  } catch (error) {
    await fs.promises.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    throw error;
  }
}

function isAllowedZaloAudioHostname(hostname) {
  const host = String(hostname || "").toLowerCase();
  return host.endsWith(".tts.zalo.ai")
    || host === "tts.zalo.ai"
    || host.endsWith(".zdn.vn")
    || host === "zdn.vn";
}

async function runFfmpegDownloadAudio(sourceUrl, outputPath, format = "mp3", onProgress) {
  if (!hasFfmpeg()) {
    throw createHttpError(501, "May chu chua co ffmpeg de tai audio tu link m3u8.");
  }

  const normalizedFormat = String(format || "mp3").toLowerCase();
  let totalDuration = 0;
  try {
    totalDuration = await getM3u8DurationSeconds(sourceUrl);
  } catch {
    totalDuration = 0;
  }
  await new Promise((resolve, reject) => {
    const args = [
      "-y",
      "-protocol_whitelist", "file,http,https,tcp,tls,crypto,httpproxy",
      "-allowed_extensions", "ALL",
      "-allowed_segment_extensions", "ALL",
      "-extension_picky", "0",
      "-headers", "Referer: https://ai.zalo.solutions/\r\nUser-Agent: Mozilla/5.0\r\n",
      "-i", sourceUrl
    ];

    if (normalizedFormat === "aac") {
      args.push("-vn", "-c:a", "copy", outputPath);
    } else if (normalizedFormat === "wav") {
      args.push("-vn", outputPath);
    } else {
      args.push("-vn", "-ar", "44100", "-ac", "2", "-b:a", "192k", outputPath);
    }

    const proc = spawn(ffmpegExecutable, args, { windowsHide: true });
    let stderr = "";

    proc.stderr.on("data", (chunk) => {
      const text = String(chunk || "");
      stderr += text;
      if (typeof onProgress === "function" && totalDuration > 0) {
        const matches = [...text.matchAll(/time=(\d{2}:\d{2}:\d{2}(?:\.\d+)?)/g)];
        if (matches.length) {
          const seconds = parseFfmpegTimestampToSeconds(matches[matches.length - 1][1]);
          if (seconds > 0) {
            const ratio = Math.max(0, Math.min(0.98, seconds / totalDuration));
            onProgress(10 + (ratio * 85), "dang chuyen doi audio");
          }
        }
      }
    });
    proc.on("error", () => reject(createHttpError(500, "Khong the chay ffmpeg de tai audio.")));
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(createHttpError(500, `ffmpeg tai audio that bai (code ${code}). ${stderr.slice(-240)}`));
    });
  });
}

async function createGiongNoiFileFromM3u8(sourceUrl, format, baseName, onProgress) {
  let parsed = null;
  try {
    parsed = new URL(String(sourceUrl || "").trim());
  } catch {
    throw createHttpError(400, "Link audio khong hop le.");
  }
  if (!/^https?:$/i.test(parsed.protocol) || isUnsafeHostname(parsed.hostname) || !isAllowedZaloAudioHostname(parsed.hostname)) {
    throw createHttpError(400, "Chi ho tro link audio Zalo hop le.");
  }
  if (!/\.m3u8($|\?)/i.test(parsed.pathname + parsed.search)) {
    throw createHttpError(400, "Link phai la file .m3u8.");
  }

  const ext = ["aac", "wav", "mp3"].includes(String(format || "").toLowerCase()) ? String(format).toLowerCase() : "mp3";
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "giongnoi-file-"));
  const filename = sanitizeAudioFilename(baseName || "zalo-audio", "zalo-audio", ext);
  const outputPath = path.join(tempDir, filename);

  try {
    if (typeof onProgress === "function") onProgress(8, "dang tai playlist audio");
    await runFfmpegDownloadAudio(parsed.toString(), outputPath, ext, onProgress);
    const id = createJobId();
    const cleanupAt = Date.now() + GIONGNOI_FILE_TTL_MS;
    giongNoiFiles.set(id, {
      id,
      outputPath,
      filename,
      tempDir,
      createdAt: Date.now(),
      cleanupAt
    });
    setTimeout(async () => {
      const current = giongNoiFiles.get(id);
      if (!current) return;
      if (Date.now() < current.cleanupAt) return;
      await fs.promises.rm(current.tempDir, { recursive: true, force: true }).catch(() => {});
      giongNoiFiles.delete(id);
    }, GIONGNOI_FILE_TTL_MS + 5000).unref?.();
    return {
      id,
      filename,
      file_path: `/api/giongnoi/file?id=${encodeURIComponent(id)}`,
      ext,
      expires_in_ms: GIONGNOI_FILE_TTL_MS
    };
  } catch (error) {
    await fs.promises.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    throw error;
  }
}

async function processGiongNoiLinkJob(job) {
  job.status = "processing";
  job.progress = 3;
  job.stage = "dang tao file";
  job.updated_at = Date.now();
  try {
    const result = await createGiongNoiFileFromM3u8(job.url, job.format, job.filename, (progress, stage) => {
      job.progress = Math.max(job.progress || 0, Math.floor(progress));
      if (stage) job.stage = stage;
      job.updated_at = Date.now();
    });
    job.status = "done";
    job.progress = 100;
    job.stage = "hoan tat";
    job.file_path = result.file_path;
    job.result_filename = result.filename;
    job.updated_at = Date.now();
  } catch (error) {
    job.status = "error";
    job.error = error?.message || "Khong the tai audio tu link nay.";
    job.updated_at = Date.now();
  }
}

async function callZaloTtsApi(payload) {
  if (!ZALO_TTS_API_KEY) {
    throw createHttpError(500, "Chua cau hinh ZALO_TTS_API_KEY.");
  }

  const input = normalizeGiongNoiText(payload?.input);
  if (!input) throw createHttpError(400, "Vui long nhap noi dung can chuyen giong noi.");
  if (input.length > 10000) {
    throw createHttpError(400, "Noi dung qua dai. Hay rut gon xuong duoi 10000 ky tu.");
  }

  const params = new URLSearchParams();
  params.set("input", input);
  params.set("speed", normalizeZaloTtsSpeed(payload?.speed));
  params.set("encode_type", normalizeZaloTtsEncodeType(payload?.encode_type));

  const speakerId = normalizeZaloTtsSpeakerId(payload?.speaker_id);
  params.set("speaker_id", speakerId);

  let response = null;
  let json = null;
  for (let attempt = 0; attempt < ZALO_TTS_MAX_RETRIES; attempt += 1) {
    response = await fetch(`${ZALO_TTS_API_HOST}${ZALO_TTS_API_PATH}`, {
      method: "POST",
      headers: {
        "apikey": ZALO_TTS_API_KEY,
        "Accept": "application/json"
      },
      body: params
    });

    const text = await response.text();
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }

    if (response.ok) break;
    if (response.status === 429 && attempt < ZALO_TTS_MAX_RETRIES - 1) {
      const retryAfterHeader = Number(response.headers.get("retry-after") || 0);
      const retryDelay = retryAfterHeader > 0
        ? retryAfterHeader * 1000
        : ZALO_TTS_RETRY_BASE_MS * (attempt + 1);
      await sleep(retryDelay);
      continue;
    }
    const message = response.status === 429
      ? "Zalo TTS dang gioi han toc do hoac da cham quota. Vui long doi 1-2 phut roi thu lai."
      : (json?.message || json?.error || `Zalo TTS tra ve HTTP ${response.status}.`);
    throw createHttpError(502, message);
  }

  if (!response || !response.ok) {
    throw createHttpError(502, "Khong the tao audio tu Zalo TTS.");
  }

  const audioUrl = String(json?.data?.url || "").trim();
  if (!audioUrl) {
    throw createHttpError(502, json?.message || "Khong lay duoc link audio tu Zalo TTS.");
  }

  let parsedAudioUrl = null;
  try {
    parsedAudioUrl = new URL(audioUrl);
  } catch {
    throw createHttpError(502, "Link audio Zalo tra ve khong hop le.");
  }
  if (!/^https?:$/i.test(parsedAudioUrl.protocol) || isUnsafeHostname(parsedAudioUrl.hostname)) {
    throw createHttpError(502, "Link audio Zalo tra ve khong an toan.");
  }

  return {
    raw: json,
    audioUrl,
    speed: params.get("speed") || "1",
    encodeType: params.get("encode_type") || "0",
    speakerId
  };
}

async function synthesizeLongTextWithZalo(payload) {
  const input = normalizeGiongNoiText(payload?.input);
  if (!input) throw createHttpError(400, "Vui long nhap noi dung can chuyen giong noi.");
  if (input.length > 10000) {
    throw createHttpError(400, "Noi dung qua dai. Hay rut gon xuong duoi 10000 ky tu.");
  }

  const parts = splitLongTextForZaloTts(input, 2000);
  if (!parts.length) throw createHttpError(400, "Khong co noi dung hop le de tao audio.");

  const encodeType = normalizeZaloTtsEncodeType(payload?.encode_type);
  const extension = encodeType === "1" ? "mp3" : "wav";
  const baseName = sanitizeAudioBaseName(payload?.filename || payload?.title || "zalo-tts", "zalo-tts");
  const audioParts = [];

  for (let index = 0; index < parts.length; index += 1) {
    if (index > 0 && ZALO_TTS_PART_DELAY_MS > 0) {
      await sleep(ZALO_TTS_PART_DELAY_MS);
    }
    const result = await callZaloTtsApi({
      ...payload,
      input: parts[index],
      encode_type: encodeType
    });
    const filename = sanitizeAudioFilename(`${baseName}-part-${index + 1}`, `${baseName}-part-${index + 1}`, extension);
    audioParts.push({
      index: index + 1,
      text: parts[index],
      text_length: parts[index].length,
      audio_url: result.audioUrl,
      audio_path: `/api/giongnoi/audio?url=${encodeURIComponent(result.audioUrl)}&filename=${encodeURIComponent(filename)}`,
      filename
    });
  }

  let mergedAudioPath = "";
  let mergedFilename = "";
  if (audioParts.length > 1 && hasFfmpeg()) {
    mergedFilename = sanitizeAudioFilename(baseName, baseName, extension);
    const bundleId = await registerMergedGiongNoiBundle(audioParts.map((part) => part.audio_url), mergedFilename);
    mergedAudioPath = `/api/giongnoi/merged?id=${encodeURIComponent(bundleId)}`;
  }

  return {
    parts: audioParts,
    merged_audio_path: mergedAudioPath,
    merged_filename: mergedFilename,
    merged_supported: hasFfmpeg(),
    part_count: audioParts.length,
    speed: normalizeZaloTtsSpeed(payload?.speed),
    encode_type: encodeType,
    speaker_id: normalizeZaloTtsSpeakerId(payload?.speaker_id)
  };
}

const server = http.createServer(async (req, res) => {
  if ((req.method === "GET" || req.method === "HEAD") && (req.url === "/healthz" || req.url === "/giongnoi/healthz")) {
    if (req.method === "HEAD") {
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end();
      return;
    }
    sendJson(res, 200, { ok: true, uptime: process.uptime() });
    return;
  }

  if (req.method === "POST" && req.url === "/api/info") {
    try {
      const rawBody = await readRequestBody(req);
      const body = rawBody ? JSON.parse(rawBody) : {};
      const url = normalizeInputUrl(typeof body.url === "string" ? body.url : "");
      if (!url) return sendJson(res, 400, { error: "No URL provided" });
      const info = await runReclipInfo(url);
      sendJson(res, 200, info);
    } catch (error) {
      const statusCode = Number(error?.statusCode) || 500;
      sendJson(res, statusCode >= 400 && statusCode < 600 ? statusCode : 500, {
        error: sanitizeClientErrorMessage(error?.message || "Khong the lay thong tin video.")
      });
    }
    return;
  }

  if (req.method === "POST" && req.url === "/api/download") {
    try {
      const rawBody = await readRequestBody(req);
      const body = rawBody ? JSON.parse(rawBody) : {};
      const url = normalizeInputUrl(typeof body.url === "string" ? body.url : "");
      const format = String(body.format || "video").toLowerCase() === "audio" ? "audio" : "video";
      const formatId = typeof body.format_id === "string" ? body.format_id.trim() : "";
      const title = typeof body.title === "string" ? body.title : "";
      if (!url) return sendJson(res, 400, { error: "No URL provided" });

      const jobId = createJobId();
      const job = {
        id: jobId,
        url,
        format,
        formatId,
        title,
        status: "downloading",
        file: "",
        filename: "",
        error: "",
        created_at: Date.now(),
        updated_at: Date.now()
      };
      reclipJobs.set(jobId, job);
      runReclipDownloadJob(job).catch(() => {});
      sendJson(res, 200, { job_id: jobId });
    } catch (error) {
      const statusCode = Number(error?.statusCode) || 500;
      sendJson(res, statusCode >= 400 && statusCode < 600 ? statusCode : 500, {
        error: sanitizeClientErrorMessage(error?.message || "Khong the tao job tai xuong.")
      });
    }
    return;
  }

  if (req.method === "POST" && req.url === "/api/giongnoi/synthesize") {
    try {
      const rawBody = await readRequestBody(req);
      const body = rawBody ? JSON.parse(rawBody) : {};
      const result = await synthesizeLongTextWithZalo(body);
      const primaryPart = result.parts[0] || null;
      sendJson(res, 200, {
        ok: true,
        audio_url: primaryPart?.audio_url || "",
        audio_path: primaryPart?.audio_path || "",
        filename: primaryPart?.filename || "",
        speed: result.speed,
        encode_type: result.encode_type,
        speaker_id: result.speaker_id,
        part_count: result.part_count,
        parts: result.parts,
        merged_audio_path: result.merged_audio_path,
        merged_filename: result.merged_filename,
        merged_supported: result.merged_supported
      });
    } catch (error) {
      const statusCode = Number(error?.statusCode) || 500;
      const message = error instanceof SyntaxError
        ? "Request JSON khong hop le."
        : (error?.message || "Khong the tao audio tu Zalo TTS.");
      sendJson(res, statusCode >= 400 && statusCode < 600 ? statusCode : 500, { error: message });
    }
    return;
  }

  if (req.method === "POST" && req.url === "/api/giongnoi/from-link") {
    try {
      const rawBody = await readRequestBody(req);
      const body = rawBody ? JSON.parse(rawBody) : {};
      const result = await createGiongNoiFileFromM3u8(
        body.url,
        body.format,
        body.filename || "zalo-audio"
      );
      sendJson(res, 200, {
        ok: true,
        filename: result.filename,
        file_path: result.file_path,
        format: result.ext
      });
    } catch (error) {
      const statusCode = Number(error?.statusCode) || 500;
      const message = error instanceof SyntaxError
        ? "Request JSON khong hop le."
        : (error?.message || "Khong the tai audio tu link nay.");
      sendJson(res, statusCode >= 400 && statusCode < 600 ? statusCode : 500, { error: message });
    }
    return;
  }

  if (req.method === "GET" && req.url.startsWith("/api/giongnoi/from-link?")) {
    try {
      const base = `http://${req.headers.host || `localhost:${PORT}`}`;
      const parsed = new URL(req.url, base);
      const result = await createGiongNoiFileFromM3u8(
        parsed.searchParams.get("url") || "",
        parsed.searchParams.get("format") || "mp3",
        parsed.searchParams.get("filename") || "zalo-audio"
      );
      sendJson(res, 200, {
        ok: true,
        filename: result.filename,
        file_path: result.file_path,
        format: result.ext,
        expires_in_ms: result.expires_in_ms
      });
    } catch (error) {
      const statusCode = Number(error?.statusCode) || 500;
      sendJson(res, statusCode >= 400 && statusCode < 600 ? statusCode : 500, {
        error: error?.message || "Khong the tai audio tu link nay."
      });
    }
    return;
  }

  if (req.method === "POST" && req.url === "/api/giongnoi/jobs") {
    try {
      const rawBody = await readRequestBody(req);
      const body = rawBody ? JSON.parse(rawBody) : {};
      const id = createJobId();
      const job = {
        id,
        url: String(body.url || "").trim(),
        format: String(body.format || "mp3").trim().toLowerCase(),
        filename: String(body.filename || "zalo-audio-link").trim(),
        status: "queued",
        progress: 0,
        stage: "dang xep hang",
        error: "",
        file_path: "",
        result_filename: "",
        created_at: Date.now(),
        updated_at: Date.now()
      };
      giongNoiLinkJobs.set(id, job);
      processGiongNoiLinkJob(job).catch(() => {});
      sendJson(res, 200, {
        ok: true,
        job_id: id,
        status: job.status,
        progress: job.progress,
        stage: job.stage
      });
    } catch (error) {
      const statusCode = Number(error?.statusCode) || 500;
      sendJson(res, statusCode >= 400 && statusCode < 600 ? statusCode : 500, {
        error: error?.message || "Khong the tao job audio."
      });
    }
    return;
  }

  if (req.method === "GET" && req.url.startsWith("/api/giongnoi/jobs/")) {
    try {
      const base = `http://${req.headers.host || `localhost:${PORT}`}`;
      const parsed = new URL(req.url, base);
      const id = decodeURIComponent(parsed.pathname.slice("/api/giongnoi/jobs/".length));
      const job = giongNoiLinkJobs.get(id);
      if (!job) return sendJson(res, 404, { error: "Khong tim thay job audio." });
      sendJson(res, 200, {
        ok: true,
        id: job.id,
        status: job.status,
        progress: job.progress,
        stage: job.stage,
        error: job.error || "",
        file_path: job.file_path || "",
        filename: job.result_filename || ""
      });
    } catch (error) {
      sendJson(res, 500, { error: error?.message || "Khong the doc trang thai job." });
    }
    return;
  }

  if (req.method === "POST" && req.url === "/api/giongnoi/media-download") {
    try {
      const rawBody = await readRequestBody(req);
      const body = rawBody ? JSON.parse(rawBody) : {};
      const url = normalizeInputUrl(typeof body.url === "string" ? body.url : "");
      if (!url) return sendJson(res, 400, { error: "Can nhap link media." });
      const format = String(body.format || "video").toLowerCase() === "audio" ? "audio" : "video";
      const title = typeof body.title === "string" ? body.title : "";

      const jobId = createJobId();
      const job = {
        id: jobId,
        url,
        format,
        formatId: "",
        title,
        status: "downloading",
        file: "",
        filename: "",
        error: "",
        created_at: Date.now(),
        updated_at: Date.now()
      };
      reclipJobs.set(jobId, job);
      runReclipDownloadJob(job).catch(() => {});
      sendJson(res, 200, { ok: true, job_id: jobId });
    } catch (error) {
      const statusCode = Number(error?.statusCode) || 500;
      sendJson(res, statusCode >= 400 && statusCode < 600 ? statusCode : 500, {
        error: error?.message || "Khong the tao job media."
      });
    }
    return;
  }

  if (req.method === "GET" && req.url.startsWith("/api/status/")) {
    const base = `http://${req.headers.host || `localhost:${PORT}`}`;
    const parsed = new URL(req.url, base);
    const id = decodeURIComponent(parsed.pathname.slice("/api/status/".length));
    const job = reclipJobs.get(id);
    if (!job) return sendJson(res, 404, { error: "Job not found" });
    return sendJson(res, 200, {
      status: job.status,
      error: job.error || "",
      filename: job.filename || ""
    });
  }

  if (req.method === "GET" && req.url.startsWith("/api/file/")) {
    const base = `http://${req.headers.host || `localhost:${PORT}`}`;
    const parsed = new URL(req.url, base);
    const id = decodeURIComponent(parsed.pathname.slice("/api/file/".length));
    const job = reclipJobs.get(id);
    if (!job || job.status !== "done" || !job.file) {
      return sendJson(res, 404, { error: "File not ready" });
    }
    try {
      await fs.promises.access(job.file, fs.constants.R_OK);
    } catch {
      return sendJson(res, 404, { error: "File not found" });
    }

    const ext = path.extname(job.file).toLowerCase();
    res.writeHead(200, {
      "Content-Type": MIME_TYPES[ext] || "application/octet-stream",
      "Content-Disposition": `attachment; filename="${job.filename || path.basename(job.file)}"`,
      "Cache-Control": "no-store"
    });
    const stream = fs.createReadStream(job.file);
    stream.on("error", () => {
      if (!res.headersSent) sendJson(res, 500, { error: "Khong doc duoc file." });
      else res.destroy();
    });
    stream.on("close", async () => {
      await fs.promises.rm(job.file, { force: true }).catch(() => {});
      reclipJobs.delete(id);
    });
    stream.pipe(res);
    return;
  }

  if (req.method === "POST" && req.url === "/api/resolve") {
    try {
      const rawBody = await readRequestBody(req);
      const body = rawBody ? JSON.parse(rawBody) : {};
      const url = normalizeInputUrl(typeof body.url === "string" ? body.url : "");

      if (!url) return sendJson(res, 400, { error: "Vui long nhap link video." });
      if (!isSupportedUrl(url)) {
        return sendJson(res, 400, {
          error: "Link khong duoc ho tro. Ho tro: Facebook, TikTok, Jimeng, Douyin."
        });
      }

      const result = await resolveVideoByPlatform(url);
      sendJson(res, 200, result);
    } catch (error) {
      const message = error instanceof SyntaxError
        ? "Request JSON khong hop le."
        : sanitizeClientErrorMessage(error.message || "Khong the xu ly link nay luc nay.");
      const statusCode = Number(error?.statusCode) || 500;
      sendJson(res, statusCode >= 400 && statusCode < 600 ? statusCode : 500, { error: message });
    }
    return;
  }

  if (req.method === "POST" && req.url === "/api/facebook-id") {
    try {
      const rawBody = await readRequestBody(req);
      const body = rawBody ? JSON.parse(rawBody) : {};
      const url = normalizeInputUrl(typeof body.url === "string" ? body.url : "");
      const result = await resolveFacebookProfileId(url);
      sendJson(res, 200, result);
    } catch (error) {
      const statusCode = Number(error?.statusCode) || 500;
      sendJson(res, statusCode >= 400 && statusCode < 600 ? statusCode : 500, {
        error: sanitizeClientErrorMessage(error.message || "Khong the truy van Facebook ID.")
      });
    }
    return;
  }

  if (req.method === "POST" && req.url === "/api/process") {
    try {
      const rawBody = await readRequestBody(req);
      const body = rawBody ? JSON.parse(rawBody) : {};
      const videoUrl = typeof body.video_url === "string" ? body.video_url.trim() : "";
      const audioUrl = typeof body.audio_url === "string" ? body.audio_url.trim() : "";
      const filename = sanitizeFilename(body.name || "tienich.pro_processed.mp4");

      if (!videoUrl) return sendJson(res, 400, { error: "Thieu video_url." });

      const videoParsed = new URL(videoUrl);
      if (!/^https?:$/i.test(videoParsed.protocol) || isUnsafeHostname(videoParsed.hostname)) {
        return sendJson(res, 400, { error: "video_url khong hop le." });
      }
      if (audioUrl) {
        const audioParsed = new URL(audioUrl);
        if (!/^https?:$/i.test(audioParsed.protocol) || isUnsafeHostname(audioParsed.hostname)) {
          return sendJson(res, 400, { error: "audio_url khong hop le." });
        }
      }

      const id = createJobId();
      const job = {
        id,
        filename,
        video_url: videoUrl,
        audio_url: audioUrl,
        status: "queued",
        progress: 0,
        stage: "dang xep hang",
        error: "",
        created_at: Date.now(),
        updated_at: Date.now(),
        tempDir: "",
        outputPath: ""
      };
      processJobs.set(id, job);
      processDownloadJob(job).catch(() => {});
      sendJson(res, 200, { id, status: job.status, progress: job.progress, stage: job.stage });
    } catch (error) {
      const statusCode = Number(error?.statusCode) || 500;
      sendJson(res, statusCode >= 400 && statusCode < 600 ? statusCode : 500, {
        error: error.message || "Khong the tao tien trinh xu ly."
      });
    }
    return;
  }

  if (req.method === "GET" && req.url.startsWith("/api/process/")) {
    try {
      const base = `http://${req.headers.host || `localhost:${PORT}`}`;
      const parsed = new URL(req.url, base);
      const id = decodeURIComponent(parsed.pathname.slice("/api/process/".length));
      const job = getJob(id);
      if (!job) return sendJson(res, 404, { error: "Khong tim thay job." });

      const done = job.status === "done";
      sendJson(res, 200, {
        id: job.id,
        status: job.status,
        progress: job.progress,
        stage: job.stage,
        error: job.error || "",
        download_url: done ? `/api/download-ready?id=${encodeURIComponent(job.id)}` : ""
      });
    } catch {
      sendJson(res, 500, { error: "Khong the doc tien trinh." });
    }
    return;
  }

  if (req.method === "GET" && req.url.startsWith("/api/giongnoi/audio?")) {
    try {
      const base = `http://${req.headers.host || `localhost:${PORT}`}`;
      const parsed = new URL(req.url, base);
      const sourceUrl = String(parsed.searchParams.get("url") || "").trim();
      const filename = sanitizeAudioFilename(parsed.searchParams.get("filename") || "zalo-tts", "zalo-tts", "wav");
      if (!sourceUrl) return sendJson(res, 400, { error: "Thieu tham so url." });

      const sourceParsed = new URL(sourceUrl);
      if (!/^https?:$/i.test(sourceParsed.protocol) || isUnsafeHostname(sourceParsed.hostname)) {
        return sendJson(res, 400, { error: "Nguon audio khong hop le." });
      }

      const upstream = await fetch(sourceUrl, {
        method: "GET",
        headers: {
          ...DEFAULT_HEADERS,
          "Referer": "https://ai.zalo.solutions/"
        },
        redirect: "follow"
      });

      if (!upstream.ok || !upstream.body) {
        return sendJson(res, 502, { error: "Khong the tai audio tu Zalo." });
      }

      res.writeHead(200, {
        "Content-Type": upstream.headers.get("content-type") || "audio/wav",
        "Content-Disposition": `inline; filename="${filename}"`,
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
        if (!res.headersSent) sendJson(res, 500, { error: "Loi khi stream audio." });
        else res.destroy(err);
      });
    } catch (error) {
      sendJson(res, 500, { error: error.message || "Khong the doc audio." });
    }
    return;
  }

  if (req.method === "GET" && req.url.startsWith("/api/giongnoi/merged?")) {
    try {
      const base = `http://${req.headers.host || `localhost:${PORT}`}`;
      const parsed = new URL(req.url, base);
      const id = String(parsed.searchParams.get("id") || "").trim();
      const bundle = giongNoiBundles.get(id);
      if (!bundle) return sendJson(res, 404, { error: "Khong tim thay file audio da ghep." });

      await fs.promises.access(bundle.outputPath, fs.constants.R_OK);
      const ext = path.extname(bundle.outputPath).toLowerCase();
      res.writeHead(200, {
        "Content-Type": MIME_TYPES[ext] || "audio/wav",
        "Content-Disposition": `inline; filename="${bundle.filename}"`,
        "Cache-Control": "no-store"
      });

      const stream = fs.createReadStream(bundle.outputPath);
      stream.on("error", () => {
        if (!res.headersSent) sendJson(res, 500, { error: "Khong doc duoc file audio da ghep." });
        else res.destroy();
      });
      stream.on("close", async () => {
        await fs.promises.rm(bundle.tempDir, { recursive: true, force: true }).catch(() => {});
        giongNoiBundles.delete(id);
      });
      stream.pipe(res);
    } catch (error) {
      sendJson(res, 500, { error: error.message || "Khong the tai file audio da ghep." });
    }
    return;
  }

  if (req.method === "GET" && req.url.startsWith("/api/giongnoi/file?")) {
    try {
      const base = `http://${req.headers.host || `localhost:${PORT}`}`;
      const parsed = new URL(req.url, base);
      const id = String(parsed.searchParams.get("id") || "").trim();
      const file = giongNoiFiles.get(id);
      if (!file) return sendJson(res, 404, { error: "Khong tim thay file audio." });

      await fs.promises.access(file.outputPath, fs.constants.R_OK);
      const ext = path.extname(file.outputPath).toLowerCase();
      res.writeHead(200, {
        "Content-Type": MIME_TYPES[ext] || "application/octet-stream",
        "Content-Disposition": `attachment; filename="${file.filename}"`,
        "Cache-Control": "private, max-age=300"
      });

      const stream = fs.createReadStream(file.outputPath);
      stream.on("error", () => {
        if (!res.headersSent) sendJson(res, 500, { error: "Khong doc duoc file audio." });
        else res.destroy();
      });
      stream.pipe(res);
    } catch (error) {
      sendJson(res, 500, { error: error.message || "Khong the tai file audio." });
    }
    return;
  }

  if (req.method === "GET" && req.url.startsWith("/api/download-ready?")) {
    try {
      const base = `http://${req.headers.host || `localhost:${PORT}`}`;
      const parsed = new URL(req.url, base);
      const id = parsed.searchParams.get("id") || "";
      const job = getJob(id);
      if (!job) return sendJson(res, 404, { error: "Khong tim thay job." });
      if (job.status !== "done" || !job.outputPath) {
        return sendJson(res, 409, { error: "Job chua hoan tat." });
      }

      res.writeHead(200, {
        "Content-Type": "video/mp4",
        "Content-Disposition": `attachment; filename="${job.filename}"`,
        "Cache-Control": "no-store"
      });

      const stream = fs.createReadStream(job.outputPath);
      stream.on("error", () => {
        if (!res.headersSent) sendJson(res, 500, { error: "Khong doc duoc file da xu ly." });
        else res.destroy();
      });
      stream.on("close", async () => {
        if (job.tempDir) await fs.promises.rm(job.tempDir, { recursive: true, force: true }).catch(() => {});
        processJobs.delete(job.id);
      });
      stream.pipe(res);
    } catch (error) {
      sendJson(res, 500, { error: error.message || "Khong the tai file da xu ly." });
    }
    return;
  }

  if (req.method === "GET" && req.url.startsWith("/api/download-merge?")) {
    try {
      const base = `http://${req.headers.host || `localhost:${PORT}`}`;
      const parsed = new URL(req.url, base);
      const videoUrl = parsed.searchParams.get("video") || "";
      const audioUrl = parsed.searchParams.get("audio") || "";
      const filename = sanitizeFilename(parsed.searchParams.get("name") || "tienich.pro_merged.mp4");

      if (!videoUrl || !audioUrl) return sendJson(res, 400, { error: "Thieu tham so video/audio." });

      const videoParsed = new URL(videoUrl);
      const audioParsed = new URL(audioUrl);
      if (!/^https?:$/i.test(videoParsed.protocol) || !/^https?:$/i.test(audioParsed.protocol)) {
        return sendJson(res, 400, { error: "URL video/audio khong hop le." });
      }
      if (isUnsafeHostname(videoParsed.hostname) || isUnsafeHostname(audioParsed.hostname)) {
        return sendJson(res, 400, { error: "Nguon video/audio khong hop le." });
      }

      const merged = await mergeAudioVideo(videoUrl, audioUrl);
      res.writeHead(200, {
        "Content-Type": "video/mp4",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store"
      });

      const stream = fs.createReadStream(merged.outputPath);
      stream.on("error", () => {
        if (!res.headersSent) sendJson(res, 500, { error: "Loi doc file da ghep." });
        else res.destroy();
      });
      stream.on("close", async () => {
        await fs.promises.rm(merged.tempDir, { recursive: true, force: true }).catch(() => {});
      });
      res.on("close", async () => {
        await fs.promises.rm(merged.tempDir, { recursive: true, force: true }).catch(() => {});
      });
      stream.pipe(res);
    } catch (error) {
      const statusCode = Number(error?.statusCode) || 500;
      sendJson(res, statusCode >= 400 && statusCode < 600 ? statusCode : 500, {
        error: error.message || "Khong the ghep audio/video."
      });
    }
    return;
  }

  if (req.method === "GET" && req.url.startsWith("/api/download?")) {
    try {
      const base = `http://${req.headers.host || `localhost:${PORT}`}`;
      const parsed = new URL(req.url, base);
      const sourceUrl = parsed.searchParams.get("url") || "";
      const platform = String(parsed.searchParams.get("platform") || "").toLowerCase();
      const pageUrl = parsed.searchParams.get("page_url") || "";
      const filename = sanitizeFilename(parsed.searchParams.get("name"));

      if (!sourceUrl) return sendJson(res, 400, { error: "Thieu tham so url." });

      const sourceParsed = new URL(sourceUrl);
      if (!/^https?:$/i.test(sourceParsed.protocol) || isUnsafeHostname(sourceParsed.hostname)) {
        return sendJson(res, 400, { error: "Nguon tai khong hop le." });
      }

      const upstream = await fetch(sourceUrl, {
        method: "GET",
        headers: buildSourceHeaders(sourceUrl),
        redirect: "follow"
      });

      if (!upstream.ok || !upstream.body) {
        if ((upstream.status === 403 || upstream.status === 404) && platform === "tiktok" && pageUrl) {
          const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "tiktok-fallback-"));
          const outPath = path.join(tempDir, "video.mp4");
          try {
            await downloadViaYtDlpToFile(pageUrl, outPath);
            res.writeHead(200, {
              "Content-Type": "video/mp4",
              "Content-Disposition": `attachment; filename="${filename}"`,
              "Cache-Control": "no-store"
            });
            const stream = fs.createReadStream(outPath);
            stream.on("close", async () => {
              await fs.promises.rm(tempDir, { recursive: true, force: true }).catch(() => {});
            });
            stream.on("error", async () => {
              await fs.promises.rm(tempDir, { recursive: true, force: true }).catch(() => {});
              if (!res.headersSent) sendJson(res, 500, { error: "Loi doc file TikTok fallback." });
              else res.destroy();
            });
            stream.pipe(res);
            return;
          } catch (error) {
            await fs.promises.rm(tempDir, { recursive: true, force: true }).catch(() => {});
            throw error;
          }
        }
        if (upstream.status === 403 || upstream.status === 404) {
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
  console.log(`[boot] Node ${process.version}`);
  console.log(`[boot] PORT=${PORT}`);
  console.log("[boot] Mode=facebook-downloader");
  if (ffmpegExecutable) {
    console.log(`[boot] ffmpeg=${ffmpegExecutable}`);
  } else {
    console.log("[boot] ffmpeg not found (720p co tieng van tai duoc)");
  }
  console.log(`[boot] yt-dlp=${ytDlpCommand ? `${ytDlpCommand.executable}${ytDlpCommand.mode === "python_module" ? " (python -m yt_dlp)" : ""}` : "(not found)"}`);
  console.log(`[boot] yt-dlp-version=${getYtDlpVersionText()}`);
  console.log(`[boot] yt-dlp-proxy=${YTDLP_PROXY ? "static" : (PROXYXOAY_KEY ? "proxyxoay" : "off")}`);
  console.log(`[boot] yt-dlp-cookies=${ensureYtDlpCookiesFile() ? "on" : "off"}`);
  console.log(`[boot] tikwm=${TIKWM_API_BASE}`);
  console.log(`Server running at http://localhost:${PORT}`);
});





