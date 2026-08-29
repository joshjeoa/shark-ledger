import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect, useState } from 'react';
import { pad2 } from '../utils/date';
import { Sheet } from './Sheet';

export function MonthPicker({ open, value, onChange, onClose }: { open: boolean; value: string; onChange: (ym: string) => void; onClose: () => void }) {
  const [year, setYear] = useState(() => Number(value.slice(0, 4)));
  // 组件常驻不卸载：重开时把年份同步回当前值，避免残留上次浏览的年份
  useEffect(() => {
    if (open) setYear(Number(value.slice(0, 4)));
  }, [open, value]);
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
                className={`h-11 rounded-xl text-sm font-medium ${active ? 'bg-primary text-on-primary' : 'bg-fill text-ink-2'}`}
                onClick={() => {
                  onChange(`${year}-${pad2(m)}`);
                  onClose();
                }}
              >
                {m}月
              </button>
            );
          })}
        </div>
        <button
          className="w-full h-11 mt-4 rounded-xl bg-fill text-sm text-ink-2"
          onClick={() => {
            onChange(`${now.getFullYear()}-${pad2(now.getMonth() + 1)}`);
            onClose();
          }}
        >
          回到本月
        </button>
      </div>
    </Sheet>
  );
}
