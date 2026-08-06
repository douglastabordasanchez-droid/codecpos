import React, { createContext, useContext, useState, useEffect } from 'react';

const ZOOM_KEY = 'codecpos_zoom_factor';

interface POSContextType {
  darkMode: boolean;
  toggleDarkMode: () => void;
  refreshTrigger: number;
  triggerRefresh: () => void;
  uiScale: number;
  setUiScale: (v: number) => void;
}

const POSContext = createContext<POSContextType | undefined>(undefined);

export function POSProvider({ children }: { children: React.ReactNode }) {
  const [darkMode, setDarkMode] = useState(() => {
    try {
      const saved = localStorage.getItem('pos-dark-mode');
      return saved ? JSON.parse(saved) : true;
    } catch { return true; }
  });
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [uiScale, setUiScaleState] = useState<number>(() => {
    try { return parseFloat(localStorage.getItem(ZOOM_KEY) || '1') || 1; } catch { return 1; }
  });

  // Remove legacy body zoom so it doesn't conflict with CSS transform scaling
  useEffect(() => {
    document.body.style.zoom = '';
    (document.body.style as any).zoom = '';
  }, []);

  useEffect(() => {
    try { localStorage.setItem('pos-dark-mode', JSON.stringify(darkMode)); } catch { /* storage lleno */ }
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  const toggleDarkMode = () => setDarkMode(!darkMode);
  const triggerRefresh = () => setRefreshTrigger(prev => prev + 1);
  const setUiScale = (v: number) => {
    const clamped = parseFloat(Math.max(0.5, Math.min(1.8, v)).toFixed(2));
    try { localStorage.setItem(ZOOM_KEY, String(clamped)); } catch {}
    setUiScaleState(clamped);
  };

  return (
    <POSContext.Provider value={{ darkMode, toggleDarkMode, refreshTrigger, triggerRefresh, uiScale, setUiScale }}>
      {children}
    </POSContext.Provider>
  );
}

export function usePOS() {
  const context = useContext(POSContext);
  if (!context) {
    throw new Error('usePOS must be used within POSProvider');
  }
  return context;
}
