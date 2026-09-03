import { useEffect, useState } from 'react';

const QUERY = '(min-width: 1024px) and (pointer: fine)';

/** Solo el viewport amplio con puntero preciso usa sidebar; los dispositivos táctiles conservan el shell móvil. */
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
