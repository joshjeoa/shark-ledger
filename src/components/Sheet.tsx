import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { X } from 'lucide-react';

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

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40">
      <div className="absolute inset-0 bg-scrim fade-in" onClick={onClose} />
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="absolute left-0 right-0 bg-card rounded-t-2xl sheet-up overflow-auto pb-safe outline-none"
        style={{ maxHeight: `calc(85% - ${kbOffset}px)`, bottom: kbOffset }}
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
