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

class SecureIdentityStorage {
  constructor(namespace = 'secure-master-identity') {
    this.namespace = namespace;
  }

  async saveIdentity(payload) {
    if (!payload) {
      return;
    }
    try {
      localStorage.setItem(this.namespace, JSON.stringify(payload));
    } catch (error) {
      console.warn('Unable to persist identity.', error);
    }
  }

  async getIdentity() {
    try {
      const stored = localStorage.getItem(this.namespace);
      return stored ? JSON.parse(stored) : null;
    } catch (error) {
      console.warn('Unable to read stored identity.', error);
      return null;
    }
  }

  async clearIdentity() {
    try {
      localStorage.removeItem(this.namespace);
    } catch (error) {
      console.warn('Unable to clear stored identity.', error);
    }
  }
}

class MasterIdentity {
  constructor() {
    if (typeof window === 'undefined') {
      throw new Error('Window unavailable');
    }
    this.storage = new SecureIdentityStorage();
    this.nameGenerator = typeof SecureNameGenerator === 'function' ? new SecureNameGenerator() : null;
    this.recoveryWords = this.buildRecoveryWordList();
  }

  async hasIdentity() {
    const stored = await this.storage.getIdentity();
    return Boolean(stored && stored.encrypted && stored.salt);
  }

  async getStoredProfile() {
    const stored = await this.storage.getIdentity();
    return stored?.profile || null;
  }

  async createIdentity(options = {}) {
    const { password, displayName } = typeof options === 'object' ? options : { password: options };

    if (!password || password.length < 12) {
      throw new Error('Password must be at least 12 characters.');
    }
    if (!window?.crypto?.subtle) {
      throw new Error('WebCrypto unavailable for identity creation');
    }

    const identityName = typeof displayName === 'string' && displayName.trim()
      ? displayName.trim()
      : this.generateDisplayName();

    const salt = crypto.getRandomValues(new Uint8Array(32));
    const keyMaterial = await this.getKeyMaterial(password);
    const identityKey = await this.deriveKey(keyMaterial, salt, ['encrypt']);

    const identity = {
      id: typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `id-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      displayName: identityName,
      avatar: this.generateAvatar(identityName),
      created: Date.now(),
      lastSeen: Date.now(),
      publicKey: await this.generatePublicKey(),
      recoveryPhrase: this.generateRecoveryPhrase()
    };

    const encryptedIdentity = await this.encrypt(identity, identityKey);
    await this.storage.saveIdentity({
      encrypted: encryptedIdentity,
      salt: this.toBase64(salt),
      profile: {
        displayName: identity.displayName,
        avatar: identity.avatar,
        created: identity.created,
        lastUnlocked: identity.lastSeen
      }
    });

    return { identity, recoveryPhrase: identity.recoveryPhrase };
  }

  async unlockIdentity(password) {
    if (!window?.crypto?.subtle) {
      throw new Error('WebCrypto unavailable for identity verification');
    }

    const stored = await this.storage.getIdentity();
    if (!stored?.encrypted || !stored?.salt) {
      return null;
    }

    if (!password || typeof password !== 'string') {
      throw new Error('Password required to decrypt identity');
    }

    const keyMaterial = await this.getKeyMaterial(password);
    const salt = this.fromBase64(stored.salt);
    const identityKey = await this.deriveKey(keyMaterial, salt, ['decrypt']);
    const identity = await this.decrypt(stored.encrypted, identityKey);
    identity.lastSeen = Date.now();

    await this.storage.saveIdentity({
      encrypted: stored.encrypted,
      salt: stored.salt,
      profile: {
        displayName: identity.displayName,
        avatar: identity.avatar,
        created: identity.created,
        lastUnlocked: identity.lastSeen
      }
    });

    return identity;
  }

  async clearIdentity() {
    await this.storage.clearIdentity();
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
    return crypto.subtle.deriveKey(
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

  generateDisplayName() {
    if (this.nameGenerator && typeof this.nameGenerator.generate === 'function') {
      return this.nameGenerator.generate({ includeNumber: true });
    }
    return `Secure-Member-${Math.floor(Math.random() * 900 + 100)}`;
  }

  generateAvatar(name) {
    const emojis = ['🦊', '🦁', '🐺', '🦅', '🐉', '🦉', '🐯', '🦜', '🦋', '🐠'];
    const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD'];
    const hash = this.hashString(name || 'member');
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

  buildRecoveryWordList() {
    if (this.nameGenerator) {
      const base = [...(this.nameGenerator.adjectives || []), ...(this.nameGenerator.nouns || [])];
      const extras = ['Signal', 'Cipher', 'Beacon', 'Vector', 'Nova', 'Atlas', 'Pulse', 'Quantum'];
      return Array.from(new Set([...base, ...extras])).map((word) => word.toLowerCase());
    }
    return ['secure', 'signal', 'cipher', 'vector', 'quantum', 'beacon', 'atlas', 'nova', 'pulse', 'ember'];
  }

  generateRecoveryPhrase(length = 12) {
    const words = this.recoveryWords && this.recoveryWords.length > 0
      ? this.recoveryWords
      : this.buildRecoveryWordList();
    const phrase = [];
    for (let i = 0; i < length; i++) {
      const index = this.getRandomIndex(words.length);
      phrase.push(words[index] || 'signal');
    }
    return phrase.join(' ');
  }

  getRandomIndex(max) {
    if (max <= 0) {
      return 0;
    }
    if (window?.crypto?.getRandomValues) {
      return crypto.getRandomValues(new Uint32Array(1))[0] % max;
    }
    return Math.floor(Math.random() * max);
  }
}

class RoomMembers {
  constructor(rootElement) {
    this.rootElement = rootElement || null;
    this.members = new Map();
    this.presenceTimeout = 30000;
    this.refreshInterval = null;
    this.ensureRefresh();
    this.render();
  }

  ensureRefresh() {
    if (this.refreshInterval) {
      return;
    }
    this.refreshInterval = setInterval(() => this.render(), 10000);
  }

  dispose() {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }
    this.members.clear();
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
      isHost: options.isHost ?? existing.isHost ?? false,
      verified: options.verified ?? existing.verified ?? false,
      online: options.online ?? existing.online ?? false,
      lastSeen: options.lastSeen ?? existing.lastSeen ?? now
    };

    if (member.online) {
      member.lastSeen = now;
    }

    this.members.set(member.id, member);
    this.render();
  }

  markOffline(memberId) {
    const member = this.members.get(memberId);
    if (!member) {
      return;
    }
    member.online = false;
    member.lastSeen = Date.now();
    this.members.set(memberId, member);
    this.render();
  }

  markOnline(memberId) {
    const member = this.members.get(memberId);
    if (!member) {
      return;
    }
    member.online = true;
    member.lastSeen = Date.now();
    this.members.set(memberId, member);
    this.render();
  }

  updatePresence(memberId) {
    const member = this.members.get(memberId);
    if (!member) {
      return;
    }
    member.lastSeen = Date.now();
    member.online = true;
    this.members.set(memberId, member);
    this.render();
  }

  removeMember(memberId) {
    if (this.members.delete(memberId)) {
      this.render();
    }
  }

  render() {
    if (!this.rootElement) {
      return;
    }

    const members = Array.from(this.members.values()).sort((a, b) => {
      if (a.isHost && !b.isHost) return -1;
      if (!a.isHost && b.isHost) return 1;
      return a.displayName.localeCompare(b.displayName);
    });

    const markup = `
      <div class="members-sidebar-inner">
        <div class="members-header">
          <span class="member-count">${members.length}</span>
          <span>Room Members</span>
        </div>
        <div class="members-list">
          ${members
            .map((member) => this.renderMember(member))
            .join('')}
        </div>
        <div class="members-footer">
          <div class="encryption-status">🔐 All messages end-to-end encrypted</div>
        </div>
      </div>
    `;

    this.rootElement.innerHTML = markup;
  }

  renderMember(member) {
    const statusClass = member.online ? 'online' : 'offline';
    const statusText = member.online
      ? 'Active'
      : `Last seen ${this.formatTime(member.lastSeen)}`;
    const badge = [member.isHost ? '👑' : '', member.verified ? '✓' : '']
      .filter(Boolean)
      .join(' ');

    const avatarColor = member.avatar?.color || '#4A9FD5';
    const avatarEmoji = member.avatar?.emoji || '🙂';

    return `
      <div class="member-item" data-id="${member.id}">
        <div class="member-avatar" style="--avatar-color: ${avatarColor}; background: ${avatarColor};">
          ${avatarEmoji}
        </div>
        <div class="member-info">
          <div class="member-name">${this.escapeHtml(member.displayName)}</div>
          <div class="member-status">
            <span class="status-dot ${statusClass}"></span>
            ${statusText}
          </div>
        </div>
        <div class="member-badge">${badge}</div>
      </div>
    `;
  }

  formatTime(timestamp) {
    if (!timestamp) {
      return 'recently';
    }
    const diff = Date.now() - timestamp;
    if (diff < 60000) {
      return 'just now';
    }
    if (diff < 3600000) {
      const minutes = Math.max(1, Math.floor(diff / 60000));
      return `${minutes} min ago`;
    }
    const hours = Math.max(1, Math.floor(diff / 3600000));
    if (hours < 24) {
      return `${hours} hr ago`;
    }
    const days = Math.floor(diff / 86400000);
    return `${days} day${days === 1 ? '' : 's'} ago`;
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
window.MasterIdentity = MasterIdentity;
window.RoomIdentity = MasterIdentity;
window.RoomMembers = RoomMembers;
