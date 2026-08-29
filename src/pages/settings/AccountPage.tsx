import { useEffect, useState } from 'react';
import { CloudUpload, Eye, EyeOff, KeyRound, Loader2, LogOut, Mail, ShieldCheck, Trash2 } from 'lucide-react';
import { SettingsShell } from './SettingsShell';
import { useUI } from '../../store/ui';
import {
  deleteVault,
  getVaultPass,
  isAccountConfigured,
  lastVaultError,
  lastVaultSyncAt,
  sendResetEmail,
  setVaultPass,
  signIn,
  signOut,
  signUp,
  syncVault,
  updatePassword,
  onAuthEvent,
  getSession,
} from '../../sync/account';

type Status = 'loading' | 'unconfigured' | 'signedOut' | 'signedIn';
type Mode = 'login' | 'register' | 'forgot' | 'recovery';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function AccountPage() {
  const toast = useUI((s) => s.toast);
  const confirm = useUI((s) => s.confirm);
  const [status, setStatus] = useState<Status>(() => (isAccountConfigured() ? 'loading' : 'unconfigured'));
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [userEmail, setUserEmail] = useState('');

  // 登录后展示的保险库状态
  const [vaultPass, setVaultPassState] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<number | null>(() => lastVaultSyncAt());
  const [lastErr, setLastErr] = useState<string | null>(() => lastVaultError());

  useEffect(() => {
    if (!isAccountConfigured()) return;
    let alive = true;
    void getSession().then((s) => {
      if (!alive) return;
      if (s) {
        setUserEmail(s.user.email ?? '');
        setVaultPassState(getVaultPass());
        setStatus('signedIn');
      } else {
        setStatus('signedOut');
      }
    });
    // 登录/登出/找回密码事件（supabase-js 跨标签页也会广播会话变化）
    const off = onAuthEvent({
      onSignedIn: (s) => {
        if (!alive) return;
        setUserEmail(s.user.email ?? '');
        setVaultPassState(getVaultPass());
        setStatus('signedIn');
        setLastSync(lastVaultSyncAt());
      },
      onSignedOut: () => {
        if (!alive) return;
        setStatus('signedOut');
        setMode('login');
        setPassword('');
      },
      onPasswordRecovery: () => {
        if (!alive) return;
        setStatus('signedOut');
        setMode('recovery');
        toast('请设置新密码');
      },
    });
    // 自动同步在后台完成时刷新"上次同步"显示
    const onSynced = () => {
      setLastSync(lastVaultSyncAt());
      setLastErr(lastVaultError());
    };
    window.addEventListener('vault-synced', onSynced);
    return () => {
      alive = false;
      off();
      window.removeEventListener('vault-synced', onSynced);
    };
  }, [toast]);

  const run = async (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };

  const submitAuth = () =>
    run(async () => {
      if (!EMAIL_RE.test(email)) {
        toast('请输入正确的邮箱地址', 'err');
        return;
      }
      if (mode !== 'forgot' && password.length < 8) {
        toast('密码至少 8 位', 'err');
        return;
      }
      try {
        if (mode === 'login') {
          await signIn(email, password); // 成功后经 SIGNED_IN 事件切换到已登录态并自动同步
        } else if (mode === 'register') {
          const { needConfirm } = await signUp(email, password);
          toast(needConfirm ? '确认邮件已发送，请点击邮件里的链接后回来登录' : '注册成功');
          if (needConfirm) setMode('login');
        } else if (mode === 'forgot') {
          await sendResetEmail(email);
          toast('重置密码邮件已发送，请查收');
          setMode('login');
        } else {
          await updatePassword(password);
          toast('密码已更新，请用新密码登录');
          await signOut().catch(() => {});
          setMode('login');
        }
      } catch (e) {
        toast(e instanceof Error ? e.message : '操作失败', 'err');
      }
    });

  const doSync = () =>
    run(async () => {
      setSyncing(true);
      try {
        const r = await syncVault();
        setLastSync(lastVaultSyncAt());
        setLastErr(null);
        toast(r.pulled ? `已合并云端数据（共 ${r.billCount} 笔账单）` : '本地数据已备份到云端');
      } catch (e) {
        const msg = e instanceof Error ? e.message : '同步失败';
        setLastErr(msg);
        toast(msg, 'err');
      } finally {
        setSyncing(false);
      }
    });

  const savePass = () =>
    run(async () => {
      setVaultPass(vaultPass);
      toast(vaultPass ? '数据口令已保存（仅保存在本设备）' : '已清除本设备的数据口令');
    });

  const removeVault = async () => {
    const ok = await confirm({ title: '删除云端数据？', message: '云端加密快照将被删除，本机数据不受影响。其他设备将无法再同步到这份数据。', confirmText: '删除', danger: true });
    if (!ok) return;
    await run(async () => {
      try {
        await deleteVault();
        setLastSync(null);
        setLastErr(null);
        toast('云端数据已删除');
      } catch (e) {
        toast(e instanceof Error ? e.message : '删除失败', 'err');
      }
    });
  };

  const doSignOut = async () => {
    const ok = await confirm({ title: '退出登录？', message: '本机数据保留，退出后将停止自动云同步。', confirmText: '退出' });
    if (!ok) return;
    await run(async () => {
      try {
        await signOut();
      } catch (e) {
        toast(e instanceof Error ? e.message : '退出失败', 'err');
      }
    });
  };

  return (
    <SettingsShell title="账号与云同步">
      {status === 'unconfigured' && <UnconfiguredGuide />}
      {status === 'loading' && (
        <div className="flex justify-center py-16 text-ink-3">
          <Loader2 size={24} className="animate-spin" />
        </div>
      )}

      {status === 'signedOut' && (
        <div className="px-3 pt-3 space-y-3">
          {mode !== 'recovery' && (
            <div className="flex rounded-xl overflow-hidden bg-card text-sm">
              {(
                [
                  ['login', '登录'],
                  ['register', '注册'],
                ] as [Mode, string][]
              ).map(([m, label]) => (
                <button key={m} className={`flex-1 h-11 ${mode === m ? 'bg-primary text-on-primary font-medium' : 'text-ink-2'}`} onClick={() => setMode(m)}>
                  {label}
                </button>
              ))}
            </div>
          )}
          <div className="bg-card rounded-2xl p-4 space-y-3">
            <p className="text-xs text-ink-3 leading-relaxed">
              {mode === 'login' && '登录后数据自动加密同步到你的云端保险库，换设备登录即可找回账单。'}
              {mode === 'register' && '使用邮箱注册账号。注册后需要点击邮件里的确认链接激活（密码至少 8 位）。'}
              {mode === 'forgot' && '输入注册邮箱，我们会发送重置密码的邮件。'}
              {mode === 'recovery' && '请为新账号设置新密码（至少 8 位），设置后请用新密码重新登录。'}
            </p>
            {mode !== 'recovery' && (
              <label className="block">
                <span className="text-xs text-ink-3 mb-1 block">邮箱</span>
                <input
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value.trim())}
                  placeholder="you@example.com"
                  className="w-full h-11 px-3 rounded-xl bg-fill text-ink text-sm outline-none"
                />
              </label>
            )}
            <label className="block">
              <span className="text-xs text-ink-3 mb-1 block">{mode === 'recovery' ? '新密码' : '密码'}</span>
              <PassInput
                value={password}
                onChange={setPassword}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                placeholder={mode === 'forgot' ? '（此页不需要输入密码）' : '至少 8 位'}
              />
            </label>
            <button disabled={busy} className="w-full h-11 rounded-xl bg-primary text-on-primary font-medium disabled:opacity-60 flex items-center justify-center gap-2" onClick={() => void submitAuth()}>
              {busy ? <Loader2 size={16} className="animate-spin" /> : <KeyRound size={16} />}
              {mode === 'login' ? '登录' : mode === 'register' ? '注册' : mode === 'forgot' ? '发送重置邮件' : '设置新密码'}
            </button>
            <div className="flex justify-between text-xs text-ink-3">
              <button className="underline" onClick={() => setMode(mode === 'forgot' ? 'login' : 'forgot')}>
                {mode === 'forgot' ? '返回登录' : '忘记密码？'}
              </button>
              {mode !== 'recovery' && (
                <button className="underline" onClick={() => setMode(mode === 'register' ? 'login' : 'register')}>
                  {mode === 'register' ? '已有账号？去登录' : '没有账号？注册'}
                </button>
              )}
            </div>
          </div>
          <p className="px-1 text-[11px] text-ink-3 leading-relaxed">
            密码由认证服务以安全散列保存，应用与数据库均不接触明文。账单数据在上传前用你的「数据口令」加密，服务商只存密文。
          </p>
        </div>
      )}

      {status === 'signedIn' && (
        <div className="px-3 pt-3 space-y-3">
          <div className="bg-card rounded-2xl p-4">
            <div className="flex items-center gap-3">
              <span className="w-10 h-10 rounded-full bg-fill flex items-center justify-center text-ink-2">
                <Mail size={18} />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{userEmail}</p>
                <p className="text-xs text-ink-3">已登录</p>
              </div>
            </div>
          </div>

          {/* 云端保险库 */}
          <div className="bg-card rounded-2xl p-4 space-y-3">
            <h2 className="text-sm font-medium flex items-center gap-1.5">
              <CloudUpload size={16} className="text-ink-2" /> 云端保险库
            </h2>
            <p className="text-xs text-ink-3 leading-relaxed">
              同步 = 拉取云端 → 与本机按记账时间合并 → 推回，两端数据都不会被覆盖丢失。账单在上传前用下方口令加密（AES-GCM），云端只存密文。
            </p>
            <label className="block">
              <span className="text-xs text-ink-3 mb-1 block">数据口令（加密云端快照；仅保存在本设备，换设备登录后需重新输入）</span>
              <PassInput
                value={vaultPass}
                onChange={setVaultPassState}
                autoComplete="off"
                placeholder="留空则不加密上传（不推荐）"
              />
            </label>
            <button disabled={busy} className="w-full h-10 rounded-xl bg-fill text-sm text-ink-2 flex items-center justify-center gap-2" onClick={() => void savePass()}>
              <ShieldCheck size={15} /> 保存口令
            </button>
            <button disabled={busy || syncing} className="w-full h-11 rounded-xl bg-primary text-on-primary font-medium disabled:opacity-60 flex items-center justify-center gap-2" onClick={() => void doSync()}>
              {syncing ? <Loader2 size={16} className="animate-spin" /> : <CloudUpload size={16} />}
              {syncing ? '同步中…' : '立即同步'}
            </button>
            <p className="text-xs text-ink-3">
              {lastErr ? (
                <span className="text-danger">上次同步失败：{lastErr}</span>
              ) : lastSync ? (
                <>上次同步：{new Date(lastSync).toLocaleString()}</>
              ) : (
                '尚未同步过；记一笔后会自动同步（约 5 秒内）'
              )}
            </p>
          </div>

          <div className="bg-card rounded-2xl divide-y divide-line">
            <button className="w-full flex items-center gap-2 px-4 py-3.5 text-left" onClick={() => void doSignOut()}>
              <LogOut size={18} className="text-ink-3" />
              <span className="flex-1 text-sm">退出登录</span>
            </button>
            <button className="w-full flex items-center gap-2 px-4 py-3.5 text-left" onClick={() => void removeVault()}>
              <Trash2 size={18} className="text-danger" />
              <span className="flex-1 text-sm text-danger">删除云端数据</span>
            </button>
          </div>
          <p className="px-1 pb-2 text-[11px] text-ink-3 leading-relaxed">凭证照片体积较大，暂不参与云端同步（仅保存在本机）。如需迁移请使用 设置 → 数据 的 JSON 导出。</p>
        </div>
      )}
    </SettingsShell>
  );
}

/** 密码输入框：带显示/隐藏切换（注册时方便核对输入是否正确） */
function PassInput({ value, onChange, autoComplete, placeholder }: {
  value: string;
  onChange: (v: string) => void;
  autoComplete: string;
  placeholder?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input
        type={show ? 'text' : 'password'}
        autoComplete={autoComplete}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full h-11 pl-3 pr-11 rounded-xl bg-fill text-ink text-sm outline-none"
      />
      <button
        type="button"
        aria-label={show ? '隐藏密码' : '显示密码'}
        className="absolute right-0 top-0 h-11 px-3 text-ink-3 flex items-center no-callout"
        onClick={() => setShow((v) => !v)}
      >
        {show ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  );
}

function UnconfiguredGuide() {  return (
    <div className="px-3 pt-3">
      <div className="bg-card rounded-2xl p-4 space-y-2">
        <h2 className="text-sm font-medium">账号同步尚未配置</h2>
        <p className="text-xs text-ink-3 leading-relaxed">
          账号模式需要一个 Supabase 项目作为认证与存储后端（免费额度即可）。配置步骤见仓库文档 <code className="bg-fill px-1 rounded">docs/supabase-setup.md</code>：
        </p>
        <ol className="text-xs text-ink-3 leading-relaxed list-decimal pl-4 space-y-1">
          <li>创建 Supabase 项目，在 SQL 编辑器执行文档里的建表 + RLS 语句</li>
          <li>在 项目设置 → API 拿到 URL 与 anon key</li>
          <li>构建时注入 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY（本地 .env 或 GitHub Actions Secrets）</li>
        </ol>
        <p className="text-xs text-ink-3 leading-relaxed">未配置时本页保持隐藏入口，所有数据仍只存在本机，不影响任何现有功能。</p>
      </div>
    </div>
  );
}
