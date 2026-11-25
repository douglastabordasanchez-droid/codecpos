/**
 * Encargos (tortas por pedido) — misma pantalla en el celular, la caja y la terminal.
 * Alguien pide una torta de $50.000 y abona $25.000: se anota cliente, tipo, cómo la
 * quiere, día y hora de entrega, total y abono. El abono y el saldo se cobran por la
 * caja normal (onCobrar), así cuadran en el cierre.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { CakeSlice, Plus, X, Loader2, Check, Phone, Clock, Pencil, Wallet, PackageCheck, Printer, MessageCircle, Download } from 'lucide-react';
import { descargarOrdenTorta, enviarOrdenTortaWhatsApp, imprimirOrdenTorta } from '../../app/lib/ordenTorta';
import { toast } from 'sonner';
import '../themeClaro.css';
import {
  ESTADOS_ENCARGO, TIPOS_TORTA, abonado, saldo, actualizarEncargo, crearEncargo, lineaCobro, listarEncargos,
  registrarAbono, suscribirEncargos, type Encargo, type EstadoEncargo,
} from '../../app/lib/supabase/encargosService';

const money = (v: number) => `$${Math.round(v || 0).toLocaleString('es-CO')}`;
const soloDigitos = (v: string) => v.replace(/\D/g, '');
const conPuntos = (v: string) => (soloDigitos(v) ? Number(soloDigitos(v)).toLocaleString('es-CO') : '');
const hoyLocal = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());

function etiquetaDia(fecha: string): string {
  const hoy = hoyLocal();
  const manana = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date(Date.now() + 86400000));
  if (fecha === hoy) return 'Hoy';
  if (fecha === manana) return 'Mañana';
  const [a, m, d] = fecha.split('-').map(Number);
  return new Date(a, m - 1, d).toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'short' });
}

function horaBonita(h?: string): string {
  if (!h) return 'Sin hora';
  const [hh, mm] = h.split(':').map(Number);
  const ampm = hh >= 12 ? 'p. m.' : 'a. m.';
  return `${((hh + 11) % 12) + 1}:${String(mm).padStart(2, '0')} ${ampm}`;
}

export interface LineaCobroEncargo { id: string; nombre: string; precio: number }

export function EncargosPanel({ clienteId, nombreUsuario, oscuro = true, onCobrar }: {
  clienteId: string;
  nombreUsuario?: string;
  oscuro?: boolean;
  /** Pasa el abono o el saldo a la caja para cobrarlo con el medio de pago que sea. */
  onCobrar: (lineas: LineaCobroEncargo[]) => void;
}) {
  const [encargos, setEncargos] = useState<Encargo[]>([]);
  const [cargando, setCargando] = useState(true);
  const [filtro, setFiltro] = useState<'proximos' | 'hoy' | 'entregados'>('proximos');
  const [editando, setEditando] = useState<Encargo | 'nuevo' | null>(null);
  const [abonando, setAbonando] = useState<Encargo | null>(null);

  const cargar = useCallback(async () => {
    try { setEncargos(await listarEncargos(clienteId)); }
    catch (e) { toast.error('No se pudieron cargar los encargos', { description: (e as Error).message }); }
    setCargando(false);
  }, [clienteId]);
  useEffect(() => { void cargar(); return suscribirEncargos(clienteId, () => { void cargar(); }); }, [cargar, clienteId]);

  const visibles = useMemo(() => {
    const hoy = hoyLocal();
    return encargos.filter((e) => {
      if (filtro === 'entregados') return e.estado === 'entregada' || e.estado === 'cancelada';
      if (e.estado === 'entregada' || e.estado === 'cancelada') return false;
      return filtro === 'hoy' ? e.fechaEntrega <= hoy : true;
    });
  }, [encargos, filtro]);

  const grupos = useMemo(() => {
    const mapa = new Map<string, Encargo[]>();
    for (const e of visibles) mapa.set(e.fechaEntrega, [...(mapa.get(e.fechaEntrega) || []), e]);
    return [...mapa.entries()].sort(([a], [b]) => (filtro === 'entregados' ? b.localeCompare(a) : a.localeCompare(b)));
  }, [visibles, filtro]);

  const cuentaHoy = encargos.filter((e) => e.fechaEntrega <= hoyLocal() && !['entregada', 'cancelada'].includes(e.estado)).length;

  const cambiarEstado = async (e: Encargo, estado: EstadoEncargo) => {
    setEncargos((prev) => prev.map((x) => (x.id === e.id ? { ...x, estado } : x)));
    try { await actualizarEncargo(e.id, { estado }); } catch (err) { toast.error('No se pudo cambiar el estado', { description: (err as Error).message }); void cargar(); }
  };

  const entregar = async (e: Encargo) => {
    const falta = saldo(e);
    try {
      if (falta > 0) {
        await registrarAbono(e, falta, nombreUsuario, 'saldo');
        onCobrar([lineaCobro(e, 'saldo', falta)]);
        toast.success('Encargo entregado', { description: `Cobra el saldo de ${money(falta)} en la caja.` });
      } else {
        await actualizarEncargo(e.id, { estado: 'entregada' });
        toast.success('Encargo entregado');
      }
      void cargar();
    } catch (err) { toast.error('No se pudo entregar', { description: (err as Error).message }); }
  };

  return (
    <div data-theme={oscuro ? undefined : 'light'} className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1.5 flex-1 min-w-0 flex-wrap">
          {([['proximos', 'Próximos'], ['hoy', `Para hoy${cuentaHoy ? ` (${cuentaHoy})` : ''}`], ['entregados', 'Entregados']] as const).map(([id, label]) => (
            <button key={id} onClick={() => setFiltro(id)}
              className={`h-10 px-4 rounded-full text-sm font-bold border ${filtro === id ? 'bg-pink-600 border-transparent text-[#fff]' : 'bg-slate-900 border-slate-700 text-slate-300'}`}>
              {label}
            </button>
          ))}
        </div>
        <button onClick={() => setEditando('nuevo')} className="h-11 px-4 rounded-2xl bg-gradient-to-r from-pink-500 to-rose-600 text-[#fff] text-sm font-black flex items-center gap-2 shrink-0">
          <Plus className="w-4 h-4" /> Nuevo encargo
        </button>
      </div>

      {cargando ? (
        <div className="flex items-center justify-center gap-2 py-10 text-slate-400"><Loader2 className="w-4 h-4 animate-spin" /> Cargando encargos…</div>
      ) : grupos.length === 0 ? (
        <div className="text-center py-12">
          <CakeSlice className="w-10 h-10 text-slate-600 mx-auto mb-2" />
          <p className="text-slate-300 font-bold text-sm">{filtro === 'entregados' ? 'No hay entregados en los últimos 30 días' : 'No hay encargos pendientes'}</p>
          {filtro !== 'entregados' && <p className="text-slate-500 text-xs mt-1">Toca «Nuevo encargo» cuando alguien pida una torta.</p>}
        </div>
      ) : grupos.map(([fecha, lista]) => (
        <div key={fecha} className="space-y-2">
          <p className={`text-xs font-black uppercase tracking-wide ${fecha < hoyLocal() && filtro !== 'entregados' ? 'text-red-400' : 'text-slate-400'}`}>
            {etiquetaDia(fecha)}{fecha < hoyLocal() && filtro !== 'entregados' ? ' · atrasado' : ''}
          </p>
          {lista.map((e) => {
            const est = ESTADOS_ENCARGO.find((x) => x.id === e.estado)!;
            const falta = saldo(e);
            const activo = e.estado !== 'entregada' && e.estado !== 'cancelada';
            return (
              <div key={e.id} className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 space-y-3">
                <div className="flex items-start gap-3">
                  <div className="w-11 h-11 rounded-2xl bg-pink-500/15 flex items-center justify-center shrink-0"><CakeSlice className="w-5 h-5 text-pink-400" /></div>
                  <div className="min-w-0 flex-1">
                    <p className="text-white font-black leading-tight break-words">{e.tipo}</p>
                    <p className="text-slate-300 text-sm font-semibold">{e.clienteNombre}</p>
                    <p className="text-slate-400 text-xs flex flex-wrap items-center gap-x-3 gap-y-1 mt-0.5">
                      <span className="inline-flex items-center gap-1"><Clock className="w-3.5 h-3.5" />{horaBonita(e.horaEntrega)}</span>
                      {e.clienteTelefono && <a href={`tel:${e.clienteTelefono}`} className="inline-flex items-center gap-1"><Phone className="w-3.5 h-3.5" />{e.clienteTelefono}</a>}
                    </p>
                  </div>
                  <span className="text-[11px] font-black px-2.5 py-1 rounded-full shrink-0" style={{ background: `${est.color}22`, color: est.color }}>{est.label}</span>
                </div>
                {e.detalle && <p className="text-slate-300 text-sm whitespace-pre-line break-words rounded-xl bg-slate-950/60 px-3 py-2">{e.detalle}</p>}
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-xl bg-slate-950/60 py-2"><p className="text-slate-500 text-[10px] font-bold uppercase">Total</p><p className="text-white font-black">{money(e.total)}</p></div>
                  <div className="rounded-xl bg-slate-950/60 py-2"><p className="text-slate-500 text-[10px] font-bold uppercase">Abonado</p><p className="text-emerald-400 font-black">{money(abonado(e))}</p></div>
                  <div className="rounded-xl bg-slate-950/60 py-2"><p className="text-slate-500 text-[10px] font-bold uppercase">Saldo</p><p className={`font-black ${falta > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>{money(falta)}</p></div>
                </div>
                {/* Orden para el panadero */}
                <div className="grid grid-cols-3 gap-2">
                  <button onClick={() => imprimirOrdenTorta(e)} className="h-10 rounded-xl bg-slate-800 text-slate-200 text-xs font-bold flex items-center justify-center gap-1.5 hover:bg-slate-700 transition">
                    <Printer className="w-4 h-4" /> Imprimir
                  </button>
                  <button onClick={() => enviarOrdenTortaWhatsApp(e)} className="h-10 rounded-xl bg-[#25D366] text-[#fff] text-xs font-bold flex items-center justify-center gap-1.5 hover:brightness-110 transition">
                    <MessageCircle className="w-4 h-4" /> WhatsApp
                  </button>
                  <button onClick={() => { descargarOrdenTorta(e).catch((err) => toast.error('No se pudo descargar', { description: (err as Error).message })); }}
                    className="h-10 rounded-xl bg-slate-800 text-slate-200 text-xs font-bold flex items-center justify-center gap-1.5 hover:bg-slate-700 transition">
                    <Download className="w-4 h-4" /> Descargar
                  </button>
                </div>
                {activo && (
                  <>
                    <div className="flex flex-wrap gap-1.5">
                      {ESTADOS_ENCARGO.filter((x) => ['pendiente', 'en_preparacion', 'lista'].includes(x.id)).map((x) => (
                        <button key={x.id} onClick={() => void cambiarEstado(e, x.id)}
                          className={`h-8 px-3 rounded-full text-xs font-bold border ${e.estado === x.id ? 'text-[#fff] border-transparent' : 'bg-slate-950 border-slate-700 text-slate-300'}`}
                          style={e.estado === x.id ? { background: x.color } : undefined}>
                          {x.label}
                        </button>
                      ))}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button onClick={() => void entregar(e)} className="flex-1 min-w-[180px] h-11 rounded-xl bg-emerald-600 text-[#fff] text-sm font-black flex items-center justify-center gap-1.5">
                        <PackageCheck className="w-4 h-4" /> {falta > 0 ? `Entregar y cobrar ${money(falta)}` : 'Entregar'}
                      </button>
                      {falta > 0 && (
                        <button onClick={() => setAbonando(e)} className="h-11 px-4 rounded-xl bg-slate-800 text-slate-200 text-sm font-bold flex items-center gap-1.5">
                          <Wallet className="w-4 h-4" /> Abonar
                        </button>
                      )}
                      <button onClick={() => setEditando(e)} className="h-11 px-4 rounded-xl bg-slate-800 text-slate-200 text-sm font-bold flex items-center gap-1.5">
                        <Pencil className="w-4 h-4" /> Editar
                      </button>
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      ))}

      <FormularioEncargo
        abierto={!!editando}
        encargo={editando === 'nuevo' ? null : editando}
        clienteId={clienteId}
        nombreUsuario={nombreUsuario}
        oscuro={oscuro}
        onCerrar={() => setEditando(null)}
        onGuardado={(lineas) => { setEditando(null); void cargar(); if (lineas.length) onCobrar(lineas); }}
        onCancelarEncargo={async (e) => { await cambiarEstado(e, 'cancelada'); setEditando(null); }}
      />
      <HojaAbono
        encargo={abonando}
        oscuro={oscuro}
        onCerrar={() => setAbonando(null)}
        onAbonar={async (monto) => {
          const e = abonando;
          if (!e) return;
          try {
            await registrarAbono(e, monto, nombreUsuario, 'abono');
            setAbonando(null);
            void cargar();
            onCobrar([lineaCobro(e, 'abono', monto)]);
          } catch (err) { toast.error('No se pudo abonar', { description: (err as Error).message }); }
        }}
      />
    </div>
  );
}

function Hoja({ abierta, oscuro, onCerrar, children }: { abierta: boolean; oscuro: boolean; onCerrar: () => void; children: React.ReactNode }) {
  return (
    <AnimatePresence>
      {abierta && (
        <motion.div data-theme={oscuro ? undefined : 'light'} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-[70] bg-black/60 flex items-end sm:items-center justify-center sm:p-4"
          onClick={(ev) => { if (ev.target === ev.currentTarget) onCerrar(); }}>
          <motion.div initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }}
            className="w-full sm:max-w-lg bg-slate-950 rounded-t-3xl sm:rounded-3xl border border-slate-800 max-h-[92vh] flex flex-col">
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

const campo = 'w-full h-12 rounded-xl bg-slate-900 border border-slate-700 text-white px-3 text-base outline-none focus:border-pink-500';

function FormularioEncargo({ abierto, encargo, clienteId, nombreUsuario, oscuro, onCerrar, onGuardado, onCancelarEncargo }: {
  abierto: boolean; encargo: Encargo | null; clienteId: string; nombreUsuario?: string; oscuro: boolean;
  onCerrar: () => void; onGuardado: (lineas: LineaCobroEncargo[]) => void; onCancelarEncargo: (e: Encargo) => Promise<void>;
}) {
  const [f, setF] = useState({ cliente: '', telefono: '', tipo: '', detalle: '', fecha: '', hora: '', total: '', abono: '' });
  const [guardando, setGuardando] = useState(false);
  const [preparado, setPreparado] = useState(false);
  if (abierto && !preparado) {
    setF(encargo
      ? { cliente: encargo.clienteNombre, telefono: encargo.clienteTelefono || '', tipo: encargo.tipo, detalle: encargo.detalle || '', fecha: encargo.fechaEntrega, hora: encargo.horaEntrega || '', total: String(encargo.total), abono: '' }
      : { cliente: '', telefono: '', tipo: '', detalle: '', fecha: '', hora: '', total: '', abono: '' });
    setPreparado(true);
  }
  if (!abierto && preparado) setPreparado(false);

  const total = Number(soloDigitos(f.total)) || 0;
  const abono = Number(soloDigitos(f.abono)) || 0;

  const guardar = async () => {
    if (!f.cliente.trim()) { toast.error('Escribe el nombre del cliente'); return; }
    if (!f.tipo.trim()) { toast.error('Elige o escribe el tipo de torta'); return; }
    if (!f.fecha) { toast.error('Elige el día en que la recoge'); return; }
    if (total <= 0) { toast.error('Pon el valor total'); return; }
    if (abono > total) { toast.error('El abono no puede ser mayor que el total'); return; }
    setGuardando(true);
    try {
      const datos = { clienteNombre: f.cliente, clienteTelefono: f.telefono, tipo: f.tipo, detalle: f.detalle, fechaEntrega: f.fecha, horaEntrega: f.hora, total };
      if (encargo) {
        await actualizarEncargo(encargo.id, datos);
        toast.success('Encargo actualizado');
        onGuardado([]);
      } else {
        const nuevo = await crearEncargo(clienteId, datos, nombreUsuario, abono);
        toast.success('Encargo guardado', { description: abono > 0 ? `Cobra el abono de ${money(abono)} en la caja.` : undefined });
        onGuardado(abono > 0 ? [lineaCobro(nuevo, 'abono', abono)] : []);
      }
    } catch (e) {
      toast.error('No se pudo guardar el encargo', { description: (e as Error).message });
    }
    setGuardando(false);
  };

  return (
    <Hoja abierta={abierto} oscuro={oscuro} onCerrar={onCerrar}>
      <div className="px-5 pt-4 pb-3 border-b border-slate-800 flex items-center gap-3 shrink-0">
        <CakeSlice className="w-6 h-6 text-pink-400" />
        <p className="text-white font-black text-lg flex-1">{encargo ? 'Editar encargo' : 'Nuevo encargo'}</p>
        <button onClick={onCerrar} className="text-slate-400 p-1" aria-label="Cerrar"><X className="w-5 h-5" /></button>
      </div>
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="block"><span className="text-slate-400 text-xs font-bold">Cliente *</span>
            <input className={campo} value={f.cliente} onChange={(e) => setF({ ...f, cliente: e.target.value })} placeholder="Nombre de quien la pide" /></label>
          <label className="block"><span className="text-slate-400 text-xs font-bold">Teléfono</span>
            <input className={campo} inputMode="tel" value={f.telefono} onChange={(e) => setF({ ...f, telefono: e.target.value })} placeholder="Para avisarle" /></label>
        </div>
        <div>
          <span className="text-slate-400 text-xs font-bold">Tipo de torta *</span>
          <div className="flex flex-wrap gap-1.5 my-1.5">
            {TIPOS_TORTA.map((t) => (
              <button key={t} type="button" onClick={() => setF({ ...f, tipo: t })}
                className={`h-9 px-3 rounded-full text-xs font-bold border ${f.tipo === t ? 'bg-pink-600 border-transparent text-[#fff]' : 'bg-slate-900 border-slate-700 text-slate-300'}`}>{t}</button>
            ))}
          </div>
          <input className={campo} value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value })} placeholder="O escribe otro tipo" />
        </div>
        <label className="block"><span className="text-slate-400 text-xs font-bold">¿Cómo la quiere?</span>
          <textarea className={`${campo} h-28 py-2 resize-none`} value={f.detalle} onChange={(e) => setF({ ...f, detalle: e.target.value })}
            placeholder={'Tamaño o porciones, relleno, cubierta, decoración\nMensaje: «Feliz cumpleaños Sofía»'} /></label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block"><span className="text-slate-400 text-xs font-bold">Día que la recoge *</span>
            <input type="date" className={campo} min={hoyLocal()} value={f.fecha} onChange={(e) => setF({ ...f, fecha: e.target.value })} /></label>
          <label className="block"><span className="text-slate-400 text-xs font-bold">Hora</span>
            <input type="time" className={campo} value={f.hora} onChange={(e) => setF({ ...f, hora: e.target.value })} /></label>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="block"><span className="text-slate-400 text-xs font-bold">Valor total *</span>
            <input className={`${campo} font-black`} inputMode="numeric" value={conPuntos(f.total)} onChange={(e) => setF({ ...f, total: soloDigitos(e.target.value) })} placeholder="50.000" /></label>
          {!encargo && (
            <label className="block"><span className="text-slate-400 text-xs font-bold">Abono ahora</span>
              <input className={`${campo} font-black`} inputMode="numeric" value={conPuntos(f.abono)} onChange={(e) => setF({ ...f, abono: soloDigitos(e.target.value) })} placeholder="25.000" /></label>
          )}
        </div>
        {!encargo && total > 0 && (
          <p className="text-sm text-slate-300">Queda debiendo: <b className="text-amber-400">{money(Math.max(0, total - abono))}</b></p>
        )}
        {encargo && encargo.estado !== 'cancelada' && (
          <button type="button" onClick={() => void onCancelarEncargo(encargo)} className="text-red-400 text-sm font-bold">Cancelar este encargo</button>
        )}
      </div>
      <div className="px-5 py-3 border-t border-slate-800 shrink-0">
        <button onClick={() => void guardar()} disabled={guardando}
          className="w-full h-14 rounded-2xl bg-gradient-to-r from-pink-500 to-rose-600 text-[#fff] text-base font-black flex items-center justify-center gap-2 disabled:opacity-60">
          {guardando ? <Loader2 className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" />}
          {encargo ? 'Guardar cambios' : abono > 0 ? `Guardar y cobrar abono ${money(abono)}` : 'Guardar encargo'}
        </button>
      </div>
    </Hoja>
  );
}

function HojaAbono({ encargo, oscuro, onCerrar, onAbonar }: {
  encargo: Encargo | null; oscuro: boolean; onCerrar: () => void; onAbonar: (monto: number) => Promise<void>;
}) {
  const [monto, setMonto] = useState('');
  const [enviando, setEnviando] = useState(false);
  useEffect(() => { setMonto(''); }, [encargo?.id]);
  const falta = encargo ? saldo(encargo) : 0;
  const valor = Number(soloDigitos(monto)) || 0;
  return (
    <Hoja abierta={!!encargo} oscuro={oscuro} onCerrar={onCerrar}>
      <div className="px-5 pt-4 pb-3 border-b border-slate-800 flex items-center gap-3">
        <Wallet className="w-6 h-6 text-emerald-400" />
        <div className="flex-1 min-w-0">
          <p className="text-white font-black text-lg leading-tight">Abonar</p>
          <p className="text-slate-400 text-xs truncate">{encargo?.tipo} · {encargo?.clienteNombre} · debe {money(falta)}</p>
        </div>
        <button onClick={onCerrar} className="text-slate-400 p-1" aria-label="Cerrar"><X className="w-5 h-5" /></button>
      </div>
      <div className="px-5 py-4 space-y-3">
        <input className={`${campo} text-2xl font-black text-center`} inputMode="numeric" autoFocus value={conPuntos(monto)}
          onChange={(e) => setMonto(soloDigitos(e.target.value))} placeholder="Valor del abono" />
        <button type="button" onClick={() => setMonto(String(falta))} className="text-pink-400 text-sm font-bold">Pagar todo el saldo ({money(falta)})</button>
      </div>
      <div className="px-5 py-3 border-t border-slate-800">
        <button disabled={enviando || valor <= 0 || valor > falta}
          onClick={async () => { setEnviando(true); await onAbonar(valor); setEnviando(false); }}
          className="w-full h-14 rounded-2xl bg-emerald-600 text-[#fff] text-base font-black disabled:opacity-50">
          {valor > falta ? 'Es más de lo que debe' : `Cobrar abono ${money(valor)}`}
        </button>
      </div>
    </Hoja>
  );
}
