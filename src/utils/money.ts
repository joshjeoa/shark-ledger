/** 金额一律整数分存储/计算，展示层才格式化，杜绝浮点误差 */

export function parseYuanToCents(input: string): number | null {
  const s = input.trim();
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(s)) return null;
  const [i = '0', d = ''] = s.split('.');
  const cents = parseInt(i, 10) * 100 + parseInt((d + '00').slice(0, 2), 10);
  return cents > 0 ? cents : null;
}

export function toYuan(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const c = Math.abs(Math.round(cents));
  return `${sign}${Math.floor(c / 100)}.${String(c % 100).padStart(2, '0')}`;
}

export function addCents(a: number, b: number): number {
  return a + b;
}
