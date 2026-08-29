/** 账单筛选与聚合：明细/图表/发现页共用，避免谓词与汇总逻辑散落各页 */
import type { Bill, BillType } from '../types';
import { monthKey } from './date';

/** 指定账本的有效账单（排除软删除），可按收支类型过滤 */
export function ledgerBills(bills: Bill[], ledgerId: string, type?: BillType): Bill[] {
  return bills.filter((b) => b.ledgerId === ledgerId && !b.deletedAt && (type === undefined || b.type === type));
}

/** 指定账本、月份的有效账单，可按收支类型过滤。
 * 单次遍历直接组合谓词，不再先分配中间数组再二次过滤（明细/图表/发现页每次数据变更都会调用）。 */
export function monthBills(bills: Bill[], ledgerId: string, yearMonth: string, type?: BillType): Bill[] {
  const out: Bill[] = [];
  for (const b of bills) {
    if (b.ledgerId !== ledgerId || b.deletedAt) continue;
    if (type !== undefined && b.type !== type) continue;
    if (monthKey(b.occurredAt) === yearMonth) out.push(b);
  }
  return out;
}

/** 收入/支出/结余合计（分） */
export function sumByType(bills: Bill[]): { income: number; expense: number; balance: number } {
  let income = 0;
  let expense = 0;
  for (const b of bills) {
    if (b.type === 'income') income += b.amountCents;
    else expense += b.amountCents;
  }
  return { income, expense, balance: income - expense };
}

/** 分类 id → 金额合计（分） */
export function categoryTotals(bills: Bill[]): Map<string, number> {
  const byCat = new Map<string, number>();
  for (const b of bills) byCat.set(b.categoryId, (byCat.get(b.categoryId) ?? 0) + b.amountCents);
  return byCat;
}
