import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Info, User, Clock, Banknote, TrendingUp, TrendingDown, Minus, Equal, Plus, PackageX, Printer } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { electronStore, type Venta } from '../../lib/electronStore';
import ModalImprimirFactura from './ModalImprimirFactura';

export type TipoModalKPI =
  | 'ventas'
  | 'ingresos'
  | 'utilidad'
  | 'gastos'
  | 'devoluciones'
  | 'ticket_promedio'
  | 'proyeccion'
  | 'stock'
  | 'simple';

export interface FiltroRangoKPI {
  incluirTodosLosCajeros?: boolean;
  cajeroId?: string;
  cajeroNombre?: string;
}

export interface DatosResumenKPI {
  ingresosBrutos?: number;
  devoluciones?: number;
  ingresosNetos?: number;
  costos?: number;
  gastos?: number;
  repuestos?: number;
  reparaciones?: number;
  utilidadNeta?: number;
  margenUtilidad?: number;
  ticketPromedio?: number;
  cantidadTransacciones?: number;
  proyeccion?: number;
  progresoPeriodo?: number; // 0-100, % transcurrido del período
  explicacion?: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  darkMode: boolean;
  tipo: TipoModalKPI;
  titulo: string;
  valor: string;
  accentColor: string;
  icon: any;
  rango?: { inicio: Date; fin: Date };
  filtro?: FiltroRangoKPI;
  datos?: DatosResumenKPI;
}

const fmt = (v: number) => `$${Math.round(Number(v) || 0).toLocaleString('es-CO')}`;

const METODO_COLOR: Record<string, string> = {
  efectivo: '#10b981',
  tarjeta: '#3b82f6',
  nequi: '#8b5cf6',
  daviplata: '#ef4444',
  transferencia: '#06b6d4',
  rappi: '#ff6b35',
  mixto: '#f59e0b',
  bonos: '#14b8a6',
  fidelizacion: '#8b5cf6',
};

function metodoColor(metodo: string): string {
  return METODO_COLOR[String(metodo || '').toLowerCase()] || '#94a3b8';
}

const EXPLICACIONES: Record<TipoModalKPI, string> = {
  ventas: 'Esta es la lista de cada venta exitosa en este período (ya sin contar las que fueron devueltas o anuladas). Te muestra quién la atendió, a qué hora y cómo pagó el cliente.',
  ingresos: 'Los "ingresos brutos" son todo el dinero que entró por ventas, sin restar nada. Los "ingresos netos" son ese mismo dinero después de descontar las devoluciones — es el número más real de cuánto vendiste de verdad.',
  utilidad: 'La utilidad neta es lo que realmente te queda en el bolsillo: tus ingresos, menos lo que te costaron los productos que vendiste, menos los gastos del período. Es el indicador más importante porque te dice si el negocio está ganando o perdiendo.',
  gastos: 'Estos son todos los egresos de dinero registrados en este período: pagos a proveedores, servicios, arriendo, etc. Se restan de tus ingresos para calcular la utilidad real.',
  devoluciones: 'Cada vez que le devuelves dinero a un cliente (por un producto defectuoso, un error, etc.) queda registrado aquí. Este monto se resta de tus ingresos brutos para saber cuánto entró realmente.',
  ticket_promedio: 'Es el valor promedio que gasta un cliente por compra. Se calcula dividiendo el total vendido entre el número de ventas. Si este número sube, tus clientes están comprando más por visita.',
  proyeccion: 'Con base en lo que llevas vendido y cuánto tiempo ha pasado del día (o del período), este número estima cuánto terminarías vendiendo si sigues al mismo ritmo. Es solo un estimado, no un valor garantizado.',
  stock: 'Estos son los productos que están en su cantidad mínima o por debajo de ella. Vale la pena reabastecerlos pronto para no quedarte sin inventario cuando un cliente los pida.',
  simple: '',
};

export default function ModalDetalleKPI({ open, onClose, darkMode, tipo, titulo, valor, accentColor, icon: Icon, rango, filtro, datos = {} }: Props) {
  const [ventas, setVentas] = useState<any[]>([]);
  const [gastos, setGastos] = useState<any[]>([]);
  const [devoluciones, setDevoluciones] = useState<any[]>([]);
  const [productosStock, setProductosStock] = useState<any[]>([]);
  const [cargando, setCargando] = useState(false);
  // 🖨️ Reimpresión desde Reportes: hasta ahora la única forma de reimprimir
  // una factura era ir a Ventas y buscarla a mano. El detalle de KPI ya tiene
  // la lista exacta de ventas del período, así que se reutiliza el MISMO modal
  // que usa Ventas (ModalImprimirFactura) — misma vista previa, misma
  // impresora configurada en Dispositivos y mismo PDF, sin una segunda
  // plantilla que se pueda desalinear.
  const [ventaParaImprimir, setVentaParaImprimir] = useState<Venta | null>(null);

  const necesitaLista = tipo === 'ventas' || tipo === 'ticket_promedio' || tipo === 'gastos' || tipo === 'devoluciones' || tipo === 'stock';

  useEffect(() => {
    if (!open || !necesitaLista) return;
    if (tipo !== 'stock' && !rango) return;
    let cancelado = false;

    const cargar = async () => {
      setCargando(true);
      try {
        if (tipo === 'ventas' || tipo === 'ticket_promedio') {
          const todas = await electronStore.obtenerTodasLasVentas();
          const filtradas = todas
            .filter((v: any) => {
              const fecha = new Date(v.fecha).getTime();
              const enRango = fecha >= rango.inicio.getTime() && fecha <= rango.fin.getTime();
              const mismaCaja = filtro?.incluirTodosLosCajeros
                ? true
                : (filtro?.cajeroId
                  ? v.cajeroId === filtro.cajeroId
                  : String(v?.cajero || '').trim().toLowerCase() === String(filtro?.cajeroNombre || '').trim().toLowerCase());
              const estado = String(v?.estado || '').toLowerCase();
              const valida = estado !== 'devuelto' && estado !== 'anulado';
              return enRango && mismaCaja && valida;
            })
            .sort((a: any, b: any) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());
          if (!cancelado) setVentas(filtradas);
        }

        if (tipo === 'gastos') {
          const raw = JSON.parse(localStorage.getItem('pos-gastos') || '[]');
          const normalizar = (v: any) => String(v || '').trim().toLowerCase();
          const filtrados = (Array.isArray(raw) ? raw : [])
            .filter((g: any) => {
              const ts = new Date(g?.fecha).getTime();
              const enRango = Number.isFinite(ts) && ts >= rango.inicio.getTime() && ts <= rango.fin.getTime();
              if (!enRango) return false;
              if (filtro?.incluirTodosLosCajeros) return true;
              const usuarioId = g?.registradoPorId || g?.usuarioId || g?.cajeroId;
              const usuarioNombre = g?.registradoPor || g?.cajero || g?.usuarioNombre;
              const porId = filtro?.cajeroId ? normalizar(usuarioId) === normalizar(filtro.cajeroId) : false;
              const porNombre = filtro?.cajeroNombre ? normalizar(usuarioNombre) === normalizar(filtro.cajeroNombre) : false;
              return porId || porNombre;
            })
            .sort((a: any, b: any) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());
          if (!cancelado) setGastos(filtrados);
        }

        if (tipo === 'devoluciones') {
          const devs = await electronStore.obtenerDevolucionesPorRango(rango.inicio, rango.fin, filtro);
          if (!cancelado) setDevoluciones([...devs].sort((a: any, b: any) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime()));
        }

        if (tipo === 'stock') {
          const raw = JSON.parse(localStorage.getItem('pos-productos') || '[]');
          const bajoStock = (Array.isArray(raw) ? raw : [])
            .filter((p: any) => p?.activo !== false && (Number(p?.stock) || 0) <= (Number(p?.minStock) || Number(p?.stockMinimo) || 5))
            .sort((a: any, b: any) => (Number(a?.stock) || 0) - (Number(b?.stock) || 0));
          if (!cancelado) setProductosStock(bajoStock);
        }
      } catch (error) {
        console.error('Error cargando detalle de KPI:', error);
      } finally {
        if (!cancelado) setCargando(false);
      }
    };

    cargar();
    return () => { cancelado = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, tipo, rango?.inicio?.getTime(), rango?.fin?.getTime(), filtro?.incluirTodosLosCajeros, filtro?.cajeroId, filtro?.cajeroNombre]);

  if (!open) return null;

  const bg = darkMode ? 'bg-slate-900' : 'bg-white';
  const border = darkMode ? 'border-slate-700' : 'border-gray-200';
  const txt = darkMode ? 'text-white' : 'text-slate-900';
  const sub = darkMode ? 'text-slate-400' : 'text-slate-500';
  const card = darkMode ? 'bg-slate-800/60' : 'bg-gray-50';

  const filaCascada = (
    label: string,
    monto: number,
    signo: 'suma' | 'resta' | 'total',
    key: string
  ) => {
    const color = signo === 'resta' ? '#ef4444' : signo === 'total' ? accentColor : '#10b981';
    const SignoIcon = signo === 'resta' ? Minus : signo === 'total' ? Equal : Plus;
    return (
      <div
        key={key}
        className={`flex items-center justify-between px-4 py-3 rounded-xl ${signo === 'total' ? '' : card}`}
        style={signo === 'total' ? { background: `${accentColor}18`, border: `1px solid ${accentColor}45` } : undefined}
      >
        <div className="flex items-center gap-2.5">
          <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0" style={{ background: `${color}22` }}>
            <SignoIcon className="w-3.5 h-3.5" style={{ color }} />
          </div>
          <span className={`text-sm ${signo === 'total' ? 'font-bold' : ''} ${txt}`}>{label}</span>
        </div>
        <span className={`text-sm font-bold ${signo === 'total' ? '' : txt}`} style={signo === 'total' ? { color: accentColor } : undefined}>
          {signo === 'resta' ? '-' : ''}{fmt(Math.abs(monto))}
        </span>
      </div>
    );
  };

  const listaVentas = (lista: any[]) => (
    <>
      <div className="grid grid-cols-3 gap-2 mb-3">
        <div className={`p-3 rounded-xl text-center ${card}`}>
          <p className={`text-[10px] uppercase font-bold ${sub}`}>Transacciones</p>
          <p className={`text-lg font-black ${txt}`}>{lista.length}</p>
        </div>
        <div className={`p-3 rounded-xl text-center ${card}`}>
          <p className={`text-[10px] uppercase font-bold ${sub}`}>Total período</p>
          <p className={`text-lg font-black ${txt}`}>{fmt(lista.reduce((s, v) => s + (Number(v.total) || 0), 0))}</p>
        </div>
        <div className={`p-3 rounded-xl text-center ${card}`}>
          <p className={`text-[10px] uppercase font-bold ${sub}`}>Ticket promedio</p>
          <p className={`text-lg font-black ${txt}`}>{fmt(lista.length ? lista.reduce((s, v) => s + (Number(v.total) || 0), 0) / lista.length : 0)}</p>
        </div>
      </div>

      {cargando ? (
        <div className="py-10 text-center"><span className={sub}>Cargando ventas...</span></div>
      ) : lista.length === 0 ? (
        <div className="py-10 text-center"><span className={sub}>Aún no hay ventas registradas en este período.</span></div>
      ) : (
        <div className="space-y-1.5">
          {lista.map((v, i) => (
            <div key={v.id || i} className={`flex items-center justify-between p-3 rounded-xl ${card}`}>
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex flex-col shrink-0">
                  <span className={`text-xs font-semibold ${txt}`}>{format(new Date(v.fecha), 'dd/MM', { locale: es })}</span>
                  <span className={`text-[10px] ${sub}`}>{format(new Date(v.fecha), 'HH:mm', { locale: es })}</span>
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <User className={`w-3 h-3 shrink-0 ${sub}`} />
                    <span className={`text-xs truncate ${txt}`}>{v.cajero || 'Sin nombre'}</span>
                  </div>
                  <span
                    className="inline-block mt-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase"
                    style={{ background: `${metodoColor(v.metodoPago)}22`, color: metodoColor(v.metodoPago) }}
                  >
                    {v.metodoPago || '—'}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0 ml-2">
                <span className={`text-sm font-bold ${txt}`}>{fmt(v.total)}</span>
                <button
                  onClick={(e) => { e.stopPropagation(); setVentaParaImprimir(v as Venta); }}
                  title={`Ver e imprimir la factura ${(v as any).numeroFactura || v.id || ''}`}
                  className={`p-1.5 rounded-lg transition-colors ${
                    darkMode
                      ? 'text-slate-400 hover:text-emerald-300 hover:bg-emerald-500/15'
                      : 'text-slate-400 hover:text-emerald-600 hover:bg-emerald-50'
                  }`}
                >
                  <Printer className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );

  const listaGastos = (
    <>
      {cargando ? (
        <div className="py-10 text-center"><span className={sub}>Cargando gastos...</span></div>
      ) : gastos.length === 0 ? (
        <div className="py-10 text-center"><span className={sub}>No hay gastos registrados en este período.</span></div>
      ) : (
        <div className="space-y-1.5">
          {gastos.map((g, i) => (
            <div key={g.id || i} className={`flex items-center justify-between p-3 rounded-xl ${card}`}>
              <div className="min-w-0">
                <p className={`text-xs font-semibold truncate ${txt}`}>{g.concepto || g.categoriaConcepto || g.descripcion || 'Gasto operativo'}</p>
                <p className={`text-[10px] ${sub}`}>
                  {format(new Date(g.fecha), "dd/MM/yyyy HH:mm", { locale: es })} · {g.registradoPor || g.cajero || g.usuarioNombre || 'Sin registrar'}
                </p>
              </div>
              <span className="text-sm font-bold shrink-0 ml-2 text-red-500">-{fmt(g.monto)}</span>
            </div>
          ))}
        </div>
      )}
    </>
  );

  const listaDevoluciones = (
    <>
      {cargando ? (
        <div className="py-10 text-center"><span className={sub}>Cargando devoluciones...</span></div>
      ) : devoluciones.length === 0 ? (
        <div className="py-10 text-center"><span className={sub}>No hay devoluciones registradas en este período.</span></div>
      ) : (
        <div className="space-y-1.5">
          {devoluciones.map((d, i) => (
            <div key={d.id || i} className={`flex items-center justify-between p-3 rounded-xl ${card}`}>
              <div className="min-w-0">
                <p className={`text-xs font-semibold truncate ${txt}`}>Factura {d.numeroFactura || d.ventaId || '—'}</p>
                <p className={`text-[10px] ${sub}`}>
                  {format(new Date(d.fecha), "dd/MM/yyyy HH:mm", { locale: es })} · {d.procesadoPor || 'Sin registrar'}
                </p>
              </div>
              <span className="text-sm font-bold shrink-0 ml-2 text-red-500">-{fmt(d.totalDevolucion)}</span>
            </div>
          ))}
        </div>
      )}
    </>
  );

  const listaStock = (
    <>
      {cargando ? (
        <div className="py-10 text-center"><span className={sub}>Cargando inventario...</span></div>
      ) : productosStock.length === 0 ? (
        <div className="py-10 text-center"><span className={sub}>Todo tu inventario está en niveles saludables. 🎉</span></div>
      ) : (
        <div className="space-y-1.5">
          {productosStock.map((p, i) => {
            const stock = Number(p.stock) || 0;
            const minimo = Number(p.minStock) || Number(p.stockMinimo) || 5;
            const critico = stock <= 0;
            return (
              <div key={p.id || i} className={`flex items-center justify-between p-3 rounded-xl ${critico ? (darkMode ? 'bg-red-500/10' : 'bg-red-50') : card}`}>
                <div className="flex items-center gap-2.5 min-w-0">
                  <PackageX className={`w-4 h-4 shrink-0 ${critico ? 'text-red-500' : 'text-amber-500'}`} />
                  <div className="min-w-0">
                    <p className={`text-xs font-semibold truncate ${txt}`}>{p.nombre}</p>
                    <p className={`text-[10px] ${sub}`}>Código: {p.codigo || '—'}</p>
                  </div>
                </div>
                <div className="text-right shrink-0 ml-2">
                  <p className={`text-sm font-bold ${critico ? 'text-red-500' : (darkMode ? 'text-amber-400' : 'text-amber-600')}`}>{stock} und</p>
                  <p className={`text-[10px] ${sub}`}>mín. {minimo}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}
          className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[200] flex items-center justify-center p-3 md:p-6"
          onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
          <motion.div
            initial={{ scale: 0.94, opacity: 0, y: 16 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.94, opacity: 0, y: 16 }}
            transition={{ type: 'spring', damping: 26, stiffness: 300 }}
            className={`relative w-full max-w-lg max-h-[88vh] flex flex-col rounded-3xl overflow-hidden shadow-[0_32px_80px_rgba(0,0,0,0.5)] border ${bg} ${border}`}
          >
            {/* Header con degradado del color de la tarjeta */}
            <div
              className="p-6 pb-5 shrink-0"
              style={{ background: darkMode ? `linear-gradient(155deg, ${accentColor}25, transparent)` : `linear-gradient(155deg, ${accentColor}12, transparent)` }}
            >
              <button
                onClick={onClose}
                className={`absolute top-4 right-4 p-2 rounded-full transition-colors ${darkMode ? 'text-slate-400 hover:text-white hover:bg-slate-700' : 'text-gray-400 hover:text-gray-900 hover:bg-gray-100'}`}
              >
                <X className="w-5 h-5" />
              </button>
              <div className="flex items-center gap-3 mb-2">
                <div className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0" style={{ background: `${accentColor}22`, border: `1px solid ${accentColor}45` }}>
                  <Icon className="w-5 h-5" style={{ color: accentColor }} />
                </div>
                <div>
                  <p className={`text-xs font-bold uppercase tracking-wider ${sub}`}>{titulo}</p>
                  <p className="text-2xl font-black" style={{ color: accentColor }}>{valor}</p>
                </div>
              </div>
            </div>

            {/* Cuerpo scrollable */}
            <div className="flex-1 overflow-y-auto px-6 pb-6 space-y-4">
              {/* Explicación en lenguaje sencillo */}
              {(EXPLICACIONES[tipo] || datos.explicacion) && (
                <div className={`flex gap-2.5 p-3.5 rounded-xl border ${darkMode ? 'bg-blue-500/10 border-blue-500/25' : 'bg-blue-50 border-blue-200'}`}>
                  <Info className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
                  <p className={`text-xs leading-relaxed ${darkMode ? 'text-blue-200' : 'text-blue-800'}`}>
                    {tipo === 'simple' ? datos.explicacion : EXPLICACIONES[tipo]}
                  </p>
                </div>
              )}

              {tipo === 'utilidad' && (
                <div className="space-y-1.5">
                  {filaCascada('Ingresos netos', datos.ingresosNetos || 0, 'suma', 'ing')}
                  {filaCascada('Costo de los productos vendidos', datos.costos || 0, 'resta', 'costos')}
                  {filaCascada('Gastos del período', datos.gastos || 0, 'resta', 'gastos')}
                  {!!datos.repuestos && filaCascada('Repuestos usados en taller', datos.repuestos, 'resta', 'rep')}
                  {!!datos.reparaciones && filaCascada('Pagos recibidos en taller', datos.reparaciones, 'suma', 'reparo')}
                  {filaCascada(`Utilidad neta (margen ${(datos.margenUtilidad || 0).toFixed(1)}%)`, datos.utilidadNeta || 0, 'total', 'total')}
                </div>
              )}

              {tipo === 'ingresos' && (
                <>
                  <div className="space-y-1.5">
                    {filaCascada('Ventas totales (brutas)', datos.ingresosBrutos || 0, 'suma', 'bruto')}
                    {filaCascada('Devoluciones', datos.devoluciones || 0, 'resta', 'dev')}
                    {filaCascada('Ingresos netos', datos.ingresosNetos || 0, 'total', 'neto')}
                  </div>
                  {!datos.devoluciones && (
                    <p className={`text-[11px] italic px-1 ${sub}`}>
                      Brutos y netos coinciden porque no hubo devoluciones en este período — en cuanto registres una, este número bajará.
                    </p>
                  )}
                  <div className={`border-t ${border} pt-3`}>
                    <p className={`text-xs font-bold uppercase tracking-wider mb-2 ${sub}`}>Ventas de este período</p>
                    {listaVentas(ventas)}
                  </div>
                </>
              )}

              {(tipo === 'ventas' || tipo === 'ticket_promedio') && listaVentas(ventas)}
              {tipo === 'gastos' && listaGastos}
              {tipo === 'devoluciones' && listaDevoluciones}
              {tipo === 'stock' && listaStock}

              {tipo === 'proyeccion' && (
                <div className="space-y-3">
                  <div className={`p-4 rounded-xl ${card}`}>
                    <div className="flex justify-between text-xs mb-1.5">
                      <span className={sub}>Progreso del período</span>
                      <span className={`font-bold ${txt}`}>{Math.round(datos.progresoPeriodo || 0)}%</span>
                    </div>
                    <div className="h-2 rounded-full overflow-hidden" style={{ background: darkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)' }}>
                      <div className="h-full rounded-full" style={{ width: `${Math.min(100, datos.progresoPeriodo || 0)}%`, background: accentColor }} />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    {filaCascada('Llevas vendido hasta ahora', datos.ingresosNetos || 0, 'suma', 'actual')}
                    {filaCascada('Si sigues a este ritmo, cerrarías con', datos.proyeccion || 0, 'total', 'proy')}
                  </div>
                </div>
              )}
            </div>
          </motion.div>

          {/* Vista previa + impresión de una factura del período (mismo modal que Ventas) */}
          <ModalImprimirFactura
            open={!!ventaParaImprimir}
            venta={ventaParaImprimir}
            onClose={() => setVentaParaImprimir(null)}
            darkMode={darkMode}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
