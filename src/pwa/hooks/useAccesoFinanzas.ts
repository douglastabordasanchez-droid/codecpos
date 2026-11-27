/**
 * ¿Este usuario tiene un libro de Mis finanzas (propio o invitado)? Decide si
 * el menú muestra el módulo. Se recuerda por usuario para que el menú no
 * parpadee al abrir la app.
 */
import { useEffect, useState } from 'react';
import { usePwaAuth } from '../contexts/PwaAuthContext';
import { misLibros } from '../lib/finanzasPersonales';

const clave = (id: string) => `codecpos_finanzas_acceso_${id}`;

export function useAccesoFinanzas(): boolean {
  const { empleado } = usePwaAuth();
  const id = empleado?.id;
  const [acceso, setAcceso] = useState(() => !!id && localStorage.getItem(clave(id)) === '1');

  useEffect(() => {
    if (!id) { setAcceso(false); return; }
    setAcceso(localStorage.getItem(clave(id)) === '1');
    let vivo = true;
    misLibros().then((libros) => {
      if (!vivo) return;
      const tiene = libros.length > 0;
      if (tiene) localStorage.setItem(clave(id), '1'); else localStorage.removeItem(clave(id));
      setAcceso(tiene);
    }, () => { /* sin internet: se queda con lo recordado */ });
    return () => { vivo = false; };
  }, [id]);

  return acceso;
}
