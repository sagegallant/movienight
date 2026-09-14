/**
 * MovieNight — Diagnostics & Network UI (P18, P19)
 *
 * Renders:
 * - Live Network Quality indicator (Excellent / Good / Degraded / Poor)
 * - Room Capacity / Seats counter (e.g. "Seats: 3/6")
 * - Detailed Diagnostics HUD modal
 * - TURN Relay Settings configuration modal
 */

class DiagnosticsUi {
  constructor() {
    this.badgeEl = null;
    this.seatsEl = null;
    this.hudModal = null;
    this.settingsModal = null;
    this.currentStats = new Map();
  }

  /**
   * Initialize UI elements and inject HUD/Settings modals if needed.
   */
  init() {
    this.badgeEl = document.getElementById("network-quality-badge");
    this.seatsEl = document.getElementById("room-seats-badge");
    this.setupModals();
    this.bindEvents();
    this.updateSeats(1, 6);
  }

  /**
   * Update the room seats indicator badge.
   * @param {number} currentCount
   * @param {number} maxLimit
   */
  updateSeats(currentCount, maxLimit = 6) {
    if (!this.seatsEl) {
      this.seatsEl = document.getElementById("room-seats-badge");
    }
    if (this.seatsEl) {
      this.seatsEl.textContent = `Seats: ${currentCount}/${maxLimit}`;
      if (currentCount >= maxLimit) {
        this.seatsEl.classList.add("full");
      } else {
        this.seatsEl.classList.remove("full");
      }
    }
  }

  /**
   * Update the live network quality badge based on getStats() results.
   * @param {Map<string, object>} statsMap
   */
  updateQuality(statsMap) {
    this.currentStats = statsMap;
    if (!this.badgeEl) {
      this.badgeEl = document.getElementById("network-quality-badge");
    }
    if (!this.badgeEl || statsMap.size === 0) return;

    // Determine worst quality across active connections
    const qualities = ["excellent", "good", "degraded", "poor"];
    let worstIndex = 0;
    let avgRtt = 0;
    let hasRelay = false;

    statsMap.forEach((s) => {
      const idx = qualities.indexOf(s.quality);
      if (idx > worstIndex) worstIndex = idx;
      avgRtt += s.rtt;
      if (s.isRelayed) hasRelay = true;
    });

    avgRtt = Math.round(avgRtt / statsMap.size);
    const overallQuality = qualities[worstIndex];

    const labels = {
      excellent: "🟢 Excellent",
      good: "🟢 Good",
      degraded: "🟡 Degraded",
      poor: "🔴 Poor",
    };

    const text = `${labels[overallQuality]} (${avgRtt}ms${hasRelay ? " · Relay" : " · P2P"})`;
    this.badgeEl.textContent = text;
    this.badgeEl.className = `quality-badge quality-${overallQuality}`;
    this.badgeEl.title = "Click to inspect WebRTC connection telemetry";

    this.renderHudContent();
  }

  /**
   * Build HUD modal and TURN Settings modal dynamically if not already in DOM.
   */
  setupModals() {
    if (document.getElementById("diagnostics-modal")) return;

    const modalHtml = `
      <!-- WebRTC Diagnostics HUD Modal -->
      <div id="diagnostics-modal" class="modal-overlay hidden">
        <div class="modal-card diagnostics-card">
          <div class="modal-header-row">
            <h3 class="modal-title"><i class="fas fa-satellite-dish"></i> WebRTC Diagnostics</h3>
            <button id="close-diagnostics-btn" class="modal-close-icon">&times;</button>
          </div>
          <div id="diagnostics-content" class="diagnostics-body">
            <p class="text-muted">No active peer connections yet.</p>
          </div>
          <div class="modal-actions-row">
            <button id="open-turn-settings-btn" class="btn ghost small">
              <i class="fas fa-cog"></i> TURN / Relay Settings
            </button>
            <button id="dismiss-diagnostics-btn" class="btn primary small">Close</button>
          </div>
        </div>
      </div>

      <!-- Network / TURN Settings Modal -->
      <div id="turn-settings-modal" class="modal-overlay hidden">
        <div class="modal-card turn-settings-card">
          <div class="modal-header-row">
            <h3 class="modal-title"><i class="fas fa-shield-alt"></i> Network & TURN Settings</h3>
            <button id="close-turn-settings-btn" class="modal-close-icon">&times;</button>
          </div>
          <p class="modal-desc">
            Direct P2P is enabled by default. If you are behind a restrictive corporate or school firewall,
            configure a custom TURN relay server below.
          </p>
          <div class="field-group">
            <label class="field-label" for="turn-url-input">TURN SERVER URL</label>
            <input id="turn-url-input" class="form-input" placeholder="turn:relay.example.com:3478 or turns:..." autocomplete="off">
          </div>
          <div class="field-group">
            <label class="field-label" for="turn-username-input">USERNAME (OPTIONAL)</label>
            <input id="turn-username-input" class="form-input" placeholder="turn_username" autocomplete="off">
          </div>
          <div class="field-group">
            <label class="field-label" for="turn-credential-input">CREDENTIAL / PASSWORD (OPTIONAL)</label>
            <input id="turn-credential-input" type="password" class="form-input" placeholder="••••••••" autocomplete="off">
          </div>
          <div class="turn-status-row" id="turn-status-text"></div>
          <div class="modal-actions-row">
            <button id="clear-turn-btn" class="btn danger small">Clear</button>
            <button id="save-turn-btn" class="btn primary small">Save & Apply</button>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML("beforeend", modalHtml);
  }

  /**
   * Bind modal triggers and input actions.
   */
  bindEvents() {
    // Quality badge clicks open HUD
    const badge = document.getElementById("network-quality-badge");
    if (badge) {
      badge.addEventListener("click", () => this.showHud());
    }

    // Diagnostics modal close
    const diagModal = document.getElementById("diagnostics-modal");
    const closeDiag = document.getElementById("close-diagnostics-btn");
    const dismissDiag = document.getElementById("dismiss-diagnostics-btn");
    const openTurn = document.getElementById("open-turn-settings-btn");

    if (closeDiag) closeDiag.onclick = () => diagModal?.classList.add("hidden");
    if (dismissDiag) dismissDiag.onclick = () => diagModal?.classList.add("hidden");
    if (openTurn) {
      openTurn.onclick = () => {
        diagModal?.classList.add("hidden");
        this.showTurnSettings();
      };
    }

    // TURN Settings modal
    const turnModal = document.getElementById("turn-settings-modal");
    const closeTurn = document.getElementById("close-turn-settings-btn");
    const saveTurn = document.getElementById("save-turn-btn");
    const clearTurn = document.getElementById("clear-turn-btn");

    if (closeTurn) closeTurn.onclick = () => turnModal?.classList.add("hidden");
    if (saveTurn) saveTurn.onclick = () => this.handleSaveTurn();
    if (clearTurn) clearTurn.onclick = () => this.handleClearTurn();
  }

  showHud() {
    const modal = document.getElementById("diagnostics-modal");
    if (modal) {
      this.renderHudContent();
      modal.classList.remove("hidden");
    }
  }

  renderHudContent() {
    const container = document.getElementById("diagnostics-content");
    if (!container) return;

    if (this.currentStats.size === 0) {
      container.innerHTML = `<p class="text-muted" style="padding:15px;text-align:center;">Waiting for WebRTC peer connection telemetry...</p>`;
      return;
    }

    let html = `<div class="stats-peer-list">`;
    this.currentStats.forEach((s, peerId) => {
      const modeLabel = s.isRelayed ? "TURN Relay" : "Direct P2P";
      html += `
        <div class="stats-peer-card">
          <div class="stats-peer-header">
            <span class="stats-peer-id">Peer: <code>${peerId.slice(0, 8)}...</code></span>
            <span class="quality-badge quality-${s.quality}">${s.quality.toUpperCase()}</span>
          </div>
          <div class="stats-grid">
            <div class="stat-item"><span class="stat-label">RTT:</span> <span class="stat-val">${s.rtt} ms</span></div>
            <div class="stat-item"><span class="stat-label">Loss:</span> <span class="stat-val">${s.lossPct}%</span></div>
            <div class="stat-item"><span class="stat-label">Jitter:</span> <span class="stat-val">${s.jitter} ms</span></div>
            <div class="stat-item"><span class="stat-label">Type:</span> <span class="stat-val">${modeLabel}</span></div>
            <div class="stat-item"><span class="stat-label">Out Bitrate:</span> <span class="stat-val">${s.outBitrateKbps} kbps</span></div>
            <div class="stat-item"><span class="stat-label">In Bitrate:</span> <span class="stat-val">${s.inBitrateKbps} kbps</span></div>
          </div>
        </div>
      `;
    });
    html += `</div>`;
    container.innerHTML = html;
  }

  showTurnSettings() {
    const modal = document.getElementById("turn-settings-modal");
    if (!modal) return;

    const urlInput = document.getElementById("turn-url-input");
    const userInput = document.getElementById("turn-username-input");
    const credInput = document.getElementById("turn-credential-input");
    const statusText = document.getElementById("turn-status-text");

    const currentConfig = window.MovieNightConfig?.getStoredTurnConfig();
    if (urlInput) urlInput.value = currentConfig?.urls || "";
    if (userInput) userInput.value = currentConfig?.username || "";
    if (credInput) credInput.value = currentConfig?.credential || "";

    if (statusText) {
      statusText.textContent = currentConfig
        ? "Active custom TURN server configured"
        : "Using default STUN (Direct P2P)";
    }

    modal.classList.remove("hidden");
  }

  handleSaveTurn() {
    const urlInput = document.getElementById("turn-url-input");
    const userInput = document.getElementById("turn-username-input");
    const credInput = document.getElementById("turn-credential-input");
    const statusText = document.getElementById("turn-status-text");

    const url = urlInput?.value.trim();
    if (!url) {
      alert("Please provide a valid TURN server URL (e.g., turn:host:3478)");
      return;
    }

    const ok = window.MovieNightConfig?.saveStoredTurnConfig({
      url,
      username: userInput?.value.trim(),
      credential: credInput?.value.trim(),
    });

    if (ok) {
      if (statusText) statusText.textContent = "TURN configuration saved! Reconnect to apply.";
      setTimeout(() => {
        document.getElementById("turn-settings-modal")?.classList.add("hidden");
      }, 1000);
    } else {
      alert("Invalid TURN URL format. Must begin with 'turn:' or 'turns:'.");
    }
  }

  handleClearTurn() {
    window.MovieNightConfig?.clearStoredTurnConfig();
    const urlInput = document.getElementById("turn-url-input");
    const userInput = document.getElementById("turn-username-input");
    const credInput = document.getElementById("turn-credential-input");
    const statusText = document.getElementById("turn-status-text");

    if (urlInput) urlInput.value = "";
    if (userInput) userInput.value = "";
    if (credInput) credInput.value = "";
    if (statusText) statusText.textContent = "Custom TURN cleared. Default STUN active.";
  }
}

if (typeof window !== "undefined") {
  window.DiagnosticsUi = DiagnosticsUi;
}
