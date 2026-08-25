import { repo } from '../db/repo';
import { useUI } from '../store/ui';
import type { BackupFile, FullDump, SyncConfig } from '../types';
import { uuid } from '../utils/compat';
import { validateDump } from '../utils/merge';
import { adapters } from './adapters';
import { decryptJSON, encryptJSON } from './crypto';

const CFG_KEY = 'syncConfig';
const PASS_KEY = 'syncPass';

export function getSyncConfig(): SyncConfig | null {
  return repo.getMeta<SyncConfig>(CFG_KEY) ?? null;
}

export async function saveSyncConfig(cfg: SyncConfig): Promise<void> {
  await repo.setMeta(CFG_KEY, cfg);
  refreshSyncUI();
}

export function getSyncPass(): string {
  return repo.getMeta<string>(PASS_KEY) ?? '';
}

export async function saveSyncPass(pass: string): Promise<void> {
  await repo.setMeta(PASS_KEY, pass);
}

export function refreshSyncUI(): void {
  const cfg = getSyncConfig();
  const ui = useUI.getState();
  if (!cfg?.enabled) {
    ui.setSync({ state: 'off' });
    return;
  }
  if (ui.syncState === 'off') ui.setSync({ state: 'idle', lastSyncAt: repo.getMeta<number>('lastSyncAt') ?? null });
}

let timer: ReturnType<typeof setTimeout> | undefined;

/** 写操作后 5s 防抖自动同步 */
export function scheduleSync(): void {
  const cfg = getSyncConfig();
  if (!cfg?.enabled) return;
  clearTimeout(timer);
  timer = setTimeout(() => void doSync(), 5000);
}

function deviceId(): string {
  let id = repo.getMeta<string>('deviceId');
  if (!id) {
    id = uuid();
    void repo.setMeta('deviceId', id);
  }
  return id;
}

export async function buildBackupFile(cfg: SyncConfig): Promise<BackupFile> {
  const dump = repo.fullDump();
  const meta = { ...dump.meta, deviceId: deviceId() };
  if (cfg.encrypt) {
    const pass = getSyncPass();
    if (!pass) throw new Error('已开启加密但未设置口令');
    const env = await encryptJSON({ meta, data: dump.data }, pass);
    return { v: 1, enc: true, ...env };
  }
  return { v: 1, enc: false, meta, data: dump.data };
}

let syncing = false;
let pending = false;

export async function doSync(): Promise<void> {
  // 并发互斥：防抖定时器/hidden/online/手动同步可能同时触发，
  // 并发 push 会重复创建 Gist 或旧快照覆盖新快照
  if (syncing) {
    pending = true;
    return;
  }
  syncing = true;
  try {
    const cfg = getSyncConfig();
    const ui = useUI.getState();
    if (!cfg?.enabled) return;
    if (!navigator.onLine) {
      ui.setSync({ state: 'error', error: '离线，待联网后重试' });
      return;
    }
    ui.setSync({ state: 'syncing' });
    try {
      const adapter = adapters[cfg.adapter];
      const file = await buildBackupFile(cfg);
      await adapter.push(cfg, file);
      await saveSyncConfig(cfg); // gist 首次 push 会回填 gistId
      await repo.setMeta('lastSyncAt', Date.now());
      ui.setSync({ state: 'ok', lastSyncAt: Date.now() });
    } catch (e) {
      ui.setSync({ state: 'error', error: e instanceof Error ? e.message : '同步失败' });
    }
  } finally {
    syncing = false;
    if (pending) {
      pending = false;
      void doSync(); // 同步期间又有新写入，补跑一次
    }
  }
}

export async function testConnection(cfg: SyncConfig) {
  return adapters[cfg.adapter].test(cfg);
}

export async function pullCloudData(cfg: SyncConfig): Promise<{ data: FullDump['data']; exportedAt: number } | null> {
  const file = await adapters[cfg.adapter].pull(cfg);
  if (!file) return null;
  let payload: { meta?: { exportedAt?: number }; data?: FullDump['data'] };
  if (file.enc) {
    payload = await decryptJSON(file, getSyncPass());
  } else {
    payload = file;
  }
  const checked = validateDump(payload.data);
  if (!checked.ok || !checked.dump) throw new Error(`云端备份校验失败：${checked.errors[0] ?? '未知'}`);
  return { data: checked.dump, exportedAt: payload.meta?.exportedAt ?? 0 };
}

export async function restoreFromCloud(cfg: SyncConfig, strategy: 'overwrite' | 'merge'): Promise<string> {
  const pulled = await pullCloudData(cfg);
  if (!pulled) return '云端暂无备份';
  await repo.replaceAll(pulled.data, strategy);
  return strategy === 'overwrite' ? '已用云端数据覆盖本地' : '已合并云端数据到本地';
}

/** 页面可见性变化时尝试补同步 */
export function setupSyncLifecycle(): void {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      const cfg = getSyncConfig();
      if (cfg?.enabled) void doSync();
    }
  });
  window.addEventListener('online', () => {
    const cfg = getSyncConfig();
    if (cfg?.enabled) void doSync();
  });
}
