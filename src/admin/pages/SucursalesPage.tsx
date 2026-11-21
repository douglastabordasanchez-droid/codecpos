import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { listarSucursales, listarSedesCobro, marcarSedePagada, type SedeCobro } from '../lib/adminApi';
import { PageHeader, LoadingState, ErrorState, EmptyState, EstadoBadge, PlanBadge } from '../components/ui';

export function SucursalesPage() {
  const [items, setItems] = useState<Awaited<ReturnType<typeof listarSucursales>> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listarSucursales().then(setItems).catch((e) => setError(e.message));
  }, []);

  if (error) return <><PageHeader title="Sucursales" /><ErrorState mensaje={error} /></>;

  return (
    <div>
      <SedesCobro />
      <PageHeader title="Sucursales" subtitle={items ? `${items.length} en total` : undefined} />
      {!items ? (
        <LoadingState />
      ) : items.length === 0 ? (
        <EmptyState mensaje="No hay sucursales registradas todavía." />
      ) : (
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-300 border-b border-slate-800">
                <th className="px-4 py-3 font-medium">Empresa</th>
                <th className="px-4 py-3 font-medium">Sucursal</th>
                <th className="px-4 py-3 font-medium">Plan</th>
                <th className="px-4 py-3 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody>
              {items.map((s: any) => (
                <tr key={s.id} className="border-b border-slate-800/60 last:border-0">
                  <td className="px-4 py-3">
                    {s.clientes_pos ? (
                      <Link to={`/clientes/${s.clientes_pos.id}`} className="hover:text-amber-400">{s.clientes_pos.nombre_negocio}</Link>
                    ) : '—'}
                  </td>
                  <td className="px-4 py-3">
                    {s.nombre} {s.es_principal && <span className="text-xs text-slate-400">(principal)</span>}
                    {s.direccion && <p className="text-xs text-slate-400">{s.direccion}</p>}
                  </td>
                  <td className="px-4 py-3"><PlanBadge plan={s.clientes_pos?.plan} /></td>
                  <td className="px-4 py-3"><EstadoBadge estado={s.estado} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/**
 * Sedes que crean los clientes desde la app (tabla tiendas). Una sede adicional
 * nueva entra en prueba de 14 días; al cobrar instalación (50.000) y
 * mensualidad (Básico 29.990, Premium 49.990) se marca como pagada aquí.
 */
function SedesCobro() {
  const [sedes, setSedes] = useState<SedeCobro[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const cargar = () => listarSedesCobro().then(setSedes).catch((e) => setError(e.message));
  useEffect(() => { void cargar(); }, []);

  const cambiar = async (s: SedeCobro, pagada: boolean) => {
    if (!window.confirm(pagada ? `¿Marcar «${s.nombre}» de ${s.nombre_negocio} como pagada?` : `¿Quitar el pago de «${s.nombre}»? Quedará vencida.`)) return;
    setOcupado(s.local_id);
    try { await marcarSedePagada(s.cliente_id, s.local_id, pagada); await cargar(); }
    catch (e) { setError((e as Error).message); }
    finally { setOcupado(null); }
  };

  const etiqueta: Record<SedeCobro['cobro_estado'], string> = { incluida: 'Incluida en el plan', pagada: 'Pagada', prueba: 'En prueba', vencida: 'Prueba vencida' };
  const color: Record<SedeCobro['cobro_estado'], string> = {
    incluida: 'bg-slate-700 text-slate-200', pagada: 'bg-emerald-600/20 text-emerald-300',
    prueba: 'bg-amber-500/20 text-amber-300', vencida: 'bg-red-600/20 text-red-300',
  };

  return (
    <div className="mb-8">
      <PageHeader title="Sedes de los negocios" subtitle="Sede adicional: Básico $29.990 o Premium $49.990 al mes + $50.000 de instalación · 14 días de prueba" />
      {error && <ErrorState mensaje={error} />}
      {!sedes ? <LoadingState /> : sedes.length === 0 ? <EmptyState mensaje="Ningún negocio ha creado sedes." /> : (
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-300 border-b border-slate-800">
                <th className="px-4 py-3 font-medium">Negocio</th>
                <th className="px-4 py-3 font-medium">Sede</th>
                <th className="px-4 py-3 font-medium">Cobro</th>
                <th className="px-4 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {sedes.map((s) => (
                <tr key={`${s.cliente_id}-${s.local_id}`} className={`border-b border-slate-800/60 last:border-0 ${s.activo ? '' : 'opacity-50'}`}>
                  <td className="px-4 py-3"><Link to={`/clientes/${s.cliente_id}`} className="hover:text-amber-400">{s.nombre_negocio}</Link></td>
                  <td className="px-4 py-3">{s.nombre} {s.es_principal && <span className="text-xs text-slate-400">(principal)</span>}{!s.activo && <span className="text-xs text-slate-400"> · inactiva</span>}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${color[s.cobro_estado]}`}>{etiqueta[s.cobro_estado]}</span>
                    {s.cobro_estado === 'prueba' && <span className="text-xs text-slate-400 ml-2">quedan {s.dias_restantes} días</span>}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {!s.es_principal && (s.cobro_estado === 'prueba' || s.cobro_estado === 'vencida') && (
                      <button disabled={ocupado === s.local_id} onClick={() => void cambiar(s, true)} className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-bold disabled:opacity-50">Marcar pagada</button>
                    )}
                    {!s.es_principal && s.cobro_estado === 'pagada' && (
                      <button disabled={ocupado === s.local_id} onClick={() => void cambiar(s, false)} className="px-3 py-1.5 rounded-lg bg-slate-700 text-slate-200 text-xs font-bold disabled:opacity-50">Quitar pago</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
