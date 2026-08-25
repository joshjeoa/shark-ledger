import { SettingsShell } from './SettingsShell';
import { useUI } from '../../store/ui';

export function AboutPage() {
  const toast = useUI((s) => s.toast);

  const clearCache = async () => {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
      toast('缓存已清除，重新加载后生效');
    } catch {
      toast('当前环境无缓存可清', 'info');
    }
  };

  return (
    <SettingsShell title="关于">
      <div className="px-3 pt-3 space-y-3">
        <div className="bg-white rounded-2xl p-6 text-center">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-primary flex items-center justify-center text-2xl font-bold mb-3">¥</div>
          <h2 className="font-bold">鲨鱼记账 Web</h2>
          <p className="text-xs text-gray-400 mt-1">v1.0.0 · 纯前端 PWA</p>
          <p className="text-xs text-gray-500 mt-4 leading-5">
            轻量、无广告、无会员的个人记账工具。
            <br />
            数据保存在本机浏览器，可导出 CSV / JSON，可加密云备份。
          </p>
        </div>
        <div className="bg-white rounded-2xl">
          <button className="w-full px-4 py-4 text-left text-sm" onClick={() => void clearCache()}>
            清除缓存
          </button>
        </div>
      </div>
    </SettingsShell>
  );
}
