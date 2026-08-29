import { useEffect, useMemo, useRef, useState } from 'react';
import { useData } from '../store/data';
import { useSettings } from '../store/settings';
import { useTheme } from '../utils/theme';
import { dayKey, isoWeekNumber, monthKey, monthKeyOffset, monthLabelCN, shortMD, startOfWeek, daysInMonth } from '../utils/date';
import { toYuan } from '../utils/money';
import { ledgerBills } from '../utils/stats';
import { CatIcon } from '../utils/iconMap';
import { EmptyState } from '../components/EmptyState';
import type { BillType } from '../types';
import type { Chart, ChartOptions, TooltipItem } from 'chart.js';

type Period = 'week' | 'month' | 'year';

/** 从当前生效的 CSS 变量取色（暗色切换后图表重渲时取到新值） */
function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

type LineModel = { labels: string[]; buckets: number[]; avg: number };

/** 主色渐变填充：从图表顶部 30% 透明度渐隐到底部全透明（hex 追加 alpha） */
function buildDatasets(chart: Chart<'line'>, model: LineModel): Chart<'line'>['data']['datasets'] {
  const primary = cssVar('--primary');
  const grad = chart.ctx.createLinearGradient(0, 0, 0, 260);
  grad.addColorStop(0, `${primary}4d`);
  grad.addColorStop(1, `${primary}00`);
  return [
    {
      data: model.buckets.map((c) => c / 100),
      borderColor: primary,
      backgroundColor: grad,
      fill: true,
      pointRadius: 3,
      pointHoverRadius: 5,
      pointBackgroundColor: primary,
      pointBorderColor: cssVar('--card'),
      pointBorderWidth: 1.5,
      tension: 0.35,
      borderWidth: 2,
    },
    {
      data: model.labels.map(() => model.avg / 100),
      borderColor: cssVar('--ink-3'),
      borderDash: [5, 5],
      pointRadius: 0,
      borderWidth: 1,
    },
  ];
}

function buildOptions(model: LineModel): ChartOptions<'line'> {
  const ink3 = cssVar('--ink-3');
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index' as const, intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: { callbacks: { label: (ctx: TooltipItem<'line'>) => `¥${(ctx.parsed.y ?? 0).toFixed(2)}` } },
    },
    scales: {
      x: { grid: { display: false }, ticks: { maxTicksLimit: 8, font: { size: 10 }, color: ink3 } },
      y: { beginAtZero: true, ticks: { font: { size: 10 }, color: ink3 }, border: { display: false }, grid: { color: cssVar('--line') } },
    },
  };
}

export function ChartPage() {
  const bills = useData((s) => s.bills);
  const categories = useData((s) => s.categories);
  const currentLedgerId = useData((s) => s.currentLedgerId);
  const hide = useSettings((s) => s.hideAmount);
  const theme = useTheme();
  const [metric, setMetric] = useState<BillType>('expense');
  const [period, setPeriod] = useState<Period>('week');
  const [offset, setOffset] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<Chart<'line'> | null>(null);
  // 时间基线固定为状态：作为 useMemo 依赖保证稳定，避免每次渲染重算并重建图表
  const [now, setNow] = useState(() => new Date());
  // PWA 从后台恢复（可能已跨天）时刷新时间基线，避免"今天"标记与天数口径停留在昨天
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') setNow(new Date());
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);
  const curMonth = monthKey(now.getTime());

  const model = useMemo(() => {
    const inLedger = ledgerBills(bills, currentLedgerId, metric);
    const catMap = new Map(categories.map((c) => [c.id, c]));
    let labels: string[] = [];
    let buckets: number[] = [];
    let elapsed = 1;
    let rankBills = inLedger;

    if (period === 'week') {
      const start = startOfWeek(now.getTime());
      start.setDate(start.getDate() + offset * 7);
      labels = [];
      buckets = new Array(7).fill(0);
      const todayK = dayKey(Date.now());
      // 按日历日 key 分桶：DST 时区一天可能只有 23/25 小时，毫秒除法会把账单分错桶
      const dayIdx = new Map<string, number>();
      for (let i = 0; i < 7; i++) {
        const d = new Date(start);
        d.setDate(d.getDate() + i);
        const k = dayKey(d.getTime());
        dayIdx.set(k, i);
        labels.push(k === todayK ? '今天' : shortMD(d.getTime()));
      }
      rankBills = [];
      for (const b of inLedger) {
        const idx = dayIdx.get(dayKey(b.occurredAt));
        if (idx === undefined) continue;
        rankBills.push(b);
        buckets[idx] = (buckets[idx] ?? 0) + b.amountCents;
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
      .map(([id, cents]) => ({ cat: catMap.get(id), cents, pct: catTotal > 0 ? (cents / catTotal) * 100 : 0 }))
      .sort((a, b) => b.cents - a.cents)
      .slice(0, 10);

    return { labels, buckets, total, avg, ranking };
  }, [bills, categories, currentLedgerId, metric, period, offset, curMonth, now]);

  // Chart.js 懒加载 + 实例复用：数据/主题变化时只 update() 不销毁重建，避免画布闪烁；
  // theme 在依赖里是为明暗切换走更新路径重取 CSS 变量色
  useEffect(() => {
    const chart = chartRef.current;
    if (chart) {
      chart.data.labels = model.labels;
      chart.data.datasets = buildDatasets(chart, model);
      chart.options = buildOptions(model);
      chart.update();
      return;
    }
    let cancelled = false;
    void import('chart.js/auto').then(({ default: Chart }) => {
      if (cancelled || !canvasRef.current) return;
      const c = new Chart(canvasRef.current, {
        type: 'line',
        data: { labels: model.labels, datasets: [] },
        options: buildOptions(model),
      });
      c.data.datasets = buildDatasets(c, model);
      c.update();
      chartRef.current = c;
    });
    return () => {
      cancelled = true;
    };
  }, [model, theme]);

  useEffect(() => () => chartRef.current?.destroy(), []);

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
    <div className="h-full flex flex-col bg-surface">
      <header className="bg-header pt-safe">
        <div className="px-4 pt-2 pb-3">
          <div className="flex items-center justify-center gap-2">
            <select value={metric} onChange={(e) => setMetric(e.target.value as BillType)} className="bg-transparent font-bold text-lg outline-none appearance-none text-center text-header-ink">
              <option value="expense">支出</option>
              <option value="income">收入</option>
            </select>
          </div>
          <div className="grid grid-cols-3 mt-3 rounded-lg overflow-hidden bg-header-fill text-sm text-center">
            {(['week', 'month', 'year'] as Period[]).map((p) => (
              <button key={p} className={`h-9 ${period === p ? 'bg-primary text-on-primary font-medium' : 'text-header-ink'}`} onClick={() => { setPeriod(p); setOffset(0); }}>
                {p === 'week' ? '周' : p === 'month' ? '月' : '年'}
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className="flex gap-4 px-4 py-2 overflow-auto hide-scrollbar bg-card border-b border-line">
        {offsets.map((o) => (
          <button key={o} className={`shrink-0 text-sm pb-0.5 ${offset === o ? 'text-ink font-semibold border-b-2 border-ink' : 'text-ink-3'}`} onClick={() => setOffset(o)}>
            {offsetLabel(o)}
          </button>
        ))}
      </div>

      <main className="flex-1 overflow-auto pb-28">
        <div className="bg-card px-4 pt-3">
          <p className="text-sm text-ink-2">
            总{metric === 'expense' ? '支出' : '收入'}：{show(model.total)}
          </p>
          <p className="text-xs text-ink-3 mb-2">平均值：{show(model.avg)}</p>
          <div className="h-52">
            <canvas ref={canvasRef} />
          </div>
        </div>

        <div className="bg-card mt-2 px-4 py-3">
          <h2 className="font-semibold mb-3">{metric === 'expense' ? '支出' : '收入'}排行榜</h2>
          {model.ranking.length === 0 ? (
            <EmptyState text="该周期还没有记录" />
          ) : (
            model.ranking.map(({ cat, cents, pct }) => (
              <div key={cat?.id ?? 'x'} className="flex items-center gap-3 py-3 border-b border-line last:border-0">
                <span className="w-10 h-10 rounded-full bg-fill flex items-center justify-center text-ink-2">
                  <CatIcon name={cat?.icon ?? ''} className="w-5 h-5" />
                </span>
                <div className="flex-1">
                  <div className="flex justify-between text-sm mb-1">
                    <span>
                      {cat?.name ?? '未分类'} <span className="text-ink-3 text-xs">{pct.toFixed(1)}%</span>
                    </span>
                    <span className="font-medium">{show(cents)}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-fill">
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
