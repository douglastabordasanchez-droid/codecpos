/**
 * «Poner el IVA en todos los productos»: escribe la tarifa en la ficha de los
 * productos que dicen 0 %, de una vez. Igual en la web/celular (Configurar mi
 * negocio) y en Electron (Configuración › IVA); Electron recibe los productos
 * cambiados por la sincronización.
 */
import { useCallback, useEffect, useState } from 'react';
import { Check, Loader2, Percent } from 'lucide-react';
import { toast } from 'sonner';
import { aplicarIvaATodosLosProductos, contarProductosSinIva } from '../../lib/dian/configIva';

interface Props {
  porcentaje: number;
  darkMode?: boolean;
  /** Después de aplicar (Electron trae los productos de la nube). */
  onAplicado?: (cambiados: number) => void;
}

export function AplicarIvaProductos({ porcentaje, darkMode = true, onAplicado }: Props) {
  const [sinIva, setSinIva] = useState<number | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const [aplicando, setAplicando] = useState(false);

  const contar = useCallback(() => {
    contarProductosSinIva().then(setSinIva).catch(() => setSinIva(null));
  }, []);
  useEffect(() => { contar(); }, [contar]);

  const aplicar = async () => {
    setAplicando(true);
    try {
      const cambiados = await aplicarIvaATodosLosProductos(porcentaje);
      toast.success(`IVA del ${porcentaje} % puesto en ${cambiados.toLocaleString('es-CO')} productos`, {
        description: 'Ya aparece en la ficha de cada producto, en la web, el celular y Electron.',
      });
      setConfirmando(false);
      contar();
      onAplicado?.(cambiados);
    } catch (e: any) {
      toast.error('No se pudo poner el IVA en los productos', { description: e?.message });
    } finally {
      setAplicando(false);
    }
  };

  const texto = darkMode ? 'text-slate-400' : 'text-gray-600';
  const fuerte = darkMode ? 'text-white' : 'text-gray-900';
  const caja = darkMode ? 'border-slate-700 bg-slate-950/40' : 'border-gray-200 bg-white';

  return (
    <div className={`rounded-xl border p-3 space-y-2 ${caja}`}>
      <p className={`text-sm font-semibold ${fuerte}`}>IVA en la ficha de los productos</p>
      <p className={`text-xs ${texto}`}>
        {sinIva === null
          ? 'Contando productos…'
          : sinIva === 0
            ? 'Todos los productos ya tienen IVA en su ficha.'
            : `${sinIva.toLocaleString('es-CO')} productos dicen 0 % en su ficha. Puedes ponerles el ${porcentaje} % a todos de una vez.`}
      </p>
      {!!sinIva && !confirmando && (
        <button
          type="button"
          onClick={() => setConfirmando(true)}
          className="w-full h-10 rounded-xl bg-emerald-600 text-white text-sm font-bold flex items-center justify-center gap-2"
        >
          <Percent className="w-4 h-4" /> Poner {porcentaje} % en los {sinIva.toLocaleString('es-CO')} productos
        </button>
      )}
      {!!sinIva && confirmando && (
        <div className="space-y-2">
          <p className={`text-xs ${darkMode ? 'text-amber-300' : 'text-amber-700'}`}>
            Los productos excluidos o exentos (si los vendes) tendrás que dejarlos en 0 % después, uno por uno. ¿Seguro?
          </p>
          <div className="flex gap-2">
            <button type="button" onClick={() => setConfirmando(false)} disabled={aplicando}
              className={`flex-1 h-10 rounded-xl border text-sm font-semibold ${darkMode ? 'border-slate-700 text-slate-300' : 'border-gray-300 text-gray-700'}`}>
              Cancelar
            </button>
            <button type="button" onClick={aplicar} disabled={aplicando}
              className="flex-1 h-10 rounded-xl bg-emerald-600 text-white text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-60">
              {aplicando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Sí, aplicar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
