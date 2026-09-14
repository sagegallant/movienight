/**
 * MovieNight — WebRTC Configuration & TURN Fallback (P5)
 *
 * Direct P2P remains the preferred primary mode.
 * TURN relay servers serve as reliability escape hatches for restrictive NAT/firewalls.
 */

const DEFAULT_STUN_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:global.stun.twilio.com:3478" },
];

const STORAGE_KEY_TURN = "movienight_custom_turn";

/**
 * Validate and parse a TURN server configuration.
 * @param {object} config - { url, username, credential }
 * @returns {object|null}
 */
function validateTurnConfig(config) {
  if (!config || typeof config !== "object") return null;
  const url = (config.url || "").trim();
  if (!url) return null;

  // Must use turn: or turns: scheme
  if (!/^turns?:/i.test(url)) return null;

  const entry = { urls: url };
  if (config.username) entry.username = String(config.username).trim();
  if (config.credential) entry.credential = String(config.credential).trim();

  return entry;
}

/**
 * Retrieve user-configured TURN server from localStorage (if in browser).
 * @returns {object|null}
 */
function getStoredTurnConfig() {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY_TURN);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return validateTurnConfig(parsed);
  } catch (e) {
    console.warn("Failed to load stored TURN config:", e);
    return null;
  }
}

/**
 * Save custom TURN server configuration to localStorage.
 * @param {object} config - { url, username, credential }
 * @returns {boolean}
 */
function saveStoredTurnConfig(config) {
  if (typeof localStorage === "undefined") return false;
  const valid = validateTurnConfig(config);
  if (!valid) return false;
  try {
    localStorage.setItem(STORAGE_KEY_TURN, JSON.stringify(config));
    return true;
  } catch (e) {
    console.warn("Failed to save TURN config to localStorage:", e);
    return false;
  }
}

/**
 * Clear custom TURN server configuration from localStorage.
 */
function clearStoredTurnConfig() {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.removeItem(STORAGE_KEY_TURN);
  } catch (e) {}
}

/**
 * Build complete list of ICE servers (STUN + optional TURN fallback).
 * @param {object} [customTurn] - Optional direct turn server object
 * @returns {Array<object>}
 */
function getIceServers(customTurn = null) {
  const servers = [...DEFAULT_STUN_SERVERS];

  // 1. Explicit argument
  const validatedArg = validateTurnConfig(customTurn);
  if (validatedArg) {
    servers.push(validatedArg);
    return servers;
  }

  // 2. Global window configuration if present
  if (typeof window !== "undefined" && window.MOVIENIGHT_CONFIG?.turnServer) {
    const fromWindow = validateTurnConfig(window.MOVIENIGHT_CONFIG.turnServer);
    if (fromWindow) {
      servers.push(fromWindow);
      return servers;
    }
  }

  // 3. Stored in localStorage
  const fromStorage = getStoredTurnConfig();
  if (fromStorage) {
    servers.push(fromStorage);
    return servers;
  }

  return servers;
}

/**
 * Check if a TURN relay fallback server is currently configured.
 * @returns {boolean}
 */
function hasTurnServerConfigured() {
  const servers = getIceServers();
  return servers.some((s) => {
    const urls = Array.isArray(s.urls) ? s.urls : [s.urls];
    return urls.some((u) => /^turns?:/i.test(u));
  });
}

/**
 * Build PeerJS constructor options.
 * @param {object} [options] - Additional PeerJS options
 * @returns {object}
 */
function buildPeerOptions(options = {}) {
  const iceServers = getIceServers(options.customTurn);
  return {
    config: {
      iceServers,
      iceTransportPolicy: "all", // Prefer direct P2P, allow relay fallback
    },
    debug: typeof options.debug === "number" ? options.debug : 1,
    ...options,
  };
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    DEFAULT_STUN_SERVERS,
    STORAGE_KEY_TURN,
    validateTurnConfig,
    getStoredTurnConfig,
    saveStoredTurnConfig,
    clearStoredTurnConfig,
    getIceServers,
    hasTurnServerConfigured,
    buildPeerOptions,
  };
}

if (typeof window !== "undefined") {
  window.MovieNightConfig = {
    DEFAULT_STUN_SERVERS,
    STORAGE_KEY_TURN,
    validateTurnConfig,
    getStoredTurnConfig,
    saveStoredTurnConfig,
    clearStoredTurnConfig,
    getIceServers,
    hasTurnServerConfigured,
    buildPeerOptions,
  };
}
