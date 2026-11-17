/**
 * Crear, editar o eliminar un ingrediente desde Inventario › Ingredientes.
 * Lo que se guarde aquí se sube a la nube y llega a las otras cajas.
 */
import { useState } from 'react';
import { motion } from 'motion/react';
import { FlaskConical, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { electronStore, type IngredienteInventarioItem } from '../../lib/electronStore';

const UNIDADES = [
  { id: 'g', nombre: 'Gramos (g)' },
  { id: 'ml', nombre: 'Mililitros (ml)' },
  { id: 'und', nombre: 'Unidades (und)' },
];

interface Props {
  ingrediente: IngredienteInventarioItem | null; // null = nuevo
  categorias: string[];
  darkMode: boolean;
  onClose: () => void;
  onGuardado: () => void;
}

export function IngredienteEditorModal({ ingrediente, categorias, darkMode, onClose, onGuardado }: Props) {
  const [nombre, setNombre] = useState(ingrediente?.nombre || '');
  const [unidad, setUnidad] = useState(ingrediente?.unidad || 'g');
  const [stock, setStock] = useState(String(ingrediente?.stockActual ?? ''));
  const [minimo, setMinimo] = useState(String(ingrediente?.stockMinimo ?? ''));
  const [costo, setCosto] = useState(String(ingrediente?.costoUnitario ?? ''));
  const [categoria, setCategoria] = useState(ingrediente?.categoria || '');
  const [confirmarBorrado, setConfirmarBorrado] = useState(false);
  const [guardando, setGuardando] = useState(false);

  const etiqueta = `text-xs font-semibold ${darkMode ? 'text-gray-300' : 'text-gray-700'}`;
  const campo = `h-11 rounded-xl ${darkMode ? 'bg-slate-800 border-slate-600 text-white' : 'bg-gray-50 border-gray-300'}`;
  const numero = (t: string) => Math.max(0, Number(String(t).replace(',', '.')) || 0);

  const guardar = async () => {
    const limpio = nombre.trim();
    if (!limpio) { toast.error('Escribe el nombre del ingrediente'); return; }
    const todos = await electronStore.obtenerIngredientesInventario();
    const repetido = todos.find((i) => i.id !== ingrediente?.id && i.nombre.trim().toLowerCase() === limpio.toLowerCase());
    if (repetido) { toast.error(`Ya existe un ingrediente llamado ${repetido.nombre}`); return; }
    setGuardando(true);
    try {
      await electronStore.upsertIngrediente({
        ...(ingrediente || { activo: true, moduloOrigen: 'panaderia_onces' }),
        id: ingrediente?.id || `ING-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        nombre: limpio,
        unidad,
        stockActual: numero(stock),
        stockMinimo: numero(minimo),
        costoUnitario: numero(costo),
        categoria: categoria.trim() || 'General',
      } as IngredienteInventarioItem);
      toast.success(ingrediente ? `${limpio} actualizado` : `${limpio} creado`);
      onGuardado();
      onClose();
    } catch {
      toast.error('No se pudo guardar el ingrediente');
    } finally {
      setGuardando(false);
    }
  };

  const eliminar = async () => {
    if (!ingrediente) return;
    if (!confirmarBorrado) { setConfirmarBorrado(true); return; }
    try {
      await electronStore.eliminarIngrediente(ingrediente.id);
      toast.success(`${ingrediente.nombre} eliminado`);
      onGuardado();
      onClose();
    } catch {
      toast.error('No se pudo eliminar el ingrediente');
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
        className={`max-w-lg w-full max-h-[90vh] overflow-y-auto rounded-3xl p-6 border-2 ${darkMode ? 'bg-slate-900 border-blue-600/40' : 'bg-white border-blue-400'}`}
      >
        <div className="flex items-center gap-3 mb-5">
          <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl flex items-center justify-center">
            <FlaskConical className="w-6 h-6 text-white" />
          </div>
          <h3 className={`flex-1 font-bold text-lg ${darkMode ? 'text-white' : 'text-gray-900'}`}>
            {ingrediente ? 'Editar ingrediente' : 'Nuevo ingrediente'}
          </h3>
          <button onClick={onClose} className={`p-2 rounded-xl ${darkMode ? 'text-gray-400 hover:bg-slate-800' : 'text-gray-500 hover:bg-gray-100'}`} aria-label="Cerrar">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 space-y-1">
            <label className={etiqueta}>Nombre</label>
            <Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej: Harina de trigo" className={campo} autoFocus={!ingrediente} />
          </div>
          <div className="space-y-1">
            <label className={etiqueta}>Unidad</label>
            <select value={unidad} onChange={(e) => setUnidad(e.target.value)} className={`w-full px-3 border ${campo}`}>
              {UNIDADES.map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}
              {!UNIDADES.some((u) => u.id === unidad) && <option value={unidad}>{unidad}</option>}
            </select>
          </div>
          <div className="space-y-1">
            <label className={etiqueta}>Categoría</label>
            <Input value={categoria} onChange={(e) => setCategoria(e.target.value)} list="categorias-ingredientes" placeholder="General" className={campo} />
            <datalist id="categorias-ingredientes">
              {categorias.map((c) => <option key={c} value={c} />)}
            </datalist>
          </div>
          <div className="space-y-1">
            <label className={etiqueta}>Stock actual ({unidad})</label>
            <Input type="number" inputMode="decimal" min={0} value={stock} onChange={(e) => setStock(e.target.value)} className={campo} />
          </div>
          <div className="space-y-1">
            <label className={etiqueta}>Stock mínimo ({unidad})</label>
            <Input type="number" inputMode="decimal" min={0} value={minimo} onChange={(e) => setMinimo(e.target.value)} className={campo} />
          </div>
          <div className="col-span-2 space-y-1">
            <label className={etiqueta}>Costo por {unidad === 'und' ? 'unidad' : unidad} (opcional)</label>
            <Input type="number" inputMode="decimal" min={0} value={costo} onChange={(e) => setCosto(e.target.value)} placeholder="0" className={campo} />
            <p className={`text-xs ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
              Con el costo, el sistema calcula cuánto cuesta preparar cada plato.
            </p>
          </div>
        </div>

        <div className="flex gap-2 mt-6">
          {ingrediente && (
            <Button
              onClick={eliminar}
              variant="outline"
              className={`h-11 rounded-xl ${confirmarBorrado ? 'bg-red-600 text-white border-red-600 hover:bg-red-700' : darkMode ? 'border-red-500/50 text-red-400' : 'border-red-300 text-red-600'}`}
            >
              <Trash2 className="w-4 h-4 mr-1" />
              {confirmarBorrado ? 'Tocar otra vez para eliminar' : 'Eliminar'}
            </Button>
          )}
          <Button onClick={onClose} variant="outline" className="h-11 rounded-xl flex-1">Cancelar</Button>
          <Button onClick={guardar} disabled={guardando} className="h-11 rounded-xl flex-1 bg-gradient-to-r from-blue-500 to-indigo-600 text-white">
            {guardando ? 'Guardando…' : 'Guardar'}
          </Button>
        </div>
      </motion.div>
    </motion.div>
  );
}
