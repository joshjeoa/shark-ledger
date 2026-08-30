import { lazy, Suspense, useEffect, useRef } from 'react';
import { HashRouter, Route, Routes } from 'react-router-dom';
import { registerSW } from 'virtual:pwa-register';
import { useData } from './store/data';
import { useSettings } from './store/settings';
import { useUI } from './store/ui';
import { setupAppHeight } from './utils/compat';
import { applyTheme } from './utils/theme';
import { refreshSyncUI, setupSyncLifecycle } from './sync/manager';
import { ErrorBoundary } from './components/ErrorBoundary';
import { TabBar } from './components/TabBar';
import { Toasts } from './components/Toasts';
import { ConfirmSheet } from './components/ConfirmSheet';
import { EntrySheet } from './features/EntrySheet';
import { DetailPage } from './pages/DetailPage';
import { PageSkeleton } from './components/PageSkeleton';

// 非首屏路由懒加载：主包只含明细页，图表/发现/设置等按需拉取
const ChartPage = lazy(() => import('./pages/ChartPage').then((m) => ({ default: m.ChartPage })));
const DiscoverPage = lazy(() => import('./pages/DiscoverPage').then((m) => ({ default: m.DiscoverPage })));
const MinePage = lazy(() => import('./pages/MinePage').then((m) => ({ default: m.MinePage })));
const SettingsHome = lazy(() => import('./pages/settings/SettingsHome').then((m) => ({ default: m.SettingsHome })));
const CategoriesPage = lazy(() => import('./pages/settings/CategoriesPage').then((m) => ({ default: m.CategoriesPage })));
const AccountsPage = lazy(() => import('./pages/settings/AccountsPage').then((m) => ({ default: m.AccountsPage })));
const LedgersPage = lazy(() => import('./pages/settings/LedgersPage').then((m) => ({ default: m.LedgersPage })));
const DataPage = lazy(() => import('./pages/settings/DataPage').then((m) => ({ default: m.DataPage })));
const BackupPage = lazy(() => import('./pages/settings/BackupPage').then((m) => ({ default: m.BackupPage })));
const AccountPage = lazy(() => import('./pages/settings/AccountPage').then((m) => ({ default: m.AccountPage })));
const AboutPage = lazy(() => import('./pages/settings/AboutPage').then((m) => ({ default: m.AboutPage })));
const ReportPage = lazy(() => import('./pages/ReportPage').then((m) => ({ default: m.ReportPage })));

/** PWA 更新提示：SW 检测到新版本时弹横幅，用户确认后刷新 */
try {
  let updateFn: (reloadPage?: boolean) => Promise<void>;
  updateFn = registerSW({
    onNeedRefresh() {
      useUI.getState().setUpdateReady(true, () => void updateFn(true));
    },
    onOfflineReady() {
      /* 静默：首次缓存完成即可离线使用 */
    },
  });
} catch {
  /* Service Worker 不可用（如 file:// 或旧浏览器）时忽略 */
}

export default function App() {
  const ready = useData((s) => s.ready);
  const mode = useData((s) => s.mode);
  const writeFailed = useData((s) => s.writeFailed);
  const themeColor = useSettings((s) => s.themeColor);
  const appearance = useSettings((s) => s.appearance);
  const updateReady = useUI((s) => s.updateReady);
  const runUpdate = useUI((s) => s.runUpdate);

  const lastVisibleRefresh = useRef(0);
  useEffect(() => {
    setupAppHeight();
    void useData.getState().init();
    setupSyncLifecycle();
    // 账号同步生命周期（登录事件/网络恢复补跑）按需加载：未配置 Supabase 时不进主包
    void import('./sync/account').then((m) => m.setupAccountLifecycle());
    // 照片云自动上传：保险库同步成功后防抖执行（登录态下才实际运行）
    window.addEventListener('vault-synced', () => {
      void import('./vip/photoCloud').then((m) => m.schedulePhotoCloudSync());
    });
    refreshSyncUI();
    // 空闲预取 TabBar 三个懒加载页面的 chunk：冷启动后首次切换不再闪骨架屏
    // （每个 chunk 仅几 KB；图表库 208KB 仍保持按需加载，不影响首装体积策略）
    const idle = typeof window.requestIdleCallback === 'function' ? window.requestIdleCallback.bind(window) : (cb: () => void) => window.setTimeout(cb, 2200);
    idle(() => {
      void import('./pages/ChartPage');
      void import('./pages/DiscoverPage');
      void import('./pages/MinePage');
    });
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      const now = Date.now();
      if (now - lastVisibleRefresh.current < 5000) return; // 节流：防频繁切后台触发全量重载
      lastVisibleRefresh.current = now;
      void useData.getState().refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  // 主题：品牌色仍写入 --primary（供按钮/图表取用），外观决定整体明暗
  useEffect(() => {
    document.documentElement.style.setProperty('--primary', themeColor);
    applyTheme(appearance);
  }, [themeColor, appearance]);

  // auto 模式下系统明暗变化时实时跟进
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => applyTheme(useSettings.getState().appearance);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  if (!ready) {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-header">
        <div className="w-20 h-20 rounded-3xl bg-card flex items-center justify-center text-4xl font-bold text-ink shadow-lg">
          ¥
        </div>
        <p className="mt-4 text-sm font-medium text-header-ink">鲨鱼记账</p>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <HashRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <div className="relative h-full overflow-hidden">
          {writeFailed ? (
            <div className="fixed top-0 left-0 right-0 z-50 pt-safe px-3 pb-2 text-xs text-center bg-danger text-white">
              数据保存失败（存储空间不足或已损坏）：新记录可能未持久化，请立即导出备份
            </div>
          ) : mode !== 'idb' ? (
            <div
              className={`fixed top-0 left-0 right-0 z-50 pt-safe px-3 pb-2 text-xs text-center ${
                mode === 'memory' ? 'bg-danger text-white' : 'bg-primary text-on-primary'
              }`}
            >
              {mode === 'memory'
                ? '存储不可用：数据仅保存在内存中，关闭页面即丢失，请导出备份'
                : 'IndexedDB 不可用（可能处于私密模式），已降级为本地存储，建议尽快导出或云备份'}
            </div>
          ) : null}

          {updateReady && (
            <div className="fixed top-0 left-0 right-0 z-50 pt-safe px-3 pb-2 bg-toast-bg text-toast-ink text-xs flex items-center justify-between gap-2">
              <span>检测到新版本可用</span>
              <div className="flex gap-3">
                <button className="font-medium underline" onClick={() => runUpdate?.()}>
                  立即更新
                </button>
                <button onClick={() => useUI.getState().setUpdateReady(false)}>稍后</button>
              </div>
            </div>
          )}

          <div className="h-full overflow-y-auto hide-scrollbar">
            <Suspense fallback={<PageSkeleton />}>
              <Routes>
              <Route path="/" element={<DetailPage />} />
              <Route path="/chart" element={<ChartPage />} />
              <Route path="/discover" element={<DiscoverPage />} />
              <Route path="/mine" element={<MinePage />} />
              <Route path="/settings" element={<SettingsHome />} />
              <Route path="/settings/categories" element={<CategoriesPage />} />
              <Route path="/settings/accounts" element={<AccountsPage />} />
              <Route path="/settings/ledgers" element={<LedgersPage />} />
              <Route path="/settings/data" element={<DataPage />} />
              <Route path="/settings/backup" element={<BackupPage />} />
              <Route path="/settings/account" element={<AccountPage />} />
              <Route path="/settings/about" element={<AboutPage />} />
              <Route path="/report" element={<ReportPage />} />
              <Route path="*" element={<DetailPage />} />
              </Routes>
            </Suspense>
          </div>

          <TabBar />
          <EntrySheet />
          <ConfirmSheet />
          <Toasts />
        </div>
      </HashRouter>
    </ErrorBoundary>
  );
}
