import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { ArrowLeft, Crown, Sparkles, XCircle, Plus, RefreshCw, Gift, Check, X } from 'lucide-react';
import { obtenerDetalleCliente, cancelarLicencia, crearSucursal, registrarAuditoria, obtenerIdLicenciaVigente, registrarLicencia, listarPlanesConPrecios, activarPruebaGratis, actualizarModulosCliente } from '../lib/adminApi';
import { useAdminAuth } from '../contexts/AdminAuthContext';
import {
  PageHeader, SectionCard, LoadingState, ErrorState, EstadoBadge, PlanBadge,
  formatoMoneda, formatoFecha, formatoFechaHora,
} from '../components/ui';
import { MODULOS_CATALOGO } from '../../app/lib/permissions';

const MODALIDADES = ['MENSUAL', 'TRIMESTRAL', 'ANUAL', 'VITALICIA'];

const EVENTO_LABEL: Record<string, string> = {
  CREACION_LICENCIA: 'Licencia creada',
  CAMBIO_PLAN: 'Cambio de plan',
  CAMBIO_MODALIDAD: 'Cambio de modalidad',
  UPGRADE: 'Upgrade',
  DOWNGRADE: 'Downgrade',
  CANCELACION: 'Cancelación',
  REACTIVACION: 'Reactivación',
  PROMOCION_APLICADA: 'Promoción aplicada',
  CAMBIO_PRECIO: 'Cambio de precio',
  CAMBIO_SUCURSAL: 'Cambio de sucursal',
  CAMBIO_USUARIO: 'Cambio de usuario',
  ACTIVACION: 'Activación',
  SUSPENSION: 'Suspensión',
  ADDON_AGREGADO: 'Add-on agregado',
  ADDON_CANCELADO: 'Add-on cancelado',
  MIGRACION_LEGACY: 'Migración inicial',
};

export function ClienteDetallePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { staff } = useAdminAuth();
  const soloLectura = staff?.nivelStaff === 'LECTURA';

  const [detalle, setDetalle] = useState<Awaited<ReturnType<typeof obtenerDetalleCliente>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [procesando, setProcesando] = useState(false);
  const [planes, setPlanes] = useState<Awaited<ReturnType<typeof listarPlanesConPrecios>> | null>(null);
  const [mostrarCambioPlan, setMostrarCambioPlan] = useState(false);
  const [nuevoPlan, setNuevoPlan] = useState({ planCodigo: '', modalidad: 'MENSUAL' });
  const [mostrarModulos, setMostrarModulos] = useState(false);
  const [modulos, setModulos] = useState<string[]>([]);

  const cargar = () => {
    if (id) obtenerDetalleCliente(id).then((data) => {
      setDetalle(data);
      setModulos((data.cliente.modulos_activos as string[] | null) ?? []);
    }).catch((e) => setError(e.message));
  };

  useEffect(cargar, [id]);
  useEffect(() => {
    listarPlanesConPrecios().then((p) => {
      setPlanes(p);
      if (p.length > 0) setNuevoPlan((f) => ({ ...f, planCodigo: p[0].plan_codigo }));
    }).catch(() => {});
  }, []);

  const handleCancelar = async () => {
    if (!id || !detalle?.licencia_vigente) return;
    const motivo = window.prompt('Motivo de la cancelación:');
    if (motivo === null) return;
    setProcesando(true);
    try {
      // admin_detalle_cliente no expone el id de la licencia (solo sus
      // datos) -- se resuelve aparte vía el helper dedicado.
      const licenciaId = await obtenerIdLicenciaVigente(id);
      if (!licenciaId) throw new Error('No se encontró la licencia vigente');
      await cancelarLicencia(licenciaId, motivo);
      await registrarAuditoria('CANCELAR_LICENCIA', id, 'EXITO', { motivo });
      cargar();
    } catch (e: any) {
      await registrarAuditoria('CANCELAR_LICENCIA', id, 'ERROR', { error: e.message });
      alert('No se pudo cancelar: ' + e.message);
    } finally {
      setProcesando(false);
    }
  };

  const handleCambiarPlan = async () => {
    if (!id || !nuevoPlan.planCodigo) return;
    setProcesando(true);
    try {
      await registrarLicencia({ clienteId: id, planCodigo: nuevoPlan.planCodigo, modalidad: nuevoPlan.modalidad, motivo: 'Cambio de plan desde Admin Web' });
      await registrarAuditoria('CAMBIAR_PLAN', id, 'EXITO', { plan: nuevoPlan.planCodigo, modalidad: nuevoPlan.modalidad });
      setMostrarCambioPlan(false);
      cargar();
    } catch (e: any) {
      await registrarAuditoria('CAMBIAR_PLAN', id, 'ERROR', { error: e.message });
      alert('No se pudo cambiar el plan: ' + e.message);
    } finally {
      setProcesando(false);
    }
  };

  const handleAgregarSucursal = async () => {
    if (!id) return;
    const nombre = window.prompt('Nombre de la nueva sucursal:');
    if (!nombre) return;
    setProcesando(true);
    try {
      await crearSucursal(id, nombre);
      await registrarAuditoria('CREAR_SUCURSAL', id, 'EXITO', { nombre });
      cargar();
    } catch (e: any) {
      await registrarAuditoria('CREAR_SUCURSAL', id, 'ERROR', { error: e.message });
      alert('No se pudo crear la sucursal: ' + e.message);
    } finally {
      setProcesando(false);
    }
  };

  const handlePruebaGratis = async () => {
    if (!id) return;
    setProcesando(true);
    try {
      await activarPruebaGratis(id);
      await registrarAuditoria('ACTIVAR_PRUEBA_14_DIAS', id, 'EXITO');
      cargar();
    } catch (e: any) {
      alert('No se pudo activar la prueba: ' + e.message);
    } finally { setProcesando(false); }
  };

  const guardarModulos = async () => {
    if (!id) return;
    setProcesando(true);
    try {
      await actualizarModulosCliente(id, modulos);
      await registrarAuditoria('ACTUALIZAR_MODULOS', id, 'EXITO', { modulos });
      setMostrarModulos(false);
      cargar();
    } catch (e: any) {
      alert('No se pudieron guardar los módulos: ' + e.message);
    } finally { setProcesando(false); }
  };

  if (error) return <><PageHeader title="Cliente" /><ErrorState mensaje={error} /></>;
  if (!detalle) return <><PageHeader title="Cliente" /><LoadingState /></>;

  const lic = detalle.licencia_vigente;
  const esVitalicio = lic?.modalidad === 'VITALICIA';

  return (
    <div>
      <button onClick={() => navigate('/clientes')} className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-200 mb-4">
        <ArrowLeft className="w-4 h-4" /> Volver a clientes
      </button>

      <PageHeader
        title={detalle.cliente.nombre_negocio}
        actions={
          !soloLectura ? (
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setMostrarCambioPlan((v) => !v)}
                disabled={procesando}
                className="flex items-center gap-1.5 text-sm bg-amber-500/15 text-amber-400 border border-amber-500/30 hover:bg-amber-500/25 rounded-lg px-3 py-2 disabled:opacity-50"
              >
                <RefreshCw className="w-4 h-4" /> {lic ? 'Cambiar plan' : 'Activar licencia'}
              </button>
              <button onClick={handlePruebaGratis} disabled={procesando} className="flex items-center gap-1.5 text-sm bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/25 rounded-lg px-3 py-2 disabled:opacity-50">
                <Gift className="w-4 h-4" /> Activar prueba gratis (14 días)
              </button>
              <button onClick={() => setMostrarModulos((value) => !value)} disabled={procesando} className="flex items-center gap-1.5 text-sm bg-slate-800 hover:bg-slate-700 rounded-lg px-3 py-2 disabled:opacity-50">
                <Check className="w-4 h-4" /> Activar / desactivar módulos
              </button>
              <button
                onClick={handleAgregarSucursal}
                disabled={procesando}
                className="flex items-center gap-1.5 text-sm bg-slate-800 hover:bg-slate-700 rounded-lg px-3 py-2 disabled:opacity-50"
              >
                <Plus className="w-4 h-4" /> Agregar sucursal
              </button>
              {lic && (
                <button
                  onClick={handleCancelar}
                  disabled={procesando}
                  className="flex items-center gap-1.5 text-sm bg-red-500/15 text-red-400 border border-red-500/30 hover:bg-red-500/25 rounded-lg px-3 py-2 disabled:opacity-50"
                >
                  <XCircle className="w-4 h-4" /> Cancelar licencia
                </button>
              )}
            </div>
          ) : (
            <span className="text-xs text-slate-400 self-center">Modo solo lectura</span>
          )
        }
      />

      {mostrarCambioPlan && (
        <SectionCard className="mb-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-end gap-3">
            <div className="flex-1">
              <p className="text-slate-300 text-xs mb-1">Plan</p>
              <select
                value={nuevoPlan.planCodigo}
                onChange={(e) => setNuevoPlan((f) => ({ ...f, planCodigo: e.target.value }))}
                className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm outline-none focus:border-amber-500"
              >
                {(planes ?? []).map((p) => <option key={p.plan_codigo} value={p.plan_codigo}>{p.plan_nombre}</option>)}
              </select>
            </div>
            <div className="flex-1">
              <p className="text-slate-300 text-xs mb-1">Modalidad</p>
              <select
                value={nuevoPlan.modalidad}
                onChange={(e) => setNuevoPlan((f) => ({ ...f, modalidad: e.target.value }))}
                className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm outline-none focus:border-amber-500"
              >
                {MODALIDADES.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <button
              onClick={handleCambiarPlan}
              disabled={procesando}
              className="bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-slate-950 font-semibold rounded-lg px-4 py-2 text-sm"
            >
              Confirmar
            </button>
          </div>
        </SectionCard>
      )}

      {mostrarModulos && (
        <SectionCard title="Módulos del cliente" className="mb-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {MODULOS_CATALOGO.filter((modulo) => modulo.categoria !== 'desarrollador').map((modulo) => {
              const activo = modulos.includes(modulo.id);
              return <button key={modulo.id} type="button" onClick={() => setModulos((actuales) => activo ? actuales.filter((id) => id !== modulo.id) : [...actuales, modulo.id])} className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm ${activo ? 'border-slate-500 bg-slate-700 text-white' : 'border-slate-700 bg-slate-900 text-slate-300'}`}><span>{activo ? <Check className="w-4 h-4 text-emerald-300" /> : <X className="w-4 h-4 text-slate-500" />}</span><span>{modulo.nombre}</span></button>;
            })}
          </div>
          <button onClick={guardarModulos} disabled={procesando} className="mt-4 rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-950 disabled:opacity-50">Guardar módulos</button>
        </SectionCard>
      )}

      {esVitalicio && (
        <div className="flex items-center gap-2 bg-violet-500/10 border border-violet-500/30 text-violet-300 rounded-lg px-4 py-3 mb-5 text-sm">
          <Crown className="w-4 h-4 shrink-0" />
          Este cliente tiene una licencia <strong>VITALICIA</strong> (pago único) — no es una suscripción mensual recurrente.
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <SectionCard title="Licencia" className="lg:col-span-2">
          {!lic ? (
            <p className="text-slate-400 text-sm">Este cliente no tiene una licencia vigente.</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
              <div><p className="text-slate-300 text-xs mb-1">Plan</p><PlanBadge plan={lic.plan_codigo} /></div>
              <div><p className="text-slate-300 text-xs mb-1">Modalidad</p>{esVitalicio ? <span className="inline-flex items-center gap-1 text-violet-300"><Sparkles className="w-3.5 h-3.5" />Vitalicio</span> : <span>{lic.modalidad}</span>}</div>
              <div><p className="text-slate-300 text-xs mb-1">Estado</p><EstadoBadge estado={esVitalicio ? 'VITALICIA' : lic.estado} /></div>
              <div><p className="text-slate-300 text-xs mb-1">Precio efectivo</p><span className="font-semibold">{lic.precio_efectivo != null ? formatoMoneda(lic.precio_efectivo) + '/mes' : 'No configurado'}</span></div>
              <div><p className="text-slate-300 text-xs mb-1">Inicio</p>{formatoFecha(lic.fecha_inicio)}</div>
              <div><p className="text-slate-300 text-xs mb-1">Próxima renovación</p>{lic.fecha_fin_periodo_actual ? formatoFecha(lic.fecha_fin_periodo_actual) : '—'}</div>
            </div>
          )}
        </SectionCard>

        <SectionCard title="Límites y accesos">
          <div className="space-y-3 text-sm">
            <div className="flex justify-between"><span className="text-slate-400">Sucursales</span><span className="font-medium tabular-nums">{detalle.sucursales.total} / {detalle.sucursales.limite ?? '∞'}</span></div>
            <div className="flex justify-between"><span className="text-slate-400">Usuarios</span><span className="font-medium tabular-nums">{detalle.usuarios.total} / {detalle.usuarios.limite ?? '∞'}</span></div>
            <div className="flex justify-between"><span className="text-slate-400">App móvil</span><span className={detalle.app_movil ? 'text-emerald-400' : 'text-slate-400'}>{detalle.app_movil ? 'Sí' : 'No'}</span></div>
          </div>
        </SectionCard>
      </div>

      {detalle.addons_activos.length > 0 && (
        <SectionCard title="Add-ons activos" className="mb-6">
          <div className="flex flex-wrap gap-2">
            {detalle.addons_activos.map((a, i) => (
              <span key={i} className="text-xs bg-slate-800 border border-slate-700 rounded-full px-3 py-1">
                {a.nombre} × {a.cantidad} — {formatoMoneda(a.precio_aplicado)}
              </span>
            ))}
          </div>
        </SectionCard>
      )}

      <SectionCard title="Instalaciones" className="mb-6">
        {detalle.instalaciones.length === 0 ? (
          <p className="text-slate-400 text-sm">Este cliente todavía no ha iniciado sesión desde Electron ni la App.</p>
        ) : (
          <div className="space-y-2">
            {detalle.instalaciones.map((inst, i) => (
              <div key={i} className="flex items-center justify-between text-sm border-b border-slate-800 last:border-0 pb-2 last:pb-0">
                <div>
                  <span className="font-medium">{inst.tipo === 'ELECTRON' ? 'Escritorio (Electron)' : 'App / Web'}</span>
                  {inst.version && <span className="text-slate-400 ml-2">v{inst.version}</span>}
                </div>
                <span className="text-xs text-slate-400">
                  {inst.ultima_conexion ? `Última conexión: ${formatoFechaHora(inst.ultima_conexion)}` : `Activada: ${formatoFecha(inst.activada_en)}`}
                </span>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard title="Historial comercial">
        {detalle.historial.length === 0 ? (
          <p className="text-slate-400 text-sm">Sin eventos registrados todavía.</p>
        ) : (
          <div className="space-y-3">
            {detalle.historial.map((h: any) => (
              <div key={h.id} className="flex items-start gap-3 text-sm border-b border-slate-800 last:border-0 pb-3 last:pb-0">
                <div className="flex-1">
                  <p className="font-medium">{EVENTO_LABEL[h.tipo_evento] ?? h.tipo_evento}</p>
                  {h.motivo && <p className="text-slate-400 text-xs mt-0.5">{h.motivo}</p>}
                </div>
                <span className="text-xs text-slate-400 shrink-0">{formatoFechaHora(h.created_at)}</span>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
