import { useEffect, useState } from 'react';

const QUERY = '(min-width: 1024px)';

/** ≥1024px = pantallas de 12" en adelante — umbral para pasar del layout móvil (bottom nav) al de escritorio (sidebar), misma app y mismo enlace. */
export function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(QUERY).matches : false
  );

  useEffect(() => {
    const mql = window.matchMedia(QUERY);
    const onChange = () => setIsDesktop(mql.matches);
    onChange();
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  return isDesktop;
}
