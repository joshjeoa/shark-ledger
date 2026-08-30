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

// ---------------------------------------------------------------------------
// 第三方账单导入：微信支付 / 支付宝交易明细 CSV（自动识别 + 智能分类）
// 微信列序：交易时间,交易类型,交易对方,商品,收/支,金额(元),支付方式,...
// 支付宝列序：交易时间,交易分类,交易对方,对方账号,商品说明,收/支,金额,收/付款方式,...
// 均按表头名动态定位列，兼容官方导出列序调整
// ---------------------------------------------------------------------------

export type BillSource = 'own' | 'wechat' | 'alipay';

export type ThirdPartyResult = CSVImportResult & { source: 'wechat' | 'alipay' };

/** 解码账单文件：UTF-8 严格优先（微信），失败降级 GBK（支付宝导出长期为 GBK 编码） */
export async function decodeBillFile(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  try {
    // fatal: 非 UTF-8 字节直接抛错，避免"乱码也能解码成功"的静默错误
    return new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch {
    try {
      return new TextDecoder('gbk').decode(buf);
    } catch {
      return new TextDecoder('utf-8').decode(buf);
    }
  }
}

/** 按文件特征识别账单来源 */
export function detectBillSource(text: string): BillSource {
  if (text.includes('微信支付账单')) return 'wechat';
  if (text.includes('支付宝交易明细') || text.includes('交易记录明细列表')) return 'alipay';
  return 'own';
}

/** 金额列字符串清洗后精确转分：去 ¥/千分位逗号，负号仅出现在极少数退款场景，取绝对值 */
function amountToCents(raw: string): number | null {
  let s = raw.replace(/[¥￥\s,，+]/g, '');
  if (s.startsWith('-')) s = s.slice(1);
  if (!/^\d{1,9}(\.\d{1,})?$/.test(s)) return null;
  // 小数位超 2 位时截断（账单实际只有 2 位），统一补齐成 parseYuanToCents 接受的格式
  const dot = s.indexOf('.');
  const normalized = dot === -1 ? s : `${s.slice(0, dot)}.${s.slice(dot + 1).padEnd(2, '0').slice(0, 2)}`;
  return parseYuanToCents(normalized);
}

/** 支出关键词 → 分类名（对应内置分类；匹配不到走「日用」兜底） */
const KW_EXPENSE: [RegExp, string][] = [
  [/医疗|医院|药|挂号|诊所/, '医疗'],
  [/外卖|美团|饿了么|肯德基|麦当劳|星巴克|瑞幸|餐饮|餐厅|饭店|酒楼|火锅|烧烤|小吃|奶茶|咖啡|茶饮|食堂|盒马|叮咚|朴朴|生鲜|优鲜|山姆/, '餐饮'],
  [/超市|便利店|百货|市场|杂货/, '日用'],
  [/京东|淘宝|天猫|拼多多|唯品会|苏宁|商城|旗舰|专卖|网购物|拼团/, '购物'],
  [/滴滴|高德|曹操|出租|公交|地铁|铁路|12306|火车|机票|机场|航空|停车|单车|哈啰|青桔|加油|石化/, '交通'],
  [/移动|联通|电信|话费|宽带|流量|充值缴费/, '通讯'],
  [/水电|燃气|物业|房租|水费|电费/, '住房'],
  [/电影|影院|KTV|游戏|Steam|娱乐|会员|爱奇艺|腾讯视频|优酷|哔哩|网易云|音乐|演出|门票/, '娱乐'],
  [/服饰|优衣库|ZARA|鞋|服装|箱包|美妆|护肤/, '服饰'],
  [/健身|运动|球场|体育/, '运动'],
  [/宠物|猫粮|狗粮|宠物医院|驱虫|疫苗/, '宠物'],
  [/红包|转账/, '社交'],
];

/** 收入关键词 → 分类名（匹配不到走「其他」兜底） */
const KW_INCOME: [RegExp, string][] = [
  [/工资|薪|代发/, '工资'],
  [/奖金|年终|绩效/, '奖金'],
  [/理财|基金|余额宝|利息|收益|零钱通/, '理财'],
  [/红包|微信红包/, '红包'],
];

/** 解析"2024-01-01 12:00:00"（微信/支付宝导出的日期列），取本地时区整点 */
function parseBillDate(s: string): number | null {
  const m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[ T](\d{1,2}):(\d{2}))?/.exec(s.trim());
  if (!m) return null;
  const [, y, mo, d, h, mi] = m;
  return new Date(Number(y), Number(mo) - 1, Number(d), Number(h ?? 12), Number(mi ?? 0)).getTime();
}

/** 支付方式 → 账户：先精确包含匹配账户名，再按关键词映射内置账户 */
function matchAccount(payMethod: string, accounts: Account[]): string | undefined {
  const t = payMethod.trim();
  if (!t) return undefined;
  const exact = accounts.find((a) => t.includes(a.name));
  if (exact) return exact.id;
  const kw = /零钱|微信/.test(t)
    ? '微信'
    : /支付宝|余额|花呗/.test(t)
      ? '支付宝'
      : /银行|储蓄卡|信用卡/.test(t)
        ? '银行卡'
        : /现金/.test(t)
          ? '现金'
          : null;
  return kw ? accounts.find((a) => a.name.includes(kw))?.id : undefined;
}

/** 解析微信/支付宝账单文本；来源不是第三方时返回 null（调用方回退到自家格式解析） */
export function parseThirdPartyBills(
  text: string,
  opts: { cats: Category[]; accounts: Account[]; ledgerId: string },
): ThirdPartyResult | null {
  const source = detectBillSource(text);
  if (source === 'own') return null;

  const lines = text
    .replace(/^\ufeff/, '')
    .split(/\r\n|\r|\n/)
    .filter((l) => l.trim() !== '');

  // 定位表头行（含"交易时间"与"金额"），其后才是数据行
  let headerIdx = -1;
  let headerCells: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i]!.includes('交易时间') && lines[i]!.includes('金额')) {
      headerCells = parseCSVLine(lines[i]!).map((c) => c.trim());
      headerIdx = i;
      break;
    }
  }
  const amountIdx = headerCells.findIndex((c) => c.includes('金额'));
  if (headerIdx === -1 || amountIdx === -1) return { source, bills: [], skipped: 0 };

  const colIdx = (name: string) => headerCells.findIndex((c) => c === name);
  const dateCol = colIdx('交易时间');
  const dirCol = colIdx('收/支');
  const payCol = Math.max(colIdx('支付方式'), colIdx('收/付款方式'));
  // 识别主体的列：微信用"交易对方+商品"，支付宝用"交易分类+交易对方+商品说明"
  const subjectCols = [
    colIdx('交易对方'),
    colIdx('商品'),
    colIdx('商品说明'),
    colIdx('交易分类'),
    colIdx('交易类型'),
  ].filter((i) => i !== -1);

  const catByName = new Map<string, string>();
  for (const c of opts.cats) if (!c.hidden) catByName.set(`${c.name}|${c.type}`, c.id);
  const fallback = (type: Bill['type']): string | undefined => {
    const name = type === 'expense' ? '日用' : '其他';
    return catByName.get(`${name}|${type}`) ?? opts.cats.find((c) => c.type === type && !c.hidden)?.id;
  };

  const bills: Bill[] = [];
  let skipped = 0; // 无效行 + "不计收支"（转账/零钱通等中性交易）
  const now = Date.now();

  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = lines[i]!;
    // 尾部汇总/结束分隔行
    if (line.startsWith('-') || line.startsWith('---')) continue;
    const cells = parseCSVLine(line).map((c) => c.trim());
    // 关键列（日期/收/支/金额）必须存在，列数不足视作噪声行
    const minCols = Math.max(dateCol, dirCol, amountIdx) + 1;
    if (cells.length < minCols) {
      skipped++;
      continue;
    }

    const dateS = dateCol >= 0 ? (cells[dateCol] ?? '') : '';
    const dirS = dirCol >= 0 ? (cells[dirCol] ?? '') : '';
    const amountS = cells[amountIdx] ?? '';

    const cents = amountToCents(amountS);
    const occurredAt = parseBillDate(dateS);
    // "收入"→income；"支出"→expense；"/"与"不计收支"（转账、零钱通等）不导入
    const type: Bill['type'] | null = dirS.includes('收入')
      ? 'income'
      : dirS.includes('支出')
        ? 'expense'
        : null;

    if (cents === null || occurredAt === null || type === null) {
      skipped++;
      continue;
    }

    // 拼接全部主体文本做关键词分类（支付宝"交易分类"自带类目，一并通过关键词命中）
    const subject = subjectCols.map((ci) => cells[ci] ?? '').join(' ').trim();
    const kwTable = type === 'expense' ? KW_EXPENSE : KW_INCOME;
    let categoryName: string | null = null;
    for (const [re, name] of kwTable) {
      if (re.test(subject)) {
        categoryName = name;
        break;
      }
    }
    const categoryId = categoryName ? catByName.get(`${categoryName}|${type}`) : undefined;
    const finalCatId = categoryId ?? fallback(type);
    if (!finalCatId) {
      skipped++;
      continue;
    }

    const counterparty = cells[colIdx('交易对方')] ?? '';
    const note = `${counterparty} ${subject.replace(counterparty, '').trim()}`.trim().slice(0, 50);

    bills.push({
      id: uuid(),
      ledgerId: opts.ledgerId,
      type,
      amountCents: cents,
      categoryId: finalCatId,
      tagIds: [],
      note,
      accountId: payCol >= 0 ? matchAccount(cells[payCol] ?? '', opts.accounts) : undefined,
      occurredAt,
      createdAt: now,
      updatedAt: now,
    });
  }
  return { source, bills, skipped };
}
