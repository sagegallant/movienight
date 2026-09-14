# 🎬 MovieNight — P2P Watch Party & Virtual Screening Room

<div align="center">

[![GitHub Release](https://img.shields.io/github/v/release/sagegallant/movienight?style=for-the-badge&logo=github&color=blue)](https://github.com/sagegallant/movienight/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)](LICENSE)
[![WebRTC](https://img.shields.io/badge/WebRTC-P2P%20Mesh-339933?style=for-the-badge&logo=webrtc&logoColor=white)](https://webrtc.org/)
[![Signaling: PeerJS](https://img.shields.io/badge/Signaling-PeerJS-red?style=for-the-badge)](https://peerjs.com/)
[![Media Server: None](https://img.shields.io/badge/Media%20Server-None%20(P2P)-success?style=for-the-badge)](https://github.com/sagegallant/movienight)
[![Tests: 47 Passing](https://img.shields.io/badge/Tests-47%20Passing-brightgreen?style=for-the-badge)](test/)
[![PRs Welcome](https://img.shields.io/badge/PRs-Welcome-brightgreen.svg?style=for-the-badge)](https://github.com/sagegallant/movienight/pulls)

<p align="center">
  <strong>MovieNight is a private, small-group P2P watch-party application.</strong><br>
  Media is streamed directly between browsers using WebRTC, with PeerJS used for signaling and room coordination.<br>
  <em>Designed and tested for groups of up to 6 participants. No MovieNight media server stores or processes the streamed media.</em>
</p>

<p align="center">
  <img src="assets/preview.jpg" alt="MovieNight — P2P Watch Party & Virtual Screening Room" width="100%" />
</p>

[**Highlights**](#-architectural-highlights) • [**Capabilities**](#-capabilities--specifications) • [**Operating Envelope**](#-operating-envelope-up-to-6-participants) • [**Quickstart**](#-quickstart--local-development) • [**Wiki Documentation**](#-documentation--technical-wiki) • [**Security**](#-security-privacy--threat-model) • [**Contributing**](CONTRIBUTING.md)

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

- 🛡️ **Zero Media Server Storage**: Decoded video and audio frames transmit directly between peer browsers via WebRTC DTLS/SRTP encryption. No MovieNight media server stores or processes the streamed media.
- ⚡ **Signaling via PeerJS**: Ephemeral room discovery, ICE candidate exchange, and SDP handshakes are coordinated via PeerJS cloud brokers (or self-hosted PeerServer). Once connected, the signaling broker is bypassed for all media and room state.
- 👥 **Tested Operating Envelope (2–6 Participants)**: Designed and tested for groups of up to 6 participants, enforcing adaptive bitrate tiers (`SOLO`, `SMALL`, `MEDIUM`, `CONSTRAINED`) to safeguard host uplink bandwidth.
- 🔄 **Direct P2P with TURN Fallback**: Direct WebRTC connectivity is preferred; TURN provides relay fallback when direct connectivity isn't possible behind restrictive NATs or symmetric corporate firewalls.
- ⏱️ **Deterministic Synchronization**: Playback synchronization uses host timeline timestamps, NTP-style latency compensation, and 3-tier drift correction.
- 🎥 **Triple-Mode Playback Pipeline**:
  - **Local Files**: Browser hardware decodes `.mp4`, `.webm`, `.mov`, or `.mkv` files and broadcasts media tracks via `HTMLMediaElement.captureStream()`.
  - **Direct URLs**: HTML5 `<video>` playback with SSRF-protected HTTP Range proxy support to handle third-party servers lacking CORS headers.
  - **YouTube Embeds**: Official YouTube IFrame Player API integration with bidirectional play, pause, and seek synchronization over WebRTC DataChannels.
- 💎 **Adaptive WebRTC Bandwidth & Codec Control**: Dynamic bitrate scaling per room size with standard `RTCRtpSender.setParameters()` and RFC 7587 Stereo Opus audio negotiation (`stereo=1; maxaveragebitrate=256000`).
- 📊 **Real-Time Observability**: Live `StatsMonitor` analyzing `RTCPeerConnection.getStats()` (RTT, packet loss, jitter, bitrates, P2P vs Relay) with interactive Diagnostics HUD.

---

## 📊 Capabilities & Specifications

| Dimension | MovieNight Specification | Technical Implementation | Deep Dive |
| :--- | :--- | :--- | :---: |
| **Product Model** | Private P2P Watch Party | Media streams directly between peer browsers using WebRTC | [[Wiki]](https://github.com/sagegallant/movienight/wiki/WebRTC-&-Sync-Engine-Architecture) |
| **Signaling & Coordination** | PeerJS Broker / Cloud | Initial SDP Offer/Answer handshake and ICE candidate exchange | [[Wiki]](https://github.com/sagegallant/movienight/wiki/WebRTC-&-Sync-Engine-Architecture) |
| **Operating Envelope** | **Up to 6 participants** | Designed and tested for groups of up to 6 participants ($O(N^2)$ mesh constraint) | [[Wiki]](https://github.com/sagegallant/movienight/wiki/Operating-Envelope-&-Performance) |
| **Media Server Storage** | **None (0 MB stored/processed)** | No MovieNight media server stores or processes the streamed media | [[Wiki]](https://github.com/sagegallant/movienight/wiki/Security,-Privacy-&-Threat-Model) |
| **Connectivity Strategy** | Direct P2P + TURN Relay | Direct WebRTC connectivity is preferred; TURN provides relay fallback | [[Wiki]](https://github.com/sagegallant/movienight/wiki/WebRTC-&-Sync-Engine-Architecture) |
| **Playback Synchronization** | Timeline & Drift Correction | Uses host timeline timestamps, latency compensation, and 3-tier drift correction | [[Wiki]](https://github.com/sagegallant/movienight/wiki/WebRTC-&-Sync-Engine-Architecture) |
| **Application Database** | **None** | Ephemeral room state; rooms dissolve when the last participant departs | [[Wiki]](https://github.com/sagegallant/movienight/wiki/Security,-Privacy-&-Threat-Model) |
| **Video Bitrate Adaptation**| 4 Tiers (1.2 to 3.0 Mbps) | Adaptive bitrate tiers (`SOLO`, `SMALL`, `MEDIUM`, `CONSTRAINED`) based on mesh size | [[Wiki]](https://github.com/sagegallant/movienight/wiki/Operating-Envelope-&-Performance) |
| **Target Audio Quality** | Up to 256 kbps Stereo | RFC 7587 Stereo Opus negotiation (`stereo=1; maxaveragebitrate=256000`) | [[Wiki]](https://github.com/sagegallant/movienight/wiki/WebRTC-&-Sync-Engine-Architecture) |
| **Access Control** | Knock & Approval Admission | 6-character routing codes (`ABC-123`) with host-approved entry modal | [[Wiki]](https://github.com/sagegallant/movienight/wiki/User-Guide-&-Room-Controls) |
| **CORS Media Proxy** | SSRF-Hardened Node.js Service | Pre-flight DNS validation, IP blocklists, DNS pinning, and origin-bound CORS | [[Wiki]](https://github.com/sagegallant/movienight/wiki/Security,-Privacy-&-Threat-Model) |

---

## 📈 Operating Envelope (Up to 6 Participants)

In MovieNight's decentralized peer-to-peer mesh architecture, the presenter's browser transmits separate outbound streams to every connected viewer ($N-1$ outbound streams). MovieNight enforces an explicit operating envelope of **2–6 participants**:

- **2 Participants (`SOLO`)**: 1080p @ 60fps, 2.5–3.0 Mbps video bitrate, sub-30ms drift.
- **3–4 Participants (`SMALL`)**: 1080p @ 30fps, 1.8–2.5 Mbps video bitrate, sub-40ms drift.
- **5 Participants (`MEDIUM`)**: 720p @ 30fps, 1.5–2.0 Mbps video bitrate, sub-50ms drift.
- **6 Participants (`CONSTRAINED`)**: 720p @ 30fps, 1.2–1.8 Mbps video bitrate, room capacity enforced.

> 📊 **Detailed Benchmarks**: For the full 10-column empirical performance benchmark table (measured upload Mbps, RTT, jitter, packet loss, frame drops, sync drift, and reconnect reliability), see the [Operating Envelope & Performance Guide](https://github.com/sagegallant/movienight/wiki/Operating-Envelope-&-Performance) in our technical wiki.

---

## 📚 Documentation & Technical Wiki

Comprehensive architectural guides, empirical benchmarks, and deployment tutorials have been organized into the **[MovieNight GitHub Wiki](https://github.com/sagegallant/movienight/wiki)**:

| Wiki Guide | Key Topics Covered |
| :--- | :--- |
| 📖 **[User Guide & Room Controls](https://github.com/sagegallant/movienight/wiki/User-Guide-&-Room-Controls)** | Hosting, Knock & Approval admission, streaming modes, cinema view, shortcuts. |
| 🏗️ **[WebRTC & Sync Architecture](https://github.com/sagegallant/movienight/wiki/WebRTC-&-Sync-Engine-Architecture)** | Transport separation, SDP munging pipeline, NTP latency estimation, 3-tier drift. |
| 📈 **[Operating Envelope & Performance](https://github.com/sagegallant/movienight/wiki/Operating-Envelope-&-Performance)** | Empirical 2–6 participant benchmark matrix, host uplink scaling, StatsMonitor HUD. |
| 📱 **[Browser Compatibility Matrix](https://github.com/sagegallant/movienight/wiki/Browser-Compatibility-&-Limitations)** | 5-column browser table, iOS WebKit sandboxing, autoplay policies, codec support. |
| 🔒 **[Security, Privacy & Threat Model](https://github.com/sagegallant/movienight/wiki/Security,-Privacy-&-Threat-Model)** | Trust boundaries, threat vectors, SSRF defense-in-depth, proxy scope clarifications. |
| 🌐 **[Self-Hosting & Deployment Guide](https://github.com/sagegallant/movienight/wiki/Self-Hosting-&-Deployment-Guide)** | GitHub Pages deploy, VPS with PM2, Nginx reverse proxy, custom Coturn TURN setup. |
| 🛠️ **[Troubleshooting & FAQ](https://github.com/sagegallant/movienight/wiki/Troubleshooting-&-FAQ)** | Diagnosing symmetric NATs, autoplay audio blocks, CORS errors, and stutter. |

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
Runs the 47 automated unit and integration tests validating SSRF security, host allowlists, DNS socket pinning, multipart range protection, room capacity limits, TURN configuration, SDP munging isolation, and NTP timeline drift correction.

### 3. Start the Application
```bash
npm start
```
The application will launch at `http://localhost:3000`.

### 4. Basic Usage
1. Open `http://localhost:3000` in your browser.
2. Enter your display name, choose an avatar, and click **START A NEW SCREENING**.
3. Share the room code (`ABC-123`) or direct link (`http://localhost:3000/?room=ABC123`) with a friend.
4. When your friend joins, click **Admit** on the host modal.
5. Click **STREAM A VIDEO** to drop a local movie or paste a direct media URL!

---

## 🌐 Deployment Options

- **GitHub Pages (Zero Server Costs)**: Deploy client-only in seconds with the included GitHub Actions workflow ([`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)). Supports local file playback, synchronized YouTube embeds, and CORS-enabled media CDNs.
- **Self-Hosted Node.js VPS (With CORS Proxy)**: Run on any Linux VPS with PM2 or Docker. Enables the built-in HTTP Range `/proxy-video` endpoint for CORS-restricted streams.
- **Custom TURN Relay**: Deploy Coturn alongside MovieNight for guaranteed connectivity behind restrictive corporate/university firewalls.

> 📖 **Step-by-Step Setup**: See the [Self-Hosting & Deployment Guide](https://github.com/sagegallant/movienight/wiki/Self-Hosting-&-Deployment-Guide) for complete Nginx, PM2, and Coturn configurations.

---

## 🔒 Security, Privacy & Threat Model

- **In-Transit Encryption**: All media and DataChannel packets are encrypted end-to-end between peer browsers using DTLS/SRTP and SCTP.
- **Zero Media Server Storage**: No MovieNight media server stores or processes the streamed media.
- **Ephemeral State**: Rooms operate entirely in browser memory without database persistence and dissolve when the last participant departs.
- **SSRF-Hardened CORS Proxy**: The `/proxy-video` service is **disabled by default** (`ENABLE_VIDEO_PROXY=false`, returning 503). When enabled, it enforces an HTTPS allowlist (`ALLOWED_PROXY_HOSTS`), pre-flight DNS checks against loopback/private/cloud-metadata IPs, DNS socket pinning, redirect revalidation, and single-range validation.

> [!WARNING]
> **Proxy Scope & Content Clarification**:
> - **Disabled by Default**: Returns `503 Service Unavailable` unless an operator explicitly enables it and configures `ALLOWED_PROXY_HOSTS`.
> - **No Content Sanitization**: The proxy is strictly a transport-level HTTP Range streaming forwarder to enable browser `<video>` CORS capture. It does **not** inspect binary payloads for malware, perform deep packet inspection, or sanitize media content. Operators should only allowlist trusted, reputable HTTPS media CDNs.
> - **Security Policy**: See [SECURITY.md](SECURITY.md) for vulnerability reporting and detailed trust boundaries.

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

## 🤝 Contributing & Guidelines

Contributions are welcome! Please read our [Contribution Guidelines (CONTRIBUTING.md)](CONTRIBUTING.md) and [Code of Conduct (CODE_OF_CONDUCT.md)](CODE_OF_CONDUCT.md) before opening a pull request.

---

## 📄 License & Versioning

- Distributed under the **MIT License**. See [`LICENSE`](LICENSE) for details.
- MovieNight adheres to [Semantic Versioning](https://semver.org/). See [CHANGELOG.md](CHANGELOG.md).

---

## 📌 Repository Summary & About Text

> **Description**: Private, small-group P2P watch-party application in the browser using WebRTC mesh, PeerJS signaling, and deterministic playback synchronization. Tested for 2–6 participants. No media server storage.
>
> **Topics**: `webrtc`, `p2p`, `watch-party`, `peerjs`, `video-streaming`, `screen-sharing`, `sync-engine`, `html5-video`, `privacy-focused`, `zero-backend`

---

<div align="center">
  <sub>Built with ❤️ for movie lovers and privacy enthusiasts. If you find MovieNight helpful, please give it a ⭐ on GitHub!</sub>
</div>
