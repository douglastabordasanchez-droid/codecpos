/**
 * Taller de Reparaciones — versión móvil.
 *
 * Pensada para el técnico que está frente al equipo, no frente al computador:
 * recibir el equipo y crear la orden ahí mismo, mover su estado, cotizar,
 * cobrar el abono o el saldo, y dejar constancia en notas.
 *
 * Lo que se deja SOLO en la caja (Electron), a propósito: el diagnóstico
 * técnico detallado con repuestos y tiempos, la gestión de insumos para el
 * costeo, la garantía, las firmas y la impresión de la orden. Son pantallas
 * densas que en un teléfono se vuelven un formulario interminable.
 *
 * Toda escritura pasa por tallerPwaService, que marca `actualizado_en: 'pwa'`
 * para que Electron sepa qué bajar sin hacer eco de su propio push.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Wrench, X, Loader2, Search, Phone, Clock, Plus, ChevronRight,
  MessageSquarePlus, CheckCircle2, AlertCircle, DollarSign, Receipt,
  UserCog, Tag,
} from 'lucide-react';
import { Button } from '../../app/components/ui/button';
import { Input } from '../../app/components/ui/input';
import { Label } from '../../app/components/ui/label';
import { getSupabaseClient } from '../../app/lib/supabase/config';
import {
  ESTADOS_ORDEN, PRIORIDADES, TIPOS_DISPOSITIVO,
  type EstadoOrden, type Prioridad, type TipoDispositivo,
} from '../../app/types/taller';
import {
  actualizarPresupuestoOrden, agregarNotaOrden, asignarTecnicoOrden,
  cambiarEstadoOrden, crearOrdenDesdePwa, registrarPagoOrden,
  type FilaOrdenTaller,
} from '../lib/tallerPwaService';
import { usePwaAuth } from '../contexts/PwaAuthContext';

/** Estados que el técnico puede fijar desde el celular, en orden de flujo. */
const ESTADOS_MOVIL: EstadoOrden[] = [
  'recibido', 'diagnostico', 'cotizado', 'aprobado', 'en_reparacion',
  'esperando_repuestos', 'reparado', 'listo_entrega', 'entregado',
];

const METODOS_PAGO = ['efectivo', 'nequi', 'daviplata', 'transferencia', 'tarjeta'] as const;

const infoEstado = (estado: string) => ESTADOS_ORDEN.find((e) => e.value === estado) ?? ESTADOS_ORDEN[0];
const infoPrioridad = (p: string) => PRIORIDADES.find((x) => x.value === p) ?? PRIORIDADES[1];
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
  const [ordenes, setOrdenes] = useState<FilaOrdenTaller[]>([]);
  const [cargando, setCargando] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [filtroEstado, setFiltroEstado] = useState<EstadoOrden | 'todas'>('todas');
  const [seleccionada, setSeleccionada] = useState<FilaOrdenTaller | null>(null);
  const [creando, setCreando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const autor = empleado
    ? { clienteId: empleado.cliente_id, nombre: empleado.nombre_completo }
    : null;

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
    setOrdenes((data as FilaOrdenTaller[]) || []);
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

  /** Refleja en la lista y en la hoja abierta la fila que devolvió el servidor. */
  const aplicar = (fila: FilaOrdenTaller) => {
    setOrdenes((prev) => prev.map((o) => (o.id === fila.id ? fila : o)));
    setSeleccionada((prev) => (prev && prev.id === fila.id ? fila : prev));
  };

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

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 pb-24">
      {/* ── Encabezado ── */}
      <div className="px-5 pt-8 pb-4 flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/25">
            <Wrench className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-white text-xl font-black leading-tight">Taller</h1>
            <p className="text-slate-400 text-sm">Órdenes de reparación</p>
          </div>
        </div>
        <button
          onClick={() => setCreando(true)}
          className="h-11 px-4 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center gap-1.5 shadow-lg shadow-cyan-500/25 active:scale-95 transition-transform shrink-0"
        >
          <Plus className="w-4 h-4 text-white" />
          <span className="text-white text-sm font-bold">Recibir</span>
        </button>
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
            <p className="text-slate-500 text-xs mt-1 max-w-[16rem] mx-auto">
              Toca «Recibir» para registrar un equipo, o publica las órdenes existentes desde el
              computador: Configuración → Módulos en la App Web.
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
              onClick={() => setSeleccionada(o)}
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

      {error && (
        <p className="px-5 mt-4 text-red-400 text-sm flex items-center gap-1.5">
          <AlertCircle className="w-4 h-4 shrink-0" /> {error}
        </p>
      )}

      {/* ── Recibir equipo ── */}
      <AnimatePresence>
        {creando && autor && (
          <HojaInferior onCerrar={() => setCreando(false)}>
            <NuevaOrden
              onCerrar={() => setCreando(false)}
              onCrear={async (datos) => {
                const fila = await crearOrdenDesdePwa(autor, datos);
                setOrdenes((prev) => [fila, ...prev]);
                setCreando(false);
                setSeleccionada(fila);
              }}
            />
          </HojaInferior>
        )}
      </AnimatePresence>

      {/* ── Detalle ── */}
      <AnimatePresence>
        {seleccionada && autor && (
          <HojaInferior onCerrar={() => setSeleccionada(null)}>
            <DetalleOrden
              orden={seleccionada}
              autor={autor}
              onCerrar={() => setSeleccionada(null)}
              onAplicar={aplicar}
            />
          </HojaInferior>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Contenedor de hoja inferior ──────────────────────────────────────────────

function HojaInferior({ children, onCerrar }: { children: React.ReactNode; onCerrar: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/75 z-50 flex items-end"
      onClick={(e) => { if (e.target === e.currentTarget) onCerrar(); }}
    >
      <motion.div
        initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        className="w-full bg-slate-950 rounded-t-3xl border-t border-slate-800 max-h-[92vh] overflow-y-auto"
      >
        <div className="w-10 h-1 rounded-full bg-slate-700 mx-auto mt-3" />
        {children}
      </motion.div>
    </motion.div>
  );
}

// ── Recibir equipo (crear orden) ─────────────────────────────────────────────

function NuevaOrden({
  onCerrar, onCrear,
}: {
  onCerrar: () => void;
  onCrear: (datos: Parameters<typeof crearOrdenDesdePwa>[1]) => Promise<void>;
}) {
  const [nombre, setNombre] = useState('');
  const [telefono, setTelefono] = useState('');
  const [tipo, setTipo] = useState<TipoDispositivo>('celular');
  const [marca, setMarca] = useState('');
  const [modelo, setModelo] = useState('');
  const [problema, setProblema] = useState('');
  const [condicion, setCondicion] = useState('');
  const [prioridad, setPrioridad] = useState<Prioridad>('normal');
  const [costoEstimado, setCostoEstimado] = useState('');
  const [anticipo, setAnticipo] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const valido = nombre.trim() && telefono.trim() && marca.trim() && problema.trim();

  const enviar = async () => {
    if (!valido) { setError('Completa cliente, teléfono, marca y la falla reportada'); return; }
    setEnviando(true);
    setError(null);
    try {
      await onCrear({
        clienteNombre: nombre, clienteTelefono: telefono,
        tipo, marca, modelo, condicionFisica: condicion,
        problema, prioridad,
        costoEstimado: Number(costoEstimado) || 0,
        anticipo: Number(anticipo) || 0,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo crear la orden');
      setEnviando(false);
    }
  };

  return (
    <>
      <div className="px-5 pt-3 pb-3 border-b border-slate-800 flex items-center justify-between">
        <div>
          <p className="text-white font-black text-lg leading-tight">Recibir equipo</p>
          <p className="text-slate-400 text-sm">Se crea la orden y queda visible en la caja</p>
        </div>
        <button onClick={onCerrar} className="text-slate-400 p-1 shrink-0"><X className="w-5 h-5" /></button>
      </div>

      <div className="px-5 py-4 space-y-4">
        <Seccion titulo="Cliente">
          <Campo label="Nombre">
            <Input value={nombre} onChange={(e) => setNombre(e.target.value)} autoFocus
              placeholder="Nombre de quien trae el equipo" className="h-12 bg-slate-900 border-slate-700 text-white" />
          </Campo>
          <Campo label="Teléfono">
            <Input value={telefono} onChange={(e) => setTelefono(e.target.value)} type="tel" inputMode="tel"
              placeholder="300 000 0000" className="h-12 bg-slate-900 border-slate-700 text-white" />
          </Campo>
        </Seccion>

        <Seccion titulo="Equipo">
          <div className="grid grid-cols-3 gap-2">
            {TIPOS_DISPOSITIVO.map((t) => (
              <button key={t.value} onClick={() => setTipo(t.value)}
                className={`h-16 rounded-xl flex flex-col items-center justify-center gap-0.5 border transition-all ${
                  tipo === t.value ? 'bg-cyan-500/20 border-cyan-500/60' : 'bg-slate-900 border-slate-800'
                }`}>
                <span className="text-lg">{t.icon}</span>
                <span className={`text-[9px] font-bold leading-tight text-center px-1 ${tipo === t.value ? 'text-cyan-300' : 'text-slate-500'}`}>
                  {t.label.split('/')[0]}
                </span>
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Campo label="Marca">
              <Input value={marca} onChange={(e) => setMarca(e.target.value)}
                placeholder="Samsung" className="h-12 bg-slate-900 border-slate-700 text-white" />
            </Campo>
            <Campo label="Modelo">
              <Input value={modelo} onChange={(e) => setModelo(e.target.value)}
                placeholder="A54" className="h-12 bg-slate-900 border-slate-700 text-white" />
            </Campo>
          </div>
          <Campo label="Estado físico al recibir">
            <Input value={condicion} onChange={(e) => setCondicion(e.target.value)}
              placeholder="Pantalla rayada, sin tapa trasera…" className="h-12 bg-slate-900 border-slate-700 text-white" />
          </Campo>
        </Seccion>

        <Seccion titulo="Falla reportada">
          <textarea
            value={problema} onChange={(e) => setProblema(e.target.value)} rows={3}
            placeholder="Qué dice el cliente que le pasa al equipo"
            className="w-full rounded-lg px-3 py-2.5 text-sm bg-slate-900 border border-slate-700 text-white placeholder:text-slate-600 resize-none"
          />
          <div className="grid grid-cols-4 gap-2">
            {PRIORIDADES.map((p) => (
              <button key={p.value} onClick={() => setPrioridad(p.value)}
                className={`h-10 rounded-lg text-[11px] font-bold transition-all border ${
                  prioridad === p.value ? 'text-white border-transparent' : 'bg-slate-900 border-slate-800 text-slate-400'
                }`}
                style={prioridad === p.value ? { background: p.color } : undefined}>
                {p.label}
              </button>
            ))}
          </div>
        </Seccion>

        <Seccion titulo="Dinero (opcional)">
          <div className="grid grid-cols-2 gap-2">
            <Campo label="Presupuesto estimado">
              <Input value={costoEstimado} onChange={(e) => setCostoEstimado(e.target.value)}
                type="number" inputMode="numeric" placeholder="0"
                className="h-12 bg-slate-900 border-slate-700 text-white font-bold" />
            </Campo>
            <Campo label="Abono recibido">
              <Input value={anticipo} onChange={(e) => setAnticipo(e.target.value)}
                type="number" inputMode="numeric" placeholder="0"
                className="h-12 bg-slate-900 border-slate-700 text-white font-bold" />
            </Campo>
          </div>
        </Seccion>

        {error && <p className="text-red-400 text-sm flex items-center gap-1.5"><AlertCircle className="w-4 h-4" /> {error}</p>}

        <Button onClick={enviar} disabled={enviando || !valido}
          className="w-full h-14 text-base font-bold bg-gradient-to-r from-cyan-500 to-blue-600 disabled:opacity-50">
          {enviando ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <CheckCircle2 className="w-5 h-5 mr-2" />}
          {enviando ? 'Creando orden…' : 'Crear orden de servicio'}
        </Button>
      </div>
    </>
  );
}

// ── Detalle de la orden ──────────────────────────────────────────────────────

function DetalleOrden({
  orden, autor, onCerrar, onAplicar,
}: {
  orden: FilaOrdenTaller;
  autor: { clienteId: string; nombre: string };
  onCerrar: () => void;
  onAplicar: (fila: FilaOrdenTaller) => void;
}) {
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nota, setNota] = useState('');
  const [cobrando, setCobrando] = useState(false);
  const [editandoPresupuesto, setEditandoPresupuesto] = useState(false);
  const [presupuesto, setPresupuesto] = useState(String(orden.costo_final || orden.costo_estimado || ''));
  const [tecnico, setTecnico] = useState(orden.tecnico_asignado || '');
  const [editandoTecnico, setEditandoTecnico] = useState(false);

  const info = infoEstado(orden.estado);
  const d = orden.datos || ({} as FilaOrdenTaller['datos']);
  const problema = (d as any).problemaReportado?.descripcion || '';
  const diagnostico = (d as any).diagnostico?.descripcion || '';
  const notas: any[] = Array.isArray((d as any).notasInternas) ? (d as any).notasInternas : [];
  const pagos: any[] = Array.isArray((d as any).pagos) ? (d as any).pagos : [];

  /** Envuelve cualquier mutación con estado de carga y manejo de error. */
  const ejecutar = async (fn: () => Promise<FilaOrdenTaller>) => {
    setGuardando(true);
    setError(null);
    try {
      onAplicar(await fn());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar el cambio');
    } finally {
      setGuardando(false);
    }
  };

  if (cobrando) {
    return (
      <Cobrar
        orden={orden}
        onCancelar={() => setCobrando(false)}
        onCobrar={async (cobro) => {
          await ejecutar(() => registrarPagoOrden(orden, autor, cobro));
          setCobrando(false);
        }}
      />
    );
  }

  return (
    <>
      <div className="sticky top-0 bg-slate-950/95 backdrop-blur px-5 pt-3 pb-3 border-b border-slate-800 z-10">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-white font-black text-lg leading-tight">{orden.numero_orden}</p>
            <p className="text-slate-400 text-sm truncate">
              {[orden.dispositivo_marca, orden.dispositivo_modelo].filter(Boolean).join(' ') || 'Equipo sin detallar'}
            </p>
            <span className="inline-block mt-1.5 text-[10px] font-bold px-2 py-0.5 rounded-full"
              style={{ background: `${info.color}22`, color: info.color }}>
              {info.icon} {info.label}
            </span>
          </div>
          <button onClick={onCerrar} className="text-slate-400 p-1 shrink-0"><X className="w-5 h-5" /></button>
        </div>
      </div>

      <div className="px-5 py-4 space-y-5">
        {/* Cliente */}
        <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-3.5 space-y-2">
          <p className="text-slate-500 text-[10px] font-bold uppercase tracking-wide">Cliente</p>
          <p className="text-white font-semibold text-sm">{orden.cliente_nombre || 'Sin registrar'}</p>
          {orden.cliente_telefono && (
            <a href={`tel:${orden.cliente_telefono}`} className="inline-flex items-center gap-2 text-cyan-400 text-sm font-semibold">
              <Phone className="w-3.5 h-3.5" /> {orden.cliente_telefono}
            </a>
          )}
        </div>

        {/* Dinero + cobrar */}
        <div>
          <div className="grid grid-cols-3 gap-2 mb-2">
            {[
              { label: 'Presupuesto', valor: orden.costo_final || orden.costo_estimado, color: 'text-slate-200' },
              { label: 'Pagado', valor: orden.anticipo, color: 'text-emerald-400' },
              { label: 'Saldo', valor: orden.saldo_pendiente, color: 'text-amber-400' },
            ].map((k) => (
              <div key={k.label} className="bg-slate-900/70 border border-slate-800 rounded-xl p-3 text-center">
                <p className="text-slate-500 text-[10px] font-bold uppercase">{k.label}</p>
                <p className={`font-black text-sm mt-0.5 ${k.color}`}>{money(k.valor)}</p>
              </div>
            ))}
          </div>

          <div className="flex gap-2">
            <Button onClick={() => setCobrando(true)} disabled={guardando}
              className="flex-1 h-12 font-bold bg-gradient-to-r from-emerald-500 to-teal-600">
              <DollarSign className="w-4 h-4 mr-1.5" /> Cobrar
            </Button>
            <Button variant="outline" onClick={() => setEditandoPresupuesto((v) => !v)}
              className="h-12 px-4 border-slate-700 text-slate-300 bg-slate-900">
              <Tag className="w-4 h-4" />
            </Button>
          </div>

          {editandoPresupuesto && (
            <div className="mt-2 flex gap-2">
              <Input value={presupuesto} onChange={(e) => setPresupuesto(e.target.value)}
                type="number" inputMode="numeric" placeholder="Valor cotizado"
                className="h-11 bg-slate-900 border-slate-700 text-white font-bold" />
              <Button disabled={guardando}
                onClick={() => ejecutar(async () => {
                  const f = await actualizarPresupuestoOrden(orden, autor, Number(presupuesto) || 0);
                  setEditandoPresupuesto(false);
                  return f;
                })}
                className="h-11 px-4 bg-cyan-600 shrink-0">
                {guardando ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Fijar'}
              </Button>
            </div>
          )}

          {pagos.length > 0 && (
            <div className="mt-3">
              <p className="text-slate-500 text-[10px] font-bold uppercase tracking-wide mb-1.5">
                Pagos recibidos ({pagos.length})
              </p>
              <div className="space-y-1.5">
                {pagos.slice().reverse().slice(0, 5).map((p, i) => (
                  <div key={p.id || i} className="flex items-center gap-2 bg-slate-900/70 border border-slate-800 rounded-xl px-3 py-2">
                    <Receipt className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-white text-sm font-semibold">{money(p.monto)}</p>
                      <p className="text-slate-500 text-[10px] capitalize truncate">
                        {p.metodoPago} · {p.recibidoPor}
                        {p.fecha ? ` · ${new Date(p.fecha).toLocaleDateString('es-CO')}` : ''}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Técnico */}
        <div>
          <p className="text-slate-500 text-[10px] font-bold uppercase tracking-wide mb-1.5">Técnico asignado</p>
          {editandoTecnico ? (
            <div className="flex gap-2">
              <Input value={tecnico} onChange={(e) => setTecnico(e.target.value)}
                placeholder="Nombre del técnico" className="h-11 bg-slate-900 border-slate-700 text-white" />
              <Button disabled={guardando}
                onClick={() => ejecutar(async () => {
                  const f = await asignarTecnicoOrden(orden, autor, tecnico.trim());
                  setEditandoTecnico(false);
                  return f;
                })}
                className="h-11 px-4 bg-cyan-600 shrink-0">
                {guardando ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Guardar'}
              </Button>
            </div>
          ) : (
            <button onClick={() => setEditandoTecnico(true)}
              className="w-full flex items-center gap-2 bg-slate-900/70 border border-slate-800 rounded-xl px-3 py-2.5 text-left">
              <UserCog className="w-4 h-4 text-slate-500 shrink-0" />
              <span className={`text-sm flex-1 ${orden.tecnico_asignado ? 'text-white' : 'text-slate-500'}`}>
                {orden.tecnico_asignado || 'Sin asignar — toca para asignar'}
              </span>
            </button>
          )}
        </div>

        {/* Fechas */}
        <div className="flex items-center gap-4 text-xs text-slate-400">
          <span className="flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5" /> Recibido {diasDesde(orden.fecha_recepcion)}
          </span>
        </div>

        {problema && <BloqueTexto titulo="Falla reportada" texto={problema} />}
        {diagnostico && <BloqueTexto titulo="Diagnóstico" texto={diagnostico} />}

        {/* Cambiar estado */}
        <div>
          <p className="text-slate-500 text-[10px] font-bold uppercase tracking-wide mb-2">Mover a</p>
          <div className="grid grid-cols-2 gap-2">
            {ESTADOS_MOVIL.filter((e) => e !== orden.estado).map((estado) => {
              const ie = infoEstado(estado);
              return (
                <button key={estado} disabled={guardando}
                  onClick={() => ejecutar(() => cambiarEstadoOrden(orden, autor, estado))}
                  className="h-12 rounded-xl text-xs font-bold text-white flex items-center justify-center gap-1.5 disabled:opacity-50 active:scale-[0.98] transition-transform"
                  style={{ background: `${ie.color}dd` }}>
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
                  <p className="text-slate-300 text-sm">{n.nota ?? n.texto}</p>
                  <p className="text-slate-600 text-[10px] mt-1">
                    {n.usuario}
                    {n.fecha ? ` · ${new Date(n.fecha).toLocaleString('es-CO', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}` : ''}
                  </p>
                </div>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <Input value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Escribe una nota…"
              className="h-11 bg-slate-900 border-slate-700 text-white placeholder:text-slate-600" />
            <Button disabled={guardando || !nota.trim()}
              onClick={() => ejecutar(async () => {
                const f = await agregarNotaOrden(orden, autor, nota.trim());
                setNota('');
                return f;
              })}
              className="h-11 px-4 bg-cyan-600 shrink-0">
              {guardando ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageSquarePlus className="w-4 h-4" />}
            </Button>
          </div>
        </div>

        {error && <p className="text-red-400 text-sm flex items-center gap-1.5"><AlertCircle className="w-4 h-4" /> {error}</p>}

        <p className="text-slate-600 text-[11px] text-center pb-4">
          El diagnóstico técnico detallado, los repuestos y la impresión de la orden se manejan en la caja.
        </p>
      </div>
    </>
  );
}

// ── Cobrar ───────────────────────────────────────────────────────────────────

function Cobrar({
  orden, onCancelar, onCobrar,
}: {
  orden: FilaOrdenTaller;
  onCancelar: () => void;
  onCobrar: (cobro: { monto: number; metodoPago: typeof METODOS_PAGO[number]; referencia?: string; costoFinal?: number }) => Promise<void>;
}) {
  const saldo = Number(orden.saldo_pendiente) || 0;
  const [monto, setMonto] = useState(saldo > 0 ? String(saldo) : '');
  const [metodo, setMetodo] = useState<typeof METODOS_PAGO[number]>('efectivo');
  const [referencia, setReferencia] = useState('');
  const [enviando, setEnviando] = useState(false);

  const montoNum = Number(monto) || 0;
  const restante = Math.max(0, saldo - montoNum);

  return (
    <>
      <div className="px-5 pt-3 pb-3 border-b border-slate-800 flex items-center justify-between">
        <div>
          <p className="text-white font-black text-lg leading-tight">Cobrar</p>
          <p className="text-slate-400 text-sm">{orden.numero_orden} · saldo {money(saldo)}</p>
        </div>
        <button onClick={onCancelar} className="text-slate-400 p-1 shrink-0"><X className="w-5 h-5" /></button>
      </div>

      <div className="px-5 py-4 space-y-4">
        <Campo label="Monto recibido">
          <Input value={monto} onChange={(e) => setMonto(e.target.value)} type="number" inputMode="numeric"
            autoFocus placeholder="0" className="h-16 text-3xl font-black bg-slate-900 border-slate-700 text-white" />
        </Campo>

        {saldo > 0 && (
          <div className="flex gap-2">
            <button onClick={() => setMonto(String(saldo))}
              className="flex-1 h-10 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-bold">
              Pagar todo ({money(saldo)})
            </button>
            <button onClick={() => setMonto(String(Math.round(saldo / 2)))}
              className="flex-1 h-10 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 text-xs font-bold">
              Mitad
            </button>
          </div>
        )}

        <Campo label="Método de pago">
          <div className="grid grid-cols-3 gap-2">
            {METODOS_PAGO.map((m) => (
              <button key={m} onClick={() => setMetodo(m)}
                className={`h-11 rounded-lg text-xs font-bold capitalize transition-all ${
                  metodo === m ? 'bg-emerald-500 text-white' : 'bg-slate-900 border border-slate-800 text-slate-400'
                }`}>
                {m}
              </button>
            ))}
          </div>
        </Campo>

        {metodo !== 'efectivo' && (
          <Campo label="Referencia (opcional)">
            <Input value={referencia} onChange={(e) => setReferencia(e.target.value)}
              placeholder="N° de comprobante" className="h-12 bg-slate-900 border-slate-700 text-white" />
          </Campo>
        )}

        <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-3 flex items-center justify-between">
          <span className="text-slate-400 text-sm">Quedaría pendiente</span>
          <span className={`text-lg font-black ${restante > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
            {money(restante)}
          </span>
        </div>

        <Button
          onClick={async () => {
            setEnviando(true);
            await onCobrar({ monto: montoNum, metodoPago: metodo, referencia: referencia || undefined });
            setEnviando(false);
          }}
          disabled={enviando || montoNum <= 0}
          className="w-full h-14 text-base font-bold bg-gradient-to-r from-emerald-500 to-teal-600 disabled:opacity-50"
        >
          {enviando ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <DollarSign className="w-5 h-5 mr-2" />}
          {enviando ? 'Registrando…' : `Registrar pago de ${money(montoNum)}`}
        </Button>

        <p className="text-slate-600 text-[11px] text-center">
          El pago queda en la orden y la caja lo ve al instante.
        </p>
      </div>
    </>
  );
}

// ── Piezas de UI ─────────────────────────────────────────────────────────────

function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2.5">
      <p className="text-slate-500 text-[10px] font-bold uppercase tracking-wide">{titulo}</p>
      {children}
    </div>
  );
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-slate-400 text-xs">{label}</Label>
      {children}
    </div>
  );
}

function BloqueTexto({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <div>
      <p className="text-slate-500 text-[10px] font-bold uppercase tracking-wide mb-1.5">{titulo}</p>
      <p className="text-slate-300 text-sm bg-slate-900/70 border border-slate-800 rounded-xl p-3">{texto}</p>
    </div>
  );
}
