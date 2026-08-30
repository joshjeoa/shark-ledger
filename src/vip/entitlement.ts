/**
 * 鲨鱼 Pro 权益层（方案与 SQL 见 docs/VIP功能方案.md §2）。
 * Pro 判定顺序：
 * 1. 未配置账号体系（自部署）→ 视为 Pro：自部署者即收款运维者，锁自己没有意义；
 * 2. localStorage `shark-pro-override = '1'` → 视为 Pro：开发/自测开关
 *    （公开仓库里客户端锁本就只防君子，留着开关方便自己验证功能）；
 * 3. 已登录 → 以云端 `pro_entitlements.expires_at` 为准（null = 永久；过期 = free）。
 * store 不持久化：每次启动/登录后从云端拉取，本地只做缓存展示。
 */
import { create } from 'zustand';
import { isAccountConfigured, getSharedSupabase, onAuthEvent } from '../sync/account';

const OVERRIDE_KEY = 'shark-pro-override';

export type ProPlan = 'yearly' | 'lifetime';

export interface EntitlementState {
  /** loading=尚未完成首次拉取；pro/free=云端判定结果（或豁免后的 pro） */
  status: 'loading' | 'pro' | 'free';
  plan: ProPlan | null;
  /** 毫秒时间戳；null = 永久有效 */
  expiresAt: number | null;
  setEntitlement: (v: { status: 'loading' | 'pro' | 'free'; plan?: ProPlan | null; expiresAt?: number | null }) => void;
}

export const useEntitlement = create<EntitlementState>((set) => ({
  status: 'loading',
  plan: null,
  expiresAt: null,
  setEntitlement: (v) => set({ status: v.status, plan: v.plan ?? null, expiresAt: v.expiresAt ?? null }),
}));

function overrideActive(): boolean {
  try {
    return localStorage.getItem(OVERRIDE_KEY) === '1';
  } catch {
    return false;
  }
}

/** React 组件用：当前是否为 Pro（会话级豁免/开关不参与订阅，变化需刷新页面） */
export function usePro(): boolean {
  const status = useEntitlement((s) => s.status);
  if (!isAccountConfigured() || overrideActive()) return true;
  return status === 'pro';
}

/** 非 React 场景用（如同步钩子里判断是否自动上传照片） */
export function isProNow(): boolean {
  if (!isAccountConfigured() || overrideActive()) return true;
  return useEntitlement.getState().status === 'pro';
}

export function proOverrideActive(): boolean {
  return isAccountConfigured() && overrideActive();
}

/** 启动/登录后拉取云端权益；未登录 → free。表不存在（没跑 SQL）时按 free 处理，不报错 */
export async function refreshEntitlement(): Promise<void> {
  if (!isAccountConfigured()) {
    useEntitlement.getState().setEntitlement({ status: 'pro' });
    return;
  }
  if (overrideActive()) {
    useEntitlement.getState().setEntitlement({ status: 'pro' });
    return;
  }
  try {
    const sb = await getSharedSupabase();
    const {
      data: { session },
    } = await sb.auth.getSession();
    if (!session) {
      useEntitlement.getState().setEntitlement({ status: 'free' });
      return;
    }
    const { data, error } = await sb
      .from('pro_entitlements')
      .select('plan,expires_at')
      .eq('user_id', session.user.id)
      .maybeSingle<{ plan: ProPlan; expires_at: string | null }>();
    if (error || !data) {
      useEntitlement.getState().setEntitlement({ status: 'free' });
      return;
    }
    const exp = data.expires_at ? new Date(data.expires_at).getTime() : null;
    const active = exp === null || exp > Date.now();
    useEntitlement.getState().setEntitlement({ status: active ? 'pro' : 'free', plan: data.plan, expiresAt: exp });
  } catch {
    useEntitlement.getState().setEntitlement({ status: 'free' });
  }
}

/** 兑换码错误 → 用户可读中文（SECURITY DEFINER 函数 raise 的消息会原样透传） */
function redeemErrorMessage(msg: string): string {
  if (msg.includes('兑换码不存在') || msg.includes('兑换码已被使用') || msg.includes('未登录')) return msg;
  if (msg.includes('Failed to fetch') || msg.includes('NetworkError')) return '网络连接失败，请检查网络';
  if (msg.includes('schema cache') || msg.includes('Could not find the function')) return '兑换服务未启用：请服务方在 Supabase 执行 VIP 方案 §2.1 的 SQL';
  return `兑换失败：${msg}`;
}

/** 输入兑换码开通/续费，成功后刷新本地权益 */
export async function redeemCode(rawCode: string): Promise<{ expiresAt: number | null }> {
  const code = rawCode.trim().toUpperCase();
  if (!code) throw new Error('请输入兑换码');
  if (!isAccountConfigured()) throw new Error('未配置账号体系，无需兑换');
  const sb = await getSharedSupabase();
  const {
    data: { session },
  } = await sb.auth.getSession();
  if (!session) throw new Error('请先在「账号与云同步」中登录');
  const { data, error } = await sb.rpc('redeem_license', { p_code: code });
  if (error) throw new Error(redeemErrorMessage(error.message));
  await refreshEntitlement();
  const exp = typeof data === 'string' ? new Date(data).getTime() : null;
  return { expiresAt: exp };
}

let wired = false;

/** App 启动时调用（懒加载进入本模块）：首拉权益 + 订阅登录事件 */
export function setupEntitlementLifecycle(): void {
  if (!isAccountConfigured() || wired) return;
  wired = true;
  void refreshEntitlement();
  onAuthEvent({
    onSignedIn: () => void refreshEntitlement(),
    onSignedOut: () => useEntitlement.getState().setEntitlement({ status: 'free' }),
    onPasswordRecovery: () => {},
  });
}
