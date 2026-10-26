// AES-256-GCM helpers for tokens at rest, plus PKCE/state generation.
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

export function encrypt(plaintext, key) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, data].map((b) => b.toString('base64url')).join('.');
}

export function decrypt(payload, key) {
  const [iv, tag, data] = String(payload).split('.').map((s) => Buffer.from(s, 'base64url'));
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

export function randomToken(bytes = 32) {
  return randomBytes(bytes).toString('base64url');
}

/** RFC 7636 S256: code_challenge = BASE64URL(SHA256(code_verifier)). */
export function pkceChallenge(verifier) {
  return createHash('sha256').update(verifier).digest('base64url');
}
