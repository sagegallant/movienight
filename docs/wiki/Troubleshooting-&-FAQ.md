# 🛠️ Troubleshooting & Frequently Asked Questions

This guide provides diagnostic steps and solutions for common network, playback, and synchronization questions in MovieNight.

---

## 1. Connection & Networking

### Q: My friend cannot connect to my room with the room code.
- **Cause 1: Symmetric NAT or Strict Firewall**: WebRTC tries to establish direct peer-to-peer connections using public STUN servers. If either peer is behind a strict corporate, university, or cellular symmetric NAT, direct hole-punching can fail.
  - **Resolution**: Configure a TURN relay server. Open **Settings (⚙️)** in the room and enter credentials for a TURN server (see [[Self-Hosting & Deployment Guide]] for Coturn setup).
- **Cause 2: Host Has Not Admitted Participant**: Check the host's screen for the **Knock-and-Approval** admission modal. The host must click **Admit** before the connection can proceed.
- **Cause 3: Room Cap Reached**: MovieNight enforces an explicit maximum capacity of **6 participants**. If the room already has 6 participants, new join requests are refused.
- **Cause 4: Rate Limiting**: The client limits join attempts to 5 per minute to deter brute-force guessing. Wait 60 seconds and retry.

---

## 2. Audio & Video Playback

### Q: The video stream is black for viewers.
- **Autoplay Permission**: Modern browsers require user interaction before playing media. The viewer should click anywhere on the page or tap the video stage.
- **Unsupported Video Codec**: If streaming a local video file, ensure the file is encoded in H.264, VP8, or VP9. Codecs like HEVC/H.265 may display a black screen on browsers without native hardware decoders (e.g. Firefox or older Windows installs).

### Q: The video plays, but there is no sound.
- **Autoplay Mute**: Inbound video streams and YouTube embeds automatically start muted to comply with browser autoplay policies. Click the **Unmute** notification banner on screen or press <kbd>M</kbd>.
- **Dolby / DTS Audio in Video File**: Browsers cannot decode proprietary audio formats like Dolby AC-3, E-AC-3, or DTS. If you are playing an `.mkv` with 5.1 DTS audio, re-encode the audio track to AAC:
  ```bash
  ffmpeg -i movie.mkv -c:v copy -c:a aac -b:a 256k movie_fixed.mp4
  ```

### Q: Local file streaming does not work on iPhone / iPad.
- **iOS Sandbox Restriction**: Apple's WebKit on iOS blocks web pages from creating continuous media streams (`captureStream()`) from local storage. To stream on iOS, use **Direct URL Streaming** or **YouTube Sync**.

---

## 3. CORS & Media Proxy Issues

### Q: Direct video URL fails with "CORS Error" or 503.
- **GitHub Pages Deployment**: The `/proxy-video` endpoint requires a Node.js server. If you are accessing MovieNight on GitHub Pages (`github.io`), the proxy is unavailable. Only URLs with CORS headers enabled (`Access-Control-Allow-Origin: *`) can be played directly on GitHub Pages.
- **Self-Hosted Instance (503 Service Unavailable)**: The proxy is disabled by default for security. In your server environment, set:
  ```bash
  export ENABLE_VIDEO_PROXY="true"
  export ALLOWED_PROXY_HOSTS="your-media-cdn.com,cdn.example.org"
  ```
- **403 Forbidden on Proxied Stream**: The target domain is not in your `ALLOWED_PROXY_HOSTS` allowlist. Add the hostname to the comma-separated environment variable and restart the server.

---

## 4. Playback Synchronization & Drift

### Q: Viewers notice slight audio pitch changes or speed alterations.
- **Drift Correction Engine**: When drift between the viewer and host is between 150ms and 1500ms, MovieNight smoothly adjusts the playback rate to `0.95x` (if ahead) or `1.05x` (if behind) to catch up without visual pauses. Once aligned, playback returns to `1.0x`.
- If the host's connection has extreme jitter, viewers may experience repeated micro-adjustments. Verify that the host is on a stable wired or 5 GHz Wi-Fi connection.

### Q: Video stutters or drops frames on the host computer.
- **CPU Overload**: Encoding 1080p video to multiple peers in a mesh requires significant CPU/GPU resources.
- **Mitigation**:
  - Reduce the video resolution or choose a 720p file.
  - Close background tabs or heavy applications.
  - Limit the room size to 3–4 participants.

---

## 5. Security & Privacy

### Q: Does MovieNight store any of my video files or chat messages?
- **Zero Storage**: No media frames, room codes, or chat messages are ever stored on any MovieNight server. Media flows peer-to-peer via DTLS/SRTP encryption directly between browsers. When the room closes, all data is immediately erased from browser memory.
