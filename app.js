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
  historyItems: document.getElementById('historyItems'),
  fingerprintDisplay: document.getElementById('fingerprintDisplay'),
  fingerprintCode: document.getElementById('fingerprintCode'),
  statusText: document.getElementById('statusText'),
  statusDot: document.getElementById('statusDot'),
  chatMessages: document.getElementById('chatMessages'),
  encryptedToggle: document.getElementById('encryptedToggle'),
  schemaToggle: document.getElementById('schemaToggle'),
  systemAnnouncements: document.getElementById('systemAnnouncements')
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
        this.expectedIncomingMessageNumber = 1;
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
        });

        this.dom = DOM;
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

        if (shareSection) {
          shareSection.style.display = url ? 'block' : 'none';
        }

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
        if (announce) {
          this.addSystemMessage('✨ Generated a fresh secure invite link.');
        }

        return link;
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
        this.expectedIncomingMessageNumber = 1;
        this.lastRotationMessageCount = 0;
        if (this.messageRateLimit) {
          this.messageRateLimit.timestamps = [];
        }
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

        const envelope = {
          kind: 'data',
          n: this.outgoingMessageNumber,
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
              receivedAt: sentAtLocal
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

        this.currentMessages = Array.isArray(messages) ? messages : [];

        const messageEntries = this.currentMessages.map((msg) => ({
          kind: 'message',
          id: msg.id,
          text: msg.content,
          type: msg.type === 'me' ? 'me' : 'them',
          at: msg.displayAt ?? msg.at,
          displayAt: msg.displayAt ?? msg.at,
          receivedAt: msg.receivedAt ?? msg.displayAt ?? msg.at,
          sentAt: msg.sentAt ?? msg.at,
          sentAtLocal: msg.sentAtLocal ?? msg.sentAt ?? msg.at,
          localOrder: msg.localOrder || 0,
          encrypted: this.encryptedCache.get(msg.id) || null,
          editedAt: msg.editedAt
        }));

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

        container.scrollTop = container.scrollHeight;
      }

      createPlainMessageElement(entry) {
        const { text, type, receivedAt, displayAt } = entry;
        const message = document.createElement('div');
        message.className = `message ${type}`;

        const content = document.createElement('div');
        content.className = 'message-content';

        const textEl = document.createElement('div');
        textEl.className = 'message-text';
        textEl.textContent = text;

        const timeEl = document.createElement('div');
        timeEl.className = 'message-time';
        const shownTime = typeof receivedAt === 'number' ? receivedAt : displayAt;
        timeEl.textContent = this.formatTimestamp(shownTime);

        content.appendChild(textEl);
        content.appendChild(timeEl);
        message.appendChild(content);

        return message;
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

        return message;
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

        return message;
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

        this.updateInviteLink('');
        this.updateSimpleShareStatus('');
        this.updateFingerprintDisplay(null);

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
