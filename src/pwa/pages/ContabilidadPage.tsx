/**
 * Contabilidad — web y celular, con las mismas pestañas de Electron:
 * Resumen inteligente, Cuentas por cobrar, Rentabilidad, Flujo de caja,
 * Facturación DIAN y Reportes, más los filtros rápidos de período.
 *
 * Lee de Supabase (ventas, devoluciones, gastos, ingresos extra, cartera,
 * productos, facturas electrónicas) — los mismos datos que publica Electron —
 * con los cálculos de contabilidadNube.ts, que replican los de escritorio.
 */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import {
  Sparkles, Wallet, TrendingUp, TrendingDown, PiggyBank, Scale, Loader2, MessageCircle, FileSpreadsheet, FileText,
  ArrowUpRight, ArrowDownRight, AlertTriangle, ReceiptText, LayoutGrid, Package, Calendar, CircleDollarSign,
} from 'lucide-react';
import { ResponsiveContainer, ComposedChart, Bar, Line, XAxis, Tooltip, CartesianGrid } from 'recharts';
import { usePwaAuth } from '../contexts/PwaAuthContext';
import { useModulosActivos } from '../hooks/useModulosActivos';
import { ModuloPOS } from '../../app/lib/permissions';
import { listarFacturasDian } from '../../app/lib/supabase/facturaElectronicaDianService';
import type { FacturaElectronicaDian } from '../../app/lib/dian/types';
import { ESTADO_DIAN_UI } from '../../app/components/facturacion/comunes';
import { money } from '../lib/nubeConsultas';
import {
  RANGOS_RAPIDOS, calcularRango, rangoAnterior, cargarMovimientos, calcularTotales, variacion, flujoPorDia, agrupar,
  cargarCuentasPorCobrar, cargarRentabilidad, saludFinanciera, resumenEnPalabras,
  type RangoRapido, type MovimientosPeriodo, type Totales, type CuentaPorCobrar, type Rentabilidad,
} from '../lib/contabilidadNube';

type Pestana = 'resumen' | 'cobrar' | 'rentabilidad' | 'flujo' | 'dian' | 'reportes';

const PESTANAS: Array<[Pestana, string, typeof Sparkles]> = [
  ['resumen', 'Resumen', Sparkles],
  ['cobrar', 'Por cobrar', Wallet],
  ['rentabilidad', 'Rentabilidad', TrendingUp],
  ['flujo', 'Flujo de caja', Scale],
  ['dian', 'Facturación DIAN', ReceiptText],
  ['reportes', 'Reportes', FileSpreadsheet],
];

const tarjeta = 'bg-slate-900/70 backdrop-blur border border-slate-800 rounded-2xl';

function Variacion({ valor, invertir }: { valor: number | null; invertir?: boolean }) {
  if (valor === null) return <span className="text-slate-500 text-[11px]">sin comparación</span>;
  const bueno = invertir ? valor <= 0 : valor >= 0;
  const Icono = valor >= 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[11px] font-bold ${bueno ? 'text-emerald-400' : 'text-red-400'}`}>
      <Icono className="w-3 h-3" /> {Math.abs(valor).toFixed(0)} % vs. antes
    </span>
  );
}

function Kpi({ icono: Icono, titulo, valor, color, pie }: { icono: typeof Sparkles; titulo: string; valor: string; color: string; pie: React.ReactNode }) {
  return (
    <div className={`${tarjeta} p-4`}>
      <div className="flex items-center gap-2 mb-1">
        <Icono className={`w-4 h-4 ${color}`} />
        <p className={`text-[11px] font-bold uppercase tracking-wide ${color}`}>{titulo}</p>
      </div>
      <p className="text-white text-xl font-black truncate">{valor}</p>
      <div className="mt-0.5">{pie}</div>
    </div>
  );
}

export default function ContabilidadPage() {
  const { empleado } = usePwaAuth();
  const { tieneModulo, tieneModuloDePago } = useModulosActivos();
  const navigate = useNavigate();
  const clienteId = empleado?.cliente_id;

  const [pestana, setPestana] = useState<Pestana>('resumen');
  const [rango, setRango] = useState<RangoRapido>('mes');
  const [personalizado, setPersonalizado] = useState(() => calcularRango('mes'));
  const { desde, hasta } = rango === 'personalizado' ? personalizado : calcularRango(rango);

  const [movimientos, setMovimientos] = useState<MovimientosPeriodo | null>(null);
  const [anterior, setAnterior] = useState<Totales | null>(null);
  const [cuentas, setCuentas] = useState<CuentaPorCobrar[] | null>(null);
  const [rentabilidad, setRentabilidad] = useState<{ productos: Rentabilidad[]; categorias: Rentabilidad[]; sinCosto: number } | null>(null);
  const [facturas, setFacturas] = useState<FacturaElectronicaDian[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Movimientos del período y del período anterior (para la variación).
  useEffect(() => {
    if (!clienteId) return;
    let cancelado = false;
    setMovimientos(null);
    setAnterior(null);
    setError(null);
    const previo = rangoAnterior(desde, hasta);
    Promise.all([
      cargarMovimientos(clienteId, desde, hasta),
      rango === 'todos' ? Promise.resolve(null) : cargarMovimientos(clienteId, previo.desde, previo.hasta),
    ])
      .then(([actual, ant]) => {
        if (cancelado) return;
        setMovimientos(actual);
        setAnterior(ant ? calcularTotales(ant) : null);
      })
      .catch((e) => { if (!cancelado) setError(e?.message || 'No se pudieron cargar los datos'); });
    return () => { cancelado = true; };
  }, [clienteId, desde, hasta, rango]);

  // Cartera: no depende del período (lo que deben hoy).
  useEffect(() => {
    if (!clienteId) return;
    cargarCuentasPorCobrar(clienteId).then(setCuentas).catch(() => setCuentas([]));
  }, [clienteId]);

  // Rentabilidad: es la consulta más pesada, se trae solo si se usa.
  useEffect(() => {
    if (!clienteId || (pestana !== 'rentabilidad' && pestana !== 'resumen')) return;
    let cancelado = false;
    setRentabilidad(null);
    cargarRentabilidad(clienteId, desde, hasta)
      .then((r) => { if (!cancelado) setRentabilidad(r); })
      .catch(() => { if (!cancelado) setRentabilidad({ productos: [], categorias: [], sinCosto: 0 }); });
    return () => { cancelado = true; };
  }, [clienteId, desde, hasta, pestana]);

  useEffect(() => {
    if (!clienteId || pestana !== 'dian') return;
    let cancelado = false;
    setFacturas(null);
    listarFacturasDian({
      clienteId, limite: 300,
      desde: new Date(`${desde}T00:00:00`).toISOString(), hasta: new Date(`${hasta}T23:59:59.999`).toISOString(),
    }).then((f) => { if (!cancelado) setFacturas(f); }).catch(() => { if (!cancelado) setFacturas([]); });
    return () => { cancelado = true; };
  }, [clienteId, desde, hasta, pestana]);

  const totales = useMemo(() => (movimientos ? calcularTotales(movimientos) : null), [movimientos]);
  const flujo = useMemo(() => (movimientos ? flujoPorDia(movimientos) : []), [movimientos]);
  const porCobrar = (cuentas || []).reduce((a, c) => a + c.saldo, 0);
  const vencidas = (cuentas || []).filter((c) => c.estado === 'vencido');

  if (!empleado) return null;

  const varIngresos = totales && anterior ? variacion(totales.ingresos, anterior.ingresos) : null;
  const salud = totales ? saludFinanciera(totales, varIngresos, porCobrar) : null;
  const frases = totales ? resumenEnPalabras(totales, anterior, rentabilidad?.productos[0]?.nombre ?? null, vencidas, money) : [];
  const etiquetaDia = (dia: string) => { const [, m, d] = dia.split('-'); return `${d}/${m}`; };

  const recordar = (c: CuentaPorCobrar) => {
    const mensaje = `Hola ${c.cliente}, te recordamos que tienes un saldo pendiente de ${money(c.saldo)} (${c.referencia}). ¡Gracias por tu preferencia!`;
    const tel = c.telefono.replace(/\D/g, '');
    if (tel) window.open(`https://wa.me/${tel.length === 10 ? `57${tel}` : tel}?text=${encodeURIComponent(mensaje)}`, '_blank');
    else { navigator.clipboard?.writeText(mensaje); toast.info('Sin teléfono registrado: copiamos el mensaje para que lo envíes'); }
  };

  async function exportarExcel() {
    if (!movimientos || !totales) return;
    const XLSX = await import('xlsx');
    const libro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(libro, XLSX.utils.json_to_sheet([
      { Concepto: 'Ventas', Valor: totales.ventas },
      { Concepto: 'Ingresos extra', Valor: totales.ingresosExtra },
      { Concepto: 'Devoluciones', Valor: -totales.devoluciones },
      { Concepto: 'Ingresos netos', Valor: totales.ingresos },
      { Concepto: 'Gastos', Valor: -totales.gastos },
      { Concepto: 'Utilidad', Valor: totales.utilidad },
      { Concepto: 'Margen %', Valor: Number(totales.margen.toFixed(2)) },
      { Concepto: 'Por cobrar (hoy)', Valor: porCobrar },
    ]), 'Estado de resultados');
    XLSX.utils.book_append_sheet(libro, XLSX.utils.json_to_sheet(flujo.map((d) => ({ Día: d.dia, Entradas: d.entradas, Salidas: d.salidas, Neto: d.neto, Acumulado: d.acumulado }))), 'Flujo de caja');
    XLSX.utils.book_append_sheet(libro, XLSX.utils.json_to_sheet(agrupar(movimientos.gastos, (g) => g.categoria, (g) => g.monto).map((g) => ({ Categoría: g.nombre, Total: g.total }))), 'Gastos por categoría');
    XLSX.utils.book_append_sheet(libro, XLSX.utils.json_to_sheet(movimientos.gastos.map((g) => ({ Fecha: g.fecha.replace('T', ' '), Descripción: g.descripcion, Categoría: g.categoria, Medio: g.medio, Monto: g.monto }))), 'Gastos');
    if (cuentas?.length) XLSX.utils.book_append_sheet(libro, XLSX.utils.json_to_sheet(cuentas.map((c) => ({ Cliente: c.cliente, Referencia: c.referencia, Saldo: c.saldo, Vence: c.vence, 'Días de atraso': c.diasAtraso }))), 'Por cobrar');
    if (rentabilidad?.productos.length) XLSX.utils.book_append_sheet(libro, XLSX.utils.json_to_sheet(rentabilidad.productos.map((r) => ({ Producto: r.nombre, Unidades: r.unidades, Ventas: r.ventas, Costo: r.costo, Utilidad: r.utilidad, 'Margen %': Number(r.margen.toFixed(1)) }))), 'Rentabilidad');
    XLSX.writeFile(libro, `contabilidad-${desde}-a-${hasta}.xlsx`);
  }

  async function exportarPdf() {
    if (!totales) return;
    const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
    const doc = new jsPDF();
    doc.setFontSize(15); doc.text('Estado de resultados', 14, 18);
    doc.setFontSize(9); doc.text(`Período: ${desde} a ${hasta}`, 14, 25);
    autoTable(doc, {
      startY: 30,
      head: [['Concepto', 'Valor']],
      body: [
        ['Ventas', money(totales.ventas)], ['Ingresos extra', money(totales.ingresosExtra)], ['(−) Devoluciones', money(totales.devoluciones)],
        ['Ingresos netos', money(totales.ingresos)], ['(−) Gastos', money(totales.gastos)], ['Utilidad', money(totales.utilidad)],
        ['Margen', `${totales.margen.toFixed(1)} %`], ['Cuentas por cobrar (hoy)', money(porCobrar)], ['Flujo de caja disponible', money(totales.utilidad - porCobrar)],
      ],
      styles: { fontSize: 9 }, headStyles: { fillColor: [15, 23, 42] },
    });
    if (movimientos) {
      autoTable(doc, {
        startY: (doc as any).lastAutoTable.finalY + 8,
        head: [['Gastos por categoría', 'Total']],
        body: agrupar(movimientos.gastos, (g) => g.categoria, (g) => g.monto).map((g) => [g.nombre.replace(/_/g, ' '), money(g.total)]),
        styles: { fontSize: 9 }, headStyles: { fillColor: [15, 23, 42] },
      });
    }
    doc.save(`estado-de-resultados-${desde}-a-${hasta}.pdf`);
  }

  const cargando = !movimientos && !error;

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 pb-24">
      <div className="px-5 pt-8 pb-3">
        <h1 className="text-white text-2xl font-black">Contabilidad</h1>
        <p className="text-slate-400 text-sm">Resumen financiero, cartera, rentabilidad y flujo de caja</p>
      </div>

      {/* Pestañas */}
      <div className="px-5 flex gap-2 overflow-x-auto pb-2 [scrollbar-width:none]">
        {PESTANAS.map(([id, label, Icono]) => (
          <button
            key={id}
            onClick={() => setPestana(id)}
            className={`h-10 px-3.5 rounded-xl text-sm font-bold flex items-center gap-1.5 shrink-0 ${pestana === id ? 'bg-amber-500 text-slate-950' : 'bg-slate-800/80 text-slate-400 border border-slate-700'}`}
          >
            <Icono className="w-4 h-4" /> {label}
          </button>
        ))}
      </div>

      {/* Período */}
      {pestana !== 'cobrar' && (
        <div className="px-5 mt-2 space-y-2">
          <div className="flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none]">
            {RANGOS_RAPIDOS.map(([id, label]) => (
              <button
                key={id}
                onClick={() => setRango(id)}
                className={`h-8 px-3 rounded-full text-xs font-semibold shrink-0 ${rango === id ? 'bg-sky-500/20 text-sky-400 border border-sky-500/40' : 'bg-slate-900 text-slate-400 border border-slate-800'}`}
              >
                {label}
              </button>
            ))}
          </div>
          {rango === 'personalizado' ? (
            <div className="flex items-center gap-2">
              {(['desde', 'hasta'] as const).map((campo) => (
                <div key={campo} className="flex-1 flex items-center gap-1.5 bg-slate-900/70 border border-slate-800 rounded-xl px-2.5 h-10">
                  <Calendar className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                  <input type="date" value={personalizado[campo]} onChange={(e) => setPersonalizado((p) => ({ ...p, [campo]: e.target.value }))} className="bg-transparent text-white text-xs w-full outline-none" />
                </div>
              ))}
            </div>
          ) : (
            <p className="text-slate-500 text-xs">{desde === hasta ? desde : `${desde} → ${hasta}`}</p>
          )}
        </div>
      )}

      <div className="px-5 mt-4 space-y-4">
        {error && <div className={`${tarjeta} p-4 text-red-400 text-sm`}>{error}</div>}
        {cargando && pestana !== 'cobrar' && (
          <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 text-amber-400 animate-spin" /></div>
        )}

        {/* ── Resumen ── */}
        {pestana === 'resumen' && totales && (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Kpi icono={TrendingUp} titulo="Ingresos" valor={money(totales.ingresos)} color="text-emerald-400" pie={<Variacion valor={varIngresos} />} />
              <Kpi icono={TrendingDown} titulo="Gastos" valor={money(totales.gastos)} color="text-red-400" pie={<Variacion valor={anterior ? variacion(totales.gastos, anterior.gastos) : null} invertir />} />
              <Kpi icono={PiggyBank} titulo="Utilidad estimada" valor={money(totales.utilidad)} color={totales.utilidad >= 0 ? 'text-sky-400' : 'text-red-400'} pie={<span className="text-slate-500 text-[11px]">Margen {totales.margen.toFixed(1)} %</span>} />
              <Kpi icono={Wallet} titulo="Por cobrar" valor={money(porCobrar)} color="text-amber-400" pie={<span className="text-slate-500 text-[11px]">{vencidas.length} vencidas</span>} />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
              <div className={`${tarjeta} p-4 lg:col-span-2`}>
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles className="w-4 h-4 text-amber-400" />
                  <p className="text-white text-sm font-bold">Resumen inteligente</p>
                </div>
                <ul className="space-y-1.5">
                  {frases.map((f) => <li key={f} className="text-slate-300 text-sm leading-snug">• {f}</li>)}
                </ul>
              </div>
              <div className={`${tarjeta} p-4 flex flex-col justify-between gap-3`}>
                <div>
                  <p className="text-slate-400 text-xs font-bold uppercase tracking-wide">Salud financiera</p>
                  <p className="text-2xl font-black" style={{ color: salud!.color }}>{salud!.etiqueta}</p>
                </div>
                <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${salud!.puntaje}%`, background: salud!.color }} />
                </div>
                <div className="text-xs text-slate-400 space-y-0.5">
                  <p>Flujo de caja disponible: <span className={`font-bold ${totales.utilidad - porCobrar >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{money(totales.utilidad - porCobrar)}</span></p>
                  <p>{totales.transacciones} ventas · ticket promedio {money(totales.ticketPromedio)}</p>
                </div>
              </div>
            </div>

            {flujo.length > 0 && (
              <div className={`${tarjeta} p-4`}>
                <p className="text-white text-sm font-bold mb-3">Entradas vs. salidas</p>
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={flujo.slice(-31)}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#33415555" vertical={false} />
                      <XAxis dataKey="dia" tickFormatter={etiquetaDia} tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                      <Tooltip formatter={(v: number) => money(v)} labelFormatter={etiquetaDia} contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 12, fontSize: 12 }} />
                      <Bar dataKey="entradas" name="Entradas" fill="#10b981" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="salidas" name="Salidas" fill="#ef4444" radius={[4, 4, 0, 0]} />
                      <Line dataKey="acumulado" name="Acumulado" stroke="#38bdf8" strokeWidth={2} dot={false} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <ListaBarras titulo="Ventas por medio de pago" icono={CircleDollarSign} filas={agrupar(movimientos!.ventas, (v) => v.metodo, (v) => v.total)} color="#10b981" />
              <ListaBarras titulo="Gastos por categoría" icono={LayoutGrid} filas={agrupar(movimientos!.gastos, (g) => g.categoria.replace(/_/g, ' '), (g) => g.monto)} color="#ef4444" />
            </div>
          </>
        )}

        {/* ── Cuentas por cobrar ── */}
        {pestana === 'cobrar' && (
          cuentas === null ? (
            <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 text-amber-400 animate-spin" /></div>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-3">
                <Kpi icono={Wallet} titulo="Total" valor={money(porCobrar)} color="text-amber-400" pie={<span className="text-slate-500 text-[11px]">{cuentas.length} cuentas</span>} />
                <Kpi icono={AlertTriangle} titulo="Vencido" valor={money(vencidas.reduce((a, c) => a + c.saldo, 0))} color="text-red-400" pie={<span className="text-slate-500 text-[11px]">{vencidas.length} cuentas</span>} />
                <Kpi icono={Calendar} titulo="Por vencer" valor={money(cuentas.filter((c) => c.estado === 'proximo').reduce((a, c) => a + c.saldo, 0))} color="text-sky-400" pie={<span className="text-slate-500 text-[11px]">próximos 3 días</span>} />
              </div>
              {cuentas.length === 0 ? (
                <p className="text-slate-500 text-sm text-center py-10">Ningún cliente tiene saldo pendiente.</p>
              ) : (
                <div className="space-y-2">
                  {cuentas.map((c) => (
                    <div key={c.id} className={`${tarjeta} p-3.5 flex items-center gap-3`}>
                      <span className={`w-2 h-10 rounded-full shrink-0 ${c.estado === 'vencido' ? 'bg-red-500' : c.estado === 'proximo' ? 'bg-amber-500' : 'bg-emerald-500'}`} />
                      <div className="min-w-0 flex-1">
                        <p className="text-white text-sm font-semibold truncate">{c.cliente}</p>
                        <p className="text-slate-500 text-xs truncate">
                          {c.referencia} · {c.estado === 'vencido' ? `vencida hace ${c.diasAtraso} ${c.diasAtraso === 1 ? 'día' : 'días'}` : `vence ${c.vence}`}
                        </p>
                      </div>
                      <p className="text-white font-mono font-bold text-sm shrink-0">{money(c.saldo)}</p>
                      <button onClick={() => recordar(c)} title="Enviar recordatorio" className="h-9 w-9 rounded-lg bg-emerald-600/20 text-emerald-400 flex items-center justify-center shrink-0">
                        <MessageCircle className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <button onClick={() => navigate('/cartera')} className="w-full h-11 rounded-xl bg-slate-800 text-slate-300 text-sm font-semibold">Registrar abonos en Cartera</button>
            </>
          )
        )}

        {/* ── Rentabilidad ── */}
        {pestana === 'rentabilidad' && (
          rentabilidad === null ? (
            <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 text-amber-400 animate-spin" /></div>
          ) : (
            <>
              {rentabilidad.sinCosto > 0 && (
                <p className="rounded-xl bg-amber-500/15 text-amber-400 text-xs px-3 py-2">
                  {rentabilidad.sinCosto} {rentabilidad.sinCosto === 1 ? 'línea vendida no tiene' : 'líneas vendidas no tienen'} costo registrado: su utilidad aparece como el 100 % de la venta. Completa el costo en Inventario.
                </p>
              )}
              <TablaRentabilidad titulo="Productos que más utilidad dejan" icono={Package} filas={rentabilidad.productos.slice(0, 15)} />
              <TablaRentabilidad titulo="Por categoría" icono={LayoutGrid} filas={rentabilidad.categorias} />
              <p className="text-slate-600 text-[11px]">La utilidad se calcula con el costo actual de cada producto.</p>
            </>
          )
        )}

        {/* ── Flujo de caja ── */}
        {pestana === 'flujo' && totales && (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Kpi icono={ArrowUpRight} titulo="Entradas" valor={money(totales.ventas + totales.ingresosExtra)} color="text-emerald-400" pie={<span className="text-slate-500 text-[11px]">ventas + ingresos extra</span>} />
              <Kpi icono={ArrowDownRight} titulo="Salidas" valor={money(totales.gastos + totales.devoluciones)} color="text-red-400" pie={<span className="text-slate-500 text-[11px]">gastos + devoluciones</span>} />
              <Kpi icono={Scale} titulo="Neto del período" valor={money(totales.utilidad)} color={totales.utilidad >= 0 ? 'text-sky-400' : 'text-red-400'} pie={<span className="text-slate-500 text-[11px]">{flujo.length} días con movimiento</span>} />
              <Kpi icono={PiggyBank} titulo="Disponible" valor={money(totales.utilidad - porCobrar)} color="text-amber-400" pie={<span className="text-slate-500 text-[11px]">descontando lo por cobrar</span>} />
            </div>
            <div className={`${tarjeta} overflow-hidden`}>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-950/60 text-slate-400 text-xs uppercase tracking-wide">
                    <tr>
                      <th className="text-left px-3 py-2.5">Día</th>
                      <th className="text-right px-3 py-2.5">Entradas</th>
                      <th className="text-right px-3 py-2.5">Salidas</th>
                      <th className="text-right px-3 py-2.5">Neto</th>
                      <th className="text-right px-3 py-2.5">Acumulado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {flujo.length === 0 ? (
                      <tr><td colSpan={5} className="text-center py-10 text-slate-500">Sin movimientos en el período</td></tr>
                    ) : [...flujo].reverse().map((d) => (
                      <tr key={d.dia} className="border-t border-slate-800 text-slate-300">
                        <td className="px-3 py-2 whitespace-nowrap">{d.dia}</td>
                        <td className="px-3 py-2 text-right font-mono text-emerald-400">{money(d.entradas)}</td>
                        <td className="px-3 py-2 text-right font-mono text-red-400">{money(d.salidas)}</td>
                        <td className={`px-3 py-2 text-right font-mono ${d.neto >= 0 ? 'text-white' : 'text-red-400'}`}>{money(d.neto)}</td>
                        <td className="px-3 py-2 text-right font-mono text-sky-400">{money(d.acumulado)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {/* ── Facturación DIAN ── */}
        {pestana === 'dian' && (
          facturas === null ? (
            <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 text-amber-400 animate-spin" /></div>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-3">
                <Kpi icono={ReceiptText} titulo="Emitidas" valor={String(facturas.length)} color="text-sky-400" pie={<span className="text-slate-500 text-[11px]">{money(facturas.reduce((a, f) => a + f.total, 0))}</span>} />
                <Kpi icono={TrendingUp} titulo="Aprobadas" valor={String(facturas.filter((f) => f.estado === 'accepted').length)} color="text-emerald-400" pie={<span className="text-slate-500 text-[11px]">por la DIAN</span>} />
                <Kpi icono={AlertTriangle} titulo="Pendientes o rechazadas" valor={String(facturas.filter((f) => f.estado !== 'accepted').length)} color="text-amber-400" pie={<span className="text-slate-500 text-[11px]">revisar</span>} />
              </div>
              <div className="space-y-2">
                {facturas.slice(0, 50).map((f) => {
                  const info = ESTADO_DIAN_UI[f.estado];
                  return (
                    <div key={f.id} className={`${tarjeta} p-3 flex items-center gap-3`}>
                      <div className="min-w-0 flex-1">
                        <p className="text-white text-sm font-mono font-semibold">{f.numeroFactura}</p>
                        <p className="text-slate-500 text-xs truncate">{f.adquirente.nombreORazonSocial} · {new Date(f.fechaEmision).toLocaleDateString('es-CO')}</p>
                      </div>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0 ${info.className}`}>{info.label}</span>
                      <p className="text-white font-mono text-sm shrink-0">{money(f.total)}</p>
                    </div>
                  );
                })}
                {facturas.length === 0 && <p className="text-slate-500 text-sm text-center py-10">Sin facturas electrónicas en el período.</p>}
              </div>
              {tieneModuloDePago(ModuloPOS.FACTURACION_DIAN) && (
                <button onClick={() => navigate('/facturacion')} className="w-full h-11 rounded-xl bg-slate-800 text-slate-300 text-sm font-semibold">Abrir módulo de Facturación</button>
              )}
            </>
          )
        )}

        {/* ── Reportes ── */}
        {pestana === 'reportes' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <BotonReporte icono={FileSpreadsheet} titulo="Libro contable en Excel" detalle="Estado de resultados, flujo de caja, gastos, cartera y rentabilidad, en hojas separadas." onClick={exportarExcel} deshabilitado={!totales} />
            <BotonReporte icono={FileText} titulo="Estado de resultados en PDF" detalle="Ingresos, gastos, utilidad, margen y gastos por categoría del período." onClick={exportarPdf} deshabilitado={!totales} />
            {tieneModulo(ModuloPOS.REPORTES) && (
              <BotonReporte icono={LayoutGrid} titulo="Reportes del negocio" detalle="Ventas, por cajero, inventario, gastos, cierres y financiero." onClick={() => navigate('/reportes')} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ListaBarras({ titulo, icono: Icono, filas, color }: { titulo: string; icono: typeof Sparkles; filas: Array<{ nombre: string; total: number }>; color: string }) {
  const maximo = Math.max(1, ...filas.map((f) => f.total));
  return (
    <div className={`${tarjeta} p-4`}>
      <div className="flex items-center gap-2 mb-3">
        <Icono className="w-4 h-4 text-slate-400" />
        <p className="text-white text-sm font-bold">{titulo}</p>
      </div>
      {filas.length === 0 ? <p className="text-slate-500 text-xs">Sin datos en el período</p> : (
        <div className="space-y-2">
          {filas.slice(0, 8).map((f) => (
            <div key={f.nombre}>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-slate-300 capitalize truncate">{f.nombre}</span>
                <span className="text-white font-mono">{money(f.total)}</span>
              </div>
              <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${(f.total / maximo) * 100}%`, background: color }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TablaRentabilidad({ titulo, icono: Icono, filas }: { titulo: string; icono: typeof Sparkles; filas: Rentabilidad[] }) {
  return (
    <div className={`${tarjeta} overflow-hidden`}>
      <div className="flex items-center gap-2 px-4 pt-4 pb-2">
        <Icono className="w-4 h-4 text-slate-400" />
        <p className="text-white text-sm font-bold">{titulo}</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-slate-500 text-[11px] uppercase tracking-wide">
            <tr>
              <th className="text-left px-4 py-2">Nombre</th>
              <th className="text-right px-3 py-2">Ventas</th>
              <th className="text-right px-3 py-2">Utilidad</th>
              <th className="text-right px-4 py-2">Margen</th>
            </tr>
          </thead>
          <tbody>
            {filas.length === 0 ? (
              <tr><td colSpan={4} className="text-center py-8 text-slate-500 text-xs">Sin ventas en el período</td></tr>
            ) : filas.map((r) => (
              <tr key={r.nombre} className="border-t border-slate-800 text-slate-300">
                <td className="px-4 py-2 max-w-[180px] truncate">{r.nombre}</td>
                <td className="px-3 py-2 text-right font-mono whitespace-nowrap">{money(r.ventas)}</td>
                <td className={`px-3 py-2 text-right font-mono whitespace-nowrap ${r.utilidad >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{money(r.utilidad)}</td>
                <td className="px-4 py-2 text-right font-mono whitespace-nowrap">{r.margen.toFixed(0)} %</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function BotonReporte({ icono: Icono, titulo, detalle, onClick, deshabilitado }: { icono: typeof Sparkles; titulo: string; detalle: string; onClick: () => void; deshabilitado?: boolean }) {
  return (
    <button onClick={onClick} disabled={deshabilitado} className={`${tarjeta} p-4 text-left flex items-start gap-3 disabled:opacity-40`}>
      <div className="w-10 h-10 rounded-xl bg-amber-500/15 flex items-center justify-center shrink-0">
        <Icono className="w-5 h-5 text-amber-400" />
      </div>
      <div>
        <p className="text-white text-sm font-bold">{titulo}</p>
        <p className="text-slate-500 text-xs mt-0.5">{detalle}</p>
      </div>
    </button>
  );
}
