(function (global) {
  class MasterPasswordManager {
    constructor(options = {}) {
      this.storageKey = options.storageKey || 'workspace-master-password';
      this.password = null;
      this.generatedAt = null;
      this.loadFromSession();
    }

    loadFromSession() {
      if (typeof sessionStorage === 'undefined') {
        return;
      }
      try {
        const raw = sessionStorage.getItem(this.storageKey);
        if (!raw) {
          return;
        }
        const payload = JSON.parse(raw);
        if (payload && typeof payload.value === 'string') {
          this.password = payload.value;
          this.generatedAt = payload.generatedAt || null;
        }
      } catch (error) {
        console.warn('Unable to restore master password from session storage.', error);
        this.password = null;
        this.generatedAt = null;
      }
    }

    getPassword() {
      return typeof this.password === 'string' && this.password.length > 0
        ? this.password
        : null;
    }

    ensurePassword() {
      const existing = this.getPassword();
      if (existing) {
        return existing;
      }
      const generated = this.generateSecurePassword();
      this.remember(generated);
      return generated;
    }

    remember(value) {
      if (typeof value !== 'string' || !value.trim()) {
        return;
      }
      this.password = value.trim();
      this.generatedAt = Date.now();
      if (typeof sessionStorage === 'undefined') {
        return;
      }
      try {
        sessionStorage.setItem(this.storageKey, JSON.stringify({
          value: this.password,
          generatedAt: this.generatedAt
        }));
      } catch (error) {
        console.warn('Unable to persist master password for this session.', error);
      }
    }

    clear() {
      this.password = null;
      this.generatedAt = null;
      if (typeof sessionStorage === 'undefined') {
        return;
      }
      try {
        sessionStorage.removeItem(this.storageKey);
      } catch (error) {
        console.warn('Unable to clear master password from session storage.', error);
      }
    }

    generateSecurePassword() {
      const pattern = 'Ul#NlU$lUNlU';
      const charSets = {
        U: 'ABCDEFGHJKLMNPQRSTUVWXYZ',
        l: 'abcdefghjkmnpqrstuvwxyz',
        N: '23456789',
        '#': '#',
        '$': '$'
      };

      const characters = [];
      for (let index = 0; index < pattern.length; index += 1) {
        const token = pattern[index];
        const set = charSets[token];
        if (!set) {
          continue;
        }
        if (set.length === 1) {
          characters.push(set);
          continue;
        }
        let randomIndex;
        if (global.crypto?.getRandomValues) {
          const buffer = new Uint8Array(1);
          global.crypto.getRandomValues(buffer);
          randomIndex = buffer[0] % set.length;
        } else {
          randomIndex = Math.floor(Math.random() * set.length);
        }
        characters.push(set[randomIndex]);
      }

      return characters.join('');
    }

    async deriveKey(context, options = {}) {
      if (!global.crypto?.subtle) {
        throw new Error('WebCrypto unavailable for key derivation.');
      }

      const {
        usages = ['encrypt', 'decrypt'],
        length = 256,
        allowGenerate = true,
        algorithm = { name: 'AES-GCM', length: 256 }
      } = options;

      const password = allowGenerate ? this.ensurePassword() : this.getPassword();
      if (!password) {
        throw new Error('Master password unavailable for key derivation.');
      }

      const encoder = new TextEncoder();
      const keyMaterial = await global.crypto.subtle.importKey(
        'raw',
        encoder.encode(password),
        'PBKDF2',
        false,
        ['deriveKey', 'deriveBits']
      );

      const salt = encoder.encode(`workspace::${context}`);

      const derivedKey = await global.crypto.subtle.deriveKey(
        {
          name: 'PBKDF2',
          salt,
          iterations: 150000,
          hash: 'SHA-256'
        },
        keyMaterial,
        algorithm.name ? algorithm : { name: 'AES-GCM', length },
        false,
        usages
      );

      return derivedKey;
    }
  }

  const existing = global.masterPasswordManager instanceof MasterPasswordManager
    ? global.masterPasswordManager
    : null;

  if (!existing) {
    global.masterPasswordManager = new MasterPasswordManager();
  }

  global.MasterPasswordManager = MasterPasswordManager;
})(typeof window !== 'undefined' ? window : globalThis);
