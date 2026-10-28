/**
 * Cada pantalla se carga aparte (archivo con nombre por versión). Si el
 * programa se actualiza con la ventana abierta —una actualización de Electron
 * o una nueva compilación—, los archivos de la versión anterior desaparecen y
 * al abrir una pantalla que aún no se había visto (p. ej. Veterinaria) la app
 * se rompía. Vite avisa con 'vite:preloadError': se recarga una vez para tomar
 * la versión nueva. La marca evita recargar en bucle si el archivo de verdad falta.
 */
const CLAVE = 'codecpos_recarga_por_version';

export function recargarSiFaltaPantalla(): void {
  if (typeof window === 'undefined') return;
  window.addEventListener('vite:preloadError', (evento) => {
    let ultima = 0;
    try { ultima = Number(sessionStorage.getItem(CLAVE)) || 0; } catch { /* sin almacenamiento */ }
    if (Date.now() - ultima < 30_000) return; // ya se recargó hace poco: dejar que se vea el error
    evento.preventDefault();
    try { sessionStorage.setItem(CLAVE, String(Date.now())); } catch { /* sin almacenamiento */ }
    window.location.reload();
  });
}
