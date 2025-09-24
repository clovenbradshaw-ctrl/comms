class SecureNameGenerator {
  constructor() {
    this.adjectives = [
      'Azure', 'Crimson', 'Emerald', 'Golden', 'Silver', 'Violet', 'Amber', 'Jade',
      'Swift', 'Bright', 'Clever', 'Noble', 'Brave', 'Calm', 'Bold', 'Wise',
      'Storm', 'River', 'Mountain', 'Ocean', 'Forest', 'Desert', 'Thunder', 'Winter',
      'Cosmic', 'Stellar', 'Lunar', 'Solar', 'Nebula', 'Astral', 'Orbital', 'Quantum'
    ];

    this.nouns = [
      'Eagle', 'Wolf', 'Fox', 'Hawk', 'Lion', 'Tiger', 'Bear', 'Falcon',
      'Phoenix', 'Dragon', 'Griffin', 'Sphinx', 'Hydra', 'Pegasus', 'Kraken', 'Titan',
      'Shield', 'Compass', 'Beacon', 'Arrow', 'Blade', 'Crown', 'Torch', 'Prism',
      'Guardian', 'Explorer', 'Scholar', 'Ranger', 'Knight', 'Sage', 'Pioneer', 'Nomad'
    ];
  }

  generate(options = {}) {
    const { includeNumber = true, separator = '-', capitalize = true } = options;

    if (!window?.crypto?.getRandomValues) {
      const fallback = `${this.randomChoice(this.adjectives)}${separator}${this.randomChoice(this.nouns)}`;
      return includeNumber ? `${fallback}${separator}${Math.floor(Math.random() * 900 + 100)}` : fallback;
    }

    const adj = this.randomWord(this.adjectives, capitalize);
    const noun = this.randomWord(this.nouns, capitalize);

    const number = includeNumber
      ? (crypto.getRandomValues(new Uint32Array(1))[0] % 900) + 100
      : null;

    const parts = [adj, noun];
    if (includeNumber && Number.isInteger(number)) {
      parts.push(String(number));
    }

    return parts.join(separator);
  }

  generateMultiple(count = 5, options = {}) {
    const names = new Set();
    while (names.size < count) {
      names.add(this.generate(options));
    }
    return Array.from(names);
  }

  randomWord(list, capitalize) {
    const word = this.randomChoice(list);
    if (!capitalize) {
      return word.toLowerCase();
    }
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  }

  randomChoice(list) {
    if (!Array.isArray(list) || list.length === 0) {
      return '';
    }

    if (window?.crypto?.getRandomValues) {
      const index = crypto.getRandomValues(new Uint32Array(1))[0] % list.length;
      return list[index];
    }

    const index = Math.floor(Math.random() * list.length);
    return list[index];
  }
}

class SecureRoomStorage {
  constructor(namespace = 'secure-room-identity') {
    this.namespace = namespace;
  }

  async saveRoomIdentity(roomId, payload) {
    if (!roomId || !payload) {
      return;
    }
    try {
      localStorage.setItem(this.key(roomId), JSON.stringify(payload));
    } catch (error) {
      console.warn('Unable to persist room identity.', error);
    }
  }

  async getRoomIdentity(roomId) {
    if (!roomId) {
      return null;
    }
    try {
      const stored = localStorage.getItem(this.key(roomId));
      if (!stored) {
        return null;
      }
      return JSON.parse(stored);
    } catch (error) {
      console.warn('Unable to read room identity.', error);
      return null;
    }
  }

  async clearRoomIdentity(roomId) {
    try {
      localStorage.removeItem(this.key(roomId));
    } catch (error) {
      console.warn('Unable to clear room identity.', error);
    }
  }

  key(roomId) {
    return `${this.namespace}:${roomId}`;
  }
}

class RoomIdentity {
  constructor(roomId) {
    if (!roomId) {
      throw new Error('Room ID required to manage identity');
    }

    this.roomId = roomId;
    this.storage = new SecureRoomStorage();
  }

  async createIdentity(displayName, password) {
    if (!displayName || typeof displayName !== 'string') {
      throw new Error('Display name required');
    }
    if (!password || password.length < 4) {
      throw new Error('Password required');
    }
    if (!window?.crypto?.subtle) {
      throw new Error('WebCrypto unavailable for identity creation');
    }

    const salt = crypto.getRandomValues(new Uint8Array(32));
    const keyMaterial = await this.getKeyMaterial(password);
    const roomKey = await this.deriveKey(keyMaterial, salt, ['encrypt', 'decrypt']);

    const identity = {
      id: typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `id-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      displayName,
      avatar: this.generateAvatar(displayName),
      created: Date.now(),
      publicKey: await this.generatePublicKey(),
      lastSeen: Date.now()
    };

    const encryptedIdentity = await this.encrypt(identity, roomKey);
    await this.storage.saveRoomIdentity(this.roomId, {
      encrypted: encryptedIdentity,
      salt: this.toBase64(salt),
      hint: `${displayName.slice(0, 3)}***`
    });

    return identity;
  }

  async verifyReturningMember(password) {
    if (!window?.crypto?.subtle) {
      throw new Error('WebCrypto unavailable for identity verification');
    }

    const stored = await this.storage.getRoomIdentity(this.roomId);
    if (!stored) {
      return null;
    }

    if (!password || typeof password !== 'string') {
      throw new Error('Password required to decrypt identity');
    }

    const keyMaterial = await this.getKeyMaterial(password);
    const salt = this.fromBase64(stored.salt);
    const roomKey = await this.deriveKey(keyMaterial, salt, ['decrypt']);

    const identity = await this.decrypt(stored.encrypted, roomKey);
    identity.lastSeen = Date.now();
    return identity;
  }

  async getKeyMaterial(password) {
    const encoder = new TextEncoder();
    return crypto.subtle.importKey(
      'raw',
      encoder.encode(password),
      'PBKDF2',
      false,
      ['deriveBits', 'deriveKey']
    );
  }

  async deriveKey(keyMaterial, salt, usages) {
    const key = await crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt,
        iterations: 150000,
        hash: 'SHA-256'
      },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      usages
    );
    return key;
  }

  async encrypt(data, key) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encoded = new TextEncoder().encode(JSON.stringify(data));
    const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);
    return {
      iv: this.toBase64(iv),
      data: this.toBase64(new Uint8Array(encrypted))
    };
  }

  async decrypt(payload, key) {
    if (!payload?.iv || !payload?.data) {
      throw new Error('Invalid encrypted identity payload');
    }
    const iv = this.fromBase64(payload.iv);
    const data = this.fromBase64(payload.data);
    const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
    const decoder = new TextDecoder();
    return JSON.parse(decoder.decode(decrypted));
  }

  async generatePublicKey() {
    try {
      const keyPair = await crypto.subtle.generateKey(
        {
          name: 'ECDSA',
          namedCurve: 'P-256'
        },
        true,
        ['sign', 'verify']
      );
      const exported = await crypto.subtle.exportKey('spki', keyPair.publicKey);
      return this.toBase64(new Uint8Array(exported));
    } catch (error) {
      console.warn('Failed to create identity key pair.', error);
      return null;
    }
  }

  generateAvatar(name) {
    const emojis = ['🦊', '🦁', '🐺', '🦅', '🐉', '🦉', '🐯', '🦜', '🦋', '🐠'];
    const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD'];
    const hash = this.hashString(name);
    const emoji = emojis[hash % emojis.length];
    const color = colors[Math.floor(hash / emojis.length) % colors.length];
    return { emoji, color };
  }

  hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = (hash << 5) - hash + str.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash);
  }

  toBase64(bytes) {
    if (!(bytes instanceof Uint8Array)) {
      return '';
    }
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  fromBase64(b64) {
    if (!b64 || typeof b64 !== 'string') {
      return new Uint8Array();
    }
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }
}

class RoomMembersPanel {
  constructor(rootElement) {
    this.rootElement = rootElement || null;
    this.members = new Map();
    this.pendingInvites = [];
    this.activeTab = 'members';
    this.viewerIsHost = false;
    this.refreshInterval = null;
    this.boundHandleClick = (event) => this.handleInteraction(event.target, event);
    this.boundHandleKeyDown = (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        this.handleInteraction(event.target, event);
      }
    };
    this.ensureRefresh();
    this.attachRootHandlers();
    this.render();
  }

  attachRootHandlers() {
    if (this.rootElement && !this.rootElement.__roomMembersBound) {
      this.rootElement.addEventListener('click', this.boundHandleClick);
      this.rootElement.addEventListener('keydown', this.boundHandleKeyDown);
      this.rootElement.__roomMembersBound = true;
    }
  }

  ensureRefresh() {
    if (this.refreshInterval) {
      return;
    }
    this.refreshInterval = setInterval(() => this.render(), 5000);
  }

  dispose() {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }
    if (this.rootElement?.__roomMembersBound) {
      this.rootElement.removeEventListener('click', this.boundHandleClick);
      this.rootElement.removeEventListener('keydown', this.boundHandleKeyDown);
      delete this.rootElement.__roomMembersBound;
    }
    this.members.clear();
    this.pendingInvites = [];
    this.render();
  }

  setViewerRole(isHost) {
    this.viewerIsHost = Boolean(isHost);
    this.render();
  }

  reset() {
    this.members.clear();
    this.pendingInvites = [];
    this.render();
  }

  upsertMember(identity, options = {}) {
    if (!identity?.id) {
      return;
    }

    const existing = this.members.get(identity.id) || {};
    const now = Date.now();
    const member = {
      id: identity.id,
      displayName: identity.displayName || existing.displayName || 'Member',
      avatar: identity.avatar || existing.avatar || { emoji: '🙂', color: '#4A9FD5' },
      publicKey: identity.publicKey || existing.publicKey || null,
      isHost: Boolean(options.isHost ?? existing.isHost ?? identity.isHost),
      verified: Boolean(options.verified ?? existing.verified ?? identity.verified),
      online: Boolean(options.online ?? existing.online ?? false),
      lastSeen: Number.isFinite(options.lastSeen) ? options.lastSeen : existing.lastSeen ?? now,
      isTyping: Boolean(options.isTyping ?? existing.isTyping ?? false),
      pingMs: Number.isFinite(options.pingMs) ? options.pingMs : existing.pingMs ?? null
    };

    if (member.online) {
      member.lastSeen = now;
    }

    this.members.set(member.id, member);
    this.render();
  }

  updateMember(memberId, updates = {}) {
    const member = this.members.get(memberId);
    if (!member) {
      return;
    }
    const now = Date.now();
    if (updates.online) {
      member.lastSeen = now;
    }
    Object.assign(member, updates);
    if (updates.online) {
      member.online = true;
    }
    if (typeof updates.online === 'boolean' && !updates.online) {
      member.lastSeen = now;
    }
    this.members.set(memberId, member);
    this.render();
  }

  markOffline(memberId) {
    this.updateMember(memberId, { online: false });
  }

  markOnline(memberId) {
    this.updateMember(memberId, { online: true });
  }

  updatePresence(memberId) {
    this.updateMember(memberId, { online: true, lastSeen: Date.now() });
  }

  removeMember(memberId) {
    if (this.members.delete(memberId)) {
      this.render();
    }
  }

  setActiveInvite(invite) {
    if (!invite) {
      this.pendingInvites = [];
      this.render();
      return;
    }

    const expiresAt = Number(invite.expiresAt || invite.expiry || invite.expires);
    const inviteId = invite.id || invite.seatId || invite.token || `invite-${Date.now()}`;
    const createdAt = Number(invite.createdAt || Date.now());

    this.pendingInvites = [
      {
        id: inviteId,
        expiresAt: Number.isFinite(expiresAt) ? expiresAt : null,
        createdAt,
        url: invite.url || '',
        remainingTime: this.formatRemainingTime(expiresAt)
      }
    ];
    this.render();
  }

  clearActiveInvites() {
    if (this.pendingInvites.length === 0) {
      return;
    }
    this.pendingInvites = [];
    this.render();
  }

  handleInteraction(target, event) {
    if (!this.rootElement?.contains(target)) {
      return;
    }

    const tabButton = target.closest('[data-tab-target]');
    if (tabButton) {
      event?.preventDefault?.();
      const target = tabButton.dataset.tabTarget;
      if (target && target !== this.activeTab) {
        this.activeTab = target;
        this.render();
        if (target === 'chat') {
          const input = document?.getElementById?.('messageInput');
          input?.focus?.();
        }
      }
      return;
    }

    const actionBtn = target.closest('[data-room-action]');
    if (actionBtn) {
      event?.preventDefault?.();
      const action = actionBtn.dataset.roomAction;
      switch (action) {
        case 'invite':
          if (window.App?.refreshGuestInvite) {
            window.App.refreshGuestInvite({ announce: true });
          }
          this.dispatchCustomEvent('room-members:invite');
          break;
        case 'settings':
          this.dispatchCustomEvent('room-members:settings');
          break;
        case 'close':
          if (window.App?.disconnect) {
            window.App.disconnect();
          }
          this.dispatchCustomEvent('room-members:close-room');
          break;
        case 'leave':
          if (window.App?.disconnect) {
            window.App.disconnect();
          }
          this.dispatchCustomEvent('room-members:leave-room');
          break;
        case 'cancel-invite':
          {
            const inviteId = actionBtn.dataset.inviteId || null;
            if (window.App?.cancelActiveInvite) {
              window.App.cancelActiveInvite(inviteId);
            } else {
              this.clearActiveInvites();
            }
            this.dispatchCustomEvent('room-members:cancel-invite', { inviteId });
          }
          break;
        default:
          break;
      }
      return;
    }

    const memberItem = target.closest('.member-item[data-member-id]');
    if (memberItem) {
      const memberId = memberItem.dataset.memberId;
      this.dispatchCustomEvent('room-members:member-selected', { memberId });
    }
  }

  dispatchCustomEvent(name, detail = {}) {
    if (!this.rootElement) {
      return;
    }
    const event = new CustomEvent(name, { bubbles: true, detail });
    this.rootElement.dispatchEvent(event);
  }

  render() {
    if (!this.rootElement) {
      return;
    }

    const members = Array.from(this.members.values());
    const sortedMembers = members.sort((a, b) => {
      if (a.isHost && !b.isHost) return -1;
      if (!a.isHost && b.isHost) return 1;
      if (a.online && !b.online) return -1;
      if (!a.online && b.online) return 1;
      return a.displayName.localeCompare(b.displayName);
    });

    const onlineMembers = sortedMembers.filter((member) => member.online);
    const offlineMembers = sortedMembers.filter((member) => !member.online);
    const pendingInvites = this.pendingInvites.map((invite) => ({
      ...invite,
      remainingTime: this.formatRemainingTime(invite.expiresAt)
    }));
    const tabIds = {
      chat: 'room-panel-tab-chat',
      members: 'room-panel-tab-members',
      info: 'room-panel-tab-info'
    };
    const tabButtonIds = {
      chat: 'room-panel-btn-chat',
      members: 'room-panel-btn-members',
      info: 'room-panel-btn-info'
    };

    const markup = `
      <div class="members-sidebar-inner">
        <div class="room-tabs" role="tablist">
          <button class="tab ${this.activeTab === 'chat' ? 'active' : ''}" id="${tabButtonIds.chat}" data-tab-target="chat" role="tab" aria-selected="${this.activeTab === 'chat'}" aria-controls="${tabIds.chat}">
            <span>💬</span> Chat
          </button>
          <button class="tab ${this.activeTab === 'members' ? 'active' : ''}" id="${tabButtonIds.members}" data-tab-target="members" role="tab" aria-selected="${this.activeTab === 'members'}" aria-controls="${tabIds.members}">
            <span>👥</span> Members (${onlineMembers.length + offlineMembers.length})
          </button>
          <button class="tab ${this.activeTab === 'info' ? 'active' : ''}" id="${tabButtonIds.info}" data-tab-target="info" role="tab" aria-selected="${this.activeTab === 'info'}" aria-controls="${tabIds.info}">
            <span>ℹ️</span> Room Info
          </button>
        </div>

        <div class="tab-content ${this.activeTab === 'chat' ? 'active' : ''}" id="${tabIds.chat}" data-tab="chat" role="tabpanel" aria-labelledby="${tabButtonIds.chat}">
          <div class="chat-tab-placeholder">
            <p>Use the main chat area to send secure messages. Switch to the Members tab to see who else is here.</p>
          </div>
        </div>

        <div class="tab-content members-panel ${this.activeTab === 'members' ? 'active' : ''}" id="${tabIds.members}" data-tab="members" role="tabpanel" aria-labelledby="${tabButtonIds.members}">
          ${this.renderMembersSection('Online', onlineMembers, true)}
          ${offlineMembers.length > 0 ? this.renderMembersSection('Offline', offlineMembers, false) : ''}
          ${pendingInvites.length > 0 ? this.renderInvitesSection(pendingInvites) : ''}
          ${this.renderActions()}
        </div>

        <div class="tab-content room-info-panel ${this.activeTab === 'info' ? 'active' : ''}" id="${tabIds.info}" data-tab="info" role="tabpanel" aria-labelledby="${tabButtonIds.info}">
          ${this.renderRoomInfo(sortedMembers)}
        </div>
      </div>
    `;

    this.rootElement.innerHTML = markup;
  }

  renderMembersSection(title, members, isOnline) {
    const count = members.length;
    return `
      <div class="member-section">
        <h4 class="section-header">${title} — ${count}</h4>
        ${count === 0 ? '<div class="empty-state">No members yet.</div>' : members.map((member) => this.renderMember(member, isOnline)).join('')}
      </div>
    `;
  }

  renderInvitesSection(invites) {
    return `
      <div class="member-section">
        <h4 class="section-header">Pending Invites — ${invites.length}</h4>
        ${invites
          .map((invite) => `
            <div class="pending-invite">
              <div class="invite-icon">🎟️</div>
              <div class="invite-info">
                <span>Invite link active</span>
                <span class="expire-time">${invite.remainingTime}</span>
              </div>
              <button class="cancel-btn" data-room-action="cancel-invite" data-invite-id="${this.escapeHtml(invite.id)}">
                Cancel
              </button>
            </div>
          `)
          .join('')}
      </div>
    `;
  }

  renderActions() {
    return `
      <div class="room-actions">
        ${this.viewerIsHost
          ? `
            <button class="action-btn" data-room-action="invite">
              <span>➕</span> Invite Someone
            </button>
            <button class="action-btn" data-room-action="settings">
              <span>⚙️</span> Room Settings
            </button>
            <button class="action-btn danger" data-room-action="close">
              <span>🚪</span> Close Room
            </button>
          `
          : `
            <button class="action-btn" data-room-action="leave">
              <span>👋</span> Leave Room
            </button>
          `}
      </div>
    `;
  }

  renderRoomInfo(members) {
    const host = members.find((member) => member.isHost);
    const totalMembers = members.length;
    const onlineMembers = members.filter((member) => member.online).length;
    const hostName = host ? this.escapeHtml(host.displayName) : 'Unknown';
    const roleText = this.viewerIsHost ? 'You are hosting this room.' : 'You are a guest in this room.';

    return `
      <div class="room-info">
        <div class="info-row">
          <span class="info-label">Security</span>
          <span class="info-value">🔐 End-to-end encrypted</span>
        </div>
        <div class="info-row">
          <span class="info-label">Host</span>
          <span class="info-value">${hostName}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Members</span>
          <span class="info-value">${onlineMembers} online · ${totalMembers} total</span>
        </div>
        <div class="info-row">
          <span class="info-label">Your role</span>
          <span class="info-value">${roleText}</span>
        </div>
      </div>
    `;
  }

  renderMember(member, isOnline) {
    const avatarColor = member.avatar?.color || '#4A9FD5';
    const avatarEmoji = member.avatar?.emoji || '🙂';
    const name = this.escapeHtml(member.displayName);
    const status = isOnline
      ? member.isTyping
        ? 'typing…'
        : 'Active now'
      : `Last seen ${this.formatLastSeen(member.lastSeen)}`;
    const bars = this.getConnectionBars(member.pingMs);
    const pingLabel = Number.isFinite(member.pingMs) ? `${member.pingMs}ms latency` : 'Latency unknown';

    return `
      <div class="member-item" data-member-id="${this.escapeHtml(member.id)}" role="button" tabindex="0">
        <div class="member-presence">
          <div class="member-avatar" style="background: ${avatarColor};">${avatarEmoji}</div>
          <span class="presence-indicator ${isOnline ? 'online' : 'offline'}" aria-hidden="true"></span>
        </div>
        <div class="member-info">
          <div class="member-name">
            ${name}
            ${member.isHost ? '<span class="host-crown" title="Host">👑</span>' : ''}
          </div>
          <div class="member-status">
            ${isOnline ? `<span class="typing-indicator">${status}</span>` : `<span class="last-seen">${status}</span>`}
          </div>
        </div>
        <div class="member-meta">
          <span class="connection-quality" title="${pingLabel}">${bars}</span>
        </div>
      </div>
    `;
  }

  formatLastSeen(timestamp) {
    if (!timestamp) {
      return 'recently';
    }
    const diff = Date.now() - timestamp;
    if (diff < 15000) {
      return 'just now';
    }
    if (diff < 60000) {
      return `${Math.max(1, Math.floor(diff / 1000))}s ago`;
    }
    if (diff < 3600000) {
      const minutes = Math.max(1, Math.floor(diff / 60000));
      return `${minutes}m ago`;
    }
    if (diff < 86400000) {
      const hours = Math.max(1, Math.floor(diff / 3600000));
      return `${hours}h ago`;
    }
    const days = Math.max(1, Math.floor(diff / 86400000));
    return `${days}d ago`;
  }

  formatRemainingTime(expiresAt) {
    if (!Number.isFinite(expiresAt)) {
      return 'Expires soon';
    }
    const diff = expiresAt - Date.now();
    if (diff <= 0) {
      return 'Expired';
    }
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    if (minutes >= 60) {
      const hours = Math.floor(minutes / 60);
      const mins = minutes % 60;
      return `Expires in ${hours}h ${mins}m`;
    }
    if (minutes > 0) {
      const secs = seconds % 60;
      return `Expires in ${minutes}m ${secs.toString().padStart(2, '0')}s`;
    }
    return `Expires in ${seconds}s`;
  }

  getConnectionBars(pingMs) {
    if (!Number.isFinite(pingMs)) {
      return '📶';
    }
    if (pingMs <= 120) {
      return '▂▃▄▅▇';
    }
    if (pingMs <= 240) {
      return '▂▃▄▅';
    }
    if (pingMs <= 480) {
      return '▂▃▄';
    }
    return '▂▃';
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
}

window.SecureNameGenerator = SecureNameGenerator;
window.RoomIdentity = RoomIdentity;
window.RoomMembers = RoomMembersPanel;
