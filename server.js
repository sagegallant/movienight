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
const PORT = process.env.PORT || 3000;

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

// Create a simple HTTP server
const server = http.createServer((req, res) => {
  console.log(`${req.method} ${req.url}`);

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

  // Handle video streaming proxy endpoint for WebRTC group watching
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

  // Get the file extension
  const extname = path.extname(safePath);
  let contentType = MIME_TYPES[extname] || "application/octet-stream";

  // Common security headers
  const headers = {
    "Content-Type": contentType,
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "SAMEORIGIN",
  };

  // Read the file
  fs.readFile(safePath, (error, content) => {
    if (error) {
      if (error.code === "ENOENT" || error.code === "EISDIR") {
        // File not found, serve 404 page
        fs.readFile(path.join(__dirname, "404.html"), (err, content404) => {
          if (err) {
            // If 404 page is not found, send plain text
            res.writeHead(404, { "Content-Type": "text/plain", "X-Content-Type-Options": "nosniff" });
            res.end("404 Not Found");
          } else {
            res.writeHead(404, { "Content-Type": "text/html", "X-Content-Type-Options": "nosniff" });
            res.end(content404, "utf-8");
          }
        });
      } else {
        // Server error
        res.writeHead(500, { "Content-Type": "text/plain", "X-Content-Type-Options": "nosniff" });
        res.end(`Server Error: ${error.code}`);
      }
    } else {
      // Successful response
      res.writeHead(200, headers);
      res.end(content, "utf-8");
    }
  });
});

// Start the server
server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}/`);
  console.log("Press Ctrl+C to stop the server");
});

// Proxy handler for external video URLs so they can be captured via WebRTC captureStream()
function handleVideoProxy(req, res, reqUrl) {
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
      "Access-Control-Allow-Headers": "Range, Content-Type, Accept",
    });
    return res.end();
  }

  const targetUrl = reqUrl.searchParams.get("url");
  if (!targetUrl) {
    res.writeHead(400, { "Content-Type": "text/plain", "Access-Control-Allow-Origin": "*" });
    return res.end("Missing 'url' query parameter");
  }

  function fetchProxy(urlStr, redirectCount = 0) {
    if (redirectCount > 5) {
      res.writeHead(508, { "Content-Type": "text/plain", "Access-Control-Allow-Origin": "*" });
      return res.end("Too many redirects");
    }

    let parsed;
    try {
      parsed = new URL(urlStr);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        throw new Error("Invalid protocol");
      }
    } catch (err) {
      res.writeHead(400, { "Content-Type": "text/plain", "Access-Control-Allow-Origin": "*" });
      return res.end("Invalid target URL");
    }

    const client = parsed.protocol === "https:" ? https : http;
    const reqHeaders = {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept": "*/*",
    };
    if (req.headers["range"]) {
      reqHeaders["range"] = req.headers["range"];
    }

    const proxyReq = client.get(parsed, { headers: reqHeaders }, (proxyRes) => {
      // Follow redirects (301, 302, 307, 308)
      if (proxyRes.statusCode >= 300 && proxyRes.statusCode < 400 && proxyRes.headers.location) {
        const nextUrl = new URL(proxyRes.headers.location, parsed).href;
        return fetchProxy(nextUrl, redirectCount + 1);
      }

      const resHeaders = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
        "Access-Control-Allow-Headers": "Range, Content-Type, Accept",
        "Content-Type": proxyRes.headers["content-type"] || "video/mp4",
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

    proxyReq.on("error", (err) => {
      console.error("Proxy video error:", err.message);
      if (!res.headersSent) {
        res.writeHead(502, { "Content-Type": "text/plain", "Access-Control-Allow-Origin": "*" });
        res.end("Video proxy error: " + err.message);
      }
    });

    req.on("close", () => {
      proxyReq.destroy();
    });
  }

  fetchProxy(targetUrl);
}

