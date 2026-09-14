# 🔒 Security, Privacy & Threat Model

MovieNight was built with privacy and security as first-class architectural tenets. This document details MovieNight's trust boundaries, threat model, cryptographic protections, and server-side security controls.

---

## 1. Security Architecture & Trust Boundaries

### In-Transit Encryption
- **Media Plane**: Real-time audio and video tracks flow directly between peer browsers over encrypted **DTLS/SRTP** (Datagram Transport Layer Security / Secure Real-time Transport Protocol).
- **Control Plane**: Room events, chat messages, and clock synchronization heartbeats are encrypted via **SCTP** over DTLS.
- **Signaling Plane**: Signaling exchanges (SDP offers/answers and ICE candidates) are transmitted over TLS-encrypted WebSockets to the PeerJS broker.
- **Proxy Plane**: Remote media requested through the optional `/proxy-video` endpoint is transmitted over HTTPS. The proxy handles transport-level streaming for CORS-restricted hosts.

### Admission Control vs. Authentication
MovieNight implements a **Knock-and-Approval admission control model**:
- When a viewer requests to join a screening room, the host receives an explicit modal alert displaying the participant's chosen display name and avatar.
- The host must manually approve ("Admit") the viewer before any WebRTC media connections or DataChannels are established.
- *Boundary Note*: This constitutes admission control, not cryptographic identity verification. Display names and avatars are user-selected and unauthenticated.

### Ephemeral In-Memory Architecture
- **Zero Database Persistence**: MovieNight has no database. Room codes, participant lists, capability tokens, and chat histories exist solely in the browser RAM of active participants.
- **Zero Media Server Storage**: No MovieNight media server stores or processes the streamed media. Frames are decoded in the browser and transmitted peer-to-peer.
- **Instant Dissolution**: When the last participant exits the room, all state vanishes completely.

### Room Code Routing & Capability Tokens
- **6-Character Room Codes (`ABC-123`)**: Generated via cryptographically secure randomness (`crypto.getRandomValues`) to serve as human-friendly routing identifiers.
- **High-Entropy Capability Tokens**: Direct invite URLs append 128-bit cryptographic tokens (`?room=ABC123&token=...`) to prevent unauthorized discovery.
- **Join Rate Limiting**: The client-side join engine enforces a cooldown limit (max 5 join attempts per minute) to deter brute-force guessing.
- **Session Epochs**: Rooms maintain an incrementing `roomEpoch` to immediately reject delayed or replayed signaling packets from previous sessions.

---

## 2. Threat Model Matrix & Mitigations

| Threat Vector | Risk Level | Mitigation Strategy |
| :--- | :---: | :--- |
| **Room Code Guessing / Brute Force** | Low / Medium | 6-character alphanumeric codes generated via `crypto.getRandomValues`. Client enforces rate limits. Even if a code is guessed, the host must explicitly admit the participant via the Knock-and-Approval modal, or require an invite capability token. |
| **Malicious External Video URLs** | Low / Medium | Video URLs are rendered solely inside standard HTML5 `<video>` elements or sandboxed YouTube `<iframe>` elements. No user-supplied scripts or untrusted code are evaluated. |
| **Signaling Broker Metadata** | Low | The public PeerJS signaling server observes connection metadata (IP addresses, peer IDs) during the initial handshake. For complete infrastructure sovereignty, operators can self-host [PeerServer](https://github.com/peers/peerjs-server). |
| **CORS Proxy & SSRF Abuse** | Low | The Node.js `/proxy-video` endpoint is **disabled by default** (`ENABLE_VIDEO_PROXY=false`, returning 503). When explicitly enabled, it enforces comprehensive defense-in-depth protections (see below). |

---

## 3. CORS Media Proxy (`/proxy-video`) Security Architecture

When streaming direct URLs from third-party media hosts lacking CORS headers (`Access-Control-Allow-Origin: *`), browsers block `<video>` elements from capturing the media stream. MovieNight includes a built-in Node.js Range proxy to bridge this gap.

Because media proxies can become targets for abuse, MovieNight implements multi-layered security protections:

### Defense-in-Depth Controls

1. **Disabled by Default**:
   The `/proxy-video` endpoint returns `503 Service Unavailable` out-of-the-box. Operators must explicitly set `ENABLE_VIDEO_PROXY="true"` and specify an allowlist.

2. **Strict HTTPS Host Allowlist**:
   Proxied URLs must match an explicit hostname allowlist configured via `ALLOWED_PROXY_HOSTS` (supporting exact hostnames and wildcard subdomains, e.g. `*.mycdn.com`). Non-matching hosts are rejected with `403 Forbidden`.

3. **Pre-Flight DNS Resolution & IP Blocklists**:
   Before initiating an outbound connection, the proxy resolves the target hostname and verifies that resolved IP addresses do not belong to:
   - Loopback addresses (`127.0.0.0/8`, `::1`)
   - RFC 1918 Private networks (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`)
   - Link-local and carrier-grade NAT addresses (`169.254.0.0/16`, `100.64.0.0/10`)
   - Cloud metadata services (`169.254.169.254`, `metadata.google.internal`)
   - IPv6 unique local and link-local addresses (`fc00::/7`, `fe80::/10`)

4. **DNS Socket Pinning (Anti-Rebinding)**:
   The HTTP/HTTPS agent connects directly to the pre-validated IP address using a custom `lookup` function. This eliminates Time-of-Check to Time-of-Use (TOCTOU) DNS rebinding vulnerabilities.

5. **Redirect Re-Validation on Every Hop**:
   HTTP redirects (`301`, `302`, `307`, `308`) are followed manually (up to a maximum of 5 hops). Each redirect destination URL is completely re-validated against the allowlist, protocol checks, and IP blocklists.

6. **Protocol & Port Restrictions**:
   Plain `http://` targets are rejected by default (`ALLOW_INSECURE_HTTP_PROXY=false`), and outbound connections are restricted to port `443`.

7. **Range Header Abuse Prevention**:
   HTTP Range requests containing multiple ranges (e.g. `bytes=0-,5-10,15-20`, known as multipart byte-range attacks; CVE-2011-3192) are rejected with `416 Range Not Satisfiable`. Only single byte ranges (`bytes=start-end`) are accepted.

8. **Response Size & Timeout Limits**:
   Requests enforce a 15-second socket timeout and a 2 GB maximum response size ceiling to prevent slowloris attacks and disk/memory exhaustion.

9. **Rate Limiting & Concurrency Controls**:
   The proxy enforces rate limits per client IP (60 req/min) and per target host (30 req/min), alongside concurrency caps (maximum 6 active streams per IP, 30 global).

10. **Safe Response Header Filtering**:
    Sensitive upstream headers (including `Set-Cookie`, `Server`, `X-Powered-By`, and `Access-Control-Allow-Credentials`) are stripped before relaying responses to the client.

---

## 4. Operational Warnings & Scope Clarification

> [!WARNING]
> **No Deep Packet / Content Sanitization**:
> The `/proxy-video` service is strictly a **transport-level HTTP Range streaming forwarder**. It does **not** inspect binary payloads for malware, perform deep packet inspection, or sanitize video/audio container internals.
> 
> Operators must only allowlist trusted, reputable HTTPS media CDNs in `ALLOWED_PROXY_HOSTS`. Never configure open wildcards (`*`) or proxy untrusted URLs from unknown third parties.

---

## 5. Vulnerability Reporting

If you discover a security vulnerability in MovieNight, please review our [Security Policy](https://github.com/sagegallant/movienight/blob/main/SECURITY.md) and report it responsibly via GitHub Private Vulnerability Reporting.
