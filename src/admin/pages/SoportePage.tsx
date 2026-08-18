import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { listarSoporteContratado, listarSolicitudesSoporte, marcarSolicitudAtendida } from '../lib/adminApi';
import { useAdminAuth } from '../contexts/AdminAuthContext';
import { PageHeader, SectionCard, LoadingState, ErrorState, EmptyState, EstadoBadge, formatoMoneda, formatoFecha, formatoFechaHora } from '../components/ui';

export function SoportePage() {
  const { staff } = useAdminAuth();
  const soloLectura = staff?.nivelStaff === 'LECTURA';

  const [contratado, setContratado] = useState<Awaited<ReturnType<typeof listarSoporteContratado>> | null>(null);
  const [solicitudes, setSolicitudes] = useState<Awaited<ReturnType<typeof listarSolicitudesSoporte>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [procesando, setProcesando] = useState<string | null>(null);

  const cargar = () => {
    Promise.all([listarSoporteContratado(), listarSolicitudesSoporte()])
      .then(([c, s]) => { setContratado(c); setSolicitudes(s); })
      .catch((e) => setError(e.message));
  };
  useEffect(cargar, []);

  const handleAtender = async (id: string) => {
    setProcesando(id);
    try {
      await marcarSolicitudAtendida(id);
      cargar();
    } catch (e: any) {
      alert('No se pudo marcar como atendida: ' + e.message);
    } finally {
      setProcesando(null);
    }
  };

  if (error) return <><PageHeader title="Soporte" /><ErrorState mensaje={error} /></>;

  return (
    <div className="space-y-8">
      <div>
        <PageHeader title="Soporte" subtitle="Soporte técnico contratado -- independiente de la licencia, especialmente relevante para clientes Vitalicio" />
        {!contratado ? (
          <LoadingState />
        ) : contratado.length === 0 ? (
          <EmptyState mensaje="Nadie tiene soporte técnico contratado todavía." />
        ) : (
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500 border-b border-slate-800">
                  <th className="px-4 py-3 font-medium">Empresa</th>
                  <th className="px-4 py-3 font-medium">Tipo</th>
                  <th className="px-4 py-3 font-medium">Estado</th>
                  <th className="px-4 py-3 font-medium">Inicio</th>
                  <th className="px-4 py-3 font-medium">Vencimiento</th>
                  <th className="px-4 py-3 font-medium">Precio</th>
                </tr>
              </thead>
              <tbody>
                {contratado.map((c: any) => (
                  <tr key={c.id} className="border-b border-slate-800/60 last:border-0">
                    <td className="px-4 py-3">
                      {c.clientes_pos ? <Link to={`/clientes/${c.clientes_pos.id}`} className="hover:text-emerald-400">{c.clientes_pos.nombre_negocio}</Link> : '—'}
                    </td>
                    <td className="px-4 py-3 text-slate-400">{c.addons?.nombre}</td>
                    <td className="px-4 py-3"><EstadoBadge estado={c.estado} /></td>
                    <td className="px-4 py-3">{formatoFecha(c.fecha_inicio)}</td>
                    <td className="px-4 py-3">{c.fecha_fin ? formatoFecha(c.fecha_fin) : '—'}</td>
                    <td className="px-4 py-3 tabular-nums">{formatoMoneda(c.precio_aplicado)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div>
        <h2 className="text-xl font-bold mb-4">Solicitudes de soporte</h2>
        {!solicitudes ? (
          <LoadingState />
        ) : solicitudes.length === 0 ? (
          <EmptyState mensaje="No hay solicitudes de soporte registradas." />
        ) : (
          <div className="space-y-2">
            {solicitudes.map((s: any) => (
              <SectionCard key={s.id}>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <p className="font-medium">{s.asunto}</p>
                      <EstadoBadge estado={s.estado} />
                    </div>
                    {s.clientes_pos && <p className="text-xs text-slate-500">{s.clientes_pos.nombre_negocio} · {formatoFechaHora(s.created_at)}</p>}
                    {s.descripcion && <p className="text-sm text-slate-400 mt-2">{s.descripcion}</p>}
                  </div>
                  {!soloLectura && s.estado === 'PENDIENTE' && (
                    <button
                      onClick={() => handleAtender(s.id)}
                      disabled={procesando === s.id}
                      className="shrink-0 text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/20 rounded-lg px-3 py-1.5 disabled:opacity-50"
                    >
                      Marcar atendida
                    </button>
                  )}
                </div>
              </SectionCard>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
