import { describe, it, expect, beforeEach } from 'vitest';
import { getStoredTheme, applyStoredTheme, useThemeStore } from '../themeStore';

const STORAGE_KEY = 'app-theme';

beforeEach(() => {
  localStorage.clear();
  document.documentElement.classList.remove('dark');
  useThemeStore.setState({ theme: 'light' });
});

describe('getStoredTheme', () => {
  it('defaults to light on a fresh install', () => {
    expect(getStoredTheme()).toBe('light');
  });

  it('reads back a stored dark preference', () => {
    localStorage.setItem(STORAGE_KEY, 'dark');

    expect(getStoredTheme()).toBe('dark');
  });

  it('falls back to light for an unrecognised stored value', () => {
    localStorage.setItem(STORAGE_KEY, 'solarized');

    expect(getStoredTheme()).toBe('light');
  });
});

describe('applyStoredTheme', () => {
  it('adds the dark class when dark is stored', () => {
    localStorage.setItem(STORAGE_KEY, 'dark');

    applyStoredTheme();

    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('leaves the dark class off when light is stored', () => {
    localStorage.setItem(STORAGE_KEY, 'light');

    applyStoredTheme();

    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('removes a stale dark class when the stored theme is light', () => {
    document.documentElement.classList.add('dark');
    localStorage.setItem(STORAGE_KEY, 'light');

    applyStoredTheme();

    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });
});

describe('useThemeStore.setTheme', () => {
  it('updates the store state', () => {
    useThemeStore.getState().setTheme('dark');

    expect(useThemeStore.getState().theme).toBe('dark');
  });

  it('persists the choice so it survives a restart', () => {
    useThemeStore.getState().setTheme('dark');

    expect(localStorage.getItem(STORAGE_KEY)).toBe('dark');
  });

  it('applies the class to the document immediately', () => {
    useThemeStore.getState().setTheme('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);

    useThemeStore.getState().setTheme('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('round-trips through storage into getStoredTheme', () => {
    useThemeStore.getState().setTheme('dark');

    expect(getStoredTheme()).toBe('dark');
  });
});
