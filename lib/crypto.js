const FINGERPRINT_COLORS = ['Amber', 'Azure', 'Blue', 'Cobalt', 'Crimson', 'Emerald', 'Golden', 'Indigo', 'Ivory', 'Jade', 'Magenta', 'Onyx', 'Ruby', 'Saffron', 'Scarlet', 'Silver', 'Teal', 'Umber', 'Violet', 'Copper'];
const FINGERPRINT_ANIMALS = ['Falcon', 'Tiger', 'Wolf', 'Otter', 'Eagle', 'Panther', 'Fox', 'Hawk', 'Lynx', 'Panda', 'Raven', 'Shark', 'Bison', 'Heron', 'Dragonfly', 'Whale', 'Kestrel', 'Badger', 'Coyote', 'Orca'];
const FINGERPRINT_NUMBERS = ['Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen'];
const FINGERPRINT_PLACES = ['Harbor', 'Mountain', 'Forest', 'River', 'Canyon', 'Desert', 'Valley', 'Grove', 'Summit', 'Lagoon', 'Prairie', 'Temple', 'Island', 'Village', 'Tundra', 'Meadow', 'Fjord', 'Citadel', 'Bridge', 'Monolith'];

function toBase64Url(bytes) {
  if (!(bytes instanceof Uint8Array)) {
    return '';
  }
  let base64;
  if (typeof btoa === 'function') {
    let binary = '';
    bytes.forEach((b) => {
      binary += String.fromCharCode(b);
    });
    base64 = btoa(binary);
  } else if (typeof Buffer !== 'undefined') {
    base64 = Buffer.from(bytes).toString('base64');
  } else {
    throw new Error('Base64 encoding unavailable');
  }
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function fromBase64Url(value) {
  if (typeof value !== 'string' || !value.trim()) {
    return null;
  }
  let normalized = value.trim();
  normalized = normalized.replace(/-/g, '+').replace(/_/g, '/');
  while (normalized.length % 4 !== 0) {
    normalized += '=';
  }
  try {
    if (typeof atob === 'function') {
      const binary = atob(normalized);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) {
        bytes[i] = binary.charCodeAt(i);
      }
      return bytes;
    }
    if (typeof Buffer !== 'undefined') {
      return new Uint8Array(Buffer.from(normalized, 'base64'));
    }
  } catch (error) {
    return null;
  }
  return null;
}

class SecureInvite {
  static async generateSeat(ttlMs = 15 * 60 * 1000) {
    if (!crypto?.getRandomValues) {
      throw new Error('Secure random source unavailable');
    }

    const keyMaterial = crypto.getRandomValues(new Uint8Array(32));
    const seatToken = crypto.getRandomValues(new Uint8Array(16));

    return {
      seatId: toBase64Url(seatToken),
      secretKey: toBase64Url(keyMaterial),
      claimed: false,
      expiresAt: Date.now() + ttlMs
    };
  }

  static toBase64Url(bytes) {
    return toBase64Url(bytes);
  }

  static fromBase64Url(value) {
    return fromBase64Url(value);
  }

  static async deriveSeatKey(secretKey, seatId) {
    const secretBytes = fromBase64Url(secretKey);
    const seatBytes = fromBase64Url(seatId);

    if (!(secretBytes instanceof Uint8Array) || secretBytes.length !== 32) {
      throw new Error('Invalid seat secret material');
    }

    if (!(seatBytes instanceof Uint8Array) || seatBytes.length === 0) {
      throw new Error('Invalid seat identifier');
    }

    const hkdfKey = await crypto.subtle.importKey(
      'raw',
      secretBytes,
      'HKDF',
      false,
      ['deriveBits']
    );

    const derivedBits = await crypto.subtle.deriveBits(
      {
        name: 'HKDF',
        hash: 'SHA-256',
        salt: seatBytes,
        info: new TextEncoder().encode('secure-seat-material')
      },
      hkdfKey,
      512
    );

    const bytes = new Uint8Array(derivedBits);
    const keyBytes = bytes.slice(0, 32);
    const fingerprintBytes = bytes.slice(32, 48);

    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      keyBytes,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );

    return {
      key: cryptoKey,
      baseKeyMaterial: keyBytes.slice().buffer,
      fingerprint: formatFingerprint(fingerprintBytes)
    };
  }

  static async signInvite(roomId, seatId, secretKey, expiresAt) {
    if (!roomId || !seatId || !secretKey) {
      throw new Error('Missing invite parameters');
    }

    const secretBytes = fromBase64Url(secretKey);
    if (!(secretBytes instanceof Uint8Array)) {
      throw new Error('Invalid seat secret');
    }

    const key = await crypto.subtle.importKey(
      'raw',
      secretBytes,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );

    const payload = `${roomId}.${seatId}.${expiresAt || 0}`;
    const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
    return toBase64Url(new Uint8Array(signature));
  }

  static async verifyInviteSignature(invite) {
    if (!invite?.roomId || !invite?.seatId || !invite?.secretKey || !invite?.signature) {
      return false;
    }

    try {
      const expected = await SecureInvite.signInvite(
        invite.roomId,
        invite.seatId,
        invite.secretKey,
        invite.expiresAt
      );
      return expected === invite.signature;
    } catch (error) {
      console.warn('Failed to verify invite signature.', error);
      return false;
    }
  }

  static encodePayload(payload) {
    if (!payload) {
      return '';
    }
    const json = JSON.stringify(payload);
    const bytes = new TextEncoder().encode(json);
    return toBase64Url(bytes);
  }

  static decodePayload(encoded) {
    if (typeof encoded !== 'string' || !encoded.trim()) {
      return null;
    }

    const bytes = fromBase64Url(encoded);
    if (!(bytes instanceof Uint8Array)) {
      return null;
    }

    try {
      const json = new TextDecoder().decode(bytes);
      return JSON.parse(json);
    } catch (error) {
      console.warn('Unable to decode invite payload.', error);
      return null;
    }
  }
}

class InviteManager {
  constructor() {
    this.usedInvites = new Set();
    this.db = null;
    this.ready = this.init();
  }

  async init() {
    if (typeof indexedDB === 'undefined') {
      return;
    }

    try {
      this.db = await this.openDB();
      await this.loadUsedInvites();
    } catch (error) {
      console.warn('InviteManager falling back to memory store.', error);
      this.db = null;
    }
  }

  openDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('secure-chat-invites', 1);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains('claimed')) {
          db.createObjectStore('claimed', { keyPath: 'token' });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async loadUsedInvites() {
    if (!this.db) {
      return;
    }

    await new Promise((resolve, reject) => {
      const transaction = this.db.transaction('claimed', 'readonly');
      const store = transaction.objectStore('claimed');
      const request = store.openCursor();

      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          const { token, expiresAt } = cursor.value || {};
          if (expiresAt && expiresAt < Date.now()) {
            this.deleteToken(token).catch(() => {});
          } else if (token) {
            this.usedInvites.add(token);
          }
          cursor.continue();
        }
      };

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }

  async deleteToken(token) {
    if (!token || !this.db) {
      return;
    }

    await new Promise((resolve, reject) => {
      const transaction = this.db.transaction('claimed', 'readwrite');
      const store = transaction.objectStore('claimed');
      store.delete(token);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }

  async isClaimed(token) {
    if (!token) {
      return false;
    }

    if (this.usedInvites.has(token)) {
      return true;
    }

    if (!this.db) {
      return false;
    }

    return new Promise((resolve) => {
      const transaction = this.db.transaction('claimed', 'readonly');
      const store = transaction.objectStore('claimed');
      const request = store.get(token);
      request.onsuccess = () => {
        const record = request.result;
        if (record?.expiresAt && record.expiresAt < Date.now()) {
          this.deleteToken(token).catch(() => {});
          resolve(false);
          return;
        }
        resolve(Boolean(record));
      };
      request.onerror = () => resolve(false);
    });
  }

  async markClaimed(token, expiresAt = 0) {
    if (!token) {
      return;
    }
    this.usedInvites.add(token);

    if (!this.db) {
      return;
    }

    await new Promise((resolve, reject) => {
      const transaction = this.db.transaction('claimed', 'readwrite');
      const store = transaction.objectStore('claimed');
      store.put({ token, expiresAt });
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }

  async validateInvite(invite) {
    const roomId = invite?.roomId;
    const seatId = invite?.seatId;
    const expiresAt = invite?.expiresAt;
    const secretKey = invite?.secretKey;
    const signature = invite?.signature;

    if (!roomId || !seatId || !secretKey) {
      throw new Error('Incomplete invite payload');
    }

    if (typeof expiresAt === 'number' && expiresAt < Date.now()) {
      throw new Error('Invite has expired');
    }

    if (!signature || !(await SecureInvite.verifyInviteSignature(invite))) {
      throw new Error('Invalid invite signature');
    }

    const token = `${roomId}.${seatId}`;
    if (await this.isClaimed(token)) {
      throw new Error('Invite already claimed');
    }

    await this.markClaimed(token, expiresAt || 0);
    return true;
  }
}

function formatFingerprint(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length === 0) {
    return '';
  }

  const color = FINGERPRINT_COLORS[bytes[0] % FINGERPRINT_COLORS.length];
  const animal = FINGERPRINT_ANIMALS[bytes[1] % FINGERPRINT_ANIMALS.length];
  const number = FINGERPRINT_NUMBERS[bytes[2] % FINGERPRINT_NUMBERS.length];
  const place = FINGERPRINT_PLACES[bytes[3] % FINGERPRINT_PLACES.length];

  return `\uD83D\uDD10 ${color}-${animal}-${number}-${place}`;
}

function ensureArrayBuffer(material) {
  if (material instanceof ArrayBuffer) {
    return material;
  }
  if (material?.buffer instanceof ArrayBuffer) {
    return material.buffer.slice(material.byteOffset, material.byteOffset + material.byteLength);
  }
  throw new Error('Invalid key material');
}

async function deriveKeyFromPassword(password, salt) {
  if (!password || !(salt instanceof Uint8Array)) {
    throw new Error('Missing password or room salt');
  }

  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );

  const params = {
    name: 'PBKDF2',
    salt,
    iterations: 100000,
    hash: 'SHA-256'
  };

  const derivedBits = await crypto.subtle.deriveBits(params, keyMaterial, 512);
  const bytes = new Uint8Array(derivedBits);
  const keyBytes = bytes.slice(0, 32);
  const fingerprintBytes = bytes.slice(32, 48);

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );

  return {
    key: cryptoKey,
    baseKeyMaterial: keyBytes.slice().buffer,
    fingerprint: formatFingerprint(fingerprintBytes)
  };
}

async function encryptWithKey(key, text) {
  if (!key) {
    throw new Error('Encryption key unavailable');
  }

  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(text);
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, tagLength: 128 },
    key,
    encoded
  );

  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(encrypted), iv.length);
  return combined;
}

async function decryptWithKey(key, data) {
  if (!key) {
    throw new Error('Decryption key unavailable');
  }

  const iv = data.slice(0, 12);
  const encrypted = data.slice(12);

  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv, tagLength: 128 },
    key,
    encrypted
  );
  return new TextDecoder().decode(decrypted);
}

async function deriveRatchetKey(baseKey, epoch, salt) {
  const material = ensureArrayBuffer(baseKey);

  const hkdfKey = await crypto.subtle.importKey(
    'raw',
    material,
    'HKDF',
    false,
    ['deriveBits']
  );

  const encoder = new TextEncoder();
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: salt instanceof Uint8Array ? salt : new Uint8Array(16),
      info: encoder.encode(`epoch-${epoch}`)
    },
    hkdfKey,
    256
  );

  return crypto.subtle.importKey(
    'raw',
    derivedBits,
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt']
  );
}

async function generateECDHKeyPair() {
  return crypto.subtle.generateKey(
    {
      name: 'ECDH',
      namedCurve: 'P-256'
    },
    true,
    ['deriveBits']
  );
}

async function deriveSharedSecret(keyPair, peerPublicKeyBytes) {
  if (!(peerPublicKeyBytes instanceof Uint8Array) || peerPublicKeyBytes.length === 0) {
    throw new Error('Invalid peer public key');
  }

  const peerPublicKey = await crypto.subtle.importKey(
    'raw',
    peerPublicKeyBytes,
    {
      name: 'ECDH',
      namedCurve: 'P-256'
    },
    true,
    []
  );

  const bits = await crypto.subtle.deriveBits(
    {
      name: 'ECDH',
      public: peerPublicKey
    },
    keyPair.privateKey,
    256
  );

  return new Uint8Array(bits);
}

async function deriveSharedKey(sharedSecret, salt, info = 'secure-chat-ecdh') {
  const hkdfKey = await crypto.subtle.importKey(
    'raw',
    sharedSecret,
    'HKDF',
    false,
    ['deriveBits']
  );

  const encoder = new TextEncoder();
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt,
      info: encoder.encode(info)
    },
    hkdfKey,
    256
  );

  const key = await crypto.subtle.importKey(
    'raw',
    derivedBits,
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt']
  );

  return { key, material: new Uint8Array(derivedBits) };
}

async function fingerprintFromMaterial(bytes) {
  if (!(bytes instanceof Uint8Array)) {
    return '';
  }
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return formatFingerprint(new Uint8Array(digest).slice(0, 16));
}

const CryptoManager = (() => {
  const state = {
    roomSalt: null,
    baseKeyMaterial: null,
    currentKey: null,
    currentEpoch: 0,
    fingerprint: '',
    ecdhKeyPair: null
  };

  const listeners = new Set();

  function emit(reason, details = {}) {
    const snapshot = {
      reason,
      epoch: state.currentEpoch,
      fingerprint: state.fingerprint,
      hasKey: Boolean(state.currentKey),
      roomSalt: state.roomSalt,
      ...details
    };

    listeners.forEach((fn) => {
      try {
        fn(snapshot);
      } catch (error) {
        console.error('crypto:updated listener error', error);
      }
    });
  }

  function ensureSaltSet() {
    if (!(state.roomSalt instanceof Uint8Array)) {
      throw new Error('Room salt not set');
    }
  }

  function cloneSalt(bytes) {
    if (!(bytes instanceof Uint8Array)) {
      return null;
    }
    return new Uint8Array(bytes);
  }

  return {
    setRoomSalt(bytes) {
      state.roomSalt = cloneSalt(bytes);
      emit('room-salt');
      return state.roomSalt;
    },

    getRoomSalt() {
      return cloneSalt(state.roomSalt);
    },

    async loadStaticKeyFromPassword(password) {
      ensureSaltSet();
      const result = await deriveKeyFromPassword(password, state.roomSalt);
      state.baseKeyMaterial = result.baseKeyMaterial;
      state.currentKey = result.key;
      state.currentEpoch = 0;
      state.fingerprint = result.fingerprint;
      emit('static-key', { fingerprint: state.fingerprint });
      return { key: state.currentKey, fingerprint: state.fingerprint };
    },

    async loadStaticKeyFromSeat(secretKey, seatId) {
      ensureSaltSet();
      const result = await SecureInvite.deriveSeatKey(secretKey, seatId);
      state.baseKeyMaterial = result.baseKeyMaterial.slice(0);
      state.currentKey = result.key;
      state.currentEpoch = 0;
      state.fingerprint = result.fingerprint;
      emit('static-key', { fingerprint: state.fingerprint });
      return { key: state.currentKey, fingerprint: state.fingerprint };
    },

    async beginECDH() {
      state.ecdhKeyPair = await generateECDHKeyPair();
      emit('ecdh-begin');
      return state.ecdhKeyPair;
    },

    async applyPeerECDH(peerPublicKeyBytes) {
      if (!state.ecdhKeyPair) {
        await this.beginECDH();
      }
      return deriveSharedSecret(state.ecdhKeyPair, peerPublicKeyBytes);
    },

    async promoteSharedSecret(sharedSecret) {
      ensureSaltSet();
      const { key, material } = await deriveSharedKey(sharedSecret, state.roomSalt, 'secure-chat-ecdh');
      state.baseKeyMaterial = material.slice().buffer;
      state.currentKey = key;
      state.currentEpoch = 0;
      state.fingerprint = await fingerprintFromMaterial(material);
      emit('promote', { fingerprint: state.fingerprint });
      return { key: state.currentKey, fingerprint: state.fingerprint };
    },

    async maybeRotate(epoch) {
      if (!Number.isInteger(epoch) || epoch <= state.currentEpoch) {
        return false;
      }
      if (!state.baseKeyMaterial) {
        return false;
      }

      ensureSaltSet();
      state.currentKey = await deriveRatchetKey(state.baseKeyMaterial, epoch, state.roomSalt);
      state.currentEpoch = epoch;
      emit('rotation', { epoch });
      return true;
    },

    getCurrentKey() {
      return state.currentKey;
    },

    getCurrentEpoch() {
      return state.currentEpoch;
    },

    getFingerprint() {
      return state.fingerprint;
    },

    hasBaseMaterial() {
      return Boolean(state.baseKeyMaterial);
    },

    getECDHKeyPair() {
      return state.ecdhKeyPair;
    },

    clearECDHKeyPair() {
      state.ecdhKeyPair = null;
      emit('ecdh-reset');
    },

    async encrypt(text) {
      return encryptWithKey(state.currentKey, text);
    },

    async decrypt(data) {
      try {
        return await decryptWithKey(state.currentKey, data);
      } catch (error) {
        console.error('Message authentication failed:', error);
        return null;
      }
    },

    async encryptWithKey(key, text) {
      return encryptWithKey(key, text);
    },

    async decryptWithKey(key, data) {
      try {
        return await decryptWithKey(key, data);
      } catch (error) {
        console.error('Message authentication failed:', error);
        return null;
      }
    },

    onUpdated(handler) {
      if (typeof handler !== 'function') {
        return () => {};
      }
      listeners.add(handler);
      return () => {
        listeners.delete(handler);
      };
    },

    reset() {
      state.baseKeyMaterial = null;
      state.currentKey = null;
      state.currentEpoch = 0;
      state.fingerprint = '';
      state.ecdhKeyPair = null;
      state.roomSalt = null;
      emit('reset');
    }
  };
})();

if (typeof window !== 'undefined') {
  window.CryptoManager = CryptoManager;
  window.SecureInvite = SecureInvite;
  window.InviteManager = InviteManager;
} else if (typeof self !== 'undefined') {
  self.CryptoManager = CryptoManager;
  self.SecureInvite = SecureInvite;
  self.InviteManager = InviteManager;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    CryptoManager,
    formatFingerprint,
    ensureArrayBuffer,
    deriveKeyFromPassword,
    encryptWithKey,
    decryptWithKey,
    deriveRatchetKey,
    generateECDHKeyPair,
    deriveSharedSecret,
    deriveSharedKey,
    fingerprintFromMaterial,
    SecureInvite,
    InviteManager,
    toBase64Url,
    fromBase64Url
  };
}
