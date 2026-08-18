/**
 * 🏪 PÁGINA MULTI-TIENDA — CODEC POS v2.0
 * Gestión de tiendas, stock por sucursal y transferencias de inventario.
 * 100% offline — localStorage
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Store, Plus, Edit, Trash2, ArrowLeftRight, Package,
  TrendingUp, MapPin, Phone, X, Check, ChevronRight,
  RefreshCw, AlertTriangle, Info, History, Search,
  Building2, Boxes, MoveRight, Star, BarChart3, Settings,
  CheckCircle2, XCircle, Hash, Layers,
} from 'lucide-react';
import {
  Tienda, Transferencia, ItemTransferencia,
  listarTiendas, listarTransferencias,
  ejecutarTransferencia, getEstadisticasMultitienda,
  productosConStockDeTienda,
} from '../lib/multitiendaService';
import { useMultitienda } from '../contexts/MultitiendaContext';
import { toast } from 'sonner';
import { usePOS } from '../contexts/POSContext';

// ──────────────────────────────────────────────
//  HELPERS
// ──────────────────────────────────────────────

const COLORES_PRESET = [
  '#10b981', '#3b82f6', '#8b5cf6', '#f59e0b',
  '#ef4444', '#06b6d4', '#ec4899', '#84cc16',
];
const EMOJIS_PRESET = ['🏪', '🏬', '🏦', '🛒', '🏢', '🏭', '🏠', '🌟'];

function fmt(n: number) { return n.toLocaleString('es-CO'); }

// ──────────────────────────────────────────────
//  MODAL: CREAR / EDITAR TIENDA
// ──────────────────────────────────────────────

interface ModalTiendaProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  tiendaEditar?: Tienda | null;
}

function ModalTienda({ isOpen, onClose, onSuccess, tiendaEditar }: ModalTiendaProps) {
  const { crearNuevaTienda, editarTienda } = useMultitienda();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    nombre: '',
    direccion: '',
    telefono: '',
    color: '#10b981',
    emoji: '🏪',
    notas: '',
  });

  useEffect(() => {
    if (isOpen) {
      if (tiendaEditar) {
        setForm({
          nombre: tiendaEditar.nombre,
          direccion: tiendaEditar.direccion,
          telefono: tiendaEditar.telefono,
          color: tiendaEditar.color,
          emoji: tiendaEditar.emoji,
          notas: tiendaEditar.notas || '',
        });
      } else {
        setForm({ nombre: '', direccion: '', telefono: '', color: '#10b981', emoji: '🏪', notas: '' });
      }
    }
  }, [isOpen, tiendaEditar]);

  const handleSubmit = async () => {
    if (!form.nombre.trim()) { toast.error('El nombre es obligatorio'); return; }
    setLoading(true);
    try {
      if (tiendaEditar) {
        editarTienda(tiendaEditar.id, form);
        toast.success('✅ Tienda actualizada');
      } else {
        crearNuevaTienda(form);
        toast.success('✅ Tienda creada exitosamente');
      }
      onSuccess();
      onClose();
    } catch (e: any) {
      toast.error(e?.message || 'Error al guardar tienda');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-md" onClick={onClose} />
      <div className="relative w-full max-w-lg animate-in fade-in zoom-in-95 duration-200">
        <div className="relative rounded-3xl shadow-2xl border border-white/10 max-h-[90vh] flex flex-col"
          style={{ background: 'linear-gradient(135deg, rgba(15,23,42,0.97) 0%, rgba(20,30,60,0.97) 100%)' }}>

          {/* Header (con overflow-hidden propio: antes lo recortaba el
              contenedor exterior, pero ese ya no puede tener overflow-hidden
              porque el cuerpo de abajo necesita poder hacer scroll) */}
          <div className="relative p-6 flex items-center justify-between border-b border-white/10 rounded-t-3xl shrink-0 overflow-hidden"
            style={{ background: `linear-gradient(135deg, ${form.color}30, ${form.color}10)` }}>
            {/* Destello */}
            <div className="absolute top-0 right-0 w-48 h-48 rounded-full blur-3xl pointer-events-none"
              style={{ background: `${form.color}20` }} />
            <div className="relative flex items-center gap-3">
              <div className="text-4xl">{form.emoji}</div>
              <div>
                <h2 className="text-xl font-bold text-white">
                  {tiendaEditar ? 'Editar Tienda' : 'Nueva Tienda'}
                </h2>
                <p className="text-white/50 text-sm">CODEC POS Multi-Tienda</p>
              </div>
            </div>
            <button onClick={onClose} className="text-white/50 hover:text-white p-2 rounded-xl hover:bg-white/10 transition-all">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Body — con scroll propio: antes el popup no cabía en pantallas
              bajas (o con teclado abierto) y no había forma de llegar a los
              botones de abajo, porque nada en este modal tenía overflow. */}
          <div className="p-6 space-y-5 overflow-y-auto flex-1 min-h-0">
            {/* Nombre */}
            <div>
              <label className="block text-sm font-semibold text-white/80 mb-2">
                Nombre de la Tienda <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={form.nombre}
                onChange={e => setForm({ ...form, nombre: e.target.value })}
                className="w-full px-4 py-3 rounded-xl bg-white/10 border border-white/20 text-white placeholder-white/30 focus:outline-none focus:border-blue-400 transition-all"
                placeholder="Ej: Sucursal Centro, Bodega Norte..."
                autoFocus
              />
            </div>

            {/* Dirección + Teléfono */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-white/80 mb-2">Dirección</label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                  <input
                    type="text"
                    value={form.direccion}
                    onChange={e => setForm({ ...form, direccion: e.target.value })}
                    className="w-full pl-10 pr-3 py-3 rounded-xl bg-white/10 border border-white/20 text-white placeholder-white/30 focus:outline-none focus:border-blue-400 transition-all"
                    placeholder="Cra 10 # 20-30"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-white/80 mb-2">Teléfono</label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                  <input
                    type="tel"
                    value={form.telefono}
                    onChange={e => setForm({ ...form, telefono: e.target.value })}
                    className="w-full pl-10 pr-3 py-3 rounded-xl bg-white/10 border border-white/20 text-white placeholder-white/30 focus:outline-none focus:border-blue-400 transition-all"
                    placeholder="300 000 0000"
                  />
                </div>
              </div>
            </div>

            {/* Color */}
            <div>
              <label className="block text-sm font-semibold text-white/80 mb-2">Color de acento</label>
              <div className="flex items-center gap-3 flex-wrap">
                {COLORES_PRESET.map(c => (
                  <button
                    key={c}
                    onClick={() => setForm({ ...form, color: c })}
                    className={`w-8 h-8 rounded-full transition-all ${form.color === c ? 'scale-125 ring-2 ring-white ring-offset-2 ring-offset-slate-900' : 'hover:scale-110'}`}
                    style={{ background: c }}
                  />
                ))}
                <input
                  type="color"
                  value={form.color}
                  onChange={e => setForm({ ...form, color: e.target.value })}
                  className="w-8 h-8 rounded-full cursor-pointer border-0 bg-transparent"
                  title="Color personalizado"
                />
              </div>
            </div>

            {/* Emoji */}
            <div>
              <label className="block text-sm font-semibold text-white/80 mb-2">Ícono</label>
              <div className="flex items-center gap-2 flex-wrap">
                {EMOJIS_PRESET.map(e => (
                  <button
                    key={e}
                    onClick={() => setForm({ ...form, emoji: e })}
                    className={`text-2xl p-2 rounded-xl transition-all ${form.emoji === e ? 'bg-white/20 scale-110' : 'hover:bg-white/10'}`}
                  >
                    {e}
                  </button>
                ))}
              </div>
            </div>

            {/* Notas */}
            <div>
              <label className="block text-sm font-semibold text-white/80 mb-2">Notas (Opcional)</label>
              <textarea
                value={form.notas}
                onChange={e => setForm({ ...form, notas: e.target.value })}
                rows={2}
                className="w-full px-4 py-3 rounded-xl bg-white/10 border border-white/20 text-white placeholder-white/30 focus:outline-none focus:border-blue-400 transition-all resize-none"
                placeholder="Descripción, horario, responsable..."
              />
            </div>

            {/* Botones */}
            <div className="flex gap-3 pt-2 border-t border-white/10">
              <button onClick={onClose} className="flex-1 py-3 rounded-xl bg-white/10 hover:bg-white/15 text-white/70 hover:text-white font-semibold transition-all">
                Cancelar
              </button>
              <button
                onClick={handleSubmit}
                disabled={loading}
                className="flex-1 py-3 rounded-xl text-white font-bold transition-all shadow-lg flex items-center justify-center gap-2 disabled:opacity-50"
                style={{ background: `linear-gradient(135deg, ${form.color}, ${form.color}cc)` }}
              >
                {loading
                  ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  : <Check className="w-4 h-4" />
                }
                {tiendaEditar ? 'Actualizar' : 'Crear Tienda'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────
//  MODAL: TRANSFERIR INVENTARIO
// ──────────────────────────────────────────────

interface ModalTransferenciaProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  tiendas: Tienda[];
  tiendaOrigenDefault?: string;
}

interface ItemForm {
  productoId: string;
  productoNombre: string;
  productoCodigo: string;
  cantidad: string;
  stockDisponible: number;
}

function ModalTransferencia({ isOpen, onClose, onSuccess, tiendas, tiendaOrigenDefault }: ModalTransferenciaProps) {
  const [tiendaOrigen, setTiendaOrigen] = useState(tiendaOrigenDefault || '');
  const [tiendaDestino, setTiendaDestino] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [productosDisp, setProductosDisp] = useState<any[]>([]);
  const [items, setItems] = useState<ItemForm[]>([]);
  const [notas, setNotas] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setTiendaOrigen(tiendaOrigenDefault || tiendas[0]?.id || '');
      setTiendaDestino('');
      setItems([]);
      setNotas('');
      setBusqueda('');
    }
  }, [isOpen, tiendaOrigenDefault, tiendas]);

  useEffect(() => {
    if (tiendaOrigen) {
      setProductosDisp(productosConStockDeTienda(tiendaOrigen));
      setItems([]);
    }
  }, [tiendaOrigen]);

  const productosFiltrados = productosDisp.filter(p =>
    !busqueda ||
    p.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
    p.codigo.includes(busqueda)
  );

  const agregarItem = (producto: any) => {
    if (items.find(i => i.productoId === producto.id)) {
      toast.info('Ese producto ya está en la lista');
      return;
    }
    if (producto.stock <= 0) {
      toast.error(`Sin stock de "${producto.nombre}" en la tienda origen`);
      return;
    }
    setItems(prev => [...prev, {
      productoId: producto.id,
      productoNombre: producto.nombre,
      productoCodigo: producto.codigo,
      cantidad: '1',
      stockDisponible: producto.stock,
    }]);
  };

  const actualizarCantidad = (productoId: string, valor: string) => {
    setItems(prev => prev.map(i => i.productoId === productoId ? { ...i, cantidad: valor } : i));
  };

  const quitarItem = (productoId: string) => {
    setItems(prev => prev.filter(i => i.productoId !== productoId));
  };

  const handleTransferir = async () => {
    if (!tiendaOrigen) { toast.error('Selecciona la tienda origen'); return; }
    if (!tiendaDestino) { toast.error('Selecciona la tienda destino'); return; }
    if (tiendaOrigen === tiendaDestino) { toast.error('Origen y destino no pueden ser iguales'); return; }
    if (items.length === 0) { toast.error('Agrega al menos un producto'); return; }

    for (const item of items) {
      const cant = parseInt(item.cantidad);
      if (!cant || cant <= 0) { toast.error(`Cantidad inválida para "${item.productoNombre}"`); return; }
      if (cant > item.stockDisponible) {
        toast.error(`Stock insuficiente para "${item.productoNombre}" (disponible: ${item.stockDisponible})`);
        return;
      }
    }

    setLoading(true);
    try {
      ejecutarTransferencia({
        tiendaOrigenId: tiendaOrigen,
        tiendaDestinoId: tiendaDestino,
        items: items.map(i => ({ productoId: i.productoId, cantidad: parseInt(i.cantidad) })),
        notas,
      });
      toast.success(`✅ Transferencia completada — ${items.length} producto(s) movido(s)`);
      onSuccess();
      onClose();
    } catch (e: any) {
      toast.error(e?.message || 'Error al transferir');
    } finally {
      setLoading(false);
    }
  };

  const origenInfo = tiendas.find(t => t.id === tiendaOrigen);
  const destinoInfo = tiendas.find(t => t.id === tiendaDestino);

  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-md" onClick={onClose} />
      <div className="relative w-full max-w-3xl max-h-[92vh] overflow-y-auto animate-in fade-in zoom-in-95 duration-200">
        <div className="rounded-3xl overflow-hidden shadow-2xl border border-white/10"
          style={{ background: 'linear-gradient(135deg, rgba(15,23,42,0.98) 0%, rgba(20,30,60,0.98) 100%)' }}>

          {/* Header */}
          <div className="bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="bg-white/20 p-3 rounded-2xl"><ArrowLeftRight className="w-6 h-6 text-white" /></div>
                <div>
                  <h2 className="text-xl font-bold text-white">Transferir Inventario</h2>
                  <p className="text-blue-100 text-sm">Mueve stock entre tiendas</p>
                </div>
              </div>
              <button onClick={onClose} className="text-white/50 hover:text-white p-2 rounded-xl hover:bg-white/10 transition-all">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Selector Origen → Destino */}
            <div className="mt-5 flex items-center gap-3">
              <div className="flex-1">
                <label className="text-blue-200 text-xs font-semibold mb-1 block">Tienda Origen</label>
                <select
                  value={tiendaOrigen}
                  onChange={e => setTiendaOrigen(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-white/20 border border-white/30 text-white focus:outline-none focus:border-white backdrop-blur-sm appearance-none"
                >
                  <option value="" className="bg-slate-800">Seleccionar origen...</option>
                  {tiendas.map(t => (
                    <option key={t.id} value={t.id} className="bg-slate-800">
                      {t.emoji} {t.nombre}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col items-center gap-1 mt-5">
                <div className="bg-white/20 p-2 rounded-xl"><MoveRight className="w-5 h-5 text-white" /></div>
              </div>
              <div className="flex-1">
                <label className="text-blue-200 text-xs font-semibold mb-1 block">Tienda Destino</label>
                <select
                  value={tiendaDestino}
                  onChange={e => setTiendaDestino(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-white/20 border border-white/30 text-white focus:outline-none focus:border-white backdrop-blur-sm appearance-none"
                >
                  <option value="" className="bg-slate-800">Seleccionar destino...</option>
                  {tiendas.filter(t => t.id !== tiendaOrigen).map(t => (
                    <option key={t.id} value={t.id} className="bg-slate-800">
                      {t.emoji} {t.nombre}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="p-6 grid grid-cols-2 gap-6">
            {/* Panel izquierdo: Seleccionar productos */}
            <div className="space-y-4">
              <h3 className="font-bold text-white/90 flex items-center gap-2">
                <Package className="w-4 h-4 text-blue-400" />
                Productos disponibles
                {origenInfo && <span className="text-xs text-white/40 font-normal">— {origenInfo.emoji} {origenInfo.nombre}</span>}
              </h3>

              {tiendaOrigen ? (
                <>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                    <input
                      type="text"
                      value={busqueda}
                      onChange={e => setBusqueda(e.target.value)}
                      placeholder="Buscar producto..."
                      className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-white/10 border border-white/20 text-white placeholder-white/30 focus:outline-none focus:border-blue-400 transition-all text-sm"
                    />
                  </div>
                  <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
                    {productosFiltrados.length === 0 ? (
                      <div className="text-center py-8 text-white/30 text-sm">
                        <Package className="w-8 h-8 mx-auto mb-2 opacity-30" />
                        No hay productos con stock
                      </div>
                    ) : productosFiltrados.map(p => (
                      <button
                        key={p.id}
                        onClick={() => agregarItem(p)}
                        disabled={p.stock <= 0 || !!items.find(i => i.productoId === p.id)}
                        className={`w-full flex items-center justify-between p-3 rounded-xl text-left transition-all text-sm ${
                          items.find(i => i.productoId === p.id)
                            ? 'bg-blue-500/20 border border-blue-500/40 opacity-60 cursor-default'
                            : p.stock <= 0
                            ? 'bg-white/5 border border-white/5 opacity-40 cursor-not-allowed'
                            : 'bg-white/5 border border-white/10 hover:bg-blue-500/10 hover:border-blue-500/30 cursor-pointer'
                        }`}
                      >
                        <div>
                          <p className="font-semibold text-white truncate max-w-[140px]">{p.nombre}</p>
                          <p className="text-white/40 text-xs">{p.codigo}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <span className={`font-bold text-sm ${p.stock > 5 ? 'text-green-400' : p.stock > 0 ? 'text-yellow-400' : 'text-red-400'}`}>
                            {p.stock}
                          </span>
                          <p className="text-white/30 text-xs">unid.</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-white/30">
                  <Store className="w-12 h-12 mb-3 opacity-30" />
                  <p className="text-sm">Selecciona la tienda origen</p>
                </div>
              )}
            </div>

            {/* Panel derecho: Items a transferir */}
            <div className="space-y-4">
              <h3 className="font-bold text-white/90 flex items-center gap-2">
                <Layers className="w-4 h-4 text-violet-400" />
                Items a transferir
                {items.length > 0 && (
                  <span className="ml-auto text-xs bg-violet-500/20 text-violet-300 px-2 py-0.5 rounded-full font-bold">
                    {items.length}
                  </span>
                )}
              </h3>

              {items.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-white/30 border-2 border-dashed border-white/10 rounded-2xl">
                  <ArrowLeftRight className="w-10 h-10 mb-2 opacity-30" />
                  <p className="text-sm text-center">Selecciona productos<br />del panel izquierdo</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                  {items.map(item => (
                    <div key={item.productoId} className="flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-white/10">
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-white text-sm truncate">{item.productoNombre}</p>
                        <p className="text-white/40 text-xs">Stock: {item.stockDisponible}</p>
                      </div>
                      <input
                        type="number"
                        value={item.cantidad}
                        onChange={e => actualizarCantidad(item.productoId, e.target.value)}
                        min="1"
                        max={item.stockDisponible}
                        className="w-16 px-2 py-1.5 rounded-lg bg-white/10 border border-white/20 text-white text-center text-sm focus:outline-none focus:border-blue-400"
                      />
                      <button onClick={() => quitarItem(item.productoId)} className="text-white/30 hover:text-red-400 transition-all">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Notas */}
              <div>
                <label className="block text-sm font-semibold text-white/80 mb-1.5">Notas (Opcional)</label>
                <textarea
                  value={notas}
                  onChange={e => setNotas(e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2.5 rounded-xl bg-white/10 border border-white/20 text-white placeholder-white/30 focus:outline-none focus:border-blue-400 transition-all resize-none text-sm"
                  placeholder="Motivo de la transferencia..."
                />
              </div>

              {/* Resumen */}
              {items.length > 0 && origenInfo && destinoInfo && (
                <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/20 text-xs text-blue-300 space-y-1">
                  <div className="flex items-center gap-2">
                    <span>{origenInfo.emoji}</span>
                    <span className="font-semibold">{origenInfo.nombre}</span>
                    <MoveRight className="w-3 h-3" />
                    <span>{destinoInfo.emoji}</span>
                    <span className="font-semibold">{destinoInfo.nombre}</span>
                  </div>
                  <p>{items.length} producto(s) · {items.reduce((s, i) => s + (parseInt(i.cantidad) || 0), 0)} unidades totales</p>
                </div>
              )}

              <button
                onClick={handleTransferir}
                disabled={loading || items.length === 0 || !tiendaOrigen || !tiendaDestino}
                className="w-full py-3.5 rounded-xl bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white font-bold transition-all shadow-lg shadow-blue-500/30 flex items-center justify-center gap-2 disabled:opacity-40"
              >
                {loading
                  ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  : <ArrowLeftRight className="w-4 h-4" />
                }
                Ejecutar Transferencia
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────
//  TARJETA DE TIENDA
// ──────────────────────────────────────────────

interface TarjetaTiendaProps {
  tienda: Tienda;
  stats: { totalStock: number; productosConStock: number; transfsEnviadas: number; transfsRecibidas: number };
  esActiva: boolean;
  onSeleccionar: () => void;
  onEditar: () => void;
  onEliminar: () => void;
  onTransferir: () => void;
}

function TarjetaTienda({ tienda, stats, esActiva, onSeleccionar, onEditar, onEliminar, onTransferir }: TarjetaTiendaProps) {
  const { darkMode } = usePOS();
  const dm = (d: string, l: string) => darkMode ? d : l;
  return (
    <div
      className={`relative overflow-hidden rounded-2xl border transition-all cursor-pointer group ${
        esActiva
          ? 'border-2 shadow-2xl scale-[1.01]'
          : `${dm('border-white/10 hover:border-white/25', 'border-gray-200 hover:border-gray-300')} hover:scale-[1.01]`
      } ${dm('bg-white/5 backdrop-blur-xl', 'bg-white shadow-sm')}`}
      style={{
        borderColor: esActiva ? tienda.color : undefined,
        boxShadow: esActiva ? `0 8px 32px ${tienda.color}30` : undefined,
      }}
      onClick={onSeleccionar}
    >
      {/* Barra lateral de color */}
      <div className="absolute left-0 top-0 bottom-0 w-1 rounded-l-2xl" style={{ background: tienda.color }} />

      {/* Badge activa */}
      {esActiva && (
        <div className="absolute top-3 right-3 flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold text-white"
          style={{ background: `${tienda.color}cc` }}>
          <Star className="w-3 h-3" /> Activa
        </div>
      )}

      {tienda.esPrincipal && (
        <div className={`absolute top-3 right-3 flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold text-white ${dm('bg-slate-600', 'bg-slate-500')}`}>
          Principal
        </div>
      )}

      <div className="relative p-5 pl-6">
        {/* Cabecera */}
        <div className="flex items-start gap-3 mb-4">
          <div className="text-3xl">{tienda.emoji}</div>
          <div className="flex-1 min-w-0 pr-16">
            <h3 className={`font-bold text-lg leading-tight ${dm('text-white', 'text-gray-900')}`}>{tienda.nombre}</h3>
            {tienda.direccion && (
              <p className={`text-xs flex items-center gap-1 mt-0.5 ${dm('text-white/50', 'text-gray-500')}`}>
                <MapPin className="w-3 h-3" />{tienda.direccion}
              </p>
            )}
            {tienda.telefono && (
              <p className={`text-xs flex items-center gap-1 mt-0.5 ${dm('text-white/50', 'text-gray-500')}`}>
                <Phone className="w-3 h-3" />{tienda.telefono}
              </p>
            )}
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: 'Stock total', value: fmt(stats.totalStock), color: 'text-emerald-400' },
            { label: 'Productos', value: fmt(stats.productosConStock), color: 'text-blue-400' },
            { label: 'Enviadas', value: fmt(stats.transfsEnviadas), color: 'text-orange-400' },
            { label: 'Recibidas', value: fmt(stats.transfsRecibidas), color: 'text-purple-400' },
          ].map((s, i) => (
            <div key={i} className={`text-center p-2 rounded-xl ${dm('bg-white/5', 'bg-gray-50 border border-gray-100')}`}>
              <p className={`font-black text-lg ${s.color}`}>{s.value}</p>
              <p className={`text-xs leading-tight mt-0.5 ${dm('text-white/40', 'text-gray-400')}`}>{s.label}</p>
            </div>
          ))}
        </div>

        {/* Acciones */}
        <div className={`flex items-center gap-2 mt-4 pt-4 border-t ${dm('border-white/10', 'border-gray-100')}`}>
          <button
            onClick={e => { e.stopPropagation(); onTransferir(); }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-500/20 hover:bg-blue-500/30 text-blue-500 text-xs font-bold transition-all"
          >
            <ArrowLeftRight className="w-3.5 h-3.5" /> Transferir
          </button>
          <button
            onClick={e => { e.stopPropagation(); onEditar(); }}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all ${dm('bg-white/10 hover:bg-white/15 text-white/70', 'bg-gray-100 hover:bg-gray-200 text-gray-600')}`}
          >
            <Edit className="w-3.5 h-3.5" /> Editar
          </button>
          {!tienda.esPrincipal && (
            <button
              onClick={e => { e.stopPropagation(); onEliminar(); }}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-500 text-xs font-semibold transition-all ml-auto"
            >
              <Trash2 className="w-3.5 h-3.5" /> Eliminar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────
//  HISTORIAL DE TRANSFERENCIAS
// ──────────────────────────────────────────────

function HistorialTransferencias({ tiendas }: { tiendas: Tienda[] }) {
  const [historial, setHistorial] = useState<Transferencia[]>([]);
  const [filtroTienda, setFiltroTienda] = useState('todas');
  const { darkMode } = usePOS();
  const dm = (d: string, l: string) => darkMode ? d : l;

  useEffect(() => {
    setHistorial(listarTransferencias(200));
  }, []);

  const filtrado = historial.filter(t =>
    filtroTienda === 'todas' ||
    t.tiendaOrigenId === filtroTienda ||
    t.tiendaDestinoId === filtroTienda
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <select
          value={filtroTienda}
          onChange={e => setFiltroTienda(e.target.value)}
          className={`px-4 py-2.5 rounded-xl border focus:outline-none focus:border-blue-400 transition-all text-sm ${dm('bg-white/10 border-white/20 text-white', 'bg-white border-gray-300 text-gray-900')}`}
        >
          <option value="todas">Todas las tiendas</option>
          {tiendas.map(t => (
            <option key={t.id} value={t.id}>{t.emoji} {t.nombre}</option>
          ))}
        </select>
        <span className={`text-sm ${dm('text-white/40', 'text-gray-400')}`}>{filtrado.length} transferencias</span>
      </div>

      {filtrado.length === 0 ? (
        <div className={`text-center py-16 ${dm('text-white/30', 'text-gray-400')}`}>
          <History className="w-16 h-16 mx-auto mb-3 opacity-30" />
          <p className="text-lg font-semibold">Sin transferencias registradas</p>
          <p className="text-sm mt-1">Las transferencias ejecutadas aparecerán aquí</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtrado.map(t => {
            const origenColor = tiendas.find(ti => ti.id === t.tiendaOrigenId)?.color || '#64748b';
            const destinoColor = tiendas.find(ti => ti.id === t.tiendaDestinoId)?.color || '#64748b';
            return (
              <div key={t.id} className={`rounded-2xl border overflow-hidden ${dm('border-white/10 bg-white/5 backdrop-blur-xl', 'border-gray-200 bg-white shadow-sm')}`}>
                <div className={`flex items-center gap-4 p-4 border-b ${dm('border-white/5', 'border-gray-100')}`}>
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <span className="font-bold text-sm truncate" style={{ color: origenColor }}>
                      {tiendas.find(ti => ti.id === t.tiendaOrigenId)?.emoji} {t.tiendaOrigenNombre}
                    </span>
                    <ArrowLeftRight className={`w-4 h-4 shrink-0 ${dm('text-white/30', 'text-gray-300')}`} />
                    <span className="font-bold text-sm truncate" style={{ color: destinoColor }}>
                      {tiendas.find(ti => ti.id === t.tiendaDestinoId)?.emoji} {t.tiendaDestinoNombre}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <CheckCircle2 className="w-4 h-4 text-green-500" />
                    <span className="text-green-500 text-xs font-bold">Completada</span>
                    <span className={`text-xs ${dm('text-white/30', 'text-gray-400')}`}>
                      {new Date(t.fecha).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </div>
                <div className="px-4 py-3 flex flex-wrap gap-2">
                  {t.items.map((item, i) => (
                    <span key={i} className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs ${dm('bg-white/10 text-white/70', 'bg-gray-100 text-gray-600')}`}>
                      <Package className="w-3 h-3" />
                      {item.productoNombre}
                      <span className={`font-bold ${dm('text-white', 'text-gray-900')}`}>×{item.cantidad}</span>
                    </span>
                  ))}
                  {t.notas && (
                    <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-blue-500/10 text-blue-500 text-xs">
                      <Info className="w-3 h-3" />{t.notas}
                    </span>
                  )}
                </div>
                <div className={`px-4 pb-3 flex items-center justify-between text-xs ${dm('text-white/30', 'text-gray-400')}`}>
                  <span>Usuario: {t.usuario}</span>
                  <span>{t.totalItems} unidades totales · {t.items.length} producto(s)</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────
//  VISTA: INVENTARIO POR TIENDA
// ──────────────────────────────────────────────

function InventarioPorTienda({ tiendas }: { tiendas: Tienda[] }) {
  const { tiendaActual, cambiarTienda } = useMultitienda();
  const [productos, setProductos] = useState<any[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const { darkMode } = usePOS();
  const dm = (d: string, l: string) => darkMode ? d : l;

  useEffect(() => {
    if (tiendaActual) {
      setProductos(productosConStockDeTienda(tiendaActual.id));
    }
  }, [tiendaActual]);

  const filtrados = productos.filter(p =>
    !busqueda ||
    p.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
    p.codigo.includes(busqueda)
  );

  const totalStock = filtrados.reduce((s, p) => s + (p.stock || 0), 0);
  const sinStock = filtrados.filter(p => (p.stock || 0) <= 0).length;
  const stockBajo = filtrados.filter(p => (p.stock || 0) > 0 && (p.stock || 0) <= (p.minStock || 5)).length;

  return (
    <div className="space-y-5">
      {/* Selector de tienda */}
      <div className="flex items-center gap-3 flex-wrap">
        {tiendas.map(t => (
          <button
            key={t.id}
            onClick={() => cambiarTienda(t.id)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm transition-all border ${
              tiendaActual?.id === t.id
                ? 'text-white shadow-lg border-transparent'
                : dm('border-white/20 text-white/60 hover:text-white hover:bg-white/10', 'border-gray-300 text-gray-500 hover:text-gray-900 hover:bg-gray-100')
            }`}
            style={{
              background: tiendaActual?.id === t.id ? `linear-gradient(135deg, ${t.color}, ${t.color}cc)` : undefined,
              boxShadow: tiendaActual?.id === t.id ? `0 4px 20px ${t.color}40` : undefined,
            }}
          >
            <span>{t.emoji}</span>
            {t.nombre}
          </button>
        ))}
      </div>

      {/* Mini stats */}
      {tiendaActual && (
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: 'Stock total', value: fmt(totalStock), color: 'text-emerald-500', bgDark: 'bg-emerald-500/10 border-white/10', bgLight: 'bg-emerald-50 border-emerald-200' },
            { label: 'Stock bajo', value: fmt(stockBajo), color: 'text-yellow-500', bgDark: 'bg-yellow-500/10 border-white/10', bgLight: 'bg-yellow-50 border-yellow-200' },
            { label: 'Sin stock', value: fmt(sinStock), color: 'text-red-500', bgDark: 'bg-red-500/10 border-white/10', bgLight: 'bg-red-50 border-red-200' },
          ].map((s, i) => (
            <div key={i} className={`rounded-2xl p-4 border ${dm(s.bgDark, s.bgLight)}`}>
              <p className={`text-2xl font-black ${s.color}`}>{s.value}</p>
              <p className={`text-xs mt-1 ${dm('text-white/50', 'text-gray-500')}`}>{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Búsqueda */}
      <div className="relative">
        <Search className={`absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 ${dm('text-white/40', 'text-gray-400')}`} />
        <input
          type="text"
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          placeholder="Buscar producto..."
          className={`w-full pl-11 pr-4 py-3 rounded-xl border focus:outline-none focus:border-blue-400 transition-all ${dm('bg-white/10 border-white/20 text-white placeholder-white/30', 'bg-white border-gray-300 text-gray-900 placeholder-gray-400')}`}
        />
      </div>

      {/* Tabla */}
      <div className={`rounded-2xl border overflow-hidden ${dm('border-white/10', 'border-gray-200')}`}>
        <div className={`grid grid-cols-12 gap-4 px-5 py-3 text-xs font-semibold uppercase tracking-wide ${dm('bg-white/5 text-white/40', 'bg-gray-50 text-gray-500')}`}>
          <div className="col-span-1">#</div>
          <div className="col-span-2">Código</div>
          <div className="col-span-5">Nombre</div>
          <div className="col-span-2 text-right">Stock</div>
          <div className="col-span-2 text-right">Estado</div>
        </div>
        <div className={`divide-y max-h-96 overflow-y-auto ${dm('divide-white/5', 'divide-gray-100')}`}>
          {filtrados.length === 0 ? (
            <div className={`text-center py-10 ${dm('text-white/30', 'text-gray-400')}`}>
              <Package className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p>Sin productos</p>
            </div>
          ) : filtrados.map((p, i) => {
            const stockStatus =
              p.stock <= 0 ? { label: 'Sin stock', color: 'text-red-400 bg-red-500/10 border-red-500/20' } :
              p.stock <= (p.minStock || 5) ? { label: 'Stock bajo', color: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20' } :
              { label: 'OK', color: 'text-green-400 bg-green-500/10 border-green-500/20' };
            return (
              <div key={p.id} className={`grid grid-cols-12 gap-4 px-5 py-3 items-center transition-all ${dm('hover:bg-white/5', 'hover:bg-gray-50')}`}>
                <div className={`col-span-1 text-sm ${dm('text-white/30', 'text-gray-400')}`}>{i + 1}</div>
                <div className={`col-span-2 font-mono text-sm ${dm('text-white/60', 'text-gray-500')}`}>{p.codigo}</div>
                <div className="col-span-5">
                  <p className={`font-semibold text-sm ${dm('text-white', 'text-gray-900')}`}>{p.nombre}</p>
                  <p className={`text-xs ${dm('text-white/30', 'text-gray-400')}`}>{p.categoria}</p>
                </div>
                <div className="col-span-2 text-right">
                  <span className={`font-black text-lg ${
                    p.stock <= 0 ? 'text-red-400' : p.stock <= (p.minStock || 5) ? 'text-yellow-400' : dm('text-white', 'text-gray-900')
                  }`}>{p.stock}</span>
                </div>
                <div className="col-span-2 text-right">
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-bold border ${stockStatus.color}`}>
                    {stockStatus.label}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────
//  PÁGINA PRINCIPAL
// ──────────────────────────────────────────────

type Tab = 'tiendas' | 'inventario' | 'historial';

export default function MultitiendaPage() {
  const { tiendas, tiendaActual, cambiarTienda, recargarTiendas, borrarTienda } = useMultitienda();
  const { darkMode } = usePOS();
  const dm = (d: string, l: string) => darkMode ? d : l;
  const [tab, setTab] = useState<Tab>('tiendas');
  const [estadisticas, setEstadisticas] = useState<any>(null);
  const [modalTienda, setModalTienda] = useState(false);
  const [tiendaEditar, setTiendaEditar] = useState<Tienda | null>(null);
  const [modalTransferencia, setModalTransferencia] = useState(false);
  const [tiendaOrigenTransf, setTiendaOrigenTransf] = useState<string | undefined>(undefined);

  const cargarStats = useCallback(() => {
    setEstadisticas(getEstadisticasMultitienda());
    recargarTiendas();
  }, [recargarTiendas]);

  useEffect(() => { cargarStats(); }, [cargarStats]);

  const handleEliminarTienda = (tienda: Tienda) => {
    if (window.confirm(`¿Eliminar la tienda "${tienda.nombre}"? El stock asociado se perderá.`)) {
      try {
        borrarTienda(tienda.id);
        toast.success(`Tienda "${tienda.nombre}" eliminada`);
        cargarStats();
      } catch (e: any) {
        toast.error(e?.message || 'Error al eliminar');
      }
    }
  };

  const tabs: { id: Tab; label: string; icon: any }[] = [
    { id: 'tiendas', label: 'Mis Tiendas', icon: Store },
    { id: 'inventario', label: 'Inventario por Tienda', icon: Package },
    { id: 'historial', label: 'Historial de Movimientos', icon: History },
  ];

  return (
    <div className={`h-screen overflow-y-auto p-6 space-y-6 ${dm('', 'bg-gray-50')}`}>

      {/* ── HEADER ── */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-blue-700 via-indigo-700 to-violet-700 p-8 shadow-2xl">
        <div className="absolute inset-0 bg-black/10 backdrop-blur-sm" />
        <div className="absolute top-0 right-0 w-96 h-96 bg-white/10 rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-indigo-300/10 rounded-full blur-3xl" />
        <div className="absolute top-6 right-32 w-2 h-2 bg-blue-300 rounded-full animate-ping" />
        <div className="absolute top-16 right-52 w-1.5 h-1.5 bg-white rounded-full animate-pulse" />

        <div className="relative flex items-center justify-between flex-wrap gap-4">
          <div>
            <div className="flex items-center gap-4 mb-3">
              <div className="bg-white/20 p-4 rounded-2xl backdrop-blur-sm">
                <Building2 className="w-8 h-8 text-white" />
              </div>
              <div>
                <h1 className="text-4xl font-bold text-white flex items-center gap-3">
                  Multi-Tienda
                  <Layers className="w-7 h-7 text-blue-300" />
                </h1>
                <p className="text-white/70 text-lg mt-1">
                  Gestiona sucursales y transfiere inventario fácilmente
                </p>
              </div>
            </div>
            {/* Mini chips de tiendas */}
            <div className="flex items-center gap-2 flex-wrap">
              {tiendas.map(t => (
                <button
                  key={t.id}
                  onClick={() => cambiarTienda(t.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
                    tiendaActual?.id === t.id
                      ? 'bg-white text-indigo-700 shadow-lg'
                      : 'bg-white/15 text-white/80 hover:bg-white/25'
                  }`}
                >
                  {t.emoji} {t.nombre}
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-3 flex-wrap">
            <button
              onClick={() => { setModalTransferencia(true); setTiendaOrigenTransf(tiendaActual?.id); }}
              className="bg-white/20 hover:bg-white/30 backdrop-blur-sm text-white px-5 py-3 rounded-xl font-bold transition-all flex items-center gap-2 border border-white/30"
            >
              <ArrowLeftRight className="w-5 h-5" />
              Transferir
            </button>
            <button
              onClick={() => { setTiendaEditar(null); setModalTienda(true); }}
              className="bg-white text-indigo-700 hover:bg-white/90 px-6 py-3 rounded-xl font-bold transition-all shadow-xl flex items-center gap-2"
            >
              <Plus className="w-5 h-5" />
              Nueva Tienda
            </button>
          </div>
        </div>

        {/* Stats banner */}
        {estadisticas && (
          <div className="relative mt-6 grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: 'Tiendas Activas', value: estadisticas.totalTiendas, icon: Store },
              { label: 'Productos Catálogo', value: estadisticas.totalProductos, icon: Package },
              { label: 'Transferencias', value: estadisticas.totalTransferencias, icon: ArrowLeftRight },
              { label: 'Tienda Activa', value: tiendaActual?.nombre || '—', icon: Star },
            ].map((s, i) => (
              <div key={i} className="bg-white/10 backdrop-blur-sm rounded-2xl p-4 border border-white/10">
                <div className="flex items-center gap-2 mb-2">
                  <s.icon className="w-4 h-4 text-white/60" />
                  <span className="text-white/60 text-xs">{s.label}</span>
                </div>
                <p className="text-2xl font-black text-white">{s.value}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── TABS ── */}
      <div className={`flex items-center gap-2 rounded-2xl p-1.5 w-fit border ${dm('bg-white/5 backdrop-blur-xl border-white/10', 'bg-white border-gray-200 shadow-sm')}`}>
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm transition-all ${
              tab === t.id
                ? 'bg-gradient-to-r from-blue-500 to-indigo-600 text-white shadow-lg shadow-blue-500/30'
                : dm('text-white/50 hover:text-white hover:bg-white/10', 'text-gray-500 hover:text-gray-900 hover:bg-gray-100')
            }`}
          >
            <t.icon className="w-4 h-4" />
            {t.label}
          </button>
        ))}
      </div>

      {/* ── PESTAÑA: TIENDAS ── */}
      {tab === 'tiendas' && (
        <>
          {tiendas.length === 0 ? (
            <div className={`flex flex-col items-center justify-center py-20 ${dm('text-white/30', 'text-gray-400')}`}>
              <Building2 className="w-20 h-20 mb-4 opacity-30" />
              <p className="text-xl font-semibold">No hay tiendas configuradas</p>
              <button
                onClick={() => { setTiendaEditar(null); setModalTienda(true); }}
                className="mt-4 flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-blue-500 to-indigo-600 text-white font-bold"
              >
                <Plus className="w-5 h-5" /> Crear primera tienda
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {tiendas.map(t => {
                const tStats = estadisticas?.tiendaStats?.find((s: any) => s.tienda.id === t.id) || {
                  totalStock: 0, productosConStock: 0, transfsEnviadas: 0, transfsRecibidas: 0,
                };
                return (
                  <TarjetaTienda
                    key={t.id}
                    tienda={t}
                    stats={tStats}
                    esActiva={tiendaActual?.id === t.id}
                    onSeleccionar={() => cambiarTienda(t.id)}
                    onEditar={() => { setTiendaEditar(t); setModalTienda(true); }}
                    onEliminar={() => handleEliminarTienda(t)}
                    onTransferir={() => { setTiendaOrigenTransf(t.id); setModalTransferencia(true); }}
                  />
                );
              })}

              {/* Tarjeta "Agregar tienda" */}
              <button
                onClick={() => { setTiendaEditar(null); setModalTienda(true); }}
                className={`rounded-2xl border-2 border-dashed transition-all flex flex-col items-center justify-center gap-3 p-10 group ${dm('border-white/15 hover:border-blue-500/50 hover:bg-blue-500/5', 'border-gray-300 hover:border-blue-400 bg-gray-50 hover:bg-blue-50')}`}
              >
                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-all ${dm('bg-white/10 group-hover:bg-blue-500/20', 'bg-gray-100 group-hover:bg-blue-100')}`}>
                  <Plus className={`w-7 h-7 transition-all group-hover:text-blue-400 ${dm('text-white/40', 'text-gray-400')}`} />
                </div>
                <div className="text-center">
                  <p className={`font-bold transition-all ${dm('text-white/50 group-hover:text-white/80', 'text-gray-500 group-hover:text-gray-700')}`}>Agregar nueva tienda</p>
                  <p className={`text-sm ${dm('text-white/30', 'text-gray-400')}`}>Sucursal, bodega o punto de venta</p>
                </div>
              </button>
            </div>
          )}
        </>
      )}

      {/* ── PESTAÑA: INVENTARIO POR TIENDA ── */}
      {tab === 'inventario' && <InventarioPorTienda tiendas={tiendas} />}

      {/* ── PESTAÑA: HISTORIAL ── */}
      {tab === 'historial' && <HistorialTransferencias tiendas={tiendas} />}

      {/* ── MODALES ── */}
      <ModalTienda
        isOpen={modalTienda}
        onClose={() => { setModalTienda(false); setTiendaEditar(null); }}
        onSuccess={cargarStats}
        tiendaEditar={tiendaEditar}
      />
      <ModalTransferencia
        isOpen={modalTransferencia}
        onClose={() => setModalTransferencia(false)}
        onSuccess={() => { cargarStats(); setTab('historial'); }}
        tiendas={tiendas}
        tiendaOrigenDefault={tiendaOrigenTransf}
      />
    </div>
  );
}