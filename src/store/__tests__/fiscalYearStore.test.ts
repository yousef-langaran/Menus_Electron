import { describe, it, expect, beforeEach } from 'vitest';
import { useFiscalYearStore } from '../fiscalYearStore';

beforeEach(() => {
  useFiscalYearStore.setState({ selectedByRestaurant: {} });
});

describe('useFiscalYearStore', () => {
  it('has no selection for any restaurant initially', () => {
    expect(useFiscalYearStore.getState().getSelectedFiscalYear(7)).toBeUndefined();
  });

  it('stores and reads back a selection per restaurant', () => {
    useFiscalYearStore.getState().setSelectedFiscalYear(7, 1404);

    expect(useFiscalYearStore.getState().getSelectedFiscalYear(7)).toBe(1404);
  });

  it('keeps selections of different restaurants independent', () => {
    useFiscalYearStore.getState().setSelectedFiscalYear(7, 1404);
    useFiscalYearStore.getState().setSelectedFiscalYear(8, 1403);

    expect(useFiscalYearStore.getState().getSelectedFiscalYear(7)).toBe(1404);
    expect(useFiscalYearStore.getState().getSelectedFiscalYear(8)).toBe(1403);
  });

  it('overwrites the selection when the same restaurant picks another year', () => {
    useFiscalYearStore.getState().setSelectedFiscalYear(7, 1404);
    useFiscalYearStore.getState().setSelectedFiscalYear(7, 1403);

    expect(useFiscalYearStore.getState().getSelectedFiscalYear(7)).toBe(1403);
  });

  it('clears a selection when called with no fiscal year', () => {
    useFiscalYearStore.getState().setSelectedFiscalYear(7, 1404);
    useFiscalYearStore.getState().setSelectedFiscalYear(7, undefined);

    expect(useFiscalYearStore.getState().getSelectedFiscalYear(7)).toBeUndefined();
  });

  it('returns undefined when asked without a restaurant id', () => {
    useFiscalYearStore.getState().setSelectedFiscalYear(7, 1404);

    expect(useFiscalYearStore.getState().getSelectedFiscalYear(undefined)).toBeUndefined();
    expect(useFiscalYearStore.getState().getSelectedFiscalYear(0)).toBeUndefined();
  });

  it('does not drop existing entries when a new restaurant is added', () => {
    useFiscalYearStore.getState().setSelectedFiscalYear(7, 1404);
    useFiscalYearStore.getState().setSelectedFiscalYear(8, 1403);

    expect(Object.keys(useFiscalYearStore.getState().selectedByRestaurant)).toEqual(['7', '8']);
  });
});
