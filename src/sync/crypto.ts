import { b64decode, b64encode } from '../utils/compat';

const te = new TextEncoder();
const td = new TextDecoder();

/** 派生密钥缓存：PBKDF2 60 万轮开销大，同一 (口令, 盐) 会话内复用密钥，避免每次自动同步都重算 */
let keyCache: { pass: string; saltB64: string; key: CryptoKey } | null = null;

async function deriveKey(pass: string, salt: Uint8Array, saltB64: string): Promise<CryptoKey> {
  if (keyCache && keyCache.pass === pass && keyCache.saltB64 === saltB64) return keyCache.key;
  const base = await crypto.subtle.importKey('raw', te.encode(pass), 'PBKDF2', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations: 600000 },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
  keyCache = { pass, saltB64, key };
  return key;
}

/** 会话内复用盐：GCM 的安全依赖每次加密的随机 IV，盐只需首次生成 */
let sessionSalt: Uint8Array | null = null;

export async function encryptJSON(obj: unknown, pass: string): Promise<{ kdf: 'PBKDF2-SHA256'; iter: number; salt: string; iv: string; ct: string }> {
  if (!sessionSalt) sessionSalt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(pass, sessionSalt, b64encode(sessionSalt));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv as BufferSource }, key, te.encode(JSON.stringify(obj)));
  return { kdf: 'PBKDF2-SHA256', iter: 600000, salt: b64encode(sessionSalt), iv: b64encode(iv), ct: b64encode(ct) };
}

export async function decryptJSON<T>(env: { salt: string; iv: string; ct: string }, pass: string): Promise<T> {
  let salt: Uint8Array;
  let iv: Uint8Array;
  let ct: Uint8Array;
  try {
    salt = b64decode(env.salt);
    iv = b64decode(env.iv);
    ct = b64decode(env.ct);
  } catch {
    throw new Error('备份文件格式损坏（base64 解码失败）');
  }
  let plain: ArrayBuffer;
  try {
    const key = await deriveKey(pass, salt, env.salt);
    plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv as BufferSource }, key, ct as BufferSource);
  } catch {
    throw new Error('口令错误，无法解密备份');
  }
  try {
    return JSON.parse(td.decode(plain)) as T;
  } catch {
    // 解密成功但明文不是 JSON：密钥正确、内容损坏，与口令错误区分开
    throw new Error('备份内容已损坏（解密成功但不是有效数据）');
  }
}
