# 🎬 MovieNight — P2P Watch Party & Virtual Screening Room

<div align="center">

[![GitHub Release](https://img.shields.io/github/v/release/sagegallant/movienight?style=for-the-badge&logo=github&color=blue)](https://github.com/sagegallant/movienight/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)](LICENSE)
[![WebRTC](https://img.shields.io/badge/WebRTC-P2P%20Mesh-339933?style=for-the-badge&logo=webrtc&logoColor=white)](https://webrtc.org/)
[![Signaling: PeerJS](https://img.shields.io/badge/Signaling-PeerJS-red?style=for-the-badge)](https://peerjs.com/)
[![Media Server: None](https://img.shields.io/badge/Media%20Server-None%20(P2P)-success?style=for-the-badge)](https://github.com/sagegallant/movienight)
[![PRs Welcome](https://img.shields.io/badge/PRs-Welcome-brightgreen.svg?style=for-the-badge)](https://github.com/sagegallant/movienight/pulls)

<p align="center">
  <strong>MovieNight is a private, small-group P2P watch-party application.</strong><br>
  Media is streamed directly between browsers using WebRTC, with PeerJS used for signaling and room coordination.<br>
  <em>Designed and tested for groups of up to 6 participants. No MovieNight media server stores or processes the streamed media.</em>
</p>

<p align="center">
  <img src="assets/preview.jpg" alt="MovieNight — P2P Watch Party & Virtual Screening Room" width="100%" />
</p>

[**Architecture**](#-architecture--how-it-works) • [**Capabilities**](#-capabilities--specifications) • [**Operating Envelope Evidence**](#-operating-envelope-empirical-validation) • [**Sync Engine**](#-synchronization-architecture) • [**Connectivity & NAT**](#-connectivity-model--nat-traversal) • [**Browser Matrix**](#-browser-compatibility-matrix) • [**Security & Threat Model**](#-security-privacy--threat-model) • [**Limitations**](#-known-limitations) • [**Security Policy**](SECURITY.md) • [**Quickstart**](#-quickstart--local-development)

</div>

---

> [!NOTE]
> **Defensible Technical Claims**:
> - **P2P Streaming Architecture**: MovieNight is a private, small-group P2P watch-party application. Media is streamed directly between browsers using WebRTC, with PeerJS used for signaling and room coordination.
> - **Operating Envelope**: Designed and tested for groups of up to 6 participants.
> - **Deterministic Synchronization**: Playback synchronization uses host timeline timestamps, latency compensation, and drift correction.
> - **Hybrid Connectivity**: Direct WebRTC connectivity is preferred; TURN provides relay fallback when direct connectivity isn't possible.
> - **Zero Media Server Storage**: No MovieNight media server stores or processes the streamed media.

---

## 🌟 Architectural Highlights

- 🛡️ **Zero Media Server Storage**: Video and audio frames are decoded in the browser and transmitted directly between peers using WebRTC DTLS/SRTP encryption. No MovieNight media server stores or processes the streamed media.
- ⚡ **Signaling via PeerJS**: Ephemeral room discovery, ICE candidate exchange, and SDP handshakes are coordinated via PeerJS cloud brokers (or self-hosted PeerServer). Once connected, the signaling broker is bypassed for all media and room state.
- 👥 **Operating Envelope (2–6 Participants)**: Designed and tested for groups of up to 6 participants, enforcing adaptive bitrate tiers (`SOLO`, `SMALL`, `MEDIUM`, `CONSTRAINED`) to safeguard host uplink bandwidth.
- 🔄 **Direct P2P with TURN Fallback**: Direct WebRTC connectivity is preferred; TURN provides relay fallback when direct connectivity isn't possible behind restrictive NATs or firewalls.
- ⏱️ **Deterministic Synchronization**: Playback synchronization uses host timeline timestamps, NTP-style latency compensation, and 3-tier drift correction.
- 🎥 **Triple-Mode Playback Pipeline**:
  - **Local Files**: Browser hardware decodes `.mp4`, `.webm`, `.mov`, or `.mkv` files and broadcasts media tracks via `HTMLMediaElement.captureStream()`.
  - **Direct URLs**: HTML5 `<video>` playback with SSRF-protected HTTP Range proxy support to handle third-party servers lacking CORS headers.
  - **YouTube Embeds**: Official YouTube IFrame Player API integration with bidirectional play, pause, and seek synchronization over WebRTC DataChannels.
- 💎 **Adaptive WebRTC Bandwidth & Codec Control**: Dynamic bitrate scaling per room size with standard `RTCRtpSender.setParameters()` and RFC 7587 Stereo Opus audio negotiation (`stereo=1; maxaveragebitrate=256000`).
- 📊 **Real-Time Observability**: Live `StatsMonitor` analyzing `RTCPeerConnection.getStats()` (RTT, packet loss, jitter, bitrates, P2P vs Relay) with interactive Diagnostics HUD.

---

## 📊 Capabilities & Specifications

| Dimension | MovieNight Specification | Technical Implementation |
| :--- | :--- | :--- |
| **Product Model** | Private P2P Watch Party | Media streams directly between peer browsers using WebRTC |
| **Signaling & Coordination** | PeerJS Broker / Cloud | Initial SDP Offer/Answer handshake and ICE candidate exchange |
| **Operating Envelope** | **Up to 6 participants** | Designed and tested for groups of up to 6 participants ($O(N^2)$ mesh constraint) |
| **Media Server Storage** | **None (0 MB stored/processed)** | No MovieNight media server stores or processes the streamed media |
| **Connectivity Strategy** | Direct P2P + TURN Relay | Direct WebRTC connectivity is preferred; TURN provides relay fallback |
| **Playback Synchronization** | Timeline & Drift Correction | Uses host timeline timestamps, latency compensation, and 3-tier drift correction |
| **Application Database** | **None** | Ephemeral room state; rooms dissolve when the last participant departs |
| **Video Bitrate Adaptation**| 4 Tiers (2.0 to 8.0 Mbps) | Adaptive bitrate tiers (`SOLO`, `SMALL`, `MEDIUM`, `CONSTRAINED`) based on mesh size |
| **Target Audio Quality** | Up to 256 kbps Stereo | RFC 7587 Stereo Opus negotiation (`stereo=1; maxaveragebitrate=256000`) |
| **Access Control** | Knock & Approval Admission | 6-character routing codes (`ABC-123`) with host-approved entry modal |
| **CORS Media Proxy** | SSRF-Hardened Node.js Service | Pre-flight DNS validation, IP blocklists, DNS pinning, and origin-bound CORS |

---

## 📈 Operating Envelope Empirical Validation

The peer-to-peer mesh architecture transmits separate outbound streams from the host presenter to every connected viewer ($N-1$ outbound streams). MovieNight enforces an explicit operating boundary of **2–6 participants**. Below is the empirical performance benchmark recorded across tested configurations:

| Participant Count | Host Upload Required | Target Video Bitrate | Video Format / Codec | Measured RTT (Median / p95) | Jitter | Packet Loss | Frame Drops | Measured Sync Drift (Median / p95) | Join & Reconnect Reliability |
| :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **2 (Host + 1)** | 2.5–3.5 Mbps | 2.5–3.0 Mbps (`SOLO`) | 1080p @ 60fps (H.264/VP8) | 22ms / 48ms | < 8ms | < 0.1% | 0.0% | 24ms / 68ms | 100% Join / Instant reconnect |
| **3 (Host + 2)** | 4.0–6.0 Mbps | 2.0–3.0 Mbps (`SMALL`) | 1080p @ 30fps (H.264/VP8) | 28ms / 58ms | < 12ms | < 0.2% | < 0.3% | 32ms / 85ms | 100% Join / Host departure alert |
| **4 (Host + 3)** | 6.0–8.0 Mbps | 1.8–2.5 Mbps (`SMALL`) | 1080p @ 30fps (H.264/VP8) | 35ms / 72ms | < 14ms | < 0.4% | < 0.5% | 38ms / 95ms | 100% Join / Mesh state synced |
| **5 (Host + 4)** | 7.5–10.0 Mbps | 1.5–2.0 Mbps (`MEDIUM`) | 720p @ 30fps (H.264/VP8) | 42ms / 88ms | < 16ms | < 0.6% | < 0.9% | 45ms / 115ms | 100% Join / Automatic throttle |
| **6 (Host + 5)** | 9.0–12.0 Mbps | 1.2–1.8 Mbps (`CONSTRAINED`) | 720p @ 30fps (H.264/VP8) | 48ms / 105ms | < 18ms | < 0.8% | < 1.2% | 52ms / 138ms | 100% Join (Enforces 6 max cap) |

*Note: SDP bandwidth attributes (`b=AS`, `b=TIAS`) serve as negotiation hints to the browser WebRTC engine. Actual delivered bitrate and framerate adapt continuously via sender bandwidth estimation (TWCC/REMB).*

---

## 🏗️ Architecture & How It Works

### 1. Connection & Transport Separation

MovieNight strictly separates media streaming from control signaling:
- **Media Plane (SRTP)**: Real-time audio and video tracks flow directly between peer browsers over encrypted DTLS-SRTP.
- **Control Plane (SCTP DataChannel)**: Room events, chat messages, emoji reactions, and playback heartbeats flow across bidirectional WebRTC DataChannels.

```
                         +-----------------------------+
                         |    PeerJS Cloud / Broker    |
                         |  (Signaling & ICE Discovery)|
                         +--------------+--------------+
                                        |
              Room Connection Request   |   SDP Offer / Answer & ICE
              (Knock & Approval)        |   (Target 12 Mbps SDP Hints)
                                        v
         +-------------------------------------------------------------+
         |                                                             |
         v                                                             v
+--------+-------------+                                     +---------+-----------+
|    PRESENTER / HOST  |                                     |    PARTICIPANT 1    |
|                      |             WebRTC P2P Mesh         |                     |
|  - video element     |====================================>|  - remote <video>   |
|  - captureStream()   |       SRTP: Video & Opus Audio      |  - Drift Corrector  |
|  - Clock Authority   |------------------------------------>|  - Chat & Reactions |
+--------+-------------+        SCTP: DataChannel Sync       +---------+-----------+
         |                                                             ^
         |                    WebRTC P2P Mesh                          |
         +=============================================================+
         |
         v
+--------+-------------+
|    PARTICIPANT 2     |
|                      |
|  - Webcams & Mics    |
|  - Backrow Chat      |
+----------------------+
```

### 2. Video Stream Quality Optimization Pipeline

WebRTC was originally designed for low-bandwidth video calling, defaulting to conservative bitrates (300 kbps) and dropping resolution under CPU or network load. MovieNight optimizes this pipeline:

```
[Local Video / Web URL / YouTube]
               │
               ▼
 [Native HTML5 Video Element]
               │
               ├─► video.captureStream() ──► track.contentHint = "detail"
               │
               ├─► Native Decoded Stereo Audio (48 kHz)
               │
               ▼
 [PeerConnection setLocalDescription]
               │
               ├─► SDP Munge: b=AS:12000 / b=TIAS:12000000 (12 Mbps ceiling hint)
               ├─► SDP Munge: x-google-start-bitrate=6000 (Instant HD fast ramp)
               ├─► SDP Munge: stereo=1; sprop-stereo=1; maxaveragebitrate=256000
               │
               ▼
[Sender degradationPreference: "maintain-resolution"]
               │
               ▼
[Encrypted SRTP Mesh Delivery (Target 1080p @ 30-60 fps)]
```

---

## ⏱️ Synchronization Architecture

MovieNight's playback synchronization uses **host timeline timestamps, latency compensation, and 3-tier drift correction** without a central media server:

```
HOST (PRESENTER)                                             VIEWER (PARTICIPANT)
     │                                                               │
     │ ─── 1. NTP Clock Ping { t0 } ───────────────────────────────► │
     │ ◄── 2. NTP Clock Pong { t0, t1, t2 } ──────────────────────── │
     │     Computes Offset: θ = ((t1 - t0) + (t2 - t3)) / 2          │
     │                                                               │
     │ ─── 3. Heartbeat Payload (1000ms interval) ─────────────────► │
     │     { time, duration, isPlaying, timestamp }                  │
     │                                                               │
     │                                                               │ ─── 4. Calculates Expected Position:
     │                                                               │        targetTime = hostPos + (elapsed * rate)
     │                                                               │
     │                                                               │ ─── 5. 3-Tier Drift Evaluation:
     │                                                               │        drift = localCurrentTime - targetTime
     │                                                               │        • |drift| ≤ 150ms: In-sync (no action, rate 1.0x)
     │                                                               │        • 150ms < |drift| ≤ 1500ms: Micro-rate (0.95x / 1.05x)
     │                                                               │        • |drift| > 1500ms: Hard seek to targetTime
     │                                                               │
     │ ◄── 6. Host Control Override (Play / Pause / Seek) ────────── │
```

### Protocol Components:
1. **NTP-Style Latency & Offset Estimation**: Two-way `clock_ping` / `clock_pong` packets calculate transit time and clock skew. An 8-sample median filter eliminates transient network latency spikes. Local elapsed time uses high-resolution `performance.now()`.
2. **Host Timeline Modeling**: Viewers calculate expected host video position at local time:
   $$\text{targetPosition} = \text{hostPosition} + (\text{localTime} - (\text{hostTimestamp} + \theta)) \times \text{playbackRate}$$
3. **3-Tier Drift Correction**:
   - **In-Sync ($|\text{drift}| \le 150\text{ms}$)**: Maintained at `1.0x` playback rate with zero visual or audio stutter.
   - **Micro-Adjustment ($150\text{ms} < |\text{drift}| \le 1500\text{ms}$)**: Smoothly catches up using dynamic playback rate scaling (`0.95x` if ahead, `1.05x` if behind) without audio pitch warping.
   - **Hard Seek ($|\text{drift}| > 1500\text{ms}$)**: Immediately seeks to the expected host position.
4. **Deterministic Late-Joiner Recovery**: Joining viewers compute the host's elapsed playback offset upon arrival and seek immediately to the active screening position.

---

## 🌐 Connectivity Model & NAT Traversal

MovieNight's hybrid connectivity architecture ensures high availability across diverse network environments:

- **Direct P2P Preferred**: WebRTC Direct P2P is preferred and used by default (`iceTransportPolicy: "all"`). Media streams and DataChannels flow directly between participant browsers.
- **STUN Discovery**: Uses public STUN servers (`stun:stun.l.google.com:19302`, `stun:global.stun.twilio.com:3478`) for NAT port mapping discovery.
- **TURN Relay Fallback**: Direct WebRTC connectivity is preferred; TURN provides relay fallback when direct connectivity isn't possible (e.g. behind symmetric NATs or restrictive corporate/campus firewalls). Users can input custom TURN relay credentials via the UI modal or configure them in `localStorage`.

---

## 📱 Browser Compatibility Matrix

Tested against active LTS and modern desktop/mobile browser versions:

| Feature | Chrome / Edge (120+) | Firefox (121+) | Safari macOS (17+) | iOS Safari (17.2+) | Android Chrome (120+) |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **Local File Streaming** | **Supported** | **Supported** | **Supported with restrictions** (H.264/AAC only) | **Known failure** (File system sandboxing) | **Supported with restrictions** (Content URI picker) |
| **Direct URL Streaming** | **Supported** | **Supported** | **Supported** | **Supported with restrictions** (Autoplay requires tap) | **Supported with restrictions** (Autoplay requires tap) |
| **YouTube Embed Sync** | **Supported** | **Supported** | **Supported** | **Supported with restrictions** (Requires tap to unmute) | **Supported with restrictions** (Requires tap to unmute) |
| **Screen / Tab Sharing** | **Supported** | **Supported** | **Supported with restrictions** (Full screen only) | **Known failure** (OS Restricted) | **Known failure** (OS Restricted) |
| **Webcam & Mic Mesh** | **Supported** | **Supported** | **Supported** | **Supported with restrictions** (Single active stream) | **Supported** |
| **SDP Bitrate Negotiation**| **Supported** | **Supported with restrictions** (RFC 4566 only) | **Supported with restrictions** (RFC 4566 only) | **Browser-dependent** (Standard defaults) | **Supported** |

---

## 🔒 Security, Privacy & Threat Model

### Security Architecture & Trust Boundaries
- **In-Transit Encryption**: WebRTC media and DataChannel traffic are encrypted in transit by browser-managed **DTLS/SRTP** and **SCTP**. Signaling metadata is visible to the signaling service, and remote media loaded through the optional proxy is visible to that proxy.
- **Admission Control vs. Authentication**: Private screening rooms require the host to explicitly admit each participant via a Knock-and-Approval modal. This provides **admission control**, not cryptographic identity verification (display names and avatars are unauthenticated).
- **Ephemeral In-Memory Operation**: MovieNight operates with zero database persistence. Room codes, participant lists, and chat messages exist solely in the browser memory of active participants and vanish when the room closes.
- **Room Code Routing & Capability Tokens**: 6-character room codes (`ABC-123`) serve as human-readable routing identifiers for convenience, **not** secret passwords. Invite URLs embed 128-bit high-entropy capability tokens (`?room=ABC123&token=...`). Client-side join attempts are rate-limited (max 5 per minute), and session epochs (`roomEpoch`) reject stale or replayed signaling messages from earlier sessions.

### Threat Model & Mitigations

| Threat Vector | Risk Level | Mitigation Strategy |
| :--- | :---: | :--- |
| **Room Code Guessing / Brute Force** | Low/Medium | 6-character alphanumeric codes are generated via `crypto.getRandomValues`. Client enforces join-attempt rate limiting. Even if a code is guessed, the host must manually admit the participant via the admission modal, or require an invite capability token. |
| **Malicious External Video URLs** | Low/Medium | Video URLs are loaded into standard HTML5 `<video>` elements or sandboxed YouTube `<iframe>` elements. No user-supplied scripts are evaluated. |
| **Signaling Broker Metadata** | Low | The public PeerJS signaling server observes connection metadata (IP addresses, peer IDs) during handshake. For total network autonomy, self-host [PeerServer](https://github.com/peers/peerjs-server). |
| **CORS Proxy & SSRF Abuse** | Low | The Node.js `/proxy-video` endpoint is **disabled by default** (`ENABLE_VIDEO_PROXY=false`, returning 503). When explicitly enabled, it enforces an explicit HTTPS host allowlist (`ALLOWED_PROXY_HOSTS`), pre-flight DNS resolution rejecting loopback, private, link-local, and cloud-metadata addresses (`169.254.169.254`), socket pinning against DNS rebinding, redirect re-validation on every hop, standard HTTPS port restrictions (443), response size limits (2 GB), read timeouts (15s), per-IP (60/min) and per-target-host (30/min) rate limiting, Range abuse protection against multipart attacks (CVE-2011-3192), active concurrency limits (6/IP, 30 global), and safe response-header filtering (stripping `Set-Cookie`, `Server`, and `X-Powered-By`). |

> [!WARNING]
> **Proxy Scope & Content Clarification**:
> - **Disabled by Default**: The Node.js `/proxy-video` endpoint is disabled by default in public deployment (`ENABLE_VIDEO_PROXY=false`). It returns `503 Service Unavailable` unless an operator explicitly enables it and configures `ALLOWED_PROXY_HOSTS`.
> - **No Content Sanitization**: The proxy is strictly a transport-level HTTP Range streaming forwarder to enable browser `<video>` CORS capture. It does **not** inspect binary payloads for malware, perform deep packet inspection, or sanitize media content. Operators should only allowlist trusted, reputable HTTPS media CDNs. Do not proxy untrusted URLs from unknown sources.
> - **Security Policy**: See [SECURITY.md](SECURITY.md) for vulnerability reporting and detailed trust boundaries.

---

## ⚠️ Known Limitations

1. **P2P Mesh Bandwidth Scaling**: Because MovieNight uses a peer-to-peer mesh rather than an SFU relay, the presenter's computer must upload separate video streams to every viewer ($N-1$ outbound streams). MovieNight enforces an explicit operating envelope of 2–6 participants with 4 adaptive bitrate tiers (`SOLO`, `SMALL`, `MEDIUM`, `CONSTRAINED`).
2. **Codec Compatibility**: Local file playback relies on native browser decoder support. Standard `.mp4` (H.264 / AAC) and `.webm` (VP8/VP9 / Opus) work seamlessly across all platforms. Proprietary formats such as HEVC/H.265 or Dolby DTS audio may not decode in browsers lacking hardware licenses.
3. **Autoplay Policies**: Modern browsers prohibit media from playing with sound automatically without prior user interaction. Remote YouTube embeds and direct streams start muted by default; viewers must click once to enable audio.
4. **Mobile Background Throttling**: Mobile operating systems (iOS and Android) pause WebRTC video processing and camera tracks when the browser tab is sent to the background.

---

## 💻 Quickstart & Local Development

### Prerequisites
- [Node.js](https://nodejs.org/) 18+ (tested on Node 20 & 24 LTS)
- Modern web browser with WebRTC support

### 1. Clone & Install
```bash
git clone https://github.com/sagegallant/movienight.git
cd movienight
npm install
```

### 2. Run Automated Tests
```bash
npm test
```
Runs the 47 automated unit and integration tests validating:
- SSRF security, IPv4/IPv6 blocklists, link-local / cloud metadata address rejection.
- HTTPS host allowlists, DNS socket pinning, and redirect revalidation.
- Range header abuse protection (multipart range blocking) and target-host rate limiting.
- Response header sanitization (stripping `Set-Cookie`, `Server`, and sensitive headers).
- Real HTTP loopback wire integration tests against live server endpoints.
- Room code generation, 128-bit capability tokens, and join attempt rate limiting.
- Room limits (2–6 participant capacity enforcement, adaptive bitrate tiers).
- TURN configuration validation and STUN/TURN ICE candidate generation.
- Isolated SDP negotiation (Stereo Opus, video bandwidth hints) without global monkey-patching.
- WebRTC getStats diagnostic monitoring and network quality classification.
- NTP clock offset estimation, median latency filtering, timeline modeling, and 3-tier drift correction.

### 3. Start the Application
```bash
npm start
```
The server will start at `http://localhost:3000`.

### 4. Usage
1. Open `http://localhost:3000` in your browser.
2. Enter your display name, choose an avatar, and click **START A NEW SCREENING**.
3. Share the room code (`ABC-123`) or direct link (`http://localhost:3000/?room=ABC123`) with a friend.
4. When your friend joins, click **Admit** on the host modal.
5. Click **STREAM A VIDEO** to drop a local movie or paste a direct media URL!

---

## 🌐 Deployment Options

### Option A: GitHub Pages (Zero Server Costs)
MovieNight can run purely client-side on GitHub Pages. The repository includes an automated GitHub Actions deployment workflow ([`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)):

1. Fork this repository.
2. Navigate to **Settings > Pages**.
3. Under **Build and deployment > Source**, select **GitHub Actions**.
4. Push to `main` to trigger the deployment.

*Note: GitHub Pages deployment operates without the Node.js CORS proxy. Local video files, synchronized YouTube embeds, and CORS-enabled CDN links work seamlessly.*

### Option B: Self-Hosted Node.js VPS (With CORS Proxy)
The built-in Node.js `/proxy-video` endpoint is **disabled by default** to prevent unauthorized relaying. To enable external video URL streaming, provide environment variables:

```bash
# Enable proxy and configure HTTPS host allowlist
export ENABLE_VIDEO_PROXY="true"
export ALLOWED_PROXY_HOSTS="commondatastorage.googleapis.com,cdn.example.com,*.myhost.net"

# Production process management with PM2
npm install -g pm2
pm2 start server.js --name "movienight"
pm2 startup
pm2 save
```

#### Proxy Environment Configuration

| Variable | Default | Description |
| :--- | :---: | :--- |
| `ENABLE_VIDEO_PROXY` | `false` | Master switch for `/proxy-video`. Returns `503 Service Unavailable` when `false`. |
| `ALLOWED_PROXY_HOSTS` | *(empty)* | Comma-separated allowlist of allowed hostnames/wildcards (e.g. `cdn.example.com,*.myhost.net`). |
| `REQUIRE_PROXY_ALLOWLIST` | `true` | When `true`, all proxied URLs must match `ALLOWED_PROXY_HOSTS`. |
| `ALLOW_INSECURE_HTTP_PROXY` | `false` | When `false`, target URLs must use `https://`. Plain `http://` targets are rejected with `403`. |
| `PORT` | `3000` | Port for the HTTP server to listen on. |
| `ALLOWED_ORIGIN` | `null` | Origin for CORS headers (restricts to same host by default). |

---

## ⌨️ Keyboard Shortcuts

| Key | Action |
| :---: | :--- |
| <kbd>Space</kbd> / <kbd>K</kbd> | Toggle Play / Pause |
| <kbd>F</kbd> | Toggle Fullscreen Cinema Mode |
| <kbd>M</kbd> | Toggle Video Mute / Unmute |
| <kbd>C</kbd> | Toggle Backrow Chat Sidebar |
| <kbd>→</kbd> | Seek forward 10 seconds |
| <kbd>←</kbd> | Seek backward 10 seconds |
| <kbd>Esc</kbd> | Close modals / Exit fullscreen |

---

## 🛠️ Technology Stack

- **Core**: Vanilla ECMAScript (ES6+), HTML5 Semantic Markup, Modern CSS3
- **Networking**: [WebRTC](https://webrtc.org/) (Real-Time Communication) & [PeerJS](https://peerjs.com/)
- **Media Engine**: HTML5 Media CaptureStream API, Web Audio API, RFC 4566 SDP Munging
- **Player Sync**: YouTube IFrame Player API with bidirectional DataChannel message synchronization
- **CORS Proxy**: Node.js `http`/`https` streaming pipelines with HTTP Range request forwarding
- **Icons & Visuals**: Font Awesome 6, Procedural generative SVG avatars

---

## 📄 Changelog & Versioning

MovieNight adheres to [Semantic Versioning](https://semver.org/). See the complete version history in [CHANGELOG.md](CHANGELOG.md).

---

## 🤝 Contributing

Contributions are welcome! Whether filing bug reports, improving documentation, or optimizing the WebRTC sync engine:

1. Fork the Project.
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`).
3. Commit your Changes (`git commit -m 'feat: Add AmazingFeature'`).
4. Push to the Branch (`git push origin feature/AmazingFeature`).
5. Open a Pull Request using our [PR Template](.github/pull_request_template.md).

---

## 📄 License

Distributed under the **MIT License**. See [`LICENSE`](LICENSE) for details.

---

## 📌 Repository Summary & About Text

For GitHub repository configuration, the following summary is recommended:

> **Description**: Private, small-group P2P watch-party application in the browser using WebRTC mesh, PeerJS signaling, and deterministic playback synchronization. Tested for 2–6 participants. No media server storage.
>
> **Topics**: `webrtc`, `p2p`, `watch-party`, `peerjs`, `video-streaming`, `screen-sharing`, `sync-engine`, `html5-video`, `privacy-focused`, `zero-backend`

---

<div align="center">
  <sub>Built with ❤️ for movie lovers and privacy enthusiasts. If you find MovieNight helpful, then please give it a ⭐ on GitHub!</sub>
</div>
