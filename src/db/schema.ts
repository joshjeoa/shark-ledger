import { deleteDB, openDB, type IDBPDatabase } from 'idb';

export const SCHEMA_VERSION = 2;
export const DB_NAME = 'shark-ledger';

export type StorageMode = 'idb' | 'local' | 'memory';

/** 运行时写入探测：IDB → localStorage → 内存（Safari 私密模式等场景） */
export async function probeStorage(): Promise<StorageMode> {
  try {
    const t = await openDB('shark-probe', 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('t')) db.createObjectStore('t');
      },
    });
    const tx = t.transaction('t', 'readwrite');
    await tx.store.put(1, 'k');
    await tx.done;
    t.close();
    // 另一标签页占用探测库时 deleteDB 会 reject，吞掉避免未处理的 Promise 异常
    deleteDB('shark-probe').catch(() => {});
    return 'idb';
  } catch {
    /* fallthrough */
  }
  try {
    localStorage.setItem('__shark_probe', '1');
    localStorage.removeItem('__shark_probe');
    return 'local';
  } catch {
    /* fallthrough */
  }
  return 'memory';
}

export async function openLedgerDB(): Promise<IDBPDatabase> {
  return openDB(DB_NAME, SCHEMA_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('bills')) {
        const bills = db.createObjectStore('bills', { keyPath: 'id' });
        bills.createIndex('byUpdated', 'updatedAt');
      }
      if (!db.objectStoreNames.contains('categories')) db.createObjectStore('categories', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('accounts')) db.createObjectStore('accounts', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('tags')) db.createObjectStore('tags', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('ledgers')) db.createObjectStore('ledgers', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('budgets')) db.createObjectStore('budgets', { keyPath: 'yearMonth' });
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta');
      // v2：账单凭证照片（Blob 本地存储，不参与备份/同步）
      if (!db.objectStoreNames.contains('photos')) {
        const photos = db.createObjectStore('photos', { keyPath: 'id' });
        photos.createIndex('byBill', 'billId');
      }
    },
  });
}

/** 数据级迁移 runner：未来 schema 变化时向 MIGRATIONS 追加即可 */
export const MIGRATIONS: { to: number; run: (data: unknown) => void }[] = [];

export function runMigrations(data: unknown, from: number): number {
  let v = from;
  for (const m of MIGRATIONS) {
    if (m.to > v) {
      m.run(data);
      v = m.to;
    }
  }
  return v;
}
