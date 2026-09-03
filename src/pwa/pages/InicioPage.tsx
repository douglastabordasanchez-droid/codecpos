import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { motion } from 'motion/react';
import { Package, Settings, Users, Circle, ChevronRight, Wallet, RotateCcw, Lock, Calendar, DollarSign, TrendingUp, Receipt, Target } from 'lucide-react';
import { getSupabaseClient } from '../../app/lib/supabase/config';
import { usePwaAuth } from '../contexts/PwaAuthContext';
import { useModulosActivos } from '../hooks/useModulosActivos';
import { ModuloPOS } from '../../app/lib/permissions';
import { RingStat } from '../components/RingStat';
import { SucursalSelector } from '../components/SucursalSelector';
import { machineIdsDeSucursal } from '../../app/lib/supabase/sucursalesService';

interface VentaFila {
  id: string;
  total: number;
  created_at: string;
}

interface SesionFila {
  id: string;
  terminal_nombre: string | null;
  terminal_id: string | null;
  cajero_nombre: string | null;
  ultima_actividad: string;
  activa: boolean;
}

type RangoFiltro = 'hoy' | '3d' | '7d' | 'custom';

const RANGO_OPCIONES: { id: RangoFiltro; label: string }[] = [
  { id: 'hoy', label: 'Hoy' },
  { id: '3d', label: '3 días' },
  { id: '7d', label: '7 días' },
  { id: 'custom', label: 'Personalizado' },
];

function inicioDeHoy(): Date {
  const ahora = new Date();
  return new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());
}

function formatoFechaInput(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Calcula el rango [inicio, fin) del periodo elegido y el rango equivalente
// inmediatamente anterior (misma duración) para poder mostrar el % de cambio
// en los anillos, igual que antes se comparaba "hoy" contra "ayer".
function calcularRangos(rango: RangoFiltro, customDesde: string, customHasta: string) {
  const hoy = inicioDeHoy();
  const finHoy = new Date(hoy.getTime() + 24 * 60 * 60 * 1000);

  if (rango === '3d' || rango === '7d') {
    const dias = rango === '3d' ? 3 : 7;
    const inicio = new Date(hoy.getTime() - (dias - 1) * 24 * 60 * 60 * 1000);
    const inicioAnterior = new Date(inicio.getTime() - dias * 24 * 60 * 60 * 1000);
    return { inicio, fin: finHoy, inicioAnterior, finAnterior: inicio };
  }
  if (rango === 'custom' && customDesde && customHasta) {
    const inicio = new Date(`${customDesde}T00:00:00`);
    const fin = new Date(new Date(`${customHasta}T00:00:00`).getTime() + 24 * 60 * 60 * 1000);
    const duracionMs = Math.max(fin.getTime() - inicio.getTime(), 24 * 60 * 60 * 1000);
    const inicioAnterior = new Date(inicio.getTime() - duracionMs);
    return { inicio, fin, inicioAnterior, finAnterior: inicio };
  }
  // 'hoy' (y fallback de 'custom' sin fechas elegidas aún)
  const inicioAnterior = new Date(hoy.getTime() - 24 * 60 * 60 * 1000);
  return { inicio: hoy, fin: finHoy, inicioAnterior, finAnterior: hoy };
}

function estaEnLinea(s: SesionFila): boolean {
  if (!s.activa) return false;
  return Date.now() - new Date(s.ultima_actividad).getTime() < 2 * 60 * 1000;
}

const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  show: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.05, duration: 0.35, ease: 'easeOut' } }),
};

export default function InicioPage() {
  const { empleado } = usePwaAuth();
  const navigate = useNavigate();
  const [ventasPeriodo, setVentasPeriodo] = useState<VentaFila[]>([]);
  const [ventasPeriodoAnterior, setVentasPeriodoAnterior] = useState<VentaFila[]>([]);
  const [utilidadNeta, setUtilidadNeta] = useState(0);
  const [devolucionesTotal, setDevolucionesTotal] = useState(0);
  const [devolucionesCount, setDevolucionesCount] = useState(0);
  const [gastosTotal, setGastosTotal] = useState(0);
  const [alertasCount, setAlertasCount] = useState(0);
  const [productosConMinimo, setProductosConMinimo] = useState(0);
  const [sesiones, setSesiones] = useState<SesionFila[]>([]);
  const [cargando, setCargando] = useState(true);
  const [rango, setRango] = useState<RangoFiltro>('hoy');
  const [customDesde, setCustomDesde] = useState(() => formatoFechaInput(inicioDeHoy()));
  const [customHasta, setCustomHasta] = useState(() => formatoFechaInput(inicioDeHoy()));
  const [sucursalSeleccionada, setSucursalSeleccionada] = useState<string | null>(null);

  const esAdmin = !!empleado && ['admin', 'super_usuario'].includes(empleado.rol);
  const { tieneModulo } = useModulosActivos();

  useEffect(() => {
    if (!empleado) return;
    let cancelado = false;

    const cargar = async () => {
      const client = getSupabaseClient();
      if (!client) return;

      const { inicio, fin, inicioAnterior, finAnterior } = calcularRangos(rango, customDesde, customHasta);

      // 🏬 Filtro por sucursal: cada caja física sube sus ventas con
      // terminal_id = su propio machine_id (ver useRegistrarInstalacion.ts).
      // Al elegir una sucursal, se traducen sus cajas asignadas a esa lista
      // de machine_id y se filtra por ahí -- "Todas" no aplica ningún filtro.
      // Un array vacío (sucursal elegida sin ninguna caja asignada todavía)
      // se resuelve con un terminal_id imposible en vez de mandar `.in([])`
      // a PostgREST, para no depender de cómo maneje esa librería el caso.
      const machineIdsSucursal = sucursalSeleccionada
        ? await machineIdsDeSucursal(empleado.cliente_id, sucursalSeleccionada)
        : null;
      const filtrarPorSucursal = <T,>(query: T): T => {
        if (!machineIdsSucursal) return query;
        const ids = machineIdsSucursal.length > 0 ? machineIdsSucursal : ['__sin_instalaciones_asignadas__'];
        return (query as any).in('terminal_id', ids);
      };

      const [{ data: periodoData }, { data: anteriorData }, { data: stockData }, { data: sesionesData }, { data: gastosData }, { data: devolucionesData }] = await Promise.all([
        filtrarPorSucursal(client.from('ventas').select('id, total, created_at')
          .eq('cliente_id', empleado.cliente_id).eq('estado', 'completada')
          .gte('created_at', inicio.toISOString()).lt('created_at', fin.toISOString())),
        filtrarPorSucursal(client.from('ventas').select('id, total, created_at')
          .eq('cliente_id', empleado.cliente_id).eq('estado', 'completada')
          .gte('created_at', inicioAnterior.toISOString()).lt('created_at', finAnterior.toISOString())),
        esAdmin
          ? client.from('productos').select('id, stock, stock_minimo').eq('cliente_id', empleado.cliente_id).eq('activo', true)
          : Promise.resolve({ data: [] as any[] }),
        esAdmin
          ? client.from('sesiones_activas').select('id, terminal_nombre, terminal_id, cajero_nombre, ultima_actividad, activa')
              .eq('cliente_id', empleado.cliente_id).order('ultima_actividad', { ascending: false })
          : Promise.resolve({ data: [] as any[] }),
        esAdmin
          ? client.from('gastos').select('monto, fecha').eq('cliente_id', empleado.cliente_id)
              .gte('fecha', inicio.toISOString()).lt('fecha', fin.toISOString())
          : Promise.resolve({ data: [] as any[] }),
        client.from('devoluciones').select('total_devolucion, created_at').eq('cliente_id', empleado.cliente_id)
          .gte('created_at', inicio.toISOString()).lt('created_at', fin.toISOString()),
      ]);

      if (cancelado) return;
      const ventasLista = (periodoData as VentaFila[]) || [];
      setVentasPeriodo(ventasLista);
      setVentasPeriodoAnterior((anteriorData as VentaFila[]) || []);
      const productos = ((stockData as any[]) || []).filter((p) => p.stock_minimo != null);
      setProductosConMinimo(productos.length);
      setAlertasCount(productos.filter((p) => p.stock <= p.stock_minimo).length);
      setSesiones((sesionesData as SesionFila[]) || []);
      const devolucionesLista = (devolucionesData as { total_devolucion: number }[]) || [];
      const devTotal = devolucionesLista.reduce((a, d) => a + Number(d.total_devolucion), 0);
      setDevolucionesTotal(devTotal);
      setDevolucionesCount(devolucionesLista.length);
      setGastosTotal(esAdmin ? ((gastosData as { monto: number }[]) || []).reduce((a, g) => a + Number(g.monto), 0) : 0);

      // 🛡️ FIX: coincidir con el Dashboard de Electron — ahí la utilidad neta
      // resta también los gastos del período (no solo el costo de lo
      // vendido), y "ventas" se muestra neto de devoluciones. Antes esta
      // pantalla omitía ambas restas, así que los números nunca cuadraban
      // con Electron aunque fueran el mismo negocio y el mismo período.
      if (esAdmin && ventasLista.length > 0) {
        const ventaIds = ventasLista.map((v) => v.id);
        const { data: itemsData } = await client.from('venta_items').select('producto_id, cantidad').in('venta_id', ventaIds);
        const items = (itemsData as { producto_id: string | null; cantidad: number }[]) || [];
        const productoIds = Array.from(new Set(items.map((i) => i.producto_id).filter(Boolean))) as string[];
        const costosPorProducto = new Map<string, number>();
        if (productoIds.length > 0) {
          const { data: prodsData } = await client.from('productos').select('id, costo').in('id', productoIds);
          for (const p of (prodsData as { id: string; costo: number }[]) || []) costosPorProducto.set(p.id, Number(p.costo) || 0);
        }
        const costoTotal = items.reduce((a, i) => a + (costosPorProducto.get(i.producto_id || '') || 0) * Number(i.cantidad), 0);
        const gastosDelPeriodo = ((gastosData as { monto: number }[]) || []).reduce((a, g) => a + Number(g.monto), 0);
        const totalVentas = ventasLista.reduce((a, v) => a + Number(v.total), 0);
        if (!cancelado) setUtilidadNeta(totalVentas - devTotal - costoTotal - gastosDelPeriodo);
      } else if (esAdmin) {
        setUtilidadNeta(0);
      }

      setCargando(false);
    };

    cargar();
    const interval = window.setInterval(cargar, 30000);
    return () => { cancelado = true; window.clearInterval(interval); };
  }, [empleado?.cliente_id, esAdmin, rango, customDesde, customHasta, sucursalSeleccionada]);

  const stats = useMemo(() => {
    const totalPeriodo = ventasPeriodo.reduce((a, v) => a + Number(v.total), 0);
    // Neto de devoluciones — así el anillo de "Ventas" coincide con el
    // número que Electron llama "Ingresos Netos" (bruto - devoluciones),
    // en vez de mostrar el bruto sin más.
    const totalPeriodoNeto = totalPeriodo - devolucionesTotal;
    const totalAnterior = ventasPeriodoAnterior.reduce((a, v) => a + Number(v.total), 0);
    const ticketProm = ventasPeriodo.length ? totalPeriodo / ventasPeriodo.length : 0;
    const pctVentasVsAnterior = totalAnterior > 0 ? Math.min(100, (totalPeriodo / totalAnterior) * 100) : totalPeriodo > 0 ? 100 : 0;
    const pctTransaccionesVsAnterior = ventasPeriodoAnterior.length > 0 ? Math.min(100, (ventasPeriodo.length / ventasPeriodoAnterior.length) * 100) : ventasPeriodo.length > 0 ? 100 : 0;
    const pctInventarioSano = productosConMinimo > 0 ? ((productosConMinimo - alertasCount) / productosConMinimo) * 100 : 100;
    // Proyección de cierre — igual que Electron: estima el total del día
    // según el ritmo de ventas transcurrido hasta ahora. Solo tiene sentido
    // para el rango 'hoy' (un periodo ya cerrado no se "proyecta").
    const ahora = new Date();
    const horasTranscurridas = Math.max(ahora.getHours() + ahora.getMinutes() / 60, 0.25);
    const proyeccionCierre = rango === 'hoy' ? (totalPeriodo / horasTranscurridas) * 24 : totalPeriodo;
    return { totalPeriodo, totalPeriodoNeto, ticketProm, cantidadPeriodo: ventasPeriodo.length, pctVentasVsAnterior, pctTransaccionesVsAnterior, pctInventarioSano, proyeccionCierre };
  }, [ventasPeriodo, ventasPeriodoAnterior, productosConMinimo, alertasCount, devolucionesTotal, rango]);

  // 🛡️ Paridad con Electron (DashboardPOSPage): allá "Total Ventas Netas" es
  // la CANTIDAD de ventas (KpiCard con estadisticas.totalVentas) y el monto
  // en dinero se llama "Ingresos Netos" — dos cosas distintas. Antes acá el
  // anillo llamado "Ventas" mostraba el monto y el de la cantidad se llamaba
  // "Transacciones", así que el dueño del negocio veía nombres distintos
  // para el mismo concepto entre el celular y el computador.
  const etiquetaIngresos = rango === 'hoy' ? 'Ingresos hoy' : rango === '3d' ? 'Ingresos 3 días' : rango === '7d' ? 'Ingresos 7 días' : 'Ingresos del periodo';
  const etiquetaVentas = rango === 'hoy' ? 'Ventas hoy' : 'Ventas del periodo';

  const primerNombre = (empleado?.nombre_completo || '').split(' ')[0];
  const hora = new Date().getHours();
  const saludo = hora < 12 ? 'Buenos días' : hora < 19 ? 'Buenas tardes' : 'Buenas noches';

  return (
    <div className="w-full min-h-[100dvh] bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950">
      <div className="px-5 pt-8 pb-5">
        <p className="text-slate-400 text-sm">{saludo},</p>
        <h1 className="text-white text-2xl font-black">{primerNombre || 'bienvenido'} 👋</h1>
      </div>

      {esAdmin && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="mx-5 mb-6 bg-slate-900/40 rounded-3xl pt-4 pb-6 border border-slate-800/60"
        >
          <div className="flex items-center gap-1.5 px-4 mb-4 overflow-x-auto">
            {RANGO_OPCIONES.map((op) => (
              <button
                key={op.id}
                onClick={() => setRango(op.id)}
                className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
                  rango === op.id
                    ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/30'
                    : 'bg-slate-800/80 text-slate-400 border border-slate-700 hover:bg-slate-900'
                }`}
              >
                {op.label}
              </button>
            ))}
          </div>

          {rango === 'custom' && (
            <div className="flex items-center gap-2 px-4 mb-4">
              <div className="flex-1 flex items-center gap-1.5 bg-slate-950/60 border border-slate-700 rounded-xl px-2.5 h-9">
                <Calendar className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                <input
                  type="date"
                  value={customDesde}
                  max={customHasta}
                  onChange={(e) => setCustomDesde(e.target.value)}
                  className="bg-transparent text-white text-xs w-full outline-none"
                />
              </div>
              <span className="text-slate-600 text-xs">a</span>
              <div className="flex-1 flex items-center gap-1.5 bg-slate-950/60 border border-slate-700 rounded-xl px-2.5 h-9">
                <Calendar className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                <input
                  type="date"
                  value={customHasta}
                  min={customDesde}
                  max={formatoFechaInput(inicioDeHoy())}
                  onChange={(e) => setCustomHasta(e.target.value)}
                  className="bg-transparent text-white text-xs w-full outline-none"
                />
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 px-4">
            <RingStat
              label="Utilidad neta"
              value={`$${Math.round(utilidadNeta).toLocaleString('es-CO')}`}
              pct={100}
              colorFrom={utilidadNeta >= 0 ? '#34d399' : '#f87171'}
              colorTo={utilidadNeta >= 0 ? '#059669' : '#dc2626'}
              size={108}
              onClick={() => navigate('/dashboard')}
            />
            <RingStat
              label={etiquetaIngresos}
              value={`$${Math.round(stats.totalPeriodoNeto).toLocaleString('es-CO')}`}
              pct={stats.pctVentasVsAnterior}
              colorFrom="#38bdf8"
              colorTo="#0284c7"
              size={108}
              onClick={() => navigate('/ventas')}
            />
            <RingStat
              label={etiquetaVentas}
              value={String(stats.cantidadPeriodo)}
              pct={stats.pctTransaccionesVsAnterior}
              colorFrom="#a78bfa"
              colorTo="#7c3aed"
              size={108}
              onClick={() => navigate('/ventas')}
            />
            <RingStat
              label="Alertas de stock"
              value={String(alertasCount)}
              pct={stats.pctInventarioSano}
              colorFrom={alertasCount > 0 ? '#f87171' : '#fbbf24'}
              colorTo={alertasCount > 0 ? '#dc2626' : '#d97706'}
              size={108}
              onClick={() => navigate('/alertas')}
            />
          </div>

          {empleado && (
            <SucursalSelector
              clienteId={empleado.cliente_id}
              esAdmin={esAdmin}
              sucursalSeleccionada={sucursalSeleccionada}
              onSeleccionar={setSucursalSeleccionada}
            />
          )}

          {/* 🖥️ Solo escritorio (lg+): el "control total" que pidió el dueño
              del negocio — mismos números que ya calcula Electron, en
              tarjetas planas en vez de anillos (más fáciles de escanear
              cuando hay muchas). El celular no cambia: sigue mostrando solo
              los 4 anillos de arriba. */}
          <div className="hidden lg:grid grid-cols-3 xl:grid-cols-4 gap-3 px-4 mt-6">
            <KpiCardDesktop icon={DollarSign} label="Ingresos brutos" value={`$${Math.round(stats.totalPeriodo).toLocaleString('es-CO')}`} color="sky" />
            <KpiCardDesktop icon={TrendingUp} label="Ingresos netos" value={`$${Math.round(stats.totalPeriodoNeto).toLocaleString('es-CO')}`} color="emerald" />
            <KpiCardDesktop icon={Receipt} label="Ticket promedio" value={`$${Math.round(stats.ticketProm).toLocaleString('es-CO')}`} color="purple" />
            {rango === 'hoy' && (
              <KpiCardDesktop icon={Target} label="Proyección de cierre" value={`$${Math.round(stats.proyeccionCierre).toLocaleString('es-CO')}`} color="amber" />
            )}
            <KpiCardDesktop icon={RotateCcw} label="Devoluciones (monto)" value={`$${Math.round(devolucionesTotal).toLocaleString('es-CO')}`} color="red" />
            <KpiCardDesktop icon={RotateCcw} label="Devoluciones (n°)" value={String(devolucionesCount)} color="red" />
            <KpiCardDesktop icon={Wallet} label="Gastos" value={`$${Math.round(gastosTotal).toLocaleString('es-CO')}`} color="amber" />
          </div>
        </motion.div>
      )}

      {/* Accesos rápidos */}
      <div className="px-5 mb-6">
        <h2 className="text-slate-400 text-xs font-bold uppercase tracking-wide mb-3">Accesos rápidos</h2>
        <div className="grid grid-cols-2 gap-3">
          <QuickLink icon={Package} label="Inventario" color="sky" onClick={() => navigate('/inventario')} />
          {tieneModulo(ModuloPOS.CIERRE_CAJA) && <QuickLink icon={Lock} label="Caja" color="emerald" onClick={() => navigate('/caja')} />}
          {tieneModulo(ModuloPOS.GASTOS) && <QuickLink icon={Wallet} label="Gastos" color="red" onClick={() => navigate('/gastos')} />}
          {tieneModulo(ModuloPOS.DEVOLUCIONES) && <QuickLink icon={RotateCcw} label="Devoluciones" color="amber" onClick={() => navigate('/devoluciones')} />}
          {esAdmin && <QuickLink icon={Settings} label="Configuración" color="purple" onClick={() => navigate('/configuracion')} />}
        </div>
      </div>

      {esAdmin && sesiones.length > 0 && (
        <div className="px-5">
          <div className="flex items-center gap-2 mb-3">
            <Users className="w-4 h-4 text-amber-400" />
            <h2 className="text-slate-400 text-xs font-bold uppercase tracking-wide">Empleados</h2>
          </div>
          <div className="w-full space-y-2">
            {sesiones.map((s, i) => (
              <motion.div
                key={s.id}
                custom={i}
                initial="hidden"
                animate="show"
                variants={fadeUp}
                className="bg-slate-900/70 backdrop-blur border border-slate-800 rounded-xl p-3 flex items-center justify-between"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Circle className={`w-2.5 h-2.5 shrink-0 ${estaEnLinea(s) ? 'text-emerald-400 fill-emerald-400' : 'text-slate-600 fill-slate-600'}`} />
                  <div className="min-w-0">
                    <p className="text-white font-semibold text-sm truncate">{s.cajero_nombre || 'Sin sesión'}</p>
                    <p className="text-slate-500 text-xs">{s.terminal_nombre || s.terminal_id}</p>
                  </div>
                </div>
                <span className={`text-xs font-bold shrink-0 ${estaEnLinea(s) ? 'text-emerald-400' : 'text-slate-500'}`}>
                  {estaEnLinea(s) ? 'En línea' : 'Desconectado'}
                </span>
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {!cargando && !esAdmin && (
        <div className="px-5">
          <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-6 text-center">
            <p className="text-white font-semibold mb-1">Listo para vender</p>
            <p className="text-slate-400 text-sm">Usa el botón CODEC de abajo para iniciar una venta.</p>
          </div>
        </div>
      )}
    </div>
  );
}

const QUICKLINK_COLORS: Record<string, { bg: string; text: string }> = {
  sky: { bg: 'bg-sky-500/15', text: 'text-sky-400' },
  purple: { bg: 'bg-purple-500/15', text: 'text-purple-400' },
  emerald: { bg: 'bg-emerald-500/15', text: 'text-emerald-400' },
  red: { bg: 'bg-red-500/15', text: 'text-red-400' },
  amber: { bg: 'bg-amber-500/15', text: 'text-amber-400' },
};

function QuickLink({ icon: Icon, label, color, onClick }: { icon: any; label: string; color: string; onClick: () => void }) {
  const c = QUICKLINK_COLORS[color] || QUICKLINK_COLORS.sky;
  return (
    <button
      onClick={onClick}
      className="w-full bg-slate-900/70 backdrop-blur border border-slate-800 rounded-2xl p-4 flex items-center justify-between active:scale-[0.98] transition-transform"
    >
      <div className="flex items-center gap-3">
        <div className={`w-9 h-9 rounded-lg ${c.bg} flex items-center justify-center`}>
          <Icon className={`w-4 h-4 ${c.text}`} />
        </div>
        <span className="text-white font-semibold text-sm">{label}</span>
      </div>
      <ChevronRight className="w-4 h-4 text-slate-500" />
    </button>
  );
}

function KpiCardDesktop({ icon: Icon, label, value, color }: { icon: any; label: string; value: string; color: string }) {
  const c = QUICKLINK_COLORS[color] || QUICKLINK_COLORS.sky;
  return (
    <div className="bg-slate-900/70 backdrop-blur border border-slate-800 rounded-2xl p-4">
      <div className={`w-8 h-8 rounded-lg ${c.bg} flex items-center justify-center mb-2`}>
        <Icon className={`w-4 h-4 ${c.text}`} />
      </div>
      <p className="text-white text-lg font-black leading-tight truncate">{value}</p>
      <p className="text-slate-500 text-xs font-semibold">{label}</p>
    </div>
  );
}
