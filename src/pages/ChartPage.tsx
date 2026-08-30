import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useData } from '../store/data';
import { useSettings } from '../store/settings';
import { useTheme } from '../utils/theme';
import { dayKey, isoWeekNumber, monthKey, monthKeyOffset, shortMD, startOfWeek, daysInMonth } from '../utils/date';
import { toYuan } from '../utils/money';
import { ledgerBills, sumByType } from '../utils/stats';
import { CatIcon } from '../utils/iconMap';
import { EmptyState } from '../components/EmptyState';
import { ProGateButton } from '../vip/ProGate';
import { Crown } from 'lucide-react';
import { Minus, TrendingDown, TrendingUp } from 'lucide-react';
import type { Bill, BillType } from '../types';
import type { Chart, ChartOptions, Plugin, TooltipItem } from 'chart.js';

type Period = 'week' | 'month' | 'year';

/** 从当前生效的 CSS 变量取色（暗色切换后图表重渲时取到新值） */
function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/** 构成图分片取色：与深炭/香槟金主题协调的中低饱和色（图表数据色，非 UI 语义 token） */
const PIE_PALETTE = ['#E4C066', '#7FA6C9', '#8FCB9B', '#D98FA4', '#A08FDC', '#6EC2C0', '#DFA96E', '#93A1B4', '#C7A6D9', '#AFC08A'];
const OTHER_COLOR = '#8E8E93';
const OTHER_ID = '__other__';

/** chart.js/auto 只加载一次：折线/环形/柱状三个实例共用 */
let chartAutoPromise: Promise<typeof import('chart.js/auto').default> | null = null;
function loadChart() {
  return (chartAutoPromise ??= import('chart.js/auto').then((m) => m.default));
}

type CatRow = { id: string; name: string; icon: string; cents: number; pct: number; color: string };

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

function buildOptions(model: LineModel, hide: boolean): ChartOptions<'line'> {
  const ink3 = cssVar('--ink-3');
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index' as const, intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx: TooltipItem<'line'>) => `¥${hide ? '****' : (ctx.parsed.y ?? 0).toFixed(2)}`,
        },
      },
    },
    scales: {
      x: { grid: { display: false }, ticks: { maxTicksLimit: 8, font: { size: 10 }, color: ink3 } },
      y: {
        beginAtZero: true,
        ticks: { font: { size: 10 }, color: ink3, callback: (v) => (hide ? '****' : String(v)) },
        border: { display: false },
        grid: { color: cssVar('--line') },
      },
    },
  };
}

/** 环形图中心文字：总额直接画在圆心 */
const centerTextPlugin: Plugin<'doughnut'> = {
  id: 'centerText',
  afterDraw(chart) {
    const opt = (chart.options.plugins as Record<string, { title: string; value: string } | undefined>).centerText;
    if (!opt) return;
    const arc = chart.getDatasetMeta(0).data[0];
    if (!arc) return;
    const { ctx } = chart;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '500 11px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillStyle = cssVar('--ink-3');
    ctx.fillText(opt.title, arc.x, arc.y - 9);
    ctx.font = '700 15px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillStyle = cssVar('--ink');
    ctx.fillText(opt.value, arc.x, arc.y + 10);
    ctx.restore();
  },
};

function doughnutOptions(
  comp: CatRow[],
  opts: { hide: boolean; total: number; metric: BillType; onPick: (id: string | null) => void },
): ChartOptions<'doughnut'> {
  return {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '62%',
    // 点击分片 → 高亮排行榜对应分类（再次点击同一片取消）
    onClick: (_e, els) => {
      const row = comp[els[0]?.index ?? -1];
      if (!row || row.id === OTHER_ID) return;
      opts.onPick(row.id);
    },
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx: TooltipItem<'doughnut'>) => {
            const row = comp[ctx.dataIndex];
            if (!row) return '';
            return `${row.name}：¥${opts.hide ? '****' : toYuan(row.cents)}（${row.pct.toFixed(1)}%）`;
          },
        },
      },
      centerText: {
        title: opts.metric === 'expense' ? '总支出' : '总收入',
        value: opts.hide ? '****' : toYuan(opts.total),
      },
    },
  } as ChartOptions<'doughnut'>;
}

function barOptions(hide: boolean): ChartOptions<'bar'> {
  const ink3 = cssVar('--ink-3');
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
        position: 'bottom',
        labels: { usePointStyle: true, pointStyle: 'circle', boxWidth: 6, boxHeight: 6, padding: 14, font: { size: 11 }, color: cssVar('--ink-2') },
      },
      tooltip: {
        callbacks: {
          label: (ctx: TooltipItem<'bar'>) => `${ctx.dataset.label}：¥${hide ? '****' : (ctx.parsed.y ?? 0).toFixed(2)}`,
        },
      },
    },
    scales: {
      x: { grid: { display: false }, ticks: { font: { size: 10 }, color: ink3 } },
      y: {
        beginAtZero: true,
        ticks: { font: { size: 10 }, color: ink3, callback: (v) => (hide ? '****' : String(v)) },
        border: { display: false },
        grid: { color: cssVar('--line') },
      },
    },
  };
}

export function ChartPage() {
  const bills = useData((s) => s.bills);
  const categories = useData((s) => s.categories);
  const currentLedgerId = useData((s) => s.currentLedgerId);
  const hide = useSettings((s) => s.hideAmount);
  const theme = useTheme();
  const navigate = useNavigate();
  const [metric, setMetric] = useState<BillType>('expense');
  const [period, setPeriod] = useState<Period>('week');
  const [offset, setOffset] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const doughnutCanvasRef = useRef<HTMLCanvasElement>(null);
  const barCanvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<Chart<'line'> | null>(null);
  const doughnutRef = useRef<Chart<'doughnut'> | null>(null);
  const barRef = useRef<Chart<'bar'> | null>(null);
  // 图表 ↔ 排行榜联动：点击环形图分片高亮排行榜对应分类
  const [focusCat, setFocusCat] = useState<string | null>(null);
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
  useEffect(() => {
    setFocusCat(null);
  }, [metric, period, offset]);

  const model = useMemo(() => {
    const all = ledgerBills(bills, currentLedgerId);
    const catMap = new Map(categories.map((c) => [c.id, c]));
    const DAY = 86400000;

    // 周期谓词：本期 / 上期（环比用，等长窗口）
    let inPeriod: (b: Bill) => boolean;
    let inPrevPeriod: (b: Bill) => boolean;
    let labels: string[] = [];
    let buckets: number[] = [];
    let elapsed = 1;

    if (period === 'week') {
      const start = startOfWeek(now.getTime());
      start.setDate(start.getDate() + offset * 7);
      const startMs = start.getTime();
      inPeriod = (b) => b.occurredAt >= startMs && b.occurredAt < startMs + 7 * DAY;
      inPrevPeriod = (b) => b.occurredAt >= startMs - 7 * DAY && b.occurredAt < startMs;
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
      for (const b of all) {
        if (b.type !== metric) continue;
        const idx = dayIdx.get(dayKey(b.occurredAt));
        if (idx === undefined) continue;
        buckets[idx] = (buckets[idx] ?? 0) + b.amountCents;
      }
      elapsed = offset === 0 ? ((now.getDay() + 6) % 7) + 1 : 7;
    } else if (period === 'month') {
      const ym = monthKeyOffset(curMonth, offset);
      const prevYm = monthKeyOffset(ym, -1);
      inPeriod = (b) => monthKey(b.occurredAt) === ym;
      inPrevPeriod = (b) => monthKey(b.occurredAt) === prevYm;
      const n = daysInMonth(ym);
      labels = Array.from({ length: n }, (_, i) => String(i + 1));
      buckets = new Array(n).fill(0);
      for (const b of all) {
        if (b.type !== metric) continue;
        const k = monthKey(b.occurredAt);
        if (k !== ym) continue;
        const d = new Date(b.occurredAt).getDate();
        buckets[d - 1] = (buckets[d - 1] ?? 0) + b.amountCents;
      }
      elapsed = offset === 0 ? now.getDate() : n;
    } else {
      const year = now.getFullYear() + offset;
      inPeriod = (b) => new Date(b.occurredAt).getFullYear() === year;
      inPrevPeriod = (b) => new Date(b.occurredAt).getFullYear() === year - 1;
      labels = Array.from({ length: 12 }, (_, i) => `${i + 1}月`);
      buckets = new Array(12).fill(0);
      for (const b of all) {
        if (b.type !== metric) continue;
        if (new Date(b.occurredAt).getFullYear() !== year) continue;
        buckets[new Date(b.occurredAt).getMonth()] = (buckets[new Date(b.occurredAt).getMonth()] ?? 0) + b.amountCents;
      }
      elapsed = offset === 0 ? now.getMonth() + 1 : 12;
    }

    const periodBills = all.filter(inPeriod);
    const metricBills = periodBills.filter((b) => b.type === metric);
    const total = buckets.reduce((s, v) => s + v, 0);
    const avg = elapsed > 0 ? Math.round(total / elapsed) : 0;

    // 收支环比：本期 vs 上期（等长窗口，两类型各自对比）
    const curSum = sumByType(periodBills);
    const prevSum = sumByType(all.filter(inPrevPeriod));

    // 分类聚合一次，排行榜与构成环形图共用
    const byCat = new Map<string, number>();
    for (const b of metricBills) {
      byCat.set(b.categoryId, (byCat.get(b.categoryId) ?? 0) + b.amountCents);
    }
    const catTotal = Array.from(byCat.values()).reduce((s, v) => s + v, 0);
    const sorted = Array.from(byCat.entries())
      .map(([id, cents]) => ({ cat: catMap.get(id), cents, pct: catTotal > 0 ? (cents / catTotal) * 100 : 0 }))
      .sort((a, b) => b.cents - a.cents);
    const ranking = sorted.slice(0, 10);

    // 构成数据：前 8 类各占一色，其余并入「其他」
    const comp: CatRow[] = sorted.slice(0, 8).map((r, i) => ({
      id: r.cat?.id ?? 'x',
      name: r.cat?.name ?? '未分类',
      icon: r.cat?.icon ?? '',
      cents: r.cents,
      pct: r.pct,
      color: PIE_PALETTE[i % PIE_PALETTE.length] ?? OTHER_COLOR,
    }));
    const restCents = sorted.slice(8).reduce((s, r) => s + r.cents, 0);
    if (restCents > 0 && catTotal > 0) {
      comp.push({ id: OTHER_ID, name: '其他', icon: '', cents: restCents, pct: (restCents / catTotal) * 100, color: OTHER_COLOR });
    }

    // 近 6 个月收支对比（始终以当前月收尾，独立于周期选择）
    const sixLabels: string[] = [];
    const sixIncome: number[] = [];
    const sixExpense: number[] = [];
    const ymIdx = new Map<string, number>();
    for (let i = 5; i >= 0; i--) {
      const ym = monthKeyOffset(curMonth, -i);
      ymIdx.set(ym, 5 - i);
      sixLabels.push(`${Number(ym.slice(5))}月`);
      sixIncome.push(0);
      sixExpense.push(0);
    }
    for (const b of all) {
      const idx = ymIdx.get(monthKey(b.occurredAt));
      if (idx === undefined) continue;
      if (b.type === 'income') sixIncome[idx] = (sixIncome[idx] ?? 0) + b.amountCents;
      else sixExpense[idx] = (sixExpense[idx] ?? 0) + b.amountCents;
    }
    const sixTotal = [...sixIncome, ...sixExpense].reduce((s, v) => s + v, 0);

    return { labels, buckets, total, avg, ranking, comp, curSum, prevSum, sixLabels, sixIncome, sixExpense, sixTotal };
  }, [bills, categories, currentLedgerId, metric, period, offset, curMonth, now]);

  // 折线趋势图：数据/主题变化时 update() 复用实例（懒加载后 chart.js/auto 常驻）
  useEffect(() => {
    const chart = chartRef.current;
    if (chart) {
      chart.data.labels = model.labels;
      chart.data.datasets = buildDatasets(chart, model);
      chart.options = buildOptions(model, hide);
      chart.update();
      return;
    }
    let cancelled = false;
    void loadChart().then((Chart) => {
      if (cancelled || !canvasRef.current) return;
      const c = new Chart(canvasRef.current, {
        type: 'line',
        data: { labels: model.labels, datasets: [] },
        options: buildOptions(model, hide),
      });
      c.data.datasets = buildDatasets(c, model);
      c.update();
      chartRef.current = c;
    });
    return () => {
      cancelled = true;
    };
  }, [model, theme, hide]);

  // 构成环形图
  useEffect(() => {
    if (model.comp.length === 0) {
      doughnutRef.current?.destroy();
      doughnutRef.current = null;
      return;
    }
    let cancelled = false;
    void loadChart().then((Chart) => {
      if (cancelled) return;
      const data = {
        labels: model.comp.map((r) => r.name),
        datasets: [
          {
            data: model.comp.map((r) => r.cents / 100),
            backgroundColor: model.comp.map((r) => r.color),
            borderColor: cssVar('--card'),
            borderWidth: 2,
            hoverOffset: 6,
          },
        ],
      };
      const options = doughnutOptions(model.comp, { hide, total: model.total, metric, onPick: (id) => setFocusCat((prev) => (prev === id ? null : id)) });
      const existing = doughnutRef.current;
      if (existing) {
        existing.data = data;
        existing.options = options;
        existing.update();
        return;
      }
      if (!doughnutCanvasRef.current) return;
      doughnutRef.current = new Chart(doughnutCanvasRef.current, { type: 'doughnut', data, options, plugins: [centerTextPlugin] });
    });
    return () => {
      cancelled = true;
    };
  }, [model.comp, model.total, theme, hide, metric]);

  // 近 6 个月收支对比柱状图
  useEffect(() => {
    if (model.sixTotal === 0) {
      barRef.current?.destroy();
      barRef.current = null;
      return;
    }
    let cancelled = false;
    void loadChart().then((Chart) => {
      if (cancelled) return;
      const data = {
        labels: model.sixLabels,
        datasets: [
          { label: '收入', data: model.sixIncome.map((c) => c / 100), backgroundColor: cssVar('--success'), borderRadius: 3, maxBarThickness: 16 },
          { label: '支出', data: model.sixExpense.map((c) => c / 100), backgroundColor: cssVar('--primary'), borderRadius: 3, maxBarThickness: 16 },
        ],
      };
      const existing = barRef.current;
      if (existing) {
        existing.data = data;
        existing.options = barOptions(hide);
        existing.update();
        return;
      }
      if (!barCanvasRef.current) return;
      barRef.current = new Chart(barCanvasRef.current, { type: 'bar', data, options: barOptions(hide) });
    });
    return () => {
      cancelled = true;
    };
  }, [model.sixLabels, model.sixIncome, model.sixExpense, model.sixTotal, theme, hide]);

  useEffect(
    () => () => {
      chartRef.current?.destroy();
      doughnutRef.current?.destroy();
      barRef.current?.destroy();
    },
    [],
  );

  // 联动：点击环形图分片后，排行榜对应分类滚动到可见处
  useEffect(() => {
    if (!focusCat) return;
    document.getElementById(`rank-${focusCat}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [focusCat]);

  const offsets = [-4, -3, -2, -1, 0];
  const offsetLabel = (o: number) => {
    if (period === 'week') {
      const s = startOfWeek(now.getTime());
      s.setDate(s.getDate() + o * 7);
      return o === 0 ? '本周' : `${isoWeekNumber(s.getTime())}周`;
    }
    if (period === 'month') return `${Number(monthKeyOffset(curMonth, o).slice(5))}月`;
    return `${now.getFullYear() + o}年`;
  };

  const show = (c: number) => (hide ? '****' : toYuan(c));

  return (
    <div className="h-full flex flex-col bg-surface">
      <header className="bg-header pt-safe">
        <div className="px-4 pt-2 pb-3">
          <div className="relative flex items-center justify-center gap-2">
            <select value={metric} onChange={(e) => setMetric(e.target.value as BillType)} className="bg-transparent font-bold text-lg outline-none appearance-none text-center text-header-ink">
              <option value="expense">支出</option>
              <option value="income">收入</option>
            </select>
            <ProGateButton
              feature="年度报告"
              ariaLabel="年度报告"
              className="absolute right-0 flex items-center gap-1 text-sm text-header-ink px-3 py-1.5 rounded-full bg-header-fill"
              onProceed={() => navigate('/report')}
            >
              <Crown size={15} className="text-primary" />
              年报
            </ProGateButton>
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
        <div className="px-3 py-3 space-y-3">
          {/* 趋势 */}
          <div className="rounded-2xl bg-card px-4 pt-3 pb-4">
            <p className="text-sm text-ink-2">
              总{metric === 'expense' ? '支出' : '收入'}：{show(model.total)}
            </p>
            <p className="text-xs text-ink-3 mb-2">平均值：{show(model.avg)}</p>
            <div className="h-52">
              <canvas ref={canvasRef} />
            </div>
          </div>

          {/* 收支构成环形图（点击分片/图例可联动高亮排行榜） */}
          <div className="rounded-2xl bg-card px-4 py-4">
            <h2 className="font-semibold text-sm mb-3">构成分析</h2>
            {model.comp.length === 0 ? (
              <EmptyState text="该周期还没有记录" />
            ) : (
              <>
                <div className="h-48">
                  <canvas ref={doughnutCanvasRef} />
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-2 mt-3">
                  {model.comp.map((r) => (
                    <button
                      key={r.id}
                      className={`flex items-center gap-1.5 text-xs ${focusCat === r.id ? 'text-ink font-medium' : 'text-ink-2'}`}
                      onClick={() => {
                        if (r.id === OTHER_ID) return;
                        setFocusCat((prev) => (prev === r.id ? null : r.id));
                      }}
                    >
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: r.color }} />
                      {r.name}
                      <span className="text-ink-3">{r.pct.toFixed(1)}%</span>
                      <span className="text-ink-3">¥{show(r.cents)}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* 对比分析：本期 vs 上期（等长窗口环比） */}
          <div className="rounded-2xl bg-card px-4 py-4">
            <h2 className="font-semibold text-sm mb-1">对比分析 · 本期 vs 上期</h2>
            <CompareRow label="收入合计" curText={show(model.curSum.income)} prevText={show(model.prevSum.income)} delta={deltaPct(model.curSum.income, model.prevSum.income)} positiveIsGood />
            <CompareRow label="支出合计" curText={show(model.curSum.expense)} prevText={show(model.prevSum.expense)} delta={deltaPct(model.curSum.expense, model.prevSum.expense)} positiveIsGood={false} />
            <CompareRow label="结余" curText={show(model.curSum.balance)} prevText={show(model.prevSum.balance)} delta={deltaPct(model.curSum.balance, model.prevSum.balance)} positiveIsGood />
          </div>

          {/* 近 6 个月收支对比柱状图 */}
          <div className="rounded-2xl bg-card px-4 py-4">
            <h2 className="font-semibold text-sm mb-3">近 6 个月收支对比</h2>
            {model.sixTotal === 0 ? (
              <EmptyState text="还没有可对比的记录" />
            ) : (
              <div className="h-52">
                <canvas ref={barCanvasRef} />
              </div>
            )}
          </div>

          {/* 排行榜（可与环形图联动高亮） */}
          <div className="rounded-2xl bg-card px-4 py-3">
            <h2 className="font-semibold mb-3 text-sm">{metric === 'expense' ? '支出' : '收入'}排行榜</h2>
            {model.ranking.length === 0 ? (
              <EmptyState text="该周期还没有记录" />
            ) : (
              model.ranking.map(({ cat, cents, pct }) => (
                <div
                  key={cat?.id ?? 'x'}
                  id={cat ? `rank-${cat.id}` : undefined}
                  className={`flex items-center gap-3 py-3 border-b border-line last:border-0 transition-opacity ${
                    focusCat && cat && focusCat !== cat.id ? 'opacity-35' : ''
                  }`}
                >
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
        </div>
      </main>
    </div>
  );
}

/** 环比变化率（%）：上期为 0 或负数（结余可能为负）时不给百分比 */
function deltaPct(cur: number, prev: number): number | null {
  if (prev <= 0 || cur < 0) return null;
  return Math.round(((cur - prev) / prev) * 100);
}

function CompareRow({ label, curText, prevText, delta, positiveIsGood }: { label: string; curText: string; prevText: string; delta: number | null; positiveIsGood: boolean }) {
  const tone = delta === null || delta === 0 ? 'text-ink-3' : (delta > 0) === positiveIsGood ? 'text-success' : 'text-danger';
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-line last:border-0">
      <span className="text-sm text-ink-2">{label}</span>
      <div className="flex items-center gap-2 text-sm">
        <b>{curText}</b>
        {delta === null ? (
          <span className="text-xs text-ink-3">上期无对比</span>
        ) : (
          <span className={`flex items-center gap-0.5 text-xs ${tone}`}>
            {delta === 0 ? <Minus size={13} /> : delta > 0 ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
            {delta === 0 ? '持平' : `${Math.abs(delta)}%`}
            <span className="text-ink-3 ml-1">上期 {prevText}</span>
          </span>
        )}
      </div>
    </div>
  );
}
