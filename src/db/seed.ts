import type { Account, Bill, Category, Ledger } from '../types';

let seq = 0;
const bid = (p: string) => `builtin-${p}-${++seq}`;

const expenseCats: [string, string][] = [
  ['餐饮', 'Utensils'], ['购物', 'ShoppingBag'], ['日用', 'Receipt'], ['交通', 'Bus'],
  ['蔬菜', 'Carrot'], ['水果', 'Cherry'], ['零食', 'Cookie'], ['运动', 'Dumbbell'],
  ['娱乐', 'Mic'], ['通讯', 'Phone'], ['服饰', 'Shirt'], ['美容', 'Sparkles'],
  ['住房', 'Home'], ['居家', 'Sofa'], ['孩子', 'Baby'], ['长辈', 'User'],
  ['社交', 'MessageCircle'], ['旅行', 'Plane'], ['烟酒', 'Wine'], ['数码', 'Cpu'],
  ['汽车', 'Car'], ['医疗', 'Cross'], ['书籍', 'Book'], ['学习', 'GraduationCap'],
  ['宠物', 'Dog'], ['礼金', 'Wallet'], ['礼物', 'Gift'], ['办公', 'Briefcase'],
  ['维修', 'Hammer'], ['捐赠', 'HeartHandshake'], ['彩票', 'Ticket'], ['亲友', 'Users'],
];

const incomeCats: [string, string][] = [
  ['工资', 'Wallet'], ['奖金', 'Award'], ['理财', 'TrendingUp'], ['红包', 'Gift'], ['其他', 'Coins'],
];

export function seedCategories(): Category[] {
  seq = 0;
  return [
    ...expenseCats.map(([name, icon], i): Category => ({ id: bid(`e${i}`), name, icon, type: 'expense', sort: i, builtin: true })),
    ...incomeCats.map(([name, icon], i): Category => ({ id: bid(`i${i}`), name, icon, type: 'income', sort: i, builtin: true })),
  ];
}

export function seedAccounts(): Account[] {
  return [
    { id: 'builtin-acc-1', name: '现金', type: 'cash', icon: 'Wallet', sort: 0 },
    { id: 'builtin-acc-2', name: '微信', type: 'ewallet', icon: 'MessageCircle', sort: 1 },
    { id: 'builtin-acc-3', name: '支付宝', type: 'ewallet', icon: 'Coins', sort: 2 },
    { id: 'builtin-acc-4', name: '银行卡', type: 'card', icon: 'Briefcase', sort: 3 },
  ];
}

export function seedLedgers(): Ledger[] {
  return [{ id: 'builtin-ledger', name: '默认账本', builtin: true }];
}

export const DEFAULT_LEDGER_ID = 'builtin-ledger';

// ---------------------------------------------------------------------------
// 演示数据：最近 90 天的仿真流水（确定性随机，每次生成结果一致）
// ---------------------------------------------------------------------------

/** LCG 伪随机（固定种子，保证演示数据可复现） */
function makeRng(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
}

export function seedDemoBills(categories: Category[], accounts: Account[], ledgerId: string): Bill[] {
  const rand = makeRng(20260827);
  const pick = <T,>(arr: T[]): T => arr[Math.floor(rand() * arr.length)]!;
  const range = (min: number, max: number) => Math.round(min + rand() * (max - min));
  const chance = (p: number) => rand() < p;

  const catId = (name: string, type: Bill['type']): string =>
    categories.find((c) => c.name === name && c.type === type)?.id ?? categories.find((c) => c.type === type)!.id;
  const acc = (i: number): string | undefined => accounts[i]?.id;
  // [分类名, 备注[], 金额区间(元), 账户]
  const meals: [string, string[], [number, number], number][] = [
    ['餐饮', ['早餐·豆浆油条', '早餐·包子', '便利店咖啡'], [6, 25], 2],
    ['餐饮', ['午饭·外卖', '午饭·食堂', '午市简餐'], [15, 45], 1],
    ['餐饮', ['晚饭', '晚饭·面馆', '晚饭·和同事聚餐'], [20, 88], 1],
    ['餐饮', ['夜宵·烧烤', '奶茶', '冰淇淋'], [8, 40], 2],
  ];
  const daily: [string, string[], [number, number], number][] = [
    ['交通', ['地铁', '公交', '打车', '共享单车'], [2, 35], 1],
    ['水果', ['水果·西瓜', '水果·草莓', '香蕉苹果'], [10, 60], 2],
    ['蔬菜', ['买菜', '超市蔬菜', '鸡蛋豆腐'], [15, 80], 0],
    ['零食', ['薯片饼干', '坚果', '可乐雪碧'], [8, 35], 2],
    ['日用', ['纸巾洗衣液', '生活用品', '牙膏牙刷'], [10, 60], 2],
  ];
  const weekend: [string, string[], [number, number], number][] = [
    ['购物', ['网购日用品', '衣服', '鞋'], [60, 400], 1],
    ['娱乐', ['电影票', '剧本杀', 'KTV', '游戏充值'], [30, 200], 2],
    ['运动', ['健身房', '羽毛球场地', '游泳'], [20, 120], 2],
    ['社交', ['和朋友聚餐', '下午茶', '请客'], [50, 260], 1],
  ];

  const bills: Bill[] = [];
  let seq = 0;
  const now = Date.now();
  const add = (dayOffset: number, hour: number, name: string, type: Bill['type'], note: string, yuan: number, accountId: number) => {
    const d = new Date();
    d.setDate(d.getDate() - dayOffset);
    d.setHours(hour, range(0, 59), 0, 0);
    const t = d.getTime();
    if (t > now) return; // 不生成未来时间
    const id = `demo-${String(++seq).padStart(4, '0')}`;
    bills.push({
      id,
      ledgerId,
      type,
      amountCents: Math.round(yuan * 100),
      categoryId: catId(name, type),
      tagIds: [],
      note,
      accountId: acc(accountId),
      occurredAt: t,
      createdAt: t,
      updatedAt: t,
    });
  };

  for (let dayOffset = 89; dayOffset >= 0; dayOffset--) {
    const d = new Date();
    d.setDate(d.getDate() - dayOffset);
    const dow = d.getDay(); // 0=周日
    const dom = d.getDate();
    const isWeekend = dow === 0 || dow === 6;

    // ---- 每日三餐 + 夜宵 ----
    if (chance(0.85)) { const [n, ns, [lo, hi], a] = meals[0]!; add(dayOffset, 8, n, 'expense', pick(ns), range(lo, hi) + 0.5, a); }
    if (chance(0.8)) { const [n, ns, [lo, hi], a] = meals[1]!; add(dayOffset, 12, n, 'expense', pick(ns), range(lo, hi) + 0.9, a); }
    if (chance(0.9)) { const [n, ns, [lo, hi], a] = meals[2]!; add(dayOffset, 19, n, 'expense', pick(ns), range(lo, hi) + 0.5, a); }
    if (chance(0.25)) { const [n, ns, [lo, hi], a] = meals[3]!; add(dayOffset, 22, n, 'expense', pick(ns), range(lo, hi) + 0.5, a); }

    // ---- 日常零散支出 ----
    if (chance(0.6)) { const [n, ns, [lo, hi], a] = pick(daily); add(dayOffset, range(10, 20), n, 'expense', pick(ns), range(lo, hi) + 0.8, a); }

    // ---- 周末大额娱乐/购物 ----
    if (isWeekend && chance(0.75)) { const [n, ns, [lo, hi], a] = pick(weekend); add(dayOffset, range(14, 20), n, 'expense', pick(ns), range(lo, hi) + 0.9, a); }

    // ---- 固定月度支出 ----
    if (dom === 1) add(dayOffset, 10, '住房', 'expense', '房租', 2600 + range(0, 20) / 10, 3);
    if (dom === 6) add(dayOffset, 11, '通讯', 'expense', '话费充值', 39, 2);
    if (dom === 18) add(dayOffset, 15, '美容', 'expense', '理发', range(35, 60), 1);

    // ---- 收入 ----
    if (dom === 10) add(dayOffset, 10, '工资', 'income', '工资', 12800, 3);
    if (dom === 22) add(dayOffset, 16, '理财', 'income', '基金收益', range(20, 280) + 0.5, 3);
    if (dom === 28 && chance(0.5)) add(dayOffset, 14, '红包', 'income', '微信红包', range(8, 88), 1);

    // ---- 偶发 ----
    if (chance(0.07)) add(dayOffset, range(13, 21), '医疗', 'expense', pick(['感冒药', '创可贴', '门诊挂号']), range(15, 220) + 0.5, 3);
    if (chance(0.05)) add(dayOffset, range(10, 20), '书籍', 'expense', pick(['买书', '电子书会员']), range(20, 90) + 0.5, 2);
    if (chance(0.04)) add(dayOffset, range(14, 20), '数码', 'expense', pick(['配件', '数据线', '充电头']), range(30, 200) + 0.9, 1);
  }
  return bills;
}
