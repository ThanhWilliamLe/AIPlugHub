/**
 * Toast notification store — lightweight toasts with optional undo.
 */

import { create } from 'zustand';

export type Toast = {
  id: string;
  message: string;
  type: 'info' | 'success' | 'error';
  undoAction?: () => void;
  duration?: number; // ms, default 5000
};

type ToastStoreState = {
  toasts: Toast[];
  addToast: (toast: Omit<Toast, 'id'>) => string;
  removeToast: (id: string) => void;
  clearAll: () => void;
};

let nextId = 0;

export const useToastStore = create<ToastStoreState>((set) => ({
  toasts: [],

  addToast: (toast) => {
    const id = `toast-${++nextId}`;
    const entry: Toast = { ...toast, id };
    set((state) => ({ toasts: [...state.toasts.slice(-4), entry] })); // Max 5 toasts

    // Auto-dismiss
    const duration = toast.duration ?? 5000;
    if (duration > 0) {
      setTimeout(() => {
        set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
      }, duration);
    }
    return id;
  },

  removeToast: (id) =>
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),

  clearAll: () => set({ toasts: [] }),
}));
