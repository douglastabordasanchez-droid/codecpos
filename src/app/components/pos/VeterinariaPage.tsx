/**
 * CODEC POS v2.0 — Veterinaria y Mascotas
 *
 * Tres pestañas: Granel con báscula, Estética/Grooming (agenda), y Farmacia
 * y Servicios Médicos. Cualquier venta (bulto pesado, baño, consulta,
 * medicamento) se manda al MISMO carrito del Punto de Venta —igual patrón
 * que PanaderiaOncesPage.tsx (`codecpos_carrito_transferido` + navigate a
 * /pos) — la liquidación final, descuentos y método de pago siguen viviendo
 * ahí, sin duplicar esa lógica aquí.
 *
 * La venta a granel NO reinventa el pesaje: reusa `producto.pesable` (ver
 * POSPageNew.tsx), el mismo mecanismo que ya interpreta `precio` como
 * precio/kg y descuenta stock proporcional al peso vendido. Aquí solo se
 * filtra la vista y se conecta la báscula (useSerialScale, Web Serial API)
 * para capturar el peso antes de mandarlo al carrito.
 */
import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import {
  PawPrint, Scale, Sparkles, Pill, Search, Plus, Minus, ShoppingCart,
  Calendar, Clock, CheckCircle2, XCircle, Loader2, AlertTriangle, Dog, Cat,
  Edit, Trash2, Check, Bird, Fish, Bone, Rabbit, Beef, Wheat, Milk, Feather, Turtle, Package2,
  Stethoscope, Syringe, Weight, Phone, User, Bell, Bug, Activity, FileText,
} from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip, ResponsiveContainer } from 'recharts';
import { usePOS } from '../../contexts/POSContext';
import { electronStore } from '../../lib/electronStore';
import { desactivarProductoEnNube } from '../../lib/syncService';
import { onVacunaProximaVencer } from '../../lib/integracionesService';
import { useSerialScale } from '../../hooks/usePeripherals';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import {
  listarCitasGrooming, crearCitaGrooming, actualizarEstadoCita,
  type CitaGrooming, type EstadoCita, type TipoCita,
} from '../../lib/supabase/citasGroomingService';
import {
  listarMascotas, crearMascota, actualizarMascota, listarPesoHistorico, registrarPeso,
  listarEventos, crearEvento, eliminarEvento, eventosProximos, marcarRecordatorioEnviado,
  type Mascota, type RegistroPeso, type EventoClinico, type EventoProximo,
  type EspecieMascota, type SexoMascota, type TipoEventoClinico,
} from '../../lib/supabase/mascotasService';

interface ProductoVet {
  id: string;
  codigo: string;
  nombre: string;
  precio: number;
  costo?: number;
  stock: number;
  categoria: string;
  categoriaId?: string;
  pesable?: boolean;
  tipoProducto?: 'fisico' | 'servicio' | 'granel';
  esBulto?: boolean;
  pesoBultoKg?: number;
  precioPorKilo?: number;
  rendimientoRaciones?: number;
  especie?: string;
  requiereReceta?: boolean;
  lote?: string;
  fechaVencimiento?: string;
}

const STORAGE_TRANSFER_CART = 'codecpos_carrito_transferido';

// ── Categorías de Alimentos a Granel: mismo patrón de colores/íconos que
// "Alimentos y Bebidas" (PanaderiaOncesPage.tsx), con biblioteca temática de
// mascotas. Cada categoría se refleja en `codecpos_categorias_global` para
// que ProductosPage (Inventario) también la muestre en sus chips de filtro.
const GLOBAL_CATS_KEY = 'codecpos_categorias_global';
const STORAGE_GRANEL_CATS = 'codecpos_veterinaria_granel_cats';
const GRANEL_CAT_ID_PREFIX = 'vetgranel-';

const ICON_LIBRARY_GRANEL = [
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
type IconKeyGranel = (typeof ICON_LIBRARY_GRANEL)[number]['key'];

const COLOR_PALETTE_GRANEL = [
  '#ef4444', '#f97316', '#f59e0b', '#eab308',
  '#84cc16', '#22c55e', '#10b981', '#14b8a6',
  '#06b6d4', '#0ea5e9', '#3b82f6', '#6366f1',
  '#8b5cf6', '#a855f7', '#d946ef', '#ec4899',
];

const renderIconGranel = (key: string | undefined, cls = 'w-5 h-5') => {
  const found = ICON_LIBRARY_GRANEL.find((i) => i.key === key);
  const Comp = found ? found.Component : Scale;
  return <Comp className={cls} />;
};

const isColorLight = (hex: string) => {
  if (!hex) return false;
  let normalized = hex.replace('#', '');
  if (normalized.length === 3) normalized = normalized.split('').map((c) => c + c).join('');
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.68;
};

interface CategoriaGranel { id: string; nombre: string; icono: IconKeyGranel; color: string; }

const CATEGORIAS_GRANEL_DEFAULT: CategoriaGranel[] = [
  { id: `${GRANEL_CAT_ID_PREFIX}perro`, nombre: 'Concentrado Perros', icono: 'perro', color: '#10b981' },
  { id: `${GRANEL_CAT_ID_PREFIX}gato`, nombre: 'Concentrado Gatos', icono: 'gato', color: '#0ea5e9' },
  { id: `${GRANEL_CAT_ID_PREFIX}otros`, nombre: 'Otros Animales', icono: 'general', color: '#8b5cf6' },
];

const SERVICIOS_ESTETICA = [
  { nombre: 'Baño Básico', precio: 25000 },
  { nombre: 'Baño Medicado', precio: 38000 },
  { nombre: 'Corte de Pelo', precio: 35000 },
  { nombre: 'Corte de Uñas', precio: 12000 },
  { nombre: 'Desparasitación Externa', precio: 20000 },
];

type Tab = 'granel' | 'mascotas' | 'estetica' | 'farmacia';

export default function VeterinariaPage() {
  const { darkMode, triggerRefresh } = usePOS();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('granel');
  const [productos, setProductos] = useState<ProductoVet[]>([]);
  const [cargando, setCargando] = useState(true);
  const [busqueda, setBusqueda] = useState('');

  useEffect(() => {
    electronStore.obtenerProductos().then((p: ProductoVet[]) => {
      setProductos(p || []);
      setCargando(false);
    });
  }, []);

  const productosGranel = useMemo(
    () => productos.filter((p) => (p.pesable || p.tipoProducto === 'granel') &&
      (busqueda.trim() === '' || p.nombre.toLowerCase().includes(busqueda.toLowerCase()))),
    [productos, busqueda]
  );
  const productosFarmacia = useMemo(
    () => productos.filter((p) =>
      (p.requiereReceta || p.categoria?.toLowerCase().includes('medicamento') || p.tipoProducto === 'fisico') &&
      !p.pesable && p.tipoProducto !== 'granel' &&
      (busqueda.trim() === '' || p.nombre.toLowerCase().includes(busqueda.toLowerCase()))),
    [productos, busqueda]
  );

  const enviarACarrito = (items: Array<{ producto: any; cantidad: number; peso?: number }>) => {
    try {
      localStorage.setItem(STORAGE_TRANSFER_CART, JSON.stringify(items));
      localStorage.removeItem('codecpos_referencia_mesa');
      navigate('/pos');
    } catch {
      toast.error('No se pudo enviar al carrito. Intenta de nuevo.');
    }
  };

  const cardCls = darkMode ? 'bg-slate-800/60 border-slate-700 hover:border-emerald-500/60' : 'bg-white border-gray-200 hover:border-emerald-400 hover:shadow-lg';
  const textCls = darkMode ? 'text-white' : 'text-gray-900';
  const mutedCls = darkMode ? 'text-slate-400' : 'text-gray-500';

  const TABS: { id: Tab; label: string; icon: typeof Scale; color: string }[] = [
    { id: 'granel', label: 'Alimentos a Granel', icon: Scale, color: 'emerald' },
    { id: 'mascotas', label: 'Ficha Clínica', icon: Stethoscope, color: 'rose' },
    { id: 'estetica', label: 'Agenda y Citas', icon: Calendar, color: 'purple' },
    { id: 'farmacia', label: 'Farmacia y Servicios', icon: Pill, color: 'sky' },
  ];

  return (
    <div className={`min-h-screen p-6 ${darkMode ? 'bg-slate-950' : 'bg-gray-50'}`}>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-500/20">
          <PawPrint className="w-7 h-7 text-white" />
        </div>
        <div>
          <h1 className={`text-2xl font-black ${textCls}`}>Veterinaria y Mascotas</h1>
          <p className={`text-sm ${mutedCls}`}>Alimentos a granel, ficha clínica, agenda y farmacia — todo conectado al mismo inventario y carrito</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 overflow-x-auto pb-1">
        {TABS.map((t) => {
          const activo = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-2xl font-bold text-sm transition-all ${
                activo
                  ? 'bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-lg shadow-emerald-500/20'
                  : darkMode ? 'bg-slate-800/60 text-slate-400 hover:bg-slate-800' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
              }`}
            >
              <t.icon className="w-4 h-4" /> {t.label}
            </button>
          );
        })}
      </div>

      {cargando ? (
        <div className="flex justify-center py-20"><Loader2 className={`w-8 h-8 animate-spin ${mutedCls}`} /></div>
      ) : (
        <AnimatePresence mode="wait">
          {tab === 'granel' && (
            <motion.div key="granel" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <TabGranel productos={productosGranel} busqueda={busqueda} setBusqueda={setBusqueda}
                darkMode={darkMode} cardCls={cardCls} textCls={textCls} mutedCls={mutedCls}
                onVender={(producto, peso) => enviarACarrito([{ producto, cantidad: 1, peso }])}
                onProductoGuardado={(p) => {
                  setProductos((prev) => {
                    const idx = prev.findIndex((x) => x.id === p.id);
                    if (idx >= 0) { const copia = [...prev]; copia[idx] = p; return copia; }
                    return [p, ...prev];
                  });
                  triggerRefresh?.();
                }}
                onProductoEliminado={(id) => {
                  setProductos((prev) => prev.filter((x) => x.id !== id));
                  triggerRefresh?.();
                }} />
            </motion.div>
          )}
          {tab === 'mascotas' && (
            <motion.div key="mascotas" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <TabMascotas darkMode={darkMode} cardCls={cardCls} textCls={textCls} mutedCls={mutedCls} />
            </motion.div>
          )}
          {tab === 'estetica' && (
            <motion.div key="estetica" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <TabEstetica darkMode={darkMode} cardCls={cardCls} textCls={textCls} mutedCls={mutedCls}
                onFacturar={(nombreItem, precio) => enviarACarrito([{
                  producto: { id: `srv-${Date.now()}`, nombre: nombreItem, precio, codigo: 'SERVICIO', categoria: 'Estética' },
                  cantidad: 1,
                }])} />
            </motion.div>
          )}
          {tab === 'farmacia' && (
            <motion.div key="farmacia" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <TabFarmacia productos={productosFarmacia} busqueda={busqueda} setBusqueda={setBusqueda}
                darkMode={darkMode} cardCls={cardCls} textCls={textCls} mutedCls={mutedCls}
                onVender={(producto, cantidad) => enviarACarrito([{ producto, cantidad }])}
                onFacturarConsulta={(nombre, precio) => enviarACarrito([{
                  producto: { id: `srv-${Date.now()}`, nombre, precio, codigo: 'SERVICIO', categoria: 'Servicios Médicos' },
                  cantidad: 1,
                }])} />
            </motion.div>
          )}
        </AnimatePresence>
      )}
    </div>
  );
}

// ═══════════════════ TAB: GRANEL CON BÁSCULA ═══════════════════

const PRODUCTO_GRANEL_FORM_VACIO = {
  categoriaId: '', nombre: '', especie: 'perro' as 'perro' | 'gato' | 'aves' | 'generales',
  costo: '', pesoBultoKg: '', precioPorKilo: '', rendimientoRaciones: '', stockKg: '',
  fechaVencimiento: '', lote: '',
};

function TabGranel({ productos, busqueda, setBusqueda, darkMode, cardCls, textCls, mutedCls, onVender, onProductoGuardado, onProductoEliminado }: {
  productos: ProductoVet[]; busqueda: string; setBusqueda: (v: string) => void;
  darkMode: boolean; cardCls: string; textCls: string; mutedCls: string;
  onVender: (producto: ProductoVet, peso: number) => void;
  onProductoGuardado: (producto: ProductoVet) => void;
  onProductoEliminado: (id: string) => void;
}) {
  const [productoActivo, setProductoActivo] = useState<ProductoVet | null>(null);
  const bascula = useSerialScale();
  const [pesoManual, setPesoManual] = useState('');
  const [modoManual, setModoManual] = useState(false);

  // ── Categorías (color + ícono), mismo patrón que Alimentos y Bebidas ──
  const [categorias, setCategorias] = useState<CategoriaGranel[]>(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_GRANEL_CATS) || 'null') || CATEGORIAS_GRANEL_DEFAULT; }
    catch { return CATEGORIAS_GRANEL_DEFAULT; }
  });
  const [catFiltro, setCatFiltro] = useState<string>('');
  const [showCategoriaForm, setShowCategoriaForm] = useState(false);
  const [categoriaEditando, setCategoriaEditando] = useState<CategoriaGranel | null>(null);
  const [nuevaCat, setNuevaCat] = useState<{ nombre: string; icono: IconKeyGranel; color: string }>({ nombre: '', icono: 'general', color: COLOR_PALETTE_GRANEL[6] });

  const [showProductoForm, setShowProductoForm] = useState(false);
  const [productoEditando, setProductoEditando] = useState<ProductoVet | null>(null);
  const [guardandoProducto, setGuardandoProducto] = useState(false);
  const [form, setForm] = useState(PRODUCTO_GRANEL_FORM_VACIO);

  const pesoKg = modoManual ? (parseFloat(pesoManual.replace(',', '.')) || 0) : bascula.peso / 1000;

  const confirmar = () => {
    if (!productoActivo || pesoKg <= 0) return;
    onVender(productoActivo, pesoKg);
    setProductoActivo(null);
    setPesoManual('');
    setModoManual(false);
  };

  const categoriaDe = (p: ProductoVet) => categorias.find((c) => c.id === p.categoriaId);

  const productosFiltrados = catFiltro ? productos.filter((p) => p.categoriaId === catFiltro) : productos;

  // Guarda categorías locales y las refleja en el índice global (sin pisar
  // las categorías de otros módulos, ej. Alimentos y Bebidas) para que
  // Inventario (ProductosPage) también las muestre con su color.
  const guardarCategorias = (nuevas: CategoriaGranel[]) => {
    setCategorias(nuevas);
    localStorage.setItem(STORAGE_GRANEL_CATS, JSON.stringify(nuevas));
    try {
      const globalRaw = localStorage.getItem(GLOBAL_CATS_KEY);
      const globales: { id: string; nombre: string; color: string }[] = globalRaw ? JSON.parse(globalRaw) : [];
      const deOtrosModulos = globales.filter((g) => !g.id.startsWith(GRANEL_CAT_ID_PREFIX));
      const combinado = [...deOtrosModulos, ...nuevas.map((c) => ({ id: c.id, nombre: c.nombre, color: c.color }))];
      localStorage.setItem(GLOBAL_CATS_KEY, JSON.stringify(combinado));
    } catch { /* no crítico si falla el espejo global */ }
  };

  const guardarCategoriaForm = () => {
    if (!nuevaCat.nombre.trim()) { toast.error('Nombre de categoría obligatorio'); return; }
    if (categoriaEditando) {
      guardarCategorias(categorias.map((c) => (c.id === categoriaEditando.id ? { ...c, ...nuevaCat } : c)));
      toast.success('Categoría actualizada');
    } else {
      const id = `${GRANEL_CAT_ID_PREFIX}${Date.now()}`;
      guardarCategorias([...categorias, { id, ...nuevaCat }]);
      toast.success('Categoría creada');
    }
    setShowCategoriaForm(false); setCategoriaEditando(null); setNuevaCat({ nombre: '', icono: 'general', color: COLOR_PALETTE_GRANEL[6] });
  };

  const eliminarCategoria = (id: string) => {
    const cat = categorias.find((c) => c.id === id);
    if (!cat) return;
    if (productos.some((p) => p.categoriaId === id)) {
      toast.error('Esta categoría tiene bultos asociados. Reasígnalos o elimínalos primero.');
      return;
    }
    if (!window.confirm(`¿Eliminar la categoría "${cat.nombre}"?`)) return;
    guardarCategorias(categorias.filter((c) => c.id !== id));
    if (catFiltro === id) setCatFiltro('');
    toast.success('Categoría eliminada');
  };

  const abrirNuevoProducto = () => {
    setProductoEditando(null);
    setForm({ ...PRODUCTO_GRANEL_FORM_VACIO, categoriaId: catFiltro || categorias[0]?.id || '' });
    setShowProductoForm(true);
  };
  const abrirEdicionProducto = (p: ProductoVet) => {
    setProductoEditando(p);
    setForm({
      categoriaId: p.categoriaId || '', nombre: p.nombre, especie: (p.especie as any) || 'perro',
      costo: p.costo ? String(p.costo) : '', pesoBultoKg: p.pesoBultoKg ? String(p.pesoBultoKg) : '',
      precioPorKilo: String(p.precioPorKilo ?? p.precio ?? ''), rendimientoRaciones: p.rendimientoRaciones ? String(p.rendimientoRaciones) : '',
      stockKg: String(p.stock ?? ''), fechaVencimiento: p.fechaVencimiento || '', lote: p.lote || '',
    });
    setShowProductoForm(true);
  };

  const guardarProductoForm = async () => {
    if (!form.nombre.trim()) { toast.error('El nombre del bulto es obligatorio'); return; }
    const precioPorKilo = Number(form.precioPorKilo) || 0;
    if (precioPorKilo <= 0) { toast.error('Ingresa el precio por kilo'); return; }
    setGuardandoProducto(true);
    try {
      const cat = categorias.find((c) => c.id === form.categoriaId);
      const payload: any = {
        id: productoEditando?.id || `vetgr-${Date.now()}`,
        codigo: productoEditando?.codigo || `VETGR-${Date.now()}`,
        nombre: form.nombre.trim(),
        categoria: cat?.nombre || 'Alimentos a Granel',
        categoriaId: form.categoriaId || undefined,
        especie: form.especie,
        costo: Number(form.costo) || 0,
        precio: precioPorKilo,
        precioPorKilo,
        pesoBultoKg: form.pesoBultoKg ? Number(form.pesoBultoKg) : undefined,
        rendimientoRaciones: form.rendimientoRaciones ? Number(form.rendimientoRaciones) : undefined,
        stock: Math.max(0, Number(form.stockKg) || 0),
        fechaVencimiento: form.fechaVencimiento || undefined,
        lote: form.lote.trim() || undefined,
        tipoProducto: 'granel',
        pesable: true,
        esBulto: true,
        requiereReceta: false,
      };
      const guardado = await electronStore.upsertProducto(payload);
      onProductoGuardado(guardado as ProductoVet);
      toast.success(productoEditando ? 'Bulto actualizado' : 'Bulto agregado al inventario');
      setShowProductoForm(false); setProductoEditando(null); setForm(PRODUCTO_GRANEL_FORM_VACIO);
    } catch (e) {
      console.error('Error guardando bulto de granel:', e);
      toast.error('No se pudo guardar el bulto');
    } finally {
      setGuardandoProducto(false);
    }
  };

  const eliminarProducto = (p: ProductoVet) => {
    if (!window.confirm(`¿Eliminar "${p.nombre}" del inventario?`)) return;
    try {
      const lista = JSON.parse(localStorage.getItem('pos-productos') || '[]');
      localStorage.setItem('pos-productos', JSON.stringify(lista.filter((x: any) => x.id !== p.id)));
      desactivarProductoEnNube(p.id).catch(() => {});
      onProductoEliminado(p.id);
      toast.success('Bulto eliminado del inventario');
    } catch {
      toast.error('No se pudo eliminar el producto');
    }
  };

  const inputCls = `mt-1 ${darkMode ? 'bg-slate-800 border-slate-700 text-white' : ''}`;
  const labelCls = `text-xs font-bold ${mutedCls}`;

  return (
    <div>
      {/* Categorías: colores + íconos, igual que Alimentos y Bebidas */}
      <div className="flex gap-2 mb-4 overflow-x-auto [&::-webkit-scrollbar]:hidden pb-1">
        <button type="button" onClick={() => setCatFiltro('')}
          className={`shrink-0 px-3.5 py-2 rounded-xl text-xs font-bold border-2 transition-all ${
            catFiltro === '' ? (darkMode ? 'border-white/40 bg-white/10 text-white' : 'border-slate-800 bg-slate-800 text-white')
              : darkMode ? 'border-slate-700 text-slate-400' : 'border-gray-200 text-gray-600'
          }`}>
          Todas
        </button>
        {categorias.map((cat) => {
          const light = isColorLight(cat.color);
          const activa = catFiltro === cat.id;
          return (
            <button key={cat.id} type="button" onClick={() => setCatFiltro(cat.id)}
              className={`group relative shrink-0 flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all ${activa ? 'ring-2 ring-offset-1 ring-white/50 scale-[1.03]' : 'opacity-85 hover:opacity-100'}`}
              style={{ backgroundColor: cat.color }}>
              <span className={light ? 'text-slate-900' : 'text-white'}>{renderIconGranel(cat.icono, 'w-3.5 h-3.5')}</span>
              <span className={light ? 'text-slate-900' : 'text-white'}>{cat.nombre}</span>
              <span className="hidden group-hover:flex items-center gap-1 ml-0.5">
                <span role="button" onClick={(e) => { e.stopPropagation(); setCategoriaEditando(cat); setNuevaCat({ nombre: cat.nombre, icono: cat.icono, color: cat.color }); setShowCategoriaForm(true); }}
                  className="rounded-full bg-white/20 p-0.5"><Edit className="w-2.5 h-2.5 text-white" /></span>
                <span role="button" onClick={(e) => { e.stopPropagation(); eliminarCategoria(cat.id); }}
                  className="rounded-full bg-white/20 p-0.5"><Trash2 className="w-2.5 h-2.5 text-white" /></span>
              </span>
            </button>
          );
        })}
        <button type="button" onClick={() => { setCategoriaEditando(null); setNuevaCat({ nombre: '', icono: 'general', color: COLOR_PALETTE_GRANEL[6] }); setShowCategoriaForm(true); }}
          className={`shrink-0 flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold border border-dashed ${darkMode ? 'border-slate-600 text-slate-400' : 'border-gray-300 text-gray-600'}`}>
          <Plus className="w-3.5 h-3.5" /> Categoría
        </button>
      </div>

      {/* Formulario de categoría */}
      <AnimatePresence>
        {showCategoriaForm && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
            className={`overflow-hidden rounded-2xl border p-4 mb-4 space-y-3 ${darkMode ? 'border-slate-700 bg-slate-800/50' : 'border-slate-200 bg-slate-50'}`}>
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: nuevaCat.color }}>
                <span className={isColorLight(nuevaCat.color) ? 'text-slate-900' : 'text-white'}>{renderIconGranel(nuevaCat.icono)}</span>
              </div>
              <Input className="h-11 flex-1" placeholder="Nombre de la categoría (ej. Concentrado Aves)" value={nuevaCat.nombre}
                onChange={(e) => setNuevaCat((s) => ({ ...s, nombre: e.target.value }))} />
              <Button className="h-11 px-5 bg-emerald-600 hover:bg-emerald-700 shrink-0" onClick={guardarCategoriaForm}>
                <Check className="w-4 h-4 mr-1" />{categoriaEditando ? 'Guardar' : 'Crear'}
              </Button>
              <Button variant="outline" className="h-11 shrink-0" onClick={() => { setShowCategoriaForm(false); setCategoriaEditando(null); }}>Cancelar</Button>
            </div>
            <div className="flex gap-2 overflow-x-auto [&::-webkit-scrollbar]:hidden pb-1">
              {ICON_LIBRARY_GRANEL.map(({ key, label, Component }) => (
                <button key={key} type="button" title={label} onClick={() => setNuevaCat((s) => ({ ...s, icono: key }))}
                  className={`relative shrink-0 w-10 h-10 rounded-xl flex items-center justify-center transition-all hover:scale-110 border-2 ${
                    nuevaCat.icono === key ? 'border-emerald-500 bg-emerald-50 text-emerald-600' : darkMode ? 'border-slate-700 bg-slate-800 text-slate-400' : 'border-slate-200 bg-white text-slate-500'
                  }`}>
                  {nuevaCat.icono === key && <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-emerald-500 rounded-full flex items-center justify-center"><Check className="w-2 h-2 text-white" /></span>}
                  <Component className="w-4 h-4" />
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-2 items-center">
              {COLOR_PALETTE_GRANEL.map((color) => (
                <button key={color} type="button" onClick={() => setNuevaCat((s) => ({ ...s, color }))}
                  className={`relative w-8 h-8 rounded-full transition-all hover:scale-110 flex items-center justify-center ${nuevaCat.color === color ? 'ring-2 ring-offset-2 ring-slate-400' : ''}`}
                  style={{ backgroundColor: color }}>
                  {nuevaCat.color === color && <Check className={`w-3.5 h-3.5 ${isColorLight(color) ? 'text-slate-900' : 'text-white'}`} />}
                </button>
              ))}
              <label className="cursor-pointer">
                <input type="color" className="sr-only" value={nuevaCat.color} onChange={(e) => setNuevaCat((s) => ({ ...s, color: e.target.value }))} />
                <span className={`w-8 h-8 rounded-full border-2 border-dashed flex items-center justify-center hover:scale-110 transition ${darkMode ? 'border-slate-600 bg-slate-800 text-slate-400' : 'border-slate-300 bg-white text-slate-400'}`}><Plus className="w-3.5 h-3.5" /></span>
              </label>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="relative mb-4 max-w-md">
        <Search className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 ${mutedCls}`} />
        <Input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar alimento a granel..."
          className={`pl-9 ${darkMode ? 'bg-slate-800 border-slate-700 text-white' : ''}`} />
      </div>

      {productosFiltrados.length === 0 && productos.length === 0 ? (
        <EmptyHint darkMode={darkMode} icon={Scale}
          texto='No hay bultos a granel todavía. Créalos con el botón "+ Agregar bulto", o impórtalos con la plantilla de Veterinaria (columna TipoProducto = Granel-Alimento).' />
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {productosFiltrados.map((p) => {
            const cat = categoriaDe(p);
            const color = cat?.color || '#10b981';
            const light = isColorLight(color);
            return (
              <button key={p.id} onClick={() => setProductoActivo(p)}
                className={`group relative p-4 rounded-2xl border-2 text-left transition-all ${cardCls}`}>
                <div className="absolute right-2 top-2 hidden group-hover:flex items-center gap-1 z-10">
                  <span role="button" onClick={(e) => { e.stopPropagation(); abrirEdicionProducto(p); }}
                    className={`rounded-full p-1 ${darkMode ? 'bg-slate-700 text-slate-200' : 'bg-gray-100 text-gray-700'}`}><Edit className="w-3 h-3" /></span>
                  <span role="button" onClick={(e) => { e.stopPropagation(); eliminarProducto(p); }}
                    className={`rounded-full p-1 ${darkMode ? 'bg-slate-700 text-red-400' : 'bg-gray-100 text-red-500'}`}><Trash2 className="w-3 h-3" /></span>
                </div>
                <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-3" style={{ backgroundColor: color }}>
                  <span className={light ? 'text-slate-900' : 'text-white'}>{renderIconGranel(cat?.icono, 'w-5 h-5')}</span>
                </div>
                <p className={`font-bold text-sm mb-1 ${textCls}`}>{p.nombre}</p>
                <p className="font-black" style={{ color }}>${p.precio.toLocaleString('es-CO')}/kg</p>
                <p className={`text-xs mt-1 ${mutedCls}`}>Stock: {p.stock.toFixed(1)} kg{p.pesoBultoKg ? ` · bultos de ${p.pesoBultoKg}kg` : ''}</p>
                {p.fechaVencimiento && <p className={`text-[10px] mt-0.5 ${mutedCls}`}>Vence {p.fechaVencimiento}</p>}
              </button>
            );
          })}
          <button type="button" onClick={abrirNuevoProducto}
            className={`rounded-2xl border-2 border-dashed p-4 flex flex-col items-center justify-center gap-2 transition-all ${darkMode ? 'border-slate-700 text-slate-400 hover:border-slate-500' : 'border-gray-300 text-gray-500 hover:border-gray-400'}`}>
            <Plus className="w-6 h-6" />
            <span className="text-sm font-bold">Agregar bulto</span>
          </button>
        </div>
      )}

      {/* Formulario de bulto — crea o edita, y escribe directo en el inventario */}
      <AnimatePresence>
        {showProductoForm && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
              className={`max-w-lg w-full rounded-3xl p-6 max-h-[90vh] overflow-y-auto ${darkMode ? 'bg-slate-900 border-2 border-slate-700' : 'bg-white'}`}>
              <h3 className={`text-lg font-bold mb-4 flex items-center gap-2 ${textCls}`}>
                <Scale className="w-5 h-5 text-emerald-500" /> {productoEditando ? 'Editar bulto' : 'Nuevo bulto a granel'}
              </h3>

              <div className="mb-3">
                <label className={labelCls}>Categoría</label>
                <select value={form.categoriaId} onChange={(e) => setForm((s) => ({ ...s, categoriaId: e.target.value }))}
                  className={`mt-1 w-full h-10 rounded-lg px-3 text-sm border ${darkMode ? 'bg-slate-800 border-slate-700 text-white' : 'border-gray-300'}`}>
                  <option value="">Sin categoría</option>
                  {categorias.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </select>
              </div>

              <div className="mb-3">
                <label className={labelCls}>Nombre del producto</label>
                <Input value={form.nombre} onChange={(e) => setForm((s) => ({ ...s, nombre: e.target.value }))}
                  placeholder="Ej. Concentrado Ringo Adulto" className={inputCls} />
              </div>

              <div className="grid grid-cols-2 gap-3 mb-3">
                <div>
                  <label className={labelCls}>Especie</label>
                  <select value={form.especie} onChange={(e) => setForm((s) => ({ ...s, especie: e.target.value as any }))}
                    className={`mt-1 w-full h-10 rounded-lg px-3 text-sm border ${darkMode ? 'bg-slate-800 border-slate-700 text-white' : 'border-gray-300'}`}>
                    <option value="perro">Perro</option>
                    <option value="gato">Gato</option>
                    <option value="aves">Aves</option>
                    <option value="generales">Generales</option>
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Peso del bulto (kg)</label>
                  <Input value={form.pesoBultoKg} onChange={(e) => setForm((s) => ({ ...s, pesoBultoKg: e.target.value }))} placeholder="25" className={inputCls} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 mb-3">
                <div>
                  <label className={labelCls}>Costo del bulto</label>
                  <Input value={form.costo} onChange={(e) => setForm((s) => ({ ...s, costo: e.target.value }))} placeholder="95000" className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Precio por kilo *</label>
                  <Input value={form.precioPorKilo} onChange={(e) => setForm((s) => ({ ...s, precioPorKilo: e.target.value }))} placeholder="6800" className={inputCls} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 mb-3">
                <div>
                  <label className={labelCls}>Stock disponible (kg)</label>
                  <Input value={form.stockKg} onChange={(e) => setForm((s) => ({ ...s, stockKg: e.target.value }))} placeholder="Ej. 50" className={inputCls} />
                  {Number(form.pesoBultoKg) > 0 && Number(form.stockKg) > 0 && (
                    <p className={`text-[11px] mt-1 ${mutedCls}`}>≈ {(Number(form.stockKg) / Number(form.pesoBultoKg)).toFixed(1)} bultos de {form.pesoBultoKg}kg</p>
                  )}
                </div>
                <div>
                  <label className={labelCls}>Rendimiento (raciones)</label>
                  <Input value={form.rendimientoRaciones} onChange={(e) => setForm((s) => ({ ...s, rendimientoRaciones: e.target.value }))} placeholder="80" className={inputCls} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 mb-5">
                <div>
                  <label className={labelCls}>Fecha de vencimiento</label>
                  <Input type="date" value={form.fechaVencimiento} onChange={(e) => setForm((s) => ({ ...s, fechaVencimiento: e.target.value }))} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Lote</label>
                  <Input value={form.lote} onChange={(e) => setForm((s) => ({ ...s, lote: e.target.value }))} placeholder="Opcional" className={inputCls} />
                </div>
              </div>

              <div className="flex gap-3">
                <Button variant="outline" className="flex-1 h-11" onClick={() => { setShowProductoForm(false); setProductoEditando(null); }}>Cancelar</Button>
                <Button onClick={guardarProductoForm} disabled={guardandoProducto}
                  className="flex-1 h-11 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700">
                  {guardandoProducto ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Check className="w-4 h-4 mr-2" />}
                  {productoEditando ? 'Guardar cambios' : 'Agregar al inventario'}
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {productoActivo && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }}
              className={`max-w-md w-full rounded-3xl p-8 ${darkMode ? 'bg-slate-900 border-2 border-slate-700' : 'bg-white'}`}>
              <div className="text-center mb-6">
                <Scale className="w-16 h-16 text-emerald-500 mx-auto mb-3" />
                <h3 className={`text-xl font-bold mb-1 ${textCls}`}>{productoActivo.nombre}</h3>
                <p className={mutedCls}>${productoActivo.precio.toLocaleString('es-CO')} /kg</p>
              </div>

              {!bascula.conectado && !modoManual && (
                <Button onClick={bascula.conectarBascula} className="w-full mb-3 bg-emerald-600 hover:bg-emerald-700">
                  Conectar báscula (puerto serial)
                </Button>
              )}

              {!modoManual ? (
                <div className={`p-6 rounded-2xl mb-4 text-center ${darkMode ? 'bg-slate-800 border-2 border-slate-700' : 'bg-gray-50'}`}>
                  <p className={`text-sm mb-2 ${mutedCls}`}>Peso detectado:</p>
                  <div className="text-5xl font-black text-emerald-500 mb-1">{pesoKg.toFixed(3)}</div>
                  <p className={mutedCls}>kilogramos</p>
                  {bascula.conectado && (
                    <button onClick={bascula.tarar} className="text-xs text-emerald-500 underline mt-2">Tarar</button>
                  )}
                </div>
              ) : (
                <div className="mb-4">
                  <label className={`text-xs font-bold ${mutedCls}`}>Peso manual (kg)</label>
                  <Input value={pesoManual} onChange={(e) => setPesoManual(e.target.value)} placeholder="Ej. 1.500"
                    className={`mt-1 text-center text-2xl h-14 font-black ${darkMode ? 'bg-slate-800 border-slate-700 text-white' : ''}`} />
                </div>
              )}

              <button onClick={() => setModoManual((v) => !v)} className={`text-xs underline mb-4 block mx-auto ${mutedCls}`}>
                {modoManual ? 'Usar báscula' : 'La báscula no está disponible — ingresar peso manualmente'}
              </button>

              <div className="flex gap-3">
                <Button onClick={() => { setProductoActivo(null); setModoManual(false); setPesoManual(''); }} variant="outline" className="flex-1 h-12">
                  Cancelar
                </Button>
                <Button onClick={confirmar} disabled={pesoKg <= 0}
                  className="flex-1 h-12 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700">
                  <ShoppingCart className="w-4 h-4 mr-2" /> Agregar al carrito
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ═══════════════════ TAB: FICHA CLÍNICA DE MASCOTAS ═══════════════════

const MASCOTA_FORM_VACIO = {
  propietarioNombre: '', propietarioTelefono: '', nombre: '', especie: 'perro' as EspecieMascota,
  raza: '', sexo: 'desconocido' as SexoMascota, fechaNacimiento: '', color: '', pesoActual: '', alergias: '', notas: '',
};

const EVENTO_FORM_VACIO = {
  tipo: 'vacuna' as TipoEventoClinico, descripcion: '', fecha: new Date().toISOString().slice(0, 10),
  proximaFecha: '', veterinario: '', notas: '',
};

const TIPO_EVENTO_INFO: Record<TipoEventoClinico, { label: string; color: string; Icon: typeof Syringe }> = {
  vacuna: { label: 'Vacuna', color: '#10b981', Icon: Syringe },
  desparasitacion: { label: 'Desparasitación', color: '#f59e0b', Icon: Bug },
  consulta: { label: 'Consulta', color: '#0ea5e9', Icon: Stethoscope },
  cirugia: { label: 'Cirugía', color: '#ef4444', Icon: Activity },
  otro: { label: 'Otro', color: '#64748b', Icon: FileText },
};

const edadDesde = (fechaNacimiento: string | null) => {
  if (!fechaNacimiento) return null;
  const nacimiento = new Date(fechaNacimiento);
  if (Number.isNaN(nacimiento.getTime())) return null;
  const meses = (Date.now() - nacimiento.getTime()) / (1000 * 60 * 60 * 24 * 30.44);
  if (meses < 12) return `${Math.max(0, Math.round(meses))} meses`;
  const anios = Math.floor(meses / 12);
  const mesesResto = Math.round(meses % 12);
  return mesesResto > 0 ? `${anios} años, ${mesesResto} meses` : `${anios} años`;
};

function TabMascotas({ darkMode, cardCls, textCls, mutedCls }: {
  darkMode: boolean; cardCls: string; textCls: string; mutedCls: string;
}) {
  const [mascotas, setMascotas] = useState<Mascota[]>([]);
  const [cargando, setCargando] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [mascotaSeleccionada, setMascotaSeleccionada] = useState<Mascota | null>(null);

  const [pesoHistorico, setPesoHistorico] = useState<RegistroPeso[]>([]);
  const [eventos, setEventos] = useState<EventoClinico[]>([]);
  const [nuevoPeso, setNuevoPeso] = useState('');
  const [registrandoPeso, setRegistrandoPeso] = useState(false);

  const [recordatorios, setRecordatorios] = useState<EventoProximo[]>([]);

  const [showMascotaForm, setShowMascotaForm] = useState(false);
  const [mascotaEditando, setMascotaEditando] = useState<Mascota | null>(null);
  const [formMascota, setFormMascota] = useState(MASCOTA_FORM_VACIO);
  const [guardandoMascota, setGuardandoMascota] = useState(false);

  const [showEventoForm, setShowEventoForm] = useState(false);
  const [formEvento, setFormEvento] = useState(EVENTO_FORM_VACIO);
  const [guardandoEvento, setGuardandoEvento] = useState(false);

  const cargarMascotas = async (termino = '') => {
    setCargando(true);
    try { setMascotas(await listarMascotas(termino)); }
    catch (e) { console.error('Error cargando mascotas:', e); toast.error('No se pudieron cargar las mascotas'); }
    finally { setCargando(false); }
  };

  useEffect(() => { cargarMascotas(); }, []);

  useEffect(() => {
    const t = setTimeout(() => cargarMascotas(busqueda), 300);
    return () => clearTimeout(t);
  }, [busqueda]);

  // Recordatorios de vacuna/desparasitación próximas — misma lógica de
  // "revisar al abrir la página, una vez por día" que usa AlertasPage.tsx
  // para stock bajo / productos por vencer.
  useEffect(() => {
    (async () => {
      try {
        const proximos = await eventosProximos(7);
        setRecordatorios(proximos);
        const yaKey = 'codecpos_vet_recordatorios_notificado_' + new Date().toDateString();
        if (proximos.length > 0 && !sessionStorage.getItem(yaKey)) {
          for (const ev of proximos.slice(0, 5)) {
            const dias = ev.proximaFecha ? Math.ceil((new Date(ev.proximaFecha).getTime() - Date.now()) / 86400000) : 0;
            onVacunaProximaVencer({
              mascota: ev.mascotaNombre, propietario: ev.propietarioNombre, descripcion: ev.descripcion,
              diasParaVencer: dias, proximaFecha: ev.proximaFecha || undefined,
            }).catch(() => {});
            marcarRecordatorioEnviado(ev.id).catch(() => {});
          }
          sessionStorage.setItem(yaKey, '1');
        }
      } catch { /* no bloquea la ficha si falla el chequeo de recordatorios */ }
    })();
  }, []);

  const cargarDetalle = async (m: Mascota) => {
    setMascotaSeleccionada(m);
    try {
      const [peso, evts] = await Promise.all([listarPesoHistorico(m.id), listarEventos(m.id)]);
      setPesoHistorico(peso);
      setEventos(evts);
    } catch (e) {
      console.error('Error cargando ficha clínica:', e);
      toast.error('No se pudo cargar la ficha de esta mascota');
    }
  };

  const abrirNuevaMascota = () => { setMascotaEditando(null); setFormMascota(MASCOTA_FORM_VACIO); setShowMascotaForm(true); };
  const abrirEdicionMascota = (m: Mascota) => {
    setMascotaEditando(m);
    setFormMascota({
      propietarioNombre: m.propietarioNombre, propietarioTelefono: m.propietarioTelefono || '',
      nombre: m.nombre, especie: m.especie || 'perro', raza: m.raza || '', sexo: m.sexo || 'desconocido',
      fechaNacimiento: m.fechaNacimiento || '', color: m.color || '', pesoActual: m.pesoActual != null ? String(m.pesoActual) : '',
      alergias: m.alergias || '', notas: m.notas || '',
    });
    setShowMascotaForm(true);
  };

  const guardarMascotaForm = async () => {
    if (!formMascota.propietarioNombre.trim() || !formMascota.nombre.trim()) {
      toast.error('El nombre del dueño y de la mascota son obligatorios'); return;
    }
    setGuardandoMascota(true);
    try {
      const datos = {
        propietarioNombre: formMascota.propietarioNombre.trim(), propietarioTelefono: formMascota.propietarioTelefono.trim() || undefined,
        nombre: formMascota.nombre.trim(), especie: formMascota.especie, raza: formMascota.raza.trim() || undefined,
        sexo: formMascota.sexo, fechaNacimiento: formMascota.fechaNacimiento || undefined, color: formMascota.color.trim() || undefined,
        pesoActual: formMascota.pesoActual ? Number(formMascota.pesoActual) : undefined,
        alergias: formMascota.alergias.trim() || undefined, notas: formMascota.notas.trim() || undefined,
      };
      if (mascotaEditando) {
        await actualizarMascota(mascotaEditando.id, datos);
        toast.success('Ficha actualizada');
      } else {
        const creada = await crearMascota(datos);
        toast.success('Mascota registrada');
        await cargarDetalle(creada);
      }
      setShowMascotaForm(false); setMascotaEditando(null); setFormMascota(MASCOTA_FORM_VACIO);
      await cargarMascotas(busqueda);
    } catch (e) {
      console.error('Error guardando mascota:', e);
      toast.error('No se pudo guardar la ficha');
    } finally {
      setGuardandoMascota(false);
    }
  };

  const handleRegistrarPeso = async () => {
    const peso = Number(nuevoPeso.replace(',', '.'));
    if (!mascotaSeleccionada || !peso || peso <= 0) return;
    setRegistrandoPeso(true);
    try {
      await registrarPeso(mascotaSeleccionada.id, peso);
      setNuevoPeso('');
      const actualizada = { ...mascotaSeleccionada, pesoActual: peso };
      setMascotaSeleccionada(actualizada);
      setMascotas((prev) => prev.map((m) => (m.id === actualizada.id ? actualizada : m)));
      setPesoHistorico(await listarPesoHistorico(mascotaSeleccionada.id));
      toast.success('Peso registrado');
    } catch (e) {
      toast.error('No se pudo registrar el peso');
    } finally {
      setRegistrandoPeso(false);
    }
  };

  const guardarEventoForm = async () => {
    if (!mascotaSeleccionada || !formEvento.descripcion.trim()) { toast.error('Describe el evento clínico'); return; }
    setGuardandoEvento(true);
    try {
      const creado = await crearEvento({
        mascotaId: mascotaSeleccionada.id, tipo: formEvento.tipo, descripcion: formEvento.descripcion.trim(),
        fecha: formEvento.fecha, proximaFecha: formEvento.proximaFecha || undefined,
        veterinario: formEvento.veterinario.trim() || undefined, notas: formEvento.notas.trim() || undefined,
      });
      setEventos((prev) => [creado, ...prev]);
      toast.success('Evento agregado a la ficha clínica');
      setShowEventoForm(false); setFormEvento(EVENTO_FORM_VACIO);
    } catch (e) {
      toast.error('No se pudo guardar el evento');
    } finally {
      setGuardandoEvento(false);
    }
  };

  const handleEliminarEvento = async (id: string) => {
    if (!window.confirm('¿Eliminar este evento del historial clínico?')) return;
    try { await eliminarEvento(id); setEventos((prev) => prev.filter((e) => e.id !== id)); toast.success('Evento eliminado'); }
    catch { toast.error('No se pudo eliminar el evento'); }
  };

  const inputCls = `mt-1 ${darkMode ? 'bg-slate-800 border-slate-700 text-white' : ''}`;
  const labelCls = `text-xs font-bold ${mutedCls}`;

  return (
    <div>
      {recordatorios.length > 0 && (
        <div className={`mb-4 p-4 rounded-2xl border-2 flex items-start gap-3 ${darkMode ? 'border-amber-500/30 bg-amber-500/10' : 'border-amber-300 bg-amber-50'}`}>
          <Bell className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="font-bold text-sm text-amber-600">
              {recordatorios.length} {recordatorios.length === 1 ? 'evento próximo' : 'eventos próximos'} de vacuna o desparasitación
            </p>
            <div className="flex flex-wrap gap-2 mt-2">
              {recordatorios.map((r) => (
                <span key={r.id} className="text-xs px-2.5 py-1 rounded-full bg-amber-500/15 text-amber-700 font-semibold">
                  {r.mascotaNombre} · {r.descripcion} · {r.proximaFecha}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6">
        {/* Lista de mascotas */}
        <div className={`p-4 rounded-2xl border-2 h-fit ${cardCls}`}>
          <div className="relative mb-3">
            <Search className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 ${mutedCls}`} />
            <Input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar mascota o dueño..."
              className={`pl-9 ${darkMode ? 'bg-slate-800 border-slate-700 text-white' : ''}`} />
          </div>
          <Button onClick={abrirNuevaMascota} className="w-full mb-3 bg-gradient-to-r from-rose-500 to-pink-600 hover:from-rose-600 hover:to-pink-700">
            <Plus className="w-4 h-4 mr-1" /> Nueva mascota
          </Button>
          {cargando ? (
            <div className="flex justify-center py-8"><Loader2 className={`w-6 h-6 animate-spin ${mutedCls}`} /></div>
          ) : mascotas.length === 0 ? (
            <p className={`text-xs text-center py-6 ${mutedCls}`}>Sin mascotas registradas todavía.</p>
          ) : (
            <div className="space-y-2 max-h-[560px] overflow-y-auto pr-1">
              {mascotas.map((m) => {
                const activa = mascotaSeleccionada?.id === m.id;
                return (
                  <button key={m.id} onClick={() => cargarDetalle(m)}
                    className={`w-full text-left p-3 rounded-xl border-2 transition-all ${
                      activa ? 'border-rose-500 bg-rose-500/10' : darkMode ? 'border-slate-700 hover:border-slate-600' : 'border-gray-200 hover:border-gray-300'
                    }`}>
                    <div className="flex items-center gap-2">
                      {m.especie === 'gato' ? <Cat className="w-4 h-4 text-rose-500" /> : <Dog className="w-4 h-4 text-rose-500" />}
                      <span className={`font-bold text-sm ${textCls}`}>{m.nombre}</span>
                    </div>
                    <p className={`text-xs mt-0.5 ${mutedCls}`}>{m.propietarioNombre}{m.raza ? ` · ${m.raza}` : ''}</p>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Ficha clínica */}
        <div>
          {!mascotaSeleccionada ? (
            <EmptyHint darkMode={darkMode} icon={Stethoscope}
              texto="Selecciona una mascota de la lista o crea una nueva para ver su ficha clínica: peso, vacunas y consultas." />
          ) : (
            <div className="space-y-5">
              <div className={`p-5 rounded-2xl border-2 ${cardCls}`}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className={`text-xl font-black ${textCls}`}>{mascotaSeleccionada.nombre}</h3>
                    <p className={`text-sm mt-0.5 ${mutedCls}`}>
                      {[mascotaSeleccionada.especie, mascotaSeleccionada.raza, mascotaSeleccionada.sexo !== 'desconocido' ? mascotaSeleccionada.sexo : null, edadDesde(mascotaSeleccionada.fechaNacimiento)]
                        .filter(Boolean).join(' · ') || 'Sin datos adicionales'}
                    </p>
                  </div>
                  <button onClick={() => abrirEdicionMascota(mascotaSeleccionada)}
                    className={`rounded-full p-2 ${darkMode ? 'bg-slate-700 text-slate-200' : 'bg-gray-100 text-gray-700'}`}><Edit className="w-4 h-4" /></button>
                </div>
                <div className={`flex flex-wrap gap-x-5 gap-y-1.5 mt-3 text-sm ${mutedCls}`}>
                  <span className="flex items-center gap-1.5"><User className="w-3.5 h-3.5" /> {mascotaSeleccionada.propietarioNombre}</span>
                  {mascotaSeleccionada.propietarioTelefono && <span className="flex items-center gap-1.5"><Phone className="w-3.5 h-3.5" /> {mascotaSeleccionada.propietarioTelefono}</span>}
                  {mascotaSeleccionada.pesoActual != null && <span className="flex items-center gap-1.5"><Weight className="w-3.5 h-3.5" /> {mascotaSeleccionada.pesoActual} kg</span>}
                </div>
                {mascotaSeleccionada.alergias && (
                  <div className="mt-3 inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-red-500/10 text-red-500 font-semibold">
                    <AlertTriangle className="w-3 h-3" /> Alergias: {mascotaSeleccionada.alergias}
                  </div>
                )}
              </div>

              <div className={`p-5 rounded-2xl border-2 ${cardCls}`}>
                <h4 className={`font-bold flex items-center gap-2 mb-3 ${textCls}`}><Weight className="w-4 h-4 text-rose-500" /> Evolución de peso</h4>
                {pesoHistorico.length >= 2 ? (
                  <ResponsiveContainer width="100%" height={180}>
                    <LineChart data={pesoHistorico}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                      <XAxis dataKey="fecha" tick={{ fontSize: 10 }} stroke={darkMode ? '#64748b' : '#94a3b8'} />
                      <YAxis tick={{ fontSize: 10 }} stroke={darkMode ? '#64748b' : '#94a3b8'} domain={['auto', 'auto']} />
                      <RTooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                      <Line type="monotone" dataKey="peso" name="Peso (kg)" stroke="#f43f5e" strokeWidth={2} dot={{ r: 3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <p className={`text-xs mb-2 ${mutedCls}`}>Registra al menos 2 pesos para ver la gráfica de evolución.</p>
                )}
                <div className="flex gap-2 mt-3">
                  <Input value={nuevoPeso} onChange={(e) => setNuevoPeso(e.target.value)} placeholder="Nuevo peso en kg"
                    className={darkMode ? 'bg-slate-800 border-slate-700 text-white' : ''} />
                  <Button onClick={handleRegistrarPeso} disabled={registrandoPeso || !nuevoPeso} className="shrink-0 bg-rose-600 hover:bg-rose-700">
                    {registrandoPeso ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Registrar'}
                  </Button>
                </div>
              </div>

              <div className={`p-5 rounded-2xl border-2 ${cardCls}`}>
                <div className="flex items-center justify-between mb-3">
                  <h4 className={`font-bold flex items-center gap-2 ${textCls}`}><Stethoscope className="w-4 h-4 text-rose-500" /> Historial clínico</h4>
                  <Button size="sm" onClick={() => { setFormEvento(EVENTO_FORM_VACIO); setShowEventoForm(true); }} className="bg-rose-600 hover:bg-rose-700 h-8">
                    <Plus className="w-3.5 h-3.5 mr-1" /> Agregar
                  </Button>
                </div>
                {eventos.length === 0 ? (
                  <p className={`text-xs ${mutedCls}`}>Sin vacunas, desparasitaciones ni consultas registradas todavía.</p>
                ) : (
                  <div className="space-y-2">
                    {eventos.map((ev) => {
                      const info = TIPO_EVENTO_INFO[ev.tipo];
                      return (
                        <div key={ev.id} className={`p-3 rounded-xl border flex items-start gap-3 ${darkMode ? 'border-slate-700' : 'border-gray-200'}`}>
                          <span className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: `${info.color}22`, color: info.color }}>
                            <info.Icon className="w-4 h-4" />
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className={`font-bold text-sm ${textCls}`}>{ev.descripcion}</p>
                            <p className={`text-xs mt-0.5 ${mutedCls}`}>{info.label} · {ev.fecha}{ev.veterinario ? ` · ${ev.veterinario}` : ''}</p>
                            {ev.proximaFecha && <p className="text-xs font-bold mt-0.5" style={{ color: info.color }}>Próxima: {ev.proximaFecha}</p>}
                          </div>
                          <button onClick={() => handleEliminarEvento(ev.id)} className={`shrink-0 rounded-full p-1.5 ${darkMode ? 'bg-slate-700 text-red-400' : 'bg-gray-100 text-red-500'}`}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
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

      {/* Formulario mascota (crear/editar) */}
      <AnimatePresence>
        {showMascotaForm && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
              className={`max-w-lg w-full rounded-3xl p-6 max-h-[90vh] overflow-y-auto ${darkMode ? 'bg-slate-900 border-2 border-slate-700' : 'bg-white'}`}>
              <h3 className={`text-lg font-bold mb-4 flex items-center gap-2 ${textCls}`}>
                <Stethoscope className="w-5 h-5 text-rose-500" /> {mascotaEditando ? 'Editar mascota' : 'Nueva mascota'}
              </h3>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div><label className={labelCls}>Dueño *</label><Input value={formMascota.propietarioNombre} onChange={(e) => setFormMascota((s) => ({ ...s, propietarioNombre: e.target.value }))} className={inputCls} /></div>
                <div><label className={labelCls}>Teléfono</label><Input value={formMascota.propietarioTelefono} onChange={(e) => setFormMascota((s) => ({ ...s, propietarioTelefono: e.target.value }))} className={inputCls} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div><label className={labelCls}>Nombre de la mascota *</label><Input value={formMascota.nombre} onChange={(e) => setFormMascota((s) => ({ ...s, nombre: e.target.value }))} className={inputCls} /></div>
                <div>
                  <label className={labelCls}>Especie</label>
                  <select value={formMascota.especie} onChange={(e) => setFormMascota((s) => ({ ...s, especie: e.target.value as EspecieMascota }))}
                    className={`mt-1 w-full h-10 rounded-lg px-3 text-sm border ${darkMode ? 'bg-slate-800 border-slate-700 text-white' : 'border-gray-300'}`}>
                    <option value="perro">Perro</option><option value="gato">Gato</option><option value="aves">Aves</option><option value="generales">Otra</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div><label className={labelCls}>Raza</label><Input value={formMascota.raza} onChange={(e) => setFormMascota((s) => ({ ...s, raza: e.target.value }))} className={inputCls} /></div>
                <div>
                  <label className={labelCls}>Sexo</label>
                  <select value={formMascota.sexo} onChange={(e) => setFormMascota((s) => ({ ...s, sexo: e.target.value as SexoMascota }))}
                    className={`mt-1 w-full h-10 rounded-lg px-3 text-sm border ${darkMode ? 'bg-slate-800 border-slate-700 text-white' : 'border-gray-300'}`}>
                    <option value="desconocido">Desconocido</option><option value="macho">Macho</option><option value="hembra">Hembra</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div><label className={labelCls}>Fecha de nacimiento</label><Input type="date" value={formMascota.fechaNacimiento} onChange={(e) => setFormMascota((s) => ({ ...s, fechaNacimiento: e.target.value }))} className={inputCls} /></div>
                <div><label className={labelCls}>Color</label><Input value={formMascota.color} onChange={(e) => setFormMascota((s) => ({ ...s, color: e.target.value }))} className={inputCls} /></div>
              </div>
              <div className="mb-3"><label className={labelCls}>Peso actual (kg)</label><Input value={formMascota.pesoActual} onChange={(e) => setFormMascota((s) => ({ ...s, pesoActual: e.target.value }))} className={inputCls} /></div>
              <div className="mb-3"><label className={labelCls}>Alergias</label><Input value={formMascota.alergias} onChange={(e) => setFormMascota((s) => ({ ...s, alergias: e.target.value }))} placeholder="Opcional" className={inputCls} /></div>
              <div className="mb-5">
                <label className={labelCls}>Notas</label>
                <textarea value={formMascota.notas} onChange={(e) => setFormMascota((s) => ({ ...s, notas: e.target.value }))} rows={2}
                  className={`mt-1 w-full rounded-lg px-3 py-2 text-sm border resize-none ${darkMode ? 'bg-slate-800 border-slate-700 text-white' : 'border-gray-300'}`} />
              </div>
              <div className="flex gap-3">
                <Button variant="outline" className="flex-1 h-11" onClick={() => { setShowMascotaForm(false); setMascotaEditando(null); }}>Cancelar</Button>
                <Button onClick={guardarMascotaForm} disabled={guardandoMascota} className="flex-1 h-11 bg-gradient-to-r from-rose-500 to-pink-600 hover:from-rose-600 hover:to-pink-700">
                  {guardandoMascota ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Check className="w-4 h-4 mr-2" />}
                  {mascotaEditando ? 'Guardar cambios' : 'Registrar mascota'}
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Formulario evento clínico */}
      <AnimatePresence>
        {showEventoForm && mascotaSeleccionada && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
              className={`max-w-md w-full rounded-3xl p-6 ${darkMode ? 'bg-slate-900 border-2 border-slate-700' : 'bg-white'}`}>
              <h3 className={`text-lg font-bold mb-4 ${textCls}`}>Nuevo evento — {mascotaSeleccionada.nombre}</h3>
              <div className="mb-3">
                <label className={labelCls}>Tipo</label>
                <select value={formEvento.tipo} onChange={(e) => setFormEvento((s) => ({ ...s, tipo: e.target.value as TipoEventoClinico }))}
                  className={`mt-1 w-full h-10 rounded-lg px-3 text-sm border ${darkMode ? 'bg-slate-800 border-slate-700 text-white' : 'border-gray-300'}`}>
                  {Object.entries(TIPO_EVENTO_INFO).map(([key, info]) => <option key={key} value={key}>{info.label}</option>)}
                </select>
              </div>
              <div className="mb-3"><label className={labelCls}>Descripción *</label><Input value={formEvento.descripcion} onChange={(e) => setFormEvento((s) => ({ ...s, descripcion: e.target.value }))} placeholder="Ej. Vacuna quíntuple canina" className={inputCls} /></div>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div><label className={labelCls}>Fecha</label><Input type="date" value={formEvento.fecha} onChange={(e) => setFormEvento((s) => ({ ...s, fecha: e.target.value }))} className={inputCls} /></div>
                <div><label className={labelCls}>Próxima fecha</label><Input type="date" value={formEvento.proximaFecha} onChange={(e) => setFormEvento((s) => ({ ...s, proximaFecha: e.target.value }))} className={inputCls} /></div>
              </div>
              <div className="mb-5"><label className={labelCls}>Veterinario</label><Input value={formEvento.veterinario} onChange={(e) => setFormEvento((s) => ({ ...s, veterinario: e.target.value }))} placeholder="Opcional" className={inputCls} /></div>
              <div className="flex gap-3">
                <Button variant="outline" className="flex-1 h-11" onClick={() => setShowEventoForm(false)}>Cancelar</Button>
                <Button onClick={guardarEventoForm} disabled={guardandoEvento} className="flex-1 h-11 bg-gradient-to-r from-rose-500 to-pink-600 hover:from-rose-600 hover:to-pink-700">
                  {guardandoEvento ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Check className="w-4 h-4 mr-2" />}
                  Guardar evento
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ═══════════════════ TAB: ESTÉTICA / GROOMING ═══════════════════

const TIPO_CITA_INFO: Record<TipoCita, { label: string; color: string }> = {
  grooming: { label: 'Grooming', color: '#a855f7' },
  consulta: { label: 'Consulta', color: '#0ea5e9' },
  vacunacion: { label: 'Vacunación', color: '#10b981' },
  desparasitacion: { label: 'Desparasitación', color: '#f59e0b' },
  cirugia: { label: 'Cirugía', color: '#ef4444' },
  otro: { label: 'Otro', color: '#64748b' },
};

function TabEstetica({ darkMode, cardCls, textCls, mutedCls, onFacturar }: {
  darkMode: boolean; cardCls: string; textCls: string; mutedCls: string;
  onFacturar: (nombreItem: string, precio: number) => void;
}) {
  const [tipoCita, setTipoCita] = useState<TipoCita>('grooming');
  const [mascotaIdVinculada, setMascotaIdVinculada] = useState('');
  const [mascotasDisponibles, setMascotasDisponibles] = useState<Mascota[]>([]);

  const [tutorNombre, setTutorNombre] = useState('');
  const [tutorTelefono, setTutorTelefono] = useState('');
  const [mascotaNombre, setMascotaNombre] = useState('');
  const [especie, setEspecie] = useState<'perro' | 'gato' | 'generales'>('perro');
  const [raza, setRaza] = useState('');
  const [tipoPelo, setTipoPelo] = useState('');
  const [observaciones, setObservaciones] = useState('');
  const [servicioSeleccionado, setServicioSeleccionado] = useState(SERVICIOS_ESTETICA[0]);
  const [conceptoLibre, setConceptoLibre] = useState('Consulta General');
  const [precioServicio, setPrecioServicio] = useState(String(SERVICIOS_ESTETICA[0].precio));
  const [guardandoCita, setGuardandoCita] = useState(false);

  const [citas, setCitas] = useState<CitaGrooming[]>([]);
  const [cargandoCitas, setCargandoCitas] = useState(true);
  const [fechaHoraCita, setFechaHoraCita] = useState(() => {
    const d = new Date(Date.now() + 60 * 60 * 1000);
    return `${d.toISOString().slice(0, 10)}T${String(d.getHours()).padStart(2, '0')}:00`;
  });

  const cargarCitas = () => {
    const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    const manana = new Date(hoy.getTime() + 24 * 60 * 60 * 1000);
    setCargandoCitas(true);
    listarCitasGrooming(hoy, manana).then(setCitas).catch(() => {}).finally(() => setCargandoCitas(false));
  };
  useEffect(cargarCitas, []);
  useEffect(() => { listarMascotas().then(setMascotasDisponibles).catch(() => {}); }, []);

  const vincularMascota = (id: string) => {
    setMascotaIdVinculada(id);
    const m = mascotasDisponibles.find((x) => x.id === id);
    if (m) {
      setTutorNombre(m.propietarioNombre); setTutorTelefono(m.propietarioTelefono || '');
      setMascotaNombre(m.nombre); if (m.especie === 'perro' || m.especie === 'gato') setEspecie(m.especie); else setEspecie('generales');
      setRaza(m.raza || '');
    }
  };

  const conceptoActual = tipoCita === 'grooming' ? servicioSeleccionado.nombre : conceptoLibre.trim();
  const formValido = tutorNombre.trim() && mascotaNombre.trim() && Number(precioServicio) > 0 && conceptoActual;

  const handleAgendar = async () => {
    if (!formValido) { toast.error('Completa tutor, mascota y precio'); return; }
    setGuardandoCita(true);
    try {
      await crearCitaGrooming({
        tipo: tipoCita, mascotaId: mascotaIdVinculada || undefined,
        tutorNombre: tutorNombre.trim(), tutorTelefono: tutorTelefono.trim() || undefined,
        mascotaNombre: mascotaNombre.trim(), especie, raza: raza.trim() || undefined,
        tipoPelo: tipoCita === 'grooming' ? (tipoPelo.trim() || undefined) : undefined,
        observaciones: observaciones.trim() || undefined,
        servicio: conceptoActual, precio: Number(precioServicio), fechaHora: new Date(fechaHoraCita).toISOString(),
      });
      toast.success('Turno agendado');
      cargarCitas();
    } catch (e: any) {
      toast.error(e.message || 'No se pudo agendar el turno');
    } finally {
      setGuardandoCita(false);
    }
  };

  const handleFacturarAhora = () => {
    if (!formValido) { toast.error('Completa tutor, mascota y precio'); return; }
    onFacturar(`${conceptoActual} — ${mascotaNombre.trim()}`, Number(precioServicio));
  };

  const inputCls = `mt-1 ${darkMode ? 'bg-slate-800 border-slate-700 text-white' : ''}`;
  const labelCls = `text-xs font-bold ${mutedCls}`;
  const selectCls = `mt-1 w-full h-10 rounded-lg px-3 text-sm border ${darkMode ? 'bg-slate-800 border-slate-700 text-white' : 'border-gray-300'}`;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Ficha de la cita */}
      <div className={`p-6 rounded-2xl border-2 ${cardCls}`}>
        <h3 className={`font-bold text-lg mb-4 flex items-center gap-2 ${textCls}`}>
          <Sparkles className="w-5 h-5 text-purple-500" /> Nueva cita
        </h3>

        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <label className={labelCls}>Tipo de cita</label>
            <select value={tipoCita} onChange={(e) => setTipoCita(e.target.value as TipoCita)} className={selectCls}>
              {Object.entries(TIPO_CITA_INFO).map(([key, info]) => <option key={key} value={key}>{info.label}</option>)}
            </select>
          </div>
          {mascotasDisponibles.length > 0 && (
            <div>
              <label className={labelCls}>Vincular mascota (opcional)</label>
              <select value={mascotaIdVinculada} onChange={(e) => vincularMascota(e.target.value)} className={selectCls}>
                <option value="">Nueva / sin ficha</option>
                {mascotasDisponibles.map((m) => <option key={m.id} value={m.id}>{m.nombre} — {m.propietarioNombre}</option>)}
              </select>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3 mb-3">
          <div><label className={labelCls}>Tutor</label><Input value={tutorNombre} onChange={(e) => setTutorNombre(e.target.value)} className={inputCls} /></div>
          <div><label className={labelCls}>Teléfono</label><Input value={tutorTelefono} onChange={(e) => setTutorTelefono(e.target.value)} className={inputCls} /></div>
        </div>
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div><label className={labelCls}>Mascota</label><Input value={mascotaNombre} onChange={(e) => setMascotaNombre(e.target.value)} className={inputCls} /></div>
          <div>
            <label className={labelCls}>Especie</label>
            <select value={especie} onChange={(e) => setEspecie(e.target.value as any)} className={selectCls}>
              <option value="perro">Perro</option>
              <option value="gato">Gato</option>
              <option value="generales">Otro</option>
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div><label className={labelCls}>Raza</label><Input value={raza} onChange={(e) => setRaza(e.target.value)} className={inputCls} /></div>
          {tipoCita === 'grooming' && (
            <div><label className={labelCls}>Tipo de pelo</label><Input value={tipoPelo} onChange={(e) => setTipoPelo(e.target.value)} className={inputCls} /></div>
          )}
        </div>
        <div className="mb-3">
          <label className={labelCls}>Observaciones</label>
          <textarea value={observaciones} onChange={(e) => setObservaciones(e.target.value)} rows={2}
            className={`mt-1 w-full rounded-lg px-3 py-2 text-sm border resize-none ${darkMode ? 'bg-slate-800 border-slate-700 text-white' : 'border-gray-300'}`} />
        </div>

        <div className="grid grid-cols-2 gap-3 mb-3">
          {tipoCita === 'grooming' ? (
            <div>
              <label className={labelCls}>Servicio</label>
              <select value={servicioSeleccionado.nombre}
                onChange={(e) => {
                  const s = SERVICIOS_ESTETICA.find((x) => x.nombre === e.target.value) || SERVICIOS_ESTETICA[0];
                  setServicioSeleccionado(s); setPrecioServicio(String(s.precio));
                }}
                className={selectCls}>
                {SERVICIOS_ESTETICA.map((s) => <option key={s.nombre} value={s.nombre}>{s.nombre}</option>)}
              </select>
            </div>
          ) : (
            <div><label className={labelCls}>Concepto</label><Input value={conceptoLibre} onChange={(e) => setConceptoLibre(e.target.value)} className={inputCls} /></div>
          )}
          <div><label className={labelCls}>Precio</label><Input value={precioServicio} onChange={(e) => setPrecioServicio(e.target.value)} className={inputCls} /></div>
        </div>
        <div className="mb-4">
          <label className={labelCls}>Fecha y hora del turno (para agendar)</label>
          <Input type="datetime-local" value={fechaHoraCita} onChange={(e) => setFechaHoraCita(e.target.value)} className={inputCls} />
        </div>

        <div className="flex gap-3">
          <Button onClick={handleAgendar} disabled={guardandoCita || !formValido} variant="outline" className="flex-1 h-11">
            <Calendar className="w-4 h-4 mr-2" /> Agendar turno
          </Button>
          <Button onClick={handleFacturarAhora} disabled={!formValido}
            className="flex-1 h-11 bg-gradient-to-r from-purple-500 to-fuchsia-600 hover:from-purple-600 hover:to-fuchsia-700">
            <ShoppingCart className="w-4 h-4 mr-2" /> Facturar ahora
          </Button>
        </div>
      </div>

      {/* Agenda del día */}
      <div className={`p-6 rounded-2xl border-2 ${cardCls}`}>
        <h3 className={`font-bold text-lg mb-4 flex items-center gap-2 ${textCls}`}>
          <Clock className="w-5 h-5 text-purple-500" /> Agenda de hoy
        </h3>
        {cargandoCitas ? (
          <Loader2 className={`w-6 h-6 animate-spin mx-auto ${mutedCls}`} />
        ) : citas.length === 0 ? (
          <p className={`text-sm text-center py-8 ${mutedCls}`}>No hay turnos agendados para hoy.</p>
        ) : (
          <div className="space-y-2 max-h-[520px] overflow-y-auto">
            {citas.map((c) => {
              const infoTipo = TIPO_CITA_INFO[c.tipo] || TIPO_CITA_INFO.otro;
              return (
                <div key={c.id} className={`p-3 rounded-xl border ${darkMode ? 'border-slate-700 bg-slate-800/40' : 'border-gray-200'}`}>
                  <div className="flex items-center justify-between mb-1">
                    <span className={`font-bold text-sm flex items-center gap-1.5 ${textCls}`}>
                      {c.especie === 'gato' ? <Cat className="w-3.5 h-3.5" /> : <Dog className="w-3.5 h-3.5" />}
                      {c.mascotaNombre} · {c.tutorNombre}
                    </span>
                    <span className={`text-xs font-mono ${mutedCls}`}>{new Date(c.fechaHora).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold" style={{ backgroundColor: `${infoTipo.color}22`, color: infoTipo.color }}>{infoTipo.label}</span>
                    <p className={`text-xs ${mutedCls}`}>{c.servicio} · ${c.precio.toLocaleString('es-CO')}</p>
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <EstadoBadge estado={c.estado} />
                    {c.estado === 'PENDIENTE' && (
                      <button onClick={() => actualizarEstadoCita(c.id, 'EN_PROCESO').then(cargarCitas)} className="text-[11px] text-sky-500 underline">Iniciar</button>
                    )}
                    {c.estado === 'EN_PROCESO' && (
                      <button onClick={() => { actualizarEstadoCita(c.id, 'COMPLETADA').then(cargarCitas); onFacturar(`${c.servicio} — ${c.mascotaNombre}`, c.precio); }} className="text-[11px] text-emerald-500 underline">Completar y facturar</button>
                    )}
                    {(c.estado === 'PENDIENTE' || c.estado === 'EN_PROCESO') && (
                      <button onClick={() => actualizarEstadoCita(c.id, 'CANCELADA').then(cargarCitas)} className="text-[11px] text-red-500 underline">Cancelar</button>
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

function EstadoBadge({ estado }: { estado: EstadoCita }) {
  const map: Record<EstadoCita, { label: string; cls: string; Icon: typeof Clock }> = {
    PENDIENTE: { label: 'Pendiente', cls: 'bg-amber-500/15 text-amber-500', Icon: Clock },
    EN_PROCESO: { label: 'En proceso', cls: 'bg-sky-500/15 text-sky-500', Icon: Loader2 },
    COMPLETADA: { label: 'Completada', cls: 'bg-emerald-500/15 text-emerald-500', Icon: CheckCircle2 },
    CANCELADA: { label: 'Cancelada', cls: 'bg-red-500/15 text-red-500', Icon: XCircle },
  };
  const { label, cls, Icon } = map[estado];
  return <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${cls}`}><Icon className="w-3 h-3" />{label}</span>;
}

// ═══════════════════ TAB: FARMACIA Y SERVICIOS MÉDICOS ═══════════════════

function TabFarmacia({ productos, busqueda, setBusqueda, darkMode, cardCls, textCls, mutedCls, onVender, onFacturarConsulta }: {
  productos: ProductoVet[]; busqueda: string; setBusqueda: (v: string) => void;
  darkMode: boolean; cardCls: string; textCls: string; mutedCls: string;
  onVender: (producto: ProductoVet, cantidad: number) => void;
  onFacturarConsulta: (nombre: string, precio: number) => void;
}) {
  const [cantidades, setCantidades] = useState<Record<string, number>>({});
  const [nombreConsulta, setNombreConsulta] = useState('Consulta General');
  const [precioConsulta, setPrecioConsulta] = useState('45000');

  const getCantidad = (id: string) => cantidades[id] ?? 1;
  const setCantidad = (id: string, v: number) => setCantidades((c) => ({ ...c, [id]: Math.max(1, v) }));

  const vencidoPronto = (fecha?: string) => {
    if (!fecha) return false;
    const dias = (new Date(fecha).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    return dias <= 60;
  };

  return (
    <div>
      {/* Honorarios / consulta ad-hoc */}
      <div className={`p-5 rounded-2xl border-2 mb-6 ${cardCls}`}>
        <h3 className={`font-bold mb-3 flex items-center gap-2 ${textCls}`}><Pill className="w-4 h-4 text-sky-500" /> Consulta / procedimiento / honorarios</h3>
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-[200px]">
            <label className={`text-xs font-bold ${mutedCls}`}>Concepto</label>
            <Input value={nombreConsulta} onChange={(e) => setNombreConsulta(e.target.value)} className={`mt-1 ${darkMode ? 'bg-slate-800 border-slate-700 text-white' : ''}`} />
          </div>
          <div className="w-40">
            <label className={`text-xs font-bold ${mutedCls}`}>Valor</label>
            <Input value={precioConsulta} onChange={(e) => setPrecioConsulta(e.target.value)} className={`mt-1 ${darkMode ? 'bg-slate-800 border-slate-700 text-white' : ''}`} />
          </div>
          <Button onClick={() => nombreConsulta.trim() && Number(precioConsulta) > 0 && onFacturarConsulta(nombreConsulta.trim(), Number(precioConsulta))}
            className="h-10 bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-600 hover:to-blue-700">
            <ShoppingCart className="w-4 h-4 mr-2" /> Facturar
          </Button>
        </div>
      </div>

      <div className="relative mb-4 max-w-md">
        <Search className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 ${mutedCls}`} />
        <Input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar medicamento..."
          className={`pl-9 ${darkMode ? 'bg-slate-800 border-slate-700 text-white' : ''}`} />
      </div>

      {productos.length === 0 ? (
        <EmptyHint darkMode={darkMode} icon={Pill} texto="No hay medicamentos registrados todavía. Impórtalos con la plantilla de Veterinaria o créalos en Inventario marcando Lote y Fecha de vencimiento." />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {productos.map((p) => (
            <div key={p.id} className={`p-4 rounded-2xl border-2 flex items-center gap-3 ${cardCls}`}>
              <div className="w-10 h-10 rounded-xl bg-sky-500/15 flex items-center justify-center shrink-0">
                <Pill className="w-5 h-5 text-sky-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className={`font-bold text-sm truncate ${textCls}`}>{p.nombre}</p>
                <p className="text-sky-500 font-black text-sm">${p.precio.toLocaleString('es-CO')}</p>
                <div className="flex items-center gap-2 flex-wrap mt-0.5">
                  {p.lote && <span className={`text-[10px] ${mutedCls}`}>Lote {p.lote}</span>}
                  {p.fechaVencimiento && (
                    <span className={`text-[10px] flex items-center gap-0.5 ${vencidoPronto(p.fechaVencimiento) ? 'text-red-500 font-bold' : mutedCls}`}>
                      {vencidoPronto(p.fechaVencimiento) && <AlertTriangle className="w-2.5 h-2.5" />} Vence {p.fechaVencimiento}
                    </span>
                  )}
                  {p.requiereReceta && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-500/15 text-red-500 font-bold">Requiere receta</span>}
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button onClick={() => setCantidad(p.id, getCantidad(p.id) - 1)} className={`w-7 h-7 rounded-lg flex items-center justify-center ${darkMode ? 'bg-slate-700' : 'bg-gray-100'}`}><Minus className="w-3.5 h-3.5" /></button>
                <span className={`w-6 text-center text-sm font-bold ${textCls}`}>{getCantidad(p.id)}</span>
                <button onClick={() => setCantidad(p.id, getCantidad(p.id) + 1)} className={`w-7 h-7 rounded-lg flex items-center justify-center ${darkMode ? 'bg-slate-700' : 'bg-gray-100'}`}><Plus className="w-3.5 h-3.5" /></button>
              </div>
              <Button size="sm" onClick={() => onVender(p, getCantidad(p.id))} className="shrink-0 bg-sky-600 hover:bg-sky-700 h-9">
                Agregar
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function EmptyHint({ darkMode, icon: Icon, texto }: { darkMode: boolean; icon: typeof Scale; texto: string }) {
  return (
    <div className={`p-8 rounded-2xl border-2 border-dashed text-center ${darkMode ? 'border-slate-700 text-slate-500' : 'border-gray-300 text-gray-500'}`}>
      <Icon className="w-10 h-10 mx-auto mb-3 opacity-50" />
      <p className="text-sm max-w-md mx-auto">{texto}</p>
    </div>
  );
}
