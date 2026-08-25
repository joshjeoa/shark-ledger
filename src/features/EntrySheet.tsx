import { useEffect, useMemo, useState } from 'react';
import { Sheet } from '../components/Sheet';
import { NumberKeyboard } from '../components/NumberKeyboard';
import { CatIcon } from '../utils/iconMap';
import { useData } from '../store/data';
import { useSettings } from '../store/settings';
import { useUI } from '../store/ui';
import { parseYuanToCents } from '../utils/money';
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
      setAmount((editing.amountCents / 100).toFixed(2).replace(/\.?0+$/, ''));
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
    if (editing) {
      await updateBill({ ...editing, type, amountCents: cents, categoryId, note: note.slice(0, 50), accountId: accountId || undefined, occurredAt });
      toast('已更新');
    } else {
      await addBill({ type, amountCents: cents, categoryId, note: note.slice(0, 50), accountId: accountId || undefined, occurredAt });
      toast('已记一笔');
    }
    settings.set({ lastCategory: { ...settings.lastCategory, [type]: categoryId } });
    close();
  };

  return (
    <Sheet open={open} onClose={close}>
      <div className="px-4">
        {/* 类型切换 */}
        <div className="flex justify-center gap-8 mb-4">
          {(['expense', 'income'] as BillType[]).map((t) => (
            <button
              key={t}
              className={`text-base pb-1 border-b-2 font-medium ${type === t ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-400'}`}
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
                  categoryId === c.id ? 'bg-primary text-gray-900 ring-2 ring-primary/40' : 'bg-gray-100 text-gray-600'
                }`}
              >
                <CatIcon name={c.icon} className="w-6 h-6" />
              </span>
              <span className={`text-xs ${categoryId === c.id ? 'text-gray-900 font-medium' : 'text-gray-500'}`}>{c.name}</span>
            </button>
          ))}
        </div>

        {/* 账户 + 日期 + 备注 */}
        <div className="flex gap-2 overflow-auto hide-scrollbar mb-2">
          {accs.map((a) => (
            <button
              key={a.id}
              className={`shrink-0 px-3 h-8 rounded-full text-xs ${accountId === a.id ? 'bg-primary text-gray-900 font-medium' : 'bg-gray-100 text-gray-600'}`}
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
            className="flex-1 h-9 px-3 rounded-lg bg-gray-100 text-sm outline-none"
          />
          <input
            type="text"
            value={note}
            maxLength={50}
            placeholder="备注（可选）"
            onChange={(e) => setNote(e.target.value)}
            className="flex-1 h-9 px-3 rounded-lg bg-gray-100 text-sm outline-none"
          />
        </div>

        {/* 金额显示 + 键盘 */}
        <div className="flex items-end justify-between px-1 h-12">
          <span className="text-2xl font-semibold text-gray-900">
            <span className="text-base mr-1">¥</span>
            {amount || '0'}
          </span>
          <button
            disabled={!amount}
            className={`h-10 px-8 rounded-full font-medium ${amount ? 'bg-primary text-gray-900' : 'bg-gray-200 text-gray-400'}`}
            onClick={() => void save()}
          >
            保存
          </button>
        </div>
        <NumberKeyboard value={amount} onChange={setAmount} />
      </div>
    </Sheet>
  );
}
