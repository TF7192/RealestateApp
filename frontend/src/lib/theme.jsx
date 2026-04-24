import { createContext, useContext, useEffect } from 'react';

const ThemeContext = createContext(null);

// Claude-design port mandates a single Cream & Gold palette across
// every surface — no dark mode anywhere. The toggle remains as a
// no-op so the existing Profile / MobileMoreSheet entry points keep
// compiling; it just can't flip the page to a dark surface.
function applyLight() {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-theme', 'light');
  document.documentElement.style.colorScheme = 'light';
}

export function ThemeProvider({ children }) {
  useEffect(() => { applyLight(); }, []);

  const value = {
    theme: 'light',
    toggle: () => {},
    setTheme: () => {},
  };

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>');
  return ctx;
}
