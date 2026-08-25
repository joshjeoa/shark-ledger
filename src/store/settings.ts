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
      themeColor: '#F5C518',
      appearance: 'auto',
      nickname: '我',
      lastCategory: {},
      guideSeen: false,
      set: (p) => set(p),
    }),
    { name: 'shark-settings', storage: createJSONStorage(() => safeStorage) },
  ),
);

export const THEME_PRESETS = ['#F5C518', '#FF8A3D', '#07C160', '#4C8DF5', '#B06AE0'];
