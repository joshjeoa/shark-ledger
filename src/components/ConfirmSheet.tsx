import { useUI } from '../store/ui';
import { Sheet } from './Sheet';

/** 破坏性操作统一自绘确认 Sheet（不用 window.confirm） */
export function ConfirmSheet() {
  const state = useUI((s) => s.confirmState);
  const resolve = useUI((s) => s.resolveConfirm);
  return (
    <Sheet open={!!state} onClose={() => resolve(false)} title={state?.title}>
      <div className="px-4 pb-6">
        {state?.message && <p className="text-sm text-gray-500 mb-4">{state.message}</p>}
        <div className="flex gap-3 mt-2">
          <button className="flex-1 h-11 rounded-xl bg-gray-100 text-gray-700 font-medium" onClick={() => resolve(false)}>
            取消
          </button>
          <button
            className={`flex-1 h-11 rounded-xl font-medium text-white ${state?.danger ? 'bg-danger' : 'bg-primary text-gray-900'}`}
            onClick={() => resolve(true)}
          >
            {state?.confirmText ?? '确认'}
          </button>
        </div>
      </div>
    </Sheet>
  );
}
