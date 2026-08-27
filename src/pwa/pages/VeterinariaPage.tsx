/**
 * Veterinaria y Mascotas — versión PWA/Android.
 *
 * Mismas 3 pestañas que la versión Electron (VeterinariaPage.tsx en
 * src/app/components/pos/), pero con venta directa vía crearVentaMovil()
 * en vez del carrito local de Electron -- así funciona igual de bien en
 * el celular, sin depender de `codecpos_carrito_transferido` (que no
 * existe en la PWA).
 *
 * La báscula por puerto serial NO aplica aquí a propósito -- es un
 * periférico de escritorio (USB/serial), un celular no tiene ese puerto.
 * El peso a granel se ingresa manualmente. La agenda de grooming
 * (citasGroomingService.ts) es 100% compatible tal cual, vive en Supabase.
 */
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  PawPrint, Scale, Sparkles, Pill, Search, Plus, ShoppingCart,
  Calendar, Clock, CheckCircle2, XCircle, Loader2, AlertTriangle, Dog, Cat, X,
} from 'lucide-react';
import { getSupabaseClient } from '../../app/lib/supabase/config';
import { usePwaAuth } from '../contexts/PwaAuthContext';
import { crearVentaMovil, type ItemCarritoMovil } from '../lib/ventaMovilService';
import { Button } from '../../app/components/ui/button';
import { Input } from '../../app/components/ui/input';
import {
  listarCitasGrooming, crearCitaGrooming, actualizarEstadoCita,
  type CitaGrooming, type EstadoCita,
} from '../../app/lib/supabase/citasGroomingService';

interface ProductoVet {
  id: string;
  nombre: string;
  categoria: string | null;
  precio_venta: number;
  stock: number;
  tipo_producto: string | null;
  especie: string | null;
  requiere_receta: boolean | null;
  lote: string | null;
  fecha_vencimiento: string | null;
}

const SERVICIOS_ESTETICA = [
  { nombre: 'Baño Básico', precio: 25000 },
  { nombre: 'Baño Medicado', precio: 38000 },
  { nombre: 'Corte de Pelo', precio: 35000 },
  { nombre: 'Corte de Uñas', precio: 12000 },
  { nombre: 'Desparasitación Externa', precio: 20000 },
];

const METODOS_PAGO = [
  { valor: 'efectivo', label: 'Efectivo', emoji: '💵' },
  { valor: 'nequi', label: 'Nequi', emoji: '💜' },
  { valor: 'daviplata', label: 'Daviplata', emoji: '❤️' },
  { valor: 'tarjeta', label: 'Tarjeta', emoji: '💳' },
  { valor: 'transferencia', label: 'Transferencia', emoji: '🏦' },
];

const money = (n: number) => `$${Math.round(n).toLocaleString('es-CO')}`;

type Tab = 'granel' | 'estetica' | 'farmacia';

export default function VeterinariaPage() {
  const { empleado } = usePwaAuth();
  const [tab, setTab] = useState<Tab>('granel');
  const [productos, setProductos] = useState<ProductoVet[]>([]);
  const [cargando, setCargando] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [carrito, setCarrito] = useState<Record<string, ItemCarritoMovil>>({});
  const [mostrarCheckout, setMostrarCheckout] = useState(false);

  const cargarProductos = async () => {
    if (!empleado) return;
    const client = getSupabaseClient();
    const { data } = await client!
      .from('productos')
      .select('id, nombre, categoria, precio_venta, stock, tipo_producto, especie, requiere_receta, lote, fecha_vencimiento')
      .eq('cliente_id', empleado.cliente_id)
      .eq('activo', true)
      .order('nombre');
    setProductos((data as ProductoVet[]) || []);
    setCargando(false);
  };
  useEffect(() => { cargarProductos(); }, [empleado?.cliente_id]);

  const productosGranel = useMemo(
    () => productos.filter((p) => p.tipo_producto === 'granel' &&
      (busqueda.trim() === '' || p.nombre.toLowerCase().includes(busqueda.toLowerCase()))),
    [productos, busqueda]
  );
  const productosFarmacia = useMemo(
    () => productos.filter((p) => p.tipo_producto !== 'granel' &&
      (p.requiere_receta || (p.categoria || '').toLowerCase().includes('medicamento') || p.tipo_producto === 'fisico') &&
      (busqueda.trim() === '' || p.nombre.toLowerCase().includes(busqueda.toLowerCase()))),
    [productos, busqueda]
  );

  const agregarAlCarrito = (id: string, nombre: string, precio: number, cantidad: number) => {
    setCarrito((prev) => ({ ...prev, [id]: { productoId: id, nombre, precio, cantidad: (prev[id]?.cantidad || 0) + cantidad } }));
    toast.success(`${nombre} agregado`);
  };

  const itemsCarrito = Object.values(carrito);
  const totalCarrito = itemsCarrito.reduce((a, it) => a + it.cantidad * it.precio, 0);
  const cantidadCarrito = itemsCarrito.length;

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 pb-28">
      <div className="px-5 pt-8 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-500/20 shrink-0">
            <PawPrint className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-white text-xl font-black">Veterinaria y Mascotas</h1>
            <p className="text-slate-400 text-xs">Granel, estética y farmacia</p>
          </div>
        </div>
      </div>

      <div className="flex gap-2 px-5 mb-4 overflow-x-auto">
        {([
          { id: 'granel' as Tab, label: 'Granel', icon: Scale },
          { id: 'estetica' as Tab, label: 'Estética', icon: Sparkles },
          { id: 'farmacia' as Tab, label: 'Farmacia', icon: Pill },
        ]).map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold ${
              tab === t.id ? 'bg-emerald-500 text-slate-950' : 'bg-slate-800/60 text-slate-400'
            }`}>
            <t.icon className="w-4 h-4" /> {t.label}
          </button>
        ))}
      </div>

      {cargando ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-slate-500" /></div>
      ) : (
        <div className="px-5">
          {tab === 'granel' && (
            <TabGranelMovil productos={productosGranel} busqueda={busqueda} setBusqueda={setBusqueda}
              onAgregar={(p, peso) => agregarAlCarrito(p.id, `${p.nombre} (${peso.toFixed(2)}kg)`, p.precio_venta, peso)} />
          )}
          {tab === 'estetica' && (
            <TabEsteticaMovil onFacturar={(nombre, precio) => agregarAlCarrito(`srv-${Date.now()}`, nombre, precio, 1)} />
          )}
          {tab === 'farmacia' && (
            <TabFarmaciaMovil productos={productosFarmacia} busqueda={busqueda} setBusqueda={setBusqueda}
              onAgregar={(p, cant) => agregarAlCarrito(p.id, p.nombre, p.precio_venta, cant)}
              onFacturarConsulta={(nombre, precio) => agregarAlCarrito(`srv-${Date.now()}`, nombre, precio, 1)} />
          )}
        </div>
      )}

      {/* Barra de carrito flotante */}
      {cantidadCarrito > 0 && (
        <div className="fixed bottom-20 left-4 right-4 z-30">
          <button onClick={() => setMostrarCheckout(true)}
            className="w-full h-14 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-600 shadow-xl shadow-emerald-500/30 flex items-center justify-between px-5 text-white font-bold">
            <span className="flex items-center gap-2"><ShoppingCart className="w-5 h-5" /> {cantidadCarrito} ítem{cantidadCarrito > 1 ? 's' : ''}</span>
            <span>{money(totalCarrito)}</span>
          </button>
        </div>
      )}

      {mostrarCheckout && (
        <CheckoutModal
          items={itemsCarrito}
          total={totalCarrito}
          onCerrar={() => setMostrarCheckout(false)}
          onVendido={() => { setCarrito({}); setMostrarCheckout(false); cargarProductos(); }}
        />
      )}
    </div>
  );
}

// ═══════════════ CHECKOUT ═══════════════

function CheckoutModal({ items, total, onCerrar, onVendido }: {
  items: ItemCarritoMovil[]; total: number; onCerrar: () => void; onVendido: () => void;
}) {
  const { empleado } = usePwaAuth();
  const [metodoPago, setMetodoPago] = useState('efectivo');
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConfirmar = async () => {
    if (!empleado) return;
    setProcesando(true);
    setError(null);
    const resultado = await crearVentaMovil(empleado.cliente_id, empleado.id, empleado.nombre_completo, items, metodoPago);
    setProcesando(false);
    if (resultado.ok) {
      toast.success(`Venta #${resultado.numero} registrada`);
      onVendido();
    } else {
      setError(resultado.error || 'No se pudo registrar la venta');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/70 backdrop-blur-sm" onClick={onCerrar}>
      <div className="w-full bg-slate-900 border-t border-slate-700 rounded-t-3xl p-5 max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-white font-black text-lg">Cobrar</h3>
          <button onClick={onCerrar} className="text-slate-500"><X className="w-5 h-5" /></button>
        </div>

        <div className="space-y-1.5 mb-4 max-h-40 overflow-y-auto">
          {items.map((it) => (
            <div key={it.productoId} className="flex justify-between text-sm text-slate-300">
              <span className="truncate pr-2">{it.nombre}</span>
              <span className="shrink-0">{money(it.cantidad * it.precio)}</span>
            </div>
          ))}
        </div>
        <div className="flex justify-between text-white font-black text-xl border-t border-slate-800 pt-3 mb-4">
          <span>Total</span><span>{money(total)}</span>
        </div>

        <p className="text-slate-500 text-xs font-bold uppercase mb-2">Método de pago</p>
        <div className="grid grid-cols-3 gap-2 mb-4">
          {METODOS_PAGO.map((m) => (
            <button key={m.valor} onClick={() => setMetodoPago(m.valor)}
              className={`h-12 rounded-xl text-xs font-bold flex flex-col items-center justify-center gap-0.5 ${
                metodoPago === m.valor ? 'bg-emerald-500 text-slate-950' : 'bg-slate-800 text-slate-400'
              }`}>
              <span>{m.emoji}</span>{m.label}
            </button>
          ))}
        </div>

        {error && <p className="text-red-400 text-sm mb-3">{error}</p>}

        <Button onClick={handleConfirmar} disabled={procesando} className="w-full h-12 bg-gradient-to-r from-emerald-500 to-teal-600">
          {procesando ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Confirmar venta'}
        </Button>
      </div>
    </div>
  );
}

// ═══════════════ TAB: GRANEL (peso manual) ═══════════════

function TabGranelMovil({ productos, busqueda, setBusqueda, onAgregar }: {
  productos: ProductoVet[]; busqueda: string; setBusqueda: (v: string) => void;
  onAgregar: (p: ProductoVet, peso: number) => void;
}) {
  const [activo, setActivo] = useState<ProductoVet | null>(null);
  const [peso, setPeso] = useState('');

  return (
    <div>
      <div className="relative mb-3">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
        <Input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar alimento a granel..." className="pl-9 bg-slate-800/60 border-slate-700 text-white" />
      </div>
      {productos.length === 0 ? (
        <EmptyHint icon={Scale} texto='No hay productos "Granel-Alimento" todavía. Impórtalos desde Electron con la plantilla de Veterinaria.' />
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {productos.map((p) => (
            <button key={p.id} onClick={() => { setActivo(p); setPeso(''); }} className="p-3 rounded-2xl bg-slate-800/60 border border-slate-700 text-left">
              <Scale className="w-5 h-5 text-emerald-400 mb-2" />
              <p className="text-white font-bold text-sm">{p.nombre}</p>
              <p className="text-emerald-400 font-black text-sm">{money(p.precio_venta)}/kg</p>
            </button>
          ))}
        </div>
      )}

      {activo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={() => setActivo(null)}>
          <div className="w-full max-w-sm bg-slate-900 border border-slate-700 rounded-3xl p-6" onClick={(e) => e.stopPropagation()}>
            <p className="text-white font-bold text-lg text-center mb-1">{activo.nombre}</p>
            <p className="text-slate-400 text-center mb-4">{money(activo.precio_venta)}/kg</p>
            <label className="text-slate-400 text-xs font-bold">Peso vendido (kg)</label>
            <Input value={peso} onChange={(e) => setPeso(e.target.value)} placeholder="Ej. 1.500" autoFocus
              className="mt-1 mb-4 text-center text-2xl h-14 font-black bg-slate-800 border-slate-700 text-white" />
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setActivo(null)} className="flex-1 h-11">Cancelar</Button>
              <Button onClick={() => { const kg = parseFloat(peso.replace(',', '.')); if (kg > 0) { onAgregar(activo, kg); setActivo(null); } }}
                disabled={!(parseFloat(peso.replace(',', '.')) > 0)} className="flex-1 h-11 bg-emerald-600">
                Agregar
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════ TAB: ESTÉTICA / GROOMING ═══════════════

function TabEsteticaMovil({ onFacturar }: { onFacturar: (nombre: string, precio: number) => void }) {
  const [tutorNombre, setTutorNombre] = useState('');
  const [mascotaNombre, setMascotaNombre] = useState('');
  const [especie, setEspecie] = useState<'perro' | 'gato' | 'generales'>('perro');
  const [raza, setRaza] = useState('');
  const [servicio, setServicio] = useState(SERVICIOS_ESTETICA[0]);
  const [precio, setPrecio] = useState(String(SERVICIOS_ESTETICA[0].precio));
  const [guardando, setGuardando] = useState(false);
  const [citas, setCitas] = useState<CitaGrooming[]>([]);
  const [cargandoCitas, setCargandoCitas] = useState(true);

  const cargarCitas = () => {
    const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    const manana = new Date(hoy.getTime() + 24 * 60 * 60 * 1000);
    setCargandoCitas(true);
    listarCitasGrooming(hoy, manana).then(setCitas).catch(() => {}).finally(() => setCargandoCitas(false));
  };
  useEffect(cargarCitas, []);

  const formValido = tutorNombre.trim() && mascotaNombre.trim() && Number(precio) > 0;

  return (
    <div className="space-y-5">
      <div className="bg-slate-800/60 border border-slate-700 rounded-2xl p-4">
        <p className="text-white font-bold mb-3 flex items-center gap-2"><Sparkles className="w-4 h-4 text-purple-400" /> Ficha rápida</p>
        <div className="grid grid-cols-2 gap-2 mb-2">
          <Input value={tutorNombre} onChange={(e) => setTutorNombre(e.target.value)} placeholder="Tutor" className="bg-slate-900 border-slate-700 text-white" />
          <Input value={mascotaNombre} onChange={(e) => setMascotaNombre(e.target.value)} placeholder="Mascota" className="bg-slate-900 border-slate-700 text-white" />
        </div>
        <div className="grid grid-cols-2 gap-2 mb-2">
          <select value={especie} onChange={(e) => setEspecie(e.target.value as any)} className="h-10 rounded-lg px-3 text-sm bg-slate-900 border border-slate-700 text-white">
            <option value="perro">Perro</option><option value="gato">Gato</option><option value="generales">Otro</option>
          </select>
          <Input value={raza} onChange={(e) => setRaza(e.target.value)} placeholder="Raza" className="bg-slate-900 border-slate-700 text-white" />
        </div>
        <div className="grid grid-cols-2 gap-2 mb-3">
          <select value={servicio.nombre} onChange={(e) => { const s = SERVICIOS_ESTETICA.find((x) => x.nombre === e.target.value) || SERVICIOS_ESTETICA[0]; setServicio(s); setPrecio(String(s.precio)); }}
            className="h-10 rounded-lg px-3 text-sm bg-slate-900 border border-slate-700 text-white">
            {SERVICIOS_ESTETICA.map((s) => <option key={s.nombre} value={s.nombre}>{s.nombre}</option>)}
          </select>
          <Input value={precio} onChange={(e) => setPrecio(e.target.value)} className="bg-slate-900 border-slate-700 text-white" />
        </div>
        <div className="flex gap-2">
          <Button variant="outline" disabled={guardando || !formValido} onClick={async () => {
            setGuardando(true);
            try {
              await crearCitaGrooming({ tutorNombre: tutorNombre.trim(), mascotaNombre: mascotaNombre.trim(), especie, raza: raza.trim() || undefined, servicio: servicio.nombre, precio: Number(precio), fechaHora: new Date().toISOString() });
              toast.success('Turno agendado'); cargarCitas();
            } catch (e: any) { toast.error(e.message); } finally { setGuardando(false); }
          }} className="flex-1 h-10 text-sm"><Calendar className="w-4 h-4 mr-1.5" /> Agendar</Button>
          <Button disabled={!formValido} onClick={() => onFacturar(`${servicio.nombre} — ${mascotaNombre.trim()}`, Number(precio))} className="flex-1 h-10 text-sm bg-gradient-to-r from-purple-500 to-fuchsia-600">
            <ShoppingCart className="w-4 h-4 mr-1.5" /> Facturar
          </Button>
        </div>
      </div>

      <div>
        <p className="text-slate-400 text-xs font-bold uppercase mb-2">Agenda de hoy</p>
        {cargandoCitas ? <Loader2 className="w-5 h-5 animate-spin text-slate-500 mx-auto" /> : citas.length === 0 ? (
          <p className="text-slate-500 text-sm text-center py-4">Sin turnos hoy.</p>
        ) : (
          <div className="space-y-2">
            {citas.map((c) => (
              <div key={c.id} className="bg-slate-800/40 border border-slate-700 rounded-xl p-3">
                <div className="flex justify-between items-center">
                  <span className="text-white font-bold text-sm flex items-center gap-1.5">
                    {c.especie === 'gato' ? <Cat className="w-3.5 h-3.5" /> : <Dog className="w-3.5 h-3.5" />} {c.mascotaNombre}
                  </span>
                  <span className="text-slate-500 text-xs font-mono">{new Date(c.fechaHora).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
                <p className="text-slate-400 text-xs">{c.servicio} · {money(c.precio)}</p>
                <div className="flex gap-2 mt-1.5">
                  <EstadoBadge estado={c.estado} />
                  {c.estado !== 'COMPLETADA' && c.estado !== 'CANCELADA' && (
                    <button onClick={() => { actualizarEstadoCita(c.id, 'COMPLETADA').then(cargarCitas); onFacturar(`${c.servicio} — ${c.mascotaNombre}`, c.precio); }} className="text-[11px] text-emerald-400 underline">Completar y facturar</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function EstadoBadge({ estado }: { estado: EstadoCita }) {
  const map: Record<EstadoCita, { label: string; cls: string; Icon: typeof Clock }> = {
    PENDIENTE: { label: 'Pendiente', cls: 'bg-amber-500/15 text-amber-400', Icon: Clock },
    EN_PROCESO: { label: 'En proceso', cls: 'bg-sky-500/15 text-sky-400', Icon: Loader2 },
    COMPLETADA: { label: 'Completada', cls: 'bg-emerald-500/15 text-emerald-400', Icon: CheckCircle2 },
    CANCELADA: { label: 'Cancelada', cls: 'bg-red-500/15 text-red-400', Icon: XCircle },
  };
  const { label, cls, Icon } = map[estado];
  return <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${cls}`}><Icon className="w-3 h-3" />{label}</span>;
}

// ═══════════════ TAB: FARMACIA ═══════════════

function TabFarmaciaMovil({ productos, busqueda, setBusqueda, onAgregar, onFacturarConsulta }: {
  productos: ProductoVet[]; busqueda: string; setBusqueda: (v: string) => void;
  onAgregar: (p: ProductoVet, cantidad: number) => void;
  onFacturarConsulta: (nombre: string, precio: number) => void;
}) {
  const [nombreConsulta, setNombreConsulta] = useState('Consulta General');
  const [precioConsulta, setPrecioConsulta] = useState('45000');
  const vencidoPronto = (fecha?: string | null) => !!fecha && (new Date(fecha).getTime() - Date.now()) / (1000 * 60 * 60 * 24) <= 60;

  return (
    <div>
      <div className="bg-slate-800/60 border border-slate-700 rounded-2xl p-4 mb-4">
        <p className="text-white font-bold text-sm mb-2 flex items-center gap-2"><Pill className="w-4 h-4 text-sky-400" /> Consulta / honorarios</p>
        <div className="flex gap-2 mb-2">
          <Input value={nombreConsulta} onChange={(e) => setNombreConsulta(e.target.value)} className="flex-1 bg-slate-900 border-slate-700 text-white text-sm" />
          <Input value={precioConsulta} onChange={(e) => setPrecioConsulta(e.target.value)} className="w-28 bg-slate-900 border-slate-700 text-white text-sm" />
        </div>
        <Button onClick={() => nombreConsulta.trim() && Number(precioConsulta) > 0 && onFacturarConsulta(nombreConsulta.trim(), Number(precioConsulta))}
          className="w-full h-9 text-sm bg-gradient-to-r from-sky-500 to-blue-600">Agregar al carrito</Button>
      </div>

      <div className="relative mb-3">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
        <Input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar medicamento..." className="pl-9 bg-slate-800/60 border-slate-700 text-white" />
      </div>

      {productos.length === 0 ? (
        <EmptyHint icon={Pill} texto="No hay medicamentos registrados todavía." />
      ) : (
        <div className="space-y-2">
          {productos.map((p) => (
            <div key={p.id} className="bg-slate-800/60 border border-slate-700 rounded-xl p-3 flex items-center gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-white font-bold text-sm truncate">{p.nombre}</p>
                <p className="text-sky-400 font-black text-sm">{money(p.precio_venta)}</p>
                {p.fecha_vencimiento && (
                  <p className={`text-[10px] flex items-center gap-0.5 ${vencidoPronto(p.fecha_vencimiento) ? 'text-red-400 font-bold' : 'text-slate-500'}`}>
                    {vencidoPronto(p.fecha_vencimiento) && <AlertTriangle className="w-2.5 h-2.5" />} Vence {p.fecha_vencimiento}
                  </p>
                )}
              </div>
              <Button size="sm" onClick={() => onAgregar(p, 1)} className="shrink-0 bg-sky-600 h-9">
                <Plus className="w-4 h-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function EmptyHint({ icon: Icon, texto }: { icon: typeof Scale; texto: string }) {
  return (
    <div className="p-6 rounded-2xl border-2 border-dashed border-slate-700 text-center text-slate-500">
      <Icon className="w-8 h-8 mx-auto mb-2 opacity-50" />
      <p className="text-xs max-w-xs mx-auto">{texto}</p>
    </div>
  );
}
