import type { Bill, Category, Account, Tag } from '../types';
import { dayKey } from './date';
import { toYuan } from './money';

const esc = (v: string) => (/[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v);

/** BOM + CRLF + 固定列序，保证 Excel/WPS 中文不乱码 */
export function billsToCSV(bills: Bill[], cats: Category[], accounts: Account[], tags: Tag[]): string {
  const catName = (id: string) => cats.find((c) => c.id === id)?.name ?? '未分类';
  const accName = (id?: string) => (id ? accounts.find((a) => a.id === id)?.name ?? '' : '');
  const tagName = (ids?: string[]) => (ids ?? []).map((id) => tags.find((t) => t.id === id)?.name ?? '').filter(Boolean).join('/');
  const rows: string[][] = [['日期', '类型', '分类', '金额(元)', '账户', '标签', '备注']];
  const sorted = [...bills].sort((a, b) => a.occurredAt - b.occurredAt);
  for (const b of sorted) {
    rows.push([
      dayKey(b.occurredAt),
      b.type === 'expense' ? '支出' : '收入',
      catName(b.categoryId),
      toYuan(b.amountCents),
      accName(b.accountId),
      tagName(b.tagIds),
      b.note,
    ]);
  }
  return '\ufeff' + rows.map((r) => r.map(esc).join(',')).join('\r\n');
}
