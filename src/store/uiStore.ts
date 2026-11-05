import { create } from 'zustand';

interface UIState {
  currentWeek: string | null;
  setCurrentWeek: (w: string | null) => void;
}

export const useUIStore = create<UIState>((set) => ({
  currentWeek: null,
  setCurrentWeek: (w) => set({ currentWeek: w }),
}));
