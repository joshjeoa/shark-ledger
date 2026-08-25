import { create } from 'zustand';
import { repo } from '../db/repo';
import type { Account, Bill, Budget, Category, Ledger, Tag } from '../types';
import { uuid } from '../utils/compat';
import type { StorageMode } from '../db/schema';
import { refreshSyncUI, scheduleSync } from '../sync/manager';

interface DataState {
  ready: boolean;
  mode: StorageMode;
  bills: Bill[];
  categories: Category[];
  accounts: Account[];
  tags: Tag[];
  ledgers: Ledger[];
  budgets: Budget[];
  currentLedgerId: string;
  init: () => Promise<void>;
  sync: () => void;
  refresh: () => Promise<void>;
  setCurrentLedger: (id: string) => void;
  addBill: (input: { type: Bill['type']; amountCents: number; categoryId: string; note: string; accountId?: string; occurredAt: number; tagIds?: string[]; ledgerId?: string }) => Promise<Bill>;
  updateBill: (bill: Bill) => Promise<void>;
  removeBill: (id: string) => Promise<void>;
  restoreBill: (id: string) => Promise<void>;
  upsertCategory: (c: Category) => Promise<void>;
  deleteCategory: (id: string) => Promise<boolean>;
  upsertAccount: (a: Account) => Promise<void>;
  deleteAccount: (id: string) => Promise<boolean>;
  upsertLedger: (l: Ledger) => Promise<void>;
  setBudget: (yearMonth: string, cents: number | null) => Promise<void>;
}

export const useData = create<DataState>((set, get) => ({
  ready: false,
  mode: 'memory',
  bills: [],
  categories: [],
  accounts: [],
  tags: [],
  ledgers: [],
  budgets: [],
  currentLedgerId: 'builtin-ledger',

  init: async () => {
    await repo.init();
    repo.onChange = () => get().sync();
    const saved = repo.getMeta<string>('currentLedgerId');
    set({ ready: true, mode: repo.mode, currentLedgerId: saved ?? repo.data.ledgers[0]?.id ?? 'builtin-ledger' });
    get().sync();
    refreshSyncUI(); // 冷启动后依据已加载的配置刷新同步芯片状态
  },

  sync: () =>
    set({
      bills: [...repo.data.bills],
      categories: [...repo.data.categories],
      accounts: [...repo.data.accounts],
      tags: [...repo.data.tags],
      ledgers: [...repo.data.ledgers],
      budgets: [...repo.data.budgets],
    }),

  refresh: async () => {
    await repo.reload();
  },

  setCurrentLedger: (id) => {
    set({ currentLedgerId: id });
    void repo.setMeta('currentLedgerId', id);
  },

  addBill: async (input) => {
    const now = Date.now();
    const bill: Bill = {
      id: uuid(),
      ledgerId: input.ledgerId ?? get().currentLedgerId,
      type: input.type,
      amountCents: input.amountCents,
      categoryId: input.categoryId,
      tagIds: input.tagIds ?? [],
      note: input.note,
      accountId: input.accountId,
      occurredAt: input.occurredAt,
      createdAt: now,
      updatedAt: now,
    };
    await repo.upsertBill(bill);
    scheduleSync();
    return bill;
  },

  updateBill: async (bill) => {
    await repo.upsertBill({ ...bill, updatedAt: Date.now() });
    scheduleSync();
  },

  removeBill: async (id) => {
    await repo.deleteBill(id, true);
    scheduleSync();
  },

  restoreBill: async (id) => {
    await repo.restoreBill(id);
    scheduleSync();
  },

  upsertCategory: async (c) => {
    await repo.upsertCategory(c);
    scheduleSync();
  },

  deleteCategory: async (id) => {
    const ok = await repo.deleteCategory(id);
    if (ok) scheduleSync();
    return ok;
  },

  upsertAccount: async (a) => {
    await repo.upsertAccount(a);
    scheduleSync();
  },

  deleteAccount: async (id) => {
    const ok = await repo.deleteAccount(id);
    if (ok) scheduleSync();
    return ok;
  },

  upsertLedger: async (l) => {
    await repo.upsertLedger(l);
    scheduleSync();
  },

  setBudget: async (yearMonth, cents) => {
    await repo.setBudget(yearMonth, cents);
    scheduleSync();
  },
}));
