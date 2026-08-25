import { useEffect, useState } from 'react';
import { SettingsShell, Toggle } from './SettingsShell';
import { useUI } from '../../store/ui';
import {
  getSyncConfig, saveSyncConfig, saveSyncPass, getSyncPass, testConnection, doSync, restoreFromCloud, refreshSyncUI,
} from '../../sync/manager';
import type { SyncConfig } from '../../types';
import { Sheet } from '../../components/Sheet';

const defaultCfg: SyncConfig = { enabled: false, adapter: 'gist', encrypt: false };

export function BackupPage() {
  const toast = useUI((s) => s.toast);
  const confirm = useUI((s) => s.confirm);
  const syncState = useUI((s) => s.syncState);
  const syncError = useUI((s) => s.syncError);
  const [cfg, setCfg] = useState<SyncConfig>(defaultCfg);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState('');
  const [passOpen, setPassOpen] = useState(false);
  const [pass1, setPass1] = useState('');
  const [pass2, setPass2] = useState('');
  const [restoreOpen, setRestoreOpen] = useState(false);

  useEffect(() => {
    const c = getSyncConfig();
    if (c) setCfg(c);
    setLoaded(true);
    refreshSyncUI();
  }, []);

  const patch = (p: Partial<SyncConfig>) => {
    const next = { ...cfg, ...p };
    setCfg(next);
    void saveSyncConfig(next);
  };

  const onTest = async () => {
    setBusy('test');
    const r = await testConnection(cfg);
    setBusy('');
    if (r.ok) toast(`连接成功（${r.latencyMs}ms）`);
    else toast(r.reason, 'err');
  };

  const onSync = async () => {
    setBusy('sync');
    await doSync();
    setBusy('');
    const st = useUI.getState().syncState;
    toast(st === 'ok' ? '同步完成' : useUI.getState().syncError || '同步失败', st === 'ok' ? 'ok' : 'err');
  };

  const onRestore = async (strategy: 'overwrite' | 'merge') => {
    setRestoreOpen(false);
    setBusy('restore');
    try {
      const msg = await restoreFromCloud(cfg, strategy);
      toast(msg);
    } catch (e) {
      toast(e instanceof Error ? e.message : '恢复失败', 'err');
    }
    setBusy('');
  };

  const savePass = async () => {
    if (pass1.length < 4) return toast('口令至少 4 位', 'err');
    if (pass1 !== pass2) return toast('两次输入不一致', 'err');
    await saveSyncPass(pass1);
    setPassOpen(false);
    setPass1('');
    setPass2('');
    toast('口令已保存（仅存本机）');
  };

  if (!loaded) return <SettingsShell title="云备份"><div /></SettingsShell>;

  return (
    <SettingsShell title="云备份">
      <div className="px-3 pt-3 space-y-3">
        <div className="bg-white rounded-2xl p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium">自动同步（写操作后 5 秒）</span>
            <Toggle on={cfg.enabled} onChange={(v) => patch({ enabled: v })} />
          </div>
          <p className="text-xs text-gray-400">
            {syncState === 'error' ? `最近错误：${syncError}` : '凭证仅保存在本机，不会上传到任何第三方服务器。'}
          </p>
        </div>

        <div className="bg-white rounded-2xl p-4 space-y-3">
          <div className="flex rounded-lg overflow-hidden border border-gray-200 text-xs">
            <button className={`flex-1 py-2 ${cfg.adapter === 'gist' ? 'bg-primary font-medium' : 'text-gray-500'}`} onClick={() => patch({ adapter: 'gist' })}>
              GitHub Gist（推荐）
            </button>
            <button className={`flex-1 py-2 ${cfg.adapter === 'webdav' ? 'bg-primary font-medium' : 'text-gray-500'}`} onClick={() => patch({ adapter: 'webdav' })}>
              WebDAV（坚果云等）
            </button>
          </div>

          {cfg.adapter === 'gist' ? (
            <>
              <Field label="Personal Access Token（scope: gist）" value={cfg.token ?? ''} onChange={(v) => patch({ token: v })} password />
              <p className="text-xs text-gray-400">首次同步会自动创建私密 Gist；Token 可在 GitHub → Settings → Developer settings 创建。</p>
            </>
          ) : (
            <>
              <Field label="中继地址（Cloudflare Worker）" value={cfg.relayUrl ?? ''} onChange={(v) => patch({ relayUrl: v })} placeholder="https://xxx.workers.dev" />
              <Field label="WebDAV 地址" value={cfg.webdavUrl ?? ''} onChange={(v) => patch({ webdavUrl: v })} placeholder="https://dav.jianguoyun.com/dav/记账" />
              <Field label="用户名" value={cfg.username ?? ''} onChange={(v) => patch({ username: v })} />
              <Field label="应用密码" value={cfg.appPassword ?? ''} onChange={(v) => patch({ appPassword: v })} password />
              <p className="text-xs text-gray-400">坚果云 WebDAV 无 CORS 头，需先部署 deploy/relay-worker.ts 中继（免费）。</p>
            </>
          )}

          <div className="flex items-center justify-between">
            <span className="text-sm">备份加密（AES-GCM）</span>
            <Toggle on={cfg.encrypt} onChange={(v) => patch({ encrypt: v })} />
          </div>
          {cfg.encrypt && (
            <button className="w-full h-10 rounded-xl bg-gray-100 text-sm" onClick={() => { setPass1(getSyncPass()); setPass2(getSyncPass()); setPassOpen(true); }}>
              {getSyncPass() ? '修改加密口令' : '设置加密口令'}
            </button>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <button disabled={busy !== ''} className="h-11 rounded-xl bg-gray-200 text-sm font-medium disabled:opacity-50" onClick={() => void onTest()}>
            {busy === 'test' ? '测试中…' : '测试连接'}
          </button>
          <button disabled={busy !== '' || !cfg.enabled} className="h-11 rounded-xl bg-primary text-sm font-medium disabled:opacity-50" onClick={() => void onSync()}>
            {busy === 'sync' ? '同步中…' : '立即同步'}
          </button>
        </div>
        <button disabled={busy !== ''} className="w-full h-11 rounded-xl bg-white text-sm text-gray-700" onClick={() => setRestoreOpen(true)}>
          {busy === 'restore' ? '恢复中…' : '从云端恢复'}
        </button>
      </div>

      <Sheet open={passOpen} onClose={() => setPassOpen(false)} title="加密口令（仅存本机）">
        <div className="px-4 pb-6 space-y-3">
          <input type="password" value={pass1} onChange={(e) => setPass1(e.target.value)} placeholder="输入口令" className="w-full h-11 px-4 rounded-xl bg-gray-100 outline-none" />
          <input type="password" value={pass2} onChange={(e) => setPass2(e.target.value)} placeholder="再次输入" className="w-full h-11 px-4 rounded-xl bg-gray-100 outline-none" />
          <button className="w-full h-11 rounded-xl bg-primary font-medium" onClick={() => void savePass()}>
            保存
          </button>
        </div>
      </Sheet>

      <Sheet open={restoreOpen} onClose={() => setRestoreOpen(false)} title="从云端恢复">
        <div className="px-4 pb-6 space-y-3">
          <button className="w-full h-11 rounded-xl bg-gray-100 text-sm" onClick={() => void onRestore('merge')}>
            合并（同 id 取较新）
          </button>
          <button className="w-full h-11 rounded-xl bg-danger text-white text-sm font-medium" onClick={() => void onRestore('overwrite')}>
            覆盖本地数据
          </button>
        </div>
      </Sheet>
    </SettingsShell>
  );
}

function Field({ label, value, onChange, password, placeholder }: { label: string; value: string; onChange: (v: string) => void; password?: boolean; placeholder?: string }) {
  return (
    <label className="block">
      <span className="text-xs text-gray-500">{label}</span>
      <input
        type={password ? 'password' : 'text'}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full h-10 px-3 mt-1 rounded-lg bg-gray-100 text-sm outline-none"
      />
    </label>
  );
}
