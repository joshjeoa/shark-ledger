import { create } from 'zustand';
import type { Bill } from '../types';

export interface ToastItem {
  id: number;
  text: string;
  type: 'ok' | 'err' | 'info';
}

interface ConfirmOpts {
  title: string;
  message?: string;
  confirmText?: string;
  danger?: boolean;
}

interface ConfirmState extends ConfirmOpts {
  resolve: (v: boolean) => void;
}

export type SyncState = 'off' | 'idle' | 'syncing' | 'ok' | 'error';

interface UIState {
  toasts: ToastItem[];
  toast: (text: string, type?: ToastItem['type']) => void;
  confirmState: ConfirmState | null;
  confirm: (o: ConfirmOpts) => Promise<boolean>;
  resolveConfirm: (v: boolean) => void;
  entryOpen: boolean;
  editingBill: Bill | null;
  openEntry: (bill?: Bill | null) => void;
  closeEntry: () => void;
  syncState: SyncState;
  syncError: string;
  lastSyncAt: number | null;
  setSync: (s: { state: SyncState; error?: string; lastSyncAt?: number | null }) => void;
  updateReady: boolean;
  setUpdateReady: (v: boolean, update?: () => void) => void;
  runUpdate: (() => void) | null;
}

let toastSeq = 0;

export const useUI = create<UIState>((set, get) => ({
  toasts: [],
  toast: (text, type = 'ok') => {
    const id = ++toastSeq;
    set((s) => ({ toasts: [...s.toasts.slice(-2), { id, text, type }] }));
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 2500);
  },

  confirmState: null,
  confirm: (o) =>
    new Promise<boolean>((resolve) => {
      set({ confirmState: { ...o, resolve } });
    }),
  resolveConfirm: (v) => {
    get().confirmState?.resolve(v);
    set({ confirmState: null });
  },

  entryOpen: false,
  editingBill: null,
  openEntry: (bill = null) => set({ entryOpen: true, editingBill: bill }),
  closeEntry: () => set({ entryOpen: false, editingBill: null }),

  syncState: 'off',
  syncError: '',
  lastSyncAt: null,
  setSync: (s) => set({ syncState: s.state, syncError: s.error ?? '', lastSyncAt: s.lastSyncAt !== undefined ? s.lastSyncAt : get().lastSyncAt }),

  updateReady: false,
  runUpdate: null,
  setUpdateReady: (v, update) => set({ updateReady: v, runUpdate: update ?? get().runUpdate }),
}));
