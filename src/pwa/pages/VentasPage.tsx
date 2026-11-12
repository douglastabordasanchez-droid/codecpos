import { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { Search, Share2, Loader2, Receipt, Eye, RotateCcw } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { Input } from '../../app/components/ui/input';
import { getSupabaseClient } from '../../app/lib/supabase/config';
import { usePwaAuth } from '../contexts/PwaAuthContext';
import { soloAgregar } from '../lib/restriccionesEmpleado';
import { compartirRecibo, obtenerDatosFactura } from '../lib/compartirFactura';
import { ModalVistaFactura } from '../../app/components/factura/ModalVistaFactura';
import { precargarVisorPdf } from '../../app/lib/pdfVista';
import { SucursalFiltro } from '../components/SucursalFiltro';
import { getSucursalActiva, suscribirSucursalActiva } from '../lib/sucursalActiva';
import { numeroVisibleVenta } from '../../app/lib/numeracionCaja';
import { traerTodo } from '../lib/nubeConsultas';
import { ventaSinPropina } from '../../app/lib/propinas';
import { EmpleadoSelector, ResumenEmpleados } from '../components/EmpleadoFiltro';
import { FILTRO_TIENDA_PRINCIPAL, claveEmpleado, filtrarPorEmpleado, resumirPorEmpleado } from '../lib/ventasPorEmpleado';

interface VentaFila {
  id: string;
  numero: number | null;
  local_id: string | null;
  total: number;
  metodo_pago: string | null;
  cajero_nombre: string | null;
  propina: number | null;
  created_at: string;
}

type Periodo = 'hoy' | '7d' | '30d';
const PERIODOS: { id: Periodo; label: string; dias: number }[] = [
  { id: 'hoy', label: 'Hoy', dias: 1 },
  { id: '7d', label: '7 días', dias: 7 },
  { id: '30d', label: '30 días', dias: 30 },
];
const MOSTRAR = 150;

function desdePeriodo(p: Periodo): Date {
  const hoy = new Date();
  const dias = (PERIODOS.find((x) => x.id === p) ?? PERIODOS[0]).dias;
  return new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - (dias - 1));
}

const BADGE_METODO: Record<string, string> = {
  efectivo: 'bg-emerald-500/15 text-emerald-400',
  nequi: 'bg-purple-500/15 text-purple-400',
  daviplata: 'bg-red-500/15 text-red-400',
  tarjeta: 'bg-sky-500/15 text-sky-400',
  transferencia: 'bg-amber-500/15 text-amber-400',
};

const fadeUp = {
  hidden: { opacity: 0, y: 10 },
  show: (i: number) => ({ opacity: 1, y: 0, transition: { delay: Math.min(i, 10) * 0.03, duration: 0.3 } }),
};

export default function VentasPage() {
  const { empleado } = usePwaAuth();
  const esAdmin = !!empleado && ['admin', 'super_usuario'].includes(empleado.rol);
  const [sucursalActiva, setSucursalActivaLocal] = useState(getSucursalActiva());
  useEffect(() => suscribirSucursalActiva(() => setSucursalActivaLocal(getSucursalActiva())), []);
  const tiendaEfectiva = esAdmin ? (sucursalActiva?.id ?? undefined) : (empleado?.tienda_id ?? null);
  const [ventas, setVentas] = useState<VentaFila[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [compartiendoId, setCompartiendoId] = useState<string | null>(null);
  const [viendo, setViendo] = useState<VentaFila | null>(null);
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [periodo, setPeriodo] = useState<Periodo>(() => {
    const p = params.get('periodo');
    return p === '7d' || p === '30d' ? p : 'hoy';
  });
  const [empleadoSel, setEmpleadoSelState] = useState<string | null>(() => {
    const c = params.get('cajero');
    return c ? claveEmpleado(c) : null;
  });
  const setEmpleadoSel = (clave: string | null) => {
    setEmpleadoSelState(clave);
    const p = new URLSearchParams(params);
    if (clave) p.set('cajero', clave); else p.delete('cajero');
    setParams(p, { replace: true });
  };

  useEffect(() => {
    if (!empleado) return;
    const client = getSupabaseClient();
    if (!client) return;
    setCargando(true);
    setErrorCarga(null);
    let cancelado = false;
    const desde = desdePeriodo(periodo).toISOString();
    // Todo el periodo, no solo las últimas 100: los totales por empleado deben cuadrar.
    traerTodo<VentaFila>((a, b) => {
      let query = client
        .from('ventas')
        .select('id, numero, local_id, total, propina, metodo_pago, cajero_nombre, created_at')
        .eq('cliente_id', empleado.cliente_id)
        .eq('estado', 'completada')
        .gte('created_at', desde);
      if (tiendaEfectiva !== undefined) {
        query = (!tiendaEfectiva || tiendaEfectiva === 'tienda_principal')
          ? query.or(FILTRO_TIENDA_PRINCIPAL)
          : query.or(`tienda_id.eq.${tiendaEfectiva},tienda_id.is.null`);
      }
      return query.order('created_at', { ascending: false }).order('id').range(a, b);
    }).then((data) => {
      if (cancelado) return;
      setVentas(data);
      setCargando(false);
    }, (error) => {
      if (cancelado) return;
      console.error('[ventas] Error cargando ventas:', error);
      setVentas([]);
      setErrorCarga('No se pudieron cargar las ventas. Cierra sesión y vuelve a entrar.');
      setCargando(false);
    });
    return () => { cancelado = true; };
  }, [empleado?.cliente_id, tiendaEfectiva, periodo]);

  const resumen = useMemo(() => resumirPorEmpleado(ventas), [ventas]);
  const delEmpleado = useMemo(() => filtrarPorEmpleado(ventas, empleadoSel), [ventas, empleadoSel]);

  const filtradas = useMemo(() => delEmpleado.filter((v) => {
    if (!busqueda.trim()) return true;
    const q = busqueda.toLowerCase();
    return numeroVisibleVenta(v).toLowerCase().includes(q) || (v.cajero_nombre || '').toLowerCase().includes(q);
  }), [delEmpleado, busqueda]);

  const stats = useMemo(() => {
    const total = filtradas.reduce((a, v) => a + ventaSinPropina(v), 0);
    const propinas = filtradas.reduce((a, v) => a + Math.max(0, Number(v.propina) || 0), 0);
    return { total, propinas, promedio: filtradas.length ? total / filtradas.length : 0, cantidad: filtradas.length };
  }, [filtradas]);

  const handleCompartir = async (v: VentaFila) => {
    if (!empleado || compartiendoId) return;
    setCompartiendoId(v.id);
    const r = await compartirRecibo(empleado.cliente_id, v);
    if (!r.ok) toast.error(r.error || 'No se pudo compartir la factura');
    setCompartiendoId(null);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 pb-24">
      <div className="px-5 pt-8 pb-4">
        <h1 className="text-white text-xl font-black">Ventas</h1>
        <p className="text-slate-400 text-sm">{stats.cantidad} {stats.cantidad === 1 ? 'venta' : 'ventas'} en el periodo</p>
      </div>

      <SucursalFiltro />

      <div className="px-5 mb-3 flex items-center gap-1.5">
        {PERIODOS.map((op) => (
          <button
            key={op.id}
            onClick={() => setPeriodo(op.id)}
            className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
              periodo === op.id
                ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/30'
                : 'bg-slate-800/80 text-slate-400 border border-slate-700'
            }`}
          >
            {op.label}
          </button>
        ))}
      </div>

      {esAdmin && (
        <div className="px-5 mb-4">
          <EmpleadoSelector resumen={resumen} seleccionado={empleadoSel} onSeleccionar={setEmpleadoSel} />
        </div>
      )}

      <div className="px-5 mb-4 grid grid-cols-3 gap-2">
        <div className="bg-slate-900/70 backdrop-blur border border-slate-800 rounded-xl p-3">
          <p className="text-slate-500 text-[10px] uppercase tracking-wide font-bold">Total</p>
          <p className="text-white text-base font-black">${stats.total.toLocaleString('es-CO')}</p>
        </div>
        <div className="bg-slate-900/70 backdrop-blur border border-slate-800 rounded-xl p-3">
          <p className="text-slate-500 text-[10px] uppercase tracking-wide font-bold">{stats.propinas > 0 ? 'Propinas' : 'Promedio'}</p>
          <p className="text-white text-base font-black">${Math.round(stats.propinas > 0 ? stats.propinas : stats.promedio).toLocaleString('es-CO')}</p>
        </div>
        <div className="bg-slate-900/70 backdrop-blur border border-slate-800 rounded-xl p-3">
          <p className="text-slate-500 text-[10px] uppercase tracking-wide font-bold">Ventas</p>
          <p className="text-white text-base font-black">{stats.cantidad}</p>
        </div>
      </div>

      {esAdmin && !empleadoSel && resumen.length > 1 && !busqueda.trim() && (
        <div className="px-5 mb-5">
          <h2 className="text-slate-400 text-xs font-bold uppercase tracking-wide mb-2">Por empleado</h2>
          <ResumenEmpleados resumen={resumen} onSeleccionar={setEmpleadoSel} />
        </div>
      )}

      <div className="px-5 mb-4 relative">
        <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
        <Input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por número o cajero..."
          className="h-11 pl-9 bg-slate-900 border-slate-700 text-white"
        />
      </div>

      <div className="px-5 space-y-2">
        {cargando && <p className="text-slate-500 text-sm text-center py-8">Cargando...</p>}
        {!cargando && errorCarga && <p className="text-red-400 text-sm text-center py-8">{errorCarga}</p>}
        {!cargando && !errorCarga && filtradas.length === 0 && (
          <p className="text-slate-500 text-sm text-center py-8">Sin ventas registradas</p>
        )}
        {filtradas.slice(0, MOSTRAR).map((v, i) => (
          <motion.div
            key={v.id}
            custom={i}
            initial="hidden"
            animate="show"
            variants={fadeUp}
            className="bg-slate-900/70 backdrop-blur border border-slate-800 rounded-xl p-3"
          >
            <div className="flex items-center justify-between mb-1">
              <p className="text-white font-bold text-sm">{numeroVisibleVenta(v)}</p>
              <span className="text-white font-black text-sm">${Number(v.total).toLocaleString('es-CO')}</span>
            </div>
            <p className="text-slate-500 text-xs mb-2">
              {new Date(v.created_at).toLocaleString('es-CO', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </p>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${BADGE_METODO[v.metodo_pago || ''] || 'bg-slate-700/50 text-slate-300'}`}>
                  {v.metodo_pago || 'N/A'}
                </span>
                {v.cajero_nombre && <span className="text-slate-500 text-xs">{v.cajero_nombre}</span>}
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setViendo(v)}
                  onPointerEnter={precargarVisorPdf}
                  onTouchStart={precargarVisorPdf}
                  className="h-8 w-8 rounded-full bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-amber-400"
                  aria-label="Ver factura"
                  title="Ver factura"
                >
                  <Eye className="w-4 h-4" />
                </button>
                {!soloAgregar(empleado) && <button
                  onClick={() => navigate(`/devoluciones?venta=${encodeURIComponent(numeroVisibleVenta(v))}`)}
                  className="h-8 w-8 rounded-full bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-300"
                  aria-label="Devolver o anular"
                  title="Devolver o anular"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>}
                <button
                  onClick={() => handleCompartir(v)}
                  disabled={compartiendoId === v.id}
                  className="h-8 w-8 rounded-full bg-slate-800 flex items-center justify-center text-slate-300 disabled:opacity-50"
                  aria-label="Compartir factura"
                  title="Compartir factura"
                >
                  {compartiendoId === v.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Share2 className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </motion.div>
        ))}
        {filtradas.length > MOSTRAR && (
          <p className="text-slate-500 text-xs text-center py-3">
            Se muestran las {MOSTRAR} más recientes de {filtradas.length}. Los totales de arriba incluyen todas.
          </p>
        )}
      </div>

      {!cargando && filtradas.length === 0 && ventas.length === 0 && (
        <div className="px-5 mt-4 flex items-center justify-center gap-2 text-slate-600 text-xs">
          <Receipt className="w-4 h-4" /> Las ventas hechas desde Vender aparecen aquí al instante
        </div>
      )}

      {empleado && viendo && (
        <ModalVistaFactura
          abierta
          onCerrar={() => setViendo(null)}
          titulo={numeroVisibleVenta(viendo)}
          obtenerDatos={() => obtenerDatosFactura(empleado.cliente_id, viendo)}
        />
      )}
    </div>
  );
}
