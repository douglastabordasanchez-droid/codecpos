/**
 * ============================================
 * PÁGINA DE PRODUCTOS - CODEC POS v2.0
 * VERSIÓN COMPLETAMENTE REFACTORIZADA
 * 100% FUNCIONAL Y OPTIMIZADA
 * ============================================
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Package, Search, Upload, Plus, Edit, Trash2,
  AlertCircle, TrendingDown, AlertTriangle, FileSpreadsheet,
  X, Loader2, TrendingUp, FlaskConical, PackagePlus, RefreshCw,
  ShoppingBasket, BarChart2, ArrowUpCircle, CheckCircle2, Globe,
} from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Card, CardContent } from '../ui/card';
import { usePOS } from '../../contexts/POSContext';
import { toast } from 'sonner';
import { electronStore, IngredienteInventarioItem } from '../../lib/electronStore';
import { getCached } from '../../lib/cachedLocalStorage';
import { useDebounce } from '../../hooks/useDebounce';
import { ImportMasivaCSV } from './ImportMasivaCSV';
import { ModalNuevoProducto } from './ModalNuevoProducto';
import { EditProductModal } from './EditProductModal';
import { ModalMargenGanancia } from './ModalMargenGanancia';
import { useMultitienda } from '../../contexts/MultitiendaContext';
import { productosConStockDeTienda } from '../../lib/multitiendaService';
import { useAuth } from '../../contexts/AuthContext';
import { ModuloPOS, esModuloActivoGlobal } from '../../lib/permissions';
import { desactivarProductoEnNube, desactivarTodosLosProductosEnNube } from '../../lib/syncService';

interface Producto {
  id: string;
  codigo: string;
  nombre: string;
  precio: number;
  stock: number;
  minStock: number;
  categoria: string;
  categoriaId?: string;
  costo: number;
  fechaVencimiento?: string;
  tipoNegocio?: string;
  aplicaIVA?: boolean;
}

interface CategoriaGlobal {
  id: string;
  nombre: string;
  color: string;
}

export default function ProductosPage() {
  const { darkMode, triggerRefresh } = usePOS();
  const { tiendaActual, tiendas, cambiarTienda } = useMultitienda();
  const { usuarioActual } = useAuth();

  // Módulo panadería — reactivo al toggle local (codecpos_panaderia_onces_activo)
  // y al sistema global de permisos. Se actualiza cuando el usuario lo activa/desactiva.
  const [tienePanaderia, setTienePanaderia] = useState(() => {
    const globalActivo = esModuloActivoGlobal(ModuloPOS.PANADERIA_ONCES);
    const localRaw = localStorage.getItem('codecpos_panaderia_onces_activo');
    const localActivo = localRaw === null ? true : localRaw === 'true';
    return globalActivo && localActivo;
  });

  useEffect(() => {
    const sincronizar = () => {
      const globalActivo = esModuloActivoGlobal(ModuloPOS.PANADERIA_ONCES);
      const localRaw = localStorage.getItem('codecpos_panaderia_onces_activo');
      const localActivo = localRaw === null ? true : localRaw === 'true';
      setTienePanaderia(globalActivo && localActivo);
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'codecpos_panaderia_onces_activo' || e.key === null) sincronizar();
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);
  
  // ========== ESTADOS ==========
  const [productos, setProductos] = useState<Producto[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  // 🚀 FIX rendimiento: el input queda controlado por searchTerm (sin
  // retraso, para que se sienta instantáneo al escribir); el filtro pesado
  // sobre el catálogo completo usa el valor debounced.
  const debouncedSearchTerm = useDebounce(searchTerm, 200);
  const [loading, setLoading] = useState(true);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showNewProductModal, setShowNewProductModal] = useState(false);
  const [showDeleteAllModal, setShowDeleteAllModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [productToEdit, setProductToEdit] = useState<Producto | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showMargenModal, setShowMargenModal] = useState(false);
  const [categoriasGlobal, setCategoriasGlobal] = useState<CategoriaGlobal[]>([]);
  const [categoriaFiltro, setCategoriaFiltro] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'productos' | 'ingredientes'>('productos');
  const [ingredientes, setIngredientes] = useState<IngredienteInventarioItem[]>([]);
  const [searchIngrediente, setSearchIngrediente] = useState('');
  const [restockTarget, setRestockTarget] = useState<IngredienteInventarioItem | null>(null);
  const [restockAmount, setRestockAmount] = useState('');
  const [panaderiaCatIds, setPanaderiaCatIds] = useState<Set<string>>(new Set());

  console.log('✅ ProductosPage renderizado - Productos:', productos.length);

  // ========== CARGAR INGREDIENTES (compartido con módulo panadería) ==========
  useEffect(() => {
    const cargarIngredientes = async () => {
      const ings = await electronStore.obtenerIngredientesInventario();
      setIngredientes(ings);
    };
    cargarIngredientes();
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'pos-ingredientes-inventario') cargarIngredientes();
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  // ========== CARGAR PRODUCTOS ==========
  useEffect(() => {
    loadProductos();
  }, [tiendaActual?.id]);

  // Cargar categorías globales y categorías de panadería (para filtrado por módulo)
  useEffect(() => {
    const cargarCategorias = () => {
      try {
        const raw = localStorage.getItem('codecpos_categorias_global');
        if (raw) setCategoriasGlobal(JSON.parse(raw) as CategoriaGlobal[]);
      } catch { /* no-op */ }
      try {
        const rawPan = localStorage.getItem('codecpos_panaderia_cats');
        if (rawPan) {
          const panCats = JSON.parse(rawPan) as { id: string }[];
          setPanaderiaCatIds(new Set(panCats.map(c => c.id)));
        }
      } catch { /* no-op */ }
    };
    cargarCategorias();
    window.addEventListener('storage', cargarCategorias);
    return () => window.removeEventListener('storage', cargarCategorias);
  }, []);

  const loadProductos = () => {
    try {
      console.log('📥 Cargando productos desde localStorage...');
      setLoading(true);
      
      // Si hay una tienda activa diferente a la principal, usar su stock
      const productosConStock = tiendaActual
        ? productosConStockDeTienda(tiendaActual.id)
        : getCached<any[]>('pos-productos', []);

      console.log(`✅ ${productosConStock.length} productos cargados`);
      setProductos(productosConStock);
    } catch (error) {
      console.error('❌ Error cargando productos:', error);
      toast.error('Error al cargar productos');
      setProductos([]);
    } finally {
      setLoading(false);
    }
  };

  // ========== BASE FILTRADA POR MÓDULOS ACTIVOS ==========
  // Excluye productos que pertenecen a módulos desactivados globalmente.
  // Si panadería está inactiva, ningún producto de sus categorías debe ser visible.
  const productosBase = useMemo(() => {
    if (tienePanaderia || panaderiaCatIds.size === 0) return productos;
    return productos.filter(p => !panaderiaCatIds.has(p.categoriaId || ''));
  }, [productos, tienePanaderia, panaderiaCatIds]);

  const ITEMS_PER_PAGE = 50;
  const [currentPage, setCurrentPage] = useState(1);

  // ========== FILTRADO DE PRODUCTOS ==========
  const productosFiltrados = useMemo(() => {
    let lista = productosBase;

    // Filtro por categoría global (usa categoriaId si existe, o coincidencia por nombre)
    if (categoriaFiltro) {
      const catSeleccionada = categoriasGlobal.find(c => c.id === categoriaFiltro);
      lista = lista.filter(p =>
        p.categoriaId === categoriaFiltro ||
        (catSeleccionada && p.categoria.toLowerCase() === catSeleccionada.nombre.toLowerCase())
      );
    }

    if (!debouncedSearchTerm) return lista;
    const term = debouncedSearchTerm.toLowerCase();
    return lista.filter(p =>
      p.nombre.toLowerCase().includes(term) ||
      p.codigo.toLowerCase().includes(term) ||
      p.categoria.toLowerCase().includes(term)
    );
  }, [productosBase, debouncedSearchTerm, categoriaFiltro, categoriasGlobal]);

  // Resetear página cuando cambia el filtro
  useMemo(() => {
    setCurrentPage(1);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchTerm, categoriaFiltro]);

  const totalPages = Math.max(1, Math.ceil(productosFiltrados.length / ITEMS_PER_PAGE));
  const productosPaginados = useMemo(
    () => productosFiltrados.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE),
    [productosFiltrados, currentPage]
  );

  const goToPage = useCallback((page: number) => {
    setCurrentPage(Math.max(1, Math.min(page, totalPages)));
  }, [totalPages]);

  // ========== ESTADÍSTICAS (sobre productos visibles del negocio) ==========
  const stats = useMemo(() => {
    const stockBajo = productosBase.filter(p => p.stock <= p.minStock).length;
    const proximosVencer = productosBase.filter(p => {
      if (!p.fechaVencimiento) return false;
      const dias = Math.ceil((new Date(p.fechaVencimiento).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      return dias <= 7 && dias > 0;
    }).length;
    const vencidos = productosBase.filter(p => {
      if (!p.fechaVencimiento) return false;
      return new Date(p.fechaVencimiento) < new Date();
    }).length;

    return { stockBajo, proximosVencer, vencidos };
  }, [productosBase]);

  // ========== HELPERS ==========
  const getStockStatus = (stock: number, minStock: number) => {
    const porcentaje = (stock / minStock) * 100;
    if (porcentaje <= 50) return { color: 'red', label: 'Crítico', bg: 'bg-red-500' };
    if (porcentaje <= 100) return { color: 'yellow', label: 'Bajo', bg: 'bg-yellow-500' };
    return { color: 'green', label: 'Normal', bg: 'bg-green-500' };
  };

  const diasHastaVencimiento = (fecha?: string) => {
    if (!fecha) return null;
    const hoy = new Date();
    const vencimiento = new Date(fecha);
    const diff = Math.ceil((vencimiento.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24));
    return diff;
  };

  // ========== ACCIONES ==========
  const handleDeleteProduct = async (productoId: string) => {
    try {
      setDeletingId(productoId);
      console.log('🗑️ Eliminando producto:', productoId);

      const updated = productos.filter(p => p.id !== productoId);
      localStorage.setItem('pos-productos', JSON.stringify(updated));
      setProductos(updated);

      // 🛡️ FIX: esto solo tocaba localStorage — la fila en Supabase se
      // quedaba `activo:true` para siempre y la PWA (que lee directo de la
      // nube) seguía mostrando el producto "eliminado". Ver syncService.ts.
      desactivarProductoEnNube(productoId).catch(() => {});

      toast.success('✅ Producto eliminado');
      triggerRefresh();
    } catch (error) {
      console.error('❌ Error eliminando:', error);
      toast.error('Error al eliminar');
    } finally {
      setDeletingId(null);
    }
  };

  const handleDeleteAll = () => {
    try {
      console.log('🗑️ Eliminando todos los productos...');
      localStorage.removeItem('pos-productos');
      setProductos([]);
      setShowDeleteAllModal(false);

      // 🛡️ Mismo fix que arriba, para el vaciado masivo.
      desactivarTodosLosProductosEnNube().catch(() => {});

      toast.success('✅ Inventario vaciado');
      triggerRefresh();
    } catch (error) {
      console.error('❌ Error:', error);
      toast.error('Error al eliminar productos');
    }
  };

  const handleExport = () => {
    if (productosBase.length === 0) {
      toast.error('No hay productos para exportar');
      return;
    }

    try {
      console.log(`📤 Exportando ${productosBase.length} productos...`);
      
      let csv = 'Código;Nombre;Stock;Costo;Precio;Categoría;MinStock;FechaVencimiento\n';
      productosBase.forEach(p => {
        csv += `${p.codigo};${p.nombre};${p.stock};${p.costo};${p.precio};${p.categoria};${p.minStock || 10};${p.fechaVencimiento || ''}\n`;
      });

      const BOM = '\uFEFF';
      const blob = new Blob([BOM + csv], { type: 'text/csv;charset=utf-8;' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const fecha = new Date().toISOString().split('T')[0];
      a.download = `inventario_${fecha}.csv`;
      a.click();
      window.URL.revokeObjectURL(url);
      
      toast.success(`✅ ${productosBase.length} productos exportados`);
    } catch (error) {
      console.error('❌ Error exportando:', error);
      toast.error('Error al exportar');
    }
  };

  const handleEdit = (producto: Producto) => {
    setProductToEdit(producto);
    setShowEditModal(true);
  };

  const handleImportComplete = () => {
    setShowImportModal(false);
    loadProductos();
    triggerRefresh();
  };

  const handleProductCreated = () => {
    setShowNewProductModal(false);
    loadProductos();
    triggerRefresh();
  };

  const handleProductUpdated = () => {
    setShowEditModal(false);
    loadProductos();
    triggerRefresh();
  };

  // ========== HELPERS INGREDIENTES ==========
  const getIngredienteStatus = (ing: IngredienteInventarioItem) => {
    const actual = Number(ing.stockActual) || 0;
    const minimo = Number(ing.stockMinimo) || 0;
    if (actual <= 0) return { label: 'Agotado', colorBar: 'bg-red-600', colorText: 'text-red-600', pct: 0, urgente: true };
    if (minimo > 0 && actual <= minimo) return { label: 'Stock bajo', colorBar: 'bg-red-400', colorText: 'text-red-500', pct: Math.min(100, (actual / minimo) * 100), urgente: true };
    if (minimo > 0 && actual <= minimo * 1.5) return { label: 'Stock medio', colorBar: 'bg-amber-400', colorText: 'text-amber-600', pct: Math.min(100, (actual / (minimo * 1.5)) * 100), urgente: false };
    return { label: 'Normal', colorBar: 'bg-emerald-500', colorText: 'text-emerald-600', pct: 100, urgente: false };
  };

  const ingredientesFiltrados = useMemo(() => {
    if (!searchIngrediente) return ingredientes;
    const t = searchIngrediente.toLowerCase();
    return ingredientes.filter(i => i.nombre.toLowerCase().includes(t) || (i.categoria || '').toLowerCase().includes(t));
  }, [ingredientes, searchIngrediente]);

  const ingStats = useMemo(() => ({
    total: ingredientes.length,
    bajoStock: ingredientes.filter(i => Number(i.stockActual) <= Number(i.stockMinimo) && Number(i.stockMinimo) > 0).length,
    agotados: ingredientes.filter(i => Number(i.stockActual) <= 0).length,
  }), [ingredientes]);

  const handleRestock = async () => {
    if (!restockTarget) return;
    const cantidad = Number(restockAmount);
    if (isNaN(cantidad) || cantidad <= 0) { toast.error('Ingresa una cantidad válida'); return; }
    try {
      await electronStore.upsertIngrediente({
        ...restockTarget,
        stockActual: (Number(restockTarget.stockActual) || 0) + cantidad,
      });
      const ings = await electronStore.obtenerIngredientesInventario();
      setIngredientes(ings);
      toast.success(`+${cantidad} ${restockTarget.unidad} de ${restockTarget.nombre} agregados al inventario`);
      setRestockTarget(null);
      setRestockAmount('');
    } catch { toast.error('Error al actualizar el stock'); }
  };

  const handleToggleInventarioGeneral = async (ing: IngredienteInventarioItem) => {
    try {
      await electronStore.upsertIngrediente({ ...ing, enInventarioGeneral: !ing.enInventarioGeneral });
      const ings = await electronStore.obtenerIngredientesInventario();
      setIngredientes(ings);
      toast.success(ing.enInventarioGeneral
        ? `${ing.nombre} quitado del inventario general`
        : `${ing.nombre} agregado al inventario general`
      );
    } catch { toast.error('Error al actualizar el ingrediente'); }
  };

  // Categorías visibles según módulos activos — excluye las de panadería si está desactivado
  const categoriasVisibles = useMemo(() =>
    tienePanaderia
      ? categoriasGlobal
      : categoriasGlobal.filter(c => !panaderiaCatIds.has(c.id)),
    [categoriasGlobal, tienePanaderia, panaderiaCatIds]
  );

  // Ingredientes marcados para aparecer en inventario general
  const ingredientesEnGeneral = useMemo(() =>
    ingredientes.filter(i => i.enInventarioGeneral),
    [ingredientes]
  );

  // ========== PRODUCTOS CON ALERTA ==========
  const productosAlerta = useMemo(() => {
    return productosBase.filter(p => {
      const stockBajo = p.stock <= p.minStock;
      const dias = diasHastaVencimiento(p.fechaVencimiento);
      const vencimientoCerca = dias !== null && dias <= 7;
      return stockBajo || vencimientoCerca;
    });
  }, [productosBase]);

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-7xl mx-auto p-6 space-y-6">
        
        {/* ========== HEADER ========== */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className={`w-16 h-16 rounded-2xl flex items-center justify-center shadow-lg ${
              darkMode 
                ? 'bg-gradient-to-br from-blue-600 to-blue-700' 
                : 'bg-gradient-to-br from-blue-500 to-blue-600'
            }`}>
              <Package className="w-8 h-8 text-white" />
            </div>
            <div>
              <h1 className={`text-3xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                Gestión de Inventario
              </h1>
              <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                {productosBase.length} productos • {stats.stockBajo} alertas de stock
              </p>
            </div>
          </div>

          <div className="flex gap-3">
            <Button
              onClick={() => setShowMargenModal(true)}
              variant="outline"
              className={`rounded-2xl ${darkMode ? 'border-amber-600 text-amber-400' : 'border-amber-500 text-amber-600'}`}
            >
              <TrendingUp className="w-5 h-5 mr-2" />
              Ganancia
            </Button>

            <Button
              onClick={handleExport}
              variant="outline"
              className={`rounded-2xl ${darkMode ? 'border-emerald-600 text-emerald-400' : 'border-emerald-500 text-emerald-600'}`}
            >
              <FileSpreadsheet className="w-5 h-5 mr-2" />
              Exportar
            </Button>
            
            <Button
              onClick={() => setShowImportModal(true)}
              className="rounded-2xl bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700"
            >
              <Upload className="w-5 h-5 mr-2" />
              Importar
            </Button>
            
            <Button
              onClick={() => setShowNewProductModal(true)}
              className="rounded-2xl bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700"
            >
              <Plus className="w-5 h-5 mr-2" />
              Nuevo
            </Button>

            {productos.length > 0 && (
              <Button
                onClick={() => setShowDeleteAllModal(true)}
                variant="outline"
                className={`rounded-2xl ${
                  darkMode 
                    ? 'border-red-500/50 text-red-400 hover:bg-red-500/20' 
                    : 'border-red-300 text-red-500 hover:bg-red-50'
                }`}
              >
                <AlertTriangle className="w-5 h-5 mr-2" />
                Borrar Todo
              </Button>
            )}
          </div>
        </div>

        {/* ========== TABS ========== */}
        <div className={`flex gap-1 border-b ${darkMode ? 'border-slate-700' : 'border-gray-200'}`}>
          {([
            { id: 'productos' as const,    icon: Package,      label: 'Productos',    count: productosBase.length },
            ...(tienePanaderia ? [{ id: 'ingredientes' as const, icon: FlaskConical, label: 'Ingredientes', count: ingredientes.length, alert: ingStats.bajoStock + ingStats.agotados }] : []),
          ]).map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-5 py-2.5 font-semibold text-sm relative transition-colors ${
                activeTab === tab.id
                  ? darkMode ? 'text-blue-400' : 'text-blue-600'
                  : darkMode ? 'text-gray-500 hover:text-gray-300' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
              <span className={`px-1.5 py-0.5 rounded-full text-xs font-bold ${darkMode ? 'bg-slate-700 text-gray-300' : 'bg-gray-100 text-gray-600'}`}>
                {tab.count}
              </span>
              {'alert' in tab && tab.alert > 0 && (
                <span className="w-2 h-2 rounded-full bg-red-500 absolute top-2 right-1 animate-pulse" />
              )}
              {activeTab === tab.id && (
                <motion.div layoutId="invTab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-blue-500 to-blue-600" />
              )}
            </button>
          ))}
        </div>

        {/* ══════════════════════════════════════
            TAB: INGREDIENTES
        ══════════════════════════════════════ */}
        {activeTab === 'ingredientes' && (
          <>
            {/* Stats ingredientes */}
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: 'Total Ingredientes', value: ingStats.total, color: 'text-blue-500', icon: FlaskConical },
                { label: 'Stock Bajo',          value: ingStats.bajoStock, color: 'text-amber-500', icon: AlertTriangle },
                { label: 'Agotados',            value: ingStats.agotados, color: 'text-red-500', icon: AlertCircle },
              ].map(s => (
                <Card key={s.label} className={`border ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white'}`}>
                  <CardContent className="p-4 flex items-center justify-between">
                    <div>
                      <p className={`text-xs font-semibold ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>{s.label}</p>
                      <p className={`text-2xl font-black ${s.color}`}>{s.value}</p>
                    </div>
                    <s.icon className={`w-7 h-7 ${s.color} opacity-80`} />
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Barra de alertas críticas de ingredientes */}
            {(ingStats.bajoStock > 0 || ingStats.agotados > 0) && (
              <Card className={`border-2 border-red-500/50 ${darkMode ? 'bg-red-500/10' : 'bg-red-50'} rounded-3xl`}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <AlertCircle className="w-5 h-5 text-red-500 animate-pulse" />
                    <h3 className={`font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                      Ingredientes con stock crítico — hay que reabastecerlos
                    </h3>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {ingredientes
                      .filter(i => Number(i.stockActual) <= Number(i.stockMinimo) || Number(i.stockActual) <= 0)
                      .map(i => (
                        <button
                          key={i.id}
                          onClick={() => { setRestockTarget(i); setRestockAmount(''); }}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all border ${
                            Number(i.stockActual) <= 0
                              ? 'border-red-500 bg-red-500/10 text-red-500 hover:bg-red-500/20'
                              : 'border-amber-500 bg-amber-500/10 text-amber-600 hover:bg-amber-500/20'
                          }`}
                        >
                          <PackagePlus className="w-3.5 h-3.5" />
                          {i.nombre}
                          <span className="font-mono">
                            ({Number(i.stockActual).toLocaleString()} {i.unidad})
                          </span>
                        </button>
                      ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Buscador */}
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                value={searchIngrediente}
                onChange={e => setSearchIngrediente(e.target.value)}
                placeholder="Buscar ingrediente..."
                className={`pl-10 h-11 rounded-2xl ${darkMode ? 'bg-slate-800 border-slate-600 text-white' : 'bg-gray-50 border-gray-300'}`}
              />
              {searchIngrediente && (
                <button onClick={() => setSearchIngrediente('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Grid de ingredientes */}
            {ingredientesFiltrados.length === 0 ? (
              <Card className={`${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white'} rounded-3xl`}>
                <CardContent className="p-12 text-center">
                  <FlaskConical className={`w-14 h-14 mx-auto mb-4 ${darkMode ? 'text-gray-600' : 'text-gray-300'}`} />
                  <p className={`font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                    {ingredientes.length === 0 ? 'Sin ingredientes registrados' : 'Sin resultados'}
                  </p>
                  <p className={`text-sm mt-1 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                    Registra ingredientes desde el módulo de Panadería/Cafetería
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {ingredientesFiltrados.map(ing => {
                  const st = getIngredienteStatus(ing);
                  const actual = Number(ing.stockActual) || 0;
                  const minimo = Number(ing.stockMinimo) || 0;
                  return (
                    <Card
                      key={ing.id}
                      className={`border transition-shadow hover:shadow-md ${
                        st.urgente
                          ? darkMode ? 'bg-red-950/20 border-red-800/40' : 'bg-red-50/70 border-red-200'
                          : darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white'
                      }`}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex-1 min-w-0">
                            <p className={`font-bold text-sm truncate ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                              {ing.nombre}
                            </p>
                            {ing.categoria && (
                              <p className={`text-xs ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>{ing.categoria}</p>
                            )}
                          </div>
                          <span className={`ml-2 px-2 py-0.5 rounded-full text-xs font-bold flex-shrink-0 ${
                            st.urgente
                              ? 'bg-red-500/20 text-red-500'
                              : 'bg-emerald-500/20 text-emerald-600'
                          }`}>
                            {st.label}
                          </span>
                        </div>

                        {/* Stock actual vs mínimo */}
                        <div className="space-y-1.5 mb-3">
                          <div className="flex items-end justify-between">
                            <span className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>Stock actual</span>
                            <span className={`text-lg font-black font-mono ${st.colorText}`}>
                              {actual.toLocaleString()} <span className="text-xs font-normal">{ing.unidad}</span>
                            </span>
                          </div>
                          {minimo > 0 && (
                            <>
                              <div className={`h-2 rounded-full ${darkMode ? 'bg-slate-700' : 'bg-gray-200'}`}>
                                <div
                                  className={`h-full rounded-full transition-all ${st.colorBar}`}
                                  style={{ width: `${Math.max(2, Math.min(100, st.pct))}%` }}
                                />
                              </div>
                              <div className={`text-xs ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                                Mínimo: {minimo.toLocaleString()} {ing.unidad}
                                {actual > 0 && minimo > 0 && (
                                  <span className="ml-1">
                                    · {actual > minimo ? `${(actual / minimo).toFixed(1)}× el mínimo` : `falta ${(minimo - actual).toLocaleString()} ${ing.unidad}`}
                                  </span>
                                )}
                              </div>
                            </>
                          )}
                        </div>

                        {/* Costo unitario */}
                        {ing.costoUnitario != null && Number(ing.costoUnitario) > 0 && (
                          <p className={`text-xs mb-3 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                            Costo: ${Number(ing.costoUnitario).toFixed(4)} / {ing.unidad}
                            {' · '}Valor en stock: ${(actual * Number(ing.costoUnitario)).toLocaleString('es-CO')}
                          </p>
                        )}

                        {/* Acciones */}
                        <div className="flex gap-2">
                          <Button
                            onClick={() => { setRestockTarget(ing); setRestockAmount(''); }}
                            size="sm"
                            className={`flex-1 h-8 text-xs font-semibold rounded-xl ${
                              st.urgente
                                ? 'bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white'
                                : darkMode
                                ? 'bg-slate-700 hover:bg-slate-600 text-gray-200'
                                : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                            }`}
                          >
                            <PackagePlus className="w-3.5 h-3.5 mr-1" />
                            Stock
                          </Button>
                          <Button
                            onClick={() => handleToggleInventarioGeneral(ing)}
                            size="sm"
                            title={ing.enInventarioGeneral ? 'Quitar del inventario general' : 'Agregar al inventario general'}
                            className={`h-8 px-2.5 text-xs font-semibold rounded-xl transition-all ${
                              ing.enInventarioGeneral
                                ? 'bg-emerald-500 hover:bg-emerald-600 text-white'
                                : darkMode
                                ? 'bg-slate-700 hover:bg-emerald-600 text-gray-400 hover:text-white border border-slate-600 hover:border-emerald-500'
                                : 'bg-gray-100 hover:bg-emerald-100 text-gray-500 hover:text-emerald-700 border border-gray-300 hover:border-emerald-400'
                            }`}
                          >
                            {ing.enInventarioGeneral
                              ? <CheckCircle2 className="w-3.5 h-3.5" />
                              : <Globe className="w-3.5 h-3.5" />
                            }
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* ══════════════════════════════════════
            TAB: PRODUCTOS (wrapped in conditional)
        ══════════════════════════════════════ */}
        {activeTab === 'productos' && (
        <>

        {/* ========== BANNER TIENDA ACTIVA ========== */}
        {tiendas.length > 1 && tiendaActual && (
          <div className="flex items-center gap-3 flex-wrap">
            <span className={`text-sm font-semibold ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
              Inventario de:
            </span>
            {tiendas.map(t => (
              <button
                key={t.id}
                onClick={() => cambiarTienda(t.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-sm transition-all border ${
                  tiendaActual.id === t.id
                    ? 'text-white border-transparent shadow-lg'
                    : darkMode
                    ? 'border-slate-600 text-gray-400 hover:text-white hover:border-slate-400'
                    : 'border-gray-300 text-gray-600 hover:border-gray-500'
                }`}
                style={tiendaActual.id === t.id ? {
                  background: `linear-gradient(135deg, ${t.color}, ${t.color}cc)`,
                  boxShadow: `0 4px 15px ${t.color}40`,
                } : undefined}
              >
                <span>{t.emoji}</span>
                {t.nombre}
                {t.esPrincipal && tiendaActual.id === t.id && (
                  <span className="text-[10px] bg-white/20 px-1.5 py-0.5 rounded-full font-bold">Principal</span>
                )}
              </button>
            ))}
          </div>
        )}

        {/* ========== ALERTAS CRÍTICAS ========== */}
        {productosAlerta.length > 0 && (
          <Card className={`border-2 border-red-500/50 ${
            darkMode ? 'bg-red-500/10' : 'bg-red-50'
          } rounded-3xl`}>
            <CardContent className="p-6">
              <div className="flex items-center gap-3 mb-4">
                <AlertCircle className="w-6 h-6 text-red-500 animate-pulse" />
                <h3 className={`text-lg font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                  Alertas Críticas ({productosAlerta.length})
                </h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {productosAlerta.slice(0, 6).map(p => {
                  const dias = diasHastaVencimiento(p.fechaVencimiento);
                  return (
                    <div
                      key={p.id}
                      className={`p-4 rounded-2xl border-2 ${
                        darkMode 
                          ? 'bg-slate-800/50 border-red-500/30' 
                          : 'bg-white border-red-200'
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <p className={`font-semibold text-sm mb-1 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                            {p.nombre}
                          </p>
                          <div className="space-y-1">
                            {p.stock <= p.minStock && (
                              <p className="text-red-500 text-xs font-bold">
                                Stock: {p.stock} / Min: {p.minStock}
                              </p>
                            )}
                            {dias !== null && dias <= 7 && (
                              <p className={`text-xs font-bold ${dias <= 0 ? 'text-red-600' : 'text-amber-500'}`}>
                                {dias <= 0 ? '🔴 Vencido' : `⚠️ Vence en ${dias}d`}
                              </p>
                            )}
                          </div>
                        </div>
                        <TrendingDown className="w-6 h-6 text-red-500" />
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* ========== BÚSQUEDA ========== */}
        <Card className={`${
          darkMode
            ? 'bg-slate-900/50 border-slate-700/50'
            : 'bg-white border-gray-200'
        } rounded-3xl border-2`}>
          <CardContent className="p-6 space-y-4">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <Input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar por nombre, código o categoría..."
                className={`pl-12 h-12 rounded-2xl text-base ${
                  darkMode
                    ? 'bg-slate-800 border-slate-600 text-white placeholder:text-gray-500'
                    : 'bg-gray-50 border-gray-300'
                }`}
              />
              {searchTerm && (
                <Button
                  onClick={() => setSearchTerm('')}
                  variant="ghost"
                  size="sm"
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-xl"
                >
                  <X className="w-4 h-4" />
                </Button>
              )}
            </div>

            {/* ── Filtro por categoría global (sólo categorías de módulos activos) ── */}
            {categoriasVisibles.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  onClick={() => setCategoriaFiltro('')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all border ${
                    categoriaFiltro === ''
                      ? darkMode
                        ? 'bg-slate-600 border-slate-500 text-white'
                        : 'bg-gray-800 border-gray-800 text-white'
                      : darkMode
                      ? 'border-slate-600 text-gray-400 hover:text-white hover:border-slate-400'
                      : 'border-gray-300 text-gray-600 hover:border-gray-500'
                  }`}
                >
                  Todas
                </button>
                {categoriasVisibles.map(cat => (
                  <button
                    key={cat.id}
                    onClick={() => setCategoriaFiltro(cat.id === categoriaFiltro ? '' : cat.id)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all border ${
                      categoriaFiltro === cat.id
                        ? 'text-white border-transparent shadow-md'
                        : darkMode
                        ? 'border-slate-600 text-gray-400 hover:text-white hover:border-slate-400'
                        : 'border-gray-300 text-gray-600 hover:border-gray-500'
                    }`}
                    style={categoriaFiltro === cat.id
                      ? { backgroundColor: cat.color, boxShadow: `0 2px 8px ${cat.color}60` }
                      : undefined}
                  >
                    {cat.nombre}
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* ========== INGREDIENTES EN INVENTARIO GENERAL ========== */}
        {tienePanaderia && ingredientesEnGeneral.length > 0 && (
          <Card className={`border-2 ${darkMode ? 'bg-slate-800/60 border-emerald-700/40' : 'bg-emerald-50 border-emerald-300'} rounded-3xl overflow-hidden`}>
            <CardContent className="p-5">
              <div className="flex items-center gap-2 mb-4">
                <Globe className="w-5 h-5 text-emerald-500" />
                <h3 className={`font-bold text-sm ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                  Ingredientes en inventario general ({ingredientesEnGeneral.length})
                </h3>
                <span className={`ml-auto text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                  Visibles para contabilidad y seguimiento
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className={`text-xs font-bold ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                      <th className="text-left py-1.5 pr-4">Ingrediente</th>
                      <th className="text-center pr-4">Stock actual</th>
                      <th className="text-center pr-4">Mínimo</th>
                      <th className="text-center pr-4">Estado</th>
                      <th className="text-right">Módulo origen</th>
                    </tr>
                  </thead>
                  <tbody className={`divide-y ${darkMode ? 'divide-slate-700' : 'divide-emerald-100'}`}>
                    {ingredientesEnGeneral.map(ing => {
                      const st = getIngredienteStatus(ing);
                      return (
                        <tr key={ing.id}>
                          <td className={`py-2 pr-4 font-semibold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                            {ing.nombre}
                          </td>
                          <td className={`py-2 pr-4 text-center font-mono font-bold ${st.colorText}`}>
                            {Number(ing.stockActual).toLocaleString()} {ing.unidad}
                          </td>
                          <td className={`py-2 pr-4 text-center ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                            {Number(ing.stockMinimo).toLocaleString()} {ing.unidad}
                          </td>
                          <td className="py-2 pr-4 text-center">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                              st.urgente ? 'bg-red-500/20 text-red-500' : 'bg-emerald-500/20 text-emerald-600'
                            }`}>
                              {st.label}
                            </span>
                          </td>
                          <td className={`py-2 text-right text-xs ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                            {ing.moduloOrigen === 'panaderia_onces' ? 'Panadería' : (ing.moduloOrigen || '—')}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ========== TABLA DE PRODUCTOS ========== */}
        <Card className={`${
          darkMode ? 'bg-slate-900/50 border-slate-700/50' : 'bg-white border-gray-200'
        } rounded-3xl border-2 overflow-hidden`}>
          <CardContent className="p-0">
            {loading ? (
              <div className="text-center py-20">
                <Loader2 className="w-12 h-12 animate-spin text-blue-500 mx-auto mb-4" />
                <p className={`${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                  Cargando productos...
                </p>
              </div>
            ) : productosFiltrados.length === 0 ? (
              <div className="text-center py-20">
                <Package className={`w-20 h-20 mx-auto mb-4 ${
                  darkMode ? 'text-gray-700' : 'text-gray-300'
                }`} />
                <p className={`text-xl font-bold mb-2 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                  {searchTerm ? 'No se encontraron productos' : 'No hay productos en el inventario'}
                </p>
                {!searchTerm && (
                  <Button
                    onClick={() => setShowImportModal(true)}
                    className="mt-4 bg-gradient-to-r from-purple-500 to-purple-600 rounded-2xl"
                  >
                    <Upload className="w-5 h-5 mr-2" />
                    Importar Productos
                  </Button>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className={`sticky top-0 z-10 ${
                    darkMode ? 'bg-slate-800' : 'bg-gray-100'
                  }`}>
                    <tr>
                      <th className={`px-6 py-4 text-left text-sm font-bold ${
                        darkMode ? 'text-gray-300' : 'text-gray-700'
                      }`}>Código</th>
                      <th className={`px-6 py-4 text-left text-sm font-bold ${
                        darkMode ? 'text-gray-300' : 'text-gray-700'
                      }`}>Producto</th>
                      <th className={`px-6 py-4 text-left text-sm font-bold ${
                        darkMode ? 'text-gray-300' : 'text-gray-700'
                      }`}>Categoría</th>
                      <th className={`px-6 py-4 text-center text-sm font-bold ${
                        darkMode ? 'text-gray-300' : 'text-gray-700'
                      }`}>Stock</th>
                      <th className={`px-6 py-4 text-right text-sm font-bold ${
                        darkMode ? 'text-gray-300' : 'text-gray-700'
                      }`}>Precio</th>
                      <th className={`px-6 py-4 text-center text-sm font-bold ${
                        darkMode ? 'text-gray-300' : 'text-gray-700'
                      }`}>Acciones</th>
                    </tr>
                  </thead>
                  <tbody className={`divide-y ${darkMode ? 'divide-slate-700' : 'divide-gray-200'}`}>
                    {productosPaginados.map((producto) => {
                      const stockStatus = getStockStatus(producto.stock, producto.minStock);
                      const dias = diasHastaVencimiento(producto.fechaVencimiento);
                      const porcentajeStock = Math.min((producto.stock / producto.minStock) * 100, 100);

                      return (
                        <motion.tr
                          key={producto.id}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          className={`transition-colors ${
                            darkMode ? 'hover:bg-slate-800/50' : 'hover:bg-gray-50'
                          } ${
                            producto.stock <= producto.minStock 
                              ? darkMode ? 'bg-red-500/5' : 'bg-red-50' 
                              : ''
                          }`}
                        >
                          <td className={`px-6 py-4 text-sm font-mono ${
                            darkMode ? 'text-gray-400' : 'text-gray-600'
                          }`}>
                            {producto.codigo}
                          </td>

                          <td className="px-6 py-4">
                            <div>
                              <p className={`font-bold text-sm ${
                                darkMode ? 'text-white' : 'text-gray-900'
                              }`}>
                                {producto.nombre}
                              </p>
                              {dias !== null && dias <= 7 && (
                                <span className={`inline-flex items-center gap-1 text-xs font-semibold mt-1 ${
                                  dias <= 0 ? 'text-red-600' : dias <= 3 ? 'text-red-500' : 'text-amber-500'
                                }`}>
                                  <AlertCircle className="w-3 h-3" />
                                  {dias <= 0 ? 'Vencido' : `Vence en ${dias}d`}
                                </span>
                              )}
                            </div>
                          </td>

                          <td className="px-6 py-4">
                            <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${
                              darkMode 
                                ? 'bg-blue-500/20 text-blue-400' 
                                : 'bg-blue-100 text-blue-700'
                            }`}>
                              {producto.categoria}
                            </span>
                          </td>

                          <td className="px-6 py-4">
                            <div className="flex flex-col items-center gap-1">
                              <div className="flex items-center gap-2">
                                <span className={`text-sm font-bold ${
                                  stockStatus.color === 'red' ? 'text-red-500' :
                                  stockStatus.color === 'yellow' ? 'text-yellow-500' :
                                  'text-green-500'
                                }`}>
                                  {producto.stock}
                                </span>
                                <span className={`text-xs ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                                  / {producto.minStock}
                                </span>
                              </div>
                              
                              <div className={`w-20 h-1.5 rounded-full overflow-hidden ${
                                darkMode ? 'bg-slate-700' : 'bg-gray-200'
                              }`}>
                                <div
                                  style={{ width: `${porcentajeStock}%` }}
                                  className={`h-full rounded-full transition-all ${stockStatus.bg}`}
                                />
                              </div>
                            </div>
                          </td>

                          <td className="px-6 py-4 text-right">
                            <div>
                              <span className="text-base font-bold bg-gradient-to-r from-emerald-500 to-emerald-600 bg-clip-text text-transparent">
                                ${producto.precio.toLocaleString('es-CO')}
                              </span>
                              <p className={`text-xs ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                                Costo: ${producto.costo.toLocaleString('es-CO')}
                              </p>
                            </div>
                          </td>

                          <td className="px-6 py-4">
                            <div className="flex items-center justify-center gap-2">
                              <Button
                                onClick={() => handleEdit(producto)}
                                size="sm"
                                variant="outline"
                                className="w-9 h-9 p-0 rounded-xl"
                                disabled={deletingId === producto.id}
                              >
                                <Edit className="w-4 h-4" />
                              </Button>
                              <Button
                                onClick={() => handleDeleteProduct(producto.id)}
                                size="sm"
                                variant="outline"
                                className={`w-9 h-9 p-0 rounded-xl ${
                                  darkMode 
                                    ? 'border-red-500/50 text-red-400 hover:bg-red-500/20' 
                                    : 'border-red-300 text-red-500 hover:bg-red-50'
                                }`}
                                disabled={deletingId === producto.id}
                              >
                                {deletingId === producto.id ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                  <Trash2 className="w-4 h-4" />
                                )}
                              </Button>
                            </div>
                          </td>
                        </motion.tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Paginación */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between py-2">
            <span className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
              {productosFiltrados.length} productos · Página {currentPage} de {totalPages}
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => goToPage(1)}
                disabled={currentPage === 1}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-40 ${
                  darkMode ? 'bg-slate-700 hover:bg-slate-600 text-gray-300' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                }`}
              >«</button>
              <button
                onClick={() => goToPage(currentPage - 1)}
                disabled={currentPage === 1}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-40 ${
                  darkMode ? 'bg-slate-700 hover:bg-slate-600 text-gray-300' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                }`}
              >‹</button>

              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                const offset = Math.max(0, Math.min(currentPage - 3, totalPages - 5));
                const page = i + 1 + offset;
                return (
                  <button
                    key={page}
                    onClick={() => goToPage(page)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                      page === currentPage
                        ? 'bg-blue-600 text-white shadow-md'
                        : darkMode
                        ? 'bg-slate-700 hover:bg-slate-600 text-gray-300'
                        : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                    }`}
                  >{page}</button>
                );
              })}

              <button
                onClick={() => goToPage(currentPage + 1)}
                disabled={currentPage === totalPages}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-40 ${
                  darkMode ? 'bg-slate-700 hover:bg-slate-600 text-gray-300' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                }`}
              >›</button>
              <button
                onClick={() => goToPage(totalPages)}
                disabled={currentPage === totalPages}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-40 ${
                  darkMode ? 'bg-slate-700 hover:bg-slate-600 text-gray-300' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                }`}
              >»</button>
            </div>
          </div>
        )}

        {/* Indicador de resultados filtrados */}
        {searchTerm && productosFiltrados.length > 0 && (
          <div className={`text-center text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
            Mostrando {productosFiltrados.length} de {productos.length} productos
          </div>
        )}
        </>
        )}
      </div>

      {/* ========== MODAL RESTOCK INGREDIENTE ========== */}
      <AnimatePresence>
        {restockTarget && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setRestockTarget(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={e => e.stopPropagation()}
              className={`max-w-md w-full rounded-3xl p-6 border-2 ${darkMode ? 'bg-slate-900 border-emerald-600/40' : 'bg-white border-emerald-400'}`}
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 bg-gradient-to-br from-emerald-500 to-green-600 rounded-2xl flex items-center justify-center">
                  <PackagePlus className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className={`font-bold text-lg ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                    Agregar Stock
                  </h3>
                  <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                    {restockTarget.nombre}
                  </p>
                </div>
              </div>

              <div className={`p-3 rounded-xl mb-4 ${darkMode ? 'bg-slate-800' : 'bg-gray-50'}`}>
                <div className="flex justify-between text-sm">
                  <span className={darkMode ? 'text-gray-400' : 'text-gray-500'}>Stock actual</span>
                  <span className={`font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                    {Number(restockTarget.stockActual).toLocaleString()} {restockTarget.unidad}
                  </span>
                </div>
                <div className="flex justify-between text-sm mt-1">
                  <span className={darkMode ? 'text-gray-400' : 'text-gray-500'}>Stock mínimo</span>
                  <span className={`font-medium ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                    {Number(restockTarget.stockMinimo).toLocaleString()} {restockTarget.unidad}
                  </span>
                </div>
              </div>

              <div className="space-y-2 mb-5">
                <label className={`text-sm font-semibold ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                  Cantidad a agregar ({restockTarget.unidad})
                </label>
                <Input
                  type="number"
                  min="1"
                  value={restockAmount}
                  onChange={e => setRestockAmount(e.target.value)}
                  placeholder={`Ej: 50000 (50 kg)`}
                  className={`h-12 rounded-2xl text-lg font-bold ${darkMode ? 'bg-slate-800 border-slate-600 text-white' : ''}`}
                  autoFocus
                  onKeyDown={e => e.key === 'Enter' && handleRestock()}
                />
                {restockAmount && !isNaN(Number(restockAmount)) && Number(restockAmount) > 0 && (
                  <p className={`text-xs ${darkMode ? 'text-emerald-400' : 'text-emerald-600'}`}>
                    Nuevo stock: {(Number(restockTarget.stockActual) + Number(restockAmount)).toLocaleString()} {restockTarget.unidad}
                  </p>
                )}
              </div>

              <div className="flex gap-3">
                <Button onClick={() => setRestockTarget(null)} variant="outline" className="flex-1 rounded-2xl">
                  Cancelar
                </Button>
                <Button
                  onClick={handleRestock}
                  className="flex-1 rounded-2xl bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 font-bold"
                >
                  <ArrowUpCircle className="w-4 h-4 mr-2" />
                  Agregar al inventario
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ========== MODALES ========== */}
      <ImportMasivaCSV
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        onImportComplete={handleImportComplete}
      />

      <ModalNuevoProducto
        isOpen={showNewProductModal}
        onClose={() => setShowNewProductModal(false)}
        onProductCreated={handleProductCreated}
      />

      <EditProductModal
        darkMode={darkMode}
        isOpen={showEditModal}
        onClose={() => setShowEditModal(false)}
        product={productToEdit}
        onProductUpdated={handleProductUpdated}
      />

      {/* Modal Eliminar Todos */}
      <AnimatePresence>
        {showDeleteAllModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setShowDeleteAllModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className={`max-w-md w-full rounded-3xl p-8 ${
                darkMode ? 'bg-slate-900 border-2 border-red-500' : 'bg-white border-2 border-red-500'
              }`}
            >
              <div className="text-center">
                <div className="w-20 h-20 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-6 animate-pulse">
                  <AlertTriangle className="w-10 h-10 text-red-500" />
                </div>

                <h2 className={`text-2xl font-bold mb-3 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                  ¿Eliminar TODOS los productos?
                </h2>

                <p className={`text-base mb-4 ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                  Esta acción eliminará <span className="font-bold text-red-500">{productos.length} productos</span> de forma <span className="font-bold">PERMANENTE</span>.
                </p>

                <div className={`p-4 rounded-2xl mb-6 border-2 ${
                  darkMode 
                    ? 'bg-red-500/10 border-red-500/50' 
                    : 'bg-red-50 border-red-300'
                }`}>
                  <p className={`text-sm font-semibold ${darkMode ? 'text-red-300' : 'text-red-700'}`}>
                    ⚠️ Esta acción NO se puede deshacer
                  </p>
                </div>

                <div className="flex gap-3">
                  <Button
                    onClick={() => setShowDeleteAllModal(false)}
                    variant="outline"
                    className="flex-1 h-12 rounded-2xl"
                  >
                    Cancelar
                  </Button>

                  <Button
                    onClick={handleDeleteAll}
                    className="flex-1 h-12 rounded-2xl bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 font-bold"
                  >
                    <Trash2 className="w-5 h-5 mr-2" />
                    Eliminar Todo
                  </Button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 💰 Modal de Margen de Ganancia Personalizado */}
      <ModalMargenGanancia
        isOpen={showMargenModal}
        onClose={() => setShowMargenModal(false)}
        darkMode={darkMode}
      />
    </div>
  );
}
