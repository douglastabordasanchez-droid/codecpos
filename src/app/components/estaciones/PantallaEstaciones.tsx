/**
 * Pantalla de estación (migración 0148): la usan las tablets de Cocina, Greca,
 * Comidas rápidas, Bar... Es la MISMA en el celular (/estaciones y Alimentos y
 * Bebidas) y en la caja de escritorio o la terminal (sección Cocina → botón
 * «Pantalla de estación», a pantalla completa).
 *
 * • La tablet elige UNA vez su estación (queda guardada en el equipo) y desde
 *   ahí ve solo sus pedidos, en tarjetas grandes para leer de lejos.
 * • Pedido nuevo: letrero grande "PEDIDO" que parpadea hasta que alguien lo
 *   toca y, si la tablet tiene el sonido activo, un timbre que se repite.
 * • "Preparando" y "Listo" avisan al mesero en su celular (flujo existente).
 * • El administrador crea, renombra, ordena y apaga estaciones aquí mismo.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ChefHat, Volume2, VolumeX, Settings2, Plus, Trash2, ArrowUp, ArrowDown, Check, Clock, X, Loader2, Power, Maximize2, Minimize2,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import {
  obtenerComandasActivas, suscribirComandas, actualizarEstadoComanda, type Comanda, type EstadoComanda,
} from '../../lib/supabase/panaderiaSyncService';
import {
  type Estacion, COLORES_ESTACION, ESTACIONES_SUGERIDAS,
  listarEstaciones, crearEstacion, actualizarEstacion, eliminarEstacion, suscribirEstaciones,
  leerPreferenciasTablet, guardarPreferenciasTablet, type PreferenciasTablet,
} from '../../lib/supabase/estacionesService';

// ── Timbre (Web Audio, sin archivos) ─────────────────────────────────────────

let contextoAudio: AudioContext | null = null;
function audio(): AudioContext | null {
  try {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return null;
    contextoAudio = contextoAudio || new Ctx();
    if (contextoAudio.state === 'suspended') void contextoAudio.resume();
    return contextoAudio;
  } catch { return null; }
}

function timbre(): void {
  const ctx = audio();
  if (!ctx) return;
  const ahora = ctx.currentTime;
  [880, 1175, 1568].forEach((f, i) => {
    const osc = ctx.createOscillator();
    const gan = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = f;
    const t = ahora + i * 0.18;
    gan.gain.setValueAtTime(0.0001, t);
    gan.gain.exponentialRampToValueAtTime(0.5, t + 0.02);
    gan.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
    osc.connect(gan).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.4);
  });
}

function minutosDesde(iso: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
}

interface Props {
  clienteId: string;
  esAdmin: boolean;
  /** Sucursal cuyos pedidos se ven (undefined = todas). */
  tienda?: string | null;
  /** Si viene, se muestra un botón para volver (p. ej. al cerrar la pantalla completa en la caja). */
  onSalir?: () => void;
}

/** Pantalla completa del navegador (oculta barras); se puede salir con el mismo botón. */
function usePantallaCompleta() {
  const [activa, setActiva] = useState(() => !!document.fullscreenElement);
  useEffect(() => {
    const f = () => setActiva(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', f);
    return () => document.removeEventListener('fullscreenchange', f);
  }, []);
  const alternar = () => {
    try {
      if (document.fullscreenElement) void document.exitFullscreen();
      else void document.documentElement.requestFullscreen?.();
    } catch { /* sin soporte: la pantalla ya ocupa todo */ }
  };
  return { activa, alternar };
}

export function PantallaEstaciones({ clienteId, esAdmin, tienda, onSalir }: Props) {
  const empleado = { cliente_id: clienteId };
  const completa = usePantallaCompleta();

  const [estaciones, setEstaciones] = useState<Estacion[]>([]);
  const [cargando, setCargando] = useState(true);
  const [prefs, setPrefs] = useState<PreferenciasTablet>(() => leerPreferenciasTablet());
  const [administrar, setAdministrar] = useState(false);
  const [comandas, setComandas] = useState<Comanda[]>([]);
  const [alerta, setAlerta] = useState<Comanda | null>(null);
  const [, setReloj] = useState(0);

  const cambiarPrefs = (p: Partial<PreferenciasTablet>) => {
    setPrefs((prev) => { const s = { ...prev, ...p }; guardarPreferenciasTablet(s); return s; });
  };

  // Estaciones del negocio, en vivo.
  useEffect(() => {
    if (!empleado) return;
    let activo = true;
    const traer = () => listarEstaciones(empleado.cliente_id)
      .then((l) => { if (activo) setEstaciones(l); })
      .catch(() => {})
      .finally(() => { if (activo) setCargando(false); });
    void traer();
    const quitar = suscribirEstaciones(empleado.cliente_id, () => void traer());
    return () => { activo = false; quitar(); };
  }, [empleado?.cliente_id]);

  const estacion = estaciones.find((e) => e.id === prefs.estacionId) || null;

  // Pedidos de esta estación, en vivo.
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;
  useEffect(() => {
    if (!empleado || !estacion) return;
    let activo = true;
    obtenerComandasActivas(empleado.cliente_id, tienda)
      .then((l) => { if (activo) setComandas(l.filter((c) => c.estacionId === estacion.id)); })
      .catch(() => {});
    const quitar = suscribirComandas(empleado.cliente_id, (c) => {
      if (c.estacionId !== estacion.id) return;
      setComandas((prev) => {
        const existe = prev.some((x) => x.id === c.id);
        if (c.estado === 'entregado' || c.estado === 'cancelado') return prev.filter((x) => x.id !== c.id);
        if (!existe && c.estado === 'pendiente') {
          setAlerta(c);
          if (prefsRef.current.sonido) timbre();
        }
        return existe ? prev.map((x) => (x.id === c.id ? c : x)) : [...prev, c];
      });
    }, tienda);
    return () => { activo = false; quitar(); };
  }, [empleado?.cliente_id, estacion?.id, tienda]);

  // Mientras el letrero esté arriba, el timbre se repite cada 4 s.
  useEffect(() => {
    if (!alerta || !prefs.sonido) return;
    const t = setInterval(timbre, 4000);
    return () => clearInterval(t);
  }, [alerta, prefs.sonido]);

  // Minutos de espera se actualizan solos y la pantalla no se apaga.
  useEffect(() => {
    const t = setInterval(() => setReloj((n) => n + 1), 30000);
    let bloqueo: any = null;
    const pedir = async () => {
      try { bloqueo = await (navigator as any).wakeLock?.request('screen'); } catch { /* sin soporte */ }
    };
    if (estacion) void pedir();
    const alVolver = () => { if (document.visibilityState === 'visible' && estacion) void pedir(); };
    document.addEventListener('visibilitychange', alVolver);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', alVolver); void bloqueo?.release?.(); };
  }, [estacion?.id]);

  const avanzar = async (c: Comanda, estado: EstadoComanda) => {
    setComandas((prev) => estado === 'entregado' ? prev.filter((x) => x.id !== c.id) : prev.map((x) => (x.id === c.id ? { ...x, estado } : x)));
    try { await actualizarEstadoComanda(c.id, estado); }
    catch (e) { toast.error(`No se pudo actualizar: ${(e as Error).message}`); }
  };

  const pendientes = useMemo(() => comandas.filter((c) => c.estado !== 'listo'), [comandas]);
  const listos = useMemo(() => comandas.filter((c) => c.estado === 'listo'), [comandas]);

  if (!empleado) return null;

  if (cargando) {
    return <div className="min-h-[60vh] flex items-center justify-center"><Loader2 className="w-8 h-8 text-amber-500 animate-spin" /></div>;
  }

  if (administrar || (esAdmin && estaciones.length === 0)) {
    return <AdministrarEstaciones clienteId={empleado.cliente_id} estaciones={estaciones} onListo={() => setAdministrar(false)} />;
  }

  // Elegir la estación de esta tablet.
  if (!estacion) {
    return (
      <div className="min-h-screen bg-slate-950 px-5 py-8">
        {onSalir && (
          <button onClick={() => { if (document.fullscreenElement) void document.exitFullscreen(); onSalir(); }} className="float-right h-10 px-3 rounded-xl bg-slate-900 border border-slate-700 text-slate-300 text-sm font-bold flex items-center gap-1">
            <X className="w-4 h-4" />Salir
          </button>
        )}
        <h1 className="text-white text-2xl font-black mb-1">¿Qué estación es esta pantalla?</h1>
        <p className="text-slate-400 text-sm mb-6">Se guarda en este equipo. Aquí solo llegarán los pedidos de la estación que elijas.</p>
        {estaciones.filter((e) => e.activa).length === 0 ? (
          <p className="text-slate-400">Todavía no hay estaciones. Pide al administrador que las cree en esta misma pantalla.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {estaciones.filter((e) => e.activa).map((e) => (
              <button
                key={e.id}
                onClick={() => { audio(); cambiarPrefs({ estacionId: e.id }); if (!completa.activa) completa.alternar(); }}
                className="h-24 rounded-3xl text-white text-2xl font-black shadow-lg active:scale-[0.98] transition-transform"
                style={{ background: e.color }}
              >
                {e.nombre}
              </button>
            ))}
          </div>
        )}
        {esAdmin && (
          <Button variant="outline" className="mt-6 h-12 rounded-2xl" onClick={() => setAdministrar(true)}>
            <Settings2 className="w-4 h-4 mr-2" />Administrar estaciones
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950">
      {/* Barra de la estación */}
      <div className="sticky top-0 z-20 flex items-center gap-3 px-4 py-3 border-b border-slate-800 bg-slate-950/95">
        <div className="w-11 h-11 rounded-2xl flex items-center justify-center" style={{ background: estacion.color }}>
          <ChefHat className="w-6 h-6 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-white text-xl font-black leading-tight truncate">{estacion.nombre}</p>
          <p className="text-slate-400 text-xs">{pendientes.length} por preparar · {listos.length} listos</p>
        </div>
        <button
          onClick={() => { audio(); const s = !prefs.sonido; cambiarPrefs({ sonido: s }); if (s) timbre(); }}
          className={`h-11 px-3 rounded-2xl flex items-center gap-2 text-sm font-bold border ${prefs.sonido ? 'bg-emerald-600 border-emerald-500 text-white' : 'bg-slate-900 border-slate-700 text-slate-400'}`}
        >
          {prefs.sonido ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
          {prefs.sonido ? 'Sonido' : 'Silencio'}
        </button>
        <button onClick={() => cambiarPrefs({ estacionId: null })} className="h-11 px-3 rounded-2xl bg-slate-900 border border-slate-700 text-slate-300 text-sm font-bold">
          Cambiar
        </button>
        <button onClick={completa.alternar} title="Pantalla completa" className="h-11 w-11 rounded-2xl bg-slate-900 border border-slate-700 text-slate-300 flex items-center justify-center">
          {completa.activa ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
        </button>
        {onSalir && (
          <button onClick={() => { if (document.fullscreenElement) void document.exitFullscreen(); onSalir(); }} title="Salir" className="h-11 w-11 rounded-2xl bg-slate-900 border border-slate-700 text-slate-300 flex items-center justify-center">
            <X className="w-5 h-5" />
          </button>
        )}
        {esAdmin && (
          <button onClick={() => setAdministrar(true)} className="h-11 w-11 rounded-2xl bg-slate-900 border border-slate-700 text-slate-300 flex items-center justify-center">
            <Settings2 className="w-5 h-5" />
          </button>
        )}
      </div>

      <div className="p-4 space-y-6">
        {pendientes.length === 0 && listos.length === 0 && (
          <div className="text-center py-24">
            <ChefHat className="w-16 h-16 text-slate-700 mx-auto mb-3" />
            <p className="text-slate-400 text-lg font-semibold">Sin pedidos por ahora</p>
            <p className="text-slate-600 text-sm">Cuando un mesero envíe algo a {estacion.nombre}, aparece aquí.</p>
          </div>
        )}

        {pendientes.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {pendientes.map((c) => {
              const min = minutosDesde(c.createdAt);
              return (
                <div key={c.id} className={`rounded-3xl border-2 p-4 ${c.estado === 'preparando' ? 'border-amber-500 bg-amber-500/10' : 'border-slate-700 bg-slate-900'}`}>
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div>
                      <p className="text-white text-2xl font-black leading-tight">{c.mesaNombre || 'Mesa'}</p>
                      {c.meseroNombre && <p className="text-slate-400 text-sm">{c.meseroNombre}</p>}
                    </div>
                    <span className={`flex items-center gap-1 text-sm font-bold px-2.5 py-1 rounded-full ${min >= 15 ? 'bg-red-600 text-white' : min >= 8 ? 'bg-amber-500 text-white' : 'bg-slate-800 text-slate-300'}`}>
                      <Clock className="w-4 h-4" />{min} min
                    </span>
                  </div>
                  <ul className="space-y-1.5 mb-4">
                    {c.items.map((it, i) => (
                      <li key={i} className="flex gap-3 text-white text-lg">
                        <span className="font-black w-8 text-right" style={{ color: estacion.color }}>{it.cantidad}×</span>
                        <span className="font-semibold">{it.nombre}{it.nota ? <span className="block text-sm text-amber-300">{it.nota}</span> : null}</span>
                      </li>
                    ))}
                  </ul>
                  {c.nota && <p className="text-amber-300 text-sm mb-3">Nota: {c.nota}</p>}
                  {c.estado === 'pendiente' ? (
                    <Button className="w-full h-14 text-lg font-black rounded-2xl bg-amber-500 hover:bg-amber-600 text-white" onClick={() => void avanzar(c, 'preparando')}>
                      Preparando
                    </Button>
                  ) : (
                    <Button className="w-full h-14 text-lg font-black rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => void avanzar(c, 'listo')}>
                      <Check className="w-6 h-6 mr-2" />Listo
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {listos.length > 0 && (
          <div>
            <p className="text-slate-500 text-xs font-bold uppercase tracking-wide mb-2">Listos para llevar</p>
            <div className="flex flex-wrap gap-2">
              {listos.map((c) => (
                <button
                  key={c.id}
                  onClick={() => void avanzar(c, 'entregado')}
                  className="flex items-center gap-2 h-12 px-4 rounded-2xl bg-emerald-600/15 border border-emerald-600/50 text-emerald-300 font-bold"
                >
                  <Check className="w-5 h-5" />{c.mesaNombre || 'Mesa'} · entregado
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Letrero grande de pedido nuevo */}
      <AnimatePresence>
        {alerta && (
          <motion.button
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setAlerta(null)}
            className="fixed inset-0 z-50 flex flex-col items-center justify-center text-white"
            style={{ background: estacion.color }}
          >
            <motion.p
              animate={{ scale: [1, 1.08, 1], opacity: [1, 0.75, 1] }}
              transition={{ duration: 1, repeat: Infinity }}
              className="text-[22vw] sm:text-[16vw] leading-none font-black tracking-tight"
            >
              PEDIDO
            </motion.p>
            <p className="text-4xl font-black mt-4">{alerta.mesaNombre || 'Mesa'}</p>
            <p className="text-xl font-semibold mt-1 opacity-90">
              {alerta.items.map((i) => `${i.cantidad} ${i.nombre}`).join(' · ')}
            </p>
            <p className="mt-10 text-lg font-bold bg-black/25 px-6 py-3 rounded-full">Toca la pantalla para verlo</p>
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Administración de estaciones (solo dueño o administrador) ───────────────

function AdministrarEstaciones({ clienteId, estaciones, onListo }: { clienteId: string; estaciones: Estacion[]; onListo: () => void }) {
  const [nombre, setNombre] = useState('');
  const [color, setColor] = useState(COLORES_ESTACION[0]);
  const [ocupado, setOcupado] = useState(false);
  const [editando, setEditando] = useState<string | null>(null);
  const [nombreEdit, setNombreEdit] = useState('');

  const ejecutar = useCallback(async (fn: () => Promise<unknown>, ok?: string) => {
    setOcupado(true);
    try { await fn(); if (ok) toast.success(ok); }
    catch (e) { toast.error((e as Error).message || 'No se pudo guardar'); }
    finally { setOcupado(false); }
  }, []);

  const agregar = (n: string, c: string) => {
    const limpio = n.trim();
    if (!limpio) return;
    if (estaciones.some((e) => e.nombre.toLowerCase() === limpio.toLowerCase())) { toast.info(`${limpio} ya existe`); return; }
    void ejecutar(() => crearEstacion(clienteId, limpio, c, estaciones.length), `${limpio} creada`).then(() => {
      setNombre('');
      setColor(COLORES_ESTACION[(estaciones.length + 1) % COLORES_ESTACION.length]);
    });
  };

  const mover = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= estaciones.length) return;
    const a = estaciones[i]; const b = estaciones[j];
    void ejecutar(() => Promise.all([actualizarEstacion(a.id, { orden: j }), actualizarEstacion(b.id, { orden: i })]));
  };

  const sugeridas = ESTACIONES_SUGERIDAS.filter((s) => !estaciones.some((e) => e.nombre.toLowerCase() === s.toLowerCase()));

  return (
    <div className="min-h-screen bg-slate-950 px-5 py-6">
      <div className="flex items-center justify-between gap-3 mb-1">
        <h1 className="text-white text-2xl font-black">Estaciones</h1>
        {estaciones.length > 0 && (
          <Button variant="outline" className="h-10 rounded-xl" onClick={onListo}>
            <X className="w-4 h-4 mr-1" />Cerrar
          </Button>
        )}
      </div>
      <p className="text-slate-400 text-sm mb-5">
        Cada estación tiene su tablet. El mesero elige a cuál va cada producto y la cuenta de la mesa sigue siendo una.
      </p>

      {sugeridas.length > 0 && (
        <div className="mb-5">
          <p className="text-slate-500 text-xs font-bold uppercase tracking-wide mb-2">Agregar con un toque</p>
          <div className="flex flex-wrap gap-2">
            {sugeridas.map((s, i) => (
              <button
                key={s}
                disabled={ocupado}
                onClick={() => agregar(s, COLORES_ESTACION[(estaciones.length + i) % COLORES_ESTACION.length])}
                className="h-10 px-4 rounded-full bg-slate-900 border border-slate-700 text-slate-200 text-sm font-bold flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" />{s}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-3 mb-5">
        <p className="text-slate-500 text-xs font-bold uppercase tracking-wide mb-2">Otra estación</p>
        <div className="flex gap-2">
          <Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej: Postres" maxLength={40} className="h-11 bg-slate-950 border-slate-700 text-white" />
          <Button disabled={ocupado || !nombre.trim()} className="h-11 rounded-xl bg-amber-500 hover:bg-amber-600 text-white" onClick={() => agregar(nombre, color)}>
            <Plus className="w-4 h-4 mr-1" />Crear
          </Button>
        </div>
        <div className="flex gap-2 mt-3">
          {COLORES_ESTACION.map((c) => (
            <button key={c} onClick={() => setColor(c)} className={`w-8 h-8 rounded-full border-2 ${color === c ? 'border-white' : 'border-transparent'}`} style={{ background: c }} />
          ))}
        </div>
      </div>

      <div className="space-y-2">
        {estaciones.map((e, i) => (
          <div key={e.id} className={`flex items-center gap-2 rounded-2xl border border-slate-800 bg-slate-900 p-2.5 ${e.activa ? '' : 'opacity-60'}`}>
            <span className="w-4 h-10 rounded-full shrink-0" style={{ background: e.color }} />
            {editando === e.id ? (
              <Input
                autoFocus
                value={nombreEdit}
                onChange={(ev) => setNombreEdit(ev.target.value)}
                onBlur={() => { const n = nombreEdit.trim(); setEditando(null); if (n && n !== e.nombre) void ejecutar(() => actualizarEstacion(e.id, { nombre: n })); }}
                onKeyDown={(ev) => { if (ev.key === 'Enter') (ev.target as HTMLInputElement).blur(); }}
                className="h-10 flex-1 bg-slate-950 border-slate-700 text-white"
              />
            ) : (
              <button className="flex-1 text-left text-white font-bold" onClick={() => { setEditando(e.id); setNombreEdit(e.nombre); }}>
                {e.nombre}
                <span className="block text-xs text-slate-500 font-normal">{e.activa ? 'Toca para cambiar el nombre' : 'Apagada: no aparece al mesero'}</span>
              </button>
            )}
            <button disabled={ocupado || i === 0} onClick={() => mover(i, -1)} className="w-9 h-9 rounded-xl bg-slate-800 text-slate-300 flex items-center justify-center disabled:opacity-30"><ArrowUp className="w-4 h-4" /></button>
            <button disabled={ocupado || i === estaciones.length - 1} onClick={() => mover(i, 1)} className="w-9 h-9 rounded-xl bg-slate-800 text-slate-300 flex items-center justify-center disabled:opacity-30"><ArrowDown className="w-4 h-4" /></button>
            <button disabled={ocupado} onClick={() => void ejecutar(() => actualizarEstacion(e.id, { activa: !e.activa }), e.activa ? `${e.nombre} apagada` : `${e.nombre} encendida`)} className={`w-9 h-9 rounded-xl flex items-center justify-center ${e.activa ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-400'}`}><Power className="w-4 h-4" /></button>
            <button
              disabled={ocupado}
              onClick={() => { if (window.confirm(`¿Eliminar ${e.nombre}? Los pedidos que ya tiene se conservan.`)) void ejecutar(() => eliminarEstacion(e.id), `${e.nombre} eliminada`); }}
              className="w-9 h-9 rounded-xl bg-slate-800 text-red-400 flex items-center justify-center"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
