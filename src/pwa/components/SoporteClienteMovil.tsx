/**
 * Soporte de un cliente desde el celular (Panel de Desarrollador, solo staff
 * de Codec Studio): resumen, contraseña del dueño, empleados con su
 * contraseña y estado, e historial comercial. Usa las mismas funciones de la
 * nube que el panel web /admin (admin_detalle_cliente,
 * admin_fijar_credenciales_licencia, admin_listar_empleados_cliente,
 * admin_resetear_password_empleado, admin_actualizar_empleado).
 * Nunca muestra contraseñas actuales: solo fija una nueva.
 */
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { KeyRound, Users, History, Loader2, Monitor, Smartphone, Power } from 'lucide-react';
import { getSupabaseClient } from '../../app/lib/supabase/config';

const EVENTO: Record<string, string> = {
  CREACION_LICENCIA: 'Licencia creada', CAMBIO_PLAN: 'Cambio de plan', CAMBIO_MODALIDAD: 'Cambio de modalidad',
  UPGRADE: 'Mejora de plan', DOWNGRADE: 'Baja de plan', CANCELACION: 'Cancelación', REACTIVACION: 'Reactivación',
  PROMOCION_APLICADA: 'Promoción aplicada', CAMBIO_PRECIO: 'Cambio de precio', CAMBIO_SUCURSAL: 'Cambio de sede',
  CAMBIO_USUARIO: 'Cambio de usuario', ACTIVACION: 'Activación', SUSPENSION: 'Suspensión', ADDON_AGREGADO: 'Complemento agregado',
  ADDON_CANCELADO: 'Complemento cancelado', PRUEBA_VENCIDA: 'Prueba vencida', PAGO: 'Pago registrado', RENOVACION: 'Renovación',
};

interface Detalle {
  cliente: Record<string, any>;
  licencia_vigente: Record<string, any> | null;
  sucursales: { total: number; limite: number | null };
  usuarios: { total: number; limite: number | null };
  instalaciones: { tipo: 'ELECTRON' | 'PWA'; version: string | null; estado: string; activada_en: string; ultima_conexion: string | null }[];
  historial: Record<string, any>[];
}
interface Empleado { id: string; nombre_completo: string; email: string; rol: string; activo: boolean; created_at: string }

const fecha = (iso?: string | null) => (iso ? new Date(iso).toLocaleString('es-CO', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');
const nombreRol: Record<string, string> = { super_usuario: 'Dueño', admin: 'Administrador', cajero: 'Cajero', mesero: 'Mesero', cocina: 'Cocina', barra: 'Barra', tecnico: 'Técnico' };

function Seccion({ icono: Icono, titulo, children }: { icono: typeof KeyRound; titulo: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4 space-y-3">
      <p className="text-white text-sm font-bold flex items-center gap-2"><Icono className="w-4 h-4 text-amber-400" />{titulo}</p>
      {children}
    </div>
  );
}

export function SoporteClienteMovil({ clienteId, usuarioLicencia }: { clienteId: string; usuarioLicencia?: string }) {
  const [detalle, setDetalle] = useState<Detalle | null>(null);
  const [empleados, setEmpleados] = useState<Empleado[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [usuarioDueno, setUsuarioDueno] = useState(usuarioLicencia || '');
  const [claveDueno, setClaveDueno] = useState('');
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [claves, setClaves] = useState<Record<string, string>>({});
  // Sedes reales del negocio (tabla tiendas, con su estado de cobro de la migración 0150).
  const [sedes, setSedes] = useState<{ cobro_estado: string }[]>([]);

  const cargar = async () => {
    const client = getSupabaseClient();
    if (!client) return;
    const [d, e, t] = await Promise.all([
      client.rpc('admin_detalle_cliente', { p_cliente_id: clienteId }),
      client.rpc('admin_listar_empleados_cliente', { p_cliente_id: clienteId }),
      client.rpc('admin_listar_sedes'),
    ]);
    setSedes(((t.data as any[]) || []).filter((x) => x.cliente_id === clienteId && x.activo));
    if (d.error) { setError(d.error.message); return; }
    setDetalle(d.data as Detalle);
    setEmpleados(((e.data as Empleado[]) || []).sort((a, b) => Number(b.activo) - Number(a.activo)));
  };
  useEffect(() => { void cargar(); }, [clienteId]);

  const ejecutar = async (clave: string, fn: () => Promise<{ error: { message: string } | null }>, ok: string) => {
    setOcupado(clave);
    try {
      const { error: e } = await fn();
      if (e) throw new Error(e.message);
      toast.success(ok);
      await cargar();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setOcupado(null);
    }
  };

  const client = getSupabaseClient();
  if (error) return <p className="text-red-400 text-sm">{error}</p>;
  if (!detalle || !client) return <div className="flex justify-center py-6"><Loader2 className="w-6 h-6 text-amber-500 animate-spin" /></div>;

  const lic = detalle.licencia_vigente;
  const limite = (n: number | null) => (n == null ? 'sin límite' : String(n));

  return (
    <div className="space-y-4">
      <Seccion icono={Monitor} titulo="Resumen">
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-xl bg-slate-950 p-2.5"><p className="text-slate-400">Plan</p><p className="text-white font-bold">{lic?.plan_codigo || lic?.plan || detalle.cliente.plan || '—'}</p></div>
          <div className="rounded-xl bg-slate-950 p-2.5"><p className="text-slate-400">Vence</p><p className="text-white font-bold">{(lic?.fecha_fin_periodo_actual || detalle.cliente.fecha_expiracion) ? new Date(lic?.fecha_fin_periodo_actual || detalle.cliente.fecha_expiracion).toLocaleDateString('es-CO') : 'sin fecha'}</p></div>
          <div className="rounded-xl bg-slate-950 p-2.5"><p className="text-slate-400">Usuarios activos</p><p className="text-white font-bold">{detalle.usuarios.total} de {limite(detalle.usuarios.limite)}</p></div>
          <div className="rounded-xl bg-slate-950 p-2.5"><p className="text-slate-400">Sedes</p><p className="text-white font-bold">{sedes.length || 1}{sedes.some((x) => x.cobro_estado === 'prueba' || x.cobro_estado === 'vencida') ? ' (con prueba)' : ''}</p></div>
        </div>
        {detalle.instalaciones.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-slate-400 text-xs font-bold">Equipos con el sistema</p>
            {detalle.instalaciones.map((i, k) => (
              <div key={k} className="flex items-center gap-2 text-xs">
                {i.tipo === 'ELECTRON' ? <Monitor className="w-3.5 h-3.5 text-slate-400" /> : <Smartphone className="w-3.5 h-3.5 text-slate-400" />}
                <span className="text-white">{i.tipo === 'ELECTRON' ? 'Caja' : 'Celular/web'}{i.version ? ` ${i.version}` : ''}</span>
                <span className="text-slate-500 ml-auto">última conexión {fecha(i.ultima_conexion)}</span>
              </div>
            ))}
          </div>
        )}
      </Seccion>

      <Seccion icono={KeyRound} titulo="Contraseña del dueño">
        <p className="text-slate-400 text-xs">Se fija una nueva (la actual nunca se muestra). Úsala cuando el cliente olvide la suya.</p>
        <input value={usuarioDueno} onChange={(e) => setUsuarioDueno(e.target.value)} placeholder="Usuario de la licencia"
          autoCapitalize="none" className="w-full h-11 px-3 rounded-xl bg-slate-950 border border-slate-700 text-white text-sm" />
        <input value={claveDueno} onChange={(e) => setClaveDueno(e.target.value)} placeholder="Contraseña nueva (mínimo 6)" type="text"
          autoCapitalize="none" className="w-full h-11 px-3 rounded-xl bg-slate-950 border border-slate-700 text-white text-sm" />
        <button
          disabled={ocupado === 'dueno' || !usuarioDueno.trim() || claveDueno.length < 6}
          onClick={() => {
            if (!window.confirm(`¿Cambiar la contraseña del dueño a «${claveDueno}»?`)) return;
            void ejecutar('dueno', async () => client.rpc('admin_fijar_credenciales_licencia', { p_cliente_id: clienteId, p_username: usuarioDueno.trim(), p_password: claveDueno }), 'Contraseña del dueño actualizada');
            setClaveDueno('');
          }}
          className="w-full h-11 rounded-xl bg-amber-500 text-slate-950 text-sm font-black disabled:opacity-40"
        >
          {ocupado === 'dueno' ? 'Guardando…' : 'Guardar contraseña del dueño'}
        </button>
      </Seccion>

      <Seccion icono={Users} titulo={`Empleados (${empleados.filter((e) => e.activo).length} activos)`}>
        {empleados.length === 0 && <p className="text-slate-400 text-xs">Sin empleados.</p>}
        {empleados.map((e) => (
          <div key={e.id} className={`rounded-xl bg-slate-950 p-3 space-y-2 ${e.activo ? '' : 'opacity-60'}`}>
            <div className="flex items-center gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-white text-sm font-bold truncate">{e.nombre_completo}</p>
                <p className="text-slate-500 text-[11px] truncate">{nombreRol[e.rol] || e.rol} · {e.email}</p>
              </div>
              {e.rol !== 'super_usuario' && (
                <button
                  disabled={ocupado === `act-${e.id}`}
                  onClick={() => void ejecutar(`act-${e.id}`, async () => client.rpc('admin_actualizar_empleado', { p_empleado_id: e.id, p_activo: !e.activo, p_rol: null }), e.activo ? 'Empleado desactivado' : 'Empleado activado')}
                  className={`h-9 px-3 rounded-lg text-xs font-bold flex items-center gap-1 ${e.activo ? 'bg-slate-800 text-red-400' : 'bg-emerald-600 text-[#fff]'}`}
                >
                  <Power className="w-3.5 h-3.5" />{e.activo ? 'Desactivar' : 'Activar'}
                </button>
              )}
            </div>
            <div className="flex gap-2">
              <input value={claves[e.id] || ''} onChange={(ev) => setClaves((p) => ({ ...p, [e.id]: ev.target.value }))}
                placeholder="Contraseña nueva" autoCapitalize="none"
                className="flex-1 min-w-0 h-9 px-3 rounded-lg bg-slate-900 border border-slate-700 text-white text-xs" />
              <button
                disabled={ocupado === `clave-${e.id}` || (claves[e.id] || '').length < 4}
                onClick={() => {
                  const nueva = claves[e.id];
                  void ejecutar(`clave-${e.id}`, async () => client.rpc('admin_resetear_password_empleado', { p_empleado_id: e.id, p_password_nueva: nueva }), `Contraseña de ${e.nombre_completo} actualizada`);
                  setClaves((p) => ({ ...p, [e.id]: '' }));
                }}
                className="h-9 px-3 rounded-lg bg-amber-500 text-slate-950 text-xs font-black disabled:opacity-40"
              >
                Cambiar
              </button>
            </div>
          </div>
        ))}
      </Seccion>

      <Seccion icono={History} titulo="Historial comercial">
        {detalle.historial.length === 0 ? <p className="text-slate-400 text-xs">Sin eventos todavía.</p> : (
          <div className="space-y-2">
            {detalle.historial.map((h: any) => (
              <div key={h.id} className="flex items-start gap-3 text-xs border-b border-slate-800 last:border-0 pb-2 last:pb-0">
                <div className="flex-1">
                  <p className="text-white font-semibold">{EVENTO[h.tipo_evento] ?? h.tipo_evento}</p>
                  {h.motivo && <p className="text-slate-400 mt-0.5">{h.motivo}</p>}
                </div>
                <span className="text-slate-500 shrink-0">{fecha(h.created_at)}</span>
              </div>
            ))}
          </div>
        )}
      </Seccion>
    </div>
  );
}
