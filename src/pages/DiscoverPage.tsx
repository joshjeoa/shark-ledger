import { useMemo, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { useData } from '../store/data';
import { useSettings } from '../store/settings';
import { monthKey } from '../utils/date';
import { toYuan, parseYuanToCents } from '../utils/money';
import { Sheet } from '../components/Sheet';
import { useUI } from '../store/ui';
import { useNavigate } from 'react-router-dom';

export function DiscoverPage() {
  const { bills, budgets, currentLedgerId, setBudget } = useData();
  const hide = useSettings((s) => s.hideAmount);
  const toast = useUI((s) => s.toast);
  const navigate = useNavigate();
  const [editOpen, setEditOpen] = useState(false);
  const [input, setInput] = useState('');

  const ym = monthKey(Date.now());
  const sums = useMemo(() => {
    let income = 0;
    let expense = 0;
    for (const b of bills) {
      if (b.ledgerId !== currentLedgerId || b.deletedAt || monthKey(b.occurredAt) !== ym) continue;
      if (b.type === 'income') income += b.amountCents;
      else expense += b.amountCents;
    }
    return { income, expense, balance: income - expense };
  }, [bills, currentLedgerId, ym]);

  const budget = budgets.find((b) => b.yearMonth === ym);
  const used = sums.expense;
  const pct = budget && budget.amountCents > 0 ? Math.min(used / budget.amountCents, 1) : 0;
  const over = budget ? used > budget.amountCents : false;
  const C = 2 * Math.PI * 52;

  const show = (c: number) => (hide ? '****' : toYuan(c));

  const saveBudget = async () => {
    const cents = parseYuanToCents(input);
    if (cents === null) {
      toast('请输入正确金额', 'err');
      return;
    }
    await setBudget(ym, cents);
    toast('预算已更新');
    setEditOpen(false);
  };

  return (
    <div className="h-full overflow-auto bg-gray-100 pb-24">
      <header className="bg-primary pt-safe">
        <h1 className="text-center text-lg font-bold py-4">发现</h1>
      </header>

      <div className="px-3 -mt-2 space-y-3">
        {/* 账单卡 */}
        <button className="w-full bg-white rounded-2xl p-4 text-left" onClick={() => navigate('/')}>
          <div className="flex items-center justify-between text-sm font-medium mb-3">
            账单 <ChevronRight size={16} className="text-gray-300" />
          </div>
          <div className="flex items-center gap-4">
            <span className="text-2xl font-bold">{ym.slice(5)}月</span>
            <div className="flex-1 grid grid-cols-3 text-sm">
              <span>
                <p className="text-gray-400 text-xs mb-1">收入</p>
                <b>{show(sums.income)}</b>
              </span>
              <span>
                <p className="text-gray-400 text-xs mb-1">支出</p>
                <b>{show(sums.expense)}</b>
              </span>
              <span>
                <p className="text-gray-400 text-xs mb-1">结余</p>
                <b className={sums.balance < 0 ? 'text-danger' : ''}>{show(sums.balance)}</b>
              </span>
            </div>
          </div>
        </button>

        {/* 预算卡 */}
        <div className="bg-white rounded-2xl p-4">
          <div className="flex items-center justify-between text-sm font-medium mb-3">
            {ym.slice(5)}月总预算
            <button onClick={() => { setInput(budget ? toYuan(budget.amountCents) : ''); setEditOpen(true); }}>
              <ChevronRight size={16} className="text-gray-300" />
            </button>
          </div>
          {!budget ? (
            <button className="w-full h-11 rounded-xl bg-gray-100 text-sm text-gray-500" onClick={() => setEditOpen(true)}>
              设置本月预算
            </button>
          ) : (
            <div className="flex items-center gap-4">
              <div className="relative w-28 h-28 shrink-0">
                <svg viewBox="0 0 120 120" className="w-28 h-28 -rotate-90">
                  <circle cx="60" cy="60" r="52" fill="none" stroke="#eee" strokeWidth="10" />
                  <circle
                    cx="60"
                    cy="60"
                    r="52"
                    fill="none"
                    stroke={over ? '#E64340' : 'var(--primary)'}
                    strokeWidth="10"
                    strokeLinecap="round"
                    strokeDasharray={`${pct * C} ${C}`}
                  />
                </svg>
                <span className={`absolute inset-0 flex items-center justify-center text-sm ${over ? 'text-danger' : 'text-gray-600'}`}>
                  {over ? '已超支' : `${Math.round(pct * 100)}%`}
                </span>
              </div>
              <div className="flex-1 text-sm space-y-2">
                <div className="flex justify-between">
                  <span className="text-gray-500">剩余预算</span>
                  <b className={over ? 'text-danger' : ''}>{show(budget.amountCents - used)}</b>
                </div>
                <div className="flex justify-between text-gray-500">
                  <span>本月预算</span>
                  <span>{show(budget.amountCents)}</span>
                </div>
                <div className="flex justify-between text-gray-500">
                  <span>本月支出</span>
                  <span>{show(used)}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <Sheet open={editOpen} onClose={() => setEditOpen(false)} title="设置月预算">
        <div className="px-4 pb-6">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            inputMode="decimal"
            placeholder="预算金额（元）"
            className="w-full h-12 px-4 rounded-xl bg-gray-100 text-base outline-none mb-4"
          />
          <button className="w-full h-11 rounded-xl bg-primary font-medium" onClick={() => void saveBudget()}>
            保存
          </button>
        </div>
      </Sheet>
    </div>
  );
}
