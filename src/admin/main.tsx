import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../styles/index.css';
import './temaAdmin.css';
import App from './App';
import { aplicarTema, temaInicial } from './lib/temaAdmin';

// Antes de pintar, para que no se vea un destello del otro modo.
aplicarTema(temaInicial());

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('No se encontró el elemento #root en el DOM');
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>
);
