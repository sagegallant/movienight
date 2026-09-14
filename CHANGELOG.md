# 📝 Changelog

All notable changes to **MovieNight** will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.1.0] - 2026-09-14

### Security
- **Hardened Video Proxy & SSRF Defense (P1, P2)**:
  - **Default-Disabled in Public Deployments**: `/proxy-video` defaults to disabled (`ENABLE_VIDEO_PROXY=false`), returning `503 Service Unavailable` out of the box.
  - **Explicit HTTPS Host Allowlist**: Configurable domain allowlist (`ALLOWED_PROXY_HOSTS`) with exact and wildcard subdomain support (`*.mycdn.com`). Disallows plain `http://` targets by default.
  - **Pre-flight DNS Validation & Socket Pinning**: Rejects private, loopback, link-local, carrier-grade NAT, and cloud metadata (`169.254.169.254`) addresses. Outbound sockets are pinned directly to pre-validated IPs to prevent TOCTOU DNS rebinding.
  - **Redirect Revalidation**: Re-validates HTTPS protocol, allowlist, and IP resolution on every hop (max 3 hops).
  - **Port & Size Restrictions**: Outbound ports strictly restricted to 443 (port 80 allowed only when insecure HTTP flag is enabled); 2 GB response size ceiling (`MAX_STREAM_BYTES`) and 15s idle read timeouts.
  - **Dual Rate Limiting**: Per-client-IP (60 req/min) and per-target-host (30 req/min) sliding-window rate limiters.
  - **Range Abuse Protection**: Validates single byte-range syntax and blocks multipart range requests (`bytes=0-10,20-30`) preventing range amplification DoS (CVE-2011-3192).
  - **Safe Response-Header Sanitization**: Forwards strictly safe media headers; strips upstream `Set-Cookie`, `Server`, `X-Powered-By`, and internal headers.
- **Room Code Security & Admission Control**:
  - Replaced `Math.random()` with cryptographically secure room code generation using `crypto.getRandomValues`.
  - Introduced 128-bit high-entropy capability tokens in invite URLs (`?room=ABC123&token=...`) to authorize invitations.
  - Added client-side join attempt rate limiting (max 5 per minute) to prevent automated probing.
  - Implemented room session epoch generation (`roomEpoch`) to reject stale or replayed signaling messages.
  - Created formal [SECURITY.md](SECURITY.md) documenting security policy, reporting SLA, and transport trust boundaries.

### Added
- **P2P Operating Envelope & Room Capacity Enforcement (P3, P4, P21, P22)**:
  - Enforced direct full-mesh scaling constraint (default max 6 participants, clamped between 2 and 8).
  - Graceful rejection flow (`join_rejected` payload and user-facing modal) when room reaches capacity.
  - 4-tier adaptive bitrate policy (`SOLO`, `SMALL`, `MEDIUM`, `CONSTRAINED`) based on participant count.
  - Host uplink bandwidth calculator to prevent upstream saturation.
  - Live header badge showing room seats (`Seats: 1/6`).
  - Empirical operating envelope validation evidence published in README.
- **Automated Integration & Unit Test Suite (47 Tests)**:
  - Real wire HTTP loopback integration tests in `test/proxyIntegration.test.js` validating live server responses.
  - Room security unit tests in `test/roomSecurity.test.js`.
  - GitHub Actions multi-version CI workflow (`.github/workflows/test.yml`) across Node.js 18, 20, and 22 LTS.
- **TURN Fallback & ICE Configuration Manager (P5)**:
  - Preserved direct P2P as default priority with optional TURN relay fallback.
  - Configured public STUN servers (Google and Twilio STUN).
  - Added TURN validator supporting `turn:` and `turns:` protocols with persistent `localStorage` storage.
  - Interactive Network & TURN Settings modal accessible from the UI.
- **Deterministic Synchronization Subsystem (P9)**:
  - Standalone `SyncEngine` with NTP-style two-way clock estimation and latency calculation.
  - Median filtering (window size 8) to discard outlier network spikes.
  - Timeline modeling predicting expected host playback position.
  - 3-tier drift correction: in-sync ($< 150$ms, normal 1.0x rate), micro-adjustment ($150\text{ms} - 1500\text{ms}$, seamless $0.95\text{x} / 1.05\text{x}$ playbackRate catchup), and hard seek ($> 1500$ms).
  - Deterministic late-join position recovery.
- **WebRTC Observability & Diagnostics (P18, P19)**:
  - Live `StatsMonitor` analyzing `RTCPeerConnection.getStats()` every 2.5 seconds.
  - Measures RTT, packet loss %, jitter, bitrates, and candidate topology (Direct P2P vs TURN Relay).
  - Network Quality Badge (`🟢 Excellent`, `🟢 Good`, `🟡 Degraded`, `🔴 Poor`) in room header.
  - Interactive WebRTC Diagnostics HUD displaying per-peer telemetry.
- **Automated Unit Test Suite**:
  - Comprehensive unit tests covering proxy security, room capacity, TURN configuration, SDP bandwidth management, WebRTC stats, and synchronization logic (`npm test`).

### Changed
- **Removed Prototype Monkey-Patching (P7, P8)**:
  - Eliminated global `window.RTCPeerConnection.prototype` monkey-patching in favor of an isolated `SdpManager` helper and standard `RTCRtpSender.setParameters()`.
- **Architecture Modularization (P6, P29)**:
  - Modularized codebase into `room/`, `signaling/`, `webrtc/`, `sync/`, and `ui/` components.

---

## [1.0.0] - 2026-09-06

### Added
- **Triple-Mode Video Pipeline**:
  - Direct local video file streaming (`.mp4`, `.mkv`, `.webm`, `.mov`, `.avi`) via `HTMLMediaElement.captureStream()`.
  - Direct video URL and CDN stream playback with native HTML5 `<video>`.
  - Copyright-compliant YouTube embedded sync using the official YouTube IFrame Player API.
- **WebRTC 1080p Stream Quality Optimization**:
  - RFC 4566 SDP bandwidth allocation munging (`b=AS:12000`, `b=TIAS:12000000`).
  - Google WebRTC initial bitrate boost (`x-google-min-bitrate=2500`, `x-google-start-bitrate=6000`, `x-google-max-bitrate=12000`).
  - Enforced encoder directives: `degradationPreference = "maintain-resolution"` and `contentHint = "detail"`.
  - 256 kbps Stereo Opus audio negotiation with surround sound protection.
- **Sub-Second Synchronization Engine**:
  - Presenter authoritative clock beacon broadcasted every 1000ms over WebRTC DataChannel.
  - Latency-compensated late-joiner position recovery ($\Delta t = \frac{\text{Date.now()} - \text{timestamp}}{1000}$).
  - Smooth drift auto-correction with a $> 0.8$s drift threshold to avoid audio stutter.
  - Host playback control override authority across all active screening sessions.
- **Cinema Theater & Social Experience**:
  - Responsive 16:9 cinema stage with Movie Mode and Fullscreen toggle (<kbd>F</kbd>).
  - Dual-column participant webcam and microphone overlays framing the theater screen.
  - Live emoji sparks (`❤️`, `🔥`, `👏`, `😂`, `🍿`, `🎬`) broadcasted in real time.
  - Collapsible Backrow chat drawer with timestamps, auto-scroll, and customizable avatars.
  - Procedurally generated SVG robot avatars.
- **Room Governance & Security**:
  - 6-character room codes (`ABC-123`) with host knock-and-approval admission modal.
  - Host controls: participant kick, force stop screen share, and ownership migration.
  - Zero application database and zero media retention — ephemeral room states in browser memory.
- **Infrastructure & Proxy**:
  - Lightweight Node.js `/proxy-video` streaming proxy with HTTP Range request support (`Range`, `Content-Range`) for external CORS-restricted media URLs.
  - Automated GitHub Actions deployment workflow for GitHub Pages (`actions/deploy-pages@v4`).
  - Interactive GitHub Issue forms (Bug Report, Feature Request) and Pull Request template.
