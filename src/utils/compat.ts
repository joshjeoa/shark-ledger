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

/** iOS <15.4 不支持 dvh：用 JS 变量兜底主布局高度。
 * 键盘弹出策略与原生 App 一致：布局高度保持不变、键盘悬浮覆盖（页面不上移）。
 * 视口高度骤降（>12%）视为键盘弹出，忽略该次收缩；工具栏收起等小幅变化正常跟随。 */
export function setupAppHeight(): void {
  let full = window.innerHeight;
  const apply = (h: number) => {
    full = h;
    document.documentElement.style.setProperty('--app-height', `${h}px`);
  };
  apply(full);
  window.addEventListener('resize', () => {
    const h = window.innerHeight;
    if (h < full * 0.88) return; // 键盘弹出，布局不动
    apply(h);
  });
  window.addEventListener('orientationchange', () => setTimeout(() => apply(window.innerHeight), 120));

  // iOS 键盘弹出时会把整个视口（含 fixed 头部）向上平移：
  // 聚焦/失焦/视口变化后把窗口滚动锁回原位，实现"界面原地不动，只有键盘升起"
  const lock = () => {
    if (window.scrollY !== 0) window.scrollTo(0, 0);
  };
  window.addEventListener('focusin', () => setTimeout(lock, 80));
  window.addEventListener('focusout', () => setTimeout(lock, 80));
  window.visualViewport?.addEventListener('resize', lock);
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
