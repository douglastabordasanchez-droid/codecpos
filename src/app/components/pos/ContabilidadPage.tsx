/**
 * CODEC POS v2.0 — Módulo de Contabilidad Dinámico y Editable
 * Ingresos extra + gastos unificados, categorías dinámicas, balance
 * automático y flujo de caja visual. Los gastos se comparten con el
 * módulo de Gastos (misma fuente de datos) para que cierre de caja,
 * Dashboard y Reportes sigan viendo exactamente los mismos números.
 */

import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  Calculator, TrendingUp, TrendingDown, Wallet, Plus, Search, X,
  Edit2, Trash2, Printer, Tag, ArrowUpCircle, ArrowDownCircle, Calendar,
  User, CreditCard, ChevronLeft, ChevronRight, Palette, FileDown,
  AlertTriangle, Landmark, Banknote, Wrench, Target, FileSpreadsheet,
  ArrowUp, ArrowDown, Repeat, ShieldCheck, Bell, Pencil, CheckCircle2,
  Sparkles, Users, LineChart, Activity, FileText, Send, Download,
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../ui/select';
import { usePOS } from '../../contexts/POSContext';
import { useDebounce } from '../../hooks/useDebounce';
import { useAuth } from '../../contexts/AuthContext';
import { electronStore } from '../../lib/electronStore';
import { esModuloActivoGlobal, ModuloPOS } from '../../lib/permissions';
import { getPrinterForSectionOrUndefined } from '../../lib/sectionPrinterConfig';
import { getConfiguredTicketWidthMm } from '../../lib/printerConfig';
import { type CuentaCartera, obtenerCuentaCartera } from '../../lib/carteraService';
import { ModalDetalleCuentaCartera } from './ModalDetalleCuentaCartera';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import {
  type MovimientoContable, type CategoriaContable, type TipoMovimiento, type OrigenFondos,
  type ProgresoPresupuesto, type RecordatorioGastoRecurrente, type GastoRecurrente,
  obtenerMovimientos, obtenerCategorias, obtenerCategoriasPorTipo,
  crearCategoria, eliminarCategoria, nombreCategoria, colorCategoria,
  guardarIngresoExtra, eliminarIngresoExtra,
  crearGasto, actualizarGasto, eliminarGasto,
  usuariosDistintos, calcularProgresoPresupuestos, obtenerPresupuestos, guardarPresupuesto,
  obtenerGastosRecurrentes, guardarGastoRecurrente, eliminarGastoRecurrente, calcularRecordatoriosPendientes,
} from '../../lib/contabilidadService';
import { getLinkedClienteId } from '../../lib/supabase/tenantLink';
import { listarFacturasDian } from '../../lib/supabase/facturaElectronicaDianService';
import type { FacturaElectronicaDian, EstadoDocumentoDian } from '../../lib/dian/types';

const ESTADO_DIAN_UI: Record<EstadoDocumentoDian, { label: string; color: string }> = {
  draft: { label: 'Borrador', color: '#94a3b8' },
  pending: { label: 'Pendiente', color: '#f59e0b' },
  signing: { label: 'Firmando', color: '#0ea5e9' },
  sent: { label: 'Enviada a la DIAN', color: '#0ea5e9' },
  accepted: { label: 'Aceptada', color: '#10b981' },
  rejected: { label: 'Rechazada', color: '#ef4444' },
  error: { label: 'Error', color: '#ef4444' },
  contingency: { label: 'Contingencia', color: '#f97316' },
  cancelled: { label: 'Anulada', color: '#64748b' },
};

const fmt = (v: number) => `$${Math.round(Number(v) || 0).toLocaleString('es-CO')}`;
const getFechaLocalISO = (date: Date = new Date()) => {
  const tzOffsetMs = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - tzOffsetMs).toISOString().split('T')[0];
};

const METODOS_PAGO = [
  { id: 'efectivo', label: 'Efectivo', color: '#10b981' },
  { id: 'transferencia', label: 'Transferencia', color: '#06b6d4' },
  { id: 'nequi', label: 'Nequi', color: '#8b5cf6' },
  { id: 'daviplata', label: 'Daviplata', color: '#ef4444' },
  { id: 'tarjeta', label: 'Tarjeta', color: '#3b82f6' },
];

const COLORES_CATEGORIA = ['#10b981', '#3b82f6', '#8b5cf6', '#ef4444', '#f59e0b', '#06b6d4', '#ec4899', '#14b8a6', '#f97316', '#64748b'];

function metodoColor(metodo: string): string {
  return METODOS_PAGO.find((m) => m.id === String(metodo).toLowerCase())?.color || '#94a3b8';
}
function metodoLabel(metodo: string): string {
  return METODOS_PAGO.find((m) => m.id === String(metodo).toLowerCase())?.label || metodo;
}

// ─────────────── Tarjeta HERO de KPI (fintech, viva, a todo color) ─────────
// Fondo sólido en degradado intenso propio de cada métrica (no un simple
// recuadro con borde) para que el estado del negocio se entienda de un
// vistazo: verde = entra dinero, rojo = sale dinero, azul/violeta u oro =
// gana, rojo de alerta = pierde. Los desgloses viven como badges de vidrio
// dentro de la misma tarjeta en vez de repetirse en subtarjetas aparte.
function HeroKpiCard({
  titulo, valor, icon: Icon, gradiente, badges, activa, onClick, resaltado, cambioPct,
}: {
  titulo: string; valor: string; icon: any; gradiente: string;
  badges: { label: string; value: string }[]; activa?: boolean; onClick?: () => void; resaltado?: string;
  cambioPct?: number | null;
}) {
  return (
    <motion.button
      onClick={onClick}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -6, scale: 1.015 }}
      whileTap={{ scale: 0.985 }}
      transition={{ duration: 0.3 }}
      className={`relative text-left rounded-[28px] p-7 min-h-[220px] overflow-hidden bg-gradient-to-br ${gradiente} ${onClick ? 'cursor-pointer' : 'cursor-default'} ${activa ? 'ring-4 ring-white/70' : ''}`}
      style={{ boxShadow: '0 22px 45px -12px rgba(0,0,0,0.4), 0 8px 18px -8px rgba(0,0,0,0.25)' }}
    >
      {/* Blobs desenfocados — dan la textura "glassmorphism" de profundidad */}
      <div className="absolute -top-12 -right-10 w-44 h-44 rounded-full bg-white/15 blur-3xl pointer-events-none" />
      <div className="absolute -bottom-16 -left-10 w-48 h-48 rounded-full bg-black/10 blur-3xl pointer-events-none" />

      <div className="relative z-10 flex flex-col h-full">
        <div className="flex items-center justify-between mb-5">
          <div className="w-14 h-14 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center border border-white/30 shadow-inner">
            <Icon className="w-7 h-7 text-white" />
          </div>
          {resaltado && (
            <span className="px-2.5 py-1 rounded-full bg-white/20 backdrop-blur-sm text-white text-[11px] font-bold border border-white/25">
              {resaltado}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 mb-1">
          <p className="text-white/85 text-sm font-bold uppercase tracking-wide">{titulo}</p>
          {cambioPct !== undefined && cambioPct !== null && Number.isFinite(cambioPct) && (
            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-white/20 text-white text-[10px] font-bold">
              {cambioPct >= 0 ? <ArrowUp className="w-2.5 h-2.5" /> : <ArrowDown className="w-2.5 h-2.5" />}
              {Math.abs(cambioPct).toFixed(0)}%
            </span>
          )}
        </div>
        <p className="text-white font-extrabold text-4xl mb-4 tracking-tight" style={{ textShadow: '0 2px 10px rgba(0,0,0,0.2)' }}>{valor}</p>

        <div className="mt-auto flex flex-wrap gap-1.5">
          {badges.map((b) => (
            <span key={b.label} className="px-2.5 py-1 rounded-full bg-white/15 text-white/95 text-[11px] font-semibold backdrop-blur-sm border border-white/10">
              {b.label}: <span className="font-extrabold">{b.value}</span>
            </span>
          ))}
        </div>
      </div>
    </motion.button>
  );
}

// Sombra suave de profundidad para paneles generales (gráfico, filtros, tabla)
// — mismo lenguaje que el Panel del Dashboard, con un leve acento de marca.
function panelSombra(dark: boolean, accent = '#10b981') {
  return dark
    ? `0 4px 20px rgba(0,0,0,0.35), 0 0 0 1px ${accent}12`
    : `0 2px 12px rgba(0,0,0,0.07), 0 0 0 1px ${accent}10`;
}

// ─────────────── Anillo circular de progreso (columna derecha) ─────────────
// Tarjetas verticales con un gauge en SVG — la idea es que el estado del
// negocio se lea con una mirada rápida a una fila de círculos de colores,
// sin tener que interpretar números.
function CircularGauge({
  titulo, subtitulo, valorTexto, pct, color, icon: Icon, dark, accion,
}: {
  titulo: string; subtitulo: string; valorTexto: string; pct: number; color: string;
  icon: any; dark: boolean; accion?: React.ReactNode;
}) {
  const size = 84;
  const stroke = 8;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pctClamped = Math.min(Math.max(pct, 0), 100);
  const offset = c - (pctClamped / 100) * c;

  return (
    <div
      className="rounded-[22px] p-4 flex items-center gap-3.5"
      style={{
        background: dark ? 'rgba(13,22,45,0.85)' : '#ffffff',
        border: dark ? `1px solid ${color}30` : `1px solid ${color}25`,
        boxShadow: dark ? `0 4px 18px rgba(0,0,0,0.3), 0 0 0 1px ${color}12` : `0 2px 12px rgba(0,0,0,0.06), 0 0 0 1px ${color}10`,
      }}
    >
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'} strokeWidth={stroke} />
          <motion.circle
            cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
            strokeDasharray={c}
            initial={{ strokeDashoffset: c }}
            animate={{ strokeDashoffset: offset }}
            transition={{ duration: 0.9, ease: 'easeOut' }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <Icon className="w-6 h-6" style={{ color }} />
        </div>
      </div>
      <div className="min-w-0 flex-1">
        <p className={`text-[10px] uppercase font-bold tracking-wide truncate ${dark ? 'text-slate-500' : 'text-gray-400'}`}>{titulo}</p>
        <p className={`text-lg font-extrabold truncate ${dark ? 'text-white' : 'text-slate-900'}`}>{valorTexto}</p>
        <p className={`text-[11px] truncate ${dark ? 'text-slate-400' : 'text-slate-500'}`}>{subtitulo}</p>
        {accion}
      </div>
    </div>
  );
}

type RangoRapido = 'hoy' | 'ayer' | 'semana' | 'mes' | 'mes_anterior' | 'trimestre' | 'semestre' | 'anio' | 'todos' | 'personalizado';

export default function ContabilidadPage() {
  const { darkMode } = usePOS();
  const { usuarioActual } = useAuth();

  const [rangoRapido, setRangoRapido] = useState<RangoRapido>('mes');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [busqueda, setBusqueda] = useState('');
  // 🚀 FIX rendimiento: cargarMovimientos() reparsea localStorage (ingresos +
  // gastos) y corre hasta 7 filtros encadenados — antes se re-ejecutaba en
  // cada tecla. El input sigue controlado por `busqueda` (sin retraso); solo
  // la carga pesada espera al valor debounced.
  const busquedaDebounced = useDebounce(busqueda, 200);
  const [filtroTipo, setFiltroTipo] = useState<TipoMovimiento | 'todos'>('todos');
  const [filtroCategoria, setFiltroCategoria] = useState('');
  const [filtroMetodo, setFiltroMetodo] = useState('');
  const [filtroUsuario, setFiltroUsuario] = useState('');

  const [filtroOrigen, setFiltroOrigen] = useState<OrigenFondos | 'todos'>('todos');

  const [movimientos, setMovimientos] = useState<MovimientoContable[]>([]);
  const [categorias, setCategorias] = useState<CategoriaContable[]>(obtenerCategorias());
  const [ventasPOS, setVentasPOS] = useState(0);
  const [ingresosTaller, setIngresosTaller] = useState(0);
  const [devolucionesPeriodo, setDevolucionesPeriodo] = useState(0);

  // Caché de pagos de Taller: se lee UNA sola vez de IndexedDB (todas las
  // órdenes no cambian de tamaño seguido) y se reutiliza en memoria tanto
  // para el período actual como para el "período anterior" de la comparativa
  // — antes se golpeaba `tallerService.buscarOrdenes({})` dos veces por cada
  // cambio de fecha, lo cual era una relectura completa e innecesaria.
  const [pagosTallerCache, setPagosTallerCache] = useState<{ fecha: string; monto: number }[] | null>(null);
  const [presupuestos, setPresupuestos] = useState<ProgresoPresupuesto[]>(calcularProgresoPresupuestos());
  const [pagina, setPagina] = useState(1);
  const FILAS_POR_PAGINA = 12;
  // 🚀 FIX rendimiento: cuentasPorCobrar se renderizaba completa sin
  // paginar — mismo patrón 12/página que movimientos, por si la lista crece.
  const [paginaCobrar, setPaginaCobrar] = useState(1);

  // ── Comparativa vs. período anterior (mismo largo de rango, inmediatamente antes) ──
  const [totalesAnterior, setTotalesAnterior] = useState<{ ingresos: number; gastos: number } | null>(null);

  // ── Meta mensual de ganancia (como "Meta del Día" del Dashboard, pero mensual) ──
  const METAKEY = 'codecpos_meta_mensual_ganancia';
  const [metaMensual, setMetaMensual] = useState<number>(() => {
    try { return JSON.parse(localStorage.getItem(METAKEY) || '1000000'); } catch { return 1000000; }
  });
  const [editandoMeta, setEditandoMeta] = useState(false);
  const [inputMeta, setInputMeta] = useState('');

  // ── Gastos recurrentes y recordatorios ──────────────────────────────────
  const [gastosRecurrentes, setGastosRecurrentes] = useState<GastoRecurrente[]>(obtenerGastosRecurrentes());
  const [recordatorios, setRecordatorios] = useState<RecordatorioGastoRecurrente[]>(calcularRecordatoriosPendientes());
  const [modalRecurrentes, setModalRecurrentes] = useState(false);

  const [modalMovimiento, setModalMovimiento] = useState<{ tipo: TipoMovimiento; editar?: MovimientoContable; prellenar?: { categoria?: string; concepto?: string; monto?: number } } | null>(null);
  const [modalCategorias, setModalCategorias] = useState(false);
  const [confirmarEliminar, setConfirmarEliminar] = useState<MovimientoContable | null>(null);

  const nombreUsuarioActual = usuarioActual?.nombreCompleto || usuarioActual?.username || 'Desconocido';
  const moduloTallerActivo = esModuloActivoGlobal(ModuloPOS.TALLER_REPARACIONES);

  // ── Navegación por pestañas: centro de control financiero ──────────────
  const [tabActiva, setTabActiva] = useState<'resumen' | 'cobrar' | 'rentabilidad' | 'flujo' | 'dian' | 'reportes'>('resumen');

  // ── Facturación electrónica DIAN: solo lectura/descarga de los XML ya
  // generados por el módulo de Facturación Electrónica — no se reinventa esa
  // lógica, se reusa `listarFacturasDian` tal cual la usa esa página. ──────
  const clienteIdDian = useMemo(() => getLinkedClienteId(), []);
  const [facturasDian, setFacturasDian] = useState<FacturaElectronicaDian[]>([]);
  const [cargandoDian, setCargandoDian] = useState(false);
  const [busquedaDian, setBusquedaDian] = useState('');
  const [facturaXmlDian, setFacturaXmlDian] = useState<FacturaElectronicaDian | null>(null);

  // ── Cuentas por cobrar: se arma cruzando Taller (saldoPendiente),
  // Apartados (saldo) y Cartera (venta a crédito, ver carteraService.ts).
  // Un solo listado unificado por cliente.
  interface CuentaPorCobrar {
    id: string; origen: 'taller' | 'apartado' | 'cartera'; cliente: string; telefono: string;
    valorPendiente: number; referencia: string; fechaReferencia: string;
    diasAtraso: number; estado: 'al_dia' | 'proximo' | 'vencido';
    carteraCuentaId?: string;
  }
  const [cuentasPorCobrar, setCuentasPorCobrar] = useState<CuentaPorCobrar[]>([]);
  const [cargandoCobrar, setCargandoCobrar] = useState(false);
  const [cuentaCarteraSeleccionada, setCuentaCarteraSeleccionada] = useState<CuentaCartera | null>(null);
  const [modalCarteraAbierto, setModalCarteraAbierto] = useState(false);

  useEffect(() => {
    let cancelado = false;
    setCargandoCobrar(true);
    const hoyMs = Date.now();

    const cargarTaller = moduloTallerActivo
      ? import('../../services/tallerService').then(({ tallerService }) => tallerService.buscarOrdenes({}))
        .then((ordenes) => ordenes
          .filter((o) => (o.saldoPendiente || 0) > 0 && o.estado !== 'cancelado')
          .map((o): CuentaPorCobrar => {
            const referenciaFecha = o.fechaEntrega || o.fechaEstimadaEntrega || o.fechaRecepcion;
            const dias = Math.floor((hoyMs - new Date(referenciaFecha).getTime()) / 86400000);
            return {
              id: `taller_${o.id}`, origen: 'taller', cliente: o.cliente?.nombre || 'Sin nombre', telefono: o.cliente?.telefono || '',
              valorPendiente: o.saldoPendiente, referencia: `Orden ${o.numeroOrden}`, fechaReferencia: referenciaFecha,
              diasAtraso: Math.max(0, dias),
              estado: dias <= 3 ? 'al_dia' : dias <= 15 ? 'proximo' : 'vencido',
            };
          }))
        .catch(() => [] as CuentaPorCobrar[])
      : Promise.resolve([] as CuentaPorCobrar[]);

    const cargarApartados = import('../../lib/apartadosService').then(({ listarApartados }) => listarApartados())
      .then((apartados) => apartados
        .filter((a) => (a.saldo || 0) > 0 && a.estado !== 'cancelado')
        .map((a): CuentaPorCobrar => {
          const dias = Math.floor((hoyMs - new Date(a.fechaVencimiento).getTime()) / 86400000);
          return {
            id: `apartado_${a.id}`, origen: 'apartado', cliente: a.clienteNombre || 'Sin nombre', telefono: a.clienteTelefono || '',
            valorPendiente: a.saldo, referencia: `Apartado ${a.numero}`, fechaReferencia: a.fechaVencimiento,
            diasAtraso: Math.max(0, dias),
            estado: dias < 0 ? 'proximo' : dias <= 3 ? 'al_dia' : 'vencido',
          };
        }))
      .catch(() => [] as CuentaPorCobrar[]);

    // Días de anticipación configurables (Configuración → Cartera / Crédito a
    // clientes) para marcar una cuenta como "próxima a vencer" antes de que
    // realmente venza.
    const diasAnticipacionCartera = (() => {
      try {
        const cfg = JSON.parse(localStorage.getItem('codec_pos_config') || '{}');
        return Number(cfg.carteraDiasAnticipacionRecordatorio) || 3;
      } catch { return 3; }
    })();

    const cargarCartera = import('../../lib/carteraService').then(({ listarCuentasCartera }) => listarCuentasCartera({ soloConSaldo: true }))
      .then((cuentas) => cuentas
        .filter((c) => c.estado !== 'pagada')
        .map((c): CuentaPorCobrar => {
          const dias = Math.floor((hoyMs - new Date(c.fechaVencimiento).getTime()) / 86400000);
          return {
            id: `cartera_${c.id}`, origen: 'cartera', cliente: c.clienteNombre || 'Sin nombre', telefono: c.clienteTelefono || '',
            valorPendiente: c.saldo, referencia: `Cartera ${c.numeroFactura}`, fechaReferencia: c.fechaVencimiento,
            diasAtraso: Math.max(0, dias),
            estado: dias >= 0 ? 'vencido' : dias >= -diasAnticipacionCartera ? 'proximo' : 'al_dia',
            carteraCuentaId: c.id,
          };
        }))
      .catch(() => [] as CuentaPorCobrar[]);

    Promise.all([cargarTaller, cargarApartados, cargarCartera]).then(([taller, apartados, cartera]) => {
      if (cancelado) return;
      setCuentasPorCobrar([...taller, ...apartados, ...cartera].sort((a, b) => b.valorPendiente - a.valorPendiente));
      setCargandoCobrar(false);
    });

    return () => { cancelado = true; };
  }, [moduloTallerActivo]);

  const totalPorCobrar = useMemo(() => cuentasPorCobrar.reduce((s, c) => s + c.valorPendiente, 0), [cuentasPorCobrar]);
  const porCobrarVencido = useMemo(() => cuentasPorCobrar.filter((c) => c.estado === 'vencido'), [cuentasPorCobrar]);

  const enviarRecordatorio = (c: CuentaPorCobrar) => {
    const config = JSON.parse(localStorage.getItem('codec_pos_config') || '{}');
    const nombreEmpresa = config.nombreComercial || config.razonSocial || 'MI NEGOCIO';
    const mensaje = `Hola ${c.cliente}, te recordamos que tienes un saldo pendiente de ${fmt(c.valorPendiente)} con ${nombreEmpresa} por ${c.referencia}. ¡Gracias por tu preferencia!`;
    if (c.telefono) {
      const telLimpio = c.telefono.replace(/\D/g, '');
      window.open(`https://wa.me/${telLimpio}?text=${encodeURIComponent(mensaje)}`, '_blank');
    } else {
      navigator.clipboard?.writeText(mensaje);
      toast.info('No hay teléfono registrado — copiamos el mensaje al portapapeles');
    }
  };

  // ── Rentabilidad real: productos, categorías y clientes que más ganancia
  // dejan (no solo más ventas) — usa el costo/precio guardados EN CADA
  // venta histórica, no el costo actual del producto (que pudo cambiar).
  interface RentabilidadItem { nombre: string; ventas: number; utilidad: number; margen: number; }
  const [rentabilidadProductos, setRentabilidadProductos] = useState<RentabilidadItem[]>([]);
  const [rentabilidadCategorias, setRentabilidadCategorias] = useState<RentabilidadItem[]>([]);
  const [rentabilidadClientes, setRentabilidadClientes] = useState<RentabilidadItem[]>([]);
  const [cargandoRentabilidad, setCargandoRentabilidad] = useState(false);

  useEffect(() => {
    if (!desde || !hasta) return;
    let cancelado = false;
    setCargandoRentabilidad(true);

    electronStore.obtenerVentasPorRango(new Date(`${desde}T00:00:00`), new Date(`${hasta}T23:59:59`))
      .then((ventas) => {
        if (cancelado) return;
        const validas = ventas.filter((v: any) => {
          const estado = String(v?.estado || '').toLowerCase();
          return estado !== 'devuelto' && estado !== 'anulado';
        });

        const porProducto: Record<string, RentabilidadItem> = {};
        const porCategoria: Record<string, RentabilidadItem> = {};
        const porCliente: Record<string, RentabilidadItem> = {};

        validas.forEach((v: any) => {
          const nombreCliente = String(v?.cliente || '').trim();
          (v.items || []).forEach((it: any) => {
            const ventaItem = Number(it.subtotal) || (Number(it.precioVenta || it.precio || 0) * Number(it.cantidad || 0));
            const costoItem = (Number(it.precioCompra ?? it.costo ?? 0)) * Number(it.cantidad || 0);
            const utilidadItem = ventaItem - costoItem;

            const p = porProducto[it.nombre] || { nombre: it.nombre, ventas: 0, utilidad: 0, margen: 0 };
            p.ventas += ventaItem; p.utilidad += utilidadItem;
            porProducto[it.nombre] = p;

            const catNombre = it.categoria || 'Sin categoría';
            const c = porCategoria[catNombre] || { nombre: catNombre, ventas: 0, utilidad: 0, margen: 0 };
            c.ventas += ventaItem; c.utilidad += utilidadItem;
            porCategoria[catNombre] = c;

            if (nombreCliente) {
              const cl = porCliente[nombreCliente] || { nombre: nombreCliente, ventas: 0, utilidad: 0, margen: 0 };
              cl.ventas += ventaItem; cl.utilidad += utilidadItem;
              porCliente[nombreCliente] = cl;
            }
          });
        });

        const finalizar = (rec: Record<string, RentabilidadItem>) =>
          Object.values(rec)
            .map((r) => ({ ...r, margen: r.ventas > 0 ? (r.utilidad / r.ventas) * 100 : 0 }))
            .sort((a, b) => b.utilidad - a.utilidad)
            .slice(0, 8);

        setRentabilidadProductos(finalizar(porProducto));
        setRentabilidadCategorias(finalizar(porCategoria));
        setRentabilidadClientes(finalizar(porCliente));
        setCargandoRentabilidad(false);
      })
      .catch(() => setCargandoRentabilidad(false));

    return () => { cancelado = true; };
  }, [desde, hasta]);

  // ── Rango de fechas activo ──────────────────────────────────────────────
  useEffect(() => {
    if (rangoRapido === 'personalizado') { setPagina(1); return; }

    const hoy = new Date();
    let inicioStr = getFechaLocalISO(hoy);
    let finStr = getFechaLocalISO(hoy);

    if (rangoRapido === 'ayer') {
      const d = new Date(hoy); d.setDate(d.getDate() - 1);
      inicioStr = getFechaLocalISO(d);
      finStr = getFechaLocalISO(d);
    } else if (rangoRapido === 'semana') {
      const diaSemana = hoy.getDay(); // 0=domingo
      const diff = hoy.getDate() - diaSemana + (diaSemana === 0 ? -6 : 1); // lunes de esta semana
      const lunes = new Date(hoy.getFullYear(), hoy.getMonth(), diff);
      inicioStr = getFechaLocalISO(lunes);
    } else if (rangoRapido === 'mes') {
      inicioStr = getFechaLocalISO(new Date(hoy.getFullYear(), hoy.getMonth(), 1));
    } else if (rangoRapido === 'mes_anterior') {
      const inicioMesAnterior = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1);
      const finMesAnterior = new Date(hoy.getFullYear(), hoy.getMonth(), 0);
      inicioStr = getFechaLocalISO(inicioMesAnterior);
      finStr = getFechaLocalISO(finMesAnterior);
    } else if (rangoRapido === 'trimestre') {
      const mesInicioTrimestre = Math.floor(hoy.getMonth() / 3) * 3;
      inicioStr = getFechaLocalISO(new Date(hoy.getFullYear(), mesInicioTrimestre, 1));
    } else if (rangoRapido === 'semestre') {
      const mesInicioSemestre = hoy.getMonth() < 6 ? 0 : 6;
      inicioStr = getFechaLocalISO(new Date(hoy.getFullYear(), mesInicioSemestre, 1));
    } else if (rangoRapido === 'anio') {
      inicioStr = getFechaLocalISO(new Date(hoy.getFullYear(), 0, 1));
    } else if (rangoRapido === 'todos') {
      inicioStr = '2000-01-01';
    }

    setDesde(inicioStr);
    setHasta(finStr);
    setPagina(1);
  }, [rangoRapido]);

  // ── Carga de datos ────────────────────────────────────────────────────────
  const cargarMovimientos = () => {
    setMovimientos(obtenerMovimientos({
      desde: desde || undefined,
      hasta: hasta || undefined,
      tipo: filtroTipo,
      categoria: filtroCategoria || undefined,
      metodoPago: filtroMetodo || undefined,
      usuario: filtroUsuario || undefined,
      texto: busquedaDebounced || undefined,
      origenFondos: filtroOrigen,
    }));
  };

  useEffect(() => { cargarMovimientos(); }, [desde, hasta, filtroTipo, filtroCategoria, filtroMetodo, filtroUsuario, busquedaDebounced, filtroOrigen]);

  useEffect(() => {
    const handler = () => setCategorias(obtenerCategorias());
    window.addEventListener('codecpos:categorias-contables-cambio', handler);
    return () => window.removeEventListener('codecpos:categorias-contables-cambio', handler);
  }, []);

  useEffect(() => {
    const handler = () => setPresupuestos(calcularProgresoPresupuestos());
    window.addEventListener('codecpos:presupuestos-cambio', handler);
    return () => window.removeEventListener('codecpos:presupuestos-cambio', handler);
  }, []);

  // Cargar los pagos de Taller UNA sola vez (no en cada cambio de fecha).
  // Se aplanan a { fecha, monto } para no repetir el recorrido de pagos por
  // orden cada vez que cambie el período seleccionado.
  useEffect(() => {
    if (!moduloTallerActivo) { setPagosTallerCache([]); return; }
    let cancelado = false;
    import('../../services/tallerService').then(({ tallerService }) => tallerService.buscarOrdenes({}))
      .then((ordenes) => {
        if (cancelado) return;
        const pagos: { fecha: string; monto: number }[] = [];
        ordenes.forEach((o) => (o.pagos || []).forEach((p: any) => {
          pagos.push({ fecha: String(p?.fecha || '').split('T')[0], monto: Number(p?.monto) || 0 });
        }));
        setPagosTallerCache(pagos);
      })
      .catch(() => setPagosTallerCache([]));
    return () => { cancelado = true; };
  }, [moduloTallerActivo]);

  const sumarPagosTaller = (desdeR: string, hastaR: string) =>
    (pagosTallerCache || []).reduce((s, p) => (p.fecha >= desdeR && p.fecha <= hastaR ? s + p.monto : s), 0);

  // Feed de datos que YA existen en el resto del sistema — así el balance
  // de este módulo refleja el negocio completo, no solo lo que se registra
  // manualmente aquí.
  useEffect(() => {
    if (!desde || !hasta) return;

    electronStore.obtenerVentasPorRango(new Date(`${desde}T00:00:00`), new Date(`${hasta}T23:59:59`))
      .then((ventas) => {
        const validas = ventas.filter((v: any) => {
          const estado = String(v?.estado || '').toLowerCase();
          return estado !== 'devuelto' && estado !== 'anulado';
        });
        setVentasPOS(validas.reduce((s, v) => s + (Number(v.total) || 0), 0));
      })
      .catch(() => setVentasPOS(0));

    electronStore.obtenerDevolucionesPorRango(new Date(`${desde}T00:00:00`), new Date(`${hasta}T23:59:59`), { incluirTodosLosCajeros: true })
      .then((devs) => setDevolucionesPeriodo(devs.reduce((s, d) => s + (Number(d.totalDevolucion) || 0), 0)))
      .catch(() => setDevolucionesPeriodo(0));
  }, [desde, hasta]);

  // ingresosTaller se deriva del caché en memoria — ya no hace falta esperar
  // una promesa ni releer IndexedDB en cada cambio de período.
  useEffect(() => {
    if (!desde || !hasta || pagosTallerCache === null) return;
    setIngresosTaller(sumarPagosTaller(desde, hasta));
  }, [desde, hasta, pagosTallerCache]);

  // Comparativa vs. el período INMEDIATAMENTE ANTERIOR de igual duración
  // (ej. si el rango son 30 días, compara contra los 30 días previos a ese).
  // Da el "▲12% vs. antes" que permite leer la tendencia en un segundo.
  useEffect(() => {
    if (!desde || !hasta) { setTotalesAnterior(null); return; }

    const msDia = 86400000;
    const inicio = new Date(`${desde}T00:00:00`);
    const fin = new Date(`${hasta}T23:59:59`);
    const largoMs = fin.getTime() - inicio.getTime();
    const finAnterior = new Date(inicio.getTime() - msDia);
    const inicioAnterior = new Date(finAnterior.getTime() - largoMs);
    const desdeAnt = getFechaLocalISO(inicioAnterior);
    const hastaAnt = getFechaLocalISO(finAnterior);

    let cancelado = false;

    Promise.all([
      electronStore.obtenerVentasPorRango(inicioAnterior, finAnterior).then((ventas) =>
        ventas
          .filter((v: any) => { const e = String(v?.estado || '').toLowerCase(); return e !== 'devuelto' && e !== 'anulado'; })
          .reduce((s, v: any) => s + (Number(v.total) || 0), 0)
      ).catch(() => 0),
      electronStore.obtenerDevolucionesPorRango(inicioAnterior, finAnterior, { incluirTodosLosCajeros: true })
        .then((devs) => devs.reduce((s, d) => s + (Number(d.totalDevolucion) || 0), 0)).catch(() => 0),
    ]).then(([ventasAnt, devsAnt]) => {
      if (cancelado) return;
      const tallerAnt = moduloTallerActivo ? sumarPagosTaller(desdeAnt, hastaAnt) : 0;
      const movsAnt = obtenerMovimientos({ desde: desdeAnt, hasta: hastaAnt });
      const ingresosExtraAnt = movsAnt.filter((m) => m.tipo === 'ingreso').reduce((s, m) => s + m.monto, 0);
      const gastosAnt = movsAnt.filter((m) => m.tipo === 'gasto').reduce((s, m) => s + m.monto, 0);
      const ingresosAnt = Math.max(0, ventasAnt + tallerAnt + ingresosExtraAnt - devsAnt);
      setTotalesAnterior({ ingresos: ingresosAnt, gastos: gastosAnt });
    });

    return () => { cancelado = true; };
  }, [desde, hasta, moduloTallerActivo, pagosTallerCache]);

  // ── Gastos recurrentes: refrescar cuando cambian desde el modal de gestión ──
  useEffect(() => {
    const handler = () => {
      setGastosRecurrentes(obtenerGastosRecurrentes());
      setRecordatorios(calcularRecordatoriosPendientes());
    };
    window.addEventListener('codecpos:gastos-recurrentes-cambio', handler);
    return () => window.removeEventListener('codecpos:gastos-recurrentes-cambio', handler);
  }, []);

  // Un gasto nuevo puede resolver un recordatorio pendiente — recalcular.
  useEffect(() => { setRecordatorios(calcularRecordatoriosPendientes()); }, [movimientos]);

  // Carga perezosa: solo se consulta Supabase cuando el usuario entra a la
  // pestaña "Facturación DIAN" (evita una llamada de red innecesaria en el
  // resto de pestañas), y respeta el mismo rango de fechas del resto del módulo.
  useEffect(() => {
    if (!clienteIdDian || tabActiva !== 'dian') return;
    let cancelado = false;
    setCargandoDian(true);
    listarFacturasDian({ clienteId: clienteIdDian, desde: desde || undefined, hasta: hasta || undefined, limite: 300 })
      .then((lista) => { if (!cancelado) setFacturasDian(lista); })
      .catch(() => { if (!cancelado) setFacturasDian([]); })
      .finally(() => { if (!cancelado) setCargandoDian(false); });
    return () => { cancelado = true; };
  }, [clienteIdDian, tabActiva, desde, hasta]);

  const facturasDianFiltradas = useMemo(() => {
    const q = busquedaDian.trim().toLowerCase();
    if (!q) return facturasDian;
    return facturasDian.filter((f) =>
      f.numeroFactura?.toLowerCase().includes(q)
      || f.adquirente?.nombreORazonSocial?.toLowerCase().includes(q)
      || f.cufe?.toLowerCase().includes(q)
    );
  }, [facturasDian, busquedaDian]);

  const descargarXmlDian = (factura: FacturaElectronicaDian) => {
    if (!factura.xml) { toast.error('Esta factura todavía no tiene XML generado'); return; }
    const blob = new Blob([factura.xml], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${factura.numeroFactura}.xml`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── Totales y balance ───────────────────────────────────────────────────
  const todosSinFiltroTipoCat = useMemo(
    () => obtenerMovimientos({ desde: desde || undefined, hasta: hasta || undefined }),
    [desde, hasta]
  );
  const ingresosExtraTotal = useMemo(
    () => todosSinFiltroTipoCat.filter((m) => m.tipo === 'ingreso').reduce((s, m) => s + m.monto, 0),
    [todosSinFiltroTipoCat]
  );
  const gastosTotal = useMemo(
    () => todosSinFiltroTipoCat.filter((m) => m.tipo === 'gasto').reduce((s, m) => s + m.monto, 0),
    [todosSinFiltroTipoCat]
  );
  const ingresosBrutos = ventasPOS + ingresosTaller + ingresosExtraTotal;
  const ingresosTotales = Math.max(0, ingresosBrutos - devolucionesPeriodo);
  const balance = ingresosTotales - gastosTotal;
  const margen = ingresosTotales > 0 ? (balance / ingresosTotales) * 100 : 0;

  const presupuestosAlerta = presupuestos.filter((p) => p.estado !== 'ok');

  // ── Comparativas y salud financiera (para tarjetas hero + columna derecha) ──
  const calcularCambioPct = (actual: number, anterior: number): number | null => {
    if (anterior <= 0) return actual > 0 ? 100 : null;
    return ((actual - anterior) / anterior) * 100;
  };
  const cambioIngresosPct = totalesAnterior ? calcularCambioPct(ingresosTotales, totalesAnterior.ingresos) : null;
  const cambioGastosPct = totalesAnterior ? calcularCambioPct(gastosTotal, totalesAnterior.gastos) : null;
  const cambioBalancePct = totalesAnterior
    ? calcularCambioPct(balance, totalesAnterior.ingresos - totalesAnterior.gastos)
    : null;

  // Presupuesto general del mes: cuánto de todo lo presupuestado ya se gastó.
  const presupuestoGeneralPct = presupuestos.length > 0
    ? (presupuestos.reduce((s, p) => s + p.gastadoMes, 0) / Math.max(presupuestos.reduce((s, p) => s + p.limiteMensual, 0), 1)) * 100
    : 0;

  // Meta mensual de ganancia: se mide sobre la UTILIDAD DEL MES CALENDARIO
  // ACTUAL, sin importar el filtro de período que el admin tenga puesto en
  // pantalla — igual que los presupuestos por categoría.
  const balanceMesActualPct = rangoRapido === 'mes' && metaMensual > 0
    ? Math.min(100, (balance / metaMensual) * 100)
    : null;

  // Flujo de Caja Disponible: no toda la "utilidad" es dinero que ya tienes
  // en la mano — lo que los clientes todavía deben (Taller + Apartados) es
  // utilidad "en papel", no efectivo real disponible hoy.
  const flujoCajaDisponible = balance - totalPorCobrar;

  type EstadoSalud = 'excelente' | 'buena' | 'regular' | 'critica';
  const saludFinanciera: { estado: EstadoSalud; label: string; color: string; pct: number } = (() => {
    let score = 100;
    if (margen < 0) score -= 50;
    else if (margen < 10) score -= 20;
    else if (margen < 20) score -= 5;
    if (presupuestos.some((p) => p.estado === 'excedido')) score -= 20;
    if (cambioIngresosPct !== null && cambioIngresosPct < -10) score -= 15;
    if (ingresosTotales > 0 && totalPorCobrar > ingresosTotales * 0.3) score -= 15;
    if (flujoCajaDisponible < 0) score -= 10;
    score = Math.max(0, Math.min(100, score));

    if (score >= 80) return { estado: 'excelente', label: 'Excelente', color: '#10b981', pct: score };
    if (score >= 60) return { estado: 'buena', label: 'Buena', color: '#0ea5e9', pct: score };
    if (score >= 35) return { estado: 'regular', label: 'Regular', color: '#f59e0b', pct: score };
    return { estado: 'critica', label: 'Crítica', color: '#ef4444', pct: score };
  })();

  // ── Resumen Inteligente: varias frases auto-generadas, no solo una ──────
  const resumenInteligente = useMemo(() => {
    const frases: string[] = [];

    if (cambioIngresosPct !== null) {
      frases.push(
        cambioIngresosPct >= 0
          ? `Las ventas aumentaron un ${cambioIngresosPct.toFixed(0)}% respecto al período anterior.`
          : `Las ventas cayeron un ${Math.abs(cambioIngresosPct).toFixed(0)}% respecto al período anterior.`
      );
    }
    if (cambioBalancePct !== null) {
      frases.push(
        cambioBalancePct >= 0
          ? `La utilidad aumentó un ${cambioBalancePct.toFixed(0)}%.`
          : `La utilidad disminuyó un ${Math.abs(cambioBalancePct).toFixed(0)}%.`
      );
    }
    if (rentabilidadProductos.length > 0) {
      frases.push(`El producto más rentable fue "${rentabilidadProductos[0].nombre}".`);
    }
    if (porCobrarVencido.length > 0) {
      frases.push(`Actualmente existen ${porCobrarVencido.length} cuenta${porCobrarVencido.length === 1 ? '' : 's'} vencida${porCobrarVencido.length === 1 ? '' : 's'} por cobrar, por ${fmt(porCobrarVencido.reduce((s, c) => s + c.valorPendiente, 0))}.`);
    }
    if (frases.length === 0) frases.push('Aún no hay suficientes datos del período anterior para comparar la tendencia.');

    return frases;
  }, [cambioIngresosPct, cambioBalancePct, rentabilidadProductos, porCobrarVencido]);

  // ── Datos del gráfico (agrupado por día) ──────────────────────────────────
  const datosGrafico = useMemo(() => {
    const porDia: Record<string, { ingresos: number; gastos: number }> = {};
    todosSinFiltroTipoCat.forEach((m) => {
      const dia = m.fecha.split('T')[0];
      if (!porDia[dia]) porDia[dia] = { ingresos: 0, gastos: 0 };
      if (m.tipo === 'ingreso') porDia[dia].ingresos += m.monto;
      else porDia[dia].gastos += m.monto;
    });
    return Object.entries(porDia)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-30)
      .map(([dia, v]) => ({
        dia: format(new Date(`${dia}T00:00:00`), 'dd MMM', { locale: es }),
        Ingresos: v.ingresos,
        Gastos: v.gastos,
      }));
  }, [todosSinFiltroTipoCat]);

  const usuarios = useMemo(() => usuariosDistintos(todosSinFiltroTipoCat), [todosSinFiltroTipoCat]);

  const totalPaginas = Math.max(1, Math.ceil(movimientos.length / FILAS_POR_PAGINA));
  const paginaSegura = Math.min(pagina, totalPaginas);
  const filasPagina = movimientos.slice((paginaSegura - 1) * FILAS_POR_PAGINA, paginaSegura * FILAS_POR_PAGINA);

  const totalPaginasCobrar = Math.max(1, Math.ceil(cuentasPorCobrar.length / FILAS_POR_PAGINA));
  const paginaCobrarSegura = Math.min(paginaCobrar, totalPaginasCobrar);
  const cuentasCobrarPagina = cuentasPorCobrar.slice((paginaCobrarSegura - 1) * FILAS_POR_PAGINA, paginaCobrarSegura * FILAS_POR_PAGINA);

  // ── Estilos por tema ────────────────────────────────────────────────────
  const bg = darkMode ? 'bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900' : 'bg-gradient-to-br from-gray-50 via-white to-gray-100';
  const card = darkMode ? 'bg-slate-800/60 border-slate-700' : 'bg-white border-gray-200';
  const txt = darkMode ? 'text-white' : 'text-slate-900';
  const sub = darkMode ? 'text-slate-400' : 'text-slate-500';
  const rowBg = darkMode ? 'bg-slate-800/40 hover:bg-slate-800/70' : 'bg-gray-50 hover:bg-gray-100';
  const border = darkMode ? 'border-slate-700' : 'border-gray-200';

  const escapeHtml = (v: unknown) => String(v ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  // ── Eliminar movimiento ─────────────────────────────────────────────────
  const confirmarEliminarMovimiento = () => {
    if (!confirmarEliminar) return;
    if (confirmarEliminar.tipo === 'ingreso') eliminarIngresoExtra(confirmarEliminar.id, nombreUsuarioActual);
    else eliminarGasto(confirmarEliminar.id, nombreUsuarioActual);
    toast.success('Movimiento eliminado');
    setConfirmarEliminar(null);
    cargarMovimientos();
  };

  // ── Imprimir comprobante individual (tabla, no flexbox) ──────────────────
  const imprimirMovimiento = async (m: MovimientoContable) => {
    try {
      const config = JSON.parse(localStorage.getItem('codec_pos_config') || '{}');
      const empresa = config.nombreComercial || 'MI NEGOCIO';
      const widthMm = getConfiguredTicketWidthMm();
      const printerName = getPrinterForSectionOrUndefined('contabilidad') || '';
      const silentMode = !!printerName;
      const fecha = format(new Date(m.fecha), "dd/MM/yyyy HH:mm", { locale: es });

      const fila = (label: string, valor: string, bold = false) => `
        <tr><td style="text-align:left;${bold ? 'font-weight:700;' : ''}">${escapeHtml(label)}</td>
        <td style="text-align:right;${bold ? 'font-weight:700;' : ''}">${escapeHtml(valor)}</td></tr>`;

      const html = `<!doctype html><html><head><meta charset="utf-8"/>
        <title>Comprobante</title>
        <style>
          @page { size: ${widthMm}mm auto; margin: 2mm; }
          body { font-family:'Courier New',monospace; font-size:12px; margin:0; padding:4mm; color:#000; }
          .center { text-align:center; }
          .line { border-top:1px dashed #000; margin:6px 0; }
          table.datos { width:100%; border-collapse:collapse; table-layout:fixed; }
          table.datos col.label { width:60%; } table.datos col.valor { width:40%; }
          table.datos td { padding:1px 0; }
          .total td { font-size:15px; font-weight:700; }
        </style>
      </head><body>
        <div class="center">
          <div style="font-size:14px;font-weight:700;">${escapeHtml(empresa)}</div>
          <div style="margin-top:4px;font-weight:700;">
            COMPROBANTE DE ${m.tipo === 'ingreso' ? 'INGRESO' : 'EGRESO'}
          </div>
        </div>
        <div class="line"></div>
        <table class="datos"><colgroup><col class="label"/><col class="valor"/></colgroup><tbody>
          ${fila('Fecha:', fecha)}
          ${fila('Categoría:', nombreCategoria(m.categoria))}
          ${fila('Medio de pago:', metodoLabel(m.metodoPago))}
          ${fila('Registrado por:', m.registradoPor)}
        </tbody></table>
        <div class="line"></div>
        <div><b>Concepto:</b><br/>${escapeHtml(m.concepto)}</div>
        ${m.notas ? `<div style="margin-top:4px;"><b>Notas:</b><br/>${escapeHtml(m.notas)}</div>` : ''}
        <div class="line"></div>
        <table class="datos total"><colgroup><col class="label"/><col class="valor"/></colgroup><tbody>
          ${fila(m.tipo === 'ingreso' ? 'TOTAL INGRESO:' : 'TOTAL EGRESO:', fmt(m.monto), true)}
        </tbody></table>
        <div class="line"></div>
        <div class="center" style="font-size:10px;color:#333;">CODEC POS v2.0 — Contabilidad</div>
      </body></html>`;

      const el = (window as any).electron;
      if (el?.print?.printHtml) {
        await el.print.printHtml({ html, silent: silentMode, printerName, widthMm });
        toast.success(silentMode ? 'Comprobante enviado a impresora' : 'Abriendo diálogo de impresión...');
        return;
      }
      const ipc = (window as any).ipcRenderer ?? el?.ipcRenderer;
      if (ipc?.send) {
        ipc.send('print-ticket', { html, silent: silentMode, printerName, widthMm });
        toast.success(silentMode ? 'Comprobante enviado a impresora' : 'Abriendo diálogo de impresión...');
        return;
      }
      const win = window.open('', '_blank', 'width=420,height=900');
      if (!win) { toast.error('Habilita las ventanas emergentes para imprimir'); return; }
      win.document.write(html);
      win.document.close();
      win.focus();
      setTimeout(() => win.print(), 400);
    } catch {
      toast.error('No se pudo imprimir el comprobante');
    }
  };

  // ── Exportar "Reporte Financiero Ejecutivo" (resumen + desglose + detalle) ──
  const exportarPDF = () => {
    try {
      const config = JSON.parse(localStorage.getItem('codec_pos_config') || '{}');
      const nombreEmpresa = config.nombreComercial || config.razonSocial || 'MI NEGOCIO';

      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const W = doc.internal.pageSize.getWidth();
      let y = 0;

      // ── Encabezado de marca ──
      doc.setFillColor(15, 23, 42);
      doc.rect(0, 0, W, 32, 'F');
      doc.setFillColor(16, 185, 129);
      doc.rect(0, 30, W, 2, 'F');

      doc.setTextColor(255, 255, 255);
      doc.setFontSize(16);
      doc.setFont('helvetica', 'bold');
      doc.text(nombreEmpresa.toUpperCase(), 14, 14);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      if (config.nit) doc.text(`NIT: ${config.nit}${config.digitoVerificacion ? `-${config.digitoVerificacion}` : ''}`, 14, 20);
      doc.text('CODEC POS v2.0 · Módulo de Contabilidad', 14, 25);

      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('REPORTE FINANCIERO EJECUTIVO', W - 14, 14, { align: 'right' });
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.text(`Período: ${desde || '—'} a ${hasta || '—'}`, W - 14, 20, { align: 'right' });
      doc.text(`Generado: ${format(new Date(), "dd/MM/yyyy HH:mm", { locale: es })}`, W - 14, 25, { align: 'right' });

      y = 40;

      // ── Resumen ejecutivo ──
      doc.setTextColor(15, 23, 42);
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text('1. RESUMEN EJECUTIVO', 14, y);
      y += 6;

      autoTable(doc, {
        startY: y,
        margin: { left: 14, right: 14 },
        head: [['Indicador', 'Valor']],
        body: [
          [{ content: 'Ingresos Totales', styles: { fontStyle: 'bold' } }, { content: fmt(ingresosTotales), styles: { fontStyle: 'bold' } }],
          ['   · Ventas POS', fmt(ventasPOS)],
          ...(moduloTallerActivo ? [['   · Pagos de Taller', fmt(ingresosTaller)]] : []),
          ['   · Ingresos Extra', fmt(ingresosExtraTotal)],
          ['   · Devoluciones', `-${fmt(devolucionesPeriodo)}`],
          [{ content: 'Gastos Totales', styles: { fontStyle: 'bold' } }, { content: fmt(gastosTotal), styles: { fontStyle: 'bold', textColor: [239, 68, 68] } }],
          [
            { content: 'Balance / Utilidad Neta', styles: { fontStyle: 'bold' } },
            { content: fmt(balance), styles: { fontStyle: 'bold', textColor: balance >= 0 ? [16, 185, 129] : [239, 68, 68] } },
          ],
          ['Margen sobre ingresos', `${margen.toFixed(1)}%`],
          ['Movimientos registrados', String(todosSinFiltroTipoCat.length)],
        ],
        styles: { fontSize: 9, cellPadding: 3 },
        headStyles: { fillColor: [16, 185, 129], textColor: 255, fontStyle: 'bold' },
        columnStyles: { 1: { halign: 'right' } },
        theme: 'grid',
        tableLineColor: [226, 232, 240],
      });
      y = (doc as any).lastAutoTable.finalY + 10;

      // ── Desglose porcentual de gastos por categoría ──
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text('2. DESGLOSE DE GASTOS POR CATEGORÍA', 14, y);
      y += 6;

      const gastosPorCategoria: Record<string, number> = {};
      todosSinFiltroTipoCat.filter((m) => m.tipo === 'gasto').forEach((m) => {
        gastosPorCategoria[m.categoria] = (gastosPorCategoria[m.categoria] || 0) + m.monto;
      });
      const totalGastosCat = Object.values(gastosPorCategoria).reduce((s, v) => s + v, 0);
      const filasCategoria = Object.entries(gastosPorCategoria)
        .sort(([, a], [, b]) => b - a)
        .map(([catId, monto]) => [
          nombreCategoria(catId),
          fmt(monto),
          totalGastosCat > 0 ? `${((monto / totalGastosCat) * 100).toFixed(1)}%` : '0%',
        ]);
      if (filasCategoria.length === 0) filasCategoria.push(['Sin gastos registrados en el período', '$0', '0%']);

      autoTable(doc, {
        startY: y,
        margin: { left: 14, right: 14 },
        head: [['Categoría', 'Monto', '% del Total']],
        body: filasCategoria,
        styles: { fontSize: 9, cellPadding: 3 },
        headStyles: { fillColor: [239, 68, 68], textColor: 255, fontStyle: 'bold' },
        columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right', fontStyle: 'bold' } },
        theme: 'grid',
        tableLineColor: [226, 232, 240],
      });
      y = (doc as any).lastAutoTable.finalY + 10;

      if (presupuestosAlerta.length > 0) {
        if (y > 250) { doc.addPage('a4', 'portrait'); y = 16; }
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.text('3. ALERTAS DE PRESUPUESTO DEL MES', 14, y);
        y += 6;
        autoTable(doc, {
          startY: y,
          margin: { left: 14, right: 14 },
          head: [['Categoría', 'Gastado', 'Límite', '% Usado', 'Estado']],
          body: presupuestosAlerta.map((p) => [
            p.categoriaNombre, fmt(p.gastadoMes), fmt(p.limiteMensual), `${p.porcentaje.toFixed(0)}%`,
            p.estado === 'excedido' ? 'EXCEDIDO' : 'ALERTA',
          ]),
          styles: { fontSize: 9, cellPadding: 3 },
          headStyles: { fillColor: [245, 158, 11], textColor: 255, fontStyle: 'bold' },
          columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' } },
          theme: 'grid',
        });
        y = (doc as any).lastAutoTable.finalY + 6;
      }

      // ── Detalle de movimientos (página aparte, horizontal) ──
      doc.addPage('a4', 'landscape');
      const WL = doc.internal.pageSize.getWidth();
      doc.setFillColor(15, 23, 42);
      doc.rect(0, 0, WL, 16, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text('4. DETALLE DE MOVIMIENTOS DEL PERÍODO', 14, 10);

      autoTable(doc, {
        startY: 22,
        margin: { left: 10, right: 10 },
        head: [['Fecha', 'Tipo', 'Categoría', 'Concepto', 'Método', 'Origen', 'Registrado por', 'Monto']],
        body: movimientos.map((m) => [
          format(new Date(m.fecha), 'dd/MM/yyyy HH:mm'),
          m.tipo === 'ingreso' ? 'Ingreso' : 'Gasto',
          nombreCategoria(m.categoria),
          m.concepto,
          metodoLabel(m.metodoPago),
          m.origenFondos === 'caja_mayor' ? 'Caja Mayor' : 'Caja Menor',
          m.registradoPor,
          `${m.tipo === 'ingreso' ? '+' : '-'}${fmt(m.monto)}`,
        ]),
        styles: { fontSize: 8, cellPadding: 2.5 },
        headStyles: { fillColor: [16, 185, 129], textColor: 255 },
        columnStyles: { 7: { halign: 'right', fontStyle: 'bold' } },
        theme: 'grid',
      });

      // ── Pie de página en todas las hojas ──
      const totalPaginas = doc.internal.pages.length - 1;
      for (let p = 1; p <= totalPaginas; p++) {
        doc.setPage(p);
        const pageW = doc.internal.pageSize.getWidth();
        const pageH = doc.internal.pageSize.getHeight();
        doc.setFillColor(15, 23, 42);
        doc.rect(0, pageH - 8, pageW, 8, 'F');
        doc.setFontSize(7);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(255, 255, 255);
        doc.text(`${nombreEmpresa} · CODEC POS v2.0 · Codec Studio`, 10, pageH - 3);
        doc.text(`Pág. ${p} de ${totalPaginas}`, pageW - 10, pageH - 3, { align: 'right' });
      }

      doc.save(`Reporte-Financiero-${desde}_${hasta}.pdf`);
      toast.success('Reporte financiero exportado correctamente');
    } catch (error) {
      console.error('Error exportando reporte financiero:', error);
      toast.error('No se pudo exportar el PDF');
    }
  };

  // ── Exportar a Excel (mismo período y datos que el PDF, en hojas separadas) ──
  const exportarExcel = () => {
    try {
      const config = JSON.parse(localStorage.getItem('codec_pos_config') || '{}');
      const nombreEmpresa = config.nombreComercial || config.razonSocial || 'MI NEGOCIO';
      const workbook = XLSX.utils.book_new();

      // Hoja 1: Resumen ejecutivo
      const resumenData = [
        [nombreEmpresa],
        ['REPORTE FINANCIERO — MÓDULO DE CONTABILIDAD'],
        [`Período: ${desde || '—'} a ${hasta || '—'}`],
        [`Generado: ${format(new Date(), 'dd/MM/yyyy HH:mm', { locale: es })}`],
        [],
        ['Indicador', 'Valor'],
        ['Ingresos Totales', ingresosTotales],
        ['   Ventas POS', ventasPOS],
        ...(moduloTallerActivo ? [['   Pagos de Taller', ingresosTaller]] : []),
        ['   Ingresos Extra', ingresosExtraTotal],
        ['   Devoluciones', -devolucionesPeriodo],
        ['Gastos Totales', gastosTotal],
        ['Balance / Utilidad Neta', balance],
        ['Margen sobre ingresos (%)', Number(margen.toFixed(1))],
        ['Movimientos registrados', todosSinFiltroTipoCat.length],
      ];
      const wsResumen = XLSX.utils.aoa_to_sheet(resumenData);
      wsResumen['!cols'] = [{ wch: 32 }, { wch: 18 }];
      XLSX.utils.book_append_sheet(workbook, wsResumen, 'Resumen');

      // Hoja 2: Desglose de gastos por categoría
      const gastosPorCategoria: Record<string, number> = {};
      todosSinFiltroTipoCat.filter((m) => m.tipo === 'gasto').forEach((m) => {
        gastosPorCategoria[m.categoria] = (gastosPorCategoria[m.categoria] || 0) + m.monto;
      });
      const totalGastosCat = Object.values(gastosPorCategoria).reduce((s, v) => s + v, 0);
      const categoriasData = [
        ['Categoría', 'Monto', '% del Total'],
        ...Object.entries(gastosPorCategoria)
          .sort(([, a], [, b]) => b - a)
          .map(([catId, monto]) => [
            nombreCategoria(catId), monto,
            totalGastosCat > 0 ? Number(((monto / totalGastosCat) * 100).toFixed(1)) : 0,
          ]),
      ];
      const wsCategorias = XLSX.utils.aoa_to_sheet(categoriasData);
      wsCategorias['!cols'] = [{ wch: 28 }, { wch: 16 }, { wch: 12 }];
      XLSX.utils.book_append_sheet(workbook, wsCategorias, 'Gastos por Categoría');

      // Hoja 3: Presupuestos con alerta (si hay)
      if (presupuestosAlerta.length > 0) {
        const presupuestosData = [
          ['Categoría', 'Gastado', 'Límite', '% Usado', 'Estado'],
          ...presupuestosAlerta.map((p) => [
            p.categoriaNombre, p.gastadoMes, p.limiteMensual, Number(p.porcentaje.toFixed(0)),
            p.estado === 'excedido' ? 'EXCEDIDO' : 'ALERTA',
          ]),
        ];
        const wsPresupuestos = XLSX.utils.aoa_to_sheet(presupuestosData);
        wsPresupuestos['!cols'] = [{ wch: 28 }, { wch: 14 }, { wch: 14 }, { wch: 10 }, { wch: 12 }];
        XLSX.utils.book_append_sheet(workbook, wsPresupuestos, 'Alertas Presupuesto');
      }

      // Hoja 4: Detalle de movimientos del período filtrado en la tabla
      const movimientosData = [
        ['Fecha', 'Tipo', 'Categoría', 'Concepto', 'Método', 'Origen', 'Registrado por', 'Monto'],
        ...movimientos.map((m) => [
          format(new Date(m.fecha), 'dd/MM/yyyy HH:mm'),
          m.tipo === 'ingreso' ? 'Ingreso' : 'Gasto',
          nombreCategoria(m.categoria),
          m.concepto,
          metodoLabel(m.metodoPago),
          m.origenFondos === 'caja_mayor' ? 'Caja Mayor' : 'Caja Menor',
          m.registradoPor,
          m.tipo === 'ingreso' ? m.monto : -m.monto,
        ]),
      ];
      const wsMovimientos = XLSX.utils.aoa_to_sheet(movimientosData);
      wsMovimientos['!cols'] = [{ wch: 16 }, { wch: 9 }, { wch: 22 }, { wch: 28 }, { wch: 14 }, { wch: 12 }, { wch: 18 }, { wch: 14 }];
      XLSX.utils.book_append_sheet(workbook, wsMovimientos, 'Movimientos');

      // Hoja 5: Cuentas por cobrar (Taller + Apartados)
      if (cuentasPorCobrar.length > 0) {
        const cobrarData = [
          ['Cliente', 'Teléfono', 'Origen', 'Referencia', 'Valor Pendiente', 'Días', 'Estado'],
          ...cuentasPorCobrar.map((c) => [
            c.cliente, c.telefono, c.origen === 'taller' ? 'Taller' : 'Apartado', c.referencia, c.valorPendiente,
            c.diasAtraso, c.estado === 'vencido' ? 'Vencido' : c.estado === 'proximo' ? 'Próximo a vencer' : 'Al día',
          ]),
        ];
        const wsCobrar = XLSX.utils.aoa_to_sheet(cobrarData);
        wsCobrar['!cols'] = [{ wch: 22 }, { wch: 14 }, { wch: 10 }, { wch: 16 }, { wch: 16 }, { wch: 8 }, { wch: 16 }];
        XLSX.utils.book_append_sheet(workbook, wsCobrar, 'Cuentas por Cobrar');
      }

      const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
      const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Reporte-Financiero-${desde}_${hasta}.xlsx`;
      link.click();
      URL.revokeObjectURL(url);
      toast.success('Excel exportado correctamente');
    } catch (error) {
      console.error('Error exportando Excel:', error);
      toast.error('No se pudo exportar el Excel');
    }
  };

  return (
    <div className={`min-h-screen h-screen overflow-y-auto p-6 scrollbar-thin scrollbar-thumb-emerald-500 ${bg} ${darkMode ? 'scrollbar-track-slate-800' : 'scrollbar-track-gray-200'}`}>
      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-14 h-14 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl flex items-center justify-center shadow-lg">
            <Calculator className="w-7 h-7 text-white" />
          </div>
          <div>
            <h1 className={`text-3xl font-bold ${txt}`}>Contabilidad</h1>
            <p className={`text-sm ${sub}`}>Ingresos, gastos y balance de tu negocio, todo en un solo lugar</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={() => setModalRecurrentes(true)} variant="outline" className="rounded-xl gap-2">
            <Repeat className="w-4 h-4" /> Recurrentes
          </Button>
          <Button onClick={() => setModalCategorias(true)} variant="outline" className="rounded-xl gap-2">
            <Palette className="w-4 h-4" /> Categorías
          </Button>
          <Button onClick={() => setModalMovimiento({ tipo: 'ingreso' })} className="rounded-xl gap-2 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700">
            <ArrowUpCircle className="w-4 h-4" /> Nuevo Ingreso
          </Button>
          <Button onClick={() => setModalMovimiento({ tipo: 'gasto' })} className="rounded-xl gap-2 bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700">
            <ArrowDownCircle className="w-4 h-4" /> Nuevo Gasto
          </Button>
        </div>
      </div>

      {/* ── Navegación por pestañas: cada una con un propósito claro ── */}
      <div className={`flex items-center gap-1.5 mb-5 overflow-x-auto pb-1 border-b ${border}`}>
        {([
          ['resumen', 'Resumen', Sparkles],
          ['cobrar', 'Cuentas por Cobrar', Users],
          ['rentabilidad', 'Rentabilidad', LineChart],
          ['flujo', 'Flujo de Caja', Activity],
          ['dian', 'Facturación DIAN', ShieldCheck],
          ['reportes', 'Reportes', FileText],
        ] as [typeof tabActiva, string, any][]).map(([key, label, Icon]) => (
          <button
            key={key}
            onClick={() => setTabActiva(key)}
            className={`shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-t-xl text-sm font-bold transition-all border-b-2 ${
              tabActiva === key
                ? 'border-emerald-500 text-emerald-500'
                : `border-transparent ${sub} hover:${darkMode ? 'text-slate-200' : 'text-slate-700'}`
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
            {key === 'cobrar' && porCobrarVencido.length > 0 && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-red-500 text-white">{porCobrarVencido.length}</span>
            )}
          </button>
        ))}
      </div>

      {/* ── Filtro de período: visible en TODAS las pestañas, ya que el rango
          de fechas afecta al Resumen, Rentabilidad y Flujo de Caja por igual —
          no solo a la tabla de movimientos. ── */}
      <div className={`p-4 rounded-[24px] border mb-5 shadow-xl ${card}`} style={{ boxShadow: panelSombra(darkMode) }}>
        <div className="flex flex-wrap gap-2 mb-1">
          {([
            ['hoy', 'Hoy'], ['ayer', 'Ayer'], ['semana', 'Esta Semana'],
            ['mes', 'Mes Actual'], ['mes_anterior', 'Mes Anterior'],
            ['trimestre', 'Trimestre'], ['semestre', 'Semestre'], ['anio', 'Año en Curso'],
            ['todos', 'Todo'], ['personalizado', 'Personalizado'],
          ] as [RangoRapido, string][]).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setRangoRapido(key)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all ${
                rangoRapido === key
                  ? 'bg-gradient-to-r from-emerald-500 to-emerald-600 border-transparent text-white shadow'
                  : darkMode ? 'border-slate-600 text-slate-400 hover:border-emerald-500' : 'border-gray-300 text-gray-600 hover:border-emerald-400'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {rangoRapido === 'personalizado' && (
          <div className="flex flex-wrap gap-2 items-end mt-3">
            <div className="flex flex-col gap-1">
              <Label className={`text-xs ${sub}`}>Desde</Label>
              <Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="h-9 w-36 rounded-xl" />
            </div>
            <div className="flex flex-col gap-1">
              <Label className={`text-xs ${sub}`}>Hasta</Label>
              <Input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="h-9 w-36 rounded-xl" />
            </div>
          </div>
        )}

        {desde && hasta && (
          <p className={`text-xs mt-2 ${sub}`}>
            Mostrando datos de <strong className={txt}>{format(new Date(`${desde}T00:00:00`), 'dd/MM/yyyy', { locale: es })}</strong> a <strong className={txt}>{format(new Date(`${hasta}T00:00:00`), 'dd/MM/yyyy', { locale: es })}</strong>
          </p>
        )}
      </div>

      {/* ═══════════════════════ PESTAÑA: RESUMEN ═══════════════════════ */}
      {tabActiva === 'resumen' && (
        <>
          {/* ── Resumen Inteligente ── */}
          <div className={`mb-5 p-5 rounded-[24px] border-2 ${darkMode ? 'bg-gradient-to-br from-indigo-500/10 to-purple-500/5 border-indigo-500/25' : 'bg-gradient-to-br from-indigo-50 to-purple-50 border-indigo-200'}`}>
            <div className="flex items-center gap-2 mb-3">
              <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${darkMode ? 'bg-indigo-500/20' : 'bg-indigo-100'}`}>
                <Sparkles className="w-4 h-4 text-indigo-500" />
              </div>
              <h3 className={`font-bold ${txt}`}>Resumen Inteligente</h3>
            </div>
            <ul className="space-y-1.5">
              {resumenInteligente.map((frase, i) => (
                <li key={i} className={`text-sm flex items-start gap-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                  <span className="text-indigo-500 mt-0.5">•</span> {frase}
                </li>
              ))}
            </ul>
          </div>

          {/* ── Alertas de presupuesto ── */}
          {presupuestosAlerta.length > 0 && (
            <div className="mb-4 space-y-2">
              {presupuestosAlerta.map((p) => (
                <div
                  key={p.categoriaId}
                  className={`p-3.5 rounded-2xl border-2 flex items-center gap-3 ${
                    p.estado === 'excedido'
                      ? (darkMode ? 'bg-red-500/10 border-red-500/30' : 'bg-red-50 border-red-200')
                      : (darkMode ? 'bg-amber-500/10 border-amber-500/30' : 'bg-amber-50 border-amber-200')
                  }`}
                >
                  <AlertTriangle className={`w-5 h-5 shrink-0 ${p.estado === 'excedido' ? 'text-red-500' : 'text-amber-500'}`} />
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-bold ${p.estado === 'excedido' ? 'text-red-500' : 'text-amber-500'}`}>
                      {p.estado === 'excedido' ? '¡Presupuesto excedido!' : 'Cerca del límite de presupuesto'}: {p.categoriaNombre}
                    </p>
                    <p className={`text-xs ${sub}`}>
                      Llevas gastado {fmt(p.gastadoMes)} de {fmt(p.limiteMensual)} este mes ({p.porcentaje.toFixed(0)}%)
                    </p>
                    <div className="h-1.5 rounded-full overflow-hidden mt-1.5" style={{ background: darkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)' }}>
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${Math.min(100, p.porcentaje)}%`, background: p.estado === 'excedido' ? '#ef4444' : '#f59e0b' }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ── 5 KPIs Hero: la salud del negocio en 3 segundos ── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4 mb-5">
            <HeroKpiCard
              titulo="Ventas del Período" valor={fmt(ingresosTotales)} icon={TrendingUp}
              gradiente="from-emerald-500 to-teal-600" cambioPct={cambioIngresosPct}
              badges={[
                { label: 'Ventas', value: fmt(ventasPOS) },
                ...(moduloTallerActivo ? [{ label: 'Taller', value: fmt(ingresosTaller) }] : []),
              ]}
            />
            <HeroKpiCard
              titulo="Utilidad Estimada" valor={fmt(balance)} icon={Wallet}
              gradiente={balance >= 0 ? 'from-indigo-500 to-purple-600' : 'from-red-600 to-rose-700'}
              resaltado={`${margen >= 0 ? '+' : ''}${margen.toFixed(1)}%`} cambioPct={cambioBalancePct}
              badges={[{ label: 'Gastos', value: fmt(gastosTotal) }]}
            />
            <HeroKpiCard
              titulo="Por Cobrar" valor={fmt(totalPorCobrar)} icon={Users}
              gradiente="from-amber-500 to-orange-600" onClick={() => setTabActiva('cobrar')}
              badges={[
                { label: 'Clientes', value: String(cuentasPorCobrar.length) },
                { label: 'Vencido', value: fmt(porCobrarVencido.reduce((s, c) => s + c.valorPendiente, 0)) },
              ]}
            />
            <HeroKpiCard
              titulo="Flujo de Caja Disponible" valor={fmt(flujoCajaDisponible)} icon={Activity}
              gradiente={flujoCajaDisponible >= 0 ? 'from-sky-500 to-blue-600' : 'from-red-600 to-rose-700'}
              badges={[{ label: 'Utilidad − Por Cobrar', value: '' }]}
            />
            <HeroKpiCard
              titulo="Crecimiento" valor={cambioIngresosPct !== null ? `${cambioIngresosPct >= 0 ? '+' : ''}${cambioIngresosPct.toFixed(1)}%` : '—'}
              icon={cambioIngresosPct !== null && cambioIngresosPct < 0 ? TrendingDown : TrendingUp}
              gradiente={cambioIngresosPct !== null && cambioIngresosPct < 0 ? 'from-rose-500 to-red-600' : 'from-teal-500 to-emerald-600'}
              badges={[{ label: 'vs. período anterior', value: '' }]}
            />
          </div>

          {/* ── Salud financiera + metas + presupuesto + recordatorios ── */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
            <CircularGauge
              titulo="Salud Financiera" subtitulo={resumenInteligente[0] || 'Analizando tu negocio…'}
              valorTexto={saludFinanciera.label} pct={saludFinanciera.pct} color={saludFinanciera.color}
              icon={ShieldCheck} dark={darkMode}
            />
            <CircularGauge
              titulo="Meta Mensual de Ganancia"
              subtitulo={rangoRapido === 'mes' ? `${fmt(balance)} de ${fmt(metaMensual)}` : 'Cambia a "Mes Actual" para ver tu avance'}
              valorTexto={balanceMesActualPct !== null ? `${balanceMesActualPct.toFixed(0)}%` : '—'}
              pct={balanceMesActualPct ?? 0} color="#8b5cf6" icon={Target} dark={darkMode}
              accion={
                !editandoMeta ? (
                  <button onClick={() => { setInputMeta(String(metaMensual)); setEditandoMeta(true); }} className={`mt-1 inline-flex items-center gap-1 text-[10px] font-semibold ${darkMode ? 'text-violet-400' : 'text-violet-600'}`}>
                    <Pencil className="w-2.5 h-2.5" /> Cambiar meta
                  </button>
                ) : (
                  <div className="flex items-center gap-1 mt-1">
                    <Input
                      autoFocus type="number" value={inputMeta} onChange={(e) => setInputMeta(e.target.value)}
                      className="h-7 text-xs rounded-lg px-2 w-24"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          const val = Number(inputMeta);
                          if (val > 0) { setMetaMensual(val); localStorage.setItem(METAKEY, JSON.stringify(val)); toast.success('Meta actualizada'); }
                          setEditandoMeta(false);
                        }
                      }}
                    />
                    <button
                      onClick={() => {
                        const val = Number(inputMeta);
                        if (val > 0) { setMetaMensual(val); localStorage.setItem(METAKEY, JSON.stringify(val)); toast.success('Meta actualizada'); }
                        setEditandoMeta(false);
                      }}
                      className="text-emerald-500"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                    </button>
                  </div>
                )
              }
            />
            <CircularGauge
              titulo="Presupuesto General"
              subtitulo={presupuestos.length > 0 ? `${fmt(presupuestos.reduce((s, p) => s + p.gastadoMes, 0))} usados este mes` : 'Define límites en "Categorías"'}
              valorTexto={presupuestos.length > 0 ? `${presupuestoGeneralPct.toFixed(0)}%` : '—'}
              pct={presupuestoGeneralPct}
              color={presupuestoGeneralPct >= 100 ? '#ef4444' : presupuestoGeneralPct >= 80 ? '#f59e0b' : '#10b981'}
              icon={Wallet} dark={darkMode}
            />
            <div
              className="rounded-[22px] p-4"
              style={{
                background: darkMode ? 'rgba(13,22,45,0.85)' : '#ffffff',
                border: '1px solid rgba(245,158,11,0.25)',
                boxShadow: panelSombra(darkMode, '#f59e0b'),
              }}
            >
              <div className="flex items-center gap-2 mb-3">
                <Bell className="w-4 h-4 text-amber-500" />
                <p className={`text-xs font-bold uppercase tracking-wide ${txt}`}>Recordatorios</p>
                {recordatorios.length > 0 && (
                  <span className="ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-500 text-white">{recordatorios.length}</span>
                )}
              </div>
              {recordatorios.length === 0 ? (
                <p className={`text-xs flex items-center gap-1.5 ${sub}`}><CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> Estás al día con tus gastos fijos.</p>
              ) : (
                <div className="space-y-2 max-h-32 overflow-y-auto">
                  {recordatorios.map((r) => (
                    <div key={r.id} className={`p-2.5 rounded-xl ${darkMode ? 'bg-amber-500/10' : 'bg-amber-50'}`}>
                      <p className={`text-xs font-bold ${darkMode ? 'text-amber-300' : 'text-amber-700'}`}>{r.concepto}</p>
                      <p className={`text-[11px] mb-1.5 ${sub}`}>{fmt(r.monto)} · vence el día {r.diaDelMes}</p>
                      <button
                        onClick={() => setModalMovimiento({ tipo: 'gasto', prellenar: { categoria: r.categoria, concepto: r.concepto, monto: r.monto } })}
                        className="text-[11px] font-bold text-amber-600 hover:text-amber-500"
                      >
                        Registrar ahora →
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* ═══════════════════ PESTAÑA: CUENTAS POR COBRAR ═══════════════════ */}
      {tabActiva === 'cobrar' && (
        <div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
            <HeroKpiCard titulo="Total por Cobrar" valor={fmt(totalPorCobrar)} icon={Users} gradiente="from-amber-500 to-orange-600" badges={[{ label: 'Clientes', value: String(cuentasPorCobrar.length) }]} />
            <HeroKpiCard titulo="Cuentas Vencidas" valor={String(porCobrarVencido.length)} icon={AlertTriangle} gradiente="from-rose-500 to-red-600" badges={[{ label: 'Monto', value: fmt(porCobrarVencido.reduce((s, c) => s + c.valorPendiente, 0)) }]} />
            <HeroKpiCard titulo="Al Día" valor={String(cuentasPorCobrar.filter((c) => c.estado === 'al_dia').length)} icon={CheckCircle2} gradiente="from-emerald-500 to-teal-600" badges={[{ label: 'Sin atraso', value: '' }]} />
          </div>

          {cargandoCobrar ? (
            <p className={`text-sm text-center py-10 ${sub}`}>Cargando cuentas por cobrar…</p>
          ) : cuentasPorCobrar.length === 0 ? (
            <div className={`rounded-[24px] border p-14 text-center shadow-xl ${card}`} style={{ boxShadow: panelSombra(darkMode) }}>
              <CheckCircle2 className={`w-14 h-14 mx-auto mb-3 text-emerald-500`} />
              <p className={`font-semibold ${txt}`}>¡No hay dinero pendiente por cobrar!</p>
              <p className={`text-xs mt-1 ${sub}`}>Los saldos de Taller y Apartados aparecerán aquí automáticamente.</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {cuentasCobrarPagina.map((c) => {
                const colorEstado = c.estado === 'vencido' ? '#ef4444' : c.estado === 'proximo' ? '#f59e0b' : '#10b981';
                const labelEstado = c.estado === 'vencido' ? 'Vencido' : c.estado === 'proximo' ? 'Próximo a vencer' : 'Al día';
                return (
                  <div key={c.id} className={`rounded-2xl border p-4 flex items-center gap-4 shadow-xl ${card}`} style={{ boxShadow: panelSombra(darkMode, colorEstado) }}>
                    <span className="w-3 h-3 rounded-full shrink-0" style={{ background: colorEstado, boxShadow: `0 0 0 4px ${colorEstado}22` }} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className={`font-bold ${txt}`}>{c.cliente}</p>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: `${colorEstado}20`, color: colorEstado }}>{labelEstado}</span>
                      </div>
                      <p className={`text-xs ${sub}`}>{c.referencia} · {c.origen === 'taller' ? 'Taller' : c.origen === 'apartado' ? 'Apartado' : 'Cartera'} · {c.diasAtraso > 0 ? `${c.diasAtraso} días` : 'hoy'}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className={`text-lg font-extrabold tabular-nums ${txt}`}>{fmt(c.valorPendiente)}</p>
                    </div>
                    {c.origen === 'cartera' && c.carteraCuentaId && (
                      <button
                        onClick={async () => {
                          const cuenta = await obtenerCuentaCartera(c.carteraCuentaId!);
                          if (cuenta) { setCuentaCarteraSeleccionada(cuenta); setModalCarteraAbierto(true); }
                        }}
                        className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-orange-500 to-amber-600 text-white hover:from-orange-600 hover:to-amber-700"
                      >
                        <Wallet className="w-3.5 h-3.5" /> Abonar
                      </button>
                    )}
                    <button
                      onClick={() => enviarRecordatorio(c)}
                      className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-emerald-500 to-teal-600 text-white hover:from-emerald-600 hover:to-teal-700"
                    >
                      <Send className="w-3.5 h-3.5" /> Recordatorio
                    </button>
                  </div>
                );
              })}
              {totalPaginasCobrar > 1 && (
                <div className={`flex items-center justify-between px-4 py-3 border-t ${border}`}>
                  <p className={`text-xs ${sub}`}>Página {paginaCobrarSegura} de {totalPaginasCobrar} · {cuentasPorCobrar.length} clientes</p>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" disabled={paginaCobrarSegura <= 1} onClick={() => setPaginaCobrar((p) => Math.max(1, p - 1))} className="h-8 w-8 p-0 rounded-lg">
                      <ChevronLeft className="w-4 h-4" />
                    </Button>
                    <Button size="sm" variant="outline" disabled={paginaCobrarSegura >= totalPaginasCobrar} onClick={() => setPaginaCobrar((p) => Math.min(totalPaginasCobrar, p + 1))} className="h-8 w-8 p-0 rounded-lg">
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════ PESTAÑA: RENTABILIDAD ═══════════════════════ */}
      {tabActiva === 'rentabilidad' && (
        <div>
          <div className={`mb-4 p-3.5 rounded-2xl border-2 flex items-start gap-3 ${darkMode ? 'bg-blue-500/10 border-blue-500/25' : 'bg-blue-50 border-blue-200'}`}>
            <LineChart className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
            <p className={`text-sm ${darkMode ? 'text-blue-200' : 'text-blue-800'}`}>
              Utilidad real (ventas − costo), no solo cuánto vendiste — así sabes qué te deja más ganancia de verdad.
            </p>
          </div>

          {cargandoRentabilidad ? (
            <p className={`text-sm text-center py-10 ${sub}`}>Calculando rentabilidad…</p>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {([
                ['Productos Más Rentables', rentabilidadProductos, Wrench],
                ['Categorías Más Rentables', rentabilidadCategorias, Tag],
                ['Clientes Más Rentables', rentabilidadClientes, Users],
              ] as [string, RentabilidadItem[], any][]).map(([titulo, lista, Icon]) => (
                <div key={titulo} className={`rounded-[24px] border p-4 shadow-xl ${card}`} style={{ boxShadow: panelSombra(darkMode) }}>
                  <div className="flex items-center gap-2 mb-3">
                    <Icon className={`w-4 h-4 ${sub}`} />
                    <h3 className={`font-bold text-sm ${txt}`}>{titulo}</h3>
                  </div>
                  {lista.length === 0 ? (
                    <p className={`text-xs ${sub}`}>Sin datos suficientes en este período.</p>
                  ) : (
                    <div className="space-y-2">
                      {lista.map((r, i) => (
                        <div key={r.nombre} className={`flex items-center gap-2.5 p-2.5 rounded-xl ${darkMode ? 'bg-slate-800/50' : 'bg-gray-50'}`}>
                          <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${i === 0 ? 'bg-amber-500 text-white' : darkMode ? 'bg-slate-700 text-slate-300' : 'bg-gray-200 text-gray-600'}`}>{i + 1}</span>
                          <div className="min-w-0 flex-1">
                            <p className={`text-xs font-semibold truncate ${txt}`}>{r.nombre}</p>
                            <p className={`text-[10px] ${sub}`}>Ventas: {fmt(r.ventas)}</p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-xs font-extrabold text-emerald-500">{fmt(r.utilidad)}</p>
                            <p className={`text-[10px] ${sub}`}>{r.margen.toFixed(0)}% margen</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════ PESTAÑA: FLUJO DE CAJA ═══════════════════════ */}
      {tabActiva === 'flujo' && (
        <div>
          {/* ── Gráfico Ingresos vs Gastos ── */}
          <div className={`p-5 rounded-[28px] border mb-5 shadow-xl ${card}`} style={{ boxShadow: panelSombra(darkMode) }}>
            <h3 className={`font-bold text-sm mb-1 ${txt}`}>Flujo de Caja — Ingresos vs. Gastos</h3>
            <p className={`text-xs mb-4 ${sub}`}>Últimos días del período seleccionado</p>
            <ResponsiveContainer width="100%" height={230}>
              <AreaChart data={datosGrafico}>
                <defs>
                  <linearGradient id="gradIngresos" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity={0.55} />
                    <stop offset="45%" stopColor="#10b981" stopOpacity={0.18} />
                    <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gradGastos" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#f43f5e" stopOpacity={0.45} />
                    <stop offset="45%" stopColor="#f43f5e" stopOpacity={0.14} />
                    <stop offset="100%" stopColor="#f43f5e" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={darkMode ? '#1e293b' : '#e2e8f0'} vertical={false} />
                <XAxis dataKey="dia" tick={{ fontSize: 11, fill: darkMode ? '#94a3b8' : '#64748b' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: darkMode ? '#94a3b8' : '#64748b' }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ backgroundColor: darkMode ? 'rgba(6,13,28,0.97)' : '#fff', border: '1px solid #33415555', borderRadius: 14 }}
                  formatter={(value: number) => fmt(value)}
                />
                <Legend />
                <Area type="natural" dataKey="Ingresos" stroke="#10b981" strokeWidth={2.5} fill="url(#gradIngresos)" />
                <Area type="natural" dataKey="Gastos" stroke="#f43f5e" strokeWidth={2.5} fill="url(#gradGastos)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* ── Filtros de la tabla de movimientos (el período ya se elige arriba) ── */}
          <div className={`p-4 rounded-[24px] border mb-4 shadow-xl ${card}`} style={{ boxShadow: panelSombra(darkMode) }}>
            <div className="flex flex-wrap gap-2 items-end">
              <div className="relative flex-1 min-w-[180px]">
                <Search className={`absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 ${sub}`} />
                <Input
                  placeholder="Buscar concepto, categoría, usuario..."
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  className="h-9 pl-9 rounded-xl"
                />
              </div>

              <Select value={filtroCategoria || '__todas__'} onValueChange={(v) => setFiltroCategoria(v === '__todas__' ? '' : v)}>
                <SelectTrigger className="h-9 w-44 rounded-xl"><SelectValue placeholder="Categoría" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__todas__">Todas las categorías</SelectItem>
                  {categorias.map((c) => <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>)}
                </SelectContent>
              </Select>

              <Select value={filtroMetodo || '__todos__'} onValueChange={(v) => setFiltroMetodo(v === '__todos__' ? '' : v)}>
                <SelectTrigger className="h-9 w-40 rounded-xl"><SelectValue placeholder="Método de pago" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__todos__">Todos los métodos</SelectItem>
                  {METODOS_PAGO.map((m) => <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>)}
                </SelectContent>
              </Select>

              {usuarios.length > 1 && (
                <Select value={filtroUsuario || '__todos__'} onValueChange={(v) => setFiltroUsuario(v === '__todos__' ? '' : v)}>
                  <SelectTrigger className="h-9 w-40 rounded-xl"><SelectValue placeholder="Usuario" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__todos__">Todos los usuarios</SelectItem>
                    {usuarios.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}

              <Select value={filtroOrigen} onValueChange={(v) => setFiltroOrigen(v as OrigenFondos | 'todos')}>
                <SelectTrigger className="h-9 w-40 rounded-xl"><SelectValue placeholder="Origen de fondos" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Caja Menor y Mayor</SelectItem>
                  <SelectItem value="caja_menor">Solo Caja Menor</SelectItem>
                  <SelectItem value="caja_mayor">Solo Caja Mayor</SelectItem>
                </SelectContent>
              </Select>

              {(filtroCategoria || filtroMetodo || filtroUsuario || busqueda || filtroTipo !== 'todos' || filtroOrigen !== 'todos') && (
                <button
                  onClick={() => { setFiltroCategoria(''); setFiltroMetodo(''); setFiltroUsuario(''); setBusqueda(''); setFiltroTipo('todos'); setFiltroOrigen('todos'); }}
                  className={`h-9 px-3 rounded-xl text-xs font-semibold flex items-center gap-1 ${sub} hover:text-red-500`}
                >
                  <X className="w-3.5 h-3.5" /> Limpiar filtros
                </button>
              )}
            </div>
          </div>

          {/* ── Tabla de movimientos ── */}
          <div className={`rounded-[28px] border overflow-hidden shadow-xl ${card}`} style={{ boxShadow: panelSombra(darkMode) }}>
            {movimientos.length === 0 ? (
              <div className="py-16 text-center">
                <Calculator className={`w-14 h-14 mx-auto mb-3 ${sub}`} />
                <p className={`font-semibold ${sub}`}>No hay movimientos en este período</p>
                <p className={`text-xs mt-1 ${sub}`}>Ajusta los filtros o registra un nuevo ingreso/gasto</p>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[900px]">
                    <thead>
                      <tr className={`border-b ${border} ${darkMode ? 'bg-slate-900/40' : 'bg-gray-50'}`}>
                        <th className={`px-4 py-3 text-left text-xs font-bold uppercase ${sub}`}>Fecha</th>
                        <th className={`px-4 py-3 text-left text-xs font-bold uppercase ${sub}`}>Categoría</th>
                        <th className={`px-4 py-3 text-left text-xs font-bold uppercase ${sub}`}>Concepto</th>
                        <th className={`px-4 py-3 text-left text-xs font-bold uppercase ${sub}`}>Método</th>
                        <th className={`px-4 py-3 text-left text-xs font-bold uppercase ${sub}`}>Origen</th>
                        <th className={`px-4 py-3 text-left text-xs font-bold uppercase ${sub}`}>Usuario</th>
                        <th className={`px-4 py-3 text-right text-xs font-bold uppercase ${sub}`}>Monto</th>
                        <th className={`px-4 py-3 text-center text-xs font-bold uppercase ${sub}`}>Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      <AnimatePresence>
                        {filasPagina.map((m) => (
                          <motion.tr
                            key={m.id}
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            className={`border-b ${border} ${rowBg} transition-colors`}
                            style={{ borderLeft: `3px solid ${m.tipo === 'ingreso' ? '#10b981' : '#ef4444'}` }}
                          >
                            <td className={`px-4 py-3 text-sm ${txt}`}>
                              <div className="flex items-center gap-1.5">
                                <Calendar className={`w-3 h-3 ${sub}`} />
                                {format(new Date(m.fecha), 'dd/MM/yy HH:mm', { locale: es })}
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <span
                                className="px-2 py-0.5 rounded-full text-[10px] font-bold"
                                style={{ background: `${colorCategoria(m.categoria)}22`, color: colorCategoria(m.categoria) }}
                              >
                                {nombreCategoria(m.categoria)}
                              </span>
                            </td>
                            <td className={`px-4 py-3 text-sm max-w-[220px] truncate ${txt}`} title={m.concepto}>{m.concepto}</td>
                            <td className="px-4 py-3">
                              <span className="inline-flex items-center gap-1 text-xs font-semibold" style={{ color: metodoColor(m.metodoPago) }}>
                                <CreditCard className="w-3 h-3" /> {metodoLabel(m.metodoPago)}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <span
                                className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full"
                                style={{
                                  background: m.origenFondos === 'caja_mayor' ? 'rgba(59,130,246,0.15)' : 'rgba(16,185,129,0.15)',
                                  color: m.origenFondos === 'caja_mayor' ? '#3b82f6' : '#10b981',
                                }}
                              >
                                {m.origenFondos === 'caja_mayor' ? <Landmark className="w-3 h-3" /> : <Banknote className="w-3 h-3" />}
                                {m.origenFondos === 'caja_mayor' ? 'Caja Mayor' : 'Caja Menor'}
                              </span>
                            </td>
                            <td className={`px-4 py-3 text-sm ${sub}`}>
                              <div className="flex items-center gap-1.5"><User className="w-3 h-3" />{m.registradoPor}</div>
                            </td>
                            <td className={`px-4 py-3 text-right text-base font-semibold tabular-nums ${m.tipo === 'ingreso' ? (darkMode ? 'text-emerald-400' : 'text-emerald-600') : (darkMode ? 'text-red-400' : 'text-red-600')}`}>
                              {m.tipo === 'ingreso' ? '+' : '-'}{fmt(m.monto)}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center justify-center gap-1">
                                <button onClick={() => setModalMovimiento({ tipo: m.tipo, editar: m })} className={`p-1.5 rounded-lg ${darkMode ? 'hover:bg-slate-700 text-slate-400' : 'hover:bg-gray-200 text-gray-500'}`} title="Editar">
                                  <Edit2 className="w-3.5 h-3.5" />
                                </button>
                                <button onClick={() => imprimirMovimiento(m)} className={`p-1.5 rounded-lg ${darkMode ? 'hover:bg-slate-700 text-slate-400' : 'hover:bg-gray-200 text-gray-500'}`} title="Imprimir comprobante">
                                  <Printer className="w-3.5 h-3.5" />
                                </button>
                                <button onClick={() => setConfirmarEliminar(m)} className={`p-1.5 rounded-lg ${darkMode ? 'hover:bg-red-500/20' : 'hover:bg-red-50'} text-red-500`} title="Eliminar">
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </motion.tr>
                        ))}
                      </AnimatePresence>
                    </tbody>
                  </table>
                </div>

                {totalPaginas > 1 && (
                  <div className={`flex items-center justify-between px-4 py-3 border-t ${border}`}>
                    <p className={`text-xs ${sub}`}>Página {paginaSegura} de {totalPaginas} · {movimientos.length} movimientos</p>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" disabled={paginaSegura <= 1} onClick={() => setPagina((p) => Math.max(1, p - 1))} className="h-8 w-8 p-0 rounded-lg">
                        <ChevronLeft className="w-4 h-4" />
                      </Button>
                      <Button size="sm" variant="outline" disabled={paginaSegura >= totalPaginas} onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))} className="h-8 w-8 p-0 rounded-lg">
                        <ChevronRight className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* ═══════════════════ PESTAÑA: FACTURACIÓN DIAN (solo lectura) ═════
          Lista los XML de facturación electrónica ya emitidos (mismos datos
          que FacturacionElectronicaPage) con opción de ver/descargar cada
          uno — la emisión y gestión completa de facturas sigue viviendo en
          esa página; aquí es solo un archivo consultable desde Contabilidad. */}
      {tabActiva === 'dian' && (
        <div>
          {!clienteIdDian ? (
            <div className={`p-6 rounded-2xl border-2 ${darkMode ? 'bg-amber-900/20 border-amber-700 text-amber-300' : 'bg-amber-50 border-amber-300 text-amber-800'}`}>
              Esta instalación todavía no está vinculada a la nube — el historial de XML DIAN necesita que primero
              vincules el negocio (Configuración → Vinculación con la nube).
            </div>
          ) : (
            <>
              <div className={`p-4 rounded-[24px] border mb-5 shadow-xl flex flex-wrap items-center gap-3 ${card}`} style={{ boxShadow: panelSombra(darkMode) }}>
                <div className="relative flex-1 min-w-[220px]">
                  <Search className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 ${sub}`} />
                  <input
                    value={busquedaDian}
                    onChange={(e) => setBusquedaDian(e.target.value)}
                    placeholder="Buscar por número, cliente o CUFE..."
                    className={`w-full pl-9 pr-3 h-10 rounded-xl border text-sm ${darkMode ? 'bg-slate-900 border-slate-700 text-white' : 'bg-gray-50 border-gray-200 text-slate-900'}`}
                  />
                </div>
                <p className={`text-xs ${sub}`}>{facturasDianFiltradas.length} factura{facturasDianFiltradas.length === 1 ? '' : 's'} en el período seleccionado</p>
              </div>

              <div className={`rounded-[28px] border overflow-hidden shadow-xl ${card}`} style={{ boxShadow: panelSombra(darkMode) }}>
                {cargandoDian ? (
                  <div className="py-16 text-center">
                    <ShieldCheck className={`w-14 h-14 mx-auto mb-3 ${sub}`} />
                    <p className={`font-semibold ${sub}`}>Cargando facturas...</p>
                  </div>
                ) : facturasDianFiltradas.length === 0 ? (
                  <div className="py-16 text-center">
                    <FileText className={`w-14 h-14 mx-auto mb-3 ${sub}`} />
                    <p className={`font-semibold ${sub}`}>No hay facturas electrónicas en este período</p>
                    <p className={`text-xs mt-1 ${sub}`}>Se emiten desde el módulo de Facturación Electrónica</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[900px]">
                      <thead>
                        <tr className={`border-b ${border} ${darkMode ? 'bg-slate-900/40' : 'bg-gray-50'}`}>
                          <th className={`px-4 py-3 text-left text-xs font-bold uppercase ${sub}`}>Número</th>
                          <th className={`px-4 py-3 text-left text-xs font-bold uppercase ${sub}`}>Fecha</th>
                          <th className={`px-4 py-3 text-left text-xs font-bold uppercase ${sub}`}>Cliente</th>
                          <th className={`px-4 py-3 text-right text-xs font-bold uppercase ${sub}`}>Total</th>
                          <th className={`px-4 py-3 text-left text-xs font-bold uppercase ${sub}`}>Estado</th>
                          <th className={`px-4 py-3 text-center text-xs font-bold uppercase ${sub}`}>Acciones</th>
                        </tr>
                      </thead>
                      <tbody>
                        {facturasDianFiltradas.map((f) => {
                          const info = ESTADO_DIAN_UI[f.estado];
                          return (
                            <tr key={f.id} className={`border-b ${border} ${rowBg} transition-colors`}>
                              <td className={`px-4 py-3 text-sm font-mono ${txt}`}>{f.numeroFactura}</td>
                              <td className={`px-4 py-3 text-sm ${sub}`}>
                                <div className="flex items-center gap-1.5"><Calendar className="w-3 h-3" />{format(new Date(f.fechaEmision), 'dd/MM/yy HH:mm', { locale: es })}</div>
                              </td>
                              <td className={`px-4 py-3 text-sm max-w-[220px] truncate ${txt}`} title={f.adquirente?.nombreORazonSocial}>{f.adquirente?.nombreORazonSocial || '—'}</td>
                              <td className={`px-4 py-3 text-right text-sm font-semibold tabular-nums ${txt}`}>{fmt(f.total)}</td>
                              <td className="px-4 py-3">
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold" style={{ background: `${info.color}22`, color: info.color }}>
                                  {info.label}
                                </span>
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex items-center justify-center gap-1">
                                  <button onClick={() => setFacturaXmlDian(f)} className={`p-1.5 rounded-lg ${darkMode ? 'hover:bg-slate-700 text-slate-400' : 'hover:bg-gray-200 text-gray-500'}`} title="Ver XML">
                                    <FileText className="w-3.5 h-3.5" />
                                  </button>
                                  <button onClick={() => descargarXmlDian(f)} className={`p-1.5 rounded-lg ${darkMode ? 'hover:bg-slate-700 text-slate-400' : 'hover:bg-gray-200 text-gray-500'}`} title="Descargar XML">
                                    <Download className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Modal: ver XML de una factura DIAN ── */}
      {facturaXmlDian && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={() => setFacturaXmlDian(null)}>
          <div className={`w-full max-w-3xl max-h-[80vh] rounded-2xl overflow-hidden flex flex-col border-2 ${card}`} onClick={(e) => e.stopPropagation()}>
            <div className={`px-5 py-3 border-b ${border} flex items-center justify-between`}>
              <p className={`font-bold ${txt}`}>{facturaXmlDian.numeroFactura} — XML UBL 2.1</p>
              <div className="flex items-center gap-2">
                <button onClick={() => descargarXmlDian(facturaXmlDian)} className={`p-1.5 rounded-lg ${darkMode ? 'hover:bg-slate-700 text-slate-400' : 'hover:bg-gray-200 text-gray-500'}`} title="Descargar XML">
                  <Download className="w-4 h-4" />
                </button>
                <button onClick={() => setFacturaXmlDian(null)} className={sub}>✕</button>
              </div>
            </div>
            <pre className={`flex-1 overflow-auto p-4 text-xs font-mono whitespace-pre-wrap ${txt}`}>{facturaXmlDian.xml || 'Sin XML generado todavía.'}</pre>
          </div>
        </div>
      )}

      {/* ═══════════════════════ PESTAÑA: REPORTES ═══════════════════════ */}
      {tabActiva === 'reportes' && (
        <div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
            <button onClick={exportarPDF} className={`rounded-[24px] border p-6 text-left shadow-xl transition-transform hover:-translate-y-1 ${card}`} style={{ boxShadow: panelSombra(darkMode, '#ef4444') }}>
              <div className="w-12 h-12 rounded-2xl bg-red-500/15 flex items-center justify-center mb-3"><FileDown className="w-6 h-6 text-red-500" /></div>
              <p className={`font-bold ${txt}`}>Exportar a PDF</p>
              <p className={`text-xs ${sub}`}>Reporte financiero ejecutivo con resumen, gastos por categoría y detalle del período.</p>
            </button>
            <button onClick={exportarExcel} className={`rounded-[24px] border p-6 text-left shadow-xl transition-transform hover:-translate-y-1 ${card}`} style={{ boxShadow: panelSombra(darkMode, '#10b981') }}>
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/15 flex items-center justify-center mb-3"><FileSpreadsheet className="w-6 h-6 text-emerald-500" /></div>
              <p className={`font-bold ${txt}`}>Exportar a Excel</p>
              <p className={`text-xs ${sub}`}>Libro con hojas de resumen, categorías, presupuestos y movimientos.</p>
            </button>
          </div>

          <h3 className={`font-bold text-sm mb-3 ${txt}`}>Reportes rápidos</h3>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {([
              ['Estado de Resultados', 'resumen', Sparkles],
              ['Ventas por Período', 'flujo', Activity],
              ['Rentabilidad por Producto', 'rentabilidad', LineChart],
              ['Cuentas por Cobrar', 'cobrar', Users],
            ] as [string, typeof tabActiva, any][]).map(([label, tab, Icon]) => (
              <button
                key={label}
                onClick={() => setTabActiva(tab)}
                className={`rounded-2xl border p-4 text-left shadow-xl transition-transform hover:-translate-y-1 ${card}`}
                style={{ boxShadow: panelSombra(darkMode) }}
              >
                <Icon className="w-5 h-5 text-emerald-500 mb-2" />
                <p className={`text-xs font-bold ${txt}`}>{label}</p>
                <p className={`text-[10px] mt-0.5 ${sub}`}>Ver pestaña →</p>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Modal: nuevo/editar movimiento ── */}
      {modalMovimiento && (
        <ModalMovimiento
          tipo={modalMovimiento.tipo}
          editar={modalMovimiento.editar}
          prellenar={modalMovimiento.prellenar}
          categorias={obtenerCategoriasPorTipo(modalMovimiento.tipo)}
          darkMode={darkMode}
          usuario={{ id: usuarioActual?.id, nombre: usuarioActual?.nombreCompleto || usuarioActual?.username || 'Desconocido' }}
          onClose={() => setModalMovimiento(null)}
          onGuardado={() => { cargarMovimientos(); setModalMovimiento(null); }}
          onCrearCategoria={(nombre, color) => {
            const nueva = crearCategoria(nombre, modalMovimiento.tipo, color);
            setCategorias(obtenerCategorias());
            return nueva;
          }}
        />
      )}

      {/* ── Modal: gestionar categorías ── */}
      {modalCategorias && (
        <ModalCategorias
          categorias={categorias}
          darkMode={darkMode}
          onClose={() => setModalCategorias(false)}
          onCambio={() => setCategorias(obtenerCategorias())}
        />
      )}

      {/* ── Modal: gastos recurrentes (arriendo, nómina, servicios...) ── */}
      {modalRecurrentes && (
        <ModalGastosRecurrentes
          gastosRecurrentes={gastosRecurrentes}
          categorias={obtenerCategoriasPorTipo('gasto')}
          darkMode={darkMode}
          onClose={() => setModalRecurrentes(false)}
          onCambio={() => {
            setGastosRecurrentes(obtenerGastosRecurrentes());
            setRecordatorios(calcularRecordatoriosPendientes());
          }}
        />
      )}

      {/* ── Confirmar eliminar ── */}
      {confirmarEliminar && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[210] flex items-center justify-center p-4" onClick={() => setConfirmarEliminar(null)}>
          <motion.div
            initial={{ scale: 0.94, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
            onClick={(e) => e.stopPropagation()}
            className={`w-full max-w-sm rounded-3xl p-6 border-2 ${card}`}
          >
            <h3 className={`font-bold text-lg mb-2 ${txt}`}>¿Eliminar este movimiento?</h3>
            <p className={`text-sm mb-5 ${sub}`}>
              {confirmarEliminar.concepto} — {fmt(confirmarEliminar.monto)}. Esta acción no se puede deshacer.
            </p>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1 rounded-xl" onClick={() => setConfirmarEliminar(null)}>Cancelar</Button>
              <Button className="flex-1 rounded-xl bg-red-500 hover:bg-red-600" onClick={confirmarEliminarMovimiento}>Eliminar</Button>
            </div>
          </motion.div>
        </div>
      )}

      <ModalDetalleCuentaCartera
        isOpen={modalCarteraAbierto}
        onClose={() => setModalCarteraAbierto(false)}
        cuenta={cuentaCarteraSeleccionada}
        darkMode={darkMode}
        usuarioActual={usuarioActual}
        onCuentaActualizada={(actualizada) => {
          setCuentaCarteraSeleccionada(actualizada);
          setCuentasPorCobrar((prev) => {
            if (actualizada.saldo <= 0) {
              return prev.filter((c) => c.carteraCuentaId !== actualizada.id);
            }
            return prev.map((c) => c.carteraCuentaId === actualizada.id
              ? { ...c, valorPendiente: actualizada.saldo }
              : c);
          });
        }}
      />
    </div>
  );
}

// ─────────────── Modal: Nuevo / Editar movimiento ───────────────
function ModalMovimiento({
  tipo, editar, prellenar, categorias, darkMode, usuario, onClose, onGuardado, onCrearCategoria,
}: {
  tipo: TipoMovimiento;
  editar?: MovimientoContable;
  prellenar?: { categoria?: string; concepto?: string; monto?: number };
  categorias: CategoriaContable[];
  darkMode: boolean;
  usuario: { id?: string; nombre: string };
  onClose: () => void;
  onGuardado: () => void;
  onCrearCategoria: (nombre: string, color: string) => CategoriaContable;
}) {
  const [categoria, setCategoria] = useState(editar?.categoria || prellenar?.categoria || categorias[0]?.id || '');
  const [concepto, setConcepto] = useState(editar?.concepto || prellenar?.concepto || '');
  const [monto, setMonto] = useState(editar ? String(editar.monto) : prellenar?.monto ? String(prellenar.monto) : '');
  const [metodoPago, setMetodoPago] = useState(editar?.metodoPago || 'efectivo');
  const [origenFondos, setOrigenFondos] = useState<OrigenFondos>(editar?.origenFondos || 'caja_menor');
  const [notas, setNotas] = useState(editar?.notas || '');
  const [nuevaCategoria, setNuevaCategoria] = useState('');
  const [mostrarNuevaCategoria, setMostrarNuevaCategoria] = useState(false);
  const [listaCategorias, setListaCategorias] = useState(categorias);

  const card = darkMode ? 'bg-slate-900 border-slate-700' : 'bg-white border-gray-200';
  const txt = darkMode ? 'text-white' : 'text-slate-900';
  const sub = darkMode ? 'text-slate-400' : 'text-slate-500';

  const handleCrearCategoria = () => {
    const nombre = nuevaCategoria.trim();
    if (!nombre) return;
    const color = COLORES_CATEGORIA[listaCategorias.length % COLORES_CATEGORIA.length];
    const nueva = onCrearCategoria(nombre, color);
    setListaCategorias((prev) => [...prev, nueva]);
    setCategoria(nueva.id);
    setNuevaCategoria('');
    setMostrarNuevaCategoria(false);
  };

  const handleGuardar = () => {
    const montoNum = Number(monto);
    if (!concepto.trim() || !categoria || !montoNum || montoNum <= 0) {
      toast.error('Completa todos los campos obligatorios');
      return;
    }

    if (tipo === 'ingreso') {
      guardarIngresoExtra({
        id: editar?.id,
        concepto: concepto.trim(),
        categoria,
        monto: montoNum,
        metodoPago: metodoPago as any,
        origenFondos,
        registradoPor: usuario.nombre,
        registradoPorId: usuario.id,
        notas: notas.trim() || undefined,
      });
      toast.success(editar ? 'Ingreso actualizado' : 'Ingreso registrado');
      onGuardado();
      return;
    }

    // Gasto
    if (editar) {
      actualizarGasto(editar.id, {
        descripcion: concepto.trim(),
        concepto: concepto.trim(),
        categoria,
        monto: montoNum,
        metodoPago,
        origenFondos,
        notas: notas.trim() || undefined,
      }, usuario.nombre);
      toast.success('Gasto actualizado');
      onGuardado();
      return;
    }

    const resultado = crearGasto(
      { descripcion: concepto.trim(), concepto: concepto.trim(), categoria, monto: montoNum, metodoPago, origenFondos, notas: notas.trim() || undefined },
      usuario
    );
    if (!resultado.ok) {
      toast.error(resultado.error);
      return;
    }
    toast.success('Gasto registrado');
    onGuardado();
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[205] flex items-center justify-center p-4" onClick={onClose}>
      <motion.div
        initial={{ scale: 0.94, opacity: 0, y: 10 }} animate={{ scale: 1, opacity: 1, y: 0 }}
        onClick={(e) => e.stopPropagation()}
        className={`w-full max-w-md rounded-3xl p-6 border-2 max-h-[90vh] overflow-y-auto ${card}`}
      >
        <div className="flex items-center justify-between mb-5">
          <h3 className={`font-bold text-lg flex items-center gap-2 ${txt}`}>
            {tipo === 'ingreso'
              ? <ArrowUpCircle className="w-5 h-5 text-emerald-500" />
              : <ArrowDownCircle className="w-5 h-5 text-red-500" />}
            {editar ? 'Editar' : 'Nuevo'} {tipo === 'ingreso' ? 'Ingreso' : 'Gasto'}
          </h3>
          <button onClick={onClose} className={sub}><X className="w-5 h-5" /></button>
        </div>

        <div className="space-y-4">
          <div>
            <Label className={`text-xs mb-1.5 block ${sub}`}>Categoría</Label>
            {!mostrarNuevaCategoria ? (
              <div className="flex gap-2">
                <Select value={categoria} onValueChange={setCategoria}>
                  <SelectTrigger className="h-10 rounded-xl flex-1"><SelectValue placeholder="Selecciona una categoría" /></SelectTrigger>
                  <SelectContent>
                    {listaCategorias.map((c) => <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button type="button" variant="outline" className="h-10 rounded-xl px-3" onClick={() => setMostrarNuevaCategoria(true)}>
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
            ) : (
              <div className="flex gap-2">
                <Input autoFocus placeholder="Nombre de la nueva categoría" value={nuevaCategoria} onChange={(e) => setNuevaCategoria(e.target.value)} className="h-10 rounded-xl flex-1" />
                <Button type="button" className="h-10 rounded-xl bg-emerald-500 hover:bg-emerald-600" onClick={handleCrearCategoria}>Crear</Button>
                <Button type="button" variant="outline" className="h-10 rounded-xl px-3" onClick={() => setMostrarNuevaCategoria(false)}><X className="w-4 h-4" /></Button>
              </div>
            )}
          </div>

          <div>
            <Label className={`text-xs mb-1.5 block ${sub}`}>Concepto</Label>
            <Input placeholder={tipo === 'ingreso' ? 'Ej: Venta de vitrina antigua' : 'Ej: Pago factura de luz'} value={concepto} onChange={(e) => setConcepto(e.target.value)} className="h-10 rounded-xl" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className={`text-xs mb-1.5 block ${sub}`}>Monto</Label>
              <Input type="number" placeholder="0" value={monto} onChange={(e) => setMonto(e.target.value)} className="h-10 rounded-xl" />
            </div>
            <div>
              <Label className={`text-xs mb-1.5 block ${sub}`}>Método de pago</Label>
              <Select value={metodoPago} onValueChange={setMetodoPago}>
                <SelectTrigger className="h-10 rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {METODOS_PAGO.map((m) => <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label className={`text-xs mb-1.5 block ${sub}`}>
              {tipo === 'gasto' ? '¿De dónde sale el dinero?' : '¿A dónde entra el dinero?'}
            </Label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setOrigenFondos('caja_menor')}
                className={`h-11 rounded-xl border-2 flex items-center justify-center gap-2 text-sm font-semibold transition-all ${
                  origenFondos === 'caja_menor'
                    ? 'border-emerald-500 bg-emerald-500/10 text-emerald-500'
                    : darkMode ? 'border-slate-700 text-slate-400' : 'border-gray-200 text-gray-500'
                }`}
              >
                <Banknote className="w-4 h-4" /> Caja Menor
              </button>
              <button
                type="button"
                onClick={() => setOrigenFondos('caja_mayor')}
                className={`h-11 rounded-xl border-2 flex items-center justify-center gap-2 text-sm font-semibold transition-all ${
                  origenFondos === 'caja_mayor'
                    ? 'border-blue-500 bg-blue-500/10 text-blue-500'
                    : darkMode ? 'border-slate-700 text-slate-400' : 'border-gray-200 text-gray-500'
                }`}
              >
                <Landmark className="w-4 h-4" /> Caja Mayor / Banco
              </button>
            </div>
            <p className={`text-[11px] mt-1.5 ${sub}`}>
              {origenFondos === 'caja_menor'
                ? (tipo === 'gasto' ? 'Sale del efectivo del turno actual — sí afecta el arqueo del cajero.' : 'Entra al efectivo del turno actual.')
                : 'Dinero externo (banco, cuentas del dueño) — no afecta el conteo físico de caja del cajero.'}
            </p>
          </div>

          <div>
            <Label className={`text-xs mb-1.5 block ${sub}`}>Notas (opcional)</Label>
            <textarea
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              className={`w-full h-20 rounded-xl p-3 text-sm resize-none border focus:outline-none ${darkMode ? 'bg-slate-800 border-slate-600 text-white' : 'bg-gray-50 border-gray-300'}`}
              placeholder="Detalles adicionales..."
            />
          </div>

          {monto && Number(monto) > 0 && (
            <div className={`p-3 rounded-xl text-center ${tipo === 'ingreso' ? (darkMode ? 'bg-emerald-500/10' : 'bg-emerald-50') : (darkMode ? 'bg-red-500/10' : 'bg-red-50')}`}>
              <p className={`text-xs ${sub}`}>Este movimiento {tipo === 'ingreso' ? 'sumará' : 'restará'}</p>
              <p className={`text-2xl font-black ${tipo === 'ingreso' ? 'text-emerald-500' : 'text-red-500'}`}>
                {tipo === 'ingreso' ? '+' : '-'}{fmt(Number(monto))}
              </p>
            </div>
          )}

          <Button onClick={handleGuardar} className="w-full h-11 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 font-bold">
            {editar ? 'Guardar Cambios' : 'Registrar Movimiento'}
          </Button>
        </div>
      </motion.div>
    </div>
  );
}

// ─────────────── Modal: Gestionar categorías ───────────────
function ModalCategorias({
  categorias, darkMode, onClose, onCambio,
}: {
  categorias: CategoriaContable[]; darkMode: boolean; onClose: () => void; onCambio: () => void;
}) {
  const [nombre, setNombre] = useState('');
  const [tipo, setTipo] = useState<TipoMovimiento | 'ambos'>('gasto');
  const [colorSel, setColorSel] = useState(COLORES_CATEGORIA[0]);
  const [presupuestosMap, setPresupuestosMap] = useState<Record<string, string>>(() => {
    const actuales: Record<string, string> = {};
    obtenerPresupuestos().forEach((p) => { actuales[p.categoriaId] = String(p.limiteMensual); });
    return actuales;
  });

  const card = darkMode ? 'bg-slate-900 border-slate-700' : 'bg-white border-gray-200';
  const txt = darkMode ? 'text-white' : 'text-slate-900';
  const sub = darkMode ? 'text-slate-400' : 'text-slate-500';
  const item = darkMode ? 'bg-slate-800/60' : 'bg-gray-50';

  const crear = () => {
    if (!nombre.trim()) { toast.error('Escribe un nombre para la categoría'); return; }
    crearCategoria(nombre.trim(), tipo, colorSel);
    toast.success('Categoría creada');
    setNombre('');
    onCambio();
  };

  const eliminar = (id: string) => {
    if (!eliminarCategoria(id)) {
      toast.error('Las categorías predeterminadas no se pueden eliminar');
      return;
    }
    toast.success('Categoría eliminada');
    onCambio();
  };

  const guardarLimite = (categoriaId: string) => {
    const valor = Number(presupuestosMap[categoriaId] || 0);
    guardarPresupuesto(categoriaId, valor);
    toast.success(valor > 0 ? 'Límite mensual guardado' : 'Límite mensual eliminado');
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[205] flex items-center justify-center p-4" onClick={onClose}>
      <motion.div
        initial={{ scale: 0.94, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        onClick={(e) => e.stopPropagation()}
        className={`w-full max-w-lg rounded-3xl p-6 border-2 max-h-[85vh] flex flex-col ${card}`}
      >
        <div className="flex items-center justify-between mb-4 shrink-0">
          <h3 className={`font-bold text-lg flex items-center gap-2 ${txt}`}><Tag className="w-5 h-5 text-emerald-500" /> Categorías</h3>
          <button onClick={onClose} className={sub}><X className="w-5 h-5" /></button>
        </div>

        <div className={`p-4 rounded-2xl mb-4 shrink-0 ${item}`}>
          <p className={`text-xs font-bold uppercase mb-2 ${sub}`}>Nueva categoría</p>
          <div className="flex gap-2 mb-2">
            <Input placeholder="Nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} className="h-9 rounded-xl flex-1" />
            <Select value={tipo} onValueChange={(v) => setTipo(v as TipoMovimiento | 'ambos')}>
              <SelectTrigger className="h-9 w-32 rounded-xl"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="gasto">Gasto</SelectItem>
                <SelectItem value="ingreso">Ingreso</SelectItem>
                <SelectItem value="ambos">Ambos</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2 mb-3">
            {COLORES_CATEGORIA.map((c) => (
              <button
                key={c}
                onClick={() => setColorSel(c)}
                className="w-6 h-6 rounded-full transition-transform"
                style={{ background: c, transform: colorSel === c ? 'scale(1.25)' : 'scale(1)', boxShadow: colorSel === c ? `0 0 0 2px #fff, 0 0 0 4px ${c}` : 'none' }}
              />
            ))}
          </div>
          <Button onClick={crear} className="w-full h-9 rounded-xl bg-emerald-500 hover:bg-emerald-600">
            <Plus className="w-4 h-4 mr-1" /> Crear Categoría
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto space-y-1.5">
          {categorias.map((c) => {
            const esGasto = c.tipo === 'gasto' || c.tipo === 'ambos';
            return (
              <div key={c.id} className={`p-2.5 rounded-xl ${item}`}>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="w-3 h-3 rounded-full shrink-0" style={{ background: c.color }} />
                    <span className={`text-sm truncate ${txt}`}>{c.nombre}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full shrink-0 ${sub} ${darkMode ? 'bg-slate-700' : 'bg-gray-200'}`}>
                      {c.tipo === 'ingreso' ? 'Ingreso' : c.tipo === 'gasto' ? 'Gasto' : 'Ambos'}
                    </span>
                  </div>
                  {!c.predeterminada && (
                    <button onClick={() => eliminar(c.id)} className="text-red-500 p-1 rounded-lg hover:bg-red-500/10 shrink-0">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                {esGasto && (
                  <div className="flex items-center gap-2 mt-2 pl-5">
                    <Target className={`w-3.5 h-3.5 shrink-0 ${sub}`} />
                    <span className={`text-[11px] shrink-0 ${sub}`}>Límite mensual:</span>
                    <Input
                      type="number"
                      placeholder="Sin límite"
                      value={presupuestosMap[c.id] || ''}
                      onChange={(e) => setPresupuestosMap((prev) => ({ ...prev, [c.id]: e.target.value }))}
                      onBlur={() => guardarLimite(c.id)}
                      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                      className="h-7 text-xs rounded-lg flex-1 max-w-[140px]"
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </motion.div>
    </div>
  );
}

// ─────────────── Modal: Gastos recurrentes (arriendo, nómina, servicios) ───
function ModalGastosRecurrentes({
  gastosRecurrentes, categorias, darkMode, onClose, onCambio,
}: {
  gastosRecurrentes: GastoRecurrente[]; categorias: CategoriaContable[]; darkMode: boolean; onClose: () => void; onCambio: () => void;
}) {
  const [concepto, setConcepto] = useState('');
  const [categoria, setCategoria] = useState(categorias[0]?.id || '');
  const [monto, setMonto] = useState('');
  const [diaDelMes, setDiaDelMes] = useState('1');
  const [origenFondos, setOrigenFondos] = useState<OrigenFondos>('caja_menor');

  const card = darkMode ? 'bg-slate-900 border-slate-700' : 'bg-white border-gray-200';
  const txt = darkMode ? 'text-white' : 'text-slate-900';
  const sub = darkMode ? 'text-slate-400' : 'text-slate-500';
  const item = darkMode ? 'bg-slate-800/60' : 'bg-gray-50';

  const crear = () => {
    const montoNum = Number(monto);
    const dia = Math.min(28, Math.max(1, Number(diaDelMes) || 1));
    if (!concepto.trim() || !categoria || !montoNum || montoNum <= 0) {
      toast.error('Completa concepto, categoría y monto');
      return;
    }
    guardarGastoRecurrente({ concepto: concepto.trim(), categoria, monto: montoNum, diaDelMes: dia, origenFondos, activo: true });
    toast.success('Gasto recurrente creado');
    setConcepto(''); setMonto(''); setDiaDelMes('1');
    onCambio();
  };

  const eliminar = (id: string) => {
    eliminarGastoRecurrente(id);
    toast.success('Gasto recurrente eliminado');
    onCambio();
  };

  const toggleActivo = (g: GastoRecurrente) => {
    guardarGastoRecurrente({ ...g, activo: !g.activo });
    onCambio();
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[205] flex items-center justify-center p-4" onClick={onClose}>
      <motion.div
        initial={{ scale: 0.94, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        onClick={(e) => e.stopPropagation()}
        className={`w-full max-w-lg rounded-3xl p-6 border-2 max-h-[85vh] flex flex-col ${card}`}
      >
        <div className="flex items-center justify-between mb-4 shrink-0">
          <h3 className={`font-bold text-lg flex items-center gap-2 ${txt}`}><Repeat className="w-5 h-5 text-amber-500" /> Gastos Recurrentes</h3>
          <button onClick={onClose} className={sub}><X className="w-5 h-5" /></button>
        </div>
        <p className={`text-xs mb-4 -mt-2 ${sub}`}>Marca tus pagos fijos (arriendo, nómina, servicios) y te avisamos cuando llegue el día de registrarlos.</p>

        <div className={`p-4 rounded-2xl mb-4 shrink-0 ${item}`}>
          <p className={`text-xs font-bold uppercase mb-2 ${sub}`}>Nuevo gasto recurrente</p>
          <div className="grid grid-cols-2 gap-2 mb-2">
            <Input placeholder="Concepto (ej. Arriendo)" value={concepto} onChange={(e) => setConcepto(e.target.value)} className="h-9 rounded-xl col-span-2" />
            <Select value={categoria} onValueChange={setCategoria}>
              <SelectTrigger className="h-9 rounded-xl"><SelectValue placeholder="Categoría" /></SelectTrigger>
              <SelectContent>
                {categorias.map((c) => <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>)}
              </SelectContent>
            </Select>
            <Input type="number" placeholder="Monto" value={monto} onChange={(e) => setMonto(e.target.value)} className="h-9 rounded-xl" />
            <div className="flex items-center gap-2">
              <Label className={`text-xs shrink-0 ${sub}`}>Día del mes</Label>
              <Input type="number" min={1} max={28} value={diaDelMes} onChange={(e) => setDiaDelMes(e.target.value)} className="h-9 rounded-xl w-16" />
            </div>
            <Select value={origenFondos} onValueChange={(v) => setOrigenFondos(v as OrigenFondos)}>
              <SelectTrigger className="h-9 rounded-xl"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="caja_menor">Caja Menor</SelectItem>
                <SelectItem value="caja_mayor">Caja Mayor</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button onClick={crear} className="w-full h-9 rounded-xl bg-amber-500 hover:bg-amber-600">
            <Plus className="w-4 h-4 mr-1" /> Agregar Recurrente
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto space-y-1.5">
          {gastosRecurrentes.length === 0 ? (
            <p className={`text-sm text-center py-6 ${sub}`}>Aún no tienes gastos recurrentes configurados.</p>
          ) : (
            gastosRecurrentes.map((g) => (
              <div key={g.id} className={`p-2.5 rounded-xl flex items-center justify-between gap-2 ${item} ${!g.activo ? 'opacity-50' : ''}`}>
                <div className="min-w-0">
                  <p className={`text-sm font-semibold truncate ${txt}`}>{g.concepto}</p>
                  <p className={`text-[11px] ${sub}`}>{fmt(g.monto)} · día {g.diaDelMes} · {nombreCategoria(g.categoria)}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => toggleActivo(g)} className={`text-[10px] font-bold px-2 py-1 rounded-lg ${g.activo ? 'text-emerald-500 hover:bg-emerald-500/10' : `${sub} hover:bg-slate-500/10`}`}>
                    {g.activo ? 'Activo' : 'Pausado'}
                  </button>
                  <button onClick={() => eliminar(g.id)} className="text-red-500 p-1.5 rounded-lg hover:bg-red-500/10">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </motion.div>
    </div>
  );
}
