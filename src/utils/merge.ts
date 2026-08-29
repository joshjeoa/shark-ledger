import type { FullDump } from '../types';

type WithId = { id: string; updatedAt?: number };

function mergeById<T extends WithId>(local: T[], remote: T[]): T[] {
  const map = new Map<string, T>();
  for (const item of local) map.set(item.id, item);
  for (const item of remote) {
    const cur = map.get(item.id);
    if (!cur || (item.updatedAt ?? 0) >= (cur.updatedAt ?? 0)) map.set(item.id, item);
  }
  return Array.from(map.values());
}

/** 合并规则：按 id 并集，同 id 取 updatedAt 大者；budgets 按 yearMonth 同取 updatedAt 大者（本地优先） */
export function mergeDumps(local: FullDump['data'], remote: FullDump['data']): FullDump['data'] {
  return {
    bills: mergeById(local.bills, remote.bills),
    categories: mergeById(local.categories, remote.categories),
    accounts: mergeById(local.accounts, remote.accounts),
    tags: mergeById(local.tags, remote.tags),
    ledgers: mergeById(local.ledgers, remote.ledgers),
    budgets: (() => {
      const map = new Map(local.budgets.map((b) => [b.yearMonth, b]));
      for (const b of remote.budgets) {
        const cur = map.get(b.yearMonth);
        if (!cur || (b.updatedAt ?? 0) > (cur.updatedAt ?? 0)) map.set(b.yearMonth, b);
      }
      return Array.from(map.values());
    })(),
  };
}

/** 导入/恢复数据的逐表类型保护校验，返回错误列表 */
export function validateDump(data: unknown): { ok: boolean; errors: string[]; dump?: FullDump['data'] } {
  const errors: string[] = [];
  const d = data as Partial<FullDump['data']> | null | undefined;
  if (!d || typeof d !== 'object') return { ok: false, errors: ['文件内容不是有效的 JSON 对象'] };
  const arr = (v: unknown, name: string, check: (x: Record<string, unknown>) => boolean) => {
    if (!Array.isArray(v)) {
      errors.push(`缺少 ${name} 数组`);
      return [] as Record<string, unknown>[];
    }
    v.forEach((item, i) => {
      if (typeof item !== 'object' || item === null || !check(item as Record<string, unknown>))
        errors.push(`${name}[${i}] 字段不合法`);
    });
    return v as Record<string, unknown>[];
  };
  const bills = arr(
    d.bills,
    'bills',
    (b) =>
      typeof b.id === 'string' &&
      Number.isSafeInteger(b.amountCents) &&
      (b.type === 'expense' || b.type === 'income') &&
      typeof b.categoryId === 'string' &&
      typeof b.occurredAt === 'number' &&
      typeof b.createdAt === 'number' &&
      typeof b.updatedAt === 'number' &&
      (b.note === undefined || typeof b.note === 'string') &&
      (b.accountId === undefined || typeof b.accountId === 'string') &&
      (b.ledgerId === undefined || typeof b.ledgerId === 'string') &&
      (b.tagIds === undefined || (Array.isArray(b.tagIds) && b.tagIds.every((t) => typeof t === 'string'))) &&
      (b.photoIds === undefined || (Array.isArray(b.photoIds) && b.photoIds.every((t) => typeof t === 'string'))) &&
      (b.deletedAt === undefined || typeof b.deletedAt === 'number'),
  );
  arr(d.categories, 'categories', (c) => typeof c.id === 'string' && typeof c.name === 'string');
  arr(d.accounts, 'accounts', (a) => typeof a.id === 'string' && typeof a.name === 'string');
  arr(d.tags, 'tags', (t) => typeof t.id === 'string');
  arr(d.ledgers, 'ledgers', (l) => typeof l.id === 'string' && typeof l.name === 'string');
  arr(d.budgets, 'budgets', (b) => typeof b.yearMonth === 'string' && typeof b.amountCents === 'number');
  if (errors.length) return { ok: false, errors };
  // 归一化旧版/手工编辑备份中缺失的可选字段，杜绝 tagIds/note 为空时在 CSV 导出、编辑回填处崩溃。
  // 照片 Blob 不在备份内，恢复后 photoIds 指向的照片不存在时 UI 显示占位（查看器/缩略图均有兜底）
  const normalized = bills.map((b) => ({ ...b, note: b.note ?? '', tagIds: b.tagIds ?? [], photoIds: b.photoIds ?? [] }));
  return { ok: true, errors: [], dump: { ...d, bills: normalized } as FullDump['data'] };
}
