import { useState } from 'react';
import { Download, FileSpreadsheet, Loader2, X, Check } from 'lucide-react';
import { toast } from 'sonner';
import { descargarExcelMascotas, LIBROS_MASCOTAS, type LibroMascotas } from '../lib/exportarMascotasExcel';

const PERIODOS = [
  { id: 'mes', nombre: 'Este mes' },
  { id: 'pasado', nombre: 'Mes pasado' },
  { id: '3meses', nombre: 'Últimos 3 meses' },
  { id: 'anio', nombre: 'Este año' },
] as const;
type Periodo = (typeof PERIODOS)[number]['id'];

function rango(p: Periodo): { desde: Date; hasta: Date } {
  const hoy = new Date();
  const manana = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + 1);
  if (p === 'pasado') return { desde: new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1), hasta: new Date(hoy.getFullYear(), hoy.getMonth(), 1) };
  if (p === '3meses') return { desde: new Date(hoy.getFullYear(), hoy.getMonth() - 2, 1), hasta: manana };
  if (p === 'anio') return { desde: new Date(hoy.getFullYear(), 0, 1), hasta: manana };
  return { desde: new Date(hoy.getFullYear(), hoy.getMonth(), 1), hasta: manana };
}

/** Botón "Descargar Excel" de la sección Mascotas, con su ventanita para elegir qué libros. */
export function DescargarExcelMascotas({ clienteId, claro }: { clienteId: string | null | undefined; claro: boolean }) {
  const [abierto, setAbierto] = useState(false);
  const [libros, setLibros] = useState<LibroMascotas[]>(LIBROS_MASCOTAS.map((l) => l.id));
  const [periodo, setPeriodo] = useState<Periodo>('mes');
  const [descargando, setDescargando] = useState(false);
  const todos = libros.length === LIBROS_MASCOTAS.length;

  const alternar = (id: LibroMascotas) =>
    setLibros((ls) => (ls.includes(id) ? ls.filter((x) => x !== id) : [...ls, id]));

  const descargar = async () => {
    if (!libros.length) { toast.error('Elige al menos un libro'); return; }
    setDescargando(true);
    try {
      const archivo = await descargarExcelMascotas({ clienteId: clienteId || '', libros, ...rango(periodo) });
      toast.success('Excel descargado', { description: archivo });
      setAbierto(false);
    } catch (e: any) {
      toast.error('No se pudo descargar el Excel', { description: e?.message });
    } finally {
      setDescargando(false);
    }
  };

  const panel = claro ? 'bg-white text-slate-900' : 'bg-slate-900 text-white border border-slate-700';
  const suave = claro ? 'text-slate-500' : 'text-slate-400';
  const opcion = (activo: boolean) => activo
    ? 'border-emerald-500 bg-emerald-500/10'
    : claro ? 'border-slate-200 hover:border-slate-300' : 'border-slate-700 hover:border-slate-600';

  return (
    <>
      <button type="button" onClick={() => setAbierto(true)}
        className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold border transition ${
          claro ? 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50' : 'bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700'
        }`}>
        <FileSpreadsheet className="w-4 h-4 text-emerald-600" /> Descargar Excel
      </button>

      {abierto && (
        <div className="fixed inset-0 z-[120] bg-black/60 flex items-center justify-center p-4" onClick={() => !descargando && setAbierto(false)}>
          <div onClick={(e) => e.stopPropagation()} className={`w-full max-w-md rounded-2xl p-5 shadow-xl ${panel}`}>
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-lg font-bold flex items-center gap-2"><FileSpreadsheet className="w-5 h-5 text-emerald-600" /> Descargar Excel</h3>
              <button type="button" onClick={() => setAbierto(false)} className={suave}><X className="w-5 h-5" /></button>
            </div>
            <p className={`text-sm mb-4 ${suave}`}>Cada opción sale en su propio libro (hoja) dentro del mismo archivo.</p>

            <button type="button" onClick={() => setLibros(todos ? [] : LIBROS_MASCOTAS.map((l) => l.id))}
              className={`w-full mb-2 flex items-center gap-3 rounded-xl border-2 px-3 py-2.5 text-left font-semibold ${opcion(todos)}`}>
              <span className={`w-5 h-5 rounded-md flex items-center justify-center ${todos ? 'bg-emerald-500 text-white' : claro ? 'border border-slate-300' : 'border border-slate-600'}`}>
                {todos && <Check className="w-3.5 h-3.5" />}
              </span>
              Todo
            </button>
            <div className="space-y-2 mb-4">
              {LIBROS_MASCOTAS.map((l) => {
                const activo = libros.includes(l.id);
                return (
                  <button key={l.id} type="button" onClick={() => alternar(l.id)}
                    className={`w-full flex items-center gap-3 rounded-xl border-2 px-3 py-2.5 text-left ${opcion(activo)}`}>
                    <span className={`w-5 h-5 shrink-0 rounded-md flex items-center justify-center ${activo ? 'bg-emerald-500 text-white' : claro ? 'border border-slate-300' : 'border border-slate-600'}`}>
                      {activo && <Check className="w-3.5 h-3.5" />}
                    </span>
                    <span>
                      <span className="block font-semibold text-sm">{l.nombre}</span>
                      <span className={`block text-xs ${suave}`}>{l.detalle}</span>
                    </span>
                  </button>
                );
              })}
            </div>

            <p className={`text-xs font-semibold mb-2 ${suave}`}>Ventas y citas de:</p>
            <div className="grid grid-cols-2 gap-2 mb-5">
              {PERIODOS.map((p) => (
                <button key={p.id} type="button" onClick={() => setPeriodo(p.id)}
                  className={`rounded-xl border-2 px-3 py-2 text-sm font-semibold ${opcion(periodo === p.id)}`}>
                  {p.nombre}
                </button>
              ))}
            </div>

            <button type="button" onClick={descargar} disabled={descargando || !libros.length}
              className="w-full rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold py-3 flex items-center justify-center gap-2">
              {descargando ? <Loader2 className="w-5 h-5 animate-spin" /> : <Download className="w-5 h-5" />}
              {descargando ? 'Preparando el Excel…' : 'Descargar'}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
