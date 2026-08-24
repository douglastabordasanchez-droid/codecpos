import { useEffect, useState } from 'react';

/**
 * 🚀 FIX rendimiento: no existía ningún hook de debounce compartido en el
 * proyecto — cada buscador que lo necesitaba (o no lo tenía) reimplementaba
 * su propio `useRef` + `setTimeout` a mano. Este hook devuelve `value` con
 * un retraso de `delayMs` desde la última vez que cambió, para usarlo como
 * dependencia de un `useMemo`/`useEffect` de filtrado sin bloquear el input
 * (el input sigue controlado por el valor sin debounce, solo el filtro
 * pesado espera a que el usuario deje de escribir).
 */
export function useDebounce<T>(value: T, delayMs: number = 200): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
