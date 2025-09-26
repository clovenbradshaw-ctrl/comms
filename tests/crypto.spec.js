const assert = require('assert');
const {
  deriveKeyFromPassword,
  deriveRatchetKey,
  deriveSharedSecret,
  deriveSharedKey,
  fingerprintFromMaterial,
  SecureInvite,
  InviteManager
} = require('../lib/crypto.js');

const { subtle } = globalThis.crypto;

function hexToBase64Url(hex) {
  return Buffer.from(hex, 'hex').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function uint8ToHex(bytes) {
  return Buffer.from(bytes).toString('hex');
}

async function encryptWithKey(key, data, iv) {
  return subtle.encrypt({ name: 'AES-GCM', iv }, key, data);
}

async function main() {
  const password = 'correct horse battery staple';
  const salt = new Uint8Array(Array.from({ length: 16 }, (_, i) => i + 1));
  const { baseKeyMaterial, fingerprint } = await deriveKeyFromPassword(password, salt);
  const baseHex = uint8ToHex(baseKeyMaterial);
  assert.strictEqual(baseHex, '7ed385456f6b11fe381b82d34e9384476dfbc84764f4d306ff62dc74846615a4');
  assert.strictEqual(fingerprint, '🔐 Cobalt-Whale-Fifteen-Bridge');

  const ratchetKey = await deriveRatchetKey(baseKeyMaterial, 5, salt);
  const hkdfKey = await subtle.importKey('raw', baseKeyMaterial, 'HKDF', false, ['deriveBits']);
  const referenceBits = await subtle.deriveBits({
    name: 'HKDF',
    hash: 'SHA-256',
    salt,
    info: new TextEncoder().encode('epoch-5')
  }, hkdfKey, 256);
  const referenceKey = await subtle.importKey('raw', referenceBits, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
  const iv = new Uint8Array(12);
  const payload = new TextEncoder().encode('deterministic test');
  const cipherA = await encryptWithKey(ratchetKey, payload, iv);
  const cipherB = await encryptWithKey(referenceKey, payload, iv);
  assert.ok(Buffer.from(cipherA).equals(Buffer.from(cipherB)), 'Derived ratchet key mismatch');

  const privA = '1111111111111111111111111111111111111111111111111111111111111111';
  const xA = '0217e617f0b6443928278f96999e69a23a4f2c152bdf6d6cdf66e5b80282d4ed';
  const yA = '194a7debcb97712d2dda3ca85aa8765a56f45fc758599652f2897c65306e5794';
  const privB = '2222222222222222222222222222222222222222222222222222222222222222';
  const xB = 'd65a93977caa3d1b081852ff57a79e465f1660577304baead505dd3a48589cf3';
  const yB = '50185e895372df6221ea3a137557e473fddb6755f05bd507c3c533fce9c91285';

  const jwkAPriv = { kty: 'EC', crv: 'P-256', d: hexToBase64Url(privA), x: hexToBase64Url(xA), y: hexToBase64Url(yA), ext: true, key_ops: ['deriveBits'] };
  const jwkAPub = { kty: 'EC', crv: 'P-256', x: hexToBase64Url(xA), y: hexToBase64Url(yA), ext: true };
  const jwkBPriv = { kty: 'EC', crv: 'P-256', d: hexToBase64Url(privB), x: hexToBase64Url(xB), y: hexToBase64Url(yB), ext: true, key_ops: ['deriveBits'] };
  const jwkBPub = { kty: 'EC', crv: 'P-256', x: hexToBase64Url(xB), y: hexToBase64Url(yB), ext: true };

  const keyPairA = {
    privateKey: await subtle.importKey('jwk', jwkAPriv, { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']),
    publicKey: await subtle.importKey('jwk', jwkAPub, { name: 'ECDH', namedCurve: 'P-256' }, true, [])
  };

  const keyPairB = {
    privateKey: await subtle.importKey('jwk', jwkBPriv, { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']),
    publicKey: await subtle.importKey('jwk', jwkBPub, { name: 'ECDH', namedCurve: 'P-256' }, true, [])
  };

  const pubB = new Uint8Array([4, ...Buffer.from(xB, 'hex'), ...Buffer.from(yB, 'hex')]);
  const pubA = new Uint8Array([4, ...Buffer.from(xA, 'hex'), ...Buffer.from(yA, 'hex')]);

  const sharedA = await deriveSharedSecret(keyPairA, pubB);
  const sharedB = await deriveSharedSecret(keyPairB, pubA);
  assert.ok(Buffer.from(sharedA).equals(Buffer.from(sharedB)), 'Shared secrets differ');
  assert.strictEqual(uint8ToHex(sharedA), 'ccfc261f58193c98ca4ad4a53bbac6f0ee29bc4d48438090446908622ca79af6');

  const { material } = await deriveSharedKey(sharedA, new Uint8Array(16), 'test-info');
  assert.strictEqual(uint8ToHex(material), 'd17f05296513e010970fe144c2f6aa3bd068db7338bb8fecd04801452b97b140');
  const sharedFingerprint = await fingerprintFromMaterial(material);
  assert.strictEqual(sharedFingerprint, '🔐 Cobalt-Hawk-Fourteen-Lagoon');

  const seat = await SecureInvite.generateSeat();
  assert.ok(seat.seatId && seat.secretKey, 'Seat should include identifiers');
  const derivedSeat = await SecureInvite.deriveSeatKey(seat.secretKey, seat.seatId);
  const repeatSeat = await SecureInvite.deriveSeatKey(seat.secretKey, seat.seatId);
  assert.strictEqual(Buffer.from(derivedSeat.baseKeyMaterial).toString('hex'), Buffer.from(repeatSeat.baseKeyMaterial).toString('hex'));
  assert.strictEqual(derivedSeat.fingerprint, repeatSeat.fingerprint);

  const invite = {
    roomId: 'room-test',
    seatId: seat.seatId,
    secretKey: seat.secretKey,
    expiresAt: Date.now() + 60000
  };
  invite.signature = await SecureInvite.signInvite(invite.roomId, invite.seatId, invite.secretKey, invite.expiresAt);
  assert.ok(await SecureInvite.verifyInviteSignature(invite), 'Invite signature should validate');

  const compactInvite = {
    r: invite.roomId,
    s: invite.seatId,
    k: invite.secretKey,
    e: invite.expiresAt,
    sig: invite.signature
  };

  const encryptedInvite = await SecureInvite.encryptInvitePayload(compactInvite);
  assert.ok(encryptedInvite?.cipher && encryptedInvite?.key, 'Encrypted invite should include cipher and key');

  const decryptedInvite = await SecureInvite.decryptInvitePayload(encryptedInvite.cipher, encryptedInvite.key);
  assert.deepStrictEqual(decryptedInvite, compactInvite, 'Decrypted invite should match the original payload');

  const manager = new InviteManager();
  if (manager?.ready && typeof manager.ready.then === 'function') {
    await manager.ready;
  }
  await manager.validateInvite(invite);
  let reuseError = null;
  try {
    await manager.validateInvite(invite);
  } catch (error) {
    reuseError = error;
  }
  assert.ok(reuseError instanceof Error, 'Reusing invite should throw');

  console.log('Crypto vectors verified');
}

main().catch((error) => {
  console.error('Crypto spec failed:', error);
  process.exitCode = 1;
});
