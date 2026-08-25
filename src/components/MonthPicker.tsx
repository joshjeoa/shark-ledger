import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { Sheet } from './Sheet';

const p2 = (n: number) => String(n).padStart(2, '0');

export function MonthPicker({ open, value, onChange, onClose }: { open: boolean; value: string; onChange: (ym: string) => void; onClose: () => void }) {
  const [year, setYear] = useState(() => Number(value.slice(0, 4)));
  const curMonth = Number(value.slice(5, 7));
  const now = new Date();
  return (
    <Sheet open={open} onClose={onClose} title="选择月份">
      <div className="px-4 pb-6">
        <div className="flex items-center justify-between mb-4">
          <button className="p-2" onClick={() => setYear((y) => y - 1)} aria-label="上一年">
            <ChevronLeft size={20} />
          </button>
          <span className="font-semibold">{year}年</span>
          <button className="p-2" onClick={() => setYear((y) => y + 1)} aria-label="下一年">
            <ChevronRight size={20} />
          </button>
        </div>
        <div className="grid grid-cols-4 gap-2">
          {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => {
            const active = year === Number(value.slice(0, 4)) && m === curMonth;
            return (
              <button
                key={m}
                className={`h-11 rounded-xl text-sm font-medium ${active ? 'bg-primary text-gray-900' : 'bg-gray-100 text-gray-700'}`}
                onClick={() => {
                  onChange(`${year}-${p2(m)}`);
                  onClose();
                }}
              >
                {m}月
              </button>
            );
          })}
        </div>
        <button
          className="w-full h-11 mt-4 rounded-xl bg-gray-100 text-sm text-gray-700"
          onClick={() => {
            onChange(`${now.getFullYear()}-${p2(now.getMonth() + 1)}`);
            onClose();
          }}
        >
          回到本月
        </button>
      </div>
    </Sheet>
  );
}
