const test = require("node:test");
const assert = require("node:assert/strict");
const { classifyNetworkQuality, StatsMonitor } = require("../js/webrtc/stats.js");

test("Stats - Network Quality Classification", () => {
  // Excellent: Low RTT, 0 loss, low jitter
  assert.equal(
    classifyNetworkQuality({ rtt: 45, lossPct: 0.2, jitter: 10 }),
    "excellent",
  );

  // Good: Moderate RTT or small loss
  assert.equal(
    classifyNetworkQuality({ rtt: 150, lossPct: 1.5, jitter: 40 }),
    "good",
  );

  // Degraded: Elevated RTT or moderate loss
  assert.equal(
    classifyNetworkQuality({ rtt: 280, lossPct: 4.5, jitter: 80 }),
    "degraded",
  );

  // Poor: High RTT or high packet loss
  assert.equal(
    classifyNetworkQuality({ rtt: 450, lossPct: 8.0, jitter: 150 }),
    "poor",
  );
  assert.equal(
    classifyNetworkQuality({ rtt: 50, lossPct: 12.0, jitter: 10 }),
    "poor",
  );
});

test("Stats - StatsMonitor Instance Initialization", () => {
  const monitor = new StatsMonitor({ intervalMs: 2000 });
  assert.equal(monitor.intervalMs, 2000);
  assert.equal(monitor.peerConnections.size, 0);

  const fakePc = { connectionState: "connected", getStats: async () => new Map() };
  monitor.track("peer-123", fakePc);
  assert.equal(monitor.peerConnections.size, 1);

  monitor.untrack("peer-123");
  assert.equal(monitor.peerConnections.size, 0);
});
