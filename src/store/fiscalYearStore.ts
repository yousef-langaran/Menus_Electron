import { create } from 'zustand';

type FiscalYearState = {
  selectedByRestaurant: Record<number, number | undefined>;
  setSelectedFiscalYear: (restaurantId: number, fiscalYearId?: number) => void;
  getSelectedFiscalYear: (restaurantId?: number) => number | undefined;
};

export const useFiscalYearStore = create<FiscalYearState>((set, get) => ({
  selectedByRestaurant: {},
  setSelectedFiscalYear: (restaurantId: number, fiscalYearId?: number) =>
    set((state) => ({
      selectedByRestaurant: { ...state.selectedByRestaurant, [restaurantId]: fiscalYearId },
    })),
  getSelectedFiscalYear: (restaurantId?: number) => {
    if (!restaurantId) return undefined;
    return get().selectedByRestaurant[restaurantId];
  },
}));
