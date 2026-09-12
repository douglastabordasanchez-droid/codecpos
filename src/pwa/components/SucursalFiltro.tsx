import { useEffect, useState } from 'react';
import { Store } from 'lucide-react';
import { getSupabaseClient } from '../../app/lib/supabase/config';
import { usePwaAuth } from '../contexts/PwaAuthContext';
import { getSucursalActiva, setSucursalActiva, suscribirSucursalActiva } from '../lib/sucursalActiva';

interface TiendaOpcion {
  local_id: string;
  nombre: string;
}

/**
 * Selector de sucursal por lista — complementa a SucursalSwitcher (que solo
 * conecta escaneando un QR físico, pensado para "estoy parado en este
 * local"). Este es para reportes/dashboard: el dueño puede estar en
 * cualquier lado y solo quiere ver los números de una sucursal puntual, sin
 * tener que escanear nada. Escribe en la MISMA preferencia compartida
 * (sucursalActiva.ts) que ya usan Vender/Inventario/Alimentos y Bebidas —
 * elegir aquí también las filtra a ellas, y viceversa.
 *
 * Solo para admin/dueño — un empleado operativo tiene su sucursal fija
 * (empleado.tienda_id, asignada por un admin) y no elige.
 */
export function SucursalFiltro() {
  const { empleado } = usePwaAuth();
  const esAdmin = !!empleado && ['admin', 'super_usuario'].includes(empleado.rol);
  const [tiendas, setTiendas] = useState<TiendaOpcion[]>([]);
  const [sucursal, setSucursalLocal] = useState(getSucursalActiva());

  useEffect(() => suscribirSucursalActiva(() => setSucursalLocal(getSucursalActiva())), []);

  useEffect(() => {
    if (!empleado || !esAdmin) return;
    const client = getSupabaseClient();
    if (!client) return;
    client
      .from('tiendas')
      .select('local_id, nombre')
      .eq('cliente_id', empleado.cliente_id)
      .eq('activo', true)
      .neq('local_id', 'tienda_principal')
      .order('nombre')
      .then(({ data }) => setTiendas((data as TiendaOpcion[]) || []));
  }, [empleado?.cliente_id, esAdmin]);

  if (!esAdmin || tiendas.length === 0) return null;

  const valorActual = sucursal?.id || '';

  const onChange = (localId: string) => {
    if (!localId) {
      setSucursalActiva(null);
      return;
    }
    if (localId === 'tienda_principal') {
      setSucursalActiva({ id: 'tienda_principal', nombre: 'Tienda Principal' });
      return;
    }
    const tienda = tiendas.find((t) => t.local_id === localId);
    setSucursalActiva({ id: localId, nombre: tienda?.nombre || localId });
  };

  return (
    <div className="px-5 mb-4 flex items-center gap-2">
      <Store className="w-4 h-4 text-slate-500 shrink-0" />
      <select
        value={valorActual}
        onChange={(e) => onChange(e.target.value)}
        className="flex-1 h-10 bg-slate-900 border border-slate-700 rounded-xl px-3 text-white text-sm"
      >
        <option value="">Todas las sucursales</option>
        <option value="tienda_principal">Tienda Principal</option>
        {tiendas.map((t) => (
          <option key={t.local_id} value={t.local_id}>{t.nombre}</option>
        ))}
      </select>
    </div>
  );
}
