/**
 * Botón flotante de sucursal (celular), solo para el administrador.
 *
 * Aparece cuando conectarse a una sede sirve de verdad:
 *   · el negocio tiene Alimentos y Bebidas (conecta este celular con la cocina
 *     y las mesas de esa sede), o
 *   · el negocio tiene dos o más sedes (piñaterías, ferreterías... con varios
 *     puntos), sin importar el tipo de negocio.
 * Al tocarlo se ve la lista ordenada de TODAS las sedes para cambiar con un
 * toque, la opción de escanear el QR de la sede donde se está parado y "ver
 * todas". Los empleados no lo ven: quedan anclados a su sede fija.
 */
import { useEffect, useRef, useState, type PointerEvent as PointerEventReact } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router';
import { Building2, QrCode, Check, Layers, X, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { usePwaAuth } from '../contexts/PwaAuthContext';
import { useModulosActivos } from '../hooks/useModulosActivos';
import { ModuloPOS } from '../../app/lib/permissions';
import { getSupabaseClient } from '../../app/lib/supabase/config';
import { getSucursalActiva, setSucursalActiva, suscribirSucursalActiva } from '../lib/sucursalActiva';
import { EscanerTiendaQR, type QRPayloadTienda } from './EscanerTiendaQR';

interface Sede { id: string; nombre: string; principal: boolean }

/** Posición elegida por el usuario (fracción del ancho y alto de la pantalla), por dispositivo. */
const CLAVE_POSICION = 'codecpos_sede_flotante_posicion';
const MARGEN = 8;

/** Pantallas con su propia barra fija abajo: ahí el botón taparía el cobro. */
const OCULTO_EN = ['/vender'];

export function SucursalFlotante({ sobreNavInferior }: { sobreNavInferior: boolean }) {
  const { empleado } = usePwaAuth();
  const { tieneModulo } = useModulosActivos();
  const { pathname } = useLocation();
  const esAdmin = !!empleado && ['admin', 'super_usuario'].includes(empleado.rol);
  const [sucursal, setSucursalLocal] = useState(getSucursalActiva());
  const [sedes, setSedes] = useState<Sede[] | null>(null);
  const [abierto, setAbierto] = useState(false);
  const [escaneando, setEscaneando] = useState(false);

  // ── Arrastrar el botón a cualquier parte de la pantalla ──
  const [posicion, setPosicion] = useState<{ x: number; y: number } | null>(() => {
    try { return JSON.parse(localStorage.getItem(CLAVE_POSICION) || 'null'); } catch { return null; }
  });
  const [, setRedibujar] = useState(0);
  const botonRef = useRef<HTMLButtonElement>(null);
  const arrastre = useRef<{ dx: number; dy: number; x0: number; y0: number; movido: boolean } | null>(null);
  const fueArrastre = useRef(false);
  const ultimaPosicion = useRef<{ x: number; y: number } | null>(null);

  // Si cambia el tamaño de la pantalla (girar el celular), el botón se vuelve a acomodar dentro.
  useEffect(() => {
    const alCambiar = () => setRedibujar((n) => n + 1);
    window.addEventListener('resize', alCambiar);
    return () => window.removeEventListener('resize', alCambiar);
  }, []);

  useEffect(() => suscribirSucursalActiva(() => setSucursalLocal(getSucursalActiva())), []);

  useEffect(() => {
    if (!esAdmin || !empleado) return;
    getSupabaseClient()!
      .from('tiendas')
      .select('local_id, nombre, es_principal, activo')
      .eq('cliente_id', empleado.cliente_id)
      .then(({ data }) => {
        const lista = ((data as any[]) || [])
          .filter((t) => t.activo !== false && t.local_id)
          .map((t) => ({ id: t.local_id as string, nombre: (t.nombre as string) || 'Sede', principal: t.es_principal === true }))
          .sort((a, b) => Number(b.principal) - Number(a.principal) || a.nombre.localeCompare(b.nombre));
        setSedes(lista);
      });
  }, [esAdmin, empleado?.cliente_id]);

  const util = tieneModulo(ModuloPOS.PANADERIA_ONCES) || (sedes?.length ?? 0) >= 2;
  if (!esAdmin || !util || OCULTO_EN.some((p) => pathname.startsWith(p))) return null;

  const elegir = (s: Sede | null) => {
    setSucursalActiva(s ? { id: s.id, nombre: s.nombre } : null);
    setAbierto(false);
    toast.success(s ? `Conectado a ${s.nombre}` : 'Viendo todas las sedes', {
      description: s ? 'Vender, Inventario y Alimentos y Bebidas muestran solo esta sede.' : undefined,
    });
  };

  const alEscanear = (payload: QRPayloadTienda) => {
    setEscaneando(false);
    elegir({ id: payload.tienda_id, nombre: payload.tienda_nombre, principal: false });
  };

  if (escaneando && empleado) {
    return (
      <EscanerTiendaQR
        clienteIdEsperado={empleado.cliente_id}
        titulo="Escanear QR de la sede"
        subtitulo="Conecta este celular a la sede donde estás"
        onResultado={alEscanear}
        onCerrar={() => setEscaneando(false)}
      />
    );
  }

  const ubicar = (left: number, top: number) => {
    const b = botonRef.current;
    const ancho = b?.offsetWidth || 120;
    const alto = b?.offsetHeight || 48;
    return {
      left: Math.min(Math.max(MARGEN, left), window.innerWidth - ancho - MARGEN),
      top: Math.min(Math.max(MARGEN, top), window.innerHeight - alto - MARGEN),
    };
  };

  const alPresionar = (e: PointerEventReact<HTMLButtonElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    arrastre.current = { dx: e.clientX - r.left, dy: e.clientY - r.top, x0: e.clientX, y0: e.clientY, movido: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const alMover = (e: PointerEventReact<HTMLButtonElement>) => {
    const a = arrastre.current;
    if (!a) return;
    // Un toque que apenas se mueve sigue siendo un toque (abre la lista).
    if (!a.movido && Math.hypot(e.clientX - a.x0, e.clientY - a.y0) < 6) return;
    a.movido = true;
    const { left, top } = ubicar(e.clientX - a.dx, e.clientY - a.dy);
    ultimaPosicion.current = { x: left / window.innerWidth, y: top / window.innerHeight };
    setPosicion(ultimaPosicion.current);
  };
  const alSoltar = () => {
    const a = arrastre.current;
    arrastre.current = null;
    if (!a?.movido) return;
    fueArrastre.current = true;
    try { localStorage.setItem(CLAVE_POSICION, JSON.stringify(ultimaPosicion.current)); } catch { /* sin almacenamiento */ }
  };

  const estiloPosicion = posicion ? ubicar(posicion.x * window.innerWidth, posicion.y * window.innerHeight) : undefined;

  return (
    <>
      <button
        ref={botonRef}
        onPointerDown={alPresionar}
        onPointerMove={alMover}
        onPointerUp={alSoltar}
        onPointerCancel={alSoltar}
        onClick={() => {
          if (fueArrastre.current) { fueArrastre.current = false; return; }
          setAbierto(true);
        }}
        style={{ ...(estiloPosicion || {}), touchAction: 'none' }}
        className={`fixed z-30 h-12 pl-3 pr-4 rounded-full flex items-center gap-2 shadow-lg border max-w-[60vw] select-none cursor-grab active:cursor-grabbing ${
          sucursal ? 'bg-emerald-600 border-emerald-500' : 'bg-slate-900 border-slate-700'
        } ${posicion ? '' : `left-4 ${sobreNavInferior ? 'bottom-[calc(5.5rem+env(safe-area-inset-bottom))]' : 'bottom-[calc(1rem+env(safe-area-inset-bottom))]'}`}`}
        aria-label="Sucursal (arrástralo para moverlo)"
        title="Toca para cambiar de sede · arrástralo para moverlo"
      >
        <Building2 className="w-5 h-5 shrink-0" style={{ color: sucursal ? '#fff' : undefined }} />
        <span className={`text-xs font-bold truncate ${sucursal ? '' : 'text-white'}`} style={sucursal ? { color: '#fff' } : undefined}>
          {sucursal ? sucursal.nombre : 'Sede'}
        </span>
      </button>

      {abierto && createPortal(
        <div className="fixed inset-0 z-[70] bg-black/60 flex items-end justify-center" onClick={() => setAbierto(false)}>
          <div className="w-full max-w-md bg-slate-950 border-t border-slate-800 rounded-t-3xl p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] space-y-2" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-2">
              <div>
                <p className="text-white text-lg font-black">Sedes del negocio</p>
                <p className="text-slate-500 text-xs">Elige dónde estás. Vender, Inventario y la cocina se ajustan a esa sede.</p>
              </div>
              <button onClick={() => setAbierto(false)} className="text-slate-400 p-1" aria-label="Cerrar"><X className="w-5 h-5" /></button>
            </div>

            {sedes === null ? (
              <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 text-amber-400 animate-spin" /></div>
            ) : (
              <div className="max-h-[45vh] overflow-y-auto space-y-2">
                {sedes.map((s) => {
                  const activa = sucursal?.id === s.id;
                  return (
                    <button key={s.id} onClick={() => elegir(s)}
                      className={`w-full flex items-center gap-3 p-3 rounded-2xl border text-left ${activa ? 'border-emerald-500/60 bg-emerald-500/10' : 'border-slate-800 bg-slate-900'}`}>
                      <Building2 className={`w-5 h-5 shrink-0 ${activa ? 'text-emerald-400' : 'text-slate-400'}`} />
                      <span className="flex-1 min-w-0">
                        <span className="block text-white text-sm font-semibold truncate">{s.nombre}</span>
                        {s.principal && <span className="block text-slate-500 text-[11px]">Sede principal</span>}
                      </span>
                      {activa && <Check className="w-5 h-5 text-emerald-400 shrink-0" />}
                    </button>
                  );
                })}
                {sedes.length === 0 && <p className="text-slate-500 text-sm text-center py-4">Todavía no hay sedes creadas. Créalas en Electron › Multi-Tienda.</p>}
              </div>
            )}

            <button onClick={() => { setAbierto(false); setEscaneando(true); }} className="w-full h-12 rounded-2xl bg-slate-800 text-white text-sm font-bold flex items-center justify-center gap-2">
              <QrCode className="w-4 h-4" /> Escanear el QR de la sede
            </button>
            <button onClick={() => elegir(null)} className="w-full h-11 rounded-2xl text-slate-400 text-sm font-semibold flex items-center justify-center gap-2">
              <Layers className="w-4 h-4" /> Ver todas las sedes
            </button>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
