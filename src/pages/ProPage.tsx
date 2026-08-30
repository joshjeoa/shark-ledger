import { Crown } from 'lucide-react';
import { SettingsShell } from './settings/SettingsShell';
import { useEntitlement, proOverrideActive } from '../vip/entitlement';
import { PRO_BENEFITS, RedeemForm } from '../vip/ProGate';

/** 鲨鱼 Pro 状态与兑换页（设置页入口；未配置账号体系时不显示入口） */
export function ProPage() {
  const status = useEntitlement((s) => s.status);
  const plan = useEntitlement((s) => s.plan);
  const expiresAt = useEntitlement((s) => s.expiresAt);
  const override = proOverrideActive();

  const statusText =
    override
      ? '测试模式（本地覆盖开关已打开）'
      : status === 'pro'
        ? expiresAt === null
          ? '永久有效'
          : `有效期至 ${new Date(expiresAt).toLocaleDateString()}`
        : status === 'loading'
          ? '查询中…'
          : '未开通';

  return (
    <SettingsShell title="鲨鱼 Pro">
      <div className="px-3 pt-3 space-y-3">
        {/* 权益状态卡 */}
        <div className="rounded-2xl bg-card p-5">
          <div className="flex items-center gap-3">
            <span className="w-12 h-12 rounded-2xl bg-primary text-on-primary flex items-center justify-center">
              <Crown size={24} />
            </span>
            <div>
              <p className="font-semibold">鲨鱼 Pro</p>
              <p className={`text-xs mt-0.5 ${status === 'pro' || override ? 'text-success' : 'text-ink-3'}`}>{statusText}</p>
            </div>
          </div>
          <p className="text-xs text-ink-3 mt-3 leading-relaxed">
            核心记账功能永远免费。Pro 收入用于覆盖云存储与服务器成本，让应用能一直免费更新下去。
          </p>
        </div>

        {/* 权益清单 */}
        <div className="rounded-2xl bg-card p-4">
          <h2 className="text-sm font-medium mb-3">Pro 权益</h2>
          <ul className="space-y-2.5">
            {PRO_BENEFITS.map((b) => (
              <li key={b} className="flex items-center gap-2 text-sm text-ink-2">
                <Crown size={14} className="text-primary shrink-0" />
                {b}
              </li>
            ))}
          </ul>
        </div>

        {/* 兑换 */}
        <div className="rounded-2xl bg-card p-4">
          <h2 className="text-sm font-medium mb-3">兑换码开通 / 续费</h2>
          <RedeemForm />
          <p className="text-xs text-ink-3 mt-3 leading-relaxed">
            通过赞赏/爱发电获得兑换码后在此输入。续费码在未到期时兑换会自动顺延时长；同一账号多设备登录均可用。
          </p>
        </div>
      </div>
    </SettingsShell>
  );
}
