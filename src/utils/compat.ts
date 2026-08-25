/** 兼容层：集中处理 iOS <15.4 的 API 回退 */

export function uuid(): string {
  const c = crypto as Crypto & { randomUUID?: () => string };
  if (typeof c.randomUUID === 'function') return c.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function safeClone<T>(v: T): T {
  const f = globalThis as { structuredClone?: (x: T) => T };
  if (typeof f.structuredClone === 'function') return f.structuredClone(v);
  return JSON.parse(JSON.stringify(v)) as T;
}

export const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent);

export function isStandalone(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean };
  return nav.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
}

/** iOS <15.4 不支持 dvh：用 JS 变量兜底主布局高度 */
export function setupAppHeight(): void {
  const set = () => {
    document.documentElement.style.setProperty('--app-height', `${window.innerHeight}px`);
  };
  set();
  window.addEventListener('resize', set);
  window.addEventListener('orientationchange', set);
}

export function b64encode(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  bytes.forEach((b) => (s += String.fromCharCode(b)));
  return btoa(s);
}

export function b64decode(s: string): Uint8Array {
  const bin = atob(s);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}
