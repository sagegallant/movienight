// ============================================================
// Echo Rooms — App State
// ============================================================
const state = {
  peer: null,
  peerId: null,
  roomId: null,
  userId: null,
  username: null,
  avatar: null,
  connections: {},       // active peer connections
  participants: {},      // participant info by userId
  isRoomCreator: false,
  screenShareStream: null,
  screenShareCalls: {},  // media calls for screen sharing
  screenShareUser: null,
  screenShareUserId: null,
  isDarkMode: false,
  selectedAvatar: null,
  connectionStatus: "disconnected",
  hostClaimRetries: 0,
  joinRetries: 0,
  movieMode: false,

  // Host Approval & Controls
  pendingJoinRequests: {}, // peerId -> { conn, metadata }
  isJoinApproved: false,
  currentApprovalPeerId: null,

  // Group Video Watching
  groupVideoStream: null,
  groupVideoElement: null,
  groupVideoCalls: {},
  isGroupVideoPresenter: false,
  groupVideoTitle: null,
  groupVideoIsUrl: false,
  groupVideoUrl: null,
  groupVideoIsEmbed: false,
  groupVideoEmbed: null,
  ytPlayer: null,
  ytPlayerReady: false,
  pendingYtSync: null,
  groupVideoDuration: 0,
  groupVideoCurrentTime: 0,
  groupVideoIsPlaying: false,
  ignoreYtStateEvents: false,
  videoSyncHeartbeatTimer: null,
  transportTickerTimer: null,
  reconnectAttempts: 0,
  reconnectTimer: null,

  // Webcam Watch Together
  webcamStream: null,
  webcamCalls: {},

  // Mic
  micStream: null,
  micCalls: {},
  isMicOn: false,
};

// ============================================================
// WebRTC SDP Bandwidth Munging (Protects Against High-Bitrate Choking)
// ============================================================
function mungeSdpBandwidth(sdp) {
  if (!sdp || typeof sdp !== "string") return sdp;
  const lines = sdp.split("\r\n");
  const newLines = [];
  let currentMedia = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith("m=video")) {
      currentMedia = "video";
      newLines.push(line);
      newLines.push("b=AS:5000");      // 5 Mbps cap for video
      newLines.push("b=TIAS:5000000");
      continue;
    } else if (line.startsWith("m=audio")) {
      currentMedia = "audio";
      newLines.push(line);
      newLines.push("b=AS:128");       // 128 kbps cap for audio
      newLines.push("b=TIAS:128000");
      continue;
    } else if (line.startsWith("m=")) {
      currentMedia = null;
    }

    if (currentMedia === "video" && (line.startsWith("b=AS:") || line.startsWith("b=TIAS:"))) {
      continue; // Replace existing video bandwidth
    }
    if (currentMedia === "audio" && (line.startsWith("b=AS:") || line.startsWith("b=TIAS:"))) {
      continue; // Replace existing audio bandwidth
    }

    newLines.push(line);
  }

  return newLines.join("\r\n");
}

if (typeof window !== "undefined" && window.RTCPeerConnection) {
  const origSetLocalDesc = window.RTCPeerConnection.prototype.setLocalDescription;
  window.RTCPeerConnection.prototype.setLocalDescription = function (desc) {
    if (desc && desc.sdp) {
      try { desc.sdp = mungeSdpBandwidth(desc.sdp); } catch (e) { console.warn("SDP munge error:", e); }
    }
    return origSetLocalDesc.apply(this, arguments);
  };

  const origSetRemoteDesc = window.RTCPeerConnection.prototype.setRemoteDescription;
  window.RTCPeerConnection.prototype.setRemoteDescription = function (desc) {
    if (desc && desc.sdp) {
      try { desc.sdp = mungeSdpBandwidth(desc.sdp); } catch (e) { console.warn("SDP munge error:", e); }
    }
    return origSetRemoteDesc.apply(this, arguments);
  };
}

// ============================================================
// Dual-Channel YouTube Control Helper (API + PostMessage)
// ============================================================
function sendYouTubeCommand(func, args = []) {
  if (state.ytPlayer && typeof state.ytPlayer[func] === "function") {
    try {
      state.ytPlayer[func](...args);
    } catch (e) {
      console.warn(`state.ytPlayer.${func} error:`, e);
    }
  }

  const iframe = document.getElementById("yt-player-target") ||
                 document.querySelector("#group-video-player-container iframe") ||
                 document.getElementById("group-video-player");
  if (iframe && iframe.contentWindow) {
    try {
      iframe.contentWindow.postMessage(JSON.stringify({
        event: "command",
        func: func,
        args: args,
      }), "*");
    } catch (e) {
      console.warn("postMessage to YT iframe error:", e);
    }
  }
}

// Listen to postMessage from YouTube iframe
if (typeof window !== "undefined") {
  window.addEventListener("message", (event) => {
    if (!event.data || typeof event.data !== "string") return;
    try {
      const msg = JSON.parse(event.data);
      if (msg.event === "onStateChange") {
        const stateId = msg.info;
        if (state.isGroupVideoPresenter && !state.ignoreYtStateEvents) {
          let curTime = 0;
          let dur = state.groupVideoDuration || 0;
          if (state.ytPlayer && typeof state.ytPlayer.getCurrentTime === "function") {
            try { curTime = state.ytPlayer.getCurrentTime() || 0; } catch (e) {}
          }
          if (state.ytPlayer && typeof state.ytPlayer.getDuration === "function") {
            try { dur = state.ytPlayer.getDuration() || dur; } catch (e) {}
          }
          if (stateId === 1) { // PLAYING
            updateTransportPlayButton(true);
            broadcastToPeers({
              type: "group_video_sync",
              action: "play",
              time: curTime,
              duration: dur,
              paused: false,
              timestamp: Date.now(),
            });
            startPresenterHeartbeat();
          } else if (stateId === 2) { // PAUSED
            updateTransportPlayButton(false);
            broadcastToPeers({
              type: "group_video_sync",
              action: "pause",
              time: curTime,
              duration: dur,
              paused: true,
              timestamp: Date.now(),
            });
            stopPresenterHeartbeat();
          } else if (stateId === 0) { // ENDED
            stopGroupVideo();
          }
        }
      } else if (msg.event === "infoDelivery" && msg.info) {
        if (typeof msg.info.duration === "number" && msg.info.duration > 0) {
          state.groupVideoDuration = msg.info.duration;
        }
      }
    } catch (e) {}
  });
}

// ============================================================
// DOM Elements
// ============================================================
const elements = {
  // Screens
  homeScreen:           document.getElementById("home-screen"),
  chatRoom:             document.getElementById("chat-room"),

  // Home screen
  usernameInput:        document.getElementById("username"),
  roomIdInput:          document.getElementById("room-id"),
  createRoomBtn:        document.getElementById("create-room-btn"),
  joinRoomBtn:          document.getElementById("join-room-btn"),
  refreshAvatarsBtn:    document.getElementById("refresh-avatars"),
  customAvatarToggle:   document.getElementById("custom-avatar-toggle"),
  customAvatarPanel:    document.getElementById("custom-avatar-panel"),
  customAvatarUrlInput: document.getElementById("custom-avatar-url"),
  useCustomAvatarBtn:   document.getElementById("use-custom-avatar"),
  avatars:              document.querySelectorAll(".avatar-opt"),

  // Room header
  roomInfoBtn:          document.getElementById("room-info-btn"),
  participantCount:     document.getElementById("participant-count"),
  groupVideoBtn:        document.getElementById("group-video-btn"),
  toggleCameraBtn:      document.getElementById("toggle-camera-btn"),
  shareScreenBtn:       document.getElementById("share-screen-btn"),
  movieModeBtn:         document.getElementById("movie-mode-btn"),
  leaveRoomBtn:         document.getElementById("leave-room-btn"),
  themeToggle:          document.getElementById("theme-toggle"),
  themeToggleRoom:      document.getElementById("theme-toggle-room"),

  // Room info modal & participants
  roomInfoModal:        document.getElementById("room-info-modal"),
  roomInfoPanel:        document.getElementById("room-info-modal"),
  roomInfoOverlay:      document.getElementById("room-info-modal"),
  closeRoomInfoBtn:     document.getElementById("close-room-info-modal"),
  closeRoomInfoModalBtn: document.getElementById("close-room-info-modal"),
  ripRoomId:            document.getElementById("rip-room-id"),
  modalRoomId:          document.getElementById("modal-room-id"),
  modalPCount:          document.getElementById("modal-p-count"),
  ripCopyIdBtn:         document.getElementById("rip-copy-id"),
  ripInviteBtn:         document.getElementById("rip-invite-btn"),
  ripModalInviteBtn:    document.getElementById("rip-modal-invite-btn"),
  participantsList:     document.getElementById("modal-participants-list") || document.getElementById("participants-list"),

  // Sidebar
  participantsSidebar:  document.getElementById("participants-sidebar"),
  sidebarParticipants:  document.getElementById("sidebar-participants-list"),
  closeSidebarBtn:      document.getElementById("close-sidebar-btn"),
  toggleSidebarBtn:     document.getElementById("toggle-sidebar-btn"),

  // Chat / messages
  roomBody:             document.getElementById("room-body"),
  messagesContainer:    document.getElementById("messages-container"),
  messageInput:         document.getElementById("message-input"),
  sendMessageBtn:       document.getElementById("send-message-btn"),

  // Screen share & Group video
  screenShareContainer: document.getElementById("screen-share-container"),
  screenShareVideo:     document.getElementById("screen-share-video"),
  screenShareUser:      document.getElementById("screen-share-user"),
  streamTypeIcon:       document.getElementById("stream-type-icon"),
  stopScreenShareBtn:   document.getElementById("stop-screen-share"),
  hostStopScreenShareBtn: document.getElementById("host-stop-screen-share"),
  hostStopScreenShareBadge: document.getElementById("host-stop-screen-share-badge"),
  webcamGrid:           document.getElementById("webcam-grid"),
  webcamsLeft:          document.getElementById("webcams-left"),
  webcamsRight:         document.getElementById("webcams-right"),
  toggleWebcamsBtn:     document.getElementById("toggle-webcams-btn"),
  stageMicBtn:          document.getElementById("stage-mic-btn"),
  stageCamBtn:          document.getElementById("stage-cam-btn"),

  // Quality control
  qualityControl:       document.getElementById("quality-control"),
  qualitySelect:        document.getElementById("quality-select"),

  // Movie mode controls bar
  movieControlsBar:     document.getElementById("movie-controls-bar"),
  mmCamBtn:             document.getElementById("mm-cam-btn"),
  mmMicBtn:             document.getElementById("mm-mic-btn"),
  mmShareBtn:           document.getElementById("mm-share-btn"),
  mmReactBtn:           document.getElementById("mm-react-btn"),
  mmLeaveBtn:           document.getElementById("mm-leave-btn"),
  reactionPicker:       document.getElementById("reaction-picker"),
  reactionBtns:         document.querySelectorAll(".reaction-btn"),

  // Video source modal
  videoSourceModal:            document.getElementById("video-source-modal"),
  closeVideoModalBtn:          document.getElementById("close-video-modal"),
  videoFileInput:              document.getElementById("video-file-input"),
  playDeviceVideoBtn:          document.getElementById("play-device-video-btn"),
  videoUrlInput:               document.getElementById("video-url-input"),
  playUrlVideoBtn:             document.getElementById("play-url-video-btn"),
  urlStreamFallbackBox:        document.getElementById("url-stream-fallback-box"),
  modalShareScreenFallbackBtn: document.getElementById("modal-share-screen-fallback-btn"),
  sampleBtns:                  document.querySelectorAll(".sample-btn"),

  // Join approval modals
  joinRequestModal:     document.getElementById("join-request-modal"),
  approvalUserAvatar:   document.getElementById("approval-user-avatar"),
  approvalUserName:     document.getElementById("approval-user-name"),
  approveJoinBtn:       document.getElementById("approve-join-btn"),
  denyJoinBtn:          document.getElementById("deny-join-btn"),

  // Join waiting modal
  joinWaitingModal:     document.getElementById("join-waiting-modal"),
  cancelJoinRequestBtn: document.getElementById("cancel-join-request-btn"),
};

let heartbeatInterval = null;
let sidebarOverlay = null;

// ============================================================
// Media Controls UI Synchronization (Dynamic Icons)
// ============================================================
function updateMediaControlsUI() {
  const isCamOn = !!state.webcamStream;
  const isMicOn = !!state.isMicOn;

  // Header Camera Button
  if (elements.toggleCameraBtn) {
    elements.toggleCameraBtn.innerHTML = isCamOn 
      ? '<i class="fas fa-video"></i>' 
      : '<i class="fas fa-video-slash"></i>';
    elements.toggleCameraBtn.classList.toggle("active-action", isCamOn);
    elements.toggleCameraBtn.title = isCamOn ? "Turn Camera Off" : "Turn Camera On";
    elements.toggleCameraBtn.style.color = isCamOn ? "var(--amber)" : "var(--ink2)";
  }

  // Stage Transport Cam & Mic Buttons
  const stageCamBtn = elements.stageCamBtn || document.getElementById("stage-cam-btn");
  if (stageCamBtn) {
    stageCamBtn.innerHTML = isCamOn 
      ? '<i class="fas fa-video"></i>' 
      : '<i class="fas fa-video-slash"></i>';
    stageCamBtn.classList.toggle("active-action", isCamOn);
    stageCamBtn.title = isCamOn ? "Turn Camera Off" : "Turn Camera On";
    stageCamBtn.style.color = isCamOn ? "var(--amber)" : "var(--ink2)";
  }

  const stageMicBtn = elements.stageMicBtn || document.getElementById("stage-mic-btn");
  if (stageMicBtn) {
    stageMicBtn.innerHTML = isMicOn 
      ? '<i class="fas fa-microphone"></i>' 
      : '<i class="fas fa-microphone-slash"></i>';
    stageMicBtn.classList.toggle("active-action", isMicOn);
    stageMicBtn.title = isMicOn ? "Mute Microphone" : "Unmute Microphone";
    stageMicBtn.style.color = isMicOn ? "var(--ok)" : "var(--ink2)";
  }

  // Local Webcam Tile In-Video Controls
  const localCamBtn = document.getElementById("local-cam-toggle");
  if (localCamBtn) {
    localCamBtn.innerHTML = isCamOn 
      ? '<i class="fas fa-video"></i>' 
      : '<i class="fas fa-video-slash"></i>';
    localCamBtn.classList.toggle("active", isCamOn);
    localCamBtn.title = isCamOn ? "Turn Camera Off" : "Turn Camera On";
  }

  const localMicBtn = document.getElementById("local-mic-toggle");
  if (localMicBtn) {
    localMicBtn.innerHTML = isMicOn 
      ? '<i class="fas fa-microphone"></i>' 
      : '<i class="fas fa-microphone-slash"></i>';
    localMicBtn.classList.toggle("active-mic", isMicOn);
    localMicBtn.title = isMicOn ? "Mute Microphone" : "Unmute Microphone";
  }

  // Movie mode buttons
  if (elements.mmCamBtn) {
    elements.mmCamBtn.innerHTML = isCamOn ? '<i class="fas fa-video"></i>' : '<i class="fas fa-video-slash"></i>';
    elements.mmCamBtn.classList.toggle("active", isCamOn);
  }
  if (elements.mmMicBtn) {
    elements.mmMicBtn.innerHTML = isMicOn ? '<i class="fas fa-microphone"></i>' : '<i class="fas fa-microphone-slash"></i>';
    elements.mmMicBtn.classList.toggle("active", isMicOn);
  }
}

// ============================================================
// Init
// ============================================================
function init() {
  if (window.generateAvatarOptions) {
    window.generateAvatarOptions();
  }
  setupEventListeners();
  setupCodeBoxes();
  setupStageActions();
  setupTransportControls();
  setupThemeToggle();
  setupAvatarSelection();
  loadCachedUserData();
  checkAndRestoreSession();
  setupHeartbeat();
  updateMediaControlsUI();
}

// ============================================================
// Code Boxes Auto-Advance
// ============================================================
function setupCodeBoxes() {
  const boxes = [0, 1, 2, 3, 4, 5].map((i) => document.getElementById(`cb-${i}`)).filter(Boolean);
  if (boxes.length === 0) return;

  function syncCodeToInput() {
    const code = boxes.map((b) => b.value.toUpperCase()).join("");
    if (elements.roomIdInput) elements.roomIdInput.value = code;
    return code;
  }

  boxes.forEach((box, i) => {
    box.addEventListener("input", () => {
      box.value = box.value.toUpperCase().slice(-1);
      syncCodeToInput();
      if (box.value && i < boxes.length - 1) {
        boxes[i + 1].focus();
        boxes[i + 1].select();
      }
    });

    box.addEventListener("keydown", (e) => {
      if (e.key === "Backspace" && !box.value && i > 0) {
        boxes[i - 1].focus();
        boxes[i - 1].select();
      } else if (e.key === "Enter") {
        const code = syncCodeToInput();
        if (code.length === 6) joinRoom(code);
      }
    });

    box.addEventListener("paste", (e) => {
      e.preventDefault();
      const pasted = (e.clipboardData || window.clipboardData)
        .getData("text")
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "");
      for (let j = 0; j < boxes.length; j++) {
        boxes[j].value = pasted[j] || "";
      }
      syncCodeToInput();
      if (pasted.length >= 6) {
        boxes[5].focus();
      } else {
        boxes[Math.min(pasted.length, 5)].focus();
      }
    });
  });
}

// ============================================================
// Stage Empty Action Buttons
// ============================================================
function setupStageActions() {
  const seFile = document.getElementById("seFile");
  const seUrl = document.getElementById("seUrl");
  const seScreen = document.getElementById("seScreen");

  if (seFile) seFile.addEventListener("click", openVideoSourceModal);
  if (seUrl) {
    seUrl.addEventListener("click", () => {
      openVideoSourceModal();
      if (elements.videoUrlInput) elements.videoUrlInput.focus();
    });
  }
  if (seScreen) seScreen.addEventListener("click", startScreenShare);
}

// ============================================================
// Stage Transport Controls
// ============================================================
function fmtTransportTime(s) {
  if (typeof s !== "number" || !Number.isFinite(s) || isNaN(s) || s < 0) {
    return "--:--";
  }
  const totalSeconds = Math.floor(s);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes + ":" + String(seconds).padStart(2, "0");
}

function getActiveVideoDuration() {
  if (state.groupVideoIsEmbed) {
    if (state.ytPlayer && typeof state.ytPlayer.getDuration === "function") {
      try {
        const d = state.ytPlayer.getDuration();
        if (typeof d === "number" && Number.isFinite(d) && d > 0) return d;
      } catch (e) {}
    }
    if (state.groupVideoDuration && Number.isFinite(state.groupVideoDuration) && state.groupVideoDuration > 0) {
      return state.groupVideoDuration;
    }
    return 0;
  }

  // If local presenter playing HTML5 video:
  if (state.isGroupVideoPresenter && elements.screenShareVideo) {
    const d = elements.screenShareVideo.duration;
    if (typeof d === "number" && Number.isFinite(d) && d > 0) {
      state.groupVideoDuration = d;
      return d;
    }
  }

  // If viewer (participant or host) watching stream from presenter:
  if (state.groupVideoDuration && Number.isFinite(state.groupVideoDuration) && state.groupVideoDuration > 0) {
    return state.groupVideoDuration;
  }

  // Fallback to video element duration ONLY if finite and NOT WebRTC srcObject
  if (elements.screenShareVideo && !elements.screenShareVideo.srcObject) {
    const d = elements.screenShareVideo.duration;
    if (typeof d === "number" && Number.isFinite(d) && d > 0) return d;
  }

  return 0;
}

function getActiveVideoCurrentTime() {
  if (state.groupVideoIsEmbed) {
    if (state.ytPlayer && typeof state.ytPlayer.getCurrentTime === "function") {
      try {
        const cur = state.ytPlayer.getCurrentTime();
        if (typeof cur === "number" && Number.isFinite(cur) && cur >= 0) return cur;
      } catch (e) {}
    }
    return Number.isFinite(state.groupVideoCurrentTime) ? Math.max(0, state.groupVideoCurrentTime) : 0;
  }

  // If local presenter:
  if (state.isGroupVideoPresenter && elements.screenShareVideo) {
    const cur = elements.screenShareVideo.currentTime;
    if (typeof cur === "number" && Number.isFinite(cur) && cur >= 0) {
      state.groupVideoCurrentTime = cur;
      return cur;
    }
    return 0;
  }

  // If viewer watching WebRTC stream (srcObject):
  return Number.isFinite(state.groupVideoCurrentTime) ? Math.max(0, state.groupVideoCurrentTime) : 0;
}

function updateTransportPlayButton(isPlaying) {
  const tpPlayBtn = document.getElementById("tpPlayBtn");
  if (tpPlayBtn) {
    tpPlayBtn.innerHTML = isPlaying ? '<i class="fas fa-pause"></i>' : '<i class="fas fa-play"></i>';
    tpPlayBtn.title = isPlaying ? "Pause" : "Play";
  }
}

function startTransportTicker() {
  stopTransportTicker();
  state.transportTickerTimer = setInterval(() => {
    const tpSeek = document.getElementById("tpSeek");
    const tpCurTime = document.getElementById("tpCurTime");
    const tpDurTime = document.getElementById("tpDurTime");

    const curTime = getActiveVideoCurrentTime();
    const duration = getActiveVideoDuration();

    if (tpCurTime) tpCurTime.textContent = fmtTransportTime(curTime);
    if (tpDurTime) {
      tpDurTime.textContent = duration > 0 ? fmtTransportTime(duration) : "--:--";
    }
    if (tpSeek && duration > 0 && !tpSeek.matches(":active")) {
      tpSeek.value = Math.min(1000, Math.max(0, (curTime / duration) * 1000));
    }

    // For non-presenters watching WebRTC stream: smoothly increment local playback offset between heartbeats if playing
    if (!state.isGroupVideoPresenter && !state.groupVideoIsEmbed && state.groupVideoIsPlaying) {
      state.groupVideoCurrentTime = (state.groupVideoCurrentTime || 0) + 0.25;
      if (duration > 0 && state.groupVideoCurrentTime > duration) {
        state.groupVideoCurrentTime = duration;
      }
    }
  }, 250);
}

function stopTransportTicker() {
  if (state.transportTickerTimer) {
    clearInterval(state.transportTickerTimer);
    state.transportTickerTimer = null;
  }
}

function setupTransportControls() {
  const videoEl = elements.screenShareVideo;
  const tpPlayBtn = document.getElementById("tpPlayBtn");
  const tpSeek = document.getElementById("tpSeek");
  const tpMuteBtn = document.getElementById("tpMuteBtn");
  const tpVol = document.getElementById("tpVol");
  const tpFsBtn = document.getElementById("tpFsBtn");

  if (videoEl) {
    videoEl.addEventListener("timeupdate", () => {
      if (state.groupVideoIsEmbed) return;
      // If viewer watching WebRTC stream (srcObject), ignore internal timeupdate
      if (!state.isGroupVideoPresenter && videoEl.srcObject) return;

      const curTime = getActiveVideoCurrentTime();
      const duration = getActiveVideoDuration();

      const tpCurTime = document.getElementById("tpCurTime");
      const tpDurTime = document.getElementById("tpDurTime");

      if (tpCurTime) tpCurTime.textContent = fmtTransportTime(curTime);
      if (tpDurTime && duration > 0) tpDurTime.textContent = fmtTransportTime(duration);
      if (tpSeek && duration > 0 && !tpSeek.matches(":active")) {
        tpSeek.value = Math.min(1000, Math.max(0, (curTime / duration) * 1000));
      }
    });
  }

  if (tpPlayBtn) {
    tpPlayBtn.addEventListener("click", () => {
      // 1. Presenter controlling their own video stream
      if (state.isGroupVideoPresenter) {
        if (state.groupVideoIsEmbed) {
          let isPlaying = false;
          if (state.ytPlayer && typeof state.ytPlayer.getPlayerState === "function") {
            try { isPlaying = state.ytPlayer.getPlayerState() === (window.YT?.PlayerState?.PLAYING ?? 1); } catch (e) {}
          }
          const cur = getActiveVideoCurrentTime();
          const dur = getActiveVideoDuration();

          if (isPlaying) {
            sendYouTubeCommand("pauseVideo");
            updateTransportPlayButton(false);
            state.groupVideoIsPlaying = false;
            broadcastToPeers({
              type: "group_video_sync",
              action: "pause",
              time: cur,
              duration: dur,
              paused: true,
              timestamp: Date.now(),
            });
            stopPresenterHeartbeat();
          } else {
            sendYouTubeCommand("playVideo");
            updateTransportPlayButton(true);
            state.groupVideoIsPlaying = true;
            broadcastToPeers({
              type: "group_video_sync",
              action: "play",
              time: cur,
              duration: dur,
              paused: false,
              timestamp: Date.now(),
            });
            startPresenterHeartbeat();
          }
          return;
        }

        if (videoEl) {
          const cur = getActiveVideoCurrentTime();
          const dur = getActiveVideoDuration();
          if (videoEl.paused) {
            videoEl.play().catch((e) => console.warn("Play trigger notice:", e));
            updateTransportPlayButton(true);
            state.groupVideoIsPlaying = true;
            broadcastToPeers({
              type: "group_video_sync",
              action: "play",
              time: cur,
              duration: dur,
              paused: false,
              timestamp: Date.now(),
            });
            startPresenterHeartbeat();
          } else {
            videoEl.pause();
            updateTransportPlayButton(false);
            state.groupVideoIsPlaying = false;
            broadcastToPeers({
              type: "group_video_sync",
              action: "pause",
              time: cur,
              duration: dur,
              paused: true,
              timestamp: Date.now(),
            });
            stopPresenterHeartbeat();
          }
        }
        return;
      }

      // 2. Room Host controlling video presented by another participant
      const amHost = state.isRoomCreator || (state.participants[state.userId] && state.participants[state.userId].isCreator) || (state.hostUserId && state.hostUserId === state.userId);
      if (amHost && state.screenShareUserId) {
        let isPaused = true;
        const currentTime = getActiveVideoCurrentTime();

        if (state.groupVideoIsEmbed) {
          if (state.ytPlayer && typeof state.ytPlayer.getPlayerState === "function") {
            try { isPaused = state.ytPlayer.getPlayerState() !== (window.YT?.PlayerState?.PLAYING ?? 1); } catch (e) {}
          }
        } else {
          isPaused = !state.groupVideoIsPlaying;
        }

        const nextAction = isPaused ? "play" : "pause";
        updateTransportPlayButton(isPaused);
        state.groupVideoIsPlaying = isPaused;
        broadcastToPeers({
          type: "group_video_control",
          action: nextAction,
          time: currentTime,
          senderId: state.userId,
          timestamp: Date.now(),
        });
        showToast(isPaused ? "Host resumed room playback ⏯" : "Host paused room playback ⏸", "info", 1500);
        return;
      }

      // 3. Regular participant
      showToast("Only the streamer or room host can pause/play the video.", "info", 2000);
    });
  }

  if (tpSeek) {
    tpSeek.addEventListener("input", () => {
      const duration = getActiveVideoDuration();
      if (!duration || duration <= 0 || !Number.isFinite(duration)) return;

      const targetTime = (tpSeek.value / 1000) * duration;
      if (!Number.isFinite(targetTime) || isNaN(targetTime)) return;

      if (state.isGroupVideoPresenter) {
        if (state.groupVideoIsEmbed) {
          sendYouTubeCommand("seekTo", [targetTime, true]);
        } else if (videoEl) {
          videoEl.currentTime = targetTime;
        }

        state.groupVideoCurrentTime = targetTime;
        broadcastToPeers({
          type: "group_video_sync",
          action: "seek",
          time: targetTime,
          duration: duration,
          paused: videoEl ? videoEl.paused : false,
          timestamp: Date.now(),
        });
        return;
      }

      // Room Host controlling video presented by another participant
      const amHost = state.isRoomCreator || (state.participants[state.userId] && state.participants[state.userId].isCreator) || (state.hostUserId && state.hostUserId === state.userId);
      if (amHost && state.screenShareUserId) {
        state.groupVideoCurrentTime = targetTime;
        broadcastToPeers({
          type: "group_video_control",
          action: "seek",
          time: targetTime,
          senderId: state.userId,
          timestamp: Date.now(),
        });
      }
    });
  }

  if (tpMuteBtn) {
    tpMuteBtn.addEventListener("click", () => {
      if (state.groupVideoIsEmbed) {
        let isMuted = false;
        if (state.ytPlayer && typeof state.ytPlayer.isMuted === "function") {
          try { isMuted = state.ytPlayer.isMuted(); } catch (e) {}
        }
        if (isMuted) {
          sendYouTubeCommand("unMute");
          tpMuteBtn.innerHTML = '<i class="fas fa-volume-up"></i>';
        } else {
          sendYouTubeCommand("mute");
          tpMuteBtn.innerHTML = '<i class="fas fa-volume-mute"></i>';
        }
        return;
      }
      if (videoEl) {
        videoEl.muted = !videoEl.muted;
        tpMuteBtn.innerHTML = videoEl.muted
          ? '<i class="fas fa-volume-mute"></i>'
          : '<i class="fas fa-volume-up"></i>';
      }
    });
  }

  if (tpVol) {
    tpVol.addEventListener("input", () => {
      const vol = parseFloat(tpVol.value);
      if (state.groupVideoIsEmbed) {
        sendYouTubeCommand("setVolume", [Math.round(vol * 100)]);
        if (vol === 0) sendYouTubeCommand("mute");
        else sendYouTubeCommand("unMute");
        if (tpMuteBtn) {
          tpMuteBtn.innerHTML = vol === 0
            ? '<i class="fas fa-volume-mute"></i>'
            : '<i class="fas fa-volume-up"></i>';
        }
        return;
      }
      if (videoEl) {
        videoEl.volume = vol;
        videoEl.muted = vol === 0;
        if (tpMuteBtn) {
          tpMuteBtn.innerHTML = videoEl.muted
            ? '<i class="fas fa-volume-mute"></i>'
            : '<i class="fas fa-volume-up"></i>';
        }
      }
    });
  }

  if (tpFsBtn) {
    tpFsBtn.addEventListener("click", () => {
      const container = elements.screenShareContainer || videoEl;
      if (!document.fullscreenElement) {
        if (container.requestFullscreen) container.requestFullscreen();
      } else {
        if (document.exitFullscreen) document.exitFullscreen();
      }
    });
  }
}

// ============================================================
// Event Listeners
// ============================================================
function setupEventListeners() {
  // Home
  elements.createRoomBtn?.addEventListener("click", () => createRoom());
  elements.joinRoomBtn?.addEventListener("click", () => joinRoom());
  elements.refreshAvatarsBtn?.addEventListener("click", refreshAvatars);
  elements.useCustomAvatarBtn?.addEventListener("click", useCustomAvatar);
  elements.customAvatarToggle?.addEventListener("click", toggleCustomAvatarPanel);
  elements.usernameInput?.addEventListener("input", () => {
    try { localStorage.setItem("echorooms_username", elements.usernameInput.value.trim()); } catch (e) {}
  });
  elements.roomIdInput?.addEventListener("keypress", (e) => {
    if (e.key === "Enter") joinRoom();
  });

  // Room header
  elements.leaveRoomBtn?.addEventListener("click", () => leaveRoom());
  elements.sendMessageBtn?.addEventListener("click", () => sendMessage());
  elements.messageInput?.addEventListener("keypress", (e) => {
    if (e.key === "Enter") sendMessage();
  });
  elements.shareScreenBtn?.addEventListener("click", startScreenShare);
  elements.stopScreenShareBtn?.addEventListener("click", () => {
    if (state.isGroupVideoPresenter) stopGroupVideo();
    else stopScreenShare();
  });
  if (elements.hostStopScreenShareBtn) {
    elements.hostStopScreenShareBtn.addEventListener("click", () => {
      if (state.screenShareUserId) hostForceStopScreenShare(state.screenShareUserId);
    });
  }
  if (elements.hostStopScreenShareBadge) {
    elements.hostStopScreenShareBadge.addEventListener("click", () => {
      if (state.screenShareUserId) hostForceStopScreenShare(state.screenShareUserId);
    });
  }
  if (elements.toggleWebcamsBtn) {
    elements.toggleWebcamsBtn.addEventListener("click", () => {
      const grid = elements.webcamGrid;
      if (grid) {
        grid.classList.toggle("hidden");
        const isHidden = grid.classList.contains("hidden");
        elements.toggleWebcamsBtn.classList.toggle("active-action", !isHidden);
        showToast(isHidden ? "Cameras hidden from stage" : "Cameras shown on stage", "info", 2000);
      }
    });
  }
  if (elements.ripCopyIdBtn) {
    elements.ripCopyIdBtn.addEventListener("click", copyRoomIdToClipboard);
  }
  if (elements.ripInviteBtn) {
    elements.ripInviteBtn.addEventListener("click", inviteUser);
  }
  if (elements.ripModalInviteBtn) {
    elements.ripModalInviteBtn.addEventListener("click", inviteUser);
  }

  // Group Video Watching
  if (elements.groupVideoBtn) {
    elements.groupVideoBtn.addEventListener("click", openVideoSourceModal);
  }
  if (elements.closeVideoModalBtn) {
    elements.closeVideoModalBtn.addEventListener("click", closeVideoSourceModal);
  }
  if (elements.playDeviceVideoBtn) {
    elements.playDeviceVideoBtn.addEventListener("click", handleDeviceVideoSubmit);
  }
  if (elements.playUrlVideoBtn) {
    elements.playUrlVideoBtn.addEventListener("click", handleUrlVideoSubmit);
  }
  if (elements.modalShareScreenFallbackBtn) {
    elements.modalShareScreenFallbackBtn.addEventListener("click", () => {
      closeVideoSourceModal();
      startScreenShare();
    });
  }
  if (elements.sampleBtns) {
    elements.sampleBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        const url = btn.getAttribute("data-url");
        if (elements.videoUrlInput) elements.videoUrlInput.value = url;
        startGroupVideoFromUrl(url, btn.textContent.trim());
      });
    });
  }

  // Camera & Mic Controls
  if (elements.toggleCameraBtn) {
    elements.toggleCameraBtn.addEventListener("click", toggleCamera);
  }
  if (elements.stageCamBtn) {
    elements.stageCamBtn.addEventListener("click", toggleCamera);
  }
  if (elements.stageMicBtn) {
    elements.stageMicBtn.addEventListener("click", toggleMic);
  }

  // Movie mode
  elements.movieModeBtn?.addEventListener("click", toggleMovieMode);

  // Movie mode control bar buttons
  if (elements.mmCamBtn) elements.mmCamBtn.addEventListener("click", toggleCamera);
  if (elements.mmMicBtn) elements.mmMicBtn.addEventListener("click", toggleMic);
  if (elements.mmShareBtn) elements.mmShareBtn.addEventListener("click", startScreenShare);
  if (elements.mmLeaveBtn) elements.mmLeaveBtn.addEventListener("click", leaveRoom);
  if (elements.mmReactBtn) {
    elements.mmReactBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      elements.reactionPicker.classList.toggle("hidden");
    });
  }
  if (elements.reactionBtns) {
    elements.reactionBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        const emoji = btn.getAttribute("data-emoji");
        sendReaction(emoji);
        elements.reactionPicker.classList.add("hidden");
      });
    });
  }
  // Close reaction picker on outside click
  document.addEventListener("click", () => {
    if (elements.reactionPicker) elements.reactionPicker.classList.add("hidden");
  });

  // Quality control for viewers
  if (elements.qualitySelect) {
    elements.qualitySelect.addEventListener("change", handleQualityChange);
  }

  // Room info panel
  elements.roomInfoBtn?.addEventListener("click", openRoomInfoPanel);
  elements.closeRoomInfoBtn?.addEventListener("click", closeRoomInfoPanel);
  elements.roomInfoOverlay?.addEventListener("click", closeRoomInfoPanel);

  // Sidebar
  if (elements.toggleSidebarBtn) {
    elements.toggleSidebarBtn.addEventListener("click", () => {
      if (!elements.roomInfoPanel.classList.contains("hidden")) {
        closeRoomInfoPanel();
      } else {
        openRoomInfoPanel();
      }
    });
  }
  elements.closeSidebarBtn?.addEventListener("click", closeSidebar);

  // Host Approval Modals
  if (elements.approveJoinBtn) {
    elements.approveJoinBtn.addEventListener("click", handleApproveJoin);
  }
  if (elements.denyJoinBtn) {
    elements.denyJoinBtn.addEventListener("click", handleDenyJoin);
  }
  if (elements.cancelJoinRequestBtn) {
    elements.cancelJoinRequestBtn.addEventListener("click", handleCancelJoinRequest);
  }
}

// ============================================================
// Theme Toggle
// ============================================================
function setupThemeToggle() {
  function applyTheme(dark) {
    document.body.classList.toggle("dark-mode", dark);
    document.body.classList.toggle("light-mode", !dark);
    state.isDarkMode = dark;
    const icon = dark ? "fa-sun" : "fa-moon";
    [elements.themeToggle, elements.themeToggleRoom].forEach(btn => {
      if (btn) btn.innerHTML = `<i class="fas ${icon}"></i>`;
    });
    try { localStorage.setItem("echorooms_theme", dark ? "dark" : "light"); } catch (e) {}
  }

  [elements.themeToggle, elements.themeToggleRoom].forEach(btn => {
    if (btn) btn.addEventListener("click", () => applyTheme(!state.isDarkMode));
  });
}

// ============================================================
/// ============================================================
// Avatar Selection & Refresh
// ============================================================
function setupAvatarSelection() {
  const avatarOpts = document.querySelectorAll("img.avatar-opt");
  if (avatarOpts.length > 0) {
    let selected = Array.from(avatarOpts).find((a) => a.classList.contains("selected"));
    if (!selected) {
      selected = avatarOpts[0];
      selected.classList.add("selected");
    }
    state.selectedAvatar = selected.getAttribute("data-avatar") || selected.src;
  }

  const avatarStrip = document.querySelector(".avatar-strip");
  if (avatarStrip) {
    avatarStrip.addEventListener("click", (e) => {
      const avatar = e.target.closest("img.avatar-opt");
      if (!avatar) return;
      document.querySelectorAll("img.avatar-opt").forEach((a) => a.classList.remove("selected"));
      avatar.classList.add("selected");
      state.selectedAvatar = avatar.getAttribute("data-avatar") || avatar.src;
      try { localStorage.setItem("echorooms_avatar", state.selectedAvatar); } catch (err) {}
    });
  }
}

function refreshAvatars() {
  if (window.generateAvatarOptions) {
    window.generateAvatarOptions("refresh");
  }
  setTimeout(() => {
    const avatarOpts = document.querySelectorAll("img.avatar-opt");
    if (avatarOpts.length > 0) {
      let currentlySelected = Array.from(avatarOpts).find((a) => a.classList.contains("selected"));
      if (!currentlySelected) {
        currentlySelected = avatarOpts[0];
        currentlySelected.classList.add("selected");
      }
      state.selectedAvatar = currentlySelected.getAttribute("data-avatar") || currentlySelected.src;
    }
  }, 50);
}

// ============================================================
// Custom Avatar Panel Toggle
// ============================================================
function toggleCustomAvatarPanel() {
  if (!elements.customAvatarPanel) return;
  elements.customAvatarPanel.classList.toggle("hidden");
  if (!elements.customAvatarPanel.classList.contains("hidden") && elements.customAvatarUrlInput) {
    elements.customAvatarUrlInput.focus();
  }
}

// ============================================================
// Load Cached Data
// ============================================================
function loadCachedUserData() {
  try {
    const cachedUsername = localStorage.getItem("echorooms_username");
    if (cachedUsername && elements.usernameInput) {
      elements.usernameInput.value = cachedUsername;
      state.username = cachedUsername;
    }
    const cachedTheme = localStorage.getItem("echorooms_theme");
    if (cachedTheme === "dark") {
      document.body.classList.remove("light-mode");
      document.body.classList.add("dark-mode");
      state.isDarkMode = true;
      [elements.themeToggle, elements.themeToggleRoom].forEach(btn => {
        if (btn) btn.innerHTML = '<i class="fas fa-sun"></i>';
      });
    }
    const cachedAvatar = localStorage.getItem("echorooms_avatar");
    if (cachedAvatar) {
      state.selectedAvatar = cachedAvatar;
      const avatarOpts = document.querySelectorAll("img.avatar-opt");
      let matchedPredefined = false;
      avatarOpts.forEach((avatar) => {
        const avatarUrl = avatar.getAttribute("data-avatar") || avatar.src;
        if (avatarUrl === cachedAvatar) {
          avatar.classList.add("selected");
          matchedPredefined = true;
        } else {
          avatar.classList.remove("selected");
        }
      });
      if (!matchedPredefined && (cachedAvatar.startsWith("http://") || cachedAvatar.startsWith("https://"))) {
        if (elements.customAvatarUrlInput) elements.customAvatarUrlInput.value = cachedAvatar;
        if (avatarOpts[0]) {
          avatarOpts[0].src = cachedAvatar;
          avatarOpts[0].setAttribute("data-avatar", cachedAvatar);
          avatarOpts[0].classList.add("selected");
        }
      }
    }
  } catch (e) {
    console.warn("Could not load cached user data:", e);
  }
}

function saveUserDataToCache() {
  try {
    if (state.username) localStorage.setItem("echorooms_username", state.username);
    if (state.selectedAvatar) localStorage.setItem("echorooms_avatar", state.selectedAvatar);
  } catch (e) {}
}

// ============================================================
// Room Session Persistence (Page Refresh Recovery)
// ============================================================
const SESSION_KEY = "echorooms_session_v1";

function saveRoomSession() {
  if (!state.roomId || !state.username) return;
  try {
    const data = {
      roomId: state.roomId,
      userId: state.userId,
      username: state.username,
      avatar: state.avatar || state.selectedAvatar,
      isRoomCreator: !!state.isRoomCreator,
      timestamp: Date.now()
    };
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(data));
  } catch (e) {}
}

function clearRoomSession() {
  try { sessionStorage.removeItem(SESSION_KEY); } catch (e) {}
}

function getRoomSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (Date.now() - (data.timestamp || 0) > 6 * 3600 * 1000) {
      clearRoomSession();
      return null;
    }
    return data;
  } catch (e) {
    return null;
  }
}

async function checkAndRestoreSession() {
  const session = getRoomSession();
  if (!session || !session.roomId) {
    checkUrlForInvite();
    return;
  }

  console.log("Restoring active room session:", session);
  state.username = session.username;
  state.avatar = session.avatar;
  state.userId = session.userId;
  state.selectedAvatar = session.avatar;
  state.roomId = session.roomId;
  state.isRoomCreator = session.isRoomCreator;
  state.isJoinApproved = true;

  if (elements.usernameInput) elements.usernameInput.value = state.username;

  if (session.isRoomCreator) {
    showToast("Restoring your room as host... 👑", "info", 3000);
    displayRoom();
    initializePeer(session.roomId);
  } else {
    showToast(`Rejoining room ${session.roomId}...`, "info", 3000);
    displayRoom();
    initializePeer();
  }
}

function resetJoinButton() {
  if (elements.joinRoomBtn) {
    elements.joinRoomBtn.disabled = false;
    elements.joinRoomBtn.innerHTML = '<i class="fas fa-sign-in-alt"></i> JOIN THE ROOM';
  }
}

// ============================================================
// Heartbeat
// ============================================================
function setupHeartbeat() {
  if (heartbeatInterval) clearInterval(heartbeatInterval);
  heartbeatInterval = setInterval(() => {
    if (state.peer && state.peer.open && state.roomId && Object.keys(state.connections).length > 0) {
      broadcastToPeers({ type: "heartbeat", timestamp: Date.now() });
      Object.entries(state.connections).forEach(([peerId, conn]) => {
        if (!conn.open) {
          console.warn(`Connection to ${peerId} closed. Removing.`);
          delete state.connections[peerId];
        }
      });
    }
  }, 15000);
}

// ============================================================
// Validation
// ============================================================
async function validateUserInput() {
  const username = elements.usernameInput ? elements.usernameInput.value.trim() : "";
  if (!username) {
    showError("Please enter your name on the marquee");
    if (elements.usernameInput) elements.usernameInput.focus();
    return false;
  }

  // Auto-fallback to selected or first avatar option if not explicitly clicked
  if (!state.selectedAvatar) {
    const selectedImg = document.querySelector("img.avatar-opt.selected") || document.querySelector("img.avatar-opt");
    if (selectedImg) {
      selectedImg.classList.add("selected");
      state.selectedAvatar = selectedImg.getAttribute("data-avatar") || selectedImg.src;
    }
  }

  if (!state.selectedAvatar) {
    state.selectedAvatar = `https://api.dicebear.com/7.x/lorelei/svg?seed=${encodeURIComponent(username)}`;
  }

  state.username = username;
  state.avatar = state.selectedAvatar;
  state.userId = generateUserId();
  saveUserDataToCache();
  return true;
}

// ============================================================
// Toast
// ============================================================
function showToast(message, type = "info", duration = 3000) {
  const container = document.getElementById("toast-container") || document.body;
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  const iconMap = { info: "fa-info-circle", success: "fa-check-circle", error: "fa-exclamation-circle" };
  toast.innerHTML = `<i class="fas ${iconMap[type] || iconMap.info}"></i> <span>${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.classList.add("toast-fade-out");
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

function showError(message) { showToast(message, "error"); }

// ============================================================
// Helpers
// ============================================================
function generateUserId() { return "user_" + uuid.v4(); }

function generateRoomId() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let result = "";
  for (let i = 0; i < 6; i++) result += chars.charAt(Math.floor(Math.random() * chars.length));
  return result;
}

// ============================================================
// Create / Join Room
// ============================================================
async function createRoom() {
  if (!(await validateUserInput())) return;
  elements.messagesContainer.innerHTML = "";
  resetParticipantsUI();
  state.hostClaimRetries = 0;
  state.joinRetries = 0;
  state.roomId = generateRoomId();
  state.isRoomCreator = true;
  saveRoomSession();
  initializePeer(state.roomId);
  displayRoom();
}

async function joinRoom(targetRoomId = null) {
  if (!(await validateUserInput())) return;

  let roomId = typeof targetRoomId === "string" && targetRoomId.trim() ? targetRoomId.trim() : "";
  if (!roomId) {
    const boxes = [0, 1, 2, 3, 4, 5].map((i) => document.getElementById(`cb-${i}`)).filter(Boolean);
    const boxVal = boxes.map((b) => b.value.trim()).join("");
    roomId = boxVal || (elements.roomIdInput ? elements.roomIdInput.value.trim() : "");
  }
  roomId = roomId.toUpperCase();
  if (!roomId) { showError("Please enter a room ID"); return; }

  // Immediately display waiting modal and disable join button for instant feedback
  if (elements.joinWaitingModal) {
    elements.joinWaitingModal.classList.remove("hidden");
  }
  if (elements.joinRoomBtn) {
    elements.joinRoomBtn.disabled = true;
    elements.joinRoomBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> JOINING...';
  }

  elements.messagesContainer.innerHTML = "";
  resetParticipantsUI();
  state.roomId = roomId;
  state.hostClaimRetries = 0;
  state.joinRetries = 0;
  displayConnectionStatus("connecting");
  initializePeer();
}

// ============================================================
// Messages (WhatsApp Minimal Style)
// ============================================================
function sendMessage() {
  if (!elements.messageInput) return;
  const messageText = elements.messageInput.value.trim();
  if (!messageText) return;
  const message = {
    userId: state.userId, username: state.username, avatar: state.avatar,
    text: messageText, timestamp: new Date().toISOString(),
  };
  displayMessage(message, true);
  elements.messageInput.value = "";
  broadcastToPeers({ type: "chat_message", message });
}

function displayMessage(message, isOutgoing = false) {
  const isMe = isOutgoing || message.userId === state.userId;

  const msgRow = document.createElement("div");
  msgRow.className = `msg-row ${isMe ? "outgoing" : "incoming"}`;

  // Small 20px avatar for incoming messages
  if (!isMe) {
    const avatar = document.createElement("img");
    avatar.className = "msg-avatar-tiny";
    avatar.src = message.avatar;
    avatar.alt = message.username;
    msgRow.appendChild(avatar);
  }

  const bubble = document.createElement("div");
  bubble.className = "msg-bubble";

  // Tiny sender name at top of incoming bubble
  if (!isMe) {
    const sender = document.createElement("div");
    sender.className = "msg-sender-name";
    sender.textContent = message.username;
    bubble.appendChild(sender);
  }

  // Content text + inline timestamp
  const textSpan = document.createElement("span");
  textSpan.className = "msg-text-content";
  textSpan.textContent = message.text;

  const timeSpan = document.createElement("span");
  timeSpan.className = "msg-timestamp";
  timeSpan.textContent = formatTime(new Date(message.timestamp));

  bubble.appendChild(textSpan);
  bubble.appendChild(timeSpan);
  msgRow.appendChild(bubble);

  elements.messagesContainer.appendChild(msgRow);
  scrollToBottom();
}

function displaySystemMessage(text) {
  const el = document.createElement("div");
  el.className = "system-message";
  el.textContent = text;
  elements.messagesContainer.appendChild(el);
  scrollToBottom();
}

function formatTime(date) {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function scrollToBottom() {
  if (elements.messagesContainer) {
    elements.messagesContainer.scrollTop = elements.messagesContainer.scrollHeight;
  }
}

// ============================================================
// PeerJS Init
// ============================================================
function initializePeer(peerId) {
  const peerOptions = {
    config: {
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:global.stun.twilio.com:3478" },
      ],
    },
    debug: 2,
  };
  console.log("Initializing peer", peerId ? `with ID: ${peerId}` : "with random ID");
  try {
    if (state.peer) state.peer.destroy();
    state.peer = new Peer(peerId, peerOptions);

    state.peer.on("open", (id) => {
      state.peerId = id;
      console.log("PeerJS open:", id);
      if (state.isRoomCreator) {
        state.hostClaimRetries = 0;
        displayConnectionStatus("connected", "Room created successfully");
        addSelfToParticipants();
        Object.values(state.participants).forEach((participant) => {
          if (participant.userId !== state.userId && participant.peerId && participant.peerId !== state.peerId) {
            if (!state.connections[participant.peerId] || !state.connections[participant.peerId].open) {
              const conn = state.peer.connect(participant.peerId, {
                metadata: { userId: state.userId, username: state.username, avatar: state.avatar, hostMigration: true },
              });
              handlePeerConnection(conn);
            }
          }
        });
      } else {
        connectToPeer(state.roomId);
      }
    });

    state.peer.on("connection", (conn) => {
      console.log("Incoming connection from:", conn.peer);
      // Auto-reconnect if session rejoin
      if (conn.metadata?.rejoin && state.isRoomCreator) {
        conn.on("open", () => {
          conn.send({ type: "join_approved", hostUserId: state.userId });
          setTimeout(() => {
            sendRoomInfo(conn);
            broadcastNewParticipant(conn.metadata);
          }, 100);
        });
        displaySystemMessage(`${conn.metadata.username} reconnected to the room`);
        handlePeerConnection(conn);
        return;
      }
      // Instant approval popup on host screen without waiting for ICE open
      if (conn.metadata?.joinRequest && state.isRoomCreator) {
        queueJoinRequest(conn, conn.metadata);
      }
      handlePeerConnection(conn);
    });

    // Handle incoming media calls (screen share, group video, webcam)
    state.peer.on("call", (call) => {
      console.log("Incoming media call from:", call.peer, call.metadata);
      if (call.metadata && call.metadata.type === "screen_share") {
        call.answer();
        call.on("stream", (remoteStream) => {
          console.log("Received remote screen share stream");
          state.screenShareUser = call.metadata?.username || "Participant";
          state.screenShareUserId = call.metadata?.userId || null;
          document.getElementById("stageEmpty")?.classList.add("hidden");
          document.getElementById("stageTop")?.classList.remove("hidden");
          document.getElementById("transport")?.classList.remove("hidden");
          elements.screenShareContainer.classList.remove("hidden");
          elements.screenShareVideo.classList.remove("hidden");
          elements.screenShareVideo.srcObject = remoteStream;
          if (elements.screenShareUser) elements.screenShareUser.textContent = state.screenShareUser;
          if (elements.streamTypeIcon) elements.streamTypeIcon.className = "fas fa-desktop";
          if (elements.stopScreenShareBtn) elements.stopScreenShareBtn.classList.add("hidden");
          if (document.getElementById("nowShowing")) {
            document.getElementById("nowShowing").textContent = "SCREENING — " + state.screenShareUser.toUpperCase();
          }
          if (!state.movieMode) activateMovieMode();
          updateParticipantsUI();
        });
        call.on("close", () => handleScreenShareStop());
        call.on("error", (err) => { console.error("Screen share call error:", err); handleScreenShareStop(); });
      } else if (call.metadata && call.metadata.type === "group_video") {
        call.answer();
        call.on("stream", (remoteStream) => {
          console.log("Received remote group video stream", remoteStream.getAudioTracks());
          state.screenShareUser = `${call.metadata?.username || "Host"} (streaming: ${call.metadata?.title || "Video"})`;
          state.screenShareUserId = call.metadata?.userId || null;
          document.getElementById("stageEmpty")?.classList.add("hidden");
          document.getElementById("stageTop")?.classList.remove("hidden");
          document.getElementById("transport")?.classList.remove("hidden");
          elements.screenShareContainer.classList.remove("hidden");
          const vid = elements.screenShareVideo;
          vid.classList.remove("hidden");
          vid.onerror = null;

          // Clear any lingering src attribute before attaching srcObject
          if (vid.src) {
            const oldSrc = vid.src;
            vid.removeAttribute("src");
            try { vid.load(); } catch (e) {}
            if (oldSrc.startsWith("blob:")) {
              try { URL.revokeObjectURL(oldSrc); } catch (e) {}
            }
          }

          // Enable all incoming audio and video tracks
          remoteStream.getTracks().forEach((t) => { t.enabled = true; });
          remoteStream.onaddtrack = () => {
            remoteStream.getTracks().forEach((t) => { t.enabled = true; });
          };

          vid.srcObject = remoteStream;
          vid.volume = 1.0;
          vid.muted = false;

          const startRemotePlayback = () => {
            vid.play().then(() => {
              console.log("Remote group video playing with audio!");
            }).catch((err) => {
              console.warn("Unmuted autoplay blocked by browser policy, muting and playing:", err);
              vid.muted = true;
              vid.play().then(() => {
                showToast("Video playing! Click player to unmute audio 🔊", "info", 5000);
                const unmuteOnClick = () => {
                  vid.muted = false;
                  showToast("Audio unmuted! 🔊", "success", 2000);
                  vid.removeEventListener("click", unmuteOnClick);
                };
                vid.addEventListener("click", unmuteOnClick);
              }).catch(e => console.error("Video play failed:", e));
            });
          };

          startRemotePlayback();
          if (call.metadata?.duration && Number.isFinite(call.metadata.duration) && call.metadata.duration > 0) {
            state.groupVideoDuration = call.metadata.duration;
          }
          state.groupVideoIsPlaying = true;
          updateTransportPlayButton(true);
          startTransportTicker();

          const tpDurTime = document.getElementById("tpDurTime");
          if (tpDurTime && state.groupVideoDuration > 0) {
            tpDurTime.textContent = fmtTransportTime(state.groupVideoDuration);
          }

          if (elements.screenShareUser) elements.screenShareUser.textContent = state.screenShareUser;
          if (elements.streamTypeIcon) elements.streamTypeIcon.className = "fas fa-film";
          if (elements.stopScreenShareBtn) elements.stopScreenShareBtn.classList.add("hidden");
          if (document.getElementById("nowShowing")) {
            document.getElementById("nowShowing").textContent = "SCREENING — " + (call.metadata?.title || "VIDEO").toUpperCase();
          }
          if (!state.movieMode) activateMovieMode();
          showToast(`${call.metadata?.username || "Host"} started streaming a video! 🎬`, "info");
          updateParticipantsUI();
        });
        call.on("close", () => handleGroupVideoStop());
        call.on("error", (err) => { console.error("Group video call error:", err); handleGroupVideoStop(); });
      } else if (call.metadata && call.metadata.type === "webcam") {
        call.answer();
        call.on("stream", (remoteStream) => {
          console.log("Received remote webcam stream from:", call.metadata?.username);
          addWebcamTile(call.metadata?.userId, call.metadata?.username || "User", remoteStream, false);
        });
        call.on("close", () => {
          if (call.metadata?.userId) removeWebcamTile(call.metadata.userId);
        });
      } else if (call.metadata && call.metadata.type === "mic") {
        // Incoming audio-only mic stream
        call.answer();
        call.on("stream", (remoteStream) => {
          // Play remote audio
          let audioEl = document.getElementById(`mic-audio-${call.metadata?.userId}`);
          if (!audioEl) {
            audioEl = document.createElement("audio");
            audioEl.id = `mic-audio-${call.metadata?.userId}`;
            audioEl.autoplay = true;
            audioEl.style.display = "none";
            document.body.appendChild(audioEl);
          }
          audioEl.srcObject = remoteStream;
        });
        call.on("close", () => {
          const audioEl = document.getElementById(`mic-audio-${call.metadata?.userId}`);
          if (audioEl) audioEl.remove();
        });
      }
    });

    state.peer.on("error", (err) => {
      console.error("Peer error:", err);
      if (err.type === "peer-unavailable") {
        if (!state.isRoomCreator && (state.joinRetries || 0) < 6) {
          state.joinRetries = (state.joinRetries || 0) + 1;
          displayConnectionStatus("connecting", `Connecting to room (${state.joinRetries}/6)...`);
          setTimeout(() => { if (state.peer && !state.peer.destroyed) connectToPeer(state.roomId); }, 1000);
          return;
        }
        if (elements.joinWaitingModal) elements.joinWaitingModal.classList.add("hidden");
        displayConnectionStatus("error", "Room not found or no longer available");
        showError("Room not found or no longer available. Please check the room ID and try again.");
      } else if (err.type === "network" || err.type === "server-error") {
        displayConnectionStatus("error", "Network or server error, please try again");
        setTimeout(() => {
          if (state.connectionStatus !== "connected") {
            displaySystemMessage("Attempting automatic reconnection...");
            retryConnection();
          }
        }, 5000);
      } else if (err.type === "unavailable-id") {
        if (state.isRoomCreator) {
          state.hostClaimRetries = (state.hostClaimRetries || 0) + 1;
          if (state.hostClaimRetries <= 6) {
            displaySystemMessage("Re-claiming room host role on server...");
            setTimeout(() => initializePeer(state.roomId), 1500);
            return;
          }
          displayConnectionStatus("error", "Room ID already in use");
          showError("The room ID is currently unavailable. Please try creating a new room.");
          setTimeout(resetRoom, 2000);
        } else {
          initializePeer(); // Retry with random ID
        }
      } else {
        displayConnectionStatus("error", err.message);
        showError("Connection error: " + err.message);
      }
    });

    state.peer.on("open", () => {
      state.reconnectAttempts = 0;
      if (state.reconnectTimer) {
        clearTimeout(state.reconnectTimer);
        state.reconnectTimer = null;
      }
    });

    state.peer.on("disconnected", () => {
      displayConnectionStatus("disconnected", "Disconnected from server");
      attemptPeerReconnect();
    });
  } catch (e) {
    console.error("Error initializing peer:", e);
    displayConnectionStatus("error", "Failed to initialize connection");
    showError("Failed to initialize connection: " + e.message);
  }
}

function attemptPeerReconnect() {
  if (state.reconnectTimer) clearTimeout(state.reconnectTimer);
  if (!state.roomId || !state.userId) return;

  state.reconnectAttempts = (state.reconnectAttempts || 0) + 1;
  if (state.reconnectAttempts > 8) {
    displayConnectionStatus("error", "Could not reconnect to room. Please check internet connection.");
    return;
  }

  const delay = Math.min(1000 * Math.pow(1.5, state.reconnectAttempts - 1), 10000);
  console.log(`Scheduling peer reconnect attempt #${state.reconnectAttempts} in ${delay}ms`);

  state.reconnectTimer = setTimeout(() => {
    if (state.peer && !state.peer.destroyed) {
      try {
        state.peer.reconnect();
        displayConnectionStatus("connecting", "Reconnecting to signaling server...");
        return;
      } catch (e) {
        console.warn("peer.reconnect failed:", e);
      }
    }

    if (state.isRoomCreator) {
      initializePeer(state.roomId);
    } else {
      initializePeer();
      setTimeout(() => {
        if (state.peer && state.peer.open) {
          connectToPeer(state.roomId);
        }
      }, 1000);
    }
  }, delay);
}

// ============================================================
// Connect to Peer
// ============================================================
function connectToPeer(peerId) {
  console.log("Connecting to peer:", peerId);
  try {
    displayConnectionStatus("connecting", `Connecting to room ${peerId}...`);
    const isRejoin = !state.isRoomCreator && state.isJoinApproved;
    // Show waiting modal for fresh join approval, but NOT if rejoining cached session
    if (!isRejoin && elements.joinWaitingModal) {
      elements.joinWaitingModal.classList.remove("hidden");
    }

    const conn = state.peer.connect(peerId, {
      metadata: {
        userId: state.userId,
        username: state.username,
        avatar: state.avatar,
        joinRequest: !isRejoin,
        rejoin: isRejoin,
        peerId: state.peerId,
        timestamp: Date.now()
      },
      reliable: true,
      serialization: "json",
    });
    if (conn) {
      handlePeerConnection(conn);
      setTimeout(() => {
        if (state.connectionStatus !== "connected" && conn.peer === peerId && !conn.isConnectionOpen && !state.isJoinApproved) {
          if (elements.joinWaitingModal) elements.joinWaitingModal.classList.add("hidden");
          resetJoinButton();
          displayConnectionStatus("error", "Connection timeout");
          showError("Could not reach room host. Please check room code.");
          resetRoom();
        }
      }, 15000);
    } else {
      if (elements.joinWaitingModal) elements.joinWaitingModal.classList.add("hidden");
      resetJoinButton();
      showError("Failed to connect to the room");
    }
  } catch (error) {
    console.error("Error connecting to peer:", error);
    if (elements.joinWaitingModal) elements.joinWaitingModal.classList.add("hidden");
    resetJoinButton();
    showError("Connection error: " + error.message);
  }
}

// ============================================================
// Handle Peer Connection
// ============================================================
function handlePeerConnection(conn) {
  state.connections[conn.peer] = conn;
  conn.on("open", () => {
    console.log("Connected to peer:", conn.peer);
    conn.isConnectionOpen = true;

    if (state.screenShareStream) callPeerForScreenShare(conn.peer, state.screenShareStream);
    if (state.groupVideoStream) callPeerForGroupVideo(conn.peer, state.groupVideoStream, "Video");
    if (state.webcamStream) callPeerForWebcam(conn.peer, state.webcamStream);
  });

  conn.on("data", (data) => handleIncomingData(conn, data));
  conn.on("close", () => handlePeerDisconnect(conn.peer));
  conn.on("error", (err) => {
    console.error("Connection error with:", conn.peer, err);
    if (conn.peer === state.roomId && !state.isRoomCreator && !state.isJoinApproved) {
      if (elements.joinWaitingModal) elements.joinWaitingModal.classList.add("hidden");
      showError("Connection error: " + err.message);
      resetRoom();
    }
  });
}

// ============================================================
// Join Approval Workflow (Host & Joiner)
// ============================================================
function queueJoinRequest(conn, metadata) {
  state.pendingJoinRequests[conn.peer] = { conn, metadata };
  showNextJoinRequest();
}

function showNextJoinRequest() {
  const peerIds = Object.keys(state.pendingJoinRequests);
  if (peerIds.length === 0) {
    if (elements.joinRequestModal) elements.joinRequestModal.classList.add("hidden");
    state.currentApprovalPeerId = null;
    return;
  }
  const peerId = peerIds[0];
  state.currentApprovalPeerId = peerId;
  const req = state.pendingJoinRequests[peerId];
  if (elements.approvalUserAvatar) elements.approvalUserAvatar.src = req.metadata.avatar || "";
  if (elements.approvalUserName) elements.approvalUserName.textContent = req.metadata.username || "User";
  if (elements.joinRequestModal) elements.joinRequestModal.classList.remove("hidden");
  showToast(`${req.metadata.username} requested to join the room 🔔`, "info", 5000);
}

function handleApproveJoin() {
  const peerId = state.currentApprovalPeerId;
  if (!peerId || !state.pendingJoinRequests[peerId]) return;
  const { conn, metadata } = state.pendingJoinRequests[peerId];
  delete state.pendingJoinRequests[peerId];

  conn.send({ type: "join_approved", hostUserId: state.userId });
  if (metadata?.peerId && metadata.peerId !== state.peerId && !state.connections[metadata.peerId]) {
    const directConn = state.peer.connect(metadata.peerId, {
      metadata: { userId: state.userId, username: state.username, avatar: state.avatar, joinRequest: false }
    });
    handlePeerConnection(directConn);
  }
  setTimeout(() => {
    sendRoomInfo(conn);
    broadcastNewParticipant(metadata);
  }, 200);

  showToast(`Approved ${metadata.username}!`, "success");
  showNextJoinRequest();
}

function handleDenyJoin() {
  const peerId = state.currentApprovalPeerId;
  if (!peerId || !state.pendingJoinRequests[peerId]) return;
  const { conn, metadata } = state.pendingJoinRequests[peerId];
  delete state.pendingJoinRequests[peerId];

  conn.send({ type: "join_rejected", reason: "Host declined your request to join." });
  setTimeout(() => {
    try { conn.close(); } catch (e) {}
  }, 500);

  showToast(`Declined request from ${metadata.username}.`, "info");
  showNextJoinRequest();
}

function handleCancelJoinRequest() {
  if (elements.joinWaitingModal) elements.joinWaitingModal.classList.add("hidden");
  showToast("Join request cancelled.", "info");
  resetRoom();
}

function handleJoinApproved(data) {
  if (elements.joinWaitingModal) elements.joinWaitingModal.classList.add("hidden");
  state.isJoinApproved = true;
  saveRoomSession();
  displayRoom();
  displayConnectionStatus("connected", "Joined room successfully");
  addSelfToParticipants();
  showToast("Approved by host! Welcome to the room 🎉", "success");
}

function handleJoinRejected(data) {
  if (elements.joinWaitingModal) elements.joinWaitingModal.classList.add("hidden");
  showError(data.reason || "Your request to join was declined by the room host.");
  resetRoom();
}

// ============================================================
// Host User Management & Stream Control
// ============================================================
function hostKickUser(userId, username) {
  if (!state.isRoomCreator) return;
  broadcastToPeers({ type: "remove_user", targetUserId: userId });
  const participant = state.participants[userId];
  if (participant && state.connections[participant.peerId]) {
    try { state.connections[participant.peerId].close(); } catch (e) {}
    delete state.connections[participant.peerId];
  }
  handleParticipantLeft(userId);
  showToast(`Removed ${username} from room.`, "info");
}

function hostForceStopScreenShare(userId) {
  if (!state.isRoomCreator) return;
  broadcastToPeers({ type: "force_stop_screenshare", targetUserId: userId });
  handleScreenShareStop();
  handleGroupVideoStop();
  showToast("Stopped participant's presentation.", "info");
}

function handleUserRemoved(data) {
  if (data.targetUserId === state.userId) {
    showError("You have been removed from the room by the host.");
    leaveRoom();
  } else {
    handleParticipantLeft(data.targetUserId);
    displaySystemMessage("A participant was removed by the host.");
  }
}

function handleForceStopScreenShare(data) {
  if (data.targetUserId === state.userId) {
    showToast("The room host stopped your presentation.", "error", 4000);
    if (state.isGroupVideoPresenter) stopGroupVideo();
    else stopScreenShare();
  }
}

function inviteUser() {
  const link = `${window.location.origin}${window.location.pathname}?room=${encodeURIComponent(state.roomId)}`;
  if (navigator.share) {
    navigator.share({
      title: "Join Echo Room",
      text: `Join my Echo Room with code: ${state.roomId}`,
      url: link,
    }).then(() => showToast("Invite link shared!", "success"))
      .catch(() => copyRoomLinkToClipboard());
  } else {
    copyRoomLinkToClipboard();
  }
}

// ============================================================
// Room Info
// ============================================================
function sendRoomInfo(conn) {
  let activeScreening = null;
  const isPresenting = state.isGroupVideoPresenter || state.screenShareStream;
  const isVideoActive = isPresenting || !!state.screenShareUser;

  if (isVideoActive) {
    const videoEl = elements.screenShareVideo;
    let curTime = getActiveVideoCurrentTime();
    let isPaused = !state.groupVideoIsPlaying;
    if (state.isGroupVideoPresenter && videoEl) {
      isPaused = videoEl.paused;
    }
    let duration = getActiveVideoDuration();

    activeScreening = {
      active: true,
      isScreenShare: !!state.screenShareStream,
      isEmbed: !!state.groupVideoIsEmbed,
      embedType: state.groupVideoEmbed?.type || null,
      embedUrl: state.groupVideoEmbed?.embedUrl || null,
      videoId: state.groupVideoEmbed?.id || null,
      isUrl: !!state.groupVideoIsUrl,
      url: state.groupVideoUrl || null,
      title: state.groupVideoTitle || (state.screenShareStream ? "Live Screen Share" : "Video"),
      currentTime: curTime,
      duration: duration,
      paused: isPaused,
      timestamp: Date.now(),
      presenterUserId: state.screenShareUserId,
      presenterUsername: state.screenShareUser,
    };
  }

  conn.send({
    type: "room_info",
    participants: state.participants,
    screenShareActive: !!state.screenShareStream || !!state.groupVideoStream || !!state.groupVideoIsEmbed,
    screenShareUser: state.screenShareUser,
    activeScreening: activeScreening,
  });
}

function broadcastNewParticipant(participantData) {
  broadcastToPeers({
    type: "new_participant",
    participant: {
      userId: participantData.userId,
      username: participantData.username,
      avatar: participantData.avatar,
      peerId: participantData.peerId || state.peerId,
      joinTime: participantData.joinTime || Date.now(),
    },
  });
}

function addSelfToParticipants() {
  state.participants[state.userId] = {
    userId: state.userId,
    username: state.username,
    avatar: state.avatar,
    peerId: state.peerId,
    isCreator: state.isRoomCreator,
    joinTime: Date.now(),
  };
  updateParticipantsUI();
}

// ============================================================
// Incoming Data Handler
// ============================================================
function handleIncomingData(conn, data) {
  switch (data.type) {
    case "join_request":
      if (state.isRoomCreator) queueJoinRequest(conn, data);
      break;
    case "join_approved":
      handleJoinApproved(data);
      break;
    case "join_rejected":
      handleJoinRejected(data);
      break;
    case "remove_user":
      handleUserRemoved(data);
      break;
    case "force_stop_screenshare":
      handleForceStopScreenShare(data);
      break;
    case "group_video_start":
      handleGroupVideoStart(data);
      break;
    case "group_video_stop":
      handleGroupVideoStop();
      break;
    case "group_video_sync":
      handleGroupVideoSync(data);
      break;
    case "group_video_control":
      handleGroupVideoControl(data);
      break;
    case "webcam_start":
      break;
    case "webcam_stop":
      removeWebcamTile(data.userId);
      break;
    case "reaction":
      showReactionOverlay(data.emoji, data.username);
      break;
    case "mic_start":
      break;
    case "mic_stop":
      break;
    case "room_info":
      handleRoomInfo(data, conn);
      break;
    case "new_participant":
      handleNewParticipant(data.participant);
      break;
    case "participant_left":
      handleParticipantLeft(data.userId);
      break;
    case "host_update":
      handleHostUpdate(data);
      break;
    case "chat_message":
      displayMessage(data.message);
      break;
    case "screen_share_start":
      handleScreenShareStart(data);
      break;
    case "screen_share_stop":
      handleScreenShareStop();
      break;
    case "heartbeat":
      conn.send({ type: "heartbeat_ack", timestamp: data.timestamp, received: Date.now() });
      break;
    case "heartbeat_ack": break;
    default: console.log("Unknown data type:", data.type);
  }
}

function handleRoomInfo(data, conn) {
  state.participants = data.participants;
  if (!state.participants[state.userId]) {
    state.participants[state.userId] = {
      userId: state.userId, username: state.username, avatar: state.avatar, peerId: state.peerId,
    };
    conn.send({ type: "new_participant", participant: state.participants[state.userId] });
  }

  // Ensure full mesh connectivity: connect to all existing participants in the room
  Object.values(data.participants).forEach((p) => {
    if (p.userId !== state.userId && p.peerId && p.peerId !== state.peerId && !state.connections[p.peerId]) {
      const peerConn = state.peer.connect(p.peerId, {
        metadata: { userId: state.userId, username: state.username, avatar: state.avatar, joinRequest: false },
      });
      handlePeerConnection(peerConn);
    }
  });

  // Late-join active screening catchup
  if (data.activeScreening && data.activeScreening.active && !state.isGroupVideoPresenter && !state.screenShareStream) {
    const scr = data.activeScreening;
    state.screenShareUser = scr.presenterUsername;
    state.screenShareUserId = scr.presenterUserId;
    state.groupVideoTitle = scr.title;
    if (scr.duration && Number.isFinite(scr.duration) && scr.duration > 0) {
      state.groupVideoDuration = scr.duration;
    }

    document.getElementById("stageEmpty")?.classList.add("hidden");
    document.getElementById("stageTop")?.classList.remove("hidden");
    document.getElementById("transport")?.classList.remove("hidden");
    if (elements.screenShareUser) elements.screenShareUser.textContent = state.screenShareUser;
    if (elements.stopScreenShareBtn) elements.stopScreenShareBtn.classList.add("hidden");
    if (document.getElementById("nowShowing")) {
      document.getElementById("nowShowing").textContent = "SCREENING — " + (scr.title || "VIDEO").toUpperCase();
    }

    const transitSeconds = scr.timestamp ? Math.max(0, (Date.now() - scr.timestamp) / 1000) : 0;
    const currentPosition = (scr.currentTime || 0) + (scr.paused ? 0 : transitSeconds);
    state.groupVideoCurrentTime = currentPosition;
    state.groupVideoIsPlaying = !scr.paused;
    updateTransportPlayButton(state.groupVideoIsPlaying);
    startTransportTicker();

    const tpDurTime = document.getElementById("tpDurTime");
    if (tpDurTime && state.groupVideoDuration > 0) {
      tpDurTime.textContent = fmtTransportTime(state.groupVideoDuration);
    }

    if (scr.isEmbed) {
      state.groupVideoIsEmbed = true;
      state.groupVideoEmbed = { type: scr.embedType, embedUrl: scr.embedUrl, id: scr.videoId, title: scr.title };
      if (scr.embedType === "youtube" && scr.videoId) {
        loadYouTubePlayer(scr.videoId, { title: scr.title, initialTime: currentPosition, paused: scr.paused });
      } else if (scr.embedUrl) {
        loadGenericEmbedVideo(scr.embedUrl, scr.title, currentPosition);
      }
    } else if (scr.isUrl && scr.url) {
      state.groupVideoIsEmbed = false;
      state.groupVideoIsUrl = true;
      state.groupVideoUrl = scr.url;
      const vid = elements.screenShareVideo;
      if (vid) {
        vid.classList.remove("hidden");
        vid.crossOrigin = "anonymous";
        vid.src = scr.url;
        const applySync = () => {
          if (currentPosition > 0) {
            try { vid.currentTime = currentPosition; } catch (e) {}
          }
          if (scr.paused) {
            try { vid.pause(); } catch (e) {}
            updateTransportPlayButton(false);
          } else {
            vid.play().catch(() => {});
            updateTransportPlayButton(true);
          }
        };
        if (vid.readyState >= 1) {
          applySync();
        } else {
          vid.onloadedmetadata = applySync;
        }
      }
    } else if (scr.isScreenShare) {
      if (elements.streamTypeIcon) elements.streamTypeIcon.className = "fas fa-desktop";
    } else {
      if (elements.streamTypeIcon) elements.streamTypeIcon.className = "fas fa-film";
    }

    if (!state.movieMode) activateMovieMode();
  }

  updateParticipantsUI();
}

function handleNewParticipant(participant) {
  if (participant.userId !== state.userId) {
    state.participants[participant.userId] = participant;
    if (!state.connections[participant.peerId] && participant.peerId !== state.peerId) {
      const conn = state.peer.connect(participant.peerId, {
        metadata: { userId: state.userId, username: state.username, avatar: state.avatar, joinRequest: false },
      });
      handlePeerConnection(conn);
    }
    updateParticipantsUI();
    displaySystemMessage(`${participant.username} joined the room`);
  }
}

function handleParticipantLeft(userId) {
  if (state.participants[userId]) {
    const username = state.participants[userId].username;
    const wasHost = !!state.participants[userId].isCreator;
    delete state.participants[userId];
    updateParticipantsUI();
    displaySystemMessage(`${username} left the room`);
    if ((state.screenShareUserId && state.screenShareUserId === userId) ||
        (state.screenShareUser && state.screenShareUser === username)) {
      handleScreenShareStop();
      displaySystemMessage("Screen sharing ended (presenter left the room)");
    }
    if (wasHost && Object.keys(state.participants).length > 0) {
      electNewRoomCreator();
    }
  }
}

function handlePeerDisconnect(peerId) {
  let disconnectedUserId = null, disconnectedUsername = null, wasHost = false;
  for (const userId in state.participants) {
    if (state.participants[userId].peerId === peerId) {
      disconnectedUserId = userId;
      disconnectedUsername = state.participants[userId].username;
      wasHost = !!state.participants[userId].isCreator || peerId === state.roomId;
      break;
    }
  }
  if (disconnectedUserId) {
    delete state.participants[disconnectedUserId];
    updateParticipantsUI();
    displaySystemMessage(`${disconnectedUsername} left the room`);
    if ((state.screenShareUserId && state.screenShareUserId === disconnectedUserId) ||
        (state.screenShareUser && state.screenShareUser === disconnectedUsername)) {
      handleScreenShareStop();
      displaySystemMessage("Screen sharing ended (presenter left the room)");
    }
    broadcastToPeers({ type: "participant_left", userId: disconnectedUserId });
  }
  if (state.connections[peerId]) delete state.connections[peerId];
  if (wasHost && Object.keys(state.participants).length > 0) {
    electNewRoomCreator();
  }
}

function electNewRoomCreator() {
  const remaining = Object.values(state.participants).sort((a, b) => (a.joinTime || 0) - (b.joinTime || 0));
  if (remaining.length > 0) {
    Object.values(state.participants).forEach((p) => (p.isCreator = false));
    const newHost = remaining[0];
    newHost.isCreator = true;

    if (newHost.userId === state.userId) {
      state.isRoomCreator = true;
      saveRoomSession();
      showToast("The room host left. You are now the host! 👑", "info", 4000);
      displaySystemMessage("You are now the room host.");
      
      // Instantly notify existing peers without closing mesh WebRTC connections
      broadcastToPeers({ type: "host_update", hostUserId: state.userId, participants: state.participants });

      // Claim the room code ID on the signaling broker in the background for new incoming joiners
      claimHostBrokerId(state.roomId);
    } else {
      showToast(`${newHost.username} is now the room host.`, "info", 4000);
      displaySystemMessage(`${newHost.username} is now the room host.`);
    }
    updateParticipantsUI();
  }
}

function claimHostBrokerId(roomId) {
  if (!state.isRoomCreator || !roomId) return;
  let attempts = 0;
  const maxAttempts = 30;

  function tryRegister() {
    if (!state.isRoomCreator || state.roomId !== roomId) return;
    if (state.hostBrokerPeer) {
      try { state.hostBrokerPeer.disconnect(); } catch (e) {}
      try { state.hostBrokerPeer.destroy(); } catch (e) {}
      state.hostBrokerPeer = null;
    }

    const broker = new Peer(roomId, {
      config: {
        iceServers: [
          { urls: "stun:stun.l.google.com:19302" },
          { urls: "stun:global.stun.twilio.com:3478" },
        ],
      },
      debug: 1,
    });

    broker.on("open", (id) => {
      console.log("Host broker successfully bound to room ID:", id);
      state.hostBrokerPeer = broker;
      displaySystemMessage("Room ready for new participants to join.");
    });

    broker.on("connection", (conn) => {
      console.log("New incoming joiner connected to host broker:", conn.peer, conn.metadata);
      // Auto-reconnect if session rejoin
      if (conn.metadata?.rejoin && state.isRoomCreator) {
        conn.on("open", () => {
          conn.send({ type: "join_approved", hostUserId: state.userId });
          setTimeout(() => {
            sendRoomInfo(conn);
            broadcastNewParticipant(conn.metadata);
          }, 100);
        });
        displaySystemMessage(`${conn.metadata.username} reconnected to the room`);
        handlePeerConnection(conn);
        return;
      }
      // Instant approval popup on host screen without waiting for ICE open
      if (conn.metadata?.joinRequest && state.isRoomCreator) {
        queueJoinRequest(conn, conn.metadata);
      }
      handlePeerConnection(conn);
    });

    broker.on("call", (call) => {
      console.log("Incoming media call on host broker:", call.peer, call.metadata);
      call.answer();
      if (call.metadata?.type === "webcam") {
        call.on("stream", (remoteStream) => {
          addWebcamTile(call.metadata?.userId, call.metadata?.username || "User", remoteStream, false);
        });
      }
    });

    broker.on("error", (err) => {
      console.warn("Host broker registration notice:", err.type);
      try { broker.disconnect(); } catch (e) {}
      try { broker.destroy(); } catch (e) {}
      state.hostBrokerPeer = null;
      attempts++;
      if (state.isRoomCreator && (err.type === "unavailable-id" || err.type === "network") && attempts < maxAttempts) {
        setTimeout(tryRegister, 1000);
      }
    });
  }

  setTimeout(tryRegister, 150);
}

function handleHostUpdate(data) {
  if (data.participants) state.participants = data.participants;
  if (data.hostUserId === state.userId) {
    state.isRoomCreator = true;
    claimHostBrokerId(state.roomId);
    saveRoomSession();
  } else if (state.participants[data.hostUserId]) {
    state.isRoomCreator = false;
  }
  const host = state.participants[data.hostUserId];
  if (host) displaySystemMessage(`${host.username} is now the room host.`);
  updateParticipantsUI();
}

// ============================================================
// Display Room
// ============================================================
function displayRoom() {
  elements.homeScreen.classList.add("hidden");
  elements.chatRoom.classList.remove("hidden");
  if (elements.ripRoomId) elements.ripRoomId.textContent = state.roomId;
  updateUrlWithRoom(state.roomId);
}

// ============================================================
// Participants UI
// ============================================================
function resetParticipantsUI() {
  if (elements.sidebarParticipants) elements.sidebarParticipants.innerHTML = "";
  if (elements.participantsList) elements.participantsList.innerHTML = "";
  if (elements.participantCount) elements.participantCount.textContent = "0";
}

function updateParticipantsUI() {
  const participants = Object.values(state.participants);
  const count = participants.length;

  // Update header chip & modal count
  if (elements.participantCount) elements.participantCount.textContent = count;
  if (elements.modalPCount) elements.modalPCount.textContent = count;
  if (elements.ripRoomId) elements.ripRoomId.textContent = state.roomId || "——";
  if (elements.modalRoomId) elements.modalRoomId.textContent = state.roomId || "——";

  // Update room info modal participants list with Host moderation actions
  const pList = elements.participantsList || document.getElementById("modal-participants-list");
  if (pList) {
    pList.innerHTML = "";
    participants.forEach((p) => {
      const li = document.createElement("li");
      li.style.display = "flex";
      li.style.alignItems = "center";
      li.style.gap = "10px";
      li.style.padding = "8px 10px";
      li.style.background = "var(--bg1)";
      li.style.border = "1px solid var(--line2)";
      li.style.borderRadius = "10px";

      const img = document.createElement("img");
      img.className = "sidebar-avatar";
      img.src = p.avatar;
      img.alt = p.username;
      img.style.width = "30px";
      img.style.height = "30px";
      img.style.borderRadius = "50%";
      img.style.objectFit = "cover";

      const nameWrap = document.createElement("div");
      nameWrap.style.flex = "1";
      nameWrap.style.minWidth = "0";
      nameWrap.style.display = "flex";
      nameWrap.style.alignItems = "center";
      nameWrap.style.gap = "6px";

      const name = document.createElement("span");
      name.style.font = "500 13.5px var(--fu)";
      name.style.color = "var(--ink)";
      name.style.overflow = "hidden";
      name.style.textOverflow = "ellipsis";
      name.style.whiteSpace = "nowrap";
      name.textContent = p.username;
      nameWrap.appendChild(name);

      if (p.isCreator) {
        const hostTag = document.createElement("span");
        hostTag.className = "you";
        hostTag.style.borderColor = "var(--amber)";
        hostTag.style.color = "var(--amber)";
        hostTag.textContent = "HOST";
        nameWrap.appendChild(hostTag);
      }
      if (p.userId === state.userId) {
        const youTag = document.createElement("span");
        youTag.className = "you";
        youTag.style.borderColor = "var(--ok)";
        youTag.style.color = "var(--ok)";
        youTag.textContent = "YOU";
        nameWrap.appendChild(youTag);
      }

      li.appendChild(img);
      li.appendChild(nameWrap);

      // Host controls: kick user & stop user screen share
      if (state.isRoomCreator && p.userId !== state.userId) {
        const actionsDiv = document.createElement("div");
        actionsDiv.style.display = "flex";
        actionsDiv.style.gap = "6px";
        actionsDiv.style.alignItems = "center";

        if (state.screenShareUserId === p.userId) {
          const stopShareBtn = document.createElement("button");
          stopShareBtn.className = "iconbtn tiny";
          stopShareBtn.title = "Stop user screen share";
          stopShareBtn.innerHTML = '<i class="fas fa-ban" style="color:var(--amber)"></i>';
          stopShareBtn.addEventListener("click", () => hostForceStopScreenShare(p.userId));
          actionsDiv.appendChild(stopShareBtn);
        }

        const kickBtn = document.createElement("button");
        kickBtn.className = "iconbtn tiny";
        kickBtn.title = `Remove ${p.username} from room`;
        kickBtn.innerHTML = '<i class="fas fa-user-minus" style="color:var(--red)"></i>';
        kickBtn.addEventListener("click", () => hostKickUser(p.userId, p.username));
        actionsDiv.appendChild(kickBtn);

        li.appendChild(actionsDiv);
      }

      pList.appendChild(li);
    });
  }

  // Update host stop button on active screen share overlay
  const isNonHostPresenting = state.isRoomCreator && state.screenShareUserId && state.screenShareUserId !== state.userId;
  if (elements.hostStopScreenShareBtn) {
    elements.hostStopScreenShareBtn.classList.toggle("hidden", !isNonHostPresenting);
  }
  if (elements.hostStopScreenShareBadge) {
    elements.hostStopScreenShareBadge.classList.toggle("hidden", !isNonHostPresenting);
  }
}

// ============================================================
// Room Info Panel
// ============================================================
function openRoomInfoPanel() {
  if (elements.ripRoomId) elements.ripRoomId.textContent = state.roomId || "——";
  if (elements.modalRoomId) elements.modalRoomId.textContent = state.roomId || "——";
  updateParticipantsUI();
  if (elements.roomInfoModal) elements.roomInfoModal.classList.remove("hidden");
}

function closeRoomInfoPanel() {
  if (elements.roomInfoModal) elements.roomInfoModal.classList.add("hidden");
}

// ============================================================
// Sidebar (mobile)
// ============================================================
function toggleSidebar() {
  const isOpen = elements.participantsSidebar.classList.contains("sidebar-open");
  isOpen ? closeSidebar() : openSidebar();
}

function openSidebar() {
  elements.participantsSidebar.classList.add("sidebar-open");
  // Create overlay
  if (!sidebarOverlay) {
    sidebarOverlay = document.createElement("div");
    sidebarOverlay.className = "sidebar-overlay";
    sidebarOverlay.addEventListener("click", closeSidebar);
    document.getElementById("room-body").appendChild(sidebarOverlay);
  }
}

function closeSidebar() {
  elements.participantsSidebar.classList.remove("sidebar-open");
  if (sidebarOverlay) { sidebarOverlay.remove(); sidebarOverlay = null; }
}

// ============================================================
// Movie Mode
// ============================================================
function toggleMovieMode() {
  state.movieMode ? deactivateMovieMode() : activateMovieMode();
}

function activateMovieMode() {
  state.movieMode = true;
  if (elements.movieModeBtn) {
    elements.movieModeBtn.classList.add("movie-active");
    elements.movieModeBtn.title = "Exit Movie Mode";
  }

  const roomBody = elements.roomBody;
  const screenShare = elements.screenShareContainer;

  // Ensure screen share container is visible if there is an active stream or video
  if (screenShare && screenShare.classList.contains("hidden") && state.screenShareVideo && (state.screenShareVideo.srcObject || state.screenShareVideo.src)) {
    screenShare.classList.remove("hidden");
  }

  // Show movie control bar & webcam grid row
  if (elements.movieControlsBar) elements.movieControlsBar.classList.remove("hidden");
  if (elements.webcamGrid) elements.webcamGrid.classList.add("webcam-grid-row");

  // Show quality control for non-presenters
  if (!state.isGroupVideoPresenter && !state.screenShareStream && elements.qualityControl) {
    const hasRemoteStream = elements.screenShareVideo && elements.screenShareVideo.srcObject;
    if (hasRemoteStream) elements.qualityControl.classList.remove("hidden");
  }

  // Sync movie mode button states
  syncMmButtons();

  if (roomBody) roomBody.classList.add("movie-mode");
  showToast("Movie Mode activated 🎬", "info", 2000);
}

function deactivateMovieMode() {
  state.movieMode = false;
  if (elements.movieModeBtn) {
    elements.movieModeBtn.classList.remove("movie-active");
    elements.movieModeBtn.title = "Movie Mode";
  }

  const roomBody = elements.roomBody;

  // Clean up any legacy inner movie panel if present
  const movieChatPanel = document.getElementById("movie-chat-panel-inner");
  if (movieChatPanel) movieChatPanel.remove();

  // Hide movie controls
  if (elements.movieControlsBar) elements.movieControlsBar.classList.add("hidden");
  if (elements.webcamGrid) elements.webcamGrid.classList.remove("webcam-grid-row");
  if (elements.qualityControl) elements.qualityControl.classList.add("hidden");
  if (elements.reactionPicker) elements.reactionPicker.classList.add("hidden");

  if (roomBody) roomBody.classList.remove("movie-mode");
  showToast("Movie Mode deactivated", "info", 2000);
}

// Sync movie mode button visual states with current app state
function syncMmButtons() {
  if (!elements.mmCamBtn || !elements.mmMicBtn) return;

  if (state.webcamStream) {
    elements.mmCamBtn.classList.add("mm-active");
    elements.mmCamBtn.innerHTML = '<i class="fas fa-video"></i><span>Cam</span>';
  } else {
    elements.mmCamBtn.classList.remove("mm-active");
    elements.mmCamBtn.innerHTML = '<i class="fas fa-video-slash"></i><span>Cam</span>';
  }

  if (state.isMicOn) {
    elements.mmMicBtn.classList.add("mm-active");
    elements.mmMicBtn.innerHTML = '<i class="fas fa-microphone"></i><span>Mic</span>';
  } else {
    elements.mmMicBtn.classList.remove("mm-active");
    elements.mmMicBtn.innerHTML = '<i class="fas fa-microphone-slash"></i><span>Mic</span>';
  }

  if (state.screenShareStream || state.isGroupVideoPresenter) {
    elements.mmShareBtn.classList.add("mm-active");
  } else {
    elements.mmShareBtn.classList.remove("mm-active");
  }
}



// ============================================================
// Screen Share
// ============================================================
async function startScreenShare() {
  const isOtherSharing = state.screenShareUserId && state.screenShareUserId !== state.userId;
  if (isOtherSharing) {
    showToast(`${state.screenShareUser || "Someone"} is currently presenting. They must stop first.`, "info");
    return;
  }
  if (state.screenShareStream) { showToast("You are already sharing your screen.", "info"); return; }
  if (state.isGroupVideoPresenter) {
    stopGroupVideo();
  }

  try {
    const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
    state.screenShareStream = stream;
    state.screenShareUser = state.username;
    state.screenShareUserId = state.userId;

    document.getElementById("stageEmpty")?.classList.add("hidden");
    document.getElementById("stageTop")?.classList.remove("hidden");
    document.getElementById("transport")?.classList.remove("hidden");
    if (elements.screenShareContainer) elements.screenShareContainer.classList.remove("hidden");
    if (elements.screenShareVideo) elements.screenShareVideo.classList.remove("hidden");
    if (elements.screenShareVideo) elements.screenShareVideo.srcObject = stream;
    if (elements.screenShareUser) elements.screenShareUser.textContent = "You";
    if (elements.stopScreenShareBtn) elements.stopScreenShareBtn.classList.remove("hidden");
    if (document.getElementById("nowShowing")) {
      document.getElementById("nowShowing").textContent = "SCREENING — LIVE SCREEN SHARE";
    }

    Object.keys(state.connections).forEach((peerId) => {
      if (state.connections[peerId] && state.connections[peerId].open) {
        callPeerForScreenShare(peerId, stream);
      }
    });

    stream.getVideoTracks()[0].addEventListener("ended", () => stopScreenShare());

    broadcastToPeers({ type: "screen_share_start", username: state.username, userId: state.userId });

    // Auto-activate movie mode for presenter
    if (!state.movieMode) activateMovieMode();
  } catch (err) {
    console.error("Error starting screen share:", err);
    if (err.name !== "NotAllowedError") showError("Could not start screen sharing: " + err.message);
  }
}

function callPeerForScreenShare(peerId, stream) {
  try {
    const mediaCall = state.peer.call(peerId, stream, {
      metadata: { type: "screen_share", userId: state.userId, username: state.username },
    });
    if (mediaCall) state.screenShareCalls[peerId] = mediaCall;
  } catch (err) {
    console.error(`Error calling ${peerId} for screen share:`, err);
  }
}

function handleScreenShareStart(data) {
  state.screenShareUser = data.username;
  state.screenShareUserId = data.userId;
  document.getElementById("stageEmpty")?.classList.add("hidden");
  document.getElementById("stageTop")?.classList.remove("hidden");
  document.getElementById("transport")?.classList.remove("hidden");
  if (elements.screenShareContainer) elements.screenShareContainer.classList.remove("hidden");
  if (elements.screenShareVideo) elements.screenShareVideo.classList.remove("hidden");
  if (elements.screenShareUser) elements.screenShareUser.textContent = data.username;
  if (elements.stopScreenShareBtn) elements.stopScreenShareBtn.classList.add("hidden");
  if (document.getElementById("nowShowing")) {
    document.getElementById("nowShowing").textContent = "SCREENING — " + data.username.toUpperCase();
  }
  displaySystemMessage(`${data.username} is sharing their screen`);
}

function stopScreenShare() {
  if (state.screenShareStream) {
    state.screenShareStream.getTracks().forEach((track) => track.stop());
    state.screenShareStream = null;
    state.screenShareUser = null;
    state.screenShareUserId = null;

    Object.values(state.screenShareCalls).forEach((call) => {
      try { call.close(); } catch (e) { console.error("Error closing screen share call:", e); }
    });
    state.screenShareCalls = {};

    document.getElementById("stageEmpty")?.classList.remove("hidden");
    document.getElementById("stageTop")?.classList.add("hidden");
    document.getElementById("transport")?.classList.add("hidden");
    if (elements.screenShareVideo) {
      elements.screenShareVideo.onerror = null;
      elements.screenShareVideo.srcObject = null;
      elements.screenShareVideo.classList.add("hidden");
    }
    if (elements.stopScreenShareBtn) elements.stopScreenShareBtn.classList.add("hidden");
    if (document.getElementById("nowShowing")) {
      document.getElementById("nowShowing").textContent = "STANDBY — NOTHING SCREENING";
    }

    broadcastToPeers({ type: "screen_share_stop", userId: state.userId });

    // Exit movie mode when sharing stops
    if (state.movieMode) deactivateMovieMode();
    updateParticipantsUI();
  }
}

function handleScreenShareStop() {
  state.screenShareUser = null;
  state.screenShareUserId = null;
  document.getElementById("stageEmpty")?.classList.remove("hidden");
  document.getElementById("stageTop")?.classList.add("hidden");
  document.getElementById("transport")?.classList.add("hidden");
  if (elements.screenShareVideo) {
    elements.screenShareVideo.onerror = null;
    elements.screenShareVideo.srcObject = null;
    elements.screenShareVideo.classList.add("hidden");
  }
  if (elements.stopScreenShareBtn) elements.stopScreenShareBtn.classList.add("hidden");
  if (document.getElementById("nowShowing")) {
    document.getElementById("nowShowing").textContent = "STANDBY — NOTHING SCREENING";
  }
  if (state.movieMode) deactivateMovieMode();
  updateParticipantsUI();
}

// ============================================================
// Group Video Watching (File or URL)
// ============================================================
function openVideoSourceModal() {
  const isOtherSharing = state.screenShareUserId && state.screenShareUserId !== state.userId;
  if (isOtherSharing) {
    showToast(`${state.screenShareUser || "Someone"} is currently presenting.`, "info");
    return;
  }
  if (elements.videoSourceModal) elements.videoSourceModal.classList.remove("hidden");
}

function closeVideoSourceModal() {
  if (elements.videoSourceModal) elements.videoSourceModal.classList.add("hidden");
}

function handleDeviceVideoSubmit() {
  const file = elements.videoFileInput?.files?.[0];
  if (!file) { showError("Please select a video file from your device."); return; }
  const fileUrl = URL.createObjectURL(file);
  startGroupVideo(fileUrl, file.name.replace(/\.[^/.]+$/, ""));
}

function handleUrlVideoSubmit() {
  const url = elements.videoUrlInput?.value?.trim();
  if (!url) { showError("Please enter a valid video URL."); return; }

  const classification = classifyMediaUrl(url);

  if (classification.type === "unknown") {
    showError("Please enter a valid http:// or https:// video URL.");
    return;
  }

  if (elements.urlStreamFallbackBox) {
    elements.urlStreamFallbackBox.classList.add("hidden");
  }

  if (classification.type === "embed") {
    startGroupVideo(classification.embed.embedUrl, classification.embed.title, classification.embed);
  } else {
    startGroupVideo(url, "Online Video");
  }
}

function classifyMediaUrl(url) {
  if (!url || typeof url !== "string") return { type: "unknown" };
  const trimmed = url.trim();

  // 1. Check supported platform embeds
  const embed = detectEmbedSource(trimmed);
  if (embed) {
    return { type: "embed", embed };
  }

  // 2. Direct media URLs: Any valid HTTP/HTTPS or blob/data URL
  if (/^https?:\/\//i.test(trimmed) || trimmed.startsWith("blob:") || trimmed.startsWith("data:")) {
    return { type: "direct", url: trimmed };
  }

  return { type: "unknown", url: trimmed };
}

function detectEmbedSource(url) {
  if (!url || typeof url !== "string") return null;
  const trimmed = url.trim();

  // YouTube: Standard watch, short youtu.be, embed, shorts, live
  const ytMatch = trimmed.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/|live\/))([\w-]{11})/);
  if (ytMatch) {
    return {
      type: "youtube",
      id: ytMatch[1],
      embedUrl: `https://www.youtube-nocookie.com/embed/${ytMatch[1]}?autoplay=1&enablejsapi=1`,
      title: "YouTube Video",
    };
  }

  // Facebook Watch & Videos
  if (/facebook\.com|fb\.watch/i.test(trimmed)) {
    return {
      type: "facebook",
      id: trimmed,
      embedUrl: `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(trimmed)}&show_text=0&autoplay=1`,
      title: "Facebook Video",
    };
  }

  // Vimeo
  const vimeoMatch = trimmed.match(/vimeo\.com\/(?:video\/)?(\d+)/i);
  if (vimeoMatch) {
    return {
      type: "vimeo",
      id: vimeoMatch[1],
      embedUrl: `https://player.vimeo.com/video/${vimeoMatch[1]}?autoplay=1`,
      title: "Vimeo Video",
    };
  }

  // Twitch Clips & Channels
  const twitchClipMatch = trimmed.match(/(?:clips\.twitch\.tv\/|twitch\.tv\/[\w-]+\/clip\/)([\w-]+)/i);
  if (twitchClipMatch) {
    const parentHost = window.location.hostname || "localhost";
    return {
      type: "twitch_clip",
      id: twitchClipMatch[1],
      embedUrl: `https://clips.twitch.tv/embed?clip=${twitchClipMatch[1]}&parent=${parentHost}&autoplay=true`,
      title: "Twitch Clip",
    };
  }
  const twitchChannelMatch = trimmed.match(/twitch\.tv\/([\w-]+)/i);
  if (twitchChannelMatch && !/videos|directory/i.test(twitchChannelMatch[1])) {
    const parentHost = window.location.hostname || "localhost";
    return {
      type: "twitch",
      id: twitchChannelMatch[1],
      embedUrl: `https://player.twitch.tv/?channel=${twitchChannelMatch[1]}&parent=${parentHost}&autoplay=true`,
      title: "Twitch Stream",
    };
  }

  // Dailymotion
  const dmMatch = trimmed.match(/(?:dailymotion\.com\/video\/|dai\.ly\/)([\w-]+)/i);
  if (dmMatch) {
    return {
      type: "dailymotion",
      id: dmMatch[1],
      embedUrl: `https://www.dailymotion.com/embed/video/${dmMatch[1]}?autoplay=1`,
      title: "Dailymotion Video",
    };
  }

  // Generic Embed link
  if (/\/embed\//i.test(trimmed)) {
    return {
      type: "embed",
      id: trimmed,
      embedUrl: trimmed,
      title: "Embedded Media",
    };
  }

  return null;
}

function cleanUpActivePlayer() {
  stopPresenterHeartbeat();
  stopTransportTicker();

  if (state.ytPlayer) {
    try {
      if (typeof state.ytPlayer.destroy === "function") {
        state.ytPlayer.destroy();
      }
    } catch (e) {}
    state.ytPlayer = null;
    state.ytPlayerReady = false;
  }

  const container = document.getElementById("group-video-player-container");
  if (container) container.remove();

  const oldPlayer = document.getElementById("group-video-player");
  if (oldPlayer) oldPlayer.remove();

  state.groupVideoElement = null;
}

function startPresenterHeartbeat() {
  stopPresenterHeartbeat();
  state.videoSyncHeartbeatTimer = setInterval(() => {
    if (!state.isGroupVideoPresenter) {
      stopPresenterHeartbeat();
      return;
    }
    let curTime = getActiveVideoCurrentTime();
    let dur = getActiveVideoDuration();
    let isPaused = false;

    if (state.groupVideoIsEmbed) {
      if (state.ytPlayer && typeof state.ytPlayer.getPlayerState === "function") {
        try { isPaused = state.ytPlayer.getPlayerState() !== (window.YT?.PlayerState?.PLAYING ?? 1); } catch (e) {}
      }
    } else if (elements.screenShareVideo) {
      isPaused = elements.screenShareVideo.paused;
    } else {
      return;
    }

    broadcastToPeers({
      type: "group_video_sync",
      action: "heartbeat",
      time: curTime,
      duration: dur,
      paused: isPaused,
      timestamp: Date.now(),
    });
  }, 2000);
}

function stopPresenterHeartbeat() {
  if (state.videoSyncHeartbeatTimer) {
    clearInterval(state.videoSyncHeartbeatTimer);
    state.videoSyncHeartbeatTimer = null;
  }
}

function loadYouTubePlayer(videoId, options = {}) {
  cleanUpActivePlayer();

  if (elements.screenShareVideo) {
    elements.screenShareVideo.onerror = null;
    try { elements.screenShareVideo.pause(); } catch (e) {}
    elements.screenShareVideo.classList.add("hidden");
  }

  let container = document.getElementById("group-video-player-container");
  if (!container) {
    container = document.createElement("div");
    container.id = "group-video-player-container";
    container.style.position = "absolute";
    container.style.inset = "0";
    container.style.width = "100%";
    container.style.height = "100%";
    container.style.zIndex = "1";
    if (elements.screenShareContainer) {
      elements.screenShareContainer.classList.remove("hidden");
      elements.screenShareContainer.insertBefore(container, elements.screenShareContainer.firstChild);
    }
  }

  const ytDiv = document.createElement("div");
  ytDiv.id = "yt-player-target";
  container.innerHTML = "";
  container.appendChild(ytDiv);

  state.ytPlayerReady = false;
  const isPresenter = state.isGroupVideoPresenter;

  const initPlayer = () => {
    try {
      state.ytPlayer = new window.YT.Player("yt-player-target", {
        videoId: videoId,
        width: "100%",
        height: "100%",
        playerVars: {
          autoplay: 1,
          enablejsapi: 1,
          controls: 1,
          modestbranding: 1,
          rel: 0,
          playsinline: 1,
          origin: window.location.origin,
        },
        events: {
          onReady: (event) => {
            state.ytPlayerReady = true;
            const player = event.target;

            const iframe = document.getElementById("yt-player-target") || container.querySelector("iframe");
            if (iframe) {
              iframe.setAttribute("allow", "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share");
              iframe.setAttribute("allowfullscreen", "true");
            }

            const startPos = (state.pendingYtSync && typeof state.pendingYtSync.time === "number")
              ? state.pendingYtSync.time
              : (options.initialTime || 0);

            const shouldPause = (state.pendingYtSync && state.pendingYtSync.paused !== undefined)
              ? state.pendingYtSync.paused
              : !!options.paused;

            if (startPos > 0) {
              try { player.seekTo(startPos, true); } catch (e) {}
            }

            if (!isPresenter) {
              // Participant: start muted so browser autoplay policy permits playback
              try { player.mute(); } catch (e) {}
            }

            if (shouldPause) {
              try { player.pauseVideo(); } catch (e) {}
              updateTransportPlayButton(false);
            } else {
              try { player.playVideo(); } catch (e) {}
              updateTransportPlayButton(true);
              if (!isPresenter) {
                showToast("YouTube video synced! Click player or speaker to unmute 🔊", "info", 4000);
              }
            }

            state.pendingYtSync = null;
            startTransportTicker();

            // Unmute on first user interaction with container
            const unmuteOnUserAction = () => {
              if (!state.isGroupVideoPresenter) {
                sendYouTubeCommand("unMute");
                const tpMuteBtn = document.getElementById("tpMuteBtn");
                if (tpMuteBtn) tpMuteBtn.innerHTML = '<i class="fas fa-volume-up"></i>';
              }
              container.removeEventListener("click", unmuteOnUserAction);
            };
            container.addEventListener("click", unmuteOnUserAction);
          },
          onStateChange: (event) => {
            if (!state.isGroupVideoPresenter || state.ignoreYtStateEvents) return;
            const player = event.target;
            const curTime = player.getCurrentTime ? (player.getCurrentTime() || 0) : 0;
            const dur = player.getDuration ? (player.getDuration() || 0) : (state.groupVideoDuration || 0);

            if (event.data === window.YT.PlayerState.PLAYING) {
              updateTransportPlayButton(true);
              broadcastToPeers({
                type: "group_video_sync",
                action: "play",
                time: curTime,
                duration: dur,
                paused: false,
                timestamp: Date.now(),
              });
              startPresenterHeartbeat();
            } else if (event.data === window.YT.PlayerState.PAUSED) {
              updateTransportPlayButton(false);
              broadcastToPeers({
                type: "group_video_sync",
                action: "pause",
                time: curTime,
                duration: dur,
                paused: true,
                timestamp: Date.now(),
              });
              stopPresenterHeartbeat();
            } else if (event.data === window.YT.PlayerState.ENDED) {
              stopGroupVideo();
            }
          },
          onError: (event) => {
            console.warn("YouTube player error:", event.data);
            if (event.data === 101 || event.data === 150) {
              showToast("Embedding restricted by the owner. Share your screen/tab instead! 📺", "info", 6000);
            }
          },
        },
      });
    } catch (e) {
      console.error("Error creating YouTube player:", e);
    }
  };

  if (window.YT && window.YT.Player) {
    initPlayer();
  } else {
    const prevCallback = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      if (typeof prevCallback === "function") prevCallback();
      initPlayer();
    };
    let pollCount = 0;
    const ytInterval = setInterval(() => {
      pollCount++;
      if (window.YT && window.YT.Player) {
        clearInterval(ytInterval);
        if (!state.ytPlayer) initPlayer();
      } else if (pollCount > 30) {
        clearInterval(ytInterval);
      }
    }, 200);
  }

  document.getElementById("stageEmpty")?.classList.add("hidden");
  document.getElementById("stageTop")?.classList.remove("hidden");
  document.getElementById("transport")?.classList.remove("hidden");
  if (elements.streamTypeIcon) elements.streamTypeIcon.className = "fas fa-film";
  if (elements.stopScreenShareBtn && state.isGroupVideoPresenter) {
    elements.stopScreenShareBtn.classList.remove("hidden");
  } else if (elements.stopScreenShareBtn) {
    elements.stopScreenShareBtn.classList.add("hidden");
  }

  if (document.getElementById("nowShowing")) {
    document.getElementById("nowShowing").textContent = "SCREENING — " + (options.title || "YOUTUBE VIDEO").toUpperCase();
  }
}

function loadGenericEmbedVideo(embedUrl, title, initialTime = 0) {
  cleanUpActivePlayer();

  if (elements.screenShareVideo) {
    elements.screenShareVideo.onerror = null;
    try { elements.screenShareVideo.pause(); } catch (e) {}
    elements.screenShareVideo.classList.add("hidden");
  }

  const iframe = document.createElement("iframe");
  iframe.id = "group-video-player";
  iframe.src = embedUrl;
  iframe.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
  iframe.allowFullscreen = true;
  iframe.style.position = "absolute";
  iframe.style.inset = "0";
  iframe.style.width = "100%";
  iframe.style.height = "100%";
  iframe.style.border = "none";
  iframe.style.zIndex = "1";

  let container = document.getElementById("group-video-player-container");
  if (!container) {
    container = document.createElement("div");
    container.id = "group-video-player-container";
    container.style.position = "absolute";
    container.style.inset = "0";
    container.style.width = "100%";
    container.style.height = "100%";
    container.style.zIndex = "1";
    if (elements.screenShareContainer) {
      elements.screenShareContainer.classList.remove("hidden");
      elements.screenShareContainer.insertBefore(container, elements.screenShareContainer.firstChild);
    }
  }

  container.innerHTML = "";
  container.appendChild(iframe);

  document.getElementById("stageEmpty")?.classList.add("hidden");
  document.getElementById("stageTop")?.classList.remove("hidden");
  document.getElementById("transport")?.classList.remove("hidden");

  if (document.getElementById("nowShowing")) {
    document.getElementById("nowShowing").textContent = "SCREENING — " + (title || "EMBED VIDEO").toUpperCase();
  }
  if (elements.streamTypeIcon) elements.streamTypeIcon.className = "fas fa-film";
  if (elements.stopScreenShareBtn && state.isGroupVideoPresenter) {
    elements.stopScreenShareBtn.classList.remove("hidden");
  } else if (elements.stopScreenShareBtn) {
    elements.stopScreenShareBtn.classList.add("hidden");
  }

  startTransportTicker();
}

function resolveVideoDuration(video, callback) {
  if (!video) return;

  const tryResolve = () => {
    const d = video.duration;
    if (typeof d === "number" && Number.isFinite(d) && d > 0) {
      state.groupVideoDuration = d;
      const tpDurTime = document.getElementById("tpDurTime");
      if (tpDurTime) tpDurTime.textContent = fmtTransportTime(d);
      if (callback) callback(d);
      return true;
    }
    return false;
  };

  if (tryResolve()) return;

  const onDurationChange = () => {
    if (tryResolve()) {
      video.removeEventListener("durationchange", onDurationChange);
      if (state.isGroupVideoPresenter) {
        broadcastToPeers({
          type: "group_video_sync",
          action: "duration",
          duration: state.groupVideoDuration,
          time: video.currentTime || 0,
          timestamp: Date.now(),
        });
      }
    }
  };
  video.addEventListener("durationchange", onDurationChange);

  // If Chromium reports duration as Infinity on Blob URLs, probe the duration
  if (video.duration === Infinity) {
    const prevTime = video.currentTime || 0;
    const resetTime = () => {
      video.removeEventListener("timeupdate", resetTime);
      video.currentTime = prevTime;
      tryResolve();
    };
    video.addEventListener("timeupdate", resetTime, { once: true });
    try {
      video.currentTime = 1e101;
    } catch (e) {}
    setTimeout(() => {
      if (video.currentTime >= 1e100) {
        video.currentTime = prevTime;
        tryResolve();
      }
    }, 300);
  }
}

function startGroupVideoFromUrl(url, title) {
  startGroupVideo(url, title);
}

function startGroupVideo(src, title, explicitEmbedInfo = null) {
  const isOtherSharing = state.screenShareUserId && state.screenShareUserId !== state.userId;
  if (isOtherSharing) {
    showToast(`${state.screenShareUser || "Someone"} is currently presenting. They must stop first.`, "info");
    return;
  }
  if (state.screenShareStream) stopScreenShare();
  if (state.isGroupVideoPresenter) stopGroupVideo();
  closeVideoSourceModal();

  showToast(`Loading "${title}"...`, "info", 2000);

  // Unhide stage video controls, hide stageEmpty overlay
  document.getElementById("stageEmpty")?.classList.add("hidden");
  document.getElementById("stageTop")?.classList.remove("hidden");
  document.getElementById("transport")?.classList.remove("hidden");
  if (elements.stopScreenShareBtn) elements.stopScreenShareBtn.classList.remove("hidden");
  if (document.getElementById("nowShowing")) {
    document.getElementById("nowShowing").textContent = "SCREENING — " + (title || "VIDEO").toUpperCase();
  }

  // Check if it's a restricted or embeddable platform URL
  const embedInfo = explicitEmbedInfo || (typeof src === "string" ? detectEmbedSource(src) : null);

  cleanUpActivePlayer();

  if (embedInfo) {
    // ---- Copyright-Safe Embedded Video Mode ----
    state.groupVideoIsEmbed = true;
    state.groupVideoEmbed = embedInfo;
    state.groupVideoTitle = title || embedInfo.title;
    state.isGroupVideoPresenter = true;
    state.screenShareUser = state.username;
    state.screenShareUserId = state.userId;

    if (embedInfo.type === "youtube" && embedInfo.id) {
      loadYouTubePlayer(embedInfo.id, { title: title || embedInfo.title, initialTime: 0, paused: false });
    } else {
      loadGenericEmbedVideo(embedInfo.embedUrl, title || embedInfo.title, 0);
    }

    if (elements.screenShareUser) elements.screenShareUser.textContent = `You (streaming: ${title || embedInfo.title})`;
    if (elements.streamTypeIcon) elements.streamTypeIcon.className = "fas fa-film";
    if (elements.stopScreenShareBtn) elements.stopScreenShareBtn.classList.remove("hidden");

    broadcastToPeers({
      type: "group_video_start",
      title: title || embedInfo.title,
      isEmbed: true,
      embedType: embedInfo.type,
      videoId: embedInfo.id || null,
      embedUrl: embedInfo.embedUrl,
      currentTime: 0,
      duration: getActiveVideoDuration(),
      paused: false,
      timestamp: Date.now(),
      userId: state.userId,
      username: state.username,
    });

    if (!state.movieMode) activateMovieMode();
    showToast(`Streaming ${embedInfo.title} to the room! 🎬`, "success");
    updateParticipantsUI();
    return;
  }

  // ---- HTML5 Video Mode (Direct Video URL or Local Device File) ----
  const video = elements.screenShareVideo;
  if (!video) return;

  const isUrl = typeof src === "string" && (src.startsWith("http://") || src.startsWith("https://"));

  // Reset video element cleanly
  video.onerror = null;
  video.onloadedmetadata = null;
  video.ondurationchange = null;
  video.onplay = null;
  video.onpause = null;
  video.onseeked = null;
  video.onended = null;

  try { video.pause(); } catch (e) {}
  video.srcObject = null;
  video.controls = false;
  video.autoplay = true;
  video.playsInline = true;
  video.muted = false;
  video.volume = 1.0;
  video.crossOrigin = "anonymous";
  video.classList.remove("hidden");

  // Define error handler before setting src
  video.onerror = () => {
    if (isUrl && video.src && video.src.includes("/proxy-video")) {
      console.warn("Proxy load notice, attempting direct fallback...");
      video.removeAttribute("crossorigin");
      video.src = src;
      return;
    }
    if (!video.src || video.src === "" || video.src === window.location.href) return;
    if (video.error && video.error.code === MediaError.MEDIA_ERR_ABORTED) return;

    const msg = isUrl
      ? "Could not play video from this URL. Please verify the link is accessible or share your screen/tab instead."
      : "Could not play this local video file. Please verify the file format.";
    showError(msg);
  };

  const setupPlayback = () => {
    video.onloadedmetadata = null;

    resolveVideoDuration(video, (dur) => {
      if (state.isGroupVideoPresenter) {
        broadcastToPeers({
          type: "group_video_sync",
          action: "duration",
          duration: dur,
          time: video.currentTime || 0,
          timestamp: Date.now(),
        });
      }
    });

    const playPromise = video.play();
    if (playPromise !== undefined) {
      playPromise.then(() => {
        try {
          let stream = null;
          try {
            // Capture video stream for WebRTC
            const rawStream = video.captureStream ? video.captureStream(30) : (video.mozCaptureStream ? video.mozCaptureStream(30) : null);

            // 1. Prefer native decoded audio track from captureStream (handles high bitrate, 5.1/7.1, 48kHz, AC3/DTS natively)
            let audioTrack = null;
            if (rawStream && rawStream.getAudioTracks().length > 0) {
              audioTrack = rawStream.getAudioTracks()[0];
            } else {
              // Web Audio extraction pipeline fallback if captureStream produced no audio track
              try {
                if (!window._streamAudioContext) {
                  window._streamAudioContext = new (window.AudioContext || window.webkitAudioContext)();
                }
                const actx = window._streamAudioContext;
                if (actx.state === "suspended") actx.resume();

                if (!video._audioNodeConnected) {
                  const srcNode = actx.createMediaElementSource(video);
                  const destNode = actx.createMediaStreamDestination();
                  srcNode.connect(destNode);
                  srcNode.connect(actx.destination); // Hear audio locally
                  video._audioNodeConnected = true;
                  video._destNode = destNode;
                }
                if (video._destNode && video._destNode.stream.getAudioTracks().length > 0) {
                  audioTrack = video._destNode.stream.getAudioTracks()[0];
                }
              } catch (audioErr) {
                console.warn("WebAudio pipeline fallback notice:", audioErr);
              }
            }

            if (rawStream) {
              const videoTrack = rawStream.getVideoTracks()[0];
              const combinedTracks = [videoTrack, audioTrack].filter(Boolean);
              combinedTracks.forEach((t) => { t.enabled = true; });
              stream = new MediaStream(combinedTracks);
            }
          } catch (e) {
            console.warn("captureStream error:", e);
          }

          state.groupVideoStream = stream;
          state.groupVideoElement = video;
          state.isGroupVideoPresenter = true;
          state.screenShareUser = state.username;
          state.screenShareUserId = state.userId;
          state.groupVideoCurrentTime = video.currentTime || 0;
          state.groupVideoIsPlaying = !video.paused;

          if (elements.screenShareUser) elements.screenShareUser.textContent = `You (streaming: ${title})`;
          if (elements.streamTypeIcon) elements.streamTypeIcon.className = "fas fa-film";
          if (elements.stopScreenShareBtn) elements.stopScreenShareBtn.classList.remove("hidden");

          // Broadcast video stream to connected peers if stream available
          if (stream) {
            Object.keys(state.connections).forEach((peerId) => {
              if (state.connections[peerId] && state.connections[peerId].open) {
                callPeerForGroupVideo(peerId, stream, title);
              }
            });
          }

          // Broadcast video details to peers (peers with URL can load directly in sync)
          broadcastToPeers({
            type: "group_video_start",
            title,
            url: isUrl ? src : null,
            isUrl: isUrl,
            isEmbed: false,
            currentTime: video.currentTime || 0,
            duration: getActiveVideoDuration(),
            paused: video.paused,
            timestamp: Date.now(),
            userId: state.userId,
            username: state.username,
          });

          if (!state.movieMode) activateMovieMode();
          showToast(`Streaming "${title}" to the room! 🎬`, "success");
          updateParticipantsUI();
          startTransportTicker();

          video.onplay = () => {
            updateTransportPlayButton(true);
            state.groupVideoIsPlaying = true;
            broadcastToPeers({
              type: "group_video_sync",
              action: "play",
              time: video.currentTime,
              duration: getActiveVideoDuration(),
              paused: false,
              timestamp: Date.now()
            });
            startPresenterHeartbeat();
          };
          video.onpause = () => {
            updateTransportPlayButton(false);
            state.groupVideoIsPlaying = false;
            broadcastToPeers({
              type: "group_video_sync",
              action: "pause",
              time: video.currentTime,
              duration: getActiveVideoDuration(),
              paused: true,
              timestamp: Date.now()
            });
            stopPresenterHeartbeat();
          };
          video.onseeked = () => {
            broadcastToPeers({
              type: "group_video_sync",
              action: "seek",
              time: video.currentTime,
              duration: getActiveVideoDuration(),
              paused: video.paused,
              timestamp: Date.now()
            });
          };
          video.onended = () => stopGroupVideo();

          startPresenterHeartbeat();
        } catch (innerErr) {
          console.error("Error setting up stream broadcast:", innerErr);
        }
      }).catch((err) => {
        console.warn("Autoplay notice, checking fallback:", err);
        if (err.name === "NotAllowedError") {
          video.muted = true;
          video.play().then(() => {
            showToast("Video muted due to browser policy. Click video to unmute 🔊", "info", 5000);
            const unmuteOnClick = () => {
              video.muted = false;
              showToast("Audio unmuted! 🔊", "success", 2000);
              video.removeEventListener("click", unmuteOnClick);
            };
            video.addEventListener("click", unmuteOnClick);
          }).catch((e) => {
            showError("Could not play video: " + e.message);
          });
        } else {
          showError("Could not play video: " + err.message);
        }
      });
    }
  };

  if (isUrl) {
    video.src = `/proxy-video?url=${encodeURIComponent(src)}`;
  } else {
    video.src = src;
  }

  if (video.readyState >= 1) {
    setupPlayback();
  } else {
    video.onloadedmetadata = setupPlayback;
  }
}

function callPeerForGroupVideo(peerId, stream, title) {
  try {
    const call = state.peer.call(peerId, stream, {
      metadata: {
        type: "group_video",
        title,
        duration: getActiveVideoDuration(),
        userId: state.userId,
        username: state.username
      }
    });
    if (call) {
      state.groupVideoCalls[peerId] = call;

      const adjustSender = () => {
        try {
          const pc = call.peerConnection;
          if (!pc) return;
          pc.getSenders().forEach((sender) => {
            if (sender.track && sender.track.kind === "video") {
              const params = sender.getParameters();
              if (!params.encodings || params.encodings.length === 0) params.encodings = [{}];
              params.encodings[0].maxBitrate = 4000000; // 4 Mbps cap for WebRTC stream
              params.encodings[0].maxFramerate = 30;
              params.degradationPreference = "maintain-framerate";

              const v = elements.screenShareVideo;
              const w = v ? (v.videoWidth || 0) : 0;
              const h = v ? (v.videoHeight || 0) : 0;
              if (w >= 3840 || h >= 2160) {
                params.encodings[0].scaleResolutionDownBy = 2.0; // 4K -> 1080p
              } else if (w >= 2560 || h >= 1440) {
                params.encodings[0].scaleResolutionDownBy = 1.5; // 1440p -> ~960p
              } else if (w > 1920 || h > 1080) {
                params.encodings[0].scaleResolutionDownBy = 1.25;
              }
              sender.setParameters(params).catch((e) => console.warn("sender.setParameters:", e));
            } else if (sender.track && sender.track.kind === "audio") {
              const params = sender.getParameters();
              if (!params.encodings || params.encodings.length === 0) params.encodings = [{}];
              params.encodings[0].maxBitrate = 128000; // 128 kbps audio
              sender.setParameters(params).catch((e) => console.warn("audio sender.setParameters:", e));
            }
          });
        } catch (e) {}
      };

      if (call.peerConnection) {
        call.peerConnection.addEventListener("connectionstatechange", () => {
          if (call.peerConnection.connectionState === "connected") {
            adjustSender();
          }
        });
      }
      setTimeout(adjustSender, 100);
      setTimeout(adjustSender, 300);
      setTimeout(adjustSender, 1000);
      setTimeout(adjustSender, 2500);
    }
  } catch (err) {
    console.error("Error calling peer for group video:", err);
  }
}

function stopGroupVideo() {
  cleanUpActivePlayer();

  if (elements.screenShareVideo) {
    const video = elements.screenShareVideo;
    video.onerror = null;
    video.onloadedmetadata = null;
    video.onplay = null;
    video.onpause = null;
    video.onseeked = null;
    video.onended = null;

    try { video.pause(); } catch (e) {}

    if (video.srcObject) {
      try {
        video.srcObject.getTracks().forEach((t) => t.stop());
      } catch (e) {}
      video.srcObject = null;
    }

    if (video.src) {
      const oldSrc = video.src;
      video.removeAttribute("src");
      try { video.load(); } catch (e) {}
      if (oldSrc.startsWith("blob:")) {
        try { URL.revokeObjectURL(oldSrc); } catch (e) {}
      }
    }

    video.classList.add("hidden");
  }

  if (state.groupVideoStream) {
    try {
      state.groupVideoStream.getTracks().forEach((t) => t.stop());
    } catch (e) {}
    state.groupVideoStream = null;
  }

  Object.values(state.groupVideoCalls).forEach((call) => {
    try { call.close(); } catch (e) {}
  });
  state.groupVideoCalls = {};

  state.isGroupVideoPresenter = false;
  state.screenShareUser = null;
  state.screenShareUserId = null;
  state.groupVideoIsEmbed = false;
  state.groupVideoEmbed = null;
  state.groupVideoIsUrl = false;
  state.groupVideoUrl = null;
  state.groupVideoTitle = null;
  state.groupVideoDuration = 0;
  state.groupVideoCurrentTime = 0;
  state.groupVideoIsPlaying = false;
  stopTransportTicker();
  stopPresenterHeartbeat();
  updateTransportPlayButton(false);

  document.getElementById("stageEmpty")?.classList.remove("hidden");
  document.getElementById("stageTop")?.classList.add("hidden");
  document.getElementById("transport")?.classList.add("hidden");
  if (elements.stopScreenShareBtn) elements.stopScreenShareBtn.classList.add("hidden");
  if (elements.streamTypeIcon) elements.streamTypeIcon.className = "fas fa-desktop";
  if (document.getElementById("nowShowing")) {
    document.getElementById("nowShowing").textContent = "STANDBY — NOTHING SCREENING";
  }

  broadcastToPeers({ type: "group_video_stop", userId: state.userId });

  if (state.movieMode) deactivateMovieMode();
  updateParticipantsUI();
}

function handleGroupVideoStart(data) {
  state.screenShareUser = `${data.username} (streaming: ${data.title})`;
  state.screenShareUserId = data.userId;
  state.groupVideoTitle = data.title;
  if (data.duration && Number.isFinite(data.duration) && data.duration > 0) {
    state.groupVideoDuration = data.duration;
  }
  state.groupVideoCurrentTime = data.currentTime || 0;
  state.groupVideoIsPlaying = !data.paused;
  updateTransportPlayButton(state.groupVideoIsPlaying);

  document.getElementById("stageEmpty")?.classList.add("hidden");
  document.getElementById("stageTop")?.classList.remove("hidden");
  document.getElementById("transport")?.classList.remove("hidden");
  if (elements.stopScreenShareBtn) elements.stopScreenShareBtn.classList.add("hidden");
  if (elements.screenShareUser) elements.screenShareUser.textContent = state.screenShareUser;
  if (document.getElementById("nowShowing")) {
    document.getElementById("nowShowing").textContent = "SCREENING — " + (data.title || "VIDEO").toUpperCase();
  }

  const tpDurTime = document.getElementById("tpDurTime");
  if (tpDurTime && state.groupVideoDuration > 0) {
    tpDurTime.textContent = fmtTransportTime(state.groupVideoDuration);
  }
  startTransportTicker();

  cleanUpActivePlayer();

  const transitSeconds = data.timestamp ? Math.max(0, (Date.now() - data.timestamp) / 1000) : 0;
  const initialPosition = (data.currentTime || 0) + (data.paused ? 0 : transitSeconds);

  if (data.isEmbed) {
    state.groupVideoIsEmbed = true;
    state.groupVideoEmbed = { type: data.embedType, embedUrl: data.embedUrl, id: data.videoId, title: data.title };
    if (data.embedType === "youtube" && (data.videoId || data.youtubeId)) {
      const vidId = data.videoId || data.youtubeId;
      loadYouTubePlayer(vidId, { title: data.title, initialTime: initialPosition, paused: data.paused });
    } else if (data.embedUrl) {
      loadGenericEmbedVideo(data.embedUrl, data.title, initialPosition);
    }
  } else if (data.isUrl && data.url) {
    state.groupVideoIsEmbed = false;
    state.groupVideoIsUrl = true;
    state.groupVideoUrl = data.url;
    if (elements.streamTypeIcon) elements.streamTypeIcon.className = "fas fa-film";
    elements.screenShareVideo.classList.remove("hidden");
    if (elements.screenShareVideo.srcObject) {
      elements.screenShareVideo.srcObject.getTracks().forEach((t) => t.stop());
      elements.screenShareVideo.srcObject = null;
    }
    elements.screenShareVideo.onerror = () => {
      if (!elements.screenShareVideo.src || elements.screenShareVideo.src === window.location.href) return;
      if (elements.screenShareVideo.hasAttribute("crossorigin")) {
        console.warn("Participant video CORS notice, retrying without crossorigin...");
        elements.screenShareVideo.removeAttribute("crossorigin");
        elements.screenShareVideo.src = data.url;
        return;
      }
      showError("Could not play video from remote peer URL.");
    };
    elements.screenShareVideo.crossOrigin = "anonymous";
    elements.screenShareVideo.src = data.url;

    const onMeta = () => {
      if (initialPosition > 0) {
        try { elements.screenShareVideo.currentTime = initialPosition; } catch (e) {}
      }
      if (data.paused) {
        try { elements.screenShareVideo.pause(); } catch (e) {}
        updateTransportPlayButton(false);
      } else {
        elements.screenShareVideo.play().catch(e => console.log("Remote video play notice:", e));
        updateTransportPlayButton(true);
      }
    };
    if (elements.screenShareVideo.readyState >= 1) onMeta();
    else elements.screenShareVideo.onloadedmetadata = onMeta;
  } else {
    state.groupVideoIsEmbed = false;
    state.groupVideoIsUrl = false;
    if (elements.streamTypeIcon) elements.streamTypeIcon.className = "fas fa-film";
  }

  displaySystemMessage(`${data.username} started streaming a video: "${data.title}"`);
  if (!state.movieMode) activateMovieMode();
  updateParticipantsUI();
}

function handleGroupVideoStop() {
  state.screenShareUser = null;
  state.screenShareUserId = null;
  state.groupVideoIsEmbed = false;
  state.groupVideoEmbed = null;
  state.groupVideoIsUrl = false;
  state.groupVideoUrl = null;
  state.groupVideoTitle = null;
  state.groupVideoDuration = 0;
  state.groupVideoCurrentTime = 0;
  state.groupVideoIsPlaying = false;
  stopTransportTicker();
  updateTransportPlayButton(false);

  const tpCurTime = document.getElementById("tpCurTime");
  const tpDurTime = document.getElementById("tpDurTime");
  const tpSeek = document.getElementById("tpSeek");
  if (tpCurTime) tpCurTime.textContent = "--:--";
  if (tpDurTime) tpDurTime.textContent = "--:--";
  if (tpSeek) tpSeek.value = 0;

  cleanUpActivePlayer();

  if (elements.screenShareVideo) {
    const video = elements.screenShareVideo;
    video.onerror = null;
    video.onloadedmetadata = null;
    video.ondurationchange = null;
    video.onplay = null;
    video.onpause = null;
    video.onseeked = null;
    video.onended = null;

    try { video.pause(); } catch (e) {}

    if (video.srcObject) {
      try {
        video.srcObject.getTracks().forEach((t) => t.stop());
      } catch (e) {}
      video.srcObject = null;
    }
    if (video.src) {
      const oldSrc = video.src;
      video.removeAttribute("src");
      try { video.load(); } catch (e) {}
      if (oldSrc.startsWith("blob:")) {
        try { URL.revokeObjectURL(oldSrc); } catch (e) {}
      }
    }
    video.classList.add("hidden");
  }

  document.getElementById("stageEmpty")?.classList.remove("hidden");
  document.getElementById("stageTop")?.classList.add("hidden");
  document.getElementById("transport")?.classList.add("hidden");
  if (elements.stopScreenShareBtn) elements.stopScreenShareBtn.classList.add("hidden");
  if (elements.streamTypeIcon) elements.streamTypeIcon.className = "fas fa-desktop";
  if (document.getElementById("nowShowing")) {
    document.getElementById("nowShowing").textContent = "STANDBY — NOTHING SCREENING";
  }

  if (state.movieMode) deactivateMovieMode();
  displaySystemMessage("Video screening ended");
  updateParticipantsUI();
}

function handleGroupVideoControl(data) {
  if (!state.isGroupVideoPresenter) return;
  const isHost = (data.senderId && state.participants[data.senderId]?.isCreator) ||
                 (data.senderId && data.senderId === state.hostUserId) ||
                 (data.senderId && data.senderId === state.roomId) ||
                 state.isRoomCreator;
  if (!isHost) {
    console.warn("Ignoring group_video_control from unauthorized sender:", data.senderId);
    return;
  }

  // 1. YouTube Player Mode
  if (state.groupVideoIsEmbed) {
    if (data.action === "pause") {
      sendYouTubeCommand("pauseVideo");
      updateTransportPlayButton(false);
      state.groupVideoIsPlaying = false;
      broadcastToPeers({
        type: "group_video_sync",
        action: "pause",
        time: getActiveVideoCurrentTime(),
        duration: getActiveVideoDuration(),
        paused: true,
        timestamp: Date.now(),
      });
      stopPresenterHeartbeat();
    } else if (data.action === "play") {
      sendYouTubeCommand("playVideo");
      updateTransportPlayButton(true);
      state.groupVideoIsPlaying = true;
      broadcastToPeers({
        type: "group_video_sync",
        action: "play",
        time: getActiveVideoCurrentTime(),
        duration: getActiveVideoDuration(),
        paused: false,
        timestamp: Date.now(),
      });
      startPresenterHeartbeat();
    } else if (data.action === "seek" && typeof data.time === "number" && Number.isFinite(data.time)) {
      sendYouTubeCommand("seekTo", [data.time, true]);
      state.groupVideoCurrentTime = data.time;
      broadcastToPeers({
        type: "group_video_sync",
        action: "seek",
        time: data.time,
        duration: getActiveVideoDuration(),
        paused: false,
        timestamp: Date.now(),
      });
    }
    return;
  }

  // 2. HTML5 Video Mode
  const video = elements.screenShareVideo;
  if (!video) return;

  if (data.action === "pause") {
    try {
      video.pause();
      updateTransportPlayButton(false);
      state.groupVideoIsPlaying = false;
      broadcastToPeers({
        type: "group_video_sync",
        action: "pause",
        time: video.currentTime,
        duration: getActiveVideoDuration(),
        paused: true,
        timestamp: Date.now(),
      });
      stopPresenterHeartbeat();
    } catch (e) {}
  } else if (data.action === "play") {
    try {
      video.play().catch(e => console.warn("Play trigger notice:", e));
      updateTransportPlayButton(true);
      state.groupVideoIsPlaying = true;
      broadcastToPeers({
        type: "group_video_sync",
        action: "play",
        time: video.currentTime,
        duration: getActiveVideoDuration(),
        paused: false,
        timestamp: Date.now(),
      });
      startPresenterHeartbeat();
    } catch (e) {}
  } else if (data.action === "seek" && typeof data.time === "number" && Number.isFinite(data.time)) {
    try {
      video.currentTime = data.time;
      state.groupVideoCurrentTime = data.time;
      broadcastToPeers({
        type: "group_video_sync",
        action: "seek",
        time: data.time,
        duration: getActiveVideoDuration(),
        paused: video.paused,
        timestamp: Date.now(),
      });
    } catch (e) {}
  }
}

function handleGroupVideoSync(data) {
  if (state.isGroupVideoPresenter) return;

  const transitSeconds = data.timestamp ? Math.max(0, (Date.now() - data.timestamp) / 1000) : 0;
  const targetTime = typeof data.time === "number" && Number.isFinite(data.time)
    ? data.time + (data.action === "pause" ? 0 : transitSeconds)
    : null;

  if (data.duration && Number.isFinite(data.duration) && data.duration > 0) {
    state.groupVideoDuration = data.duration;
  }

  // 1. YouTube Player Mode
  if (state.groupVideoIsEmbed) {
    if (!state.ytPlayerReady) {
      state.pendingYtSync = {
        action: data.action,
        time: targetTime,
        paused: data.action === "pause" || data.paused === true,
      };
    }

    state.ignoreYtStateEvents = true;
    try {
      if (data.action === "pause") {
        sendYouTubeCommand("pauseVideo");
        if (typeof data.time === "number" && Number.isFinite(data.time)) sendYouTubeCommand("seekTo", [data.time, true]);
        updateTransportPlayButton(false);
        state.groupVideoIsPlaying = false;
      } else if (data.action === "play") {
        if (targetTime !== null) sendYouTubeCommand("seekTo", [targetTime, true]);
        sendYouTubeCommand("playVideo");
        updateTransportPlayButton(true);
        state.groupVideoIsPlaying = true;
      } else if (data.action === "seek") {
        if (typeof data.time === "number" && Number.isFinite(data.time)) sendYouTubeCommand("seekTo", [data.time, true]);
      } else if (data.action === "heartbeat") {
        let cur = 0;
        if (state.ytPlayer && typeof state.ytPlayer.getCurrentTime === "function") {
          try { cur = state.ytPlayer.getCurrentTime() || 0; } catch (e) {}
        }
        if (targetTime !== null && Math.abs(cur - targetTime) > 0.8) {
          sendYouTubeCommand("seekTo", [targetTime, true]);
        }
        if (data.paused === false) {
          sendYouTubeCommand("playVideo");
          updateTransportPlayButton(true);
          state.groupVideoIsPlaying = true;
        } else if (data.paused === true) {
          sendYouTubeCommand("pauseVideo");
          updateTransportPlayButton(false);
          state.groupVideoIsPlaying = false;
        }
      }
    } catch (e) {
      console.warn("YouTube sync notice:", e);
    }
    setTimeout(() => { state.ignoreYtStateEvents = false; }, 300);

    // Update transport bar displays for YouTube
    const tpCurTime = document.getElementById("tpCurTime");
    const tpDurTime = document.getElementById("tpDurTime");
    const tpSeek = document.getElementById("tpSeek");
    const duration = getActiveVideoDuration();
    const curTime = typeof data.time === "number" && Number.isFinite(data.time) ? data.time : getActiveVideoCurrentTime();

    if (tpCurTime) {
      tpCurTime.textContent = fmtTransportTime(curTime);
    }
    if (tpDurTime && duration > 0) {
      tpDurTime.textContent = fmtTransportTime(duration);
    }
    if (tpSeek && duration > 0 && !tpSeek.matches(":active")) {
      tpSeek.value = Math.min(1000, Math.max(0, (curTime / duration) * 1000));
    }
    return;
  }

  // 2. HTML5 Video Mode
  const vid = elements.screenShareVideo;
  if (!vid) return;

  if (data.action === "pause") {
    state.groupVideoIsPlaying = false;
    updateTransportPlayButton(false);
    if (typeof data.time === "number" && Number.isFinite(data.time)) {
      state.groupVideoCurrentTime = data.time;
    }
    try {
      vid.pause();
      if (vid.src && !vid.srcObject && typeof data.time === "number" && Number.isFinite(data.time)) {
        vid.currentTime = data.time;
      }
    } catch (e) {}
  } else if (data.action === "play") {
    state.groupVideoIsPlaying = true;
    updateTransportPlayButton(true);
    if (targetTime !== null) {
      state.groupVideoCurrentTime = targetTime;
    }
    try {
      if (vid.src && !vid.srcObject && targetTime !== null) {
        if (Math.abs(vid.currentTime - targetTime) > 0.4) {
          vid.currentTime = targetTime;
        }
      }
      vid.play().catch(() => {});
    } catch (e) {}
  } else if (data.action === "seek") {
    if (typeof data.time === "number" && Number.isFinite(data.time)) {
      state.groupVideoCurrentTime = data.time;
      if (vid.src && !vid.srcObject) {
        try { vid.currentTime = data.time; } catch (e) {}
      }
    }
  } else if (data.action === "duration") {
    if (data.duration && Number.isFinite(data.duration) && data.duration > 0) {
      state.groupVideoDuration = data.duration;
    }
  } else if (data.action === "heartbeat") {
    if (typeof data.paused === "boolean") {
      state.groupVideoIsPlaying = !data.paused;
      updateTransportPlayButton(state.groupVideoIsPlaying);
    }
    if (targetTime !== null) {
      state.groupVideoCurrentTime = targetTime;
      if (vid.src && !vid.srcObject) {
        if (Math.abs(vid.currentTime - targetTime) > 0.6) {
          try { vid.currentTime = targetTime; } catch (e) {}
        }
      }
    }
  }

  // Update transport bar displays
  const tpCurTime = document.getElementById("tpCurTime");
  const tpDurTime = document.getElementById("tpDurTime");
  const tpSeek = document.getElementById("tpSeek");
  const curTime = getActiveVideoCurrentTime();
  const duration = getActiveVideoDuration();

  if (tpCurTime) {
    tpCurTime.textContent = fmtTransportTime(curTime);
  }
  if (tpDurTime && duration > 0) {
    tpDurTime.textContent = fmtTransportTime(duration);
  }
  if (tpSeek && duration > 0 && !tpSeek.matches(":active")) {
    tpSeek.value = Math.min(1000, Math.max(0, (curTime / duration) * 1000));
  }
}

// ============================================================
// Webcam Watch Together
// ============================================================
async function toggleCamera() {
  if (state.webcamStream) {
    // Turn off camera
    state.webcamStream.getTracks().forEach((t) => t.stop());
    state.webcamStream = null;
    removeWebcamTile(state.userId);

    Object.values(state.webcamCalls).forEach((call) => {
      try { call.close(); } catch (e) {}
    });
    state.webcamCalls = {};

    broadcastToPeers({ type: "webcam_stop", userId: state.userId });
    showToast("Camera turned off", "info");
    updateMediaControlsUI();
    if (state.movieMode) syncMmButtons();
  } else {
    // Turn on camera (with audio)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30 } },
        audio: true,
      });
      state.webcamStream = stream;

      addWebcamTile(state.userId, "You", stream, true);

      // Call peers with webcam stream
      Object.keys(state.connections).forEach((peerId) => {
        if (state.connections[peerId] && state.connections[peerId].open) {
          callPeerForWebcam(peerId, stream);
        }
      });

      broadcastToPeers({ type: "webcam_start", userId: state.userId, username: state.username });
      showToast("Camera & mic active 🎥", "success");
      updateMediaControlsUI();
      if (state.movieMode) syncMmButtons();
    } catch (err) {
      console.error("Camera access error:", err);
      showError("Could not access camera/microphone: " + err.message);
      updateMediaControlsUI();
    }
  }
}

// ============================================================
// Mic Toggle (audio-only stream)
// ============================================================
async function toggleMic() {
  if (state.isMicOn && state.micStream) {
    // Turn off mic
    state.micStream.getTracks().forEach((t) => t.stop());
    state.micStream = null;
    Object.values(state.micCalls).forEach((call) => {
      try { call.close(); } catch (e) {}
    });
    state.micCalls = {};
    state.isMicOn = false;
    broadcastToPeers({ type: "mic_stop", userId: state.userId });
    showToast("Microphone off", "info");
    updateMediaControlsUI();
    if (state.movieMode) syncMmButtons();
  } else {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      state.micStream = stream;
      state.isMicOn = true;
      // Call peers with mic stream
      Object.keys(state.connections).forEach((peerId) => {
        if (state.connections[peerId] && state.connections[peerId].open) {
          try {
            const call = state.peer.call(peerId, stream, {
              metadata: { type: "mic", userId: state.userId, username: state.username }
            });
            if (call) state.micCalls[peerId] = call;
          } catch (err) { console.error("Mic call error:", err); }
        }
      });
      broadcastToPeers({ type: "mic_start", userId: state.userId, username: state.username });
      showToast("Microphone on 🎤", "success");
      updateMediaControlsUI();
      if (state.movieMode) syncMmButtons();
    } catch (err) {
      console.error("Mic access error:", err);
      showError("Could not access microphone: " + err.message);
      updateMediaControlsUI();
    }
  }
}

// ============================================================
// Reactions
// ============================================================
function sendReaction(emoji) {
  broadcastToPeers({ type: "reaction", emoji, username: state.username, userId: state.userId });
  showReactionOverlay(emoji, "You");
}

function showReactionOverlay(emoji, username) {
  const overlay = document.createElement("div");
  overlay.className = "reaction-overlay-item";
  overlay.textContent = emoji;
  overlay.title = `${username} reacted`;
  document.getElementById("screen-share-container")?.appendChild(overlay);
  // Float up animation
  requestAnimationFrame(() => overlay.classList.add("reaction-fly"));
  setTimeout(() => overlay.remove(), 2800);
  // Also show in chat as a system message
  displaySystemMessage(`${username} reacted ${emoji}`);
}

// ============================================================
// Quality Control (for video viewers)
// ============================================================
function handleQualityChange() {
  const quality = elements.qualitySelect?.value;
  if (!quality || !elements.screenShareVideo) return;

  const vid = elements.screenShareVideo;
  if (!vid.srcObject && !vid.src) return;

  // For WebRTC streams, adjust video constraints via RTCPeerConnection
  // For direct video sources, adjust playback quality via video element
  if (vid.srcObject) {
    // Try to set receiver video quality constraints
    Object.values(state.connections).forEach((conn) => {
      try {
        if (conn._pc) {
          conn._pc.getReceivers().forEach((receiver) => {
            if (receiver.track && receiver.track.kind === "video") {
              const params = receiver.getParameters();
              if (params.encodings && params.encodings.length > 0) {
                const enc = params.encodings[0];
                if (quality === "low") { enc.maxBitrate = 200000; }
                else if (quality === "medium") { enc.maxBitrate = 800000; }
                else if (quality === "high") { enc.maxBitrate = 2500000; }
                else { delete enc.maxBitrate; }
                receiver.setParameters(params).catch(() => {});
              }
            }
          });
        }
      } catch (e) { console.log("Quality adjust:", e); }
    });
    showToast(`Quality: ${quality}`, "info", 1500);
  } else if (vid.src) {
    // For direct video: set playback quality hint
    if (quality === "low") {
      vid.style.filter = "blur(0px)";
      vid.width = 426;
    } else if (quality === "medium") {
      vid.style.filter = "none";
      vid.width = 854;
    } else {
      vid.style.filter = "none";
      vid.removeAttribute("width");
    }
    showToast(`Video quality: ${quality}`, "info", 1500);
  }
}

function callPeerForWebcam(peerId, stream) {
  try {
    const call = state.peer.call(peerId, stream, {
      metadata: { type: "webcam", userId: state.userId, username: state.username }
    });
    if (call) state.webcamCalls[peerId] = call;
  } catch (err) {
    console.error("Error calling peer for webcam:", err);
  }
}

function addWebcamTile(userId, username, stream, isLocal = false) {
  if (!elements.webcamGrid) elements.webcamGrid = document.getElementById("webcam-grid");
  if (!elements.webcamGrid) return;

  // Ensure webcam grid is visible when a tile is added
  elements.webcamGrid.classList.remove("hidden");
  if (elements.toggleWebcamsBtn) elements.toggleWebcamsBtn.classList.add("active-action");

  let tile = document.getElementById(`webcam-tile-${userId}`);
  if (tile) {
    const v = tile.querySelector("video");
    if (v) v.srcObject = stream;
    return;
  }

  tile = document.createElement("div");
  tile.className = "webcam-tile" + (isLocal ? " local-tile" : "");
  tile.id = `webcam-tile-${userId}`;

  const vid = document.createElement("video");
  vid.autoplay = true;
  vid.playsInline = true;
  vid.muted = isLocal;
  vid.srcObject = stream;

  const nameSpan = document.createElement("div");
  nameSpan.className = "webcam-name";
  nameSpan.textContent = username;

  tile.appendChild(vid);
  tile.appendChild(nameSpan);

  // In-video mic and camera quick toggle controls for local user
  if (isLocal) {
    const ctrlWrap = document.createElement("div");
    ctrlWrap.className = "webcam-tile-controls";

    const camBtn = document.createElement("button");
    camBtn.className = "webcam-tile-btn active";
    camBtn.id = "local-cam-toggle";
    camBtn.title = "Turn Camera Off";
    camBtn.innerHTML = '<i class="fas fa-video"></i>';
    camBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleCamera();
    });

    const micBtn = document.createElement("button");
    micBtn.className = "webcam-tile-btn" + (state.isMicOn ? " active-mic" : "");
    micBtn.id = "local-mic-toggle";
    micBtn.title = state.isMicOn ? "Mute Microphone" : "Unmute Microphone";
    micBtn.innerHTML = state.isMicOn ? '<i class="fas fa-microphone"></i>' : '<i class="fas fa-microphone-slash"></i>';
    micBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleMic();
    });

    ctrlWrap.appendChild(camBtn);
    ctrlWrap.appendChild(micBtn);
    tile.appendChild(ctrlWrap);
  }

  // Distribute across left and right sides of player stage
  const leftCol = elements.webcamsLeft || document.getElementById("webcams-left");
  const rightCol = elements.webcamsRight || document.getElementById("webcams-right");

  if (leftCol && rightCol) {
    const leftCount = leftCol.children.length;
    const rightCount = rightCol.children.length;
    if (leftCount <= rightCount) {
      leftCol.appendChild(tile);
    } else {
      rightCol.appendChild(tile);
    }
  } else {
    elements.webcamGrid.appendChild(tile);
  }
}

function removeWebcamTile(userId) {
  const tile = document.getElementById(`webcam-tile-${userId}`);
  if (tile) {
    const v = tile.querySelector("video");
    if (v && v.srcObject) {
      try { v.srcObject.getTracks().forEach((t) => t.stop()); } catch (e) {}
    }
    tile.remove();
  }
}

// ============================================================
// Clipboard
// ============================================================
function copyRoomIdToClipboard() {
  navigator.clipboard.writeText(state.roomId)
    .then(() => showToast("Room ID copied!", "success"))
    .catch(() => {
      const ta = document.createElement("textarea");
      ta.value = state.roomId;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      showToast("Room ID copied!", "success");
    });
}

function copyRoomLinkToClipboard() {
  const link = `${window.location.origin}${window.location.pathname}?room=${encodeURIComponent(state.roomId)}`;
  navigator.clipboard.writeText(link)
    .then(() => showToast("Invite link copied!", "success"))
    .catch(() => {
      const ta = document.createElement("textarea");
      ta.value = link;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      showToast("Invite link copied!", "success");
    });
}

// ============================================================
// URL helpers
// ============================================================
function updateUrlWithRoom(roomId) {
  try { window.history.replaceState({ room: roomId }, "", `${window.location.pathname}?room=${encodeURIComponent(roomId)}`); } catch (e) {}
}
function clearUrlRoom() {
  try { window.history.replaceState({}, "", window.location.pathname); } catch (e) {}
}

function checkUrlForInvite() {
  try {
    const urlParams = new URLSearchParams(window.location.search);
    const roomParam = urlParams.get("room");
    if (roomParam) {
      const cleanRoom = roomParam.trim().toUpperCase();
      elements.roomIdInput.value = cleanRoom;
      if (state.username && state.selectedAvatar) {
        showToast(`Joining room ${cleanRoom} from invite link...`, "info");
        setTimeout(() => joinRoom(cleanRoom), 600);
      } else {
        showToast(`Enter your name to join room ${cleanRoom}!`, "info");
        elements.usernameInput.focus();
      }
    }
  } catch (e) { console.warn("Could not parse room from URL:", e); }
}

// ============================================================
// Connection Status
// ============================================================
function displayConnectionStatus(status, details = "") {
  state.connectionStatus = status;
  const messages = {
    connecting: `Connecting to room ${state.roomId}…`,
    connected: `Connected to room ${state.roomId}`,
    disconnected: "Disconnected from room",
    error: `Connection error: ${details}`,
  };
  displaySystemMessage(messages[status] || status);
  console.log(`Connection status: ${status}`, details ? `- ${details}` : "");
}

// ============================================================
// Leave / Reset Room
// ============================================================
function leaveRoom() {
  clearRoomSession();
  resetJoinButton();
  if (state.isGroupVideoPresenter) stopGroupVideo();
  cleanUpActivePlayer();
  if (state.screenShareStream) stopScreenShare();
  if (state.webcamStream) toggleCamera();
  if (state.isMicOn) toggleMic();
  if (state.movieMode) deactivateMovieMode();

  if (elements.videoSourceModal) elements.videoSourceModal.classList.add("hidden");
  if (elements.joinRequestModal) elements.joinRequestModal.classList.add("hidden");
  if (elements.joinWaitingModal) elements.joinWaitingModal.classList.add("hidden");

  // Broadcast exit message to connected peers before teardown
  const leftUserId = state.userId;
  const wasHost = state.isRoomCreator;
  const oldConns = { ...state.connections };
  const oldPeer = state.peer;
  const oldBroker = state.hostBrokerPeer;

  Object.values(oldConns).forEach((conn) => {
    if (conn && conn.open) {
      try {
        conn.send({ type: "participant_left", userId: leftUserId, wasHost: wasHost });
      } catch (e) {}
    }
  });

  // Instantly clean up UI & URL so user returns to lobby with zero lag
  elements.messagesContainer.innerHTML = "";
  resetParticipantsUI();
  elements.chatRoom.classList.add("hidden");
  elements.homeScreen.classList.remove("hidden");
  clearUrlRoom();
  closeRoomInfoPanel();

  // Clear room code inputs
  [0, 1, 2, 3, 4, 5].forEach((i) => {
    const cb = document.getElementById(`cb-${i}`);
    if (cb) cb.value = "";
  });
  if (elements.roomIdInput) elements.roomIdInput.value = "";

  // Synchronously reset state and generate fresh userId for future clean joins
  state.peer = null;
  state.peerId = null;
  state.roomId = null;
  state.userId = generateUserId();
  state.hostBrokerPeer = null;
  state.connections = {};
  state.participants = {};
  state.pendingJoinRequests = {};
  state.isJoinApproved = false;
  state.isRoomCreator = false;
  state.connectionStatus = "disconnected";
  state.hostClaimRetries = 0;
  state.joinRetries = 0;
  state.isMicOn = false;
  state.micStream = null;
  state.micCalls = {};

  // Allow 60ms for SCTP buffer to flush before disconnecting and freeing room ID
  setTimeout(() => {
    Object.values(oldConns).forEach((conn) => {
      try { if (conn && conn.open) conn.close(); } catch (e) {}
    });
    if (oldPeer) {
      try { oldPeer.disconnect(); } catch (e) {}
      try { oldPeer.destroy(); } catch (e) {}
    }
    if (oldBroker) {
      try { oldBroker.disconnect(); } catch (e) {}
      try { oldBroker.destroy(); } catch (e) {}
    }
  }, 60);
  updateMediaControlsUI();
}

function broadcastToPeers(data) {
  Object.values(state.connections).forEach((conn) => {
    if (conn && conn.open) {
      try { conn.send(data); } catch (e) {}
    }
  });
}

function retryConnection() {
  if (state.connectionStatus !== "connected") {
    displayConnectionStatus("connecting", "Retrying connection...");
    if (state.peer) {
      Object.values(state.connections).forEach((conn) => {
        if (conn && conn.open) { try { conn.close(); } catch (e) {} }
      });
      state.connections = {};
      try { state.peer.destroy(); } catch (e) {}
      state.peer = null;
    }
    displaySystemMessage("Attempting to reconnect...");
    setTimeout(() => {
      if (state.isRoomCreator) {
        initializePeer(state.roomId);
      } else {
        initializePeer();
        setTimeout(() => {
          if (state.peer && state.peer.open) connectToPeer(state.roomId);
          else {
            displayConnectionStatus("error", "Could not connect to PeerJS server");
            displaySystemMessage("Please try again or check your internet connection");
          }
        }, 2000);
      }
    }, 1000);
  }
}

function resetRoom() {
  clearRoomSession();
  resetJoinButton();
  if (state.isGroupVideoPresenter) stopGroupVideo();
  cleanUpActivePlayer();
  if (state.screenShareStream) stopScreenShare();
  if (elements.screenShareVideo) {
    elements.screenShareVideo.onerror = null;
    elements.screenShareVideo.srcObject = null;
  }
  if (state.webcamStream) toggleCamera();
  if (state.isMicOn) toggleMic();
  if (state.peer) { try { state.peer.destroy(); } catch (e) {} }

  if (elements.videoSourceModal) elements.videoSourceModal.classList.add("hidden");
  if (elements.joinRequestModal) elements.joinRequestModal.classList.add("hidden");
  if (elements.joinWaitingModal) elements.joinWaitingModal.classList.add("hidden");

  state.peer = null;
  state.peerId = null;
  state.roomId = null;
  state.connections = {};
  state.participants = {};
  state.pendingJoinRequests = {};
  state.isJoinApproved = false;
  state.isRoomCreator = false;
  state.connectionStatus = "disconnected";
  state.isMicOn = false;
  state.micStream = null;
  state.micCalls = {};
  elements.chatRoom.classList.add("hidden");
  elements.homeScreen.classList.remove("hidden");
  clearUrlRoom();
  elements.messagesContainer.innerHTML = "";
  resetParticipantsUI();

  [0, 1, 2, 3, 4, 5].forEach((i) => {
    const cb = document.getElementById(`cb-${i}`);
    if (cb) cb.value = "";
  });
  if (elements.roomIdInput) elements.roomIdInput.value = "";
  updateMediaControlsUI();
}

// ============================================================
// Avatar helpers
// ============================================================
function refreshAvatars() {
  window.generateAvatarOptions("refresh");
  elements.avatars.forEach((a) => a.classList.remove("selected"));
  state.selectedAvatar = null;
  elements.customAvatarUrlInput.value = "";
  elements.customAvatarUrlInput.style.borderColor = "";
}

function useCustomAvatar() {
  const customUrl = elements.customAvatarUrlInput.value.trim();
  if (!customUrl) { showError("Please enter a valid avatar URL"); return Promise.resolve(false); }
  if (!customUrl.startsWith("http://") && !customUrl.startsWith("https://")) {
    showError("Custom avatar URL must start with http:// or https://");
    return Promise.resolve(false);
  }
  return new Promise((resolve) => {
    const testImg = new Image();
    testImg.onload = function () {
      elements.avatars.forEach((a) => a.classList.remove("selected"));
      state.selectedAvatar = customUrl;
      try { localStorage.setItem("echorooms_avatar", customUrl); } catch (e) {}
      showToast("Custom avatar applied!", "success");
      elements.customAvatarUrlInput.style.borderColor = "var(--brand-500)";
      setTimeout(() => { elements.customAvatarUrlInput.style.borderColor = ""; }, 2000);
      resolve(true);
    };
    testImg.onerror = function () {
      showError("Invalid image URL. Please provide a valid image URL.");
      resolve(false);
    };
    testImg.src = customUrl;
  });
}

// ============================================================
// Boot
// ============================================================
document.addEventListener("DOMContentLoaded", init);
