import { useMemo, useState } from 'react';
import { ChevronRight, Settings, Share, Info } from 'lucide-react';
import { useData } from '../store/data';
import { useSettings } from '../store/settings';
import { dayKey } from '../utils/date';
import { isIOS, isStandalone } from '../utils/compat';
import { Sheet } from '../components/Sheet';
import { useNavigate } from 'react-router-dom';

export function MinePage() {
  const bills = useData((s) => s.bills);
  const nickname = useSettings((s) => s.nickname);
  const setSettings = useSettings((s) => s.set);
  const navigate = useNavigate();
  const [guideOpen, setGuideOpen] = useState(false);

  const stats = useMemo(() => {
    const active = bills.filter((b) => !b.deletedAt);
    const days = new Set(active.map((b) => dayKey(b.occurredAt))).size;
    return { days, count: active.length };
  }, [bills]);

  return (
    <div className="h-full overflow-auto bg-surface pb-28">
      <header className="bg-header pt-safe">
        <div className="px-4 pt-6 pb-8">
          <div className="flex items-center gap-3">
            <span className="w-14 h-14 rounded-full bg-header-fill text-header-fill-ink flex items-center justify-center text-xl font-bold">
              {nickname.slice(0, 1) || '我'}
            </span>
            <span className="text-xl font-bold">{nickname}</span>
          </div>
          <div className="grid grid-cols-2 text-center mt-6">
            <span>
              <b className="text-2xl">{stats.days}</b>
              <p className="text-xs mt-1">记账总天数</p>
            </span>
            <span>
              <b className="text-2xl">{stats.count}</b>
              <p className="text-xs mt-1">记账总笔数</p>
            </span>
          </div>
        </div>
      </header>

      <div className="px-3 -mt-3 space-y-3">
        <div className="bg-card rounded-2xl divide-y divide-line">
          <Row icon={<Settings size={20} />} label="设置" onClick={() => navigate('/settings')} />
          <Row
            icon={<Share size={20} />}
            label="添加到主屏幕"
            onClick={() => {
              if (isStandalone()) return;
              setGuideOpen(true);
              setSettings({ guideSeen: true });
            }}
          />
          <Row icon={<Info size={20} />} label="关于" onClick={() => navigate('/settings/about')} />
        </div>
      </div>

      <Sheet open={guideOpen} onClose={() => setGuideOpen(false)} title="添加到主屏幕">
        <div className="px-4 pb-6 text-sm text-ink-2 space-y-2">
          {isIOS ? (
            <>
              <p>1. 点击 Safari 底部的「分享」按钮</p>
              <p>2. 向下滑动，选择「添加到主屏幕」</p>
              <p>3. 点击右上角「添加」，即可像原生 App 一样打开</p>
            </>
          ) : (
            <>
              <p>1. 点击浏览器菜单</p>
              <p>2. 选择「添加到主屏幕」/「安装应用」</p>
            </>
          )}
          <p className="text-xs text-ink-3 pt-2">安装后离线也可正常使用，数据保存在本机。</p>
        </div>
      </Sheet>
    </div>
  );
}

function Row({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button className="w-full flex items-center gap-3 px-4 py-4 text-left" onClick={onClick}>
      <span className="text-ink-2">{icon}</span>
      <span className="flex-1 text-sm">{label}</span>
      <ChevronRight size={16} className="text-ink-3" />
    </button>
  );
}
