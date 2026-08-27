import { useEffect, useMemo, useState } from 'react';
import { Sheet } from '../components/Sheet';
import { NumberKeyboard } from '../components/NumberKeyboard';
import { CatIcon } from '../utils/iconMap';
import { useData } from '../store/data';
import { useSettings } from '../store/settings';
import { useUI } from '../store/ui';
import { parseYuanToCents, toYuanTrim } from '../utils/money';
import { dayKey } from '../utils/date';
import type { BillType } from '../types';

export function EntrySheet() {
  const open = useUI((s) => s.entryOpen);
  const editing = useUI((s) => s.editingBill);
  const close = useUI((s) => s.closeEntry);
  const toast = useUI((s) => s.toast);
  const { categories, accounts, addBill, updateBill } = useData();
  const settings = useSettings();

  const [type, setType] = useState<BillType>('expense');
  const [amount, setAmount] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [accountId, setAccountId] = useState('');
  const [note, setNote] = useState('');
  const [date, setDate] = useState(dayKey(Date.now()));

  // 打开时初始化（编辑态回填 / 新建态默认值）
  useEffect(() => {
    if (!open) return;
    if (editing) {
      setType(editing.type);
      setAmount(toYuanTrim(editing.amountCents));
      setCategoryId(editing.categoryId);
      setAccountId(editing.accountId ?? '');
      setNote(editing.note);
      setDate(dayKey(editing.occurredAt));
    } else {
      const t = settings.defaultType;
      setType(t);
      setAmount('');
      setCategoryId(settings.lastCategory[t] ?? '');
      setAccountId('');
      setNote('');
      setDate(dayKey(Date.now()));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing]);

  const cats = useMemo(
    () => categories.filter((c) => c.type === type && !c.hidden).sort((a, b) => a.sort - b.sort),
    [categories, type],
  );
  const accs = useMemo(() => [...accounts].sort((a, b) => a.sort - b.sort), [accounts]);

  const switchType = (t: BillType) => {
    setType(t);
    setCategoryId(settings.lastCategory[t] ?? '');
  };

  const save = async () => {
    const cents = parseYuanToCents(amount);
    if (cents === null) {
      toast('请输入正确金额', 'err');
      return;
    }
    if (!categoryId || !cats.some((c) => c.id === categoryId)) {
      toast('请选择分类', 'err');
      return;
    }
    const [y = 2026, m = 1, d = 1] = date.split('-').map(Number);
    const occurredAt = new Date(y, m - 1, d, 12, 0, 0).getTime();
    const payload = { type, amountCents: cents, categoryId, note: note.slice(0, 50), accountId: accountId || undefined, occurredAt };
    settings.set({ lastCategory: { ...settings.lastCategory, [type]: categoryId } });

    if (editing) {
      await updateBill({ ...editing, ...payload });
      toast('已更新');
      close();
    } else {
      await addBill(payload);
      // 连续记账：面板不关，只清金额与备注，分类/账户/日期保留，减少重复操作
      setAmount('');
      setNote('');
      toast('已记一笔，可继续记录');
    }
  };

  return (
    <Sheet open={open} onClose={close} title={editing ? '编辑账单' : '记一笔'}>
      <div className="px-4">
        {/* 类型切换 */}
        <div className="flex justify-center gap-8 mb-4">
          {(['expense', 'income'] as BillType[]).map((t) => (
            <button
              key={t}
              className={`text-base pb-1 border-b-2 font-medium ${type === t ? 'border-ink text-ink' : 'border-transparent text-ink-3'}`}
              onClick={() => switchType(t)}
            >
              {t === 'expense' ? '支出' : '收入'}
            </button>
          ))}
        </div>

        {/* 分类网格 */}
        <div className="grid grid-cols-4 gap-y-3 max-h-52 overflow-auto hide-scrollbar mb-3">
          {cats.map((c) => (
            <button key={c.id} className="flex flex-col items-center gap-1" onClick={() => setCategoryId(c.id)}>
              <span
                className={`w-12 h-12 rounded-full flex items-center justify-center ${
                  categoryId === c.id ? 'bg-primary text-on-primary ring-2 ring-primary ring-offset-2 ring-offset-card' : 'bg-fill text-ink-2'
                }`}
              >
                <CatIcon name={c.icon} className="w-6 h-6" />
              </span>
              <span className={`text-xs ${categoryId === c.id ? 'text-ink font-medium' : 'text-ink-3'}`}>{c.name}</span>
            </button>
          ))}
        </div>

        {/* 账户 + 日期 + 备注 */}
        <div className="flex gap-2 overflow-auto hide-scrollbar mb-2">
          {accs.map((a) => (
            <button
              key={a.id}
              className={`shrink-0 px-3 h-8 rounded-full text-xs ${accountId === a.id ? 'bg-primary text-on-primary font-medium' : 'bg-fill text-ink-2'}`}
              onClick={() => setAccountId(accountId === a.id ? '' : a.id)}
            >
              {a.name}
            </button>
          ))}
        </div>
        <div className="flex gap-2 mb-2">
          <input
            type="date"
            value={date}
            onChange={(e) => e.target.value && setDate(e.target.value)}
            className="flex-1 h-9 px-3 rounded-lg bg-fill text-ink text-sm outline-none"
          />
          <input
            type="text"
            value={note}
            maxLength={50}
            placeholder="备注（可选）"
            onChange={(e) => setNote(e.target.value)}
            className="flex-1 h-9 px-3 rounded-lg bg-fill text-ink text-sm outline-none placeholder:text-ink-3"
          />
        </div>

        {/* 金额显示 + 键盘 */}
        <div className="flex items-end justify-between px-1 h-12">
          <span className="text-2xl font-semibold text-ink">
            <span className="text-base mr-1">¥</span>
            {amount || '0'}
          </span>
          <button
            disabled={!amount}
            className={`h-10 px-8 rounded-full font-medium ${amount ? 'bg-primary text-on-primary' : 'bg-fill text-ink-3'}`}
            onClick={() => void save()}
          >
            {editing ? '保存' : '记一笔'}
          </button>
        </div>
        <NumberKeyboard value={amount} onChange={setAmount} />
      </div>
    </Sheet>
  );
}
