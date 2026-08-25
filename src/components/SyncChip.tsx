import { useUI } from '../store/ui';

function relTime(t: number): string {
  const diff = Math.floor((Date.now() - t) / 60000);
  if (diff < 1) return '刚刚';
  if (diff < 60) return `${diff} 分钟前`;
  return `${Math.floor(diff / 60)} 小时前`;
}

/** 同步状态芯片：绿=已同步 / 红=失败 / 灰=未开启 / 转=同步中 */
export function SyncChip({ onClick }: { onClick?: () => void }) {
  const state = useUI((s) => s.syncState);
  const lastSyncAt = useUI((s) => s.lastSyncAt);
  if (state === 'off') return null;
  const dot =
    state === 'ok' ? 'bg-green-500' : state === 'error' ? 'bg-red-500' : state === 'syncing' ? 'bg-yellow-500 animate-pulse' : 'bg-gray-400';
  const text =
    state === 'ok' && lastSyncAt
      ? `已同步 ${relTime(lastSyncAt)}`
      : state === 'syncing'
        ? '同步中'
        : state === 'error'
          ? '同步失败'
          : '未同步';
  return (
    <button className="flex items-center gap-1 text-[11px] text-gray-800/80 bg-white/40 rounded-full px-2 py-0.5" onClick={onClick}>
      <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
      {text}
    </button>
  );
}
