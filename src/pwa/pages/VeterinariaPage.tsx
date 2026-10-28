/**
 * Veterinaria y Mascotas — web y celular, con las mismas cuatro pestañas y
 * funciones que Electron (src/app/components/pos/VeterinariaPage.tsx):
 *
 *   · Alimentos a Granel: categorías con color e ícono, bultos (crear, editar,
 *     eliminar) y venta por peso con la báscula (basculaWeb.ts) o a mano.
 *   · Ficha Clínica: mascotas, evolución de peso, vacunas, desparasitaciones,
 *     consultas y recordatorios próximos (con aviso al dueño por WhatsApp).
 *   · Agenda y Citas: grooming, consultas, vacunación..., iniciar, completar
 *     y facturar o cancelar.
 *   · Farmacia y Servicios: medicamentos con lote y vencimiento, y cobro de
 *     consultas u honorarios.
 *
 * Todo lo que se vende va al carrito de Vender (carritoTransferido.ts), como
 * Electron lo manda a su punto de venta: el cobro, la factura electrónica, la
 * impresora, el cajón, la caja y la contabilidad son los de Vender.
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import {
  PawPrint, Scale, Pill, Search, Plus, Minus, ShoppingCart, Calendar, Clock, CheckCircle2, XCircle, Loader2,
  AlertTriangle, Dog, Cat, X, Edit, Trash2, Check, Bird, Fish, Bone, Rabbit, Beef, Wheat, Milk, Feather, Turtle,
  Package2, Stethoscope, Syringe, Weight, Phone, User, Bell, Bug, Activity, FileText, Sparkles, ArrowLeft, MessageCircle,
} from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip, ResponsiveContainer } from 'recharts';
import { usePwaAuth } from '../contexts/PwaAuthContext';
import { ModalPesaje } from '../components/ModalPesaje';
import { useBasculaWeb } from '../hooks/useBasculaWeb';
import { areaDeItem, type AreaVenta } from '../lib/ventasPorArea';
import {
  CobroRapidoPeluqueria, BotonNuevoMascotas, TEMA_WEB, unirServicios, type ServicioMascota,
} from '../components/VeterinariaRapido';
import { CLAVE_CARRITO_TRANSFERIDO, transferirAlCarrito } from '../lib/carritoTransferido';
import type { ItemCarritoMovil } from '../lib/ventaMovilService';
import {
  listarProductosVet, esProductoFarmacia, listarCategoriasGranel, guardarCategoriaGranel, eliminarCategoriaGranel,
  guardarBulto, eliminarProductoVet, crearProductoMascotas, coincideBusquedaVet, type ProductoVetWeb, type CategoriaGranelWeb,
} from '../lib/veterinariaWeb';
import { DescargarExcelMascotas } from '../components/DescargarExcelMascotas';
import {
  listarCitasGrooming, crearCitaGrooming, actualizarEstadoCita,
  type CitaGrooming, type EstadoCita, type TipoCita,
} from '../../app/lib/supabase/citasGroomingService';
import {
  listarMascotas, crearMascota, actualizarMascota, listarPesoHistorico, registrarPeso,
  listarEventos, crearEvento, eliminarEvento, eventosProximos, marcarRecordatorioEnviado,
  type Mascota, type RegistroPeso, type EventoClinico, type EventoProximo,
  type EspecieMascota, type SexoMascota, type TipoEventoClinico,
} from '../../app/lib/supabase/mascotasService';

const money = (n: number) => `$${Math.round(n).toLocaleString('es-CO')}`;

// ── Estilos comunes (paleta slate que themeClaro.css repinta en modo claro) ──
const tarjeta = 'bg-slate-900/70 backdrop-blur border border-slate-800 rounded-2xl';
const campo = 'mt-1 w-full h-10 rounded-lg px-3 text-sm bg-slate-950 border border-slate-800 text-white outline-none focus:border-emerald-500';
const etiqueta = 'text-xs font-bold text-slate-400';

// ── Biblioteca de íconos y colores: la misma de Electron ────────────────────
const ICONOS_GRANEL = [
  { key: 'perro', label: 'Perro', Component: Dog },
  { key: 'gato', label: 'Gato', Component: Cat },
  { key: 'ave', label: 'Ave', Component: Bird },
  { key: 'pez', label: 'Pez', Component: Fish },
  { key: 'hueso', label: 'Hueso', Component: Bone },
  { key: 'roedor', label: 'Roedor', Component: Rabbit },
  { key: 'carne', label: 'Carne', Component: Beef },
  { key: 'grano', label: 'Grano', Component: Wheat },
  { key: 'lacteo', label: 'Lácteo', Component: Milk },
  { key: 'pluma', label: 'Aves exóticas', Component: Feather },
  { key: 'tortuga', label: 'Tortuga', Component: Turtle },
  { key: 'favorito', label: 'Favorito', Component: PawPrint },
  { key: 'general', label: 'General', Component: Package2 },
] as const;

const COLORES_GRANEL = [
  '#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16', '#22c55e', '#10b981', '#14b8a6',
  '#06b6d4', '#0ea5e9', '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7', '#d946ef', '#ec4899',
];

const iconoGranel = (key: string | undefined, cls = 'w-5 h-5') => {
  const Comp = ICONOS_GRANEL.find((i) => i.key === key)?.Component || Scale;
  return <Comp className={cls} />;
};

const esColorClaro = (hex: string) => {
  let n = (hex || '').replace('#', '');
  if (n.length === 3) n = n.split('').map((c) => c + c).join('');
  if (n.length !== 6) return false;
  const r = parseInt(n.slice(0, 2), 16), g = parseInt(n.slice(2, 4), 16), b = parseInt(n.slice(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.68;
};

/** Ítem de servicio para el carrito: no es un producto del inventario. */
const itemServicio = (nombre: string, precio: number, area: AreaVenta): ItemCarritoMovil => ({
  productoId: `srv-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, nombre, precio, precioOriginal: precio, cantidad: 1, area,
});

/** Área de un producto de Veterinaria para el cierre por áreas. */
const areaProducto = (p: ProductoVetWeb) => areaDeItem({
  nombre: p.nombre, categoria: p.categoria, tipoProducto: p.tipo_producto, requiereReceta: p.requiere_receta,
});

const whatsapp = (telefono: string, texto: string) => {
  const digitos = telefono.replace(/\D/g, '');
  const numero = digitos.length === 10 ? `57${digitos}` : digitos;
  return `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`;
};

/** Ventana: hoja que sube en el celular, centrada en el computador. */
function Hoja({ titulo, icono, onCerrar, children, ancho = 'sm:max-w-lg' }: {
  titulo: string; icono?: ReactNode; onCerrar: () => void; children: ReactNode; ancho?: string;
}) {
  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4" onClick={onCerrar}>
      <div className={`w-full ${ancho} bg-slate-900 border border-slate-800 rounded-t-3xl sm:rounded-3xl p-5 sm:p-6 max-h-[92vh] overflow-y-auto`} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3 mb-4">
          <h3 className="text-white text-lg font-bold flex items-center gap-2">{icono}{titulo}</h3>
          <button onClick={onCerrar} className="text-slate-400 hover:text-white" aria-label="Cerrar"><X className="w-5 h-5" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Vacio({ icono: Icono, texto }: { icono: typeof Scale; texto: string }) {
  return (
    <div className="p-8 rounded-2xl border-2 border-dashed border-slate-800 text-center text-slate-500">
      <Icono className="w-10 h-10 mx-auto mb-3 opacity-50" />
      <p className="text-sm max-w-md mx-auto">{texto}</p>
    </div>
  );
}

type Tab = 'granel' | 'mascotas' | 'agenda' | 'farmacia';

export default function VeterinariaPage() {
  const { empleado } = usePwaAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('granel');
  const [productos, setProductos] = useState<ProductoVetWeb[]>([]);
  const [cargando, setCargando] = useState(true);
  const [pendientes, setPendientes] = useState<ItemCarritoMovil[]>(() => {
    try { return JSON.parse(sessionStorage.getItem(CLAVE_CARRITO_TRANSFERIDO) || '[]'); } catch { return []; }
  });
  // Mantiene la báscula abierta mientras se trabaja en el módulo.
  useBasculaWeb();

  const clienteId = empleado?.cliente_id || '';

  const cargarProductos = async () => {
    if (!clienteId) return;
    try { setProductos(await listarProductosVet(clienteId)); }
    catch (e: any) { toast.error('No se pudieron cargar los productos', { description: e?.message }); }
    finally { setCargando(false); }
  };
  useEffect(() => { cargarProductos(); }, [clienteId]);

  /** Igual que Electron: lo que se vende va al carrito de Vender. */
  const enviar = (items: ItemCarritoMovil[], irACobrar = false) => {
    if (!transferirAlCarrito(items)) { toast.error('No se pudo enviar al carrito. Intenta de nuevo.'); return; }
    const nuevos = [...pendientes, ...items];
    setPendientes(nuevos);
    if (irACobrar) { navigate('/vender'); return; }
    toast.success(items.length === 1 ? `${items[0].nombre} listo para cobrar` : `${items.length} ítems listos para cobrar`, {
      action: { label: 'Cobrar', onClick: () => navigate('/vender') },
    });
  };

  const totalPendiente = pendientes.reduce((a, it) => a + it.cantidad * it.precio, 0);
  // Peluquería: los de siempre más los servicios creados con el "+".
  const servicios = useMemo(() => unirServicios(
    // Servicios creados con el "+" y los de peluquería que el negocio ya tenía como productos ("BAÑO # 1").
    productos.filter((p) => p.tipo_producto !== 'granel' && areaProducto(p) === 'peluqueria').map((p) => ({ nombre: p.nombre, precio: p.precio_venta })),
  ), [productos]);

  const TABS: { id: Tab; label: string; corto: string; icon: typeof Scale }[] = [
    { id: 'granel', label: 'Alimentos a Granel', corto: 'Granel', icon: Scale },
    { id: 'mascotas', label: 'Ficha Clínica', corto: 'Fichas', icon: Stethoscope },
    { id: 'agenda', label: 'Agenda y Citas', corto: 'Agenda', icon: Calendar },
    { id: 'farmacia', label: 'Farmacia y Servicios', corto: 'Farmacia', icon: Pill },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 pb-[calc(12rem+env(safe-area-inset-bottom))] lg:pb-28">
      <div className="px-4 sm:px-6 pt-6 sm:pt-8 pb-4 flex flex-wrap items-center gap-3">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-500/20 shrink-0">
          <PawPrint className="w-6 h-6" style={{ color: '#fff' }} />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-white text-xl sm:text-2xl font-black">Veterinaria y Mascotas</h1>
          <p className="text-slate-400 text-xs sm:text-sm">Granel con báscula, ficha clínica, agenda y farmacia, conectados al inventario y a la caja</p>
        </div>
        <DescargarExcelMascotas clienteId={clienteId} claro={false} />
        <BotonNuevoMascotas tema={TEMA_WEB} onGuardar={async (item) => {
          if (item.tipo === 'bulto' && item.bulto) {
            // Igual que crear un bulto en Alimentos a Granel: precio y stock en kilos.
            await guardarBulto(clienteId, empleado?.id || '', {
              nombre: item.nombre, categoria: item.categoria, especie: item.bulto.especie, costo: item.costo,
              precioPorKilo: item.precio, pesoBultoKg: item.bulto.pesoKg, rendimientoRaciones: null,
              stockKg: item.cantidad, fechaVencimiento: null, lote: null,
            });
          } else {
            await crearProductoMascotas(clienteId, empleado?.id || '', item);
          }
          await cargarProductos();
          setTab(item.tipo === 'servicio' ? 'agenda' : item.tipo === 'bulto' ? 'granel' : 'farmacia');
        }} />
      </div>

      <div className="flex gap-2 px-4 sm:px-6 mb-5 overflow-x-auto [&::-webkit-scrollbar]:hidden">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`shrink-0 flex items-center gap-2 px-4 h-10 rounded-xl text-sm font-bold transition-colors ${
              tab === t.id ? 'bg-emerald-500 text-slate-950' : 'bg-slate-800/80 text-slate-400 border border-slate-700'
            }`}>
            <t.icon className="w-4 h-4" /> <span className="sm:hidden">{t.corto}</span><span className="hidden sm:inline">{t.label}</span>
          </button>
        ))}
      </div>

      <div className="px-4 sm:px-6">
        {cargando ? (
          <div className="flex justify-center py-16"><Loader2 className="w-7 h-7 animate-spin text-slate-500" /></div>
        ) : (
          <>
            {tab === 'granel' && (
              <TabGranel clienteId={clienteId} empleadoId={empleado?.id || ''}
                productos={productos.filter((p) => p.tipo_producto === 'granel')}
                pendientes={pendientes}
                onCambio={cargarProductos}
                onVender={(p, kg) => enviar([{ productoId: p.id, nombre: p.nombre, precio: p.precio_venta, precioOriginal: p.precio_venta, cantidad: kg, unidad: 'kg', area: 'granel' }])} />
            )}
            {tab === 'mascotas' && <TabMascotas clienteId={clienteId} />}
            {tab === 'agenda' && (
              <TabAgenda clienteId={clienteId} servicios={servicios} onFacturar={(nombre, precio, cobrarYa, area) => enviar([itemServicio(nombre, precio, area)], cobrarYa)} />
            )}
            {tab === 'farmacia' && (
              <TabFarmacia productos={productos.filter(esProductoFarmacia)}
                serviciosConsulta={productos.filter((p) => p.tipo_producto === 'servicio' && areaProducto(p) === 'consultas')}
                onVender={(p, cantidad) => enviar([{ productoId: p.id, nombre: p.nombre, precio: p.precio_venta, precioOriginal: p.precio_venta, cantidad, area: areaProducto(p) }])}
                onFacturarConsulta={(nombre, precio) => enviar([itemServicio(nombre, precio, 'consultas')])} />
            )}
          </>
        )}
      </div>

      {pendientes.length > 0 && (
        <div className="fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] lg:bottom-6 left-4 right-4 lg:left-auto lg:right-6 lg:w-96 z-30">
          <button onClick={() => navigate('/vender')}
            className="w-full h-14 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-600 shadow-xl shadow-emerald-500/30 flex items-center justify-between px-5 font-bold"
            style={{ color: '#fff' }}>
            <span className="flex items-center gap-2"><ShoppingCart className="w-5 h-5" /> {pendientes.length} {pendientes.length === 1 ? 'ítem' : 'ítems'} · Cobrar</span>
            <span>{money(totalPendiente)}</span>
          </button>
        </div>
      )}
    </div>
  );
}

// ═══════════════════ ALIMENTOS A GRANEL ═══════════════════

const BULTO_VACIO = {
  categoria: '', nombre: '', especie: 'perro', costo: '', pesoBultoKg: '', precioPorKilo: '',
  rendimientoRaciones: '', stockKg: '', fechaVencimiento: '', lote: '',
};

function TabGranel({ clienteId, empleadoId, productos, pendientes, onCambio, onVender }: {
  clienteId: string; empleadoId: string; productos: ProductoVetWeb[]; pendientes: ItemCarritoMovil[];
  onCambio: () => void; onVender: (p: ProductoVetWeb, kg: number) => void;
}) {
  const [categorias, setCategorias] = useState<CategoriaGranelWeb[]>([]);
  const [filtro, setFiltro] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [pesando, setPesando] = useState<ProductoVetWeb | null>(null);

  const [formCat, setFormCat] = useState<{ editando: CategoriaGranelWeb | null; nombre: string; icono: string; color: string } | null>(null);
  const [formBulto, setFormBulto] = useState<{ editando: ProductoVetWeb | null; datos: typeof BULTO_VACIO } | null>(null);
  const [guardando, setGuardando] = useState(false);

  const cargarCategorias = () => {
    listarCategoriasGranel(clienteId, productos).then(setCategorias).catch((e) => toast.error('No se pudieron cargar las categorías', { description: e?.message }));
  };
  useEffect(cargarCategorias, [clienteId, productos.length]);

  const categoriaDe = (p: ProductoVetWeb) => categorias.find((c) => c.nombre.toLowerCase() === (p.categoria || '').toLowerCase());
  const visibles = productos.filter((p) =>
    (!filtro || (p.categoria || '').toLowerCase() === filtro.toLowerCase()) &&
    coincideBusquedaVet(p, busqueda));
  const kgPendientes = (id: string) => pendientes.filter((it) => it.productoId === id).reduce((a, it) => a + it.cantidad, 0);

  const guardarCategoria = async () => {
    if (!formCat) return;
    if (!formCat.nombre.trim()) { toast.error('Nombre de categoría obligatorio'); return; }
    setGuardando(true);
    try {
      await guardarCategoriaGranel(clienteId, {
        id: formCat.editando?.id, guardada: formCat.editando?.guardada, nombreAnterior: formCat.editando?.nombre,
        nombre: formCat.nombre, icono: formCat.icono, color: formCat.color,
      });
      toast.success(formCat.editando ? 'Categoría actualizada' : 'Categoría creada');
      setFormCat(null);
      if (formCat.editando && formCat.editando.nombre !== formCat.nombre.trim()) onCambio();
      cargarCategorias();
    } catch (e: any) { toast.error(e?.message || 'No se pudo guardar la categoría'); }
    finally { setGuardando(false); }
  };

  const borrarCategoria = async (cat: CategoriaGranelWeb) => {
    if (productos.some((p) => (p.categoria || '').toLowerCase() === cat.nombre.toLowerCase())) {
      toast.error('Esta categoría tiene bultos. Reasígnalos o elimínalos primero.'); return;
    }
    if (!cat.guardada || !window.confirm(`¿Eliminar la categoría "${cat.nombre}"?`)) return;
    try { await eliminarCategoriaGranel(cat.id); if (filtro === cat.nombre) setFiltro(''); cargarCategorias(); toast.success('Categoría eliminada'); }
    catch (e: any) { toast.error(e?.message || 'No se pudo eliminar'); }
  };

  const abrirBulto = (p?: ProductoVetWeb) => {
    setFormBulto(p ? {
      editando: p,
      datos: {
        categoria: p.categoria || '', nombre: p.nombre, especie: p.especie || 'perro',
        costo: p.costo ? String(p.costo) : '', pesoBultoKg: p.peso_bulto_kg ? String(p.peso_bulto_kg) : '',
        precioPorKilo: String(p.precio_por_kilo ?? p.precio_venta ?? ''), rendimientoRaciones: p.rendimiento_raciones ? String(p.rendimiento_raciones) : '',
        stockKg: String(p.stock ?? ''), fechaVencimiento: p.fecha_vencimiento || '', lote: p.lote || '',
      },
    } : { editando: null, datos: { ...BULTO_VACIO, categoria: filtro || categorias[0]?.nombre || '' } });
  };

  const guardarBultoForm = async () => {
    if (!formBulto) return;
    const d = formBulto.datos;
    const num = (v: string) => Number(v.replace(',', '.')) || 0;
    if (!d.nombre.trim()) { toast.error('El nombre del bulto es obligatorio'); return; }
    if (num(d.precioPorKilo) <= 0) { toast.error('Ingresa el precio por kilo'); return; }
    setGuardando(true);
    try {
      await guardarBulto(clienteId, empleadoId, {
        nombre: d.nombre, categoria: d.categoria || null, especie: d.especie, costo: num(d.costo),
        precioPorKilo: num(d.precioPorKilo), pesoBultoKg: d.pesoBultoKg ? num(d.pesoBultoKg) : null,
        rendimientoRaciones: d.rendimientoRaciones ? num(d.rendimientoRaciones) : null, stockKg: num(d.stockKg),
        fechaVencimiento: d.fechaVencimiento || null, lote: d.lote.trim() || null,
      }, formBulto.editando?.id);
      toast.success(formBulto.editando ? 'Bulto actualizado' : 'Bulto agregado al inventario');
      setFormBulto(null);
      onCambio();
    } catch (e: any) { toast.error('No se pudo guardar el bulto', { description: e?.message }); }
    finally { setGuardando(false); }
  };

  const borrarBulto = async (p: ProductoVetWeb) => {
    if (!window.confirm(`¿Eliminar "${p.nombre}" del inventario?`)) return;
    try { await eliminarProductoVet(p.id); toast.success('Bulto eliminado del inventario'); onCambio(); }
    catch (e: any) { toast.error(e?.message || 'No se pudo eliminar'); }
  };

  const setDato = (k: keyof typeof BULTO_VACIO, v: string) => setFormBulto((f) => (f ? { ...f, datos: { ...f.datos, [k]: v } } : f));

  return (
    <div>
      {/* Categorías */}
      <div className="flex gap-2 mb-4 overflow-x-auto [&::-webkit-scrollbar]:hidden pb-1">
        <button onClick={() => setFiltro('')}
          className={`shrink-0 px-3.5 h-9 rounded-xl text-xs font-bold border ${filtro === '' ? 'bg-white text-slate-950 border-white' : 'border-slate-700 text-slate-400'}`}>
          Todas
        </button>
        {categorias.map((cat) => {
          const claro = esColorClaro(cat.color);
          const activa = filtro.toLowerCase() === cat.nombre.toLowerCase();
          return (
            <div key={cat.id} className={`shrink-0 flex items-center rounded-xl overflow-hidden transition-all ${activa ? 'ring-2 ring-offset-2 ring-offset-slate-950 ring-white/60' : 'opacity-90'}`} style={{ backgroundColor: cat.color }}>
              <button onClick={() => setFiltro(activa ? '' : cat.nombre)} className="flex items-center gap-2 pl-3.5 pr-2 h-9 text-xs font-bold" style={{ color: claro ? '#0f172a' : '#fff' }}>
                {iconoGranel(cat.icono, 'w-3.5 h-3.5')} {cat.nombre}
              </button>
              <button onClick={() => setFormCat({ editando: cat, nombre: cat.nombre, icono: cat.icono, color: cat.color })} className="h-9 px-1.5" style={{ color: claro ? '#0f172a' : '#fff' }} aria-label="Editar categoría">
                <Edit className="w-3 h-3" />
              </button>
              {cat.guardada && (
                <button onClick={() => borrarCategoria(cat)} className="h-9 pr-2.5 pl-1" style={{ color: claro ? '#0f172a' : '#fff' }} aria-label="Eliminar categoría">
                  <Trash2 className="w-3 h-3" />
                </button>
              )}
            </div>
          );
        })}
        <button onClick={() => setFormCat({ editando: null, nombre: '', icono: 'general', color: COLORES_GRANEL[6] })}
          className="shrink-0 flex items-center gap-1.5 px-3.5 h-9 rounded-xl text-xs font-bold border border-dashed border-slate-700 text-slate-400">
          <Plus className="w-3.5 h-3.5" /> Categoría
        </button>
      </div>

      <div className="relative mb-4 max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
        <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar alimento a granel..."
          className="w-full h-11 pl-9 pr-3 rounded-xl bg-slate-900/70 border border-slate-800 text-white text-sm outline-none focus:border-emerald-500" />
      </div>

      {productos.length === 0 ? (
        <div className="space-y-3">
          <Vacio icono={Scale} texto='No hay bultos a granel todavía. Créalos con "Agregar bulto"; también aparecen los que se crean en Electron.' />
          <button onClick={() => abrirBulto()} className="w-full h-12 rounded-xl bg-emerald-600 font-bold flex items-center justify-center gap-2" style={{ color: '#fff' }}>
            <Plus className="w-4 h-4" /> Agregar bulto
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
          {visibles.map((p) => {
            const cat = categoriaDe(p);
            const color = cat?.color || '#10b981';
            const claro = esColorClaro(color);
            const yaPendiente = kgPendientes(p.id);
            const disponible = Math.max(0, p.stock - yaPendiente);
            return (
              <div key={p.id} className={`${tarjeta} relative p-4 flex flex-col`}>
                <div className="absolute right-2 top-2 flex items-center gap-1">
                  <button onClick={() => abrirBulto(p)} className="rounded-full p-1.5 bg-slate-800 text-slate-300" aria-label="Editar"><Edit className="w-3 h-3" /></button>
                  <button onClick={() => borrarBulto(p)} className="rounded-full p-1.5 bg-slate-800 text-red-400" aria-label="Eliminar"><Trash2 className="w-3 h-3" /></button>
                </div>
                <button onClick={() => disponible > 0 ? setPesando(p) : toast.error(`Sin kilos de ${p.nombre} en inventario`)} className="text-left flex-1">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-3" style={{ backgroundColor: color, color: claro ? '#0f172a' : '#fff' }}>
                    {iconoGranel(cat?.icono, 'w-5 h-5')}
                  </div>
                  <p className="text-white font-bold text-sm mb-1 pr-12 leading-tight">{p.nombre}</p>
                  <p className="font-black" style={{ color }}>{money(p.precio_venta)}/kg</p>
                  <p className={`text-xs mt-1 ${disponible <= 5 ? 'text-red-400' : 'text-slate-500'}`}>
                    Stock: {disponible.toFixed(1)} kg{p.peso_bulto_kg ? ` · bultos de ${p.peso_bulto_kg} kg` : ''}
                  </p>
                  {p.fecha_vencimiento && <p className="text-[10px] mt-0.5 text-slate-500">Vence {p.fecha_vencimiento}</p>}
                  <span className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold text-emerald-500"><Scale className="w-3.5 h-3.5" /> Pesar y vender</span>
                </button>
              </div>
            );
          })}
          <button onClick={() => abrirBulto()} className="rounded-2xl border-2 border-dashed border-slate-700 text-slate-400 p-4 flex flex-col items-center justify-center gap-2 min-h-[160px] hover:border-slate-500">
            <Plus className="w-6 h-6" /> <span className="text-sm font-bold">Agregar bulto</span>
          </button>
        </div>
      )}

      {pesando && (
        <ModalPesaje
          nombre={pesando.nombre}
          precioPorKg={pesando.precio_venta}
          stockKg={Math.max(0, pesando.stock - kgPendientes(pesando.id))}
          pesoBultoKg={pesando.peso_bulto_kg}
          onConfirmar={(kg) => { onVender(pesando, kg); setPesando(null); }}
          onCerrar={() => setPesando(null)}
        />
      )}

      {formCat && (
        <Hoja titulo={formCat.editando ? 'Editar categoría' : 'Nueva categoría'} onCerrar={() => setFormCat(null)}>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: formCat.color, color: esColorClaro(formCat.color) ? '#0f172a' : '#fff' }}>
              {iconoGranel(formCat.icono)}
            </div>
            <input autoFocus value={formCat.nombre} onChange={(e) => setFormCat({ ...formCat, nombre: e.target.value })}
              placeholder="Ej. Concentrado Aves" className={campo.replace('mt-1 ', '')} />
          </div>
          <p className={etiqueta}>Ícono</p>
          <div className="grid grid-cols-7 gap-2 mt-1 mb-4">
            {ICONOS_GRANEL.map(({ key, label, Component }) => (
              <button key={key} title={label} onClick={() => setFormCat({ ...formCat, icono: key })}
                className={`h-10 rounded-xl flex items-center justify-center border-2 ${formCat.icono === key ? 'border-emerald-500 text-emerald-500 bg-emerald-500/10' : 'border-slate-800 text-slate-400 bg-slate-950'}`}>
                <Component className="w-4 h-4" />
              </button>
            ))}
          </div>
          <p className={etiqueta}>Color</p>
          <div className="flex flex-wrap gap-2 mt-1 mb-5">
            {COLORES_GRANEL.map((c) => (
              <button key={c} onClick={() => setFormCat({ ...formCat, color: c })}
                className={`w-8 h-8 rounded-full flex items-center justify-center ${formCat.color === c ? 'ring-2 ring-offset-2 ring-offset-slate-900 ring-slate-400' : ''}`} style={{ backgroundColor: c }}>
                {formCat.color === c && <Check className="w-3.5 h-3.5" style={{ color: esColorClaro(c) ? '#0f172a' : '#fff' }} />}
              </button>
            ))}
            <label className="cursor-pointer">
              <input type="color" className="sr-only" value={formCat.color} onChange={(e) => setFormCat({ ...formCat, color: e.target.value })} />
              <span className="w-8 h-8 rounded-full border-2 border-dashed border-slate-600 flex items-center justify-center text-slate-400"><Plus className="w-3.5 h-3.5" /></span>
            </label>
          </div>
          <div className="flex gap-3">
            <button onClick={() => setFormCat(null)} className="flex-1 h-11 rounded-xl bg-slate-800 text-slate-300 font-semibold">Cancelar</button>
            <button onClick={guardarCategoria} disabled={guardando} className="flex-1 h-11 rounded-xl bg-emerald-600 font-bold flex items-center justify-center gap-2 disabled:opacity-50" style={{ color: '#fff' }}>
              {guardando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} {formCat.editando ? 'Guardar' : 'Crear'}
            </button>
          </div>
        </Hoja>
      )}

      {formBulto && (
        <Hoja titulo={formBulto.editando ? 'Editar bulto' : 'Nuevo bulto a granel'} icono={<Scale className="w-5 h-5 text-emerald-500" />} onCerrar={() => setFormBulto(null)}>
          <div className="space-y-3">
            <div>
              <label className={etiqueta}>Categoría</label>
              <select value={formBulto.datos.categoria} onChange={(e) => setDato('categoria', e.target.value)} className={campo}>
                <option value="">Sin categoría</option>
                {categorias.map((c) => <option key={c.id} value={c.nombre}>{c.nombre}</option>)}
              </select>
            </div>
            <div>
              <label className={etiqueta}>Nombre del producto</label>
              <input value={formBulto.datos.nombre} onChange={(e) => setDato('nombre', e.target.value)} placeholder="Ej. Concentrado Ringo Adulto" className={campo} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={etiqueta}>Especie</label>
                <select value={formBulto.datos.especie} onChange={(e) => setDato('especie', e.target.value)} className={campo}>
                  <option value="perro">Perro</option><option value="gato">Gato</option><option value="aves">Aves</option><option value="generales">Generales</option>
                </select>
              </div>
              <div><label className={etiqueta}>Peso del bulto (kg)</label><input inputMode="decimal" value={formBulto.datos.pesoBultoKg} onChange={(e) => setDato('pesoBultoKg', e.target.value)} placeholder="25" className={campo} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className={etiqueta}>Costo del bulto</label><input inputMode="numeric" value={formBulto.datos.costo} onChange={(e) => setDato('costo', e.target.value)} placeholder="95000" className={campo} /></div>
              <div><label className={etiqueta}>Precio por kilo *</label><input inputMode="numeric" value={formBulto.datos.precioPorKilo} onChange={(e) => setDato('precioPorKilo', e.target.value)} placeholder="6800" className={campo} /></div>
            </div>
            {Number(formBulto.datos.costo) > 0 && Number(formBulto.datos.pesoBultoKg) > 0 && Number(formBulto.datos.precioPorKilo) > 0 && (() => {
              const costoKg = Number(formBulto.datos.costo) / Number(formBulto.datos.pesoBultoKg);
              const margen = ((Number(formBulto.datos.precioPorKilo) - costoKg) / Number(formBulto.datos.precioPorKilo)) * 100;
              return <p className={`text-[11px] ${margen < 0 ? 'text-red-400' : 'text-slate-400'}`}>Costo por kilo {money(costoKg)} · margen {margen.toFixed(0)}%</p>;
            })()}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={etiqueta}>Stock disponible (kg)</label>
                <input inputMode="decimal" value={formBulto.datos.stockKg} onChange={(e) => setDato('stockKg', e.target.value)} placeholder="Ej. 50" className={campo} />
                {Number(formBulto.datos.pesoBultoKg) > 0 && Number(formBulto.datos.stockKg) > 0 && (
                  <p className="text-[11px] mt-1 text-slate-500">≈ {(Number(formBulto.datos.stockKg) / Number(formBulto.datos.pesoBultoKg)).toFixed(1)} bultos de {formBulto.datos.pesoBultoKg} kg</p>
                )}
              </div>
              <div><label className={etiqueta}>Rendimiento (raciones)</label><input inputMode="numeric" value={formBulto.datos.rendimientoRaciones} onChange={(e) => setDato('rendimientoRaciones', e.target.value)} placeholder="80" className={campo} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className={etiqueta}>Fecha de vencimiento</label><input type="date" value={formBulto.datos.fechaVencimiento} onChange={(e) => setDato('fechaVencimiento', e.target.value)} className={campo} /></div>
              <div><label className={etiqueta}>Lote</label><input value={formBulto.datos.lote} onChange={(e) => setDato('lote', e.target.value)} placeholder="Opcional" className={campo} /></div>
            </div>
          </div>
          <div className="flex gap-3 mt-5">
            <button onClick={() => setFormBulto(null)} className="flex-1 h-11 rounded-xl bg-slate-800 text-slate-300 font-semibold">Cancelar</button>
            <button onClick={guardarBultoForm} disabled={guardando} className="flex-1 h-11 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 font-bold flex items-center justify-center gap-2 disabled:opacity-50" style={{ color: '#fff' }}>
              {guardando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} {formBulto.editando ? 'Guardar cambios' : 'Agregar al inventario'}
            </button>
          </div>
        </Hoja>
      )}
    </div>
  );
}

// ═══════════════════ FICHA CLÍNICA ═══════════════════

const MASCOTA_VACIA = {
  propietarioNombre: '', propietarioTelefono: '', nombre: '', especie: 'perro' as EspecieMascota,
  raza: '', sexo: 'desconocido' as SexoMascota, fechaNacimiento: '', color: '', pesoActual: '', alergias: '', notas: '',
};

const EVENTO_VACIO = () => ({
  tipo: 'vacuna' as TipoEventoClinico, descripcion: '', fecha: new Date().toISOString().slice(0, 10),
  proximaFecha: '', veterinario: '', notas: '',
});

const TIPO_EVENTO: Record<TipoEventoClinico, { label: string; color: string; Icon: typeof Syringe }> = {
  vacuna: { label: 'Vacuna', color: '#10b981', Icon: Syringe },
  desparasitacion: { label: 'Desparasitación', color: '#f59e0b', Icon: Bug },
  consulta: { label: 'Consulta', color: '#0ea5e9', Icon: Stethoscope },
  cirugia: { label: 'Cirugía', color: '#ef4444', Icon: Activity },
  otro: { label: 'Otro', color: '#64748b', Icon: FileText },
};

const ESPECIE_LABEL: Record<string, string> = { perro: 'Perro', gato: 'Gato', aves: 'Ave', generales: 'Otra' };

const edadDesde = (fechaNacimiento: string | null) => {
  if (!fechaNacimiento) return null;
  const n = new Date(fechaNacimiento);
  if (Number.isNaN(n.getTime())) return null;
  const meses = (Date.now() - n.getTime()) / (1000 * 60 * 60 * 24 * 30.44);
  if (meses < 12) return `${Math.max(0, Math.round(meses))} meses`;
  const anios = Math.floor(meses / 12);
  const resto = Math.round(meses % 12);
  return resto > 0 ? `${anios} años, ${resto} meses` : `${anios} años`;
};

function TabMascotas({ clienteId }: { clienteId: string }) {
  const [mascotas, setMascotas] = useState<Mascota[]>([]);
  const [cargando, setCargando] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [sel, setSel] = useState<Mascota | null>(null);
  const [pesos, setPesos] = useState<RegistroPeso[]>([]);
  const [eventos, setEventos] = useState<EventoClinico[]>([]);
  const [nuevoPeso, setNuevoPeso] = useState('');
  const [registrandoPeso, setRegistrandoPeso] = useState(false);
  const [recordatorios, setRecordatorios] = useState<EventoProximo[]>([]);
  const [formMascota, setFormMascota] = useState<{ editando: Mascota | null; datos: typeof MASCOTA_VACIA } | null>(null);
  const [formEvento, setFormEvento] = useState<ReturnType<typeof EVENTO_VACIO> | null>(null);
  const [guardando, setGuardando] = useState(false);

  const cargar = async (termino = '') => {
    setCargando(true);
    try { setMascotas(await listarMascotas(termino, clienteId)); }
    catch (e: any) { toast.error('No se pudieron cargar las mascotas', { description: e?.message }); }
    finally { setCargando(false); }
  };

  useEffect(() => {
    const t = setTimeout(() => cargar(busqueda), busqueda ? 300 : 0);
    return () => clearTimeout(t);
  }, [busqueda, clienteId]);

  useEffect(() => { eventosProximos(7, clienteId).then(setRecordatorios).catch(() => {}); }, [clienteId]);

  const abrirFicha = async (m: Mascota) => {
    setSel(m);
    try {
      const [p, e] = await Promise.all([listarPesoHistorico(m.id), listarEventos(m.id)]);
      setPesos(p);
      setEventos(e);
    } catch (e: any) { toast.error('No se pudo cargar la ficha', { description: e?.message }); }
  };

  const guardarMascota = async () => {
    if (!formMascota) return;
    const f = formMascota.datos;
    if (!f.propietarioNombre.trim() || !f.nombre.trim()) { toast.error('El nombre del dueño y de la mascota son obligatorios'); return; }
    setGuardando(true);
    try {
      const datos = {
        propietarioNombre: f.propietarioNombre.trim(), propietarioTelefono: f.propietarioTelefono.trim() || undefined,
        nombre: f.nombre.trim(), especie: f.especie, raza: f.raza.trim() || undefined, sexo: f.sexo,
        fechaNacimiento: f.fechaNacimiento || undefined, color: f.color.trim() || undefined,
        pesoActual: f.pesoActual ? Number(f.pesoActual.replace(',', '.')) : undefined,
        alergias: f.alergias.trim() || undefined, notas: f.notas.trim() || undefined,
      };
      if (formMascota.editando) {
        await actualizarMascota(formMascota.editando.id, datos);
        toast.success('Ficha actualizada');
        if (sel?.id === formMascota.editando.id) setSel({ ...sel, ...datos } as Mascota);
      } else {
        const creada = await crearMascota(datos, clienteId);
        toast.success('Mascota registrada');
        await abrirFicha(creada);
      }
      setFormMascota(null);
      await cargar(busqueda);
    } catch (e: any) { toast.error('No se pudo guardar la ficha', { description: e?.message }); }
    finally { setGuardando(false); }
  };

  const guardarPeso = async () => {
    const peso = Number(nuevoPeso.replace(',', '.'));
    if (!sel || !peso || peso <= 0) return;
    setRegistrandoPeso(true);
    try {
      await registrarPeso(sel.id, peso, undefined, clienteId);
      setNuevoPeso('');
      const actualizada = { ...sel, pesoActual: peso };
      setSel(actualizada);
      setMascotas((prev) => prev.map((m) => (m.id === actualizada.id ? actualizada : m)));
      setPesos(await listarPesoHistorico(sel.id));
      toast.success('Peso registrado');
    } catch (e: any) { toast.error('No se pudo registrar el peso', { description: e?.message }); }
    finally { setRegistrandoPeso(false); }
  };

  const guardarEvento = async () => {
    if (!sel || !formEvento) return;
    if (!formEvento.descripcion.trim()) { toast.error('Describe el evento clínico'); return; }
    setGuardando(true);
    try {
      const creado = await crearEvento({
        mascotaId: sel.id, tipo: formEvento.tipo, descripcion: formEvento.descripcion.trim(), fecha: formEvento.fecha,
        proximaFecha: formEvento.proximaFecha || undefined, veterinario: formEvento.veterinario.trim() || undefined,
        notas: formEvento.notas.trim() || undefined,
      }, clienteId);
      setEventos((prev) => [creado, ...prev]);
      toast.success('Evento agregado a la ficha clínica');
      setFormEvento(null);
      eventosProximos(7, clienteId).then(setRecordatorios).catch(() => {});
    } catch (e: any) { toast.error('No se pudo guardar el evento', { description: e?.message }); }
    finally { setGuardando(false); }
  };

  const borrarEvento = async (id: string) => {
    if (!window.confirm('¿Eliminar este evento del historial clínico?')) return;
    try { await eliminarEvento(id); setEventos((prev) => prev.filter((e) => e.id !== id)); toast.success('Evento eliminado'); }
    catch { toast.error('No se pudo eliminar el evento'); }
  };

  const avisarDueno = (r: EventoProximo) => {
    if (!r.propietarioTelefono) { toast.error('Esta mascota no tiene teléfono del dueño'); return; }
    const texto = `Hola ${r.propietarioNombre}, le recordamos que ${r.mascotaNombre} tiene pendiente: ${r.descripcion}${r.proximaFecha ? ` para el ${r.proximaFecha}` : ''}. ¡Lo esperamos!`;
    window.open(whatsapp(r.propietarioTelefono, texto), '_blank');
    marcarRecordatorioEnviado(r.id).catch(() => {});
  };

  const setDatoM = (k: keyof typeof MASCOTA_VACIA, v: string) => setFormMascota((f) => (f ? { ...f, datos: { ...f.datos, [k]: v } } : f));

  return (
    <div>
      {recordatorios.length > 0 && (
        <div className="mb-4 p-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 flex items-start gap-3">
          <Bell className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="font-bold text-sm text-amber-500">
              {recordatorios.length} {recordatorios.length === 1 ? 'evento próximo' : 'eventos próximos'} de vacuna o desparasitación (7 días)
            </p>
            <div className="flex flex-wrap gap-2 mt-2">
              {recordatorios.map((r) => (
                <button key={r.id} onClick={() => avisarDueno(r)} title="Avisar al dueño por WhatsApp"
                  className="text-xs px-2.5 py-1 rounded-full bg-amber-500/15 text-amber-500 font-semibold flex items-center gap-1.5">
                  <MessageCircle className="w-3 h-3" /> {r.mascotaNombre} · {r.descripcion} · {r.proximaFecha}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-5">
        {/* Lista (en el celular se oculta al abrir una ficha) */}
        <div className={`${tarjeta} p-4 h-fit ${sel ? 'hidden lg:block' : ''}`}>
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar mascota o dueño..."
              className="w-full h-10 pl-9 pr-3 rounded-lg bg-slate-950 border border-slate-800 text-white text-sm outline-none focus:border-rose-500" />
          </div>
          <button onClick={() => setFormMascota({ editando: null, datos: MASCOTA_VACIA })}
            className="w-full h-10 mb-3 rounded-lg bg-gradient-to-r from-rose-500 to-pink-600 font-bold text-sm flex items-center justify-center gap-1.5" style={{ color: '#fff' }}>
            <Plus className="w-4 h-4" /> Nueva mascota
          </button>
          {cargando ? (
            <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-slate-500" /></div>
          ) : mascotas.length === 0 ? (
            <p className="text-xs text-center py-6 text-slate-500">Sin mascotas registradas todavía.</p>
          ) : (
            <div className="space-y-2 max-h-[560px] overflow-y-auto pr-1">
              {mascotas.map((m) => (
                <button key={m.id} onClick={() => abrirFicha(m)}
                  className={`w-full text-left p-3 rounded-xl border transition-colors ${sel?.id === m.id ? 'border-rose-500 bg-rose-500/10' : 'border-slate-800 hover:border-slate-700'}`}>
                  <div className="flex items-center gap-2">
                    {m.especie === 'gato' ? <Cat className="w-4 h-4 text-rose-500" /> : m.especie === 'aves' ? <Bird className="w-4 h-4 text-rose-500" /> : <Dog className="w-4 h-4 text-rose-500" />}
                    <span className="text-white font-bold text-sm">{m.nombre}</span>
                  </div>
                  <p className="text-xs mt-0.5 text-slate-500">{m.propietarioNombre}{m.raza ? ` · ${m.raza}` : ''}</p>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Ficha */}
        <div className={!sel ? 'hidden lg:block' : ''}>
          {!sel ? (
            <Vacio icono={Stethoscope} texto="Selecciona una mascota o crea una nueva para ver su ficha clínica: peso, vacunas y consultas." />
          ) : (
            <div className="space-y-4">
              <button onClick={() => setSel(null)} className="lg:hidden flex items-center gap-1.5 text-sm text-slate-400"><ArrowLeft className="w-4 h-4" /> Todas las mascotas</button>
              <div className={`${tarjeta} p-5`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="text-white text-xl font-black">{sel.nombre}</h3>
                    <p className="text-sm mt-0.5 text-slate-400">
                      {[sel.especie ? ESPECIE_LABEL[sel.especie] : null, sel.raza, sel.sexo && sel.sexo !== 'desconocido' ? sel.sexo : null, edadDesde(sel.fechaNacimiento)]
                        .filter(Boolean).join(' · ') || 'Sin datos adicionales'}
                    </p>
                  </div>
                  <button onClick={() => setFormMascota({
                    editando: sel,
                    datos: {
                      propietarioNombre: sel.propietarioNombre, propietarioTelefono: sel.propietarioTelefono || '', nombre: sel.nombre,
                      especie: sel.especie || 'perro', raza: sel.raza || '', sexo: sel.sexo || 'desconocido', fechaNacimiento: sel.fechaNacimiento || '',
                      color: sel.color || '', pesoActual: sel.pesoActual != null ? String(sel.pesoActual) : '', alergias: sel.alergias || '', notas: sel.notas || '',
                    },
                  })} className="rounded-full p-2 bg-slate-800 text-slate-300" aria-label="Editar"><Edit className="w-4 h-4" /></button>
                </div>
                <div className="flex flex-wrap gap-x-5 gap-y-1.5 mt-3 text-sm text-slate-400">
                  <span className="flex items-center gap-1.5"><User className="w-3.5 h-3.5" /> {sel.propietarioNombre}</span>
                  {sel.propietarioTelefono && (
                    <a href={whatsapp(sel.propietarioTelefono, `Hola ${sel.propietarioNombre}`)} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 hover:text-emerald-500">
                      <Phone className="w-3.5 h-3.5" /> {sel.propietarioTelefono}
                    </a>
                  )}
                  {sel.pesoActual != null && <span className="flex items-center gap-1.5"><Weight className="w-3.5 h-3.5" /> {sel.pesoActual} kg</span>}
                </div>
                {sel.alergias && (
                  <div className="mt-3 inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-red-500/10 text-red-500 font-semibold">
                    <AlertTriangle className="w-3 h-3" /> Alergias: {sel.alergias}
                  </div>
                )}
                {sel.notas && <p className="mt-3 text-sm text-slate-400">{sel.notas}</p>}
              </div>

              <div className={`${tarjeta} p-5`}>
                <h4 className="text-white font-bold flex items-center gap-2 mb-3"><Weight className="w-4 h-4 text-rose-500" /> Evolución de peso</h4>
                {pesos.length >= 2 ? (
                  <ResponsiveContainer width="100%" height={180}>
                    <LineChart data={pesos}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                      <XAxis dataKey="fecha" tick={{ fontSize: 10 }} stroke="#64748b" />
                      <YAxis tick={{ fontSize: 10 }} stroke="#64748b" domain={['auto', 'auto']} />
                      <RTooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                      <Line type="monotone" dataKey="peso" name="Peso (kg)" stroke="#f43f5e" strokeWidth={2} dot={{ r: 3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-xs mb-2 text-slate-500">Registra al menos 2 pesos para ver la gráfica de evolución.</p>
                )}
                <div className="flex gap-2 mt-3">
                  <input inputMode="decimal" value={nuevoPeso} onChange={(e) => setNuevoPeso(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && guardarPeso()}
                    placeholder="Nuevo peso en kg" className="flex-1 h-10 px-3 rounded-lg bg-slate-950 border border-slate-800 text-white text-sm outline-none focus:border-rose-500" />
                  <button onClick={guardarPeso} disabled={registrandoPeso || !nuevoPeso} className="shrink-0 h-10 px-4 rounded-lg bg-rose-600 font-bold text-sm disabled:opacity-50" style={{ color: '#fff' }}>
                    {registrandoPeso ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Registrar'}
                  </button>
                </div>
              </div>

              <div className={`${tarjeta} p-5`}>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-white font-bold flex items-center gap-2"><Stethoscope className="w-4 h-4 text-rose-500" /> Historial clínico</h4>
                  <button onClick={() => setFormEvento(EVENTO_VACIO())} className="h-8 px-3 rounded-lg bg-rose-600 text-sm font-bold flex items-center gap-1" style={{ color: '#fff' }}>
                    <Plus className="w-3.5 h-3.5" /> Agregar
                  </button>
                </div>
                {eventos.length === 0 ? (
                  <p className="text-xs text-slate-500">Sin vacunas, desparasitaciones ni consultas registradas todavía.</p>
                ) : (
                  <div className="space-y-2">
                    {eventos.map((ev) => {
                      const info = TIPO_EVENTO[ev.tipo] || TIPO_EVENTO.otro;
                      return (
                        <div key={ev.id} className="p-3 rounded-xl border border-slate-800 flex items-start gap-3">
                          <span className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: `${info.color}22`, color: info.color }}>
                            <info.Icon className="w-4 h-4" />
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-white font-bold text-sm">{ev.descripcion}</p>
                            <p className="text-xs mt-0.5 text-slate-500">{info.label} · {ev.fecha}{ev.veterinario ? ` · ${ev.veterinario}` : ''}</p>
                            {ev.proximaFecha && <p className="text-xs font-bold mt-0.5" style={{ color: info.color }}>Próxima: {ev.proximaFecha}</p>}
                            {ev.notas && <p className="text-xs mt-0.5 text-slate-400">{ev.notas}</p>}
                          </div>
                          <button onClick={() => borrarEvento(ev.id)} className="shrink-0 rounded-full p-1.5 bg-slate-800 text-red-400" aria-label="Eliminar"><Trash2 className="w-3.5 h-3.5" /></button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {formMascota && (
        <Hoja titulo={formMascota.editando ? 'Editar mascota' : 'Nueva mascota'} icono={<Stethoscope className="w-5 h-5 text-rose-500" />} onCerrar={() => setFormMascota(null)}>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div><label className={etiqueta}>Dueño *</label><input value={formMascota.datos.propietarioNombre} onChange={(e) => setDatoM('propietarioNombre', e.target.value)} className={campo} /></div>
              <div><label className={etiqueta}>Teléfono</label><input inputMode="tel" value={formMascota.datos.propietarioTelefono} onChange={(e) => setDatoM('propietarioTelefono', e.target.value)} className={campo} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className={etiqueta}>Nombre de la mascota *</label><input value={formMascota.datos.nombre} onChange={(e) => setDatoM('nombre', e.target.value)} className={campo} /></div>
              <div>
                <label className={etiqueta}>Especie</label>
                <select value={formMascota.datos.especie} onChange={(e) => setDatoM('especie', e.target.value)} className={campo}>
                  <option value="perro">Perro</option><option value="gato">Gato</option><option value="aves">Aves</option><option value="generales">Otra</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className={etiqueta}>Raza</label><input value={formMascota.datos.raza} onChange={(e) => setDatoM('raza', e.target.value)} className={campo} /></div>
              <div>
                <label className={etiqueta}>Sexo</label>
                <select value={formMascota.datos.sexo} onChange={(e) => setDatoM('sexo', e.target.value)} className={campo}>
                  <option value="desconocido">Desconocido</option><option value="macho">Macho</option><option value="hembra">Hembra</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className={etiqueta}>Fecha de nacimiento</label><input type="date" value={formMascota.datos.fechaNacimiento} onChange={(e) => setDatoM('fechaNacimiento', e.target.value)} className={campo} /></div>
              <div><label className={etiqueta}>Color</label><input value={formMascota.datos.color} onChange={(e) => setDatoM('color', e.target.value)} className={campo} /></div>
            </div>
            <div><label className={etiqueta}>Peso actual (kg)</label><input inputMode="decimal" value={formMascota.datos.pesoActual} onChange={(e) => setDatoM('pesoActual', e.target.value)} className={campo} /></div>
            <div><label className={etiqueta}>Alergias</label><input value={formMascota.datos.alergias} onChange={(e) => setDatoM('alergias', e.target.value)} placeholder="Opcional" className={campo} /></div>
            <div>
              <label className={etiqueta}>Notas</label>
              <textarea value={formMascota.datos.notas} onChange={(e) => setDatoM('notas', e.target.value)} rows={2}
                className="mt-1 w-full rounded-lg px-3 py-2 text-sm bg-slate-950 border border-slate-800 text-white resize-none outline-none focus:border-rose-500" />
            </div>
          </div>
          <div className="flex gap-3 mt-5">
            <button onClick={() => setFormMascota(null)} className="flex-1 h-11 rounded-xl bg-slate-800 text-slate-300 font-semibold">Cancelar</button>
            <button onClick={guardarMascota} disabled={guardando} className="flex-1 h-11 rounded-xl bg-gradient-to-r from-rose-500 to-pink-600 font-bold flex items-center justify-center gap-2 disabled:opacity-50" style={{ color: '#fff' }}>
              {guardando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} {formMascota.editando ? 'Guardar cambios' : 'Registrar mascota'}
            </button>
          </div>
        </Hoja>
      )}

      {formEvento && sel && (
        <Hoja titulo={`Nuevo evento: ${sel.nombre}`} onCerrar={() => setFormEvento(null)} ancho="sm:max-w-md">
          <div className="space-y-3">
            <div>
              <label className={etiqueta}>Tipo</label>
              <select value={formEvento.tipo} onChange={(e) => setFormEvento({ ...formEvento, tipo: e.target.value as TipoEventoClinico })} className={campo}>
                {Object.entries(TIPO_EVENTO).map(([k, info]) => <option key={k} value={k}>{info.label}</option>)}
              </select>
            </div>
            <div><label className={etiqueta}>Descripción *</label><input value={formEvento.descripcion} onChange={(e) => setFormEvento({ ...formEvento, descripcion: e.target.value })} placeholder="Ej. Vacuna quíntuple canina" className={campo} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className={etiqueta}>Fecha</label><input type="date" value={formEvento.fecha} onChange={(e) => setFormEvento({ ...formEvento, fecha: e.target.value })} className={campo} /></div>
              <div><label className={etiqueta}>Próxima fecha</label><input type="date" value={formEvento.proximaFecha} onChange={(e) => setFormEvento({ ...formEvento, proximaFecha: e.target.value })} className={campo} /></div>
            </div>
            <div><label className={etiqueta}>Veterinario</label><input value={formEvento.veterinario} onChange={(e) => setFormEvento({ ...formEvento, veterinario: e.target.value })} placeholder="Opcional" className={campo} /></div>
            <div><label className={etiqueta}>Notas</label><input value={formEvento.notas} onChange={(e) => setFormEvento({ ...formEvento, notas: e.target.value })} placeholder="Opcional" className={campo} /></div>
          </div>
          <div className="flex gap-3 mt-5">
            <button onClick={() => setFormEvento(null)} className="flex-1 h-11 rounded-xl bg-slate-800 text-slate-300 font-semibold">Cancelar</button>
            <button onClick={guardarEvento} disabled={guardando} className="flex-1 h-11 rounded-xl bg-gradient-to-r from-rose-500 to-pink-600 font-bold flex items-center justify-center gap-2 disabled:opacity-50" style={{ color: '#fff' }}>
              {guardando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Guardar evento
            </button>
          </div>
        </Hoja>
      )}
    </div>
  );
}

// ═══════════════════ AGENDA Y CITAS ═══════════════════

const TIPO_CITA: Record<TipoCita, { label: string; color: string }> = {
  grooming: { label: 'Grooming', color: '#a855f7' },
  consulta: { label: 'Consulta', color: '#0ea5e9' },
  vacunacion: { label: 'Vacunación', color: '#10b981' },
  desparasitacion: { label: 'Desparasitación', color: '#f59e0b' },
  cirugia: { label: 'Cirugía', color: '#ef4444' },
  otro: { label: 'Otro', color: '#64748b' },
};

const hoyISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

function TabAgenda({ clienteId, servicios, onFacturar }: {
  clienteId: string; servicios: ServicioMascota[]; onFacturar: (nombre: string, precio: number, cobrarYa: boolean, area: AreaVenta) => void;
}) {
  const [tipoCita, setTipoCita] = useState<TipoCita>('grooming');
  const [mascotaId, setMascotaId] = useState('');
  const [mascotas, setMascotas] = useState<Mascota[]>([]);
  const [tutor, setTutor] = useState('');
  const [telefono, setTelefono] = useState('');
  const [mascotaNombre, setMascotaNombre] = useState('');
  const [especie, setEspecie] = useState<'perro' | 'gato' | 'generales'>('perro');
  const [raza, setRaza] = useState('');
  const [tipoPelo, setTipoPelo] = useState('');
  const [observaciones, setObservaciones] = useState('');
  const [servicio, setServicio] = useState(servicios[0]);
  const [concepto, setConcepto] = useState('Consulta General');
  const [precio, setPrecio] = useState(String(servicios[0]?.precio ?? ''));
  const [fechaHora, setFechaHora] = useState(() => {
    const d = new Date(Date.now() + 60 * 60 * 1000);
    return `${hoyISO()}T${String(d.getHours()).padStart(2, '0')}:00`;
  });
  const [guardando, setGuardando] = useState(false);
  const [dia, setDia] = useState(hoyISO);
  const [citas, setCitas] = useState<CitaGrooming[]>([]);
  const [cargandoCitas, setCargandoCitas] = useState(true);

  const cargarCitas = () => {
    const desde = new Date(`${dia}T00:00:00`);
    const hasta = new Date(desde.getTime() + 24 * 60 * 60 * 1000);
    setCargandoCitas(true);
    listarCitasGrooming(desde, hasta, clienteId).then(setCitas).catch(() => {}).finally(() => setCargandoCitas(false));
  };
  useEffect(cargarCitas, [dia, clienteId]);
  useEffect(() => { listarMascotas('', clienteId).then(setMascotas).catch(() => {}); }, [clienteId]);

  const vincular = (id: string) => {
    setMascotaId(id);
    const m = mascotas.find((x) => x.id === id);
    if (m) {
      setTutor(m.propietarioNombre); setTelefono(m.propietarioTelefono || ''); setMascotaNombre(m.nombre);
      setEspecie(m.especie === 'perro' || m.especie === 'gato' ? m.especie : 'generales'); setRaza(m.raza || '');
    }
  };

  const conceptoActual = tipoCita === 'grooming' ? (servicio?.nombre || '') : concepto.trim();
  const valido = !!(tutor.trim() && mascotaNombre.trim() && Number(precio) > 0 && conceptoActual);

  const agendar = async () => {
    if (!valido) { toast.error('Completa tutor, mascota y precio'); return; }
    setGuardando(true);
    try {
      await crearCitaGrooming({
        tipo: tipoCita, mascotaId: mascotaId || undefined, tutorNombre: tutor.trim(), tutorTelefono: telefono.trim() || undefined,
        mascotaNombre: mascotaNombre.trim(), especie, raza: raza.trim() || undefined,
        tipoPelo: tipoCita === 'grooming' ? (tipoPelo.trim() || undefined) : undefined, observaciones: observaciones.trim() || undefined,
        servicio: conceptoActual, precio: Number(precio), fechaHora: new Date(fechaHora).toISOString(),
      }, clienteId);
      toast.success('Turno agendado');
      setDia(fechaHora.slice(0, 10));
      cargarCitas();
    } catch (e: any) { toast.error(e?.message || 'No se pudo agendar el turno'); }
    finally { setGuardando(false); }
  };

  const cambiarEstado = async (c: CitaGrooming, estado: EstadoCita, facturar = false) => {
    try {
      await actualizarEstadoCita(c.id, estado);
      if (facturar) onFacturar(`${c.servicio}: ${c.mascotaNombre}`, c.precio, false, c.tipo === 'grooming' ? 'peluqueria' : 'consultas');
      cargarCitas();
    } catch (e: any) { toast.error(e?.message || 'No se pudo actualizar la cita'); }
  };

  const recordarCita = (c: CitaGrooming) => {
    if (!c.tutorTelefono) { toast.error('La cita no tiene teléfono'); return; }
    const hora = new Date(c.fechaHora).toLocaleString('es-CO', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
    window.open(whatsapp(c.tutorTelefono, `Hola ${c.tutorNombre}, le recordamos la cita de ${c.mascotaNombre} (${c.servicio}) el ${hora}.`), '_blank');
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      <div className="lg:col-span-2">
        <CobroRapidoPeluqueria servicios={servicios} tema={TEMA_WEB} onCobrar={(concepto, valor) => onFacturar(concepto, valor, true, 'peluqueria')} />
      </div>
      <div className={`${tarjeta} p-5`}>
        <h3 className="text-white font-bold text-lg mb-4 flex items-center gap-2"><Sparkles className="w-5 h-5 text-purple-500" /> Nueva cita (con agenda)</h3>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={etiqueta}>Tipo de cita</label>
              <select value={tipoCita} onChange={(e) => setTipoCita(e.target.value as TipoCita)} className={campo}>
                {Object.entries(TIPO_CITA).map(([k, info]) => <option key={k} value={k}>{info.label}</option>)}
              </select>
            </div>
            <div>
              <label className={etiqueta}>Vincular mascota</label>
              <select value={mascotaId} onChange={(e) => vincular(e.target.value)} className={campo}>
                <option value="">Nueva o sin ficha</option>
                {mascotas.map((m) => <option key={m.id} value={m.id}>{m.nombre}: {m.propietarioNombre}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className={etiqueta}>Tutor</label><input value={tutor} onChange={(e) => setTutor(e.target.value)} className={campo} /></div>
            <div><label className={etiqueta}>Teléfono</label><input inputMode="tel" value={telefono} onChange={(e) => setTelefono(e.target.value)} className={campo} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className={etiqueta}>Mascota</label><input value={mascotaNombre} onChange={(e) => setMascotaNombre(e.target.value)} className={campo} /></div>
            <div>
              <label className={etiqueta}>Especie</label>
              <select value={especie} onChange={(e) => setEspecie(e.target.value as 'perro' | 'gato' | 'generales')} className={campo}>
                <option value="perro">Perro</option><option value="gato">Gato</option><option value="generales">Otro</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className={etiqueta}>Raza</label><input value={raza} onChange={(e) => setRaza(e.target.value)} className={campo} /></div>
            {tipoCita === 'grooming' && <div><label className={etiqueta}>Tipo de pelo</label><input value={tipoPelo} onChange={(e) => setTipoPelo(e.target.value)} className={campo} /></div>}
          </div>
          <div>
            <label className={etiqueta}>Observaciones</label>
            <textarea value={observaciones} onChange={(e) => setObservaciones(e.target.value)} rows={2}
              className="mt-1 w-full rounded-lg px-3 py-2 text-sm bg-slate-950 border border-slate-800 text-white resize-none outline-none focus:border-purple-500" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            {tipoCita === 'grooming' ? (
              <div>
                <label className={etiqueta}>Servicio</label>
                <select value={servicio.nombre} onChange={(e) => {
                  const s = servicios.find((x) => x.nombre === e.target.value) || servicios[0];
                  setServicio(s); setPrecio(String(s.precio));
                }} className={campo}>
                  {servicios.map((s) => <option key={s.nombre} value={s.nombre}>{s.nombre}</option>)}
                </select>
              </div>
            ) : (
              <div><label className={etiqueta}>Concepto</label><input value={concepto} onChange={(e) => setConcepto(e.target.value)} className={campo} /></div>
            )}
            <div><label className={etiqueta}>Precio</label><input inputMode="numeric" value={precio} onChange={(e) => setPrecio(e.target.value)} className={campo} /></div>
          </div>
          <div>
            <label className={etiqueta}>Fecha y hora del turno</label>
            <input type="datetime-local" value={fechaHora} onChange={(e) => setFechaHora(e.target.value)} className={campo} />
          </div>
        </div>
        <div className="flex gap-3 mt-5">
          <button onClick={agendar} disabled={guardando || !valido} className="flex-1 h-11 rounded-xl bg-slate-800 text-white font-semibold flex items-center justify-center gap-2 disabled:opacity-40">
            {guardando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Calendar className="w-4 h-4" />} Agendar turno
          </button>
          <button onClick={() => valido ? onFacturar(`${conceptoActual}: ${mascotaNombre.trim()}`, Number(precio), true, tipoCita === 'grooming' ? 'peluqueria' : 'consultas') : toast.error('Completa tutor, mascota y precio')}
            disabled={!valido} className="flex-1 h-11 rounded-xl bg-gradient-to-r from-purple-500 to-fuchsia-600 font-bold flex items-center justify-center gap-2 disabled:opacity-40" style={{ color: '#fff' }}>
            <ShoppingCart className="w-4 h-4" /> Facturar ahora
          </button>
        </div>
      </div>

      <div className={`${tarjeta} p-5`}>
        <div className="flex items-center justify-between gap-3 mb-4">
          <h3 className="text-white font-bold text-lg flex items-center gap-2"><Clock className="w-5 h-5 text-purple-500" /> {dia === hoyISO() ? 'Agenda de hoy' : 'Agenda'}</h3>
          <input type="date" value={dia} onChange={(e) => e.target.value && setDia(e.target.value)} className="h-9 px-2 rounded-lg bg-slate-950 border border-slate-800 text-white text-sm" />
        </div>
        {cargandoCitas ? (
          <Loader2 className="w-6 h-6 animate-spin mx-auto text-slate-500" />
        ) : citas.length === 0 ? (
          <p className="text-sm text-center py-8 text-slate-500">No hay turnos agendados para este día.</p>
        ) : (
          <div className="space-y-2 max-h-[560px] overflow-y-auto">
            {citas.map((c) => {
              const info = TIPO_CITA[c.tipo] || TIPO_CITA.otro;
              return (
                <div key={c.id} className="p-3 rounded-xl border border-slate-800 bg-slate-950/40">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-white font-bold text-sm flex items-center gap-1.5 min-w-0">
                      {c.especie === 'gato' ? <Cat className="w-3.5 h-3.5 shrink-0" /> : <Dog className="w-3.5 h-3.5 shrink-0" />}
                      <span className="truncate">{c.mascotaNombre} · {c.tutorNombre}</span>
                    </span>
                    <span className="text-xs font-mono text-slate-400 shrink-0">{new Date(c.fechaHora).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold" style={{ backgroundColor: `${info.color}22`, color: info.color }}>{info.label}</span>
                    <p className="text-xs text-slate-400">{c.servicio} · {money(c.precio)}</p>
                  </div>
                  {c.observaciones && <p className="text-xs text-slate-500 mt-1">{c.observaciones}</p>}
                  <div className="flex items-center gap-3 mt-2 flex-wrap">
                    <EstadoCitaBadge estado={c.estado} />
                    {c.estado === 'PENDIENTE' && <button onClick={() => cambiarEstado(c, 'EN_PROCESO')} className="text-xs font-semibold text-sky-500">Iniciar</button>}
                    {c.estado === 'EN_PROCESO' && <button onClick={() => cambiarEstado(c, 'COMPLETADA', true)} className="text-xs font-semibold text-emerald-500">Completar y facturar</button>}
                    {(c.estado === 'PENDIENTE' || c.estado === 'EN_PROCESO') && <button onClick={() => cambiarEstado(c, 'CANCELADA')} className="text-xs font-semibold text-red-500">Cancelar</button>}
                    {c.estado === 'PENDIENTE' && c.tutorTelefono && (
                      <button onClick={() => recordarCita(c)} className="text-xs font-semibold text-emerald-500 flex items-center gap-1"><MessageCircle className="w-3 h-3" /> Recordar</button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function EstadoCitaBadge({ estado }: { estado: EstadoCita }) {
  const map: Record<EstadoCita, { label: string; cls: string; Icon: typeof Clock }> = {
    PENDIENTE: { label: 'Pendiente', cls: 'bg-amber-500/15 text-amber-500', Icon: Clock },
    EN_PROCESO: { label: 'En proceso', cls: 'bg-sky-500/15 text-sky-500', Icon: Loader2 },
    COMPLETADA: { label: 'Completada', cls: 'bg-emerald-500/15 text-emerald-500', Icon: CheckCircle2 },
    CANCELADA: { label: 'Cancelada', cls: 'bg-red-500/15 text-red-500', Icon: XCircle },
  };
  const { label, cls, Icon } = map[estado] || map.PENDIENTE;
  return <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${cls}`}><Icon className="w-3 h-3" />{label}</span>;
}

// ═══════════════════ FARMACIA Y SERVICIOS ═══════════════════

function TabFarmacia({ productos, serviciosConsulta, onVender, onFacturarConsulta }: {
  productos: ProductoVetWeb[];
  /** Consultas y procedimientos creados con el "+": un toque y se facturan. */
  serviciosConsulta: ProductoVetWeb[];
  onVender: (p: ProductoVetWeb, cantidad: number) => void;
  onFacturarConsulta: (nombre: string, precio: number) => void;
}) {
  const [busqueda, setBusqueda] = useState('');
  const [cantidades, setCantidades] = useState<Record<string, number>>({});
  const [nombreConsulta, setNombreConsulta] = useState('Consulta General');
  const [precioConsulta, setPrecioConsulta] = useState('45000');

  const visibles = useMemo(
    () => productos.filter((p) => coincideBusquedaVet(p, busqueda)),
    [productos, busqueda],
  );
  const cant = (id: string) => cantidades[id] ?? 1;
  const setCant = (p: ProductoVetWeb, v: number) => setCantidades((c) => ({ ...c, [p.id]: Math.max(1, Math.min(v, Math.max(1, p.stock))) }));
  const vencePronto = (fecha?: string | null) => !!fecha && (new Date(fecha).getTime() - Date.now()) / 86400000 <= 60;

  return (
    <div>
      <div className={`${tarjeta} p-5 mb-5`}>
        <h3 className="text-white font-bold mb-3 flex items-center gap-2"><Pill className="w-4 h-4 text-sky-500" /> Consulta, procedimiento u honorarios</h3>
        {serviciosConsulta.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-3">
            {serviciosConsulta.map((sv) => (
              <button key={sv.id} type="button" onClick={() => { setNombreConsulta(sv.nombre); setPrecioConsulta(String(sv.precio_venta)); }}
                className={`h-9 px-3 rounded-full text-xs font-semibold ${nombreConsulta === sv.nombre ? 'bg-sky-500/15 border border-sky-500 text-sky-400' : 'bg-slate-950 border border-slate-800 text-slate-300'}`}>
                {sv.nombre} · {money(sv.precio_venta)}
              </button>
            ))}
          </div>
        )}
        <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
          <div className="flex-1"><label className={etiqueta}>Concepto</label><input value={nombreConsulta} onChange={(e) => setNombreConsulta(e.target.value)} className={campo} /></div>
          <div className="sm:w-40"><label className={etiqueta}>Valor</label><input inputMode="numeric" value={precioConsulta} onChange={(e) => setPrecioConsulta(e.target.value)} className={campo} /></div>
          <button onClick={() => nombreConsulta.trim() && Number(precioConsulta) > 0 ? onFacturarConsulta(nombreConsulta.trim(), Number(precioConsulta)) : toast.error('Escribe el concepto y el valor')}
            className="h-10 px-4 rounded-lg bg-gradient-to-r from-sky-500 to-blue-600 font-bold text-sm flex items-center justify-center gap-2" style={{ color: '#fff' }}>
            <ShoppingCart className="w-4 h-4" /> Facturar
          </button>
        </div>
      </div>

      <div className="relative mb-4 max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
        <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar producto o medicamento..."
          className="w-full h-11 pl-9 pr-3 rounded-xl bg-slate-900/70 border border-slate-800 text-white text-sm outline-none focus:border-sky-500" />
      </div>

      {productos.length === 0 ? (
        <Vacio icono={Pill} texto="Todavía no hay productos aquí. Toca el botón «+ Nuevo» de arriba para crear uno (collar, juguete, champú, medicamento…)." />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {visibles.map((p) => (
            <div key={p.id} className={`${tarjeta} p-4 flex flex-wrap sm:flex-nowrap items-center gap-3`}>
              <div className="w-10 h-10 rounded-xl bg-sky-500/15 flex items-center justify-center shrink-0"><Pill className="w-5 h-5 text-sky-500" /></div>
              <div className="flex-1 min-w-0">
                <p className="text-white font-bold text-sm truncate">{p.nombre}</p>
                <p className="text-sky-500 font-black text-sm">{money(p.precio_venta)} <span className={`text-[10px] font-normal ${p.stock <= 3 ? 'text-red-400' : 'text-slate-500'}`}>· {p.stock} en stock</span></p>
                <div className="flex items-center gap-2 flex-wrap mt-0.5">
                  {p.lote && <span className="text-[10px] text-slate-500">Lote {p.lote}</span>}
                  {p.fecha_vencimiento && (
                    <span className={`text-[10px] flex items-center gap-0.5 ${vencePronto(p.fecha_vencimiento) ? 'text-red-500 font-bold' : 'text-slate-500'}`}>
                      {vencePronto(p.fecha_vencimiento) && <AlertTriangle className="w-2.5 h-2.5" />} Vence {p.fecha_vencimiento}
                    </span>
                  )}
                  {p.requiere_receta && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-500/15 text-red-500 font-bold">Requiere receta</span>}
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0 ml-auto">
                <button onClick={() => setCant(p, cant(p.id) - 1)} className="w-8 h-8 rounded-lg bg-slate-800 text-white flex items-center justify-center" aria-label="Menos"><Minus className="w-3.5 h-3.5" /></button>
                <span className="w-7 text-center text-sm font-bold text-white">{cant(p.id)}</span>
                <button onClick={() => setCant(p, cant(p.id) + 1)} className="w-8 h-8 rounded-lg bg-slate-800 text-white flex items-center justify-center" aria-label="Más"><Plus className="w-3.5 h-3.5" /></button>
              </div>
              <button onClick={() => p.stock > 0 ? onVender(p, cant(p.id)) : toast.error(`Sin stock de ${p.nombre}`)} disabled={p.stock <= 0}
                className="shrink-0 h-9 px-3 rounded-lg bg-sky-600 text-sm font-bold disabled:opacity-40" style={{ color: '#fff' }}>
                Agregar
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
