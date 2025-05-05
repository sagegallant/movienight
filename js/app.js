// App State
const state = {
  peer: null,
  peerId: null,
  roomId: null,
  userId: null,
  username: null,
  avatar: null,
  connections: {}, // Store active peer connections
  participants: {}, // Store participant info
  isRoomCreator: false,
  screenShareStream: null,
  screenShareCalls: {}, // Store active media calls for screen sharing
  screenShareUser: null,
  isDarkMode: false,
  selectedAvatar: null,
  connectionStatus: "disconnected", // Track connection status
  hostClaimRetries: 0,
  joinRetries: 0,
};

// DOM Elements
const elements = {
  homeScreen: document.getElementById("home-screen"),
  chatRoom: document.getElementById("chat-room"),
  usernameInput: document.getElementById("username"),
  roomIdInput: document.getElementById("room-id"),
  createRoomBtn: document.getElementById("create-room-btn"),
  joinRoomBtn: document.getElementById("join-room-btn"),
  leaveRoomBtn: document.getElementById("leave-room-btn"),
  currentRoomId: document.getElementById("current-room-id"),
  messageInput: document.getElementById("message-input"),
  sendMessageBtn: document.getElementById("send-message-btn"),
  messagesContainer: document.getElementById("messages-container"),
  participantsList: document.getElementById("participants-list"),
  avatars: document.querySelectorAll(".avatar"),
  themeToggle: document.getElementById("theme-toggle"),
  shareScreenBtn: document.getElementById("share-screen-btn"),
  stopScreenShareBtn: document.getElementById("stop-screen-share"),
  screenShareContainer: document.getElementById("screen-share-container"),
  screenShareVideo: document.getElementById("screen-share-video"),
  screenShareUser: document.getElementById("screen-share-user"),
  copyRoomIdBtn: document.getElementById("copy-room-id"),
  refreshAvatarsBtn: document.getElementById("refresh-avatars"),
  customAvatarUrlInput: document.getElementById("custom-avatar-url"),
  useCustomAvatarBtn: document.getElementById("use-custom-avatar"),
};

// Add this after the state definition
let heartbeatInterval = null;

// Initialize the application
function init() {
  if (window.generateAvatarOptions) {
    window.generateAvatarOptions();
  }
  setupEventListeners();
  setupThemeToggle();
  setupAvatarSelection();
  loadCachedUserData();
  setupHeartbeat();
}

// Setup Event Listeners
function setupEventListeners() {
  elements.createRoomBtn.addEventListener("click", createRoom);
  elements.joinRoomBtn.addEventListener("click", joinRoom);
  elements.leaveRoomBtn.addEventListener("click", leaveRoom);
  elements.sendMessageBtn.addEventListener("click", sendMessage);
  elements.messageInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") sendMessage();
  });
  elements.shareScreenBtn.addEventListener("click", startScreenShare);
  elements.stopScreenShareBtn.addEventListener("click", stopScreenShare);
  elements.copyRoomIdBtn.addEventListener("click", copyRoomIdToClipboard);

  // Avatar selection buttons
  elements.refreshAvatarsBtn.addEventListener("click", refreshAvatars);
  elements.useCustomAvatarBtn.addEventListener("click", useCustomAvatar);

  // Cache username on typing
  elements.usernameInput.addEventListener("input", () => {
    try {
      localStorage.setItem(
        "echorooms_username",
        elements.usernameInput.value.trim()
      );
    } catch (e) {}
  });
}

// Setup Theme Toggle
function setupThemeToggle() {
  elements.themeToggle.innerHTML = '<i class="fas fa-moon"></i>';

  elements.themeToggle.addEventListener("click", () => {
    document.body.classList.toggle("dark-mode");
    document.body.classList.toggle("light-mode");

    state.isDarkMode = document.body.classList.contains("dark-mode");

    if (state.isDarkMode) {
      elements.themeToggle.innerHTML = '<i class="fas fa-sun"></i>';
    } else {
      elements.themeToggle.innerHTML = '<i class="fas fa-moon"></i>';
    }

    try {
      localStorage.setItem(
        "echorooms_theme",
        state.isDarkMode ? "dark" : "light"
      );
    } catch (e) {}
  });
}

// Setup Avatar Selection
function setupAvatarSelection() {
  elements.avatars.forEach((avatar) => {
    avatar.addEventListener("click", () => {
      // Clear custom avatar URL when selecting a generated avatar
      elements.customAvatarUrlInput.value = "";
      elements.customAvatarUrlInput.style.borderColor = "";

      // Apply the selected class
      elements.avatars.forEach((a) => a.classList.remove("selected"));
      avatar.classList.add("selected");

      // Store the avatar URL
      state.selectedAvatar = avatar.getAttribute("data-avatar") || avatar.src;
      try {
        localStorage.setItem("echorooms_avatar", state.selectedAvatar);
      } catch (e) {}
    });
  });
}

// Load cached username, avatar, and theme from localStorage
function loadCachedUserData() {
  try {
    // 1. Cached Username
    const cachedUsername = localStorage.getItem("echorooms_username");
    if (cachedUsername) {
      elements.usernameInput.value = cachedUsername;
      state.username = cachedUsername;
    }

    // 2. Cached Theme
    const cachedTheme = localStorage.getItem("echorooms_theme");
    if (cachedTheme === "dark") {
      document.body.classList.remove("light-mode");
      document.body.classList.add("dark-mode");
      state.isDarkMode = true;
      elements.themeToggle.innerHTML = '<i class="fas fa-sun"></i>';
    } else if (cachedTheme === "light") {
      document.body.classList.remove("dark-mode");
      document.body.classList.add("light-mode");
      state.isDarkMode = false;
      elements.themeToggle.innerHTML = '<i class="fas fa-moon"></i>';
    }

    // 3. Cached Avatar
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

      // If cached avatar was a custom avatar or not among current generated options
      if (!matchedPredefined) {
        if (cachedAvatar.startsWith("http://") || cachedAvatar.startsWith("https://")) {
          elements.customAvatarUrlInput.value = cachedAvatar;
          const firstAvatar = elements.avatars[0];
          if (firstAvatar) {
            firstAvatar.src = cachedAvatar;
            firstAvatar.setAttribute("data-avatar", cachedAvatar);
            firstAvatar.classList.add("selected");
          }
        }
      }
    }
  } catch (e) {
    console.warn("Could not load cached user data from localStorage:", e);
  }
}

// Save user data to localStorage cache
function saveUserDataToCache() {
  try {
    if (state.username) {
      localStorage.setItem("echorooms_username", state.username);
    }
    if (state.selectedAvatar) {
      localStorage.setItem("echorooms_avatar", state.selectedAvatar);
    }
  } catch (e) {
    console.warn("Could not save user data to localStorage:", e);
  }
}

// Setup heartbeat mechanism to monitor connection health
function setupHeartbeat() {
  // Clear any existing heartbeat
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
  }

  // Set up a new heartbeat interval
  heartbeatInterval = setInterval(() => {
    // Only run if we're connected to a room
    if (
      state.peer &&
      state.peer.open &&
      state.roomId &&
      Object.keys(state.connections).length > 0
    ) {
      // Send a heartbeat to all connections
      broadcastToPeers({
        type: "heartbeat",
        timestamp: Date.now(),
      });

      // Check if any connections haven't responded recently
      Object.entries(state.connections).forEach(([peerId, conn]) => {
        // If connection is not open, try to reconnect
        if (!conn.open) {
          console.warn(
            `Connection to ${peerId} is closed. Removing from connections.`
          );
          delete state.connections[peerId];
        }
      });
    }
  }, 15000); // Check every 15 seconds
}

// Validate user input
async function validateUserInput() {
  const username = elements.usernameInput.value.trim();

  if (!username) {
    showError("Please enter your display name");
    return false;
  }

  // Check if either a predefined avatar is selected or a custom URL is provided
  if (!state.selectedAvatar && !elements.customAvatarUrlInput.value.trim()) {
    showError("Please select a profile picture or enter a custom avatar URL");
    return false;
  }

  // If custom URL is provided but no avatar is selected, validate and use custom URL
  if (!state.selectedAvatar && elements.customAvatarUrlInput.value.trim()) {
    const isCustomValid = await useCustomAvatar();
    if (!isCustomValid || !state.selectedAvatar) {
      return false;
    }
  }

  state.username = username;
  state.avatar = state.selectedAvatar;
  state.userId = generateUserId();

  saveUserDataToCache();

  return true;
}

// Show in-app toast notification
function showToast(message, type = "info", duration = 3000) {
  const container = document.getElementById("toast-container") || document.body;

  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;

  let iconClass = "fa-info-circle";
  if (type === "success") iconClass = "fa-check-circle";
  if (type === "error") iconClass = "fa-exclamation-circle";

  toast.innerHTML = `<i class="fas ${iconClass}"></i> <span>${message}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add("toast-fade-out");
    setTimeout(() => {
      toast.remove();
    }, 300);
  }, duration);
}

// Show error message
function showError(message) {
  showToast(message, "error");
}

// Generate a unique user ID
function generateUserId() {
  return "user_" + uuid.v4();
}

// Create a new room
async function createRoom() {
  if (!(await validateUserInput())) return;

  state.hostClaimRetries = 0;
  state.joinRetries = 0;

  // Generate room ID
  state.roomId = "room_" + uuid.v4().substring(0, 8);

  // Set as room creator
  state.isRoomCreator = true;

  // Initialize PeerJS with the room ID as the peer ID
  initializePeer(state.roomId);

  // Update UI
  displayRoom();
}

// Join an existing room
async function joinRoom() {
  if (!(await validateUserInput())) return;

  const roomId = elements.roomIdInput.value.trim();

  if (!roomId) {
    showError("Please enter a room ID");
    return;
  }

  state.roomId = roomId;
  state.hostClaimRetries = 0;
  state.joinRetries = 0;

  // Show connecting status
  displayConnectionStatus("connecting");

  // Initialize PeerJS with a random ID for joiners
  initializePeer();
}

// Initialize PeerJS
function initializePeer(peerId) {
  // Create a new peer with either provided ID (for room creator) or random ID (for joiners)
  const peerOptions = {
    config: {
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:global.stun.twilio.com:3478" },
      ],
    },
    debug: 2, // Set debug level (0=none, 1=errors, 2=warnings, 3=all)
  };

  console.log(
    "Initializing peer connection",
    peerId ? `with ID: ${peerId}` : "with random ID"
  );

  try {
    // Destroy any existing peer connection
    if (state.peer) {
      state.peer.destroy();
    }

    // Create new peer instance
    state.peer = new Peer(peerId, peerOptions);

    // Handle peer open event
    state.peer.on("open", (id) => {
      state.peerId = id;
      console.log("PeerJS connection established with ID:", id);

      if (state.isRoomCreator) {
        state.hostClaimRetries = 0;
        displayConnectionStatus("connected", "Room created successfully");
        addSelfToParticipants();

        // Connect to any remaining participants who haven't reconnected yet
        Object.values(state.participants).forEach((participant) => {
          if (
            participant.userId !== state.userId &&
            participant.peerId &&
            participant.peerId !== state.peerId
          ) {
            if (
              !state.connections[participant.peerId] ||
              !state.connections[participant.peerId].open
            ) {
              const conn = state.peer.connect(participant.peerId, {
                metadata: {
                  userId: state.userId,
                  username: state.username,
                  avatar: state.avatar,
                  hostMigration: true,
                },
              });
              handlePeerConnection(conn);
            }
          }
        });
      } else {
        // If joining, connect to the room creator
        connectToPeer(state.roomId);
      }
    });

    // Handle incoming connections
    state.peer.on("connection", (conn) => {
      console.log("Incoming connection from:", conn.peer);
      handlePeerConnection(conn);
    });

    // Handle incoming media calls (e.g., screen sharing)
    state.peer.on("call", (call) => {
      console.log("Incoming media call from:", call.peer, call.metadata);
      if (call.metadata && call.metadata.type === "screen_share") {
        call.answer(); // Answer without sending local stream back

        call.on("stream", (remoteStream) => {
          console.log("Received remote screen share stream");
          elements.screenShareContainer.classList.remove("hidden");
          elements.screenShareVideo.srcObject = remoteStream;
          elements.screenShareUser.textContent =
            call.metadata.username || "Participant";
          elements.shareScreenBtn.disabled = true;
          elements.stopScreenShareBtn.classList.add("hidden");
        });

        call.on("close", () => {
          handleScreenShareStop();
        });

        call.on("error", (err) => {
          console.error("Screen share media call error:", err);
          handleScreenShareStop();
        });
      }
    });

    // Handle errors
    state.peer.on("error", (err) => {
      console.error("Peer error:", err);

      if (err.type === "peer-unavailable") {
        if (!state.isRoomCreator && (state.joinRetries || 0) < 4) {
          state.joinRetries = (state.joinRetries || 0) + 1;
          console.warn(
            `Host is updating, retrying connection to ${state.roomId} (${state.joinRetries}/4)...`
          );
          displayConnectionStatus("connecting", "Host updating, retrying...");
          setTimeout(() => {
            if (state.peer && !state.peer.destroyed) {
              connectToPeer(state.roomId);
            }
          }, 1500);
          return;
        }

        displayConnectionStatus(
          "error",
          "Room not found or no longer available"
        );
        showError(
          "Room not found or no longer available. Please check the room ID and try again."
        );
      } else if (err.type === "network" || err.type === "server-error") {
        displayConnectionStatus(
          "error",
          "Network or server error, please try again"
        );

        // Add automatic retry for network errors
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
            console.warn(
              `Room ID ${state.roomId} is still releasing on server. Retrying claim (${state.hostClaimRetries}/6)...`
            );
            displaySystemMessage("Re-claiming room host role on server...");
            setTimeout(() => {
              initializePeer(state.roomId);
            }, 1500);
            return;
          }

          displayConnectionStatus("error", "Room ID already in use");
          showError(
            "The room ID is currently unavailable. Please try creating a new room."
          );

          // Reset to home screen after exhausting retries
          setTimeout(resetRoom, 2000);
        } else {
          // For joiners, just generate a new random ID
          console.log("Peer ID unavailable, generating new random ID");
          initializePeer(); // Retry with random ID
        }
      } else {
        displayConnectionStatus("error", err.message);
        showError("Connection error: " + err.message);
      }
    });

    // Handle disconnection
    state.peer.on("disconnected", () => {
      console.log("Peer disconnected from server");
      displayConnectionStatus("disconnected", "Disconnected from server");

      // Try to reconnect
      setTimeout(() => {
        if (state.peer && state.connectionStatus !== "connected") {
          displayConnectionStatus(
            "connecting",
            "Attempting to reconnect to server..."
          );
          try {
            state.peer.reconnect();
          } catch (e) {
            console.error("Error during reconnect:", e);
            // If reconnect fails, try to reinitialize
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

// Connect to a peer
function connectToPeer(peerId) {
  console.log("Attempting to connect to peer:", peerId);

  try {
    // Display connecting status
    displayConnectionStatus("connecting", `Connecting to room ${peerId}...`);

    // Create connection with better metadata
    const conn = state.peer.connect(peerId, {
      metadata: {
        userId: state.userId,
        username: state.username,
        avatar: state.avatar,
        joinRequest: true,
        timestamp: Date.now(),
      },
      reliable: true,
      serialization: "json",
    });

    if (conn) {
      handlePeerConnection(conn);

      // Set a timeout to detect if connection doesn't complete
      setTimeout(() => {
        // If we still haven't connected successfully
        if (
          state.connectionStatus !== "connected" &&
          conn.peer === peerId &&
          !conn.isConnectionOpen
        ) {
          console.warn("Connection timeout for peer:", peerId);
          displayConnectionStatus(
            "error",
            "Connection timeout - Room may no longer be available"
          );

          // Add option to retry or go back
          const retryMessage = document.createElement("div");
          retryMessage.className = "retry-message";
          retryMessage.innerHTML = `
            <p>Unable to connect to the room. This may be due to:</p>
            <ul>
              <li>The room no longer exists</li>
              <li>Network issues</li>
              <li>Firewall restrictions</li>
            </ul>
            <button class="retry-btn">Retry Connection</button>
            <button class="cancel-btn">Go Back</button>
          `;
          elements.messagesContainer.appendChild(retryMessage);

          // Add event listeners to the buttons
          retryMessage
            .querySelector(".retry-btn")
            .addEventListener("click", () => {
              retryMessage.remove();
              retryConnection();
            });

          retryMessage
            .querySelector(".cancel-btn")
            .addEventListener("click", () => {
              retryMessage.remove();
              resetRoom();
            });
        }
      }, 12000); // 12 second timeout
    } else {
      console.error("Failed to create connection");
      showError("Failed to connect to the room");
    }
  } catch (error) {
    console.error("Error connecting to peer:", error);
    showError("Connection error: " + error.message);
  }
}

// Handle peer connection
function handlePeerConnection(conn) {
  // Store the connection
  state.connections[conn.peer] = conn;
  console.log("Setting up connection with peer:", conn.peer);

  // Handle connection open
  conn.on("open", () => {
    console.log("Connected to peer: " + conn.peer);

    // Mark connection as successfully opened
    conn.isConnectionOpen = true;

    // If local user is currently sharing screen, call the new peer with screen stream
    if (state.screenShareStream) {
      callPeerForScreenShare(conn.peer, state.screenShareStream);
    }

    // If this is a join request, send room information
    if (conn.metadata?.joinRequest && state.isRoomCreator) {
      console.log("Sending room info to new peer:", conn.peer);
      // Send the current participants list to the new peer
      setTimeout(() => sendRoomInfo(conn), 500); // Add slight delay for stability
    }

    // If this is the room creator, display the room
    if (conn.peer === state.roomId && !state.isRoomCreator) {
      displayRoom();
      displayConnectionStatus("connected", "Joined room successfully");
      addSelfToParticipants();
      console.log("Successfully joined room:", state.roomId);
    }
  });

  // Handle incoming data
  conn.on("data", (data) => {
    console.log("Received data from peer:", conn.peer, data);
    handleIncomingData(conn, data);
  });

  // Handle connection close
  conn.on("close", () => {
    console.log("Connection closed with peer:", conn.peer);
    handlePeerDisconnect(conn.peer);
  });

  // Handle errors
  conn.on("error", (err) => {
    console.error("Connection error with peer:", conn.peer, err);

    // Try to reconnect if this was an important connection
    if (conn.peer === state.roomId && !state.isRoomCreator) {
      displayConnectionStatus("error", "Connection error: " + err.message);

      // Add retry button
      const retryMessage = document.createElement("div");
      retryMessage.className = "retry-message";
      retryMessage.innerHTML = `
        <button class="retry-btn">Retry Connection</button>
        <button class="cancel-btn">Go Back</button>
      `;
      elements.messagesContainer.appendChild(retryMessage);

      retryMessage.querySelector(".retry-btn").addEventListener("click", () => {
        retryMessage.remove();
        retryConnection();
      });

      retryMessage
        .querySelector(".cancel-btn")
        .addEventListener("click", () => {
          retryMessage.remove();
          resetRoom();
        });
    }
  });
}

// Send room information to new participant
function sendRoomInfo(conn) {
  const roomInfo = {
    type: "room_info",
    participants: state.participants,
    screenShareActive: !!state.screenShareStream,
    screenShareUser: state.screenShareUser,
  };

  conn.send(roomInfo);

  // Notify other participants about the new peer
  broadcastNewParticipant(conn.metadata);
}

// Broadcast new participant to all existing participants
function broadcastNewParticipant(participantData) {
  const message = {
    type: "new_participant",
    participant: {
      userId: participantData.userId,
      username: participantData.username,
      avatar: participantData.avatar,
      peerId: participantData.peerId || state.peerId,
      joinTime: participantData.joinTime || Date.now(),
    },
  };

  broadcastToPeers(message);
}

// Add self to participants list
function addSelfToParticipants() {
  state.participants[state.userId] = {
    userId: state.userId,
    username: state.username,
    avatar: state.avatar,
    peerId: state.peerId,
    isCreator: state.isRoomCreator,
    joinTime: Date.now(),
  };

  updateParticipantsList();
}

// Handle incoming data from peers
function handleIncomingData(conn, data) {
  console.log("Received data:", data);

  switch (data.type) {
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
      // Just acknowledge heartbeats silently
      conn.send({
        type: "heartbeat_ack",
        timestamp: data.timestamp,
        received: Date.now(),
      });
      break;
    case "heartbeat_ack":
      // We could calculate latency here if needed
      // const latency = Date.now() - data.timestamp;
      // console.log(`Heartbeat latency to ${conn.peer}: ${latency}ms`);
      break;
    default:
      console.log("Unknown data type:", data.type);
  }
}

// Handle room information received from room creator
function handleRoomInfo(data, conn) {
  // Add received participants to our list
  state.participants = data.participants;

  // Add ourselves to the participant list if not already added
  if (!state.participants[state.userId]) {
    state.participants[state.userId] = {
      userId: state.userId,
      username: state.username,
      avatar: state.avatar,
      peerId: state.peerId,
    };

    // Notify room creator about ourselves
    conn.send({
      type: "new_participant",
      participant: state.participants[state.userId],
    });
  }

  // Update the UI
  updateParticipantsList();

  // Handle active screen share if any
  if (data.screenShareActive && data.screenShareUser) {
    // TODO: Request the active screen share stream
  }
}

// Handle new participant joining the room
function handleNewParticipant(participant) {
  if (participant.userId !== state.userId) {
    // Store the participant info
    state.participants[participant.userId] = participant;

    // Connect to the new peer if we're not already connected
    if (
      !state.connections[participant.peerId] &&
      participant.peerId !== state.peerId
    ) {
      const conn = state.peer.connect(participant.peerId, {
        metadata: {
          userId: state.userId,
          username: state.username,
          avatar: state.avatar,
          joinRequest: false,
        },
      });

      handlePeerConnection(conn);
    }

    // Update the UI
    updateParticipantsList();

    // Display system message
    displaySystemMessage(`${participant.username} joined the room`);
  }
}

// Handle participant leaving the room
function handleParticipantLeft(userId) {
  if (state.participants[userId]) {
    const username = state.participants[userId].username;
    const wasHost = !!state.participants[userId].isCreator;

    // Remove from participants list
    delete state.participants[userId];

    // Update the UI
    updateParticipantsList();

    // Display system message
    displaySystemMessage(`${username} left the room`);

    if (wasHost && Object.keys(state.participants).length > 0) {
      electNewRoomCreator();
    }
  }
}

// Handle peer disconnect
function handlePeerDisconnect(peerId) {
  // Find and remove the participant with this peer ID
  let disconnectedUserId = null;
  let disconnectedUsername = null;
  let wasHost = false;

  for (const userId in state.participants) {
    if (state.participants[userId].peerId === peerId) {
      disconnectedUserId = userId;
      disconnectedUsername = state.participants[userId].username;
      wasHost = !!state.participants[userId].isCreator || peerId === state.roomId;
      break;
    }
  }

  if (disconnectedUserId) {
    // Remove from participants list
    delete state.participants[disconnectedUserId];

    // Update the UI
    updateParticipantsList();

    // Display system message
    displaySystemMessage(`${disconnectedUsername} left the room`);

    // Notify other peers
    broadcastToPeers({
      type: "participant_left",
      userId: disconnectedUserId,
    });
  }

  // Remove from connections
  if (state.connections[peerId]) {
    delete state.connections[peerId];
  }

  // If room host left and remaining participants exist, elect the next host
  if (wasHost && Object.keys(state.participants).length > 0) {
    electNewRoomCreator();
  }
}

// Elect a new room creator if the current host leaves
function electNewRoomCreator() {
  const remainingParticipants = Object.values(state.participants).sort(
    (a, b) => (a.joinTime || 0) - (b.joinTime || 0)
  );

  if (remainingParticipants.length > 0) {
    // Clear isCreator flag on all, then assign to earliest joined remaining participant
    Object.values(state.participants).forEach((p) => (p.isCreator = false));

    const newHost = remainingParticipants[0];
    newHost.isCreator = true;

    if (newHost.userId === state.userId) {
      state.isRoomCreator = true;

      // Re-initialize PeerJS with state.roomId so PeerJS cloud registers state.roomId under this user
      initializePeer(state.roomId);

      showToast("The room host left. You are now the room host!", "info");
      displaySystemMessage("You are now the room host.");

      // Broadcast updated room host info to remaining peers
      broadcastToPeers({
        type: "host_update",
        hostUserId: state.userId,
        participants: state.participants,
      });
    } else {
      showToast(`${newHost.username} is now the room host.`, "info");
      displaySystemMessage(`${newHost.username} is now the room host.`);
    }

    updateParticipantsList();
  }
}

// Handle host update received from new room host
function handleHostUpdate(data) {
  if (data.participants) {
    state.participants = data.participants;
  }
  const host = state.participants[data.hostUserId];
  if (host) {
    displaySystemMessage(`${host.username} is now the room host.`);
  }
  updateParticipantsList();
}

// Display the chat room
function displayRoom() {
  elements.homeScreen.classList.add("hidden");
  elements.chatRoom.classList.remove("hidden");
  elements.currentRoomId.textContent = state.roomId;
}

// Update the participants list in the UI
function updateParticipantsList() {
  elements.participantsList.innerHTML = "";

  Object.values(state.participants).forEach((participant) => {
    const listItem = document.createElement("li");
    listItem.className = "participant-item";

    const avatar = document.createElement("img");
    avatar.className = "participant-avatar";
    avatar.src = participant.avatar;
    avatar.alt = participant.username;

    const nameSpan = document.createElement("span");
    nameSpan.textContent = participant.username;

    if (participant.isCreator) {
      nameSpan.textContent += " (Host)";
    }

    if (participant.userId === state.userId) {
      nameSpan.textContent += " (You)";
    }

    listItem.appendChild(avatar);
    listItem.appendChild(nameSpan);

    elements.participantsList.appendChild(listItem);
  });
}

// Send a chat message
function sendMessage() {
  const messageText = elements.messageInput.value.trim();

  if (!messageText) return;

  const message = {
    userId: state.userId,
    username: state.username,
    avatar: state.avatar,
    text: messageText,
    timestamp: new Date().toISOString(),
  };

  // Display the message locally
  displayMessage(message, true);

  // Clear the input
  elements.messageInput.value = "";

  // Send to all peers
  broadcastToPeers({
    type: "chat_message",
    message: message,
  });
}

// Display a chat message
function displayMessage(message, isOutgoing = false) {
  const messageElement = document.createElement("div");
  messageElement.className = "message";

  if (isOutgoing || message.userId === state.userId) {
    messageElement.classList.add("outgoing");
  }

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
  sender.textContent =
    message.userId === state.userId ? "You" : message.username;

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

// Display a system message
function displaySystemMessage(text) {
  const messageElement = document.createElement("div");
  messageElement.className = "system-message";
  messageElement.textContent = text;

  elements.messagesContainer.appendChild(messageElement);
  scrollToBottom();
}

// Format timestamp to readable time
function formatTime(date) {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// Scroll the messages container to the bottom
function scrollToBottom() {
  elements.messagesContainer.scrollTop =
    elements.messagesContainer.scrollHeight;
}

// Leave the room
function leaveRoom() {
  displayConnectionStatus("disconnected", "Leaving room...");

  // Notify peers that we're leaving
  broadcastToPeers({
    type: "participant_left",
    userId: state.userId,
  });

  // Give a small delay to allow the message to be sent
  setTimeout(() => {
    // Close all connections
    Object.values(state.connections).forEach((conn) => {
      try {
        if (conn && conn.open) {
          conn.close();
        }
      } catch (e) {
        console.error("Error closing connection:", e);
      }
    });

    // Stop screen sharing if active
    if (state.screenShareStream) {
      stopScreenShare();
    }

    // Close PeerJS connection
    if (state.peer) {
      try {
        state.peer.destroy();
      } catch (e) {
        console.error("Error destroying peer:", e);
      }
    }

    // Reset state
    state.peer = null;
    state.peerId = null;
    state.roomId = null;
    state.connections = {};
    state.participants = {};
    state.isRoomCreator = false;
    state.connectionStatus = "disconnected";

    // Return to home screen
    elements.chatRoom.classList.add("hidden");
    elements.homeScreen.classList.remove("hidden");

    // Clear the messages container and participants list
    elements.messagesContainer.innerHTML = "";
    elements.participantsList.innerHTML = "";
  }, 500); // Give 500ms for messages to send
}

// Broadcast a message to all connected peers
function broadcastToPeers(data) {
  Object.values(state.connections).forEach((conn) => {
    if (conn.open) {
      conn.send(data);
    }
  });
}

// Start screen sharing
async function startScreenShare() {
  try {
    // Get screen share stream
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: false,
    });

    // Store the stream
    state.screenShareStream = stream;
    state.screenShareUser = state.username;

    // Show the screen share container
    elements.screenShareContainer.classList.remove("hidden");
    elements.screenShareVideo.srcObject = stream;
    elements.screenShareUser.textContent = "You";
    elements.stopScreenShareBtn.classList.remove("hidden");
    elements.shareScreenBtn.disabled = true;

    // Call all active peer connections to stream the screen
    Object.keys(state.connections).forEach((peerId) => {
      if (state.connections[peerId] && state.connections[peerId].open) {
        callPeerForScreenShare(peerId, stream);
      }
    });

    // Handle stream end (user stops via browser native UI bar)
    stream.getVideoTracks()[0].addEventListener("ended", () => {
      stopScreenShare();
    });

    // Notify all peers via data channel
    broadcastToPeers({
      type: "screen_share_start",
      username: state.username,
      userId: state.userId,
    });
  } catch (err) {
    console.error("Error starting screen share:", err);
    showError("Could not start screen sharing: " + err.message);
  }
}

// Call peer with screen share stream
function callPeerForScreenShare(peerId, stream) {
  try {
    const mediaCall = state.peer.call(peerId, stream, {
      metadata: {
        type: "screen_share",
        userId: state.userId,
        username: state.username,
      },
    });
    if (mediaCall) {
      state.screenShareCalls[peerId] = mediaCall;
    }
  } catch (err) {
    console.error(`Error calling ${peerId} for screen share:`, err);
  }
}

// Handle screen share start notification from another user
function handleScreenShareStart(data) {
  // Update UI metadata
  elements.screenShareContainer.classList.remove("hidden");
  elements.screenShareUser.textContent = data.username;
  elements.shareScreenBtn.disabled = true;
  elements.stopScreenShareBtn.classList.add("hidden");
  displaySystemMessage(`${data.username} is sharing their screen`);
}

// Stop screen sharing
function stopScreenShare() {
  if (state.screenShareStream) {
    // Stop all tracks
    state.screenShareStream.getTracks().forEach((track) => track.stop());

    // Reset state
    state.screenShareStream = null;
    state.screenShareUser = null;

    // Close media calls
    Object.values(state.screenShareCalls).forEach((call) => {
      try {
        call.close();
      } catch (e) {
        console.error("Error closing screen share call:", e);
      }
    });
    state.screenShareCalls = {};

    // Update UI
    elements.screenShareContainer.classList.add("hidden");
    elements.screenShareVideo.srcObject = null;
    elements.stopScreenShareBtn.classList.add("hidden");
    elements.shareScreenBtn.disabled = false;

    // Notify peers
    broadcastToPeers({
      type: "screen_share_stop",
      userId: state.userId,
    });
  }
}

// Handle screen share stop from another user
function handleScreenShareStop() {
  elements.screenShareContainer.classList.add("hidden");
  if (elements.screenShareVideo.srcObject) {
    const tracks = elements.screenShareVideo.srcObject.getTracks();
    tracks.forEach((track) => track.stop());
    elements.screenShareVideo.srcObject = null;
  }
  elements.shareScreenBtn.disabled = false;
}

// Copy room ID to clipboard
function copyRoomIdToClipboard() {
  navigator.clipboard
    .writeText(state.roomId)
    .then(() => {
      showToast("Room ID copied to clipboard!", "success");
    })
    .catch((err) => {
      console.error("Could not copy room ID:", err);

      // Fallback for browsers that don't support clipboard API
      const textArea = document.createElement("textarea");
      textArea.value = state.roomId;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand("copy");
      document.body.removeChild(textArea);

      showToast("Room ID copied to clipboard!", "success");
    });
}

// Display connection status
function displayConnectionStatus(status, details = "") {
  state.connectionStatus = status;

  let statusMessage = "";

  switch (status) {
    case "connecting":
      statusMessage = `Connecting to room ${state.roomId}...`;
      break;
    case "connected":
      statusMessage = `Connected to room ${state.roomId}`;
      break;
    case "disconnected":
      statusMessage = "Disconnected from room";
      break;
    case "error":
      statusMessage = `Connection error: ${details}`;
      break;
    default:
      statusMessage = status;
  }

  displaySystemMessage(statusMessage);

  // Also log to console for debugging
  console.log(`Connection status: ${status}`, details ? `- ${details}` : "");
}

// Retry connecting to room
function retryConnection() {
  // Only allow retry if we're not already connected
  if (state.connectionStatus !== "connected") {
    displayConnectionStatus("connecting", "Retrying connection...");

    // Clean up any existing peer connection
    if (state.peer) {
      // Close any existing connections first
      Object.values(state.connections).forEach((conn) => {
        if (conn && conn.open) {
          try {
            conn.close();
          } catch (e) {
            console.error("Error closing connection during retry:", e);
          }
        }
      });

      // Clear connections object
      state.connections = {};

      try {
        state.peer.destroy();
      } catch (e) {
        console.error("Error destroying peer during retry:", e);
      }
      state.peer = null;
    }

    // Reinitialize the peer connection with a new ID
    displaySystemMessage("Attempting to reconnect...");

    // Small delay before recreating the peer to ensure clean state
    setTimeout(() => {
      if (state.isRoomCreator) {
        // If room creator, use the same room ID for consistent room access
        initializePeer(state.roomId);
      } else {
        // If joining, generate a new random peer ID
        initializePeer();

        // Small delay to allow peer to initialize before connecting
        setTimeout(() => {
          if (state.peer && state.peer.open) {
            connectToPeer(state.roomId);
          } else {
            // If peer isn't open after waiting, show error
            displayConnectionStatus(
              "error",
              "Could not establish connection to PeerJS server"
            );
            displaySystemMessage(
              "Please try again or check your internet connection"
            );
          }
        }, 2000);
      }
    }, 1000);
  }
}

// Add a Reset Room function for when connections fail
function resetRoom() {
  // Close connections and reset state
  if (state.peer) {
    state.peer.destroy();
  }

  // Reset state
  state.peer = null;
  state.peerId = null;
  state.connections = {};
  state.participants = {};
  state.isRoomCreator = false;
  state.connectionStatus = "disconnected";

  // Return to home screen
  elements.chatRoom.classList.add("hidden");
  elements.homeScreen.classList.remove("hidden");

  // Clear the messages container
  elements.messagesContainer.innerHTML = "";
  elements.participantsList.innerHTML = "";
}

// Add function to refresh avatars with new options
function refreshAvatars() {
  // Call generateAvatarOptions with "refresh" parameter to generate new random seeds
  window.generateAvatarOptions("refresh");

  // Remove any selected avatar since we're refreshing
  elements.avatars.forEach((a) => a.classList.remove("selected"));
  state.selectedAvatar = null;

  // Clear any custom avatar
  elements.customAvatarUrlInput.value = "";
  elements.customAvatarUrlInput.style.borderColor = "";

  // Display a message about the refresh
  displaySystemMessage("Avatar options refreshed");
}

// Add function to use custom avatar URL
function useCustomAvatar() {
  const customUrl = elements.customAvatarUrlInput.value.trim();

  if (!customUrl) {
    showError("Please enter a valid avatar URL");
    return Promise.resolve(false);
  }

  // Validate URL protocol for security
  if (!customUrl.startsWith("http://") && !customUrl.startsWith("https://")) {
    showError("Custom avatar URL must start with http:// or https://");
    return Promise.resolve(false);
  }

  return new Promise((resolve) => {
    // Create a temporary image to test if the URL is valid
    const testImg = new Image();
    testImg.onload = function () {
      // URL is valid, create a custom avatar element
      elements.avatars.forEach((a) => a.classList.remove("selected"));

      // Store the custom URL as the selected avatar
      state.selectedAvatar = customUrl;
      try {
        localStorage.setItem("echorooms_avatar", customUrl);
      } catch (e) {}

      // Visually indicate custom avatar is selected
      displaySystemMessage("Custom avatar selected");
      elements.customAvatarUrlInput.style.borderColor = "var(--primary-color)";
      setTimeout(() => {
        elements.customAvatarUrlInput.style.borderColor = "";
      }, 2000);
      resolve(true);
    };

    testImg.onerror = function () {
      showError("Invalid image URL. Please provide a valid image URL.");
      resolve(false);
    };

    // Start loading the image to test
    testImg.src = customUrl;
  });
}

// Initialize the app when the DOM is loaded
document.addEventListener("DOMContentLoaded", init);
