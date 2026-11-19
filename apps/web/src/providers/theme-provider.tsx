'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { Sun, Moon, Laptop } from 'lucide-react';
import { useAuth } from './auth-provider';
import { Button } from '@/components/ui/button';

export type Theme = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

interface ThemeContextValue {
  theme: Theme;
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

const STORAGE_KEY = 'texly-theme';

function getSystemTheme(): ResolvedTheme {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyThemeToDocument(theme: ResolvedTheme) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (theme === 'dark') {
    root.classList.add('dark');
    root.setAttribute('data-theme', 'dark');
    root.style.colorScheme = 'dark';
  } else {
    root.classList.remove('dark');
    root.setAttribute('data-theme', 'light');
    root.style.colorScheme = 'light';
  }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { settings, updateUserSettings } = useAuth();
  const [theme, setThemeState] = useState<Theme>('system');
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>('light');
  const [mounted, setMounted] = useState(false);

  // Initialize theme from localStorage or auth settings
  useEffect(() => {
    setMounted(true);
    let initialTheme: Theme = 'system';
    const stored = localStorage.getItem(STORAGE_KEY) as Theme | null;
    if (stored && ['light', 'dark', 'system'].includes(stored)) {
      initialTheme = stored;
    } else if (settings?.theme && ['light', 'dark', 'system'].includes(settings.theme)) {
      initialTheme = settings.theme as Theme;
    }

    setThemeState(initialTheme);
    const resolved = initialTheme === 'system' ? getSystemTheme() : initialTheme;
    setResolvedTheme(resolved);
    applyThemeToDocument(resolved);
  }, [settings?.theme]);

  // Sync when user settings theme changes
  useEffect(() => {
    if (settings?.theme && ['light', 'dark', 'system'].includes(settings.theme)) {
      const newTheme = settings.theme as Theme;
      setThemeState(newTheme);
      const resolved = newTheme === 'system' ? getSystemTheme() : newTheme;
      setResolvedTheme(resolved);
      applyThemeToDocument(resolved);
      try {
        localStorage.setItem(STORAGE_KEY, newTheme);
      } catch {}
    }
  }, [settings?.theme]);

  // Listen to system theme changes when theme === 'system'
  useEffect(() => {
    if (theme !== 'system') return;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => {
      const resolved = mediaQuery.matches ? 'dark' : 'light';
      setResolvedTheme(resolved);
      applyThemeToDocument(resolved);
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [theme]);

  const setTheme = useCallback(
    (newTheme: Theme) => {
      setThemeState(newTheme);
      try {
        localStorage.setItem(STORAGE_KEY, newTheme);
      } catch {}

      const resolved = newTheme === 'system' ? getSystemTheme() : newTheme;
      setResolvedTheme(resolved);
      applyThemeToDocument(resolved);

      // Persist to user settings if authenticated
      if (updateUserSettings) {
        updateUserSettings({ theme: newTheme }).catch(() => {});
      }
    },
    [updateUserSettings],
  );

  const toggleTheme = useCallback(() => {
    const nextTheme: Theme = resolvedTheme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
  }, [resolvedTheme, setTheme]);

  return (
    <ThemeContext.Provider
      value={{
        theme,
        resolvedTheme,
        setTheme,
        toggleTheme,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

const defaultThemeContext: ThemeContextValue = {
  theme: 'system',
  resolvedTheme: 'light',
  setTheme: () => {},
  toggleTheme: () => {},
};

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  return context ?? defaultThemeContext;
}

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, resolvedTheme, toggleTheme, setTheme } = useTheme();

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={toggleTheme}
      className={`h-8 w-8 p-0 text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800 ${className ?? ''}`}
      title={`Toggle theme (currently ${theme})`}
      aria-label="Toggle dark mode"
      data-testid="theme-toggle"
    >
      {resolvedTheme === 'dark' ? (
        <Sun className="h-4 w-4 text-amber-400" />
      ) : (
        <Moon className="h-4 w-4 text-gray-600" />
      )}
    </Button>
  );
}

