import { useEffect, useMemo, useRef, useState } from 'react';
import { useData } from '../store/data';
import { useSettings } from '../store/settings';
import { dayKey, isoWeekNumber, monthKey, monthKeyOffset, monthLabelCN, shortMD, startOfWeek, daysInMonth } from '../utils/date';
import { toYuan } from '../utils/money';
import { CatIcon } from '../utils/iconMap';
import { EmptyState } from '../components/EmptyState';
import type { BillType } from '../types';

type Period = 'week' | 'month' | 'year';

export function ChartPage() {
  const { bills, categories, currentLedgerId } = useData();
  const hide = useSettings((s) => s.hideAmount);
  const [metric, setMetric] = useState<BillType>('expense');
  const [period, setPeriod] = useState<Period>('week');
  const [offset, setOffset] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const now = new Date();
  const curMonth = monthKey(now.getTime());

  const model = useMemo(() => {
    const inLedger = bills.filter((b) => b.ledgerId === currentLedgerId && !b.deletedAt && b.type === metric);
    let labels: string[] = [];
    let buckets: number[] = [];
    let elapsed = 1;
    let rankBills = inLedger;

    if (period === 'week') {
      const start = startOfWeek(now.getTime());
      start.setDate(start.getDate() + offset * 7);
      labels = [];
      buckets = new Array(7).fill(0);
      const todayK = dayKey(now.getTime());
      for (let i = 0; i < 7; i++) {
        const d = new Date(start);
        d.setDate(d.getDate() + i);
        const k = dayKey(d.getTime());
        labels.push(k === todayK ? '今天' : shortMD(d.getTime()));
      }
      const startT = start.getTime();
      const endT = startT + 7 * 86400000;
      rankBills = inLedger.filter((b) => b.occurredAt >= startT && b.occurredAt < endT);
      for (const b of rankBills) {
        const idx = Math.floor((b.occurredAt - startT) / 86400000);
        if (idx >= 0 && idx < 7) buckets[idx] = (buckets[idx] ?? 0) + b.amountCents;
      }
      elapsed = offset === 0 ? ((now.getDay() + 6) % 7) + 1 : 7;
    } else if (period === 'month') {
      const ym = monthKeyOffset(curMonth, offset);
      const n = daysInMonth(ym);
      labels = Array.from({ length: n }, (_, i) => String(i + 1));
      buckets = new Array(n).fill(0);
      rankBills = inLedger.filter((b) => monthKey(b.occurredAt) === ym);
      for (const b of rankBills) {
        const d = new Date(b.occurredAt).getDate();
        buckets[d - 1] = (buckets[d - 1] ?? 0) + b.amountCents;
      }
      elapsed = offset === 0 ? now.getDate() : n;
    } else {
      const year = now.getFullYear() + offset;
      labels = Array.from({ length: 12 }, (_, i) => `${i + 1}月`);
      buckets = new Array(12).fill(0);
      rankBills = inLedger.filter((b) => new Date(b.occurredAt).getFullYear() === year);
      for (const b of rankBills) buckets[new Date(b.occurredAt).getMonth()] = (buckets[new Date(b.occurredAt).getMonth()] ?? 0) + b.amountCents;
      elapsed = offset === 0 ? now.getMonth() + 1 : 12;
    }

    const total = buckets.reduce((s, v) => s + v, 0);
    const avg = elapsed > 0 ? Math.round(total / elapsed) : 0;

    // 排行榜（跟随当前支出/收入口径）
    const byCat = new Map<string, number>();
    for (const b of rankBills) {
      byCat.set(b.categoryId, (byCat.get(b.categoryId) ?? 0) + b.amountCents);
    }
    const catTotal = Array.from(byCat.values()).reduce((s, v) => s + v, 0);
    const ranking = Array.from(byCat.entries())
      .map(([id, cents]) => ({ cat: categories.find((c) => c.id === id), cents, pct: catTotal > 0 ? (cents / catTotal) * 100 : 0 }))
      .sort((a, b) => b.cents - a.cents)
      .slice(0, 10);

    return { labels, buckets, total, avg, ranking };
  }, [bills, categories, currentLedgerId, metric, period, offset, curMonth, now.getTime()]);

  // Chart.js 懒加载渲染
  useEffect(() => {
    let chart: { destroy: () => void } | null = null;
    let cancelled = false;
    void import('chart.js/auto').then(({ default: Chart }) => {
      if (cancelled || !canvasRef.current) return;
      chart = new Chart(canvasRef.current, {
        type: 'line',
        data: {
          labels: model.labels,
          datasets: [
            {
              data: model.buckets.map((c) => c / 100),
              borderColor: '#333',
              backgroundColor: '#F5C518',
              pointRadius: 3,
              pointBackgroundColor: '#F5C518',
              tension: 0,
              borderWidth: 1.5,
            },
            {
              data: model.labels.map(() => model.avg / 100),
              borderColor: '#bbb',
              borderDash: [5, 5],
              pointRadius: 0,
              borderWidth: 1,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx) => `¥${(ctx.parsed.y ?? 0).toFixed(2)}` } } },
          scales: {
            x: { grid: { display: false }, ticks: { maxTicksLimit: 8, font: { size: 10 } } },
            y: { beginAtZero: true, ticks: { font: { size: 10 } } },
          },
        },
      });
    });
    return () => {
      cancelled = true;
      chart?.destroy();
    };
  }, [model]);

  const offsets = [-4, -3, -2, -1, 0];
  const offsetLabel = (o: number) => {
    if (period === 'week') {
      const s = startOfWeek(now.getTime());
      s.setDate(s.getDate() + o * 7);
      return o === 0 ? '本周' : `${isoWeekNumber(s.getTime())}周`;
    }
    if (period === 'month') return monthLabelCN(monthKeyOffset(curMonth, o));
    return `${now.getFullYear() + o}年`;
  };

  const show = (c: number) => (hide ? '****' : toYuan(c));

  return (
    <div className="h-full flex flex-col bg-gray-50">
      <header className="bg-primary pt-safe">
        <div className="px-4 pt-2 pb-3">
          <div className="flex items-center justify-center gap-2">
            <select value={metric} onChange={(e) => setMetric(e.target.value as BillType)} className="bg-transparent font-bold text-lg outline-none appearance-none text-center">
              <option value="expense">支出</option>
              <option value="income">收入</option>
            </select>
          </div>
          <div className="grid grid-cols-3 mt-3 rounded-lg overflow-hidden border border-gray-900/20 text-sm text-center">
            {(['week', 'month', 'year'] as Period[]).map((p) => (
              <button key={p} className={`h-9 ${period === p ? 'bg-gray-900 text-primary font-medium' : 'bg-primary/90'}`} onClick={() => { setPeriod(p); setOffset(0); }}>
                {p === 'week' ? '周' : p === 'month' ? '月' : '年'}
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className="flex gap-4 px-4 py-2 overflow-auto hide-scrollbar bg-white border-b border-gray-100">
        {offsets.map((o) => (
          <button key={o} className={`shrink-0 text-sm pb-0.5 ${offset === o ? 'text-gray-900 font-semibold border-b-2 border-gray-900' : 'text-gray-300'}`} onClick={() => setOffset(o)}>
            {offsetLabel(o)}
          </button>
        ))}
      </div>

      <main className="flex-1 overflow-auto pb-24">
        <div className="bg-white px-4 pt-3">
          <p className="text-sm text-gray-700">
            总{metric === 'expense' ? '支出' : '收入'}：{show(model.total)}
          </p>
          <p className="text-xs text-gray-400 mb-2">平均值：{show(model.avg)}</p>
          <div className="h-52">
            <canvas ref={canvasRef} />
          </div>
        </div>

        <div className="bg-white mt-2 px-4 py-3">
          <h2 className="font-semibold mb-3">{metric === 'expense' ? '支出' : '收入'}排行榜</h2>
          {model.ranking.length === 0 ? (
            <EmptyState text="该周期还没有记录" />
          ) : (
            model.ranking.map(({ cat, cents, pct }) => (
              <div key={cat?.id ?? 'x'} className="flex items-center gap-3 py-3 border-b border-gray-50 last:border-0">
                <span className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-gray-600">
                  <CatIcon name={cat?.icon ?? ''} className="w-5 h-5" />
                </span>
                <div className="flex-1">
                  <div className="flex justify-between text-sm mb-1">
                    <span>
                      {cat?.name ?? '未分类'} <span className="text-gray-400 text-xs">{pct.toFixed(1)}%</span>
                    </span>
                    <span className="font-medium">{show(cents)}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-gray-100">
                    <div className="h-1.5 rounded-full bg-primary" style={{ width: `${Math.max(pct, 2)}%` }} />
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </main>
    </div>
  );
}
