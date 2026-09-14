# 🏗️ WebRTC & Sync Engine Architecture

This document details the low-level media transport architecture, SDP munging engine, synchronization protocol, and adaptive bandwidth controls powering MovieNight.

---

## 1. Connection & Transport Separation

MovieNight enforces strict isolation between real-time media transmission and room state coordination:

- **Media Plane (DTLS / SRTP)**: High-bandwidth video and audio tracks flow directly between peer browsers over encrypted DTLS-SRTP. The media plane bypasses all intermediate servers.
- **Control Plane (SCTP DataChannel)**: Room events, chat messages, emoji bursts, knock admission approvals, and clock synchronization heartbeats flow across bidirectional, reliable WebRTC DataChannels.
- **Signaling Broker (PeerJS / PeerServer)**: Conducts initial SDP Offer/Answer handshakes and ICE candidate exchange. Once WebRTC peer connections reach `'connected'`, the signaling broker is completely bypassed.

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

---

## 2. Video Stream Quality Optimization Pipeline

Standard WebRTC stacks default to low-bitrate videoconferencing profiles (~300 kbps) and dynamically degrade resolution to 360p under slight CPU or network contention. MovieNight overrides these behaviors to maintain native 1080p Full HD video fidelity:

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

### Key Technical Mechanisms

1. **Content Hint Tagging**: Sets `videoTrack.contentHint = 'detail'`. This instructs the WebRTC encoder (libvpx / OpenH264) to prioritize spatial detail and sharp text edges over framerate during minor throughput fluctuations.
2. **SDP Bandwidth Hints**: Injects `b=AS:12000` (application-specific bandwidth in kbps) and `b=TIAS:12000000` (Transport Independent Application Specific bandwidth in bps) into the session description. This signals an upper ceiling of 12 Mbps to browser rate controllers.
3. **Fast Ramp Start Bitrate**: Appends `x-google-start-bitrate=6000` to video format attributes (`a=fmtp`), preventing the browser from starting at 300 kbps and gradually ramping up over several minutes.
4. **Resolution Retention**: Sets `sender.setParameters({ degradationPreference: 'maintain-resolution' })`, ensuring the encoder reduces framerate rather than downscaling 1080p pixels when network capacity drops.
5. **Full-Bandwidth Stereo Opus Audio**: Rewrites Opus format parameters to `stereo=1; sprop-stereo=1; maxaveragebitrate=256000`, enabling true 48 kHz stereo audio at up to 256 kbps.

---

## 3. Deterministic Playback Synchronization

MovieNight implements an NTP-inspired, timestamp-based synchronization engine. The host acts as the central timeline authority, broadcasting continuous state packets over the SCTP DataChannel:

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

### Synchronization Protocol Phases

#### Phase 1: NTP Latency & Clock Offset Estimation
- The viewer initiates a two-way round-trip handshake: sends `clock_ping` at local time $t_0$.
- The host timestamps receipt ($t_1$), queues immediate reply ($t_2$), and sends `clock_pong`.
- Upon receipt at $t_3$, the viewer calculates the round-trip time ($\text{RTT}$) and clock offset ($\theta$):
  $$\text{RTT} = (t_3 - t_0) - (t_2 - t_1)$$
  $$\theta = \frac{(t_1 - t_0) + (t_2 - t_3)}{2}$$
- An **8-sample sliding-window median filter** discards transient latency spikes caused by Wi-Fi jitter.

#### Phase 2: Host Timeline Modeling
The viewer continuously models where the host's playhead is at any instantaneous local high-resolution timestamp (`performance.now()`):
$$\text{targetPosition} = \text{hostPosition} + (\text{localTime} - (\text{hostTimestamp} + \theta)) \times \text{playbackRate}$$

#### Phase 3: 3-Tier Drift Evaluation
Every 1,000 ms (and immediately upon state changes), the viewer computes the signed drift:
$$\text{drift} = \text{localCurrentTime} - \text{targetPosition}$$

The viewer then applies the appropriate tier:
1. **Tier 1: In-Sync ($|\text{drift}| \le 150\text{ ms}$)**: Playback rate remains exactly `1.0x`. There is zero audible stutter or video skip.
2. **Tier 2: Micro-Adjustment ($150\text{ ms} < |\text{drift}| \le 1500\text{ ms}$)**: The viewer dynamically shifts playback rate:
   - If ahead ($\text{drift} > 0$): Playback rate is throttled to `0.95x`.
   - If behind ($\text{drift} < 0$): Playback rate is accelerated to `1.05x`.
   - The browser's native pitch-correction algorithm keeps pitch intact, silently realigning the streams without perceptible artifacts.
3. **Tier 3: Hard Seek ($|\text{drift}| > 1500\text{ ms}$)**: If a network hiccup or user scrub causes drift exceeding 1.5 seconds, the viewer immediately executes `video.currentTime = targetPosition`.

#### Phase 4: Deterministic Late-Joiner Recovery
When a new participant joins midway through a movie, they receive the host's current epoch, playback state, and timestamp during the knock admission handshake. The viewer executes an immediate seek to the calculated target position, instantly aligning with the ongoing screening.

---

## 4. Adaptive Bandwidth & Bitrate Tiers

To prevent overloading the host's uplink connection, MovieNight dynamically adjusts video bitrates and resolution recommendations based on the active mesh size:

| Tier Name | Mesh Size | Target Bitrate per Viewer | Recommended Resolution | Degrade Policy |
| :--- | :---: | :---: | :---: | :--- |
| **`SOLO`** | 2 (Host + 1 Viewer) | 2.5–3.0 Mbps | 1080p @ 60fps | `maintain-resolution` |
| **`SMALL`** | 3–4 (Host + 2–3 Viewers) | 1.8–2.5 Mbps | 1080p @ 30fps | `maintain-resolution` |
| **`MEDIUM`** | 5 (Host + 4 Viewers) | 1.5–2.0 Mbps | 720p @ 30fps | Balanced |
| **`CONSTRAINED`** | 6 (Host + 5 Viewers) | 1.2–1.8 Mbps | 720p @ 30fps | `maintain-framerate` |

When a participant joins or departs, `RoomManager` recalculates the tier and updates outbound `RTCRtpSender` parameters without interrupting active streaming.

---

## 5. Hybrid Connectivity & NAT Traversal

```
                   [Host Browser]
                         │
        ┌────────────────┴────────────────┐
        ▼                                 ▼
   [Public STUN]                     [Direct P2P]
  NAT Port Mapping             (Success: SRTP Direct)
        │                                 │
        ▼ (Symmetric NAT Block)           │
   [TURN Relay] ◄─────────────────────────┘
  (Fallback via Coturn/Relay)
        │
        ▼
  [Viewer Browser]
```

- **Direct WebRTC Preferred**: Direct P2P connectivity is preferred and attempted first (`iceTransportPolicy: "all"`).
- **Public STUN**: Uses Google and Twilio public STUN servers to discover external IP mappings and NAT types.
- **Configurable TURN Fallback**: When symmetric NATs or restrictive firewalls block direct hole punching, media seamlessly routes through configured TURN relays. Custom TURN server credentials can be configured dynamically in the UI or stored in `localStorage`.
