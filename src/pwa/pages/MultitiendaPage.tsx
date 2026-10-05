/**
 * Multitienda (web y celular): inventario por sede, transferencias entre
 * sedes, mercancía en camino, historial y sedes con carga masiva de
 * inventario. La pantalla es la misma que usa Electron
 * (src/app/components/multitienda/MultitiendaNube.tsx).
 */
import { usePwaAuth } from '../contexts/PwaAuthContext';
import { MultitiendaNube } from '../../app/components/multitienda/MultitiendaNube';

export default function MultitiendaPage() {
  const { empleado } = usePwaAuth();
  if (!empleado) return null;
  const esAdmin = ['admin', 'super_usuario'].includes(empleado.rol);
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 px-4 md:px-6 pt-8 pb-24">
      <div className="mb-4">
        <h1 className="text-white text-xl font-black">Multitienda</h1>
        <p className="text-slate-400 text-sm">Inventario de cada sede y transferencias entre ellas</p>
      </div>
      <MultitiendaNube clienteId={empleado.cliente_id} esAdmin={esAdmin} miSede={empleado.tienda_id ?? null} />
    </div>
  );
}
