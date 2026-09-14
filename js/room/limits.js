/**
 * MovieNight — P2P Room Limits & Bandwidth Policy (P3, P4, P21, P22)
 *
 * Enforces small-group operational envelope for full-mesh WebRTC topology:
 * - Direct N(N-1)/2 mesh scaling constraint: default maximum 6 participants.
 * - Host upload bandwidth estimation and adaptive bitrate tier recommendations.
 * - Graceful rejection protocol when room capacity is reached.
 */

const ROOM_LIMITS = {
  DEFAULT_MAX_PARTICIPANTS: 6,
  MIN_PARTICIPANTS: 2,
  MAX_PARTICIPANTS_CEILING: 8,
};

/**
 * Check whether a new participant can be accepted into the room.
 * @param {number} currentCount - Number of active participants currently in room
 * @param {number} maxLimit - Room capacity limit (defaults to 6)
 * @returns {{ allowed: boolean, remainingSeats: number, currentCount: number, maxLimit: number }}
 */
function checkRoomCapacity(currentCount, maxLimit = ROOM_LIMITS.DEFAULT_MAX_PARTICIPANTS) {
  const safeCount = Math.max(0, Number(currentCount) || 0);
  const parsedLimit =
    maxLimit !== undefined && maxLimit !== null && !isNaN(Number(maxLimit))
      ? Number(maxLimit)
      : ROOM_LIMITS.DEFAULT_MAX_PARTICIPANTS;
  const safeLimit = Math.max(
    ROOM_LIMITS.MIN_PARTICIPANTS,
    Math.min(ROOM_LIMITS.MAX_PARTICIPANTS_CEILING, parsedLimit)
  );

  const allowed = safeCount < safeLimit;
  const remainingSeats = Math.max(0, safeLimit - safeCount);

  return {
    allowed,
    remainingSeats,
    currentCount: safeCount,
    maxLimit: safeLimit,
  };
}

/**
 * Generate standardized capacity rejection payload sent over signaling/DataChannel.
 * @param {number} maxLimit
 * @returns {object}
 */
function createCapacityRejectionMessage(maxLimit = ROOM_LIMITS.DEFAULT_MAX_PARTICIPANTS) {
  return {
    type: "join_rejected",
    reason: "capacity_exceeded",
    maxLimit,
    message: `Room is at full capacity (maximum ${maxLimit} participants for optimal P2P performance).`,
    timestamp: Date.now(),
  };
}

/**
 * Bitrate Tiers based on active participant count.
 * Prevents host uplink saturation in full-mesh topology.
 */
const BITRATE_TIERS = {
  // 1 peer: highest fidelity (up to 8 Mbps)
  SOLO: { maxVideoKbps: 8000, startVideoKbps: 5000, minVideoKbps: 2500 },
  // 2-3 peers: high fidelity (up to 5 Mbps each)
  SMALL: { maxVideoKbps: 5000, startVideoKbps: 3500, minVideoKbps: 2000 },
  // 4-5 peers: balanced (up to 3.2 Mbps each)
  MEDIUM: { maxVideoKbps: 3200, startVideoKbps: 2200, minVideoKbps: 1200 },
  // 6+ peers: efficient (up to 2 Mbps each)
  CONSTRAINED: { maxVideoKbps: 2000, startVideoKbps: 1500, minVideoKbps: 800 },
};

/**
 * Determine recommended video bitrate parameters for current room size.
 * @param {number} participantCount
 * @returns {object}
 */
function getRecommendedBitrateTier(participantCount) {
  const count = Math.max(1, Number(participantCount) || 1);
  if (count <= 2) return { tier: "SOLO", ...BITRATE_TIERS.SOLO };
  if (count <= 4) return { tier: "SMALL", ...BITRATE_TIERS.SMALL };
  if (count <= 6) return { tier: "MEDIUM", ...BITRATE_TIERS.MEDIUM };
  return { tier: "CONSTRAINED", ...BITRATE_TIERS.CONSTRAINED };
}

/**
 * Calculate estimated total host outbound bandwidth required.
 * For N total participants, the streaming host sends (N - 1) outgoing video streams.
 * @param {number} totalParticipants - Total people in room including host
 * @param {number} [perStreamKbps] - Target bitrate per stream in kbps
 * @returns {{ outgoingStreams: number, totalUploadKbps: number, totalUploadMbps: number, tier: string }}
 */
function calculateEstimatedHostUpload(totalParticipants, perStreamKbps) {
  const count = Math.max(1, Number(totalParticipants) || 1);
  const outgoingStreams = Math.max(0, count - 1);
  const tierConfig = getRecommendedBitrateTier(count);
  const bitrate = perStreamKbps || tierConfig.startVideoKbps;
  const totalUploadKbps = outgoingStreams * bitrate;
  const totalUploadMbps = parseFloat((totalUploadKbps / 1000).toFixed(2));

  return {
    outgoingStreams,
    perStreamKbps: bitrate,
    totalUploadKbps,
    totalUploadMbps,
    tier: tierConfig.tier,
  };
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    ROOM_LIMITS,
    checkRoomCapacity,
    createCapacityRejectionMessage,
    BITRATE_TIERS,
    getRecommendedBitrateTier,
    calculateEstimatedHostUpload,
  };
}

if (typeof window !== "undefined") {
  window.RoomLimits = {
    ROOM_LIMITS,
    checkRoomCapacity,
    createCapacityRejectionMessage,
    BITRATE_TIERS,
    getRecommendedBitrateTier,
    calculateEstimatedHostUpload,
  };
}
