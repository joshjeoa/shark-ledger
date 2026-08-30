/**
 * Pro 功能拦截与升级面板（方案见 docs/VIP功能方案.md §2.2）。
 * ProGateButton：Pro 用户点击直接执行；免费用户弹出升级面板（卖点 + 兑换码）。
 * 升级面板不做任何"锁"——它就是普通的说明 + 兑换入口。
 */
import { memo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, Crown, Loader2 } from 'lucide-react';
import { Sheet } from '../components/Sheet';
import { useEntitlement, redeemCode, usePro } from './entitlement';
import { useUI } from '../store/ui';

/** 升级面板里展示的权益清单 */
export const PRO_BENEFITS = ['凭证照片云同步（跨设备不丢）', '年度账单报告 + 分享卡片', '无限账本', '后续 AI 分析等功能优先体验'];

/** 兑换码输入（升级面板与 Pro 页共用） */
export const RedeemForm = memo(function RedeemForm({ onDone }: { onDone?: () => void }) {
  const toast = useUI((s) => s.toast);
  const refreshStatus = useEntitlement((s) => s.status);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const submit = async () => {
    if (busy) return;
    setBusy(true);
    setMsg('');
    try {
      await redeemCode(code);
      toast('兑换成功，欢迎成为鲨鱼 Pro');
      setCode('');
      onDone?.();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : '兑换失败');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div>
      <div className="flex gap-2 mb-2">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="输入兑换码"
          autoCapitalize="characters"
          className="flex-1 h-11 px-4 rounded-xl bg-fill text-ink text-base outline-none placeholder:text-ink-3"
        />
        <button
          disabled={busy || !code.trim()}
          className={`h-11 px-5 rounded-xl font-medium text-sm flex items-center gap-1.5 ${code.trim() && !busy ? 'bg-primary text-on-primary' : 'bg-fill text-ink-3'}`}
          onClick={() => void submit()}
        >
          {busy && <Loader2 size={14} className="animate-spin" />}
          兑换
        </button>
      </div>
      {msg && <p className="text-xs text-danger mb-2">{msg}</p>}
      {refreshStatus === 'pro' && <p className="text-xs text-success">已开通 ✓</p>}
    </div>
  );
});

/** 升级面板：functional feature 标题 + 权益清单 + 兑换入口 */
export function UpgradeSheet({ open, onClose, feature }: { open: boolean; onClose: () => void; feature: string }) {
  const navigate = useNavigate();
  const status = useEntitlement((s) => s.status);
  const expiresAt = useEntitlement((s) => s.expiresAt);
  return (
    <Sheet open={open} onClose={onClose} title="升级鲨鱼 Pro">
      <div className="px-4 pb-6">
        <div className="rounded-xl bg-fill p-4 mb-4 flex items-start gap-3">
          <span className="w-10 h-10 rounded-full bg-primary text-on-primary flex items-center justify-center shrink-0">
            <Crown size={20} />
          </span>
          <div>
            <p className="text-sm font-medium">{feature} 是 Pro 功能</p>
            <p className="text-xs text-ink-3 mt-1">核心记账功能永远免费，Pro 只做加法。</p>
          </div>
        </div>
        <ul className="space-y-2 mb-4">
          {PRO_BENEFITS.map((b) => (
            <li key={b} className="flex items-center gap-2 text-sm text-ink-2">
              <Check size={15} className="text-success shrink-0" />
              {b}
            </li>
          ))}
        </ul>
        {status === 'free' && (
          <p className="text-xs text-ink-3 mb-3">
            还没有开通？先在「
            <button className="text-primary underline" onClick={() => { onClose(); navigate('/settings/account'); }}>
              账号与云同步
            </button>
            」注册/登录，再输入兑换码即可。
          </p>
        )}
        {status === 'pro' && expiresAt && <p className="text-xs text-ink-3 mb-3">当前有效期至 {new Date(expiresAt).toLocaleDateString()}</p>}
        <RedeemForm onDone={onClose} />
      </div>
    </Sheet>
  );
}

/** Pro 功能拦截按钮：pro 直接执行 onClick；免费弹出升级面板 */
export function ProGateButton({
  feature,
  onProceed,
  children,
  className,
  ariaLabel,
}: {
  feature: string;
  onProceed: () => void;
  children: React.ReactNode;
  className?: string;
  ariaLabel?: string;
}) {
  const pro = usePro();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        aria-label={ariaLabel}
        className={className}
        onClick={() => {
          if (pro) onProceed();
          else setOpen(true);
        }}
      >
        {children}
      </button>
      <UpgradeSheet open={open} onClose={() => setOpen(false)} feature={feature} />
    </>
  );
}
