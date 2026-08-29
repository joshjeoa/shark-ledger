import { useEffect, useMemo, useState } from 'react';
import { ChevronRight, TrendingDown, TrendingUp, Minus, Zap, Crown, CalendarClock } from 'lucide-react';
import { useData } from '../store/data';
import { useSettings } from '../store/settings';
import { monthKey, monthKeyOffset, daysInMonth } from '../utils/date';
import { toYuan, toYuanTrim, parseYuanToCents } from '../utils/money';
import { monthBills, sumByType } from '../utils/stats';
import { Sheet } from '../components/Sheet';
import { useUI } from '../store/ui';
import { useNavigate } from 'react-router-dom';

export function DiscoverPage() {
  const bills = useData((s) => s.bills);
  const budgets = useData((s) => s.budgets);
  const categories = useData((s) => s.categories);
  const currentLedgerId = useData((s) => s.currentLedgerId);
  const setBudget = useData((s) => s.setBudget);
  const hide = useSettings((s) => s.hideAmount);
  const toast = useUI((s) => s.toast);
  const navigate = useNavigate();
  const [editOpen, setEditOpen] = useState(false);
  const [input, setInput] = useState('');

  // 时间基线固定为状态：作为 useMemo 依赖保证稳定（每次渲染 new Date() 会让下方全部 memo 失效）
  const [now, setNow] = useState(() => new Date());
  // PWA 从后台恢复（可能已跨天）时刷新时间基线，避免"本月/日均"停留在昨天
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') setNow(new Date());
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);
  const ym = monthKey(now.getTime());
  // 当月账单只扫一遍：收入/支出合计与本月洞察共用（此前 monthBills 全量过滤跑两次）
  const monthList = useMemo(() => monthBills(bills, currentLedgerId, ym), [bills, currentLedgerId, ym]);
  const sums = useMemo(() => sumByType(monthList), [monthList]);
  const catNames = useMemo(() => new Map(categories.map((c) => [c.id, c.name])), [categories]);

  /** 本月洞察：日均 / 最高单笔 / 环比上月同期 / 月底线性外推 */
  const insight = useMemo(() => {
    const monthExpenseBills = monthList.filter((b) => b.type === 'expense');
    const daysElapsed = now.getDate();
    const daily = daysElapsed > 0 ? Math.round(sums.expense / daysElapsed) : 0;

    const top = monthExpenseBills.reduce<{ cents: number; name: string } | null>((acc, b) => {
      if (!acc || b.amountCents > acc.cents) {
        return { cents: b.amountCents, name: catNames.get(b.categoryId) ?? '未分类' };
      }
      return acc;
    }, null);

    // 上月同期（1 日 ~ 上月同号）支出，用于环比。
    // 上月天数不足时（如 3/31 对 2 月）取上月最后一天，避免 Date 归一化把截止日溢出到本月
    const prevYm = monthKeyOffset(ym, -1);
    const cutoffDay = Math.min(now.getDate(), daysInMonth(prevYm));
    const cutoff = new Date(now.getFullYear(), now.getMonth() - 1, cutoffDay, 23, 59, 59).getTime();
    let prevExpense = 0;
    for (const b of bills) {
      if (b.ledgerId !== currentLedgerId || b.deletedAt || b.type !== 'expense') continue;
      if (monthKey(b.occurredAt) === prevYm && b.occurredAt <= cutoff) prevExpense += b.amountCents;
    }
    const mom =
      prevExpense === 0 ? null : Math.round(((sums.expense - prevExpense) / prevExpense) * 100);

    const projected = daily * daysInMonth(ym);
    return { daily, top, mom, projected };
  }, [monthList, catNames, currentLedgerId, ym, sums.expense, now]);

  const budget = budgets.find((b) => b.yearMonth === ym);
  const used = sums.expense;
  const pct = budget && budget.amountCents > 0 ? Math.min(used / budget.amountCents, 1) : 0;
  const over = budget ? used > budget.amountCents : false;
  const C = 2 * Math.PI * 52;

  // 预算环入场动画：首帧 0，下一帧过渡到目标比例（CSS transition 驱动）
  const [ringOn, setRingOn] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setRingOn(true), 60);
    return () => clearTimeout(t);
  }, []);
  const dash = `${(ringOn ? pct : 0) * C} ${C}`;

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

  const momIcon = insight.mom === null ? <Minus size={14} /> : insight.mom > 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />;
  const momText = insight.mom === null ? '上月无记录' : `${insight.mom > 0 ? '+' : ''}${insight.mom}%`;

  return (
    <div className="h-full overflow-auto bg-surface pb-24">
      <header className="bg-header pt-safe">
        <h1 className="text-center text-lg font-bold py-4">发现</h1>
      </header>

      <div className="px-3 -mt-2 space-y-3">
        {/* 账单卡 */}
        <button className="w-full bg-card rounded-2xl p-4 text-left" onClick={() => navigate('/')}>
          <div className="flex items-center justify-between text-sm font-medium mb-3">
            账单 <ChevronRight size={16} className="text-ink-3" />
          </div>
          <div className="flex items-center gap-4">
            <span className="text-2xl font-bold">{ym.slice(5)}月</span>
            <div className="flex-1 grid grid-cols-3 text-sm">
              <span>
                <p className="text-ink-3 text-xs mb-1">收入</p>
                <b>{show(sums.income)}</b>
              </span>
              <span>
                <p className="text-ink-3 text-xs mb-1">支出</p>
                <b>{show(sums.expense)}</b>
              </span>
              <span>
                <p className="text-ink-3 text-xs mb-1">结余</p>
                <b className={sums.balance < 0 ? 'text-danger' : ''}>{show(sums.balance)}</b>
              </span>
            </div>
          </div>
        </button>

        {/* 预算卡 */}
        <div className="bg-card rounded-2xl p-4">
          <div className="flex items-center justify-between text-sm font-medium mb-3">
            {ym.slice(5)}月总预算
            <button onClick={() => { setInput(budget ? toYuanTrim(budget.amountCents) : ''); setEditOpen(true); }}>
              <ChevronRight size={16} className="text-ink-3" />
            </button>
          </div>
          {!budget ? (
            <button className="w-full h-11 rounded-xl bg-fill text-sm text-ink" onClick={() => setEditOpen(true)}>
              设置本月预算
            </button>
          ) : (
            <div className="flex items-center gap-4">
              <div className="relative w-28 h-28 shrink-0">
                <svg viewBox="0 0 120 120" className="w-28 h-28 -rotate-90">
                  <circle cx="60" cy="60" r="52" fill="none" stroke="var(--line)" strokeWidth="10" />
                  <circle
                    cx="60"
                    cy="60"
                    r="52"
                    fill="none"
                    stroke={over ? 'var(--danger)' : 'var(--primary)'}
                    strokeWidth="10"
                    strokeLinecap="round"
                    strokeDasharray={dash}
                    style={{ transition: 'stroke-dasharray 0.8s ease' }}
                  />
                </svg>
                <span className={`absolute inset-0 flex items-center justify-center text-sm ${over ? 'text-danger' : 'text-ink-2'}`}>
                  {over ? '已超支' : `${Math.round(pct * 100)}%`}
                </span>
              </div>
              <div className="flex-1 text-sm space-y-2">
                <div className="flex justify-between">
                  <span className="text-ink-2">剩余预算</span>
                  <b className={over ? 'text-danger' : ''}>{show(budget.amountCents - used)}</b>
                </div>
                <div className="flex justify-between text-ink-2">
                  <span>本月预算</span>
                  <span>{show(budget.amountCents)}</span>
                </div>
                <div className="flex justify-between text-ink-2">
                  <span>本月支出</span>
                  <span>{show(used)}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 本月洞察 */}
        <div className="bg-card rounded-2xl p-4">
          <h2 className="text-sm font-medium mb-3">本月洞察</h2>
          <div className="grid grid-cols-2 gap-3">
            <Stat icon={<Zap size={14} />} label="日均支出" value={show(insight.daily)} />
            <Stat
              icon={momIcon}
              label="较上月同期"
              value={momText}
              valueClass={insight.mom === null ? '' : insight.mom > 0 ? 'text-danger' : 'text-success'}
            />
            <Stat
              icon={<Crown size={14} />}
              label="最高单笔"
              value={insight.top ? show(insight.top.cents) : '—'}
              sub={insight.top?.name}
            />
            <Stat icon={<CalendarClock size={14} />} label="月底预估" value={insight.projected > 0 ? show(insight.projected) : '—'} />
          </div>
        </div>
      </div>

      <Sheet open={editOpen} onClose={() => setEditOpen(false)} title="设置月预算">
        <div className="px-4 pb-6">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            inputMode="decimal"
            placeholder="预算金额（元）"
            className="w-full h-12 px-4 rounded-xl bg-fill text-ink text-base outline-none mb-4"
          />
          <button className="w-full h-11 rounded-xl bg-primary text-on-primary font-medium" onClick={() => void saveBudget()}>
            保存
          </button>
        </div>
      </Sheet>
    </div>
  );
}

function Stat({ icon, label, value, sub, valueClass }: { icon: React.ReactNode; label: string; value: string; sub?: string; valueClass?: string }) {
  return (
    <div className="bg-fill rounded-xl p-3">
      <p className="flex items-center gap-1 text-xs text-ink-3 mb-1">
        {icon}
        {label}
      </p>
      <p className={`text-lg font-semibold ${valueClass ?? ''}`}>{value}</p>
      {sub && <p className="text-xs text-ink-3 mt-0.5">{sub}</p>}
    </div>
  );
}
