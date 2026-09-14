# 🎬 MovieNight Documentation Wiki

Welcome to the official technical documentation and architecture reference for **MovieNight** — a private, small-group peer-to-peer virtual screening room and watch party application running directly in the browser.

---

### 🗺️ Wiki Navigation

| Section | Description |
| :--- | :--- |
| 📖 **[[User Guide & Room Controls]]** | Complete user manual on creating rooms, knock-and-approval admission, streaming local files, direct URLs, YouTube embeds, and cinema shortcuts. |
| 🏗️ **[[WebRTC & Sync Engine Architecture]]** | Deep-dive into connection separation (SRTP media vs SCTP DataChannel), SDP munging hints (`b=AS`, `b=TIAS`), Opus stereo negotiation, timeline modeling, and 3-tier drift correction. |
| 📈 **[[Operating Envelope & Performance]]** | Empirical 2–6 participant benchmark matrix (upload bandwidth, RTT, jitter, packet loss, frame drops, sync drift) and host uplink scaling analysis. |
| 📱 **[[Browser Compatibility & Limitations]]** | 5-column browser matrix (Chrome, Firefox, Safari macOS, iOS Safari, Android Chrome), mobile sandboxing limits, autoplay policies, and codec support. |
| 🔒 **[[Security, Privacy & Threat Model]]** | Threat model matrix, trust boundaries, DTLS/SRTP encryption, ephemeral in-memory state, and SSRF-hardened CORS proxy architecture. |
| 🌐 **[[Self-Hosting & Deployment Guide]]** | Deployment options: GitHub Pages, self-hosted Node.js VPS with PM2, environment variables reference, and custom TURN relay configuration. |
| 🛠️ **[[Troubleshooting & FAQ]]** | Step-by-step diagnostics for NAT/firewall traversal, autoplay audio blocks, CORS proxy errors, and codec playback issues. |

---

### 🌟 Project Philosophy & Core Claims

MovieNight was built to deliver uncompromising streaming quality and privacy without requiring expensive cloud media servers or proprietary plugins:

1. **Private P2P Mesh**: Media is streamed directly between browsers using WebRTC DTLS/SRTP encryption, with PeerJS used for signaling and room coordination.
2. **Zero Media Server Storage**: No MovieNight media server stores or processes the streamed media. Frames are decoded locally by browser hardware and relayed peer-to-peer.
3. **Operating Envelope (2–6 Participants)**: Explicitly designed and tested for small groups of up to 6 participants, enforcing adaptive bitrate tiers (`SOLO`, `SMALL`, `MEDIUM`, `CONSTRAINED`) to safeguard host uplink bandwidth.
4. **Deterministic Playback Synchronization**: Playback synchronization uses host timeline timestamps, NTP-style latency compensation, and 3-tier drift correction.
5. **Hybrid Connectivity**: Direct WebRTC connectivity is preferred; TURN provides relay fallback when direct connectivity isn't possible behind restrictive NATs or symmetric corporate firewalls.

---

### 🔗 Quick Links

- **Main Repository**: [github.com/sagegallant/movienight](https://github.com/sagegallant/movienight)
- **Live Demo**: [sagegallant.github.io/movienight](https://sagegallant.github.io/movienight/)
- **Bug Reports & Issues**: [github.com/sagegallant/movienight/issues](https://github.com/sagegallant/movienight/issues)
- **Security Policy**: [SECURITY.md](https://github.com/sagegallant/movienight/blob/main/SECURITY.md)
- **Contribution Guide**: [CONTRIBUTING.md](https://github.com/sagegallant/movienight/blob/main/CONTRIBUTING.md)
