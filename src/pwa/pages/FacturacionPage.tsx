/**
 * Facturación (web) — módulo de pago aparte, solo facturación electrónica.
 *
 * La pantalla en sí vive en src/app/components/facturacion (compartida con
 * Electron); aquí solo se conecta con la sesión y las rutas de la PWA. La
 * licencia ya la validó <ModuloGate dePago> en routes.tsx.
 *
 * Desde la web también se factura: con el certificado custodiado en la nube
 * (Edge Function dian-emision) se firman y transmiten facturas, notas y el
 * paquete para el cliente, igual que en Electron.
 */
import { Navigate, useNavigate } from 'react-router';
import { usePwaAuth } from '../contexts/PwaAuthContext';
import { ModuloFacturacion, type DestinoFacturacion } from '../../app/components/facturacion/ModuloFacturacion';

const RUTAS: Record<DestinoFacturacion, string> = {
  vender: '/vender',
  terceros: '/proveedores',
  productos: '/inventario',
};

export default function FacturacionPage() {
  const { empleado, soloLectura } = usePwaAuth();
  const navigate = useNavigate();

  if (!empleado) return null;
  if (!['admin', 'super_usuario'].includes(empleado.rol)) return <Navigate to="/" replace />;

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 px-5 pt-8 pb-24">
      <ModuloFacturacion
        clienteId={empleado.cliente_id}
        operador={{ id: empleado.id, nombre: empleado.nombre_completo }}
        soloLectura={soloLectura}
        onIr={(destino) => navigate(RUTAS[destino])}
      />
    </div>
  );
}
