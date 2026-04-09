const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { Readable } = require("stream");
const { pipeline } = require("stream/promises");
const { spawn, spawnSync } = require("child_process");
const { URL } = require("url");

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, "public");
const RESOLVE_CACHE_TTL_MS = 60 * 1000;
const RUNTIME_TEMP_DIR = path.join(__dirname, "runtime_tmp");

const resolveCache = new Map();
const inFlightResolves = new Map();
const ffmpegExecutable = findFfmpegExecutable();
const ytDlpCommand = findYtDlpCommand();
const processJobs = new Map();

try {
  fs.mkdirSync(RUNTIME_TEMP_DIR, { recursive: true });
} catch {
  // Ignore temp-dir initialization errors.
}

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

const DEFAULT_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
  "Accept-Language": "en-US,en;q=0.9"
};

function createHttpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = Number(statusCode) || 500;
  return error;
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

function buildYtDlpResolveArgs(url, platformHint = "unknown") {
  const args = [
    "--dump-single-json",
    "--no-warnings",
    "--no-playlist"
  ];
  if (platformHint === "youtube") {
    args.push("--extractor-args", "youtube:player_client=android,web");
  }
  args.push(url);
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
  return detectPlatform(value) !== "unknown";
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

function qualityHeightOf(item) {
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
  return list;
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
    if (!bestByHeight.has(h)) bestByHeight.set(h, item);
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

function buildQualitiesFromYtDlpInfo(info) {
  const formats = Array.isArray(info?.formats) ? info.formats : [];
  const audios = formats
    .filter((f) => f && typeof f.url === "string" && f.vcodec === "none" && f.acodec && f.acodec !== "none")
    .sort((a, b) => (Number(b.abr) || 0) - (Number(a.abr) || 0));
  const bestAudio = audios[0] || null;

  const videos = [];
  for (const f of formats) {
    if (!f || typeof f.url !== "string") continue;
    const height = Number(f.height) || 0;
    if (!height) continue;
    if (!f.vcodec || f.vcodec === "none") continue;
    if (height < 720) continue;

    const hasAudio = !!(f.acodec && f.acodec !== "none");
    videos.push({
      label: `yt-dlp ${height}p`,
      quality: `${height}p`,
      url: f.url,
      width: Number(f.width) || 0,
      height,
      fps: Number(f.fps) || 0,
      watermark_status: "unknown",
      has_audio: hasAudio,
      audio_url: hasAudio ? "" : (bestAudio?.url || "")
    });
  }

  return videos;
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
  if (platform === "jimeng") return "https://sora2dl.com/jimeng";
  if (platform === "tiktok") return "https://sora2dl.com/tiktok";
  if (platform === "douyin") return "https://sora2dl.com/douyin";
  if (platform === "youtube") return "https://sora2dl.com/youtube";
  return "https://sora2dl.com/";
}

async function resolveViaSora(url, platform = "unknown") {
  if (platform === "jimeng") {
    const response = await fetch("https://sora2dl.com/apij.php", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...DEFAULT_HEADERS,
        Referer: "https://sora2dl.com/jimeng",
        Origin: "https://sora2dl.com"
      },
      body: JSON.stringify({ text: url })
    });

    if (!response.ok) {
      throw createHttpError(502, `Sora2dl Jimeng tra ve HTTP ${response.status}.`);
    }

    const json = await response.json().catch(() => null);
    const normalized = normalizeJimengSoraPayload(json);
    if (!normalized) {
      throw createHttpError(502, json?.error || "Sora2dl Jimeng khong tra du lieu hop le.");
    }
    return normalizeVideoResult(normalized, url);
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
    const args = [
      "--no-warnings",
      "--no-playlist",
      "-f", "best[ext=mp4]/best",
      "-o", outputPath,
      pageUrl
    ];
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
  });
}

async function resolveViaYtDlp(url, platformHint = "unknown") {
  if (!ytDlpCommand) return null;

  const args = buildYtDlpResolveArgs(url, platformHint);

  const { stdout } = await runCommandCapture(ytDlpCommand.executable, [...ytDlpCommand.prefixArgs, ...args]);
  let info = {};
  try {
    info = JSON.parse(stdout || "{}");
  } catch {
    throw createHttpError(502, "yt-dlp tra ve JSON khong hop le.");
  }
  const qualities = buildQualitiesFromYtDlpInfo(info);
  if (!qualities.length) return null;

  return normalizeVideoResult({
    item_id: String(info?.id || extractVideoId(url) || ""),
    title: String(info?.title || ""),
    cover_url: String(info?.thumbnail || ""),
    qualities
  }, url);
}

async function resolveFacebookVideo(url) {
  const cached = getCachedResolve(url);
  if (cached) return cached;

  const inFlight = inFlightResolves.get(url);
  if (inFlight) return inFlight;

  const job = (async () => {
    const redirect = await resolveRedirectInfo(url);
    const probes = buildProbeUrls(redirect.location);

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
  let lastError = null;

  if (platform === "unknown") {
    throw createHttpError(400, "Link khong thuoc nen tang duoc ho tro.");
  }

  if (platform === "facebook") {
    const result = await resolveFacebookVideo(normalized);
    return postProcessByPlatform({
      ...result,
      source_page_url: normalized,
      platform
    }, platform);
  }

  if (platform === "youtube") {
    try {
      const ytdlpFirst = await resolveViaYtDlp(normalized, "youtube");
      if (ytdlpFirst?.qualities?.length) {
        return postProcessByPlatform({
          ...ytdlpFirst,
          source_page_url: normalized,
          resolver: "yt_dlp",
          platform
        }, platform);
      }
    } catch (error) {
      lastError = normalizeProcessError(error, "Khong the doc du lieu YouTube bang yt-dlp.");
    }
    if (lastError) {
      throw createHttpError(Number(lastError.statusCode) || 502, lastError.message || "Khong the tai video YouTube luc nay.");
    }
    throw createHttpError(502, "Khong tim thay stream YouTube hop le.");
  }

  if (platform === "tiktok") {
    const probes = await buildTikTokProbeUrls(normalized);
    if (!probes.some((u) => isLikelyTikTokVideoUrl(u))) {
      throw createHttpError(400, "Link TikTok khong phai link video. Hay dan link co dang /video/... hoac vm.tiktok.com.");
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
    const soraJimeng = await resolveViaSora(normalized, platform);
    if (soraJimeng?.qualities?.length) {
      return postProcessByPlatform({
        ...soraJimeng,
        source_page_url: normalized,
        resolver: "sora2dl_jimeng",
        platform
      }, platform);
    }
    throw createHttpError(500, "Khong lay duoc du lieu Jimeng tu sora2dl.");
  }

  try {
    const sora = await resolveViaSora(normalized, platform);
    if (sora?.qualities?.length) {
      return postProcessByPlatform({
        ...sora,
        source_page_url: normalized,
        resolver: "sora2dl",
        platform
      }, platform);
    }
  } catch (error) {
    const normalizedError = normalizeProcessError(error, "Khong the lay du lieu tu sora2dl.");
    if (!lastError) {
      if (platform === "tiktok" && /sora2dl tra ve http 404/i.test(String(normalizedError?.message || ""))) {
        lastError = createHttpError(502, "API TikTok tam thoi loi/qua tai, vui long thu lai sau.");
      } else {
        lastError = normalizedError;
      }
    }
  }

  try {
    const ytdlp = await resolveViaYtDlp(normalized, platform);
    if (ytdlp?.qualities?.length) {
      return postProcessByPlatform({
        ...ytdlp,
        source_page_url: normalized,
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
      const url = normalizeInputUrl(typeof body.url === "string" ? body.url : "");

      if (!url) return sendJson(res, 400, { error: "Vui long nhap link video." });
      if (!isSupportedUrl(url)) {
        return sendJson(res, 400, {
          error: "Link khong duoc ho tro. Ho tro: Facebook, TikTok, Jimeng, Douyin, YouTube."
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
  console.log(`Server running at http://localhost:${PORT}`);
});
