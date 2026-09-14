const test = require("node:test");
const assert = require("node:assert/strict");
const {
  ROOM_CODE_CHARS,
  generateSecureRoomId,
  generateCapabilityToken,
  JoinAttemptLimiter,
  validateMessageEpoch,
} = require("../js/room/security.js");

test("RoomSecurity - Cryptographically Secure Room Code Generation", () => {
  const code = generateSecureRoomId();
  assert.equal(typeof code, "string");
  assert.equal(code.length, 6);

  // Assert code only contains approved non-confusing characters
  for (const char of code) {
    assert.equal(ROOM_CODE_CHARS.includes(char), true, `Character ${char} is in approved charset`);
  }

  // Verify uniqueness over sample
  const set = new Set();
  for (let i = 0; i < 100; i++) {
    const c = generateSecureRoomId();
    set.add(c);
  }
  // With 32^6 possibilities, 100 random samples should easily be all unique
  assert.equal(set.size, 100);
});

test("RoomSecurity - High-Entropy Capability Token Generation", () => {
  const token = generateCapabilityToken();
  assert.equal(typeof token, "string");
  assert.equal(token.length, 32); // 16 bytes = 32 hex chars
  assert.match(token, /^[0-9a-f]{32}$/);

  // Tokens must be unique
  const token2 = generateCapabilityToken();
  assert.notEqual(token, token2);
});

test("RoomSecurity - Join Attempt Rate Limiting", () => {
  const limiter = new JoinAttemptLimiter(5, 60000);

  // First 5 attempts must succeed
  for (let i = 1; i <= 5; i++) {
    const res = limiter.recordAttempt();
    assert.equal(res.allowed, true);
    assert.equal(res.remaining, 5 - i);
    assert.equal(res.retryAfterSec, 0);
  }

  // 6th attempt must be rejected
  const blocked = limiter.recordAttempt();
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.remaining, 0);
  assert.equal(blocked.retryAfterSec > 0, true);

  // Reset allows attempts again
  limiter.reset();
  const retry = limiter.recordAttempt();
  assert.equal(retry.allowed, true);
  assert.equal(retry.remaining, 4);
});

test("RoomSecurity - Room Message Epoch Validation", () => {
  const currentEpoch = 1700000000000;

  // Active epoch message
  assert.equal(validateMessageEpoch(currentEpoch + 1000, currentEpoch), true);
  assert.equal(validateMessageEpoch(currentEpoch - 1000, currentEpoch), true);

  // Stale message from past session (e.g. 10 minutes prior to room creation)
  assert.equal(validateMessageEpoch(currentEpoch - 600000, currentEpoch, 300000), false);

  // Undefined epoch handles gracefully for backward compatibility
  assert.equal(validateMessageEpoch(null, currentEpoch), true);
  assert.equal(validateMessageEpoch(currentEpoch, null), true);
});
