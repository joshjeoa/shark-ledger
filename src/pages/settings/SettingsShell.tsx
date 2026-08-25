import type { ReactNode } from 'react';
import { ChevronLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export function SettingsShell({ title, children }: { title: string; children: ReactNode }) {
  const navigate = useNavigate();
  return (
    <div className="h-full flex flex-col bg-surface">
      <header className="bg-header pt-safe">
        <div className="flex items-center px-2 py-3">
          <button onClick={() => navigate(-1)} className="flex items-center gap-0.5 px-2 py-1 text-sm">
            <ChevronLeft size={20} />
            返回
          </button>
          <h1 className="flex-1 text-center text-lg font-bold pr-14">{title}</h1>
        </div>
      </header>
      <main className="flex-1 overflow-auto pb-10">{children}</main>
    </div>
  );
}

export function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      className={`w-12 h-7 rounded-full p-0.5 transition-colors ${on ? 'bg-primary' : 'bg-line'}`}
      onClick={() => onChange(!on)}
    >
      <span className={`block w-6 h-6 bg-card rounded-full shadow transition-transform ${on ? 'translate-x-5' : ''}`} />
    </button>
  );
}
