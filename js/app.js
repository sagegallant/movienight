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
};

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
  shareScreenBtn:       document.getElementById("share-screen-btn"),
  movieModeBtn:         document.getElementById("movie-mode-btn"),
  copyRoomLinkBtn:      document.getElementById("copy-room-link-btn"),
  copyRoomIdBtn:        document.getElementById("copy-room-id"),
  leaveRoomBtn:         document.getElementById("leave-room-btn"),
  themeToggle:          document.getElementById("theme-toggle"),
  themeToggleRoom:      document.getElementById("theme-toggle-room"),

  // Room info panel
  roomInfoPanel:        document.getElementById("room-info-panel"),
  roomInfoOverlay:      document.getElementById("room-info-overlay"),
  closeRoomInfoBtn:     document.getElementById("close-room-info"),
  ripRoomId:            document.getElementById("rip-room-id"),
  ripCopyIdBtn:         document.getElementById("rip-copy-id"),
  participantsList:     document.getElementById("participants-list"),  // in panel

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

  // Screen share
  screenShareContainer: document.getElementById("screen-share-container"),
  screenShareVideo:     document.getElementById("screen-share-video"),
  screenShareUser:      document.getElementById("screen-share-user"),
  stopScreenShareBtn:   document.getElementById("stop-screen-share"),
};

let heartbeatInterval = null;
let sidebarOverlay = null;

// ============================================================
// Init
// ============================================================
function init() {
  if (window.generateAvatarOptions) {
    window.generateAvatarOptions();
  }
  setupEventListeners();
  setupThemeToggle();
  setupAvatarSelection();
  loadCachedUserData();
  checkUrlForInvite();
  setupHeartbeat();
}

// ============================================================
// Event Listeners
// ============================================================
function setupEventListeners() {
  // Home
  elements.createRoomBtn.addEventListener("click", () => createRoom());
  elements.joinRoomBtn.addEventListener("click", () => joinRoom());
  elements.refreshAvatarsBtn.addEventListener("click", refreshAvatars);
  elements.useCustomAvatarBtn.addEventListener("click", useCustomAvatar);
  elements.customAvatarToggle.addEventListener("click", toggleCustomAvatarPanel);
  elements.usernameInput.addEventListener("input", () => {
    try { localStorage.setItem("echorooms_username", elements.usernameInput.value.trim()); } catch (e) {}
  });
  elements.roomIdInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") joinRoom();
  });

  // Room header
  elements.leaveRoomBtn.addEventListener("click", () => leaveRoom());
  elements.sendMessageBtn.addEventListener("click", () => sendMessage());
  elements.messageInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") sendMessage();
  });
  elements.shareScreenBtn.addEventListener("click", startScreenShare);
  elements.stopScreenShareBtn.addEventListener("click", stopScreenShare);
  elements.copyRoomIdBtn.addEventListener("click", copyRoomIdToClipboard);
  if (elements.copyRoomLinkBtn) {
    elements.copyRoomLinkBtn.addEventListener("click", copyRoomLinkToClipboard);
  }
  if (elements.ripCopyIdBtn) {
    elements.ripCopyIdBtn.addEventListener("click", copyRoomIdToClipboard);
  }

  // Movie mode
  elements.movieModeBtn.addEventListener("click", toggleMovieMode);

  // Room info panel
  elements.roomInfoBtn.addEventListener("click", openRoomInfoPanel);
  elements.closeRoomInfoBtn.addEventListener("click", closeRoomInfoPanel);
  elements.roomInfoOverlay.addEventListener("click", closeRoomInfoPanel);

  // Sidebar toggle
  elements.toggleSidebarBtn.addEventListener("click", toggleSidebar);
  elements.closeSidebarBtn.addEventListener("click", closeSidebar);
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
// Avatar Selection
// ============================================================
function setupAvatarSelection() {
  elements.avatars.forEach((avatar) => {
    avatar.addEventListener("click", () => {
      elements.customAvatarUrlInput.value = "";
      elements.customAvatarUrlInput.style.borderColor = "";
      elements.avatars.forEach((a) => a.classList.remove("selected"));
      avatar.classList.add("selected");
      state.selectedAvatar = avatar.getAttribute("data-avatar") || avatar.src;
      try { localStorage.setItem("echorooms_avatar", state.selectedAvatar); } catch (e) {}
    });
  });
}

// ============================================================
// Custom Avatar Panel Toggle
// ============================================================
function toggleCustomAvatarPanel() {
  elements.customAvatarPanel.classList.toggle("hidden");
  if (!elements.customAvatarPanel.classList.contains("hidden")) {
    elements.customAvatarUrlInput.focus();
  }
}

// ============================================================
// Load Cached Data
// ============================================================
function loadCachedUserData() {
  try {
    const cachedUsername = localStorage.getItem("echorooms_username");
    if (cachedUsername) {
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
      let matchedPredefined = false;
      elements.avatars.forEach((avatar) => {
        const avatarUrl = avatar.getAttribute("data-avatar") || avatar.src;
        if (avatarUrl === cachedAvatar) {
          avatar.classList.add("selected");
          matchedPredefined = true;
        } else {
          avatar.classList.remove("selected");
        }
      });
      if (!matchedPredefined && (cachedAvatar.startsWith("http://") || cachedAvatar.startsWith("https://"))) {
        elements.customAvatarUrlInput.value = cachedAvatar;
        const firstAvatar = elements.avatars[0];
        if (firstAvatar) {
          firstAvatar.src = cachedAvatar;
          firstAvatar.setAttribute("data-avatar", cachedAvatar);
          firstAvatar.classList.add("selected");
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
  const username = elements.usernameInput.value.trim();
  if (!username) { showError("Please enter your display name"); return false; }
  if (!state.selectedAvatar && !elements.customAvatarUrlInput.value.trim()) {
    showError("Please select a profile picture");
    return false;
  }
  if (!state.selectedAvatar && elements.customAvatarUrlInput.value.trim()) {
    const isCustomValid = await useCustomAvatar();
    if (!isCustomValid || !state.selectedAvatar) return false;
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
  initializePeer(state.roomId);
  displayRoom();
}

async function joinRoom(targetRoomId = null) {
  if (!(await validateUserInput())) return;
  const rawRoomId = typeof targetRoomId === "string" && targetRoomId.trim()
    ? targetRoomId : elements.roomIdInput.value;
  const roomId = rawRoomId ? rawRoomId.trim().toUpperCase() : "";
  if (!roomId) { showError("Please enter a room ID"); return; }
  elements.messagesContainer.innerHTML = "";
  resetParticipantsUI();
  state.roomId = roomId;
  state.hostClaimRetries = 0;
  state.joinRetries = 0;
  displayConnectionStatus("connecting");
  initializePeer();
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
      handlePeerConnection(conn);
    });

    // Handle incoming media calls (screen sharing)
    state.peer.on("call", (call) => {
      console.log("Incoming media call from:", call.peer, call.metadata);
      if (call.metadata && call.metadata.type === "screen_share") {
        call.answer();
        call.on("stream", (remoteStream) => {
          console.log("Received remote screen share stream");
          state.screenShareUser = call.metadata?.username || "Participant";
          state.screenShareUserId = call.metadata?.userId || null;
          elements.screenShareContainer.classList.remove("hidden");
          elements.screenShareVideo.srcObject = remoteStream;
          elements.screenShareUser.textContent = state.screenShareUser;
          elements.stopScreenShareBtn.classList.add("hidden");
          // Auto activate movie mode for remote viewer
          if (!state.movieMode) activateMovieMode();
        });
        call.on("close", () => handleScreenShareStop());
        call.on("error", (err) => { console.error("Screen share call error:", err); handleScreenShareStop(); });
      }
    });

    state.peer.on("error", (err) => {
      console.error("Peer error:", err);
      if (err.type === "peer-unavailable") {
        if (!state.isRoomCreator && (state.joinRetries || 0) < 4) {
          state.joinRetries = (state.joinRetries || 0) + 1;
          displayConnectionStatus("connecting", "Host updating, retrying...");
          setTimeout(() => { if (state.peer && !state.peer.destroyed) connectToPeer(state.roomId); }, 1500);
          return;
        }
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

    state.peer.on("disconnected", () => {
      displayConnectionStatus("disconnected", "Disconnected from server");
      setTimeout(() => {
        if (state.peer && state.connectionStatus !== "connected") {
          displayConnectionStatus("connecting", "Attempting to reconnect...");
          try { state.peer.reconnect(); } catch (e) {
            initializePeer(state.isRoomCreator ? state.roomId : null);
          }
        }
      }, 3000);
    });
  } catch (e) {
    console.error("Error initializing peer:", e);
    displayConnectionStatus("error", "Failed to initialize connection");
    showError("Failed to initialize connection: " + e.message);
  }
}

// ============================================================
// Connect to Peer
// ============================================================
function connectToPeer(peerId) {
  console.log("Connecting to peer:", peerId);
  try {
    displayConnectionStatus("connecting", `Connecting to room ${peerId}...`);
    const conn = state.peer.connect(peerId, {
      metadata: { userId: state.userId, username: state.username, avatar: state.avatar, joinRequest: true, timestamp: Date.now() },
      reliable: true,
      serialization: "json",
    });
    if (conn) {
      handlePeerConnection(conn);
      setTimeout(() => {
        if (state.connectionStatus !== "connected" && conn.peer === peerId && !conn.isConnectionOpen) {
          displayConnectionStatus("error", "Connection timeout");
          const retryMessage = document.createElement("div");
          retryMessage.className = "retry-message";
          retryMessage.innerHTML = `
            <button class="retry-btn">Retry Connection</button>
            <button class="cancel-btn">Go Back</button>
          `;
          elements.messagesContainer.appendChild(retryMessage);
          retryMessage.querySelector(".retry-btn").addEventListener("click", () => { retryMessage.remove(); retryConnection(); });
          retryMessage.querySelector(".cancel-btn").addEventListener("click", () => { retryMessage.remove(); resetRoom(); });
        }
      }, 12000);
    } else {
      showError("Failed to connect to the room");
    }
  } catch (error) {
    console.error("Error connecting to peer:", error);
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
    if (conn.metadata?.joinRequest && state.isRoomCreator) {
      setTimeout(() => sendRoomInfo(conn), 500);
    }
    if (conn.peer === state.roomId && !state.isRoomCreator) {
      displayRoom();
      displayConnectionStatus("connected", "Joined room successfully");
      addSelfToParticipants();
    }
  });
  conn.on("data", (data) => handleIncomingData(conn, data));
  conn.on("close", () => handlePeerDisconnect(conn.peer));
  conn.on("error", (err) => {
    console.error("Connection error with:", conn.peer, err);
    if (conn.peer === state.roomId && !state.isRoomCreator) {
      displayConnectionStatus("error", "Connection error: " + err.message);
      const retryMessage = document.createElement("div");
      retryMessage.className = "retry-message";
      retryMessage.innerHTML = `
        <button class="retry-btn">Retry Connection</button>
        <button class="cancel-btn">Go Back</button>
      `;
      elements.messagesContainer.appendChild(retryMessage);
      retryMessage.querySelector(".retry-btn").addEventListener("click", () => { retryMessage.remove(); retryConnection(); });
      retryMessage.querySelector(".cancel-btn").addEventListener("click", () => { retryMessage.remove(); resetRoom(); });
    }
  });
}

// ============================================================
// Room Info
// ============================================================
function sendRoomInfo(conn) {
  conn.send({
    type: "room_info",
    participants: state.participants,
    screenShareActive: !!state.screenShareStream,
    screenShareUser: state.screenShareUser,
  });
  broadcastNewParticipant(conn.metadata);
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
    case "room_info":       handleRoomInfo(data, conn); break;
    case "new_participant": handleNewParticipant(data.participant); break;
    case "participant_left": handleParticipantLeft(data.userId); break;
    case "host_update":     handleHostUpdate(data); break;
    case "chat_message":    displayMessage(data.message); break;
    case "screen_share_start": handleScreenShareStart(data); break;
    case "screen_share_stop":  handleScreenShareStop(); break;
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
    if (wasHost && Object.keys(state.participants).length > 0) electNewRoomCreator();
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
  if (wasHost && Object.keys(state.participants).length > 0) electNewRoomCreator();
}

function electNewRoomCreator() {
  const remaining = Object.values(state.participants).sort((a, b) => (a.joinTime || 0) - (b.joinTime || 0));
  if (remaining.length > 0) {
    Object.values(state.participants).forEach((p) => (p.isCreator = false));
    const newHost = remaining[0];
    newHost.isCreator = true;
    if (newHost.userId === state.userId) {
      state.isRoomCreator = true;
      initializePeer(state.roomId);
      showToast("The room host left. You are now the host!", "info");
      displaySystemMessage("You are now the room host.");
      broadcastToPeers({ type: "host_update", hostUserId: state.userId, participants: state.participants });
    } else {
      showToast(`${newHost.username} is now the room host.`, "info");
      displaySystemMessage(`${newHost.username} is now the room host.`);
    }
    updateParticipantsUI();
  }
}

function handleHostUpdate(data) {
  if (data.participants) state.participants = data.participants;
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

  // Update badge count
  if (elements.participantCount) elements.participantCount.textContent = count;

  // Update sidebar
  if (elements.sidebarParticipants) {
    elements.sidebarParticipants.innerHTML = "";
    participants.forEach((p) => {
      const li = document.createElement("li");
      li.className = "sidebar-participant-item";
      const img = document.createElement("img");
      img.className = "sidebar-avatar";
      img.src = p.avatar;
      img.alt = p.username;
      const name = document.createElement("span");
      name.className = "sidebar-participant-name";
      name.textContent = p.username;
      if (p.isCreator) {
        const hostTag = document.createElement("span");
        hostTag.className = "host-tag";
        hostTag.textContent = "Host";
        name.appendChild(hostTag);
      }
      if (p.userId === state.userId) {
        const youTag = document.createElement("span");
        youTag.className = "host-tag";
        youTag.style.color = "var(--accent-green)";
        youTag.textContent = " You";
        name.appendChild(youTag);
      }
      li.appendChild(img);
      li.appendChild(name);
      elements.sidebarParticipants.appendChild(li);
    });
  }

  // Update room info panel participants list
  if (elements.participantsList) {
    elements.participantsList.innerHTML = "";
    participants.forEach((p) => {
      const li = document.createElement("li");
      li.className = "rip-participant-item";
      const img = document.createElement("img");
      img.className = "rip-participant-avatar";
      img.src = p.avatar;
      img.alt = p.username;
      const name = document.createElement("span");
      name.className = "rip-participant-name";
      name.textContent = p.username + (p.userId === state.userId ? " (You)" : "");
      li.appendChild(img);
      li.appendChild(name);
      if (p.isCreator) {
        const badge = document.createElement("span");
        badge.className = "rip-participant-badge";
        badge.textContent = "Host";
        li.appendChild(badge);
      }
      elements.participantsList.appendChild(li);
    });
  }
}

// ============================================================
// Room Info Panel
// ============================================================
function openRoomInfoPanel() {
  if (elements.ripRoomId) elements.ripRoomId.textContent = state.roomId || "——";
  elements.roomInfoPanel.classList.remove("hidden");
  elements.roomInfoOverlay.classList.remove("hidden");
}

function closeRoomInfoPanel() {
  elements.roomInfoPanel.classList.add("hidden");
  elements.roomInfoOverlay.classList.add("hidden");
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
  elements.movieModeBtn.classList.add("movie-active");
  elements.movieModeBtn.title = "Exit Movie Mode";

  const roomBody = elements.roomBody;
  const chatSection = document.querySelector(".chat-section");
  const screenShare = elements.screenShareContainer;
  const messages = elements.messagesContainer;
  const msgBar = document.querySelector(".message-bar");

  // Create movie chat panel if not exists
  let movieChatPanel = document.getElementById("movie-chat-panel-inner");
  if (!movieChatPanel) {
    movieChatPanel = document.createElement("div");
    movieChatPanel.className = "movie-chat-panel";
    movieChatPanel.id = "movie-chat-panel-inner";
    chatSection.appendChild(movieChatPanel);
  }

  // Move messages and message bar into movie chat panel
  movieChatPanel.appendChild(messages);
  movieChatPanel.appendChild(msgBar);

  // Ensure screen share is visible
  if (screenShare.classList.contains("hidden") && state.screenShareVideo.srcObject) {
    screenShare.classList.remove("hidden");
  }

  roomBody.classList.add("movie-mode");
  showToast("Movie Mode activated 🎬", "info", 2000);
}

function deactivateMovieMode() {
  state.movieMode = false;
  elements.movieModeBtn.classList.remove("movie-active");
  elements.movieModeBtn.title = "Movie Mode";

  const roomBody = elements.roomBody;
  const chatSection = document.querySelector(".chat-section");
  const messages = elements.messagesContainer;
  const msgBar = document.querySelector(".message-bar");
  const movieChatPanel = document.getElementById("movie-chat-panel-inner");

  // Move messages and bar back into chat section
  if (movieChatPanel) {
    chatSection.insertBefore(messages, movieChatPanel);
    chatSection.insertBefore(msgBar, movieChatPanel);
    movieChatPanel.remove();
  }

  roomBody.classList.remove("movie-mode");
  showToast("Movie Mode deactivated", "info", 2000);
}

// ============================================================
// Messages
// ============================================================
function sendMessage() {
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
  const messageElement = document.createElement("div");
  messageElement.className = "message";
  if (isOutgoing || message.userId === state.userId) messageElement.classList.add("outgoing");

  const avatar = document.createElement("img");
  avatar.className = "message-avatar";
  avatar.src = message.avatar;
  avatar.alt = message.username;

  const contentDiv = document.createElement("div");
  contentDiv.className = "message-content";

  const headerDiv = document.createElement("div");
  headerDiv.className = "message-header";

  const sender = document.createElement("span");
  sender.className = "message-sender";
  sender.textContent = message.userId === state.userId ? "You" : message.username;

  const time = document.createElement("span");
  time.className = "message-time";
  time.textContent = formatTime(new Date(message.timestamp));

  headerDiv.appendChild(sender);
  headerDiv.appendChild(time);

  const textDiv = document.createElement("div");
  textDiv.className = "message-text";
  textDiv.textContent = message.text;

  contentDiv.appendChild(headerDiv);
  contentDiv.appendChild(textDiv);
  messageElement.appendChild(avatar);
  messageElement.appendChild(contentDiv);

  elements.messagesContainer.appendChild(messageElement);
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
  elements.messagesContainer.scrollTop = elements.messagesContainer.scrollHeight;
}

// ============================================================
// Screen Share
// ============================================================
async function startScreenShare() {
  if (state.screenShareUser && state.screenShareUser !== state.username) {
    showToast(`${state.screenShareUser} is already sharing. They must stop first.`, "info");
    return;
  }
  if (state.screenShareStream) { showToast("You are already sharing your screen.", "info"); return; }

  try {
    const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
    state.screenShareStream = stream;
    state.screenShareUser = state.username;
    state.screenShareUserId = state.userId;

    elements.screenShareContainer.classList.remove("hidden");
    elements.screenShareVideo.srcObject = stream;
    elements.screenShareUser.textContent = "You";
    elements.stopScreenShareBtn.classList.remove("hidden");

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
  elements.screenShareContainer.classList.remove("hidden");
  elements.screenShareUser.textContent = data.username;
  elements.stopScreenShareBtn.classList.add("hidden");
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

    elements.screenShareContainer.classList.add("hidden");
    elements.screenShareVideo.srcObject = null;
    elements.stopScreenShareBtn.classList.add("hidden");

    broadcastToPeers({ type: "screen_share_stop", userId: state.userId });

    // Exit movie mode when sharing stops
    if (state.movieMode) deactivateMovieMode();
  }
}

function handleScreenShareStop() {
  state.screenShareUser = null;
  state.screenShareUserId = null;
  elements.screenShareContainer.classList.add("hidden");
  if (elements.screenShareVideo.srcObject) {
    elements.screenShareVideo.srcObject.getTracks().forEach((t) => t.stop());
    elements.screenShareVideo.srcObject = null;
  }
  // Exit movie mode when remote share stops
  if (state.movieMode) deactivateMovieMode();
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
  if (state.screenShareStream) stopScreenShare();
  if (state.movieMode) deactivateMovieMode();
  elements.messagesContainer.innerHTML = "";
  resetParticipantsUI();
  elements.chatRoom.classList.add("hidden");
  elements.homeScreen.classList.remove("hidden");
  clearUrlRoom();
  closeRoomInfoPanel();

  broadcastToPeers({ type: "participant_left", userId: state.userId });

  setTimeout(() => {
    Object.values(state.connections).forEach((conn) => {
      try { if (conn && conn.open) conn.close(); } catch (e) {}
    });
    if (state.peer) {
      try { state.peer.destroy(); } catch (e) {}
    }
    state.peer = null;
    state.peerId = null;
    state.roomId = null;
    state.connections = {};
    state.participants = {};
    state.isRoomCreator = false;
    state.connectionStatus = "disconnected";
    state.hostClaimRetries = 0;
    state.joinRetries = 0;
  }, 200);
}

function broadcastToPeers(data) {
  Object.values(state.connections).forEach((conn) => {
    if (conn.open) conn.send(data);
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
  if (state.peer) { try { state.peer.destroy(); } catch (e) {} }
  state.peer = null;
  state.peerId = null;
  state.connections = {};
  state.participants = {};
  state.isRoomCreator = false;
  state.connectionStatus = "disconnected";
  elements.chatRoom.classList.add("hidden");
  elements.homeScreen.classList.remove("hidden");
  clearUrlRoom();
  elements.messagesContainer.innerHTML = "";
  resetParticipantsUI();
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
