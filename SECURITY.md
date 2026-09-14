# Security Policy

## Supported Versions

Only the current minor release branch receives security updates.

| Version | Supported          |
| :--- | :---: |
| 1.1.x   | :white_check_mark: |
| < 1.1.0 | :x:                |

---

## Reporting a Vulnerability

If you discover a security vulnerability in MovieNight, please report it responsibly rather than opening a public issue on GitHub.

- **Email**: `security@movienight.app` (or contact repository maintainers via private vulnerability reporting on GitHub).
- **Response Timeline**:
  - **Initial Acknowledgment**: Within 48 hours.
  - **Assessment & Triage**: Within 7 calendar days.
  - **Patch & Advisory Release**: Coordinated with the reporter before public disclosure.

Please provide:
1. Detailed description of the vulnerability and its potential impact.
2. Step-by-step reproduction instructions or proof-of-concept (PoC).
3. Browser versions, operating system, and network environment tested.

---

## Security Architecture & Trust Boundaries

MovieNight is designed as a small-group peer-to-peer watch party application. Understanding the trust boundaries and data visibility is essential:

### 1. In-Transit Encryption & Data Planes
- **WebRTC Transport**: WebRTC media and DataChannel traffic are encrypted in transit by browser-managed **DTLS** (Datagram Transport Layer Security), **SRTP** (Secure Real-time Transport Protocol), and **SCTP**.
- **Signaling Plane**: Ephemeral signaling metadata (IP addresses, peer IDs, SDP offers/answers, and ICE candidates) is coordinated through the PeerJS broker. Signaling metadata is visible to the signaling service. For total infrastructure autonomy, operators may self-host [PeerServer](https://github.com/peers/peerjs-server).
- **Relayed Media (TURN)**: When direct P2P connections cannot be established (e.g. restrictive corporate/symmetric NAT firewalls), media packets relay through the configured TURN server. Relayed DTLS/SRTP packets are encrypted in transit, but routing metadata and packet flows pass through the TURN relay.
- **Embedded Players (YouTube)**: YouTube videos are rendered via official sandboxed `<iframe>` embeds governed by Google/YouTube privacy policies and browser origin isolation.

### 2. Room Code & Admission Model
- **Admission Control vs. Identity Verification**: The host Knock-and-Approval modal provides **admission control**, not cryptographic identity verification. Participant names and avatars are self-selected and unauthenticated.
- **Room Codes are Routing Identifiers**: 6-character room codes (`ABC-123`) serve as human-readable routing identifiers for convenience, **not** secret cryptographic passwords.
- **Capability Tokens**: Room invite links include high-entropy 128-bit capability tokens (`?room=ABC123&token=...`) to authorize invitations.
- **Join Rate-Limiting**: The client enforces rate limiting on join attempts (max 5 per minute) to deter automated probing.
- **Session Epochs**: Rooms maintain an epoch generation timestamp (`roomEpoch`) to reject stale or replayed signaling messages from previous room sessions.

### 3. Video Proxy Boundary (`/proxy-video`)
The Node.js video proxy is provided as an optional helper to forward HTTP Range requests with CORS headers for video capture:
- **Disabled by Default**: The proxy is disabled out of the box in public deployments (`ENABLE_VIDEO_PROXY=false`), returning `503 Service Unavailable`.
- **Explicit HTTPS Host Allowlist**: When enabled, the proxy requires an explicit allowlist (`ALLOWED_PROXY_HOSTS`). Only listed HTTPS domains are proxied; plain HTTP is forbidden by default.
- **SSRF & DNS Rebinding Defenses**: Pre-flight DNS resolution rejects loopback, RFC 1918 private subnets, link-local, carrier-grade NAT, and cloud metadata (`169.254.169.254`). Outbound sockets are pinned directly to the resolved IP to prevent TOCTOU DNS rebinding.
- **Redirect Revalidation**: Redirects are revalidated against the allowlist and DNS blocklist on every hop (max 3 hops).
- **Header & Payload Sanitization**: The proxy strips upstream `Set-Cookie`, `Server`, `X-Powered-By`, and internal headers. Range headers are strictly validated to prevent multipart range amplification attacks (CVE-2011-3192).
- **Scope Notice**: The proxy is a streaming forwarder for `<video>` CORS capture, **not** an antivirus or content-sanitization firewall. Only reputable HTTPS media hosts should be allowlisted.
