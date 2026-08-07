import { createContext, useContext, useEffect, useState, ReactNode } from 'react';

type Tema = 'dark' | 'light';
const STORAGE_KEY = 'codecpos-pwa-tema';

interface ThemeContextType {
  tema: Tema;
  alternarTema: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [tema, setTema] = useState<Tema>(() => {
    const guardado = localStorage.getItem(STORAGE_KEY);
    return guardado === 'light' ? 'light' : 'dark';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', tema);
    // 🛡️ src/styles/theme.css (compartido con Electron) define el color de
    // texto base de span/p/label/input/etc. según la clase literal `.dark`
    // en <html> (ver POSContext.tsx) — NO según data-theme. Sin esto, todo
    // texto que hereda color de un ancestro (en vez de tener su propia
    // clase text-* de Tailwind) queda siempre con el tono de modo claro
    // (#1e293b), invisible sobre los fondos oscuros de la PWA.
    document.documentElement.classList.toggle('dark', tema === 'dark');
    localStorage.setItem(STORAGE_KEY, tema);
  }, [tema]);

  const alternarTema = () => setTema((t) => (t === 'dark' ? 'light' : 'dark'));

  return <ThemeContext.Provider value={{ tema, alternarTema }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme debe usarse dentro de ThemeProvider');
  return ctx;
}
