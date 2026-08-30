import { NavLink, useLocation } from 'react-router-dom';
import { List, LineChart, Globe2, UserRound, Plus } from 'lucide-react';
import { useUI } from '../store/ui';

const tabs = [
  { to: '/', label: '明细', icon: List },
  { to: '/chart', label: '图表', icon: LineChart },
  { to: '/discover', label: '发现', icon: Globe2 },
  { to: '/mine', label: '我的', icon: UserRound },
];

export function TabBar() {
  const openEntry = useUI((s) => s.openEntry);
  const location = useLocation();
  if (location.pathname.startsWith('/settings')) return null;
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-30" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
      {/* FAB 必须是玻璃栏的兄弟节点而非子元素：backdrop-filter 容器会把带 transform 的合成子元素
          裁进自己的圆角盒——上探出栏体的 FAB 上半截/加号图标偶发缺失的根源（无 overflow-hidden 也裁）。
          独立定位后不再受磨砂层光栅化影响，按压动画也不触发玻璃栏重绘 */}
      <button
        aria-label="记一笔"
        className="tab-fab z-10 absolute left-1/2 -ml-7 w-14 h-14 rounded-full text-on-primary flex items-center justify-center active:scale-95 transition-transform"
        style={{ bottom: 'calc(env(safe-area-inset-bottom) + 40px)' }}
        onClick={() => openEntry(null)}
      >
        <Plus size={28} strokeWidth={2.4} />
      </button>
      {/* 悬浮玻璃栏：脱离屏幕边缘 + 磨砂 + 景深，替代传统通栏 TabBar */}
      <div className="mx-3 mb-3 rounded-2xl bg-card-glass backdrop-blur-xl border border-line shadow-lg">
        <div className="grid grid-cols-5 h-14 items-center">
          {tabs.slice(0, 2).map((t) => (
            <TabItem key={t.to} {...t} />
          ))}
          {/* 中列为 FAB 占位（FAB 已提升为玻璃栏的兄弟图层），保持不可点的空位 */}
          <div aria-hidden />
          {tabs.slice(2).map((t) => (
            <TabItem key={t.to} {...t} />
          ))}
        </div>
      </div>
    </nav>
  );
}

function TabItem({ to, label, icon: Icon }: { to: string; label: string; icon: typeof List }) {
  return (
    <NavLink to={to} end={to === '/'} className="flex flex-col items-center justify-center gap-0.5 h-full">
      {({ isActive }) => (
        <>
          <Icon size={22} strokeWidth={isActive ? 2.4 : 1.8} className={isActive ? 'text-ink' : 'text-ink-3'} />
          <span className={`text-[11px] ${isActive ? 'text-ink font-medium' : 'text-ink-3'}`}>{label}</span>
        </>
      )}
    </NavLink>
  );
}
