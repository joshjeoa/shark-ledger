import { useUI } from '../store/ui';

export function Toasts() {
  const toasts = useUI((s) => s.toasts);
  return (
    <div className="fixed left-0 right-0 bottom-24 z-50 flex flex-col items-center gap-2 pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`px-4 py-2 rounded-full text-sm text-white shadow fade-in ${
            t.type === 'err' ? 'bg-danger' : t.type === 'info' ? 'bg-gray-700' : 'bg-gray-800/90'
          }`}
        >
          {t.text}
        </div>
      ))}
    </div>
  );
}
