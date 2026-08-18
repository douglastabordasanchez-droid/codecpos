/**
 * Artes Gráficas — versión móvil.
 *
 * Misma tabla que Electron (ver artesGraficasService.ts): no hay copia local
 * ni cola offline en este módulo, ambas plataformas leen/escriben la misma
 * fila en Supabase directo.
 */
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  Palette, Plus, Loader2, X, Trash2, Receipt, ShoppingBag, DollarSign,
  PackageCheck, Ban, ChevronRight,
} from 'lucide-react';
import { Button } from '../../app/components/ui/button';
import { Input } from '../../app/components/ui/input';
import { usePwaAuth } from '../contexts/PwaAuthContext';
import {
  ESCALAS_CANTIDAD,
  calcularPrecioUnitario,
  listarProductosArtesGraficas,
  listarOrdenesArtesGraficas,
  crearOrdenArtesGraficas,
  registrarPagoFinalOrdenArtesGraficas,
  marcarRetiradaOrdenArtesGraficas,
  cancelarOrdenArtesGraficas,
  suscribirProductosArtesGraficas,
  suscribirOrdenesArtesGraficas,
  type ArtesGraficasProducto,
  type OrdenArtesGraficas,
  type ItemOrdenArtesGraficas,
  type TipoPagoArtesGraficas,
} from '../../app/lib/supabase/artesGraficasService';

const money = (n: number) => `$${Math.round(Number(n) || 0).toLocaleString('es-CO')}`;

const ESTADO_INFO: Record<string, { label: string; color: string }> = {
  pendiente: { label: 'Pendiente', color: '#94a3b8' },
  abonado: { label: 'Abonado', color: '#f59e0b' },
  pagado: { label: 'Pagado', color: '#22c55e' },
  retirado: { label: 'Retirado', color: '#0ea5e9' },
  cancelado: { label: 'Cancelado', color: '#ef4444' },
};

type Vista = 'ordenes' | 'catalogo';

export default function ArtesGraficasPage() {
  const { empleado } = usePwaAuth();
  const clienteId = empleado?.cliente_id || '';

  const [vista, setVista] = useState<Vista>('ordenes');
  const [productos, setProductos] = useState<ArtesGraficasProducto[]>([]);
  const [ordenes, setOrdenes] = useState<OrdenArtesGraficas[]>([]);
  const [cargando, setCargando] = useState(true);
  const [creando, setCreando] = useState(false);
  const [cobrando, setCobrando] = useState<OrdenArtesGraficas | null>(null);
  const [seleccionada, setSeleccionada] = useState<OrdenArtesGraficas | null>(null);

  const cargar = async () => {
    if (!clienteId) { setCargando(false); return; }
    setCargando(true);
    try {
      const [p, o] = await Promise.all([listarProductosArtesGraficas(clienteId), listarOrdenesArtesGraficas(clienteId)]);
      setProductos(p);
      setOrdenes(o);
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => { cargar(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [clienteId]);

  useEffect(() => {
    if (!clienteId) return;
    const d1 = suscribirProductosArtesGraficas(clienteId, cargar);
    const d2 = suscribirOrdenesArtesGraficas(clienteId, cargar);
    return () => { d1(); d2(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clienteId]);

  const activas = ordenes.filter((o) => !['retirado', 'cancelado'].includes(o.estado)).length;
  const porCobrar = ordenes.reduce((s, o) => s + o.saldo_pendiente, 0);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 pb-24">
      <div className="px-5 pt-8 pb-4 flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-fuchsia-500 to-pink-600 flex items-center justify-center shadow-lg shadow-fuchsia-500/25">
            <Palette className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-white text-xl font-black leading-tight">Artes Gráficas</h1>
            <p className="text-slate-400 text-sm">Facturas dinámicas con abono</p>
          </div>
        </div>
        {vista === 'ordenes' && (
          <button
            onClick={() => setCreando(true)}
            disabled={productos.length === 0}
            className="h-11 px-4 rounded-2xl bg-gradient-to-br from-fuchsia-500 to-pink-600 flex items-center gap-1.5 shadow-lg shadow-fuchsia-500/25 active:scale-95 transition-transform shrink-0 disabled:opacity-40"
          >
            <Plus className="w-4 h-4 text-white" />
            <span className="text-white text-sm font-bold">Nueva</span>
          </button>
        )}
      </div>

      <div className="px-5 flex gap-2 mb-4">
        <button onClick={() => setVista('ordenes')} className={`flex-1 h-10 rounded-xl text-sm font-bold flex items-center justify-center gap-1.5 ${vista === 'ordenes' ? 'bg-fuchsia-500 text-white' : 'bg-slate-900 border border-slate-800 text-slate-400'}`}>
          <Receipt className="w-4 h-4" /> Órdenes
        </button>
        <button onClick={() => setVista('catalogo')} className={`flex-1 h-10 rounded-xl text-sm font-bold flex items-center justify-center gap-1.5 ${vista === 'catalogo' ? 'bg-fuchsia-500 text-white' : 'bg-slate-900 border border-slate-800 text-slate-400'}`}>
          <ShoppingBag className="w-4 h-4" /> Catálogo
        </button>
      </div>

      {vista === 'ordenes' && (
        <div className="px-5 grid grid-cols-2 gap-3 mb-4">
          <div className="bg-gradient-to-br from-fuchsia-500/90 to-pink-600/90 rounded-2xl p-4 shadow-xl shadow-fuchsia-500/10">
            <p className="text-white/80 text-[10px] font-bold uppercase tracking-wide">Activas</p>
            <p className="text-white text-3xl font-black mt-0.5">{activas}</p>
          </div>
          <div className="bg-slate-900/70 backdrop-blur border border-slate-800 rounded-2xl p-4">
            <p className="text-slate-400 text-[10px] font-bold uppercase tracking-wide">Por cobrar</p>
            <p className="text-amber-400 text-2xl font-black mt-0.5">{money(porCobrar)}</p>
          </div>
        </div>
      )}

      {cargando ? (
        <div className="flex items-center justify-center gap-2 py-16">
          <Loader2 className="w-4 h-4 animate-spin text-fuchsia-400" />
          <span className="text-slate-500 text-sm">Cargando…</span>
        </div>
      ) : vista === 'ordenes' ? (
        <div className="px-5 space-y-2">
          {productos.length === 0 && (
            <p className="text-slate-500 text-sm text-center py-4">
              Aún no hay productos en el catálogo — pídele al admin que los cree desde Electron o desde{' '}
              <button className="text-fuchsia-400 underline font-bold" onClick={() => setVista('catalogo')}>Catálogo</button>.
            </p>
          )}
          {ordenes.length === 0 && !cargando && (
            <p className="text-slate-500 text-sm text-center py-10">Sin órdenes todavía.</p>
          )}
          {ordenes.map((o) => {
            const info = ESTADO_INFO[o.estado] || ESTADO_INFO.pendiente;
            return (
              <button key={o.id} onClick={() => setSeleccionada(o)}
                className="w-full text-left bg-slate-900/70 backdrop-blur border border-slate-800 rounded-2xl p-3.5 flex items-center gap-3 active:scale-[0.99] transition-transform">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <p className="text-white font-bold text-sm truncate">{o.numero_orden}</p>
                    <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded shrink-0" style={{ background: `${info.color}22`, color: info.color }}>{info.label}</span>
                  </div>
                  <p className="text-slate-400 text-xs truncate">{o.cliente_nombre || 'Sin cliente'} · {o.items.length} ítem(s)</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-white text-sm font-black">{money(o.total)}</p>
                  {o.saldo_pendiente > 0 && <p className="text-amber-400 text-xs font-bold">{money(o.saldo_pendiente)}</p>}
                </div>
                <ChevronRight className="w-4 h-4 text-slate-600 shrink-0" />
              </button>
            );
          })}
        </div>
      ) : (
        <div className="px-5 space-y-2">
          {productos.length === 0 && <p className="text-slate-500 text-sm text-center py-10">Sin productos todavía.</p>}
          {productos.map((p) => (
            <div key={p.id} className="bg-slate-900/70 backdrop-blur border border-slate-800 rounded-2xl p-3.5 overflow-hidden">
              {p.foto_url && (
                <div className="-mx-3.5 -mt-3.5 mb-3 h-28 bg-slate-950">
                  <img src={p.foto_url} alt={p.nombre} className="w-full h-full object-cover" />
                </div>
              )}
              <p className="text-white font-bold text-sm">{p.nombre}</p>
              <p className="text-slate-500 text-xs mb-2">{p.categoria || 'Sin categoría'} · unidad: {p.unidad}</p>
              <div className="grid grid-cols-2 gap-x-3 text-[11px]">
                <div>
                  <p className="text-fuchsia-400 font-bold mb-1">Marcado</p>
                  {ESCALAS_CANTIDAD.map((e) => (
                    <div key={e} className="flex justify-between text-slate-400"><span>x{e}</span><span className="text-white">{money(p[`precio_marcado_${e}` as keyof ArtesGraficasProducto] as number)}</span></div>
                  ))}
                </div>
                <div>
                  <p className="text-slate-500 font-bold mb-1">Sin marcar</p>
                  {ESCALAS_CANTIDAD.map((e) => (
                    <div key={e} className="flex justify-between text-slate-400"><span>x{e}</span><span className="text-white">{money(p[`precio_sin_marcar_${e}` as keyof ArtesGraficasProducto] as number)}</span></div>
                  ))}
                </div>
              </div>
            </div>
          ))}
          <p className="text-slate-600 text-[11px] text-center pt-2 pb-4">
            Crear y editar productos del catálogo se hace desde Electron.
          </p>
        </div>
      )}

      {creando && (
        <HojaInferior onCerrar={() => setCreando(false)}>
          <NuevaOrdenPwa
            clienteId={clienteId}
            productos={productos}
            creadoPor={empleado?.nombre_completo || 'Sistema'}
            onCerrar={() => setCreando(false)}
            onCreada={() => { setCreando(false); cargar(); }}
          />
        </HojaInferior>
      )}

      {seleccionada && (
        <HojaInferior onCerrar={() => setSeleccionada(null)}>
          <DetalleOrdenPwa
            orden={seleccionada}
            onCerrar={() => setSeleccionada(null)}
            onCobrar={() => { setCobrando(seleccionada); setSeleccionada(null); }}
            onRetirar={async () => { await marcarRetiradaOrdenArtesGraficas(seleccionada); setSeleccionada(null); cargar(); toast.success('Marcada como retirada'); }}
            onCancelar={async () => { await cancelarOrdenArtesGraficas(seleccionada); setSeleccionada(null); cargar(); toast.info('Orden cancelada'); }}
          />
        </HojaInferior>
      )}

      {cobrando && (
        <HojaInferior onCerrar={() => setCobrando(null)}>
          <CobrarSaldoPwa
            orden={cobrando}
            onCerrar={() => setCobrando(null)}
            onCobrado={() => { setCobrando(null); cargar(); }}
          />
        </HojaInferior>
      )}
    </div>
  );
}

function HojaInferior({ children, onCerrar }: { children: React.ReactNode; onCerrar: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/75 z-50 flex items-end" onClick={(e) => { if (e.target === e.currentTarget) onCerrar(); }}>
      <div className="w-full bg-slate-950 rounded-t-3xl border-t border-slate-800 max-h-[92vh] overflow-y-auto">
        <div className="w-10 h-1 rounded-full bg-slate-700 mx-auto mt-3" />
        {children}
      </div>
    </div>
  );
}

function DetalleOrdenPwa({
  orden, onCerrar, onCobrar, onRetirar, onCancelar,
}: {
  orden: OrdenArtesGraficas;
  onCerrar: () => void;
  onCobrar: () => void;
  onRetirar: () => void;
  onCancelar: () => void;
}) {
  const info = ESTADO_INFO[orden.estado] || ESTADO_INFO.pendiente;
  return (
    <>
      <div className="px-5 pt-3 pb-3 border-b border-slate-800 flex items-center justify-between">
        <div>
          <p className="text-white font-black text-lg leading-tight">{orden.numero_orden}</p>
          <span className="inline-block mt-1 text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: `${info.color}22`, color: info.color }}>{info.label}</span>
        </div>
        <button onClick={onCerrar} className="text-slate-400 p-1"><X className="w-5 h-5" /></button>
      </div>
      <div className="px-5 py-4 space-y-4">
        <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-3.5">
          <p className="text-slate-500 text-[10px] font-bold uppercase mb-1">Cliente</p>
          <p className="text-white font-semibold text-sm">{orden.cliente_nombre || 'Sin registrar'}</p>
          {orden.cliente_telefono && <p className="text-slate-400 text-xs">{orden.cliente_telefono}</p>}
        </div>
        <div className="space-y-1.5">
          {orden.items.map((it, i) => (
            <div key={i} className="flex items-center justify-between bg-slate-900/70 border border-slate-800 rounded-xl px-3 py-2 text-sm">
              <span className="text-slate-300">{it.producto_nombre} · {it.cantidad}{it.unidad} · {it.marcado ? 'marcado' : 'sin marcar'}</span>
              <b className="text-white">{money(it.subtotal)}</b>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-2.5 text-center">
            <p className="text-slate-500 text-[10px] font-bold uppercase">Total</p>
            <p className="text-white font-black text-sm">{money(orden.total)}</p>
          </div>
          <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-2.5 text-center">
            <p className="text-slate-500 text-[10px] font-bold uppercase">Abonado</p>
            <p className="text-emerald-400 font-black text-sm">{money(orden.abono)}</p>
          </div>
          <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-2.5 text-center">
            <p className="text-slate-500 text-[10px] font-bold uppercase">Saldo</p>
            <p className="text-amber-400 font-black text-sm">{money(orden.saldo_pendiente)}</p>
          </div>
        </div>
        <div className="flex gap-2 pb-4">
          {orden.saldo_pendiente > 0 && orden.estado !== 'cancelado' && (
            <Button onClick={onCobrar} className="flex-1 h-12 bg-gradient-to-r from-emerald-500 to-teal-600"><DollarSign className="w-4 h-4 mr-1.5" /> Cobrar saldo</Button>
          )}
          {orden.saldo_pendiente <= 0 && orden.estado === 'pagado' && (
            <Button onClick={onRetirar} variant="outline" className="flex-1 h-12 border-slate-700 text-slate-300 bg-slate-900"><PackageCheck className="w-4 h-4 mr-1.5" /> Marcar retirado</Button>
          )}
          {!['retirado', 'cancelado'].includes(orden.estado) && (
            <Button onClick={onCancelar} variant="outline" className="h-12 px-4 border-red-900 text-red-400 bg-slate-900"><Ban className="w-4 h-4" /></Button>
          )}
        </div>
      </div>
    </>
  );
}

function CobrarSaldoPwa({ orden, onCerrar, onCobrado }: { orden: OrdenArtesGraficas; onCerrar: () => void; onCobrado: () => void }) {
  const [monto, setMonto] = useState(String(orden.saldo_pendiente));
  const [metodo, setMetodo] = useState<'efectivo' | 'nequi' | 'daviplata' | 'transferencia' | 'tarjeta'>('efectivo');
  const [enviando, setEnviando] = useState(false);
  const METODOS = ['efectivo', 'nequi', 'daviplata', 'transferencia', 'tarjeta'] as const;

  const cobrar = async () => {
    const m = Number(monto) || 0;
    if (m <= 0) { toast.error('Monto inválido'); return; }
    setEnviando(true);
    try {
      await registrarPagoFinalOrdenArtesGraficas(orden, m, metodo);
      toast.success('Pago registrado');
      onCobrado();
    } catch (e) {
      toast.error('No se pudo cobrar', { description: e instanceof Error ? e.message : undefined });
      setEnviando(false);
    }
  };

  return (
    <>
      <div className="px-5 pt-3 pb-3 border-b border-slate-800 flex items-center justify-between">
        <div>
          <p className="text-white font-black text-lg leading-tight">Cobrar saldo</p>
          <p className="text-slate-400 text-sm">{orden.numero_orden} · saldo {money(orden.saldo_pendiente)}</p>
        </div>
        <button onClick={onCerrar} className="text-slate-400 p-1"><X className="w-5 h-5" /></button>
      </div>
      <div className="px-5 py-4 space-y-4">
        <Input value={monto} onChange={(e) => setMonto(e.target.value)} type="number" inputMode="numeric" autoFocus
          className="h-16 text-3xl font-black bg-slate-900 border-slate-700 text-white" />
        <div className="grid grid-cols-3 gap-2">
          {METODOS.map((m) => (
            <button key={m} onClick={() => setMetodo(m)}
              className={`h-11 rounded-lg text-xs font-bold capitalize ${metodo === m ? 'bg-emerald-500 text-white' : 'bg-slate-900 border border-slate-800 text-slate-400'}`}>
              {m}
            </button>
          ))}
        </div>
        <Button onClick={cobrar} disabled={enviando} className="w-full h-14 text-base font-bold bg-gradient-to-r from-emerald-500 to-teal-600 disabled:opacity-50">
          {enviando ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <DollarSign className="w-5 h-5 mr-2" />}
          {enviando ? 'Registrando…' : `Registrar pago de ${money(Number(monto) || 0)}`}
        </Button>
      </div>
    </>
  );
}

function NuevaOrdenPwa({
  clienteId, productos, creadoPor, onCerrar, onCreada,
}: {
  clienteId: string;
  productos: ArtesGraficasProducto[];
  creadoPor: string;
  onCerrar: () => void;
  onCreada: () => void;
}) {
  const [clienteNombre, setClienteNombre] = useState('');
  const [clienteTelefono, setClienteTelefono] = useState('');
  const [items, setItems] = useState<ItemOrdenArtesGraficas[]>([]);
  const [productoSel, setProductoSel] = useState(productos[0]?.id || '');
  const [marcado, setMarcado] = useState(true);
  const [cantidad, setCantidad] = useState('10');
  const [tipoPago, setTipoPago] = useState<TipoPagoArtesGraficas>('no_abono');
  const [abono, setAbono] = useState('');
  const [totalPersonalizado, setTotalPersonalizado] = useState('');
  const [metodoPago, setMetodoPago] = useState('efectivo');
  const [enviando, setEnviando] = useState(false);

  const subtotal = items.reduce((s, it) => s + it.subtotal, 0);
  const total = tipoPago === 'precio_personalizado' && totalPersonalizado !== '' ? Number(totalPersonalizado) || 0 : subtotal;

  const agregarItem = () => {
    const producto = productos.find((p) => p.id === productoSel);
    const cant = Number(cantidad) || 0;
    if (!producto || cant <= 0) { toast.error('Elige un producto y una cantidad válida'); return; }
    const precioUnitario = calcularPrecioUnitario(producto, cant, marcado);
    setItems((prev) => [...prev, {
      producto_id: producto.id, producto_nombre: producto.nombre, marcado, cantidad: cant,
      unidad: producto.unidad, precio_unitario: precioUnitario, subtotal: precioUnitario * cant,
    }]);
  };

  const crear = async () => {
    if (!clienteNombre.trim()) { toast.error('El nombre del cliente es obligatorio'); return; }
    if (items.length === 0) { toast.error('Agrega al menos un ítem'); return; }
    if (tipoPago === 'abono' && (Number(abono) || 0) <= 0) { toast.error('Indica el monto del abono'); return; }
    setEnviando(true);
    try {
      await crearOrdenArtesGraficas(clienteId, {
        clienteNombre, clienteTelefono, items, tipoPago,
        totalPersonalizado: tipoPago === 'precio_personalizado' ? (Number(totalPersonalizado) || 0) : undefined,
        abono: tipoPago === 'abono' || tipoPago === 'precio_personalizado' ? (Number(abono) || 0) : undefined,
        metodoPago, creadoPor,
      });
      toast.success('Orden dinámica creada');
      onCreada();
    } catch (e) {
      toast.error('No se pudo crear la orden', { description: e instanceof Error ? e.message : undefined });
      setEnviando(false);
    }
  };

  return (
    <>
      <div className="px-5 pt-3 pb-3 border-b border-slate-800 flex items-center justify-between">
        <p className="text-white font-black text-lg">Nueva orden dinámica</p>
        <button onClick={onCerrar} className="text-slate-400 p-1"><X className="w-5 h-5" /></button>
      </div>
      <div className="px-5 py-4 space-y-4">
        <Input value={clienteNombre} onChange={(e) => setClienteNombre(e.target.value)} placeholder="Nombre del cliente" className="h-12 bg-slate-900 border-slate-700 text-white" />
        <Input value={clienteTelefono} onChange={(e) => setClienteTelefono(e.target.value)} placeholder="Teléfono" type="tel" className="h-12 bg-slate-900 border-slate-700 text-white" />

        <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-3.5">
          <p className="text-fuchsia-400 text-xs font-bold mb-2">Agregar ítem</p>
          <select value={productoSel} onChange={(e) => setProductoSel(e.target.value)}
            className="w-full h-11 rounded-lg px-3 text-sm bg-slate-950 border border-slate-800 text-white mb-2">
            {productos.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
          <div className="grid grid-cols-2 gap-2 mb-2">
            <Input value={cantidad} onChange={(e) => setCantidad(e.target.value)} type="number" inputMode="numeric" placeholder="Cantidad" className="h-11 bg-slate-950 border-slate-800 text-white" />
            <div className="flex gap-1">
              <button onClick={() => setMarcado(true)} className={`flex-1 h-11 rounded-lg text-xs font-bold ${marcado ? 'bg-fuchsia-500 text-white' : 'bg-slate-950 border border-slate-800 text-slate-400'}`}>Marcado</button>
              <button onClick={() => setMarcado(false)} className={`flex-1 h-11 rounded-lg text-xs font-bold ${!marcado ? 'bg-fuchsia-500 text-white' : 'bg-slate-950 border border-slate-800 text-slate-400'}`}>S/marcar</button>
            </div>
          </div>
          <Button size="sm" variant="outline" className="w-full border-slate-700 text-slate-300 bg-slate-950" onClick={agregarItem}><Plus className="w-3.5 h-3.5 mr-1" /> Agregar</Button>
        </div>

        {items.length > 0 && (
          <div className="space-y-1.5">
            {items.map((it, i) => (
              <div key={i} className="flex items-center justify-between text-sm bg-slate-900/70 border border-slate-800 rounded-xl px-3 py-2">
                <span className="text-slate-300">{it.producto_nombre} · {it.cantidad}{it.unidad}</span>
                <span className="flex items-center gap-2">
                  <b className="text-white">{money(it.subtotal)}</b>
                  <button onClick={() => setItems((prev) => prev.filter((_, idx) => idx !== i))}><Trash2 className="w-3.5 h-3.5 text-red-400" /></button>
                </span>
              </div>
            ))}
          </div>
        )}

        <div>
          <p className="text-fuchsia-400 text-xs font-bold mb-2">Layout de pago: Dinámico</p>
          <div className="grid grid-cols-2 gap-2 mb-2">
            {([['abono', 'Abono'], ['no_abono', 'No abono'], ['retiro', 'Retiro'], ['precio_personalizado', 'Precio personal.']] as [TipoPagoArtesGraficas, string][]).map(([val, label]) => (
              <button key={val} onClick={() => setTipoPago(val)} className={`h-11 rounded-lg text-xs font-bold ${tipoPago === val ? 'bg-fuchsia-500 text-white' : 'bg-slate-900 border border-slate-800 text-slate-400'}`}>{label}</button>
            ))}
          </div>
          {tipoPago === 'precio_personalizado' && (
            <Input value={totalPersonalizado} onChange={(e) => setTotalPersonalizado(e.target.value)} type="number" inputMode="numeric" placeholder={`Total sugerido: ${subtotal}`} className="h-11 bg-slate-900 border-slate-700 text-white mb-2" />
          )}
          {(tipoPago === 'abono' || tipoPago === 'precio_personalizado') && (
            <Input value={abono} onChange={(e) => setAbono(e.target.value)} type="number" inputMode="numeric" placeholder="Monto del abono" className="h-11 bg-slate-900 border-slate-700 text-white" />
          )}
        </div>

        <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-3 flex items-center justify-between">
          <span className="text-slate-400 text-sm">Total</span>
          <span className="text-white text-xl font-black">{money(total)}</span>
        </div>

        <Button onClick={crear} disabled={enviando} className="w-full h-14 text-base font-bold bg-gradient-to-r from-fuchsia-500 to-pink-600 disabled:opacity-50">
          {enviando ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : null}
          {enviando ? 'Creando…' : 'Crear factura dinámica'}
        </Button>
      </div>
    </>
  );
}
