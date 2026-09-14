# 📖 User Guide & Room Controls

Welcome to the MovieNight user guide. This manual covers everything you need to know about creating rooms, knock-and-approval admission, streaming media across all 4 modes, and navigating the cinema interface.

---

## 1. Creating & Hosting a Screening Room

### Starting a Screening
1. Navigate to the MovieNight homepage.
2. Type in your preferred **Display Name**.
3. Choose an avatar from the avatar selector or generate a new random seed.
4. Click **START A NEW SCREENING**.
5. You will enter the private cinema stage. A unique 6-character room code (e.g., `ABC-123`) is assigned to your room.

### Inviting Participants
- Click the **INVITE** button in the top navigation bar.
- This copies the direct screening room URL, which includes a 128-bit cryptographic capability token:
  ```
  https://sagegallant.github.io/movienight/?room=ABC123&token=...
  ```
- Send this link to your friends via Discord, WhatsApp, Telegram, or email.

### Knock-and-Approval Admission Flow
MovieNight protects your privacy by requiring host authorization before any participant enters:
1. When a viewer opens your link, they enter an ephemeral lobby.
2. A knock notification modal appears on the host screen: *"Participant [Name] wants to join"*.
3. Click **Admit** to grant entry, or **Decline** to reject.
4. Once admitted, WebRTC DTLS/SRTP audio/video tracks and SCTP DataChannels establish automatically.

---

## 2. Joining an Existing Room

1. Click an invite link, or open MovieNight and enter the 6-character room code in the **JOIN ROOM** card.
2. Enter your display name and choose an avatar.
3. Click **JOIN SCREENING ROOM**.
4. Wait briefly while the host reviews your knock request. Once admitted, you will be transitioned directly to the screening room in lock-step sync!

---

## 3. Streaming Modes

MovieNight provides 4 distinct streaming pipelines:

### Mode A: Local Video Files (Highest Quality)
Best for movies, high-bitrate clips, and personal video libraries stored on your hard drive:
1. Click **STREAM A VIDEO** on the cinema stage.
2. Select **Open Local File**.
3. Browse and select your `.mp4`, `.webm`, `.mov`, or `.mkv` file.
4. The file is decoded in hardware by your browser and broadcast directly to peer viewers via WebRTC `captureStream()`.
5. *Tip*: Standard H.264/AAC MP4 or VP8/VP9 WebM files provide the best cross-platform compatibility.

### Mode B: Direct Video URLs
Best for files hosted on cloud storage, web servers, or media CDNs:
1. Click **STREAM A VIDEO** ➔ select **Direct Video URL**.
2. Paste the HTTPS link to the media file (e.g. `https://cdn.example.com/movie.mp4`).
3. Click **Load Stream**.
4. If the destination server allows cross-origin requests, it plays directly. If CORS headers are missing and you are using a self-hosted Node.js instance, MovieNight routes the video chunks through `/proxy-video` with HTTP Range forwarding.

### Mode C: YouTube Platform Sync
Best for YouTube videos, trailers, podcasts, and livestreams:
1. Click **STREAM A VIDEO** ➔ select **YouTube URL**.
2. Paste any YouTube video link (`https://www.youtube.com/watch?v=...` or `https://youtu.be/...`).
3. Click **Load YouTube**.
4. MovieNight mounts the synchronized YouTube IFrame player. Play, pause, seek, and rate adjustments sync bidirectionally without sending raw video streams across peers.

### Mode D: Screen & Window Sharing
Best for streaming presentations, desktop applications, or browser tabs:
1. Click **SHARE SCREEN** on the cinema stage.
2. Select whether to share an entire screen, an application window, or a browser tab.
3. Check the **Share system audio** checkbox if you want participants to hear audio from your screen.
4. Click **Share**.

---

## 4. Cinema Theater Controls

- **Cinema Mode (16:9 Fullscreen)**: Press <kbd>F</kbd> or click the cinema expand icon to immerse yourself in distraction-free theater view.
- **Emoji Sparks**: Click any emoji button in the reaction dock (`❤️`, `🔥`, `👏`, `😂`, `🍿`, `🎬`) to blast animated floating reactions across all participants' screens in real time.
- **Backrow Chat**: Toggle the chat drawer with <kbd>C</kbd> or the chat bubble icon. Send messages, view timestamps, and see who is actively watching.
- **Diagnostics HUD**: Click the network signal indicator to inspect real-time WebRTC statistics (RTT, packet loss, jitter, and transport route).
- **Webcam & Mic Controls**: Toggle your camera or microphone at any time using the quick-action icons in the lower participant rail.

---

## 5. Keyboard Shortcuts

| Shortcut | Action |
| :---: | :--- |
| <kbd>Space</kbd> / <kbd>K</kbd> | Toggle Play / Pause |
| <kbd>F</kbd> | Toggle Fullscreen Cinema Mode |
| <kbd>M</kbd> | Toggle Video Audio Mute / Unmute |
| <kbd>C</kbd> | Toggle Backrow Chat Sidebar |
| <kbd>→</kbd> | Seek forward 10 seconds |
| <kbd>←</kbd> | Seek backward 10 seconds |
| <kbd>Esc</kbd> | Close active modal / Exit fullscreen |
