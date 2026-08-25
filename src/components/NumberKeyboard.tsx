import { Delete } from 'lucide-react';

/** 自绘数字键盘：不唤起系统键盘，连点/非法输入安全 */
export function NumberKeyboard({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const press = (k: string) => {
    if (k === 'back') {
      onChange(value.slice(0, -1));
      return;
    }
    if (k === '.') {
      if (value.includes('.')) return; // 第二个小数点忽略
      if (value === '') {
        onChange('0.');
        return;
      }
      onChange(value + '.');
      return;
    }
    const [i = '', d = ''] = value.split('.');
    if (value.includes('.')) {
      if (d.length >= 2) return; // 最多 2 位小数
    } else if (i.length >= 7) return; // 最多 7 位整数
    if (value === '0' && k !== '.') {
      onChange(k);
      return;
    }
    onChange(value + k);
  };

  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'back'];
  return (
    <div className="grid grid-cols-3 gap-px bg-gray-200 rounded-t-lg overflow-hidden no-callout">
      {keys.map((k) => (
        <button
          key={k}
          className="h-12 bg-white text-lg font-medium active:bg-gray-100 flex items-center justify-center"
          onClick={() => press(k)}
        >
          {k === 'back' ? <Delete size={22} className="text-gray-500" /> : k}
        </button>
      ))}
    </div>
  );
}
