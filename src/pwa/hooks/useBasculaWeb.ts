import { useEffect, useRef, useState } from 'react';
import { estadoBascula, formatoPeso, reconectarBascula, suscribirBascula, type EstadoBascula } from '../lib/basculaWeb';

/** Igualdad superficial: un objeto elegido con los mismos valores no redibuja. */
function igual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  const ka = Object.keys(a as object);
  if (ka.length !== Object.keys(b as object).length) return false;
  return ka.every((k) => Object.is((a as any)[k], (b as any)[k]));
}

/**
 * Estado en vivo de la báscula. Al montarse intenta reabrir la báscula
 * recordada, así no hay que conectarla de nuevo en cada pantalla.
 *
 * Con `seleccion` el componente solo se redibuja cuando cambia lo que eligió:
 * la báscula manda ~10 lecturas por segundo y una pantalla grande (la caja,
 * con miles de productos) que solo necesita saber si está conectada no debe
 * redibujarse con cada lectura — en un PC de pocos recursos la congelaba.
 */
export function useBasculaWeb(): EstadoBascula;
export function useBasculaWeb<T>(seleccion: (e: EstadoBascula) => T): T;
export function useBasculaWeb<T>(seleccion?: (e: EstadoBascula) => T): T | EstadoBascula {
  const elegir = (e: EstadoBascula) => (seleccion ? seleccion(e) : e);
  const [valor, setValor] = useState(() => elegir(estadoBascula()));
  const ultimo = useRef(valor);
  useEffect(() => {
    const quitar = suscribirBascula((e) => {
      const nuevo = elegir(e);
      if (!igual(nuevo, ultimo.current)) { ultimo.current = nuevo; setValor(nuevo); }
    });
    reconectarBascula().catch(() => {});
    return quitar;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return valor;
}

/** Solo el peso para mostrar ("1,250 kg", "250 g"): se redibuja cuando cambia lo que se ve, no con cada lectura igual. */
export function usePesoVisible(): string {
  return useBasculaWeb((e) => (e.conectada ? formatoPeso(e.pesoKg) : ''));
}
