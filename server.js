// Try to load .env file if it exists
try {
  require("dotenv").config();
} catch (e) {
  console.log("dotenv not installed, using default environment variables");
}

const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const net = require("net");
const dns = require("dns").promises;

const PORT = process.env.PORT || 3000;
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || null;

// MIME types for different file extensions
const MIME_TYPES = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "text/javascript",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".eot": "application/vnd.ms-fontobject",
  ".otf": "font/otf",
  ".txt": "text/plain",
};

// Simple in-memory rate limiter per IP (max 60 requests per 60 seconds)
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX = 60;
const rateLimitMap = new Map();

function isRateLimited(clientIp) {
  const now = Date.now();
  let entry = rateLimitMap.get(clientIp);
  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    entry = { windowStart: now, count: 1 };
    rateLimitMap.set(clientIp, entry);
    return false;
  }
  entry.count++;
  if (entry.count > RATE_LIMIT_MAX) {
    return true;
  }
  return false;
}

// Clean up stale rate limit entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateLimitMap.entries()) {
    if (now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
      rateLimitMap.delete(ip);
    }
  }
}, RATE_LIMIT_WINDOW_MS).unref();

// Concurrency & Bandwidth Exhaustion Guard (max 6 active concurrent streams per client IP)
const MAX_CONCURRENT_STREAMS_PER_IP = 6;
const MAX_STREAM_BYTES = 2 * 1024 * 1024 * 1024; // 2 GB per stream limit
const activeStreamsPerIp = new Map();

function acquireStreamSlot(clientIp) {
  const current = activeStreamsPerIp.get(clientIp) || 0;
  if (current >= MAX_CONCURRENT_STREAMS_PER_IP) {
    return false;
  }
  activeStreamsPerIp.set(clientIp, current + 1);
  return true;
}

function releaseStreamSlot(clientIp) {
  const current = activeStreamsPerIp.get(clientIp) || 0;
  if (current <= 1) {
    activeStreamsPerIp.delete(clientIp);
  } else {
    activeStreamsPerIp.set(clientIp, current - 1);
  }
}

// ============================================================
// SSRF & IP Validation Helpers
// ============================================================
function isPrivateOrReservedIPv4(ip) {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) {
    return true;
  }

  const [a, b, c, d] = parts;

  // 0.0.0.0/8 - Current network ("this" network)
  if (a === 0) return true;

  // 10.0.0.0/8 - Private-Use
  if (a === 10) return true;

  // 100.64.0.0/10 - Shared Address Space (Carrier-Grade NAT)
  if (a === 100 && b >= 64 && b <= 127) return true;

  // 127.0.0.0/8 - Loopback
  if (a === 127) return true;

  // 169.254.0.0/16 - Link-Local (includes 169.254.169.254 cloud metadata)
  if (a === 169 && b === 254) return true;

  // 172.16.0.0/12 - Private-Use (172.16.0.0 - 172.31.255.255)
  if (a === 172 && b >= 16 && b <= 31) return true;

  // 192.0.0.0/24 - IETF Protocol Assignments
  if (a === 192 && b === 0 && c === 0) return true;

  // 192.0.2.0/24 - TEST-NET-1 (Documentation)
  if (a === 192 && b === 0 && c === 2) return true;

  // 192.168.0.0/16 - Private-Use
  if (a === 192 && b === 168) return true;

  // 198.18.0.0/15 - Benchmarking
  if (a === 198 && (b === 18 || b === 19)) return true;

  // 198.51.100.0/24 - TEST-NET-2 (Documentation)
  if (a === 198 && b === 51 && c === 100) return true;

  // 203.0.113.0/24 - TEST-NET-3 (Documentation)
  if (a === 203 && b === 0 && c === 113) return true;

  // 224.0.0.0/4 - Multicast
  if (a >= 224 && a <= 239) return true;

  // 240.0.0.0/4 - Reserved for Future Use
  if (a >= 240) return true;

  // 255.255.255.255 - Broadcast
  if (a === 255 && b === 255 && c === 255 && d === 255) return true;

  return false;
}

function isPrivateOrReservedIPv6(ip) {
  const norm = ip.toLowerCase();

  // IPv4-mapped IPv6 addresses (::ffff:x.x.x.x)
  if (norm.startsWith("::ffff:")) {
    const v4 = norm.slice(7);
    if (net.isIPv4(v4)) {
      return isPrivateOrReservedIPv4(v4);
    }
  }

  // Unspecified ::
  if (norm === "::" || norm === "0:0:0:0:0:0:0:0") return true;

  // Loopback ::1
  if (norm === "::1" || norm === "0:0:0:0:0:0:0:1") return true;

  // Unique Local Address fc00::/7 (fc.. or fd..)
  if (norm.startsWith("fc") || norm.startsWith("fd")) return true;

  // Link-Local fe80::/10
  if (/^fe[89ab]/i.test(norm)) return true;

  // Multicast ff00::/8
  if (norm.startsWith("ff")) return true;

  // Documentation 2001:db8::/32
  if (norm.startsWith("2001:db8:") || norm.startsWith("2001:0db8:")) return true;

  // Discard prefix 100::/64
  if (norm.startsWith("100:")) return true;

  return false;
}

function isPrivateOrReservedIP(ip) {
  if (!ip || typeof ip !== "string") return true;

  if (net.isIPv4(ip)) {
    return isPrivateOrReservedIPv4(ip);
  }

  if (net.isIPv6(ip)) {
    return isPrivateOrReservedIPv6(ip);
  }

  return true;
}

// Compute safe CORS headers based on request origin
function getCorsHeaders(req) {
  const origin = req.headers.origin;
  const host = req.headers.host;
  let allowed = "";

  if (ALLOWED_ORIGIN) {
    if (ALLOWED_ORIGIN === "*" || origin === ALLOWED_ORIGIN) {
      allowed = origin || ALLOWED_ORIGIN;
    }
  } else if (origin) {
    try {
      const parsedOrigin = new URL(origin);
      if (
        parsedOrigin.host === host ||
        parsedOrigin.hostname === "localhost" ||
        parsedOrigin.hostname === "127.0.0.1"
      ) {
        allowed = origin;
      }
    } catch (e) {}
  }

  // Default fallback to same origin / current host
  if (!allowed) {
    allowed = host ? `http://${host}` : "";
  }

  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
    "Access-Control-Allow-Headers": "Range, Content-Type, Accept",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

// Validate target URL and pre-resolve DNS safely
async function validateAndResolveUrl(urlStr) {
  let parsed;
  try {
    parsed = new URL(urlStr);
  } catch (e) {
    return { error: "Invalid URL syntax", status: 400 };
  }

  // Reject credential-bearing URLs (e.g. user:password@host)
  if (parsed.username || parsed.password) {
    return {
      error: "Credential-bearing URLs (user:password@host) are prohibited",
      status: 400,
    };
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { error: "Only HTTP and HTTPS protocols are supported", status: 400 };
  }

  // Enforce standard web ports only
  const port = parsed.port
    ? parseInt(parsed.port, 10)
    : parsed.protocol === "https:"
    ? 443
    : 80;
  if (port !== 80 && port !== 443) {
    return { error: `Restricted port: ${port}. Only ports 80 and 443 are allowed.`, status: 403 };
  }

  const hostname = parsed.hostname;
  if (!hostname) {
    return { error: "Missing hostname", status: 400 };
  }

  const lowerHost = hostname.toLowerCase();
  if (
    lowerHost === "localhost" ||
    lowerHost.endsWith(".local") ||
    lowerHost.endsWith(".internal") ||
    lowerHost.endsWith(".localhost")
  ) {
    return { error: "Access to internal domain is forbidden", status: 403 };
  }

  // If host is already an IP address
  if (net.isIP(hostname)) {
    if (isPrivateOrReservedIP(hostname)) {
      return { error: "Access to private or reserved IP addresses is forbidden", status: 403 };
    }
    return { parsed, resolvedIp: hostname, port };
  }

  // Pre-resolve DNS records
  try {
    const records = await dns.lookup(hostname, { all: true });
    if (!records || records.length === 0) {
      return { error: "DNS resolution failed: no records found", status: 502 };
    }

    // Verify all resolved IPs are safe and public
    for (const record of records) {
      if (isPrivateOrReservedIP(record.address)) {
        return {
          error: `Target domain resolves to restricted address: ${record.address}`,
          status: 403,
        };
      }
    }

    return { parsed, resolvedIp: records[0].address, port };
  } catch (err) {
    return { error: `DNS resolution failed: ${err.message}`, status: 502 };
  }
}

// Allowed MIME types for video/audio proxy
const ALLOWED_CONTENT_TYPES = [
  "video/",
  "audio/",
  "application/vnd.apple.mpegurl",
  "application/x-mpegurl",
  "application/dash+xml",
  "application/ogg",
  "application/octet-stream", // Some video CDNs deliver mp4 with octet-stream
];

function isAllowedContentType(contentType) {
  if (!contentType) return true; // Will check stream or default
  const lower = contentType.toLowerCase();
  return ALLOWED_CONTENT_TYPES.some((prefix) => lower.startsWith(prefix));
}

// Proxy handler for external video URLs
function handleVideoProxy(req, res, reqUrl) {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    res.writeHead(204, corsHeaders);
    return res.end();
  }

  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, { "Content-Type": "text/plain", ...corsHeaders });
    return res.end("Method Not Allowed");
  }

  // Rate limiting
  const clientIp =
    req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
    req.socket.remoteAddress ||
    "127.0.0.1";
  if (isRateLimited(clientIp)) {
    res.writeHead(429, { "Content-Type": "text/plain", ...corsHeaders });
    return res.end("Too Many Requests: Rate limit exceeded for video proxy");
  }

  // Concurrency & bandwidth guard: limit simultaneous streams per client IP
  if (!acquireStreamSlot(clientIp)) {
    res.writeHead(429, { "Content-Type": "text/plain", ...corsHeaders });
    return res.end("Too Many Concurrent Requests: Max 6 active streams per IP");
  }

  let slotReleased = false;
  function cleanupSlot() {
    if (!slotReleased) {
      slotReleased = true;
      releaseStreamSlot(clientIp);
    }
  }

  res.on("close", cleanupSlot);
  res.on("finish", cleanupSlot);

  const targetUrl = reqUrl.searchParams.get("url");
  if (!targetUrl) {
    cleanupSlot();
    res.writeHead(400, { "Content-Type": "text/plain", ...corsHeaders });
    return res.end("Missing 'url' query parameter");
  }

  async function fetchProxy(currentUrl, redirectCount = 0) {
    if (redirectCount > 3) {
      cleanupSlot();
      res.writeHead(508, { "Content-Type": "text/plain", ...corsHeaders });
      return res.end("Too many redirects");
    }

    const validation = await validateAndResolveUrl(currentUrl);
    if (validation.error) {
      cleanupSlot();
      res.writeHead(validation.status || 400, {
        "Content-Type": "text/plain",
        ...corsHeaders,
      });
      return res.end(validation.error);
    }

    const { parsed, resolvedIp, port } = validation;
    const client = parsed.protocol === "https:" ? https : http;

    const reqHeaders = {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 MovieNight/1.0",
      "Accept": "*/*",
      "Host": parsed.host,
    };
    if (req.headers["range"]) {
      reqHeaders["range"] = req.headers["range"];
    }

    // Connect directly to the validated IP to prevent DNS rebinding
    const requestOptions = {
      protocol: parsed.protocol,
      hostname: parsed.hostname,
      port: port,
      path: parsed.pathname + parsed.search,
      method: req.method,
      headers: reqHeaders,
      timeout: 10000,
      lookup: (hostname, options, callback) => {
        const family = net.isIPv4(resolvedIp) ? 4 : 6;
        callback(null, resolvedIp, family);
      },
    };

    const proxyReq = client.request(requestOptions, (proxyRes) => {
      // Validate and follow redirects (301, 302, 303, 307, 308)
      if (
        proxyRes.statusCode >= 300 &&
        proxyRes.statusCode < 400 &&
        proxyRes.headers.location
      ) {
        proxyReq.destroy();
        let nextUrl;
        try {
          nextUrl = new URL(proxyRes.headers.location, parsed).href;
        } catch (e) {
          cleanupSlot();
          res.writeHead(400, { "Content-Type": "text/plain", ...corsHeaders });
          return res.end("Invalid redirect location");
        }
        return fetchProxy(nextUrl, redirectCount + 1);
      }

      // Content-Type validation to prevent data exfiltration of internal JSON/HTML/text
      const contentType = proxyRes.headers["content-type"] || "";
      if (proxyRes.statusCode === 200 && !isAllowedContentType(contentType)) {
        proxyReq.destroy();
        cleanupSlot();
        res.writeHead(415, { "Content-Type": "text/plain", ...corsHeaders });
        return res.end(
          `Unsupported Media Type: Proxy only allows audio/video content (got: ${contentType})`,
        );
      }

      // Check for oversized responses
      if (proxyRes.headers["content-length"]) {
        const cl = parseInt(proxyRes.headers["content-length"], 10);
        if (!isNaN(cl) && cl > MAX_STREAM_BYTES) {
          proxyReq.destroy();
          cleanupSlot();
          res.writeHead(413, { "Content-Type": "text/plain", ...corsHeaders });
          return res.end("Payload Too Large: Stream exceeds 2GB limit");
        }
      }

      // Idle read timeout protection against slow responses
      proxyRes.setTimeout(15000, () => {
        proxyReq.destroy();
        cleanupSlot();
      });

      // Stream byte counter protection against unbounded chunked responses
      let streamedBytes = 0;
      proxyRes.on("data", (chunk) => {
        streamedBytes += chunk.length;
        if (streamedBytes > MAX_STREAM_BYTES) {
          proxyReq.destroy();
          cleanupSlot();
          res.destroy();
        }
      });

      const resHeaders = {
        ...corsHeaders,
        "Content-Type": contentType || "video/mp4",
        "X-Content-Type-Options": "nosniff",
      };
      if (proxyRes.headers["content-length"]) {
        resHeaders["Content-Length"] = proxyRes.headers["content-length"];
      }
      if (proxyRes.headers["content-range"]) {
        resHeaders["Content-Range"] = proxyRes.headers["content-range"];
      }
      if (proxyRes.headers["accept-ranges"]) {
        resHeaders["Accept-Ranges"] = proxyRes.headers["accept-ranges"];
      }

      res.writeHead(proxyRes.statusCode, resHeaders);
      proxyRes.pipe(res);
    });

    proxyReq.on("timeout", () => {
      proxyReq.destroy();
      cleanupSlot();
      if (!res.headersSent) {
        res.writeHead(504, { "Content-Type": "text/plain", ...corsHeaders });
        res.end("Video proxy gateway timeout");
      }
    });

    proxyReq.on("error", (err) => {
      cleanupSlot();
      console.error("Proxy video error:", err.message);
      if (!res.headersSent) {
        res.writeHead(502, { "Content-Type": "text/plain", ...corsHeaders });
        res.end("Video proxy error: " + err.message);
      }
    });

    req.on("close", () => {
      cleanupSlot();
      proxyReq.destroy();
    });

    proxyReq.end();
  }

  fetchProxy(targetUrl);
}

// Create the HTTP server
const server = http.createServer((req, res) => {
  // Check for path traversal sequences in raw request URL
  let rawDecoded = "";
  try {
    rawDecoded = decodeURIComponent(req.url);
  } catch (e) {
    res.writeHead(400, { "Content-Type": "text/plain", "X-Content-Type-Options": "nosniff" });
    return res.end("Bad Request");
  }

  if (rawDecoded.includes("..") || rawDecoded.includes(".\\") || rawDecoded.includes("./")) {
    res.writeHead(403, { "Content-Type": "text/plain", "X-Content-Type-Options": "nosniff" });
    return res.end("403 Forbidden");
  }

  // Parse URL safely to extract pathname without query params or hash fragments
  let reqUrl;
  try {
    reqUrl = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  } catch (e) {
    res.writeHead(400, { "Content-Type": "text/plain", "X-Content-Type-Options": "nosniff" });
    return res.end("Bad Request");
  }

  // Handle video streaming proxy endpoint
  if (reqUrl.pathname === "/proxy-video") {
    return handleVideoProxy(req, res, reqUrl);
  }

  let pathname = decodeURIComponent(reqUrl.pathname);
  if (pathname === "/") {
    pathname = "/index.html";
  }

  // Resolve absolute file path to prevent directory traversal
  const rootDir = path.resolve(__dirname);
  const safePath = path.resolve(rootDir, "." + pathname);

  // Security check: ensure target path is strictly within project root
  if (!safePath.startsWith(rootDir)) {
    res.writeHead(403, { "Content-Type": "text/plain", "X-Content-Type-Options": "nosniff" });
    return res.end("403 Forbidden");
  }

  const extname = path.extname(safePath);
  const contentType = MIME_TYPES[extname] || "application/octet-stream";

  const headers = {
    "Content-Type": contentType,
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "SAMEORIGIN",
  };

  fs.readFile(safePath, (error, content) => {
    if (error) {
      if (error.code === "ENOENT" || error.code === "EISDIR") {
        fs.readFile(path.join(__dirname, "404.html"), (err, content404) => {
          if (err) {
            res.writeHead(404, { "Content-Type": "text/plain", "X-Content-Type-Options": "nosniff" });
            res.end("404 Not Found");
          } else {
            res.writeHead(404, { "Content-Type": "text/html", "X-Content-Type-Options": "nosniff" });
            res.end(content404, "utf-8");
          }
        });
      } else {
        res.writeHead(500, { "Content-Type": "text/plain", "X-Content-Type-Options": "nosniff" });
        res.end(`Server Error: ${error.code}`);
      }
    } else {
      res.writeHead(200, headers);
      res.end(content, "utf-8");
    }
  });
});

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}/`);
    console.log("Press Ctrl+C to stop the server");
  });
}

module.exports = {
  server,
  isPrivateOrReservedIP,
  isPrivateOrReservedIPv4,
  isPrivateOrReservedIPv6,
  validateAndResolveUrl,
  getCorsHeaders,
  isAllowedContentType,
  handleVideoProxy,
  acquireStreamSlot,
  releaseStreamSlot,
  MAX_CONCURRENT_STREAMS_PER_IP,
  MAX_STREAM_BYTES,
};
