/**
 * Personal — versión móvil.
 *
 * Muestra el equipo con acceso a la nube (fila real en `empleados`, la
 * misma tabla que usa el login de la PWA) — no es el mismo roster que
 * Electron gestiona localmente con PIN (usuariosStorage.ts, sin cuenta de
 * Supabase Auth), esos dos sistemas siguen siendo distintos. Aquí solo se
 * ve/edita a quien YA tiene cuenta en la nube. Solo admin/super_usuario.
 */
import { useEffect, useState } from 'react';
import { Users, Loader2, ShieldCheck, QrCode, Store } from 'lucide-react';
import { getSupabaseClient } from '../../app/lib/supabase/config';
import { usePwaAuth } from '../contexts/PwaAuthContext';
import { EscanerTiendaQR, type QRPayloadTienda } from '../components/EscanerTiendaQR';
import { toast } from 'sonner';

interface EmpleadoFila {
  id: string;
  nombre_completo: string;
  rol: string;
  activo: boolean;
  tienda_id: string | null;
}

const ROLES: { value: string; label: string }[] = [
  { value: 'super_usuario', label: 'Super usuario' },
  { value: 'admin', label: 'Administrador' },
  { value: 'cajero', label: 'Cajero' },
  { value: 'tecnico', label: 'Técnico' },
  { value: 'mesero', label: 'Mesero' },
  { value: 'cocina', label: 'Cocina' },
  { value: 'barra', label: 'Barra' },
];

export default function PersonalPage() {
  const { empleado } = usePwaAuth();
  const [equipo, setEquipo] = useState<EmpleadoFila[]>([]);
  const [nombresTiendas, setNombresTiendas] = useState<Record<string, string>>({});
  const [cargando, setCargando] = useState(true);
  const esAdmin = !!empleado && ['admin', 'super_usuario'].includes(empleado.rol);

  const cargar = async () => {
    if (!empleado) return;
    setCargando(true);
    const client = getSupabaseClient();
    const { data } = await client!
      .from('empleados')
      .select('id, nombre_completo, rol, activo, tienda_id')
      .eq('cliente_id', empleado.cliente_id)
      .order('nombre_completo');
    setEquipo((data as EmpleadoFila[]) || []);
    setCargando(false);

    const { data: tiendas } = await client!
      .from('tiendas')
      .select('local_id, nombre')
      .eq('cliente_id', empleado.cliente_id);
    setNombresTiendas(Object.fromEntries((tiendas || []).map((t: any) => [t.local_id, t.nombre])));
  };

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empleado?.cliente_id]);

  // Altas/cambios de rol/activo hechos desde Electron o el Admin Web deben
  // verse aquí sin recargar la app.
  useEffect(() => {
    if (!empleado?.cliente_id) return;
    const client = getSupabaseClient();
    if (!client) return;
    const canal = client
      .channel(`empleados-pwa-personal-${empleado.cliente_id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'empleados', filter: `cliente_id=eq.${empleado.cliente_id}` }, () => cargar())
      .subscribe();
    return () => { client.removeChannel(canal); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empleado?.cliente_id]);

  // 🛡️ FIX: la única política de UPDATE sobre `empleados` es
  // `empleados_update_self` (id = auth.uid()) — un admin editando OTRA fila
  // desde aquí quedaba filtrado por RLS silenciosamente (0 filas afectadas,
  // sin error), así que el toggle se veía bien un instante y en realidad
  // nunca se guardaba. Se usa el mismo patrón RPC security definer que
  // `actualizar_permisos_empleado` (ver migración 0032).
  const toggleActivo = async (fila: EmpleadoFila) => {
    if (fila.id === empleado?.id) { toast.error('No puedes desactivarte a ti mismo'); return; }
    const client = getSupabaseClient()!;
    const nuevo = !fila.activo;
    setEquipo((prev) => prev.map((e) => (e.id === fila.id ? { ...e, activo: nuevo } : e)));
    const { error } = await client.rpc('actualizar_empleado_admin', {
      p_empleado_id: fila.id, p_activo: nuevo, p_rol: fila.rol,
    });
    if (error) {
      toast.error('No se pudo actualizar', { description: error.message });
      setEquipo((prev) => prev.map((e) => (e.id === fila.id ? { ...e, activo: !nuevo } : e)));
    } else {
      toast.success(nuevo ? `${fila.nombre_completo} activado` : `${fila.nombre_completo} desactivado`);
    }
  };

  const cambiarRol = async (fila: EmpleadoFila, rol: string) => {
    const client = getSupabaseClient()!;
    const anterior = fila.rol;
    setEquipo((prev) => prev.map((e) => (e.id === fila.id ? { ...e, rol } : e)));
    const { error } = await client.rpc('actualizar_empleado_admin', {
      p_empleado_id: fila.id, p_activo: fila.activo, p_rol: rol,
    });
    if (error) {
      toast.error('No se pudo cambiar el rol', { description: error.message });
      setEquipo((prev) => prev.map((e) => (e.id === fila.id ? { ...e, rol: anterior } : e)));
    }
  };

  // ── Vinculación rápida por QR (requerimiento Multi-Tienda) ──────────────
  // El admin escanea el QR de una sucursal (generado en Electron >
  // Multi-Tienda) para fijar a qué tienda queda limitado un empleado
  // operativo. Ver RPC `asignar_empleado_a_tienda` (migración 0092) — exige
  // que quien llama sea admin del mismo cliente_id.
  const [escaneandoPara, setEscaneandoPara] = useState<EmpleadoFila | null>(null);

  const asignarTienda = async (payload: QRPayloadTienda) => {
    if (!escaneandoPara) return;
    const client = getSupabaseClient()!;
    const { error } = await client.rpc('asignar_empleado_a_tienda', {
      p_empleado_id: escaneandoPara.id,
      p_tienda_id: payload.tienda_id,
    });
    if (error) {
      toast.error('No se pudo vincular la sucursal', { description: error.message });
      setEscaneandoPara(null);
      return;
    }
    setEquipo((prev) => prev.map((e) => (e.id === escaneandoPara.id ? { ...e, tienda_id: payload.tienda_id } : e)));
    toast.success(`${escaneandoPara.nombre_completo} vinculado a "${payload.tienda_nombre}"`);
    setEscaneandoPara(null);
  };

  if (!esAdmin) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 flex flex-col items-center justify-center p-6 text-center">
        <ShieldCheck className="w-8 h-8 text-slate-700 mb-2" />
        <p className="text-slate-400 text-sm">Solo administradores pueden ver esta sección.</p>
      </div>
    );
  }

  if (escaneandoPara) {
    return (
      <EscanerTiendaQR
        clienteIdEsperado={empleado?.cliente_id || ''}
        titulo="Escanear QR de sucursal"
        subtitulo={`Vinculando a ${escaneandoPara.nombre_completo}`}
        onResultado={asignarTienda}
        onCerrar={() => setEscaneandoPara(null)}
      />
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 pb-24">
      <div className="px-5 pt-8 pb-4">
        <h1 className="text-white text-xl font-black">Personal</h1>
        <p className="text-slate-400 text-sm">{equipo.length} con acceso a la app</p>
      </div>

      {cargando ? (
        <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 text-amber-400 animate-spin" /></div>
      ) : equipo.length === 0 ? (
        <div className="text-center py-12 px-6">
          <Users className="w-8 h-8 text-slate-700 mx-auto mb-2" />
          <p className="text-slate-400 text-sm">Nadie más tiene acceso a la app todavía</p>
        </div>
      ) : (
        <div className="px-5 space-y-2.5">
          {equipo.map((e) => (
            <div key={e.id} className="bg-slate-900/70 backdrop-blur border border-slate-800 rounded-2xl p-4">
              <div className="flex items-center justify-between mb-2.5">
                <p className="text-white font-bold text-sm truncate">{e.nombre_completo}{e.id === empleado?.id ? ' (tú)' : ''}</p>
                <button
                  onClick={() => toggleActivo(e)}
                  className={`shrink-0 px-2.5 py-1 rounded-full text-[10px] font-bold ${e.activo ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-800 text-slate-500'}`}
                >
                  {e.activo ? 'Activo' : 'Inactivo'}
                </button>
              </div>
              <select
                value={e.rol}
                onChange={(ev) => cambiarRol(e, ev.target.value)}
                disabled={e.id === empleado?.id}
                className="w-full h-10 rounded-xl bg-slate-950 border border-slate-800 text-white text-sm px-3 disabled:opacity-50"
              >
                {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>

              {!['super_usuario', 'admin'].includes(e.rol) && (
                <div className="flex items-center justify-between gap-2 mt-2.5 pt-2.5 border-t border-slate-800">
                  <div className="flex items-center gap-1.5 text-xs text-slate-400 min-w-0">
                    <Store className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">{e.tienda_id && e.tienda_id !== 'tienda_principal' ? (nombresTiendas[e.tienda_id] || 'Sucursal sin nombre') : 'Tienda Principal'}</span>
                  </div>
                  <button
                    onClick={() => setEscaneandoPara(e)}
                    className="shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-violet-500/15 hover:bg-violet-500/25 text-violet-400 text-[11px] font-bold"
                  >
                    <QrCode className="w-3.5 h-3.5" /> Vincular sucursal
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
