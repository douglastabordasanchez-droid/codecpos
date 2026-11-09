/**
 * Productos que nadie ha vendido en todo el periodo guardado. El sistema solo
 * los sugiere: no hay nada marcado de entrada y se borra únicamente lo que el
 * dueño elija y confirme.
 */
import { useState } from 'react';
import { Loader2, PackageSearch, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../contexts/AuthContext';
import { MESES_EN_CAJA } from '../../lib/retencionDatos';
import { eliminarProductosSinMovimiento, listarProductosSinMovimiento, type ProductoSinMovimiento } from '../../lib/syncService';

const CLAVE_SUGERENCIA = 'codecpos_sugerencia_productos_mes';

/** Aviso discreto, máximo una vez al mes, sin interrumpir la venta. */
export function sugerirProductosSinMovimiento(): () => void {
  const espera = window.setTimeout(async () => {
    const mes = new Date().toISOString().slice(0, 7);
    try {
      if (localStorage.getItem(CLAVE_SUGERENCIA) === mes) return;
      const lista = await listarProductosSinMovimiento();
      localStorage.setItem(CLAVE_SUGERENCIA, mes);
      if (lista.length > 0) {
        toast.info(`${lista.length} productos sin ventas en más de ${MESES_EN_CAJA} meses`, {
          description: 'Si ya no los usas, puedes quitarlos en Configuración › Respaldo para optimizar el sistema. No se borra nada sin tu permiso.',
          duration: 15000,
        });
      }
    } catch { /* sin nube: se intenta la próxima vez que abra */ }
  }, 180_000);
  return () => window.clearTimeout(espera);
}

export function ProductosSinMovimientoCard({ darkMode = true }: { darkMode?: boolean }) {
  const { usuarioActual } = useAuth();
  const [lista, setLista] = useState<ProductoSinMovimiento[] | null>(null);
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [ocupado, setOcupado] = useState(false);
  const [confirmando, setConfirmando] = useState(false);

  if (usuarioActual?.rol !== 'super_usuario') return null;

  const revisar = async () => {
    setOcupado(true);
    try {
      setLista(await listarProductosSinMovimiento());
      setMarcados(new Set());
      setConfirmando(false);
    } catch (e) {
      toast.error('No se pudo revisar el inventario', { description: (e as Error)?.message });
    } finally {
      setOcupado(false);
    }
  };

  const eliminar = async () => {
    if (!lista) return;
    setOcupado(true);
    try {
      const elegidos = lista.filter((p) => marcados.has(p.id));
      await eliminarProductosSinMovimiento(elegidos);
      setLista(lista.filter((p) => !marcados.has(p.id)));
      setMarcados(new Set());
      setConfirmando(false);
      toast.success(`${elegidos.length} productos eliminados`);
    } catch (e) {
      toast.error('No se eliminó ningún producto de esta caja', { description: (e as Error)?.message });
    } finally {
      setOcupado(false);
    }
  };

  const alternar = (id: string) => setMarcados((m) => {
    const copia = new Set(m);
    if (!copia.delete(id)) copia.add(id);
    return copia;
  });

  const texto = darkMode ? 'text-slate-300' : 'text-slate-700';
  const boton = 'h-10 px-3 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 transition-colors disabled:opacity-50';

  return (
    <div className={`rounded-xl border p-4 space-y-3 ${darkMode ? 'bg-slate-800/60 border-slate-700' : 'bg-white border-slate-200'}`}>
      <div>
        <h3 className={`font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>Productos sin ventas</h3>
        <p className={`text-sm ${texto}`}>
          Quitar lo que ya no usas optimiza el sistema. Solo se borra lo que tú marques. Revisa que no sean ingredientes o insumos de una receta.
        </p>
      </div>

      <button onClick={revisar} disabled={ocupado} className={`${boton} w-full bg-sky-600 hover:bg-sky-700 text-white`}>
        {ocupado ? <Loader2 className="w-4 h-4 animate-spin" /> : <PackageSearch className="w-4 h-4" />} Revisar productos
      </button>

      {lista?.length === 0 && <p className={`text-sm ${texto}`}>Todos tus productos han tenido ventas en los últimos {MESES_EN_CAJA} meses.</p>}

      {lista && lista.length > 0 && (
        <>
          <ul className="max-h-64 overflow-y-auto space-y-1">
            {lista.map((p) => (
              <li key={p.id}>
                <label className={`flex items-center gap-2 text-sm cursor-pointer ${texto}`}>
                  <input type="checkbox" checked={marcados.has(p.id)} onChange={() => { alternar(p.id); setConfirmando(false); }} />
                  <span className="flex-1 min-w-0 truncate">{p.nombre}</span>
                  <span className="shrink-0 opacity-70">Stock {Number(p.stock) || 0}</span>
                </label>
              </li>
            ))}
          </ul>
          {confirmando ? (
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setConfirmando(false)} disabled={ocupado} className={`${boton} ${darkMode ? 'bg-slate-700 text-white' : 'bg-slate-200 text-slate-800'}`}>Cancelar</button>
              <button onClick={eliminar} disabled={ocupado} className={`${boton} bg-red-600 hover:bg-red-700 text-white`}>Sí, eliminar {marcados.size}</button>
            </div>
          ) : (
            <button onClick={() => setConfirmando(true)} disabled={ocupado || marcados.size === 0} className={`${boton} w-full bg-red-600 hover:bg-red-700 text-white`}>
              <Trash2 className="w-4 h-4" /> Eliminar seleccionados ({marcados.size})
            </button>
          )}
        </>
      )}
    </div>
  );
}
