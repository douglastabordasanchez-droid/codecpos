/**
 * Arrastre para reordenar listas con el dedo o el mouse, sin el «drag and
 * drop» del navegador (el WebView de la terminal Android no lo soporta con
 * pantalla táctil; Chrome de Windows sí, por eso allá funcionaba).
 *
 * Los elementos de la lista llevan el atributo indicado con su id
 * (por ejemplo data-orden-id="ventas"). Mientras se arrastra, cada vez que
 * el dedo pasa sobre otro elemento se llama onMover(arrastrado, destino).
 */

interface Opciones {
  /** Nombre del atributo que identifica cada elemento, por ejemplo 'data-orden-id'. */
  atributo: string;
  idArrastrado: string;
  onMover: (idArrastrado: string, idDestino: string) => void;
  onFin?: () => void;
  /** Espera antes de empezar (mantener presionado). 0 = de inmediato (manija). */
  esperaMs?: number;
}

/**
 * Llamar en onPointerDown. Devuelve una función para cancelar. Si `esperaMs` > 0
 * y el dedo se mueve antes (para desplazar la pantalla), no arrastra.
 */
export function iniciarArrastreTactil(e: React.PointerEvent | PointerEvent, opts: Opciones): () => void {
  const inicioX = e.clientX;
  const inicioY = e.clientY;
  let activo = false;
  let ultimoDestino = opts.idArrastrado;
  let temporizador: number | null = null;
  const tactoPrevio = document.body.style.touchAction;

  const alMover = (ev: PointerEvent) => {
    if (!activo) {
      if (Math.hypot(ev.clientX - inicioX, ev.clientY - inicioY) > 10) limpiar();
      return;
    }
    ev.preventDefault();
    const bajo = document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null;
    const destino = bajo?.closest(`[${opts.atributo}]`)?.getAttribute(opts.atributo);
    if (destino && destino !== ultimoDestino && destino !== opts.idArrastrado) {
      opts.onMover(opts.idArrastrado, destino);
    }
    if (destino) ultimoDestino = destino;
  };
  const evitarScroll = (ev: TouchEvent) => { if (activo) ev.preventDefault(); };

  const limpiar = () => {
    if (temporizador) window.clearTimeout(temporizador);
    window.removeEventListener('pointermove', alMover);
    window.removeEventListener('pointerup', terminar);
    window.removeEventListener('pointercancel', terminar);
    window.removeEventListener('touchmove', evitarScroll);
    document.body.style.touchAction = tactoPrevio;
  };
  const terminar = () => {
    const estaba = activo;
    activo = false;
    limpiar();
    if (estaba) opts.onFin?.();
  };
  const empezar = () => {
    activo = true;
    document.body.style.touchAction = 'none';
    try { navigator.vibrate?.(25); } catch { /* sin vibración */ }
  };

  window.addEventListener('pointermove', alMover, { passive: false });
  window.addEventListener('pointerup', terminar);
  window.addEventListener('pointercancel', terminar);
  window.addEventListener('touchmove', evitarScroll, { passive: false });
  if (opts.esperaMs && opts.esperaMs > 0) temporizador = window.setTimeout(empezar, opts.esperaMs);
  else empezar();
  return terminar;
}
