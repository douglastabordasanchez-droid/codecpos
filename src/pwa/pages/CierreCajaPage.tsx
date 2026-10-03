/**
 * Caja — web y celular (terminal 'PWA'): apertura, arqueo en vivo por
 * billetes y monedas, entradas y salidas de efectivo, resumen por medio de
 * pago y cierre con historial. Los cálculos y la forma del cierre están en
 * cajaNube.ts (iguales a los de Electron).
 */
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  Lock, Unlock, Loader2, Clock, History, ChevronDown, ArrowDownCircle, ArrowUpCircle, Plus, Calculator, RefreshCw, Banknote, Coins,
} from 'lucide-react';
import { getSupabaseClient } from '../../app/lib/supabase/config';
import { usePwaAuth } from '../contexts/PwaAuthContext';
import { money } from '../lib/nubeConsultas';
import {
  TERMINAL_PWA, DENOMINACIONES, METODOS, METODOS_LABEL, totalBilletes, resumirTurno, cargarTurno, armarDetalleCierre,
  type Billetes, type MovimientoCaja, type TurnoCaja,
} from '../lib/cajaNube';

interface CierreFila {
  id: string;
  terminal_id: string | null;
  fecha_apertura: string | null;
  fecha_cierre: string | null;
  monto_apertura: number;
  monto_cierre: number;
  ventas_total: number;
  diferencia: number;
  detalle: Record<string, any> | null;
}

const COLUMNAS = 'id, terminal_id, fecha_apertura, fecha_cierre, monto_apertura, monto_cierre, ventas_total, diferencia, detalle';
const tarjeta = 'bg-slate-900/70 backdrop-blur border border-slate-800 rounded-2xl';
const horaCorta = (iso: string | null) => (iso ? new Date(iso).toLocaleString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');

export default function CierreCajaPage() {
  const { empleado } = usePwaAuth();
  const [abierta, setAbierta] = useState<CierreFila | null | undefined>(undefined);
  const [historial, setHistorial] = useState<CierreFila[] | null>(null);
  const [turno, setTurno] = useState<TurnoCaja | null>(null);
  const [procesando, setProcesando] = useState(false);

  const [base, setBase] = useState('');
  const [billetes, setBilletes] = useState<Billetes>({});
  const [observaciones, setObservaciones] = useState('');
  const [nuevoMov, setNuevoMov] = useState<{ tipo: 'entrada' | 'salida'; monto: string; concepto: string } | null>(null);
  const [expandido, setExpandido] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    if (!empleado) return;
    const client = getSupabaseClient();
    if (!client) return;
    const [{ data: abiertaFila }, { data: hist }] = await Promise.all([
      client.from('cierres_caja').select(COLUMNAS).eq('cliente_id', empleado.cliente_id).eq('terminal_id', TERMINAL_PWA)
        .is('fecha_cierre', null).order('fecha_apertura', { ascending: false }).limit(1).maybeSingle(),
      client.from('cierres_caja').select(COLUMNAS).eq('cliente_id', empleado.cliente_id)
        .not('fecha_cierre', 'is', null).order('fecha_cierre', { ascending: false }).limit(20),
    ]);
    setAbierta((abiertaFila as CierreFila | null) || null);
    setHistorial((hist as CierreFila[]) || []);
  }, [empleado?.cliente_id]);

  const cargarTurnoActual = useCallback(async () => {
    if (!empleado || !abierta?.fecha_apertura) { setTurno(null); return; }
    try {
      setTurno(await cargarTurno(empleado.cliente_id, abierta.fecha_apertura));
    } catch (e: any) {
      toast.error(`No se pudieron leer las ventas del turno: ${e?.message || e}`);
    }
  }, [empleado?.cliente_id, abierta?.id, abierta?.fecha_apertura]);

  useEffect(() => { cargar(); }, [cargar]);
  useEffect(() => { cargarTurnoActual(); }, [cargarTurnoActual]);

  if (!empleado) return null;

  const movimientos: MovimientoCaja[] = Array.isArray(abierta?.detalle?.movimientos) ? abierta!.detalle!.movimientos : [];
  const resumen = abierta && turno ? resumirTurno(turno, Number(abierta.monto_apertura) || 0, movimientos) : null;
  const contado = totalBilletes(billetes);
  const diferencia = resumen ? contado - resumen.efectivoEsperado : 0;

  const abrir = async () => {
    setProcesando(true);
    const { error } = await getSupabaseClient()!.from('cierres_caja').insert({
      cliente_id: empleado.cliente_id,
      terminal_id: TERMINAL_PWA,
      empleado_id: empleado.id,
      fecha_apertura: new Date().toISOString(),
      monto_apertura: Number(base) || 0,
      detalle: { cajero_nombre: empleado.nombre_completo, movimientos: [] },
    });
    setProcesando(false);
    if (error) { toast.error(error.message); return; }
    setBase('');
    toast.success('Caja abierta');
    cargar();
  };

  const agregarMovimiento = async () => {
    if (!abierta || !nuevoMov) return;
    const monto = Number(nuevoMov.monto) || 0;
    if (monto <= 0 || !nuevoMov.concepto.trim()) { toast.error('Escribe el monto y el motivo'); return; }
    const mov: MovimientoCaja = {
      id: crypto.randomUUID(), tipo: nuevoMov.tipo, monto, concepto: nuevoMov.concepto.trim(),
      fecha: new Date().toISOString(), usuario: empleado.nombre_completo,
    };
    setProcesando(true);
    // Se relee la fila para no pisar un movimiento que otra persona agregó desde otro celular.
    const client = getSupabaseClient()!;
    const { data: actual } = await client.from('cierres_caja').select('detalle').eq('id', abierta.id).maybeSingle();
    const detalle = { ...((actual as { detalle?: Record<string, any> } | null)?.detalle || {}) };
    detalle.movimientos = [...(Array.isArray(detalle.movimientos) ? detalle.movimientos : []), mov];
    const { error } = await client.from('cierres_caja').update({ detalle }).eq('id', abierta.id);
    setProcesando(false);
    if (error) { toast.error(error.message); return; }
    setNuevoMov(null);
    toast.success(mov.tipo === 'entrada' ? 'Entrada registrada' : 'Salida registrada');
    cargar();
  };

  const cerrar = async () => {
    if (!abierta || !resumen || !turno) return;
    if (contado === 0 && !window.confirm('No has contado el efectivo (el arqueo está en $0). ¿Cerrar la caja de todos modos?')) return;
    setProcesando(true);
    // Cifras frescas: pudo entrar una venta mientras se contaba el dinero.
    let turnoFinal = turno;
    try { turnoFinal = await cargarTurno(empleado.cliente_id, abierta.fecha_apertura!); } catch { /* se usa lo ya cargado */ }
    const resumenFinal = resumirTurno(turnoFinal, Number(abierta.monto_apertura) || 0, movimientos);
    const detalle = {
      ...(abierta.detalle || {}),
      ...armarDetalleCierre({
        resumen: resumenFinal, turno: turnoFinal, base: Number(abierta.monto_apertura) || 0, billetes, movimientos,
        cajero: empleado.nombre_completo, fechaApertura: abierta.fecha_apertura!, observaciones,
      }),
    };
    const { error } = await getSupabaseClient()!.from('cierres_caja').update({
      fecha_cierre: new Date().toISOString(),
      monto_cierre: detalle.totalFisico,
      ventas_total: resumenFinal.ventasTotal,
      diferencia: detalle.diferencia,
      detalle,
    }).eq('id', abierta.id).is('fecha_cierre', null);
    setProcesando(false);
    if (error) { toast.error(error.message); return; }
    setBilletes({});
    setObservaciones('');
    toast.success(Math.abs(detalle.diferencia) < 1 ? 'Caja cerrada: cuadró exacto' : `Caja cerrada con ${detalle.diferencia > 0 ? 'sobrante' : 'faltante'} de ${money(Math.abs(detalle.diferencia))}`);
    cargar();
  };

  if (abierta === undefined) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-amber-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 pb-24">
      <div className="px-5 pt-8 pb-4 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-white text-2xl font-black">Caja</h1>
          <p className="text-slate-400 text-sm">Apertura, arqueo, movimientos y cierre de la caja web</p>
        </div>
        {abierta && (
          <button onClick={() => { cargar(); cargarTurnoActual(); }} className="h-10 w-10 rounded-xl bg-slate-800 text-slate-300 flex items-center justify-center" title="Actualizar">
            <RefreshCw className="w-4 h-4" />
          </button>
        )}
      </div>

      <div className="px-5 space-y-4 lg:grid lg:grid-cols-2 lg:gap-4 lg:space-y-0">
        {!abierta ? (
          <div className={`${tarjeta} p-5 space-y-4 lg:col-span-2 lg:max-w-md`}>
            <div className="flex items-center gap-2">
              <Unlock className="w-4 h-4 text-emerald-400" />
              <span className="text-slate-400 text-xs font-bold uppercase tracking-wide">Caja cerrada</span>
            </div>
            <div className="space-y-1.5">
              <label className="text-slate-400 text-xs">Base de apertura (efectivo con que empieza el turno)</label>
              <input
                type="number" inputMode="numeric" value={base} onChange={(e) => setBase(e.target.value)} placeholder="0"
                className="w-full h-14 px-4 rounded-xl text-2xl font-bold bg-slate-950/60 border border-slate-700 text-white"
              />
            </div>
            <button onClick={abrir} disabled={procesando} className="w-full h-12 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 text-white font-bold flex items-center justify-center gap-2 disabled:opacity-50">
              {procesando && <Loader2 className="w-4 h-4 animate-spin" />} Abrir caja
            </button>
          </div>
        ) : (
          <>
            {/* Estado del turno */}
            <div className={`${tarjeta} p-5 space-y-4 border-amber-800/40`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Lock className="w-4 h-4 text-amber-400" />
                  <span className="text-slate-400 text-xs font-bold uppercase tracking-wide">Caja abierta</span>
                </div>
                <span className="text-slate-500 text-xs flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> desde {horaCorta(abierta.fecha_apertura)}</span>
              </div>

              {!resumen ? (
                <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 text-amber-400 animate-spin" /></div>
              ) : (
                <>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-xl bg-slate-950/50 border border-slate-800 p-2.5">
                      <p className="text-slate-500 text-[10px] font-bold uppercase">Base</p>
                      <p className="text-white font-bold text-sm">{money(abierta.monto_apertura)}</p>
                    </div>
                    <div className="rounded-xl bg-slate-950/50 border border-slate-800 p-2.5">
                      <p className="text-slate-500 text-[10px] font-bold uppercase">Ventas</p>
                      <p className="text-white font-bold text-sm">{money(resumen.ventasTotal)}</p>
                      <p className="text-slate-600 text-[10px]">{resumen.transacciones} ventas</p>
                    </div>
                    <div className="rounded-xl bg-amber-500/10 border border-amber-500/30 p-2.5">
                      <p className="text-amber-400 text-[10px] font-bold uppercase">Efectivo esperado</p>
                      <p className="text-white font-black text-sm">{money(resumen.efectivoEsperado)}</p>
                    </div>
                  </div>

                  <div className="rounded-xl bg-slate-950/50 border border-slate-800 p-3">
                    <p className="text-slate-500 text-[10px] font-bold uppercase tracking-wide mb-2">Formas de pago</p>
                    <div className="space-y-1">
                      {METODOS.filter((m) => (resumen.desglose[m] || 0) > 0).map((m) => (
                        <div key={m} className="flex items-center justify-between text-xs">
                          <span className="text-slate-400">{METODOS_LABEL[m]}</span>
                          <span className="text-white font-bold">
                            {money(resumen.desglose[m])}
                            {resumen.propinas[m] ? <span className="text-amber-400 font-normal"> · propina {money(resumen.propinas[m])}</span> : null}
                          </span>
                        </div>
                      ))}
                      {resumen.ventasTotal === 0 && <p className="text-slate-600 text-xs">Sin ventas todavía en este turno.</p>}
                      {(resumen.desglose.mixto || 0) > 0 && <p className="text-slate-600 text-[11px] pt-1">Los pagos mixtos no se suman al efectivo esperado: cuenta su parte en efectivo al hacer el arqueo.</p>}
                    </div>
                  </div>

                  <div className="rounded-xl bg-slate-950/50 border border-slate-800 p-3 space-y-1 text-xs">
                    <p className="text-slate-500 text-[10px] font-bold uppercase tracking-wide mb-1">Cómo se calcula el efectivo esperado</p>
                    <Fila etiqueta="Base de apertura" valor={Number(abierta.monto_apertura) || 0} />
                    <Fila etiqueta="+ Ventas en efectivo" valor={resumen.desglose.efectivo || 0} />
                    <Fila etiqueta="+ Entradas de efectivo" valor={resumen.entradas} />
                    <Fila etiqueta="− Salidas de efectivo" valor={-resumen.salidas} />
                    <Fila etiqueta="− Gastos pagados en efectivo" valor={-resumen.gastosEfectivo} />
                    <Fila etiqueta="− Devoluciones en efectivo" valor={-resumen.devolucionesEfectivo} />
                  </div>
                </>
              )}
            </div>

            {/* Movimientos */}
            <div className={`${tarjeta} p-5 space-y-3`}>
              <div className="flex items-center justify-between">
                <span className="text-slate-400 text-xs font-bold uppercase tracking-wide">Entradas y salidas de efectivo</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => setNuevoMov({ tipo: 'entrada', monto: '', concepto: '' })} className="h-11 rounded-xl bg-emerald-600/15 border border-emerald-600/30 text-emerald-400 text-sm font-bold flex items-center justify-center gap-1.5">
                  <ArrowDownCircle className="w-4 h-4" /> Entrada
                </button>
                <button onClick={() => setNuevoMov({ tipo: 'salida', monto: '', concepto: '' })} className="h-11 rounded-xl bg-red-600/15 border border-red-600/30 text-red-400 text-sm font-bold flex items-center justify-center gap-1.5">
                  <ArrowUpCircle className="w-4 h-4" /> Salida
                </button>
              </div>
              {nuevoMov && (
                <div className="rounded-xl bg-slate-950/50 border border-slate-800 p-3 space-y-2">
                  <p className="text-white text-sm font-semibold">{nuevoMov.tipo === 'entrada' ? 'Entrada de efectivo' : 'Salida de efectivo'}</p>
                  <input type="number" inputMode="numeric" autoFocus placeholder="Monto" value={nuevoMov.monto}
                    onChange={(e) => setNuevoMov({ ...nuevoMov, monto: e.target.value })}
                    className="w-full h-11 px-3 rounded-lg bg-slate-900 border border-slate-800 text-white font-bold" />
                  <input placeholder={nuevoMov.tipo === 'entrada' ? 'Motivo (ej. sencillo, préstamo)' : 'Motivo (ej. domicilio, retiro del dueño)'} value={nuevoMov.concepto}
                    onChange={(e) => setNuevoMov({ ...nuevoMov, concepto: e.target.value })}
                    className="w-full h-11 px-3 rounded-lg bg-slate-900 border border-slate-800 text-white text-sm" />
                  <div className="flex gap-2">
                    <button onClick={() => setNuevoMov(null)} className="flex-1 h-10 rounded-lg bg-slate-800 text-slate-300 text-sm">Cancelar</button>
                    <button onClick={agregarMovimiento} disabled={procesando} className="flex-1 h-10 rounded-lg bg-amber-500 text-slate-950 text-sm font-bold flex items-center justify-center gap-1 disabled:opacity-50">
                      <Plus className="w-4 h-4" /> Registrar
                    </button>
                  </div>
                </div>
              )}
              {movimientos.length === 0 ? (
                <p className="text-slate-600 text-xs">Sin movimientos en este turno. Registra aquí el dinero que entra o sale de la caja y no es una venta ni un gasto.</p>
              ) : (
                <div className="space-y-1.5">
                  {[...movimientos].reverse().map((m) => (
                    <div key={m.id} className="flex items-center gap-2 text-xs">
                      {m.tipo === 'entrada' ? <ArrowDownCircle className="w-4 h-4 text-emerald-400 shrink-0" /> : <ArrowUpCircle className="w-4 h-4 text-red-400 shrink-0" />}
                      <span className="text-slate-300 flex-1 truncate">{m.concepto} <span className="text-slate-600">· {m.usuario} · {horaCorta(m.fecha)}</span></span>
                      <span className={`font-bold ${m.tipo === 'entrada' ? 'text-emerald-400' : 'text-red-400'}`}>{m.tipo === 'entrada' ? '+' : '−'}{money(m.monto)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Arqueo y cierre */}
            <div className={`${tarjeta} p-5 space-y-4 lg:col-span-2`}>
              <div className="flex items-center gap-2">
                <Calculator className="w-4 h-4 text-sky-400" />
                <span className="text-slate-400 text-xs font-bold uppercase tracking-wide">Arqueo en vivo</span>
              </div>
              {(['billete', 'moneda'] as const).map((tipo) => (
                <div key={tipo}>
                  <p className="text-slate-500 text-[11px] font-bold mb-2 flex items-center gap-1">
                    {tipo === 'billete' ? <Banknote className="w-3.5 h-3.5" /> : <Coins className="w-3.5 h-3.5" />} {tipo === 'billete' ? 'Billetes' : 'Monedas'}
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
                    {DENOMINACIONES.filter((d) => d.tipo === tipo).map((d) => (
                      <label key={d.clave} className="rounded-xl bg-slate-950/50 border border-slate-800 p-2 flex flex-col gap-1">
                        <span className="text-slate-400 text-[11px] font-semibold">{money(d.valor)}</span>
                        <input
                          type="number" inputMode="numeric" min={0} placeholder="0"
                          value={billetes[d.clave] || ''}
                          onChange={(e) => setBilletes((b) => ({ ...b, [d.clave]: Math.max(0, Math.floor(Number(e.target.value) || 0)) }))}
                          className="w-full h-10 px-2 rounded-lg bg-slate-900 border border-slate-800 text-white font-bold text-center"
                        />
                        <span className="text-slate-600 text-[10px] text-right">{money((billetes[d.clave] || 0) * d.valor)}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}

              {resumen && (
                <div className={`rounded-xl p-4 grid grid-cols-3 gap-2 text-center border ${Math.abs(diferencia) < 1 ? 'bg-emerald-500/10 border-emerald-500/30' : diferencia > 0 ? 'bg-sky-500/10 border-sky-500/30' : 'bg-red-500/10 border-red-500/30'}`}>
                  <div><p className="text-slate-400 text-[10px] font-bold uppercase">Contado</p><p className="text-white font-black">{money(contado)}</p></div>
                  <div><p className="text-slate-400 text-[10px] font-bold uppercase">Esperado</p><p className="text-white font-black">{money(resumen.efectivoEsperado)}</p></div>
                  <div>
                    <p className="text-slate-400 text-[10px] font-bold uppercase">{Math.abs(diferencia) < 1 ? 'Cuadra' : diferencia > 0 ? 'Sobrante' : 'Faltante'}</p>
                    <p className={`font-black ${Math.abs(diferencia) < 1 ? 'text-emerald-400' : diferencia > 0 ? 'text-sky-400' : 'text-red-400'}`}>{money(Math.abs(diferencia))}</p>
                  </div>
                </div>
              )}

              <textarea
                value={observaciones} onChange={(e) => setObservaciones(e.target.value)} rows={2} placeholder="Observaciones del cierre (opcional)"
                className="w-full px-3 py-2 rounded-xl bg-slate-950/60 border border-slate-800 text-white text-sm"
              />
              <button onClick={cerrar} disabled={procesando || !resumen} className="w-full h-12 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 text-white font-bold flex items-center justify-center gap-2 disabled:opacity-50">
                {procesando && <Loader2 className="w-4 h-4 animate-spin" />} Cerrar caja
              </button>
            </div>
          </>
        )}

        {/* Historial */}
        <div className="lg:col-span-2">
          <div className="flex items-center gap-2 mb-3">
            <History className="w-4 h-4 text-slate-500" />
            <h2 className="text-slate-400 text-xs font-bold uppercase tracking-wide">Historial de cierres (web y Electron)</h2>
          </div>
          <div className="space-y-2">
            {historial === null && <p className="text-slate-500 text-sm text-center py-4">Cargando...</p>}
            {historial?.length === 0 && <p className="text-slate-500 text-sm text-center py-4">Sin cierres registrados</p>}
            {historial?.map((c) => {
              const d = c.detalle || {};
              const abiertoEste = expandido === c.id;
              const movs: MovimientoCaja[] = Array.isArray(d.movimientos) ? d.movimientos : [];
              const conteo = d.billetes && typeof d.billetes === 'object' ? DENOMINACIONES.filter((x) => Number(d.billetes[x.clave]) > 0) : [];
              return (
                <div key={c.id} className="bg-slate-900/70 border border-slate-800 rounded-xl p-3">
                  <button type="button" onClick={() => setExpandido(abiertoEste ? null : c.id)} className="w-full text-left">
                    <div className="flex items-center justify-between mb-1 gap-2">
                      <p className="text-white font-semibold text-sm truncate">
                        {horaCorta(c.fecha_cierre)} · {d.cajero_nombre || d.cajero || (c.terminal_id === TERMINAL_PWA ? 'Caja web' : 'Caja Electron')}
                      </p>
                      <span className={`text-xs font-bold shrink-0 ${Math.abs(c.diferencia) < 1 ? 'text-emerald-400' : c.diferencia > 0 ? 'text-sky-400' : 'text-red-400'}`}>
                        {Math.abs(c.diferencia) < 1 ? 'Cuadró' : `${c.diferencia > 0 ? '+' : '−'}${money(Math.abs(c.diferencia))}`}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-slate-500 text-xs truncate">Ventas {money(c.ventas_total)} · Contado {money(c.monto_cierre)}</p>
                      <ChevronDown className={`w-3.5 h-3.5 text-slate-600 shrink-0 transition-transform ${abiertoEste ? 'rotate-180' : ''}`} />
                    </div>
                  </button>
                  {abiertoEste && (
                    <div className="mt-2.5 pt-2.5 border-t border-slate-800 space-y-1 text-xs">
                      <Fila etiqueta="Base de apertura" valor={Number(d.baseInicial ?? c.monto_apertura) || 0} />
                      {d.totalFinal !== undefined && <Fila etiqueta="Efectivo esperado" valor={Number(d.totalFinal) || 0} />}
                      <Fila etiqueta="Efectivo contado" valor={Number(c.monto_cierre) || 0} />
                      {Object.entries(d.desglose || {}).filter(([, v]) => Number(v) > 0).map(([m, v]) => (
                        <Fila key={m} etiqueta={`Ventas ${METODOS_LABEL[m] || m}`} valor={Number(v)} />
                      ))}
                      {Number(d.gastosEfectivo) > 0 && <Fila etiqueta="Gastos en efectivo" valor={-Number(d.gastosEfectivo)} />}
                      {Number(d.devoluciones) > 0 && <Fila etiqueta="Devoluciones en efectivo" valor={-Number(d.devoluciones)} />}
                      {movs.map((m) => <Fila key={m.id} etiqueta={`${m.tipo === 'entrada' ? 'Entrada' : 'Salida'}: ${m.concepto}`} valor={m.tipo === 'entrada' ? m.monto : -m.monto} />)}
                      {conteo.length > 0 && (
                        <p className="text-slate-500 pt-1">Conteo: {conteo.map((x) => `${d.billetes[x.clave]} × ${money(x.valor)}`).join(' · ')}</p>
                      )}
                      {d.observaciones && <p className="text-slate-400 pt-1">“{d.observaciones}”</p>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function Fila({ etiqueta, valor }: { etiqueta: string; valor: number }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-slate-400 truncate">{etiqueta}</span>
      <span className={`font-semibold shrink-0 ${valor < 0 ? 'text-red-400' : 'text-white'}`}>{valor < 0 ? '−' : ''}{money(Math.abs(valor))}</span>
    </div>
  );
}
