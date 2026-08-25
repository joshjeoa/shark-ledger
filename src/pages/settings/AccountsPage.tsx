import { useState } from 'react';
import { Plus } from 'lucide-react';
import { SettingsShell } from './SettingsShell';
import { useData } from '../../store/data';
import { useUI } from '../../store/ui';
import { Sheet } from '../../components/Sheet';
import { uuid } from '../../utils/compat';
import type { Account } from '../../types';

export function AccountsPage() {
  const { accounts, upsertAccount, deleteAccount } = useData();
  const toast = useUI((s) => s.toast);
  const confirm = useUI((s) => s.confirm);
  const [editing, setEditing] = useState<Account | null>(null);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');

  const list = [...accounts].sort((a, b) => a.sort - b.sort);

  const openAdd = () => {
    setEditing(null);
    setName('');
    setOpen(true);
  };

  const save = async () => {
    const n = name.trim();
    if (!n) return toast('请输入账户名', 'err');
    if (editing) {
      await upsertAccount({ ...editing, name: n });
    } else {
      await upsertAccount({ id: uuid(), name: n, type: 'cash', icon: 'Wallet', sort: list.length });
    }
    toast('已保存');
    setOpen(false);
  };

  const remove = async (a: Account) => {
    const ok = await confirm({ title: `删除账户「${a.name}」？`, confirmText: '删除', danger: true });
    if (!ok) return;
    const success = await deleteAccount(a.id);
    toast(success ? '已删除' : '该账户下有账单，无法删除', success ? 'ok' : 'err');
  };

  return (
    <SettingsShell title="收支账户">
      <div className="bg-card mt-2">
        {list.map((a) => (
          <div key={a.id} className="flex items-center px-4 py-3.5 border-b border-line">
            <button className="flex-1 text-left text-sm" onClick={() => { setEditing(a); setName(a.name); setOpen(true); }}>
              {a.name}
            </button>
            <button className="text-xs text-danger px-2" onClick={() => void remove(a)}>
              删除
            </button>
          </div>
        ))}
      </div>
      <div className="px-4 pt-4">
        <button className="w-full h-11 rounded-xl bg-primary font-medium flex items-center justify-center gap-1" onClick={openAdd}>
          <Plus size={18} /> 添加账户
        </button>
      </div>

      <Sheet open={open} onClose={() => setOpen(false)} title={editing ? '编辑账户' : '添加账户'}>
        <div className="px-4 pb-6">
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={8} placeholder="账户名称（如：现金/招行卡）" className="w-full h-11 px-4 rounded-xl bg-fill outline-none mb-4" />
          <button className="w-full h-11 rounded-xl bg-primary font-medium" onClick={() => void save()}>
            保存
          </button>
        </div>
      </Sheet>
    </SettingsShell>
  );
}
