const DOM = {
  messageInput: document.getElementById('messageInput'),
  sendBtn: document.getElementById('sendBtn'),
  simpleEmail: document.getElementById('simpleEmail'),
  simpleShareStatus: document.getElementById('simpleShareStatus'),
  shareLink: document.getElementById('shareLink'),
  hostPassword: document.getElementById('hostPassword'),
  joinCode: document.getElementById('joinCode'),
  joinPassword: document.getElementById('joinPassword'),
  joinSalt: document.getElementById('joinSalt'),
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
  roomSaltDisplay: document.getElementById('roomSaltDisplay'),
  fingerprintDisplay: document.getElementById('fingerprintDisplay'),
  fingerprintCode: document.getElementById('fingerprintCode'),
  statusText: document.getElementById('statusText'),
  statusDot: document.getElementById('statusDot'),
  chatMessages: document.getElementById('chatMessages'),
  encryptedToggle: document.getElementById('encryptedToggle'),
  schemaToggle: document.getElementById('schemaToggle')
};

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
        this.localUserId = generateId('user-');
        this.remoteUserId = null;
        this.showEncrypted = false;
        this.systemLog = [];
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
        this.checkForSharedLink();
        this.initEventListeners();
        this.initSimpleSetup();
        this.updateStatus('Disconnected', '');
        this.setWaitingBanner(false, '');
        this.updateFingerprintDisplay(null);
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
        const shareLinkEl = DOM.shareLink;
        const password = DOM.hostPassword?.value || '';
        const link = this.currentShareLink || shareLinkEl?.dataset?.link || shareLinkEl?.textContent?.trim();

        if (!link || link === 'Generating link...') {
          this.updateSimpleShareStatus('Generate a link first by starting a secure room.', true);
          return;
        }

        if (!password) {
          this.updateSimpleShareStatus('Set an encryption password before sharing the invite.', true);
          return;
        }

        const email = this.simpleEmailInput?.value.trim();
        if (!this.isValidEmail(email)) {
          this.updateSimpleShareStatus('Enter a valid email or leave blank to use the share menu.', true);
          return;
        }
        this.storeInviteEmail(email || '');
        const salt = this.roomSaltBase64 || '';
        const roomCode = this.roomId || 'Check the app for the current room code';
        const payload = `Join my secure room on Secure Chat.

Invite link: ${link}
Room code: ${roomCode}
Room salt: ${salt || 'Retrieve this from the app'}
Password: [share securely via a different channel]
`;

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

      // Check URL parameters for shared link
      checkForSharedLink() {
        const params = new URLSearchParams(window.location.search);
        const room = params.get('room');
        const saltParam = params.get('salt');

        if (room) {
          const joinCode = DOM.joinCode;
          if (joinCode) {
            joinCode.value = room;
          }
        }

        if (saltParam) {
          const saltBytes = this.base64ToBytes(saltParam);
          if (saltBytes) {
            this.pendingRoomSalt = saltBytes;
            this.roomSaltBase64 = this.bytesToBase64(saltBytes);
            const joinSalt = DOM.joinSalt;
            if (joinSalt) {
              joinSalt.value = this.roomSaltBase64;
            }
          }
        }

        if (room || saltParam) {
          this.showJoin();
          window.history.replaceState({}, document.title, window.location.pathname);
        }
      }

      // Generate shareable link
      generateShareLink(roomId) {
        const baseUrl = window.location.origin + window.location.pathname;
        if (!roomId) {
          return baseUrl;
        }

        const params = new URLSearchParams();
        params.set('room', roomId);
        if (this.roomSaltBase64) {
          params.set('salt', this.roomSaltBase64);
        }

        const query = params.toString();
        return query ? `${baseUrl}?${query}` : baseUrl;
      }

      copyShareLink(targetId = 'shareLink') {
        const elem = DOM[targetId] || document.getElementById(targetId);
        if (!elem) {
          return;
        }

        const storedLink = elem.dataset?.link;
        const link = storedLink || elem.textContent;

        if (!link || link === 'Generating link...') {
          return;
        }

        navigator.clipboard.writeText(link).then(() => {
          const original = elem.textContent;
          elem.textContent = '✅ Link copied!';
          setTimeout(() => {
            elem.textContent = elem.dataset?.link || original;
          }, 2000);
        });
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
          }
        } else {
          banner.classList.remove('active');
          if (copyBtn) {
            copyBtn.disabled = true;
          }
        }
      }

      // Screen Navigation
      showScreen(screenId) {
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        const target = DOM[screenId] || document.getElementById(screenId);
        if (target) {
          target.classList.add('active');
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
        this.generateRoomSalt();
        this.resetMessageCounters();
        this.pendingRoomSalt = null;
        this.updateFingerprintDisplay(null);
        const roomCodeDisplay = DOM.roomCode;
        if (roomCodeDisplay) {
          roomCodeDisplay.textContent = this.roomId;
        }
        const shareSection = DOM.shareSection;
        if (shareSection) {
          shareSection.style.display = 'none';
        }
        const shareLinkEl = DOM.shareLink;
        if (shareLinkEl) {
          shareLinkEl.textContent = 'Generating link...';
          delete shareLinkEl.dataset.link;
        }
        this.updateRoomSaltDisplay();
        this.currentShareLink = '';
        this.setWaitingBanner(false, '');
        this.showScreen('hostScreen');
      }

      showJoin() {
        CryptoManager.reset();
        this.latestFingerprint = '';
        this.lastAnnouncedEpoch = -1;
        if (!this.pendingRoomSalt) {
          const joinSalt = DOM.joinSalt;
          if (joinSalt) {
            joinSalt.value = '';
          }
        }
        this.updateFingerprintDisplay(null);
        this.resetMessageCounters();
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

        setTimeout(() => {
          const input = DOM.messageInput;
          if (input) {
            input.focus();
          }
        }, 100);
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
        const joinCode = DOM.joinCode;
        if (joinCode) {
          joinCode.value = roomId;
        }
        this.showJoin();
      }

      // Utilities
      generateRoomSalt() {
        if (!(typeof crypto !== 'undefined' && crypto.getRandomValues)) {
          throw new Error('Secure random generator unavailable');
        }

        const salt = crypto.getRandomValues(new Uint8Array(16));
        CryptoManager.setRoomSalt(salt);
        this.roomSalt = CryptoManager.getRoomSalt();
        this.roomSaltBase64 = this.bytesToBase64(this.roomSalt);
        this.updateRoomSaltDisplay();
        return salt;
      }

      updateRoomSaltDisplay() {
        const saltDisplay = DOM.roomSaltDisplay;
        if (saltDisplay) {
          if (this.roomSaltBase64) {
            saltDisplay.textContent = this.roomSaltBase64;
            saltDisplay.dataset.salt = this.roomSaltBase64;
          } else {
            saltDisplay.textContent = 'Generating salt...';
            delete saltDisplay.dataset.salt;
          }
        }
      }

      copyRoomSalt() {
        if (!this.roomSaltBase64 || typeof navigator?.clipboard?.writeText !== 'function') {
          return;
        }

        const display = DOM.roomSaltDisplay;
        navigator.clipboard.writeText(this.roomSaltBase64).then(() => {
          if (!display) {
            return;
          }
          const original = display.textContent;
          display.textContent = '✅ Salt copied!';
          setTimeout(() => {
            display.textContent = this.roomSaltBase64 || original;
          }, 2000);
        });
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
        let normalized = input.trim().replace(/-/g, '+').replace(/_/g, '/');
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

      copyRoomCode() {
        const roomCodeEl = DOM.roomCode;
        const code = roomCodeEl?.textContent;
        if (roomCodeEl && code && code !== 'Loading...' && typeof navigator?.clipboard?.writeText === 'function') {
          navigator.clipboard.writeText(code).then(() => {
            const original = roomCodeEl.textContent;
            roomCodeEl.textContent = '✅ Copied!';
            setTimeout(() => {
              roomCodeEl.textContent = original;
            }, 2000);
          });
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
        const hostPassword = DOM.hostPassword;
        const password = hostPassword?.value || '';
        if (!password) {
          alert('Please enter a password');
          return;
        }

        this.isHost = true;
        if (!this.roomId) {
          this.roomId = this.generateRoomId();
        }
        try {
          if (!(this.roomSalt instanceof Uint8Array)) {
            this.generateRoomSalt();
          }
        } catch (error) {
          console.error('Failed to prepare room salt.', error);
          alert('Unable to generate a secure room salt. Please reload the page and try again.');
          return;
        }

        try {
          await CryptoManager.loadStaticKeyFromPassword(password);
        } catch (error) {
          console.error('Failed to derive encryption key.', error);
          alert('Unable to derive the encryption key. Please try again with a different password.');
          return;
        }

        this.keyExchangeComplete = false;
        this.sentKeyExchange = false;
        CryptoManager.clearECDHKeyPair();
        this.resetMessageCounters();
        this.updateStatus('Creating room...', 'connecting');

        // Generate and display the share link
        const shareLink = this.generateShareLink(this.roomId);
        const shareLinkEl = DOM.shareLink;
        if (shareLinkEl) {
          shareLinkEl.textContent = shareLink;
          shareLinkEl.dataset.link = shareLink;
        }
        const shareSection = DOM.shareSection;
        if (shareSection) {
          shareSection.style.display = 'block';
        }
        this.currentShareLink = shareLink;
        this.updateSimpleShareStatus('');
        this.setWaitingBanner(true, shareLink, 'Share this link and send the password separately to your guest.');
        this.showChat();

        initPeer(this, this.roomId);
      }

      async startJoin() {
        const joinCode = DOM.joinCode;
        const joinPassword = DOM.joinPassword;
        const saltInput = DOM.joinSalt;
        const roomId = joinCode?.value.trim();
        const password = joinPassword?.value || '';
        const manualSalt = saltInput?.value.trim();

        if (!roomId || !password) {
          alert('Please enter the room code and password.');
          return;
        }

        let saltBytes = null;
        if (manualSalt) {
          saltBytes = this.base64ToBytes(manualSalt);
          if (!saltBytes) {
            alert('The room salt you entered is invalid. Please paste the exact salt or use the invite link.');
            return;
          }
        } else if (this.pendingRoomSalt instanceof Uint8Array) {
          saltBytes = this.pendingRoomSalt;
        }

        if (!(saltBytes instanceof Uint8Array)) {
          alert('Room salt is required. Open the invite link or paste the salt shared with you.');
          return;
        }

        this.roomId = roomId;
        this.isHost = false;
        this.currentShareLink = '';
        CryptoManager.setRoomSalt(saltBytes);
        this.roomSalt = CryptoManager.getRoomSalt();
        this.roomSaltBase64 = this.bytesToBase64(this.roomSalt);

        try {
          await CryptoManager.loadStaticKeyFromPassword(password);
        } catch (error) {
          console.error('Failed to derive encryption key for joiner.', error);
          alert('Unable to derive the encryption key. Double-check the password and salt.');
          return;
        }

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
          return { allowed: false, reason: 'Rate limit: Maximum 30 messages per minute' };
        }

        const twoSecondsAgo = now - 2000;
        const recent = limits.timestamps.filter((t) => t > twoSecondsAgo);
        if (recent.length >= limits.maxBurst) {
          return { allowed: false, reason: 'Slow down! Too many messages at once' };
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
          return;
        }

        if (text.length > MAX_MESSAGE_SIZE) {
          this.addSystemMessage(`⚠️ Message too long (max ${MAX_MESSAGE_SIZE} characters)`);
          return;
        }

        const rateCheck = this.canSendMessage();
        if (!rateCheck.allowed) {
          this.addSystemMessage(`⚠️ ${rateCheck.reason}`);
          return;
        }

        input.value = '';
        const timestamp = Date.now();

        const envelope = {
          kind: 'data',
          n: this.outgoingMessageNumber,
          sentAt: timestamp,
          data: { text }
        };

        let encrypted;
        try {
          encrypted = await CryptoManager.encrypt(JSON.stringify(envelope));
        } catch (error) {
          console.error('Failed to encrypt message.', error);
          this.addSystemMessage('⚠️ Unable to encrypt message');
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
            { roomId: this.roomId, messageId, userId: this.localUserId, text, type: 'me' },
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
        this.showEncrypted = !this.showEncrypted;
        const toggle = DOM.encryptedToggle;
        if (toggle) {
          toggle.classList.toggle('active', this.showEncrypted);
        }
        this.renderChatMessages();
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
          at: msg.at,
          encrypted: this.encryptedCache.get(msg.id) || null,
          editedAt: msg.editedAt
        }));

        const combined = [...messageEntries, ...this.systemLog];
        combined.sort((a, b) => (a.at || 0) - (b.at || 0));

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
        const { text, type, at } = entry;
        const message = document.createElement('div');
        message.className = `message ${type}`;

        const content = document.createElement('div');
        content.className = 'message-content';

        const textEl = document.createElement('div');
        textEl.className = 'message-text';
        textEl.textContent = text;

        const timeEl = document.createElement('div');
        timeEl.className = 'message-time';
        timeEl.textContent = this.formatTimestamp(at);

        content.appendChild(textEl);
        content.appendChild(timeEl);
        message.appendChild(content);

        return message;
      }

      createEncryptedMessageElement(entry) {
        const { encrypted, type, at } = entry;
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
        segments.push(this.formatTimestamp(at));
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
        const { type, at } = entry;
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
        info.textContent = this.formatTimestamp(at);

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

      addSystemMessage(text) {
        this.systemLog.push({
          kind: 'system',
          text,
          at: Date.now()
        });
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

        const closeBtn = modal.querySelector('.schema-header button');
        if (closeBtn) {
          closeBtn.addEventListener('click', () => modal.remove());
        }

        modal.addEventListener('click', (event) => {
          if (event.target === modal) {
            modal.remove();
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

        this.currentMessages = [];
        this.systemLog = [];
        this.encryptedCache = new Map();
        this.renderChatMessages([]);

        this.setWaitingBanner(false, '', 'Share the invite link below to bring someone into this secure room.');
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

        const shareLinkEl = DOM.shareLink;
        if (shareLinkEl) {
          shareLinkEl.textContent = 'Generating link...';
          delete shareLinkEl.dataset.link;
        }

        const shareSection = DOM.shareSection;
        if (shareSection) {
          shareSection.style.display = 'none';
        }

        this.updateSimpleShareStatus('');
        this.updateRoomSaltDisplay();
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

        const hostPassword = DOM.hostPassword;
        if (hostPassword) {
          hostPassword.value = '';
        }
        const joinPassword = DOM.joinPassword;
        if (joinPassword) {
          joinPassword.value = '';
        }
        const joinCode = DOM.joinCode;
        if (joinCode) {
          joinCode.value = '';
        }
        const joinSalt = DOM.joinSalt;
        if (joinSalt) {
          joinSalt.value = '';
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
