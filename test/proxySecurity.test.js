const test = require("node:test");
const assert = require("node:assert/strict");
const {
  isPrivateOrReservedIP,
  isPrivateOrReservedIPv4,
  isPrivateOrReservedIPv6,
  validateAndResolveUrl,
  getCorsHeaders,
  isAllowedContentType,
  handleVideoProxy,
  acquireStreamSlot,
  releaseStreamSlot,
  isHostAllowed,
  validateRangeHeader,
  isTargetHostRateLimited,
  sanitizeResponseHeaders,
  ENABLE_VIDEO_PROXY,
  ALLOWED_PROXY_HOSTS,
  MAX_CONCURRENT_STREAMS_PER_IP,
  MAX_TOTAL_CONCURRENT_STREAMS,
  MAX_STREAM_BYTES,
} = require("../server.js");

test("SSRF Protection - IPv4 Blocklist Checks", () => {
  // Loopback
  assert.equal(isPrivateOrReservedIPv4("127.0.0.1"), true);
  assert.equal(isPrivateOrReservedIPv4("127.0.1.1"), true);

  // Cloud Metadata (AWS, GCP, Azure link-local)
  assert.equal(isPrivateOrReservedIPv4("169.254.169.254"), true);
  assert.equal(isPrivateOrReservedIPv4("169.254.1.1"), true);

  // RFC 1918 Private Ranges
  assert.equal(isPrivateOrReservedIPv4("10.0.0.1"), true);
  assert.equal(isPrivateOrReservedIPv4("10.255.255.255"), true);
  assert.equal(isPrivateOrReservedIPv4("172.16.0.1"), true);
  assert.equal(isPrivateOrReservedIPv4("172.31.255.255"), true);
  assert.equal(isPrivateOrReservedIPv4("192.168.0.1"), true);
  assert.equal(isPrivateOrReservedIPv4("192.168.1.254"), true);

  // Carrier-Grade NAT (RFC 6598)
  assert.equal(isPrivateOrReservedIPv4("100.64.0.1"), true);
  assert.equal(isPrivateOrReservedIPv4("100.127.255.255"), true);

  // Broadcast & Zero network
  assert.equal(isPrivateOrReservedIPv4("0.0.0.0"), true);
  assert.equal(isPrivateOrReservedIPv4("255.255.255.255"), true);

  // Multicast & Reserved
  assert.equal(isPrivateOrReservedIPv4("224.0.0.1"), true);
  assert.equal(isPrivateOrReservedIPv4("240.0.0.1"), true);

  // Documentation / Benchmark
  assert.equal(isPrivateOrReservedIPv4("192.0.2.1"), true);
  assert.equal(isPrivateOrReservedIPv4("198.51.100.1"), true);
  assert.equal(isPrivateOrReservedIPv4("203.0.113.1"), true);
  assert.equal(isPrivateOrReservedIPv4("198.18.0.1"), true);

  // Valid Public IPs
  assert.equal(isPrivateOrReservedIPv4("8.8.8.8"), false);
  assert.equal(isPrivateOrReservedIPv4("1.1.1.1"), false);
  assert.equal(isPrivateOrReservedIPv4("93.184.216.34"), false);
});

test("SSRF Protection - IPv6 Blocklist Checks", () => {
  // Loopback
  assert.equal(isPrivateOrReservedIPv6("::1"), true);
  assert.equal(isPrivateOrReservedIPv6("0:0:0:0:0:0:0:1"), true);

  // Unspecified
  assert.equal(isPrivateOrReservedIPv6("::"), true);

  // Unique Local Address fc00::/7
  assert.equal(isPrivateOrReservedIPv6("fc00::1"), true);
  assert.equal(isPrivateOrReservedIPv6("fd12:3456:789a::1"), true);

  // Link-Local fe80::/10
  assert.equal(isPrivateOrReservedIPv6("fe80::1"), true);
  assert.equal(isPrivateOrReservedIPv6("febf::ffff"), true);

  // Multicast ff00::/8
  assert.equal(isPrivateOrReservedIPv6("ff02::1"), true);

  // IPv4-mapped IPv6 pointing to private addresses
  assert.equal(isPrivateOrReservedIP("::ffff:127.0.0.1"), true);
  assert.equal(isPrivateOrReservedIP("::ffff:169.254.169.254"), true);
  assert.equal(isPrivateOrReservedIP("::ffff:192.168.1.1"), true);

  // IPv4-mapped IPv6 pointing to public address
  assert.equal(isPrivateOrReservedIP("::ffff:8.8.8.8"), false);
});

test("SSRF Protection - Protocol & Port Restrictions", async () => {
  // Disallowed protocols
  const ftpRes = await validateAndResolveUrl("ftp://example.com/video.mp4");
  assert.equal(ftpRes.status, 400);

  const fileRes = await validateAndResolveUrl("file:///etc/passwd");
  assert.equal(fileRes.status, 400);

  // Disallowed non-standard ports
  const sshRes = await validateAndResolveUrl("http://example.com:22/video.mp4");
  assert.equal(sshRes.status, 403);
  assert.match(sshRes.error, /Restricted port/);

  const redisRes = await validateAndResolveUrl("http://example.com:6379/");
  assert.equal(redisRes.status, 403);

  const altHttpRes = await validateAndResolveUrl("http://example.com:8080/video.mp4");
  assert.equal(altHttpRes.status, 403);

  // Insecure HTTP rejected by default
  const insecureRes = await validateAndResolveUrl("http://1.1.1.1:80/test");
  assert.equal(insecureRes.status, 403);
  assert.match(insecureRes.error, /Insecure HTTP proxying is disabled/);

  // Allowed ports (80 and 443)
  const httpsPort = await validateAndResolveUrl("https://1.1.1.1:443/test");
  assert.equal(httpsPort.port, 443);
  assert.equal(httpsPort.resolvedIp, "1.1.1.1");

  const httpPort = await validateAndResolveUrl("http://1.1.1.1:80/test", { allowInsecureHttp: true });
  assert.equal(httpPort.port, 80);
  assert.equal(httpPort.resolvedIp, "1.1.1.1");
});

test("SSRF Protection - Hostname & Direct IP Rejection", async () => {
  // Localhost domains
  const localhostRes = await validateAndResolveUrl("http://localhost/video.mp4");
  assert.equal(localhostRes.status, 403);

  const localRes = await validateAndResolveUrl("http://myrouter.local/video.mp4");
  assert.equal(localRes.status, 403);

  // Direct private IP addresses in URL
  const metaRes = await validateAndResolveUrl("http://169.254.169.254/latest/meta-data/");
  assert.equal(metaRes.status, 403);

  const privRes = await validateAndResolveUrl("http://192.168.1.1/video.mp4");
  assert.equal(privRes.status, 403);

  const loopRes = await validateAndResolveUrl("http://127.0.0.1/video.mp4");
  assert.equal(loopRes.status, 403);
});

test("Proxy CORS - Restricts Wildcard Origins", () => {
  // Request without origin from localhost host
  const req1 = { headers: { host: "localhost:3000" } };
  const cors1 = getCorsHeaders(req1);
  assert.notEqual(cors1["Access-Control-Allow-Origin"], "*");
  assert.equal(cors1["Access-Control-Allow-Origin"], "http://localhost:3000");

  // Same-origin request
  const req2 = {
    headers: {
      host: "localhost:3000",
      origin: "http://localhost:3000",
    },
  };
  const cors2 = getCorsHeaders(req2);
  assert.equal(cors2["Access-Control-Allow-Origin"], "http://localhost:3000");

  // Foreign arbitrary origin
  const req3 = {
    headers: {
      host: "movienight.example.com",
      origin: "http://evil-attacker.com",
    },
  };
  const cors3 = getCorsHeaders(req3);
  assert.notEqual(cors3["Access-Control-Allow-Origin"], "http://evil-attacker.com");
  assert.notEqual(cors3["Access-Control-Allow-Origin"], "*");
});

test("Proxy Content-Type - Only Permits Media Types", () => {
  assert.equal(isAllowedContentType("video/mp4"), true);
  assert.equal(isAllowedContentType("video/webm"), true);
  assert.equal(isAllowedContentType("audio/mpeg"), true);
  assert.equal(isAllowedContentType("application/vnd.apple.mpegurl"), true);
  assert.equal(isAllowedContentType("application/x-mpegURL"), true);
  assert.equal(isAllowedContentType("application/dash+xml"), true);
  assert.equal(isAllowedContentType("application/octet-stream"), true);

  // Dangerous / Data exfiltration types blocked
  assert.equal(isAllowedContentType("text/html; charset=utf-8"), false);
  assert.equal(isAllowedContentType("application/json"), false);
  assert.equal(isAllowedContentType("text/plain"), false);
  assert.equal(isAllowedContentType("image/svg+xml"), false);
  assert.equal(isAllowedContentType("application/javascript"), false);
});

test("Proxy Security - Rejects Credential-Bearing URLs", async () => {
  const credRes1 = await validateAndResolveUrl("http://admin:password@example.com/video.mp4");
  assert.equal(credRes1.status, 400);
  assert.match(credRes1.error, /Credential-bearing URLs/);

  const credRes2 = await validateAndResolveUrl("https://user@example.com/video.mp4");
  assert.equal(credRes2.status, 400);
  assert.match(credRes2.error, /Credential-bearing URLs/);
});

test("Proxy Security - Concurrency & Stream Slot Limiting", () => {
  const {
    acquireStreamSlot,
    releaseStreamSlot,
    MAX_CONCURRENT_STREAMS_PER_IP,
    MAX_STREAM_BYTES,
  } = require("../server.js");

  const testIp = "203.0.113.99";

  // Acquire up to MAX_CONCURRENT_STREAMS_PER_IP (6)
  for (let i = 0; i < MAX_CONCURRENT_STREAMS_PER_IP; i++) {
    assert.equal(acquireStreamSlot(testIp), true);
  }

  // 7th attempt must fail with false
  assert.equal(acquireStreamSlot(testIp), false);

  // Release one slot
  releaseStreamSlot(testIp);

  // Now an acquisition succeeds
  assert.equal(acquireStreamSlot(testIp), true);

  // Clean up all slots for testIp
  for (let i = 0; i < MAX_CONCURRENT_STREAMS_PER_IP; i++) {
    releaseStreamSlot(testIp);
  }

  // Verify MAX_STREAM_BYTES is configured to 2 GB
  assert.equal(MAX_STREAM_BYTES, 2 * 1024 * 1024 * 1024);
});

test("Proxy Security - Default Disabled Returns 503", () => {
  const req = {
    method: "GET",
    headers: { host: "localhost:3000" },
    socket: { remoteAddress: "127.0.0.1" },
  };
  let statusCode = null;
  let responseData = "";
  const res = {
    writeHead: (code, headers) => {
      statusCode = code;
    },
    end: (data) => {
      responseData = data || "";
    },
    on: () => {},
  };
  const reqUrl = new URL("http://localhost:3000/proxy-video?url=https://commondatastorage.googleapis.com/video.mp4");
  handleVideoProxy(req, res, reqUrl);

  assert.equal(statusCode, 503);
  assert.match(responseData, /disabled by default/);
});

test("Proxy Security - Host Allowlist Matching", () => {
  const allowlist = ["commondatastorage.googleapis.com", "*.mycdn.com", "media.sub.example.com"];

  // Exact match
  assert.equal(isHostAllowed("commondatastorage.googleapis.com", allowlist), true);
  assert.equal(isHostAllowed("COMMONDATASTORAGE.GOOGLEAPIS.COM", allowlist), true); // case-insensitive

  // Wildcard subdomain match
  assert.equal(isHostAllowed("video.mycdn.com", allowlist), true);
  assert.equal(isHostAllowed("mycdn.com", allowlist), true);
  assert.equal(isHostAllowed("sub.stream.mycdn.com", allowlist), true);

  // Disallowed / Unlisted domains
  assert.equal(isHostAllowed("evil.com", allowlist), false);
  assert.equal(isHostAllowed("notmycdn.com", allowlist), false);
  assert.equal(isHostAllowed("googleapis.com", allowlist), false);
  assert.equal(isHostAllowed("localhost", allowlist), false);

  // Blanket wildcard is rejected as insecure
  assert.equal(isHostAllowed("evil.com", ["*"]), false);
});

test("Proxy Security - Host Allowlist Enforcement in URL Validation", async () => {
  const allowed = ["commondatastorage.googleapis.com", "*.mycdn.com"];

  // Disallowed unlisted host
  const blocked = await validateAndResolveUrl("https://evil-unlisted-host.com/video.mp4", {
    requireAllowlist: true,
    allowedHosts: allowed,
  });
  assert.equal(blocked.status, 403);
  assert.match(blocked.error, /not in the allowed proxy host list/);

  // Direct IP host when allowlist is required and not listed
  const blockedIp = await validateAndResolveUrl("https://93.184.216.34/video.mp4", {
    requireAllowlist: true,
    allowedHosts: allowed,
  });
  assert.equal(blockedIp.status, 403);
  assert.match(blockedIp.error, /not in the allowed proxy host list/);
});

test("Proxy Security - Range Header Abuse & Multipart Prevention", () => {
  // Valid single ranges
  assert.deepEqual(validateRangeHeader("bytes=0-1024"), { valid: true, sanitized: "bytes=0-1024" });
  assert.deepEqual(validateRangeHeader("bytes=500-"), { valid: true, sanitized: "bytes=500-" });
  assert.deepEqual(validateRangeHeader("bytes=-500"), { valid: true, sanitized: "bytes=-500" });
  assert.deepEqual(validateRangeHeader(null), { valid: true, sanitized: null });

  // Multipart range attacks (e.g. CVE-2011-3192 Range Amplification)
  const multiRes = validateRangeHeader("bytes=0-10,20-30,40-50");
  assert.equal(multiRes.valid, false);
  assert.match(multiRes.error, /Multipart range requests are not permitted/);

  // Start byte greater than end byte
  const invertedRes = validateRangeHeader("bytes=5000-1000");
  assert.equal(invertedRes.valid, false);
  assert.match(invertedRes.error, /Unsatisfiable Range/);

  // Malformed non-numeric or corrupt range syntax
  const malformed1 = validateRangeHeader("bytes=foo-bar");
  assert.equal(malformed1.valid, false);

  const malformed2 = validateRangeHeader("items=0-10");
  assert.equal(malformed2.valid, false);
});

test("Proxy Security - Target Host Rate Limiting", () => {
  const host = "cdn.specific-target.com";
  // The first 30 calls should not be rate limited
  for (let i = 0; i < 30; i++) {
    assert.equal(isTargetHostRateLimited(host), false);
  }
  // 31st call within window triggers rate limit
  assert.equal(isTargetHostRateLimited(host), true);
});

test("Proxy Security - Response Header Sanitization", () => {
  const upstreamHeaders = {
    "content-type": "video/mp4",
    "content-length": "1048576",
    "content-range": "bytes 0-1048575/1048576",
    "accept-ranges": "bytes",
    "cache-control": "public, max-age=86400",
    "etag": "\"123456789\"",
    "last-modified": "Wed, 21 Oct 2026 07:28:00 GMT",
    // Sensitive / fingerprinting headers that MUST be dropped:
    "set-cookie": "session=sensitive_token_leak; Path=/",
    "server": "Apache/2.4.41 (Ubuntu)",
    "x-powered-by": "PHP/8.1",
    "via": "1.1 varnish",
    "x-amz-request-id": "XYZ123456",
    "x-internal-secret": "internal_value",
  };

  const corsHeaders = {
    "Access-Control-Allow-Origin": "http://localhost:3000",
    "Vary": "Origin",
  };

  const sanitized = sanitizeResponseHeaders(upstreamHeaders, corsHeaders);

  // Permitted media headers
  assert.equal(sanitized["Content-Type"], "video/mp4");
  assert.equal(sanitized["Content-Length"], "1048576");
  assert.equal(sanitized["Content-Range"], "bytes 0-1048575/1048576");
  assert.equal(sanitized["Accept-Ranges"], "bytes");
  assert.equal(sanitized["Cache-Control"], "public, max-age=86400");
  assert.equal(sanitized["ETag"], "\"123456789\"");
  assert.equal(sanitized["Last-Modified"], "Wed, 21 Oct 2026 07:28:00 GMT");
  assert.equal(sanitized["X-Content-Type-Options"], "nosniff");
  assert.equal(sanitized["Access-Control-Allow-Origin"], "http://localhost:3000");

  // Disallowed sensitive headers are stripped
  assert.equal(sanitized["set-cookie"], undefined);
  assert.equal(sanitized["Set-Cookie"], undefined);
  assert.equal(sanitized["server"], undefined);
  assert.equal(sanitized["Server"], undefined);
  assert.equal(sanitized["x-powered-by"], undefined);
  assert.equal(sanitized["X-Powered-By"], undefined);
  assert.equal(sanitized["via"], undefined);
  assert.equal(sanitized["Via"], undefined);
  assert.equal(sanitized["x-amz-request-id"], undefined);
  assert.equal(sanitized["x-internal-secret"], undefined);
});

test("Proxy Security - Redirect Target Revalidation Rejects Disallowed Targets", async () => {
  // If a redirect points to a private IP or metadata address
  const redirPrivate = await validateAndResolveUrl("http://169.254.169.254/meta", {
    allowInsecureHttp: true,
  });
  assert.equal(redirPrivate.status, 403);

  // If a redirect points to an unlisted host when allowlist is required
  const redirUnlisted = await validateAndResolveUrl("https://unauthorized-redirect.com/video.mp4", {
    requireAllowlist: true,
    allowedHosts: ["trusted-cdn.com"],
  });
  assert.equal(redirUnlisted.status, 403);
  assert.match(redirUnlisted.error, /not in the allowed proxy host list/);

  // If a redirect attempts protocol downgrade to http without insecure flag
  const redirInsecure = await validateAndResolveUrl("http://trusted-cdn.com/video.mp4", {
    requireAllowlist: true,
    allowedHosts: ["trusted-cdn.com"],
    allowInsecureHttp: false,
  });
  assert.equal(redirInsecure.status, 403);
  assert.match(redirInsecure.error, /Insecure HTTP proxying is disabled/);
});

test("Proxy Security - Global Concurrency Guard", () => {
  assert.equal(MAX_TOTAL_CONCURRENT_STREAMS, 30);
});

