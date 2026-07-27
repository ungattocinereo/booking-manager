const crypto = require('node:crypto');

const KEY_VERSION = process.env.REPORTING_PII_KEY_VERSION || 'v1';

function keyMaterial() {
  const configured = process.env.REPORTING_PII_ENCRYPTION_KEY || '';
  if (configured) {
    try {
      const decoded = Buffer.from(configured, 'base64');
      if (decoded.length === 32) return decoded;
    } catch (_) {
      // Fall through to a clear configuration error below.
    }
    if (/^[a-f0-9]{64}$/i.test(configured)) return Buffer.from(configured, 'hex');
    throw new Error('REPORTING_PII_ENCRYPTION_KEY must be 32 bytes encoded as base64 or hex');
  }

  if (process.env.NODE_ENV === 'test') {
    return crypto.createHash('sha256').update('booking-manager-reporting-test-key').digest();
  }
  throw new Error('REPORTING_PII_ENCRYPTION_KEY is not configured');
}

function deriveKey(purpose) {
  return crypto.createHmac('sha256', keyMaterial()).update(`reporting:${purpose}`).digest();
}

function encryptRecord(plaintext) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', deriveKey('encryption'), iv);
  const ciphertext = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    value: [KEY_VERSION, iv.toString('base64'), tag.toString('base64'), ciphertext.toString('base64')].join('.'),
    keyVersion: KEY_VERSION
  };
}

function decryptRecord(payload) {
  if (!payload) return null;
  const [version, iv, tag, ciphertext] = String(payload).split('.');
  if (!version || !iv || !tag || !ciphertext) throw new Error('Encrypted guest record is malformed');
  const decipher = crypto.createDecipheriv('aes-256-gcm', deriveKey('encryption'), Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64')), decipher.final()]).toString('utf8');
}

function fingerprint(value) {
  return crypto.createHmac('sha256', deriveKey('fingerprint')).update(value).digest('hex');
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

module.exports = { encryptRecord, decryptRecord, fingerprint, sha256, KEY_VERSION };
