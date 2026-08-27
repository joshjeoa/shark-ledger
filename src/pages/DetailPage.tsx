import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, ChevronDown, Eye, EyeOff, Search, X } from 'lucide-react';
import { useData } from '../store/data';
import { useSettings } from '../store/settings';
import { useUI } from '../store/ui';
import { dayKey, monthKey, weekdayLabel, monthLabelCN } from '../utils/date';
import { toYuan } from '../utils/money';
import { CatIcon } from '../utils/iconMap';
import { MonthPicker } from '../components/MonthPicker';
import { EmptyState } from '../components/EmptyState';
import { SyncChip } from '../components/SyncChip';
import { Sheet } from '../components/Sheet';
import type { Bill, Category } from '../types';
import { useNavigate } from 'react-router-dom';

export function DetailPage() {
  const { bills, categories, ledgers, currentLedgerId, setCurrentLedger, removeBill } = useData();
  const settings = useSettings();
  const openEntry = useUI((s) => s.openEntry);
  const confirm = useUI((s) => s.confirm);
  const toast = useUI((s) => s.toast);
  const navigate = useNavigate();

  const [month, setMonth] = useState(() => monthKey(Date.now()));
  const [pickerOpen, setPickerOpen] = useState(false);
  const [ledgerOpen, setLedgerOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [filterCat, setFilterCat] = useState('');

  const hide = settings.hideAmount;
  const show = (cents: number) => (hide ? '****' : toYuan(cents));

  const monthBills = useMemo(
    () => bills.filter((b) => b.ledgerId === currentLedgerId && !b.deletedAt && monthKey(b.occurredAt) === month),
    [bills, currentLedgerId, month],
  );

  // 分类 id → 对象索引，避免过滤/渲染时对每条账单做线性 find
  const catMap = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);

  const sums = useMemo(() => {
    let income = 0;
    let expense = 0;
    for (const b of monthBills) {
      if (b.type === 'income') income += b.amountCents;
      else expense += b.amountCents;
    }
    return { income, expense, balance: income - expense };
  }, [monthBills]);

  /** 当月出现过的分类（筛选 chips 用），按金额降序 */
  const monthCats = useMemo(() => {
    const byCat = new Map<string, number>();
    for (const b of monthBills) byCat.set(b.categoryId, (byCat.get(b.categoryId) ?? 0) + b.amountCents);
    return Array.from(byCat.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([id, cents]) => ({ cat: catMap.get(id), cents }))
      .filter((x): x is { cat: Category; cents: number } => !!x.cat);
  }, [monthBills, catMap]);

  const filtered = useMemo(() => {
    const q = query.trim();
    return monthBills.filter((b) => {
      if (filterCat && b.categoryId !== filterCat) return false;
      if (!q) return true;
      const cat = catMap.get(b.categoryId);
      return b.note.includes(q) || (cat?.name ?? '').includes(q) || toYuan(b.amountCents).startsWith(q);
    });
  }, [monthBills, query, filterCat, catMap]);

  const groups = useMemo(() => {
    const map = new Map<string, Bill[]>();
    for (const b of filtered) {
      const k = dayKey(b.occurredAt);
      const arr = map.get(k);
      if (arr) arr.push(b);
      else map.set(k, [b]);
    }
    // 组内：按记账先后倒序（后记的在上）；同毫秒再按账单时间倒序
    for (const arr of map.values()) {
      arr.sort((a, b) => b.createdAt - a.createdAt || b.occurredAt - a.occurredAt);
    }
    // 分组：按日期倒序（今天在上，昨天在下）
    return Array.from(map.entries()).sort((a, b) => (a[0] > b[0] ? -1 : 1));
  }, [filtered]);

  // 稳定回调：配合 memo(BillRow)，让搜索输入等父组件重渲不再逐行重渲账单列表
  const onTap = useCallback((b: Bill) => openEntry(b), [openEntry]);
  const onDelete = useCallback(
    async (b: Bill) => {
      const ok = await confirm({ title: '删除这笔记录？', message: '删除后 30 天内可在 设置→数据恢复 中找回', confirmText: '删除', danger: true });
      if (!ok) return;
      await removeBill(b.id);
      toast('已删除');
    },
    [confirm, removeBill, toast],
  );

  const curLedger = ledgers.find((l) => l.id === currentLedgerId);

  return (
    <div className="h-full flex flex-col">
      {/* Header（浅色=品牌色，暗色=沉浸深色） */}
      <header className="bg-header pt-safe">
        <div className="px-4 pt-2 pb-3">
          <div className="flex items-center justify-between">
            <button className="flex items-center gap-0.5 text-sm font-medium" onClick={() => setLedgerOpen(true)}>
              {curLedger?.name ?? '默认账本'}
              <ChevronDown size={16} />
            </button>
            <h1 className="text-lg font-bold tracking-wide">鲨鱼记账</h1>
            <div className="flex items-center gap-3">
              <button aria-label="搜索" onClick={() => { setSearchOpen((v) => !v); setQuery(''); }}>
                <Search size={20} />
              </button>
              <button aria-label="选择月份" onClick={() => setPickerOpen(true)}>
                <CalendarDays size={20} />
              </button>
            </div>
          </div>
          <div className="flex items-end justify-between mt-3">
            <button className="flex items-center gap-1" onClick={() => setPickerOpen(true)}>
              <span className="text-3xl font-bold leading-none">{monthLabelCN(month)}</span>
              <ChevronDown size={18} className="mb-0.5" />
            </button>
            <div className="flex items-center gap-2">
              <SyncChip onClick={() => navigate('/settings/backup')} />
              <button aria-label="隐藏金额" onClick={() => settings.set({ hideAmount: !hide })}>
                {hide ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>
          {/* 收入 / 支出 / 结余 三段式 */}
          <div className="grid grid-cols-3 gap-2 mt-3">
            <div className="rounded-xl bg-header-fill px-3 py-2">
              <p className="text-[11px] text-header-fill-ink/70">收入</p>
              <p className="text-base font-semibold text-header-fill-ink leading-tight">{show(sums.income)}</p>
            </div>
            <div className="rounded-xl bg-header-fill px-3 py-2">
              <p className="text-[11px] text-header-fill-ink/70">支出</p>
              <p className="text-base font-semibold text-header-fill-ink leading-tight">{show(sums.expense)}</p>
            </div>
            <div className="rounded-xl bg-header-fill px-3 py-2">
              <p className="text-[11px] text-header-fill-ink/70">结余</p>
              <p className={`text-base font-semibold leading-tight ${sums.balance < 0 ? 'text-danger' : 'text-header-fill-ink'}`}>
                {sums.balance < 0 ? '-' : ''}
                {show(Math.abs(sums.balance))}
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* 搜索栏 */}
      {searchOpen && (
        <div className="bg-header px-4 pb-3">
          <div className="flex items-center gap-2 bg-header-fill text-header-fill-ink rounded-full px-3 h-9">
            <Search size={16} className="text-ink-3" />
            <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜索备注 / 分类 / 金额" className="flex-1 text-sm outline-none bg-transparent" />
            {query && (
              <button onClick={() => setQuery('')} aria-label="清空">
                <X size={16} className="text-ink-3" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* 分类筛选 chips：搜索栏下方，与文本搜索叠加生效 */}
      {monthCats.length > 1 && (
        <div className="bg-surface border-b border-line">
          <div className="flex gap-2 px-4 py-2 overflow-auto hide-scrollbar">
            <button
              className={`shrink-0 px-3 h-7 rounded-full text-xs ${!filterCat ? 'bg-ink text-surface font-medium' : 'bg-fill text-ink-2'}`}
              onClick={() => setFilterCat('')}
            >
              全部
            </button>
            {monthCats.map(({ cat }) => (
              <button
                key={cat.id}
                className={`shrink-0 flex items-center gap-1 px-3 h-7 rounded-full text-xs ${filterCat === cat.id ? 'bg-ink text-surface font-medium' : 'bg-fill text-ink-2'}`}
                onClick={() => setFilterCat(filterCat === cat.id ? '' : cat.id)}
              >
                <CatIcon name={cat.icon} className="w-3.5 h-3.5" />
                {cat.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 列表 */}
      <main className="flex-1 overflow-auto bg-surface rounded-t-2xl -mt-2 relative pb-24">
        {groups.length === 0 ? (
          <EmptyState text={query ? '没有找到相关账单' : '开始记第一笔吧'} actionLabel={query ? undefined : '记一笔'} onAction={() => openEntry(null)} />
        ) : (
          groups.map(([day, items]) => {
            const t = new Date(`${day}T12:00:00`).getTime();
            const dayIncome = items.filter((b) => b.type === 'income').reduce((s, b) => s + b.amountCents, 0);
            const dayExpense = items.filter((b) => b.type === 'expense').reduce((s, b) => s + b.amountCents, 0);
            return (
              <section key={day}>
                <div className="flex justify-between px-4 py-2 text-xs text-ink-3">
                  <span>
                    {day.slice(5).replace('-', '月')}日 {weekdayLabel(t)}
                  </span>
                  <span>
                    {dayIncome > 0 && `收入：${show(dayIncome)}`}
                    {dayIncome > 0 && dayExpense > 0 && '  '}
                    {dayExpense > 0 && `支出：${show(dayExpense)}`}
                  </span>
                </div>
                <div className="bg-card">
                  {items.map((b) => (
                    <BillRow key={b.id} bill={b} hide={hide} color={settings.colorAmounts} onTap={onTap} onDelete={onDelete} cat={catMap.get(b.categoryId)} />
                  ))}
                </div>
              </section>
            );
          })
        )}
      </main>

      <MonthPicker open={pickerOpen} value={month} onChange={setMonth} onClose={() => setPickerOpen(false)} />

      <Sheet open={ledgerOpen} onClose={() => setLedgerOpen(false)} title="切换账本">
        <div className="px-4 pb-6 space-y-2">
          {ledgers.map((l) => (
            <button
              key={l.id}
              className={`w-full h-11 rounded-xl text-sm ${l.id === currentLedgerId ? 'bg-primary text-on-primary font-medium' : 'bg-fill text-ink-2'}`}
              onClick={() => {
                setCurrentLedger(l.id);
                setLedgerOpen(false);
              }}
            >
              {l.name}
            </button>
          ))}
          <button className="w-full h-11 rounded-xl text-sm text-ink-3 bg-surface" onClick={() => { setLedgerOpen(false); navigate('/settings/ledgers'); }}>
            管理账本
          </button>
        </div>
      </Sheet>
    </div>
  );
}

const BillRow = memo(function BillRow({
  bill,
  hide,
  color,
  onTap,
  onDelete,
  cat,
}: {
  bill: Bill;
  hide: boolean;
  color: boolean;
  onTap: (b: Bill) => void;
  onDelete: (b: Bill) => void | Promise<void>;
  cat?: Category;
}) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fired = useRef(false);
  const start = () => {
    fired.current = false;
    timer.current = setTimeout(() => {
      fired.current = true;
      void onDelete(bill);
    }, 500);
  };
  const stop = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  // 卸载时清掉未触发的长按计时器：切月/同步刷新导致行消失时不再误弹删除确认
  useEffect(() => stop, []);
  const amountColor = color ? (bill.type === 'expense' ? 'text-danger' : 'text-success') : 'text-ink';
  return (
    <div
      className="flex items-center gap-3 px-4 py-3 border-b border-line no-callout active:bg-surface transition-colors"
      onTouchStart={start}
      onTouchEnd={stop}
      onTouchMove={stop}
      onTouchCancel={stop}
      onClick={() => {
        if (fired.current) {
          fired.current = false;
          return;
        }
        onTap(bill);
      }}
    >
      <span className="w-10 h-10 rounded-full bg-fill flex items-center justify-center text-ink-2">
        <CatIcon name={cat?.icon ?? ''} className="w-5 h-5" />
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-ink truncate">{cat?.name ?? '未分类'}</p>
        {bill.note && <p className="text-xs text-ink-3 truncate">{bill.note}</p>}
      </div>
      <span className={`text-base font-medium ${amountColor}`}>
        {bill.type === 'expense' ? '-' : '+'}
        {hide ? '****' : toYuan(bill.amountCents)}
      </span>
    </div>
  );
});
