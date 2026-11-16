/**
 * «Inventario universal» (migración 0153): encendido, todas las sedes del
 * negocio comparten el mismo catálogo de productos; apagado (por defecto),
 * cada sede tiene su propio inventario y ve solo sus productos. Solo lo
 * cambia el administrador. Lo usan la web, el celular y la caja.
 */
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Boxes } from 'lucide-react';
import { fijarInventarioUniversal, inventarioUniversalGuardado, obtenerInventarioUniversal } from '../../app/lib/inventarioSede';

export function InterruptorInventarioUniversal({ clienteId, oscuro = true }: { clienteId: string; oscuro?: boolean }) {
  const [universal, setUniversal] = useState(inventarioUniversalGuardado());
  const [guardando, setGuardando] = useState(false);

  useEffect(() => { void obtenerInventarioUniversal(clienteId).then(setUniversal); }, [clienteId]);

  const cambiar = async (v: boolean) => {
    const texto = v
      ? 'Todas las sedes verán y venderán el mismo catálogo de productos. ¿Activar inventario universal?'
      : 'Cada sede verá solo sus propios productos (los de antes quedan en la Tienda Principal). ¿Volver a inventario por sede?';
    if (!window.confirm(texto)) return;
    setGuardando(true);
    try {
      await fijarInventarioUniversal(v);
      setUniversal(v);
      toast.success(v ? 'Inventario universal activado' : 'Cada sede tiene su propio inventario');
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <label className={`flex items-center gap-3 rounded-2xl border p-4 cursor-pointer ${oscuro ? 'border-slate-800 bg-slate-900/60' : 'border-gray-200 bg-white'}`}>
      <Boxes className="w-5 h-5 text-amber-500 shrink-0" />
      <span className="flex-1">
        <span className={`block text-sm font-bold ${oscuro ? 'text-white' : 'text-gray-900'}`}>Inventario universal</span>
        <span className={`block text-xs ${oscuro ? 'text-slate-400' : 'text-gray-500'}`}>
          {universal
            ? 'Encendido: todas las sedes comparten el mismo catálogo (cada una con su existencia).'
            : 'Apagado: cada sede tiene su propio inventario y ve solo sus productos.'}
        </span>
      </span>
      <input type="checkbox" checked={universal} disabled={guardando} onChange={(e) => void cambiar(e.target.checked)} className="w-6 h-6 accent-amber-500 shrink-0" />
    </label>
  );
}
