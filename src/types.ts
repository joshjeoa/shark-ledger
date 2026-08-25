export type BillType = 'expense' | 'income';

export interface Bill {
  id: string;
  ledgerId: string;
  type: BillType;
  amountCents: number;
  categoryId: string;
  tagIds: string[];
  note: string;
  accountId?: string;
  occurredAt: number;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
}

export interface Category {
  id: string;
  name: string;
  icon: string;
  type: BillType;
  color?: string;
  sort: number;
  builtin: boolean;
  hidden?: boolean;
}

export interface Account {
  id: string;
  name: string;
  type: 'cash' | 'card' | 'ewallet';
  icon: string;
  sort: number;
  initialCents?: number;
}

export interface Tag {
  id: string;
  name: string;
  color?: string;
}

export interface Budget {
  yearMonth: string;
  amountCents: number;
  updatedAt?: number;
}

export interface Ledger {
  id: string;
  name: string;
  builtin: boolean;
}

export interface FullDump {
  meta: { schemaVersion: number; exportedAt: number; appVersion: string };
  data: {
    bills: Bill[];
    categories: Category[];
    accounts: Account[];
    tags: Tag[];
    ledgers: Ledger[];
    budgets: Budget[];
  };
}

export interface BackupMeta {
  schemaVersion: number;
  exportedAt: number;
  appVersion: string;
  deviceId: string;
}

export type BackupFile =
  | { v: 1; enc: false; meta: BackupMeta; data: FullDump['data'] }
  | { v: 1; enc: true; kdf: 'PBKDF2-SHA256'; iter: number; salt: string; iv: string; ct: string };

export interface SyncConfig {
  enabled: boolean;
  adapter: 'gist' | 'webdav';
  encrypt: boolean;
  // gist
  token?: string;
  gistId?: string;
  // webdav（经 Cloudflare Worker 中继）
  relayUrl?: string;
  webdavUrl?: string;
  username?: string;
  appPassword?: string;
}
