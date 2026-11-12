import { motion } from 'motion/react';
import { UserRound, ChevronRight } from 'lucide-react';
import type { ResumenEmpleado } from '../lib/ventasPorEmpleado';

const pesos = (n: number) => `$${Math.round(n).toLocaleString('es-CO')}`;

/** Lista desplegable «Todos los empleados / Diana / Jorge…» con lo que vendió cada uno. */
export function EmpleadoSelector({ resumen, seleccionado, onSeleccionar, className = '' }: {
  resumen: ResumenEmpleado[];
  seleccionado: string | null;
  onSeleccionar: (clave: string | null) => void;
  className?: string;
}) {
  // Si el elegido no vendió en este periodo, igual se deja en la lista para poder quitarlo.
  const opciones = seleccionado && !resumen.some((r) => r.clave === seleccionado)
    ? [...resumen, { clave: seleccionado, nombre: seleccionado, cantidad: 0, total: 0, propinas: 0 }]
    : resumen;
  return (
    <div className={`flex items-center gap-2 bg-slate-950/60 border border-slate-700 rounded-xl px-3 h-11 ${className}`}>
      <UserRound className="w-4 h-4 text-amber-400 shrink-0" />
      <select
        value={seleccionado ?? ''}
        onChange={(e) => onSeleccionar(e.target.value || null)}
        className="flex-1 min-w-0 bg-transparent text-white text-sm outline-none"
        aria-label="Empleado"
      >
        <option value="" className="bg-slate-900">Todos los empleados</option>
        {opciones.map((r) => (
          <option key={r.clave} value={r.clave} className="bg-slate-900">
            {r.nombre} · {r.cantidad} {r.cantidad === 1 ? 'venta' : 'ventas'} · {pesos(r.total)}
          </option>
        ))}
      </select>
    </div>
  );
}

/** Tarjetas con el total de cada empleado; al tocar una se filtra por esa persona. */
export function ResumenEmpleados({ resumen, onSeleccionar }: {
  resumen: ResumenEmpleado[];
  onSeleccionar: (clave: string) => void;
}) {
  if (resumen.length === 0) return null;
  const max = Math.max(...resumen.map((r) => r.total), 1);
  return (
    <div className="space-y-2">
      {resumen.map((r, i) => (
        <motion.button
          key={r.clave}
          type="button"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: Math.min(i, 8) * 0.04 }}
          onClick={() => onSeleccionar(r.clave)}
          className="w-full text-left bg-slate-900/70 border border-slate-800 rounded-xl p-3 hover:bg-slate-900"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-white font-semibold text-sm truncate">{r.nombre}</p>
              <p className="text-slate-500 text-xs">
                {r.cantidad} {r.cantidad === 1 ? 'venta' : 'ventas'}
                {r.propinas > 0 ? ` · propinas ${pesos(r.propinas)}` : ''}
              </p>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <span className="text-white font-black text-sm">{pesos(r.total)}</span>
              <ChevronRight className="w-4 h-4 text-slate-600" />
            </div>
          </div>
          <div className="mt-2 h-1.5 rounded-full bg-slate-800 overflow-hidden">
            <div className="h-full rounded-full bg-gradient-to-r from-amber-400 to-amber-600" style={{ width: `${(r.total / max) * 100}%` }} />
          </div>
        </motion.button>
      ))}
    </div>
  );
}
