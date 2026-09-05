# 🎬 MovieNight — P2P Watch Party & Virtual Screening Room

<div align="center">

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)](LICENSE)
[![WebRTC](https://img.shields.io/badge/WebRTC-P2P%20Mesh-339933?style=for-the-badge&logo=webrtc&logoColor=white)](https://webrtc.org/)
[![PeerJS](https://img.shields.io/badge/PeerJS-Signaling-red?style=for-the-badge)](https://peerjs.com/)
[![Video Quality](https://img.shields.io/badge/Quality-Full%20HD%201080p-blue?style=for-the-badge)](https://github.com/SageGallant/movienight)
[![Privacy](https://img.shields.io/badge/Privacy-Zero%20Backend-success?style=for-the-badge)](https://github.com/SageGallant/movienight)
[![PRs Welcome](https://img.shields.io/badge/PRs-Welcome-brightgreen.svg?style=for-the-badge)](https://github.com/SageGallant/movienight/pulls)

<p align="center">
  <strong>Private, serverless peer-to-peer virtual screening room and watch party platform in your browser.</strong><br>
  Stream local movie files, direct video URLs, screen shares, and YouTube embeds in real-time lock-step sync.<br>
  <em>Zero accounts. Zero tracking. Media travels straight from your computer to your friends.</em>
</p>

[**Explore Features**](#-key-features) • [**Architecture**](#-architecture--how-it-works) • [**Quickstart**](#-quickstart--local-development) • [**Deployment**](#-deployment-options) • [**Contributing**](#-contributing)

</div>

---

## 🌟 Why MovieNight?

Most watch party tools (Discord, Teleparty, Zoom, Kast) force everyone through central servers, compress videos to low bitrates, require logins and browser extensions, charge subscriptions for 1080p, or forbid streaming personal media files.

**MovieNight** flips the model on its head:

- 🛡️ **100% Peer-to-Peer Privacy**: Your video stream never touches a central streaming server. Decoded frames travel directly through encrypted WebRTC data and media channels.
- ⚡ **No Accounts or Logins**: Share a 6-character room code (`ABC-123`) or click an invite link.
- 🎥 **Universal Media Support**: Stream local files from your drive, direct URLs, or synchronized YouTube embeds with copyright-compliant platform controls.
- 💎 **True Full HD (1080p @ 12 Mbps)**: Custom RFC 4566 SDP bandwidth injection and resolution preservation prevent browsers from downscaling to blurry 360p.
- 🕒 **Sub-Second Drift Correction**: Presenter clock heartbeats and late-joiner recovery ensure all screens play the exact same millisecond.
- 🍿 **Interactive Cinema Stage**: Responsive 16:9 theater, live emoji sparks, webcam grids, and collapsible chat drawer.

---

## 🚀 Key Features

### 1. 🎞️ Triple-Mode Video Pipeline
- **Local Media Files**: Drop an `.mp4`, `.mkv`, `.webm`, `.mov`, or `.avi` from your desktop. The browser decodes it natively in hardware and broadcasts high-bitrate video/audio tracks via WebRTC mesh without uploading anywhere.
- **Direct Video URLs & CDN Streams**: Stream web links directly. Includes built-in Range HTTP proxy support (`/proxy-video`) to defeat CORS limitations on external media servers.
- **Platform Embeds (YouTube, Vimeo, Twitch)**: Synchronized embedding using official IFrame APIs and bidirectional `postMessage` protocol — copyright-compliant, high-fidelity, and synced across all viewers.

### 2. ⚡ Full HD 1080p WebRTC Engineering
- **RFC 4566 SDP Munging**: Injects bandwidth allocation (`b=AS:12000`, `b=TIAS:12000000`) up to 12 Mbps.
- **High-Bitrate Fast Ramp**: Injects Google WebRTC parameters (`x-google-min-bitrate=2500; x-google-start-bitrate=6000; x-google-max-bitrate=12000`) into video payloads so connections start immediately in crisp HD instead of ramping up slowly from 300 kbps.
- **Resolution Preservation**: Uses `degradationPreference = "maintain-resolution"` and `contentHint = "detail"`, forcing WebRTC to protect 1080p resolution rather than downscaling.
- **Studio Audio**: Decodes 256 kbps Stereo Opus (`stereo=1; sprop-stereo=1; maxaveragebitrate=256000`) with native multi-channel surround sound downmix protection.

### 3. ⏱️ Sub-Second Sync Engine
- **Presenter Clock Beacon**: Presenter broadcasts periodic sync packets containing authoritative time, play/pause states, and high-resolution timestamps.
- **Drift Auto-Correction**: Participants automatically align playback offset if network buffering causes $> 0.8$s drift.
- **Late-Join Time Recovery**: Late-joining or reconnecting friends calculate network transit offset $\Delta t = (Date.now() - timestamp) / 1000$ and jump to the exact room position.
- **Host Override Authority**: The room host can pause, resume, or seek the video even when another participant is presenting.

### 4. 🍿 Movie Mode & Interactive Theater
- **Cinema Layout**: Distraction-free 16:9 theater stage with responsive scaling and fullscreen mode (<kbd>F</kbd>).
- **Simultaneous Webcams & Mics**: Participant video tiles line both sides of the cinema screen so you can watch each other's reactions without covering the movie.
- **Live Emoji Sparks**: Real-time reaction overlays (`❤️`, `🔥`, `👏`, `😂`, `🍿`, `🎬`) burst across the room on click.
- **Backrow Chat**: Collapsible side drawer with timestamps, auto-scroll, unread indicators, and customizable avatars.
- **Generative Avatars**: SVG robot avatars generated procedurally from custom seeds with customizable facial expressions, mouth types, antennae, and colors.

### 5. 🛡️ Room Governance & Security
- **Knock & Approval Admission**: Strangers cannot crash private screening rooms; host receives an instant approval modal.
- **Room Controls**: Host can kick users, force stop presenter streams, or migrate ownership if they depart.
- **Zero Traces Left Behind**: Rooms are ephemeral — as soon as the last participant leaves, the room dissolves completely.

---

## 📊 Feature Comparison

| Feature | MovieNight | Teleparty / Netflix Party | Discord Screen Share | Zoom / Meet |
| :--- | :---: | :---: | :---: | :---: |
| **Local File Streaming** | ✅ **Direct P2P (No Upload)** | ❌ No | ⚠️ Window Scrape | ⚠️ Laggy Window |
| **1080p Full HD Free** | ✅ **Yes (12 Mbps)** | ⚠️ Platform Limited | ❌ Nitro Required ($9.99/mo) | ❌ 720p Cap |
| **Account Required?** | ❌ **No (Zero Sign-up)** | ❌ Paid Account | ❌ Discord Account | ❌ Required |
| **Media Stored on Server?** | ❌ **Never (Zero-Knowledge)**| ⚠️ Central Servers | ⚠️ Central Relays | ⚠️ Central Relays |
| **YouTube Dual-Mode Sync** | ✅ **Native API + Embed** | ❌ No | ❌ No (Capture only) | ❌ Echo Issues |
| **Client-Side Host Control** | ✅ **Full Authority** | ⚠️ Host Only | ❌ Presenter only | ⚠️ Host Mute only |
| **Browser Extensions Needed?**| ❌ **None (Pure HTML5)** | ❌ Chrome Extension | ❌ App recommended | ❌ App recommended |
| **Open Source** | ✅ **MIT License** | ❌ Proprietary | ❌ Proprietary | ❌ Proprietary |

---

## 🏗️ Architecture & How It Works

```
                     +-----------------------------+
                     |   PeerJS Cloud / Broker     |
                     |   (Signaling & ICE Discovery)
                     +--------------+--------------+
                                    |
          Room Connection Request   |   SDP Offer / Answer & ICE
          (Knock & Approval)        |   (RFC 4566 Munged @ 12 Mbps)
                                    v
     +-------------------------------------------------------------+
     |                                                             |
     v                                                             v
+----+----------------------+                    +-----------------+-------------------+
|     PRESENTER / HOST      |  WebRTC P2P Mesh   |          PARTICIPANT 1              |
|                           |===================>|                                     |
|  - video.captureStream()  |  1080p Video Track |  - remoteStream -> <video>          |
|  - Stereo Opus Audio      |  256 kbps Audio    |  - Sub-second Heartbeat Sync Engine |
|  - Authoritative Clock    |  DataChannel Sync  |  - Bidirectional Emoji Reactions    |
+-------------+-------------+                    +-----------------+-------------------+
              |                                                    ^
              |               WebRTC Mesh Connection               |
              +====================================================+
              |
              v
+-------------+---------------------+
|        PARTICIPANT 2              |
|                                   |
|  - Webcams & Mics Mesh            |
|  - Backrow Chat DataChannel       |
+-----------------------------------+
```

### Video Stream Quality Pipeline

```
[Local File / Direct URL / YouTube]
                 │
                 ▼
      [Native HTML5 Video Element]
                 │
                 ├─► video.captureStream()
                 │   └─► track.contentHint = "detail"
                 │
                 ├─► Native Decoded Stereo Audio (48 kHz)
                 │
                 ▼
   [PeerConnection setLocalDescription]
                 │
                 ├─► SDP Munge: b=AS:12000 / b=TIAS:12000000
                 ├─► SDP Munge: x-google-start-bitrate=6000
                 ├─► SDP Munge: stereo=1; maxaveragebitrate=256000
                 │
                 ▼
  [Sender degradationPreference: "maintain-resolution"]
                 │
                 ▼
  [WebRTC Encrypted SRTP Mesh Delivery (1080p @ 60fps)]
```

---

## 💻 Quickstart & Local Development

### Prerequisites
- [Node.js](https://nodejs.org/) 16+ (or any modern web server)
- Modern browser with WebRTC support (Chrome, Edge, Firefox, Brave, Safari)

### 1. Clone the Repository
```bash
git clone https://github.com/SageGallant/movienight.git
cd movienight
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Start the Development Server
```bash
npm start
```
The server will start at `http://localhost:3000`.

### 4. Create or Join a Room
1. Open `http://localhost:3000` in your browser.
2. Enter your display name and choose an avatar.
3. Click **START A NEW SCREENING** to create a room.
4. Copy the room code (`ABC-123`) or share the invite URL (`http://localhost:3000/?room=ABC123`).
5. Open a second tab or send the link to a friend to join.
6. Click **STREAM A VIDEO** to choose a local movie or paste a video/YouTube URL!

---

## 🌐 Deployment Options

MovieNight is engineered to run as a **zero-configuration static site** or with an **optional proxy server**.

### Option A: GitHub Pages (1-Click Static Deployment)
Deploy effortlessly using the included GitHub Pages workflow:

```bash
npm run deploy:gh-pages
```

Or deploy manually via GitHub Settings:
1. Fork or push this repository to GitHub.
2. Go to **Settings > Pages**.
3. Under **Build and deployment > Branch**, select `gh-pages` (or `main`) and `/ (root)`.
4. Visit `https://<your-username>.github.io/<repo-name>/`.

### Option B: Node.js VPS / Docker
Running `node server.js` provides the built-in HTTP Range CORS proxy (`/proxy-video`), enabling playback of external video URLs whose hosts do not provide CORS headers:

```bash
# Run in background with PM2
npm install -g pm2
pm2 start server.js --name "movienight"
```

### Option C: Static Hosting (Vercel, Netlify, Cloudflare Pages)
Simply connect your repository to Vercel, Netlify, or Cloudflare Pages. No build command is required — set the publish directory to `./` (root).

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

- **Core**: Vanilla HTML5, Modern CSS3, Vanilla ECMAScript (ES6+)
- **Networking**: [WebRTC](https://webrtc.org/) (Real-Time Communication) & [PeerJS](https://peerjs.com/)
- **Audio & Video Engine**: HTML5 Media CaptureStream API, Web Audio API, RFC 4566 SDP Munging
- **Embeds**: YouTube IFrame Player API with bidirectional message synchronization
- **Proxy Server**: Node.js `http`, `https`, and Stream Pipelines with HTTP Range requests
- **Icons & Visuals**: Font Awesome 6, Procedural SVG generative avatars

---

## 🔒 Security & Privacy Notice

- **Zero Data Retention**: MovieNight operates with zero server-side databases. Messages and media streams exist only in peer memory.
- **End-to-End Encryption**: WebRTC connections are cryptographically encrypted via DTLS/SRTP by the browser.
- **Directory Traversal Protection**: The included Node.js server strictly validates paths to prevent path traversal (`../`) vulnerabilities.
- **CORS Video Proxy**: Proxies only requested video binary chunks with content sanitization.
- **Copyright Compliance**: YouTube, Vimeo, and Facebook videos are embedded directly using official platform player APIs rather than extracted, honoring platform terms of service.

---

## 🤝 Contributing

Contributions make the open-source community thrive! Any improvements, bug fixes, or suggestions are welcome.

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'feat: Add AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

## 📄 License

Distributed under the **MIT License**. See [`LICENSE`](LICENSE) for more information.

---

<div align="center">
  <sub>Built with ❤️ for movie lovers and privacy enthusiasts. If you find MovieNight helpful, please give it a ⭐ on GitHub!</sub>
</div>
