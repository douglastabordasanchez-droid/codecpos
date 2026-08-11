/**
 * Taller de Reparaciones — versión móvil.
 *
 * Réplica operativa del módulo de Electron, pensada para el técnico que está
 * frente al equipo y no frente al computador: ver la cola de órdenes, abrir
 * una, mover su estado y dejar una nota. El catálogo completo de la orden
 * (diagnóstico, insumos, pagos, firmas) se muestra en solo lectura — eso se
 * sigue editando en la caja, que es donde se cobra.
 *
 * Escribe con `actualizado_en: 'pwa'` para que Electron sepa qué bajar y no
 * confunda su propio push con un cambio del celular (ver tallerSyncService).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Wrench, X, Loader2, Search, Phone, Clock,
  ChevronRight, MessageSquarePlus, CheckCircle2, AlertCircle,
} from 'lucide-react';
import { Button } from '../../app/components/ui/button';
import { Input } from '../../app/components/ui/input';
import { getSupabaseClient } from '../../app/lib/supabase/config';
import { ESTADOS_ORDEN, PRIORIDADES, type EstadoOrden } from '../../app/types/taller';
import { usePwaAuth } from '../contexts/PwaAuthContext';

interface OrdenFila {
  id: string;
  local_id: string;
  numero_orden: string;
  estado: EstadoOrden;
  prioridad: string;
  cliente_nombre: string | null;
  cliente_telefono: string | null;
  dispositivo_marca: string | null;
  dispositivo_modelo: string | null;
  dispositivo_tipo: string | null;
  tecnico_asignado: string | null;
  fecha_recepcion: string;
  fecha_estimada_entrega: string | null;
  costo_estimado: number;
  costo_final: number;
  anticipo: number;
  saldo_pendiente: number;
  datos: Record<string, any>;
}

/** Estados que el técnico puede fijar desde el celular, en orden de flujo. */
const ESTADOS_MOVIL: EstadoOrden[] = [
  'recibido', 'diagnostico', 'cotizado', 'aprobado', 'en_reparacion',
  'esperando_repuestos', 'reparado', 'listo_entrega', 'entregado',
];

const infoEstado = (estado: string) =>
  ESTADOS_ORDEN.find((e) => e.value === estado) ?? ESTADOS_ORDEN[0];

const infoPrioridad = (p: string) =>
  PRIORIDADES.find((x) => x.value === p) ?? PRIORIDADES[1];

const money = (n: number) => `$${Math.round(Number(n) || 0).toLocaleString('es-CO')}`;

function diasDesde(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms)) return '—';
  const dias = Math.floor(ms / 86400000);
  if (dias <= 0) return 'Hoy';
  if (dias === 1) return 'Ayer';
  return `Hace ${dias} días`;
}

export default function TallerPage() {
  const { empleado } = usePwaAuth();
  const [ordenes, setOrdenes] = useState<OrdenFila[]>([]);
  const [cargando, setCargando] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [filtroEstado, setFiltroEstado] = useState<EstadoOrden | 'todas'>('todas');
  const [seleccionada, setSeleccionada] = useState<OrdenFila | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [nota, setNota] = useState('');
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    if (!empleado) return;
    const client = getSupabaseClient();
    if (!client) { setCargando(false); return; }
    setCargando(true);
    const { data, error: e } = await client
      .from('taller_ordenes')
      .select('*')
      .eq('cliente_id', empleado.cliente_id)
      .order('fecha_recepcion', { ascending: false })
      .limit(200);
    if (e) setError(e.message);
    setOrdenes((data as OrdenFila[]) || []);
    setCargando(false);
  }, [empleado?.cliente_id]);

  useEffect(() => { cargar(); }, [cargar]);

  // Realtime: si la caja cambia una orden, el técnico lo ve sin recargar.
  useEffect(() => {
    const client = getSupabaseClient();
    if (!client || !empleado) return;
    const canal = client
      .channel(`pwa-taller-${empleado.cliente_id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'taller_ordenes', filter: `cliente_id=eq.${empleado.cliente_id}` },
        () => { cargar(); }
      )
      .subscribe();
    return () => { client.removeChannel(canal); };
  }, [empleado?.cliente_id, cargar]);

  const filtradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return ordenes.filter((o) => {
      if (filtroEstado !== 'todas' && o.estado !== filtroEstado) return false;
      if (!q) return true;
      return [o.numero_orden, o.cliente_nombre, o.dispositivo_marca, o.dispositivo_modelo, o.cliente_telefono]
        .some((v) => String(v || '').toLowerCase().includes(q));
    });
  }, [ordenes, busqueda, filtroEstado]);

  const activas = ordenes.filter((o) => !['entregado', 'cancelado'].includes(o.estado)).length;
  const porCobrar = ordenes.reduce((s, o) => s + (Number(o.saldo_pendiente) || 0), 0);

  /** Aplica un cambio a la fila Y al jsonb `datos`, para que Electron reciba la orden coherente. */
  const actualizarOrden = async (
    orden: OrdenFila,
    cambios: { estado?: EstadoOrden; nota?: string }
  ) => {
    const client = getSupabaseClient();
    if (!client || !empleado) return;
    setGuardando(true);
    setError(null);

    const ahora = new Date().toISOString();
    const datos = { ...(orden.datos || {}) };

    if (cambios.estado) {
      const historial = Array.isArray(datos.historialEstados) ? datos.historialEstados : [];
      datos.estado = cambios.estado;
      datos.historialEstados = [
        ...historial,
        {
          id: `ce_${Date.now()}`,
          estadoAnterior: orden.estado,
          estadoNuevo: cambios.estado,
          fecha: ahora,
          usuario: empleado.nombre_completo,
          nota: 'Actualizado desde la app móvil',
        },
      ];
    }

    if (cambios.nota) {
      const notas = Array.isArray(datos.notasInternas) ? datos.notasInternas : [];
      datos.notasInternas = [
        ...notas,
        { id: `nt_${Date.now()}`, texto: cambios.nota, fecha: ahora, usuario: empleado.nombre_completo },
      ];
    }

    datos.ultimaActualizacion = ahora;

    const payload: Record<string, unknown> = {
      datos,
      actualizado_por: empleado.nombre_completo,
      actualizado_en: 'pwa',
      updated_at: ahora,
    };
    if (cambios.estado) payload.estado = cambios.estado;

    const { error: e } = await client
      .from('taller_ordenes')
      .update(payload)
      .eq('id', orden.id);

    setGuardando(false);
    if (e) { setError(e.message); return; }

    const actualizada = {
      ...orden,
      estado: cambios.estado ?? orden.estado,
      datos,
    };
    setOrdenes((prev) => prev.map((o) => (o.id === orden.id ? actualizada : o)));
    setSeleccionada(actualizada);
    setNota('');
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 pb-24">
      {/* ── Encabezado ── */}
      <div className="px-5 pt-8 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/25">
            <Wrench className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-white text-xl font-black leading-tight">Taller</h1>
            <p className="text-slate-400 text-sm">Órdenes de reparación</p>
          </div>
        </div>
      </div>

      {/* ── Resumen ── */}
      <div className="px-5 grid grid-cols-2 gap-3 mb-4">
        <motion.div
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
          className="bg-gradient-to-br from-cyan-500/90 to-blue-600/90 rounded-2xl p-4 shadow-xl shadow-cyan-500/10"
        >
          <p className="text-white/80 text-[10px] font-bold uppercase tracking-wide">En taller</p>
          <p className="text-white text-3xl font-black mt-0.5">{activas}</p>
          <p className="text-white/70 text-xs">de {ordenes.length} órdenes</p>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.06 }}
          className="bg-slate-900/70 backdrop-blur border border-slate-800 rounded-2xl p-4"
        >
          <p className="text-slate-400 text-[10px] font-bold uppercase tracking-wide">Por cobrar</p>
          <p className="text-amber-400 text-2xl font-black mt-0.5">{money(porCobrar)}</p>
          <p className="text-slate-500 text-xs">saldo pendiente</p>
        </motion.div>
      </div>

      {/* ── Búsqueda ── */}
      <div className="px-5 mb-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <Input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Orden, cliente, equipo o teléfono"
            className="h-11 pl-9 bg-slate-900 border-slate-700 text-white placeholder:text-slate-600"
          />
        </div>
      </div>

      {/* ── Filtro por estado ── */}
      <div className="px-5 mb-4 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
        <button
          onClick={() => setFiltroEstado('todas')}
          className={`shrink-0 px-3 h-8 rounded-full text-xs font-bold transition-all ${
            filtroEstado === 'todas' ? 'bg-cyan-500 text-white' : 'bg-slate-900 border border-slate-800 text-slate-400'
          }`}
        >
          Todas ({ordenes.length})
        </button>
        {ESTADOS_MOVIL.map((estado) => {
          const info = infoEstado(estado);
          const n = ordenes.filter((o) => o.estado === estado).length;
          if (n === 0 && filtroEstado !== estado) return null;
          return (
            <button
              key={estado}
              onClick={() => setFiltroEstado(estado)}
              className={`shrink-0 px-3 h-8 rounded-full text-xs font-bold transition-all border ${
                filtroEstado === estado ? 'text-white border-transparent' : 'bg-slate-900 border-slate-800 text-slate-400'
              }`}
              style={filtroEstado === estado ? { background: info.color } : undefined}
            >
              {info.icon} {info.label} ({n})
            </button>
          );
        })}
      </div>

      {/* ── Lista ── */}
      <div className="px-5 space-y-2">
        {cargando && (
          <div className="flex items-center justify-center gap-2 py-10">
            <Loader2 className="w-4 h-4 animate-spin text-cyan-400" />
            <span className="text-slate-500 text-sm">Cargando órdenes…</span>
          </div>
        )}

        {!cargando && ordenes.length === 0 && (
          <div className="text-center py-12 px-6">
            <div className="w-16 h-16 rounded-3xl bg-slate-900 border border-slate-800 flex items-center justify-center mx-auto mb-3">
              <Wrench className="w-7 h-7 text-slate-700" />
            </div>
            <p className="text-slate-300 font-bold text-sm">Sin órdenes todavía</p>
            <p className="text-slate-500 text-xs mt-1 max-w-[15rem] mx-auto">
              Publica las órdenes desde el computador: Configuración → Módulos en la App Web →
              «Publicar datos ahora».
            </p>
          </div>
        )}

        {!cargando && ordenes.length > 0 && filtradas.length === 0 && (
          <p className="text-slate-500 text-sm text-center py-10">Ninguna orden coincide con el filtro.</p>
        )}

        {filtradas.map((o, i) => {
          const info = infoEstado(o.estado);
          const prio = infoPrioridad(o.prioridad);
          return (
            <motion.button
              key={o.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i * 0.03, 0.3) }}
              onClick={() => { setSeleccionada(o); setNota(''); }}
              className="w-full text-left bg-slate-900/70 backdrop-blur border border-slate-800 rounded-2xl p-3.5 flex items-center gap-3 active:scale-[0.99] transition-transform"
            >
              <div
                className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 text-lg"
                style={{ background: `${info.color}22` }}
              >
                {info.icon}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <p className="text-white font-bold text-sm truncate">{o.numero_orden}</p>
                  {o.prioridad === 'urgente' && (
                    <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-red-500/20 text-red-400 shrink-0">
                      {prio.label}
                    </span>
                  )}
                </div>
                <p className="text-slate-300 text-xs truncate">
                  {[o.dispositivo_marca, o.dispositivo_modelo].filter(Boolean).join(' ') || 'Equipo sin detallar'}
                </p>
                <p className="text-slate-500 text-[11px] truncate">
                  {o.cliente_nombre || 'Sin cliente'} · {diasDesde(o.fecha_recepcion)}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <span
                  className="inline-block text-[10px] font-bold px-2 py-0.5 rounded-full"
                  style={{ background: `${info.color}22`, color: info.color }}
                >
                  {info.label}
                </span>
                {Number(o.saldo_pendiente) > 0 && (
                  <p className="text-amber-400 text-xs font-bold mt-1">{money(o.saldo_pendiente)}</p>
                )}
              </div>
              <ChevronRight className="w-4 h-4 text-slate-600 shrink-0" />
            </motion.button>
          );
        })}
      </div>

      {/* ── Detalle en hoja inferior ── */}
      <AnimatePresence>
        {seleccionada && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 z-50 flex items-end"
            onClick={(e) => { if (e.target === e.currentTarget) setSeleccionada(null); }}
          >
            <motion.div
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              className="w-full bg-slate-950 rounded-t-3xl border-t border-slate-800 max-h-[90vh] overflow-y-auto"
            >
              <DetalleOrden
                orden={seleccionada}
                guardando={guardando}
                error={error}
                nota={nota}
                onNota={setNota}
                onCerrar={() => setSeleccionada(null)}
                onCambiarEstado={(estado) => actualizarOrden(seleccionada, { estado })}
                onAgregarNota={() => nota.trim() && actualizarOrden(seleccionada, { nota: nota.trim() })}
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Hoja de detalle ──────────────────────────────────────────────────────────

function DetalleOrden({
  orden, guardando, error, nota, onNota, onCerrar, onCambiarEstado, onAgregarNota,
}: {
  orden: OrdenFila;
  guardando: boolean;
  error: string | null;
  nota: string;
  onNota: (v: string) => void;
  onCerrar: () => void;
  onCambiarEstado: (estado: EstadoOrden) => void;
  onAgregarNota: () => void;
}) {
  const info = infoEstado(orden.estado);
  const d = orden.datos || {};
  const problema = d.problemaReportado?.descripcion || d.problemaReportado?.detalle || '';
  const diagnostico = d.diagnostico?.descripcion || d.diagnostico?.detalle || '';
  const notas: any[] = Array.isArray(d.notasInternas) ? d.notasInternas : [];
  const insumos: any[] = Array.isArray(d.insumos) ? d.insumos : [];

  return (
    <>
      {/* Cabecera */}
      <div className="sticky top-0 bg-slate-950/95 backdrop-blur px-5 pt-4 pb-3 border-b border-slate-800 z-10">
        <div className="w-10 h-1 rounded-full bg-slate-700 mx-auto mb-3" />
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-white font-black text-lg leading-tight">{orden.numero_orden}</p>
            <p className="text-slate-400 text-sm truncate">
              {[orden.dispositivo_marca, orden.dispositivo_modelo].filter(Boolean).join(' ') || 'Equipo sin detallar'}
            </p>
            <span
              className="inline-block mt-1.5 text-[10px] font-bold px-2 py-0.5 rounded-full"
              style={{ background: `${info.color}22`, color: info.color }}
            >
              {info.icon} {info.label}
            </span>
          </div>
          <button onClick={onCerrar} className="text-slate-400 p-1 shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="px-5 py-4 space-y-5">
        {/* Cliente */}
        <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-3.5 space-y-2">
          <p className="text-slate-500 text-[10px] font-bold uppercase tracking-wide">Cliente</p>
          <p className="text-white font-semibold text-sm">{orden.cliente_nombre || 'Sin registrar'}</p>
          {orden.cliente_telefono && (
            <a
              href={`tel:${orden.cliente_telefono}`}
              className="inline-flex items-center gap-2 text-cyan-400 text-sm font-semibold"
            >
              <Phone className="w-3.5 h-3.5" /> {orden.cliente_telefono}
            </a>
          )}
        </div>

        {/* Dinero */}
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: 'Estimado', valor: orden.costo_estimado, color: 'text-slate-200' },
            { label: 'Anticipo', valor: orden.anticipo, color: 'text-emerald-400' },
            { label: 'Saldo', valor: orden.saldo_pendiente, color: 'text-amber-400' },
          ].map((k) => (
            <div key={k.label} className="bg-slate-900/70 border border-slate-800 rounded-xl p-3 text-center">
              <p className="text-slate-500 text-[10px] font-bold uppercase">{k.label}</p>
              <p className={`font-black text-sm mt-0.5 ${k.color}`}>{money(k.valor)}</p>
            </div>
          ))}
        </div>

        {/* Fechas */}
        <div className="flex items-center gap-4 text-xs text-slate-400">
          <span className="flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5" /> Recibido {diasDesde(orden.fecha_recepcion)}
          </span>
          {orden.fecha_estimada_entrega && (
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Entrega {new Date(orden.fecha_estimada_entrega).toLocaleDateString('es-CO')}
            </span>
          )}
        </div>

        {/* Problema y diagnóstico (lectura) */}
        {problema && (
          <div>
            <p className="text-slate-500 text-[10px] font-bold uppercase tracking-wide mb-1.5">Falla reportada</p>
            <p className="text-slate-300 text-sm bg-slate-900/70 border border-slate-800 rounded-xl p-3">{problema}</p>
          </div>
        )}
        {diagnostico && (
          <div>
            <p className="text-slate-500 text-[10px] font-bold uppercase tracking-wide mb-1.5">Diagnóstico</p>
            <p className="text-slate-300 text-sm bg-slate-900/70 border border-slate-800 rounded-xl p-3">{diagnostico}</p>
          </div>
        )}

        {insumos.length > 0 && (
          <div>
            <p className="text-slate-500 text-[10px] font-bold uppercase tracking-wide mb-1.5">Repuestos e insumos</p>
            <div className="space-y-1.5">
              {insumos.map((it, i) => (
                <div key={i} className="flex items-center justify-between bg-slate-900/70 border border-slate-800 rounded-xl px-3 py-2">
                  <span className="text-slate-300 text-sm truncate">{it.nombre || it.descripcion || 'Insumo'}</span>
                  <span className="text-slate-400 text-xs font-bold shrink-0 ml-2">{money(it.costo ?? it.precio ?? 0)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Cambiar estado */}
        <div>
          <p className="text-slate-500 text-[10px] font-bold uppercase tracking-wide mb-2">Mover a</p>
          <div className="grid grid-cols-2 gap-2">
            {ESTADOS_MOVIL.filter((e) => e !== orden.estado).map((estado) => {
              const ie = infoEstado(estado);
              return (
                <button
                  key={estado}
                  onClick={() => onCambiarEstado(estado)}
                  disabled={guardando}
                  className="h-12 rounded-xl text-xs font-bold text-white flex items-center justify-center gap-1.5 disabled:opacity-50 active:scale-[0.98] transition-transform"
                  style={{ background: `${ie.color}dd` }}
                >
                  <span>{ie.icon}</span> {ie.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Notas */}
        <div>
          <p className="text-slate-500 text-[10px] font-bold uppercase tracking-wide mb-2">
            Notas internas {notas.length > 0 && `(${notas.length})`}
          </p>
          {notas.length > 0 && (
            <div className="space-y-1.5 mb-2.5">
              {notas.slice(-4).reverse().map((n, i) => (
                <div key={n.id || i} className="bg-slate-900/70 border border-slate-800 rounded-xl p-2.5">
                  <p className="text-slate-300 text-sm">{n.texto}</p>
                  <p className="text-slate-600 text-[10px] mt-1">
                    {n.usuario} · {n.fecha ? new Date(n.fecha).toLocaleString('es-CO', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''}
                  </p>
                </div>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <Input
              value={nota}
              onChange={(e) => onNota(e.target.value)}
              placeholder="Escribe una nota…"
              className="h-11 bg-slate-900 border-slate-700 text-white placeholder:text-slate-600"
            />
            <Button
              onClick={onAgregarNota}
              disabled={guardando || !nota.trim()}
              className="h-11 px-4 bg-cyan-600 shrink-0"
            >
              {guardando ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageSquarePlus className="w-4 h-4" />}
            </Button>
          </div>
        </div>

        {error && (
          <p className="text-red-400 text-sm flex items-center gap-1.5">
            <AlertCircle className="w-4 h-4" /> {error}
          </p>
        )}

        <p className="text-slate-600 text-[11px] text-center pb-4">
          El diagnóstico, los pagos y la facturación se siguen editando en la caja.
        </p>
      </div>
    </>
  );
}
