/**
 * MovieNight — Room Security & Admission Control
 * Handles cryptographically secure room code generation, high-entropy capability tokens,
 * join attempt rate-limiting, and room session epoch validation.
 */

(function (global) {
  // Base32 character set excluding ambiguous characters (0, O, 1, I)
  const ROOM_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

  /**
   * Generates a cryptographically random 6-character alphanumeric room code.
   * @param {number} length Default is 6 characters.
   * @returns {string} Room code (e.g. "H7K2M9")
   */
  function generateSecureRoomId(length = 6) {
    const chars = ROOM_CODE_CHARS;
    let result = "";

    const cryptoObj =
      typeof window !== "undefined" && window.crypto
        ? window.crypto
        : typeof require !== "undefined"
        ? require("crypto").webcrypto
        : null;

    if (cryptoObj && cryptoObj.getRandomValues) {
      const randomValues = new Uint32Array(length);
      cryptoObj.getRandomValues(randomValues);
      for (let i = 0; i < length; i++) {
        result += chars.charAt(randomValues[i] % chars.length);
      }
    } else {
      // Fallback for non-crypto environments
      for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
      }
    }

    return result;
  }

  /**
   * Generates a high-entropy capability token for room invite URLs (128-bit / 32 hex chars).
   * @param {number} byteCount Default is 16 bytes (128 bits).
   * @returns {string} Hex capability token
   */
  function generateCapabilityToken(byteCount = 16) {
    const cryptoObj =
      typeof window !== "undefined" && window.crypto
        ? window.crypto
        : typeof require !== "undefined"
        ? require("crypto").webcrypto
        : null;

    if (cryptoObj && cryptoObj.getRandomValues) {
      const bytes = new Uint8Array(byteCount);
      cryptoObj.getRandomValues(bytes);
      return Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
    }

    // Fallback pseudo-random token
    return (
      "tok_" +
      Date.now().toString(36) +
      "_" +
      Math.random().toString(36).substring(2, 12)
    );
  }

  /**
   * Join Attempt Rate Limiter
   * Throttles join attempts to prevent client-side spamming or automated probing.
   */
  class JoinAttemptLimiter {
    constructor(maxAttempts = 5, windowMs = 60000) {
      this.maxAttempts = maxAttempts;
      this.windowMs = windowMs;
      this.attempts = [];
    }

    /**
     * Records an attempt and checks if further attempts are permitted.
     * @returns {{ allowed: boolean, remaining: number, retryAfterSec: number }}
     */
    recordAttempt() {
      const now = Date.now();
      this.attempts = this.attempts.filter((t) => now - t < this.windowMs);

      if (this.attempts.length >= this.maxAttempts) {
        const oldest = this.attempts[0];
        const retryAfterSec = Math.ceil((this.windowMs - (now - oldest)) / 1000);
        return {
          allowed: false,
          remaining: 0,
          retryAfterSec: Math.max(1, retryAfterSec),
        };
      }

      this.attempts.push(now);
      return {
        allowed: true,
        remaining: this.maxAttempts - this.attempts.length,
        retryAfterSec: 0,
      };
    }

    /**
     * Resets the attempt counter (e.g. after successful join approval).
     */
    reset() {
      this.attempts = [];
    }
  }

  /**
   * Validates message epoch to reject stale signaling messages or packets from expired room generations.
   * @param {number} messageEpoch The epoch timestamp sent in the message payload.
   * @param {number} currentRoomEpoch The room's active epoch creation timestamp.
   * @param {number} maxSkewMs Permitted clock skew tolerance in milliseconds (default 5 minutes).
   * @returns {boolean} True if message belongs to current room generation.
   */
  function validateMessageEpoch(messageEpoch, currentRoomEpoch, maxSkewMs = 300000) {
    if (!messageEpoch || !currentRoomEpoch) return true; // Graceful compatibility if omitted
    // Message from an earlier session prior to room creation is rejected as stale
    if (messageEpoch < currentRoomEpoch - maxSkewMs) {
      return false;
    }
    return true;
  }

  const RoomSecurity = {
    ROOM_CODE_CHARS,
    generateSecureRoomId,
    generateCapabilityToken,
    JoinAttemptLimiter,
    validateMessageEpoch,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = RoomSecurity;
  }
  if (typeof global !== "undefined") {
    global.RoomSecurity = RoomSecurity;
  }
})(typeof window !== "undefined" ? window : global);
