import { memo, useRef } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { Delete } from 'lucide-react';

/** 自绘数字键盘：不唤起系统键盘，连点/非法输入安全；退格长按连删。
 * memo：父面板内备注/日期等其它 state 变化时不再重渲整个键盘。 */
export const NumberKeyboard = memo(function NumberKeyboard({ value, onChange }: { value: string; onChange: Dispatch<SetStateAction<string>> }) {
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const repeatTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopRepeat = () => {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    if (repeatTimer.current) clearInterval(repeatTimer.current);
    holdTimer.current = null;
    repeatTimer.current = null;
  };

  const backspaceStart = () => {
    onChange((v) => v.slice(0, -1));
    holdTimer.current = setTimeout(() => {
      repeatTimer.current = setInterval(() => {
        onChange((v) => v.slice(0, -1));
      }, 60);
    }, 400);
  };

  const press = (k: string) => {
    if (k === '.') {
      if (value.includes('.')) return;
      onChange(value === '' ? '0.' : `${value}.`);
      return;
    }
    const [i = '', d = ''] = value.split('.');
    if (value.includes('.')) {
      if (d.length >= 2) return;
    } else if (i.length >= 7) return;
    if (value === '0') {
      onChange(k);
      return;
    }
    onChange(value + k);
  };

  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'back'];
  return (
    <div
      className="grid grid-cols-3 gap-px bg-line rounded-t-lg overflow-hidden no-callout"
      onPointerUp={stopRepeat}
      onPointerLeave={stopRepeat}
      onPointerCancel={stopRepeat}
    >
      {keys.map((k) => (
        <button
          key={k}
          className="h-12 bg-card text-ink text-lg font-medium active:bg-fill flex items-center justify-center select-none"
          aria-label={k === 'back' ? '退格' : undefined}
          onPointerDown={k === 'back' ? backspaceStart : undefined}
          onClick={() => {
            stopRepeat();
            if (k === 'back') return;
            press(k);
          }}
        >
          {k === 'back' ? <Delete size={22} className="text-ink-2" /> : k}
        </button>
      ))}
    </div>
  );
});
