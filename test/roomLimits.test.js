const test = require("node:test");
const assert = require("node:assert/strict");
const {
  ROOM_LIMITS,
  checkRoomCapacity,
  createCapacityRejectionMessage,
  getRecommendedBitrateTier,
  calculateEstimatedHostUpload,
} = require("../js/room/limits.js");

test("Room Limits - Capacity Verification", () => {
  // Empty room (0) -> allowed, 6 seats remaining
  const cap0 = checkRoomCapacity(0, 6);
  assert.equal(cap0.allowed, true);
  assert.equal(cap0.remainingSeats, 6);

  // 5 participants -> allowed, 1 seat remaining
  const cap5 = checkRoomCapacity(5, 6);
  assert.equal(cap5.allowed, true);
  assert.equal(cap5.remainingSeats, 1);

  // 6 participants (at limit) -> rejected, 0 seats remaining
  const cap6 = checkRoomCapacity(6, 6);
  assert.equal(cap6.allowed, false);
  assert.equal(cap6.remainingSeats, 0);

  // 7 participants (exceeded) -> rejected
  const cap7 = checkRoomCapacity(7, 6);
  assert.equal(cap7.allowed, false);
  assert.equal(cap7.remainingSeats, 0);
});

test("Room Limits - Boundary Clamping", () => {
  // Clamping lower bound (min 2)
  const clampLow = checkRoomCapacity(1, 0);
  assert.equal(clampLow.maxLimit, ROOM_LIMITS.MIN_PARTICIPANTS);

  // Clamping upper ceiling (max 8)
  const clampHigh = checkRoomCapacity(1, 100);
  assert.equal(clampHigh.maxLimit, ROOM_LIMITS.MAX_PARTICIPANTS_CEILING);
});

test("Room Limits - Capacity Rejection Message", () => {
  const rej = createCapacityRejectionMessage(6);
  assert.equal(rej.type, "join_rejected");
  assert.equal(rej.reason, "capacity_exceeded");
  assert.equal(rej.maxLimit, 6);
  assert.match(rej.message, /full capacity/);
  assert.ok(rej.timestamp > 0);
});

test("Room Limits - Adaptive Bitrate Tiers", () => {
  // 1-2 participants -> SOLO tier
  const solo = getRecommendedBitrateTier(2);
  assert.equal(solo.tier, "SOLO");
  assert.equal(solo.maxVideoKbps, 8000);

  // 3-4 participants -> SMALL tier
  const small = getRecommendedBitrateTier(4);
  assert.equal(small.tier, "SMALL");
  assert.equal(small.maxVideoKbps, 5000);

  // 5-6 participants -> MEDIUM tier
  const medium = getRecommendedBitrateTier(6);
  assert.equal(medium.tier, "MEDIUM");
  assert.equal(medium.maxVideoKbps, 3200);

  // 7+ participants -> CONSTRAINED tier
  const constrained = getRecommendedBitrateTier(8);
  assert.equal(constrained.tier, "CONSTRAINED");
  assert.equal(constrained.maxVideoKbps, 2000);
});

test("Room Limits - Host Uplink Bandwidth Calculation", () => {
  // 1 participant (solo host): 0 outgoing streams
  const up1 = calculateEstimatedHostUpload(1);
  assert.equal(up1.outgoingStreams, 0);
  assert.equal(up1.totalUploadKbps, 0);

  // 4 participants: host uploads to 3 peers at 3500 kbps = 10,500 kbps (10.5 Mbps)
  const up4 = calculateEstimatedHostUpload(4);
  assert.equal(up4.outgoingStreams, 3);
  assert.equal(up4.perStreamKbps, 3500);
  assert.equal(up4.totalUploadKbps, 10500);
  assert.equal(up4.totalUploadMbps, 10.5);

  // 6 participants: host uploads to 5 peers at 2200 kbps = 11,000 kbps (11 Mbps)
  const up6 = calculateEstimatedHostUpload(6);
  assert.equal(up6.outgoingStreams, 5);
  assert.equal(up6.perStreamKbps, 2200);
  assert.equal(up6.totalUploadKbps, 11000);
  assert.equal(up6.totalUploadMbps, 11);
});
