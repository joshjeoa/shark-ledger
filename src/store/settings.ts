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
  /** 照片云同步自动上传（Pro 功能；依赖账号体系，见 src/vip/photoCloud.ts） */
  photoCloudAuto: boolean;
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
      themeColor: '#E4C066',
      appearance: 'auto',
      nickname: '我',
      lastCategory: {},
      guideSeen: false,
      photoCloudAuto: false,
      set: (p) => set(p),
    }),
    {
      name: 'shark-settings',
      storage: createJSONStorage(() => safeStorage),
      version: 2,
      // v0 黄色 → v1 iOS 蓝 → v2 香槟金（暗色金融风）：
      // 历次换肤的旧默认色静默迁到当前默认；用户自选过的颜色保留
      migrate: (state, version) => {
        const s = (state ?? {}) as Partial<SettingsState>;
        if (version < 2 && (s.themeColor === '#F5C518' || s.themeColor === '#007AFF')) s.themeColor = '#E4C066';
        return s;
      },
    },
  ),
);

/** 主题色预设（金 / 铂 / 玉 / 玫瑰 / 雾蓝——暗色金融风衍生的低饱和点缀色） */
export const THEME_PRESETS = ['#E4C066', '#C9D2DF', '#A8C5BA', '#D8A7A0', '#9FB3CC'];
