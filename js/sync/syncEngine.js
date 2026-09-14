/**
 * MovieNight — SyncEngine Subsystem (P9)
 *
 * Deterministic synchronization engine for WebRTC co-watching:
 * - NTP-style clock offset and round-trip latency estimation.
 * - Host and Client timeline modeling.
 * - 3-tier drift calculation and correction strategy (in-sync, micro playbackRate adjustment, hard seek).
 * - Deterministic late-join position computation.
 */

const SYNC_THRESHOLDS = {
  IN_SYNC_SEC: 0.15, // Drift <= 150ms: considered in sync, normal playback rate (1.0)
  HARD_SEEK_SEC: 1.5, // Drift > 1.5s: hard seek directly to expected position
  // Micro-adjustment rates for smooth catch-up without audio artifacts
  SLOWDOWN_RATE: 0.95, // When client is slightly ahead
  SPEEDUP_RATE: 1.05, // When client is slightly behind
};

class SyncEngine {
  /**
   * @param {object} [options]
   * @param {boolean} [options.isHost=false]
   * @param {number} [options.inSyncThreshold=0.15]
   * @param {number} [options.hardSeekThreshold=1.5]
   */
  constructor(options = {}) {
    this.isHost = !!options.isHost;
    this.inSyncThreshold = options.inSyncThreshold || SYNC_THRESHOLDS.IN_SYNC_SEC;
    this.hardSeekThreshold = options.hardSeekThreshold || SYNC_THRESHOLDS.HARD_SEEK_SEC;

    // Clock estimation
    this.clockOffset = 0; // peerClock - hostClock in ms
    this.roundTripTime = 0; // ms
    this.offsetSamples = [];
    this.maxSamples = 8;

    // Host timeline snapshot
    this.hostTimeline = {
      position: 0, // Video position in seconds
      timestamp: 0, // Host wall clock in ms
      isPlaying: false,
      playbackRate: 1.0,
      duration: 0,
    };

    // Event hooks
    this.onAction = options.onAction || null;
  }

  // ============================================================
  // 1. Clock & Latency Estimation (NTP-style)
  // ============================================================

  /**
   * Host creates a clock ping packet.
   * @param {number} [now] - Current host timestamp
   * @returns {{ type: string, t0: number }}
   */
  createPing(now = Date.now()) {
    return {
      type: "clock_ping",
      t0: now,
    };
  }

  /**
   * Peer processes clock ping and generates pong response.
   * @param {{ t0: number }} ping
   * @param {number} [receiveTime]
   * @param {number} [sendTime]
   * @returns {{ type: string, t0: number, t1: number, t2: number }}
   */
  createPong(ping, receiveTime = Date.now(), sendTime = Date.now()) {
    return {
      type: "clock_pong",
      t0: ping.t0,
      t1: receiveTime,
      t2: sendTime,
    };
  }

  /**
   * Calculate round-trip time and clock offset from a completed ping-pong cycle.
   * Formula:
   *   RTT = (t3 - t0) - (t2 - t1)
   *   Offset = ((t1 - t0) + (t2 - t3)) / 2
   * @param {{ t0: number, t1: number, t2: number }} pong
   * @param {number} [t3] - Time pong was received
   * @returns {{ rtt: number, offset: number }}
   */
  processPong(pong, t3 = Date.now()) {
    const { t0, t1, t2 } = pong;
    const rtt = Math.max(0, (t3 - t0) - (t2 - t1));
    const offset = ((t1 - t0) + (t2 - t3)) / 2;

    this.recordSample(offset, rtt);
    return { rtt, offset: this.clockOffset };
  }

  /**
   * Directly record a clock offset and RTT measurement with smoothing.
   * @param {number} offset
   * @param {number} rtt
   */
  recordSample(offset, rtt) {
    this.roundTripTime = rtt;
    this.offsetSamples.push(offset);
    if (this.offsetSamples.length > this.maxSamples) {
      this.offsetSamples.shift();
    }

    // Median filter to eliminate transient network spikes
    const sorted = [...this.offsetSamples].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    this.clockOffset =
      sorted.length % 2 === 0
        ? (sorted[mid - 1] + sorted[mid]) / 2
        : sorted[mid];
  }

  /**
   * Convert peer local timestamp to estimated host time.
   * @param {number} peerTimestamp
   * @returns {number} estimated host timestamp
   */
  toHostTime(peerTimestamp = Date.now()) {
    return peerTimestamp - this.clockOffset;
  }

  // ============================================================
  // 2. Timeline Modeling
  // ============================================================

  /**
   * Update the latest known host timeline.
   * @param {object} timeline
   */
  setHostTimeline(timeline) {
    this.hostTimeline = {
      position: Number(timeline.position || timeline.time || 0),
      timestamp: Number(timeline.timestamp || Date.now()),
      isPlaying: !!(timeline.isPlaying || timeline.action === "play" || (timeline.paused === false)),
      playbackRate: Number(timeline.playbackRate || 1.0),
      duration: Number(timeline.duration || 0),
    };
  }

  /**
   * Calculate expected current host video position at a given local time.
   * @param {number} [localNow] - Peer's current timestamp (Date.now())
   * @returns {number} expected position in seconds
   */
  getExpectedHostPosition(localNow = Date.now()) {
    if (!this.hostTimeline.isPlaying) {
      return this.hostTimeline.position;
    }

    const estimatedHostNow = this.toHostTime(localNow);
    const elapsedHostSeconds = Math.max(0, (estimatedHostNow - this.hostTimeline.timestamp) / 1000);
    const expected = this.hostTimeline.position + elapsedHostSeconds * this.hostTimeline.playbackRate;

    if (this.hostTimeline.duration > 0) {
      return Math.min(this.hostTimeline.duration, expected);
    }
    return expected;
  }

  // ============================================================
  // 3. Drift Calculation & 3-Tier Correction Strategy
  // ============================================================

  /**
   * Calculate playback drift (difference between local playback and expected host position).
   * Positive drift = client ahead of host
   * Negative drift = client behind host
   * @param {number} clientCurrentTime
   * @param {number} [localNow]
   * @returns {number} drift in seconds
   */
  calculateDrift(clientCurrentTime, localNow = Date.now()) {
    const expected = this.getExpectedHostPosition(localNow);
    return clientCurrentTime - expected;
  }

  /**
   * Evaluate drift and determine correction strategy.
   * @param {number} clientCurrentTime - Current video.currentTime in seconds
   * @param {number} [localNow] - Current local timestamp
   * @returns {{
   *   action: "none" | "adjust_rate" | "seek",
   *   drift: number,
   *   expectedPosition: number,
   *   targetRate: number,
   *   seekTarget: number|null
   * }}
   */
  evaluateCorrection(clientCurrentTime, localNow = Date.now()) {
    const expectedPosition = this.getExpectedHostPosition(localNow);
    const drift = clientCurrentTime - expectedPosition;
    const absDrift = Math.abs(drift);

    // Tier 1: In-Sync
    if (absDrift <= this.inSyncThreshold) {
      return {
        action: "none",
        drift,
        expectedPosition,
        targetRate: 1.0,
        seekTarget: null,
      };
    }

    // Tier 2: Micro PlaybackRate Adjustment (smooth catch-up without audio blips)
    if (absDrift <= this.hardSeekThreshold) {
      const targetRate =
        drift > 0 ? SYNC_THRESHOLDS.SLOWDOWN_RATE : SYNC_THRESHOLDS.SPEEDUP_RATE;
      return {
        action: "adjust_rate",
        drift,
        expectedPosition,
        targetRate,
        seekTarget: null,
      };
    }

    // Tier 3: Hard Seek (> 1.5s drift)
    return {
      action: "seek",
      drift,
      expectedPosition,
      targetRate: 1.0,
      seekTarget: expectedPosition,
    };
  }

  // ============================================================
  // 4. Late-Join Calculation
  // ============================================================

  /**
   * Compute initial playback position and state for a newly joined participant.
   * @param {object} hostState - State sent by host to joiner
   * @param {number} [localNow] - Joiner's current timestamp
   * @returns {{ targetPosition: number, isPlaying: boolean, duration: number }}
   */
  calculateLateJoin(hostState, localNow = Date.now()) {
    this.setHostTimeline(hostState);
    const targetPosition = this.getExpectedHostPosition(localNow);

    return {
      targetPosition: Math.max(0, targetPosition),
      isPlaying: this.hostTimeline.isPlaying,
      duration: this.hostTimeline.duration,
    };
  }

  // ============================================================
  // 5. Host Broadcast Helpers
  // ============================================================

  /**
   * Host creates a sync broadcast payload.
   * @param {string} action - "play" | "pause" | "seek" | "heartbeat"
   * @param {number} position - Current video time in seconds
   * @param {number} duration - Video duration in seconds
   * @param {boolean} isPlaying
   * @param {number} [now]
   * @returns {object}
   */
  createSyncPayload(action, position, duration, isPlaying, now = Date.now()) {
    return {
      type: "group_video_sync",
      action,
      time: position,
      duration,
      isPlaying,
      paused: !isPlaying,
      playbackRate: 1.0,
      timestamp: now,
    };
  }
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    SYNC_THRESHOLDS,
    SyncEngine,
  };
}

if (typeof window !== "undefined") {
  window.SyncEngine = SyncEngine;
  window.SYNC_THRESHOLDS = SYNC_THRESHOLDS;
}
