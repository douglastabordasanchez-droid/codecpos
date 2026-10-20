/**
 * CODEC POS v2.0 — Facturación (electrónica DIAN) en Electron.
 *
 * Misma pantalla que la web: el módulo completo vive en
 * src/app/components/facturacion y aquí solo se conecta con la sesión local
 * y las rutas de escritorio. Módulo de pago aparte — la ruta está protegida
 * por ModuloPOS.FACTURACION_DIAN en routes-pos.tsx.
 */
import { useNavigate } from 'react-router';
import { getLinkedClienteId } from '../lib/supabase/tenantLink';
import { useAuth } from '../contexts/AuthContext';
import { usePOS } from '../contexts/POSContext';
import { ModuloFacturacion, type DestinoFacturacion } from '../components/facturacion/ModuloFacturacion';
// El módulo usa la paleta slate oscura de la web; en modo claro se repinta
// con las mismas reglas que la PWA, limitadas a este contenedor.
import '../../pwa/themeClaro.css';

const RUTAS: Record<DestinoFacturacion, string> = {
  vender: '/pos',
  terceros: '/proveedores',
  productos: '/productos',
};

export default function FacturacionElectronicaPage() {
  const clienteId = getLinkedClienteId();
  const { usuarioActual } = useAuth();
  const navigate = useNavigate();
  const { darkMode } = usePOS();

  if (!clienteId) {
    return (
      <div className="h-screen overflow-y-auto p-6">
        <div className="p-6 rounded-2xl bg-amber-900/30 border-2 border-amber-600 text-amber-200">
          Esta instalación todavía no está vinculada a la nube — la facturación electrónica necesita que primero
          vincules el negocio (Configuración → Vinculación con la nube).
        </div>
      </div>
    );
  }

  return (
    // data-theme va en un contenedor aparte: las reglas de themeClaro.css
    // pintan a los descendientes, y el fondo degradado es uno de ellos.
    <div data-theme={darkMode ? 'dark' : 'light'} style={{ colorScheme: darkMode ? 'dark' : 'light' }}>
    <div className="h-screen overflow-y-auto p-6 bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950">
      <ModuloFacturacion
        clienteId={clienteId}
        // El usuario de Electron es local: no tiene fila en `empleados`, así
        // que solo viaja su nombre (ver OperadorFacturacion).
        operador={{ id: null, nombre: usuarioActual?.nombreCompleto || usuarioActual?.username || 'Administrador' }}
        onIr={(destino) => navigate(RUTAS[destino])}
      />
    </div>
    </div>
  );
}
