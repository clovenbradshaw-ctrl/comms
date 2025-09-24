const FINGERPRINT_COLORS = ['Amber', 'Azure', 'Blue', 'Cobalt', 'Crimson', 'Emerald', 'Golden', 'Indigo', 'Ivory', 'Jade', 'Magenta', 'Onyx', 'Ruby', 'Saffron', 'Scarlet', 'Silver', 'Teal', 'Umber', 'Violet', 'Copper'];
const FINGERPRINT_ANIMALS = ['Falcon', 'Tiger', 'Wolf', 'Otter', 'Eagle', 'Panther', 'Fox', 'Hawk', 'Lynx', 'Panda', 'Raven', 'Shark', 'Bison', 'Heron', 'Dragonfly', 'Whale', 'Kestrel', 'Badger', 'Coyote', 'Orca'];
const FINGERPRINT_NUMBERS = ['Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen'];
const FINGERPRINT_PLACES = ['Harbor', 'Mountain', 'Forest', 'River', 'Canyon', 'Desert', 'Valley', 'Grove', 'Summit', 'Lagoon', 'Prairie', 'Temple', 'Island', 'Village', 'Tundra', 'Meadow', 'Fjord', 'Citadel', 'Bridge', 'Monolith'];

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
} else if (typeof self !== 'undefined') {
  self.CryptoManager = CryptoManager;
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
    fingerprintFromMaterial
  };
}
