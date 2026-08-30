/**
 * 鲨鱼 Pro 权益（当前策略：买断制 ¥6 一次性解锁，开发阶段全量开放）。
 *
 * 产品决策（2026-08-30）：不做订阅、不做兑换码门槛——所有功能开箱即用；
 * 未来上架 iOS App Store 时按「一次性内购（非消耗型 IAP）」解锁全部功能，
 * 届时只需把 isProNow()/usePro() 改为查询内购收据结果，界面层零改动。
 *
 * 历史说明：兑换码体系（licenses 表 + redeem_license RPC，见 docs/VIP功能方案.md）
 * 已在 Supabase 部署但前端停用，保留作为非商店渠道的备用发放方式。
 */

/** 非 React 场景（如照片云自动上传）判断 Pro —— 当前恒为 true */
export function isProNow(): boolean {
  return true;
}

/** React 组件判断 Pro —— 当前恒为 true（保留调用点，未来接内购时只需改这里） */
export function usePro(): boolean {
  return true;
}

/** 兼容占位：原权益生命周期（未来接 App Store 内购时在此初始化） */
export function setupEntitlementLifecycle(): void {}
