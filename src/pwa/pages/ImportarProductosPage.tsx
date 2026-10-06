/**
 * Inventario › Importar: carga masiva de productos con plantilla de Excel.
 * 1) Descargar la plantilla, 2) subir el archivo (Excel o CSV, también de
 * otro sistema), 3) revisar fila por fila y cargar. Ver lib/importarProductos.ts.
 */
import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { AlertTriangle, ArrowLeft, CheckCircle2, Download, FileSpreadsheet, Loader2, Upload, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { usePwaAuth } from '../contexts/PwaAuthContext';
import {
  COLUMNAS, descargarPlantilla, importarProductos, leerArchivoProductos,
  type ArchivoLeido, type ResultadoImportacion,
} from '../../app/lib/importarProductos';

type Filtro = 'todas' | 'errores' | 'avisos';
const num = (n: number) => n.toLocaleString('es-CO');
const caja = 'bg-slate-900/70 border border-slate-800 rounded-2xl';
const boton = 'h-11 px-4 rounded-xl text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors disabled:opacity-50';

export default function ImportarProductosPage() {
  const { empleado } = usePwaAuth();
  const navigate = useNavigate();
  const entradaRef = useRef<HTMLInputElement>(null);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [leido, setLeido] = useState<ArchivoLeido | null>(null);
  const [leyendo, setLeyendo] = useState(false);
  const [arrastrando, setArrastrando] = useState(false);
  const [filtro, setFiltro] = useState<Filtro>('todas');
  const [actualizar, setActualizar] = useState(true);
  const [progreso, setProgreso] = useState<{ hechas: number; total: number } | null>(null);
  const [resultado, setResultado] = useState<ResultadoImportacion | null>(null);

  const resumen = useMemo(() => {
    const filas = leido?.filas || [];
    return {
      total: filas.length,
      listas: filas.filter((f) => f.errores.length === 0).length,
      conErrores: filas.filter((f) => f.errores.length > 0).length,
      conAvisos: filas.filter((f) => f.errores.length === 0 && f.avisos.length > 0).length,
    };
  }, [leido]);

  const visibles = useMemo(() => {
    const filas = leido?.filas || [];
    const f = filtro === 'errores' ? filas.filter((x) => x.errores.length) : filtro === 'avisos' ? filas.filter((x) => x.avisos.length && !x.errores.length) : filas;
    return f.slice(0, 300);
  }, [leido, filtro]);

  if (!empleado) return null;
  if (!['admin', 'super_usuario'].includes(empleado.rol)) {
    return <div className="min-h-screen bg-slate-950 p-8 text-slate-400">Solo el administrador puede importar productos.</div>;
  }

  const leer = async (f: File) => {
    if (!/\.(xlsx|xls|csv|txt)$/i.test(f.name)) return toast.error('Sube un archivo de Excel (.xlsx) o CSV');
    setArchivo(f);
    setResultado(null);
    setLeyendo(true);
    try {
      const r = await leerArchivoProductos(f);
      setLeido(r);
      setFiltro(r.filas.some((x) => x.errores.length) ? 'errores' : 'todas');
      if (r.filas.length === 0) toast.error('El archivo no tiene productos');
    } catch (e) {
      setLeido(null);
      toast.error('No se pudo leer el archivo', { description: (e as Error).message });
    } finally {
      setLeyendo(false);
    }
  };

  const cargar = async () => {
    if (!leido || resumen.listas === 0) return;
    setProgreso({ hechas: 0, total: resumen.listas });
    try {
      const r = await importarProductos(empleado.cliente_id, empleado.id, leido.filas, { actualizarExistentes: actualizar },
        (hechas, total) => setProgreso({ hechas, total }));
      setResultado(r);
      if (r.errores.length === 0) toast.success(`Listo: ${num(r.nuevos)} nuevos y ${num(r.actualizados)} actualizados`);
      else toast.error('Algunas filas no se cargaron', { description: r.errores[0] });
    } catch (e) {
      toast.error('La carga se detuvo', { description: (e as Error).message });
    } finally {
      setProgreso(null);
    }
  };

  const reiniciar = () => { setArchivo(null); setLeido(null); setResultado(null); if (entradaRef.current) entradaRef.current.value = ''; };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 px-4 md:px-6 pt-6 pb-24">
      <div className="max-w-5xl mx-auto space-y-4">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/inventario')} className="h-10 w-10 rounded-full bg-slate-800 text-slate-300 flex items-center justify-center" aria-label="Volver al inventario">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-white text-xl font-black">Importar productos</h1>
            <p className="text-slate-400 text-sm">Carga todo tu inventario de una vez con una plantilla de Excel</p>
          </div>
        </div>

        {/* Paso 1 */}
        <div className={`${caja} p-5 flex flex-col md:flex-row md:items-center gap-4`}>
          <div className="w-11 h-11 rounded-xl bg-emerald-500/15 text-emerald-400 flex items-center justify-center shrink-0"><FileSpreadsheet className="w-6 h-6" /></div>
          <div className="flex-1">
            <p className="text-white font-bold">1. Descarga la plantilla</p>
            <p className="text-slate-400 text-sm">Un Excel con las columnas listas, 3 ejemplos y una hoja de instrucciones. Solo Nombre y Precio de venta son obligatorios.</p>
          </div>
          <button onClick={() => descargarPlantilla()} className={`${boton} bg-emerald-600 hover:bg-emerald-700 text-white`}><Download className="w-4 h-4" /> Descargar plantilla</button>
        </div>

        {/* Paso 2 */}
        {!resultado && (
          <div
            className={`${caja} p-6 border-2 border-dashed text-center transition-colors ${arrastrando ? 'border-amber-500 bg-amber-500/5' : 'border-slate-700'}`}
            onDragOver={(e) => { e.preventDefault(); setArrastrando(true); }}
            onDragLeave={() => setArrastrando(false)}
            onDrop={(e) => { e.preventDefault(); setArrastrando(false); const f = e.dataTransfer.files?.[0]; if (f) leer(f); }}
          >
            <p className="text-white font-bold mb-1">2. Sube el archivo lleno</p>
            <p className="text-slate-400 text-sm mb-4">Excel (.xlsx) o CSV. También sirve un archivo exportado de otro sistema: se reconocen columnas como Código, Referencia, PVP, Existencias.</p>
            <input ref={entradaRef} type="file" accept=".xlsx,.xls,.csv,.txt" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) leer(f); }} />
            <button onClick={() => entradaRef.current?.click()} disabled={leyendo} className={`${boton} bg-amber-500 hover:bg-amber-600 text-slate-950`}>
              {leyendo ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />} {archivo ? 'Cambiar archivo' : 'Elegir archivo'}
            </button>
            {archivo && <p className="text-slate-500 text-xs mt-3">{archivo.name}</p>}
          </div>
        )}

        {/* Paso 3 */}
        {leido && !resultado && (
          <div className="space-y-3">
            <p className="text-white font-bold">3. Revisa y carga</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {[
                ['Filas', resumen.total, 'text-white'],
                ['Listas para cargar', resumen.listas, 'text-emerald-400'],
                ['Con errores (no se cargan)', resumen.conErrores, 'text-red-400'],
                ['Con avisos', resumen.conAvisos, 'text-amber-400'],
              ].map(([t, v, c]) => (
                <div key={t as string} className={`${caja} p-3`}>
                  <p className="text-slate-500 text-[11px] uppercase tracking-wide font-bold">{t}</p>
                  <p className={`text-xl font-black ${c}`}>{num(v as number)}</p>
                </div>
              ))}
            </div>
            <p className="text-slate-500 text-xs">
              Columnas reconocidas: {leido.columnasReconocidas.map((c) => COLUMNAS.find((x) => x.campo === c)?.encabezado).join(', ')}
              {leido.columnasIgnoradas.length > 0 && ` · Se ignoran: ${leido.columnasIgnoradas.join(', ')}`}
            </p>

            <div className={`${caja} p-3 flex flex-col md:flex-row md:items-center gap-3`}>
              <p className="text-sm text-slate-300 flex-1">Si un código ya existe en tu inventario:</p>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => setActualizar(true)} className={`${boton} h-10 border ${actualizar ? 'border-amber-500 bg-amber-500/10 text-amber-300' : 'border-slate-700 text-slate-300'}`}>Actualizarlo</button>
                <button onClick={() => setActualizar(false)} className={`${boton} h-10 border ${!actualizar ? 'border-amber-500 bg-amber-500/10 text-amber-300' : 'border-slate-700 text-slate-300'}`}>Dejarlo igual</button>
              </div>
            </div>

            <div className="flex gap-2 overflow-x-auto">
              {([['todas', `Todas (${num(resumen.total)})`], ['errores', `Errores (${num(resumen.conErrores)})`], ['avisos', `Avisos (${num(resumen.conAvisos)})`]] as Array<[Filtro, string]>).map(([id, t]) => (
                <button key={id} onClick={() => setFiltro(id)} className={`shrink-0 h-9 px-3 rounded-lg text-sm border ${filtro === id ? 'bg-slate-700 border-slate-600 text-white' : 'border-slate-800 text-slate-400'}`}>{t}</button>
              ))}
            </div>

            <div className={`${caja} overflow-x-auto`}>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-slate-400 text-xs uppercase tracking-wide border-b border-slate-800">
                    <th className="text-left p-3">Fila</th><th className="text-left p-3">Código</th><th className="text-left p-3 min-w-[200px]">Nombre</th>
                    <th className="text-right p-3">Precio</th><th className="text-right p-3">Stock</th><th className="text-left p-3 min-w-[220px]">Revisión</th>
                  </tr>
                </thead>
                <tbody>
                  {visibles.map((f) => (
                    <tr key={f.fila} className="border-b border-slate-800/60 align-top">
                      <td className="p-3 text-slate-500">{f.fila}</td>
                      <td className="p-3 text-slate-300">{String(f.datos.codigo_barras ?? '')}</td>
                      <td className="p-3 text-white">{String(f.datos.nombre ?? '')}</td>
                      <td className="p-3 text-right text-slate-200 tabular-nums">{f.datos.precio_venta !== undefined ? `$${num(Number(f.datos.precio_venta))}` : ''}</td>
                      <td className="p-3 text-right text-slate-200 tabular-nums">{f.datos.stock !== undefined ? num(Number(f.datos.stock)) : ''}</td>
                      <td className="p-3 text-xs">
                        {f.errores.map((e) => <p key={e} className="text-red-400 flex gap-1"><XCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {e}</p>)}
                        {f.avisos.map((a) => <p key={a} className="text-amber-400 flex gap-1"><AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {a}</p>)}
                        {!f.errores.length && !f.avisos.length && <p className="text-emerald-400 flex gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> Lista</p>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {visibles.length === 0 && <p className="text-slate-500 text-sm text-center py-8">Nada para mostrar aquí</p>}
            </div>
            {(leido.filas.length > 300 && visibles.length === 300) && <p className="text-slate-500 text-xs">Se muestran las primeras 300 filas de este filtro; se cargan todas.</p>}

            <div className="flex flex-col md:flex-row gap-2 md:justify-end">
              <button onClick={reiniciar} disabled={!!progreso} className={`${boton} bg-slate-800 hover:bg-slate-700 text-white`}>Cancelar</button>
              <button onClick={cargar} disabled={!!progreso || resumen.listas === 0} className={`${boton} bg-amber-500 hover:bg-amber-600 text-slate-950 md:min-w-[260px]`}>
                {progreso
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Cargando {num(progreso.hechas)} de {num(progreso.total)}</>
                  : <><Upload className="w-4 h-4" /> Cargar {num(resumen.listas)} productos</>}
              </button>
            </div>
            {progreso && (
              <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
                <div className="h-full bg-amber-500 transition-all" style={{ width: `${(progreso.hechas / Math.max(1, progreso.total)) * 100}%` }} />
              </div>
            )}
          </div>
        )}

        {resultado && (
          <div className={`${caja} p-6 space-y-3`}>
            <p className="text-white text-lg font-bold flex items-center gap-2"><CheckCircle2 className="w-6 h-6 text-emerald-400" /> Importación terminada</p>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div><p className="text-2xl font-black text-emerald-400">{num(resultado.nuevos)}</p><p className="text-slate-400 text-xs">nuevos</p></div>
              <div><p className="text-2xl font-black text-sky-400">{num(resultado.actualizados)}</p><p className="text-slate-400 text-xs">actualizados</p></div>
              <div><p className="text-2xl font-black text-slate-300">{num(resultado.omitidos + resumen.conErrores)}</p><p className="text-slate-400 text-xs">no cargados</p></div>
            </div>
            {resultado.errores.map((e) => <p key={e} className="text-red-400 text-sm">{e}</p>)}
            <p className="text-slate-400 text-sm">Los productos ya están en la nube: las cajas los reciben en su próxima sincronización.</p>
            <div className="flex flex-col md:flex-row gap-2">
              <button onClick={() => navigate('/inventario')} className={`${boton} bg-amber-500 hover:bg-amber-600 text-slate-950`}>Ver inventario</button>
              <button onClick={reiniciar} className={`${boton} bg-slate-800 hover:bg-slate-700 text-white`}>Importar otro archivo</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
