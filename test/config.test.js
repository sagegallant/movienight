const test = require("node:test");
const assert = require("node:assert/strict");
const {
  DEFAULT_STUN_SERVERS,
  validateTurnConfig,
  getIceServers,
  hasTurnServerConfigured,
  buildPeerOptions,
} = require("../js/config.js");

test("Config - Default ICE Servers", () => {
  const servers = getIceServers();
  assert.ok(servers.length >= 2);
  // Both default STUN servers should be present
  assert.ok(servers.some((s) => s.urls.includes("stun.l.google.com")));
  assert.ok(servers.some((s) => s.urls.includes("stun.twilio.com")));
  assert.equal(hasTurnServerConfigured(), false);
});

test("Config - TURN Configuration Validation", () => {
  // Invalid schemes
  assert.equal(validateTurnConfig(null), null);
  assert.equal(validateTurnConfig({ url: "http://example.com" }), null);
  assert.equal(validateTurnConfig({ url: "stun:stun.example.com" }), null);
  assert.equal(validateTurnConfig({ url: "" }), null);

  // Valid turn schemes
  const validTurn = validateTurnConfig({
    url: "turn:relay.example.com:3478",
    username: "user1",
    credential: "secretpassword",
  });
  assert.notEqual(validTurn, null);
  assert.equal(validTurn.urls, "turn:relay.example.com:3478");
  assert.equal(validTurn.username, "user1");
  assert.equal(validTurn.credential, "secretpassword");

  // Valid turns (TLS) scheme
  const validTurns = validateTurnConfig({
    url: "turns:relay.example.com:5349",
  });
  assert.notEqual(validTurns, null);
  assert.equal(validTurns.urls, "turns:relay.example.com:5349");
});

test("Config - Injected TURN Server", () => {
  const customTurn = {
    url: "turn:turn.relay.provider.com:3478",
    username: "testuser",
    credential: "testpass",
  };
  const servers = getIceServers(customTurn);
  assert.equal(servers.length, DEFAULT_STUN_SERVERS.length + 1);
  const turnEntry = servers.find((s) => s.urls === customTurn.url);
  assert.ok(turnEntry);
  assert.equal(turnEntry.username, "testuser");
  assert.equal(turnEntry.credential, "testpass");
});

test("Config - PeerOptions Generation", () => {
  const options = buildPeerOptions({
    debug: 2,
    customTurn: { url: "turns:myturn.com:443" },
  });
  assert.equal(options.debug, 2);
  assert.equal(options.config.iceTransportPolicy, "all");
  assert.ok(options.config.iceServers.some((s) => s.urls === "turns:myturn.com:443"));
});
