/**
 * Abre una URL externa (wa.me, mailto:, checkout de pago, etc.) de la forma
 * correcta según el contexto: en Electron, `window.open`/`location.href` no
 * garantizan que el navegador o el cliente de correo del sistema se abran (la
 * ventana principal intercepta navegaciones); `window.electron.openExternal`
 * usa `shell.openExternal` de Electron, que sí funciona siempre. Fuera de
 * Electron (navegador normal) se usa el mecanismo web estándar.
 */
export function abrirEnlaceExterno(url: string): void {
  const electronBridge = (window as any).electron;
  if (electronBridge?.openExternal) {
    electronBridge.openExternal(url);
    return;
  }
  if (url.startsWith('mailto:')) {
    window.location.href = url;
  } else {
    window.open(url, '_blank');
  }
}
