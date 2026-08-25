import { useRef, useState } from 'react';
import { Download, Upload, FileDown, Trash2, RotateCcw } from 'lucide-react';
import { SettingsShell } from './SettingsShell';
import { useData } from '../../store/data';
import { useUI } from '../../store/ui';
import { repo } from '../../db/repo';
import { billsToCSV } from '../../utils/csv';
import { downloadFile } from '../../utils/download';
import { validateDump } from '../../utils/merge';
import { dayKey } from '../../utils/date';
import { toYuan } from '../../utils/money';
import { Sheet } from '../../components/Sheet';
import type { FullDump } from '../../types';

const today = () => dayKey(Date.now());

export function DataPage() {
  const { bills, categories, accounts, tags, restoreBill } = useData();
  const toast = useUI((s) => s.toast);
  const confirm = useUI((s) => s.confirm);
  const fileRef = useRef<HTMLInputElement>(null);
  const [importData, setImportData] = useState<FullDump['data'] | null>(null);

  const active = bills.filter((b) => !b.deletedAt);
  const deleted = bills.filter((b) => b.deletedAt).sort((a, b) => (b.deletedAt ?? 0) - (a.deletedAt ?? 0));

  const exportCSV = async () => {
    if (active.length === 0) return toast('暂无账单可导出', 'err');
    const csv = billsToCSV(active, categories, accounts, tags);
    await downloadFile(`ledger-${today()}.csv`, csv, 'text/csv;charset=utf-8');
    toast('CSV 已导出');
  };

  const exportJSON = async () => {
    const dump = repo.fullDump();
    await downloadFile(`ledger-backup-${today()}.json`, JSON.stringify(dump, null, 2), 'application/json');
    toast('全量备份已导出');
  };

  const onPickFile = async (f: File | null) => {
    if (!f) return;
    try {
      const text = await f.text();
      const json = JSON.parse(text) as { data?: unknown } & Record<string, unknown>;
      const payload = json.data ?? json; // 兼容直接选 FullDump 或其中 data
      const checked = validateDump(payload);
      if (!checked.ok || !checked.dump) {
        toast(`导入失败：${checked.errors[0] ?? '格式不正确'}`, 'err');
        return;
      }
      setImportData(checked.dump);
    } catch {
      toast('文件不是有效的 JSON', 'err');
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const doImport = async (strategy: 'overwrite' | 'merge') => {
    if (!importData) return;
    const ok = await confirm({
      title: strategy === 'overwrite' ? '覆盖本地全部数据？' : '合并到本地数据？',
      message: strategy === 'overwrite' ? '本地现有数据将被导入文件替换，建议先导出备份' : '同 id 记录取更新时间较新者',
      confirmText: strategy === 'overwrite' ? '覆盖' : '合并',
      danger: strategy === 'overwrite',
    });
    if (!ok) return;
    await repo.replaceAll(importData, strategy);
    setImportData(null);
    toast('导入完成');
  };

  return (
    <SettingsShell title="数据管理">
      <div className="px-3 pt-3 space-y-3">
        <div className="bg-white rounded-2xl divide-y divide-gray-50">
          <Btn icon={<FileDown size={18} />} label="导出 CSV（Excel 可打开）" onClick={() => void exportCSV()} />
          <Btn icon={<Download size={18} />} label="导出全量 JSON 备份" onClick={() => void exportJSON()} />
          <Btn icon={<Upload size={18} />} label="导入 JSON 备份" onClick={() => fileRef.current?.click()} />
          <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => void onPickFile(e.target.files?.[0] ?? null)} />
        </div>

        <div className="bg-white rounded-2xl p-4">
          <h2 className="text-sm font-medium mb-2 flex items-center gap-2">
            <Trash2 size={16} className="text-gray-500" /> 数据恢复（30 天内）
          </h2>
          {deleted.length === 0 ? (
            <p className="text-xs text-gray-400">回收站为空</p>
          ) : (
            deleted.map((b) => (
              <div key={b.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0 text-sm">
                <span className="text-gray-600">
                  {dayKey(b.occurredAt)} · {b.type === 'expense' ? '-' : '+'}
                  {toYuan(b.amountCents)}
                  {b.note && <span className="text-gray-400 text-xs ml-1">{b.note}</span>}
                </span>
                <button className="flex items-center gap-1 text-xs text-primary-dark text-gray-700 bg-gray-100 rounded-full px-3 py-1" onClick={() => void restoreBill(b.id).then(() => toast('已恢复'))}>
                  <RotateCcw size={12} /> 恢复
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      <Sheet open={!!importData} onClose={() => setImportData(null)} title="选择导入方式">
        <div className="px-4 pb-6 space-y-3">
          <p className="text-xs text-gray-400">导入文件共 {importData?.bills.length ?? 0} 笔账单</p>
          <button className="w-full h-11 rounded-xl bg-gray-100 text-sm" onClick={() => void doImport('merge')}>
            合并（保留本地，同 id 取较新）
          </button>
          <button className="w-full h-11 rounded-xl bg-danger text-white text-sm font-medium" onClick={() => void doImport('overwrite')}>
            覆盖本地数据
          </button>
        </div>
      </Sheet>
    </SettingsShell>
  );
}

function Btn({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button className="w-full flex items-center gap-3 px-4 py-4 text-left text-sm" onClick={onClick}>
      <span className="text-gray-600">{icon}</span>
      {label}
    </button>
  );
}
