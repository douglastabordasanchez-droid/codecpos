import { useEffect, useMemo, useState, useCallback } from 'react';
import { useNavigate } from 'react-router';
import {
  Coffee, Package2, BookOpen, Trash2, Plus, Save, Upload, Download, Armchair, Edit,
  Croissant, Cake, Cookie, Wine, Beer, IceCream, Flame, Utensils, ShoppingBag, Star, Heart,
  Pizza, Leaf, Check, CupSoda, Ham, Candy, Cherry, Soup,
  GripVertical, ChevronDown, AlertTriangle, ShoppingCart, BarChart3, TrendingUp,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { usePOS } from '../../contexts/POSContext';
import { useAuth } from '../../contexts/AuthContext';
import { electronStore, IngredienteInventarioItem, RecetaItem, RecetaIngredienteItem, ComboOncesItem, InventarioProductoItem } from '../../lib/electronStore';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { toast } from 'sonner';

// ── Biblioteca de íconos Lucide para panadería ────────────────────────────────
const ICON_LIBRARY = [
  { key: 'pan',      label: 'Croissant',    Component: Croissant  },
  { key: 'cafe',     label: 'Café',         Component: Coffee     },
  { key: 'pizza',    label: 'Pizza',        Component: Pizza      },
  { key: 'galleta',  label: 'Galleta',      Component: Cookie     },
  { key: 'cerveza',  label: 'Cerveza',      Component: Beer       },
  { key: 'vino',     label: 'Vino',         Component: Wine       },
  { key: 'cubiertos',label: 'Menú',         Component: Utensils   },
  { key: 'bolsa',    label: 'Para llevar',  Component: ShoppingBag},
  { key: 'fuego',    label: 'Caliente',     Component: Flame      },
  { key: 'helado',   label: 'Helado',       Component: IceCream   },
  { key: 'hoja',     label: 'Saludable',    Component: Leaf       },
  { key: 'estrella', label: 'Favorito',     Component: Star       },
  { key: 'sopa',     label: 'Sopa',         Component: Soup       },
  { key: 'jamon',    label: 'Carnes',       Component: Ham        },
  { key: 'dulce',    label: 'Dulces',       Component: Candy      },
  { key: 'cereza',   label: 'Frutas',       Component: Cherry     },
  { key: 'gaseosa',  label: 'Gaseosa',      Component: CupSoda    },
  { key: 'postre',   label: 'Postres',      Component: Cake       },
  { key: 'desayuno', label: 'Desayuno',     Component: Heart      },
  { key: 'general',  label: 'General',      Component: Package2   },
] as const;

type IconKey = (typeof ICON_LIBRARY)[number]['key'];

const COLOR_PALETTE = [
  '#ef4444', '#f97316', '#f59e0b', '#eab308',
  '#84cc16', '#22c55e', '#10b981', '#14b8a6',
  '#06b6d4', '#0ea5e9', '#3b82f6', '#6366f1',
  '#8b5cf6', '#a855f7', '#d946ef', '#ec4899',
  '#2563eb', '#0f172a', '#475569', '#14b8a6',
];

const renderIcon = (key: string, cls = 'w-10 h-10') => {
  const found = ICON_LIBRARY.find(i => i.key === key);
  const Comp = found ? found.Component : Package2;
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

// ── Tipos ─────────────────────────────────────────────────────────────────────
type SectionId = 'dashboard' | 'pos_tactil' | 'mesas' | 'ingredientes' | 'recetas' | 'mermas' | 'combos';

const DEFAULT_ORDER: SectionId[] = ['dashboard', 'pos_tactil', 'mesas', 'ingredientes', 'recetas', 'mermas', 'combos'];

interface MesaConfig { id: string; nombre: string; activa: boolean; }
interface ProductoMesa { id: string; codigo: string; nombre: string; precio: number; stock: number; categoria: string; costo: number; pesable?: boolean; aplicaIVA?: boolean; tipoInventario?: 'directo' | 'receta'; recipeId?: string; }
interface ItemMesa { producto: ProductoMesa; cantidad: number; }
interface RecetaLinea { ingredientId: string; cantidad: string; unidad: string; }
interface ProductoPos { id: string; categoriaId: string; nombre: string; precio: number; costo: number; stock: number; icono: IconKey; color: string; codigo: string; tipoInventario?: 'directo' | 'receta'; recipeId?: string; ingredientesReceta?: RecetaLinea[]; }
interface ProductoFormState { categoriaId: string; nombre: string; precioVenta: string; precioCosto: string; stock: string; codigo: string; icono: IconKey; color: string; tipoInventario: 'directo' | 'receta'; }

// ── SectionShell ─────────────────────────────────────────────────────────────
interface SectionShellProps {
  id: SectionId;
  label: string;
  icon: React.ReactNode;
  gradient: string;
  isDragging: boolean;
  isDragOver: boolean;
  isCollapsed: boolean;
  onDragStart: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  onToggle: () => void;
  darkMode: boolean;
  children: React.ReactNode;
}

function SectionShell({ label, icon, gradient, isDragging, isDragOver, isCollapsed, onDragStart, onDragOver, onDrop, onDragEnd, onToggle, darkMode, children }: SectionShellProps) {
  return (
    <motion.div
      layout
      transition={{ layout: { duration: 0.25, ease: 'easeInOut' } }}
      className={`rounded-3xl overflow-hidden shadow-lg border transition-all duration-200 ${
        isDragOver ? 'ring-2 ring-violet-400 ring-offset-2 scale-[1.01]' : ''
      } ${isDragging ? 'opacity-40 scale-[0.98]' : ''} ${
        darkMode ? 'border-white/10' : 'border-slate-200'
      }`}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
    >
      {/* Header */}
      <div
        className={`flex items-center gap-3 px-5 py-3.5 bg-gradient-to-r ${gradient} select-none`}
        onClick={onToggle}
        style={{ cursor: 'pointer' }}
      >
        <button
          type="button"
          draggable
          onDragStart={(e) => { e.stopPropagation(); onDragStart(e); }}
          onClick={(e) => e.stopPropagation()}
          className="touch-none cursor-grab active:cursor-grabbing text-white/60 hover:text-white transition-colors p-1 rounded-lg hover:bg-white/10 flex-shrink-0"
          title="Mantén presionado para arrastrar"
        >
          <GripVertical className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-2.5 flex-1 min-w-0">
          <div className="text-white flex-shrink-0">{icon}</div>
          <h3 className="text-base font-black text-white tracking-tight truncate">{label}</h3>
        </div>
        <motion.div
          animate={{ rotate: isCollapsed ? -90 : 0 }}
          transition={{ duration: 0.2 }}
          className="text-white/80 flex-shrink-0"
        >
          <ChevronDown className="w-5 h-5" />
        </motion.div>
      </div>

      {/* Content */}
      <AnimatePresence initial={false}>
        {!isCollapsed && (
          <motion.div
            key="content"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: 'easeInOut' }}
            style={{ overflow: 'hidden' }}
          >
            <div className={`p-5 ${darkMode ? 'bg-slate-800/45' : 'bg-white'}`}>
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ── Componente principal ───────────────────────────────────────────────────────
export default function PanaderiaOncesPage() {
  const navigate = useNavigate();
  const { darkMode } = usePOS();
  const { usuarioActual } = useAuth();
  const STORAGE_MODULO_PANADERIA_ONCES = 'codecpos_panaderia_onces_activo';
  const MENSAJE_ACCESO_DENEGADO = 'Acceso Denegado: No tienes permisos de administrador para modificar o eliminar elementos del sistema.';
  const puedeAdministrarPanaderia =
    usuarioActual?.rol === 'super_usuario' || usuarioActual?.permisos?.panaderiaCategorias === true;
  const notificarAccesoDenegado = useCallback(() => {
    toast.error(MENSAJE_ACCESO_DENEGADO);
  }, [MENSAJE_ACCESO_DENEGADO]);

  // ── Estado de datos ──────────────────────────────────────────────────────────
  const [ingredientes, setIngredientes] = useState<IngredienteInventarioItem[]>([]);
  const [productos, setProductos] = useState<InventarioProductoItem[]>([]);
  const [recetas, setRecetas] = useState<RecetaItem[]>([]);
  const [recetaIngredientes, setRecetaIngredientes] = useState<RecetaIngredienteItem[]>([]);
  const [mermas, setMermas] = useState<any[]>([]);
  const [combos, setCombos] = useState<ComboOncesItem[]>([]);

  const [nuevoIngrediente, setNuevoIngrediente] = useState({ nombre: '', unidad: 'g', stockActual: '0', stockMinimo: '0', costoUnitario: '0' });
  const [nuevaMerma, setNuevaMerma] = useState({ ingredientId: '', cantidad: '', unidad: 'g', motivo: '' });

  const [productoRecetaId, setProductoRecetaId] = useState('');
  const [nombreReceta, setNombreReceta] = useState('');
  const [lineasReceta, setLineasReceta] = useState<RecetaLinea[]>([{ ingredientId: '', cantidad: '', unidad: 'g' }]);

  const [comboForm, setComboForm] = useState({ nombre: '', codigo: '', keyword: '', precio: '' });
  const [lineasCombo, setLineasCombo] = useState<Array<{ tipo: 'producto' | 'ingrediente'; refId: string; cantidad: string; unidad: string }>>([
    { tipo: 'producto', refId: '', cantidad: '1', unidad: 'und' },
  ]);
  const [comboEditando, setComboEditando] = useState<ComboOncesItem | null>(null);

  const [moduloPanaderiaOncesActivo, setModuloPanaderiaOncesActivo] = useState<boolean>(() => {
    try { const raw = localStorage.getItem(STORAGE_MODULO_PANADERIA_ONCES); return raw === null ? true : raw === 'true'; } catch { return true; }
  });

  const [mesas, setMesas] = useState<MesaConfig[]>([]);
  const [mesaSeleccionada, setMesaSeleccionada] = useState<MesaConfig | null>(null);
  const [cuentasMesas, setCuentasMesas] = useState<Record<string, ItemMesa[]>>({});
  const [cuentaLibre, setCuentaLibre] = useState<ItemMesa[]>(() => {
    try { const saved = localStorage.getItem('codecpos_panaderia_cuenta_libre'); const parsed = saved ? JSON.parse(saved) : []; return Array.isArray(parsed) ? parsed : []; } catch { return []; }
  });
  const [productoMesaId, setProductoMesaId] = useState('');
  const [cantidadMesa, setCantidadMesa] = useState('1');
  const [showAgregarMesaDropdown, setShowAgregarMesaDropdown] = useState(false);

  const STORAGE_MESAS = 'codecpos_mesas_config';
  const STORAGE_CUENTAS_MESAS = 'codecpos_mesas_cuentas';
  const STORAGE_TRANSFER_CART = 'codecpos_carrito_transferido';
  const STORAGE_CUENTA_LIBRE = 'codecpos_panaderia_cuenta_libre';
  const GLOBAL_CATS_KEY = 'codecpos_categorias_global';

  // ── POS Táctil ───────────────────────────────────────────────────────────────
  interface CategoriaPos { id: string; nombre: string; icono: IconKey; color: string; }

  const [categoriasPos, setCategoriasPos] = useState<CategoriaPos[]>(() => {
    return JSON.parse(localStorage.getItem('codecpos_panaderia_cats') || '[{"id":"cat-1","nombre":"Hojaldres","icono":"pan","color":"#2563eb"},{"id":"cat-2","nombre":"Gaseosas","icono":"gaseosa","color":"#0ea5e9"},{"id":"cat-3","nombre":"Desayunos","icono":"desayuno","color":"#1d4ed8"}]');
  });
  const [productosPos, setProductosPos] = useState<ProductoPos[]>(() => {
    return JSON.parse(localStorage.getItem('codecpos_panaderia_prods') || '[{"id":"pprod-1","categoriaId":"cat-1","nombre":"Croissant","precio":4500,"costo":2500,"stock":15,"codigo":"PAN-001","icono":"pan","color":"#2563eb"},{"id":"pprod-2","categoriaId":"cat-1","nombre":"Pan de queso","precio":3800,"costo":1800,"stock":12,"codigo":"PAN-002","icono":"pan","color":"#1e40af"},{"id":"pprod-3","categoriaId":"cat-2","nombre":"Coca-Cola","precio":5200,"costo":3000,"stock":20,"codigo":"PAN-003","icono":"gaseosa","color":"#0284c7"},{"id":"pprod-4","categoriaId":"cat-2","nombre":"Sprite","precio":5200,"costo":3000,"stock":18,"codigo":"PAN-004","icono":"gaseosa","color":"#14b8a6"},{"id":"pprod-5","categoriaId":"cat-3","nombre":"Caldo de costilla","precio":12000,"costo":6500,"stock":10,"codigo":"PAN-005","icono":"desayuno","color":"#1d4ed8"},{"id":"pprod-6","categoriaId":"cat-3","nombre":"Huevos pericos","precio":9800,"costo":5200,"stock":14,"codigo":"PAN-006","icono":"desayuno","color":"#0ea5e9"},{"id":"pprod-7","categoriaId":"cat-3","nombre":"Poza gusto","precio":10500,"costo":5600,"stock":8,"codigo":"PAN-007","icono":"general","color":"#9333ea"}]');
  });
  const [catSeleccionada, setCatSeleccionada] = useState<string>(categoriasPos[0]?.id || '');
  const [nuevaCat, setNuevaCat] = useState({ nombre: '', icono: 'pan' as IconKey, color: '#2563eb' });
  const [productoForm, setProductoForm] = useState<ProductoFormState>({ categoriaId: '', nombre: '', precioVenta: '', precioCosto: '', stock: '0', codigo: '', icono: 'pan', color: '#2563eb', tipoInventario: 'directo' });
  const [productoRecetaLineas, setProductoRecetaLineas] = useState<RecetaLinea[]>([{ ingredientId: '', cantidad: '', unidad: 'g' }]);
  const [showCategoriaForm, setShowCategoriaForm] = useState(false);
  const [showProductoForm, setShowProductoForm] = useState(false);
  const [categoriaEditando, setCategoriaEditando] = useState<CategoriaPos | null>(null);
  const [productoEditando, setProductoEditando] = useState<ProductoPos | null>(null);
  const [dragCategoriaIndex, setDragCategoriaIndex] = useState<number | null>(null);
  const [dragProductoIndex, setDragProductoIndex] = useState<number | null>(null);

  // ── Orden y estado de secciones ──────────────────────────────────────────────
  const [sectionOrder, setSectionOrder] = useState<SectionId[]>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('codecpos_panaderia_section_order') || 'null');
      if (Array.isArray(saved) && saved.length === DEFAULT_ORDER.length) return saved as SectionId[];
    } catch {}
    return DEFAULT_ORDER;
  });

  const [collapsed, setCollapsed] = useState<Partial<Record<SectionId, boolean>>>(() => {
    try { return JSON.parse(localStorage.getItem('codecpos_panaderia_collapsed') || '{}'); } catch { return {}; }
  });

  const [dragSectionId, setDragSectionId] = useState<SectionId | null>(null);
  const [dragOverSectionId, setDragOverSectionId] = useState<SectionId | null>(null);

  // ── Carga inicial ────────────────────────────────────────────────────────────
  const cargar = async () => {
    const [ings, prods, recs, recIngs, cmb] = await Promise.all([
      electronStore.obtenerIngredientesInventario(),
      electronStore.obtenerProductos(),
      electronStore.obtenerRecetas(),
      electronStore.obtenerRecetaIngredientes(),
      electronStore.obtenerCombosOnces(),
    ]);
    setIngredientes(ings || []);
    setProductos(prods || []);
    setRecetas(recs || []);
    setRecetaIngredientes(recIngs || []);
    setCombos(cmb || []);
    try { setMermas(JSON.parse(localStorage.getItem('codecpos_mermas') || '[]')); } catch { setMermas([]); }
  };

  useEffect(() => { cargar(); }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_MESAS);
      const parsed = raw ? JSON.parse(raw) : null;
      if (Array.isArray(parsed) && parsed.length > 0) { setMesas(parsed); } else {
        const base: MesaConfig[] = [{ id: 'mesa-1', nombre: 'Mesa 1', activa: true }, { id: 'mesa-2', nombre: 'Mesa 2', activa: true }, { id: 'mesa-3', nombre: 'Mesa 3', activa: true }];
        setMesas(base); localStorage.setItem(STORAGE_MESAS, JSON.stringify(base));
      }
    } catch {
      const base: MesaConfig[] = [{ id: 'mesa-1', nombre: 'Mesa 1', activa: true }, { id: 'mesa-2', nombre: 'Mesa 2', activa: true }, { id: 'mesa-3', nombre: 'Mesa 3', activa: true }];
      setMesas(base); localStorage.setItem(STORAGE_MESAS, JSON.stringify(base));
    }
  }, []);

  useEffect(() => {
    const leerCuentas = () => {
      try { const raw = localStorage.getItem(STORAGE_CUENTAS_MESAS); const parsed = raw ? JSON.parse(raw) : {}; setCuentasMesas(parsed && typeof parsed === 'object' ? parsed : {}); } catch { setCuentasMesas({}); }
    };
    leerCuentas();

    // ☁️ Comanda enviada desde el celular de un mesero: useSyncModulosNube ya
    // la guardó en localStorage y dispara este evento para que el salón se
    // repinte sin recargar la pantalla.
    window.addEventListener('codecpos:panaderia-cuentas-sincronizadas', leerCuentas);
    return () => window.removeEventListener('codecpos:panaderia-cuentas-sincronizadas', leerCuentas);
  }, []);

  useEffect(() => { try { if (!localStorage.getItem(GLOBAL_CATS_KEY)) { localStorage.setItem(GLOBAL_CATS_KEY, JSON.stringify(categoriasPos.map(c => ({ id: c.id, nombre: c.nombre, color: c.color })))); } } catch {} }, []);

  useEffect(() => { try { localStorage.setItem(STORAGE_CUENTA_LIBRE, JSON.stringify(cuentaLibre)); } catch {} }, [cuentaLibre]);

  // ── Handlers de mesas ────────────────────────────────────────────────────────
  const persistirMesas = (nuevas: MesaConfig[]) => { setMesas(nuevas); localStorage.setItem(STORAGE_MESAS, JSON.stringify(nuevas)); };
  const agregarMesa = () => { const nueva: MesaConfig = { id: `mesa-${Date.now()}`, nombre: `Mesa ${mesas.length + 1}`, activa: true }; persistirMesas([...mesas, nueva]); toast.success('Mesa agregada'); };
  const quitarMesa = (id: string) => { persistirMesas(mesas.filter(m => m.id !== id)); toast.success('Mesa eliminada'); };

  const abrirMesaEnPOS = (mesa?: MesaConfig | null) => {
    try {
      const cuentaTransferir = mesa ? (cuentasMesas[mesa.id] || []) : cuentaLibre;
      if (cuentaTransferir.length === 0) { toast.error('No hay productos en la cuenta para transferir a POS'); return; }
      localStorage.setItem(STORAGE_TRANSFER_CART, JSON.stringify(cuentaTransferir));
      localStorage.setItem('codecpos_mesa_activa', mesa ? mesa.id : 'general');
      localStorage.setItem('codecpos_panaderia_origen', mesa ? mesa.id : 'libre');
      if (mesa) {
        localStorage.setItem('codecpos_referencia_mesa', mesa.nombre);
      } else {
        localStorage.removeItem('codecpos_referencia_mesa');
      }
      navigate('/pos');
    } catch (error) { console.error('Error transfiriendo cuenta a POS:', error); toast.error('Error al transferir al POS. Intenta de nuevo.'); }
  };

  const transferirCarritoAuxiliarAMesa = (mesaId: string, mesaNombre: string) => {
    if (cuentaLibre.length === 0) { toast.error('El carrito auxiliar está vacío'); return; }
    const actuales = Array.isArray(cuentasMesas[mesaId]) ? cuentasMesas[mesaId] : [];
    const combinados = [...actuales];
    cuentaLibre.forEach((item) => {
      const existente = combinados.find((it) => it.producto.id === item.producto.id);
      if (existente) {
        existente.cantidad += item.cantidad;
      } else {
        combinados.push({ ...item });
      }
    });
    persistirCuentas({ ...cuentasMesas, [mesaId]: combinados });
    persistirCuentaLibre([]);
    setShowAgregarMesaDropdown(false);
    toast.success(`Pedido transferido a ${mesaNombre}`);
  };

  const abrirModalMesa = (mesa: MesaConfig) => { setMesaSeleccionada(mesa); setProductoMesaId(''); setCantidadMesa('1'); };
  const cerrarModalMesa = () => { setMesaSeleccionada(null); setProductoMesaId(''); setCantidadMesa('1'); };

  const persistirCuentas = (map: Record<string, ItemMesa[]>, mesaTocada?: string) => {
    setCuentasMesas(map);
    localStorage.setItem(STORAGE_CUENTAS_MESAS, JSON.stringify(map));

    // ☁️ Espeja la cuenta en la nube para que el celular del mesero vea la
    // mesa como la dejó la caja (típicamente: liberada tras cobrarla).
    // Best-effort — si no hay internet o el negocio no está vinculado, no
    // pasa nada: la cuenta ya quedó guardada localmente, como siempre.
    const mesasAEnviar = mesaTocada ? [mesaTocada] : Object.keys(map);
    Promise.all([
      import('../../lib/supabase/tenantLink'),
      import('../../lib/supabase/panaderiaSyncService'),
    ])
      .then(([{ getLinkedClienteId }, { guardarCuentaMesa }]) => {
        const clienteId = getLinkedClienteId();
        if (!clienteId) return;
        return Promise.all(
          mesasAEnviar.map((mesaId) =>
            guardarCuentaMesa(
              clienteId,
              mesaId,
              (map[mesaId] || []).map((it) => ({
                producto: {
                  id: it.producto.id,
                  nombre: it.producto.nombre,
                  precio: Number(it.producto.precio) || 0,
                  codigo: it.producto.codigo,
                },
                cantidad: Number(it.cantidad) || 0,
              })),
              'electron'
            ).catch(() => {})
          )
        );
      })
      .catch(() => { /* sin nube */ });
  };
  const persistirCuentaLibre = (items: ItemMesa[]) => { setCuentaLibre(items); try { localStorage.setItem(STORAGE_CUENTA_LIBRE, JSON.stringify(items)); } catch {} };

  const agregarItemMesa = () => {
    if (!mesaSeleccionada) return;
    const producto = productos.find((p: any) => String(p.id) === String(productoMesaId));
    const cantidad = Math.max(1, Math.floor(Number(cantidadMesa) || 1));
    if (!producto) { toast.error('Selecciona un producto'); return; }
    const productoNormalizado: ProductoMesa = { id: String(producto.id), codigo: String(producto.codigo || producto.nombre || producto.id), nombre: String(producto.nombre || 'Producto'), precio: Number(producto.precio) || 0, stock: Number(producto.stock) > 0 ? Number(producto.stock) : 999999, categoria: String(producto.categoria || 'General'), costo: Number(producto.costo) || 0, pesable: Boolean(producto.pesable), aplicaIVA: Boolean(producto.aplicaIVA), tipoInventario: producto.tipoInventario, recipeId: producto.recipeId };
    const actuales = Array.isArray(cuentasMesas[mesaSeleccionada.id]) ? cuentasMesas[mesaSeleccionada.id] : [];
    const existente = actuales.find((it) => it.producto.id === productoNormalizado.id);
    const nuevos = existente ? actuales.map((it) => it.producto.id === productoNormalizado.id ? { ...it, cantidad: it.cantidad + cantidad } : it) : [...actuales, { producto: productoNormalizado, cantidad }];
    persistirCuentas({ ...cuentasMesas, [mesaSeleccionada.id]: nuevos });
    setProductoMesaId(''); setCantidadMesa('1'); toast.success('Producto agregado a la mesa');
  };

  const quitarItemMesa = (productoId: string) => {
    if (!mesaSeleccionada) return;
    const actuales = Array.isArray(cuentasMesas[mesaSeleccionada.id]) ? cuentasMesas[mesaSeleccionada.id] : [];
    persistirCuentas({ ...cuentasMesas, [mesaSeleccionada.id]: actuales.filter((it) => it.producto.id !== productoId) });
  };

  const totalMesa = (mesaId: string) => (Array.isArray(cuentasMesas[mesaId]) ? cuentasMesas[mesaId] : []).reduce((sum, it) => sum + ((Number(it.producto?.precio) || 0) * (Number(it.cantidad) || 0)), 0);

  // ── Handlers POS Táctil ──────────────────────────────────────────────────────
  const productosCategoriaActual = productosPos.filter((p) => p.categoriaId === catSeleccionada);
  const cuentaActivaActual = mesaSeleccionada ? (cuentasMesas[mesaSeleccionada.id] || []) : cuentaLibre;
  const totalItemsCuentaActiva = cuentaActivaActual.reduce((sum, it) => sum + (Number(it.cantidad) || 0), 0);
  const totalCuentaActiva = cuentaActivaActual.reduce((sum, it) => sum + ((Number(it.producto.precio) || 0) * (Number(it.cantidad) || 0)), 0);

  const guardarCategorias = (nuevas: CategoriaPos[]) => { setCategoriasPos(nuevas); localStorage.setItem('codecpos_panaderia_cats', JSON.stringify(nuevas)); localStorage.setItem(GLOBAL_CATS_KEY, JSON.stringify(nuevas.map(c => ({ id: c.id, nombre: c.nombre, color: c.color })))); };
  const guardarProductosPos = (nuevos: ProductoPos[]) => { setProductosPos(nuevos); localStorage.setItem('codecpos_panaderia_prods', JSON.stringify(nuevos)); };

  const abrirEdicionCategoria = (categoria: CategoriaPos) => {
    if (!puedeAdministrarPanaderia) { notificarAccesoDenegado(); return; }
    setCategoriaEditando(categoria); setNuevaCat({ nombre: categoria.nombre, icono: categoria.icono, color: categoria.color }); setShowCategoriaForm(true);
  };
  const abrirEdicionProducto = (producto: ProductoPos) => {
    if (!puedeAdministrarPanaderia) { notificarAccesoDenegado(); return; }
    const recetaAsociada = recetas.find(r => r.productoId === producto.id);
    const lineasExistentes = recetaAsociada ? recetaIngredientes.filter((ri) => ri.recipeId === recetaAsociada.id).map((ri) => ({ ingredientId: ri.ingredientId, cantidad: ri.cantidad.toString(), unidad: ri.unidad })) : [{ ingredientId: '', cantidad: '', unidad: 'g' }];
    setProductoEditando(producto);
    setProductoForm({ categoriaId: producto.categoriaId, nombre: producto.nombre, precioVenta: producto.precio.toString(), precioCosto: producto.costo?.toString() || '0', stock: producto.stock?.toString() || '0', codigo: producto.codigo || '', icono: producto.icono, color: producto.color, tipoInventario: producto.tipoInventario || 'directo' });
    setProductoRecetaLineas(lineasExistentes.length > 0 ? lineasExistentes : [{ ingredientId: '', cantidad: '', unidad: 'g' }]);
    setShowProductoForm(true);
  };

  const guardarCategoriaForm = () => {
    if (!puedeAdministrarPanaderia) { notificarAccesoDenegado(); return; }
    if (!nuevaCat.nombre.trim()) return toast.error('Nombre de categoría obligatorio');
    if (categoriaEditando) { guardarCategorias(categoriasPos.map(c => c.id === categoriaEditando.id ? { ...c, ...nuevaCat } : c)); toast.success('Categoría actualizada'); }
    else { const id = `cat-${Date.now()}`; guardarCategorias([...categoriasPos, { id, ...nuevaCat }]); if (!catSeleccionada) setCatSeleccionada(id); toast.success('Categoría táctil creada'); }
    setCategoriaEditando(null); setShowCategoriaForm(false); setNuevaCat({ nombre: '', icono: 'pan', color: '#2563eb' });
  };

  const confirmarEliminarCategoria = (id: string) => {
    if (!puedeAdministrarPanaderia) { notificarAccesoDenegado(); return; }
    const categoria = categoriasPos.find(c => c.id === id);
    if (!categoria) return;
    if (!window.confirm(`Eliminar categoría "${categoria.nombre}" y todos sus productos asociados?`)) return;
    const nuevas = categoriasPos.filter(c => c.id !== id);
    guardarCategorias(nuevas); guardarProductosPos(productosPos.filter(p => p.categoriaId !== id));
    if (catSeleccionada === id) setCatSeleccionada(nuevas[0]?.id || '');
    toast.success('Categoría eliminada');
  };

  const guardarProductoForm = async () => {
    if (!puedeAdministrarPanaderia) { notificarAccesoDenegado(); return; }
    const catId = productoForm.categoriaId || catSeleccionada;
    if (!catId) return toast.error('Selecciona una categoría primero');
    if (!productoForm.nombre.trim() || !productoForm.precioVenta) return toast.error('Completa nombre y precio de venta');
    if (!productoForm.precioCosto) return toast.error('Completa precio de costo');
    if (!productoForm.stock) return toast.error('Completa stock disponible');
    const precioVenta = Number(productoForm.precioVenta) || 0;
    const precioCosto = Number(productoForm.precioCosto) || 0;
    const stockInicial = Math.max(0, Number(productoForm.stock) || 0);
    const codigoFinal = productoForm.codigo.trim() || `PAN-${Date.now()}`;
    const categoriaNombre = categoriasPos.find((c) => c.id === catId)?.nombre || 'Panadería';
    const recipeId = productoEditando?.recipeId || `REC-${Date.now()}`;
    const isReceta = productoForm.tipoInventario === 'receta';
    const lineasValidas = productoRecetaLineas.filter((l) => l.ingredientId && Number(l.cantidad) > 0);
    if (isReceta && lineasValidas.length === 0) return toast.error('Agrega al menos un ingrediente para la receta');
    const productoPayload: Partial<InventarioProductoItem> = { id: productoEditando?.id || `pprod-${Date.now()}`, codigo: codigoFinal, nombre: productoForm.nombre.trim(), precio: precioVenta, costo: precioCosto, stock: stockInicial, categoria: categoriaNombre, categoriaId: catId, pesable: false, aplicaIVA: false, tipoInventario: isReceta ? 'receta' : 'directo', recipeId: isReceta ? recipeId : undefined };
    try {
      const productoGuardado = await electronStore.upsertProducto(productoPayload);
      const productoPos: ProductoPos = { id: productoGuardado.id, categoriaId: catId, nombre: productoGuardado.nombre, precio: productoGuardado.precio, costo: productoGuardado.costo, stock: productoGuardado.stock, codigo: productoGuardado.codigo, icono: productoForm.icono, color: productoForm.color, tipoInventario: productoGuardado.tipoInventario, recipeId: productoGuardado.recipeId };
      guardarProductosPos(productoEditando ? productosPos.map((p) => (p.id === productoEditando.id ? productoPos : p)) : [...productosPos, productoPos]);
      if (isReceta) {
        const receta: RecetaItem = { id: recipeId, nombre: `${productoPos.nombre} - Receta`, productoId: productoPos.id, activa: true, rendimiento: 1 };
        await electronStore.guardarRecetas([...recetas.filter((r) => r.productoId !== productoPos.id), receta], lineasValidas.map((linea, index) => ({ id: `RI-${Date.now()}-${index}`, recipeId, ingredientId: linea.ingredientId, cantidad: Number(linea.cantidad) || 0, unidad: linea.unidad || 'und' })) as any);
      } else if (productoEditando?.recipeId) {
        await electronStore.guardarRecetas(recetas.filter((r) => r.productoId !== productoPos.id) as any, recetaIngredientes.filter((ri) => ri.recipeId !== productoEditando.recipeId) as any);
      }
      toast.success(productoEditando ? 'Producto actualizado' : 'Producto creado');
      setProductoEditando(null); setShowProductoForm(false);
      setProductoForm({ categoriaId: '', nombre: '', precioVenta: '', precioCosto: '', stock: '0', codigo: '', icono: 'pan', color: '#2563eb', tipoInventario: 'directo' });
      setProductoRecetaLineas([{ ingredientId: '', cantidad: '', unidad: 'g' }]);
      await cargar();
    } catch (error) { console.error('Error guardando producto:', error); toast.error('No se pudo guardar el producto.'); }
  };

  const confirmarEliminarProducto = (id: string) => {
    if (!puedeAdministrarPanaderia) { notificarAccesoDenegado(); return; }
    const producto = productosPos.find(p => p.id === id);
    if (!producto) return;
    if (!window.confirm(`Eliminar producto "${producto.nombre}"?`)) return;
    guardarProductosPos(productosPos.filter(p => p.id !== id)); toast.success('Producto eliminado');
  };

  const handleDragStartCategoria = (event: React.DragEvent<HTMLButtonElement>, index: number) => { setDragCategoriaIndex(index); event.dataTransfer.effectAllowed = 'move'; };
  const handleDragOverCategoria = (event: React.DragEvent<HTMLButtonElement>) => { event.preventDefault(); };
  const handleDropCategoria = (event: React.DragEvent<HTMLButtonElement>, index: number) => {
    event.preventDefault();
    if (dragCategoriaIndex === null || dragCategoriaIndex === index) return;
    const nueva = [...categoriasPos]; const [moved] = nueva.splice(dragCategoriaIndex, 1); nueva.splice(index, 0, moved);
    guardarCategorias(nueva); setDragCategoriaIndex(null);
  };

  const handleDragStartProducto = (event: React.DragEvent<HTMLButtonElement>, index: number) => { setDragProductoIndex(index); event.dataTransfer.effectAllowed = 'move'; };
  const handleDragOverProducto = (event: React.DragEvent<HTMLButtonElement>) => { event.preventDefault(); };
  const handleDropProducto = (event: React.DragEvent<HTMLButtonElement>, index: number) => {
    event.preventDefault();
    if (dragProductoIndex === null || dragProductoIndex === index) return;
    const ordenFiltrada = [...productosCategoriaActual]; const [moved] = ordenFiltrada.splice(dragProductoIndex, 1); ordenFiltrada.splice(index, 0, moved);
    const ordenReemplazo = [...ordenFiltrada];
    const nuevos = productosPos.reduce<ProductoPos[]>((acc, producto) => { if (producto.categoriaId === catSeleccionada) { const siguiente = ordenReemplazo.shift(); if (siguiente) acc.push(siguiente); } else { acc.push(producto); } return acc; }, []);
    guardarProductosPos(nuevos); setDragProductoIndex(null);
  };

  const confirmarNuevoCategoria = () => {
    if (!puedeAdministrarPanaderia) { notificarAccesoDenegado(); return; }
    setCategoriaEditando(null); setNuevaCat({ nombre: '', icono: 'pan', color: '#2563eb' }); setShowCategoriaForm(true);
  };
  const confirmarNuevoProducto = () => {
    if (!puedeAdministrarPanaderia) { notificarAccesoDenegado(); return; }
    setProductoEditando(null); setProductoForm({ categoriaId: '', nombre: '', precioVenta: '', precioCosto: '', stock: '0', codigo: '', icono: 'pan', color: '#2563eb', tipoInventario: 'directo' }); setProductoRecetaLineas([{ ingredientId: '', cantidad: '', unidad: 'g' }]); setShowProductoForm(true);
  };

  const agregarLineaReceta = () => setProductoRecetaLineas((prev) => [...prev, { ingredientId: '', cantidad: '', unidad: 'g' }]);
  const quitarLineaReceta = (index: number) => setProductoRecetaLineas((prev) => prev.filter((_, idx) => idx !== index));
  const actualizarLineaReceta = (index: number, field: keyof RecetaLinea, value: string) => setProductoRecetaLineas((prev) => prev.map((linea, idx) => idx === index ? { ...linea, [field]: value } : linea));

  const toqueRapidoProducto = (prod: ProductoPos) => {
    const productoNormalizado: ProductoMesa = { id: prod.id, codigo: `TAC-${prod.nombre.substring(0,3).toUpperCase()}`, nombre: prod.nombre, precio: prod.precio, stock: 999999, categoria: 'Alimentos y Bebidas', costo: prod.costo || 0, tipoInventario: prod.tipoInventario, recipeId: prod.recipeId };
    const cuentaSeleccionActual = mesaSeleccionada ? (Array.isArray(cuentasMesas[mesaSeleccionada.id]) ? cuentasMesas[mesaSeleccionada.id] : []) : cuentaLibre;
    const existente = cuentaSeleccionActual.find((it) => it.producto.id === productoNormalizado.id);
    const nuevos = existente ? cuentaSeleccionActual.map((it) => it.producto.id === productoNormalizado.id ? { ...it, cantidad: it.cantidad + 1 } : it) : [...cuentaSeleccionActual, { producto: productoNormalizado, cantidad: 1 }];
    if (mesaSeleccionada) { persistirCuentas({ ...cuentasMesas, [mesaSeleccionada.id]: nuevos }); } else { persistirCuentaLibre(nuevos); }
    toast.success(`+1 ${prod.nombre} ${mesaSeleccionada ? `en ${mesaSeleccionada.nombre}` : ''}`);
  };

  const handleRemoveFromQuickCart = (productId: string) => {
    if (mesaSeleccionada) { const actuales = Array.isArray(cuentasMesas[mesaSeleccionada.id]) ? cuentasMesas[mesaSeleccionada.id] : []; persistirCuentas({ ...cuentasMesas, [mesaSeleccionada.id]: actuales.filter((it) => it.producto.id !== productId) }); }
    else { persistirCuentaLibre(cuentaLibre.filter((it) => it.producto.id !== productId)); }
  };

  // ── Handlers ingredientes / mermas / recetas / combos ────────────────────────
  const descargarPlantillaIngredientesExcel = async () => {
    try {
      const XLSX = await import('xlsx');
      const plantilla = [{ nombre: 'Harina de trigo', unidad: 'g', stockActual: 5000, stockMinimo: 1000, costoUnitario: 0.004 }, { nombre: 'Azúcar', unidad: 'g', stockActual: 3000, stockMinimo: 800, costoUnitario: 0.005 }, { nombre: 'Leche', unidad: 'ml', stockActual: 2000, stockMinimo: 500, costoUnitario: 0.0035 }];
      const ws = XLSX.utils.json_to_sheet(plantilla); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Ingredientes'); XLSX.writeFile(wb, 'plantilla_panaderia_ingredientes.xlsx'); toast.success('Plantilla descargada');
    } catch { toast.error('No se pudo generar la plantilla Excel'); }
  };

  const cargarIngredientesDesdeExcel = async (file: File) => {
    try {
      const XLSX = await import('xlsx'); const data = await file.arrayBuffer(); const wb = XLSX.read(data); const ws = wb.Sheets[wb.SheetNames[0]]; const rows = XLSX.utils.sheet_to_json(ws) as Array<any>;
      if (!Array.isArray(rows) || rows.length === 0) { toast.error('El archivo Excel está vacío'); return; }
      let cargados = 0;
      for (const row of rows) { const nombre = String(row.nombre || '').trim(); if (!nombre) continue; await electronStore.upsertIngrediente({ id: `ING-${Date.now()}-${Math.floor(Math.random() * 10000)}`, nombre, unidad: String(row.unidad || 'g'), stockActual: Number(row.stockActual || 0), stockMinimo: Number(row.stockMinimo || 0), costoUnitario: Number(row.costoUnitario || 0), activo: true } as any); cargados++; }
      await cargar(); toast.success(`Ingredientes importados: ${cargados}`);
    } catch { toast.error('Error importando Excel. Verifica columnas: nombre, unidad, stockActual, stockMinimo, costoUnitario'); }
  };

  const descargarPlantillaProductosExcel = async () => {
    if (!puedeAdministrarPanaderia) { notificarAccesoDenegado(); return; }
    try {
      const XLSX = await import('xlsx');
      const plantilla = [{ categoria: 'Hojaldres', nombre: 'Croissant', precioVenta: 4500, precioCosto: 2500, stock: 15, codigo: 'PAN-001', icono: 'pan', color: '#2563eb', tipoInventario: 'directo' }];
      const ws = XLSX.utils.json_to_sheet(plantilla);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Productos');
      XLSX.writeFile(wb, 'plantilla_panaderia_productos.xlsx');
      toast.success('Plantilla de productos descargada');
    } catch {
      toast.error('No se pudo generar la plantilla Excel de productos');
    }
  };

  const cargarProductosDesdeExcel = async (file: File) => {
    if (!puedeAdministrarPanaderia) { notificarAccesoDenegado(); return; }
    try {
      const XLSX = await import('xlsx'); const data = await file.arrayBuffer(); const wb = XLSX.read(data); const ws = wb.Sheets[wb.SheetNames[0]]; const rows = XLSX.utils.sheet_to_json(ws) as Array<any>;
      if (!Array.isArray(rows) || rows.length === 0) { toast.error('El archivo Excel está vacío'); return; }
      let cargados = 0;
      const categoriasMap = new Map(categoriasPos.map((cat) => [cat.nombre.toLowerCase(), cat]));
      const nuevasCategorias = [...categoriasPos];
      const productosActualizados = [...productosPos];
      for (let index = 0; index < rows.length; index++) {
        const row = rows[index];
        const nombre = String(row.nombre || '').trim();
        if (!nombre) continue;
        const categoriaNombre = String(row.categoria || row.categoriaId || 'Panadería').trim();
        const categoriaClave = categoriaNombre.toLowerCase();
        let categoria = categoriasMap.get(categoriaClave);
        if (!categoria) {
          categoria = { id: `cat-${Date.now()}-${index}`, nombre: categoriaNombre, icono: 'pan', color: '#2563eb' };
          categoriasMap.set(categoriaClave, categoria);
          nuevasCategorias.push(categoria);
        }
        const precioVenta = Number(row.precioVenta || row.precio || 0) || 0;
        const precioCosto = Number(row.precioCosto || row.costo || 0) || 0;
        const stock = Math.max(0, Number(row.stock || 0) || 0);
        const codigo = String(row.codigo || row.nombre || `PAN-${Date.now()}-${index}`).trim();
        const icono = String(row.icono || 'pan') as IconKey;
        const color = String(row.color || '#2563eb');
        const tipoInventario = row.tipoInventario === 'receta' ? 'receta' : 'directo';
        const productoId = String(row.id || `pprod-${Date.now()}-${index}`);
        const productoPayload: Partial<InventarioProductoItem> = {
          id: productoId,
          codigo,
          nombre,
          precio: precioVenta,
          costo: precioCosto,
          stock,
          categoria: categoria.nombre,
          categoriaId: categoria.id,
          pesable: false,
          aplicaIVA: false,
          tipoInventario,
          recipeId: tipoInventario === 'receta' ? `REC-${Date.now()}-${index}` : undefined,
        };
        const productoGuardado = await electronStore.upsertProducto(productoPayload);
        const productoPos: ProductoPos = {
          id: productoGuardado.id,
          categoriaId: categoria.id,
          nombre: productoGuardado.nombre,
          precio: productoGuardado.precio,
          costo: productoGuardado.costo,
          stock: productoGuardado.stock,
          codigo: productoGuardado.codigo,
          icono: icono || 'pan',
          color: color || '#2563eb',
          tipoInventario: productoGuardado.tipoInventario,
          recipeId: productoGuardado.recipeId,
        };
        const existenteIndex = productosActualizados.findIndex((p) => p.id === productoPos.id || p.codigo === productoPos.codigo);
        if (existenteIndex >= 0) {
          productosActualizados[existenteIndex] = productoPos;
        } else {
          productosActualizados.push(productoPos);
        }
        cargados++;
      }
      guardarCategorias(nuevasCategorias);
      guardarProductosPos(productosActualizados);
      await cargar();
      toast.success(`Productos importados: ${cargados}`);
    } catch (error) {
      console.error('Error importando productos:', error);
      toast.error('Error importando Excel. Verifica columnas: categoria, nombre, precioVenta, precioCosto, stock, codigo');
    }
  };

  const recetaResumen = useMemo(() => {
    const mapIng = new Map(ingredientes.map(i => [i.id, i]));
    return recetas.map(r => ({ ...r, insumos: recetaIngredientes.filter(ri => ri.recipeId === r.id).map(ri => ({ ...ri, nombreIngrediente: mapIng.get(ri.ingredientId)?.nombre || ri.ingredientId })) }));
  }, [recetas, recetaIngredientes, ingredientes]);

  const guardarIngrediente = async () => {
    if (!nuevoIngrediente.nombre.trim()) return toast.error('Nombre obligatorio');
    await electronStore.upsertIngrediente({ id: `ING-${Date.now()}`, nombre: nuevoIngrediente.nombre.trim(), unidad: nuevoIngrediente.unidad, stockActual: Number(nuevoIngrediente.stockActual) || 0, stockMinimo: Number(nuevoIngrediente.stockMinimo) || 0, costoUnitario: Number(nuevoIngrediente.costoUnitario) || 0, activo: true } as any);
    toast.success('Ingrediente guardado'); setNuevoIngrediente({ nombre: '', unidad: 'g', stockActual: '0', stockMinimo: '0', costoUnitario: '0' }); await cargar();
  };

  const registrarMerma = async () => {
    if (!nuevaMerma.ingredientId || !(Number(nuevaMerma.cantidad) > 0)) return toast.error('Completa ingrediente y cantidad');
    await electronStore.registrarMerma({ ingredientId: nuevaMerma.ingredientId, cantidad: Number(nuevaMerma.cantidad), unidad: nuevaMerma.unidad, motivo: nuevaMerma.motivo } as any);
    toast.success('Merma registrada'); setNuevaMerma({ ingredientId: '', cantidad: '', unidad: 'g', motivo: '' }); await cargar();
  };

  const guardarReceta = async () => {
    if (!productoRecetaId) return toast.error('Selecciona producto');
    const lineasValidas = lineasReceta.filter(l => l.ingredientId && Number(l.cantidad) > 0);
    if (lineasValidas.length === 0) return toast.error('Agrega ingredientes válidos');
    const recipeId = `REC-${Date.now()}`;
    const nuevasRecetas = [...recetas.filter(r => r.productoId !== productoRecetaId), { id: recipeId, nombre: nombreReceta || `Receta ${productoRecetaId}`, productoId: productoRecetaId, activa: true, rendimiento: 1 }];
    const nuevasLineas = [...recetaIngredientes.filter((ri: any) => !recetas.some((r: any) => r.productoId === productoRecetaId && r.id === ri.recipeId)), ...lineasValidas.map((l, idx) => ({ id: `RI-${Date.now()}-${idx}`, recipeId, ingredientId: l.ingredientId, cantidad: Number(l.cantidad), unidad: l.unidad }))];
    await electronStore.guardarRecetas(nuevasRecetas as any, nuevasLineas as any);
    const prods = [...productos]; const pIdx = prods.findIndex(p => p.id === productoRecetaId);
    if (pIdx >= 0) { prods[pIdx] = { ...prods[pIdx], tipoInventario: 'receta', recipeId }; localStorage.setItem('pos-productos', JSON.stringify(prods)); }
    toast.success('Receta guardada'); setProductoRecetaId(''); setNombreReceta(''); setLineasReceta([{ ingredientId: '', cantidad: '', unidad: 'g' }]); await cargar();
  };

  const guardarCombo = async () => {
    if (!comboForm.nombre.trim()) return toast.error('Nombre del combo obligatorio');
    if (!(Number(comboForm.precio) > 0)) return toast.error('Precio del combo inválido');
    if (!comboForm.codigo.trim() && !comboForm.keyword.trim()) return toast.error('Ingresa código o palabra clave');
    const componentes = lineasCombo.filter(l => l.refId && Number(l.cantidad) > 0).map((l) => { const source = l.tipo === 'producto' ? productos.find(p => String(p.id) === String(l.refId)) : ingredientes.find(i => String(i.id) === String(l.refId)); return { tipo: l.tipo, refId: l.refId, nombre: source?.nombre || l.refId, cantidad: Number(l.cantidad), unidad: l.unidad || (l.tipo === 'producto' ? 'und' : 'g') }; });
    if (componentes.length === 0) return toast.error('Agrega componentes al combo');
    await electronStore.upsertComboOnces({ id: comboEditando?.id || `COM-${Date.now()}`, nombre: comboForm.nombre.trim(), codigo: comboForm.codigo.trim().toUpperCase(), keyword: comboForm.keyword.trim().toLowerCase(), precio: Number(comboForm.precio), activo: true, componentes } as any);
    toast.success(comboEditando ? 'Combo actualizado' : 'Combo guardado');
    setComboEditando(null); setComboForm({ nombre: '', codigo: '', keyword: '', precio: '' }); setLineasCombo([{ tipo: 'producto', refId: '', cantidad: '1', unidad: 'und' }]); await cargar();
  };

  const abrirEdicionCombo = (combo: ComboOncesItem) => {
    setComboEditando(combo);
    setComboForm({ nombre: combo.nombre, codigo: combo.codigo, keyword: combo.keyword, precio: String(combo.precio) });
    setLineasCombo(combo.componentes.map(cp => ({ tipo: cp.tipo, refId: cp.refId, cantidad: String(cp.cantidad), unidad: cp.unidad || (cp.tipo === 'producto' ? 'und' : 'g') })));
  };

  const eliminarCombo = async (id: string) => {
    const combo = combos.find(c => c.id === id);
    if (!combo) return;
    if (!window.confirm(`¿Eliminar combo "${combo.nombre}"?`)) return;
    await electronStore.guardarCombosOnces(combos.filter(c => c.id !== id));
    toast.success('Combo eliminado'); await cargar();
  };

  const toqueRapidoCombo = (combo: ComboOncesItem) => {
    const productoNorm: ProductoMesa = { id: combo.id, codigo: combo.codigo || combo.id, nombre: combo.nombre, precio: combo.precio, stock: 999999, categoria: 'Combo', costo: 0 };
    const cuentaActual = mesaSeleccionada ? (Array.isArray(cuentasMesas[mesaSeleccionada.id]) ? cuentasMesas[mesaSeleccionada.id] : []) : cuentaLibre;
    const existente = cuentaActual.find(it => it.producto.id === productoNorm.id);
    const nuevos = existente ? cuentaActual.map(it => it.producto.id === productoNorm.id ? { ...it, cantidad: it.cantidad + 1 } : it) : [...cuentaActual, { producto: productoNorm, cantidad: 1 }];
    if (mesaSeleccionada) { persistirCuentas({ ...cuentasMesas, [mesaSeleccionada.id]: nuevos }); } else { persistirCuentaLibre(nuevos); }
    toast.success(`+1 ${combo.nombre}${mesaSeleccionada ? ` en ${mesaSeleccionada.nombre}` : ''}`);
  };

  const toggleModuloPanaderiaOnces = () => {
    const nuevoEstado = !moduloPanaderiaOncesActivo;
    setModuloPanaderiaOncesActivo(nuevoEstado);
    localStorage.setItem(STORAGE_MODULO_PANADERIA_ONCES, String(nuevoEstado));
    window.dispatchEvent(new Event('codecpos-panaderia-onces-toggle'));
    toast.success(nuevoEstado ? 'Módulo ENCENDIDO' : 'Módulo APAGADO');
  };

  // ── Handlers de secciones draggables ─────────────────────────────────────────
  const toggleCollapse = useCallback((id: SectionId) => {
    setCollapsed(prev => {
      const next = { ...prev, [id]: !prev[id] };
      localStorage.setItem('codecpos_panaderia_collapsed', JSON.stringify(next));
      return next;
    });
  }, []);

  const handleSectionDragStart = useCallback((e: React.DragEvent, id: SectionId) => {
    setDragSectionId(id);
    e.dataTransfer.effectAllowed = 'move';
  }, []);

  const handleSectionDragOver = useCallback((e: React.DragEvent, id: SectionId) => {
    e.preventDefault();
    setDragOverSectionId(id);
  }, []);

  const handleSectionDrop = useCallback((id: SectionId) => {
    if (!dragSectionId || dragSectionId === id) { setDragSectionId(null); setDragOverSectionId(null); return; }
    const order = [...sectionOrder];
    const fromIdx = order.indexOf(dragSectionId);
    const toIdx = order.indexOf(id);
    order.splice(fromIdx, 1);
    order.splice(toIdx, 0, dragSectionId);
    setSectionOrder(order);
    localStorage.setItem('codecpos_panaderia_section_order', JSON.stringify(order));
    setDragSectionId(null); setDragOverSectionId(null);
  }, [dragSectionId, sectionOrder]);

  const handleSectionDragEnd = useCallback(() => { setDragSectionId(null); setDragOverSectionId(null); }, []);

  // ── Métricas para Dashboard ───────────────────────────────────────────────────
  const ingredientesBajoStock = ingredientes.filter(i => Number(i.stockActual) <= Number(i.stockMinimo));
  const mesasConCuenta = mesas.filter(m => totalMesa(m.id) > 0);
  const totalVentasMesas = mesas.reduce((sum, m) => sum + totalMesa(m.id), 0);
  const margenPromedioPos = productosPos.length > 0 ? productosPos.reduce((sum, p) => sum + (p.precio > 0 ? ((p.precio - (p.costo || 0)) / p.precio) * 100 : 0), 0) / productosPos.length : 0;

  // ── Configuración visual de secciones ────────────────────────────────────────
  const SECTION_CONFIG: Record<SectionId, { label: string; icon: React.ReactNode; gradient: string }> = {
    dashboard:     { label: 'Panel de Control',     icon: <BarChart3 className="w-5 h-5" />,    gradient: 'from-violet-600 to-purple-700'   },
    pos_tactil:    { label: 'Alimentos y Bebidas',     icon: <Croissant className="w-5 h-5" />,    gradient: 'from-amber-500 to-orange-600'    },
    mesas:         { label: 'Cuentas por Mesa',     icon: <Armchair className="w-5 h-5" />,     gradient: 'from-emerald-500 to-teal-600'    },
    ingredientes:  { label: 'Ingredientes',         icon: <Package2 className="w-5 h-5" />,     gradient: 'from-green-600 to-emerald-700'   },
    recetas:       { label: 'Recetas',              icon: <BookOpen className="w-5 h-5" />,     gradient: 'from-sky-500 to-cyan-600'        },
    mermas:        { label: 'Historial de Mermas',  icon: <Trash2 className="w-5 h-5" />,       gradient: 'from-rose-500 to-red-600'        },
    combos:        { label: 'Combos y Desayunos',   icon: <TrendingUp className="w-5 h-5" />,   gradient: 'from-yellow-500 to-amber-600'    },
  };

  // ── Render de contenido por sección ──────────────────────────────────────────
  const renderSectionContent = (id: SectionId) => {
    switch (id) {

      // ── Dashboard ────────────────────────────────────────────────────────────
      case 'dashboard':
        return (
          <div className="space-y-4">
            {/* Módulo toggle */}
            <div className={`flex items-center justify-between rounded-2xl p-4 ${darkMode ? 'bg-slate-800/60' : 'bg-slate-50'}`}>
              <div>
                <p className="font-black text-base">Módulo Alimentos y Bebidas</p>
                <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Activa o desactiva la visibilidad en el POS principal</p>
              </div>
              <div className="flex items-center gap-3">
                <span className={`text-sm font-bold ${moduloPanaderiaOncesActivo ? 'text-emerald-600' : 'text-rose-500'}`}>{moduloPanaderiaOncesActivo ? 'ACTIVO' : 'INACTIVO'}</span>
                <Button onClick={toggleModuloPanaderiaOnces} className={`h-10 px-5 font-bold ${moduloPanaderiaOncesActivo ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-rose-600 hover:bg-rose-700'}`}>
                  {moduloPanaderiaOncesActivo ? 'Apagar' : 'Encender'}
                </Button>
              </div>
            </div>

            {/* KPIs */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {[
                { label: 'Productos', value: productosPos.length, sub: `${categoriasPos.length} categorías`, icon: <ShoppingCart className="w-5 h-5" />, color: 'from-blue-500 to-indigo-600' },
                { label: 'Mesas activas', value: mesasConCuenta.length, sub: `Total: $${totalVentasMesas.toLocaleString('es-CO')}`, icon: <Armchair className="w-5 h-5" />, color: 'from-emerald-500 to-teal-600' },
                { label: 'Combos', value: combos.length, sub: 'disponibles', icon: <TrendingUp className="w-5 h-5" />, color: 'from-amber-500 to-orange-600' },
                { label: 'Margen promedio', value: `${margenPromedioPos.toFixed(0)}%`, sub: 'en productos POS', icon: <BarChart3 className="w-5 h-5" />, color: 'from-violet-500 to-purple-600' },
              ].map((kpi, i) => (
                <div key={i} className={`rounded-2xl bg-gradient-to-br ${kpi.color} p-4 text-white shadow-lg`}>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-bold uppercase tracking-widest text-white/70">{kpi.label}</p>
                    <div className="text-white/80">{kpi.icon}</div>
                  </div>
                  <p className="text-3xl font-black">{kpi.value}</p>
                  <p className="text-xs text-white/70 mt-1">{kpi.sub}</p>
                </div>
              ))}
            </div>

            {/* Alertas de stock bajo */}
            {ingredientesBajoStock.length > 0 && (
              <div className={`rounded-2xl border p-4 ${darkMode ? 'border-rose-900/40 bg-rose-950/20' : 'border-rose-200 bg-rose-50'}`}>
                <div className="flex items-center gap-2 mb-3">
                  <AlertTriangle className="w-5 h-5 text-rose-500" />
                  <p className="font-black text-rose-600">{ingredientesBajoStock.length} ingrediente{ingredientesBajoStock.length > 1 ? 's' : ''} con stock bajo</p>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                  {ingredientesBajoStock.map(ing => (
                    <div key={ing.id} className={`rounded-xl p-2.5 text-xs ${darkMode ? 'bg-rose-900/30' : 'bg-white'} border border-rose-200`}>
                      <p className="font-bold truncate">{ing.nombre}</p>
                      <p className="text-rose-500 font-semibold">{ing.stockActual} {ing.unidad} / mín {ing.stockMinimo}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {ingredientesBajoStock.length === 0 && ingredientes.length > 0 && (
              <div className={`rounded-2xl border p-4 flex items-center gap-3 ${darkMode ? 'border-emerald-900/40 bg-emerald-950/20' : 'border-emerald-200 bg-emerald-50'}`}>
                <Check className="w-5 h-5 text-emerald-500" />
                <p className="font-semibold text-emerald-600">Todos los ingredientes tienen stock suficiente</p>
              </div>
            )}

            {/* Resumen de cuentas abiertas */}
            {mesasConCuenta.length > 0 && (
              <div className={`rounded-2xl border p-4 ${darkMode ? 'border-slate-700 bg-slate-800/40' : 'border-slate-200 bg-white'}`}>
                <p className="font-black mb-3 text-base">Cuentas abiertas</p>
                <div className="flex flex-wrap gap-2">
                  {mesasConCuenta.map(m => (
                    <div key={m.id} className={`rounded-xl px-3 py-2 text-sm font-bold ${darkMode ? 'bg-slate-700' : 'bg-slate-100'}`}>
                      {m.nombre} <span className="text-emerald-600">${totalMesa(m.id).toLocaleString('es-CO')}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );

      // ── Alimentos y Bebidas (POS Táctil + Cuenta Rápida integrados) ─────────────
      case 'pos_tactil':
        return (
          <div className="space-y-4">
            {/* Subtítulo */}
            <p className={`text-sm font-medium ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
              Gestiona aquí tus categorías y productos
            </p>

                <div className="flex flex-wrap items-center justify-end gap-3">
                  <Button variant="outline" className={`h-10 px-4 font-semibold ${!puedeAdministrarPanaderia ? 'opacity-50 cursor-not-allowed' : ''}`} disabled={!puedeAdministrarPanaderia} onClick={() => { if (!puedeAdministrarPanaderia) { notificarAccesoDenegado(); return; } if (showCategoriaForm) { setShowCategoriaForm(false); setCategoriaEditando(null); } else { confirmarNuevoCategoria(); } }}>
                    {showCategoriaForm ? 'Cerrar' : 'Nueva categoría'}
                  </Button>
                  <Button variant="outline" className={`h-10 px-4 font-semibold ${!puedeAdministrarPanaderia ? 'opacity-50 cursor-not-allowed' : ''}`} disabled={!puedeAdministrarPanaderia} onClick={descargarPlantillaProductosExcel}>
                    <Download className="w-4 h-4 mr-2" />Plantilla productos
                  </Button>
                  <label className={`inline-flex items-center gap-2 h-10 px-4 rounded-xl border text-sm font-semibold transition ${!puedeAdministrarPanaderia ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-slate-50'}`}>
                    <Upload className="w-4 h-4" />Cargar productos
                    <input type="file" accept=".xlsx,.xls" className="hidden" disabled={!puedeAdministrarPanaderia} onChange={async (e) => { if (!puedeAdministrarPanaderia) { notificarAccesoDenegado(); e.currentTarget.value = ''; return; } const file = e.target.files?.[0]; if (file) await cargarProductosDesdeExcel(file); e.currentTarget.value = ''; }} />
                  </label>
                </div>

                {/* Categorías */}
                <div className="flex gap-3 overflow-x-auto [&::-webkit-scrollbar]:hidden pb-1 snap-x snap-mandatory">
                  {categoriasPos.map((cat, index) => {
                    const light = isColorLight(cat.color);
                    return (
                      <button key={cat.id} type="button" onClick={() => setCatSeleccionada(cat.id)} draggable
                        onDragStart={(event) => handleDragStartCategoria(event, index)}
                        onDragOver={handleDragOverCategoria}
                        onDrop={(event) => handleDropCategoria(event, index)}
                        className={`group relative flex-shrink-0 snap-start min-w-[160px] rounded-2xl px-4 py-2.5 flex items-center gap-2.5 text-sm font-bold transition-all duration-200 hover:-translate-y-0.5 ${catSeleccionada === cat.id ? 'ring-2 ring-offset-2 ring-white/60 scale-105' : 'opacity-85 hover:opacity-100'}`}
                        style={{ backgroundColor: cat.color, boxShadow: catSeleccionada === cat.id ? `0 8px 24px -4px ${cat.color}99, 0 4px 12px -4px ${cat.color}66` : darkMode ? '0 4px 12px -4px rgba(0,0,0,0.4)' : 'none' }}
                      >
                        <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${light ? 'bg-slate-900/5' : 'bg-white/10'}`}>
                          <span className={light ? 'text-slate-900' : 'text-white'}>{renderIcon(cat.icono, 'w-5 h-5')}</span>
                        </span>
                        <span className={`truncate ${light ? 'text-slate-900' : 'text-white'}`}>{cat.nombre}</span>
                        <div className="absolute right-2 top-2 hidden items-center gap-1 group-hover:flex">
                          <button type="button" disabled={!puedeAdministrarPanaderia} onClick={(e) => { e.stopPropagation(); abrirEdicionCategoria(cat); }} className={`rounded-full bg-white/15 p-1 text-white transition ${puedeAdministrarPanaderia ? 'hover:bg-white/25' : 'opacity-40 cursor-not-allowed'}`}><Edit className="w-3 h-3" /></button>
                          <button type="button" disabled={!puedeAdministrarPanaderia} onClick={(e) => { e.stopPropagation(); confirmarEliminarCategoria(cat.id); }} className={`rounded-full bg-white/15 p-1 text-white transition ${puedeAdministrarPanaderia ? 'hover:bg-white/25' : 'opacity-40 cursor-not-allowed'}`}><Trash2 className="w-3 h-3" /></button>
                        </div>
                      </button>
                    );
                  })}
                  <button type="button" disabled={!puedeAdministrarPanaderia} onClick={confirmarNuevoCategoria} className={`flex-shrink-0 snap-start min-w-[160px] rounded-2xl border border-dashed border-slate-300 bg-slate-100 px-4 py-2.5 text-sm font-bold text-slate-700 transition ${puedeAdministrarPanaderia ? 'hover:-translate-y-0.5 hover:border-slate-400' : 'opacity-50 cursor-not-allowed'}`}>
                    + Categoría
                  </button>
                </div>

                {/* Formulario categoría */}
                {showCategoriaForm && (
                  <div className={`rounded-2xl border p-4 space-y-3 ${darkMode ? 'border-slate-700 bg-slate-800/50' : 'border-slate-200 bg-slate-50'}`}>
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: nuevaCat.color }}>
                        {renderIcon(nuevaCat.icono, `w-5 h-5 ${isColorLight(nuevaCat.color) ? 'text-slate-900' : 'text-white'}`)}
                      </div>
                      <Input className="h-11 flex-1" placeholder="Nombre de la categoría" value={nuevaCat.nombre} onChange={e => setNuevaCat(s => ({ ...s, nombre: e.target.value }))} />
                      <Button className="h-11 px-5 bg-emerald-600 hover:bg-emerald-700 flex-shrink-0" onClick={guardarCategoriaForm}>
                        <Check className="w-4 h-4 mr-1" />{categoriaEditando ? 'Guardar' : 'Crear'}
                      </Button>
                    </div>
                    <div className="flex gap-2 overflow-x-auto [&::-webkit-scrollbar]:hidden pb-1">
                      {ICON_LIBRARY.map(({ key, label, Component }) => (
                        <button key={key} type="button" title={label} onClick={() => setNuevaCat(s => ({ ...s, icono: key }))} className={`relative flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center transition-all hover:scale-110 border-2 ${nuevaCat.icono === key ? 'border-emerald-500 bg-emerald-50 text-emerald-600' : darkMode ? 'border-slate-700 bg-slate-800 text-slate-400' : 'border-slate-200 bg-white text-slate-500'}`}>
                          {nuevaCat.icono === key && <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-emerald-500 rounded-full flex items-center justify-center"><Check className="w-2 h-2 text-white" /></span>}
                          <Component className="w-4 h-4" />
                        </button>
                      ))}
                    </div>
                    <div className="flex flex-wrap gap-2 items-center">
                      {COLOR_PALETTE.map((color) => (
                        <button key={color} type="button" onClick={() => setNuevaCat(s => ({ ...s, color }))} className={`relative w-8 h-8 rounded-full transition-all hover:scale-110 flex items-center justify-center ${nuevaCat.color === color ? 'ring-2 ring-offset-2 ring-slate-400' : ''}`} style={{ backgroundColor: color }}>
                          {nuevaCat.color === color && <Check className={`w-3.5 h-3.5 ${isColorLight(color) ? 'text-slate-900' : 'text-white'}`} />}
                        </button>
                      ))}
                      <label className="cursor-pointer"><input type="color" className="sr-only" value={nuevaCat.color} onChange={e => setNuevaCat(s => ({ ...s, color: e.target.value }))} /><span className={`w-8 h-8 rounded-full border-2 border-dashed flex items-center justify-center hover:scale-110 transition ${darkMode ? 'border-slate-600 bg-slate-800 text-slate-400' : 'border-slate-300 bg-white text-slate-400'}`}><Plus className="w-3.5 h-3.5" /></span></label>
                    </div>
                  </div>
                )}

                {/* Cuadrícula de productos */}
                <div className="max-h-[360px] overflow-y-auto scrollbar-thin pr-1">
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 pb-2">
                    {productosCategoriaActual.map((prod, index) => {
                      const light = isColorLight(prod.color);
                      return (
                        <button key={prod.id} type="button" onClick={() => toqueRapidoProducto(prod)} draggable
                          onDragStart={(event) => handleDragStartProducto(event, index)}
                          onDragOver={handleDragOverProducto}
                          onDrop={(event) => handleDropProducto(event, index)}
                          className="group relative w-40 h-40 sm:w-44 sm:h-44 rounded-[32px] p-4 flex flex-col items-center justify-center gap-3 text-center shadow-xl transition-transform duration-200 hover:-translate-y-1 active:scale-95"
                          style={{ backgroundColor: prod.color }}
                        >
                          <div className="flex h-14 w-14 items-center justify-center rounded-2xl">
                            <span className={light ? 'text-slate-900' : 'text-white'}>{renderIcon(prod.icono)}</span>
                          </div>
                          <div className={`text-sm font-black leading-tight ${light ? 'text-slate-900' : 'text-white'}`}>{prod.nombre}</div>
                          <div className={`text-sm font-semibold ${light ? 'text-amber-700' : 'text-white/90'}`}>${prod.precio.toLocaleString('es-CO')}</div>
                          <div className="absolute right-2.5 top-2.5 hidden gap-1.5 group-hover:flex">
                            <button type="button" disabled={!puedeAdministrarPanaderia} onClick={(e) => { e.stopPropagation(); abrirEdicionProducto(prod); }} className={`rounded-full bg-white/15 p-1 text-white transition ${puedeAdministrarPanaderia ? 'hover:bg-white/25' : 'opacity-40 cursor-not-allowed'}`}><Edit className="w-3.5 h-3.5" /></button>
                            <button type="button" disabled={!puedeAdministrarPanaderia} onClick={(e) => { e.stopPropagation(); confirmarEliminarProducto(prod.id); }} className={`rounded-full bg-white/15 p-1 text-white transition ${puedeAdministrarPanaderia ? 'hover:bg-white/25' : 'opacity-40 cursor-not-allowed'}`}><Trash2 className="w-3.5 h-3.5" /></button>
                          </div>
                        </button>
                      );
                    })}
                    <button type="button" disabled={!puedeAdministrarPanaderia} onClick={confirmarNuevoProducto} className={`w-40 h-40 sm:w-44 sm:h-44 rounded-[32px] border border-dashed border-slate-300 p-4 flex flex-col items-center justify-center gap-2 text-slate-600 bg-slate-100 shadow-lg transition ${puedeAdministrarPanaderia ? 'hover:-translate-y-1 hover:border-slate-400' : 'opacity-50 cursor-not-allowed'}`}>
                      <Plus className="w-6 h-6" /><span className="text-sm font-bold">Nuevo producto</span>
                    </button>
                  </div>
                </div>

                {/* Formulario producto */}
                {showProductoForm && (
                  <div className={`rounded-2xl border p-4 space-y-3 ${darkMode ? 'border-slate-700 bg-slate-800/50' : 'border-slate-200 bg-white'}`}>
                    <div className="grid gap-3 md:grid-cols-4">
                      <select className="h-11 rounded-xl border px-3 bg-transparent text-sm" value={productoForm.categoriaId || catSeleccionada} onChange={(e) => setProductoForm((s) => ({ ...s, categoriaId: e.target.value }))}>
                    <option value="">Categoría</option>
                    {categoriasPos.map((cat) => <option key={cat.id} value={cat.id}>{cat.nombre}</option>)}
                  </select>
                  <Input className="h-11" placeholder="Nombre producto" value={productoForm.nombre} onChange={(e) => setProductoForm((s) => ({ ...s, nombre: e.target.value }))} />
                  <Input className="h-11" placeholder="Código" value={productoForm.codigo} onChange={(e) => setProductoForm((s) => ({ ...s, codigo: e.target.value }))} />
                  <select className="h-11 rounded-xl border px-3 bg-transparent text-sm" value={productoForm.tipoInventario} onChange={(e) => setProductoForm((s) => ({ ...s, tipoInventario: e.target.value as 'directo' | 'receta' }))}>
                    <option value="directo">Inventario directo</option>
                    <option value="receta">Receta / ingredientes</option>
                  </select>
                  <Input className="h-11" placeholder="Precio de venta" value={productoForm.precioVenta} onChange={(e) => setProductoForm((s) => ({ ...s, precioVenta: e.target.value }))} />
                  <Input className="h-11" placeholder="Precio de costo" value={productoForm.precioCosto} onChange={(e) => setProductoForm((s) => ({ ...s, precioCosto: e.target.value }))} />
                  <Input className="h-11" placeholder="Stock" value={productoForm.stock} onChange={(e) => setProductoForm((s) => ({ ...s, stock: e.target.value }))} />
                  <Button className="h-11 bg-emerald-600 hover:bg-emerald-700" onClick={guardarProductoForm}><Check className="w-4 h-4 mr-1" />{productoEditando ? 'Guardar' : 'Crear producto'}</Button>
                </div>
                <div className="flex gap-2 overflow-x-auto [&::-webkit-scrollbar]:hidden pb-1">
                  {ICON_LIBRARY.map(({ key, label, Component }) => (
                    <button key={key} type="button" title={label} onClick={() => setProductoForm(s => ({ ...s, icono: key }))} className={`relative flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center transition-all hover:scale-110 border-2 ${productoForm.icono === key ? 'border-emerald-500 bg-emerald-50 text-emerald-600' : darkMode ? 'border-slate-700 bg-slate-800 text-slate-400' : 'border-slate-200 bg-white text-slate-500'}`}>
                      {productoForm.icono === key && <span className="absolute -top-1 -right-1 w-3 h-3 bg-emerald-500 rounded-full flex items-center justify-center"><Check className="w-2 h-2 text-white" /></span>}
                      <Component className="w-4 h-4" />
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap gap-2 items-center">
                  {COLOR_PALETTE.map((color) => (
                    <button key={color} type="button" onClick={() => setProductoForm(s => ({ ...s, color }))} className={`relative w-7 h-7 rounded-full transition-all hover:scale-110 flex items-center justify-center ${productoForm.color === color ? 'ring-2 ring-offset-2 ring-slate-400' : ''}`} style={{ backgroundColor: color }}>
                      {productoForm.color === color && <Check className={`w-3 h-3 ${isColorLight(color) ? 'text-slate-900' : 'text-white'}`} />}
                    </button>
                  ))}
                  <label className="cursor-pointer"><input type="color" className="sr-only" value={productoForm.color} onChange={e => setProductoForm(s => ({ ...s, color: e.target.value }))} /><span className={`w-7 h-7 rounded-full border-2 border-dashed flex items-center justify-center hover:scale-110 transition ${darkMode ? 'border-slate-600 bg-slate-800 text-slate-400' : 'border-slate-300 bg-white text-slate-400'}`}><Plus className="w-3.5 h-3.5" /></span></label>
                </div>
                {productoForm.tipoInventario === 'receta' && (
                  <div className="rounded-xl border border-dashed border-slate-300 p-4 bg-slate-50 space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="font-semibold text-sm">Ingredientes de la receta</p>
                      <Button type="button" variant="outline" size="sm" onClick={agregarLineaReceta}>+ Ingrediente</Button>
                    </div>
                    {productoRecetaLineas.map((linea, index) => (
                      <div key={`${linea.ingredientId}-${index}`} className="grid gap-2 md:grid-cols-4 items-end">
                        <select className="h-11 rounded-xl border px-3 bg-transparent text-sm" value={linea.ingredientId} onChange={(e) => actualizarLineaReceta(index, 'ingredientId', e.target.value)}>
                          <option value="">Ingrediente</option>
                          {ingredientes.map((ing) => <option key={ing.id} value={ing.id}>{ing.nombre}</option>)}
                        </select>
                        <Input className="h-11" placeholder="Cantidad" value={linea.cantidad} onChange={(e) => actualizarLineaReceta(index, 'cantidad', e.target.value)} />
                        <Input className="h-11" placeholder="Unidad" value={linea.unidad} onChange={(e) => actualizarLineaReceta(index, 'unidad', e.target.value)} />
                        <Button type="button" variant="secondary" className="h-11" onClick={() => quitarLineaReceta(index)}>Quitar</Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          {/* ── Cuenta Activa ── */}
          <div className={`rounded-2xl border p-4 space-y-3 ${darkMode ? 'border-white/10 bg-white/5' : 'border-amber-100 bg-amber-50'}`}>
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <p className="font-black text-base">
                      {mesaSeleccionada ? `Mesa: ${mesaSeleccionada.nombre}` : 'Carrito auxiliar'}
                    </p>
                    <div className="flex items-center gap-2">
                      <span className={`rounded-full px-3 py-1 text-xs font-bold border ${darkMode ? 'bg-white/10 border-white/15 text-white' : 'bg-white border-amber-200 text-slate-700'}`}>
                        {totalItemsCuentaActiva} ítems
                      </span>
                      <span className={`rounded-full px-3 py-1 text-xs font-bold border ${darkMode ? 'bg-amber-500/20 border-amber-500/30 text-amber-300' : 'bg-white border-amber-200 text-amber-700'}`}>
                        ${totalCuentaActiva.toLocaleString('es-CO')}
                      </span>
                    </div>
                  </div>

                  {cuentaActivaActual.length > 0 ? (
                    <div className="max-h-[320px] overflow-y-auto scrollbar-thin space-y-1 pr-1">
                      {cuentaActivaActual.map((it) => (
                        <div key={it.producto.id} className={`flex items-center justify-between rounded-xl px-3 py-2 border ${darkMode ? 'bg-white/5 border-white/10' : 'bg-white border-amber-100'}`}>
                          <span className={`text-sm font-semibold truncate flex-1 mr-2 ${darkMode ? 'text-white' : 'text-slate-800'}`}>{it.producto.nombre}</span>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${darkMode ? 'bg-white/10 text-white' : 'bg-amber-100 text-slate-600'}`}>×{it.cantidad}</span>
                            <span className={`text-xs font-bold ${darkMode ? 'text-amber-300' : 'text-amber-700'}`}>${(it.producto.precio * it.cantidad).toLocaleString('es-CO')}</span>
                            <button type="button" onClick={() => handleRemoveFromQuickCart(it.producto.id)} className="p-1 rounded-full text-rose-400 hover:text-rose-600 hover:bg-rose-50 transition-colors">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className={`rounded-2xl border border-dashed py-8 text-center ${darkMode ? 'border-white/15 text-slate-400' : 'border-amber-200 text-slate-400'}`}>
                      <ShoppingCart className="w-8 h-8 mx-auto mb-2 opacity-40" />
                      <p className="text-sm font-medium">Toca un producto para agregarlo a la cuenta</p>
                    </div>
                  )}

                  {cuentaActivaActual.length > 0 && (
                    <div className="flex gap-2">
                      <Button className="flex-1 h-11 bg-amber-600 hover:bg-amber-700 font-bold text-white shadow-lg" onClick={() => abrirMesaEnPOS(mesaSeleccionada)}>
                        Pagar en POS — ${totalCuentaActiva.toLocaleString('es-CO')}
                      </Button>
                      {!mesaSeleccionada && mesas.length > 0 && (
                        <div className="relative">
                          <Button
                            className={`h-11 px-4 font-bold text-white shadow-lg ${darkMode ? 'bg-emerald-700 hover:bg-emerald-600' : 'bg-emerald-600 hover:bg-emerald-700'}`}
                            onClick={() => setShowAgregarMesaDropdown(v => !v)}
                          >
                            Agregar a Mesa <ChevronDown className="w-4 h-4 ml-1 inline-block" />
                          </Button>
                          {showAgregarMesaDropdown && (
                            <div className={`absolute right-0 bottom-12 z-50 rounded-2xl border shadow-2xl py-2 min-w-[160px] ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
                              {mesas.map((m) => (
                                <button
                                  key={m.id}
                                  type="button"
                                  onClick={() => { transferirCarritoAuxiliarAMesa(m.id, m.nombre); abrirModalMesa(m); }}
                                  className={`w-full text-left px-4 py-2.5 text-sm font-semibold flex items-center gap-2 transition-colors ${darkMode ? 'text-slate-200 hover:bg-slate-700' : 'text-slate-800 hover:bg-amber-50'}`}
                                >
                                  <Armchair className="w-4 h-4 opacity-60 flex-shrink-0" />
                                  {m.nombre}
                                  {totalMesa(m.id) > 0 && (
                                    <span className="ml-auto text-xs font-bold text-emerald-600">${totalMesa(m.id).toLocaleString('es-CO')}</span>
                                  )}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
          </div>
        );

      // ── Mesas ─────────────────────────────────────────────────────────────────
      case 'mesas':
        return (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>Toca una mesa para gestionar su pedido</p>
              <div className="flex gap-2">
                <Button onClick={descargarPlantillaIngredientesExcel} variant="outline" className="h-10 px-4 text-sm font-semibold"><Download className="w-4 h-4 mr-1.5" />Plantilla Excel</Button>
                <label className="inline-flex items-center gap-2 h-10 px-4 rounded-xl border cursor-pointer text-sm font-semibold hover:bg-slate-50 transition">
                  <Upload className="w-4 h-4" />Cargar Excel
                  <input type="file" accept=".xlsx,.xls" className="hidden" onChange={async (e) => { const file = e.target.files?.[0]; if (file) await cargarIngredientesDesdeExcel(file); e.currentTarget.value = ''; }} />
                </label>
              </div>
            </div>

            <div className="max-h-[280px] overflow-y-auto scrollbar-thin pr-1">
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 pb-2">
                {mesas.map((m) => (
                  <button key={m.id} type="button" onClick={() => abrirModalMesa(m)}
                    className={`relative rounded-2xl border-2 p-3 flex flex-col items-center justify-center gap-1.5 text-center transition-all shadow-sm hover:-translate-y-0.5 ${m.activa ? (darkMode ? 'border-emerald-500/50 bg-emerald-900/20' : 'border-emerald-200 bg-emerald-50') : (darkMode ? 'border-slate-600 bg-slate-800/70' : 'border-slate-200 bg-slate-100')}`}
                  >
                    <Armchair className={`w-9 h-9 ${m.activa ? 'text-emerald-500' : darkMode ? 'text-slate-400' : 'text-slate-500'}`} />
                    <span className="text-sm font-black leading-tight">{m.nombre}</span>
                    {totalMesa(m.id) > 0 && (
                      <span className="text-xs font-bold text-emerald-600 bg-emerald-100 px-2 py-0.5 rounded-full">${totalMesa(m.id).toLocaleString('es-CO')}</span>
                    )}
                  </button>
                ))}
                <Button onClick={agregarMesa} className="rounded-2xl text-sm font-black flex flex-col gap-1.5 bg-gradient-to-br from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white shadow-lg min-h-[100px]">
                  <Plus className="w-8 h-8" />Nueva Mesa
                </Button>
              </div>
            </div>

            {mesas.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-1">
                <span className={`text-xs font-semibold self-center ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Eliminar:</span>
                {mesas.map((m) => (
                  <Button key={`quitar-${m.id}`} variant="outline" className="h-8 text-xs px-3" onClick={() => quitarMesa(m.id)}>
                    {m.nombre} ×
                  </Button>
                ))}
              </div>
            )}

            {/* Combos disponibles para agregar rápidamente a una mesa */}
            {combos.length > 0 && (
              <div className={`rounded-2xl border p-4 space-y-3 ${darkMode ? 'border-yellow-900/40 bg-yellow-950/10' : 'border-amber-200 bg-amber-50'}`}>
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-amber-600" />
                  <p className="font-black text-sm text-amber-700 dark:text-amber-400">
                    Combos disponibles
                    {mesaSeleccionada ? ` — agregando a ${mesaSeleccionada.nombre}` : ' — selecciona una mesa primero o usa carrito auxiliar'}
                  </p>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                  {combos.map((c: ComboOncesItem) => (
                    <button key={c.id} type="button" onClick={() => toqueRapidoCombo(c)}
                      className={`rounded-2xl border-2 p-3 text-left transition-all hover:-translate-y-0.5 active:scale-95 ${darkMode ? 'border-amber-700/50 bg-amber-900/20 hover:bg-amber-900/40' : 'border-amber-200 bg-white hover:border-amber-400 hover:bg-amber-50'}`}>
                      <p className={`text-sm font-black leading-tight truncate ${darkMode ? 'text-white' : 'text-slate-800'}`}>{c.nombre}</p>
                      <p className="text-xs font-bold text-emerald-600 mt-1">${Number(c.precio || 0).toLocaleString('es-CO')}</p>
                      {c.codigo && <p className={`text-[10px] mt-0.5 ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>{c.codigo}</p>}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        );

      // ── Ingredientes ──────────────────────────────────────────────────────────
      case 'ingredientes':
        return (
          <div className="max-h-[540px] overflow-y-auto scrollbar-thin scrollbar-thumb-gray-300 pr-2 space-y-4">
            <div className={`rounded-2xl border p-4 space-y-3 ${darkMode ? 'border-slate-700 bg-slate-800/40' : 'border-slate-200 bg-slate-50'}`}>
              <h4 className="font-black text-base">Nuevo ingrediente</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
                <div className="space-y-1"><p className="text-xs font-bold text-slate-500">Nombre</p><Input className="h-12 text-sm" placeholder="Harina de trigo" value={nuevoIngrediente.nombre} onChange={e => setNuevoIngrediente(s => ({ ...s, nombre: e.target.value }))} /></div>
                <div className="space-y-1"><p className="text-xs font-bold text-slate-500">Unidad</p><Input className="h-12 text-sm" placeholder="g, ml, und" value={nuevoIngrediente.unidad} onChange={e => setNuevoIngrediente(s => ({ ...s, unidad: e.target.value }))} /></div>
                <div className="space-y-1"><p className="text-xs font-bold text-slate-500">Stock actual</p><Input className="h-12 text-sm" placeholder="0" value={nuevoIngrediente.stockActual} onChange={e => setNuevoIngrediente(s => ({ ...s, stockActual: e.target.value }))} /></div>
                <div className="space-y-1"><p className="text-xs font-bold text-slate-500">Stock mínimo</p><Input className="h-12 text-sm" placeholder="0" value={nuevoIngrediente.stockMinimo} onChange={e => setNuevoIngrediente(s => ({ ...s, stockMinimo: e.target.value }))} /></div>
                <div className="space-y-1"><p className="text-xs font-bold text-slate-500">Costo unitario</p><Input className="h-12 text-sm" placeholder="0" value={nuevoIngrediente.costoUnitario} onChange={e => setNuevoIngrediente(s => ({ ...s, costoUnitario: e.target.value }))} /></div>
              </div>
              <Button onClick={guardarIngrediente} className="h-11 px-6 bg-emerald-600 hover:bg-emerald-700 font-bold"><Plus className="w-4 h-4 mr-2" />Guardar ingrediente</Button>
            </div>

            <div className="rounded-2xl border overflow-hidden">
              <table className="w-full text-sm">
                <thead className={`${darkMode ? 'bg-slate-800' : 'bg-slate-100'}`}>
                  <tr><th className="p-2.5 text-left font-bold">Ingrediente</th><th className="p-2.5 text-left font-bold">Unidad</th><th className="p-2.5 text-left font-bold">Stock</th><th className="p-2.5 text-left font-bold">Mínimo</th></tr>
                </thead>
                <tbody>
                  {ingredientes.length === 0 ? (
                    <tr><td colSpan={4} className={`p-6 text-center text-sm ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>Sin ingredientes registrados</td></tr>
                  ) : ingredientes.map(i => (
                    <tr key={i.id} className={`border-t ${darkMode ? 'border-slate-700 hover:bg-slate-800/50' : 'border-slate-100 hover:bg-slate-50'}`}>
                      <td className="p-2.5">{i.nombre}</td>
                      <td className="p-2.5">{i.unidad}</td>
                      <td className={`p-2.5 font-semibold ${Number(i.stockActual) <= Number(i.stockMinimo) ? 'text-rose-500' : ''}`}>{i.stockActual}</td>
                      <td className="p-2.5">{i.stockMinimo}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className={`rounded-2xl border p-4 space-y-3 ${darkMode ? 'border-slate-700 bg-slate-800/40' : 'border-slate-200 bg-slate-50'}`}>
              <h4 className="font-black text-base">Registrar merma</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="space-y-1 lg:col-span-2"><p className="text-xs font-bold text-slate-500">Ingrediente</p><select className="h-12 w-full rounded-xl border px-3 bg-transparent text-sm" value={nuevaMerma.ingredientId} onChange={e => setNuevaMerma(s => ({ ...s, ingredientId: e.target.value }))}><option value="">Selecciona el ingrediente</option>{ingredientes.map(i => <option key={i.id} value={i.id}>{i.nombre}</option>)}</select></div>
                <div className="space-y-1"><p className="text-xs font-bold text-slate-500">Cantidad</p><Input className="h-12 text-sm" placeholder="0" value={nuevaMerma.cantidad} onChange={e => setNuevaMerma(s => ({ ...s, cantidad: e.target.value }))} /></div>
                <div className="space-y-1"><p className="text-xs font-bold text-slate-500">Unidad</p><Input className="h-12 text-sm" placeholder="g, ml, und" value={nuevaMerma.unidad} onChange={e => setNuevaMerma(s => ({ ...s, unidad: e.target.value }))} /></div>
              </div>
              <div className="space-y-1"><p className="text-xs font-bold text-slate-500">Motivo</p><Input className="h-12 text-sm" placeholder="Ej: Producto vencido" value={nuevaMerma.motivo} onChange={e => setNuevaMerma(s => ({ ...s, motivo: e.target.value }))} /></div>
              <Button onClick={registrarMerma} className="h-11 px-6 bg-rose-600 hover:bg-rose-700 font-bold"><Trash2 className="w-4 h-4 mr-2" />Registrar merma</Button>
            </div>
          </div>
        );

      // ── Recetas ───────────────────────────────────────────────────────────────
      case 'recetas':
        return (
          <div className="max-h-[540px] overflow-y-auto scrollbar-thin scrollbar-thumb-sky-200 pr-2 space-y-4">
            <div className={`rounded-2xl border p-4 ${darkMode ? 'border-slate-700 bg-slate-800/40' : 'border-slate-200 bg-slate-50'}`}>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <select className="h-12 rounded-xl border px-3 bg-transparent text-sm" value={productoRecetaId} onChange={e => setProductoRecetaId(e.target.value)}>
                  <option value="">Producto final</option>
                  {productos.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                </select>
                <Input className="h-12" placeholder="Nombre de receta" value={nombreReceta} onChange={e => setNombreReceta(e.target.value)} />
                <Button onClick={guardarReceta} className="h-12 bg-sky-600 hover:bg-sky-700 font-bold"><Save className="w-4 h-4 mr-2" />Guardar receta</Button>
              </div>
            </div>
            {lineasReceta.map((l, idx) => (
              <div key={idx} className={`grid grid-cols-1 md:grid-cols-4 gap-3 rounded-2xl border p-3 ${darkMode ? 'border-slate-700 bg-slate-800/30' : 'border-slate-200 bg-white'}`}>
                <select className="h-12 rounded-xl border px-3 bg-transparent text-sm" value={l.ingredientId} onChange={e => setLineasReceta(prev => prev.map((x, i) => i === idx ? { ...x, ingredientId: e.target.value } : x))}><option value="">Ingrediente</option>{ingredientes.map(i => <option key={i.id} value={i.id}>{i.nombre}</option>)}</select>
                <Input className="h-12" placeholder="Cantidad" value={l.cantidad} onChange={e => setLineasReceta(prev => prev.map((x, i) => i === idx ? { ...x, cantidad: e.target.value } : x))} />
                <Input className="h-12" placeholder="Unidad" value={l.unidad} onChange={e => setLineasReceta(prev => prev.map((x, i) => i === idx ? { ...x, unidad: e.target.value } : x))} />
                <Button variant="outline" className="h-12" onClick={() => setLineasReceta(prev => prev.filter((_, i) => i !== idx))}>Quitar</Button>
              </div>
            ))}
            <Button variant="outline" className="h-11" onClick={() => setLineasReceta(prev => [...prev, { ingredientId: '', cantidad: '', unidad: 'g' }])}><Plus className="w-4 h-4 mr-2" />Agregar línea</Button>

            <div className={`rounded-2xl border p-4 ${darkMode ? 'border-slate-700 bg-slate-800/30' : 'border-slate-200 bg-white'}`}>
              <h4 className="font-black text-sm mb-3">Recetas creadas</h4>
              <div className="space-y-2 text-sm">
                {recetaResumen.length === 0 ? <p className={`text-sm ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>Sin recetas aún</p> : recetaResumen.map(r => (
                  <div key={r.id} className={`rounded-xl border p-3 ${darkMode ? 'border-slate-700' : 'border-slate-200'}`}>
                    <p className="font-bold">{r.nombre}</p>
                    <p className={`text-xs mt-0.5 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Producto: {(productos.find(p => p.id === r.productoId)?.nombre) || r.productoId}</p>
                    <ul className="list-disc pl-4 mt-1.5 space-y-0.5">
                      {r.insumos.map((ri: any) => <li key={ri.id} className="text-xs">{ri.nombreIngrediente}: {ri.cantidad} {ri.unidad}</li>)}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );

      // ── Mermas ────────────────────────────────────────────────────────────────
      case 'mermas':
        return (
          <div className="max-h-[540px] overflow-y-auto scrollbar-thin scrollbar-thumb-rose-200 pr-2">
            <div className="rounded-2xl border overflow-hidden">
              <table className="w-full text-sm">
                <thead className={`${darkMode ? 'bg-slate-800' : 'bg-slate-100'}`}>
                  <tr>
                    <th className="p-2.5 text-left font-bold">Fecha</th>
                    <th className="p-2.5 text-left font-bold">Ingrediente</th>
                    <th className="p-2.5 text-left font-bold">Cantidad</th>
                    <th className="p-2.5 text-left font-bold">Motivo</th>
                  </tr>
                </thead>
                <tbody>
                  {mermas.length === 0 ? (
                    <tr><td colSpan={4} className={`p-6 text-center text-sm ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>Sin mermas registradas</td></tr>
                  ) : mermas.map((m: any) => (
                    <tr key={m.id} className={`border-t ${darkMode ? 'border-slate-700 hover:bg-slate-800/50' : 'border-slate-100 hover:bg-slate-50'}`}>
                      <td className="p-2.5">{new Date(m.fecha).toLocaleString('es-CO')}</td>
                      <td className="p-2.5">{ingredientes.find(i => i.id === m.ingredientId)?.nombre || m.ingredientId}</td>
                      <td className="p-2.5">{m.cantidad} {m.unidad}</td>
                      <td className="p-2.5">{m.motivo || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );

      // ── Combos ────────────────────────────────────────────────────────────────
      case 'combos':
        return (
          <div className="max-h-[540px] overflow-y-auto scrollbar-thin scrollbar-thumb-amber-200 pr-2 space-y-4">
            <div className={`rounded-2xl border p-4 space-y-3 ${darkMode ? 'border-slate-700 bg-slate-800/40' : 'border-slate-200 bg-slate-50'}`}>
              <div className="flex items-center justify-between gap-2">
                <h4 className="font-black text-sm">{comboEditando ? `Editando: ${comboEditando.nombre}` : 'Nuevo combo'}</h4>
                {comboEditando && (
                  <Button variant="outline" className="h-8 text-xs px-3" onClick={() => { setComboEditando(null); setComboForm({ nombre: '', codigo: '', keyword: '', precio: '' }); setLineasCombo([{ tipo: 'producto', refId: '', cantidad: '1', unidad: 'und' }]); }}>
                    Cancelar edición
                  </Button>
                )}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <Input className="h-12" placeholder="Nombre combo" value={comboForm.nombre} onChange={e => setComboForm(s => ({ ...s, nombre: e.target.value }))} />
                <Input className="h-12" placeholder="Código (ej: DESA01)" value={comboForm.codigo} onChange={e => setComboForm(s => ({ ...s, codigo: e.target.value }))} />
                <Input className="h-12" placeholder="Keyword (ej: desayuno)" value={comboForm.keyword} onChange={e => setComboForm(s => ({ ...s, keyword: e.target.value }))} />
                <Input className="h-12" placeholder="Precio" value={comboForm.precio} onChange={e => setComboForm(s => ({ ...s, precio: e.target.value }))} />
              </div>
            </div>

            <div className="space-y-2">
              {lineasCombo.map((l, idx) => (
                <div key={idx} className={`grid grid-cols-1 md:grid-cols-5 gap-3 rounded-2xl border p-3 ${darkMode ? 'border-slate-700 bg-slate-800/30' : 'border-slate-200 bg-white'}`}>
                  <select className="h-12 rounded-xl border px-3 bg-transparent text-sm" value={l.tipo} onChange={e => setLineasCombo(prev => prev.map((x, i) => i === idx ? { ...x, tipo: e.target.value as any, refId: '' } : x))}><option value="producto">Producto</option><option value="ingrediente">Ingrediente</option></select>
                  <select className="h-12 rounded-xl border px-3 bg-transparent text-sm" value={l.refId} onChange={e => setLineasCombo(prev => prev.map((x, i) => i === idx ? { ...x, refId: e.target.value } : x))}><option value="">Selecciona</option>{(l.tipo === 'producto' ? productos : ingredientes).map((x: any) => <option key={x.id} value={x.id}>{x.nombre}</option>)}</select>
                  <Input className="h-12" placeholder="Cantidad" value={l.cantidad} onChange={e => setLineasCombo(prev => prev.map((x, i) => i === idx ? { ...x, cantidad: e.target.value } : x))} />
                  <Input className="h-12" placeholder="Unidad" value={l.unidad} onChange={e => setLineasCombo(prev => prev.map((x, i) => i === idx ? { ...x, unidad: e.target.value } : x))} />
                  <Button variant="outline" className="h-12" onClick={() => setLineasCombo(prev => prev.filter((_, i) => i !== idx))}>Quitar</Button>
                </div>
              ))}
              <div className="flex gap-2">
                <Button variant="outline" className="h-12" onClick={() => setLineasCombo(prev => [...prev, { tipo: 'producto', refId: '', cantidad: '1', unidad: 'und' }])}><Plus className="w-4 h-4 mr-2" />Componente</Button>
                <Button className={`h-12 font-bold ${comboEditando ? 'bg-blue-600 hover:bg-blue-700' : 'bg-amber-600 hover:bg-amber-700'}`} onClick={guardarCombo}>
                  <Save className="w-4 h-4 mr-2" />{comboEditando ? 'Actualizar combo' : 'Guardar combo'}
                </Button>
              </div>
            </div>

            <div className={`rounded-2xl border p-4 ${darkMode ? 'border-slate-700 bg-slate-800/30' : 'border-slate-200 bg-white'}`}>
              <h4 className="font-black text-sm mb-3">Combos creados ({combos.length})</h4>
              <div className="space-y-2 text-sm">
                {combos.length === 0 ? <p className={`text-sm ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>Sin combos aún</p> : combos.map((c: any) => (
                  <div key={c.id} className={`rounded-xl border p-3 ${comboEditando?.id === c.id ? (darkMode ? 'border-blue-500/60 bg-blue-900/20' : 'border-blue-300 bg-blue-50') : (darkMode ? 'border-slate-700' : 'border-slate-200')}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="font-bold truncate">{c.nombre} · <span className="text-emerald-600">${Number(c.precio || 0).toLocaleString('es-CO')}</span></p>
                        <p className={`text-xs mt-0.5 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Código: {c.codigo || '-'} · Keyword: {c.keyword || '-'}</p>
                        <ul className="list-disc pl-4 mt-1.5 space-y-0.5">
                          {(c.componentes || []).map((cp: any, i: number) => <li key={`${c.id}-${i}`} className="text-xs">{cp.nombre} ({cp.tipo}) · {cp.cantidad} {cp.unidad || ''}</li>)}
                        </ul>
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <button type="button" title="Editar combo" onClick={() => abrirEdicionCombo(c)}
                          className={`p-1.5 rounded-lg transition-colors ${darkMode ? 'text-blue-400 hover:bg-blue-900/40' : 'text-blue-600 hover:bg-blue-50'}`}>
                          <Edit className="w-4 h-4" />
                        </button>
                        <button type="button" title="Eliminar combo" onClick={() => eliminarCombo(c.id)}
                          className={`p-1.5 rounded-lg transition-colors ${darkMode ? 'text-rose-400 hover:bg-rose-900/40' : 'text-rose-600 hover:bg-rose-50'}`}>
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  // ── JSX principal ─────────────────────────────────────────────────────────────
  return (
    <div className={`h-full overflow-y-auto p-5 ${darkMode ? 'bg-transparent text-white' : 'bg-slate-50 text-slate-900'}`}>
      <div className="max-w-5xl mx-auto space-y-4">

        {/* Header premium */}
        <div className={`rounded-3xl p-5 bg-gradient-to-r from-amber-600 via-orange-600 to-rose-600 shadow-2xl`}>
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-white/15 backdrop-blur-sm flex items-center justify-center shadow-lg flex-shrink-0">
                <Coffee className="w-7 h-7 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-black text-white tracking-tight">Alimentos y Bebidas</h1>
                <p className="text-white/70 text-sm">Gestiona tus categorias y productos desde aqui</p>
              </div>
            </div>
            <div className="flex items-center gap-3 flex-shrink-0">
              <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold ${moduloPanaderiaOncesActivo ? 'bg-emerald-500/20 text-emerald-200 border border-emerald-400/30' : 'bg-rose-500/20 text-rose-200 border border-rose-400/30'}`}>
                <span className={`w-2 h-2 rounded-full ${moduloPanaderiaOncesActivo ? 'bg-emerald-400' : 'bg-rose-400'}`} />
                {moduloPanaderiaOncesActivo ? 'Activo' : 'Inactivo'}
              </div>
              <p className="text-white/50 text-xs hidden md:block">Arrastra las secciones para reorganizar</p>
            </div>
          </div>
        </div>

        {/* Secciones draggables */}
        <div className="space-y-3">
          {sectionOrder.map((id) => {
            const config = SECTION_CONFIG[id];
            return (
              <SectionShell
                key={id}
                id={id}
                label={config.label}
                icon={config.icon}
                gradient={config.gradient}
                isDragging={dragSectionId === id}
                isDragOver={dragOverSectionId === id}
                isCollapsed={!!collapsed[id]}
                onDragStart={(e) => handleSectionDragStart(e, id)}
                onDragOver={(e) => handleSectionDragOver(e, id)}
                onDrop={() => handleSectionDrop(id)}
                onDragEnd={handleSectionDragEnd}
                onToggle={() => toggleCollapse(id)}
                darkMode={darkMode}
              >
                {renderSectionContent(id)}
              </SectionShell>
            );
          })}
        </div>
      </div>

      {/* Modal de mesa */}
      {mesaSeleccionada && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className={`w-full max-w-2xl rounded-3xl border p-5 space-y-4 shadow-2xl ${darkMode ? 'border-slate-700 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-900'}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
                  <Armchair className="w-5 h-5 text-white" />
                </div>
                <h3 className="text-lg font-black">Pedido · {mesaSeleccionada.nombre}</h3>
              </div>
              <Button variant="outline" onClick={cerrarModalMesa} className="h-9">Cerrar</Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <select className="h-11 rounded-xl border px-3 bg-transparent text-sm" value={productoMesaId} onChange={(e) => setProductoMesaId(e.target.value)}>
                <option value="">Selecciona producto</option>
                {productos.map((p: any) => <option key={p.id} value={p.id}>{p.nombre} · ${Number(p.precio || 0).toLocaleString('es-CO')}</option>)}
              </select>
              <Input className="h-11" placeholder="Cantidad" value={cantidadMesa} onChange={(e) => setCantidadMesa(e.target.value)} />
              <Button className="h-11 bg-emerald-600 hover:bg-emerald-700 font-bold" onClick={agregarItemMesa}><Plus className="w-4 h-4 mr-2" />Agregar</Button>
            </div>

            {/* Combos rápidos en el modal */}
            {combos.length > 0 && (
              <div className={`rounded-2xl border p-3 space-y-2 ${darkMode ? 'border-amber-900/40 bg-amber-950/10' : 'border-amber-200 bg-amber-50'}`}>
                <p className="text-xs font-bold text-amber-700 flex items-center gap-1.5"><TrendingUp className="w-3.5 h-3.5" />Combos — toca para agregar</p>
                <div className="flex flex-wrap gap-2">
                  {combos.map((c: ComboOncesItem) => (
                    <button key={c.id} type="button" onClick={() => toqueRapidoCombo(c)}
                      className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold transition-all hover:scale-105 active:scale-95 ${darkMode ? 'border-amber-700/50 bg-amber-900/20 text-white hover:bg-amber-900/50' : 'border-amber-300 bg-white text-slate-800 hover:border-amber-500 hover:bg-amber-100'}`}>
                      <span className="font-black">{c.nombre}</span>
                      <span className="text-emerald-600 font-bold">${Number(c.precio || 0).toLocaleString('es-CO')}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="rounded-2xl border overflow-hidden">
              <table className="w-full text-sm">
                <thead className={`${darkMode ? 'bg-slate-800' : 'bg-slate-100'}`}>
                  <tr>
                    <th className="p-2.5 text-left font-bold">Producto</th>
                    <th className="p-2.5 text-left font-bold">Cant.</th>
                    <th className="p-2.5 text-left font-bold">Unitario</th>
                    <th className="p-2.5 text-left font-bold">Subtotal</th>
                    <th className="p-2.5 text-left font-bold">Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {(cuentasMesas[mesaSeleccionada.id] || []).length === 0 ? (
                    <tr><td colSpan={5} className="p-4 text-center text-sm text-slate-400">Sin productos en esta mesa</td></tr>
                  ) : (cuentasMesas[mesaSeleccionada.id] || []).map((it) => (
                    <tr key={it.producto.id} className={`border-t ${darkMode ? 'border-slate-700' : 'border-slate-100'}`}>
                      <td className="p-2.5">{it.producto.nombre}</td>
                      <td className="p-2.5">{it.cantidad}</td>
                      <td className="p-2.5">${Number(it.producto.precio || 0).toLocaleString('es-CO')}</td>
                      <td className="p-2.5 font-semibold">${(Number(it.producto.precio || 0) * Number(it.cantidad || 0)).toLocaleString('es-CO')}</td>
                      <td className="p-2.5"><Button variant="outline" className="h-8 text-xs px-3" onClick={() => quitarItemMesa(it.producto.id)}>Quitar</Button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between gap-3 pt-1">
              <p className="text-lg font-black">Total: <span className="text-emerald-600">${totalMesa(mesaSeleccionada.id).toLocaleString('es-CO')}</span></p>
              <Button className="h-11 bg-amber-600 hover:bg-amber-700 font-bold px-6" onClick={() => abrirMesaEnPOS(mesaSeleccionada)}>
                Facturar en POS
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
