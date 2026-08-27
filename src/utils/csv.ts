import type { Bill, Category, Account, Tag } from '../types';
import { dayKey } from './date';
import { toYuan, parseYuanToCents } from './money';
import { uuid } from './compat';

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

// ---------------------------------------------------------------------------
// CSV 导入：与 billsToCSV 互逆（列序：日期,类型,分类,金额(元),账户,标签,备注）
// ---------------------------------------------------------------------------

/** 单条 CSV 记录解析器：处理引号包裹、"" 转义、字段内逗号/换行 */
function parseCSVLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else inQuotes = false;
      } else cur += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ',') {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

export interface CSVImportResult {
  bills: Bill[];
  skipped: number;
}

export function parseCSVToBills(
  text: string,
  opts: { cats: Category[]; accounts: Account[]; ledgerId: string },
): CSVImportResult {
  const rows = text
    .replace(/^\ufeff/, '')
    .split(/\r\n|\r|\n/)
    .filter((l) => l.trim() !== '');
  if (rows.length === 0) return { bills: [], skipped: 0 };

  // 首行是表头（含"日期"字样）则跳过；否则视作无表头数据
  const first = parseCSVLine(rows[0]!);
  if (first.some((cell) => cell.trim() === '日期')) rows.shift();

  // 分类名+类型 → id；匹配不到时支出落「日用」、收入落「其他」
  const catByName = new Map<string, string>();
  for (const c of opts.cats) if (!c.hidden) catByName.set(`${c.name}|${c.type}`, c.id);
  const fallback = (type: Bill['type']): string | undefined => {
    const name = type === 'expense' ? '日用' : '其他';
    return (
      catByName.get(`${name}|${type}`) ??
      opts.cats.find((c) => c.type === type && !c.hidden)?.id
    );
  };
  const accByName = new Map(opts.accounts.map((a) => [a.name, a.id]));

  const bills: Bill[] = [];
  let skipped = 0;
  const now = Date.now();

  for (const line of rows) {
    const cells = parseCSVLine(line);
    // 日期,类型,分类,金额(元),账户,标签,备注
    const [dateS, typeS, catS, amountS, accS, , noteS] = cells.map((c) => c.trim());

    const type: Bill['type'] | null = typeS === '支出' ? 'expense' : typeS === '收入' ? 'income' : null;
    const cents = amountS !== undefined ? parseYuanToCents(amountS) : null;
    const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateS ?? '');

    if (!type || cents === null || !dm) {
      skipped++;
      continue;
    }

    const occurredAt = new Date(Number(dm[1]), Number(dm[2]) - 1, Number(dm[3]), 12, 0, 0).getTime();
    const categoryId = catByName.get(`${catS}|${type}`) ?? fallback(type);
    if (!categoryId) {
      skipped++;
      continue;
    }

    bills.push({
      id: uuid(),
      ledgerId: opts.ledgerId,
      type,
      amountCents: cents,
      categoryId,
      tagIds: [],
      note: (noteS ?? '').slice(0, 50),
      accountId: accS ? accByName.get(accS) : undefined,
      occurredAt,
      createdAt: now,
      updatedAt: now,
    });
  }
  return { bills, skipped };
}
