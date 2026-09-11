/**
 * Precarga en segundo plano de los chunks de los módulos pesados del POS.
 *
 * Por qué existe: en dev, `loadURL('http://localhost:5173')` sirve cada
 * módulo lazy desde el servidor de Vite (ya transformado en memoria, HTTP
 * en loopback) — abrir un módulo por primera vez es casi instantáneo. En la
 * app compilada, `loadFile()` lee esos mismos chunks (ya minificados) desde
 * disco dentro del `.asar`, y en Windows cada lectura de archivo nueva pasa
 * primero por el antivirus (Defender u otro) en tiempo real — eso es lo que
 * se siente como "el sistema se traba levemente" al entrar a un módulo por
 * primera vez, aunque en `localhost` se sienta fluido.
 *
 * El browser ya hace este tipo de precarga sola para links reales
 * (`<link rel="prefetch">`), pero react-router con rutas lazy no genera esos
 * hints. Disparamos manualmente los mismos `import()` que ya usa
 * `routes-pos.tsx` (mismo specifier = mismo chunk, el navegador solo lo
 * pide una vez y lo cachea) en ocioso, escalonados, para no competir con la
 * pantalla que el usuario está viendo justo después de iniciar sesión.
 *
 * Si un import falla (módulo renombrado, chunk no existe) se ignora en
 * silencio: es solo una optimización, la ruta real lo vuelve a intentar
 * normalmente cuando el usuario navegue ahí.
 */
const modulosPrecargables: Array<() => Promise<unknown>> = [
  () => import('../components/pos/POSPageNew'),
  () => import('../components/pos/ProductosPage'),
  () => import('../components/pos/VentasPage'),
  () => import('../components/pos/DashboardPOSPage'),
  () => import('../components/pos/AlertasPage'),
  () => import('../components/pos/ConfiguracionPage'),
  () => import('../components/pos/CierreCajaPage'),
  () => import('../components/pos/ReportesPage'),
  () => import('../components/pos/GastosPage'),
  () => import('../components/pos/ContabilidadPage'),
  () => import('../components/pos/DevolucionesPage'),
  () => import('../components/devices/DispositivosPage'),
  () => import('../pages/FidelizacionPage'),
  () => import('../pages/ProveedoresPage'),
  () => import('../pages/PromocionesPage'),
  () => import('../pages/MultitiendaPage'),
  () => import('../pages/CodigosBarrasPageFull'),
  () => import('../components/taller/TallerPage'),
  () => import('../components/artesGraficas/ArtesGraficasPage'),
  () => import('../components/papeleriaPinateria/PapeleriaPinateriaPage'),
  () => import('../components/pos/PanaderiaOncesPage'),
  () => import('../components/pos/VeterinariaPage'),
  () => import('../components/monitoreo/MonitoreoTerminalesPage'),
  () => import('../pages/FacturacionElectronicaPage'),
];

let precargaIniciada = false;

function enOcioso(fn: () => void) {
  const w = window as unknown as { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number };
  if (typeof w.requestIdleCallback === 'function') w.requestIdleCallback(fn, { timeout: 2000 });
  else setTimeout(fn, 300);
}

/** Llamar una sola vez, apenas el usuario ya está dentro del POS (post-login). */
export function precargarModulosEnSegundoPlano() {
  if (precargaIniciada) return;
  precargaIniciada = true;

  let indice = 0;
  const siguiente = () => {
    if (indice >= modulosPrecargables.length) return;
    const cargarModulo = modulosPrecargables[indice++];
    cargarModulo().catch(() => {});
    enOcioso(siguiente);
  };
  enOcioso(siguiente);
}
