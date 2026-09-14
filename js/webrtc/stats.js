/**
 * MovieNight — WebRTC Stats & Observability Layer (P18, P19)
 *
 * Provides real-time metrics and diagnostic intelligence via RTCPeerConnection.getStats():
 * - Round-trip time (RTT in ms)
 * - Packet loss percentage
 * - Jitter (ms)
 * - Inbound and Outbound bitrates (kbps)
 * - Candidate pair type (host / srflx / relay / TURN)
 * - Quality classification: Excellent, Good, Degraded, Poor
 */

const QUALITY_THRESHOLDS = {
  EXCELLENT: { maxRtt: 100, maxLossPct: 1.0, maxJitter: 30 },
  GOOD: { maxRtt: 200, maxLossPct: 3.0, maxJitter: 60 },
  DEGRADED: { maxRtt: 350, maxLossPct: 7.0, maxJitter: 120 },
};

/**
 * Classify connection quality based on network metrics.
 * @param {{ rtt: number, lossPct: number, jitter: number }} metrics
 * @returns {"excellent" | "good" | "degraded" | "poor"}
 */
function classifyNetworkQuality(metrics) {
  const { rtt = 0, lossPct = 0, jitter = 0 } = metrics;

  if (
    rtt <= QUALITY_THRESHOLDS.EXCELLENT.maxRtt &&
    lossPct <= QUALITY_THRESHOLDS.EXCELLENT.maxLossPct &&
    jitter <= QUALITY_THRESHOLDS.EXCELLENT.maxJitter
  ) {
    return "excellent";
  }

  if (
    rtt <= QUALITY_THRESHOLDS.GOOD.maxRtt &&
    lossPct <= QUALITY_THRESHOLDS.GOOD.maxLossPct &&
    jitter <= QUALITY_THRESHOLDS.GOOD.maxJitter
  ) {
    return "good";
  }

  if (
    rtt <= QUALITY_THRESHOLDS.DEGRADED.maxRtt &&
    lossPct <= QUALITY_THRESHOLDS.DEGRADED.maxLossPct
  ) {
    return "degraded";
  }

  return "poor";
}

class StatsMonitor {
  /**
   * @param {object} [options]
   * @param {number} [options.intervalMs=3000]
   * @param {Function} [options.onUpdate]
   */
  constructor(options = {}) {
    this.intervalMs = options.intervalMs || 3000;
    this.onUpdate = options.onUpdate || null;
    this.timer = null;
    this.prevStats = new Map(); // peerId -> { timestamp, bytesSent, bytesReceived }
    this.peerConnections = new Map(); // peerId -> RTCPeerConnection
  }

  /**
   * Register a peer connection to track.
   * @param {string} peerId
   * @param {RTCPeerConnection} pc
   */
  track(peerId, pc) {
    if (!peerId || !pc) return;
    this.peerConnections.set(peerId, pc);
  }

  /**
   * Unregister a peer connection.
   * @param {string} peerId
   */
  untrack(peerId) {
    this.peerConnections.delete(peerId);
    this.prevStats.delete(peerId);
  }

  /**
   * Start periodic stats sampling.
   */
  start() {
    if (this.timer) return;
    this.timer = setInterval(() => this.poll(), this.intervalMs);
  }

  /**
   * Stop periodic stats sampling.
   */
  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /**
   * Sample getStats() for all tracked peer connections.
   * @returns {Promise<Map<string, object>>}
   */
  async poll() {
    const results = new Map();

    for (const [peerId, pc] of this.peerConnections.entries()) {
      if (!pc || pc.connectionState === "closed") {
        this.untrack(peerId);
        continue;
      }

      try {
        const stats = await pc.getStats();
        const metrics = this.parseStats(peerId, stats);
        results.set(peerId, metrics);
      } catch (e) {
        // Peer connection might be closing
      }
    }

    if (this.onUpdate && results.size > 0) {
      this.onUpdate(results);
    }

    return results;
  }

  /**
   * Parse RTCStatsReport into normalized metric object.
   * @param {string} peerId
   * @param {RTCStatsReport} report
   * @returns {object}
   */
  parseStats(peerId, report) {
    let rtt = 0;
    let packetsLost = 0;
    let packetsTotal = 0;
    let jitter = 0;
    let bytesSent = 0;
    let bytesReceived = 0;
    let candidateType = "unknown";
    let isRelayed = false;

    report.forEach((stat) => {
      // Candidate pair for RTT and connection topology (Direct P2P vs TURN Relay)
      if (stat.type === "candidate-pair" && stat.state === "succeeded") {
        if (stat.currentRoundTripTime) {
          rtt = Math.round(stat.currentRoundTripTime * 1000);
        }
      }

      // Local candidate to check if we are using a TURN relay
      if (stat.type === "local-candidate") {
        candidateType = stat.candidateType || candidateType;
        if (stat.candidateType === "relay") {
          isRelayed = true;
        }
      }

      // Inbound RTP
      if (stat.type === "inbound-rtp") {
        if (stat.packetsLost) packetsLost += stat.packetsLost;
        if (stat.packetsReceived) packetsTotal += stat.packetsReceived;
        if (stat.jitter) jitter = Math.max(jitter, Math.round(stat.jitter * 1000));
        if (stat.bytesReceived) bytesReceived += stat.bytesReceived;
      }

      // Outbound RTP
      if (stat.type === "outbound-rtp") {
        if (stat.bytesSent) bytesSent += stat.bytesSent;
      }
    });

    packetsTotal += packetsLost;
    const lossPct =
      packetsTotal > 0
        ? parseFloat(((packetsLost / packetsTotal) * 100).toFixed(1))
        : 0;

    // Calculate bitrates using delta from previous sample
    const now = Date.now();
    const prev = this.prevStats.get(peerId);
    let outBitrateKbps = 0;
    let inBitrateKbps = 0;

    if (prev && now > prev.timestamp) {
      const deltaSec = (now - prev.timestamp) / 1000;
      outBitrateKbps = Math.round(((bytesSent - prev.bytesSent) * 8) / (deltaSec * 1000));
      inBitrateKbps = Math.round(((bytesReceived - prev.bytesReceived) * 8) / (deltaSec * 1000));
    }

    this.prevStats.set(peerId, {
      timestamp: now,
      bytesSent,
      bytesReceived,
    });

    const quality = classifyNetworkQuality({ rtt, lossPct, jitter });

    return {
      peerId,
      rtt,
      lossPct,
      jitter,
      outBitrateKbps: Math.max(0, outBitrateKbps),
      inBitrateKbps: Math.max(0, inBitrateKbps),
      candidateType,
      isRelayed,
      quality,
      timestamp: now,
    };
  }
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    QUALITY_THRESHOLDS,
    classifyNetworkQuality,
    StatsMonitor,
  };
}

if (typeof window !== "undefined") {
  window.StatsMonitor = StatsMonitor;
  window.classifyNetworkQuality = classifyNetworkQuality;
}
