import crypto from 'node:crypto';

const keyB64 = process.env.AES_KEY_BASE64 || '';
const ivB64 = process.env.AES_IV_BASE64 || '';

function getKeyAndIv() {
  const key = Buffer.from(keyB64, 'base64');
  const iv = Buffer.from(ivB64, 'base64');
  if (key.length !== 32) throw new Error('AES key must be 32 bytes (base64 of 32 bytes)');
  if (iv.length !== 16) throw new Error('AES IV must be 16 bytes (base64 of 16 bytes)');
  return { key, iv };
}

export function encryptJson<T>(data: T): string {
  const { key, iv } = getKeyAndIv();
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const plaintext = Buffer.from(JSON.stringify(data), 'utf8');
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([encrypted, tag]).toString('base64');
}

export function decryptJson<T>(b64: string): T {
  const { key, iv } = getKeyAndIv();
  const raw = Buffer.from(b64, 'base64');
  const ciphertext = raw.subarray(0, raw.length - 16);
  const tag = raw.subarray(raw.length - 16);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return JSON.parse(decrypted.toString('utf8')) as T;
} 