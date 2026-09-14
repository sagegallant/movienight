# 📱 Browser Compatibility & Known Limitations

This document outlines cross-browser feature support, operating system sandboxing limitations, and mobile platform constraints when using MovieNight.

---

## 1. Browser Compatibility Matrix

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

## 2. Platform-Specific Restrictions

### iOS Safari (WebKit Sandboxing)
- **Local File System Access**: iOS Safari does not permit continuous file streaming via `<input type="file">` blobs to WebRTC `captureStream()`. Large local video files cannot be streamed from iOS devices.
- **Screen Sharing**: Apple does not expose `navigator.mediaDevices.getDisplayMedia()` inside mobile Safari. Screen sharing cannot be initiated from an iPhone or iPad.
- **Single Active Stream**: iOS WebKit limits simultaneous media decoders. If webcam video is active, video rendering performance may be restricted on older iOS hardware.

### Android Chrome
- **Local File Selection**: Android's content URI picker works for standard media, though seeking on very large files (>4 GB) may experience delay due to Android storage abstraction layers.
- **Screen Capture**: Initiating full system screen sharing is disabled or restricted on most Android browsers by OS security policy.

---

## 3. Autoplay Policies & Audio Permission Handling

Modern browsers implement strict **Autoplay Policies** to prevent web pages from unexpectedly blasting sound:

- **The Rule**: A browser will not play unmuted audio unless the user has actively interacted with the page (e.g. clicked, tapped, or typed).
- **MovieNight's Strategy**:
  1. Remote video streams and YouTube embeds automatically mount in a **muted** state to guarantee immediate synchronization and uninterrupted video playback.
  2. A visual unmuting notification ("*Click anywhere to enable audio*") alerts viewers.
  3. Once clicked, audio plays seamlessly for the remainder of the screening session.

---

## 4. Mobile Background Throttling & Tab Suspension

Mobile operating systems (iOS and Android) aggressively throttle background browser tabs to conserve battery:

- When MovieNight is moved to the background, WebRTC video decoding and camera capture are paused by the operating system.
- Audio and DataChannel heartbeats may experience increased latency.
- **Recommendation**: Keep MovieNight in the foreground on mobile devices, or disable automatic screen lock during long watch sessions.

---

## 5. Media Codec Compatibility

MovieNight relies on the client browser's native hardware decoder:

| Codec / Container | Chrome / Edge | Firefox | Safari macOS | Safari iOS |
| :--- | :---: | :---: | :---: | :---: |
| **H.264 (AVC) / MP4** | ✅ Supported | ✅ Supported | ✅ Supported | ✅ Supported |
| **VP8 / WebM** | ✅ Supported | ✅ Supported | ✅ Supported | ✅ Supported |
| **VP9 / WebM** | ✅ Supported | ✅ Supported | ✅ Supported | ✅ Supported |
| **AV1** | ✅ Supported | ✅ Supported | ⚠️ macOS 14+ M3 | ⚠️ A17 Pro+ |
| **Opus Audio (48 kHz)** | ✅ Supported | ✅ Supported | ✅ Supported | ✅ Supported |
| **AAC Audio** | ✅ Supported | ✅ Supported | ✅ Supported | ✅ Supported |
| **HEVC / H.265** | ⚠️ Hardware dependent | ❌ Not supported | ✅ Supported | ✅ Supported |
| **Dolby AC-3 / DTS** | ❌ Not supported | ❌ Not supported | ❌ Not supported | ❌ Not supported |

*Note: If an MKV or MP4 file contains unsupported audio (such as Dolby AC-3 or DTS 5.1), video may play smoothly while audio remains silent. Re-encode audio to AAC or Opus using FFmpeg: `ffmpeg -i input.mkv -c:v copy -c:a aac output.mp4`.*
