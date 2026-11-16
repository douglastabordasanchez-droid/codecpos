/**
 * Reporte de meseros y propinas: cuánto vendió cada mesero (quien atendió la
 * mesa, «Atendido por» en la tirilla) y cuánta propina dejó, y la propina que
 * cobró cada caja/cajero. El dashboard solo muestra lo vendido por cajero;
 * esto sirve para medir la efectividad de cada mesero.
 */
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Users, Printer, Loader2 } from 'lucide-react';
import { electronStore } from '../../lib/electronStore';

type Rango = 'hoy' | '7d' | '30d';

interface Fila { nombre: string; ventas: number; total: number; propina: number }

const dinero = (n: number) => `$${Math.round(n).toLocaleString('es-CO')}`;

function agrupar(ventas: any[], clave: (v: any) => string): Fila[] {
  const m = new Map<string, Fila>();
  for (const v of ventas) {
    const nombre = clave(v);
    const f = m.get(nombre) || { nombre, ventas: 0, total: 0, propina: 0 };
    f.ventas += 1;
    const propina = Number(v.propina) || 0;
    f.total += (Number(v.total) || 0) - propina; // lo vendido, sin la propina
    f.propina += propina;
    m.set(nombre, f);
  }
  return [...m.values()].sort((a, b) => b.total - a.total);
}

export function ReporteMeserosPropinas({ darkMode }: { darkMode: boolean }) {
  const [ventas, setVentas] = useState<any[] | null>(null);
  const [rango, setRango] = useState<Rango>('hoy');

  useEffect(() => {
    let activo = true;
    void electronStore.obtenerTodasLasVentas().then((v) => { if (activo) setVentas(v as any[]); }).catch(() => setVentas([]));
    return () => { activo = false; };
  }, []);

  const delPeriodo = useMemo(() => {
    if (!ventas) return [];
    const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    const desde = rango === 'hoy' ? hoy.getTime() : hoy.getTime() - (rango === '7d' ? 6 : 29) * 86_400_000;
    return ventas.filter((v) => {
      const estado = String(v.estado || '').toLowerCase();
      return new Date(v.fecha).getTime() >= desde && estado !== 'devuelto' && estado !== 'anulado';
    });
  }, [ventas, rango]);

  const porMesero = useMemo(() => agrupar(delPeriodo.filter((v) => v.mesero), (v) => String(v.mesero)), [delPeriodo]);
  const porCaja = useMemo(() => agrupar(delPeriodo, (v) => String(v.cajero || 'Sin cajero')), [delPeriodo]);
  const sinMesero = delPeriodo.filter((v) => !v.mesero).length;

  const imprimir = async () => {
    const etiqueta = rango === 'hoy' ? 'Hoy' : rango === '7d' ? 'Últimos 7 días' : 'Últimos 30 días';
    const filas = (lista: Fila[]) => lista.flatMap((f) => [
      { texto: `${f.nombre} (${f.ventas})`, valor: dinero(f.total), negrita: true },
      { texto: '  Propinas', valor: dinero(f.propina) },
    ]);
    try {
      const { printReporteLineas } = await import('../../lib/thermalPrinter');
      const ok = await printReporteLineas('MESEROS Y PROPINAS', [
        { texto: `Período: ${etiqueta}` },
        { separador: true, texto: '' },
        { texto: 'POR MESERO (vendido / propina)', negrita: true },
        ...(porMesero.length ? filas(porMesero) : [{ texto: 'Sin ventas de mesa' }]),
        { separador: true, texto: '' },
        { texto: 'POR CAJA (vendido / propina)', negrita: true },
        ...filas(porCaja),
      ]);
      if (ok) toast.success('Tirilla enviada a imprimir'); else toast.error('No se pudo imprimir. Revisa la impresora.');
    } catch { toast.error('No se pudo imprimir'); }
  };

  const card = darkMode ? 'bg-slate-900/60 border-slate-700' : 'bg-white border-gray-200';
  const txt = darkMode ? 'text-white' : 'text-gray-900';
  const sub = darkMode ? 'text-slate-400' : 'text-gray-500';
  const fila = darkMode ? 'border-slate-800' : 'border-gray-100';

  const Tabla = ({ titulo, lista, vacio }: { titulo: string; lista: Fila[]; vacio: string }) => (
    <div>
      <p className={`text-sm font-bold mb-2 ${txt}`}>{titulo}</p>
      {lista.length === 0 ? <p className={`text-xs ${sub}`}>{vacio}</p> : (
        <table className="w-full text-sm">
          <thead>
            <tr className={`text-left text-xs ${sub}`}>
              <th className="py-1.5 font-semibold">Nombre</th>
              <th className="py-1.5 font-semibold text-right">Ventas</th>
              <th className="py-1.5 font-semibold text-right">Vendido</th>
              <th className="py-1.5 font-semibold text-right">Propinas</th>
            </tr>
          </thead>
          <tbody>
            {lista.map((f) => (
              <tr key={f.nombre} className={`border-t ${fila}`}>
                <td className={`py-2 font-semibold ${txt}`}>{f.nombre}</td>
                <td className={`py-2 text-right ${sub}`}>{f.ventas}</td>
                <td className={`py-2 text-right font-bold ${txt}`}>{dinero(f.total)}</td>
                <td className="py-2 text-right font-bold text-emerald-600">{dinero(f.propina)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );

  return (
    <div className={`p-5 rounded-3xl border-2 ${card}`}>
      <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
        <div className="flex items-center gap-2">
          <Users className="w-5 h-5 text-amber-500" />
          <div>
            <h2 className={`text-base font-bold ${txt}`}>Meseros y propinas</h2>
            <p className={`text-xs ${sub}`}>Lo que vendió cada mesero y la propina que cobró cada caja</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {(['hoy', '7d', '30d'] as Rango[]).map((r) => (
            <button key={r} onClick={() => setRango(r)}
              className={`h-9 px-3 rounded-xl text-xs font-bold border ${rango === r ? 'bg-amber-500 border-amber-500 text-slate-950' : darkMode ? 'border-slate-600 text-slate-300' : 'border-gray-300 text-gray-600'}`}>
              {r === 'hoy' ? 'Hoy' : r === '7d' ? '7 días' : '30 días'}
            </button>
          ))}
          <button onClick={() => void imprimir()} disabled={!ventas}
            className="h-9 px-3 rounded-xl text-xs font-bold bg-emerald-600 !text-[#fff] flex items-center gap-1.5 disabled:opacity-50">
            <Printer className="w-4 h-4" />Tirilla
          </button>
        </div>
      </div>
      {!ventas ? <div className="flex justify-center py-6"><Loader2 className="w-6 h-6 animate-spin text-amber-500" /></div> : (
        <div className="grid gap-6 md:grid-cols-2">
          <Tabla titulo="Por mesero" lista={porMesero} vacio="Todavía no hay ventas de mesa con mesero en este período." />
          <Tabla titulo="Por caja / cajero" lista={porCaja} vacio="Sin ventas en este período." />
        </div>
      )}
      {sinMesero > 0 && ventas && (
        <p className={`text-xs mt-3 ${sub}`}>{sinMesero} venta(s) del período no tienen mesero (ventas de mostrador o de antes de esta función).</p>
      )}
    </div>
  );
}
