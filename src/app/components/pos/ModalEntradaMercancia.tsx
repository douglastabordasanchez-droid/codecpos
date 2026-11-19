/**
 * Entrada de mercancía en la caja y la terminal: cuando llega el pedido de
 * Coca-Cola o Alpina se escanea o busca cada producto, se pone cuánto llegó (y
 * el costo si cambió) y se SUMA al stock. Guarda igual que el editor de
 * productos (EditProductModal): en la sede principal, sobre el producto del
 * equipo, que la sincronización sube; en otra sede, en su mapa y en la nube
 * como diferencia. Se suma sobre el stock del momento de guardar, así no se
 * pisa lo vendido mientras la ventana estaba abierta.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, PackagePlus, Plus, Minus, Trash2, Search, Check } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { getTiendaActivaId, listarTiendas, getStockEnTienda, setStockEnTienda } from '../../lib/multitiendaService';
import { ajustarStockSedeEnNube, multitiendaEnNube } from '../../lib/syncService';

interface ProductoCaja {
  id: string;
  nombre: string;
  codigo?: string;
  stock?: number;
  costo?: number;
  tipoProducto?: string;
  esServicio?: boolean;
}

interface Linea { producto: ProductoCaja; cantidad: string; costo: string }

const money = (v: number) => `$${Math.round(v || 0).toLocaleString('es-CO')}`;
const normalizar = (t: string) => t.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').trim();
const soloNumero = (v: string) => v.replace(/[^\d.,]/g, '').replace(',', '.');

function leerProductos(): ProductoCaja[] {
  try {
    const lista = JSON.parse(localStorage.getItem('pos-productos') || '[]');
    return (Array.isArray(lista) ? lista : []).filter((p: any) => p && p.activo !== false && p.tipoProducto !== 'servicio' && !p.esServicio);
  } catch {
    return [];
  }
}

export function ModalEntradaMercancia({ isOpen, onClose, onGuardado, darkMode }: {
  isOpen: boolean; onClose: () => void; onGuardado: () => void; darkMode: boolean;
}) {
  const [productos, setProductos] = useState<ProductoCaja[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [lineas, setLineas] = useState<Linea[]>([]);
  const [proveedor, setProveedor] = useState('');
  const [factura, setFactura] = useState('');
  const [guardando, setGuardando] = useState(false);
  const buscadorRef = useRef<HTMLInputElement>(null);

  const sede = getTiendaActivaId();
  const enOtraSede = !!sede && sede !== 'tienda_principal' && !listarTiendas().find((t) => t.id === sede)?.esPrincipal;
  const stockDe = (p: ProductoCaja) => (enOtraSede ? getStockEnTienda(p.id, sede!) : Number(p.stock) || 0);

  useEffect(() => {
    if (!isOpen) return;
    setProductos(leerProductos());
    setLineas([]); setBusqueda(''); setProveedor(''); setFactura('');
    window.setTimeout(() => buscadorRef.current?.focus(), 80);
  }, [isOpen]);

  const resultados = useMemo(() => {
    const q = normalizar(busqueda);
    if (!q) return [];
    return productos
      .filter((p) => normalizar(p.nombre).includes(q) || String(p.codigo || '').toLowerCase() === q)
      .sort((a, b) => Number(normalizar(b.nombre).startsWith(q)) - Number(normalizar(a.nombre).startsWith(q))
        || a.nombre.localeCompare(b.nombre, 'es', { numeric: true, sensitivity: 'base' }))
      .slice(0, 10);
  }, [productos, busqueda]);

  const agregar = (p: ProductoCaja) => {
    setLineas((prev) => {
      const i = prev.findIndex((l) => l.producto.id === p.id);
      if (i >= 0) {
        const copia = [...prev];
        copia[i] = { ...copia[i], cantidad: String((Number(copia[i].cantidad) || 0) + 1) };
        return copia;
      }
      return [{ producto: p, cantidad: '1', costo: '' }, ...prev];
    });
    setBusqueda('');
    window.setTimeout(() => buscadorRef.current?.focus(), 30);
  };

  // Lector de código de barras: escribe el código y termina con Enter.
  const alEnter = () => {
    const q = busqueda.trim();
    if (!q) return;
    const exacto = productos.find((p) => String(p.codigo || '').trim() === q);
    if (exacto) { agregar(exacto); return; }
    if (resultados.length === 1) { agregar(resultados[0]); return; }
    if (/^\d{6,}$/.test(q)) toast.error(`No hay un producto con el código ${q}`, { description: 'Créalo con «Nuevo» y vuelve a escanearlo.' });
  };

  const cambiar = (id: string, campo: 'cantidad' | 'costo', valor: string) =>
    setLineas((prev) => prev.map((l) => (l.producto.id === id ? { ...l, [campo]: soloNumero(valor) } : l)));
  const sumar = (id: string, d: number) =>
    setLineas((prev) => prev.map((l) => (l.producto.id === id ? { ...l, cantidad: String(Math.max(0, (Number(l.cantidad) || 0) + d)) } : l)));

  const validas = lineas.filter((l) => (Number(l.cantidad) || 0) > 0);
  const unidades = validas.reduce((s, l) => s + (Number(l.cantidad) || 0), 0);

  const guardar = async () => {
    if (validas.length === 0) return;
    setGuardando(true);
    try {
      // Se relee al guardar: lo vendido mientras la ventana estuvo abierta se respeta.
      const todos = JSON.parse(localStorage.getItem('pos-productos') || '[]');
      let sinNube = 0;
      for (const l of validas) {
        const llega = Number(l.cantidad) || 0;
        const costo = Number(l.costo) || 0;
        const i = todos.findIndex((p: any) => p.id === l.producto.id);
        if (i < 0) continue;
        if (costo > 0) todos[i] = { ...todos[i], costo };
        if (enOtraSede) {
          const anterior = getStockEnTienda(l.producto.id, sede!);
          setStockEnTienda(l.producto.id, sede!, anterior + llega);
          const ok = await ajustarStockSedeEnNube(l.producto.id, sede!, llega);
          if (multitiendaEnNube() && !ok) sinNube++;
        } else {
          todos[i] = { ...todos[i], stock: (Number(todos[i].stock) || 0) + llega };
        }
      }
      localStorage.setItem('pos-productos', JSON.stringify(todos));
      // Constancia local de la entrada (proveedor, factura y qué llegó).
      try {
        const historial = JSON.parse(localStorage.getItem('codecpos_entradas_mercancia') || '[]');
        historial.unshift({
          fecha: new Date().toISOString(), proveedor: proveedor.trim(), factura: factura.trim(), sede,
          items: validas.map((l) => ({ id: l.producto.id, nombre: l.producto.nombre, cantidad: Number(l.cantidad) || 0, costo: Number(l.costo) || undefined })),
        });
        localStorage.setItem('codecpos_entradas_mercancia', JSON.stringify(historial.slice(0, 300)));
      } catch { /* sin espacio: la entrada ya quedó en el stock */ }
      if (sinNube) toast.warning('Parte del stock quedó solo en este computador', { description: 'No se pudo subir a la nube; revisa el internet.' });
      toast.success('Entrada registrada', { description: `${unidades.toLocaleString('es-CO')} unidades sumadas al inventario.` });
      onGuardado();
      onClose();
    } catch (e) {
      console.error('[Entrada] No se pudo guardar:', e);
      toast.error('No se pudo registrar la entrada');
    } finally {
      setGuardando(false);
    }
  };

  const dm = darkMode;
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
          onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
          <motion.div initial={{ scale: 0.95, y: 10 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95 }}
            className={`w-full max-w-2xl max-h-[90vh] flex flex-col rounded-3xl shadow-2xl ${dm ? 'bg-slate-900 border border-slate-700' : 'bg-white'}`}>
            <div className={`px-6 py-4 border-b flex items-center gap-3 ${dm ? 'border-slate-700' : 'border-gray-200'}`}>
              <div className="w-11 h-11 rounded-2xl bg-emerald-600 flex items-center justify-center"><PackagePlus className="w-6 h-6 text-white" /></div>
              <div className="flex-1 min-w-0">
                <p className={`text-xl font-black ${dm ? 'text-white' : 'text-gray-900'}`}>Entrada de mercancía</p>
                <p className={`text-sm ${dm ? 'text-slate-400' : 'text-gray-500'}`}>Lo que llega del proveedor se suma al inventario{enOtraSede ? ' de esta sede' : ''}.</p>
              </div>
              <button onClick={onClose} className={dm ? 'text-slate-400' : 'text-gray-500'} aria-label="Cerrar"><X className="w-6 h-6" /></button>
            </div>

            <div className="px-6 pt-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Input value={proveedor} onChange={(e) => setProveedor(e.target.value.slice(0, 60))} placeholder="Proveedor (ej: Alpina)" className="h-11" />
                <Input value={factura} onChange={(e) => setFactura(e.target.value.slice(0, 30))} placeholder="N.° de factura (opcional)" className="h-11" />
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <Input ref={buscadorRef} value={busqueda} onChange={(e) => setBusqueda(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); alEnter(); } }}
                  placeholder="Escanea o busca el producto que llegó" className="h-12 pl-11 text-base" />
                {resultados.length > 0 && (
                  <div className={`absolute left-0 right-0 top-full mt-1 z-10 rounded-2xl border shadow-xl max-h-64 overflow-y-auto ${dm ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-200'}`}>
                    {resultados.map((p) => (
                      <button key={p.id} onClick={() => agregar(p)}
                        className={`w-full text-left px-4 py-2.5 flex items-center gap-3 border-b last:border-b-0 ${dm ? 'border-slate-700 hover:bg-slate-700 text-white' : 'border-gray-100 hover:bg-gray-50 text-gray-900'}`}>
                        <span className="flex-1 min-w-0 truncate font-semibold">{p.nombre}</span>
                        <span className={`text-sm ${dm ? 'text-slate-400' : 'text-gray-500'}`}>Hay {stockDe(p).toLocaleString('es-CO')}</span>
                        <Plus className="w-4 h-4 text-emerald-500" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-3 space-y-2">
              {lineas.length === 0 ? (
                <p className={`text-center py-10 text-sm ${dm ? 'text-slate-500' : 'text-gray-400'}`}>Escanea cada producto: si se repite, suma 1.</p>
              ) : lineas.map((l) => {
                const actual = stockDe(l.producto);
                const llega = Number(l.cantidad) || 0;
                return (
                  <div key={l.producto.id} className={`rounded-2xl border p-3 flex flex-wrap items-center gap-2 ${dm ? 'border-slate-700 bg-slate-800/60' : 'border-gray-200 bg-gray-50'}`}>
                    <div className="flex-1 min-w-[180px]">
                      <p className={`font-bold ${dm ? 'text-white' : 'text-gray-900'}`}>{l.producto.nombre}</p>
                      <p className={`text-xs ${dm ? 'text-slate-400' : 'text-gray-500'}`}>Hay {actual.toLocaleString('es-CO')} → quedan <b className="text-emerald-600">{(actual + llega).toLocaleString('es-CO')}</b></p>
                    </div>
                    <button onClick={() => sumar(l.producto.id, -1)} className={`w-10 h-10 rounded-xl flex items-center justify-center ${dm ? 'bg-slate-700 text-white' : 'bg-gray-200 text-gray-700'}`}><Minus className="w-4 h-4" /></button>
                    <Input value={l.cantidad} onChange={(e) => cambiar(l.producto.id, 'cantidad', e.target.value)} className="h-10 w-20 text-center font-black" aria-label="Cantidad que llegó" />
                    <button onClick={() => sumar(l.producto.id, 1)} className="w-10 h-10 rounded-xl flex items-center justify-center bg-emerald-600 text-white"><Plus className="w-4 h-4" /></button>
                    <Input value={l.costo} onChange={(e) => cambiar(l.producto.id, 'costo', e.target.value)}
                      placeholder={l.producto.costo ? `Costo ${money(Number(l.producto.costo))}` : 'Costo c/u'} className="h-10 w-36" aria-label="Costo por unidad" />
                    <button onClick={() => setLineas((prev) => prev.filter((x) => x.producto.id !== l.producto.id))} className="w-10 h-10 rounded-xl flex items-center justify-center text-red-500" aria-label="Quitar"><Trash2 className="w-4 h-4" /></button>
                  </div>
                );
              })}
            </div>

            <div className={`px-6 py-4 border-t flex items-center gap-3 ${dm ? 'border-slate-700' : 'border-gray-200'}`}>
              <p className={`flex-1 text-sm ${dm ? 'text-slate-400' : 'text-gray-500'}`}>{validas.length} producto{validas.length === 1 ? '' : 's'} · {unidades.toLocaleString('es-CO')} unidades</p>
              <Button onClick={onClose} variant="outline" className="h-12 rounded-2xl">Cancelar</Button>
              <Button onClick={() => void guardar()} disabled={guardando || validas.length === 0}
                className="h-12 rounded-2xl font-black bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700">
                <Check className="w-5 h-5 mr-2" />Sumar al inventario
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
