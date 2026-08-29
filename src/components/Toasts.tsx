import { useUI } from '../store/ui';

export function Toasts() {
  const toasts = useUI((s) => s.toasts);
  return (
    <div role="status" aria-live="polite" className="fixed left-0 right-0 bottom-24 z-50 flex flex-col items-center gap-2 pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`px-4 py-2 rounded-full text-sm shadow fade-in ${
            t.type === 'err' ? 'bg-danger text-white' : 'bg-toast-bg text-toast-ink'
          }`}
        >
          {t.text}
        </div>
      ))}
    </div>
  );
}
