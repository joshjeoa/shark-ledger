/**
 * 年度报告（鲨鱼 Pro，方案见 docs/VIP功能方案.md Phase 1）。
 * 全年收支总览 / 记账足迹 / 12 个月柱状图 / 同比去年，可生成 1080×1440 分享卡片。
 * 统计走 utils/stats 复用口径；卡片固定暗色金融风（与主题无关，保证分享出去辨识度）。
 */
import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, ImageDown, Loader2 } from 'lucide-react';
import { SettingsShell } from './settings/SettingsShell';
import { useData } from '../store/data';
import { useSettings } from '../store/settings';
import { ledgerBills } from '../utils/stats';
import { toYuan } from '../utils/money';
import { monthKey } from '../utils/date';
import { CatIcon } from '../utils/iconMap';
import { downloadBlob } from '../utils/download';
import { useUI } from '../store/ui';
import { usePro } from '../vip/entitlement';
import { UpgradeSheet } from '../vip/ProGate';

interface YearStats {
  hasData: boolean;
  income: number;
  expense: number;
  balance: number;
  billCount: number;
  activeDays: number;
  dailyAvg: number;
  topBill: { cents: number; catName: string; note: string; dayLabel: string } | null;
  topCat: { name: string; icon: string; cents: number; pct: number } | null;
  topMonth: { month: number; cents: number } | null;
  months: { income: number; expense: number }[];
  prevExpense: number;
  prevIncome: number;
  earliestYear: number;
}

function computeYearStats(bills: ReturnType<typeof ledgerBills>, catNames: Map<string, string>, catIcons: Map<string, string>, year: number, nowYear: number): YearStats {
  const months = Array.from({ length: 12 }, () => ({ income: 0, expense: 0 }));
  const byCat = new Map<string, number>();
  const days = new Set<string>();
  const empty: YearStats = {
    hasData: false, income: 0, expense: 0, balance: 0, billCount: 0, activeDays: 0, dailyAvg: 0,
    topBill: null, topCat: null, topMonth: null, months,
    prevExpense: 0, prevIncome: 0, earliestYear: nowYear,
  };
  if (bills.length === 0 && year >= nowYear) return empty;

  let income = 0;
  let expense = 0;
  let billCount = 0;
  let topBill: YearStats['topBill'] = null;
  const dayExpense = new Map<string, number>();
  for (const b of bills) {
    const d = new Date(b.occurredAt);
    const y = d.getFullYear();
    if (y === year) {
      billCount++;
      const m = d.getMonth();
      const dayK = monthKey(b.occurredAt);
      if (b.type === 'income') {
        income += b.amountCents;
        months[m]!.income += b.amountCents;
      } else {
        expense += b.amountCents;
        months[m]!.expense += b.amountCents;
        dayExpense.set(dayK, (dayExpense.get(dayK) ?? 0) + b.amountCents);
        byCat.set(b.categoryId, (byCat.get(b.categoryId) ?? 0) + b.amountCents);
        if (!topBill || b.amountCents > topBill.cents) {
          topBill = { cents: b.amountCents, catName: catNames.get(b.categoryId) ?? '未分类', note: b.note, dayLabel: `${d.getMonth() + 1}月${d.getDate()}日` };
        }
      }
      days.add(dayK);
    }
  }
  // 去年同期（整体收/支）
  let prevExpense = 0;
  let prevIncome = 0;
  for (const b of bills) {
    const y = new Date(b.occurredAt).getFullYear();
    if (y !== year - 1) continue;
    if (b.type === 'income') prevIncome += b.amountCents;
    else prevExpense += b.amountCents;
  }

  const activeDays = days.size;
  const dayExpenseValues = Array.from(dayExpense.values());
  const dailyAvg = dayExpenseValues.length ? Math.round(dayExpenseValues.reduce((s, v) => s + v, 0) / dayExpenseValues.length) : 0;
  const catTotal = Array.from(byCat.values()).reduce((s, v) => s + v, 0);
  let topCat: YearStats['topCat'] = null;
  for (const [id, cents] of byCat) {
    if (!topCat || cents > topCat.cents) topCat = { name: catNames.get(id) ?? '未分类', icon: catIcons.get(id) ?? '', cents, pct: catTotal ? (cents / catTotal) * 100 : 0 };
  }
  let topMonth: YearStats['topMonth'] = null;
  for (let i = 0; i < months.length; i++) {
    const m = months[i]!;
    if (!topMonth || m.expense > topMonth.cents) topMonth = { month: i + 1, cents: m.expense };
  }

  return {
    hasData: billCount > 0,
    income, expense, balance: income - expense, billCount,
    activeDays, dailyAvg, topBill, topCat,
    topMonth: topMonth && topMonth.cents > 0 ? topMonth : null,
    months, prevExpense, prevIncome, earliestYear: nowYear,
  };
}

export function ReportPage() {
  const bills = useData((s) => s.bills);
  const categories = useData((s) => s.categories);
  const currentLedgerId = useData((s) => s.currentLedgerId);
  const hide = useSettings((s) => s.hideAmount);
  const toast = useUI((s) => s.toast);
  const pro = usePro();
  const [yearOffset, setYearOffset] = useState(0);
  const [upsellOpen, setUpsellOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const nowYear = new Date().getFullYear();
  const year = nowYear - yearOffset;

  const catNames = useMemo(() => new Map(categories.map((c) => [c.id, c.name])), [categories]);
  const catIcons = useMemo(() => new Map(categories.map((c) => [c.id, c.icon])), [categories]);
  const allLedger = useMemo(() => ledgerBills(bills, currentLedgerId), [bills, currentLedgerId]);

  const stats = useMemo(() => computeYearStats(allLedger, catNames, catIcons, year, nowYear), [allLedger, catNames, catIcons, year, nowYear]);

  const earliestYear = useMemo(() => {
    let min = nowYear;
    for (const b of allLedger) {
      const y = new Date(b.occurredAt).getFullYear();
      if (y < min) min = y;
    }
    return min;
  }, [allLedger, nowYear]);

  const show = (c: number) => (hide ? '****' : toYuan(c));

  // 生成分享卡片（1080×1440，暗色金融风）
  const saveCard = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const canvas = await renderReportCard(year, stats, hide);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob((b) => resolve(b), 'image/png'));
      if (!blob) throw new Error();
      await downloadBlob(`鲨鱼记账-${year}年度报告.png`, blob);
      toast('卡片已生成');
    } catch {
      toast('卡片生成失败', 'err');
    } finally {
      setSaving(false);
    }
  };

  // 直接访问路由的非 Pro 用户：给出开通引导（客户端门槛）
  if (!pro) {
    return (
      <SettingsShell title="年度报告">
        <div className="px-3 pt-3">
          <div className="rounded-2xl bg-card p-6 text-center">
            <p className="text-sm font-medium mb-2">年度报告是 Pro 功能</p>
            <p className="text-xs text-ink-3 mb-4">请在「设置 → 鲨鱼 Pro」中开通后使用</p>
            <button className="h-10 px-6 rounded-full bg-primary text-on-primary text-sm font-medium" onClick={() => setUpsellOpen(true)}>
              了解鲨鱼 Pro
            </button>
          </div>
        </div>
        <UpgradeSheet open={upsellOpen} onClose={() => setUpsellOpen(false)} feature="年度报告" />
      </SettingsShell>
    );
  }

  const mom = stats.prevExpense > 0 ? Math.round(((stats.expense - stats.prevExpense) / stats.prevExpense) * 100) : null;
  const maxMonth = Math.max(...stats.months.map((m) => Math.max(m.income, m.expense)), 1);

  return (
    <SettingsShell title={`${year} 年度报告`}>
      <div className="px-3 pt-3 space-y-3 pb-6">
        {/* 年份切换 */}
        <div className="flex items-center justify-center gap-4 py-1">
          <button
            aria-label="上一年"
            className="w-9 h-9 rounded-full bg-card flex items-center justify-center disabled:opacity-40"
            disabled={year - 1 < earliestYear}
            onClick={() => setYearOffset((v) => v + 1)}
          >
            <ChevronLeft size={18} />
          </button>
          <span className="text-lg font-bold">{year}</span>
          <button
            aria-label="下一年"
            className="w-9 h-9 rounded-full bg-card flex items-center justify-center disabled:opacity-40"
            disabled={year >= nowYear}
            onClick={() => setYearOffset((v) => v - 1)}
          >
            <ChevronRight size={18} />
          </button>
        </div>

        {!stats.hasData ? (
          <div className="rounded-2xl bg-card p-8 text-center text-sm text-ink-3">{year} 年还没有记账数据</div>
        ) : (
          <>
            {/* 总览 */}
            <div className="rounded-2xl bg-card p-5">
              <p className="text-xs text-ink-3 mb-1">{year} 年总支出</p>
              <p className="text-3xl font-bold tabular-nums">{show(stats.expense)}</p>
              <div className="grid grid-cols-3 gap-2 mt-4 text-sm">
                <div className="bg-fill rounded-xl p-3">
                  <p className="text-xs text-ink-3 mb-1">总收入</p>
                  <b className="tabular-nums">{show(stats.income)}</b>
                </div>
                <div className="bg-fill rounded-xl p-3">
                  <p className="text-xs text-ink-3 mb-1">结余</p>
                  <b className={`tabular-nums ${stats.balance < 0 ? 'text-danger' : ''}`}>{show(stats.balance)}</b>
                </div>
                <div className="bg-fill rounded-xl p-3">
                  <p className="text-xs text-ink-3 mb-1">日均支出</p>
                  <b className="tabular-nums">{show(stats.dailyAvg)}</b>
                </div>
              </div>
              {mom !== null && (
                <p className="text-xs text-ink-3 mt-3">
                  支出比 {year - 1} 年
                  <span className={mom > 0 ? 'text-danger font-medium' : 'text-success font-medium'}> {mom > 0 ? '多' : '少'} {Math.abs(mom)}% </span>
                  （去年 {show(stats.prevExpense)}）
                </p>
              )}
            </div>

            {/* 记账足迹 */}
            <div className="rounded-2xl bg-card p-5">
              <h2 className="text-sm font-medium mb-3">这一年的足迹</h2>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="bg-fill rounded-xl p-3">
                  <p className="text-xs text-ink-3 mb-1">记了</p>
                  <b>
                    {stats.billCount} 笔 <span className="text-xs text-ink-3 font-normal">· {stats.activeDays} 天</span>
                  </b>
                </div>
                <div className="bg-fill rounded-xl p-3">
                  <p className="text-xs text-ink-3 mb-1">花得最多的月份</p>
                  <b>{stats.topMonth ? `${stats.topMonth.month} 月 · ${show(stats.topMonth.cents)}` : '—'}</b>
                </div>
                <div className="bg-fill rounded-xl p-3 col-span-2 flex items-center gap-3">
                  {stats.topCat && (
                    <span className="w-10 h-10 rounded-full bg-card flex items-center justify-center text-ink-2 shrink-0">
                      <CatIcon name={stats.topCat.icon} className="w-5 h-5" />
                    </span>
                  )}
                  <div>
                    <p className="text-xs text-ink-3 mb-0.5">最常花钱的分类</p>
                    <b>
                      {stats.topCat ? `${stats.topCat.name} · ${show(stats.topCat.cents)}` : '—'}
                      {stats.topCat && <span className="text-xs text-ink-3 font-normal">（占支出 {stats.topCat.pct.toFixed(0)}%）</span>}
                    </b>
                  </div>
                </div>
                {stats.topBill && (
                  <div className="bg-fill rounded-xl p-3 col-span-2">
                    <p className="text-xs text-ink-3 mb-0.5">最大的一笔</p>
                    <b>
                      {show(stats.topBill.cents)} <span className="text-xs text-ink-3 font-normal">· {stats.topBill.catName}{stats.topBill.note ? ` · ${stats.topBill.note}` : ''} · {stats.topBill.dayLabel}</span>
                    </b>
                  </div>
                )}
              </div>
            </div>

            {/* 月度柱状图（纯 CSS，不引 chart.js） */}
            <div className="rounded-2xl bg-card p-5">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-medium">每月收支</h2>
                <div className="flex items-center gap-3 text-xs text-ink-3">
                  <span className="flex items-center gap-1">
                    <i className="w-2 h-2 rounded-full bg-primary inline-block" /> 支出
                  </span>
                  <span className="flex items-center gap-1">
                    <i className="w-2 h-2 rounded-full bg-success inline-block" /> 收入
                  </span>
                </div>
              </div>
              <div className="flex items-end gap-1.5 h-36">
                {stats.months.map((m, i) => (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1 h-full justify-end" title={`${i + 1}月 支出${toYuan(m.expense)} 收入${toYuan(m.income)}`}>
                    <div className="w-full flex items-end justify-center gap-0.5 h-full">
                      <div className="w-1/2 max-w-3 rounded-t bg-success/80" style={{ height: `${(m.income / maxMonth) * 100}%` }} />
                      <div className="w-1/2 max-w-3 rounded-t bg-primary" style={{ height: `${(m.expense / maxMonth) * 100}%` }} />
                    </div>
                    <span className="text-[9px] text-ink-3">{i + 1}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* 分享卡片 */}
            <div className="rounded-2xl bg-card p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-medium">年度报告卡片</h2>
                  <p className="text-xs text-ink-3 mt-1">
                    生成 1080×1440 分享图{hide ? '；当前开启了隐藏金额，卡片中金额将打码' : ''}
                  </p>
                </div>
                <button
                  className="h-10 px-4 rounded-xl bg-primary text-on-primary text-sm font-medium flex items-center gap-1.5 shrink-0"
                  onClick={() => void saveCard()}
                >
                  {saving ? <Loader2 size={15} className="animate-spin" /> : <ImageDown size={15} />}
                  生成卡片
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </SettingsShell>
  );
}

// ---------- 分享卡片绘制 ----------

const CARD_W = 1080;
const CARD_H = 1440;

async function renderReportCard(year: number, stats: YearStats, hide: boolean): Promise<HTMLCanvasElement> {
  const canvas = document.createElement('canvas');
  canvas.width = CARD_W;
  canvas.height = CARD_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas unavailable');
  const mask = (c: number) => (hide ? '****' : toYuan(c));
  const INK = '#F0F3F8';
  const INK2 = '#A3ACBC';
  const INK3 = '#6E7787';
  const GOLD = '#E4C066';
  const GREEN = '#43D9A3';
  const RED = '#FF6B6B';
  const CARD = '#151A23';
  const FILL = '#1F2632';
  const FONT = '-apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif';

  // 背景：深炭 + 顶部金色微光
  ctx.fillStyle = '#0B0E13';
  ctx.fillRect(0, 0, CARD_W, CARD_H);
  const glow = ctx.createLinearGradient(0, 0, 0, 520);
  glow.addColorStop(0, 'rgba(228,192,102,0.16)');
  glow.addColorStop(1, 'rgba(228,192,102,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, CARD_W, 520);

  // 头部
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = INK2;
  ctx.font = `500 34px ${FONT}`;
  ctx.fillText('鲨鱼记账 · SHARK LEDGER', 80, 120);
  ctx.fillStyle = GOLD;
  ctx.font = `700 76px ${FONT}`;
  ctx.fillText(`${year} 年度报告`, 80, 220);
  ctx.fillStyle = INK3;
  ctx.font = `400 30px ${FONT}`;
  ctx.fillText(`记录了 ${stats.billCount} 笔账 · ${stats.activeDays} 天`, 80, 280);

  // 总支出大数字
  ctx.fillStyle = INK;
  ctx.font = `400 34px ${FONT}`;
  ctx.fillText('全年总支出', 80, 390);
  ctx.font = `700 120px ${FONT}`;
  ctx.fillText(`¥${mask(stats.expense)}`, 80, 510);

  // 三宫格：收入 / 结余 / 日均
  const cells: [string, string, string][] = [
    ['总收入', `¥${mask(stats.income)}`, GREEN],
    ['结余', `¥${mask(stats.balance)}`, stats.balance < 0 ? RED : INK],
    ['日均支出', `¥${mask(stats.dailyAvg)}`, INK],
  ];
  cells.forEach(([label, value, color], i) => {
    const x = 80 + i * 320;
    ctx.fillStyle = CARD;
    roundRect(ctx, x, 580, 280, 170, 24);
    ctx.fill();
    ctx.fillStyle = INK3;
    ctx.font = `400 26px ${FONT}`;
    ctx.fillText(label, x + 28, 640);
    ctx.fillStyle = color;
    ctx.font = `700 40px ${FONT}`;
    ctx.fillText(value, x + 28, 710);
  });

  // 足迹条目
  const lines: [string, string][] = [];
  if (stats.topCat) lines.push(['最常花钱的分类', `${stats.topCat.name} · ¥${mask(stats.topCat.cents)}（${stats.topCat.pct.toFixed(0)}%）`]);
  if (stats.topMonth) lines.push(['花得最多的月份', `${stats.topMonth.month} 月 · ¥${mask(stats.topMonth.cents)}`]);
  if (stats.topBill) lines.push(['最大的一笔', `¥${mask(stats.topBill.cents)} · ${stats.topBill.catName}${stats.topBill.note ? `「${stats.topBill.note}」` : ''} · ${stats.topBill.dayLabel}`]);
  lines.forEach(([label, value], i) => {
    const y = 880 + i * 96;
    ctx.fillStyle = FILL;
    roundRect(ctx, 80, y - 44, CARD_W - 160, 76, 20);
    ctx.fill();
    ctx.fillStyle = INK3;
    ctx.font = `400 26px ${FONT}`;
    ctx.fillText(label, 108, y + 6);
    ctx.fillStyle = INK;
    ctx.font = `600 28px ${FONT}`;
    const w = ctx.measureText(value).width;
    ctx.fillText(value, CARD_W - 108 - w, y + 6);
  });

  // 12 个月柱状图
  ctx.fillStyle = INK2;
  ctx.font = `600 30px ${FONT}`;
  ctx.fillText('每月支出', 80, 1130);
  const chartTop = 1160;
  const chartH = 150;
  const barW = 44;
  const gap = (CARD_W - 160 - 12 * barW) / 11;
  const maxExp = Math.max(...stats.months.map((m) => m.expense), 1);
  stats.months.forEach((m, i) => {
    const h = Math.round((m.expense / maxExp) * chartH);
    const x = 80 + i * (barW + gap);
    ctx.fillStyle = m.expense > 0 ? GOLD : 'rgba(255,255,255,0.08)';
    roundRect(ctx, x, chartTop + chartH - h, barW, Math.max(h, 8), 10);
    ctx.fill();
    ctx.fillStyle = INK3;
    ctx.font = `400 20px ${FONT}`;
    const label = String(i + 1);
    const lw = ctx.measureText(label).width;
    ctx.fillText(label, x + (barW - lw) / 2, chartTop + chartH + 36);
  });

  // 页脚
  ctx.fillStyle = INK3;
  ctx.font = `400 26px ${FONT}`;
  ctx.fillText('由鲨鱼记账生成 · 记账，从今天开始', 80, CARD_H - 60);

  return canvas;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
