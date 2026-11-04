/**
 * Modo claro u oscuro del Admin web. Se recuerda en este navegador; si nunca
 * se eligió, sigue el modo del sistema. Los colores están en temaAdmin.css.
 */
import { useCallback, useState } from 'react';

export type TemaAdmin = 'claro' | 'oscuro';

const CLAVE = 'codec_admin_tema';

function temaGuardado(): TemaAdmin | null {
  try {
    const t = localStorage.getItem(CLAVE);
    return t === 'claro' || t === 'oscuro' ? t : null;
  } catch {
    return null;
  }
}

export function temaInicial(): TemaAdmin {
  const guardado = temaGuardado();
  if (guardado) return guardado;
  try {
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'claro' : 'oscuro';
  } catch {
    return 'oscuro';
  }
}

export function aplicarTema(tema: TemaAdmin) {
  const html = document.documentElement;
  html.classList.toggle('admin-claro', tema === 'claro');
  html.classList.toggle('dark', tema === 'oscuro');
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', tema === 'claro' ? '#eef2f7' : '#0f172a');
}

export function useTemaAdmin() {
  const [tema, setTema] = useState<TemaAdmin>(() => (document.documentElement.classList.contains('admin-claro') ? 'claro' : 'oscuro'));
  const cambiar = useCallback(() => {
    setTema((actual) => {
      const nuevo: TemaAdmin = actual === 'claro' ? 'oscuro' : 'claro';
      aplicarTema(nuevo);
      try { localStorage.setItem(CLAVE, nuevo); } catch { /* sin almacenamiento: solo dura esta visita */ }
      return nuevo;
    });
  }, []);
  return { tema, cambiar };
}
