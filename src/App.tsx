import { useEffect } from 'react';
import { HashRouter, Route, Routes } from 'react-router-dom';
import { registerSW } from 'virtual:pwa-register';
import { useData } from './store/data';
import { useSettings } from './store/settings';
import { useUI } from './store/ui';
import { setupAppHeight } from './utils/compat';
import { refreshSyncUI, setupSyncLifecycle } from './sync/manager';
import { ErrorBoundary } from './components/ErrorBoundary';
import { TabBar } from './components/TabBar';
import { Toasts } from './components/Toasts';
import { ConfirmSheet } from './components/ConfirmSheet';
import { EntrySheet } from './features/EntrySheet';
import { DetailPage } from './pages/DetailPage';
import { ChartPage } from './pages/ChartPage';
import { DiscoverPage } from './pages/DiscoverPage';
import { MinePage } from './pages/MinePage';
import { SettingsHome } from './pages/settings/SettingsHome';
import { CategoriesPage } from './pages/settings/CategoriesPage';
import { AccountsPage } from './pages/settings/AccountsPage';
import { LedgersPage } from './pages/settings/LedgersPage';
import { DataPage } from './pages/settings/DataPage';
import { BackupPage } from './pages/settings/BackupPage';
import { AboutPage } from './pages/settings/AboutPage';

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
  const themeColor = useSettings((s) => s.themeColor);
  const updateReady = useUI((s) => s.updateReady);
  const runUpdate = useUI((s) => s.runUpdate);

  useEffect(() => {
    setupAppHeight();
    void useData.getState().init();
    setupSyncLifecycle();
    refreshSyncUI();
    const onVisible = () => {
      if (document.visibilityState === 'visible') void useData.getState().refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  useEffect(() => {
    document.documentElement.style.setProperty('--primary', themeColor);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', themeColor);
  }, [themeColor]);

  if (!ready) {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-primary">
        <div className="w-20 h-20 rounded-3xl bg-white flex items-center justify-center text-4xl font-bold text-gray-900 shadow-lg">
          ¥
        </div>
        <p className="mt-4 text-sm font-medium text-gray-900">鲨鱼记账</p>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <HashRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <div className="relative h-full overflow-hidden">
          {mode !== 'idb' && (
            <div
              className={`fixed top-0 left-0 right-0 z-50 pt-safe px-3 pb-2 text-xs text-center ${
                mode === 'memory' ? 'bg-danger text-white' : 'bg-primary text-gray-900'
              }`}
            >
              {mode === 'memory'
                ? '存储不可用：数据仅保存在内存中，关闭页面即丢失，请导出备份'
                : 'IndexedDB 不可用（可能处于私密模式），已降级为本地存储，建议尽快导出或云备份'}
            </div>
          )}

          {updateReady && (
            <div className="fixed top-0 left-0 right-0 z-50 pt-safe px-3 pb-2 bg-gray-900 text-white text-xs flex items-center justify-between gap-2">
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
              <Route path="/settings/about" element={<AboutPage />} />
              <Route path="*" element={<DetailPage />} />
            </Routes>
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
