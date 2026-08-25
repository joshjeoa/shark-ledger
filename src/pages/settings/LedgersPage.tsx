import { useState } from 'react';
import { Plus } from 'lucide-react';
import { SettingsShell } from './SettingsShell';
import { useData } from '../../store/data';
import { useUI } from '../../store/ui';
import { Sheet } from '../../components/Sheet';
import { uuid } from '../../utils/compat';

export function LedgersPage() {
  const { ledgers, currentLedgerId, setCurrentLedger, upsertLedger } = useData();
  const toast = useUI((s) => s.toast);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');

  const save = async () => {
    const n = name.trim();
    if (!n) return toast('请输入账本名', 'err');
    if (editingId) {
      const l = ledgers.find((x) => x.id === editingId);
      if (l) await upsertLedger({ ...l, name: n });
    } else {
      const l = { id: uuid(), name: n, builtin: false };
      await upsertLedger(l);
    }
    toast('已保存');
    setOpen(false);
  };

  return (
    <SettingsShell title="我的账本">
      <div className="bg-white mt-2">
        {ledgers.map((l) => (
          <div key={l.id} className="flex items-center px-4 py-3.5 border-b border-gray-50">
            <button
              className="flex-1 text-left text-sm flex items-center gap-2"
              onClick={() => {
                setCurrentLedger(l.id);
                toast(`已切换到「${l.name}」`);
              }}
            >
              {l.name}
              {l.id === currentLedgerId && <span className="text-xs text-gray-400">（当前）</span>}
            </button>
            <button
              className="text-xs text-gray-500 px-2"
              onClick={() => {
                setEditingId(l.id);
                setName(l.name);
                setOpen(true);
              }}
            >
              改名
            </button>
          </div>
        ))}
      </div>
      <div className="px-4 pt-4">
        <button
          className="w-full h-11 rounded-xl bg-primary font-medium flex items-center justify-center gap-1"
          onClick={() => {
            setEditingId(null);
            setName('');
            setOpen(true);
          }}
        >
          <Plus size={18} /> 新建账本
        </button>
      </div>

      <Sheet open={open} onClose={() => setOpen(false)} title={editingId ? '账本改名' : '新建账本'}>
        <div className="px-4 pb-6">
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={10} placeholder="账本名称（如：旅行/家庭）" className="w-full h-11 px-4 rounded-xl bg-gray-100 outline-none mb-4" />
          <button className="w-full h-11 rounded-xl bg-primary font-medium" onClick={() => void save()}>
            保存
          </button>
        </div>
      </Sheet>
    </SettingsShell>
  );
}
