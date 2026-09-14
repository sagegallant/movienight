const test = require("node:test");
const assert = require("node:assert/strict");
const { SyncEngine, SYNC_THRESHOLDS } = require("../js/sync/syncEngine.js");

test("SyncEngine - NTP Clock & Latency Estimation", () => {
  const engine = new SyncEngine();

  // Test Case 1: Synchronized clocks with 100ms symmetrical RTT
  // Host sends at t0 = 1000, Peer receives at t1 = 1050, sends at t2 = 1050, Host receives at t3 = 1100
  const pong1 = { t0: 1000, t1: 1050, t2: 1050 };
  const res1 = engine.processPong(pong1, 1100);
  assert.equal(res1.rtt, 100);
  assert.equal(res1.offset, 0);

  // Test Case 2: Peer clock is 2000ms ahead of host clock
  // Host sends at 1000, Peer receives at 3050 (+2000 offset + 50 transit), sends at 3050, Host receives at 1100
  const engine2 = new SyncEngine();
  const pong2 = { t0: 1000, t1: 3050, t2: 3050 };
  const res2 = engine2.processPong(pong2, 1100);
  assert.equal(res2.rtt, 100);
  assert.equal(res2.offset, 2000);

  // Test Case 3: toHostTime conversion using estimated offset
  assert.equal(engine2.toHostTime(5000), 3000);
});

test("SyncEngine - Median Filtering for Network Latency Spikes", () => {
  const engine = new SyncEngine();

  // Feed consistent 500ms offset measurements
  engine.recordSample(500, 40);
  engine.recordSample(510, 42);
  engine.recordSample(495, 38);

  // Introduce a network outlier spike
  engine.recordSample(3500, 3000);

  // Median should ignore the 3500 spike and remain close to 500
  assert.ok(Math.abs(engine.clockOffset - 505) <= 10);
});

test("SyncEngine - Host Timeline Modeling", () => {
  const engine = new SyncEngine();

  // 1. Paused Video
  engine.setHostTimeline({
    position: 42.0,
    timestamp: 10000,
    isPlaying: false,
    duration: 120.0,
  });

  // Expected position should remain 42.0 regardless of how much time passes
  assert.equal(engine.getExpectedHostPosition(20000), 42.0);

  // 2. Playing Video
  engine.setHostTimeline({
    position: 10.0,
    timestamp: 10000, // Host was at 10.0s at t=10000ms
    isPlaying: true,
    playbackRate: 1.0,
    duration: 120.0,
  });

  // 5 seconds later at localNow = 15000ms (offset = 0)
  assert.equal(engine.getExpectedHostPosition(15000), 15.0);

  // 3. Duration Capping
  assert.equal(engine.getExpectedHostPosition(200000), 120.0);
});

test("SyncEngine - 3-Tier Drift Calculation & Correction", () => {
  const engine = new SyncEngine({ inSyncThreshold: 0.15, hardSeekThreshold: 1.5 });

  // Host is playing at timestamp 10000, starting at 10.0s
  engine.setHostTimeline({
    position: 10.0,
    timestamp: 10000,
    isPlaying: true,
    playbackRate: 1.0,
  });

  const testNow = 15000; // Expected host position: 15.0s

  // Tier 1: In-Sync (drift = 50ms = 0.05s)
  const tier1 = engine.evaluateCorrection(15.05, testNow);
  assert.equal(tier1.action, "none");
  assert.equal(tier1.targetRate, 1.0);
  assert.equal(tier1.seekTarget, null);

  // Tier 2: Micro-adjustment - Client is slightly ahead by 400ms (15.4s vs 15.0s)
  const tier2Ahead = engine.evaluateCorrection(15.4, testNow);
  assert.equal(tier2Ahead.action, "adjust_rate");
  assert.equal(tier2Ahead.targetRate, SYNC_THRESHOLDS.SLOWDOWN_RATE);
  assert.equal(tier2Ahead.seekTarget, null);

  // Tier 2: Micro-adjustment - Client is slightly lagging by 500ms (14.5s vs 15.0s)
  const tier2Behind = engine.evaluateCorrection(14.5, testNow);
  assert.equal(tier2Behind.action, "adjust_rate");
  assert.equal(tier2Behind.targetRate, SYNC_THRESHOLDS.SPEEDUP_RATE);
  assert.equal(tier2Behind.seekTarget, null);

  // Tier 3: Hard Seek - Client is desynced by 3.0s (12.0s vs 15.0s)
  const tier3 = engine.evaluateCorrection(12.0, testNow);
  assert.equal(tier3.action, "seek");
  assert.equal(tier3.targetRate, 1.0);
  assert.equal(tier3.seekTarget, 15.0);
});

test("SyncEngine - Late-Join Calculation", () => {
  const engine = new SyncEngine();

  // Host started video at position 0, at host clock 100,000ms
  const hostState = {
    position: 0,
    timestamp: 100000,
    isPlaying: true,
    duration: 3600,
  };

  // Joiner enters at local time 145,000ms (45 seconds into playback, offset = 0)
  const joinerResult = engine.calculateLateJoin(hostState, 145000);
  assert.equal(joinerResult.targetPosition, 45.0);
  assert.equal(joinerResult.isPlaying, true);
  assert.equal(joinerResult.duration, 3600);
});

test("SyncEngine - Broadcast Payload Generation", () => {
  const engine = new SyncEngine({ isHost: true });
  const payload = engine.createSyncPayload("play", 12.5, 300, true, 50000);

  assert.equal(payload.type, "group_video_sync");
  assert.equal(payload.action, "play");
  assert.equal(payload.time, 12.5);
  assert.equal(payload.duration, 300);
  assert.equal(payload.isPlaying, true);
  assert.equal(payload.paused, false);
  assert.equal(payload.timestamp, 50000);
});
