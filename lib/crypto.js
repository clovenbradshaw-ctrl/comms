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

async function deriveKey(password, salt) {
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
    fingerprint: formatFingerprint(fingerprintBytes),
    baseKeyMaterial: keyBytes.slice().buffer
  };
}

async function encryptMessage(key, text) {
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

async function decryptMessage(key, data) {
  const iv = data.slice(0, 12);
  const encrypted = data.slice(12);

  try {
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv, tagLength: 128 },
      key,
      encrypted
    );
    return new TextDecoder().decode(decrypted);
  } catch (error) {
    console.error('Message authentication failed:', error);
    return null;
  }
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
