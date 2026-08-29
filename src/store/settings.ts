import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { BillType } from '../types';
import type { Appearance } from '../utils/theme';

interface SettingsState {
  hideAmount: boolean;
  defaultType: BillType;
  colorAmounts: boolean;
  themeColor: string;
  appearance: Appearance;
  nickname: string;
  lastCategory: Partial<Record<BillType, string>>;
  guideSeen: boolean;
  set: (p: Partial<Omit<SettingsState, 'set'>>) => void;
}

/** localStorage 可能不可用（私密模式），读写均 try/catch */
const safeStorage = {
  getItem: (k: string) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  setItem: (k: string, v: string) => {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* ignore */
    }
  },
  removeItem: (k: string) => {
    try {
      localStorage.removeItem(k);
    } catch {
      /* ignore */
    }
  },
};

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      hideAmount: false,
      defaultType: 'expense',
      colorAmounts: false,
      themeColor: '#007AFF',
      appearance: 'auto',
      nickname: '我',
      lastCategory: {},
      guideSeen: false,
      set: (p) => set(p),
    }),
    {
      name: 'shark-settings',
      storage: createJSONStorage(() => safeStorage),
      version: 1,
      // v0 默认主题色为黄色 #F5C518：未自定义过的老用户静默迁到新默认蓝；
      // 自选过的颜色不属于旧默认，保留其选择
      migrate: (state, version) => {
        const s = (state ?? {}) as Partial<SettingsState>;
        if (version < 1 && s.themeColor === '#F5C518') s.themeColor = '#007AFF';
        return s;
      },
    },
  ),
);

/** iOS 系统色预设（蓝 / 靛 / 青 / 绿 / 石墨） */
export const THEME_PRESETS = ['#007AFF', '#5856D6', '#30B0C7', '#34C759', '#8E8E93'];
