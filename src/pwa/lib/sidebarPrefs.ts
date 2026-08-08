const STORAGE_KEY = 'codecpos-sidebar-modulos-ocultos';
export const EVENTO_SIDEBAR_OCULTOS_CAMBIADO = 'codecpos:sidebar-ocultos-cambiado';

export function obtenerRutasOcultas(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

export function esRutaOculta(path: string): boolean {
  return obtenerRutasOcultas().includes(path);
}

export function alternarRutaOculta(path: string): void {
  const actuales = obtenerRutasOcultas();
  const nuevas = actuales.includes(path) ? actuales.filter((p) => p !== path) : [...actuales, path];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(nuevas));
  window.dispatchEvent(new CustomEvent(EVENTO_SIDEBAR_OCULTOS_CAMBIADO));
}
