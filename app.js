const DOM = {
  messageInput: document.getElementById('messageInput'),
  sendBtn: document.getElementById('sendBtn'),
  simpleEmail: document.getElementById('simpleEmail'),
  simpleShareStatus: document.getElementById('simpleShareStatus'),
  inviteLink: document.getElementById('inviteLink'),
  copyInviteBtn: document.getElementById('copyInviteBtn'),
  activeInvite: document.getElementById('activeInvite'),
  inviteCountdown: document.getElementById('inviteCountdown'),
  inviteStatusDot: document.getElementById('inviteStatusDot'),
  shareInviteBtn: document.getElementById('shareInviteBtn'),
  cancelInviteBtn: document.getElementById('cancelInviteBtn'),
  generateInviteBtn: document.getElementById('generateInviteBtn'),
  inviteSeatsGrid: document.getElementById('inviteSeatsGrid'),
  inviteSeatsInfo: document.getElementById('inviteSeatsInfo'),
  inviteSection: document.getElementById('inviteSection'),
  joinStatus: document.getElementById('joinStatus'),
  joinStatusDetail: document.getElementById('joinStatusDetail'),
  waitingBanner: document.getElementById('waitingBanner'),
  chatShareLink: document.getElementById('chatShareLink'),
  waitingMessage: document.getElementById('waitingMessage'),
  chatCopyLink: document.getElementById('chatCopyLink'),
  roomCode: document.getElementById('roomCode'),
  shareSection: document.getElementById('shareSection'),
  welcomeScreen: document.getElementById('welcomeScreen'),
  hostScreen: document.getElementById('hostScreen'),
  joinScreen: document.getElementById('joinScreen'),
  chatScreen: document.getElementById('chatScreen'),
  currentRoom: document.getElementById('currentRoom'),
  roomHistory: document.getElementById('roomHistory'),
  historyItems: document.getElementById('historyItems'),
  fingerprintDisplay: document.getElementById('fingerprintDisplay'),
  fingerprintCode: document.getElementById('fingerprintCode'),
  statusText: document.getElementById('statusText'),
  statusDot: document.getElementById('statusDot'),
  chatMessages: document.getElementById('chatMessages'),
  networkStatus: document.getElementById('networkStatus'),
  encryptedToggle: document.getElementById('encryptedToggle'),
  schemaToggle: document.getElementById('schemaToggle'),
  systemAnnouncements: document.getElementById('systemAnnouncements'),
  memberSidebar: document.getElementById('memberSidebar'),
  identityModal: document.getElementById('identityModal'),
  identityCreateForm: document.getElementById('identityCreateForm'),
  identitySuggestions: document.getElementById('identitySuggestions'),
  identityNameInput: document.getElementById('identityNameInput'),
  identityRefreshBtn: document.getElementById('identityRefreshBtn'),
  identityPasswordInput: document.getElementById('identityPasswordInput'),
  identityStrengthBar: document.getElementById('identityStrengthBar'),
  identityStrengthText: document.getElementById('identityStrengthText'),
  identityModeCreate: document.getElementById('identityModeCreate'),
  identityModeReturning: document.getElementById('identityModeReturning'),
  identityReturningForm: document.getElementById('identityReturningForm'),
  identityReturningPassword: document.getElementById('identityReturningPassword'),
  identityModalTitle: document.getElementById('identityModalTitle'),
  identityModalSubtitle: document.getElementById('identityModalSubtitle'),
  identityHint: document.getElementById('identityHint'),
  identityUseNew: document.getElementById('identityUseNew'),
  identityError: document.getElementById('identityError'),
  identitySubmitBtn: document.getElementById('identitySubmitBtn')
};

const DEFAULT_FEATURE_FLAGS = {
  showEncryptedView: true,
  enableECDH: true
};

const FEATURE_FLAGS = (() => {
  if (typeof window === 'undefined') {
    return { ...DEFAULT_FEATURE_FLAGS };
  }
  const existing = window.FEATURE_FLAGS && typeof window.FEATURE_FLAGS === 'object'
    ? window.FEATURE_FLAGS
    : {};
  const merged = { ...DEFAULT_FEATURE_FLAGS, ...existing };
  window.FEATURE_FLAGS = merged;
  return merged;
})();

const CONFIG = {
  reorderBadgeFadeDelay: 5000,
  reorderGlowDuration: 2000,
  messageInsertAnimation: 400,
  batchWaitTime: 200,
  maxBatchSize: 10,
  showHopCount: true,
  showRoutePath: true,
  autoScrollThreshold: 100,
  enableVirtualScroll: false,
  maxVisibleMessages: 100
};

function escapeHTML(value) {
  if (typeof value !== 'string') {
    return '';
  }
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

class MessageDetailsModal {
  constructor(getMessage) {
    this.getMessage = typeof getMessage === 'function' ? getMessage : () => null;
    this.activeModal = null;
  }

  show(messageId) {
    const message = this.getMessage(messageId);
    if (!message || typeof document === 'undefined') {
      return;
    }

    this.close();

    const hopCount = Number.isFinite(message.hops) ? Math.max(0, message.hops) : 0;
    const routePath = Array.isArray(message.routePath) && message.routePath.length > 0
      ? message.routePath
      : [message.type === 'me' ? 'You' : 'Peer'];
    const arrivalTime = typeof message.arrivalTime === 'number' ? message.arrivalTime : message.receivedAt;
    const sentTime = typeof message.sentAt === 'number' ? message.sentAt : message.displayAt;
    const delay = typeof arrivalTime === 'number' && typeof sentTime === 'number'
      ? Math.max(0, arrivalTime - sentTime)
      : 0;
    const latencyEstimate = Math.max(hopCount || routePath.length || 1, 1) * 45;

    const modal = document.createElement('div');
    modal.className = 'message-details-modal';

    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.addEventListener('click', () => this.close());

    const content = document.createElement('div');
    content.className = 'modal-content';

    const title = document.createElement('h3');
    title.innerHTML = '📡 Message Journey';

    content.appendChild(title);

    if (CONFIG.showRoutePath) {
      const routeSection = document.createElement('div');
      routeSection.className = 'detail-section';

      const label = document.createElement('label');
      label.textContent = 'Route taken:';
      routeSection.appendChild(label);

      const path = document.createElement('div');
      path.className = 'route-path';

      routePath.forEach((device, index) => {
        const node = document.createElement('div');
        node.className = 'route-node';

        const icon = document.createElement('span');
        icon.className = 'node-icon';
        icon.textContent = index === 0 ? '📱' : '📡';

        const name = document.createElement('span');
        name.className = 'node-name';
        name.textContent = device;

        node.appendChild(icon);
        node.appendChild(name);
        path.appendChild(node);

        if (index < routePath.length - 1) {
          const arrow = document.createElement('span');
          arrow.className = 'route-arrow';
          arrow.textContent = '→';
          path.appendChild(arrow);
        }
      });

      routeSection.appendChild(path);
      content.appendChild(routeSection);
    }

    const timingSection = document.createElement('div');
    timingSection.className = 'detail-section';

    const timingLabel = document.createElement('label');
    timingLabel.textContent = 'Timing:';
    timingSection.appendChild(timingLabel);

    const timingInfo = document.createElement('div');
    timingInfo.className = 'timing-info';

    const sentLine = document.createElement('div');
    sentLine.textContent = `Sent: ${this.formatTime(sentTime)}`;
    const arrivalLine = document.createElement('div');
    arrivalLine.textContent = `Arrived: ${this.formatTime(arrivalTime)}`;
    const delayLine = document.createElement('div');
    delayLine.textContent = `Delay: ${this.formatDelay(delay)}`;

    timingInfo.appendChild(sentLine);
    timingInfo.appendChild(arrivalLine);
    timingInfo.appendChild(delayLine);
    timingSection.appendChild(timingInfo);
    content.appendChild(timingSection);

    const statsSection = document.createElement('div');
    statsSection.className = 'detail-section';

    const statsLabel = document.createElement('label');
    statsLabel.textContent = 'Network stats:';
    statsSection.appendChild(statsLabel);

    const stats = document.createElement('div');
    stats.className = 'network-stats';

    const hopsStat = document.createElement('span');
    hopsStat.className = 'stat';
    hopsStat.textContent = `🔄 ${hopCount || routePath.length || 1} hops`;

    const stateStat = document.createElement('span');
    stateStat.className = 'stat';
    stateStat.textContent = `📊 ${message.state || 'settled'}`;

    const latencyStat = document.createElement('span');
    latencyStat.className = 'stat';
    latencyStat.textContent = `⚡ ${latencyEstimate}ms latency`;

    stats.appendChild(hopsStat);
    stats.appendChild(stateStat);
    stats.appendChild(latencyStat);

    if (message.vectorClock && typeof message.vectorClock === 'object') {
      const vectorEntries = Object.entries(message.vectorClock);
      if (vectorEntries.length > 0) {
        const clockStat = document.createElement('span');
        clockStat.className = 'stat';
        const clockSegments = vectorEntries
          .map(([actor, value]) => `${escapeHTML(actor)}:${value}`)
          .join(' • ');
        clockStat.textContent = `🧭 ${clockSegments}`;
        stats.appendChild(clockStat);
      }
    }

    statsSection.appendChild(stats);
    content.appendChild(statsSection);

    const closeBtn = document.createElement('button');
    closeBtn.className = 'modal-close';
    closeBtn.type = 'button';
    closeBtn.textContent = 'Done';
    closeBtn.addEventListener('click', () => this.close());
    content.appendChild(closeBtn);

    modal.appendChild(backdrop);
    modal.appendChild(content);

    document.body.appendChild(modal);

    requestAnimationFrame(() => {
      modal.classList.add('show');
    });

    this.activeModal = modal;
  }

  close() {
    if (!this.activeModal) {
      return;
    }

    const modal = this.activeModal;
    modal.classList.remove('show');
    setTimeout(() => {
      if (modal.parentElement) {
        modal.parentElement.removeChild(modal);
      }
    }, 200);
    this.activeModal = null;
  }

  formatTime(value) {
    if (!Number.isFinite(value)) {
      return 'Unknown';
    }
    return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  formatDelay(value) {
    if (!Number.isFinite(value)) {
      return '—';
    }
    if (value < 1000) {
      return `${value}ms`;
    }
    const seconds = value / 1000;
    if (seconds < 60) {
      return `${seconds.toFixed(1)}s`;
    }
    const minutes = Math.floor(seconds / 60);
    const remaining = seconds % 60;
    return remaining > 0 ? `${minutes}m ${remaining.toFixed(1)}s` : `${minutes}m`;
  }
}

class NetworkStatusBar {
  constructor(element) {
    this.element = element || null;
    this.stats = {
      peers: 0,
      pendingMessages: 0,
      averageHops: 0
    };
  }

  setPeers(count) {
    const normalized = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
    if (this.stats.peers !== normalized) {
      this.stats.peers = normalized;
      this.render();
    }
  }

  setPendingMessages(count) {
    const normalized = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
    if (this.stats.pendingMessages !== normalized) {
      this.stats.pendingMessages = normalized;
      this.render();
    }
  }

  setAverageHops(value) {
    const normalized = Number.isFinite(value) ? Math.max(0, value) : 0;
    if (Math.abs(this.stats.averageHops - normalized) > 0.05) {
      this.stats.averageHops = normalized;
      this.render();
      return;
    }
    if (normalized === 0 && this.stats.averageHops !== 0) {
      this.stats.averageHops = 0;
      this.render();
    }
  }

  getStatusClass() {
    if (this.stats.peers <= 0) {
      return 'offline';
    }
    if (this.stats.pendingMessages > 0) {
      return 'degraded';
    }
    return 'online';
  }

  render() {
    if (!this.element) {
      return;
    }

    const peersLabel = `${this.stats.peers} ${this.stats.peers === 1 ? 'peer' : 'peers'}`;
    const metrics = [];
    if (this.stats.averageHops > 0) {
      metrics.push(`<span class="average-hops">${this.stats.averageHops.toFixed(1)} avg hops</span>`);
    }
    if (this.stats.pendingMessages > 0) {
      metrics.push(`
        <div class="reorder-indicator">
          <span class="reorder-icon">🔄</span>
          <span>${this.stats.pendingMessages} settling...</span>
        </div>
      `);
    }

    this.element.innerHTML = `
      <div class="network-status-mini">
        <div class="connection-state">
          <span class="status-dot ${this.getStatusClass()}"></span>
          <span>${peersLabel}</span>
        </div>
        <div class="network-metrics">
          ${metrics.join(' ')}
        </div>
      </div>
    `;
  }
}

class MessageTimeline {
  constructor(container, config = CONFIG) {
    this.messagesContainer = container || null;
    this.config = config;
  }

  setContainer(container) {
    this.messagesContainer = container;
  }

  isNearBottom() {
    const container = this.messagesContainer;
    if (!container) {
      return true;
    }
    const threshold = Number.isFinite(this.config?.autoScrollThreshold)
      ? this.config.autoScrollThreshold
      : 100;
    const { scrollTop, scrollHeight, clientHeight } = container;
    return scrollHeight - scrollTop - clientHeight < threshold;
  }

  enrichMessages(messages) {
    if (!Array.isArray(messages)) {
      return [];
    }

    const entries = messages.map((msg, index) => {
      const displayAt = typeof msg.displayAt === 'number' ? msg.displayAt : msg.at;
      const arrivalTime = typeof msg.arrivalTime === 'number'
        ? msg.arrivalTime
        : (typeof msg.receivedAt === 'number' ? msg.receivedAt : displayAt);
      const messageText = typeof msg.text === 'string'
        ? msg.text
        : (typeof msg.content === 'string' ? msg.content : '');
      return {
        id: msg.id,
        text: messageText,
        type: msg.type === 'me' ? 'me' : 'them',
        at: msg.at,
        displayAt,
        receivedAt: typeof msg.receivedAt === 'number' ? msg.receivedAt : displayAt,
        sentAt: typeof msg.sentAt === 'number' ? msg.sentAt : msg.at,
        sentAtLocal: typeof msg.sentAtLocal === 'number' ? msg.sentAtLocal : msg.sentAt,
        localOrder: msg.localOrder || 0,
        hops: Number.isFinite(msg.hops) ? msg.hops : 1,
        routePath: Array.isArray(msg.routePath) ? [...msg.routePath] : [],
        arrivalTime,
        state: msg.state || (msg.type === 'me' ? 'settled' : 'settled'),
        vectorClock: msg.vectorClock && typeof msg.vectorClock === 'object' ? { ...msg.vectorClock } : {},
        arrivalIndex: Number.isFinite(msg.arrivalIndex) ? msg.arrivalIndex : index,
        originalPosition: Number.isFinite(msg.originalPosition) ? msg.originalPosition : null,
        isOutOfOrder: Boolean(msg.isOutOfOrder),
        sequence: Number.isFinite(msg.sequence) ? msg.sequence : null,
        editedAt: Number.isFinite(msg.editedAt) ? msg.editedAt : null
      };
    });

    const arrivalOrder = [...entries].sort((a, b) => {
      const timeA = Number.isFinite(a.arrivalTime) ? a.arrivalTime : a.receivedAt || 0;
      const timeB = Number.isFinite(b.arrivalTime) ? b.arrivalTime : b.receivedAt || 0;
      if (timeA !== timeB) {
        return timeA - timeB;
      }
      return (a.arrivalIndex ?? 0) - (b.arrivalIndex ?? 0);
    });

    arrivalOrder.forEach((entry, idx) => {
      entry.arrivalOrderIndex = idx;
    });

    const temporalOrder = [...entries].sort((a, b) => {
      const timeA = Number.isFinite(a.displayAt) ? a.displayAt : a.at || 0;
      const timeB = Number.isFinite(b.displayAt) ? b.displayAt : b.at || 0;
      if (timeA !== timeB) {
        return timeA - timeB;
      }
      const sentDiff = (a.sentAt ?? timeA) - (b.sentAt ?? timeB);
      if (sentDiff !== 0) {
        return sentDiff;
      }
      return (a.localOrder ?? 0) - (b.localOrder ?? 0);
    });

    temporalOrder.forEach((entry, idx) => {
      entry.temporalOrderIndex = idx;
    });

    entries.forEach((entry) => {
      const arrivalIndex = entry.arrivalOrderIndex ?? entry.arrivalIndex ?? 0;
      const temporalIndex = entry.temporalOrderIndex ?? arrivalIndex;
      const outOfOrder = arrivalIndex > temporalIndex || entry.isOutOfOrder;
      entry.arrivalOrderIndex = arrivalIndex;
      entry.temporalOrderIndex = temporalIndex;
      entry.isOutOfOrder = outOfOrder;
      if (outOfOrder && entry.originalPosition == null) {
        entry.originalPosition = arrivalIndex;
      }
      if (!outOfOrder && entry.state === 'settling') {
        entry.state = 'settled';
      }
      if (!entry.state) {
        entry.state = outOfOrder ? 'settling' : 'settled';
      }
    });

    return entries;
  }
}

const OUTGOING_BUFFER_THRESHOLD = 32;
const BUFFER_WARNING_COOLDOWN_MS = 2000;
const RATE_LIMIT_WARNING_COOLDOWN_MS = 1500;

for (const [name, element] of Object.entries(DOM)) {
  if (!element) {
    console.warn(`Missing DOM element: ${name}`);
  }
}

class SecureChat {
      constructor() {
        this.peer = null;
        this.conn = null;
        this.roomId = null;
        this.roomSalt = null;
        this.roomSaltBase64 = '';
        this.pendingRoomSalt = null;
        this.isHost = false;
        this.currentShareLink = '';
        this.currentInvite = null;
        this.invitePanelUnlocked = false;
        this.inviteCountdownTimer = null;
        this.inviteSeatCapacity = 4;
        this.seats = { host: null, guest: null };
        this.localUserId = generateId('user-');
        this.remoteUserId = null;
        this.showEncrypted = false;
        this.flags = FEATURE_FLAGS;
        this.systemLog = [];
        this.systemOrderCounter = 0;
        this.currentMessages = [];
        this.messageSubscription = null;
        this.roomListUnsub = null;
        this.encryptedCache = new Map();
        this.lastEncryptedHex = '';
        this.outgoingMessageNumber = 1;
        this.keyRotationInterval = 10;
        this.lastRotationMessageCount = 0;
        this.messageRateLimit = {
          timestamps: [],
          maxPerMinute: 30,
          maxBurst: 5
        };
        this.heartbeat = null;
        this.keyExchangeComplete = false;
        this.sentKeyExchange = false;
        this.latestFingerprint = '';
        this.lastAnnouncedEpoch = -1;
        this.devToolsEnabled = this.isDevEnvironment();
        this.backpressureThreshold = OUTGOING_BUFFER_THRESHOLD;
        this.bufferWarningCooldown = BUFFER_WARNING_COOLDOWN_MS;
        this.lastBufferWarningAt = 0;
        this.rateLimitWarningCooldown = RATE_LIMIT_WARNING_COOLDOWN_MS;
        this.lastRateLimitWarningAt = 0;
        this.toastContainer = null;
        this.handleSchemaRoute = null;
        this.lastMonotonicTime = 0;
        this.systemAnnouncements = DOM.systemAnnouncements;
        this.inviteManager = typeof InviteManager === 'function' ? new InviteManager() : null;
        this.inviteManagerReady = this.inviteManager?.ready || Promise.resolve();
        this.pendingInvite = null;
        this.roomMembers = typeof RoomMembers === 'function' ? new RoomMembers(DOM.memberSidebar) : null;
        this.nameGenerator = typeof SecureNameGenerator === 'function' ? new SecureNameGenerator() : null;
        this.identityManager = null;
        this.localIdentity = null;
        this.remoteIdentity = null;
        this.identityModalResolve = null;
        this.identityModalMode = 'create';
        this.identityRetryTimer = null;
        this.pendingStoredIdentity = null;
        this.cryptoUpdates = CryptoManager.onUpdated((update) => {
          const fingerprint = update?.fingerprint || '';
          this.latestFingerprint = fingerprint;
          this.updateFingerprintDisplay(fingerprint || null);

          if (update?.reason === 'rotation' && Number.isInteger(update.epoch)) {
            if (update.epoch !== this.lastAnnouncedEpoch) {
              this.lastAnnouncedEpoch = update.epoch;
              this.addSystemMessage('🔄 Security keys rotated');
            }
          }

          if (update?.reason === 'static-key' || update?.reason === 'promote') {
            this.lastAnnouncedEpoch = Number.isInteger(update.epoch) ? update.epoch : 0;
          }

          if (!fingerprint && update?.reason === 'reset') {
            this.lastAnnouncedEpoch = -1;
          }

          if (this.localIdentity && this.conn && CryptoManager.getCurrentKey()) {
            this.scheduleIdentityAnnouncement(true);
          }
        });

        this.timeline = new MessageTimeline(DOM.chatMessages, CONFIG);
        this.messageDetailCache = new Map();
        this.messageDetailsModal = new MessageDetailsModal((id) => this.messageDetailCache.get(id) || null);
        this.networkStatusBar = new NetworkStatusBar(DOM.networkStatus);
        this.seenIncomingSequences = new Set();
        this.highestIncomingSequence = 0;
        this.totalReceivedMessages = 0;
        this.reorderNoticeTimers = new Map();

        this.dom = DOM;
        this.applyVisualConfig();
        this.timeline.setContainer(DOM.chatMessages);
        this.networkStatusBar?.render();
        this.updateNetworkPeers(0);
        this.updatePendingMessages(0);
        this.updateAverageHops(0);
        this.initStorage();
        this.renderRoomHistory([]);
        this.checkForSharedLink().catch((error) => {
          console.error('Failed to process invite link.', error);
        });
        this.initEventListeners();
        this.initSimpleSetup();
        this.updateStatus('Disconnected', '');
        this.setWaitingBanner(false, '');
        this.updateFingerprintDisplay(null);
        this.initDevRoutes();
        this.applyFeatureFlags();
        this.initIdentityFlow();
        this.updateInviteVisuals();
      }

      initEventListeners() {
        const input = DOM.messageInput;
        if (input) {
          input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.sendMessage();
          });
        }

        const sendBtn = DOM.sendBtn;
        if (sendBtn) {
          sendBtn.addEventListener('click', () => this.sendMessage());
        }

        if (this.flags.showEncryptedView && DOM.encryptedToggle) {
          DOM.encryptedToggle.setAttribute('aria-pressed', 'false');
        }

        this.decorateInteractiveElement(DOM.roomCode, () => this.copyRoomCode());
        this.decorateInteractiveElement(DOM.inviteLink, () => this.copyShareLink('inviteLink'));
        this.decorateInteractiveElement(DOM.chatShareLink, () => this.copyShareLink('chatShareLink'));

        if (DOM.copyInviteBtn) {
          DOM.copyInviteBtn.addEventListener('click', () => this.copyShareLink('inviteLink'));
        }

        if (DOM.generateInviteBtn) {
          DOM.generateInviteBtn.addEventListener('click', () => this.handleGenerateInviteClick());
        }

        if (DOM.shareInviteBtn) {
          DOM.shareInviteBtn.addEventListener('click', () => this.showInviteShareOptions());
        }

        if (DOM.cancelInviteBtn) {
          DOM.cancelInviteBtn.addEventListener('click', () => this.cancelActiveInvite());
        }
      }

      initSimpleSetup() {
        this.simpleEmailInput = DOM.simpleEmail;
        this.simpleShareStatusEl = DOM.simpleShareStatus;

        if (!this.simpleEmailInput) {
          return;
        }

        const storedEmail = this.getStoredInviteEmail();
        if (storedEmail) {
          this.simpleEmailInput.value = storedEmail;
        }

        const persist = () => {
          const value = this.simpleEmailInput.value.trim();
          if (!this.isValidEmail(value)) {
            this.updateSimpleShareStatus('Enter a valid email or leave blank to use the share menu.', true);
            return;
          }
          this.storeInviteEmail(value);
          if (this.simpleShareStatusEl?.classList.contains('error')) {
            this.updateSimpleShareStatus('');
          }
        };

        this.simpleEmailInput.addEventListener('change', persist);
        this.simpleEmailInput.addEventListener('blur', persist);
      }

      applyVisualConfig() {
        if (typeof document === 'undefined') {
          return;
        }
        const root = document.documentElement;
        if (!root) {
          return;
        }
        root.style.setProperty('--reorder-fade-delay', `${CONFIG.reorderBadgeFadeDelay}ms`);
        root.style.setProperty('--reorder-glow-duration', `${CONFIG.reorderGlowDuration}ms`);
      }

      updateNetworkPeers(count) {
        this.networkStatusBar?.setPeers(count);
      }

      updatePendingMessages(count) {
        this.networkStatusBar?.setPendingMessages(count);
      }

      updateAverageHops(value) {
        this.networkStatusBar?.setAverageHops(value);
      }

      decorateInteractiveElement(element, handler) {
        if (!element) {
          return;
        }

        element.setAttribute('role', 'button');
        element.setAttribute('tabindex', '0');
        element.addEventListener('keydown', (event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            if (typeof handler === 'function') {
              handler();
            } else if (typeof element.click === 'function') {
              element.click();
            }
          }
        });
      }

      applyFeatureFlags() {
        const encryptedToggle = DOM.encryptedToggle;
        if (encryptedToggle) {
          if (!this.flags.showEncryptedView) {
            encryptedToggle.setAttribute('aria-hidden', 'true');
            encryptedToggle.setAttribute('tabindex', '-1');
            encryptedToggle.style.display = 'none';
          } else {
            encryptedToggle.setAttribute('aria-hidden', 'false');
            encryptedToggle.style.display = '';
          }
        }
      }

      // Identity & Members
      initIdentityFlow() {
        this.identityModal = DOM.identityModal;
        this.identitySelectedName = '';

        if (!this.identityModal) {
          return;
        }

        const createForm = DOM.identityCreateForm;
        if (createForm) {
          createForm.addEventListener('submit', (event) => {
            event.preventDefault();
            this.handleIdentityCreateSubmit();
          });
        }

        const returningForm = DOM.identityReturningForm;
        if (returningForm) {
          returningForm.addEventListener('submit', (event) => {
            event.preventDefault();
            this.handleIdentityReturningSubmit();
          });
        }

        if (DOM.identityRefreshBtn) {
          DOM.identityRefreshBtn.addEventListener('click', () => this.refreshIdentitySuggestions(true));
        }

        if (DOM.identityNameInput) {
          DOM.identityNameInput.addEventListener('input', () => {
            this.identitySelectedName = '';
            this.highlightIdentitySuggestion(null);
            this.updateJoinButtonText();
            this.clearIdentityError();
          });
        }

        if (DOM.identityPasswordInput) {
          DOM.identityPasswordInput.addEventListener('input', () => {
            this.updatePasswordStrength();
            this.clearIdentityError();
          });
        }

        if (DOM.identityReturningPassword) {
          DOM.identityReturningPassword.addEventListener('input', () => this.clearIdentityError());
        }

        if (DOM.identityUseNew) {
          DOM.identityUseNew.addEventListener('click', () => {
            this.displayIdentityMode('create');
            this.refreshIdentitySuggestions(true);
          });
        }

        this.refreshIdentitySuggestions(true);
      }

      refreshIdentitySuggestions(force = false) {
        const container = DOM.identitySuggestions;
        if (!container || !this.nameGenerator) {
          return;
        }

        const names = this.nameGenerator.generateMultiple(5);
        container.innerHTML = '';

        names.forEach((name, index) => {
          const button = document.createElement('button');
          button.type = 'button';
          button.className = 'name-option';
          button.dataset.name = name;
          button.innerHTML = `<span class="name-avatar">${this.getEmojiForName(name)}</span><span class="name-text">${this.escapeHtml(name)}</span>`;
          button.addEventListener('click', () => this.selectIdentitySuggestion(name));
          container.appendChild(button);
          if (index === 0 && (force || !this.identitySelectedName)) {
            this.identitySelectedName = name;
            button.classList.add('selected');
          }
        });

        if (this.identitySelectedName) {
          this.highlightIdentitySuggestion(this.identitySelectedName);
        }

        if (DOM.identityNameInput && force) {
          DOM.identityNameInput.value = '';
        }

        this.updateJoinButtonText();
      }

      selectIdentitySuggestion(name) {
        this.identitySelectedName = name;
        this.highlightIdentitySuggestion(name);
        if (DOM.identityNameInput) {
          DOM.identityNameInput.value = '';
        }
        this.updateJoinButtonText();
        this.clearIdentityError();
      }

      highlightIdentitySuggestion(name) {
        const container = DOM.identitySuggestions;
        if (!container) {
          return;
        }

        container.querySelectorAll('.name-option').forEach((button) => {
          const candidate = button?.dataset?.name || '';
          button.classList.toggle('selected', Boolean(name) && candidate === name);
        });
      }

      getEmojiForName(name) {
        const avatar = this.computeAvatarFromName(name);
        return avatar.emoji;
      }

      computeAvatarFromName(name) {
        if (typeof name !== 'string' || !name) {
          return { emoji: '🙂', color: '#4A9FD5' };
        }
        const emojis = ['🦊', '🦁', '🐺', '🦅', '🐉', '🦉', '🐯', '🦜', '🦋', '🐠'];
        const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD'];
        let hash = 0;
        for (let i = 0; i < name.length; i++) {
          hash = (hash << 5) - hash + name.charCodeAt(i);
          hash |= 0;
        }
        hash = Math.abs(hash);
        const emoji = emojis[hash % emojis.length];
        const color = colors[Math.floor(hash / emojis.length) % colors.length];
        return { emoji, color };
      }

      getSelectedDisplayName() {
        const custom = DOM.identityNameInput?.value?.trim();
        if (custom) {
          return custom;
        }
        return this.identitySelectedName || '';
      }

      updateJoinButtonText() {
        const button = DOM.identitySubmitBtn;
        const subtitle = DOM.identityModalSubtitle;
        const name = this.getSelectedDisplayName();
        if (button) {
          button.textContent = name ? `Join as ${name}` : 'Join Secure Room';
        }
        if (subtitle) {
          subtitle.textContent = name
            ? `Secure your seat as ${name}`
            : 'Secure your seat in this room';
        }
      }

      updatePasswordStrength() {
        const value = DOM.identityPasswordInput?.value || '';
        const bar = DOM.identityStrengthBar;
        const text = DOM.identityStrengthText;
        let score = 0;
        if (value.length >= 8) score += 1;
        if (value.length >= 12) score += 1;
        if (/[A-Z]/.test(value) && /[a-z]/.test(value)) score += 1;
        if (/\d/.test(value)) score += 1;
        if (/[^A-Za-z0-9]/.test(value)) score += 1;
        score = Math.min(score, 4);
        if (bar) {
          bar.setAttribute('data-strength', String(score));
        }
        if (text) {
          const labels = ['Very weak', 'Weak', 'Okay', 'Strong', 'Excellent'];
          text.textContent = labels[score] || 'Choose a strong password';
        }
      }

      showIdentityError(message) {
        const error = DOM.identityError;
        if (!error) {
          return;
        }
        error.textContent = message;
        error.hidden = false;
      }

      clearIdentityError() {
        const error = DOM.identityError;
        if (error) {
          error.hidden = true;
          error.textContent = '';
        }
      }

      showIdentityModal(mode = 'create', options = {}) {
        if (!this.identityModal) {
          return Promise.resolve(null);
        }

        this.identityModalMode = mode;
        this.clearIdentityError();
        this.displayIdentityMode(mode, options?.stored);
        this.identityModal.hidden = false;

        if (mode === 'create') {
          this.refreshIdentitySuggestions(!this.identitySelectedName);
          this.updatePasswordStrength();
          setTimeout(() => DOM.identityNameInput?.focus(), 0);
        } else {
          setTimeout(() => DOM.identityReturningPassword?.focus(), 0);
        }

        return new Promise((resolve) => {
          this.identityModalResolve = resolve;
        });
      }

      displayIdentityMode(mode, stored) {
        const createSection = DOM.identityModeCreate;
        const returningSection = DOM.identityModeReturning;
        const title = DOM.identityModalTitle;
        const hint = DOM.identityHint;
        const subtitle = DOM.identityModalSubtitle;
        this.clearIdentityError();

        if (mode === 'returning') {
          createSection?.setAttribute('hidden', '');
          returningSection?.removeAttribute('hidden');
          if (title) {
            title.textContent = 'Welcome Back';
          }
          if (subtitle) {
            subtitle.textContent = 'Unlock your saved identity to continue';
          }
          if (hint) {
            hint.textContent = stored?.hint || 'You';
          }
          this.pendingStoredIdentity = stored || null;
        } else {
          returningSection?.setAttribute('hidden', '');
          createSection?.removeAttribute('hidden');
          if (title) {
            title.textContent = 'Choose Your Identity';
          }
          if (subtitle) {
            subtitle.textContent = 'Secure your seat in this room';
          }
          this.pendingStoredIdentity = null;
          this.updateJoinButtonText();
        }
      }

      hideIdentityModal(result = null) {
        if (!this.identityModal) {
          return;
        }
        this.identityModal.hidden = true;
        if (typeof this.identityModalResolve === 'function') {
          this.identityModalResolve(result);
          this.identityModalResolve = null;
        }
      }

      async handleIdentityCreateSubmit() {
        if (!this.identityManager) {
          try {
            this.identityManager = new RoomIdentity(this.roomId);
          } catch (error) {
            console.warn('Unable to initialise room identity manager.', error);
            this.showIdentityError('Identity service unavailable in this browser.');
            return;
          }
        }

        const displayName = this.getSelectedDisplayName();
        if (!displayName) {
          this.showIdentityError('Select or enter a display name.');
          return;
        }

        const password = DOM.identityPasswordInput?.value?.trim() || '';
        if (password.length < 8) {
          this.showIdentityError('Password must be at least 8 characters.');
          return;
        }

        try {
          const identity = await this.identityManager.createIdentity(displayName, password);
          this.localIdentity = identity;
          this.roomMembers?.upsertMember(identity, { isHost: this.isHost, online: true });
          this.updateInviteVisuals();
          this.hideIdentityModal(identity);
          this.scheduleIdentityAnnouncement();
        } catch (error) {
          console.warn('Failed to create room identity.', error);
          this.showIdentityError('Unable to create identity. Please try a different password.');
        }
      }

      async handleIdentityReturningSubmit() {
        if (!this.identityManager) {
          try {
            this.identityManager = new RoomIdentity(this.roomId);
          } catch (error) {
            this.showIdentityError('Identity service unavailable.');
            return;
          }
        }

        const password = DOM.identityReturningPassword?.value?.trim() || '';
        if (!password) {
          this.showIdentityError('Enter the room password.');
          return;
        }

        try {
          const identity = await this.identityManager.verifyReturningMember(password);
          if (!identity) {
            this.showIdentityError('No saved identity found for this room.');
            return;
          }
          this.localIdentity = identity;
          this.roomMembers?.upsertMember(identity, { isHost: this.isHost, online: true });
          this.updateInviteVisuals();
          this.hideIdentityModal(identity);
          this.scheduleIdentityAnnouncement();
        } catch (error) {
          console.warn('Failed to decrypt stored identity.', error);
          this.showIdentityError('Invalid password for this room identity.');
        }
      }

      async prepareIdentity() {
        if (!this.roomId || typeof RoomIdentity !== 'function') {
          return null;
        }

        if (!this.identityManager || this.identityManager.roomId !== this.roomId) {
          try {
            this.identityManager = new RoomIdentity(this.roomId);
          } catch (error) {
            console.warn('Unable to initialise identity manager.', error);
            return null;
          }
        }

        if (this.localIdentity?.id) {
          this.roomMembers?.upsertMember(this.localIdentity, { isHost: this.isHost, online: true });
          return this.localIdentity;
        }

        try {
          const stored = await this.identityManager.storage.getRoomIdentity(this.roomId);
          if (stored) {
            const identity = await this.showIdentityModal('returning', { stored });
            if (identity) {
              this.localIdentity = identity;
              this.roomMembers?.upsertMember(identity, { isHost: this.isHost, online: true });
              this.updateInviteVisuals();
              this.scheduleIdentityAnnouncement();
              return identity;
            }
          }
        } catch (error) {
          console.warn('Unable to load stored identity.', error);
        }

        const created = await this.showIdentityModal('create');
        if (created) {
          this.localIdentity = created;
          this.roomMembers?.upsertMember(created, { isHost: this.isHost, online: true });
          this.updateInviteVisuals();
          this.scheduleIdentityAnnouncement();
          return created;
        }

        return null;
      }

      scheduleIdentityAnnouncement(immediate = false) {
        if (!this.localIdentity) {
          return;
        }

        this.clearIdentityAnnouncement();

        const attempt = async () => {
          if (!this.localIdentity) {
            return;
          }
          if (!this.conn || !CryptoManager.getCurrentKey()) {
            this.identityRetryTimer = setTimeout(attempt, 1500);
            return;
          }

          const payload = {
            type: 'identity_profile',
            identity: {
              id: this.localIdentity.id,
              displayName: this.localIdentity.displayName,
              avatar: this.localIdentity.avatar,
              publicKey: this.localIdentity.publicKey,
              isHost: this.isHost,
              lastSeen: Date.now()
            }
          };

          const sent = await this.sendSecureControlMessage(payload);
          if (!sent) {
            this.identityRetryTimer = setTimeout(attempt, 1500);
          }
        };

        if (immediate) {
          attempt();
        } else {
          this.identityRetryTimer = setTimeout(attempt, 300);
        }
      }

      clearIdentityAnnouncement() {
        if (this.identityRetryTimer) {
          clearTimeout(this.identityRetryTimer);
          this.identityRetryTimer = null;
        }
      }

      handleIncomingIdentity(payload) {
        if (!payload || typeof payload !== 'object') {
          return;
        }

        const identity = {
          id: typeof payload.id === 'string' ? payload.id : this.remoteUserId || 'peer',
          displayName: typeof payload.displayName === 'string' ? payload.displayName : 'Guest',
          avatar: this.normalizeAvatar(payload.avatar),
          publicKey: typeof payload.publicKey === 'string' ? payload.publicKey : null,
          lastSeen: typeof payload.lastSeen === 'number' ? payload.lastSeen : Date.now()
        };

        identity.isHost = Boolean(payload.isHost);
        identity.verified = Boolean(payload.verified);

        this.remoteIdentity = identity;
        this.roomMembers?.upsertMember(identity, {
          isHost: identity.isHost,
          online: true,
          verified: identity.verified,
          lastSeen: Date.now()
        });
        this.updateInviteVisuals();
      }

      normalizeAvatar(avatar) {
        if (!avatar || typeof avatar !== 'object') {
          return { emoji: '🙂', color: '#4A9FD5' };
        }
        const emoji = typeof avatar.emoji === 'string' ? avatar.emoji : '🙂';
        const color = typeof avatar.color === 'string' ? avatar.color : '#4A9FD5';
        return { emoji, color };
      }

      escapeHtml(value) {
        if (typeof value !== 'string') {
          return '';
        }
        return value
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#039;');
      }

      resetIdentityState(options = {}) {
        const { preserveLocal = false } = options;
        if (this.identityModal && !this.identityModal.hidden) {
          this.identityModal.hidden = true;
        }
        if (typeof this.identityModalResolve === 'function') {
          this.identityModalResolve(null);
          this.identityModalResolve = null;
        }
        if (!preserveLocal) {
          this.localIdentity = null;
        }
        this.remoteIdentity = null;
        this.identityManager = null;
        this.pendingStoredIdentity = null;
        this.clearIdentityAnnouncement();
        this.updateInviteVisuals();
        if (this.roomMembers) {
          this.roomMembers.members.clear();
          this.roomMembers.render();
        }
      }

      markRemoteOffline() {
        if (this.remoteIdentity?.id) {
          this.roomMembers?.markOffline(this.remoteIdentity.id);
        }
        this.updateInviteVisuals();
      }

      focusDefaultForScreen(screenId) {
        let focusTarget = null;
        if (screenId === 'welcomeScreen') {
          focusTarget = DOM.welcomeScreen?.querySelector('.action-buttons button');
        } else if (screenId === 'hostScreen') {
          focusTarget = DOM.copyInviteBtn || DOM.inviteLink;
        } else if (screenId === 'joinScreen') {
          focusTarget = DOM.joinStatus;
        } else if (screenId === 'chatScreen') {
          focusTarget = DOM.messageInput;
        }

        if (focusTarget && typeof focusTarget.focus === 'function') {
          focusTarget.focus();
        }
      }

      isDevEnvironment() {
        if (typeof window === 'undefined') {
          return false;
        }

        const { protocol, hostname } = window.location;
        if (protocol === 'file:') {
          return true;
        }

        if (!hostname) {
          return false;
        }

        const normalized = hostname.toLowerCase();
        if (['localhost', '127.0.0.1', '0.0.0.0'].includes(normalized)) {
          return true;
        }

        return normalized.endsWith('.local');
      }

      initDevRoutes() {
        if (!this.devToolsEnabled || typeof window === 'undefined') {
          return;
        }

        if (typeof this.handleSchemaRoute === 'function') {
          window.removeEventListener('hashchange', this.handleSchemaRoute);
        }

        this.handleSchemaRoute = () => {
          if (window.location.hash === '#schema') {
            this.showSchemaView();
          }
        };

        window.addEventListener('hashchange', this.handleSchemaRoute);

        if (window.location.hash === '#schema') {
          this.showSchemaView();
        }
      }

      getStoredInviteEmail() {
        if (!this.storage?.isLocalStorageAvailable) {
          return '';
        }

        try {
          return localStorage.getItem('simpleInviteEmail') || '';
        } catch (error) {
          console.warn('Unable to read stored invite email.', error);
          return '';
        }
      }

      storeInviteEmail(email) {
        if (!this.storage?.isLocalStorageAvailable) {
          return;
        }

        try {
          if (email) {
            localStorage.setItem('simpleInviteEmail', email);
          } else {
            localStorage.removeItem('simpleInviteEmail');
          }
        } catch (error) {
          console.warn('Unable to persist invite email preference.', error);
        }
      }

      rememberInviteDetails(roomId, saltBase64) {
        if (!roomId || !saltBase64) {
          return;
        }

        const key = `secure-chat:invite:${roomId}`;

        try {
          sessionStorage.setItem(key, saltBase64);
          return;
        } catch (error) {
          // Session storage might be unavailable; fall back to local storage
        }

        try {
          localStorage.setItem(key, saltBase64);
        } catch (error) {
          console.warn('Unable to persist invite details for reuse.', error);
        }
      }

      loadStoredInviteSalt(roomId) {
        if (!roomId) {
          return '';
        }

        const key = `secure-chat:invite:${roomId}`;
        let stored = '';

        try {
          stored = sessionStorage.getItem(key) || '';
        } catch (error) {
          // Ignore session storage access issues and fall back to local storage
        }

        if (!stored) {
          try {
            stored = localStorage.getItem(key) || '';
          } catch (error) {
            stored = '';
          }
        }

        return stored.trim();
      }

      isValidEmail(email) {
        if (!email) {
          return true;
        }

        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
      }

      updateSimpleShareStatus(message = '', isError = false) {
        if (!this.simpleShareStatusEl) {
          return;
        }

        this.simpleShareStatusEl.textContent = message;
        this.simpleShareStatusEl.classList.toggle('error', Boolean(isError));
      }

      simpleShareInvite() {
        const shareLinkEl = DOM.inviteLink;
        const link = this.currentShareLink || shareLinkEl?.dataset?.link || shareLinkEl?.value?.trim();

        if (!link || link === 'Generating secure link...') {
          this.updateSimpleShareStatus('Generate a secure invite by starting a room first.', true);
          return;
        }

        const email = this.simpleEmailInput?.value.trim();
        if (!this.isValidEmail(email)) {
          this.updateSimpleShareStatus('Enter a valid email or leave blank to use the share menu.', true);
          return;
        }
        this.storeInviteEmail(email || '');
        const expiryText = this.seats?.guest?.expiresAt
          ? new Date(this.seats.guest.expiresAt).toLocaleString()
          : '15 minutes from creation';
        const payload = `You're invited to a secure chat.

One-time link: ${link}
Expires: ${expiryText}

This invite can be used only once. Share the link privately.`;

        this.updateSimpleShareStatus('');

        if (email) {
          const subject = encodeURIComponent('Join my Secure Chat room');
          const body = encodeURIComponent(payload);
          window.location.href = `mailto:${encodeURIComponent(email)}?subject=${subject}&body=${body}`;
          this.updateSimpleShareStatus('Opening your email app...', false);
          return;
        }

        if (navigator.share) {
          navigator.share({ text: payload })
            .then(() => {
              this.updateSimpleShareStatus('Invite shared.', false);
            })
            .catch((error) => {
              console.warn('Share failed, falling back to copy.', error);
              this.copyShareLink();
              this.updateSimpleShareStatus('Share menu unavailable. Link copied instead.', false);
            });
          return;
        }

        this.copyShareLink();
        this.updateSimpleShareStatus('Share unsupported. Link copied to clipboard.', false);
      }

      async checkForSharedLink() {
        if (typeof window === 'undefined') {
          return;
        }

        const hash = window.location.hash || '';
        let invitePayload = null;

        if (hash.startsWith('#/j/')) {
          const encoded = decodeURIComponent(hash.slice(4));
          invitePayload = SecureInvite.decodePayload(encoded);
        } else if (hash.startsWith('#/join/')) {
          const parts = hash.replace(/^#\/+/, '').split('/');
          if (parts.length >= 4) {
            invitePayload = {
              r: parts[1],
              s: parts[2],
              k: parts[3]
            };
          }
        }

        if (!invitePayload) {
          return;
        }

        const invite = {
          roomId: invitePayload.roomId || invitePayload.r,
          seatId: invitePayload.seatId || invitePayload.s,
          secretKey: invitePayload.secretKey || invitePayload.k,
          expiresAt: invitePayload.expiresAt || invitePayload.e,
          signature: invitePayload.signature || invitePayload.sig
        };

        if (!invite.roomId || !invite.seatId || !invite.secretKey) {
          console.warn('Invite link missing required parameters.');
          return;
        }

        if (!invite.signature) {
          try {
            invite.signature = await SecureInvite.signInvite(
              invite.roomId,
              invite.seatId,
              invite.secretKey,
              invite.expiresAt
            );
          } catch (error) {
            console.warn('Unable to derive invite signature from payload.', error);
          }
        }

        const detailMessage = invite.expiresAt
          ? 'Verifying token and expiration...'
          : 'Verifying one-time token...';
        this.showJoin('Claiming your secure seat...', detailMessage);

        try {
          await this.startJoinFromInvite(invite);
          if (window.history && window.location.hash) {
            window.history.replaceState({}, document.title, window.location.pathname);
          }
        } catch (error) {
          console.error('Failed to join using invite.', error);
          const message = error?.message || 'Unable to use this invite link.';
          this.showJoin('Invite unavailable', message);
          this.updateStatus('Error', '');
        }
      }

      async createInvitePayload(roomId, seat) {
        if (!roomId || !seat?.seatId || !seat?.secretKey) {
          return null;
        }

        const expiresAt = seat.expiresAt || (Date.now() + 15 * 60 * 1000);
        const signature = await SecureInvite.signInvite(roomId, seat.seatId, seat.secretKey, expiresAt);
        const payload = {
          roomId,
          seatId: seat.seatId,
          secretKey: seat.secretKey,
          expiresAt,
          signature
        };

        const encoded = SecureInvite.encodePayload({
          r: payload.roomId,
          s: payload.seatId,
          k: payload.secretKey,
          e: payload.expiresAt,
          sig: payload.signature
        });

        const origin = window.location.origin + window.location.pathname;
        const url = `${origin}#/j/${encoded}`;

        return { payload, url, encoded };
      }

      async generateShareLink(roomId, seat = this.seats?.guest) {
        const result = await this.createInvitePayload(roomId, seat);
        if (!result) {
          return window.location.origin + window.location.pathname;
        }

        this.currentInvite = result;
        this.currentShareLink = result.url;
        return result.url;
      }

      updateInviteLink(url) {
        const inviteInput = DOM.inviteLink;
        const shareSection = DOM.shareSection;
        const activeInvite = DOM.activeInvite;
        const copyBtn = DOM.copyInviteBtn;
        const shareBtn = DOM.shareInviteBtn;
        const cancelBtn = DOM.cancelInviteBtn;
        const generateBtn = DOM.generateInviteBtn;

        if (shareSection) {
          if (url) {
            shareSection.style.display = 'block';
            this.invitePanelUnlocked = true;
          } else if (!this.invitePanelUnlocked) {
            shareSection.style.display = 'none';
          }
        }

        if (activeInvite) {
          if (url) {
            activeInvite.hidden = false;
            activeInvite.classList.remove('expired');
          } else if (this.invitePanelUnlocked) {
            activeInvite.hidden = true;
            activeInvite.classList.remove('expired');
          }
        }

        if (copyBtn) {
          copyBtn.disabled = !url;
        }

        if (shareBtn) {
          shareBtn.disabled = !url;
        }

        if (cancelBtn) {
          cancelBtn.disabled = !url;
        }

        if (generateBtn) {
          const labelSpan = generateBtn.querySelector('span:last-child');
          if (labelSpan) {
            labelSpan.textContent = url ? 'Generate New Invite Link' : 'Generate Invite Link';
          } else {
            generateBtn.textContent = url ? '🎟️ Generate New Invite Link' : '🎟️ Generate Invite Link';
          }
        }

        if (!inviteInput) {
          if (url) {
            this.startInviteCountdown();
          } else {
            this.stopInviteCountdown(true);
          }
          this.updateInviteVisuals();
          return;
        }

        if (url) {
          inviteInput.value = url;
          inviteInput.dataset.link = url;
          inviteInput.setAttribute('aria-label', 'Copy secure invite link');
          this.startInviteCountdown();
        } else {
          inviteInput.value = this.invitePanelUnlocked ? 'Generate a secure link to share.' : 'Generating secure link...';
          delete inviteInput.dataset.link;
          this.stopInviteCountdown(true);
        }

        this.updateInviteVisuals();
      }

      formatInviteDuration(msRemaining) {
        if (!Number.isFinite(msRemaining) || msRemaining <= 0) {
          return '0s';
        }
        const totalSeconds = Math.max(0, Math.floor(msRemaining / 1000));
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        if (minutes >= 60) {
          const hours = Math.floor(minutes / 60);
          const remainingMinutes = minutes % 60;
          return `${hours}h ${remainingMinutes}m`;
        }
        if (minutes > 0) {
          return `${minutes}m ${seconds.toString().padStart(2, '0')}s`;
        }
        return `${seconds}s`;
      }

      startInviteCountdown() {
        if (this.inviteCountdownTimer) {
          clearInterval(this.inviteCountdownTimer);
          this.inviteCountdownTimer = null;
        }

        const countdownEl = DOM.inviteCountdown;
        const statusDot = DOM.inviteStatusDot;
        const copyBtn = DOM.copyInviteBtn;
        const shareBtn = DOM.shareInviteBtn;
        const activeInvite = DOM.activeInvite;

        if (statusDot) {
          statusDot.classList.add('pulse');
        }
        if (activeInvite) {
          activeInvite.classList.remove('expired');
        }
        if (copyBtn) {
          copyBtn.disabled = false;
        }
        if (shareBtn) {
          shareBtn.disabled = false;
        }

        if (!countdownEl) {
          return;
        }

        const update = () => {
          const expiresAt = this.seats?.guest?.expiresAt;
          if (!Number.isFinite(expiresAt)) {
            countdownEl.textContent = 'Active invite ready to share';
            return;
          }
          const remaining = expiresAt - Date.now();
          if (remaining <= 0) {
            countdownEl.textContent = 'Invite expired – generate a new link';
            if (statusDot) {
              statusDot.classList.remove('pulse');
            }
            if (activeInvite) {
              activeInvite.classList.add('expired');
            }
            if (copyBtn) {
              copyBtn.disabled = true;
            }
            if (shareBtn) {
              shareBtn.disabled = true;
            }
            this.stopInviteCountdown();
            return;
          }
          countdownEl.textContent = `Active invite · expires in ${this.formatInviteDuration(remaining)}`;
        };

        update();
        this.inviteCountdownTimer = setInterval(update, 1000);
      }

      stopInviteCountdown(resetMessage = false) {
        if (this.inviteCountdownTimer) {
          clearInterval(this.inviteCountdownTimer);
          this.inviteCountdownTimer = null;
        }
        const statusDot = DOM.inviteStatusDot;
        if (statusDot) {
          statusDot.classList.remove('pulse');
        }
        if (resetMessage) {
          const countdownEl = DOM.inviteCountdown;
          if (countdownEl) {
            countdownEl.textContent = this.invitePanelUnlocked ? 'No active invite' : 'Generate an invite to share.';
          }
        }
        const activeInvite = DOM.activeInvite;
        if (activeInvite) {
          activeInvite.classList.remove('expired');
        }
      }

      buildSeatVisualModel() {
        const capacity = Number.isFinite(this.inviteSeatCapacity) ? this.inviteSeatCapacity : 4;
        const seats = [];

        const hostName = this.localIdentity?.displayName || (this.isHost ? 'You' : 'Host');
        const hostAvatar = this.localIdentity?.avatar?.emoji || '🛡️';

        seats.push({
          status: 'occupied',
          avatar: hostAvatar,
          name: hostName,
          subLabel: this.isHost ? 'This is you' : 'Host',
          role: 'Host'
        });

        const guestSeat = this.seats?.guest;
        const inviteActive = Boolean(this.currentShareLink);
        const guestConnected = Boolean(this.conn);
        const guestClaimed = Boolean(guestSeat?.claimed);
        const remoteName = this.remoteIdentity?.displayName || 'Guest';
        const remoteAvatar = this.remoteIdentity?.avatar?.emoji || '🙂';

        if (guestConnected || guestClaimed) {
          seats.push({
            status: 'occupied',
            avatar: remoteAvatar,
            name: remoteName,
            subLabel: guestConnected ? 'Connected guest' : 'Invite claimed',
            role: 'Guest'
          });
        } else if (inviteActive && guestSeat?.seatId) {
          seats.push({
            status: 'reserved',
            icon: '⏳',
            label: 'Invite pending',
            subLabel: 'Waiting for guest',
            role: 'Guest'
          });
        } else {
          seats.push({
            status: 'available',
            icon: '+',
            label: 'Available seat',
            subLabel: 'Ready to invite',
            role: 'Guest'
          });
        }

        while (seats.length < capacity) {
          const index = seats.length + 1;
          seats.push({
            status: 'available',
            icon: '+',
            label: 'Available seat',
            subLabel: 'Ready when you are',
            role: `Seat ${index}`
          });
        }

        return seats.slice(0, capacity);
      }

      updateInviteVisuals() {
        if (typeof document === 'undefined') {
          return;
        }
        const grid = DOM.inviteSeatsGrid;
        if (!grid) {
          return;
        }

        const seats = this.buildSeatVisualModel();
        grid.innerHTML = '';

        seats.forEach((seat) => {
          const element = document.createElement('div');
          element.className = `seat ${seat.status}`;
          if (seat.role) {
            element.dataset.role = seat.role;
          } else {
            element.removeAttribute('data-role');
          }

          if (seat.status === 'occupied') {
            const avatar = document.createElement('div');
            avatar.className = 'seat-avatar';
            avatar.textContent = seat.avatar || '🙂';
            element.appendChild(avatar);

            const name = document.createElement('span');
            name.className = 'seat-name';
            name.textContent = seat.name || 'Member';
            element.appendChild(name);

            if (seat.subLabel) {
              const label = document.createElement('span');
              label.className = 'seat-label seat-sub-label';
              label.textContent = seat.subLabel;
              element.appendChild(label);
            }
          } else {
            const placeholder = document.createElement('div');
            placeholder.className = 'empty-seat';
            placeholder.textContent = seat.icon || '+';
            element.appendChild(placeholder);

            const label = document.createElement('span');
            label.className = 'seat-label';
            label.textContent = seat.label || 'Available';
            element.appendChild(label);

            if (seat.subLabel) {
              const sub = document.createElement('span');
              sub.className = 'seat-label seat-sub-label';
              sub.textContent = seat.subLabel;
              element.appendChild(sub);
            }
          }

          grid.appendChild(element);
        });

        const info = DOM.inviteSeatsInfo;
        if (info) {
          const availableSeats = seats.filter((seat) => seat.status === 'available').length;
          info.textContent = `${availableSeats} of ${seats.length} seats available`;
        }
      }

      async handleGenerateInviteClick() {
        if (!this.isHost || !this.roomId) {
          if (typeof this.showToast === 'function') {
            this.showToast('Start a secure room first.', 'info');
          }
          return;
        }

        if (this.conn) {
          if (typeof this.showToast === 'function') {
            this.showToast('A guest is already connected.', 'warning');
          }
          return;
        }

        const button = DOM.generateInviteBtn;
        if (button) {
          if (button.dataset.loading === 'true') {
            return;
          }
          button.dataset.loading = 'true';
          button.disabled = true;
        }

        try {
          await this.refreshGuestInvite({ announce: true });
        } catch (error) {
          console.error('Failed to generate invite link.', error);
          if (typeof this.showToast === 'function') {
            this.showToast('Unable to generate invite. Please try again.', 'error');
          }
        } finally {
          if (button) {
            delete button.dataset.loading;
            button.disabled = false;
          }
        }
      }

      async showInviteShareOptions() {
        const inviteInput = DOM.inviteLink;
        const storedLink = inviteInput?.dataset?.link || '';
        const link = this.currentShareLink || storedLink;

        if (!link) {
          if (typeof this.showToast === 'function') {
            this.showToast('Generate an invite link first.', 'info');
          }
          return;
        }

        const shareData = {
          title: 'Secure Room Invite',
          text: `Join my secure room ${this.roomId || ''}`.trim(),
          url: link
        };

        if (typeof navigator !== 'undefined' && navigator.share) {
          try {
            await navigator.share(shareData);
            if (typeof this.showToast === 'function') {
              this.showToast('Invite shared.', 'success');
            }
            return;
          } catch (error) {
            if (error?.name === 'AbortError') {
              return;
            }
            console.warn('Native share failed.', error);
          }
        }

        if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
          try {
            await navigator.clipboard.writeText(link);
            if (typeof this.showToast === 'function') {
              this.showToast('Invite link copied to clipboard.', 'success');
            }
            return;
          } catch (error) {
            console.warn('Unable to copy invite link.', error);
          }
        }

        alert(`Copy this invite link:\n${link}`);
      }

      async cancelActiveInvite() {
        if (!this.isHost) {
          return;
        }

        if (!this.currentShareLink) {
          if (typeof this.showToast === 'function') {
            this.showToast('No active invite to cancel.', 'info');
          }
          return;
        }

        if (this.conn) {
          if (typeof this.showToast === 'function') {
            this.showToast('A guest is already connected. Disconnect to reset invites.', 'warning');
          }
          return;
        }

        try {
          await this.refreshGuestInvite({
            bannerMessage: 'Invite cancelled. Generate a new link when you’re ready to share again.',
            displayLink: false
          });
          this.currentInvite = null;
          this.currentShareLink = '';
          this.updateInviteLink('');
          this.addSystemMessage('🚫 Active invite cancelled. Generate a new one when you’re ready.');
        } catch (error) {
          console.warn('Failed to cancel invite.', error);
          if (typeof this.showToast === 'function') {
            this.showToast('Unable to cancel invite. Please try again.', 'error');
          }
        }

        this.updateInviteVisuals();
      }

      async refreshGuestInvite({ bannerMessage = 'Share this one-time secure link with your guest.', announce = false, displayLink = true } = {}) {
        if (!this.isHost || !this.roomId) {
          return null;
        }

        let newSeat;
        try {
          newSeat = await SecureInvite.generateSeat();
        } catch (error) {
          console.error('Failed to generate replacement invite.', error);
          this.addSystemMessage('⚠️ Unable to generate a new invite. Try restarting the room.');
          return null;
        }

        const saltBytes = SecureInvite.fromBase64Url(newSeat.seatId);
        if (!(saltBytes instanceof Uint8Array)) {
          this.addSystemMessage('⚠️ Generated invite was invalid.');
          return null;
        }

        try {
          this.seats.guest = { ...newSeat, claimed: false };
          CryptoManager.setRoomSalt(saltBytes);
          this.roomSalt = CryptoManager.getRoomSalt();
          this.roomSaltBase64 = this.bytesToBase64(this.roomSalt);
          await CryptoManager.loadStaticKeyFromSeat(newSeat.secretKey, newSeat.seatId);
        } catch (error) {
          console.error('Failed to promote refreshed invite material.', error);
          this.addSystemMessage('⚠️ Unable to activate the new invite. Try restarting the room.');
          return null;
        }

        this.keyExchangeComplete = false;
        this.sentKeyExchange = false;
        CryptoManager.clearECDHKeyPair();
        this.resetMessageCounters();
        this.updateFingerprintDisplay(null);

        let link = '';
        if (displayLink) {
          try {
            link = await this.generateShareLink(this.roomId, newSeat);
          } catch (error) {
            console.error('Failed to encode refreshed invite.', error);
            this.addSystemMessage('⚠️ Unable to encode the new invite link.');
            return null;
          }
        } else {
          this.currentInvite = null;
          this.currentShareLink = '';
        }

        this.updateInviteLink(displayLink ? link : '');
        this.updateSimpleShareStatus('');
        this.setWaitingBanner(true, displayLink ? link : '', bannerMessage);
        if (announce && displayLink) {
          this.addSystemMessage('✨ Generated a fresh secure invite link.');
        }

        this.updateInviteVisuals();

        return link;
      }

      async copyShareLink(targetId = 'inviteLink') {
        const elem = DOM[targetId] || document.getElementById(targetId);
        if (!elem) {
          return;
        }

        const storedLink = elem.dataset?.link;
        if (!storedLink && targetId === 'inviteLink') {
          return;
        }
        let link = storedLink;
        if (!link) {
          if (typeof elem.value === 'string') {
            link = elem.value;
          } else {
            link = elem.textContent;
          }
        }

        if (!link || link === 'Generating link...') {
          return;
        }

        const success = await this.copyText(link);
        const originalValue = typeof elem.value === 'string' ? elem.value : elem.textContent;
        if (success) {
          if (typeof elem.value === 'string') {
            elem.value = '✅ Link copied!';
          } else {
            elem.textContent = '✅ Link copied!';
          }
        } else {
          if (typeof elem.value === 'string') {
            elem.value = '⚠️ Unable to copy automatically';
          } else {
            elem.textContent = '⚠️ Unable to copy automatically';
          }
          this.showToast('Copy failed. Select the text manually.', 'warning');
        }
        setTimeout(() => {
          const restored = elem.dataset?.link || originalValue;
          if (typeof elem.value === 'string') {
            elem.value = restored;
          } else {
            elem.textContent = restored;
          }
        }, 2000);
      }

      async copyText(value) {
        if (!value || typeof document === 'undefined') {
          return false;
        }

        if (navigator?.clipboard?.writeText) {
          try {
            await navigator.clipboard.writeText(value);
            return true;
          } catch (error) {
            console.warn('navigator.clipboard.writeText failed', error);
          }
        }

        const textarea = document.createElement('textarea');
        textarea.value = value;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'absolute';
        textarea.style.left = '-9999px';
        document.body.appendChild(textarea);
        textarea.select();
        let success = false;
        try {
          success = document.execCommand('copy');
        } catch (error) {
          success = false;
        }
        textarea.remove();
        return success;
      }

      setWaitingBanner(visible, link, message) {
        const banner = DOM.waitingBanner;
        const linkEl = DOM.chatShareLink;
        const messageEl = DOM.waitingMessage;
        const copyBtn = DOM.chatCopyLink;

        if (!banner || !linkEl) {
          return;
        }

        if (link !== undefined) {
          if (link) {
            linkEl.textContent = link;
            linkEl.dataset.link = link;
          } else {
            linkEl.textContent = 'Generating link...';
            delete linkEl.dataset.link;
          }
        }

        if (message && messageEl) {
          messageEl.textContent = message;
        }

        const hasLink = Boolean(linkEl.dataset.link);

        if (visible && hasLink) {
          banner.classList.add('active');
          if (copyBtn) {
            copyBtn.disabled = false;
            copyBtn.setAttribute('aria-disabled', 'false');
          }
        } else {
          banner.classList.remove('active');
          if (copyBtn) {
            copyBtn.disabled = true;
            copyBtn.setAttribute('aria-disabled', 'true');
          }
        }
      }

      // Screen Navigation
      showScreen(screenId) {
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        const target = DOM[screenId] || document.getElementById(screenId);
        if (target) {
          target.classList.add('active');
          setTimeout(() => this.focusDefaultForScreen(screenId), 50);
        }
      }

      showWelcome() {
        this.showScreen('welcomeScreen');
        this.renderRoomHistory(projection.roomList());
      }

      showHost() {
        CryptoManager.reset();
        this.latestFingerprint = '';
        this.lastAnnouncedEpoch = -1;
        this.roomId = this.generateRoomId();
        this.roomSalt = null;
        this.roomSaltBase64 = '';
        this.resetMessageCounters();
        this.pendingRoomSalt = null;
        this.currentInvite = null;
        this.seats = { host: null, guest: null };
        this.resetIdentityState();
        this.updateFingerprintDisplay(null);
        const roomCodeDisplay = DOM.roomCode;
        if (roomCodeDisplay) {
          roomCodeDisplay.textContent = this.roomId;
        }
        const shareSection = DOM.shareSection;
        if (shareSection) {
          shareSection.style.display = 'none';
        }
        this.updateInviteLink('');
        this.currentShareLink = '';
        this.setWaitingBanner(false, '');
        this.showScreen('hostScreen');
      }

      showJoin(statusMessage = 'Secure invite required', detailMessage = 'Open the one-time invite link shared with you to join.') {
        CryptoManager.reset();
        this.latestFingerprint = '';
        this.lastAnnouncedEpoch = -1;
        this.updateFingerprintDisplay(null);
        this.resetMessageCounters();
        this.resetIdentityState();
        if (DOM.joinStatus) {
          DOM.joinStatus.textContent = statusMessage;
        }
        if (DOM.joinStatusDetail) {
          DOM.joinStatusDetail.textContent = detailMessage;
        }
        this.showScreen('joinScreen');
      }

      showChat() {
        console.log('Showing chat interface for room:', this.roomId);

        const welcomeScreen = DOM.welcomeScreen;
        const hostScreen = DOM.hostScreen;
        const joinScreen = DOM.joinScreen;
        const chatScreen = DOM.chatScreen;

        welcomeScreen?.classList.remove('active');
        hostScreen?.classList.remove('active');
        joinScreen?.classList.remove('active');
        chatScreen?.classList.add('active');

        const currentRoom = DOM.currentRoom;
        if (currentRoom) {
          currentRoom.textContent = this.roomId;
        }

        if (this.isHost && this.currentShareLink) {
          this.setWaitingBanner(true, this.currentShareLink, 'Share this link and send the password separately to your guest.');
        } else {
          this.setWaitingBanner(false);
        }

        this.subscribeToMessages(this.roomId);

        this.prepareIdentity().catch((error) => {
          console.warn('Failed to prepare identity for room.', error);
        });

        setTimeout(() => this.focusDefaultForScreen('chatScreen'), 100);
      }

      // Storage
      initStorage() {
        this.storage = new StorageManager();
        if (this.storage?.ready) {
          this.storage.ready.then(() => {
            initBus(this.storage);
            this.setupBusSubscriptions();
          });
        }
      }

      setupBusSubscriptions() {
        if (typeof this.roomListUnsub === 'function') {
          this.roomListUnsub();
        }

        this.roomListUnsub = subscribe('projection:roomList', (rooms) => this.renderRoomHistory(rooms));
        this.renderRoomHistory(projection.roomList());

        if (this.roomId) {
          this.renderChatMessages(projection.messagesByRoom(this.roomId));
        }
      }

      renderRoomHistory(rooms = []) {
        const container = DOM.roomHistory;
        const items = DOM.historyItems;

        if (!container || !items) {
          return;
        }

        const list = Array.isArray(rooms) ? rooms : [];

        if (list.length > 0) {
          container.style.display = 'block';
          items.innerHTML = '';

          list.forEach((room) => {
            const item = document.createElement('div');
            item.className = 'history-item';
            item.addEventListener('click', () => this.quickJoin(room.id));
            item.setAttribute('role', 'button');
            item.tabIndex = 0;
            item.addEventListener('keydown', (event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                this.quickJoin(room.id);
              }
            });

            const roomSpan = document.createElement('span');
            roomSpan.className = 'history-room';
            roomSpan.textContent = room.id;

            const timeSpan = document.createElement('span');
            timeSpan.className = 'history-time';
            const timestamp = room.lastActive || room.time || Date.now();
            timeSpan.textContent = new Date(timestamp).toLocaleDateString();

            item.appendChild(roomSpan);
            item.appendChild(timeSpan);
            items.appendChild(item);
          });
        } else {
          container.style.display = 'none';
          items.innerHTML = '';
        }
      }

      subscribeToMessages(roomId) {
        if (typeof this.messageSubscription === 'function') {
          this.messageSubscription();
          this.messageSubscription = null;
        }

        if (!roomId) {
          this.currentMessages = [];
          this.renderChatMessages([]);
          return;
        }

        this.currentMessages = projection.messagesByRoom(roomId);
        this.renderChatMessages(this.currentMessages);

        this.messageSubscription = subscribe(`messages:${roomId}`, (messages) => {
          this.renderChatMessages(Array.isArray(messages) ? messages : []);
        });
      }

      async persistRoom() {
        if (!this.roomId) {
          return;
        }

        try {
          await this.storage?.ready;
        } catch (error) {
          console.warn('Storage unavailable for room persistence.', error);
        }

        const actor = this.localUserId;
        const state = this.storage?.state;

        if (state && !state.rooms.has(this.roomId)) {
          await publish(
            makeEvent(
              'RoomCreated',
              { roomId: this.roomId, title: this.roomId },
              actor,
              [`room:${this.roomId}`]
            )
          ).catch((error) => console.warn('Failed to record room creation.', error));
        }

        const room = state?.rooms.get(this.roomId);
        if (!room?.members?.has(actor)) {
          await publish(
            makeEvent(
              'UserJoinedRoom',
              { roomId: this.roomId, userId: actor },
              actor,
              [`room:${this.roomId}`, `user:${actor}`]
            )
          ).catch((error) => console.warn('Failed to record room join.', error));
        }
      }

      quickJoin(roomId) {
        const detail = roomId
          ? `Ask the host for a fresh one-time invite to rejoin room ${roomId}.`
          : 'Ask the host for a fresh one-time invite to join again.';
        this.showJoin('Secure invite required', detail);
      }

      // Utilities
      getMonotonicTime(preferred) {
        const candidate = Number.isFinite(preferred) ? preferred : Date.now();
        if (!Number.isFinite(this.lastMonotonicTime)) {
          this.lastMonotonicTime = 0;
        }
        if (candidate <= this.lastMonotonicTime) {
          this.lastMonotonicTime += 1;
        } else {
          this.lastMonotonicTime = candidate;
        }
        return this.lastMonotonicTime;
      }

      generateRoomSalt() {
        if (!(typeof crypto !== 'undefined' && crypto.getRandomValues)) {
          throw new Error('Secure random generator unavailable');
        }

        const salt = crypto.getRandomValues(new Uint8Array(16));
        CryptoManager.setRoomSalt(salt);
        this.roomSalt = CryptoManager.getRoomSalt();
        this.roomSaltBase64 = this.bytesToBase64(this.roomSalt);
        return salt;
      }

      resetMessageCounters() {
        this.outgoingMessageNumber = 1;
        this.lastRotationMessageCount = 0;
        if (this.messageRateLimit) {
          this.messageRateLimit.timestamps = [];
        }
        this.seenIncomingSequences?.clear?.();
        this.highestIncomingSequence = 0;
        this.totalReceivedMessages = 0;
        this.reorderNoticeTimers?.clear?.();
        this.updatePendingMessages(0);
      }

      bytesToBase64(bytes) {
        if (!(bytes instanceof Uint8Array)) {
          return '';
        }
        let binary = '';
        bytes.forEach((b) => {
          binary += String.fromCharCode(b);
        });
        return btoa(binary);
      }

      base64ToBytes(input) {
        if (typeof input !== 'string' || !input.trim()) {
          return null;
        }
        let normalized = input.trim();
        normalized = normalized.replace(/\s+/g, '');
        normalized = normalized.replace(/-/g, '+').replace(/_/g, '/');
        while (normalized.length % 4 !== 0) {
          normalized += '=';
        }
        try {
          const binary = atob(normalized);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
          }
          return bytes;
        } catch (error) {
          return null;
        }
      }

      updateFingerprintDisplay(code) {
        const container = DOM.fingerprintDisplay;
        const codeEl = DOM.fingerprintCode;
        if (!container || !codeEl) {
          return;
        }

        if (typeof code === 'string' && code.trim()) {
          codeEl.textContent = code;
          container.classList.add('active');
        } else {
          codeEl.textContent = 'Waiting for secure connection…';
          container.classList.remove('active');
        }
      }

      generateRoomId() {
        if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
          return crypto.randomUUID();
        }
        return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
      }

      async copyRoomCode() {
        const roomCodeEl = DOM.roomCode;
        const code = roomCodeEl?.textContent;
        if (roomCodeEl && code && code !== 'Loading...') {
          const success = await this.copyText(code);
          const original = roomCodeEl.textContent;
          roomCodeEl.textContent = success ? '✅ Copied!' : '⚠️ Copy failed';
          if (!success) {
            this.showToast('Copy failed. Use manual copy instead.', 'warning');
          }
          setTimeout(() => {
            roomCodeEl.textContent = original;
          }, 2000);
        }
      }

      updateStatus(text, type) {
        const statusText = DOM.statusText;
        if (statusText) {
          statusText.textContent = text;
        }
        const dot = DOM.statusDot;
        if (dot) {
          dot.className = 'status-dot';
          if (type) dot.classList.add(type);
        }
      }

      // Crypto
      async sendSecureControlMessage(message) {
        if (!this.conn || !CryptoManager.getCurrentKey()) {
          return false;
        }

        try {
          const envelope = {
            kind: 'control',
            sentAt: Date.now(),
            control: { ...message }
          };
          const encrypted = await CryptoManager.encrypt(JSON.stringify(envelope));
          this.conn.send(encrypted);
          return true;
        } catch (error) {
          console.error('Failed to send secure control message.', error);
          return false;
        }
      }

      async rotateKeysIfNeeded() {
        if (!this.conn || !CryptoManager.getCurrentKey() || !CryptoManager.hasBaseMaterial()) {
          return;
        }

        const messagesSent = this.outgoingMessageNumber - 1;
        if (messagesSent <= 0 || this.keyRotationInterval <= 0) {
          return;
        }

        if (messagesSent % this.keyRotationInterval !== 0) {
          return;
        }

        if (this.lastRotationMessageCount === messagesSent) {
          return;
        }

        const nextEpoch = CryptoManager.getCurrentEpoch() + 1;

        const sent = await this.sendSecureControlMessage({
          type: 'key_rotation',
          epoch: nextEpoch,
          timestamp: Date.now()
        });

        if (!sent) {
          return;
        }

        try {
          const rotated = await CryptoManager.maybeRotate(nextEpoch);
          if (rotated) {
            this.lastRotationMessageCount = messagesSent;
          }
        } catch (error) {
          console.error('Failed to rotate local key material.', error);
          this.addSystemMessage('⚠️ Key rotation failed');
        }
      }

      initHeartbeat() {
        if (this.heartbeat?.timer) {
          clearInterval(this.heartbeat.timer);
        }

        this.heartbeat = {
          interval: 30000,
          timeout: 60000,
          lastReceived: Date.now(),
          timer: null
        };

        this.heartbeat.timer = setInterval(async () => {
          if (!this.conn) {
            return;
          }

          if (Date.now() - this.heartbeat.lastReceived > this.heartbeat.timeout) {
            this.addSystemMessage('⚠️ Connection timeout - peer unresponsive');
            this.handleDisconnect();
            return;
          }

          await this.sendSecureControlMessage({
            type: 'heartbeat',
            timestamp: Date.now()
          });
        }, this.heartbeat.interval);
      }

      stopHeartbeat() {
        if (this.heartbeat?.timer) {
          clearInterval(this.heartbeat.timer);
          this.heartbeat.timer = null;
        }
        this.heartbeat = null;
      }

      async handleHeartbeat(message) {
        if (!message || (message.type !== 'heartbeat' && message.type !== 'heartbeat_ack')) {
          return false;
        }

        if (!this.heartbeat) {
          this.initHeartbeat();
        }

        this.heartbeat.lastReceived = Date.now();
        if (this.remoteIdentity?.id) {
          this.roomMembers?.updatePresence(this.remoteIdentity.id);
        }

        if (message.type === 'heartbeat') {
          await this.sendSecureControlMessage({
            type: 'heartbeat_ack',
            timestamp: Date.now()
          });
        }

        return true;
      }

      async handleIncomingKeyRotation(message) {
        const epoch = Number(message?.epoch);
        if (!Number.isInteger(epoch)) {
          return;
        }

        try {
          const rotated = await CryptoManager.maybeRotate(epoch);
          if (!rotated) {
            if (!CryptoManager.hasBaseMaterial()) {
              this.addSystemMessage('⚠️ Received key rotation signal but missing base key');
            }
            console.warn('Ignored key rotation request for epoch', epoch);
          }
        } catch (error) {
          console.error('Failed to process incoming key rotation.', error);
          this.addSystemMessage('⚠️ Failed to process key rotation signal');
        }
      }

      async handleControlMessage(message) {
        if (!message || typeof message.type !== 'string') {
          return false;
        }

        if (message.type === 'key_rotation') {
          await this.handleIncomingKeyRotation(message);
          return true;
        }

        if (message.type === 'heartbeat' || message.type === 'heartbeat_ack') {
          await this.handleHeartbeat(message);
          return true;
        }

        if (message.type === 'key_exchange' || message.type === 'key_exchange_ack') {
          await this.handleKeyExchangeMessage(message);
          return true;
        }

        if (message.type === 'identity_profile') {
          this.handleIncomingIdentity(message.identity || {});
          return true;
        }

        return false;
      }

      handleDisconnect() {
        this.stopHeartbeat();
        if (this.conn) {
          try {
            this.conn.close();
          } catch (error) {
            console.warn('Failed to close connection cleanly.', error);
          }
        }
      }

      async startKeyExchange() {
        if (!this.flags.enableECDH) {
          return;
        }
        if (this.sentKeyExchange || !this.conn || !crypto?.subtle) {
          return;
        }

        try {
          let keyPair = CryptoManager.getECDHKeyPair();
          if (!keyPair) {
            keyPair = await CryptoManager.beginECDH();
          }

          const publicKey = await crypto.subtle.exportKey('raw', keyPair.publicKey);
          const message = {
            type: 'key_exchange',
            publicKey: Array.from(new Uint8Array(publicKey)),
            timestamp: Date.now()
          };

          const sent = await this.sendSecureControlMessage(message);
          if (sent) {
            this.sentKeyExchange = true;
          }
        } catch (error) {
          console.error('Failed to initiate key exchange.', error);
        }
      }

      async handleKeyExchangeMessage(message) {
        if (!this.flags.enableECDH) {
          return;
        }
        if (this.keyExchangeComplete) {
          return;
        }

        if (!message?.publicKey || !Array.isArray(message.publicKey)) {
          return;
        }

        try {
          const peerKeyBytes = new Uint8Array(message.publicKey);
          const sharedSecret = await CryptoManager.applyPeerECDH(peerKeyBytes);
          await this.applySharedSecret(sharedSecret);

          if (!this.sentKeyExchange) {
            await this.startKeyExchange();
          }
        } catch (error) {
          console.error('Failed to process key exchange message.', error);
        }
      }

      async applySharedSecret(sharedSecret) {
        if (!this.flags.enableECDH) {
          return;
        }
        if (!(sharedSecret instanceof Uint8Array) || sharedSecret.length === 0) {
          return;
        }

        if (!(this.roomSalt instanceof Uint8Array)) {
          this.generateRoomSalt();
        }

        this.resetMessageCounters();

        await CryptoManager.promoteSharedSecret(sharedSecret);
        this.lastRotationMessageCount = 0;
        this.keyExchangeComplete = true;
        this.addSystemMessage('🔐 Secure channel upgraded with Diffie-Hellman key exchange');
      }

      // Peer Connection
      async startHost() {
        this.isHost = true;
        if (!this.roomId) {
          this.roomId = this.generateRoomId();
        }

        let hostSeat;
        let guestSeat;

        try {
          [hostSeat, guestSeat] = await Promise.all([
            SecureInvite.generateSeat(),
            SecureInvite.generateSeat()
          ]);
        } catch (error) {
          console.error('Failed to create secure invites.', error);
          alert('Unable to generate secure invites. Please reload and try again.');
          return;
        }

        this.seats = { host: hostSeat, guest: guestSeat };
        this.updateInviteVisuals();

        const seatSalt = SecureInvite.fromBase64Url(guestSeat.seatId);
        if (!(seatSalt instanceof Uint8Array)) {
          alert('Unable to prepare the secure invite. Please try again.');
          return;
        }

        try {
          CryptoManager.setRoomSalt(seatSalt);
          this.roomSalt = CryptoManager.getRoomSalt();
          this.roomSaltBase64 = this.bytesToBase64(this.roomSalt);
          await CryptoManager.loadStaticKeyFromSeat(guestSeat.secretKey, guestSeat.seatId);
        } catch (error) {
          console.error('Failed to initialize seat key material.', error);
          alert('Unable to prepare the secure invite. Please reload and try again.');
          return;
        }

        try {
          await this.inviteManagerReady;
          const token = `${this.roomId}.${hostSeat.seatId}`;
          this.inviteManager?.markClaimed(token, hostSeat.expiresAt).catch(() => {});
        } catch (error) {
          console.warn('Unable to persist host invite claim.', error);
        }

        this.keyExchangeComplete = false;
        this.sentKeyExchange = false;
        CryptoManager.clearECDHKeyPair();
        this.resetMessageCounters();
        this.resetConversationState();
        this.updateStatus('Creating room...', 'connecting');

        let shareLink = '';
        try {
          shareLink = await this.generateShareLink(this.roomId, guestSeat);
        } catch (error) {
          console.error('Failed to generate invite link.', error);
          alert('Unable to generate the invite link. Please try again.');
          return;
        }

        this.updateInviteLink(shareLink);
        this.updateSimpleShareStatus('');
        this.setWaitingBanner(true, shareLink, 'Share this one-time secure link with your guest.');
        this.showChat();

        initPeer(this, this.roomId);
      }

      async startJoinFromInvite(invite) {
        if (!invite?.roomId || !invite?.seatId || !invite?.secretKey) {
          throw new Error('Incomplete invite data');
        }

        await this.inviteManagerReady;
        await this.inviteManager?.validateInvite(invite);

        const seatBytes = SecureInvite.fromBase64Url(invite.seatId);
        if (!(seatBytes instanceof Uint8Array)) {
          throw new Error('Invalid invite seat identifier');
        }

        this.roomId = invite.roomId;
        this.isHost = false;
        this.currentShareLink = '';
        this.seats = { host: null, guest: { ...invite, claimed: true } };
        this.updateInviteVisuals();
        this.resetConversationState();
        CryptoManager.setRoomSalt(seatBytes);
        this.roomSalt = CryptoManager.getRoomSalt();
        this.roomSaltBase64 = this.bytesToBase64(this.roomSalt);

        await CryptoManager.loadStaticKeyFromSeat(invite.secretKey, invite.seatId);

        this.pendingRoomSalt = null;
        this.keyExchangeComplete = false;
        this.sentKeyExchange = false;
        CryptoManager.clearECDHKeyPair();
        this.resetMessageCounters();
        this.updateStatus('Connecting...', 'connecting');
        this.setWaitingBanner(false, '');

        const joinerId = 'join-' + Math.random().toString(36).substr(2, 9);
        initPeer(this, joinerId);
      }

      // Messaging
      canSendMessage() {
        const now = Date.now();
        const limits = this.messageRateLimit;
        const oneMinuteAgo = now - 60000;
        limits.timestamps = limits.timestamps.filter((t) => t > oneMinuteAgo);

        if (limits.timestamps.length >= limits.maxPerMinute) {
          return { allowed: false, reason: 'Limit reached: 30 messages per minute' };
        }

        const twoSecondsAgo = now - 2000;
        const recent = limits.timestamps.filter((t) => t > twoSecondsAgo);
        if (recent.length >= limits.maxBurst) {
          return { allowed: false, reason: 'Slow down' };
        }

        return { allowed: true };
      }

      async sendMessage() {
        const input = DOM.messageInput;
        if (!input) {
          return;
        }
        const text = input.value.trim();

        if (!text || !this.conn) {
          return;
        }

        if (!CryptoManager.getCurrentKey()) {
          this.addSystemMessage('⚠️ Encryption key not ready yet.');
          this.showToast('Encryption key not ready yet.', 'warning');
          return;
        }

        if (text.length > MAX_MESSAGE_SIZE) {
          const warning = `Message too long (max ${MAX_MESSAGE_SIZE} characters)`;
          this.addSystemMessage(`⚠️ ${warning}`);
          this.showToast(warning, 'warning');
          return;
        }

        const rateCheck = this.canSendMessage();
        if (!rateCheck.allowed) {
          const now = Date.now();
          if (now - this.lastRateLimitWarningAt > this.rateLimitWarningCooldown) {
            this.addSystemMessage(`⚠️ ${rateCheck.reason}`);
            this.showToast(rateCheck.reason, 'warning');
            this.lastRateLimitWarningAt = now;
          }
          return;
        }

        const bufferSize = Number(this.conn?.bufferSize ?? 0);
        if (bufferSize > this.backpressureThreshold) {
          const now = Date.now();
          if (now - this.lastBufferWarningAt > this.bufferWarningCooldown) {
            const notice = '📦 sending… Connection is catching up. Message not sent.';
            this.addSystemMessage(notice);
            this.showToast('Connection is busy — try again shortly.', 'warning');
            this.lastBufferWarningAt = now;
          }
          return;
        }

        input.value = '';
        const sentAtLocal = this.getMonotonicTime();

        const sequenceNumber = this.outgoingMessageNumber;
        const routePath = this.getDefaultRoutePath('me');
        const hopCount = Math.max(routePath.length - 1, 1);

        const envelope = {
          kind: 'data',
          n: sequenceNumber,
          sentAt: sentAtLocal,
          data: { text }
        };

        let encrypted;
        try {
          encrypted = await CryptoManager.encrypt(JSON.stringify(envelope));
        } catch (error) {
          console.error('Failed to encrypt message.', error);
          this.addSystemMessage('⚠️ Unable to encrypt message');
          this.showToast('Unable to encrypt message', 'error');
          return;
        }

        this.lastEncryptedHex = Array.from(encrypted)
          .map(b => b.toString(16).padStart(2, '0'))
          .join('');

        this.messageRateLimit.timestamps.push(Date.now());

        this.outgoingMessageNumber += 1;

        if (this.roomId) {
          const messageId = generateId('msg-');
          const event = makeEvent(
            'MessagePosted',
            {
              roomId: this.roomId,
              messageId,
              userId: this.localUserId,
              text,
              type: 'me',
              sentAt: sentAtLocal,
              sentAtLocal,
              receivedAt: sentAtLocal,
              hops: hopCount,
              routePath,
              arrivalTime: sentAtLocal,
              state: 'settled',
              vectorClock: this.buildVectorClock(sequenceNumber, this.localIdentity?.id || this.localUserId),
              sequence: sequenceNumber,
              originalPosition: null,
              isOutOfOrder: false
            },
            this.localUserId,
            [`room:${this.roomId}`, `msg:${messageId}`]
          );

          try {
            this.cacheEncryptedMessage(messageId, encrypted);
            await publish(event);
          } catch (error) {
            console.warn('Failed to persist outgoing message event.', error);
          }
        }

        if (this.conn) {
          this.conn.send(encrypted);
        }

        await this.rotateKeysIfNeeded();
      }

      toggleEncryptedView() {
        if (!this.flags.showEncryptedView) {
          return;
        }
        this.showEncrypted = !this.showEncrypted;
        const toggle = DOM.encryptedToggle;
        if (toggle) {
          toggle.classList.toggle('active', this.showEncrypted);
          toggle.setAttribute('aria-pressed', this.showEncrypted ? 'true' : 'false');
        }
        this.renderChatMessages();
      }

      resetConversationState() {
        this.currentMessages = [];
        this.systemLog = [];
        this.systemOrderCounter = 0;
        this.encryptedCache = new Map();
        this.lastEncryptedHex = '';
        this.messageDetailCache?.clear?.();
        this.reorderNoticeTimers?.clear?.();
        this.updatePendingMessages(0);
        this.updateAverageHops(0);
        if (this.systemAnnouncements) {
          this.systemAnnouncements.textContent = '';
        }
        this.renderChatMessages([]);
      }

      renderChatMessages(messages = this.currentMessages) {
        const container = DOM.chatMessages;
        if (!container) {
          return;
        }

        this.timeline.setContainer(container);
        const shouldStick = this.timeline.isNearBottom();

        this.currentMessages = Array.isArray(messages) ? messages : [];

        const enriched = this.timeline.enrichMessages(this.currentMessages);
        const messageEntries = enriched.map((entry) => ({
          ...entry,
          kind: 'message',
          encrypted: this.encryptedCache.get(entry.id) || null
        }));

        const now = Date.now();
        if (!this.reorderNoticeTimers) {
          this.reorderNoticeTimers = new Map();
        }
        for (const [id, expiry] of this.reorderNoticeTimers) {
          if (expiry <= now) {
            this.reorderNoticeTimers.delete(id);
          }
        }
        messageEntries.forEach((entry) => {
          if (entry.isOutOfOrder) {
            this.reorderNoticeTimers.set(entry.id, now + CONFIG.reorderBadgeFadeDelay);
          }
        });

        const combined = [...messageEntries, ...this.systemLog];
        combined.sort((a, b) => {
          const timeA = a.displayAt ?? a.at ?? 0;
          const timeB = b.displayAt ?? b.at ?? 0;
          if (timeA !== timeB) {
            return timeA - timeB;
          }
          const orderA = (a.localOrder ?? a.order ?? 0);
          const orderB = (b.localOrder ?? b.order ?? 0);
          if (orderA !== orderB) {
            return orderA - orderB;
          }
          const receivedDiff = (a.receivedAt ?? timeA) - (b.receivedAt ?? timeB);
          if (receivedDiff !== 0) {
            return receivedDiff;
          }
          return (a.sentAt ?? timeA) - (b.sentAt ?? timeB);
        });

        container.innerHTML = '';

        this.messageDetailCache = new Map();
        const totalHops = messageEntries.reduce((sum, entry) => sum + (entry.hops || 0), 0);
        const averageHops = messageEntries.length > 0 ? totalHops / messageEntries.length : 0;
        this.updateAverageHops(averageHops);
        this.updatePendingMessages(this.reorderNoticeTimers.size);

        messageEntries.forEach((entry) => {
          this.messageDetailCache.set(entry.id, { ...entry });
        });

        combined.forEach((entry) => {
          let element = null;

          if (entry.kind === 'system') {
            element = this.createSystemMessageElement(entry);
          } else if (entry.kind === 'message') {
            if (this.showEncrypted) {
              element = entry.encrypted
                ? this.createEncryptedMessageElement(entry)
                : this.createEncryptedPlaceholderElement(entry);
            } else {
              element = this.createPlainMessageElement(entry);
            }
          }

          if (element) {
            container.appendChild(element);
          }
        });

        if (shouldStick) {
          container.scrollTop = container.scrollHeight;
        }
      }

      createPlainMessageElement(entry) {
        const { text, type, displayAt } = entry;
        const message = document.createElement('div');
        message.className = `message ${type}`;

        const content = document.createElement('div');
        content.className = 'message-content';

        const textEl = document.createElement('div');
        textEl.className = 'message-text';
        textEl.textContent = text;

        const meta = document.createElement('div');
        meta.className = 'message-time message-meta';

        const timestamp = document.createElement('span');
        timestamp.className = 'timestamp';
        const shownTime = Number.isFinite(displayAt) ? displayAt : Date.now();
        timestamp.textContent = this.formatTimestamp(shownTime);

        const stateDots = document.createElement('span');
        stateDots.className = 'state-dots';
        stateDots.textContent = this.getMessageStateDots(entry.state);
        stateDots.setAttribute('aria-label', `Message ${entry.state || 'settled'}`);

        meta.appendChild(timestamp);
        meta.appendChild(stateDots);

        content.appendChild(textEl);
        content.appendChild(meta);
        message.appendChild(content);

        return this.applyMessageMetadata(message, entry);
      }

      getMessageStateDots(state) {
        switch (state) {
          case 'sending':
            return '●○○';
          case 'propagating':
            return '●●○';
          case 'settling':
            return '●●●';
          case 'settled':
          default:
            return '●●●';
        }
      }

      createEncryptedMessageElement(entry) {
        const { encrypted, type, receivedAt, displayAt } = entry;
        const payload = encrypted instanceof Uint8Array ? encrypted : this.toUint8Array(encrypted);

        if (!(payload instanceof Uint8Array) || payload.length === 0) {
          return this.createEncryptedPlaceholderElement(entry);
        }

        const message = document.createElement('div');
        message.className = `message ${type} encrypted-view`;

        const content = document.createElement('div');
        content.className = 'message-content';

        const wrapper = document.createElement('div');
        wrapper.className = 'encrypted-data';

        const iv = payload.slice(0, 12);
        const ciphertext = payload.slice(12);

        const ivLabel = document.createElement('div');
        ivLabel.className = 'data-label';
        ivLabel.textContent = `IV (${iv.length} bytes):`;

        const ivHex = document.createElement('div');
        ivHex.className = 'data-hex';
        const ivHexInfo = this.hexFromBytes(iv);
        ivHex.textContent = ivHexInfo.text || '—';

        const cipherLabel = document.createElement('div');
        cipherLabel.className = 'data-label';
        cipherLabel.textContent = 'Ciphertext:';

        const cipherHex = document.createElement('div');
        cipherHex.className = 'data-hex';
        const cipherHexInfo = this.hexFromBytes(ciphertext, 60);
        cipherHex.textContent = cipherHexInfo.text || '—';

        const info = document.createElement('div');
        info.className = 'data-info';
        const segments = [`Total: ${payload.length} bytes`];
        if (cipherHexInfo.truncated) {
          segments.push('Preview limited to first 60 bytes');
        }
        const shownTime = typeof receivedAt === 'number' ? receivedAt : displayAt;
        segments.push(this.formatTimestamp(shownTime));
        info.textContent = segments.join(' • ');

        wrapper.appendChild(ivLabel);
        wrapper.appendChild(ivHex);
        wrapper.appendChild(cipherLabel);
        wrapper.appendChild(cipherHex);
        wrapper.appendChild(info);

        content.appendChild(wrapper);
        message.appendChild(content);

        return this.applyMessageMetadata(message, entry);
      }

      createEncryptedPlaceholderElement(entry) {
        const { type, receivedAt, displayAt } = entry;
        const message = document.createElement('div');
        message.className = `message ${type} encrypted-view`;

        const content = document.createElement('div');
        content.className = 'message-content';

        const wrapper = document.createElement('div');
        wrapper.className = 'encrypted-data';

        const label = document.createElement('div');
        label.className = 'data-label';
        label.textContent = 'Encrypted Payload';

        const details = document.createElement('div');
        details.className = 'data-hex';
        details.textContent = 'Unavailable (loaded from history)';

        const info = document.createElement('div');
        info.className = 'data-info';
        const shownTime = typeof receivedAt === 'number' ? receivedAt : displayAt;
        info.textContent = this.formatTimestamp(shownTime);

        wrapper.appendChild(label);
        wrapper.appendChild(details);
        wrapper.appendChild(info);

        content.appendChild(wrapper);
        message.appendChild(content);

        return this.applyMessageMetadata(message, entry);
      }

      createReorderBadge(entry) {
        if (!entry?.id) {
          return null;
        }
        const badge = document.createElement('button');
        badge.className = 'reorder-badge';
        badge.type = 'button';
        const hopCount = Number.isFinite(entry.hops) ? entry.hops : 0;
        const labelText = CONFIG.showHopCount ? `${hopCount} hops` : 'View route';
        badge.setAttribute('aria-label', `Message settled out of order via ${labelText}`);

        const icon = document.createElement('span');
        icon.className = 'badge-icon';
        icon.textContent = '↑';

        const text = document.createElement('span');
        text.className = 'badge-text';
        text.textContent = labelText;

        badge.appendChild(icon);
        badge.appendChild(text);

        badge.addEventListener('click', (event) => {
          event.stopPropagation();
          this.showMessageDetails(entry.id);
        });

        return badge;
      }

      applyMessageMetadata(message, entry) {
        if (!message || !entry) {
          return message;
        }

        message.dataset.id = entry.id;
        if (entry.state) {
          message.dataset.state = entry.state;
        }
        if (Number.isFinite(entry.hops)) {
          message.dataset.hops = String(entry.hops);
        }
        if (Number.isFinite(entry.arrivalOrderIndex)) {
          message.dataset.arrivalIndex = String(entry.arrivalOrderIndex);
        }
        if (Number.isFinite(entry.temporalOrderIndex)) {
          message.dataset.temporalIndex = String(entry.temporalOrderIndex);
        }
        if (Number.isFinite(entry.originalPosition)) {
          message.dataset.originalPosition = String(entry.originalPosition);
        }

        if (entry.isOutOfOrder) {
          message.classList.add('reordered');
          const badge = this.createReorderBadge(entry);
          if (badge) {
            message.insertBefore(badge, message.firstChild);
          }
        }

        return message;
      }

      showMessageDetails(messageId) {
        if (!messageId || !this.messageDetailsModal) {
          return;
        }
        if (!this.messageDetailCache?.has(messageId)) {
          return;
        }
        this.messageDetailsModal.show(messageId);
      }

      getDefaultRoutePath(type = 'them') {
        const localName = this.localIdentity?.displayName || 'You';
        const remoteName = this.remoteIdentity?.displayName || 'Peer';
        const relay = 'Mesh relay';
        if (type === 'me') {
          return CONFIG.showRoutePath ? [localName, relay, remoteName] : [localName, remoteName];
        }
        return CONFIG.showRoutePath ? [remoteName, relay, localName] : [remoteName, localName];
      }

      buildVectorClock(sequence, actorId) {
        if (!Number.isFinite(sequence)) {
          return {};
        }
        const actor = actorId || this.localIdentity?.id || this.localUserId;
        if (!actor) {
          return {};
        }
        return { [actor]: sequence };
      }

      createSystemMessageElement(entry) {
        const message = document.createElement('div');
        message.className = 'system-message';
        message.textContent = entry.text;
        return message;
      }

      formatTimestamp(at) {
        const value = typeof at === 'number' ? at : Date.now();
        return new Date(value).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit'
        });
      }

      hexFromBytes(data, limit) {
        if (!(data instanceof Uint8Array)) {
          return { text: '', truncated: false };
        }

        const bytes = Array.from(data);
        const shouldLimit = typeof limit === 'number' && limit > 0;
        const truncated = shouldLimit && bytes.length > limit;
        const slice = shouldLimit ? bytes.slice(0, limit) : bytes;
        const text = slice.map(b => b.toString(16).padStart(2, '0')).join(' ');
        return {
          text: truncated ? `${text} ...` : text,
          truncated
        };
      }

      toUint8Array(data) {
        if (!data) {
          return null;
        }
        if (data instanceof Uint8Array) {
          return data.slice();
        }
        if (ArrayBuffer.isView(data) && data.buffer) {
          return new Uint8Array(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength));
        }
        if (data instanceof ArrayBuffer) {
          return new Uint8Array(data);
        }
        return null;
      }

      cacheEncryptedMessage(messageId, encryptedData) {
        if (!messageId) {
          return;
        }

        const payload = this.toUint8Array(encryptedData);
        if (!payload) {
          return;
        }

        this.encryptedCache.set(messageId, payload);
      }

      ensureToastContainer() {
        if (this.toastContainer && document.body.contains(this.toastContainer)) {
          return this.toastContainer;
        }

        const container = document.createElement('div');
        container.className = 'toast-container';
        document.body.appendChild(container);
        this.toastContainer = container;
        return container;
      }

      showToast(message, tone = 'info', duration = 4000) {
        if (!message || typeof document === 'undefined') {
          return;
        }

        const container = this.ensureToastContainer();
        if (!container) {
          return;
        }

        const toast = document.createElement('div');
        toast.className = `toast toast-${tone}`;
        toast.textContent = message;
        container.appendChild(toast);

        requestAnimationFrame(() => {
          toast.classList.add('visible');
        });

        setTimeout(() => {
          toast.classList.remove('visible');
          setTimeout(() => {
            toast.remove();
            if (container.childElementCount === 0 && this.toastContainer === container) {
              container.remove();
              this.toastContainer = null;
            }
          }, 300);
        }, Math.max(1000, duration || 0));
      }

      addSystemMessage(text) {
        const timestamp = this.getMonotonicTime();
        this.systemOrderCounter += 1;
        this.systemLog.push({
          kind: 'system',
          text,
          at: timestamp,
          displayAt: timestamp,
          receivedAt: timestamp,
          localOrder: this.systemOrderCounter,
          order: this.systemOrderCounter
        });
        if (this.systemAnnouncements) {
          this.systemAnnouncements.textContent = text;
        }
        this.renderChatMessages();
      }

      async showSchemaView() {
        if (this.storage?.ready) {
          try {
            await this.storage.ready;
          } catch (error) {
            console.warn('Storage not ready for schema view.', error);
          }
        }

        let verificationPassed = null;
        let verificationDetails = null;
        if (typeof this.storage?.verify === 'function') {
          try {
            verificationPassed = await this.storage.verify();
          } catch (error) {
            console.warn('Storage verification failed to complete.', error);
            verificationPassed = false;
          }
          verificationDetails = this.storage?.lastVerification || null;
        }

        let state = this.storage?.state;
        if (!(state instanceof ChatState)) {
          state = new ChatState();
        }

        let snapshot;
        try {
          snapshot = serializeState(state);
        } catch (error) {
          console.warn('Unable to serialize state snapshot.', error);
          snapshot = serializeState(new ChatState());
        }

        let recentEvents = [];
        if (typeof this.storage?.loadEventsAfter === 'function') {
          try {
            recentEvents = await this.storage.loadEventsAfter(Date.now() - 86400000);
          } catch (error) {
            console.warn('Unable to load recent events.', error);
            recentEvents = [];
          }
        }

        if (!Array.isArray(recentEvents)) {
          recentEvents = [];
        }

        recentEvents.sort((a, b) => (a.at || 0) - (b.at || 0));
        const timelineEvents = recentEvents.slice(-20);

        let verificationBadgeClass = 'pending';
        let verificationBadgeText = 'Verification unavailable';
        if (verificationPassed === true) {
          verificationBadgeClass = 'ok';
          verificationBadgeText = '✅ Storage verified';
        } else if (verificationPassed === false) {
          verificationBadgeClass = 'error';
          verificationBadgeText = '❌ Verification failed';
        }

        const summaryParts = [];
        if (verificationDetails?.totalEvents !== undefined && verificationDetails?.totalEvents !== null) {
          summaryParts.push(`events: ${verificationDetails.totalEvents}`);
        }
        if (verificationDetails?.eventsReplayed !== undefined && verificationDetails?.eventsReplayed !== null) {
          summaryParts.push(`replay: ${verificationDetails.eventsReplayed}`);
        }
        if (verificationDetails?.snapshotAt) {
          try {
            const snapshotDate = new Date(verificationDetails.snapshotAt);
            if (!Number.isNaN(snapshotDate.getTime())) {
              summaryParts.push(`snapshot: ${snapshotDate.toLocaleTimeString()}`);
            }
          } catch (error) {
            // Ignore invalid date formatting
          }
        }
        if (Array.isArray(verificationDetails?.mismatches) && verificationDetails.mismatches.length > 0) {
          summaryParts.push(`issues: ${verificationDetails.mismatches.join(', ')}`);
        }
        const verificationSummaryText = summaryParts.join(' · ');

        let shouldResetHash = false;
        if (this.devToolsEnabled && typeof window !== 'undefined') {
          const currentHash = window.location.hash;
          if (currentHash !== '#schema') {
            window.history.replaceState({}, document.title, `${window.location.pathname}${window.location.search}#schema`);
            shouldResetHash = true;
          } else {
            shouldResetHash = true;
          }
        }

        const existingModal = document.querySelector('.schema-modal');
        if (existingModal) {
          existingModal.remove();
        }

        const roomsCount = snapshot.rooms?.length || 0;
        const messagesCount = snapshot.messages?.length || 0;
        const eventsCount = recentEvents.length;

        const modal = document.createElement('div');
        modal.className = 'schema-modal';
        modal.innerHTML = `
          <div class="schema-content">
            <div class="schema-header">
              <h2>Data Architecture</h2>
              <div class="schema-status">
                <span class="schema-badge">Verifying…</span>
                <small class="schema-summary"></small>
              </div>
              <button type="button" aria-label="Close schema view">✕</button>
            </div>
            <div class="schema-section">
              <h3>Event Log Structure</h3>
              <div class="schema-code">
                <pre>{
  id: "evt-xxxx",
  op: "MessagePosted" | "RoomCreated" | "UserJoined" | ...,
  payload: { /* operation-specific data */ },
  actor: "user-id",
  refs: ["room:xxx", "msg:xxx"],
  at: timestamp,
  semver: "1.0.0"
}</pre>
              </div>
            </div>
            <div class="schema-section">
              <h3>Current State Snapshot</h3>
              <div class="schema-tabs">
                <button class="tab-btn active" data-tab="schema-rooms">Rooms (${roomsCount})</button>
                <button class="tab-btn" data-tab="schema-messages">Messages (${messagesCount})</button>
                <button class="tab-btn" data-tab="schema-events">Events (${eventsCount})</button>
              </div>
              <div id="schema-rooms" class="tab-content active"><pre></pre></div>
              <div id="schema-messages" class="tab-content"><pre></pre></div>
              <div id="schema-events" class="tab-content"><div class="events-timeline"></div></div>
            </div>
            <div class="schema-section">
              <h3>Storage Layers</h3>
              <div class="storage-diagram">
                <div class="storage-layer">
                  <strong>IndexedDB Stores:</strong>
                  <ul>
                    <li>events: All domain events (append-only log)</li>
                    <li>snapshots: Periodic state snapshots</li>
                    <li>blobs: Binary attachments (future)</li>
                  </ul>
                </div>
                <div class="storage-layer">
                  <strong>In-Memory State (ChatState):</strong>
                  <ul>
                    <li>rooms: Map&lt;roomId, RoomData&gt;</li>
                    <li>messages: Map&lt;messageId, Message&gt;</li>
                    <li>byRoom: Map&lt;roomId, messageId[]&gt;</li>
                    <li>reactions: Map&lt;messageId, Map&lt;emoji, Set&lt;userId&gt;&gt;&gt;</li>
                  </ul>
                </div>
              </div>
            </div>
            <div class="schema-section">
              <h3>Encryption Details</h3>
              <div class="schema-code">
                <pre>Key Derivation: PBKDF2 (100,000 iterations, SHA-256)
Encryption: AES-GCM (256-bit key)
Message Format: [IV (12 bytes)][Ciphertext (variable)]
Current Key: ${CryptoManager.getCurrentKey() ? 'Loaded ✓' : 'Not set ✗'}</pre>
              </div>
            </div>
          </div>
        `;

        const badgeEl = modal.querySelector('.schema-badge');
        if (badgeEl) {
          badgeEl.classList.add(verificationBadgeClass);
          badgeEl.textContent = verificationBadgeText;
        }

        const summaryEl = modal.querySelector('.schema-summary');
        if (summaryEl) {
          if (verificationSummaryText) {
            summaryEl.textContent = verificationSummaryText;
            summaryEl.style.display = 'inline';
          } else {
            summaryEl.textContent = '';
            summaryEl.style.display = 'none';
          }
        }

        const roomsPre = modal.querySelector('#schema-rooms pre');
        if (roomsPre) {
          roomsPre.textContent = JSON.stringify(snapshot.rooms || [], null, 2);
        }

        const messagesPre = modal.querySelector('#schema-messages pre');
        if (messagesPre) {
          const recentMessages = Array.isArray(snapshot.messages)
            ? snapshot.messages.slice(-10)
            : [];
          messagesPre.textContent = JSON.stringify(recentMessages, null, 2);
        }

        const eventsTimeline = modal.querySelector('#schema-events .events-timeline');
        if (eventsTimeline) {
          if (timelineEvents.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'event-item';
            empty.textContent = 'No events captured in the last 24 hours.';
            eventsTimeline.appendChild(empty);
          } else {
            timelineEvents.forEach((event) => {
              const item = document.createElement('div');
              item.className = 'event-item';

              const op = document.createElement('div');
              op.className = 'event-op';
              op.textContent = event.op || 'Unknown Event';

              const details = document.createElement('div');
              details.className = 'event-details';

              const idSpan = document.createElement('span');
              idSpan.className = 'event-id';
              idSpan.textContent = event.id || '—';

              const timeSpan = document.createElement('span');
              timeSpan.className = 'event-time';
              timeSpan.textContent = new Date(event.at || Date.now()).toLocaleString();

              details.appendChild(idSpan);
              details.appendChild(timeSpan);

              const payload = document.createElement('div');
              payload.className = 'event-payload';
              payload.textContent = JSON.stringify(event.payload ?? {}, null, 2);

              item.appendChild(op);
              item.appendChild(details);
              item.appendChild(payload);

              eventsTimeline.appendChild(item);
            });
          }
        }

        const handleClose = () => {
          modal.remove();
          if (shouldResetHash && typeof window !== 'undefined') {
            window.history.replaceState({}, document.title, `${window.location.pathname}${window.location.search}`);
          }
        };

        const closeBtn = modal.querySelector('.schema-header button');
        if (closeBtn) {
          closeBtn.addEventListener('click', handleClose);
        }

        modal.addEventListener('click', (event) => {
          if (event.target === modal) {
            handleClose();
          }
        });

        modal.querySelectorAll('.tab-btn').forEach((btn) => {
          btn.addEventListener('click', () => {
            modal.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
            modal.querySelectorAll('.tab-content').forEach((content) => content.classList.remove('active'));
            btn.classList.add('active');
            const target = modal.querySelector(`#${btn.dataset.tab}`);
            if (target) {
              target.classList.add('active');
            }
          });
        });

        document.body.appendChild(modal);
      }

      // Disconnect
      disconnect() {
        const activeRoom = this.roomId;
        if (activeRoom) {
          publish(makeEvent('UserLeftRoom', { roomId: activeRoom, userId: this.localUserId }, this.localUserId, [`room:${activeRoom}`, `user:${this.localUserId}`])).catch((error) => console.warn('Failed to record room leave.', error));
        }

        if (typeof this.messageSubscription === 'function') {
          this.messageSubscription();
          this.messageSubscription = null;
        }

        this.resetConversationState();

        this.setWaitingBanner(false, '', 'Share the secure invite link below to bring someone into this room.');
        this.currentShareLink = '';
        this.isHost = false;
        this.roomSalt = null;
        this.roomSaltBase64 = '';
        this.pendingRoomSalt = null;
        CryptoManager.setRoomSalt(null);
        this.resetMessageCounters();
        this.stopHeartbeat();
        this.keyExchangeComplete = false;
        this.sentKeyExchange = false;
        this.lastAnnouncedEpoch = -1;
        this.latestFingerprint = '';
        CryptoManager.reset();
        this.resetIdentityState();

        this.invitePanelUnlocked = false;
        this.stopInviteCountdown(true);
        this.updateInviteLink('');
        this.updateSimpleShareStatus('');
        this.updateFingerprintDisplay(null);
        this.updateInviteVisuals();

        if (this.conn) this.conn.close();
        if (this.peer) this.peer.destroy();

        this.conn = null;
        this.peer = null;
        this.roomId = null;
        this.remoteUserId = null;
        this.showEncrypted = false;
        this.lastEncryptedHex = '';
        this.renderChatMessages();

        const encryptedToggle = DOM.encryptedToggle;
        if (encryptedToggle) {
          encryptedToggle.classList.remove('active');
        }

        const inviteInput = DOM.inviteLink;
        if (inviteInput) {
          inviteInput.value = 'Generating secure link...';
          delete inviteInput.dataset.link;
        }

        this.updateStatus('Disconnected', '');
        this.showWelcome();
      }
    }

    // Initialize app
    window.App = new SecureChat();

    // Service Worker (if you have one)
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch(err => {
        console.log('Service worker registration failed:', err);
      });
    }
