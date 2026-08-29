import { useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { SettingsShell, Toggle } from './SettingsShell';
import { useData } from '../../store/data';
import { useUI } from '../../store/ui';
import { CatIcon, ICON_CHOICES } from '../../utils/iconMap';
import { Sheet } from '../../components/Sheet';
import { uuid } from '../../utils/compat';
import type { BillType, Category } from '../../types';

export function CategoriesPage() {
  const categories = useData((s) => s.categories);
  const upsertCategory = useData((s) => s.upsertCategory);
  const deleteCategory = useData((s) => s.deleteCategory);
  const toast = useUI((s) => s.toast);
  const confirm = useUI((s) => s.confirm);
  const [tab, setTab] = useState<BillType>('expense');
  const [editing, setEditing] = useState<Category | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('Utensils');

  const list = useMemo(() => categories.filter((c) => c.type === tab).sort((a, b) => a.sort - b.sort), [categories, tab]);

  const openAdd = () => {
    setName('');
    setIcon(tab === 'expense' ? 'Utensils' : 'Wallet');
    setAddOpen(true);
  };

  const saveAdd = async () => {
    const n = name.trim();
    if (!n) return toast('请输入分类名', 'err');
    if (categories.some((c) => c.type === tab && c.name === n)) return toast('分类已存在', 'err');
    await upsertCategory({ id: uuid(), name: n, icon, type: tab, sort: list.length, builtin: false });
    toast('已添加');
    setAddOpen(false);
  };

  const saveEdit = async () => {
    if (!editing) return;
    const n = name.trim();
    if (!n) return toast('请输入分类名', 'err');
    await upsertCategory({ ...editing, name: n, icon });
    toast('已保存');
    setEditing(null);
  };

  const remove = async (c: Category) => {
    const ok = await confirm({ title: `删除分类「${c.name}」？`, message: '内置分类不可删除；已被账单使用的分类请改用隐藏', confirmText: '删除', danger: true });
    if (!ok) return;
    const success = await deleteCategory(c.id);
    toast(success ? '已删除' : '该分类下有账单，请改用隐藏', success ? 'ok' : 'err');
  };

  return (
    <SettingsShell title="分类设置">
      <div className="flex gap-6 justify-center py-3 bg-card mb-2">
        {(['expense', 'income'] as BillType[]).map((t) => (
          <button key={t} className={`text-sm pb-1 border-b-2 ${tab === t ? 'border-ink font-medium' : 'border-transparent text-ink-3'}`} onClick={() => setTab(t)}>
            {t === 'expense' ? '支出' : '收入'}
          </button>
        ))}
      </div>
      <div className="bg-card">
        {list.map((c) => (
          <div key={c.id} className="flex items-center gap-3 px-4 py-3 border-b border-line">
            <button className="flex items-center gap-3 flex-1 text-left" onClick={() => { setEditing(c); setName(c.name); setIcon(c.icon); }}>
              <span className="w-9 h-9 rounded-full bg-fill flex items-center justify-center text-ink-2">
                <CatIcon name={c.icon} className="w-5 h-5" />
              </span>
              <span className="text-sm">
                {c.name}
                {c.hidden && <span className="ml-1 text-xs text-ink-3">（已隐藏）</span>}
              </span>
            </button>
            {!c.builtin && (
              <button className="text-xs text-danger px-2 py-1" onClick={() => void remove(c)}>
                删除
              </button>
            )}
            <Toggle on={!c.hidden} onChange={(v) => void upsertCategory({ ...c, hidden: !v })} />
          </div>
        ))}
      </div>
      <div className="px-4 pt-4">
        <button className="w-full h-11 rounded-xl bg-primary font-medium flex items-center justify-center gap-1" onClick={openAdd}>
          <Plus size={18} /> 添加分类
        </button>
      </div>

      <Sheet open={addOpen || !!editing} onClose={() => { setAddOpen(false); setEditing(null); }} title={editing ? '编辑分类' : '添加分类'}>
        <div className="px-4 pb-6">
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={8} placeholder="分类名称" className="w-full h-11 px-4 rounded-xl bg-fill outline-none mb-3" />
          <div className="grid grid-cols-6 gap-2 max-h-40 overflow-auto hide-scrollbar mb-4">
            {ICON_CHOICES.map((k) => (
              <button key={k} className={`h-11 rounded-xl flex items-center justify-center ${icon === k ? 'bg-primary text-on-primary' : 'bg-fill text-ink-2'}`} onClick={() => setIcon(k)}>
                <CatIcon name={k} className="w-5 h-5" />
              </button>
            ))}
          </div>
          <button className="w-full h-11 rounded-xl bg-primary font-medium" onClick={() => void (editing ? saveEdit() : saveAdd())}>
            保存
          </button>
        </div>
      </Sheet>
    </SettingsShell>
  );
}
