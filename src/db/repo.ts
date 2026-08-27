import type { IDBPDatabase } from 'idb';
import type { Account, Bill, Budget, Category, FullDump, Ledger, Tag } from '../types';
import { openLedgerDB, probeStorage, runMigrations, SCHEMA_VERSION, type StorageMode } from './schema';
import { seedAccounts, seedCategories, seedLedgers } from './seed';
import { mergeDumps } from '../utils/merge';

export interface DBData {
  bills: Bill[];
  categories: Category[];
  accounts: Account[];
  tags: Tag[];
  ledgers: Ledger[];
  budgets: Budget[];
  meta: Record<string, unknown>;
}

const LS_KEY = 'shark-ledger-fallback';
const STORES = ['bills', 'categories', 'accounts', 'tags', 'ledgers', 'budgets'] as const;
type StoreName = (typeof STORES)[number];

const emptyData = (): DBData => ({ bills: [], categories: [], accounts: [], tags: [], ledgers: [], budgets: [], meta: {} });

/**
 * 数据仓库：内存缓存 + 三种持久化后端（IndexedDB / localStorage / 内存）
 * 所有查询读缓存（保证记账→列表 ≤200ms），写操作同步更新缓存后异步落盘。
 */
class Repo {
  mode: StorageMode = 'memory';
  data: DBData = emptyData();
  onChange: (() => void) | null = null;
  /** 最近一次持久化写入是否失败（配额满/存储损坏）。UI 顶部横幅据此提醒用户立即导出。 */
  writeFailed = false;

  private db?: IDBPDatabase;
  private saveTimer?: ReturnType<typeof setTimeout>;
  private bc?: BroadcastChannel;

  async init(): Promise<void> {
    const probe = await probeStorage();
    if (probe === 'idb') {
      try {
        this.db = await openLedgerDB();
        const d = this.data as unknown as Record<StoreName, unknown[]>;
        for (const s of STORES) d[s] = await this.db.getAll(s);
        const keys = await this.db.getAllKeys('meta');
        const vals = await this.db.getAll('meta');
        keys.forEach((k, i) => {
          this.data.meta[String(k)] = vals[i];
        });
        this.mode = 'idb';
      } catch {
        this.db = undefined;
      }
    }
    if (!this.db) {
      if (probe === 'local') {
        try {
          const raw = localStorage.getItem(LS_KEY);
          if (raw) this.data = { ...emptyData(), ...(JSON.parse(raw) as Partial<DBData>) };
          this.mode = 'local';
        } catch {
          this.mode = 'memory';
        }
      } else {
        this.mode = 'memory';
      }
    }
    // 数据级迁移
    const from = Number(this.data.meta['schemaVersion'] ?? 0);
    const to = runMigrations(this.data, from);
    await this.setMeta('schemaVersion', to || SCHEMA_VERSION);
    // 首次种子
    if (this.data.categories.length === 0) {
      this.data.categories = seedCategories();
      this.data.accounts = seedAccounts();
      this.data.ledgers = seedLedgers();
      await this.persistAll();
    }
    // 清理 >30 天的软删除
    const cutoff = Date.now() - 30 * 86400000;
    const expired = this.data.bills.filter((b) => b.deletedAt && b.deletedAt < cutoff);
    for (const b of expired) this.purgeBill(b.id);
    if (expired.length) await this.flush();
    // 多标签页同步
    try {
      this.bc = new BroadcastChannel('shark-ledger');
      this.bc.onmessage = () => void this.reload();
    } catch {
      /* 旧浏览器忽略 */
    }
    window.addEventListener('storage', (e) => {
      if (e.key === LS_KEY && this.mode !== 'idb') void this.reload();
    });
  }

  /** 从持久层重新加载（多标签页/回前台场景）。meta 一并刷新，避免 syncConfig 等跨标签页读到旧值 */
  async reload(): Promise<void> {
    if (this.mode === 'idb' && this.db) {
      const d = this.data as unknown as Record<StoreName, unknown[]>;
      for (const s of STORES) d[s] = await this.db.getAll(s);
      const keys = await this.db.getAllKeys('meta');
      const vals = await this.db.getAll('meta');
      this.data.meta = {};
      keys.forEach((k, i) => {
        this.data.meta[String(k)] = vals[i];
      });
    } else if (this.mode === 'local') {
      try {
        const raw = localStorage.getItem(LS_KEY);
        if (raw) this.data = { ...emptyData(), ...(JSON.parse(raw) as Partial<DBData>) };
      } catch {
        /* ignore */
      }
    }
    this.notify();
  }

  private notify(): void {
    this.onChange?.();
  }

  /** 写操作收尾：广播到其他标签页并通知本页 UI（所有数据变更统一走这里，避免遗漏） */
  private commit(): void {
    this.bc?.postMessage('changed');
    this.notify();
  }

  // ---------- 持久化 ----------
  private scheduleSave(): void {
    if (this.mode !== 'local') return;
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      try {
        localStorage.setItem(LS_KEY, JSON.stringify(this.data));
        this.writeFailed = false;
      } catch {
        this.writeFailed = true;
        this.notify(); // 落盘失败需让 UI 立刻感知，而非等下次写操作
      }
    }, 200);
  }

  private async putStore(store: StoreName, val: unknown): Promise<void> {
    if (this.db) {
      try {
        await this.db.put(store, val);
        this.writeFailed = false;
      } catch {
        this.writeFailed = true; // 缓存已更新但未落盘：界面"看似成功"，需横幅提醒导出
      }
    } else this.scheduleSave();
  }

  private async delStore(store: StoreName, key: string): Promise<void> {
    if (this.db) {
      try {
        await this.db.delete(store, key);
        this.writeFailed = false;
      } catch {
        this.writeFailed = true;
      }
    } else this.scheduleSave();
  }

  /** 全量落盘（种子/恢复/导入用） */
  async persistAll(): Promise<void> {
    if (this.db) {
      try {
        const tx = this.db.transaction(STORES as unknown as StoreName[], 'readwrite');
        for (const s of STORES) {
          tx.objectStore(s).clear();
          for (const item of this.data[s] as { id?: string; yearMonth?: string }[]) {
            tx.objectStore(s).put(item);
          }
        }
        await tx.done;
        const mtx = this.db.transaction('meta', 'readwrite');
        mtx.objectStore('meta').clear();
        for (const [k, v] of Object.entries(this.data.meta)) mtx.objectStore('meta').put(v, k);
        await mtx.done;
        this.writeFailed = false;
      } catch {
        this.writeFailed = true;
      }
    } else if (this.mode === 'local') {
      this.scheduleSave();
    }
    this.commit();
  }

  private async flush(): Promise<void> {
    if (this.mode === 'local') {
      clearTimeout(this.saveTimer);
      try {
        localStorage.setItem(LS_KEY, JSON.stringify(this.data));
        this.writeFailed = false;
      } catch {
        this.writeFailed = true;
      }
    }
  }

  // ---------- meta ----------
  async setMeta(key: string, value: unknown): Promise<void> {
    this.data.meta[key] = value;
    if (this.db) {
      try {
        await this.db.put('meta', value, key);
        this.writeFailed = false;
      } catch {
        this.writeFailed = true;
      }
    } else this.scheduleSave();
  }

  getMeta<T>(key: string): T | undefined {
    return this.data.meta[key] as T | undefined;
  }

  // ---------- bills ----------
  async upsertBill(bill: Bill): Promise<void> {
    const i = this.data.bills.findIndex((b) => b.id === bill.id);
    if (i >= 0) this.data.bills[i] = bill;
    else this.data.bills.push(bill);
    await this.putStore('bills', bill);
    this.commit();
  }

  private purgeBill(id: string): void {
    this.data.bills = this.data.bills.filter((b) => b.id !== id);
    void this.delStore('bills', id);
  }

  async deleteBill(id: string, soft: boolean): Promise<void> {
    const b = this.data.bills.find((x) => x.id === id);
    if (!b) return;
    if (soft) {
      const updated = { ...b, deletedAt: Date.now(), updatedAt: Date.now() };
      await this.upsertBill(updated);
    } else {
      this.purgeBill(id);
      this.commit();
    }
  }

  async restoreBill(id: string): Promise<void> {
    const b = this.data.bills.find((x) => x.id === id);
    if (!b) return;
    await this.upsertBill({ ...b, deletedAt: undefined, updatedAt: Date.now() });
  }

  // ---------- 其他表 ----------
  async upsertCategory(c: Category): Promise<void> {
    const i = this.data.categories.findIndex((x) => x.id === c.id);
    if (i >= 0) this.data.categories[i] = c;
    else this.data.categories.push(c);
    await this.putStore('categories', c);
    this.commit();
  }

  async deleteCategory(id: string): Promise<boolean> {
    if (this.data.bills.some((b) => b.categoryId === id && !b.deletedAt)) return false;
    this.data.categories = this.data.categories.filter((c) => c.id !== id);
    await this.delStore('categories', id);
    this.commit();
    return true;
  }

  async upsertAccount(a: Account): Promise<void> {
    const i = this.data.accounts.findIndex((x) => x.id === a.id);
    if (i >= 0) this.data.accounts[i] = a;
    else this.data.accounts.push(a);
    await this.putStore('accounts', a);
    this.commit();
  }

  async deleteAccount(id: string): Promise<boolean> {
    if (this.data.bills.some((b) => b.accountId === id && !b.deletedAt)) return false;
    this.data.accounts = this.data.accounts.filter((a) => a.id !== id);
    await this.delStore('accounts', id);
    this.commit();
    return true;
  }

  async upsertLedger(l: Ledger): Promise<void> {
    const i = this.data.ledgers.findIndex((x) => x.id === l.id);
    if (i >= 0) this.data.ledgers[i] = l;
    else this.data.ledgers.push(l);
    await this.putStore('ledgers', l);
    this.commit();
  }

  async setBudget(yearMonth: string, amountCents: number | null): Promise<void> {
    this.data.budgets = this.data.budgets.filter((b) => b.yearMonth !== yearMonth);
    if (this.db) {
      try {
        await this.db.delete('budgets', yearMonth);
      } catch {
        /* ignore */
      }
    }
    if (amountCents !== null) {
      const budget: Budget = { yearMonth, amountCents, updatedAt: Date.now() };
      this.data.budgets.push(budget);
      await this.putStore('budgets', budget);
    } else this.scheduleSave();
    this.commit();
  }

  // ---------- 导出 / 恢复 ----------
  fullDump(): FullDump {
    return {
      meta: { schemaVersion: SCHEMA_VERSION, exportedAt: Date.now(), appVersion: '1.0.0' },
      data: {
        bills: this.data.bills,
        categories: this.data.categories,
        accounts: this.data.accounts,
        tags: this.data.tags,
        ledgers: this.data.ledgers,
        budgets: this.data.budgets,
      },
    };
  }

  async replaceAll(dump: FullDump['data'], strategy: 'overwrite' | 'merge'): Promise<void> {
    const next = strategy === 'overwrite' ? dump : mergeDumps(this.fullDump().data, dump);
    this.data.bills = next.bills;
    this.data.categories = next.categories.length ? next.categories : this.data.categories;
    this.data.accounts = next.accounts.length ? next.accounts : this.data.accounts;
    this.data.tags = next.tags;
    this.data.ledgers = next.ledgers.length ? next.ledgers : this.data.ledgers;
    this.data.budgets = next.budgets;
    await this.persistAll(); // 内部已 commit()：广播 + 通知
  }
}

export const repo = new Repo();
