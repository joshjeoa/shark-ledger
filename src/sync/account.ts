/**
 * 账号与云同步（Supabase）：邮箱+密码认证走服务端 GoTrue，数据隔离靠数据库 RLS（行级安全）。
 * 设计原则（与现有 Gist/WebDAV 备份一致）：
 * - 本地数据始终是第一优先，云端只是加密快照的镜像；
 * - 同步 = 拉取 → 按 id/updatedAt 合并 → 推回，永不静默销毁任一端数据；
 * - 口令加密（PBKDF2 60万轮 + AES-GCM）在客户端完成，服务商存储的是密文（零信任）。
 * 未配置 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY 时本模块整体休眠，相关 UI 隐藏。
 */
import type { Session } from '@supabase/supabase-js';
import { repo } from '../db/repo';
import type { BackupFile, FullDump } from '../types';
import { validateDump, mergeDumps } from '../utils/merge';
import { decryptJSON, encryptJSON } from './crypto';

const VAULT_TABLE = 'vaults';
const VAULT_PASS_KEY = 'shark-vault-pass';
const LAST_VAULT_SYNC_KEY = 'lastVaultSyncAt';
const LAST_VAULT_ERROR_KEY = 'lastVaultError';

const env = import.meta.env as { VITE_SUPABASE_URL?: string; VITE_SUPABASE_ANON_KEY?: string };
const SUPABASE_URL = env.VITE_SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = env.VITE_SUPABASE_ANON_KEY ?? '';

/** 功能开关：两个环境变量都配置后才启用（构建期注入，不进主包逻辑） */
export function isAccountConfigured(): boolean {
  return SUPABASE_URL.startsWith('https://') && SUPABASE_ANON_KEY.length > 20;
}

type SupabaseClient = import('@supabase/supabase-js').SupabaseClient;
let clientPromise: Promise<SupabaseClient> | null = null;

/** 懒加载 supabase-js（独立 chunk，不用账号功能的用户不下载这段代码） */
function getSupabase(): Promise<SupabaseClient> {
  if (!clientPromise) {
    clientPromise = import('@supabase/supabase-js').then(({ createClient }) =>
      createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: {
          persistSession: true, // 会话持久化（localStorage），刷新/重开仍保持登录
          autoRefreshToken: true, // token 过期前自动刷新
          detectSessionInUrl: true, // 邮件确认/找回密码链接带回的 token 自动建会话
        },
      }),
    );
  }
  return clientPromise;
}

// ---------- 认证 ----------

/** 认证错误 → 用户可读的中文提示（不泄露"邮箱是否存在"以外的服务端细节） */
export function authErrorMessage(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  const m = msg.toLowerCase();
  if (m.includes('invalid login credentials')) return '邮箱或密码错误';
  if (m.includes('user already registered')) return '该邮箱已注册，请直接登录';
  if (m.includes('email not confirmed')) return '请先打开邮箱里的确认链接，再回来登录';
  if (m.includes('rate limit')) return '操作太频繁，请稍后再试';
  if (m.includes('password should be at least')) return msg.match(/at least (\d+)/)?.[1] ? `密码至少 ${msg.match(/at least (\d+)/)![1]} 位` : '密码强度不足';
  if (m.includes('failed to fetch') || m.includes('networkerror') || m.includes('load failed')) return '网络连接失败，请检查网络';
  if (m.includes('unable to validate email') || m.includes('invalid email')) return '邮箱格式不正确';
  if (m.includes('signups not allowed')) return '当前未开放注册，请联系服务配置方';
  return `操作失败：${msg}`;
}

export async function signIn(email: string, password: string): Promise<void> {
  const sb = await getSupabase();
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw new Error(authErrorMessage(error));
}

/** 注册：默认需要邮箱确认（Supabase Auth 默认策略），成功后提示查收邮件 */
export async function signUp(email: string, password: string): Promise<{ needConfirm: boolean }> {
  const sb = await getSupabase();
  const { data, error } = await sb.auth.signUp({ email, password });
  if (error) throw new Error(authErrorMessage(error));
  return { needConfirm: !data.session }; // 项目开启邮箱确认时无即时会话
}

export async function sendResetEmail(email: string): Promise<void> {
  const sb = await getSupabase();
  const { error } = await sb.auth.resetPasswordForEmail(email, {
    redirectTo: `${location.origin}${location.pathname}`,
  });
  if (error) throw new Error(authErrorMessage(error));
}

/** 通过找回密码链接回来后设置新密码（会话为 PASSWORD_RECOVERY 类型） */
export async function updatePassword(password: string): Promise<void> {
  const sb = await getSupabase();
  const { error } = await sb.auth.updateUser({ password });
  if (error) throw new Error(authErrorMessage(error));
}

export async function signOut(): Promise<void> {
  const sb = await getSupabase();
  const { error } = await sb.auth.signOut();
  if (error) throw new Error(authErrorMessage(error));
}

export async function getSession(): Promise<Session | null> {
  if (!isAccountConfigured()) return null;
  const sb = await getSupabase();
  const { data } = await sb.auth.getSession();
  return data.session;
}

/** 注册登录事件监听（页面调用一次）：登录成功即触发一次云端合并同步 */
export function onAuthEvent(handlers: {
  onSignedIn: (session: Session) => void;
  onSignedOut: () => void;
  onPasswordRecovery: () => void;
}): () => void {
  let unsubscribe: (() => void) | null = null;
  void getSupabase().then((sb) => {
    const { data } = sb.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session) handlers.onSignedIn(session);
      else if (event === 'SIGNED_OUT') handlers.onSignedOut();
      else if (event === 'PASSWORD_RECOVERY') handlers.onPasswordRecovery();
    });
    unsubscribe = () => data.subscription.unsubscribe();
  });
  return () => unsubscribe?.();
}

// ---------- 数据口令（设备本地保存；换设备需重新输入） ----------

export function getVaultPass(): string {
  try {
    return localStorage.getItem(VAULT_PASS_KEY) ?? '';
  } catch {
    return '';
  }
}

export function setVaultPass(pass: string): void {
  try {
    if (pass) localStorage.setItem(VAULT_PASS_KEY, pass);
    else localStorage.removeItem(VAULT_PASS_KEY);
  } catch {
    /* 隐私模式等场景忽略 */
  }
}

// ---------- 云端保险库（vaults 表，RLS 限制只能读写自己的行） ----------

interface VaultRow {
  user_id: string;
  cipher: string;
  updated_at: string;
  app_version: string | null;
}

export interface VaultSyncResult {
  pulled: boolean; // 云端是否有快照被合并/采用
  pushed: boolean;
  billCount: number;
}

let vaultSyncing = false;
let vaultPending = false;
let vaultTimer: ReturnType<typeof setTimeout> | undefined;

/** 写操作后 5s 防抖自动推送到云端保险库（未登录/未配置时静默跳过） */
export function scheduleVaultSync(): void {
  if (!isAccountConfigured()) return;
  clearTimeout(vaultTimer);
  vaultTimer = setTimeout(() => void syncVault(), 5000);
}

/** 立即同步（登录后初始化 / 手动按钮 / 回到前台补跑）。并发互斥：迟到触发补跑一次 */
export async function syncVault(): Promise<VaultSyncResult> {
  if (!isAccountConfigured()) throw new Error('账号同步未配置');
  if (vaultSyncing) {
    vaultPending = true;
    return { pulled: false, pushed: false, billCount: 0 };
  }
  vaultSyncing = true;
  try {
    const result = await doVaultSync();
    repo.setMeta(LAST_VAULT_SYNC_KEY, Date.now());
    repo.setMeta(LAST_VAULT_ERROR_KEY, null);
    return result;
  } catch (e) {
    const msg = e instanceof Error ? e.message : '同步失败';
    repo.setMeta(LAST_VAULT_ERROR_KEY, msg);
    throw e;
  } finally {
    vaultSyncing = false;
    if (vaultPending) {
      vaultPending = false;
      void syncVault();
    }
  }
}

async function doVaultSync(): Promise<VaultSyncResult> {
  const sb = await getSupabase();
  const {
    data: { session },
  } = await sb.auth.getSession();
  if (!session) throw new Error('未登录');

  // 1) 拉取云端快照
  const { data: row, error: readErr } = await sb.from(VAULT_TABLE).select('cipher,updated_at,app_version').eq('user_id', session.user.id).maybeSingle<VaultRow>();
  if (readErr) throw new Error(`读取云端数据失败：${readErr.message}`);

  const local = repo.fullDump();
  if (!row) {
    // 2a) 云端为空：直接首推本地
    await pushVault(sb, session.user.id, local);
    return { pulled: false, pushed: true, billCount: local.data.bills.length };
  }

  // 2b) 云端有快照：解析 → （解密）→ 校验
  let file: BackupFile;
  try {
    file = JSON.parse(row.cipher) as BackupFile;
  } catch {
    throw new Error('云端快照格式损坏（JSON 解析失败）');
  }
  if (file.v !== 1) throw new Error(`云端快照版本不支持（v${String(file.v)}）`);
  let cloudData: FullDump['data'];
  if (file.enc) {
    const pass = getVaultPass();
    if (!pass) throw new Error('云端数据已加密，请先在下方输入数据口令');
    const payload = await decryptJSON<{ meta: unknown; data: FullDump['data'] }>(file, pass);
    const checked = validateDump(payload.data);
    if (!checked.ok || !checked.dump) throw new Error(`云端快照校验失败：${checked.errors[0] ?? '未知'}`);
    cloudData = checked.dump;
  } else {
    const checked = validateDump((file as { data: FullDump['data'] }).data);
    if (!checked.ok || !checked.dump) throw new Error(`云端快照校验失败：${checked.errors[0] ?? '未知'}`);
    cloudData = checked.dump;
  }

  // 3) 合并策略：
  //    本地是全新安装（一笔账都没有）→ 整体采用云端，避免种子分类与云端并存产生重复；
  //    否则按 id 并集、同 id 取 updatedAt 大者合并，两端数据都不丢
  let mergedData: FullDump['data'];
  if (local.data.bills.length === 0) {
    mergedData = cloudData;
  } else {
    mergedData = mergeDumps(local.data, cloudData);
  }
  if (mergedData !== local.data) {
    await repo.replaceAll(mergedData, 'overwrite');
  }

  // 4) 推回合并结果（双方都拿到最新的并集）
  const mergedDump = repo.fullDump();
  await pushVault(sb, session.user.id, mergedDump);
  return { pulled: true, pushed: true, billCount: mergedDump.data.bills.length };
}

async function pushVault(sb: SupabaseClient, userId: string, dump: FullDump): Promise<void> {
  const pass = getVaultPass();
  const meta = { ...dump.meta, deviceId: deviceIdOf() };
  const file: BackupFile = pass
    ? { v: 1, enc: true, ...(await encryptJSON({ meta, data: dump.data }, pass)) }
    : { v: 1, enc: false, meta, data: dump.data };
  const { error } = await sb.from(VAULT_TABLE).upsert({
    user_id: userId,
    cipher: JSON.stringify(file),
    updated_at: new Date().toISOString(),
    app_version: __APP_VERSION__,
  });
  if (error) throw new Error(`上传云端失败：${error.message}`);
}

function deviceIdOf(): string {
  let id = repo.getMeta<string>('deviceId');
  if (!id) {
    id = crypto.randomUUID();
    void repo.setMeta('deviceId', id);
  }
  return id;
}

/** 清除云端快照（账号页"删除云端数据"按钮，本地数据不受影响） */
export async function deleteVault(): Promise<void> {
  const sb = await getSupabase();
  const {
    data: { session },
  } = await sb.auth.getSession();
  if (!session) throw new Error('未登录');
  const { error } = await sb.from(VAULT_TABLE).delete().eq('user_id', session.user.id);
  if (error) throw new Error(`删除云端数据失败：${error.message}`);
  repo.setMeta(LAST_VAULT_SYNC_KEY, null);
  repo.setMeta(LAST_VAULT_ERROR_KEY, null);
}

// ---------- 状态查询（账号页展示） ----------

export function lastVaultSyncAt(): number | null {
  return repo.getMeta<number>(LAST_VAULT_SYNC_KEY) ?? null;
}

export function lastVaultError(): string | null {
  return repo.getMeta<string>(LAST_VAULT_ERROR_KEY) ?? null;
}

/** 应用启动时调用：注册登录事件（登录后自动同步一次）与网络恢复补跑 */
export function setupAccountLifecycle(): void {
  if (!isAccountConfigured()) return;
  onAuthEvent({
    onSignedIn: () => void syncVault().catch(() => {/* 错误已记入 meta，账号页展示 */}),
    onSignedOut: () => {},
    onPasswordRecovery: () => {},
  });
  window.addEventListener('online', () => void syncVault().catch(() => {}));
}
