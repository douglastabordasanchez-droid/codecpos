/**
 * Devolución de una venta, en ventana emergente desde Ventas.
 *
 * Reemplaza el flujo anterior (ir a Devoluciones, escribir el número de
 * factura, buscarla): aquí la venta ya viene elegida. Muestra lo vendido, lo
 * ya devuelto antes y deja devolver solo lo que queda.
 *
 * Al confirmar hace lo mismo que hacía la pantalla de Devoluciones: guarda la
 * devolución con el inventario y el estado de la venta en un solo paso,
 * avisa a las integraciones y, si la venta tiene factura electrónica, emite
 * la nota crédito ante la DIAN.
 */
import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, RotateCcw, Plus, Minus, Loader2, PackageCheck } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../ui/button';
import { useAuth } from '../../contexts/AuthContext';
import { usePOS } from '../../contexts/POSContext';
import { electronStore, type Venta } from '../../lib/electronStore';
import { onDevolucionRegistrada } from '../../lib/integracionesService';
import { getLinkedClienteId } from '../../lib/supabase/tenantLink';
import { emitirNotaCreditoPorDevolucion } from '../../lib/dian/notaPorDevolucion';
import { avisarNotaPorDevolucion } from '../../lib/dian/avisoNotaDevolucion';

/** Devolución tal como la guarda el historial (localStorage `codecpos_devoluciones`). */
export interface DevolucionRegistrada {
  id: string;
  ventaId: string;
  numeroFactura: string;
  fecha: string;
  items: {
    productoId: string;
    nombre: string;
    cantidadDevuelta: number;
    precioUnitario: number;
    subtotal: number;
    motivo: string;
  }[];
  totalDevolucion: number;
  metodoPago: string;
  procesadoPor: string;
  observaciones: string;
  estado: 'completada' | 'pendiente' | 'rechazada';
}

const CLAVE_HISTORIAL = 'codecpos_devoluciones';

export function leerDevoluciones(): DevolucionRegistrada[] {
  try {
    return JSON.parse(localStorage.getItem(CLAVE_HISTORIAL) || '[]');
  } catch {
    return [];
  }
}

const MOTIVOS = ['Producto defectuoso', 'Cambio de producto', 'Error en la venta', 'Producto vencido', 'El cliente no lo quiso'];

const money = (n: number) => `$${Math.round(n).toLocaleString('es-CO')}`;

interface Props {
  venta: Venta;
  onClose: () => void;
  /** Se llama tras registrar la devolución, para recargar la lista de ventas. */
  onHecho: () => void;
}

export function ModalDevolucionVenta({ venta, onClose, onHecho }: Props) {
  const { darkMode, triggerRefresh } = usePOS();
  const { usuarioActual } = useAuth();
  const numeroFactura = venta.numeroFactura || venta.id;

  // Lo devuelto antes en esta misma venta, por producto: no se puede devolver dos veces.
  const yaDevuelto = useMemo(() => {
    const mapa = new Map<string, number>();
    for (const d of leerDevoluciones().filter((d) => d.ventaId === venta.id)) {
      for (const i of d.items) mapa.set(i.productoId, (mapa.get(i.productoId) ?? 0) + i.cantidadDevuelta);
    }
    return mapa;
  }, [venta.id]);

  const lineas = venta.items.map((item) => {
    const precio = item.precio || item.precioVenta || 0;
    const devuelto = yaDevuelto.get(item.id) ?? 0;
    return { item, precio, devuelto, disponible: Math.max(0, item.cantidad - devuelto) };
  });

  const [cantidades, setCantidades] = useState<Record<string, number>>({});
  const [motivo, setMotivo] = useState(MOTIVOS[0]);
  const [motivoOtro, setMotivoOtro] = useState('');
  const [observaciones, setObservaciones] = useState('');
  const [procesando, setProcesando] = useState(false);

  const elegidas = lineas.filter((l) => (cantidades[l.item.id] ?? 0) > 0);
  const total = elegidas.reduce((s, l) => s + l.precio * cantidades[l.item.id], 0);
  const nadaDisponible = lineas.every((l) => l.disponible === 0);
  const motivoFinal = motivo === 'Otro' ? motivoOtro.trim() : motivo;

  const cambiar = (id: string, valor: number, max: number) =>
    setCantidades((c) => ({ ...c, [id]: Math.min(max, Math.max(0, valor)) }));

  const devolverTodo = () =>
    setCantidades(Object.fromEntries(lineas.map((l) => [l.item.id, l.disponible])));

  async function confirmar() {
    if (elegidas.length === 0) { toast.error('Elige al menos un producto para devolver'); return; }
    if (!motivoFinal) { toast.error('Escribe el motivo de la devolución'); return; }

    setProcesando(true);
    try {
      const devolucion: DevolucionRegistrada = {
        id: `DEV${Date.now()}`,
        ventaId: venta.id,
        numeroFactura,
        fecha: new Date().toISOString(),
        items: elegidas.map((l) => ({
          productoId: l.item.id,
          nombre: l.item.nombre,
          cantidadDevuelta: cantidades[l.item.id],
          precioUnitario: l.precio,
          subtotal: l.precio * cantidades[l.item.id],
          motivo: motivoFinal,
        })),
        totalDevolucion: total,
        metodoPago: venta.metodoPago,
        procesadoPor: usuarioActual?.username || usuarioActual?.nombreCompleto || 'Usuario',
        observaciones,
        estado: 'completada',
      };

      // Devolución total = con esta, cada producto queda devuelto en su totalidad.
      const devolucionTotal = lineas.every((l) => l.devuelto + (cantidades[l.item.id] ?? 0) >= l.item.cantidad);

      await electronStore.registrarDevolucionAtomica({
        devolucion: {
          ...devolucion,
          items: devolucion.items.map((i) => ({
            productoId: i.productoId,
            cantidadDevuelta: i.cantidadDevuelta,
            precioUnitario: i.precioUnitario,
            subtotal: i.subtotal,
          })),
        },
        marcarVentaComoDevuelta: devolucionTotal,
      });

      localStorage.setItem(CLAVE_HISTORIAL, JSON.stringify([...leerDevoluciones(), devolucion]));
      try {
        const stats = JSON.parse(localStorage.getItem('codecpos_stats') || '{}');
        stats.totalDevoluciones = (stats.totalDevoluciones || 0) + 1;
        stats.montoDevoluciones = (stats.montoDevoluciones || 0) + total;
        localStorage.setItem('codecpos_stats', JSON.stringify(stats));
      } catch { /* las estadísticas rápidas no son críticas */ }

      toast.success('Devolución registrada', { description: `Total devuelto: ${money(total)}` });

      onDevolucionRegistrada({
        monto: total,
        motivo: motivoFinal,
        factura: venta.id,
        cajero: usuarioActual?.nombreCompleto || usuarioActual?.username || 'Cajero',
        items: devolucion.items.length,
        timestamp: devolucion.fecha,
      }).catch(() => {});

      // Si la venta tiene factura electrónica, la devolución se reporta a la
      // DIAN con su nota crédito. Corre aparte: la devolución ya quedó.
      const clienteId = getLinkedClienteId();
      if (clienteId) {
        emitirNotaCreditoPorDevolucion({
          clienteId,
          ventaReferencia: numeroFactura,
          items: elegidas.map((l) => ({ codigo: l.item.codigo, nombre: l.item.nombre, cantidad: cantidades[l.item.id] })),
          motivo: motivoFinal,
          devolucionTotal,
        }).then(avisarNotaPorDevolucion);
      }

      triggerRefresh();
      onHecho();
      onClose();
    } catch (error) {
      console.error('Error procesando devolución:', error);
      toast.error('No se pudo registrar la devolución', { description: (error as Error)?.message });
    } finally {
      setProcesando(false);
    }
  }

  const texto = darkMode ? 'text-white' : 'text-gray-900';
  const tenue = darkMode ? 'text-gray-400' : 'text-gray-500';
  const campo = `w-full px-3 py-2 rounded-lg border text-sm ${darkMode ? 'bg-slate-700 border-slate-600 text-white' : 'bg-white border-gray-300'}`;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
        onClick={() => !procesando && onClose()}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 16 }} animate={{ opacity: 1, scale: 1, y: 0 }}
          onClick={(e) => e.stopPropagation()}
          className={`w-full max-w-2xl max-h-[90vh] flex flex-col rounded-2xl shadow-2xl overflow-hidden border ${darkMode ? 'bg-slate-900 border-slate-700' : 'bg-white border-gray-200'}`}
        >
          <div className={`px-5 py-4 border-b flex items-center justify-between ${darkMode ? 'border-slate-700' : 'border-gray-200'}`}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center">
                <RotateCcw className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className={`text-lg font-bold ${texto}`}>Devolución de {numeroFactura}</h2>
                <p className={`text-xs ${tenue}`}>
                  {new Date(venta.fecha).toLocaleString('es-CO')} · {venta.cajero} · Total venta {money(venta.total)}
                </p>
              </div>
            </div>
            <button onClick={onClose} disabled={procesando} className={tenue} aria-label="Cerrar"><X className="w-5 h-5" /></button>
          </div>

          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            {nadaDisponible ? (
              <div className={`p-6 rounded-xl text-center ${darkMode ? 'bg-slate-800' : 'bg-gray-50'}`}>
                <PackageCheck className="w-8 h-8 mx-auto mb-2 text-emerald-500" />
                <p className={`font-semibold ${texto}`}>Esta venta ya se devolvió completa</p>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <p className={`text-sm font-semibold ${texto}`}>¿Qué se devuelve?</p>
                  <button onClick={devolverTodo} className="text-sm font-semibold text-orange-500 hover:underline">Devolver todo</button>
                </div>

                <div className="space-y-2">
                  {lineas.map(({ item, precio, devuelto, disponible }) => {
                    const cantidad = cantidades[item.id] ?? 0;
                    return (
                      <div key={item.id} className={`p-3 rounded-xl border flex items-center gap-3 ${
                        cantidad > 0 ? 'border-orange-500 bg-orange-500/5' : darkMode ? 'border-slate-700' : 'border-gray-200'
                      } ${disponible === 0 ? 'opacity-50' : ''}`}>
                        <div className="flex-1 min-w-0">
                          <p className={`font-semibold truncate ${texto}`}>{item.nombre}</p>
                          <p className={`text-xs ${tenue}`}>
                            {money(precio)} c/u · vendidas {item.cantidad}
                            {devuelto > 0 && ` · ya devueltas ${devuelto}`}
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Button type="button" size="sm" variant="outline" onClick={() => cambiar(item.id, cantidad - 1, disponible)} disabled={cantidad === 0}>
                            <Minus className="w-3.5 h-3.5" />
                          </Button>
                          <span className={`w-8 text-center font-bold ${texto}`}>{cantidad}</span>
                          <Button type="button" size="sm" variant="outline" onClick={() => cambiar(item.id, cantidad + 1, disponible)} disabled={cantidad >= disponible}>
                            <Plus className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                        <p className={`w-24 text-right font-bold ${cantidad > 0 ? 'text-orange-500' : tenue}`}>{money(precio * cantidad)}</p>
                      </div>
                    );
                  })}
                </div>

                <div className="space-y-2">
                  <p className={`text-sm font-semibold ${texto}`}>Motivo</p>
                  <div className="flex flex-wrap gap-2">
                    {[...MOTIVOS, 'Otro'].map((m) => (
                      <button key={m} type="button" onClick={() => setMotivo(m)}
                        className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${
                          motivo === m ? 'bg-orange-500 border-orange-500 text-white' : darkMode ? 'border-slate-600 text-gray-300' : 'border-gray-300 text-gray-700'
                        }`}>
                        {m}
                      </button>
                    ))}
                  </div>
                  {motivo === 'Otro' && (
                    <input className={campo} value={motivoOtro} onChange={(e) => setMotivoOtro(e.target.value)} placeholder="Escribe el motivo" autoFocus />
                  )}
                </div>

                <textarea className={campo} rows={2} value={observaciones} onChange={(e) => setObservaciones(e.target.value)} placeholder="Observaciones (opcional)" />
              </>
            )}
          </div>

          <div className={`px-5 py-4 border-t flex items-center justify-between gap-3 ${darkMode ? 'border-slate-700' : 'border-gray-200'}`}>
            <div>
              <p className={`text-xs ${tenue}`}>Total a devolver</p>
              <p className="text-2xl font-black text-orange-500">{money(total)}</p>
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={onClose} disabled={procesando}>Cancelar</Button>
              <Button type="button" onClick={confirmar} disabled={procesando || elegidas.length === 0 || nadaDisponible}
                className="bg-gradient-to-b from-orange-500 to-red-600 text-white">
                {procesando ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RotateCcw className="w-4 h-4 mr-2" />}
                Confirmar devolución
              </Button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
