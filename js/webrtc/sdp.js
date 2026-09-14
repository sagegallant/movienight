/**
 * MovieNight — WebRTC SDP & Bandwidth Management (P7, P8)
 *
 * Replaces global RTCPeerConnection.prototype monkey-patching with:
 * - Isolated, instance-scoped SDP bandwidth transformation.
 * - Standard RTCRtpSender.setParameters() adaptive bitrate control where supported.
 * - Dynamic bitrate tier support based on mesh participant count.
 */

/**
 * Munge SDP description to inject bandwidth limits and Opus stereo parameters.
 * @param {string} sdp
 * @param {object} [tierConfig] - Optional bitrate parameters { minVideoKbps, startVideoKbps, maxVideoKbps }
 * @returns {string}
 */
function mungeSdpBandwidth(sdp, tierConfig = null) {
  if (!sdp || typeof sdp !== "string") return sdp;

  const minB = tierConfig?.minVideoKbps || 2000;
  const startB = tierConfig?.startVideoKbps || 4000;
  const maxB = tierConfig?.maxVideoKbps || 8000;

  const lines = sdp.split(/\r?\n/);
  const out = [];
  let pendingB = null;
  let currentMedia = null;
  let opusPt = null;
  let videoPayloads = new Set();
  let seenFmtp = new Set();

  function flushMissingVideoFmtp() {
    if (currentMedia === "video" && videoPayloads.size > 0) {
      videoPayloads.forEach((pt) => {
        if (!seenFmtp.has(pt)) {
          out.push(
            `a=fmtp:${pt} x-google-min-bitrate=${minB};x-google-start-bitrate=${startB};x-google-max-bitrate=${maxB}`,
          );
          seenFmtp.add(pt);
        }
      });
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    if (line.startsWith("m=")) {
      flushMissingVideoFmtp();
      if (line.startsWith("m=video")) {
        currentMedia = "video";
        pendingB = [`b=AS:${maxB}`, `b=TIAS:${maxB * 1000}`];
        videoPayloads = new Set();
        seenFmtp = new Set();
        const parts = line.split(" ").slice(3);
        parts.forEach((pt) => {
          if (/^\d+$/.test(pt)) videoPayloads.add(pt);
        });
      } else if (line.startsWith("m=audio")) {
        currentMedia = "audio";
        pendingB = ["b=AS:256", "b=TIAS:256000"];
      } else {
        currentMedia = null;
        pendingB = null;
      }
      out.push(line);
      continue;
    }

    // Skip any existing b= lines so we can inject clean ones strictly after c=
    if (
      currentMedia &&
      (line.startsWith("b=AS:") || line.startsWith("b=TIAS:"))
    ) {
      continue;
    }

    // RFC 4566: b= lines MUST strictly follow the c= line
    if (line.startsWith("c=")) {
      out.push(line);
      if (pendingB && pendingB.length) {
        pendingB.forEach((b) => out.push(b));
        pendingB = null;
      }
      continue;
    }

    // Detect opus payload
    const opusMatch = line.match(/^a=rtpmap:(\d+)\s+opus\/48000/i);
    if (opusMatch) opusPt = opusMatch[1];

    // Intercept fmtp lines
    if (line.startsWith("a=fmtp:")) {
      const m = line.match(/^a=fmtp:(\d+)(.*)$/);
      if (m) {
        const pt = m[1];
        seenFmtp.add(pt);
        if (opusPt && pt === opusPt) {
          out.push(
            line + ";stereo=1;sprop-stereo=1;maxaveragebitrate=256000;cbr=1",
          );
          continue;
        }
        if (currentMedia === "video" && videoPayloads.has(pt)) {
          if (!line.includes("x-google-min-bitrate")) {
            out.push(
              line +
                `;x-google-min-bitrate=${minB};x-google-start-bitrate=${startB};x-google-max-bitrate=${maxB}`,
            );
            continue;
          }
        }
      }
    }

    out.push(line);
  }

  flushMissingVideoFmtp();
  return out.join("\r\n") + "\r\n";
}

/**
 * Configure RTCRtpSender parameters directly (modern WebRTC standard, no SDP munging needed).
 * @param {RTCPeerConnection} pc
 * @param {number} maxBitrateKbps
 * @returns {Promise<boolean>}
 */
async function applySenderBitrate(pc, maxBitrateKbps) {
  if (!pc || typeof pc.getSenders !== "function") return false;
  try {
    const senders = pc.getSenders();
    let updated = false;
    for (const sender of senders) {
      if (sender.track && sender.track.kind === "video") {
        const params = sender.getParameters();
        if (params && params.encodings && params.encodings.length > 0) {
          for (const encoding of params.encodings) {
            encoding.maxBitrate = maxBitrateKbps * 1000;
          }
          await sender.setParameters(params);
          updated = true;
        }
      }
    }
    return updated;
  } catch (e) {
    console.warn("Could not set sender parameters:", e.message);
    return false;
  }
}

/**
 * Attach SDP munging to a specific RTCPeerConnection instance without touching the global prototype.
 * @param {RTCPeerConnection} pc
 * @param {object} [tierConfig]
 */
function attachInstanceSdpMunging(pc, tierConfig = null) {
  if (!pc || pc._sdpMungeAttached) return;
  pc._sdpMungeAttached = true;

  const origSetLocal = pc.setLocalDescription;
  pc.setLocalDescription = function (desc) {
    if (desc && desc.sdp) {
      try {
        const munged = mungeSdpBandwidth(desc.sdp, tierConfig);
        desc =
          typeof RTCSessionDescription !== "undefined"
            ? new RTCSessionDescription({ type: desc.type, sdp: munged })
            : { type: desc.type, sdp: munged };
      } catch (e) {
        console.warn("Instance SDP local munge warning:", e);
      }
    }
    return origSetLocal.call(this, desc);
  };

  const origSetRemote = pc.setRemoteDescription;
  pc.setRemoteDescription = function (desc) {
    if (desc && desc.sdp) {
      try {
        const munged = mungeSdpBandwidth(desc.sdp, tierConfig);
        desc =
          typeof RTCSessionDescription !== "undefined"
            ? new RTCSessionDescription({ type: desc.type, sdp: munged })
            : { type: desc.type, sdp: munged };
      } catch (e) {
        console.warn("Instance SDP remote munge warning:", e);
      }
    }
    return origSetRemote.call(this, desc);
  };
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    mungeSdpBandwidth,
    applySenderBitrate,
    attachInstanceSdpMunging,
  };
}

if (typeof window !== "undefined") {
  window.SdpManager = {
    mungeSdpBandwidth,
    applySenderBitrate,
    attachInstanceSdpMunging,
  };
}
