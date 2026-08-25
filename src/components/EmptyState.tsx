import { NotebookPen } from 'lucide-react';

export function EmptyState({ text, actionLabel, onAction }: { text: string; actionLabel?: string; onAction?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-gray-400">
      <NotebookPen size={48} strokeWidth={1.2} className="mb-3 text-gray-300" />
      <p className="text-sm mb-4">{text}</p>
      {actionLabel && onAction && (
        <button className="px-5 h-10 rounded-full bg-primary text-gray-900 text-sm font-medium" onClick={onAction}>
          {actionLabel}
        </button>
      )}
    </div>
  );
}
