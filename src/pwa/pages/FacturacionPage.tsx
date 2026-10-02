/**
 * Facturación (web) — módulo de pago aparte, solo facturación electrónica.
 *
 * La pantalla en sí vive en src/app/components/facturacion (compartida con
 * Electron); aquí solo se conecta con la sesión y las rutas de la PWA. La
 * licencia ya la validó <ModuloGate dePago> en routes.tsx.
 *
 * Lo que NO se hace desde la web: firmar y transmitir a la DIAN. El
 * certificado del negocio vive cifrado en el computador (Electron) y no debe
 * llegar a un navegador — ver src/app/lib/dian/signatureProvider.ts. Las
 * facturas se emiten al cobrar en Electron y aquí se consultan, se envían al
 * cliente y se les emiten notas; las compras sí se cargan y causan desde aquí.
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
