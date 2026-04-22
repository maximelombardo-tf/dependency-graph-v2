import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';

/**
 * Encrypts a Notion API token using AES-256-GCM.
 * Returns a base64-encoded JSON string: { iv, enc, tag }.
 * Requires TOKEN_ENCRYPTION_KEY env var (64 hex chars = 32 bytes).
 */
export function encryptToken(plaintext: string): string {
  const keyHex = process.env['TOKEN_ENCRYPTION_KEY'];
  if (!keyHex) return plaintext;

  const key = Buffer.from(keyHex, 'hex');
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return Buffer.from(JSON.stringify({
    iv: iv.toString('hex'),
    enc: enc.toString('hex'),
    tag: tag.toString('hex'),
  })).toString('base64');
}

/**
 * Decrypts a token encrypted by encryptToken.
 * Falls back to returning plaintext as-is for backward compatibility
 * (existing unencrypted tokens in Redis continue to work).
 */
export function decryptToken(ciphertext: string): string {
  const keyHex = process.env['TOKEN_ENCRYPTION_KEY'];
  if (!keyHex) return ciphertext;

  try {
    const payload = JSON.parse(Buffer.from(ciphertext, 'base64').toString('utf8'));
    if (!payload.iv || !payload.enc || !payload.tag) return ciphertext;

    const key = Buffer.from(keyHex, 'hex');
    const iv = Buffer.from(payload.iv, 'hex');
    const enc = Buffer.from(payload.enc, 'hex');
    const tag = Buffer.from(payload.tag, 'hex');

    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    return decipher.update(enc).toString('utf8') + decipher.final('utf8');
  } catch {
    return ciphertext;
  }
}
