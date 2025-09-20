// Small AES-GCM crypto utility for encrypting/decrypting refresh tokens into a stateless cookie.
// Uses a single symmetric key provided via env var TD2_ENC_KEY_B64 (32-byte key, base64).
// This keeps the backend storage-free while maintaining confidentiality and integrity.

/**
 * Encodes a Buffer into base64url without padding.
 * @param {Buffer} buf
 */
function b64urlEncode(buf) {
  return buf
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

/**
 * Decodes a base64url string into a Buffer.
 * @param {string} str
 */
function b64urlDecode(str) {
  const pad = str.length % 4 === 2 ? '==' : str.length % 4 === 3 ? '=' : '';
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/') + pad;
  return Buffer.from(b64, 'base64');
}

/**
 * Loads and validates the AES key from env var TD2_ENC_KEY_B64 (32 bytes when decoded).
 * @returns {Buffer}
 */
function loadKey() {
  const b64 = process.env.TD2_ENC_KEY_B64 || '';
  if (!b64) throw new Error('Missing TD2_ENC_KEY_B64 environment variable');
  const key = b64urlDecode(b64);
  if (key.length !== 32) throw new Error('TD2_ENC_KEY_B64 must decode to 32 bytes');
  return key;
}

/**
 * Encrypts plaintext using AES-256-GCM. Returns a compact base64url string: "v1.iv.ciphertext.tag".
 *- v: version for future key rotation support
 *- iv: 12-byte random IV
 *- ciphertext, tag: from AES-GCM
 *
 * @param {Buffer} plaintext
 * @param {Buffer} [aad] Additional authenticated data (optional)
 * @returns {string}
 */
function encrypt(plaintext, aad) {
  const crypto = require('crypto');
  const key = loadKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv, { authTagLength: 16 });
  if (aad && aad.length) cipher.setAAD(aad);
  const enc = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  const v = Buffer.from([1]); // version 1
  return [b64urlEncode(v), b64urlEncode(iv), b64urlEncode(enc), b64urlEncode(tag)].join('.');
}

/**
 * Decrypts a base64url compact string produced by encrypt().
 * @param {string} tokenEnc
 * @param {Buffer} [aad]
 * @returns {Buffer}
 */
function decrypt(tokenEnc, aad) {
  const crypto = require('crypto');
  const key = loadKey();
  const parts = tokenEnc.split('.');
  if (parts.length !== 4) throw new Error('Malformed encrypted token');
  const [vB64, ivB64, ctB64, tagB64] = parts;
  const v = b64urlDecode(vB64);
  if (v.length !== 1 || v[0] !== 1) throw new Error('Unsupported token version');
  const iv = b64urlDecode(ivB64);
  const ct = b64urlDecode(ctB64);
  const tag = b64urlDecode(tagB64);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv, { authTagLength: 16 });
  if (aad && aad.length) decipher.setAAD(aad);
  decipher.setAuthTag(tag);
  const out = Buffer.concat([decipher.update(ct), decipher.final()]);
  return out;
}

module.exports = {
  b64urlEncode,
  b64urlDecode,
  encrypt,
  decrypt
};
