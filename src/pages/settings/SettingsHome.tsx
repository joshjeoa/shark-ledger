import { useState } from 'react';
import { ChevronRight, Palette, Eye, EyeOff, Wallet2, Tags, BookOpenText, CloudUpload, Database, Info } from 'lucide-react';
import { SettingsShell, Toggle } from './SettingsShell';
import { useSettings, THEME_PRESETS } from '../../store/settings';
import { useNavigate } from 'react-router-dom';
import { Sheet } from '../../components/Sheet';

export function SettingsHome() {
  const s = useSettings();
  const navigate = useNavigate();
  const [nameOpen, setNameOpen] = useState(false);
  const [name, setName] = useState(s.nickname);

  return (
    <SettingsShell title="设置">
      <div className="px-3 pt-3 space-y-3">
        <div className="bg-white rounded-2xl divide-y divide-gray-50">
          <Item label="昵称" value={s.nickname} onClick={() => { setName(s.nickname); setNameOpen(true); }} />
          <div className="flex items-center justify-between px-4 py-3.5">
            <span className="text-sm flex items-center gap-2"><Palette size={18} className="text-gray-500" /> 主题色</span>
            <div className="flex gap-2">
              {THEME_PRESETS.map((c) => (
                <button
                  key={c}
                  aria-label={`主题色 ${c}`}
                  className={`w-6 h-6 rounded-full ${s.themeColor === c ? 'ring-2 ring-gray-800 ring-offset-1' : ''}`}
                  style={{ background: c }}
                  onClick={() => s.set({ themeColor: c })}
                />
              ))}
            </div>
          </div>
          <div className="flex items-center justify-between px-4 py-3.5">
            <span className="text-sm">默认记账类型</span>
            <div className="flex rounded-lg overflow-hidden border border-gray-200 text-xs">
              <button className={`px-3 py-1.5 ${s.defaultType === 'expense' ? 'bg-primary font-medium' : 'bg-white text-gray-500'}`} onClick={() => s.set({ defaultType: 'expense' })}>
                支出
              </button>
              <button className={`px-3 py-1.5 ${s.defaultType === 'income' ? 'bg-primary font-medium' : 'bg-white text-gray-500'}`} onClick={() => s.set({ defaultType: 'income' })}>
                收入
              </button>
            </div>
          </div>
          <div className="flex items-center justify-between px-4 py-3.5">
            <span className="text-sm flex items-center gap-2">{s.hideAmount ? <EyeOff size={18} className="text-gray-500" /> : <Eye size={18} className="text-gray-500" />} 隐藏总金额</span>
            <Toggle on={s.hideAmount} onChange={(v) => s.set({ hideAmount: v })} />
          </div>
          <div className="flex items-center justify-between px-4 py-3.5">
            <span className="text-sm">金额红绿配色</span>
            <Toggle on={s.colorAmounts} onChange={(v) => s.set({ colorAmounts: v })} />
          </div>
        </div>

        <div className="bg-white rounded-2xl divide-y divide-gray-50">
          <Item label="分类设置" icon={<Tags size={18} className="text-gray-500" />} onClick={() => navigate('/settings/categories')} />
          <Item label="收支账户" icon={<Wallet2 size={18} className="text-gray-500" />} onClick={() => navigate('/settings/accounts')} />
          <Item label="我的账本" icon={<BookOpenText size={18} className="text-gray-500" />} onClick={() => navigate('/settings/ledgers')} />
        </div>

        <div className="bg-white rounded-2xl divide-y divide-gray-50">
          <Item label="数据导出 / 导入 / 恢复" icon={<Database size={18} className="text-gray-500" />} onClick={() => navigate('/settings/data')} />
          <Item label="云备份" icon={<CloudUpload size={18} className="text-gray-500" />} onClick={() => navigate('/settings/backup')} />
          <Item label="关于" icon={<Info size={18} className="text-gray-500" />} onClick={() => navigate('/settings/about')} />
        </div>
      </div>

      <Sheet open={nameOpen} onClose={() => setNameOpen(false)} title="修改昵称">
        <div className="px-4 pb-6">
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={12} className="w-full h-12 px-4 rounded-xl bg-gray-100 outline-none mb-4" />
          <button
            className="w-full h-11 rounded-xl bg-primary font-medium"
            onClick={() => {
              s.set({ nickname: name.trim() || '我' });
              setNameOpen(false);
            }}
          >
            保存
          </button>
        </div>
      </Sheet>
    </SettingsShell>
  );
}

function Item({ label, value, icon, onClick }: { label: string; value?: string; icon?: React.ReactNode; onClick: () => void }) {
  return (
    <button className="w-full flex items-center gap-2 px-4 py-3.5 text-left" onClick={onClick}>
      {icon}
      <span className="flex-1 text-sm">{label}</span>
      {value && <span className="text-xs text-gray-400 mr-1">{value}</span>}
      <ChevronRight size={16} className="text-gray-300" />
    </button>
  );
}
