import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { X } from 'lucide-react';

/** 入场动画时长（.sheet-up 0.25s）。冷却期略长于动画，覆盖慢设备掉帧尾巴 */
const ENTER_MS = 300;
/** 关闭后的误触屏蔽窗口：吞掉关闭瞬间落在下层页面的连点/余触 */
const SHIELD_MS = 280;

export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title?: string; children: ReactNode }) {
  const panelRef = useRef<HTMLDivElement>(null);
  const prevFocus = useRef<HTMLElement | null>(null);
  // onClose 常由父组件内联传入，用 ref 持有以避免焦点管理 effect 随父组件重渲反复重跑
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  // iOS 键盘悬浮覆盖底部：自己把面板抬到键盘上方，输入框保持可见，
  // iOS 就不会平移整个视口（平移 + 滚动回锁的对抗正是弹出键盘时的闪烁来源）
  const [kbOffset, setKbOffset] = useState(0);
  useEffect(() => {
    if (!open) {
      setKbOffset(0);
      return;
    }
    const vv = window.visualViewport;
    if (!vv) return;
    const onResize = () => {
      const kb = window.innerHeight - vv.height;
      // 阈值防误判：工具栏收展等小幅高度变化（~60px）不当成键盘
      setKbOffset(kb > 120 ? kb : 0);
    };
    onResize();
    vv.addEventListener('resize', onResize);
    return () => vv.removeEventListener('resize', onResize);
  }, [open]);

  // 打开时聚焦面板、关闭时把焦点归还给触发元素
  useEffect(() => {
    if (!open) return;
    prevFocus.current = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    return () => prevFocus.current?.focus();
  }, [open]);

  // Escape 关闭 + Tab 焦点循环陷阱
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab' || !panelRef.current) return;
      const focusables = panelRef.current.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (!first || !last) return;
      const active = document.activeElement;
      if (e.shiftKey && (active === first || active === panelRef.current)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  // 误触防护三件套：
  // 1) 入场冷却——面板滑入的 300ms 内键盘/分类格还在移动，此时按下必然落错键
  //    （双击加号的第二击会砸在键盘"0"或遮罩上：误输入数字或秒开秒关），冷却期内一概不响应
  // 2) 退场屏蔽——关闭后短暂挂一层透明拦截，余触不再穿透到底下的 FAB/账单行
  // 3) 动画结束即摘掉动画类——WebKit 对「动画 + 圆角 + 滚动容器」逐瓦片重光栅化，
  //    静止态强制整层重绘，修复面板内图标上半截偶发缺失
  const [entered, setEntered] = useState(false);
  const [shield, setShield] = useState(false);
  const [animDone, setAnimDone] = useState(false);
  const wasOpen = useRef(false);
  useEffect(() => {
    if (open) {
      wasOpen.current = true;
      setEntered(false);
      setAnimDone(false);
      const t = setTimeout(() => setEntered(true), ENTER_MS);
      return () => clearTimeout(t);
    }
    if (!wasOpen.current) return;
    wasOpen.current = false;
    setEntered(false);
    setShield(true);
    const t = setTimeout(() => setShield(false), SHIELD_MS);
    return () => clearTimeout(t);
  }, [open]);

  if (!open && !shield) return null;

  // 退场屏蔽层：透明全屏，吞掉期间的一切点击（短暂存在，280ms 后自动卸载）
  if (!open) {
    return <div className="fixed inset-0 z-40" aria-hidden onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()} />;
  }

  return (
    <div className="fixed inset-0 z-40">
      <div
        className="absolute inset-0 bg-scrim fade-in"
        onClick={() => {
          if (entered) onCloseRef.current();
        }}
      />
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`absolute left-0 right-0 bg-card rounded-t-2xl overflow-auto pb-safe outline-none ${animDone ? '' : 'sheet-up'}`}
        style={{
          maxHeight: `calc(85% - ${kbOffset}px)`,
          bottom: kbOffset,
          // 入场期间整体不可点（遮罩同凉）；结束即恢复
          pointerEvents: entered ? undefined : 'none',
          // 动画期间提升独立合成层：整层一次性光栅化，避免滚动容器+圆角逐瓦片裁切
          willChange: entered ? undefined : 'transform',
          // 面板内滚动到头不再把滚动手势链给底层页面
          overscrollBehavior: 'contain',
        }}
        onAnimationEnd={(e) => {
          if (e.target === e.currentTarget) setAnimDone(true);
        }}
      >
        <div className="flex items-center justify-between px-4 pt-4 pb-2 sticky top-0 bg-card rounded-t-2xl">
          <h3 className="font-semibold text-base">{title ?? ''}</h3>
          <button onClick={onClose} className="p-2 -m-1 text-ink-3" aria-label="关闭">
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
