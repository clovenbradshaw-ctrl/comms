const DOM = {
  messageInput: document.getElementById('messageInput'),
  sendBtn: document.getElementById('sendBtn'),
  simpleEmail: document.getElementById('simpleEmail'),
  simpleShareStatus: document.getElementById('simpleShareStatus'),
  inviteLink: document.getElementById('inviteLink'),
  copyInviteBtn: document.getElementById('copyInviteBtn'),
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
  roomHistoryContent: document.getElementById('roomHistoryContent'),
  fingerprintDisplay: document.getElementById('fingerprintDisplay'),
  fingerprintCode: document.getElementById('fingerprintCode'),
  statusText: document.getElementById('statusText'),
  statusDot: document.getElementById('statusDot'),
  chatMessages: document.getElementById('chatMessages'),
  networkStatus: document.getElementById('networkStatus'),
  encryptedToggle: document.getElementById('encryptedToggle'),
  schemaToggle: document.getElementById('schemaToggle'),
  systemAnnouncements: document.getElementById('systemAnnouncements'),
  typingIndicator: document.getElementById('typingIndicator'),
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
  identitySubmitBtn: document.getElementById('identitySubmitBtn'),
  reentryContainer: document.getElementById('reentryContainer'),
  workspaceRoot: document.getElementById('workspaceRoot'),
  legacyRoot: document.getElementById('legacyApp')
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

class RoomURLManager {
  constructor(app) {
    this.app = app;
    this.routes = {
      room: /^#\/?room\/([a-z0-9-]+)$/i,
      invite: /^#\/?room\/([a-z0-9-]+)\/invite\/([A-Za-z0-9_-]+)$/i,
      shortInvite: /^#\/?j\/(.+)$/i,
      legacyJoin: /^#\/?join\/([A-Za-z0-9_-]+)\/([A-Za-z0-9_-]+)\/([A-Za-z0-9_-]+)/i,
      home: /^#?\/?$/
    };
  }

  start() {
    if (typeof window === 'undefined') {
      return;
    }

    const handler = () => this.handleNavigation();

    window.addEventListener('hashchange', handler);
    window.addEventListener('popstate', handler);
    window.addEventListener('DOMContentLoaded', handler, { once: true });

    this.handleNavigation();
  }

  generateRoomURL(roomId, options = {}) {
    if (!roomId || typeof window === 'undefined') {
      return '';
    }

    const origin = window.location.origin || '';
    const path = window.location.pathname || '';
    const base = `${origin}${path.replace(/\/$/, '')}#/room/${roomId}`;

    if (options.passwordHint) {
      return `${base}?pwd=${encodeURIComponent(options.passwordHint)}`;
    }

    return base;
  }

  parseURL() {
    if (typeof window === 'undefined') {
      return { type: 'home' };
    }

    const raw = window.location.hash || '#/';
    const queryIndex = raw.indexOf('?');
    const hash = queryIndex >= 0 ? raw.slice(0, queryIndex) : raw;
    const query = queryIndex >= 0 ? raw.slice(queryIndex + 1) : '';
    const params = new URLSearchParams(query);
    const normalized = hash.replace(/\/$/, '').toLowerCase();

    const inviteMatch = hash.match(this.routes.invite);
    if (inviteMatch) {
      return {
        type: 'invite',
        roomId: inviteMatch[1],
        inviteToken: inviteMatch[2],
        params
      };
    }

    const roomMatch = hash.match(this.routes.room);
    if (roomMatch) {
      return {
        type: 'room',
        roomId: roomMatch[1],
        params
      };
    }

    const shortInvite = hash.match(this.routes.shortInvite);
    if (shortInvite) {
      return {
        type: 'encodedInvite',
        token: decodeURIComponent(shortInvite[1] || '')
      };
    }

    const legacy = hash.match(this.routes.legacyJoin);
    if (legacy) {
      return {
        type: 'legacyInvite',
        roomId: legacy[1],
        seatId: legacy[2],
        secretKey: legacy[3]
      };
    }

    if (this.routes.home.test(normalized)) {
      return { type: 'home' };
    }

    return { type: 'unknown', hash, params };
  }

  async handleNavigation() {
    const route = this.parseURL();

    if (!this.app) {
      return route;
    }

    switch (route.type) {
      case 'invite':
        await this.app.handleInviteRoute(route.roomId, route.inviteToken);
        break;
      case 'encodedInvite':
        await this.app.handleEncodedInvite(route.token);
        break;
      case 'legacyInvite':
        await this.app.handleLegacyInvite(route);
        break;
      case 'room':
        await this.app.onRoomRoute(route.roomId, route.params);
        break;
      case 'home':
        this.app.handleHomeRoute();
        break;
      default:
        break;
    }

    return route;
  }

  updateRoomRoute(roomId, options = {}) {
    if (typeof window === 'undefined' || !roomId) {
      return;
    }

    const url = this.generateRoomURL(roomId, options);
    const hashIndex = url.indexOf('#');
    const hash = hashIndex >= 0 ? url.slice(hashIndex) : '';
    if (!hash) {
      return;
    }

    const current = window.location.hash || '';
    if (current === hash) {
      return;
    }

    window.history.replaceState({}, document.title, `${window.location.pathname}${window.location.search}${hash}`);
  }

  clearRoute() {
    if (typeof window === 'undefined') {
      return;
    }
    window.history.replaceState({}, document.title, `${window.location.pathname}${window.location.search}#/`);
  }
}

class RoomHistory {
  constructor(options = {}) {
    this.storageKey = options.storageKey || 'secure-chat:room-history';
    this.maxHistory = options.maxHistory || 10;
    this.available = this.checkAvailability();
  }

  checkAvailability() {
    if (typeof window === 'undefined' || !window.localStorage) {
      return false;
    }

    try {
      const testKey = `${this.storageKey}:test`;
      localStorage.setItem(testKey, '1');
      localStorage.removeItem(testKey);
      return true;
    } catch (error) {
      console.warn('Local storage unavailable for room history.', error);
      return false;
    }
  }

  async getHistory() {
    if (!this.available) {
      return [];
    }

    try {
      const raw = localStorage.getItem(this.storageKey);
      if (!raw) {
        return [];
      }
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        return [];
      }
      return parsed.map((entry) => this.normalizeEntry(entry)).filter(Boolean);
    } catch (error) {
      console.warn('Unable to read room history.', error);
      return [];
    }
  }

  async saveRoomAccess(room) {
    if (!room || !room.roomId) {
      return null;
    }

    const history = await this.getHistory();

    const entry = {
      roomId: room.roomId,
      roomName: room.roomName || room.roomId,
      hostName: room.hostName || '',
      url: room.url || '',
      lastAccessed: room.lastAccessed || Date.now(),
      role: room.role || 'guest',
      myIdentity: room.myIdentity || null,
      members: Array.isArray(room.members) ? room.members.slice(0, 8) : [],
      encryptedKey: room.encryptionKey || '',
      identityHint: room.identityHint || null
    };

    const filtered = history.filter((h) => h.roomId !== entry.roomId);
    filtered.unshift(entry);
    const trimmed = filtered.slice(0, this.maxHistory);
    await this.persist(trimmed);
    return entry;
  }

  async touch(roomId) {
    const history = await this.getHistory();
    const updated = history.map((entry) => (entry.roomId === roomId
      ? { ...entry, lastAccessed: Date.now() }
      : entry));
    await this.persist(updated);
  }

  async remove(roomId) {
    const history = await this.getHistory();
    const filtered = history.filter((entry) => entry.roomId !== roomId);
    await this.persist(filtered);
    return filtered;
  }

  async clear() {
    if (!this.available) {
      return [];
    }
    try {
      localStorage.removeItem(this.storageKey);
    } catch (error) {
      console.warn('Unable to clear room history.', error);
    }
    return [];
  }

  async persist(entries) {
    if (!this.available) {
      return;
    }
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(entries));
    } catch (error) {
      console.warn('Unable to persist room history.', error);
    }
  }

  formatRelativeTime(timestamp) {
    if (!Number.isFinite(timestamp)) {
      return 'moments ago';
    }

    const now = Date.now();
    const delta = Math.max(0, now - timestamp);

    const minute = 60000;
    const hour = 60 * minute;
    const day = 24 * hour;

    if (delta < minute) {
      return 'moments ago';
    }
    if (delta < hour) {
      const minutes = Math.round(delta / minute);
      return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
    }
    if (delta < day) {
      const hours = Math.round(delta / hour);
      return `${hours} hour${hours === 1 ? '' : 's'} ago`;
    }
    const days = Math.round(delta / day);
    return `${days} day${days === 1 ? '' : 's'} ago`;
  }

  normalizeEntry(entry) {
    if (!entry || typeof entry !== 'object') {
      return null;
    }
    return {
      roomId: entry.roomId,
      roomName: entry.roomName || entry.roomId,
      hostName: entry.hostName || '',
      url: entry.url || '',
      lastAccessed: Number(entry.lastAccessed) || Date.now(),
      role: entry.role === 'host' ? 'host' : 'guest',
      myIdentity: entry.myIdentity || null,
      members: Array.isArray(entry.members) ? entry.members : [],
      encryptedKey: entry.encryptedKey || '',
      identityHint: entry.identityHint || null
    };
  }

  async find(roomId) {
    const history = await this.getHistory();
    return history.find((entry) => entry?.roomId === roomId) || null;
  }
}

class RoomReentry {
  constructor(history, app) {
    this.history = history;
    this.app = app;
    this.container = DOM.reentryContainer;
    this.currentEntry = null;
    this.onSubmit = this.handleSubmit.bind(this);
  }

  show(entry, params = new URLSearchParams()) {
    if (!this.container || !entry) {
      return;
    }

    this.currentEntry = entry;
    const hint = entry.identityHint || entry.myIdentity?.hint || null;
    const lastAccessed = this.history.formatRelativeTime(entry.lastAccessed);
    const identityAvatar = typeof entry.myIdentity?.avatar === 'string'
      ? entry.myIdentity.avatar
      : entry.myIdentity?.avatar?.emoji || '🙂';

    this.container.innerHTML = `
      <div class="reentry-screen">
        <div class="reentry-card">
          <h2>Welcome Back!</h2>
          <div class="room-preview">
            <div class="room-title">
              <span class="room-icon">🏠</span>
              <span>${escapeHTML(entry.roomName || entry.roomId)}</span>
            </div>
            <div class="your-identity">
              <span class="identity-avatar">${escapeHTML(identityAvatar)}</span>
              <div class="identity-info">
                <span class="identity-name">${escapeHTML(entry.myIdentity?.displayName || 'You')}</span>
                <span class="identity-label">Your identity in this room${hint ? ` (${escapeHTML(hint)})` : ''}</span>
              </div>
            </div>
            <div class="last-visit">Last visited: ${escapeHTML(lastAccessed)}</div>
          </div>
          <div class="unlock-section">
            <label for="reentryPassword">Enter your identity password to rejoin</label>
            <input type="password" id="reentryPassword" data-role="password" placeholder="Your identity password">
            <div class="reentry-options">
              <label class="remember-device">
                <input type="checkbox" data-role="remember">
                <span>Remember on this device for 30 days</span>
              </label>
            </div>
            <button class="btn-primary" data-role="submit"><span>🔓</span> Rejoin Room</button>
            <div class="reentry-error" data-role="error" aria-live="polite"></div>
          </div>
          <div class="alternative-options">
            <button class="btn-text" data-role="new-identity">Join as different identity</button>
            <button class="btn-text" data-role="back-home">Back to home</button>
          </div>
        </div>
      </div>
    `;

    this.container.hidden = false;

    const passwordInput = this.container.querySelector('[data-role="password"]');
    const submitBtn = this.container.querySelector('[data-role="submit"]');
    const remember = this.container.querySelector('[data-role="remember"]');

    if (submitBtn) {
      submitBtn.addEventListener('click', this.onSubmit);
    }

    if (passwordInput) {
      passwordInput.addEventListener('keypress', (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          this.handleSubmit();
        }
      });
      const hintedPassword = params.get('pwd');
      if (hintedPassword) {
        try {
          passwordInput.value = decodeURIComponent(hintedPassword);
        } catch (error) {
          passwordInput.value = hintedPassword;
        }
      }
      setTimeout(() => passwordInput.focus(), 50);
    }

    const backBtn = this.container.querySelector('[data-role="back-home"]');
    if (backBtn) {
      backBtn.addEventListener('click', () => {
        this.hide();
        this.app?.showWelcome();
        this.app?.roomURLManager?.clearRoute();
      });
    }

    const newIdentityBtn = this.container.querySelector('[data-role="new-identity"]');
    if (newIdentityBtn) {
      newIdentityBtn.addEventListener('click', () => {
        this.hide();
        this.app?.clearStoredIdentity(entry.roomId);
        this.app?.showJoin();
      });
    }

    this.tryAutoUnlock(entry, passwordInput, remember);
  }

  hide() {
    if (!this.container) {
      return;
    }
    this.container.hidden = true;
    this.container.innerHTML = '';
    this.currentEntry = null;
  }

  showError(message) {
    if (!this.container) {
      return;
    }
    const errorEl = this.container.querySelector('[data-role="error"]');
    if (errorEl) {
      errorEl.textContent = message || '';
    }
  }

  handleSubmit() {
    if (!this.currentEntry || !this.container) {
      return;
    }

    const password = this.container.querySelector('[data-role="password"]')?.value || '';
    const remember = this.container.querySelector('[data-role="remember"]')?.checked || false;

    this.app?.handleReentryAttempt(this.currentEntry, password, remember)
      .then((success) => {
        if (success) {
          if (remember) {
            this.storeCredential(this.currentEntry.roomId, password);
          } else {
            this.clearCredential(this.currentEntry.roomId);
          }
          this.hide();
        } else {
          this.showError('Invalid password. Please try again.');
        }
      })
      .catch((error) => {
        console.warn('Failed to process reentry attempt.', error);
        this.showError('Unable to unlock this identity.');
      });
  }

  tryAutoUnlock(entry, passwordInput, rememberCheckbox) {
    const stored = this.loadCredential(entry.roomId);
    if (!stored) {
      return;
    }

    if (passwordInput) {
      passwordInput.value = stored.password;
    }
    if (rememberCheckbox) {
      rememberCheckbox.checked = true;
    }

    this.app?.handleReentryAttempt(entry, stored.password, true)
      .then((success) => {
        if (!success) {
          this.clearCredential(entry.roomId);
          this.showError('Stored password is no longer valid.');
        } else {
          this.hide();
        }
      })
      .catch(() => {
        this.clearCredential(entry.roomId);
      });
  }

  storeCredential(roomId, password) {
    if (typeof window === 'undefined' || !roomId) {
      return;
    }
    try {
      let value = password;
      let encoded = false;
      if (typeof btoa === 'function') {
        try {
          value = btoa(encodeURIComponent(password));
          encoded = true;
        } catch (error) {
          value = password;
          encoded = false;
        }
      }
      const payload = {
        password: value,
        encoded,
        expires: Date.now() + 30 * 24 * 60 * 60 * 1000
      };
      localStorage.setItem(`secure-chat:remember:${roomId}`, JSON.stringify(payload));
    } catch (error) {
      console.warn('Unable to persist remembered credential.', error);
    }
  }

  loadCredential(roomId) {
    if (typeof window === 'undefined' || !roomId) {
      return null;
    }
    try {
      const raw = localStorage.getItem(`secure-chat:remember:${roomId}`);
      if (!raw) {
        return null;
      }
      const payload = JSON.parse(raw);
      if (!payload || payload.expires < Date.now()) {
        this.clearCredential(roomId);
        return null;
      }
      if (payload.encoded && typeof atob === 'function') {
        try {
          const decoded = decodeURIComponent(atob(payload.password));
          return { password: decoded, expires: payload.expires, encoded: true };
        } catch (error) {
          console.warn('Unable to decode stored credential.', error);
          return { password: payload.password, expires: payload.expires, encoded: false };
        }
      }
      return payload;
    } catch (error) {
      console.warn('Unable to load remembered credential.', error);
      return null;
    }
  }

  clearCredential(roomId) {
    if (typeof window === 'undefined' || !roomId) {
      return;
    }
    try {
      localStorage.removeItem(`secure-chat:remember:${roomId}`);
    } catch (error) {
      console.warn('Unable to clear remembered credential.', error);
    }
  }
}

class BookmarkableRooms {
  constructor(app) {
    this.app = app;
  }

  setupRouting() {
    if (typeof window === 'undefined') {
      return;
    }

    window.addEventListener('popstate', () => {
      this.app?.roomURLManager?.handleNavigation();
    });
  }

  updatePageTitle(roomName = null) {
    if (typeof document === 'undefined') {
      return;
    }
    document.title = roomName ? `${roomName} - Secure Chat` : 'Secure Chat';
  }

  generateManifest() {
    return {
      name: 'Secure Chat',
      short_name: 'SecureChat',
      start_url: '/#/',
      display: 'standalone',
      background_color: '#1e3c72',
      theme_color: '#2a5298',
      icons: [
        {
          src: '/icon-192.png',
          sizes: '192x192',
          type: 'image/png'
        }
      ],
      share_target: {
        action: '/#/join',
        method: 'GET',
        params: {
          title: 'room',
          text: 'invite',
          url: 'url'
        }
      }
    };
  }
}

class DeepLinking {
  constructor(app) {
    this.app = app;
  }

  setupDeepLinks() {
    if (typeof navigator === 'undefined') {
      return;
    }

    try {
      if (typeof navigator.registerProtocolHandler === 'function') {
        navigator.registerProtocolHandler('web+securechat', '/#/room/%s', 'Secure Chat');
      }
    } catch (error) {
      console.warn('Unable to register protocol handler.', error);
    }

    if (typeof navigator.share === 'function') {
      this.setupShareButton();
    }
  }

  setupShareButton() {
    this.shareRoom = async (roomId) => {
      if (!roomId) {
        return;
      }
      const roomUrl = this.app?.roomURLManager?.generateRoomURL(roomId);
      if (!roomUrl) {
        return;
      }
      try {
        await navigator.share({
          title: 'Join my secure room',
          text: 'Click to join my encrypted chat room',
          url: roomUrl
        });
      } catch (error) {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(roomUrl);
        }
        this.app?.showToast?.('Room link copied!', 'info');
      }
    };
  }

  generateRoomQR(roomId) {
    if (typeof window === 'undefined') {
      return null;
    }
    if (typeof QRCode !== 'function') {
      return null;
    }
    const roomUrl = this.app?.roomURLManager?.generateRoomURL(roomId);
    if (!roomUrl) {
      return null;
    }
    return new QRCode({
      content: roomUrl,
      width: 256,
      height: 256,
      color: {
        dark: '#1e293b',
        light: '#ffffff'
      }
    });
  }
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

  normalizeAvatar(avatar) {
    if (!avatar || typeof avatar !== 'object') {
      return { emoji: '🙂', color: '#4A9FD5' };
    }
    const emoji = typeof avatar.emoji === 'string' ? avatar.emoji : '🙂';
    const color = typeof avatar.color === 'string' ? avatar.color : '#4A9FD5';
    return { emoji, color };
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
      const senderName = typeof msg.displayName === 'string'
        ? msg.displayName
        : (msg.type === 'me' ? 'You' : 'Guest');
      const avatar = this.normalizeAvatar(msg.avatar);
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
        editedAt: Number.isFinite(msg.editedAt) ? msg.editedAt : null,
        userId: msg.userId || null,
        displayName: senderName,
        avatar,
        sender: {
          id: msg.userId || null,
          displayName: senderName,
          avatar
        },
        isLocal: msg.type === 'me'
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
        this.workspaceRoot = DOM.workspaceRoot || null;
        this.legacyRoot = DOM.legacyRoot || null;
        this.isLegacyMode = false;
        this.inviteManager = typeof InviteManager === 'function' ? new InviteManager() : null;
        this.inviteManagerReady = this.inviteManager?.ready || Promise.resolve();
        this.pendingInvite = null;
        this.roomMembers = typeof RoomMembers === 'function' ? new RoomMembers(DOM.memberSidebar) : null;
        this.roomMembers?.setViewerRole(this.isHost);
        this.nameGenerator = typeof SecureNameGenerator === 'function' ? new SecureNameGenerator() : null;
        this.identityManager = null;
        this.localIdentity = null;
        this.remoteIdentity = null;
        this.identityRetryTimer = null;
        this.roomHistory = new RoomHistory();
        this.roomReentry = new RoomReentry(this.roomHistory, this);
        this.roomURLManager = new RoomURLManager(this);
        this.bookmarkableRooms = new BookmarkableRooms(this);
        this.deepLinking = new DeepLinking(this);
        this.entryScreen = new WorkspaceEntryScreen(this);
        this.pendingReentryRequest = null;
        this.activeRoomContextMode = null;
        this.activeWorkspaceId = null;
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
        this.typingUsers = new Map();
        this.typingTimeouts = new Map();
        this.lastTypingState = false;
        this.lastTypingSentAt = 0;
        this.typingResetTimer = null;
        this.typingIndicator = DOM.typingIndicator || null;
        if (this.typingIndicator) {
          this.typingIndicator.innerHTML = '';
          this.typingIndicator.setAttribute('hidden', '');
        }

        this.dom = DOM;
        this.applyVisualConfig();
        this.timeline.setContainer(DOM.chatMessages);
        this.networkStatusBar?.render();
        this.updateNetworkPeers(0);
        this.updatePendingMessages(0);
        this.updateAverageHops(0);
        this.initStorage();
        this.renderRoomHistory();
        this.initEventListeners();
        this.initSimpleSetup();
        this.updateStatus('Disconnected', '');
        this.setWaitingBanner(false, '');
        this.updateFingerprintDisplay(null);
        this.initDevRoutes();
        this.applyFeatureFlags();
        this.entryScreen.initIdentityFlow();
        this.bookmarkableRooms.setupRouting();
        this.deepLinking.setupDeepLinks();
        this.useWorkspaceLayout();
        this.roomURLManager.start();
      }

      initEventListeners() {
        const input = DOM.messageInput;
        if (input) {
          input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.sendMessage();
          });
          input.addEventListener('input', () => this.handleTypingActivity());
          input.addEventListener('blur', () => this.stopTypingActivity());
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
        this.entryScreen.initIdentityFlow();
      }

      refreshIdentitySuggestions(force = false) {
        this.entryScreen.refreshIdentitySuggestions(force);
      }

      getEmojiForName(name) {
        return this.entryScreen.getEmojiForName(name);
      }

      computeAvatarFromName(name) {
        return this.entryScreen.computeAvatarFromName(name);
      }

      getSelectedDisplayName() {
        return this.entryScreen.getSelectedDisplayName();
      }

      updateJoinButtonText() {
        this.entryScreen.updateJoinButtonText();
      }

      renderIdentitySelector() {
        this.entryScreen.renderIdentitySelector();
      }

      focusCustomIdentityInput() {
        this.entryScreen.focusCustomIdentityInput();
      }

      acceptCurrentIdentitySuggestion() {
        this.entryScreen.acceptCurrentIdentitySuggestion();
      }

      tryAnotherIdentitySuggestion(options = {}) {
        this.entryScreen.tryAnotherIdentitySuggestion(options);
      }

      selectPreviousIdentitySuggestion(name) {
        this.entryScreen.selectPreviousIdentitySuggestion(name);
      }

      generateUniqueIdentitySuggestion() {
        return this.entryScreen.generateUniqueIdentitySuggestion();
      }

      generateFallbackName() {
        return this.entryScreen.generateFallbackName();
      }

      updatePasswordStrength() {
        this.entryScreen.updatePasswordStrength();
      }

      showIdentityError(message) {
        this.entryScreen.showIdentityError(message);
      }

      clearIdentityError() {
        this.entryScreen.clearIdentityError();
      }

      showIdentityModal(mode = 'create', options = {}) {
        return this.entryScreen.showIdentityModal(mode, options);
      }

      displayIdentityMode(mode, stored) {
        this.entryScreen.displayIdentityMode(mode, stored);
      }

      hideIdentityModal(result = null) {
        this.entryScreen.hideIdentityModal(result);
      }

      async handleIdentityCreateSubmit() {
        const scopeId = this.getIdentityScope();
        if (!scopeId) {
          this.showIdentityError('Open or create a workspace before setting up your identity.');
          return;
        }

        if (!this.identityManager || this.identityManager.roomId !== scopeId) {
          try {
            this.identityManager = new RoomIdentity(scopeId);
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

        const password = this.entryScreen.getElement('identityPasswordInput')?.value?.trim() || '';
        if (password.length < 8) {
          this.showIdentityError('Password must be at least 8 characters.');
          return;
        }

        try {
          const identity = await this.identityManager.createIdentity(displayName, password);
          this.localIdentity = identity;
          this.roomMembers?.upsertMember(identity, { isHost: this.isHost, online: true });
          this.hideIdentityModal(identity);
          this.scheduleIdentityAnnouncement();
        } catch (error) {
          console.warn('Failed to create room identity.', error);
          this.showIdentityError('Unable to create identity. Please try a different password.');
        }
      }

      async handleIdentityReturningSubmit() {
        const scopeId = this.getIdentityScope();
        if (!scopeId) {
          this.showIdentityError('Select a workspace before unlocking a saved identity.');
          return;
        }

        if (!this.identityManager || this.identityManager.roomId !== scopeId) {
          try {
            this.identityManager = new RoomIdentity(scopeId);
          } catch (error) {
            this.showIdentityError('Identity service unavailable.');
            return;
          }
        }

        const password = this.entryScreen.getElement('identityReturningPassword')?.value?.trim() || '';
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
          this.hideIdentityModal(identity);
          this.scheduleIdentityAnnouncement();
        } catch (error) {
          console.warn('Failed to decrypt stored identity.', error);
          this.showIdentityError('Invalid password for this room identity.');
        }
      }

      async prepareIdentity() {
        const scopeId = this.getIdentityScope();
        if (!scopeId || typeof RoomIdentity !== 'function') {
          return null;
        }

        if (!this.identityManager || this.identityManager.roomId !== scopeId) {
          try {
            this.identityManager = new RoomIdentity(scopeId);
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
          const stored = await this.identityManager.storage.getRoomIdentity(scopeId);
          if (stored) {
            const identity = await this.showIdentityModal('returning', { stored });
            if (identity) {
              this.localIdentity = identity;
              this.roomMembers?.upsertMember(identity, { isHost: this.isHost, online: true });
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

        if (identity.id && this.typingUsers?.has(identity.id)) {
          const entry = this.typingUsers.get(identity.id);
          if (entry) {
            entry.displayName = identity.displayName;
            entry.avatar = identity.avatar;
            this.renderTypingIndicator(Array.from(this.typingUsers.values()));
          }
        }
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
        this.entryScreen.resetIdentityState();
        if (!preserveLocal) {
          this.localIdentity = null;
        }
        this.remoteIdentity = null;
        this.identityManager = null;
        this.clearIdentityAnnouncement();
        this.roomMembers?.reset?.();
      }

      getIdentityScope() {
        if (typeof this.activeWorkspaceId === 'string' && this.activeWorkspaceId) {
          return `workspace:${this.activeWorkspaceId}`;
        }
        return this.roomId;
      }

      setRoomContextMode(mode = null) {
        this.activeRoomContextMode = mode;
        if (mode === 'join') {
          this.processPendingReentry();
        }
      }

      processPendingReentry() {
        if (!this.pendingReentryRequest || this.activeRoomContextMode !== 'join') {
          return;
        }

        const { entry, params } = this.pendingReentryRequest;
        this.pendingReentryRequest = null;

        if (!entry || !entry.roomId) {
          return;
        }

        this.useLegacyLayout();
        this.roomId = entry.roomId;
        const searchParams = params instanceof URLSearchParams ? params : new URLSearchParams(params);
        this.roomReentry.show(entry, searchParams);
      }

      markRemoteOffline() {
        if (this.remoteIdentity?.id) {
          this.roomMembers?.markOffline(this.remoteIdentity.id);
        }
      }

      focusDefaultForScreen(screenId) {
        let focusTarget = null;
        if (screenId === 'chatScreen') {
          focusTarget = DOM.messageInput;
        } else if (this.entryScreen) {
          focusTarget = this.entryScreen.getDefaultFocusTarget(screenId);
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
        const route = this.roomURLManager?.parseURL?.();
        if (!route) {
          return;
        }

        switch (route.type) {
          case 'invite':
            await this.handleInviteRoute(route.roomId, route.inviteToken);
            break;
          case 'encodedInvite':
            await this.handleEncodedInvite(route.token);
            break;
          case 'legacyInvite':
            await this.handleLegacyInvite(route);
            break;
          default:
            break;
        }
      }

      async processInvitePayload(invitePayload) {
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
          this.showJoin('Invite unavailable', 'Invite link missing required parameters.');
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
          this.roomURLManager.updateRoomRoute(invite.roomId);
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
        const expiresAt = result.payload?.expiresAt;
        const seatId = seat?.seatId || result.payload?.seatId;
        this.pendingInvite = { id: seatId, expiresAt };
        this.roomMembers?.setActiveInvite?.({
          id: seatId,
          expiresAt,
          url: result.url
        });
        return result.url;
      }

      updateInviteLink(url) {
        const inviteInput = DOM.inviteLink;
        this.entryScreen.setShareSectionVisible(Boolean(url));

        if (!inviteInput) {
          return;
        }

        if (url) {
          inviteInput.value = url;
          inviteInput.dataset.link = url;
          inviteInput.setAttribute('aria-label', 'Copy secure invite link');
        } else {
          inviteInput.value = 'Generating secure link...';
          delete inviteInput.dataset.link;
          this.roomMembers?.clearActiveInvites?.();
        }
      }

      async refreshGuestInvite({ bannerMessage = 'Share this one-time secure link with your guest.', announce = false } = {}) {
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
        try {
          link = await this.generateShareLink(this.roomId, newSeat);
        } catch (error) {
          console.error('Failed to encode refreshed invite.', error);
          this.addSystemMessage('⚠️ Unable to encode the new invite link.');
          return null;
        }

        this.updateInviteLink(link);
        this.updateSimpleShareStatus('');
        this.setWaitingBanner(true, link, bannerMessage);
        this.pendingInvite = { id: newSeat.seatId, expiresAt: newSeat.expiresAt };
        this.roomMembers?.setActiveInvite?.({
          id: newSeat.seatId,
          expiresAt: newSeat.expiresAt,
          url: link
        });
        if (announce) {
          this.addSystemMessage('✨ Generated a fresh secure invite link.');
        }

        return link;
      }

      async cancelActiveInvite(inviteId = null) {
        if (!this.isHost) {
          return;
        }

        try {
          const replacementSeat = await SecureInvite.generateSeat();
          const saltBytes = SecureInvite.fromBase64Url(replacementSeat.seatId);
          if (!(saltBytes instanceof Uint8Array)) {
            throw new Error('Invalid seat salt for cancellation.');
          }

          this.seats.guest = { ...replacementSeat, claimed: false };
          CryptoManager.setRoomSalt(saltBytes);
          this.roomSalt = CryptoManager.getRoomSalt();
          this.roomSaltBase64 = this.bytesToBase64(this.roomSalt);
          await CryptoManager.loadStaticKeyFromSeat(replacementSeat.secretKey, replacementSeat.seatId);
        } catch (error) {
          console.error('Failed to rotate invite during cancellation.', error);
          this.addSystemMessage('⚠️ Unable to fully cancel the invite. Generating a new one is recommended.');
        }

        this.currentInvite = null;
        this.pendingInvite = null;
        this.currentShareLink = '';
        this.updateInviteLink('');
        this.roomMembers?.clearActiveInvites?.();
        this.setWaitingBanner(false, '');
        this.updateSimpleShareStatus('');

        if (inviteId) {
          this.addSystemMessage(`🚫 Invite ${inviteId} cancelled.`);
        } else {
          this.addSystemMessage('🚫 Active invite cancelled.');
        }
      }

      async copyShareLink(targetId = 'inviteLink') {
        const elem = DOM[targetId] || document.getElementById(targetId);
        if (!elem) {
          return;
        }

        const storedLink = elem.dataset?.link;
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
        const target = this.entryScreen?.getScreenElement(screenId)
          || DOM[screenId]
          || document.getElementById(screenId);
        if (target) {
          target.classList.add('active');
          setTimeout(() => this.focusDefaultForScreen(screenId), 50);
        }
      }

      useLegacyLayout() {
        if (this.workspaceRoot) {
          this.workspaceRoot.setAttribute('hidden', '');
        }
        if (this.legacyRoot) {
          this.legacyRoot.removeAttribute('hidden');
        }
        this.isLegacyMode = true;
        this.setWorkspaceContext(null, { resetIdentity: false, ensureIdentity: false });
      }

      useWorkspaceLayout() {
        if (this.legacyRoot) {
          this.legacyRoot.setAttribute('hidden', '');
        }
        if (this.workspaceRoot) {
          this.workspaceRoot.removeAttribute('hidden');
        }
        this.isLegacyMode = false;
        this.setWorkspaceContext(null, { resetIdentity: false, ensureIdentity: false });
      }

      setWorkspaceContext(workspaceId, options = {}) {
        const normalized = typeof workspaceId === 'string' && workspaceId.trim()
          ? workspaceId.trim()
          : null;
        const {
          ensureIdentity = true,
          resetIdentity = true
        } = options;

        if (normalized === this.activeWorkspaceId) {
          if (normalized && ensureIdentity) {
            this.prepareIdentity().catch((error) => {
              console.warn('Failed to prepare identity for workspace.', error);
            });
          }
          return;
        }

        this.activeWorkspaceId = normalized;

        if (resetIdentity) {
          this.resetIdentityState({ preserveLocal: false });
        } else if (!normalized) {
          this.identityManager = null;
        }

        if (!normalized || !ensureIdentity) {
          return;
        }

        this.prepareIdentity().catch((error) => {
          console.warn('Failed to prepare identity for workspace.', error);
        });
      }

      handleHomeRoute() {
        if (this.isLegacyMode) {
          this.showWelcome();
          return;
        }
        this.useWorkspaceLayout();
        if (window.workspaceApp?.renderLanding) {
          window.workspaceApp.renderLanding();
        }
      }

      enterLegacyMode(options = {}) {
        const mode = options.mode || 'welcome';
        if (mode === 'host') {
          this.showHost();
        } else if (mode === 'join') {
          this.showJoin();
        } else {
          this.showWelcome();
        }
      }

      exitToWorkspace() {
        if (this.conn || this.peer || this.roomId) {
          this.disconnect();
        }
        this.pendingReentryRequest = null;
        this.setRoomContextMode(null);
        this.useWorkspaceLayout();
        this.roomURLManager.clearRoute();
        if (!window.workspaceApp) {
          window.workspaceApp = new WorkspaceApp();
        }
        if (window.workspaceApp?.renderLanding) {
          window.workspaceApp.renderLanding();
        }
      }

      async onRoomRoute(roomId, params = new URLSearchParams()) {
        const searchParams = params instanceof URLSearchParams ? params : new URLSearchParams(params);

        if (!roomId) {
          this.roomId = null;
          this.showWelcome();
          return;
        }

        const entry = await this.roomHistory.find(roomId);

        if (entry?.myIdentity) {
          if (this.activeRoomContextMode === 'join') {
            this.useLegacyLayout();
            this.roomId = roomId;
            this.pendingReentryRequest = null;
            this.roomReentry.show(entry, searchParams);
          } else {
            this.pendingReentryRequest = {
              entry,
              params: new URLSearchParams(searchParams)
            };
            this.roomReentry.hide();
          }
          return;
        }

        this.useLegacyLayout();
        this.roomId = roomId;
        this.showJoin('Secure invite required', 'Use a new invite link from the host to enter this room.');
      }

      async handleInviteRoute(roomId, inviteToken) {
        this.useLegacyLayout();
        if (!inviteToken) {
          this.showJoin('Invite unavailable', 'Missing invite token in the URL.');
          return;
        }

        let payload = null;
        try {
          payload = SecureInvite.decodePayload(inviteToken);
        } catch (error) {
          console.warn('Unable to decode invite token.', error);
        }

        if (payload && roomId && !payload.roomId && !payload.r) {
          payload.r = roomId;
        }

        if (!payload) {
          this.showJoin('Invite unavailable', 'This invite link could not be decoded.');
          return;
        }

        await this.processInvitePayload(payload);
      }

      async handleEncodedInvite(token) {
        this.useLegacyLayout();
        if (!token) {
          return;
        }

        let payload = null;
        try {
          payload = SecureInvite.decodePayload(token);
        } catch (error) {
          console.warn('Unable to decode encoded invite payload.', error);
        }

        if (!payload) {
          this.showJoin('Invite unavailable', 'This invite link is no longer valid.');
          return;
        }

        await this.processInvitePayload(payload);
      }

      async handleLegacyInvite(route) {
        this.useLegacyLayout();
        if (!route) {
          return;
        }

        const payload = {
          r: route.roomId,
          s: route.seatId,
          k: route.secretKey
        };

        await this.processInvitePayload(payload);
      }

      showWelcome() {
        this.useLegacyLayout();
        this.setRoomContextMode(null);
        this.entryScreen.showWelcome();
        this.showScreen('welcomeScreen');
        this.roomReentry.hide();
        this.bookmarkableRooms.updatePageTitle();
        this.renderRoomHistory();
      }

      showHost(existingRoomId = null) {
        this.useLegacyLayout();
        this.setRoomContextMode('host');
        CryptoManager.reset();
        this.latestFingerprint = '';
        this.lastAnnouncedEpoch = -1;
        this.roomId = existingRoomId || this.generateRoomId();
        this.roomSalt = null;
        this.roomSaltBase64 = '';
        this.resetMessageCounters();
        this.pendingRoomSalt = null;
        this.currentInvite = null;
        this.seats = { host: null, guest: null };
        this.resetIdentityState();
        this.updateFingerprintDisplay(null);
        this.entryScreen.showHost({ roomId: this.roomId });
        this.updateInviteLink('');
        this.currentShareLink = '';
        this.setWaitingBanner(false, '');
        this.bookmarkableRooms.updatePageTitle(this.getRoomDisplayName());
        this.roomURLManager.updateRoomRoute(this.roomId);
        this.roomReentry.hide();
        this.showScreen('hostScreen');
      }

      showJoin(statusMessage = 'Secure invite required', detailMessage = 'Open the one-time invite link shared with you to join.') {
        this.useLegacyLayout();
        this.setRoomContextMode('join');
        CryptoManager.reset();
        this.latestFingerprint = '';
        this.lastAnnouncedEpoch = -1;
        this.updateFingerprintDisplay(null);
        this.resetMessageCounters();
        this.resetIdentityState();
        this.entryScreen.showJoin(statusMessage, detailMessage);
        this.bookmarkableRooms.updatePageTitle();
        this.roomReentry.hide();
        this.showScreen('joinScreen');
      }

      showChat() {
        console.log('Showing chat interface for room:', this.roomId);

        const welcomeScreen = this.entryScreen.getScreenElement('welcomeScreen');
        const hostScreen = this.entryScreen.getScreenElement('hostScreen');
        const joinScreen = this.entryScreen.getScreenElement('joinScreen');
        const chatScreen = DOM.chatScreen;

        welcomeScreen?.classList.remove('active');
        hostScreen?.classList.remove('active');
        joinScreen?.classList.remove('active');
        chatScreen?.classList.add('active');

        this.roomReentry.hide();
        this.bookmarkableRooms.updatePageTitle(this.getRoomDisplayName());

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
        this.roomMembers?.setViewerRole?.(this.isHost);

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

        this.roomListUnsub = subscribe('projection:roomList', () => this.renderRoomHistory());
        this.renderRoomHistory();

        if (this.roomId) {
          this.renderChatMessages(projection.messagesByRoom(this.roomId));
        }
      }

      async renderRoomHistory() {
        const container = DOM.roomHistory;
        const content = DOM.roomHistoryContent;

        if (!container || !content) {
          return;
        }

        const history = (await this.roomHistory.getHistory()).filter(Boolean);

        container.style.display = 'block';
        content.innerHTML = '';

        const section = document.createElement('div');
        section.className = 'room-history-section';

        const heading = document.createElement('h3');
        heading.textContent = 'Your Recent Rooms';
        section.appendChild(heading);

        if (history.length === 0) {
          const empty = document.createElement('div');
          empty.className = 'empty-history';
          empty.innerHTML = `
            <span class="empty-icon">🏠</span>
            <p>No recent rooms</p>
            <span class="hint">Rooms you create or join will appear here</span>
          `;
          section.appendChild(empty);
          content.appendChild(section);
          return;
        }

        const cards = document.createElement('div');
        cards.className = 'room-cards';

        history.forEach((room) => {
          const card = document.createElement('div');
          card.className = 'room-card';
          card.dataset.roomId = room.roomId;

          card.addEventListener('click', (event) => {
            if (event.target.closest('.room-card-actions')) {
              return;
            }
            this.handleHistoryRejoin(room);
          });

          const header = document.createElement('div');
          header.className = 'room-card-header';

          const roomName = document.createElement('span');
          roomName.className = 'room-name';
          roomName.textContent = room.roomName || room.roomId;

          const role = document.createElement('span');
          role.className = 'room-role';
          role.textContent = room.role === 'host' ? '👑' : '👤';

          header.appendChild(roomName);
          header.appendChild(role);

          const body = document.createElement('div');
          body.className = 'room-card-body';

          const membersRow = document.createElement('div');
          membersRow.className = 'room-members';

          const visibleMembers = Array.isArray(room.members) ? room.members.slice(0, 4) : [];
          visibleMembers.forEach((member) => {
            const avatar = document.createElement('span');
            avatar.className = 'member-avatar';
            avatar.title = member.displayName || 'Member';
            avatar.textContent = this.getMemberAvatar(member);
            membersRow.appendChild(avatar);
          });

          if ((room.members?.length || 0) > 4) {
            const count = document.createElement('span');
            count.className = 'member-count';
            count.textContent = `+${room.members.length - 4}`;
            membersRow.appendChild(count);
          }

          const meta = document.createElement('div');
          meta.className = 'room-meta';
          meta.innerHTML = `
            <span class="last-accessed">${this.roomHistory.formatRelativeTime(room.lastAccessed)}</span>
          `;

          body.appendChild(membersRow);
          body.appendChild(meta);

          const actions = document.createElement('div');
          actions.className = 'room-card-actions';

          const rejoinBtn = document.createElement('button');
          rejoinBtn.className = 'btn-rejoin';
          rejoinBtn.textContent = 'Rejoin';
          rejoinBtn.addEventListener('click', (event) => {
            event.stopPropagation();
            this.handleHistoryRejoin(room);
          });

          const copyBtn = document.createElement('button');
          copyBtn.className = 'btn-copy-link';
          copyBtn.title = 'Copy room link';
          copyBtn.textContent = '🔗';
          copyBtn.addEventListener('click', async (event) => {
            event.stopPropagation();
            await this.copyRoomLink(room.url || this.roomURLManager.generateRoomURL(room.roomId));
          });

          const removeBtn = document.createElement('button');
          removeBtn.className = 'btn-remove';
          removeBtn.title = 'Remove';
          removeBtn.textContent = '×';
          removeBtn.addEventListener('click', async (event) => {
            event.stopPropagation();
            await this.removeFromHistory(room.roomId);
          });

          actions.appendChild(rejoinBtn);
          actions.appendChild(copyBtn);
          actions.appendChild(removeBtn);

          card.appendChild(header);
          card.appendChild(body);
          card.appendChild(actions);

          cards.appendChild(card);
        });

        section.appendChild(cards);

        const clearBtn = document.createElement('button');
        clearBtn.className = 'btn-clear-history';
        clearBtn.textContent = 'Clear History';
        clearBtn.addEventListener('click', async () => {
          await this.clearRoomHistory();
        });

        section.appendChild(clearBtn);
        content.appendChild(section);
      }

      buildRoomHistoryPayload() {
        if (!this.roomId) {
          return null;
        }

        const members = this.roomMembers?.members instanceof Map
          ? Array.from(this.roomMembers.members.values())
          : [];

        const entryMembers = members.map((member) => ({
          displayName: member.displayName || 'Member',
          avatar: member.avatar?.emoji || member.avatar || '🙂'
        }));

        const hostMember = members.find((member) => member.isHost) || null;
        const roomName = this.getRoomDisplayName();
        const identityHint = this.entryScreen?.pendingStoredIdentity?.hint || null;

        return {
          roomId: this.roomId,
          roomName,
          hostName: hostMember?.displayName || roomName,
          url: this.roomURLManager.generateRoomURL(this.roomId, identityHint ? { passwordHint: identityHint } : {}),
          lastAccessed: Date.now(),
          role: this.isHost ? 'host' : 'guest',
          myIdentity: this.localIdentity
            ? {
                id: this.localIdentity.id,
                displayName: this.localIdentity.displayName || 'You',
                avatar: this.localIdentity.avatar || { emoji: '🙂' },
                hint: identityHint
              }
            : null,
          members: entryMembers,
          encryptionKey: this.roomSaltBase64 || '',
          identityHint
        };
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

      getMemberAvatar(member) {
        if (!member) {
          return '🙂';
        }
        if (typeof member.avatar === 'string') {
          return member.avatar;
        }
        if (member.avatar && typeof member.avatar.emoji === 'string') {
          return member.avatar.emoji;
        }
        return '🙂';
      }

      getRoomDisplayName() {
        if (this.remoteIdentity?.displayName) {
          return `${this.remoteIdentity.displayName}'s room`;
        }
        if (this.isHost && this.localIdentity?.displayName) {
          return `${this.localIdentity.displayName}'s room`;
        }
        return this.roomId || 'Secure Chat';
      }

      quickJoin(roomId) {
        const detail = roomId
          ? `Ask the host for a fresh one-time invite to rejoin room ${roomId}.`
          : 'Ask the host for a fresh one-time invite to join again.';
        this.showJoin('Secure invite required', detail);
      }

      async handleHistoryRejoin(room) {
        if (!room || !room.roomId) {
          return;
        }

        const entry = await this.roomHistory.find(room.roomId);
        const passwordHint = entry?.identityHint && typeof entry.identityHint === 'string'
          ? entry.identityHint
          : null;

        this.roomURLManager.updateRoomRoute(room.roomId, passwordHint ? { passwordHint } : {});
        await this.roomHistory.touch(room.roomId);

        if (entry?.myIdentity) {
          const params = new URLSearchParams();
          if (passwordHint) {
            params.set('pwd', passwordHint);
          }
          this.roomReentry.show(entry, params);
        } else {
          await this.roomURLManager.handleNavigation();
        }
      }

      async copyRoomLink(url) {
        let link = url;
        if (!link && this.roomId) {
          link = this.roomURLManager.generateRoomURL(this.roomId);
        }
        if (!link) {
          return;
        }

        const canUseClipboard = typeof navigator !== 'undefined' && navigator.clipboard?.writeText;

        if (canUseClipboard) {
          try {
            await navigator.clipboard.writeText(link);
            this.showToast('Room link copied!', 'info');
            return;
          } catch (error) {
            console.warn('Clipboard API unavailable, falling back to legacy copy.', error);
          }
        }

        if (typeof document === 'undefined') {
          return;
        }

        const fallback = document.createElement('textarea');
        fallback.value = link;
        fallback.style.position = 'fixed';
        fallback.style.opacity = '0';
        document.body.appendChild(fallback);
        fallback.select();
        try {
          document.execCommand('copy');
          this.showToast('Room link copied!', 'info');
        } catch (copyError) {
          console.warn('Unable to copy link to clipboard.', copyError);
        } finally {
          fallback.remove();
        }
      }

      async removeFromHistory(roomId) {
        await this.roomHistory.remove(roomId);
        await this.renderRoomHistory();
      }

      async clearRoomHistory() {
        await this.roomHistory.clear();
        await this.renderRoomHistory();
      }

      async handleReentryAttempt(entry, password) {
        if (!entry || !entry.roomId || !password) {
          return false;
        }

        let manager;
        try {
          manager = new RoomIdentity(entry.roomId);
        } catch (error) {
          console.warn('Unable to initialise identity manager for reentry.', error);
          return false;
        }

        try {
          const identity = await manager.verifyReturningMember(password);
          if (!identity) {
            return false;
          }

          this.identityManager = manager;
          this.localIdentity = identity;
          this.roomId = entry.roomId;
          this.isHost = entry.role === 'host';
          this.roomMembers?.upsertMember(identity, { isHost: this.isHost, online: true });
          await this.roomHistory.touch(entry.roomId);
          this.bookmarkableRooms.updatePageTitle(entry.roomName || this.getRoomDisplayName());

          if (this.isHost) {
            this.showToast('Identity unlocked. Generate a new invite to reopen the room.', 'info');
            this.showHost(entry.roomId);
          } else {
            this.showJoin('Secure invite required', 'Ask the host for a fresh secure invite to rejoin this room.');
          }

          return true;
        } catch (error) {
          console.warn('Failed to unlock stored identity for reentry.', error);
          return false;
        }
      }

      async clearStoredIdentity(roomId) {
        if (!roomId) {
          return;
        }

        try {
          const manager = new RoomIdentity(roomId);
          await manager.storage.clearRoomIdentity(roomId);
        } catch (error) {
          console.warn('Unable to clear stored identity for room.', error);
        }

        this.roomReentry.clearCredential(roomId);
        await this.roomHistory.remove(roomId);
        await this.renderRoomHistory();
      }

      async handleRoomConnected() {
        const payload = this.buildRoomHistoryPayload();
        if (payload) {
          await this.roomHistory.saveRoomAccess(payload);
        }
        this.bookmarkableRooms.updatePageTitle(payload?.roomName || this.getRoomDisplayName());
        this.roomURLManager.updateRoomRoute(this.roomId, payload?.identityHint ? { passwordHint: payload.identityHint } : {});
        await this.renderRoomHistory();
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
        const roomCodeEl = this.entryScreen.getElement('roomCode');
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

        if (message.type === 'typing_state') {
          this.handleTypingControl(message);
          return true;
        }

        return false;
      }

      handleDisconnect() {
        this.stopHeartbeat();
        this.clearTypingState();
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
        this.roomMembers?.setViewerRole?.(true);
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
        this.roomMembers?.setViewerRole?.(false);
        this.currentShareLink = '';
        this.seats = { host: null, guest: { ...invite, claimed: true } };
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
        this.stopTypingActivity();
        const sentAtLocal = this.getMonotonicTime();

        const sequenceNumber = this.outgoingMessageNumber;
        const routePath = this.getDefaultRoutePath('me');
        const hopCount = Math.max(routePath.length - 1, 1);
        const localDisplayName = this.localIdentity?.displayName || 'You';
        const localAvatar = this.normalizeAvatar(this.localIdentity?.avatar || this.computeAvatarFromName(localDisplayName));

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
              isOutOfOrder: false,
              displayName: localDisplayName,
              avatar: localAvatar
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
        this.clearTypingState();
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

        const fragment = document.createDocumentFragment();
        let lastMessageEntry = null;

        combined.forEach((entry) => {
          let element = null;

          if (entry.kind === 'system') {
            element = this.createSystemMessageElement(entry);
          } else if (entry.kind === 'message') {
            if (entry.sender?.id) {
              this.clearTypingUser(entry.sender.id);
            }
            if (this.showEncrypted) {
              element = entry.encrypted
                ? this.createEncryptedMessageElement(entry)
                : this.createEncryptedPlaceholderElement(entry);
            } else {
              const needsBreak = !lastMessageEntry || this.shouldShowTimeBreak(lastMessageEntry, entry);
              if (needsBreak) {
                fragment.appendChild(this.createTimeBreakElement(entry.displayAt ?? entry.at ?? Date.now()));
              }
              element = this.createPlainMessageElement(entry, lastMessageEntry);
              lastMessageEntry = entry;
            }
          }

          if (element) {
            fragment.appendChild(element);
          }
        });

        container.appendChild(fragment);

        if (shouldStick) {
          container.scrollTop = container.scrollHeight;
        }
      }

      createPlainMessageElement(entry, previousEntry = null) {
        const { text, type, displayAt } = entry;
        const isLocal = type === 'me';
        const sender = entry.sender || { id: entry.userId, displayName: entry.displayName, avatar: entry.avatar };
        const name = sender?.displayName || (isLocal ? 'You' : 'Guest');
        const shownTime = Number.isFinite(displayAt) ? displayAt : Date.now();
        const previousSameSender = previousEntry && previousEntry.sender?.id && sender?.id
          ? previousEntry.sender.id === sender.id
          : previousEntry?.type === type;
        const isNewTimeBlock = previousEntry ? this.shouldShowTimeBreak(previousEntry, entry) : true;
        const isConsecutive = Boolean(previousEntry) && previousSameSender && !isNewTimeBlock;
        const showAvatarHeader = !isLocal && (!isConsecutive || isNewTimeBlock);

        const message = document.createElement('div');
        message.className = `message ${isLocal ? 'local' : 'remote'}`;
        if (sender?.id) {
          message.dataset.sender = sender.id;
        }
        message.dataset.consecutive = isConsecutive ? 'true' : 'false';

        const palette = this.getAvatarPalette(sender);
        if (palette) {
          message.style.setProperty('--avatar-color-1', palette.primary);
          message.style.setProperty('--avatar-color-2', palette.secondary);
        }

        if (showAvatarHeader) {
          const header = document.createElement('div');
          header.className = 'sender-header';

          const avatarEl = document.createElement('div');
          avatarEl.className = 'sender-avatar';
          avatarEl.textContent = sender?.avatar?.emoji || '🙂';
          header.appendChild(avatarEl);

          const nameSpan = document.createElement('span');
          nameSpan.className = 'sender-name';
          nameSpan.textContent = name;
          header.appendChild(nameSpan);

          const timeSpan = document.createElement('span');
          timeSpan.className = 'sender-time';
          timeSpan.textContent = this.formatTimestamp(shownTime);
          header.appendChild(timeSpan);

          message.appendChild(header);
        }

        const wrapper = document.createElement('div');
        wrapper.className = 'message-content-wrapper';

        if (!isLocal && isConsecutive) {
          const tooltip = document.createElement('span');
          tooltip.className = 'sender-tooltip';
          tooltip.textContent = name;
          wrapper.appendChild(tooltip);
        }

        const bubble = document.createElement('div');
        bubble.className = 'message-bubble';

        const textEl = document.createElement('div');
        textEl.className = 'message-text';
        textEl.textContent = text;
        bubble.appendChild(textEl);

        const meta = document.createElement('div');
        meta.className = 'message-meta';

        if (isLocal) {
          const status = document.createElement('span');
          status.className = 'delivery-status';
          status.textContent = this.getDeliveryStatusIcon(entry.state);
          status.setAttribute('aria-label', `Message ${entry.state || 'sent'}`);
          meta.appendChild(status);
        }

        const timestamp = document.createElement('span');
        timestamp.className = 'timestamp';
        timestamp.textContent = this.formatCompactTime(shownTime);
        meta.appendChild(timestamp);

        bubble.appendChild(meta);
        wrapper.appendChild(bubble);
        message.appendChild(wrapper);

        return this.applyMessageMetadata(message, entry);
      }

      createTimeBreakElement(timestamp) {
        const when = Number.isFinite(timestamp) ? timestamp : Date.now();
        const wrapper = document.createElement('div');
        wrapper.className = 'time-break';

        const lineBefore = document.createElement('span');
        lineBefore.className = 'time-break-line';

        const text = document.createElement('span');
        text.className = 'time-break-text';
        text.textContent = this.formatTimeBreak(when);

        const lineAfter = document.createElement('span');
        lineAfter.className = 'time-break-line';

        wrapper.appendChild(lineBefore);
        wrapper.appendChild(text);
        wrapper.appendChild(lineAfter);

        return wrapper;
      }

      formatCompactTime(timestamp) {
        const value = Number.isFinite(timestamp) ? timestamp : Date.now();
        const now = Date.now();
        const diff = now - value;

        if (diff < 60000) {
          return 'now';
        }

        if (diff < 3600000) {
          const mins = Math.max(1, Math.floor(diff / 60000));
          return `${mins}m`;
        }

        const messageDate = new Date(value);
        const today = new Date();

        if (messageDate.toDateString() === today.toDateString()) {
          return messageDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
        }

        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        if (messageDate >= weekAgo) {
          return messageDate.toLocaleDateString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' });
        }

        return messageDate.toLocaleDateString([], { month: 'short', day: 'numeric' });
      }

      formatTimeBreak(timestamp) {
        const value = Number.isFinite(timestamp) ? timestamp : Date.now();
        const date = new Date(value);
        const now = new Date();
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const startOfYesterday = new Date(startOfToday);
        startOfYesterday.setDate(startOfYesterday.getDate() - 1);

        if (date >= startOfToday) {
          return `Today, ${date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
        }

        if (date >= startOfYesterday) {
          return `Yesterday, ${date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
        }

        return date.toLocaleDateString([], {
          weekday: 'long',
          month: 'long',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit'
        });
      }

      shouldShowTimeBreak(previousEntry, nextEntry) {
        if (!previousEntry) {
          return true;
        }
        if (!nextEntry) {
          return false;
        }
        const prevTime = Number.isFinite(previousEntry.displayAt)
          ? previousEntry.displayAt
          : Number.isFinite(previousEntry.at) ? previousEntry.at : 0;
        const nextTime = Number.isFinite(nextEntry.displayAt)
          ? nextEntry.displayAt
          : Number.isFinite(nextEntry.at) ? nextEntry.at : 0;

        if (!Number.isFinite(prevTime) || !Number.isFinite(nextTime)) {
          return false;
        }

        const diff = Math.abs(nextTime - prevTime);
        if (diff > 300000) {
          return true;
        }

        const prevDate = new Date(prevTime);
        const nextDate = new Date(nextTime);
        return prevDate.toDateString() !== nextDate.toDateString();
      }

      getDeliveryStatusIcon(state) {
        switch (state) {
          case 'sending':
            return '…';
          case 'propagating':
            return '⇆';
          case 'settling':
            return '⌛';
          case 'failed':
            return '⚠';
          case 'settled':
          default:
            return '✓✓';
        }
      }

      getAvatarPalette(source) {
        const baseColor = source?.avatar?.color || source?.color || '#4A9FD5';
        const sanitized = typeof baseColor === 'string' && /^#([0-9a-f]{6})$/i.test(baseColor)
          ? baseColor
          : '#4A9FD5';
        return {
          primary: this.adjustColor(sanitized, 1.15),
          secondary: this.adjustColor(sanitized, 0.85)
        };
      }

      adjustColor(hex, factor) {
        if (typeof hex !== 'string') {
          return '#4A9FD5';
        }
        const normalized = hex.replace('#', '');
        if (!/^[0-9a-f]{6}$/i.test(normalized)) {
          return '#4A9FD5';
        }
        const r = parseInt(normalized.slice(0, 2), 16);
        const g = parseInt(normalized.slice(2, 4), 16);
        const b = parseInt(normalized.slice(4, 6), 16);
        const adjust = (channel) => Math.min(255, Math.max(0, Math.round(channel * factor)));
        return `#${this.toHexComponent(adjust(r))}${this.toHexComponent(adjust(g))}${this.toHexComponent(adjust(b))}`;
      }

      toHexComponent(value) {
        const clamped = Math.min(255, Math.max(0, Math.round(value)));
        return clamped.toString(16).padStart(2, '0');
      }

      handleTypingActivity() {
        const input = DOM.messageInput;
        if (!input) {
          return;
        }
        const isActive = Boolean(input.value && input.value.trim().length > 0);
        this.setLocalTyping(isActive);
      }

      stopTypingActivity() {
        this.setLocalTyping(false);
      }

      setLocalTyping(active) {
        const normalized = Boolean(active);
        const now = Date.now();

        if (normalized) {
          if (this.typingResetTimer) {
            clearTimeout(this.typingResetTimer);
          }
          this.typingResetTimer = setTimeout(() => this.setLocalTyping(false), 4000);
          const shouldSend = !this.lastTypingState || (now - this.lastTypingSentAt > 2000);
          this.lastTypingState = true;
          if (shouldSend) {
            this.lastTypingSentAt = now;
            this.announceTypingState(true);
          }
        } else {
          if (this.typingResetTimer) {
            clearTimeout(this.typingResetTimer);
            this.typingResetTimer = null;
          }
          if (this.lastTypingState) {
            this.lastTypingState = false;
            this.lastTypingSentAt = now;
            this.announceTypingState(false);
          }
        }
      }

      async announceTypingState(active) {
        if (!this.conn || !CryptoManager.getCurrentKey()) {
          return;
        }

        const profile = this.localIdentity || {};
        const displayName = profile.displayName || 'You';
        const avatar = this.normalizeAvatar(profile.avatar || this.computeAvatarFromName(displayName));
        const userId = profile.id || this.localUserId;

        await this.sendSecureControlMessage({
          type: 'typing_state',
          active: Boolean(active),
          userId,
          displayName,
          avatar,
          timestamp: Date.now()
        });
      }

      handleTypingControl(message) {
        if (!message || typeof message !== 'object') {
          return;
        }

        const userId = message.userId || this.remoteIdentity?.id || this.remoteUserId;
        if (!userId) {
          return;
        }
        if (userId === this.localUserId || (this.localIdentity && userId === this.localIdentity.id)) {
          return;
        }

        if (!this.typingUsers) {
          this.typingUsers = new Map();
        }
        if (!this.typingTimeouts) {
          this.typingTimeouts = new Map();
        }

        const isActive = Boolean(message.active);
        if (isActive) {
          const displayName = typeof message.displayName === 'string'
            ? message.displayName
            : (this.remoteIdentity?.displayName || 'Guest');
          const avatar = this.normalizeAvatar(message.avatar || this.remoteIdentity?.avatar);
          if (this.typingTimeouts.has(userId)) {
            clearTimeout(this.typingTimeouts.get(userId));
            this.typingTimeouts.delete(userId);
          }
          this.typingUsers.set(userId, {
            id: userId,
            displayName,
            avatar
          });
          const timeout = setTimeout(() => this.clearTypingUser(userId), 5000);
          this.typingTimeouts.set(userId, timeout);
          this.renderTypingIndicator(Array.from(this.typingUsers.values()));
        } else {
          this.clearTypingUser(userId);
        }
      }

      clearTypingUser(userId) {
        if (!userId || !this.typingUsers) {
          return;
        }
        if (this.typingTimeouts?.has(userId)) {
          clearTimeout(this.typingTimeouts.get(userId));
          this.typingTimeouts.delete(userId);
        }
        const removed = this.typingUsers.delete(userId);
        if (removed) {
          this.renderTypingIndicator(Array.from(this.typingUsers.values()));
        }
      }

      clearTypingState() {
        if (this.typingResetTimer) {
          clearTimeout(this.typingResetTimer);
          this.typingResetTimer = null;
        }
        if (this.typingTimeouts) {
          for (const timeout of this.typingTimeouts.values()) {
            clearTimeout(timeout);
          }
          this.typingTimeouts.clear();
        }
        this.typingUsers?.clear?.();
        this.lastTypingState = false;
        this.lastTypingSentAt = 0;
        this.renderTypingIndicator([]);
      }

      getTypingIndicatorText(users) {
        if (!Array.isArray(users) || users.length === 0) {
          return 'Someone is typing';
        }
        const names = users
          .map((user) => (typeof user.displayName === 'string' && user.displayName.trim() ? user.displayName.trim() : 'Someone'));
        if (names.length === 1) {
          return `${names[0]} is typing`;
        }
        if (names.length === 2) {
          return `${names[0]} and ${names[1]} are typing`;
        }
        return `${names.length} people are typing`;
      }

      renderTypingIndicator(users) {
        const indicator = this.typingIndicator || DOM.typingIndicator;
        if (!indicator) {
          return;
        }

        const list = Array.isArray(users) ? users.filter(Boolean) : [];
        if (list.length === 0) {
          indicator.innerHTML = '';
          indicator.setAttribute('hidden', '');
          return;
        }

        const limited = list.slice(0, 3);
        const avatarHtml = limited.map((user) => {
          const palette = this.getAvatarPalette(user);
          const emoji = typeof user?.avatar?.emoji === 'string' && user.avatar.emoji.trim()
            ? user.avatar.emoji
            : '🙂';
          return `<span class="typing-avatar" style="--avatar-color-1:${palette.primary}; --avatar-color-2:${palette.secondary};">${this.escapeHtml(emoji)}</span>`;
        }).join('');

        const text = this.getTypingIndicatorText(list);
        indicator.innerHTML = `
          <div class="typing-avatars">${avatarHtml}</div>
          <div class="typing-text">${this.escapeHtml(text)}</div>
          <div class="typing-dots"><span></span><span></span><span></span></div>
        `;
        indicator.removeAttribute('hidden');
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
        this.roomMembers?.setViewerRole?.(false);
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

        this.updateInviteLink('');
        this.roomMembers?.clearActiveInvites?.();
        this.updateSimpleShareStatus('');
        this.updateFingerprintDisplay(null);
        this.pendingReentryRequest = null;
        this.setRoomContextMode(null);

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
        this.roomURLManager.clearRoute();
        this.bookmarkableRooms.updatePageTitle();
        this.roomReentry.hide();
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
