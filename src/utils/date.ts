/** 日期工具：全部按设备本地时区；周起始 = 周一 */

const p2 = (n: number) => String(n).padStart(2, '0');

export function dayKey(t: number): string {
  const d = new Date(t);
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
}

export function monthKey(t: number): string {
  return dayKey(t).slice(0, 7);
}

export function weekdayLabel(t: number): string {
  return '星期' + '日一二三四五六'[new Date(t).getDay()];
}

export function startOfWeek(t: number): Date {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}

export function isoWeekNumber(t: number): number {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const week1 = new Date(d.getFullYear(), 0, 4);
  return 1 + Math.round(((d.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
}

export function daysInMonth(yearMonth: string): number {
  const [y = 2026, m = 1] = yearMonth.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}

export function monthKeyOffset(yearMonth: string, offset: number): string {
  const [y = 2026, m = 1] = yearMonth.split('-').map(Number);
  const d = new Date(y, m - 1 + offset, 1);
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}`;
}

export function monthLabelCN(yearMonth: string): string {
  const [, m = '01'] = yearMonth.split('-');
  return `${m}月`;
}

export function shortMD(t: number): string {
  const d = new Date(t);
  return `${d.getMonth() + 1}-${p2(d.getDate())}`;
}
