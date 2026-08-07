import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { motion } from 'motion/react';
import { TrendingUp, ShoppingCart, Receipt, AlertTriangle, Package, Settings, Users, Circle, ChevronRight, Wallet, RotateCcw, Lock } from 'lucide-react';
import { getSupabaseClient } from '../../app/lib/supabase/config';
import { usePwaAuth } from '../contexts/PwaAuthContext';
import { useModulosActivos } from '../hooks/useModulosActivos';
import { ModuloPOS } from '../../app/lib/permissions';
import { RingStat } from '../components/RingStat';

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

function inicioDeHoy(): Date {
  const ahora = new Date();
  return new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());
}

function inicioDeAyer(): Date {
  const hoy = inicioDeHoy();
  return new Date(hoy.getTime() - 24 * 60 * 60 * 1000);
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
  const [ventasHoy, setVentasHoy] = useState<VentaFila[]>([]);
  const [ventasAyer, setVentasAyer] = useState<VentaFila[]>([]);
  const [alertasCount, setAlertasCount] = useState(0);
  const [productosConMinimo, setProductosConMinimo] = useState(0);
  const [sesiones, setSesiones] = useState<SesionFila[]>([]);
  const [cargando, setCargando] = useState(true);

  const esAdmin = !!empleado && ['admin', 'super_usuario'].includes(empleado.rol);
  const { tieneModulo } = useModulosActivos();

  useEffect(() => {
    if (!empleado) return;
    let cancelado = false;

    const cargar = async () => {
      const client = getSupabaseClient();
      if (!client) return;

      const [{ data: hoyData }, { data: ayerData }, { data: stockData }, { data: sesionesData }] = await Promise.all([
        client.from('ventas').select('id, total, created_at')
          .eq('cliente_id', empleado.cliente_id).eq('estado', 'completada')
          .gte('created_at', inicioDeHoy().toISOString()),
        client.from('ventas').select('id, total, created_at')
          .eq('cliente_id', empleado.cliente_id).eq('estado', 'completada')
          .gte('created_at', inicioDeAyer().toISOString()).lt('created_at', inicioDeHoy().toISOString()),
        esAdmin
          ? client.from('productos').select('id, stock, stock_minimo').eq('cliente_id', empleado.cliente_id).eq('activo', true)
          : Promise.resolve({ data: [] as any[] }),
        esAdmin
          ? client.from('sesiones_activas').select('id, terminal_nombre, terminal_id, cajero_nombre, ultima_actividad, activa')
              .eq('cliente_id', empleado.cliente_id).order('ultima_actividad', { ascending: false })
          : Promise.resolve({ data: [] as any[] }),
      ]);

      if (cancelado) return;
      setVentasHoy((hoyData as VentaFila[]) || []);
      setVentasAyer((ayerData as VentaFila[]) || []);
      const productos = ((stockData as any[]) || []).filter((p) => p.stock_minimo != null);
      setProductosConMinimo(productos.length);
      setAlertasCount(productos.filter((p) => p.stock <= p.stock_minimo).length);
      setSesiones((sesionesData as SesionFila[]) || []);
      setCargando(false);
    };

    cargar();
    const interval = window.setInterval(cargar, 30000);
    return () => { cancelado = true; window.clearInterval(interval); };
  }, [empleado?.cliente_id, esAdmin]);

  const stats = useMemo(() => {
    const totalHoy = ventasHoy.reduce((a, v) => a + Number(v.total), 0);
    const totalAyer = ventasAyer.reduce((a, v) => a + Number(v.total), 0);
    const cambioVentas = totalAyer > 0 ? ((totalHoy - totalAyer) / totalAyer) * 100 : totalHoy > 0 ? 100 : 0;
    const ticketProm = ventasHoy.length ? totalHoy / ventasHoy.length : 0;
    const cambioTransacciones = ventasHoy.length - ventasAyer.length;
    const pctVentasVsAyer = totalAyer > 0 ? Math.min(100, (totalHoy / totalAyer) * 100) : totalHoy > 0 ? 100 : 0;
    const pctTransaccionesVsAyer = ventasAyer.length > 0 ? Math.min(100, (ventasHoy.length / ventasAyer.length) * 100) : ventasHoy.length > 0 ? 100 : 0;
    const pctInventarioSano = productosConMinimo > 0 ? ((productosConMinimo - alertasCount) / productosConMinimo) * 100 : 100;
    return { totalHoy, cambioVentas, ticketProm, cambioTransacciones, cantidadHoy: ventasHoy.length, pctVentasVsAyer, pctTransaccionesVsAyer, pctInventarioSano };
  }, [ventasHoy, ventasAyer, productosConMinimo, alertasCount]);

  const primerNombre = (empleado?.nombre_completo || '').split(' ')[0];
  const hora = new Date().getHours();
  const saludo = hora < 12 ? 'Buenos días' : hora < 19 ? 'Buenas tardes' : 'Buenas noches';

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 pb-24">
      <div className="px-5 pt-8 pb-5">
        <p className="text-slate-400 text-sm">{saludo},</p>
        <h1 className="text-white text-2xl font-black">{primerNombre || 'bienvenido'} 👋</h1>
      </div>

      {esAdmin && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="mx-5 mb-6 grid grid-cols-3 gap-2 bg-slate-900/40 rounded-3xl py-5 border border-slate-800/60"
        >
          <RingStat label="Ventas vs. ayer" value={`$${stats.totalHoy.toLocaleString('es-CO')}`} pct={stats.pctVentasVsAyer} colorFrom="#34d399" colorTo="#059669" size={92} />
          <RingStat label="Transacciones vs. ayer" value={String(stats.cantidadHoy)} pct={stats.pctTransaccionesVsAyer} colorFrom="#38bdf8" colorTo="#0284c7" size={92} />
          <RingStat label="Inventario sano" value={`${Math.round(stats.pctInventarioSano)}%`} pct={stats.pctInventarioSano} colorFrom={stats.pctInventarioSano < 70 ? '#f87171' : '#fbbf24'} colorTo={stats.pctInventarioSano < 70 ? '#dc2626' : '#d97706'} size={92} />
        </motion.div>
      )}

      {esAdmin && (
        <div className="px-5 mb-6 grid grid-cols-2 gap-3">
          {[
            {
              label: 'Ventas hoy', icon: TrendingUp, iconBg: 'bg-emerald-500/15', iconColor: 'text-emerald-400',
              value: `$${stats.totalHoy.toLocaleString('es-CO')}`,
              trend: stats.cambioVentas, trendSuffix: '%',
            },
            {
              label: 'Transacciones', icon: ShoppingCart, iconBg: 'bg-sky-500/15', iconColor: 'text-sky-400',
              value: String(stats.cantidadHoy),
              trend: stats.cambioTransacciones, trendSuffix: '',
            },
            {
              label: 'Ticket promedio', icon: Receipt, iconBg: 'bg-purple-500/15', iconColor: 'text-purple-400',
              value: `$${Math.round(stats.ticketProm).toLocaleString('es-CO')}`,
              trend: null, trendSuffix: '',
            },
            {
              label: 'Alertas', icon: AlertTriangle, iconBg: 'bg-amber-500/15', iconColor: 'text-amber-400',
              value: String(alertasCount),
              trend: null, trendSuffix: '', danger: alertasCount > 0,
            },
          ].map((kpi, i) => (
            <motion.div
              key={kpi.label}
              custom={i}
              initial="hidden"
              animate="show"
              variants={fadeUp}
              onClick={() => kpi.label === 'Alertas' && navigate('/alertas')}
              className={`bg-slate-900/70 backdrop-blur border border-slate-800 rounded-2xl p-4 ${kpi.label === 'Alertas' ? 'cursor-pointer active:scale-[0.98] transition-transform' : ''}`}
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-slate-400 text-[10px] font-bold uppercase tracking-wide">{kpi.label}</span>
                <div className={`w-7 h-7 rounded-lg ${kpi.iconBg} flex items-center justify-center`}>
                  <kpi.icon className={`w-3.5 h-3.5 ${kpi.iconColor}`} />
                </div>
              </div>
              <p className={`text-xl font-black ${kpi.danger ? 'text-red-400' : 'text-white'}`}>{kpi.value}</p>
              {kpi.trend !== null && (
                <p className={`text-xs mt-1 font-semibold ${kpi.trend >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {kpi.trend >= 0 ? '↑' : '↓'} {Math.abs(kpi.trend).toFixed(kpi.trendSuffix === '%' ? 1 : 0)}{kpi.trendSuffix}
                </p>
              )}
            </motion.div>
          ))}
        </div>
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
          <div className="space-y-2">
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
      className="bg-slate-900/70 backdrop-blur border border-slate-800 rounded-2xl p-4 flex items-center justify-between active:scale-[0.98] transition-transform"
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
