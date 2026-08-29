import { useEffect } from 'react';

/** 凭证照片全屏查看器：点击/Escape 关闭 */
export function PhotoViewer({ url, onClose }: { url: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center fade-in" onClick={onClose}>
      <img src={url} alt="凭证照片" className="max-w-full max-h-full object-contain" onClick={(e) => e.stopPropagation()} />
      <button aria-label="关闭" className="absolute top-3 right-3 w-9 h-9 rounded-full bg-white/15 text-white flex items-center justify-center text-lg">
        ✕
      </button>
    </div>
  );
}
