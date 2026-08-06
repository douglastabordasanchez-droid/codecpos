import { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router';
import { BarChart3, Users, Archive, TrendingUp, Circle, Share2, Loader2, Receipt } from 'lucide-react';
import { getSupabaseClient } from '../../app/lib/supabase/config';
import { usePwaAuth } from '../contexts/PwaAuthContext';
import { compartirRecibo } from '../lib/compartirFactura';

type Rango = 'hoy' | '7dias' | 'mes';

interface VentaFila {
  id: string;
  numero: number | null;
  total: number;
  metodo_pago: string | null;
  cajero_nombre: string | null;
  created_at: string;
}

interface SesionFila {
  id: string;
  terminal_id: string | null;
  terminal_nombre: string | null;
  cajero_nombre: string | null;
  ultima_actividad: string;
  activa: boolean;
}

interface CierreFila {
  id: string;
  terminal_id: string | null;
  fecha_cierre: string | null;
  monto_cierre: number;
  ventas_total: number;
  diferencia: number;
  detalle: any;
}

const RANGOS: { valor: Rango; label: string }[] = [
  { valor: 'hoy', label: 'Hoy' },
  { valor: '7dias', label: '7 días' },
  { valor: 'mes', label: 'Mes' },
];

function inicioDeRango(rango: Rango): Date {
  const ahora = new Date();
  if (rango === 'hoy') {
    return new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());
  }
  if (rango === '7dias') {
    const d = new Date(ahora);
    d.setDate(d.getDate() - 7);
    return d;
  }
  return new Date(ahora.getFullYear(), ahora.getMonth(), 1);
}

// Una sesión se considera "en línea" si tuvo actividad en los últimos 2
// minutos — el heartbeat de syncService late cada 30s, así que un par de
// ciclos perdidos ya se ve como desconectada en vez de esperar indefinido.
function estaEnLinea(sesion: SesionFila): boolean {
  if (!sesion.activa) return false;
  return Date.now() - new Date(sesion.ultima_actividad).getTime() < 2 * 60 * 1000;
}

export default function DashboardPage() {
  const { empleado } = usePwaAuth();
  const [rango, setRango] = useState<Rango>('hoy');
  const [ventas, setVentas] = useState<VentaFila[]>([]);
  const [sesiones, setSesiones] = useState<SesionFila[]>([]);
  const [cierres, setCierres] = useState<CierreFila[]>([]);
  const [cargando, setCargando] = useState(true);
  const [compartiendoId, setCompartiendoId] = useState<string | null>(null);
  const [errorCompartir, setErrorCompartir] = useState<string | null>(null);

  const puedeVerDashboard = empleado && ['admin', 'super_usuario'].includes(empleado.rol);

  useEffect(() => {
    if (!empleado || !puedeVerDashboard) return;
    let cancelado = false;

    const cargar = async () => {
      setCargando(true);
      const client = getSupabaseClient();
      if (!client) {
        setCargando(false);
        return;
      }

      const desde = inicioDeRango(rango).toISOString();

      const [{ data: ventasData }, { data: sesionesData }, { data: cierresData }] = await Promise.all([
        client
          .from('ventas')
          .select('id, numero, total, metodo_pago, cajero_nombre, created_at')
          .eq('cliente_id', empleado.cliente_id)
          .eq('estado', 'completada')
          .gte('created_at', desde)
          .order('created_at', { ascending: false }),
        client
          .from('sesiones_activas')
          .select('id, terminal_id, terminal_nombre, cajero_nombre, ultima_actividad, activa')
          .eq('cliente_id', empleado.cliente_id)
          .order('ultima_actividad', { ascending: false }),
        client
          .from('cierres_caja')
          .select('id, terminal_id, fecha_cierre, monto_cierre, ventas_total, diferencia, detalle')
          .eq('cliente_id', empleado.cliente_id)
          .order('fecha_cierre', { ascending: false })
          .limit(10),
      ]);

      if (cancelado) return;
      setVentas((ventasData as VentaFila[]) || []);
      setSesiones((sesionesData as SesionFila[]) || []);
      setCierres((cierresData as CierreFila[]) || []);
      setCargando(false);
    };

    cargar();
    const interval = window.setInterval(cargar, 30000);
    return () => {
      cancelado = true;
      window.clearInterval(interval);
    };
  }, [empleado?.cliente_id, rango, puedeVerDashboard]);

  const resumen = useMemo(() => {
    const total = ventas.reduce((acc, v) => acc + Number(v.total), 0);
    return { total, cantidad: ventas.length, ticketPromedio: ventas.length ? total / ventas.length : 0 };
  }, [ventas]);

  const handleCompartir = async (venta: VentaFila) => {
    if (!empleado || compartiendoId) return;
    setCompartiendoId(venta.id);
    setErrorCompartir(null);
    const resultado = await compartirRecibo(empleado.cliente_id, venta);
    setCompartiendoId(null);
    if (!resultado.ok) {
      setErrorCompartir(resultado.error || 'No se pudo compartir la factura');
    }
  };

  if (!empleado) return null;
  if (!puedeVerDashboard) return <Navigate to="/" replace />;

  return (
    <div className="min-h-screen bg-orange-50 pb-24">
      <div className="px-5 pt-8 pb-4">
        <h1 className="text-slate-900 text-xl font-black">Panel Admin</h1>
        <p className="text-slate-400 text-sm">Reportes, empleados y cierres en tiempo real</p>
      </div>

      <div className="px-5 mb-5 flex gap-2">
        {RANGOS.map((r) => (
          <button
            key={r.valor}
            onClick={() => setRango(r.valor)}
            className={`h-9 px-4 rounded-full text-xs font-bold transition-all ${
              rango === r.valor ? 'bg-amber-500 text-white' : 'bg-white border border-orange-100 text-slate-500'
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>

      <div className="px-5 mb-6">
        <div className="bg-white border border-orange-100 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="w-4 h-4 text-emerald-600" />
            <span className="text-slate-400 text-xs font-bold uppercase tracking-wide">Ventas del período</span>
          </div>
          <p className="text-slate-900 text-3xl font-black">${resumen.total.toLocaleString('es-CO')}</p>
          <div className="flex gap-4 mt-3 text-xs text-slate-400">
            <span>{resumen.cantidad} ventas</span>
            <span>Ticket prom. ${Math.round(resumen.ticketPromedio).toLocaleString('es-CO')}</span>
          </div>
        </div>
      </div>

      <div className="px-5 mb-6">
        <div className="flex items-center gap-2 mb-3">
          <Receipt className="w-4 h-4 text-emerald-600" />
          <h2 className="text-slate-400 text-xs font-bold uppercase tracking-wide">Ventas recientes</h2>
        </div>
        <div className="space-y-2">
          {!cargando && ventas.length === 0 && (
            <p className="text-slate-400 text-sm text-center py-4">Sin ventas en este período</p>
          )}
          {ventas.slice(0, 15).map((v) => (
            <div key={v.id} className="bg-white border border-orange-100 rounded-xl p-3 flex items-center justify-between">
              <div className="min-w-0">
                <p className="text-slate-900 font-semibold text-sm truncate">
                  #{v.numero ?? v.id.slice(0, 6)} <span className="text-slate-500 font-normal capitalize">· {v.metodo_pago || 'N/A'}</span>
                </p>
                <p className="text-slate-500 text-xs">
                  {new Date(v.created_at).toLocaleString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  {v.cajero_nombre ? ` · ${v.cajero_nombre}` : ''}
                </p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className="text-slate-900 font-bold text-sm">${Number(v.total).toLocaleString('es-CO')}</span>
                <button
                  onClick={() => handleCompartir(v)}
                  disabled={compartiendoId === v.id}
                  className="h-8 w-8 rounded-full bg-orange-100 flex items-center justify-center text-orange-700 disabled:opacity-50"
                  aria-label="Compartir factura"
                >
                  {compartiendoId === v.id ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Share2 className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>
        {errorCompartir && <p className="text-red-500 text-xs text-center mt-2">{errorCompartir}</p>}
      </div>

      <div className="px-5 mb-6">
        <div className="flex items-center gap-2 mb-3">
          <Users className="w-4 h-4 text-amber-500" />
          <h2 className="text-slate-400 text-xs font-bold uppercase tracking-wide">Empleados</h2>
        </div>
        <div className="space-y-2">
          {sesiones.length === 0 && (
            <p className="text-slate-400 text-sm text-center py-4">Sin actividad de caja registrada</p>
          )}
          {sesiones.map((s) => (
            <div key={s.id} className="bg-white border border-orange-100 rounded-xl p-3 flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <Circle
                  className={`w-2.5 h-2.5 shrink-0 ${estaEnLinea(s) ? 'text-emerald-500 fill-emerald-500' : 'text-slate-300 fill-slate-300'}`}
                />
                <div className="min-w-0">
                  <p className="text-slate-900 font-semibold text-sm truncate">{s.cajero_nombre || 'Sin sesión'}</p>
                  <p className="text-slate-500 text-xs">{s.terminal_nombre || s.terminal_id}</p>
                </div>
              </div>
              <span className={`text-xs font-bold shrink-0 ${estaEnLinea(s) ? 'text-emerald-600' : 'text-slate-400'}`}>
                {estaEnLinea(s) ? 'En línea' : 'Desconectado'}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="px-5">
        <div className="flex items-center gap-2 mb-3">
          <Archive className="w-4 h-4 text-sky-600" />
          <h2 className="text-slate-400 text-xs font-bold uppercase tracking-wide">Cierres recientes</h2>
        </div>
        <div className="space-y-2">
          {!cargando && cierres.length === 0 && (
            <p className="text-slate-400 text-sm text-center py-4">Sin cierres registrados todavía</p>
          )}
          {cierres.map((c) => {
            const diferencia = Number(c.diferencia);
            return (
              <div key={c.id} className="bg-white border border-orange-100 rounded-xl p-3">
                <div className="flex items-center justify-between">
                  <p className="text-slate-900 font-semibold text-sm">
                    {c.fecha_cierre ? new Date(c.fecha_cierre).toLocaleDateString('es-CO', { day: '2-digit', month: 'short' }) : '—'}
                    <span className="text-slate-500 font-normal"> · {c.detalle?.cajero_nombre || c.terminal_id}</span>
                  </p>
                  <span
                    className={`text-xs font-bold ${
                      diferencia === 0 ? 'text-emerald-600' : diferencia > 0 ? 'text-sky-600' : 'text-red-500'
                    }`}
                  >
                    {diferencia === 0 ? 'Cuadrado' : diferencia > 0 ? `+$${diferencia.toLocaleString('es-CO')}` : `-$${Math.abs(diferencia).toLocaleString('es-CO')}`}
                  </span>
                </div>
                <div className="flex gap-4 mt-1 text-xs text-slate-500">
                  <span>Ventas: ${Number(c.ventas_total).toLocaleString('es-CO')}</span>
                  <span>Cierre: ${Number(c.monto_cierre).toLocaleString('es-CO')}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {cargando && ventas.length === 0 && (
        <div className="flex items-center justify-center gap-2 text-slate-500 text-sm py-6">
          <BarChart3 className="w-4 h-4 animate-pulse" /> Cargando panel...
        </div>
      )}
    </div>
  );
}
