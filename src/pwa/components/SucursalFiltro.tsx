import { useEffect, useState } from 'react';
import { Store, Plus } from 'lucide-react';
import { useNavigate } from 'react-router';
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
      .then(({ data }) => {
        const lista = (data as TiendaOpcion[]) || [];
        setTiendas(lista);
      });
  }, [empleado?.cliente_id, esAdmin]);

  const navigate = useNavigate();
  // Siempre visible para el administrador: la sede separa inventario, ventas y
  // empleados. Sin sedes creadas queda «Tienda Principal» y el acceso para crear una.
  if (!esAdmin) return null;

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
        <option value="">Todas las sedes</option>
        <option value="tienda_principal">Tienda Principal</option>
        {tiendas.map((t) => (
          <option key={t.local_id} value={t.local_id}>{t.nombre}</option>
        ))}
      </select>
      {tiendas.length === 0 && (
        <button
          type="button"
          onClick={() => navigate('/multitienda')}
          className="shrink-0 h-10 px-3 rounded-xl bg-slate-800 border border-slate-700 text-slate-200 text-xs font-bold flex items-center gap-1"
        >
          <Plus className="w-3.5 h-3.5" /> Sede
        </button>
      )}
    </div>
  );
}
