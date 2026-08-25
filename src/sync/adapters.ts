import type { BackupFile, SyncConfig } from '../types';

export type TestResult = { ok: true; latencyMs: number } | { ok: false; reason: string };

export interface SyncAdapter {
  kind: 'gist' | 'webdav';
  test: (cfg: SyncConfig) => Promise<TestResult>;
  push: (cfg: SyncConfig, file: BackupFile) => Promise<void>;
  pull: (cfg: SyncConfig) => Promise<BackupFile | null>;
}

const FILENAME = 'shark-ledger-backup.json';

function httpReason(status: number): string {
  if (status === 401) return '认证失败：Token/密码无效或已过期';
  if (status === 403) return '权限不足或被限流';
  if (status === 404) return '资源不存在（404）';
  if (status >= 500) return '服务器错误，稍后重试';
  return `请求失败（${status}）`;
}

/** GitHub Gist：api.github.com 支持 CORS 含鉴权请求，零基建纯前端可用 */
const gistAdapter: SyncAdapter = {
  kind: 'gist',
  async test(cfg) {
    if (!cfg.token) return { ok: false, reason: '请填写 Token' };
    const t0 = Date.now();
    try {
      const res = await fetch('https://api.github.com/user', { headers: { Authorization: `Bearer ${cfg.token}`, Accept: 'application/vnd.github+json' } });
      if (!res.ok) return { ok: false, reason: httpReason(res.status) };
      return { ok: true, latencyMs: Date.now() - t0 };
    } catch {
      return { ok: false, reason: '网络错误（离线或 DNS 失败）' };
    }
  },
  async push(cfg, file) {
    const headers = { Authorization: `Bearer ${cfg.token}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' };
    const content = JSON.stringify(file);
    if (cfg.gistId) {
      const res = await fetch(`https://api.github.com/gists/${cfg.gistId}`, { method: 'PATCH', headers, body: JSON.stringify({ files: { [FILENAME]: { content } } }) });
      if (!res.ok) throw new Error(httpReason(res.status));
    } else {
      const res = await fetch('https://api.github.com/gists', { method: 'POST', headers, body: JSON.stringify({ description: '鲨鱼记账备份', public: false, files: { [FILENAME]: { content } } }) });
      if (!res.ok) throw new Error(httpReason(res.status));
      const json = (await res.json()) as { id: string };
      cfg.gistId = json.id;
    }
  },
  async pull(cfg) {
    if (!cfg.gistId) return null;
    const res = await fetch(`https://api.github.com/gists/${cfg.gistId}`, { headers: { Authorization: `Bearer ${cfg.token}`, Accept: 'application/vnd.github+json' } });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(httpReason(res.status));
    const json = (await res.json()) as { files?: Record<string, { content?: string }> };
    const content = json.files?.[FILENAME]?.content;
    return content ? (JSON.parse(content) as BackupFile) : null;
  },
};

/** WebDAV（坚果云等）：目标服务无 CORS 头，必须经 Cloudflare Worker 中继（deploy/relay-worker.ts） */
const webdavAdapter: SyncAdapter = {
  kind: 'webdav',
  async test(cfg) {
    if (!cfg.relayUrl || !cfg.webdavUrl) return { ok: false, reason: '请填写中继地址与 WebDAV 地址' };
    const t0 = Date.now();
    try {
      const res = await fetch(cfg.relayUrl, { headers: { 'x-target': cfg.webdavUrl, Authorization: basicAuth(cfg) } });
      if (res.status >= 500 || res.status === 400) return { ok: false, reason: httpReason(res.status) };
      if (res.status === 401) return { ok: false, reason: httpReason(401) };
      return { ok: true, latencyMs: Date.now() - t0 };
    } catch {
      return { ok: false, reason: '中继不可达：检查 Worker 是否已部署' };
    }
  },
  async push(cfg, file) {
    const target = joinPath(cfg.webdavUrl!, FILENAME);
    const res = await fetch(cfg.relayUrl!, {
      method: 'PUT',
      headers: { 'x-target': target, Authorization: basicAuth(cfg), 'Content-Type': 'application/json' },
      body: JSON.stringify(file),
    });
    if (!res.ok) throw new Error(httpReason(res.status));
  },
  async pull(cfg) {
    const target = joinPath(cfg.webdavUrl!, FILENAME);
    const res = await fetch(cfg.relayUrl!, { headers: { 'x-target': target, Authorization: basicAuth(cfg) } });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(httpReason(res.status));
    return (await res.json()) as BackupFile;
  },
};

function basicAuth(cfg: SyncConfig): string {
  return 'Basic ' + btoa(`${cfg.username ?? ''}:${cfg.appPassword ?? ''}`);
}

function joinPath(base: string, file: string): string {
  return base.endsWith('/') ? base + file : `${base}/${file}`;
}

export const adapters: Record<'gist' | 'webdav', SyncAdapter> = { gist: gistAdapter, webdav: webdavAdapter };
