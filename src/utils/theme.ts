import { useEffect, useState } from 'react';
import { useSettings } from '../store/settings';

export type Appearance = 'auto' | 'light' | 'dark';

const mq = typeof window !== 'undefined' ? window.matchMedia('(prefers-color-scheme: dark)') : null;

/** auto 模式下跟随系统；light/dark 强制指定 */
export function resolveTheme(appearance: Appearance): 'light' | 'dark' {
  if (appearance === 'auto') return mq?.matches ? 'dark' : 'light';
  return appearance;
}

/** 应用主题到 <html>：class、过渡动画、meta theme-color（状态栏底色） */
export function applyTheme(appearance: Appearance, themeColor: string): 'light' | 'dark' {
  const resolved = resolveTheme(appearance);
  const root = document.documentElement;

  // 切换瞬间挂全局渐变，350ms 后摘除，避免影响日常交互的即时反馈
  const changed = root.classList.contains('dark') !== (resolved === 'dark');
  if (changed) {
    root.classList.add('theme-anim');
    setTimeout(() => root.classList.remove('theme-anim'), 350);
  }
  root.classList.toggle('dark', resolved === 'dark');

  // 状态栏：浅色 = 品牌 header 色；暗色 = 沉浸 header 底色
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', resolved === 'dark' ? '#1c1c1e' : themeColor);

  return resolved;
}

/** 组件内使用：返回当前生效的主题（auto 跟随系统时实时变化） */
export function useTheme(): 'light' | 'dark' {
  const appearance = useSettings((s) => s.appearance);
  const [resolved, setResolved] = useState<'light' | 'dark'>(() => resolveTheme(appearance));

  useEffect(() => {
    setResolved(resolveTheme(appearance));
    if (!mq || appearance !== 'auto') return;
    const onChange = () => setResolved(resolveTheme('auto'));
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [appearance]);

  return resolved;
}
