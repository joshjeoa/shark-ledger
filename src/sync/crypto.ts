import { b64decode, b64encode } from '../utils/compat';

const te = new TextEncoder();
const td = new TextDecoder();

async function deriveKey(pass: string, salt: Uint8Array): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', te.encode(pass), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations: 600000 },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function encryptJSON(obj: unknown, pass: string): Promise<{ kdf: 'PBKDF2-SHA256'; iter: number; salt: string; iv: string; ct: string }> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(pass, salt);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv as BufferSource }, key, te.encode(JSON.stringify(obj)));
  return { kdf: 'PBKDF2-SHA256', iter: 600000, salt: b64encode(salt), iv: b64encode(iv), ct: b64encode(ct) };
}

export async function decryptJSON<T>(env: { salt: string; iv: string; ct: string }, pass: string): Promise<T> {
  try {
    const key = await deriveKey(pass, b64decode(env.salt));
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64decode(env.iv) as BufferSource }, key, b64decode(env.ct) as BufferSource);
    return JSON.parse(td.decode(plain)) as T;
  } catch {
    throw new Error('口令错误，无法解密备份');
  }
}
