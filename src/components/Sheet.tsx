import type { ReactNode } from 'react';
import { X } from 'lucide-react';

export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title?: string; children: ReactNode }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40">
      <div className="absolute inset-0 bg-scrim fade-in" onClick={onClose} />
      <div className="absolute bottom-0 left-0 right-0 bg-card rounded-t-2xl sheet-up overflow-auto pb-safe" style={{ maxHeight: '85%' }}>
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
