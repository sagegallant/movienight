# 📝 Changelog

All notable changes to **MovieNight** will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
