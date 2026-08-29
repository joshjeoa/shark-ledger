import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Camera, X } from 'lucide-react';
import { Sheet } from '../components/Sheet';
import { NumberKeyboard } from '../components/NumberKeyboard';
import { CatIcon } from '../utils/iconMap';
import { useData } from '../store/data';
import { useSettings } from '../store/settings';
import { useUI } from '../store/ui';
import { parseYuanToCents, toYuanTrim } from '../utils/money';
import { compressImage, MAX_PHOTOS_PER_BILL } from '../utils/image';
import { repo } from '../db/repo';
import { uuid } from '../utils/compat';
import { dayKey } from '../utils/date';
import type { Account, Category, BillType } from '../types';

interface PendingPhoto {
  id: string;
  blob: Blob;
  url: string;
  /** 已写入 IndexedDB 后的照片 id：保存失败重试时据此跳过，避免重复入库 */
  storedId?: string;
}

export function EntrySheet() {
  const open = useUI((s) => s.entryOpen);
  const editing = useUI((s) => s.editingBill);
  const close = useUI((s) => s.closeEntry);
  const toast = useUI((s) => s.toast);
  const categories = useData((s) => s.categories);
  const accounts = useData((s) => s.accounts);
  const mode = useData((s) => s.mode);
  const addBill = useData((s) => s.addBill);
  const updateBill = useData((s) => s.updateBill);
  const defaultType = useSettings((s) => s.defaultType);
  const lastCategory = useSettings((s) => s.lastCategory);
  const setSettings = useSettings((s) => s.set);

  const [type, setType] = useState<BillType>('expense');
  const [amount, setAmount] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [accountId, setAccountId] = useState('');
  const [note, setNote] = useState('');
  const [date, setDate] = useState(dayKey(Date.now()));
  // 凭证照片：pending = 本次新增（含预览 URL），kept = 编辑态保留的已有照片 id
  const [pending, setPending] = useState<PendingPhoto[]>([]);
  const [kept, setKept] = useState<string[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const resetPhotos = () => {
    for (const p of pending) URL.revokeObjectURL(p.url);
    setPending([]);
    setKept([]);
  };

  // 打开时初始化（编辑态回填 / 新建态默认值）
  useEffect(() => {
    if (!open) {
      resetPhotos();
      return;
    }
    if (editing) {
      setType(editing.type);
      setAmount(toYuanTrim(editing.amountCents));
      setCategoryId(editing.categoryId);
      setAccountId(editing.accountId ?? '');
      setNote(editing.note);
      setDate(dayKey(editing.occurredAt));
      setKept(editing.photoIds ?? []);
      setPending([]);
    } else {
      const t = defaultType;
      setType(t);
      setAmount('');
      setCategoryId(lastCategory[t] ?? '');
      setAccountId('');
      setNote('');
      setDate(dayKey(Date.now()));
      setPending([]);
      setKept([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing]);

  const onPickFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    if (mode !== 'idb') {
      toast('当前存储模式不支持照片（需 IndexedDB）', 'err');
      return;
    }
    const room = MAX_PHOTOS_PER_BILL - pending.length - kept.length;
    if (room <= 0) {
      toast(`每笔最多 ${MAX_PHOTOS_PER_BILL} 张照片`, 'err');
      return;
    }
    const picked = Array.from(files).slice(0, room);
    const next: PendingPhoto[] = [];
    for (const f of picked) {
      const blob = await compressImage(f);
      if (!blob) {
        toast('有图片无法识别，已跳过', 'err');
        continue;
      }
      next.push({ id: uuid(), blob, url: URL.createObjectURL(blob) });
    }
    if (next.length) setPending((v) => [...v, ...next]);
  };

  const removePhoto = (kind: 'pending' | 'kept', id: string) => {
    if (kind === 'pending') {
      setPending((v) => {
        const hit = v.find((p) => p.id === id);
        if (hit) URL.revokeObjectURL(hit.url);
        return v.filter((p) => p.id !== id);
      });
    } else {
      setKept((v) => v.filter((x) => x !== id));
    }
  };

  const cats = useMemo(
    () => categories.filter((c) => c.type === type && !c.hidden).sort((a, b) => a.sort - b.sort),
    [categories, type],
  );
  const accs = useMemo(() => [...accounts].sort((a, b) => a.sort - b.sort), [accounts]);

  const switchType = (t: BillType) => {
    setType(t);
    setCategoryId(lastCategory[t] ?? '');
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

    // 照片落库拿 id：挂账单 id 下（新建先挂 'pending' 占位，账单生成后迁移归属）；
    // 已入库的跳过——保存失败保留面板重试时不会重复写入
    const billId = editing?.id ?? 'pending';
    for (const p of pending) {
      if (p.storedId) continue;
      const id = await repo.putPhoto(billId, p.blob);
      if (id) p.storedId = id;
    }
    const photoIds = [...kept, ...(pending.map((p) => p.storedId).filter((x): x is string => !!x))];
    const payload = { type, amountCents: cents, categoryId, note: note.slice(0, 50), accountId: accountId || undefined, occurredAt, photoIds };
    setSettings({ lastCategory: { ...lastCategory, [type]: categoryId } });

    if (editing) {
      await updateBill({ ...editing, ...payload });
    } else {
      const bill = await addBill(payload);
      const newIds = photoIds.slice(kept.length);
      for (const id of newIds) await repo.reassignPhoto(id, bill.id);
    }
    // repo 吞掉 IDB 异常只置 writeFailed，promise 永不 reject：写失败时保留面板并提示
    if (useData.getState().writeFailed) {
      toast('保存失败，数据未持久化，请导出备份', 'err');
      return;
    }
    toast(editing ? '已更新' : '已记一笔');
    for (const p of pending) URL.revokeObjectURL(p.url);
    setPending([]);
    setKept([]);
    close();
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

        {/* 分类网格：memo 化，金额键盘/备注输入时不重渲 */}
        <CatGrid cats={cats} selected={categoryId} onSelect={setCategoryId} />

        {/* 账户 + 日期 + 备注 */}
        <AccChips accs={accs} selected={accountId} onToggle={setAccountId} />
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

        {/* 凭证照片：吃了吗/买了什么拍一张，最多 3 张，本地存储不占云备份 */}
        <div className="flex gap-2 items-center mb-2 flex-wrap">
          <button
            type="button"
            className="w-14 h-14 rounded-lg bg-fill flex flex-col items-center justify-center text-ink-3 no-callout active:bg-line"
            onClick={() => fileRef.current?.click()}
          >
            <Camera size={20} />
            <span className="text-[10px] mt-0.5">照片</span>
          </button>
          {kept.map((id) => (
            <KeptThumb key={id} id={id} onRemove={() => removePhoto('kept', id)} />
          ))}
          {pending.map((p) => (
            <span key={p.id} className="relative shrink-0">
              <img src={p.url} alt="新照片" className="w-14 h-14 rounded-lg object-cover" />
              <button
                type="button"
                aria-label="移除照片"
                className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-ink text-surface flex items-center justify-center"
                onClick={() => removePhoto('pending', p.id)}
              >
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            void onPickFiles(e.target.files);
            e.target.value = '';
          }}
        />

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

const CatGrid = memo(function CatGrid({ cats, selected, onSelect }: { cats: Category[]; selected: string; onSelect: (id: string) => void }) {  return (
    <div className="grid grid-cols-4 gap-y-3 max-h-52 overflow-auto hide-scrollbar mb-3">
      {cats.map((c) => (
        <button key={c.id} className="flex flex-col items-center gap-1" onClick={() => onSelect(c.id)}>
          <span
            className={`w-12 h-12 rounded-full flex items-center justify-center ${
              selected === c.id ? 'bg-primary text-on-primary ring-2 ring-primary ring-offset-2 ring-offset-card' : 'bg-fill text-ink-2'
            }`}
          >
            <CatIcon name={c.icon} className="w-6 h-6" />
          </span>
          <span className={`text-xs ${selected === c.id ? 'text-ink font-medium' : 'text-ink-3'}`}>{c.name}</span>
        </button>
      ))}
    </div>
  );
});

const AccChips = memo(function AccChips({ accs, selected, onToggle }: { accs: Account[]; selected: string; onToggle: (id: string) => void }) {
  return (
    <div className="flex gap-2 overflow-auto hide-scrollbar mb-2">
      {accs.map((a) => (
        <button
          key={a.id}
          className={`shrink-0 px-3 h-8 rounded-full text-xs ${selected === a.id ? 'bg-primary text-on-primary font-medium' : 'bg-fill text-ink-2'}`}
          onClick={() => onToggle(selected === a.id ? '' : a.id)}
        >
          {a.name}
        </button>
      ))}
    </div>
  );
});

/** 已保存照片的缩略图：异步从 IndexedDB 加载，缺失（如恢复备份后）显示占位 */
function KeptThumb({ id, onRemove }: { id: string; onRemove: () => void }) {
  const [url, setUrl] = useState<string | undefined>(() => repo.photoURL(id));
  useEffect(() => {
    let alive = true;
    const cached = repo.photoURL(id);
    if (cached) {
      setUrl(cached);
      return;
    }
    void repo.loadPhotoURL(id).then((u) => {
      if (alive && u) setUrl(u);
    });
    return () => {
      alive = false;
    };
  }, [id]);
  return (
    <span className="relative shrink-0">
      {url ? (
        <img src={url} alt="凭证照片" className="w-14 h-14 rounded-lg object-cover" />
      ) : (
        <span className="w-14 h-14 rounded-lg bg-fill flex items-center justify-center text-ink-3">
          <Camera size={18} />
        </span>
      )}
      <button
        type="button"
        aria-label="删除照片"
        className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-ink text-surface flex items-center justify-center"
        onClick={onRemove}
      >
        <X size={12} />
      </button>
    </span>
  );
}
