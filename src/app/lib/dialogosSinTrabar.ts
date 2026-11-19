/**
 * En Electron sobre Windows, después de un alert, confirm o prompt nativo la
 * ventana queda sin teclado: los campos no escriben hasta hacer alt-tab o
 * reiniciar la caja (parece que el programa se trabó). Aquí se envuelven los
 * tres para que, al cerrarse el cuadro, Electron devuelva el foco a la ventana
 * (ipc 'reenfocar-ventana', refocusMainWindow en electron/main.js).
 * En la web y en Android no hace nada.
 */
export function instalarDialogosSinTrabar(): void {
  if (typeof window === 'undefined') return;
  const api = (window as any).electronAPI;
  if (!api || typeof api.reenfocarVentana !== 'function') return;
  if ((window as any).__dialogosSinTrabar) return;
  (window as any).__dialogosSinTrabar = true;

  const reenfocar = () => {
    try { void Promise.resolve(api.reenfocarVentana()).catch(() => {}); } catch { /* sin puente */ }
  };

  const alertOriginal = window.alert.bind(window);
  const confirmOriginal = window.confirm.bind(window);
  const promptOriginal = window.prompt.bind(window);

  window.alert = (mensaje?: any) => {
    try { alertOriginal(mensaje); } finally { reenfocar(); }
  };
  window.confirm = (mensaje?: string) => {
    try { return confirmOriginal(mensaje); } finally { reenfocar(); }
  };
  window.prompt = (mensaje?: string, valor?: string) => {
    try { return promptOriginal(mensaje, valor); } finally { reenfocar(); }
  };
}
