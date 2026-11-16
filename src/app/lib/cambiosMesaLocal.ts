/**
 * Cuándo se cambió por última vez cada mesa EN ESTE EQUIPO. Sirve para que,
 * al recuperar cuentas de la nube (useSyncModulosNube › pullCuentas), no se
 * pise lo que la caja cambió mientras estaba sin internet: solo se trae de la
 * nube lo que sea más nuevo que el último cambio local.
 */
const CLAVE = 'codecpos_mesas_cambio_local';

export function marcarCambioLocalMesa(mesaId: string): void {
  try {
    const mapa = JSON.parse(localStorage.getItem(CLAVE) || '{}');
    mapa[mesaId] = Date.now();
    localStorage.setItem(CLAVE, JSON.stringify(mapa));
  } catch { /* sin almacenamiento */ }
}

export function cambioLocalDeMesa(mesaId: string): number {
  try { return Number(JSON.parse(localStorage.getItem(CLAVE) || '{}')[mesaId]) || 0; } catch { return 0; }
}
