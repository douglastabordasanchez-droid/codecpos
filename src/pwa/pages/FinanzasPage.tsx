/**
 * Mis finanzas — web y celular (migración 0171).
 *
 * Libro privado del dueño con sus finanzas personales y las de la empresa:
 * movimientos por cuenta, utilidad real del negocio (leída de la caja),
 * presupuestos, metas de ahorro, deudas y pagos fijos. Lo ven solo los
 * miembros del libro; el dueño da acceso desde la pestaña Acceso.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Navigate } from 'react-router';
import { toast } from 'sonner';
import {
  ChevronLeft, ChevronRight, Plus, X, Loader2, Trash2, PiggyBank, Building2, User, Target, HandCoins,
  CalendarClock, Users, Landmark, AlertTriangle, ArrowDownRight, ArrowUpRight, Repeat,
} from 'lucide-react';
import { usePwaAuth } from '../contexts/PwaAuthContext';
import { money } from '../lib/nubeConsultas';
import { cargarMovimientos, calcularTotales, cargarRentabilidad } from '../lib/contabilidadNube';
import {
  CATEGORIAS, CATEGORIA_RETIRO, categoriaDe, mesActual, moverMes, nombreMes, rangoMes, claveMes,
  saldosPorCuenta, resumenDelMes, usoPresupuestos, estadoDeuda, estadoFijos, utilidadEmpresa, cuotaMensualMeta,
  misLibros, cargarDatos, guardar, borrar, personas, invitar, quitarAcceso,
  type Ambito, type TipoMovimiento, type LibroFinanzas, type DatosFinanzas, type MovimientoFinanzas,
  type DeudaFinanzas, type FijoFinanzas, type MetaFinanzas, type PersonaFinanzas, type RolFinanzas,
} from '../lib/finanzasPersonales';

type Pestana = 'resumen' | 'movimientos' | 'empresa' | 'presupuestos' | 'metas' | 'deudas' | 'cuentas' | 'acceso';

const PESTANAS: Array<[Pestana, string]> = [
  ['resumen', 'Resumen'], ['movimientos', 'Movimientos'], ['empresa', 'Empresa'], ['presupuestos', 'Presupuestos'],
  ['metas', 'Metas'], ['deudas', 'Deudas y fijos'], ['cuentas', 'Cuentas'], ['acceso', 'Acceso'],
];

/** De dónde salen los datos. La vista de prueba pone datos de ejemplo; la app usa la nube. */
export interface FuenteFinanzas {
  misLibros: typeof misLibros;
  cargarDatos: typeof cargarDatos;
  guardar: typeof guardar;
  borrar: typeof borrar;
  personas: typeof personas;
  invitar: typeof invitar;
  quitarAcceso: typeof quitarAcceso;
  cargarCaja: (clienteId: string, desde: string, hasta: string) => Promise<{ ingresos: number; gastos: number; costo: number; ventas: number }>;
  empleado?: { id: string; cliente_id: string } | null;
}

const fuenteNube: FuenteFinanzas = {
  misLibros, cargarDatos, guardar, borrar, personas, invitar, quitarAcceso,
  cargarCaja: async (clienteId, desde, hasta) => {
    const [m, r] = await Promise.all([cargarMovimientos(clienteId, desde, hasta), cargarRentabilidad(clienteId, desde, hasta)]);
    const t = calcularTotales(m);
    return { ingresos: t.ingresos, gastos: t.gastos, costo: r.productos.reduce((a, p) => a + p.costo, 0), ventas: t.transacciones };
  },
};

export const FuenteFinanzasCtx = createContext<FuenteFinanzas>(fuenteNube);

/** Fuente actual fuera de React: la fija la página al montarse. */
let fuenteActual: FuenteFinanzas = fuenteNube;
const fuente = () => fuenteActual;

const VACIO: DatosFinanzas = { cuentas: [], movimientos: [], presupuestos: [], metas: [], deudas: [], fijos: [] };

const hoyISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const soloNumero = (t: string) => Number(t.replace(/[^\d]/g, '')) || 0;
const conPuntos = (n: number) => (n ? n.toLocaleString('es-CO') : '');
const fechaCorta = (f: string) => new Date(`${f}T12:00:00`).toLocaleDateString('es-CO', { day: '2-digit', month: 'short' });

// ── Piezas ────────────────────────────────────────────────────────────────

function Hoja({ titulo, onCerrar, children }: { titulo: string; onCerrar: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-end sm:items-center sm:justify-center" onClick={onCerrar}>
      <div className="w-full sm:max-w-md bg-slate-950 rounded-t-3xl sm:rounded-3xl border-t sm:border border-slate-800 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 pt-5 pb-3 sticky top-0 bg-slate-950 z-10">
          <h2 className="text-white font-bold text-lg">{titulo}</h2>
          <button onClick={onCerrar} className="text-slate-400" aria-label="Cerrar"><X className="w-5 h-5" /></button>
        </div>
        <div className="px-5 pb-8 space-y-4">{children}</div>
      </div>
    </div>
  );
}

function Campo({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block space-y-1.5"><span className="text-slate-400 text-xs font-semibold">{label}</span>{children}</label>;
}

const claseInput = 'w-full h-12 rounded-xl px-3 text-sm bg-slate-900 border border-slate-700 text-white outline-none focus:border-emerald-500';

function InputDinero({ valor, onCambio, autoFocus }: { valor: number; onCambio: (n: number) => void; autoFocus?: boolean }) {
  return (
    <div className="relative">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-xl font-bold">$</span>
      <input
        inputMode="numeric" autoFocus={autoFocus} value={conPuntos(valor)} placeholder="0"
        onChange={(e) => onCambio(soloNumero(e.target.value))}
        className="w-full h-14 rounded-xl pl-8 pr-3 text-2xl font-black bg-slate-900 border border-slate-700 text-white outline-none focus:border-emerald-500"
      />
    </div>
  );
}

function Segmento<T extends string>({ opciones, valor, onCambio }: { opciones: Array<[string, string]>; valor: T;
  onCambio: (v: any) => void; }) {
  return (
    <div className="grid gap-1 p-1 rounded-xl bg-slate-900 border border-slate-800" style={{ gridTemplateColumns: `repeat(${opciones.length}, 1fr)` }}>
      {opciones.map(([id, txt]) => (
        <button key={id} type="button" onClick={() => onCambio(id as T)}
          className={`h-10 rounded-lg text-sm font-bold transition-colors ${valor === id ? 'bg-emerald-500 text-white' : 'text-slate-400'}`}>
          {txt}
        </button>
      ))}
    </div>
  );
}

function Tarjeta({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`bg-slate-900/70 border border-slate-800 rounded-2xl p-4 ${className}`}>{children}</div>;
}

function Barra({ porcentaje, color }: { porcentaje: number; color: string }) {
  return (
    <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(100, Math.max(0, porcentaje))}%` }} />
    </div>
  );
}

function BotonBorrar({ onBorrar }: { onBorrar: () => void }) {
  const [seguro, setSeguro] = useState(false);
  useEffect(() => { if (!seguro) return; const t = setTimeout(() => setSeguro(false), 3000); return () => clearTimeout(t); }, [seguro]);
  return (
    <button type="button" onClick={() => (seguro ? onBorrar() : setSeguro(true))}
      className={`h-12 px-4 rounded-xl text-sm font-bold flex items-center gap-2 ${seguro ? 'bg-red-600 text-white' : 'bg-slate-900 border border-slate-700 text-red-400'}`}>
      <Trash2 className="w-4 h-4" /> {seguro ? '¿Seguro?' : 'Borrar'}
    </button>
  );
}

function Vacio({ texto }: { texto: string }) {
  return <p className="text-slate-500 text-sm text-center py-8">{texto}</p>;
}

// ── Página ────────────────────────────────────────────────────────────────

export default function FinanzasPage() {
  const f = useContext(FuenteFinanzasCtx);
  fuenteActual = f;
  const empleado = useEmpleado(f);
  const [libro, setLibro] = useState<LibroFinanzas | null>(null);
  const [sinAcceso, setSinAcceso] = useState(false);
  const [datos, setDatos] = useState<DatosFinanzas>(VACIO);
  const [cargando, setCargando] = useState(true);
  const [mes, setMes] = useState(mesActual());
  const [pestana, setPestana] = useState<Pestana>('resumen');
  const [hoja, setHoja] = useState<null | { tipo: 'movimiento'; mov?: Partial<MovimientoFinanzas> } | { tipo: 'presupuesto' } | { tipo: 'meta'; meta?: MetaFinanzas } | { tipo: 'abonarMeta'; meta: MetaFinanzas } | { tipo: 'deuda'; deuda?: DeudaFinanzas } | { tipo: 'fijo'; fijo?: FijoFinanzas } | { tipo: 'cuenta' }>(null);

  const puedeEditar = !!libro && libro.rol !== 'lector';

  const recargar = useCallback(async (l: LibroFinanzas) => {
    try {
      setDatos(await f.cargarDatos(l.id));
    } catch (e: any) {
      toast.error('No se pudieron cargar tus finanzas', { description: e?.message });
    }
  }, [f]);

  useEffect(() => {
    if (!empleado) return;
    let vivo = true;
    (async () => {
      try {
        const libros = await f.misLibros();
        if (!vivo) return;
        if (libros.length === 0) { setSinAcceso(true); return; }
        setLibro(libros[0]);
        await recargar(libros[0]);
      } catch (e: any) {
        toast.error('No se pudieron cargar tus finanzas', { description: e?.message });
      } finally {
        if (vivo) setCargando(false);
      }
    })();
    return () => { vivo = false; };
  }, [empleado?.id, recargar]);

  // Caja del negocio para la pestaña Empresa (solo si el libro es de este negocio).
  const [caja, setCaja] = useState<null | { ingresos: number; gastos: number; costo: number; ventas: number }>(null);
  const [cargandoCaja, setCargandoCaja] = useState(false);
  const cajaDisponible = !!libro?.cliente_id && libro.cliente_id === empleado?.cliente_id;
  useEffect(() => {
    if (!cajaDisponible || !libro?.cliente_id) { setCaja(null); return; }
    let vivo = true;
    setCargandoCaja(true);
    const { desde, hasta } = rangoMes(mes);
    f.cargarCaja(libro.cliente_id, desde, hasta)
      .then((c) => { if (vivo) setCaja(c); })
      .catch(() => vivo && setCaja(null))
      .finally(() => vivo && setCargandoCaja(false));
    return () => { vivo = false; };
  }, [cajaDisponible, libro?.cliente_id, mes, f]);

  const saldos = useMemo(() => saldosPorCuenta(datos.cuentas, datos.movimientos), [datos]);
  const personal = useMemo(() => resumenDelMes(datos.movimientos, mes, 'personal'), [datos, mes]);
  const empresaManual = useMemo(() => resumenDelMes(datos.movimientos, mes, 'empresa'), [datos, mes]);
  const empresa = useMemo(() => utilidadEmpresa(caja ?? { ingresos: 0, gastos: 0, costo: 0 }, datos.movimientos, mes), [caja, datos, mes]);
  const presupuestos = useMemo(() => usoPresupuestos(datos.presupuestos, datos.movimientos, mes), [datos, mes]);
  const fijos = useMemo(() => estadoFijos(datos.fijos, datos.movimientos, mes), [datos, mes]);
  const deudas = useMemo(() => datos.deudas.map((d) => ({ deuda: d, ...estadoDeuda(d, datos.movimientos) })), [datos]);
  const totalCuentas = [...saldos.values()].reduce((a, v) => a + v, 0);
  const meDeben = deudas.filter((d) => d.deuda.tipo === 'me_deben' && !d.deuda.saldada).reduce((a, d) => a + d.saldo, 0);
  const debo = deudas.filter((d) => d.deuda.tipo === 'debo' && !d.deuda.saldada).reduce((a, d) => a + d.saldo, 0);

  if (!empleado) return null;
  if (sinAcceso) return <Navigate to="/" replace />;

  const ejecutar = async (accion: () => Promise<void>, ok: string) => {
    if (!libro) return;
    try {
      await accion();
      toast.success(ok);
      setHoja(null);
      await recargar(libro);
    } catch (e: any) {
      toast.error('No se pudo guardar', { description: e?.message });
    }
  };

  const alertas: string[] = [
    ...presupuestos.filter((p) => p.estado === 'pasado').map((p) => `Te pasaste del presupuesto de ${p.categoria.nombre.toLowerCase()} (${Math.round(p.porcentaje)} %)`),
    ...fijos.filter((f) => f.vencido).map((f) => `${f.fijo.nombre} venció el día ${f.fijo.dia_mes} y no está pagado`),
    ...fijos.filter((f) => !f.pagado && !f.vencido && f.diasParaPagar <= 3).map((f) => `${f.fijo.nombre} se paga ${f.diasParaPagar === 0 ? 'hoy' : `en ${f.diasParaPagar} días`}`),
    ...deudas.filter((d) => !d.deuda.saldada && d.deuda.vence && d.deuda.vence < hoyISO() && d.saldo > 0).map((d) => `${d.deuda.tipo === 'debo' ? 'Tu deuda con' : 'La deuda de'} ${d.deuda.persona} ya venció`),
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 pb-28">
      <div className="px-5 pt-8 pb-3 flex items-center justify-between">
        <div>
          <h1 className="text-white text-xl font-black flex items-center gap-2"><PiggyBank className="w-5 h-5 text-emerald-400" /> Mis finanzas</h1>
          <p className="text-slate-400 text-sm">Tu plata y la de la empresa, solo para ti{libro?.rol === 'lector' ? ' · solo lectura' : ''}</p>
        </div>
        {puedeEditar && (
          <button onClick={() => setHoja({ tipo: 'movimiento' })} aria-label="Registrar movimiento"
            className="h-11 w-11 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-500/30">
            <Plus className="w-5 h-5 text-white" />
          </button>
        )}
      </div>

      <div className="px-5 flex items-center justify-between mb-3">
        <button onClick={() => setMes(moverMes(mes, -1))} className="h-9 w-9 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-300" aria-label="Mes anterior"><ChevronLeft className="w-4 h-4" /></button>
        <p className="text-white font-bold">{nombreMes(mes)}</p>
        <button onClick={() => setMes(moverMes(mes, 1))} className="h-9 w-9 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-300" aria-label="Mes siguiente"><ChevronRight className="w-4 h-4" /></button>
      </div>

      <div className="px-5 mb-4 flex gap-2 overflow-x-auto no-scrollbar">
        {PESTANAS.filter(([id]) => id !== 'acceso' || libro?.rol === 'dueno').map(([id, txt]) => (
          <button key={id} onClick={() => setPestana(id)}
            className={`shrink-0 h-9 px-4 rounded-full text-sm font-bold ${pestana === id ? 'bg-emerald-500 text-white' : 'bg-slate-900 border border-slate-800 text-slate-400'}`}>
            {txt}
          </button>
        ))}
      </div>

      {cargando ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 text-emerald-400 animate-spin" /></div>
      ) : (
        <div className="px-5 space-y-3">
          {pestana === 'resumen' && (
            <>
              <div className="rounded-2xl p-5 bg-gradient-to-br from-emerald-500/90 to-teal-700/90 shadow-xl shadow-emerald-500/10">
                <p className="text-white/80 text-xs font-bold uppercase tracking-wide">Lo que tienes hoy</p>
                <p className="text-white text-3xl font-black mt-1">{money(totalCuentas + meDeben - debo)}</p>
                <p className="text-white/75 text-xs mt-1">En cuentas {money(totalCuentas)} · te deben {money(meDeben)} · debes {money(debo)}</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Tarjeta>
                  <p className="text-slate-400 text-xs font-semibold flex items-center gap-1"><User className="w-3.5 h-3.5" /> Personal del mes</p>
                  <p className={`text-xl font-black mt-1 ${personal.balance >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{money(personal.balance)}</p>
                  <p className="text-slate-500 text-[11px] mt-1">Entró {money(personal.ingresos)}<br />Salió {money(personal.gastos)}</p>
                  {personal.ingresos > 0 && <p className="text-slate-400 text-[11px] mt-1">Ahorras el {Math.round(personal.tasaAhorro)} %</p>}
                </Tarjeta>
                <Tarjeta>
                  <p className="text-slate-400 text-xs font-semibold flex items-center gap-1"><Building2 className="w-3.5 h-3.5" /> Utilidad empresa</p>
                  {cargandoCaja ? <Loader2 className="w-4 h-4 mt-2 text-slate-500 animate-spin" /> : (
                    <>
                      <p className={`text-xl font-black mt-1 ${empresa.utilidad >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{money(empresa.utilidad)}</p>
                      <p className="text-slate-500 text-[11px] mt-1">Margen {Math.round(empresa.margen)} %<br />Retiraste {money(empresa.retiros)}</p>
                    </>
                  )}
                </Tarjeta>
              </div>

              {alertas.length > 0 && (
                <Tarjeta className="border-amber-500/40">
                  <p className="text-amber-400 text-sm font-bold flex items-center gap-2 mb-2"><AlertTriangle className="w-4 h-4" /> Pendientes</p>
                  <ul className="space-y-1">{alertas.map((a) => <li key={a} className="text-slate-300 text-sm">• {a}</li>)}</ul>
                </Tarjeta>
              )}

              <Tarjeta>
                <p className="text-white font-bold text-sm mb-3">¿En qué se fue tu plata este mes?</p>
                {personal.porCategoria.length === 0 ? <p className="text-slate-500 text-sm">Aún no registras gastos personales este mes.</p> : (
                  <div className="space-y-2.5">
                    {personal.porCategoria.slice(0, 6).map(({ categoria, total }) => (
                      <div key={categoria.id}>
                        <div className="flex justify-between text-sm mb-1"><span className="text-slate-300">{categoria.emoji} {categoria.nombre}</span><span className="text-white font-semibold">{money(total)}</span></div>
                        <Barra porcentaje={(total / personal.gastos) * 100} color="bg-emerald-500" />
                      </div>
                    ))}
                  </div>
                )}
              </Tarjeta>

              <Tarjeta>
                <p className="text-white font-bold text-sm mb-2">Cuentas</p>
                {datos.cuentas.filter((c) => c.activa).map((c) => (
                  <div key={c.id} className="flex justify-between py-1.5 text-sm"><span className="text-slate-300">{c.nombre}</span><span className={`font-semibold ${(saldos.get(c.id) || 0) < 0 ? 'text-red-400' : 'text-white'}`}>{money(saldos.get(c.id) || 0)}</span></div>
                ))}
              </Tarjeta>
            </>
          )}

          {pestana === 'movimientos' && (
            <ListaMovimientos datos={datos} mes={mes} puedeEditar={puedeEditar} onEditar={(m) => setHoja({ tipo: 'movimiento', mov: m })} />
          )}

          {pestana === 'empresa' && (
            <>
              {!cajaDisponible && <Tarjeta><p className="text-slate-400 text-sm">Las ventas de la caja solo se ven entrando con un usuario del negocio. Aquí salen los movimientos de empresa que registres.</p></Tarjeta>}
              <Tarjeta>
                <p className="text-white font-bold text-sm mb-3">Utilidad real de {nombreMes(mes).toLowerCase()}</p>
                {cargandoCaja ? <Loader2 className="w-5 h-5 text-slate-500 animate-spin" /> : (
                  <div className="space-y-1.5 text-sm">
                    <Fila t={`Ventas de la caja${caja ? ` (${caja.ventas})` : ''}`} v={empresa.ventas} />
                    <Fila t="Costo de lo vendido" v={-empresa.costoVentas} />
                    <Fila t="Gastos registrados en la caja" v={-empresa.gastosCaja} />
                    <Fila t="Ingresos registrados aquí" v={empresa.ingresosExtra} />
                    <Fila t="Gastos registrados aquí" v={-empresa.gastosExtra} />
                    <div className="border-t border-slate-800 pt-2 mt-2"><Fila t="Utilidad" v={empresa.utilidad} fuerte /></div>
                    <p className="text-slate-500 text-xs">Margen {Math.round(empresa.margen)} %</p>
                    <div className="border-t border-slate-800 pt-2 mt-2 space-y-1.5">
                      <Fila t="Lo que retiraste para ti" v={-empresa.retiros} />
                      <Fila t="Queda en la empresa" v={empresa.queda} fuerte />
                    </div>
                  </div>
                )}
              </Tarjeta>
              <Tarjeta>
                <p className="text-white font-bold text-sm mb-2">Gastos de la empresa registrados aquí</p>
                {empresaManual.porCategoria.length === 0 ? <p className="text-slate-500 text-sm">Nada este mes. Registra con el botón + y elige «Empresa».</p> :
                  <div className="space-y-1.5 text-sm">{empresaManual.porCategoria.map(({ categoria, total }) => <Fila key={categoria.id} t={`${categoria.emoji} ${categoria.nombre}`} v={total} />)}</div>}
              </Tarjeta>
              <p className="text-slate-500 text-xs px-1">Para pasar plata de la empresa a tu bolsillo, registra un ingreso personal con la categoría «Retiro de la empresa».</p>
            </>
          )}

          {pestana === 'presupuestos' && (
            <>
              {puedeEditar && <BotonAgregar texto="Nuevo presupuesto" onClick={() => setHoja({ tipo: 'presupuesto' })} />}
              {presupuestos.length === 0 && <Vacio texto="Ponle un tope mensual a tus categorías y te aviso al llegar al 80 %." />}
              {presupuestos.map((p) => (
                <Tarjeta key={p.presupuesto.id}>
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <p className="text-white font-semibold text-sm">{p.categoria.emoji} {p.categoria.nombre}</p>
                      <p className="text-slate-500 text-xs">{p.presupuesto.ambito === 'empresa' ? 'Empresa' : 'Personal'} · {money(p.gastado)} de {money(p.presupuesto.monto_mensual)}</p>
                    </div>
                    {puedeEditar && <button onClick={() => ejecutar(() => fuente().borrar('finanzas_presupuestos', libro!.id, p.presupuesto.id), 'Presupuesto quitado')} className="text-slate-500" aria-label="Quitar"><Trash2 className="w-4 h-4" /></button>}
                  </div>
                  <Barra porcentaje={p.porcentaje} color={p.estado === 'pasado' ? 'bg-red-500' : p.estado === 'cerca' ? 'bg-amber-500' : 'bg-emerald-500'} />
                  <p className={`text-xs mt-1.5 ${p.estado === 'pasado' ? 'text-red-400' : 'text-slate-400'}`}>
                    {p.estado === 'pasado' ? `Te pasaste ${money(p.gastado - p.presupuesto.monto_mensual)}` : `Te quedan ${money(p.presupuesto.monto_mensual - p.gastado)}`}
                  </p>
                </Tarjeta>
              ))}
            </>
          )}

          {pestana === 'metas' && (
            <>
              {puedeEditar && <BotonAgregar texto="Nueva meta de ahorro" onClick={() => setHoja({ tipo: 'meta' })} />}
              {datos.metas.length === 0 && <Vacio texto="Crea una meta (moto, viaje, fondo de emergencia) y ve abonándole." />}
              {datos.metas.map((m) => {
                const pct = (m.ahorrado / m.objetivo) * 100;
                const cuota = cuotaMensualMeta(m);
                return (
                  <Tarjeta key={m.id}>
                    <div className="flex justify-between items-start">
                      <button className="text-left" onClick={() => puedeEditar && setHoja({ tipo: 'meta', meta: m })}>
                        <p className="text-white font-semibold text-sm flex items-center gap-1.5"><Target className="w-4 h-4 text-emerald-400" /> {m.nombre}</p>
                        <p className="text-slate-500 text-xs">{money(m.ahorrado)} de {money(m.objetivo)}{m.fecha_limite ? ` · para el ${fechaCorta(m.fecha_limite)} de ${m.fecha_limite.slice(0, 4)}` : ''}</p>
                      </button>
                      {puedeEditar && <button onClick={() => setHoja({ tipo: 'abonarMeta', meta: m })} className="h-8 px-3 rounded-full bg-emerald-500/15 text-emerald-400 text-xs font-bold">Abonar</button>}
                    </div>
                    <div className="mt-3"><Barra porcentaje={pct} color="bg-emerald-500" /></div>
                    <p className="text-slate-400 text-xs mt-1.5">
                      {pct >= 100 ? '¡Meta cumplida!' : `${Math.round(pct)} %${cuota ? ` · ahorra ${money(cuota)} al mes para llegar` : ''}`}
                    </p>
                  </Tarjeta>
                );
              })}
            </>
          )}

          {pestana === 'deudas' && (
            <>
              <p className="text-white font-bold text-sm pt-1 flex items-center gap-2"><CalendarClock className="w-4 h-4 text-emerald-400" /> Pagos fijos del mes</p>
              {puedeEditar && <BotonAgregar texto="Nuevo pago fijo (arriendo, internet...)" onClick={() => setHoja({ tipo: 'fijo' })} />}
              {fijos.length === 0 && <Vacio texto="Sin pagos fijos." />}
              {fijos.map(({ fijo, pagado, vencido }) => (
                <Tarjeta key={fijo.id} className={vencido ? 'border-red-500/40' : ''}>
                  <div className="flex justify-between items-center gap-3">
                    <button className="text-left min-w-0" onClick={() => puedeEditar && setHoja({ tipo: 'fijo', fijo })}>
                      <p className="text-white font-semibold text-sm truncate">{fijo.nombre}</p>
                      <p className="text-slate-500 text-xs">{money(fijo.monto)} · día {fijo.dia_mes} · {fijo.ambito === 'empresa' ? 'empresa' : 'personal'}</p>
                    </button>
                    {pagado ? <span className="text-emerald-400 text-xs font-bold shrink-0">Pagado ✓</span> : puedeEditar ? (
                      <button className={`h-8 px-3 rounded-full text-xs font-bold shrink-0 ${vencido ? 'bg-red-500 text-white' : 'bg-emerald-500/15 text-emerald-400'}`}
                        onClick={() => setHoja({ tipo: 'movimiento', mov: { tipo: 'gasto', ambito: fijo.ambito, categoria: fijo.categoria, monto: fijo.monto, cuenta_id: fijo.cuenta_id, descripcion: fijo.nombre, fijo_id: fijo.id, fecha: claveMes(hoyISO()) === mes ? hoyISO() : `${mes}-${String(Math.min(fijo.dia_mes, 28)).padStart(2, '0')}` } })}>
                        Pagar
                      </button>
                    ) : <span className="text-amber-400 text-xs font-bold">Pendiente</span>}
                  </div>
                </Tarjeta>
              ))}

              <p className="text-white font-bold text-sm pt-3 flex items-center gap-2"><HandCoins className="w-4 h-4 text-emerald-400" /> Deudas</p>
              {puedeEditar && <BotonAgregar texto="Nueva deuda" onClick={() => setHoja({ tipo: 'deuda' })} />}
              {deudas.length === 0 && <Vacio texto="Sin deudas registradas." />}
              {deudas.map(({ deuda, abonado, saldo }) => (
                <Tarjeta key={deuda.id} className={deuda.saldada ? 'opacity-60' : ''}>
                  <div className="flex justify-between items-start gap-3">
                    <button className="text-left min-w-0" onClick={() => puedeEditar && setHoja({ tipo: 'deuda', deuda })}>
                      <p className={`text-[10px] font-bold uppercase ${deuda.tipo === 'debo' ? 'text-red-400' : 'text-sky-400'}`}>{deuda.tipo === 'debo' ? 'Debo' : 'Me deben'} · {deuda.ambito}</p>
                      <p className="text-white font-semibold text-sm truncate">{deuda.persona}{deuda.concepto ? ` · ${deuda.concepto}` : ''}</p>
                      <p className="text-slate-500 text-xs">Abonado {money(abonado)} de {money(deuda.monto)}{deuda.vence ? ` · vence ${fechaCorta(deuda.vence)}` : ''}</p>
                    </button>
                    <div className="text-right shrink-0">
                      <p className="text-white font-black text-sm">{money(saldo)}</p>
                      {!deuda.saldada && saldo > 0 && puedeEditar && (
                        <button className="mt-1 h-7 px-3 rounded-full bg-emerald-500/15 text-emerald-400 text-xs font-bold"
                          onClick={() => setHoja({ tipo: 'movimiento', mov: { tipo: deuda.tipo === 'debo' ? 'gasto' : 'ingreso', ambito: deuda.ambito, categoria: deuda.tipo === 'debo' ? 'deudas' : 'cobro_deuda', monto: saldo, descripcion: `${deuda.tipo === 'debo' ? 'Abono a' : 'Abono de'} ${deuda.persona}`, deuda_id: deuda.id } })}>
                          Abonar
                        </button>
                      )}
                      {deuda.saldada && <p className="text-emerald-400 text-xs font-bold mt-1">Saldada ✓</p>}
                    </div>
                  </div>
                  <div className="mt-2"><Barra porcentaje={(abonado / deuda.monto) * 100} color={deuda.tipo === 'debo' ? 'bg-red-500' : 'bg-sky-500'} /></div>
                </Tarjeta>
              ))}
            </>
          )}

          {pestana === 'cuentas' && (
            <>
              {puedeEditar && <BotonAgregar texto="Nueva cuenta" onClick={() => setHoja({ tipo: 'cuenta' })} />}
              {datos.cuentas.map((c) => (
                <Tarjeta key={c.id}>
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="text-white font-semibold text-sm flex items-center gap-1.5"><Landmark className="w-4 h-4 text-emerald-400" /> {c.nombre}</p>
                      <p className="text-slate-500 text-xs capitalize">{c.tipo} · saldo inicial {money(c.saldo_inicial)}</p>
                    </div>
                    <p className={`font-black ${(saldos.get(c.id) || 0) < 0 ? 'text-red-400' : 'text-white'}`}>{money(saldos.get(c.id) || 0)}</p>
                  </div>
                </Tarjeta>
              ))}
              <p className="text-slate-500 text-xs px-1">Para mover plata entre cuentas (por ejemplo de Nequi a efectivo) usa el botón + y elige «Transferencia».</p>
            </>
          )}

          {pestana === 'acceso' && libro?.rol === 'dueno' && <Acceso libroId={libro.id} miId={empleado.id} />}
        </div>
      )}

      {hoja?.tipo === 'movimiento' && libro && (
        <FormMovimiento libroId={libro.id} datos={datos} inicial={hoja.mov} onCerrar={() => setHoja(null)} ejecutar={ejecutar} empleadoId={empleado.id} />
      )}
      {hoja?.tipo === 'presupuesto' && libro && <FormPresupuesto libroId={libro.id} onCerrar={() => setHoja(null)} ejecutar={ejecutar} />}
      {hoja?.tipo === 'meta' && libro && <FormMeta libroId={libro.id} meta={hoja.meta} onCerrar={() => setHoja(null)} ejecutar={ejecutar} />}
      {hoja?.tipo === 'abonarMeta' && libro && <FormAbonoMeta libroId={libro.id} meta={hoja.meta} onCerrar={() => setHoja(null)} ejecutar={ejecutar} />}
      {hoja?.tipo === 'deuda' && libro && <FormDeuda libroId={libro.id} deuda={hoja.deuda} onCerrar={() => setHoja(null)} ejecutar={ejecutar} />}
      {hoja?.tipo === 'fijo' && libro && <FormFijo libroId={libro.id} fijo={hoja.fijo} datos={datos} onCerrar={() => setHoja(null)} ejecutar={ejecutar} />}
      {hoja?.tipo === 'cuenta' && libro && <FormCuenta libroId={libro.id} onCerrar={() => setHoja(null)} ejecutar={ejecutar} />}
    </div>
  );
}

/** La vista de prueba no tiene sesión: usa el empleado de la fuente. */
function useEmpleado(f: FuenteFinanzas): { id: string; cliente_id: string } | null {
  let auth: ReturnType<typeof usePwaAuth> | null = null;
  try { auth = usePwaAuth(); } catch { auth = null; }
  return f.empleado !== undefined ? f.empleado : auth?.empleado ?? null;
}

type Ejecutar = (accion: () => Promise<void>, ok: string) => Promise<void>;

function Fila({ t, v, fuerte }: { t: string; v: number; fuerte?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <span className={fuerte ? 'text-white font-bold' : 'text-slate-400'}>{t}</span>
      <span className={`${fuerte ? 'font-black' : 'font-semibold'} ${v < 0 ? 'text-red-400' : fuerte ? 'text-emerald-400' : 'text-white'}`}>{v < 0 ? `− ${money(-v)}` : money(v)}</span>
    </div>
  );
}

function BotonAgregar({ texto, onClick }: { texto: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="w-full h-12 rounded-2xl border border-dashed border-slate-700 text-emerald-400 text-sm font-bold flex items-center justify-center gap-2">
      <Plus className="w-4 h-4" /> {texto}
    </button>
  );
}

function ListaMovimientos({ datos, mes, puedeEditar, onEditar }: { datos: DatosFinanzas; mes: string; puedeEditar: boolean; onEditar: (m: MovimientoFinanzas) => void }) {
  const [filtro, setFiltro] = useState<'todos' | Ambito>('todos');
  const cuentas = new Map(datos.cuentas.map((c) => [c.id, c.nombre]));
  const lista = datos.movimientos.filter((m) => claveMes(m.fecha) === mes && (filtro === 'todos' || m.ambito === filtro));
  return (
    <>
      <Segmento opciones={[['todos', 'Todos'], ['personal', 'Personal'], ['empresa', 'Empresa']]} valor={filtro} onCambio={setFiltro} />
      {lista.length === 0 && <Vacio texto="Sin movimientos este mes." />}
      {lista.map((m) => {
        const cat = categoriaDe(m.ambito, m.tipo, m.categoria);
        const signo = m.tipo === 'ingreso' ? '+' : m.tipo === 'gasto' ? '−' : '';
        const color = m.tipo === 'ingreso' ? 'text-emerald-400' : m.tipo === 'gasto' ? 'text-red-400' : 'text-sky-400';
        const Icono = m.tipo === 'ingreso' ? ArrowUpRight : m.tipo === 'gasto' ? ArrowDownRight : Repeat;
        return (
          <button key={m.id} onClick={() => puedeEditar && onEditar(m)} className="w-full text-left bg-slate-900/70 border border-slate-800 rounded-xl p-3 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center text-lg shrink-0">{cat.emoji}</div>
            <div className="min-w-0 flex-1">
              <p className="text-white font-semibold text-sm truncate">{m.descripcion || cat.nombre}</p>
              <p className="text-slate-500 text-xs truncate">
                {fechaCorta(m.fecha)} · {cat.nombre} · {m.ambito === 'empresa' ? 'Empresa' : 'Personal'}
                {m.cuenta_id && cuentas.get(m.cuenta_id) ? ` · ${cuentas.get(m.cuenta_id)}${m.tipo === 'transferencia' && m.cuenta_destino_id ? ` → ${cuentas.get(m.cuenta_destino_id) || ''}` : ''}` : ''}
              </p>
            </div>
            <p className={`font-bold text-sm flex items-center gap-0.5 ${color}`}><Icono className="w-3.5 h-3.5" />{signo}{money(m.monto)}</p>
          </button>
        );
      })}
    </>
  );
}

function FormMovimiento({ libroId, datos, inicial, onCerrar, ejecutar, empleadoId }: {
  libroId: string; datos: DatosFinanzas; inicial?: Partial<MovimientoFinanzas>; onCerrar: () => void; ejecutar: Ejecutar; empleadoId: string;
}) {
  const cuentasActivas = datos.cuentas.filter((c) => c.activa);
  const [tipo, setTipo] = useState<TipoMovimiento>(inicial?.tipo ?? 'gasto');
  const [ambito, setAmbito] = useState<Ambito>(inicial?.ambito ?? 'personal');
  const [monto, setMonto] = useState(inicial?.monto ?? 0);
  const [categoria, setCategoria] = useState(inicial?.categoria ?? 'mercado');
  const [cuenta, setCuenta] = useState(inicial?.cuenta_id ?? cuentasActivas[0]?.id ?? '');
  const [destino, setDestino] = useState(inicial?.cuenta_destino_id ?? cuentasActivas[1]?.id ?? '');
  const [fecha, setFecha] = useState(inicial?.fecha ?? hoyISO());
  const [descripcion, setDescripcion] = useState(inicial?.descripcion ?? '');
  const [guardando, setGuardando] = useState(false);

  const categorias = tipo === 'transferencia' ? [] : CATEGORIAS[ambito][tipo];
  useEffect(() => {
    if (tipo !== 'transferencia' && !categorias.some((c) => c.id === categoria)) setCategoria(categorias[0]?.id ?? 'otros');
  }, [tipo, ambito]); // eslint-disable-line react-hooks/exhaustive-deps

  const enviar = async () => {
    if (monto <= 0) { toast.error('Escribe el valor'); return; }
    if (tipo === 'transferencia' && (!cuenta || !destino || cuenta === destino)) { toast.error('Elige dos cuentas distintas'); return; }
    setGuardando(true);
    await ejecutar(() => fuente().guardar('finanzas_movimientos', libroId, {
      ...(inicial?.id ? { id: inicial.id } : { creado_por: empleadoId }),
      tipo, ambito, monto, fecha,
      categoria: tipo === 'transferencia' ? 'transferencia' : categoria,
      cuenta_id: cuenta || null,
      cuenta_destino_id: tipo === 'transferencia' ? destino || null : null,
      descripcion: descripcion.trim() || null,
      deuda_id: inicial?.deuda_id ?? null,
      fijo_id: inicial?.fijo_id ?? null,
    }), inicial?.id ? 'Movimiento actualizado' : tipo === 'gasto' ? 'Gasto registrado' : tipo === 'ingreso' ? 'Ingreso registrado' : 'Transferencia registrada');
    setGuardando(false);
  };

  return (
    <Hoja titulo={inicial?.id ? 'Editar movimiento' : 'Nuevo movimiento'} onCerrar={onCerrar}>
      <Segmento opciones={[['gasto', 'Gasto'], ['ingreso', 'Ingreso'], ['transferencia', 'Transferencia']]} valor={tipo} onCambio={setTipo} />
      {tipo !== 'transferencia' && <Segmento opciones={[['personal', 'Personal'], ['empresa', 'Empresa']]} valor={ambito} onCambio={setAmbito} />}
      <Campo label="Valor"><InputDinero valor={monto} onCambio={setMonto} autoFocus={!inicial?.monto} /></Campo>
      {tipo !== 'transferencia' && (
        <Campo label="Categoría">
          <div className="grid grid-cols-3 gap-2">
            {categorias.map((c) => (
              <button key={c.id} type="button" onClick={() => setCategoria(c.id)}
                className={`min-h-[64px] rounded-xl p-2 text-[11px] font-semibold leading-tight flex flex-col items-center justify-center gap-1 ${categoria === c.id ? 'bg-emerald-500 text-white' : 'bg-slate-900 border border-slate-800 text-slate-300'}`}>
                <span className="text-lg">{c.emoji}</span>{c.nombre}
              </button>
            ))}
          </div>
        </Campo>
      )}
      {tipo === 'ingreso' && ambito === 'personal' && categoria === CATEGORIA_RETIRO && (
        <p className="text-slate-400 text-xs">Este valor también sale en la pestaña Empresa como lo que retiraste.</p>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Campo label={tipo === 'transferencia' ? 'Sale de' : tipo === 'ingreso' ? 'Entra a' : 'Sale de'}>
          <select value={cuenta} onChange={(e) => setCuenta(e.target.value)} className={claseInput}>
            <option value="">Sin cuenta</option>
            {cuentasActivas.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
        </Campo>
        {tipo === 'transferencia' ? (
          <Campo label="Entra a">
            <select value={destino} onChange={(e) => setDestino(e.target.value)} className={claseInput}>
              {cuentasActivas.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </Campo>
        ) : (
          <Campo label="Fecha"><input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className={claseInput} /></Campo>
        )}
      </div>
      {tipo === 'transferencia' && <Campo label="Fecha"><input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className={claseInput} /></Campo>}
      <Campo label="Nota (opcional)"><input value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder="Ej: mercado del mes" className={claseInput} /></Campo>
      <div className="flex gap-2">
        {inicial?.id && <BotonBorrar onBorrar={() => ejecutar(() => fuente().borrar('finanzas_movimientos', libroId, inicial.id!), 'Movimiento borrado')} />}
        <button onClick={enviar} disabled={guardando} className="flex-1 h-12 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-bold flex items-center justify-center gap-2 disabled:opacity-60">
          {guardando && <Loader2 className="w-4 h-4 animate-spin" />} Guardar
        </button>
      </div>
    </Hoja>
  );
}

function BotonGuardar({ onClick }: { onClick: () => void }) {
  const [g, setG] = useState(false);
  return (
    <button onClick={async () => { setG(true); try { await onClick(); } finally { setG(false); } }} disabled={g}
      className="flex-1 h-12 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-bold flex items-center justify-center gap-2 disabled:opacity-60">
      {g && <Loader2 className="w-4 h-4 animate-spin" />} Guardar
    </button>
  );
}

function FormPresupuesto({ libroId, onCerrar, ejecutar }: { libroId: string; onCerrar: () => void; ejecutar: Ejecutar }) {
  const [ambito, setAmbito] = useState<Ambito>('personal');
  const [categoria, setCategoria] = useState('mercado');
  const [monto, setMonto] = useState(0);
  const cats = CATEGORIAS[ambito].gasto;
  return (
    <Hoja titulo="Nuevo presupuesto" onCerrar={onCerrar}>
      <Segmento opciones={[['personal', 'Personal'], ['empresa', 'Empresa']]} valor={ambito} onCambio={(a) => { setAmbito(a); setCategoria(CATEGORIAS[a].gasto[0].id); }} />
      <Campo label="Categoría">
        <select value={categoria} onChange={(e) => setCategoria(e.target.value)} className={claseInput}>
          {cats.map((c) => <option key={c.id} value={c.id}>{c.emoji} {c.nombre}</option>)}
        </select>
      </Campo>
      <Campo label="Tope al mes"><InputDinero valor={monto} onCambio={setMonto} /></Campo>
      <div className="flex"><BotonGuardar onClick={() => monto > 0 ? ejecutar(() => fuente().guardar('finanzas_presupuestos', libroId, { ambito, categoria, monto_mensual: monto }), 'Presupuesto creado') : Promise.resolve(void toast.error('Escribe el tope'))} /></div>
    </Hoja>
  );
}

function FormMeta({ libroId, meta, onCerrar, ejecutar }: { libroId: string; meta?: MetaFinanzas; onCerrar: () => void; ejecutar: Ejecutar }) {
  const [nombre, setNombre] = useState(meta?.nombre ?? '');
  const [objetivo, setObjetivo] = useState(meta?.objetivo ?? 0);
  const [fecha, setFecha] = useState(meta?.fecha_limite ?? '');
  return (
    <Hoja titulo={meta ? 'Editar meta' : 'Nueva meta de ahorro'} onCerrar={onCerrar}>
      <Campo label="¿Para qué ahorras?"><input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej: fondo de emergencia" className={claseInput} autoFocus /></Campo>
      <Campo label="¿Cuánto necesitas?"><InputDinero valor={objetivo} onCambio={setObjetivo} /></Campo>
      <Campo label="¿Para cuándo? (opcional)"><input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className={claseInput} /></Campo>
      <div className="flex gap-2">
        {meta && <BotonBorrar onBorrar={() => ejecutar(() => fuente().borrar('finanzas_metas', libroId, meta.id), 'Meta borrada')} />}
        <BotonGuardar onClick={() => (!nombre.trim() || objetivo <= 0) ? Promise.resolve(void toast.error('Escribe el nombre y el valor')) :
          ejecutar(() => fuente().guardar('finanzas_metas', libroId, { ...(meta ? { id: meta.id } : {}), nombre: nombre.trim(), objetivo, fecha_limite: fecha || null }), meta ? 'Meta actualizada' : 'Meta creada')} />
      </div>
    </Hoja>
  );
}

function FormAbonoMeta({ libroId, meta, onCerrar, ejecutar }: { libroId: string; meta: MetaFinanzas; onCerrar: () => void; ejecutar: Ejecutar }) {
  const [monto, setMonto] = useState(0);
  const [sacar, setSacar] = useState(false);
  return (
    <Hoja titulo={meta.nombre} onCerrar={onCerrar}>
      <Segmento opciones={[['abonar', 'Abonar'], ['sacar', 'Sacar']]} valor={sacar ? 'sacar' : 'abonar'} onCambio={(v) => setSacar(v === 'sacar')} />
      <Campo label="Valor"><InputDinero valor={monto} onCambio={setMonto} autoFocus /></Campo>
      <p className="text-slate-500 text-xs">Llevas {money(meta.ahorrado)} de {money(meta.objetivo)}.</p>
      <div className="flex"><BotonGuardar onClick={() => monto <= 0 ? Promise.resolve(void toast.error('Escribe el valor')) :
        ejecutar(() => fuente().guardar('finanzas_metas', libroId, { id: meta.id, ahorrado: Math.max(0, meta.ahorrado + (sacar ? -monto : monto)) }), sacar ? 'Retiro anotado' : '¡Abono anotado!')} /></div>
    </Hoja>
  );
}

function FormDeuda({ libroId, deuda, onCerrar, ejecutar }: { libroId: string; deuda?: DeudaFinanzas; onCerrar: () => void; ejecutar: Ejecutar }) {
  const [tipo, setTipo] = useState<'debo' | 'me_deben'>(deuda?.tipo ?? 'debo');
  const [ambito, setAmbito] = useState<Ambito>(deuda?.ambito ?? 'personal');
  const [persona, setPersona] = useState(deuda?.persona ?? '');
  const [concepto, setConcepto] = useState(deuda?.concepto ?? '');
  const [monto, setMonto] = useState(deuda?.monto ?? 0);
  const [vence, setVence] = useState(deuda?.vence ?? '');
  const [saldada, setSaldada] = useState(deuda?.saldada ?? false);
  return (
    <Hoja titulo={deuda ? 'Editar deuda' : 'Nueva deuda'} onCerrar={onCerrar}>
      <Segmento opciones={[['debo', 'Yo debo'], ['me_deben', 'Me deben']]} valor={tipo} onCambio={setTipo} />
      <Segmento opciones={[['personal', 'Personal'], ['empresa', 'Empresa']]} valor={ambito} onCambio={setAmbito} />
      <Campo label={tipo === 'debo' ? '¿A quién?' : '¿Quién?'}><input value={persona} onChange={(e) => setPersona(e.target.value)} placeholder="Ej: Banco, Juan, proveedor" className={claseInput} autoFocus={!deuda} /></Campo>
      <Campo label="Concepto (opcional)"><input value={concepto} onChange={(e) => setConcepto(e.target.value)} placeholder="Ej: préstamo moto" className={claseInput} /></Campo>
      <Campo label="Valor total"><InputDinero valor={monto} onCambio={setMonto} /></Campo>
      <Campo label="Vence (opcional)"><input type="date" value={vence} onChange={(e) => setVence(e.target.value)} className={claseInput} /></Campo>
      {deuda && (
        <label className="flex items-center gap-3 text-slate-300 text-sm"><input type="checkbox" checked={saldada} onChange={(e) => setSaldada(e.target.checked)} className="w-5 h-5 accent-emerald-500" /> Ya está saldada</label>
      )}
      <p className="text-slate-500 text-xs">Los abonos se registran con el botón «Abonar» de la deuda y descuentan de tu cuenta.</p>
      <div className="flex gap-2">
        {deuda && <BotonBorrar onBorrar={() => ejecutar(() => fuente().borrar('finanzas_deudas', libroId, deuda.id), 'Deuda borrada')} />}
        <BotonGuardar onClick={() => (!persona.trim() || monto <= 0) ? Promise.resolve(void toast.error('Escribe la persona y el valor')) :
          ejecutar(() => fuente().guardar('finanzas_deudas', libroId, { ...(deuda ? { id: deuda.id, saldada } : {}), tipo, ambito, persona: persona.trim(), concepto: concepto.trim() || null, monto, vence: vence || null }), deuda ? 'Deuda actualizada' : 'Deuda anotada')} />
      </div>
    </Hoja>
  );
}

function FormFijo({ libroId, fijo, datos, onCerrar, ejecutar }: { libroId: string; fijo?: FijoFinanzas; datos: DatosFinanzas; onCerrar: () => void; ejecutar: Ejecutar }) {
  const [nombre, setNombre] = useState(fijo?.nombre ?? '');
  const [ambito, setAmbito] = useState<Ambito>(fijo?.ambito ?? 'personal');
  const [categoria, setCategoria] = useState(fijo?.categoria ?? 'vivienda');
  const [monto, setMonto] = useState(fijo?.monto ?? 0);
  const [dia, setDia] = useState(fijo?.dia_mes ?? 1);
  const [cuenta, setCuenta] = useState(fijo?.cuenta_id ?? '');
  const cats = CATEGORIAS[ambito].gasto;
  return (
    <Hoja titulo={fijo ? 'Editar pago fijo' : 'Nuevo pago fijo'} onCerrar={onCerrar}>
      <Segmento opciones={[['personal', 'Personal'], ['empresa', 'Empresa']]} valor={ambito} onCambio={(a) => { setAmbito(a); setCategoria(CATEGORIAS[a].gasto[0].id); }} />
      <Campo label="Nombre"><input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej: arriendo, internet, servidor" className={claseInput} autoFocus={!fijo} /></Campo>
      <Campo label="Valor"><InputDinero valor={monto} onCambio={setMonto} /></Campo>
      <div className="grid grid-cols-2 gap-3">
        <Campo label="Día del mes"><input inputMode="numeric" value={dia} onChange={(e) => setDia(Math.min(31, Math.max(1, soloNumero(e.target.value) || 1)))} className={claseInput} /></Campo>
        <Campo label="Se paga de">
          <select value={cuenta} onChange={(e) => setCuenta(e.target.value)} className={claseInput}>
            <option value="">Sin cuenta</option>
            {datos.cuentas.filter((c) => c.activa).map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
        </Campo>
      </div>
      <Campo label="Categoría">
        <select value={categoria} onChange={(e) => setCategoria(e.target.value)} className={claseInput}>
          {cats.map((c) => <option key={c.id} value={c.id}>{c.emoji} {c.nombre}</option>)}
        </select>
      </Campo>
      <div className="flex gap-2">
        {fijo && <BotonBorrar onBorrar={() => ejecutar(() => fuente().guardar('finanzas_fijos', libroId, { id: fijo.id, activo: false }), 'Pago fijo quitado')} />}
        <BotonGuardar onClick={() => (!nombre.trim() || monto <= 0) ? Promise.resolve(void toast.error('Escribe el nombre y el valor')) :
          ejecutar(() => fuente().guardar('finanzas_fijos', libroId, { ...(fijo ? { id: fijo.id } : {}), nombre: nombre.trim(), ambito, categoria, monto, dia_mes: dia, cuenta_id: cuenta || null }), fijo ? 'Pago fijo actualizado' : 'Pago fijo creado')} />
      </div>
    </Hoja>
  );
}

function FormCuenta({ libroId, onCerrar, ejecutar }: { libroId: string; onCerrar: () => void; ejecutar: Ejecutar }) {
  const [nombre, setNombre] = useState('');
  const [tipo, setTipo] = useState('banco');
  const [saldo, setSaldo] = useState(0);
  return (
    <Hoja titulo="Nueva cuenta" onCerrar={onCerrar}>
      <Campo label="Nombre"><input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej: Bancolombia, Daviplata, alcancía" className={claseInput} autoFocus /></Campo>
      <Campo label="Tipo">
        <select value={tipo} onChange={(e) => setTipo(e.target.value)} className={claseInput}>
          {[['efectivo', 'Efectivo'], ['banco', 'Banco'], ['nequi', 'Nequi'], ['daviplata', 'Daviplata'], ['tarjeta', 'Tarjeta de crédito'], ['ahorro', 'Ahorro'], ['otra', 'Otra']].map(([v, t]) => <option key={v} value={v}>{t}</option>)}
        </select>
      </Campo>
      <Campo label="¿Cuánto tiene hoy?"><InputDinero valor={saldo} onCambio={setSaldo} /></Campo>
      <div className="flex"><BotonGuardar onClick={() => !nombre.trim() ? Promise.resolve(void toast.error('Escribe el nombre')) :
        ejecutar(() => fuente().guardar('finanzas_cuentas', libroId, { nombre: nombre.trim(), tipo, saldo_inicial: saldo }), 'Cuenta creada')} /></div>
    </Hoja>
  );
}

function Acceso({ libroId, miId }: { libroId: string; miId: string }) {
  const [lista, setLista] = useState<PersonaFinanzas[]>([]);
  const [usuario, setUsuario] = useState('');
  const [rol, setRol] = useState<RolFinanzas>('lector');
  const [enviando, setEnviando] = useState(false);
  const cargar = useCallback(() => fuente().personas(libroId).then(setLista, (e) => toast.error('No se pudo cargar el acceso', { description: e?.message })), [libroId]);
  useEffect(() => { cargar(); }, [cargar]);
  const nombreRol: Record<RolFinanzas, string> = { dueno: 'Dueño', editor: 'Ve y registra', lector: 'Solo ve' };
  return (
    <>
      <Tarjeta>
        <p className="text-white font-bold text-sm flex items-center gap-2 mb-1"><Users className="w-4 h-4 text-emerald-400" /> Quién ve tus finanzas</p>
        <p className="text-slate-500 text-xs mb-3">Nadie más las ve, ni el staff de Codec ni los otros usuarios del negocio.</p>
        {lista.map((p) => (
          <div key={p.empleado_id} className="flex items-center justify-between py-2 border-t border-slate-800 first:border-0">
            <div className="min-w-0">
              <p className="text-white text-sm font-semibold truncate">{p.nombre}{p.empleado_id === miId ? ' (tú)' : ''}</p>
              <p className="text-slate-500 text-xs truncate">{nombreRol[p.rol]}{p.negocio ? ` · ${p.negocio}` : ''}</p>
            </div>
            {p.empleado_id !== miId && (
              <button className="text-red-400 text-xs font-bold" onClick={() => fuente().quitarAcceso(libroId, p.empleado_id).then(() => { toast.success('Acceso quitado'); cargar(); }, (e) => toast.error('No se pudo quitar', { description: e?.message }))}>Quitar</button>
            )}
          </div>
        ))}
      </Tarjeta>
      <Tarjeta>
        <p className="text-white font-bold text-sm mb-3">Dar acceso a alguien</p>
        <div className="space-y-3">
          <Campo label="Usuario, correo o usuario de licencia"><input value={usuario} onChange={(e) => setUsuario(e.target.value)} placeholder="Con lo que entra a la app" className={claseInput} autoCapitalize="none" /></Campo>
          <Segmento opciones={[['lector', 'Solo ve'], ['editor', 'Ve y registra']]} valor={rol === 'dueno' ? 'editor' : rol} onCambio={setRol} />
          <button disabled={enviando || !usuario.trim()} onClick={async () => {
            setEnviando(true);
            try { const n = await fuente().invitar(libroId, usuario, rol); toast.success(`${n} ya tiene acceso`); setUsuario(''); cargar(); }
            catch (e: any) { toast.error('No se pudo dar acceso', { description: e?.message }); }
            finally { setEnviando(false); }
          }} className="w-full h-12 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-bold disabled:opacity-50">
            Dar acceso
          </button>
        </div>
      </Tarjeta>
    </>
  );
}
