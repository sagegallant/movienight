const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("http");
const { server } = require("../server.js");

function makeRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(url, options, (res) => {
      let data = "";
      res.on("data", (chunk) => {
        data += chunk;
      });
      res.on("end", () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: data,
        });
      });
    });
    req.on("error", reject);
    if (options.body) {
      req.write(options.body);
    }
    req.end();
  });
}

test("Integration - Real HTTP Server Wire Testing", async (t) => {
  let serverPort;

  await new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      serverPort = server.address().port;
      resolve();
    });
  });

  t.after(() => {
    return new Promise((resolve) => {
      server.close(resolve);
    });
  });

  const baseUrl = `http://127.0.0.1:${serverPort}`;

  await t.test("Static Asset Serving with Security Headers", async () => {
    const res = await makeRequest(`${baseUrl}/index.html`);
    assert.equal(res.statusCode, 200);
    assert.equal(res.headers["content-type"], "text/html");
    assert.equal(res.headers["x-content-type-options"], "nosniff");
    assert.equal(res.headers["x-frame-options"], "SAMEORIGIN");
    assert.match(res.body, /MovieNight/);
  });

  await t.test("Path Traversal Attacks Blocked with 403", async () => {
    const res = await makeRequest(`${baseUrl}/..%2f..%2fpackage.json`);
    assert.equal(res.statusCode, 403);
    assert.match(res.body, /403 Forbidden/);
  });

  await t.test("Nonexistent Path Returns 404", async () => {
    const res = await makeRequest(`${baseUrl}/nonexistent_random_page_123.html`);
    assert.equal(res.statusCode, 404);
  });

  await t.test("/proxy-video Returns 503 by Default on the Wire", async () => {
    const res = await makeRequest(
      `${baseUrl}/proxy-video?url=https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4`
    );
    assert.equal(res.statusCode, 503);
    assert.match(res.body, /disabled by default/);
    assert.equal(res.headers["x-content-type-options"], "nosniff");
    // Verify cookies and internal headers are not set
    assert.equal(res.headers["set-cookie"], undefined);
  });

  await t.test("/proxy-video Rejects Non-GET/HEAD Methods with 405", async () => {
    const res = await makeRequest(
      `${baseUrl}/proxy-video?url=https://commondatastorage.googleapis.com/test.mp4`,
      { method: "POST" }
    );
    assert.equal(res.statusCode, 405);
  });

  await t.test("/proxy-video Handles OPTIONS Pre-flight with CORS Headers", async () => {
    const res = await makeRequest(`${baseUrl}/proxy-video`, { method: "OPTIONS" });
    assert.equal(res.statusCode, 204);
    assert.equal(res.headers["access-control-allow-methods"], "GET, HEAD, OPTIONS");
    assert.equal(res.headers["access-control-allow-headers"], "Range, Content-Type, Accept");
  });
});
