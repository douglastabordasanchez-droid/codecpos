/**
 * CÓDIGOS DE BARRAS — CODEC POS v2.0
 * Generador PLU / EAN-13 integrado con Inventario y Categorías
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Barcode, Plus, Printer, Download, Package,
  Search, X, Check, AlertCircle, FileText, Tag,
  FolderPlus, Trash2, ChevronDown, Pencil,
} from 'lucide-react';
import {
  generarCodigoPLU,
  generarCodigoEAN13,
  registrarCodigoGenerado,
  generarDataURLCodigoBarras,
  PlantillaEtiqueta,
  listarPlantillasEtiquetas,
  crearPlantillasPredefinidas,
  imprimirEtiquetas,
} from '../lib/codigosBarrasService';
import { toast } from 'sonner';
import { usePOS } from '../contexts/POSContext';

// ─── Interfaces ────────────────────────────────────────────────────────────────

interface ProductoPOS {
  id: string;
  codigo: string;
  nombre: string;
  precio: number;
  stock: number;
  minStock: number;
  categoria: string;
  categoriaId: string;
  costo: number;
  _supabaseSynced?: boolean;
}

interface CategoriaGlobal {
  id: string;
  nombre: string;
  color: string;
}

type Vista = 'generador' | 'asignar' | 'categorias' | 'plantillas';

// ─── Colores predefinidos para categorías ──────────────────────────────────────

const COLORES_CATEGORIA = [
  '#3B82F6', '#8B5CF6', '#EC4899', '#EF4444',
  '#F97316', '#EAB308', '#22C55E', '#14B8A6',
  '#06B6D4', '#6366F1', '#84CC16', '#F43F5E',
];

// ─── Helpers localStorage ──────────────────────────────────────────────────────

function leerProductosPOS(): ProductoPOS[] {
  try { return JSON.parse(localStorage.getItem('pos-productos') || '[]'); } catch { return []; }
}

function leerCategorias(): CategoriaGlobal[] {
  try { return JSON.parse(localStorage.getItem('codecpos_categorias_global') || '[]'); } catch { return []; }
}

function guardarCategorias(cats: CategoriaGlobal[]) {
  localStorage.setItem('codecpos_categorias_global', JSON.stringify(cats));
  window.dispatchEvent(new StorageEvent('storage', { key: 'codecpos_categorias_global' }));
}

function guardarProductoEnInventario(producto: ProductoPOS) {
  const prods = leerProductosPOS();
  prods.push(producto);
  localStorage.setItem('pos-productos', JSON.stringify(prods));
  window.dispatchEvent(new StorageEvent('storage', { key: 'pos-productos' }));
  window.dispatchEvent(new CustomEvent('pos-productos-updated', { detail: prods }));
}

/**
 * ⚠️ Antes esta función escribía en 'codecpos_productos', una clave
 * huérfana que nada más en el sistema lee — el código asignado nunca
 * llegaba al inventario real, ni se sincronizaba a Supabase, ni el escáner
 * de la PWA podía encontrarlo jamás. Ahora escribe en 'pos-productos' (la
 * MISMA clave que usa el inventario real, POSPageNew y la sincronización),
 * en el campo `codigo` (el que el resto del sistema ya trata como el
 * código escaneable — ver POSPageNew.tsx y syncService.ts).
 *
 * También limpia `_supabaseSynced`: syncService.ts marca esa bandera true
 * la primera vez que sube un producto y nunca la vuelve a tocar, así que un
 * producto ya sincronizado se queda con el código viejo (o sin código) en
 * Supabase para siempre si no se invalida aquí tras cada edición.
 */
function actualizarProductoPOS(producto: ProductoPOS) {
  const prods = leerProductosPOS();
  const idx = prods.findIndex(p => p.id === producto.id);
  if (idx !== -1) {
    prods[idx] = { ...producto, _supabaseSynced: false };
    localStorage.setItem('pos-productos', JSON.stringify(prods));
    window.dispatchEvent(new StorageEvent('storage', { key: 'pos-productos' }));
    window.dispatchEvent(new CustomEvent('pos-productos-updated', { detail: prods }));
  }
}

// ─── Componente principal ──────────────────────────────────────────────────────

export default function CodigosBarrasPageFull() {
  const { darkMode } = usePOS();

  // Vistas y carga
  const [vistaActual, setVistaActual] = useState<Vista>('generador');
  const [loading, setLoading] = useState(false);

  // Plantillas
  const [plantillas, setPlantillas] = useState<PlantillaEtiqueta[]>([]);

  // Estadísticas
  const [stats, setStats] = useState({ codigosGenerados: 0, etiquetasImpresas: 0, productosConCodigo: 0 });

  // Generador
  const [formCodigo, setFormCodigo] = useState({
    tipo: 'EAN13' as 'PLU' | 'EAN13',
    productoNombre: '',
    precio: 0,
    categoriaId: '',
    cantidad: 1,
  });
  const [showCatDropdown, setShowCatDropdown] = useState(false);
  const [codigoGenerado, setCodigoGenerado] = useState<string | null>(null);
  const [imagenCodigo, setImagenCodigo] = useState<string | null>(null);

  // Categorías
  const [categorias, setCategorias] = useState<CategoriaGlobal[]>([]);
  const [formCat, setFormCat] = useState({ nombre: '', color: COLORES_CATEGORIA[0] });
  const [editandoCat, setEditandoCat] = useState<CategoriaGlobal | null>(null);
  const [confirmEliminarCat, setConfirmEliminarCat] = useState<string | null>(null);

  // Asignar a productos existentes
  const [productos, setProductos] = useState<ProductoPOS[]>([]);
  const [busquedaProducto, setBusquedaProducto] = useState('');
  const [productoSeleccionado, setProductoSeleccionado] = useState<ProductoPOS | null>(null);

  // Modales de integración
  const [showModalProducto, setShowModalProducto] = useState(false);
  const [pendingProducto, setPendingProducto] = useState<{
    codigo: string; nombre: string; precio: number;
    categoria: string; categoriaId: string; cantidad: number;
  } | null>(null);

  // ── Carga inicial ───────────────────────────────────────────────────────────

  useEffect(() => {
    inicializar();
  }, []);

  const inicializar = async () => {
    try {
      let plantillasData = await listarPlantillasEtiquetas();
      if (plantillasData.length === 0) {
        await crearPlantillasPredefinidas();
        plantillasData = await listarPlantillasEtiquetas();
      }
      setPlantillas(plantillasData);
      setProductos(leerProductosPOS());
      setCategorias(leerCategorias());
      calcularStats();
    } catch (e) {
      console.error('Error inicializando:', e);
    }
  };

  const calcularStats = useCallback(() => {
    const prods = leerProductosPOS();
    const generados = (() => {
      try { return JSON.parse(localStorage.getItem('codecpos_codigos_generados') || '[]').length; } catch { return 0; }
    })();
    const impresas = (() => {
      try { return parseInt(localStorage.getItem('codecpos_etiquetas_impresas') || '0'); } catch { return 0; }
    })();
    setStats({ codigosGenerados: generados, etiquetasImpresas: impresas, productosConCodigo: prods.filter(p => p.codigo).length });
  }, []);

  // ── Categorías ──────────────────────────────────────────────────────────────

  const categoriaSeleccionada = categorias.find(c => c.id === formCodigo.categoriaId);

  const handleGuardarCategoria = () => {
    const nombre = formCat.nombre.trim();
    if (!nombre) { toast.error('Escribe un nombre para la categoría'); return; }

    if (editandoCat) {
      const updated = categorias.map(c => c.id === editandoCat.id ? { ...c, nombre, color: formCat.color } : c);
      guardarCategorias(updated);
      setCategorias(updated);
      setEditandoCat(null);
      toast.success(`Categoría "${nombre}" actualizada`);
    } else {
      const yaExiste = categorias.some(c => c.nombre.toLowerCase() === nombre.toLowerCase());
      if (yaExiste) { toast.error('Ya existe una categoría con ese nombre'); return; }
      const nueva: CategoriaGlobal = { id: `cat-${Date.now()}`, nombre, color: formCat.color };
      const updated = [...categorias, nueva];
      guardarCategorias(updated);
      setCategorias(updated);
      toast.success(`Categoría "${nombre}" creada`);
    }
    setFormCat({ nombre: '', color: COLORES_CATEGORIA[0] });
  };

  const handleEditarCategoria = (cat: CategoriaGlobal) => {
    setEditandoCat(cat);
    setFormCat({ nombre: cat.nombre, color: cat.color });
  };

  const handleEliminarCategoria = (id: string) => {
    const updated = categorias.filter(c => c.id !== id);
    guardarCategorias(updated);
    setCategorias(updated);
    setConfirmEliminarCat(null);
    if (formCodigo.categoriaId === id) setFormCodigo(f => ({ ...f, categoriaId: '' }));
    toast.success('Categoría eliminada');
  };

  // ── Generador ───────────────────────────────────────────────────────────────

  const handleGenerarCodigo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formCodigo.productoNombre.trim()) { toast.error('Escribe el nombre del producto'); return; }
    setLoading(true);

    try {
      const codigo = formCodigo.tipo === 'PLU' ? await generarCodigoPLU() : await generarCodigoEAN13();
      setCodigoGenerado(codigo);
      setImagenCodigo(generarDataURLCodigoBarras(codigo, formCodigo.tipo === 'PLU' ? 'CODE128' : 'EAN13'));

      await registrarCodigoGenerado({
        codigo,
        tipo: formCodigo.tipo === 'PLU' ? 'PLU' : 'EAN13',
        productoId: `PROD-${Date.now()}`,
        productoNombre: formCodigo.productoNombre,
      });

      calcularStats();
      toast.success(`Código ${codigo} generado`);

      const cat = categorias.find(c => c.id === formCodigo.categoriaId);
      setPendingProducto({
        codigo,
        nombre: formCodigo.productoNombre,
        precio: formCodigo.precio,
        categoria: cat?.nombre || '',
        categoriaId: formCodigo.categoriaId,
        cantidad: formCodigo.cantidad,
      });
      setShowModalProducto(true);
    } catch (err) {
      console.error(err);
      toast.error('Error generando código');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmarAgregarProducto = () => {
    if (!pendingProducto) return;

    const nuevo: ProductoPOS = {
      id: `prod-${Date.now()}`,
      codigo: pendingProducto.codigo,
      nombre: pendingProducto.nombre,
      precio: pendingProducto.precio,
      stock: 0,
      minStock: 5,
      categoria: pendingProducto.categoria,
      categoriaId: pendingProducto.categoriaId,
      costo: 0,
    };
    guardarProductoEnInventario(nuevo);
    toast.success(`"${nuevo.nombre}" añadido al inventario`);
    setShowModalProducto(false);
    setPendingProducto(null);
    calcularStats();
  };

  // ── Asignar código a producto existente ─────────────────────────────────────

  const handleAsignarCodigo = () => {
    if (!productoSeleccionado || !codigoGenerado) return;
    actualizarProductoPOS({ ...productoSeleccionado, codigo: codigoGenerado });
    toast.success(`Código asignado a ${productoSeleccionado.nombre}`);
    setProductos(leerProductosPOS());
    setProductoSeleccionado(null);
    setCodigoGenerado(null);
    setImagenCodigo(null);
    calcularStats();
  };

  const handleGenerarYAsignar = async (producto: ProductoPOS) => {
    setLoading(true);
    try {
      const codigo = await generarCodigoEAN13();
      actualizarProductoPOS({ ...producto, codigo });
      await registrarCodigoGenerado({ codigo, tipo: 'EAN13', productoId: producto.id, productoNombre: producto.nombre });
      toast.success(`Código ${codigo} asignado a ${producto.nombre}`);
      setProductos(leerProductosPOS());
      calcularStats();
    } catch { toast.error('Error generando código'); }
    finally { setLoading(false); }
  };

  const handleImprimirEtiquetaProducto = async (producto: ProductoPOS) => {
    if (!producto.codigo || plantillas.length === 0) {
      toast.error('El producto no tiene código o no hay plantillas');
      return;
    }
    try {
      await imprimirEtiquetas(plantillas[0].id, [{ codigoBarras: producto.codigo, nombre: producto.nombre, precio: producto.precio, categoria: producto.categoria }], 1);
      const cur = parseInt(localStorage.getItem('codecpos_etiquetas_impresas') || '0');
      localStorage.setItem('codecpos_etiquetas_impresas', (cur + 1).toString());
      calcularStats();
      toast.success(`Imprimiendo etiqueta de ${producto.nombre}`);
    } catch { toast.error('Error al imprimir'); }
  };

  const handleImprimir = async () => {
    if (!codigoGenerado || !plantillas[0]) return;
    const cat = categorias.find(c => c.id === formCodigo.categoriaId);
    try {
      await imprimirEtiquetas(plantillas[0].id, [{ codigoBarras: codigoGenerado, nombre: formCodigo.productoNombre, precio: formCodigo.precio, categoria: cat?.nombre || '' }], formCodigo.cantidad);
      const cur = parseInt(localStorage.getItem('codecpos_etiquetas_impresas') || '0');
      localStorage.setItem('codecpos_etiquetas_impresas', (cur + formCodigo.cantidad).toString());
      calcularStats();
      toast.success(`Imprimiendo ${formCodigo.cantidad} etiqueta(s)`);
    } catch { toast.error('Error al imprimir'); }
  };

  const handleDescargar = () => {
    if (!imagenCodigo) return;
    const a = document.createElement('a');
    a.href = imagenCodigo;
    a.download = `codigo-${codigoGenerado}.png`;
    a.click();
    toast.success('Código descargado');
  };

  // ── Derivados ────────────────────────────────────────────────────────────────

  const productosFiltrados = productos.filter(p =>
    p.nombre.toLowerCase().includes(busquedaProducto.toLowerCase()) ||
    p.id.toLowerCase().includes(busquedaProducto.toLowerCase()) ||
    (p.codigo && p.codigo.includes(busquedaProducto))
  );
  const productosSinCodigo = productos.filter(p => !p.codigo);

  // ── Clases de tema ───────────────────────────────────────────────────────────

  const card  = darkMode ? 'bg-slate-800 border border-slate-700' : 'bg-white border border-gray-200';
  const input = darkMode ? 'bg-slate-700 border-slate-600 text-white placeholder-slate-400' : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400';
  const muted = darkMode ? 'text-slate-400' : 'text-gray-500';
  const tabActive   = 'border-blue-500 text-blue-500';
  const tabInactive = `border-transparent ${darkMode ? 'text-slate-400 hover:text-slate-200' : 'text-gray-500 hover:text-gray-800'}`;

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className={`h-screen overflow-y-auto ${darkMode ? 'text-white' : 'text-gray-900'}`}>
      <div className="p-6 max-w-7xl mx-auto">

        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Barcode className="w-8 h-8 text-blue-500" />
            Códigos de Barras
          </h1>
          <p className={`text-sm mt-1 ${muted}`}>
            Generador PLU / EAN-13 · Categorías · Inventario integrado
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {[
            { label: 'Códigos generados', value: stats.codigosGenerados, color: 'from-blue-500 to-blue-600', icon: <Barcode className="w-8 h-8 opacity-40" /> },
            { label: 'Etiquetas impresas', value: stats.etiquetasImpresas, color: 'from-purple-500 to-purple-600', icon: <Printer className="w-8 h-8 opacity-40" /> },
            { label: 'Categorías',         value: categorias.length,       color: 'from-teal-500 to-teal-600',   icon: <Tag className="w-8 h-8 opacity-40" /> },
            { label: 'Con código',         value: stats.productosConCodigo, color: 'from-orange-500 to-orange-600', icon: <Package className="w-8 h-8 opacity-40" /> },
          ].map(s => (
            <div key={s.label} className={`bg-gradient-to-br ${s.color} rounded-xl p-4 text-white shadow-lg`}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs opacity-80 font-medium">{s.label}</p>
                  <p className="text-3xl font-bold">{s.value}</p>
                </div>
                {s.icon}
              </div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className={`mb-6 border-b ${darkMode ? 'border-slate-700' : 'border-gray-200'}`}>
          <div className="flex gap-1">
            {([
              { key: 'generador',  label: 'Generar Código' },
              { key: 'asignar',    label: `Asignar a productos (${productosSinCodigo.length})` },
              { key: 'categorias', label: `Categorías (${categorias.length})` },
              { key: 'plantillas', label: `Plantillas (${plantillas.length})` },
            ] as { key: Vista; label: string }[]).map(t => (
              <button
                key={t.key}
                onClick={() => setVistaActual(t.key)}
                className={`px-4 py-3 text-sm font-semibold border-b-2 transition-colors ${vistaActual === t.key ? tabActive : tabInactive}`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════════
            VISTA: GENERADOR
        ═══════════════════════════════════════════════════════════ */}
        {vistaActual === 'generador' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

            {/* Formulario */}
            <div className={`${card} rounded-xl shadow-sm p-6`}>
              <h2 className="text-lg font-bold mb-5 flex items-center gap-2">
                <Barcode className="w-5 h-5 text-blue-500" />
                Nuevo Código
              </h2>

              <form onSubmit={handleGenerarCodigo} className="space-y-4">

                {/* Tipo */}
                <div>
                  <label className={`block text-xs font-semibold uppercase tracking-wide mb-1.5 ${muted}`}>Tipo *</label>
                  <select
                    value={formCodigo.tipo}
                    onChange={e => setFormCodigo(f => ({ ...f, tipo: e.target.value as any }))}
                    className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${input}`}
                  >
                    <option value="EAN13">EAN-13 (estándar internacional, 13 dígitos)</option>
                    <option value="PLU">PLU (código interno, 4-5 dígitos)</option>
                  </select>
                </div>

                {/* Nombre */}
                <div>
                  <label className={`block text-xs font-semibold uppercase tracking-wide mb-1.5 ${muted}`}>Nombre del producto *</label>
                  <input
                    required
                    type="text"
                    value={formCodigo.productoNombre}
                    onChange={e => setFormCodigo(f => ({ ...f, productoNombre: e.target.value }))}
                    placeholder="Ej: Arroz Diana 500g"
                    className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${input}`}
                  />
                </div>

                {/* Precio + Cantidad */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={`block text-xs font-semibold uppercase tracking-wide mb-1.5 ${muted}`}>Precio</label>
                    <input
                      type="number" min="0" step="100"
                      value={formCodigo.precio}
                      onChange={e => setFormCodigo(f => ({ ...f, precio: parseFloat(e.target.value) || 0 }))}
                      placeholder="0"
                      className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${input}`}
                    />
                  </div>
                  <div>
                    <label className={`block text-xs font-semibold uppercase tracking-wide mb-1.5 ${muted}`}>Etiquetas a imprimir</label>
                    <input
                      type="number" min="1" max="100"
                      value={formCodigo.cantidad}
                      onChange={e => setFormCodigo(f => ({ ...f, cantidad: parseInt(e.target.value) || 1 }))}
                      className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${input}`}
                    />
                  </div>
                </div>

                {/* Categoría (dropdown de categorías reales) */}
                <div className="relative">
                  <label className={`block text-xs font-semibold uppercase tracking-wide mb-1.5 ${muted}`}>
                    Categoría
                    <span className={`ml-2 font-normal normal-case ${muted}`}>
                      — <button type="button" onClick={() => setVistaActual('categorias')} className="text-blue-500 hover:underline">gestionar categorías</button>
                    </span>
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowCatDropdown(s => !s)}
                    className={`w-full px-3 py-2 border rounded-lg text-sm text-left flex items-center justify-between focus:outline-none focus:ring-2 focus:ring-blue-500 ${input}`}
                  >
                    <span className="flex items-center gap-2">
                      {categoriaSeleccionada ? (
                        <>
                          <span className="w-3 h-3 rounded-full shrink-0" style={{ background: categoriaSeleccionada.color }} />
                          {categoriaSeleccionada.nombre}
                        </>
                      ) : (
                        <span className={muted}>Sin categoría</span>
                      )}
                    </span>
                    <ChevronDown className="w-4 h-4 shrink-0" />
                  </button>

                  {showCatDropdown && (
                    <div className={`absolute z-20 w-full mt-1 rounded-xl shadow-xl border overflow-hidden ${darkMode ? 'bg-slate-800 border-slate-600' : 'bg-white border-gray-200'}`}>
                      <button
                        type="button"
                        onClick={() => { setFormCodigo(f => ({ ...f, categoriaId: '' })); setShowCatDropdown(false); }}
                        className={`w-full text-left px-4 py-2.5 text-sm ${muted} hover:bg-blue-500/10`}
                      >
                        Sin categoría
                      </button>
                      {categorias.length === 0 && (
                        <div className={`px-4 py-3 text-sm ${muted}`}>
                          No hay categorías. <button type="button" onClick={() => { setShowCatDropdown(false); setVistaActual('categorias'); }} className="text-blue-500 hover:underline">Crea una aquí</button>.
                        </div>
                      )}
                      {categorias.map(cat => (
                        <button
                          key={cat.id}
                          type="button"
                          onClick={() => { setFormCodigo(f => ({ ...f, categoriaId: cat.id })); setShowCatDropdown(false); }}
                          className={`w-full text-left px-4 py-2.5 text-sm flex items-center gap-2 ${darkMode ? 'hover:bg-slate-700' : 'hover:bg-gray-50'} ${formCodigo.categoriaId === cat.id ? 'font-semibold' : ''}`}
                        >
                          <span className="w-3 h-3 rounded-full shrink-0" style={{ background: cat.color }} />
                          {cat.nombre}
                          {formCodigo.categoriaId === cat.id && <Check className="w-3.5 h-3.5 ml-auto text-blue-500" />}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 rounded-xl bg-gradient-to-r from-blue-600 to-blue-700 text-white font-semibold flex items-center justify-center gap-2 hover:from-blue-700 hover:to-blue-800 disabled:opacity-50 transition-all"
                >
                  {loading ? 'Generando...' : <><Barcode className="w-5 h-5" /> Generar Código</>}
                </button>
              </form>
            </div>

            {/* Vista previa */}
            <div className={`${card} rounded-xl shadow-sm p-6`}>
              <h2 className="text-lg font-bold mb-5">Vista previa</h2>

              {codigoGenerado && imagenCodigo ? (
                <div className="space-y-4">
                  <div className="bg-white rounded-xl border-2 border-dashed border-gray-200 p-6 flex flex-col items-center">
                    <img src={imagenCodigo} alt="Código de barras" className="max-w-full" />
                    <p className="text-gray-800 font-mono text-lg mt-3 font-bold">{codigoGenerado}</p>
                    <p className="text-gray-600 text-sm mt-1">{formCodigo.productoNombre}</p>
                    {formCodigo.precio > 0 && (
                      <p className="text-gray-900 font-bold text-xl mt-1">${formCodigo.precio.toLocaleString('es-CO')}</p>
                    )}
                    {categoriaSeleccionada && (
                      <span className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium text-white" style={{ background: categoriaSeleccionada.color }}>
                        <Tag className="w-3 h-3" />
                        {categoriaSeleccionada.nombre}
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <button onClick={handleImprimir} className="py-2.5 rounded-xl bg-purple-600 text-white text-sm font-semibold hover:bg-purple-700 flex items-center justify-center gap-2">
                      <Printer className="w-4 h-4" /> Imprimir
                    </button>
                    <button onClick={handleDescargar} className="py-2.5 rounded-xl bg-green-600 text-white text-sm font-semibold hover:bg-green-700 flex items-center justify-center gap-2">
                      <Download className="w-4 h-4" /> Descargar
                    </button>
                  </div>

                  {productoSeleccionado && (
                    <button onClick={handleAsignarCodigo} className="w-full py-2.5 rounded-xl bg-orange-600 text-white text-sm font-semibold hover:bg-orange-700 flex items-center justify-center gap-2">
                      <Check className="w-4 h-4" /> Asignar a {productoSeleccionado.nombre}
                    </button>
                  )}
                </div>
              ) : (
                <div className={`border-2 border-dashed rounded-xl p-16 flex flex-col items-center text-center ${darkMode ? 'border-slate-600' : 'border-gray-200'}`}>
                  <Barcode className={`w-16 h-16 mb-3 ${muted}`} />
                  <p className={`text-sm ${muted}`}>Completa el formulario y pulsa<br/>"Generar Código"</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════
            VISTA: ASIGNAR A PRODUCTOS
        ═══════════════════════════════════════════════════════════ */}
        {vistaActual === 'asignar' && (
          <div className={`${card} rounded-xl shadow-sm p-6`}>
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-lg font-bold">Asignar códigos a productos del inventario</h2>
              <span className={`text-sm ${muted}`}>{productosSinCodigo.length} sin código</span>
            </div>

            <div className="relative mb-4">
              <Search className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 ${muted}`} />
              <input
                value={busquedaProducto}
                onChange={e => setBusquedaProducto(e.target.value)}
                placeholder="Buscar por nombre, ID o código..."
                className={`w-full pl-10 pr-4 py-2.5 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${input}`}
              />
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className={darkMode ? 'bg-slate-700/60' : 'bg-gray-50'}>
                  <tr>
                    {['Producto', 'Categoría', 'Precio', 'Código actual', 'Acción'].map(h => (
                      <th key={h} className="px-4 py-3 text-left font-semibold">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className={`divide-y ${darkMode ? 'divide-slate-700' : 'divide-gray-100'}`}>
                  {productosFiltrados.length === 0 ? (
                    <tr>
                      <td colSpan={5} className={`px-4 py-10 text-center ${muted}`}>
                        {busquedaProducto ? 'Sin resultados' : 'No hay productos'}
                      </td>
                    </tr>
                  ) : productosFiltrados.map(p => (
                    <tr key={p.id} className={darkMode ? 'hover:bg-slate-700/40' : 'hover:bg-gray-50'}>
                      <td className="px-4 py-3 font-medium">{p.nombre}</td>
                      <td className={`px-4 py-3 ${muted}`}>{p.categoria || '—'}</td>
                      <td className="px-4 py-3 font-semibold">${p.precio.toLocaleString('es-CO')}</td>
                      <td className="px-4 py-3">
                        {p.codigo
                          ? <span className="font-mono text-xs bg-green-100 text-green-800 px-2 py-1 rounded-lg">{p.codigo}</span>
                          : <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded-lg">Sin código</span>}
                      </td>
                      <td className="px-4 py-3">
                        {!p.codigo ? (
                          <button
                            onClick={() => handleGenerarYAsignar(p)}
                            disabled={loading}
                            className="bg-blue-600 text-white px-3 py-1 rounded-lg text-xs font-semibold hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1"
                          >
                            <Plus className="w-3 h-3" /> Generar
                          </button>
                        ) : (
                          <button
                            onClick={() => handleImprimirEtiquetaProducto(p)}
                            className="bg-purple-600 text-white px-3 py-1 rounded-lg text-xs font-semibold hover:bg-purple-700 flex items-center gap-1"
                          >
                            <Printer className="w-3 h-3" /> Imprimir
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════
            VISTA: CATEGORÍAS
        ═══════════════════════════════════════════════════════════ */}
        {vistaActual === 'categorias' && (
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">

            {/* Formulario */}
            <div className={`lg:col-span-2 ${card} rounded-xl shadow-sm p-6 h-fit`}>
              <h2 className="text-lg font-bold mb-5 flex items-center gap-2">
                <FolderPlus className="w-5 h-5 text-teal-500" />
                {editandoCat ? 'Editar categoría' : 'Nueva categoría'}
              </h2>

              <div className="space-y-4">
                <div>
                  <label className={`block text-xs font-semibold uppercase tracking-wide mb-1.5 ${muted}`}>Nombre *</label>
                  <input
                    type="text"
                    value={formCat.nombre}
                    onChange={e => setFormCat(f => ({ ...f, nombre: e.target.value }))}
                    placeholder="Ej: Bebidas, Electrónica..."
                    className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 ${input}`}
                  />
                </div>

                <div>
                  <label className={`block text-xs font-semibold uppercase tracking-wide mb-2 ${muted}`}>Color</label>
                  <div className="grid grid-cols-6 gap-2">
                    {COLORES_CATEGORIA.map(color => (
                      <button
                        key={color}
                        type="button"
                        onClick={() => setFormCat(f => ({ ...f, color }))}
                        className={`w-8 h-8 rounded-full transition-transform hover:scale-110 ${formCat.color === color ? 'ring-2 ring-offset-2 ring-blue-500 scale-110' : ''}`}
                        style={{ background: color }}
                      />
                    ))}
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <span className="w-4 h-4 rounded-full shrink-0" style={{ background: formCat.color }} />
                    <span className={`text-xs ${muted}`}>Color seleccionado: <span className="font-mono">{formCat.color}</span></span>
                  </div>
                </div>

                <div className="flex gap-2">
                  {editandoCat && (
                    <button
                      type="button"
                      onClick={() => { setEditandoCat(null); setFormCat({ nombre: '', color: COLORES_CATEGORIA[0] }); }}
                      className={`flex-1 py-2.5 rounded-xl border text-sm font-semibold ${darkMode ? 'border-slate-600 text-slate-400 hover:bg-slate-700' : 'border-gray-300 text-gray-600 hover:bg-gray-50'}`}
                    >
                      Cancelar
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleGuardarCategoria}
                    className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-teal-600 to-teal-700 text-white text-sm font-semibold hover:from-teal-700 hover:to-teal-800 flex items-center justify-center gap-2"
                  >
                    <Check className="w-4 h-4" />
                    {editandoCat ? 'Guardar cambios' : 'Crear categoría'}
                  </button>
                </div>
              </div>
            </div>

            {/* Lista */}
            <div className={`lg:col-span-3 ${card} rounded-xl shadow-sm p-6`}>
              <h2 className="text-lg font-bold mb-5">
                Categorías activas
                <span className={`ml-2 text-sm font-normal ${muted}`}>({categorias.length})</span>
              </h2>

              {categorias.length === 0 ? (
                <div className={`text-center py-16 border-2 border-dashed rounded-xl ${darkMode ? 'border-slate-600' : 'border-gray-200'}`}>
                  <Tag className={`w-12 h-12 mx-auto mb-3 ${muted}`} />
                  <p className={`text-sm ${muted}`}>Sin categorías. Crea la primera usando el formulario.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {categorias.map(cat => (
                    <div
                      key={cat.id}
                      className={`flex items-center justify-between px-4 py-3 rounded-xl border ${darkMode ? 'border-slate-600 hover:bg-slate-700/40' : 'border-gray-200 hover:bg-gray-50'} transition-colors`}
                    >
                      <div className="flex items-center gap-3">
                        <span className="w-4 h-4 rounded-full shrink-0" style={{ background: cat.color }} />
                        <span className="font-medium">{cat.nombre}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleEditarCategoria(cat)}
                          className={`p-1.5 rounded-lg ${darkMode ? 'hover:bg-slate-600' : 'hover:bg-gray-200'} transition-colors`}
                          title="Editar"
                        >
                          <Pencil className="w-3.5 h-3.5 text-blue-500" />
                        </button>
                        {confirmEliminarCat === cat.id ? (
                          <div className="flex items-center gap-1 ml-1">
                            <button
                              onClick={() => handleEliminarCategoria(cat.id)}
                              className="px-2 py-1 rounded-lg bg-red-600 text-white text-xs font-semibold hover:bg-red-700"
                            >
                              Confirmar
                            </button>
                            <button
                              onClick={() => setConfirmEliminarCat(null)}
                              className={`px-2 py-1 rounded-lg text-xs font-semibold ${darkMode ? 'bg-slate-600 text-slate-300' : 'bg-gray-200 text-gray-600'}`}
                            >
                              No
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setConfirmEliminarCat(cat.id)}
                            className={`p-1.5 rounded-lg ${darkMode ? 'hover:bg-slate-600' : 'hover:bg-gray-200'} transition-colors`}
                            title="Eliminar"
                          >
                            <Trash2 className="w-3.5 h-3.5 text-red-500" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════
            VISTA: PLANTILLAS
        ═══════════════════════════════════════════════════════════ */}
        {vistaActual === 'plantillas' && (
          <div className={`${card} rounded-xl shadow-sm p-6`}>
            <h2 className="text-lg font-bold mb-5">Plantillas de etiquetas</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {plantillas.map(p => (
                <div key={p.id} className={`border rounded-xl p-4 ${darkMode ? 'border-slate-600' : 'border-gray-200'}`}>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-semibold">{p.nombre}</h3>
                    <FileText className="w-4 h-4 text-blue-500" />
                  </div>
                  <p className={`text-sm mb-3 ${muted}`}>{p.ancho}mm × {p.alto}mm</p>
                  <div className={`text-xs space-y-1 ${muted}`}>
                    <p>{p.campos.some(c => c.tipo === 'precio') ? '✓' : '✗'} Precio</p>
                    <p>{p.campos.some(c => c.tipo === 'nombre') ? '✓' : '✗'} Nombre</p>
                    <p>{p.campos.some(c => c.tipo === 'codigo_barras') ? '✓' : '✗'} Código de barras</p>
                  </div>
                </div>
              ))}
            </div>

            <div className={`mt-6 p-4 rounded-xl flex items-start gap-3 ${darkMode ? 'bg-blue-900/20 border border-blue-800' : 'bg-blue-50 border border-blue-200'}`}>
              <AlertCircle className="w-5 h-5 text-blue-500 mt-0.5 shrink-0" />
              <div>
                <p className={`font-semibold text-sm mb-0.5 ${darkMode ? 'text-blue-300' : 'text-blue-900'}`}>Impresión térmica</p>
                <p className={`text-xs ${darkMode ? 'text-blue-200/80' : 'text-blue-800'}`}>
                  Plantillas optimizadas para impresoras térmicas de 58mm y 80mm.
                  La impresora se selecciona en Configuración → Periféricos → Sección "Códigos de barras".
                </p>
              </div>
            </div>
          </div>
        )}

      </div>

      {/* ═════════════════════════════════════════════════════════════
          MODAL: ¿Añadir producto al inventario?
      ═════════════════════════════════════════════════════════════ */}
      {showModalProducto && pendingProducto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className={`w-full max-w-md rounded-2xl shadow-2xl overflow-hidden ${darkMode ? 'bg-slate-800 border border-slate-700' : 'bg-white border border-gray-200'}`}>

            {/* Header */}
            <div className="bg-gradient-to-r from-blue-600 to-cyan-600 p-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                  <Package className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="text-white font-bold text-lg leading-tight">¿Añadir al inventario del POS?</h3>
                  <p className="text-blue-100 text-sm">El escáner podrá encontrar este producto</p>
                </div>
              </div>
            </div>

            {/* Body */}
            <div className="p-6">
              <div className={`rounded-xl border p-4 mb-5 space-y-2.5 ${darkMode ? 'bg-slate-700/50 border-slate-600' : 'bg-slate-50 border-slate-200'}`}>
                {[
                  { label: 'Producto', value: pendingProducto.nombre, className: 'font-semibold' },
                  { label: 'Código', value: pendingProducto.codigo, className: 'font-mono text-blue-500 font-bold' },
                  { label: 'Categoría', value: pendingProducto.categoria || '—', className: '' },
                  { label: 'Precio', value: `$${pendingProducto.precio.toLocaleString('es-CO')}`, className: 'text-emerald-500 font-bold' },
                  { label: 'Stock inicial', value: '0 unidades (editable en inventario)', className: muted },
                  { label: 'Costo', value: '$0 (editable en inventario)', className: muted },
                ].map(row => (
                  <div key={row.label} className="flex justify-between items-center gap-2">
                    <span className={`text-xs ${muted}`}>{row.label}</span>
                    <span className={`text-sm text-right ${row.className}`}>{row.value}</span>
                  </div>
                ))}
              </div>

              <p className={`text-xs mb-5 ${muted}`}>
                El producto quedará en el inventario con stock 0 y costo $0. Puedes ajustar estos valores desde el módulo <strong>Gestión de Inventario</strong>.
              </p>

              <div className="flex gap-3">
                <button
                  onClick={() => { setShowModalProducto(false); setPendingProducto(null); }}
                  className={`flex-1 py-2.5 rounded-xl border text-sm font-semibold transition-colors ${darkMode ? 'border-slate-600 text-slate-400 hover:bg-slate-700' : 'border-gray-300 text-gray-600 hover:bg-gray-50'}`}
                >
                  Solo imprimir
                </button>
                <button
                  onClick={handleConfirmarAgregarProducto}
                  className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 text-white text-sm font-semibold hover:from-blue-700 hover:to-cyan-700 flex items-center justify-center gap-2"
                >
                  <Check className="w-4 h-4" />
                  Añadir al inventario
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Cerrar dropdown al hacer clic fuera */}
      {showCatDropdown && (
        <div className="fixed inset-0 z-10" onClick={() => setShowCatDropdown(false)} />
      )}
    </div>
  );
}
