/**
 * CODEC POS v2.0 - Entry Point
 * Punto de entrada principal de la aplicación React
 */

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/index.css';

import { MotionGlobalConfig } from 'motion/react';
import { prepararAlmacenGrande } from './app/lib/almacenGrande';

// ⚡ Modo liviano de la caja (Electron): sin vidrio esmerilado, animaciones decorativas
// limitadas y transiciones instantáneas. Las animaciones infinitas obligaban a redibujar
// varias veces por segundo capas con desenfoque (212 en la app): CPU y GPU ocupados todo
// el tiempo aunque nadie tocara la caja. Ver html.modo-caja en src/styles/index.css.
if (typeof window !== 'undefined' && (window as any).electron) {
  document.documentElement.classList.add('modo-caja');
  MotionGlobalConfig.skipAnimations = true;
}

// Prevenir errores de comunicación en Figma Make
const isFigmaMake = typeof window !== 'undefined' && window.location.hostname.includes('figma.com');

// Verificar que el elemento root existe
const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('❌ No se encontró el elemento #root en el DOM');
}

// Crear y renderizar la aplicación con manejo robusto de errores
const root = createRoot(rootElement);

// Wrapper con error boundary para entornos como Figma Make
// El catálogo y el stock por sede viven en IndexedDB (no caben en localStorage
// con miles de referencias): se cargan a memoria ANTES de importar la app, que
// los lee de forma síncrona desde el primer momento (ver almacenGrande.ts).
const renderApp = async () => {
  await prepararAlmacenGrande().catch((e) => console.error('[almacén]', e));
  const { default: App } = await import('./app/App.tsx');
  try {
    root.render(
      <StrictMode>
        <App />
      </StrictMode>
    );
    console.log('🚀 CODEC POS v2.0 iniciado correctamente');
  } catch (error) {
    console.error('❌ Error al renderizar aplicación:', error);
    // Intentar renderizar sin StrictMode en caso de error
    root.render(<App />);
  }
};

renderApp();

// 🛡️ FIX FLUIDEZ: si este equipo ya fue detectado sin compositing por GPU
// real (ver electron/main.js), se marca <html> para que el CSS global apague
// backdrop-blur en toda la app (ver src/styles/index.css) — sin esto, tarjetas
// y modales con "vidrio esmerilado" saturan la CPU en equipos de bajos
// recursos y se siente como que el teclado no responde al escribir.
if (window.electron?.isSoftwareRendering) {
  window.electron.isSoftwareRendering()
    .then((esSoftware: boolean) => {
      if (esSoftware) document.documentElement.classList.add('gpu-software');
    })
    .catch(() => {});
}

// Detectar si está corriendo en Electron
if (window.electron) {
  console.log('⚡ Ejecutando en modo Electron');
} else if (isFigmaMake) {
  console.log('🎨 Ejecutando en Figma Make');
} else {
  console.log('🌐 Ejecutando en modo Web');
}

// Prevenir reload accidental con Ctrl+R (solo en Electron)
if (window.electron) {
  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'r') {
      e.preventDefault();
      console.log('⚠️ Reload deshabilitado en modo producción');
    }
  });
}

// Manejo de errores globales con protección para Figma Make
window.addEventListener('error', (event) => {
  // Ignorar errores de iframe de Figma
  if (isFigmaMake && event.message?.includes('IframeMessageAbortError')) {
    event.preventDefault();
    return;
  }
  console.error('❌ Error global capturado:', event.error);
});

window.addEventListener('unhandledrejection', (event) => {
  // Ignorar rechazos relacionados con Figma
  if (isFigmaMake && event.reason?.message?.includes('message port was destroyed')) {
    event.preventDefault();
    return;
  }
  console.error('❌ Promise rechazada no manejada:', event.reason);
});