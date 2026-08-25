import type { Account, Category, Ledger } from '../types';

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
