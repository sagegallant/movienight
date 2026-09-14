const test = require("node:test");
const assert = require("node:assert/strict");
const {
  isPrivateOrReservedIP,
  isPrivateOrReservedIPv4,
  isPrivateOrReservedIPv6,
  validateAndResolveUrl,
  getCorsHeaders,
  isAllowedContentType,
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

  // Allowed ports (80 and 443)
  const httpsPort = await validateAndResolveUrl("https://1.1.1.1:443/test");
  assert.equal(httpsPort.port, 443);
  assert.equal(httpsPort.resolvedIp, "1.1.1.1");

  const httpPort = await validateAndResolveUrl("http://1.1.1.1:80/test");
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
