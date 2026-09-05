// Try to load .env file if it exists
try {
  require("dotenv").config();
} catch (e) {
  console.log("dotenv not installed, using default environment variables");
}

const http = require("http");
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
