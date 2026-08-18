import { useEffect, useState } from 'react';
import { listarPromociones, cambiarActivaPromocion } from '../lib/adminApi';
import { useAdminAuth } from '../contexts/AdminAuthContext';
import { PageHeader, SectionCard, LoadingState, ErrorState, EmptyState, EstadoBadge, formatoMoneda, formatoFecha } from '../components/ui';

export function PromocionesPage() {
  const { staff } = useAdminAuth();
  const soloLectura = staff?.nivelStaff === 'LECTURA';

  const [items, setItems] = useState<Awaited<ReturnType<typeof listarPromociones>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [procesando, setProcesando] = useState<string | null>(null);

  const cargar = () => {
    listarPromociones().then(setItems).catch((e) => setError(e.message));
  };
  useEffect(cargar, []);

  const handleToggle = async (id: string, activaActual: boolean) => {
    setProcesando(id);
    try {
      await cambiarActivaPromocion(id, !activaActual);
      cargar();
    } catch (e: any) {
      alert('No se pudo actualizar: ' + e.message);
    } finally {
      setProcesando(null);
    }
  };

  if (error) return <><PageHeader title="Promociones" /><ErrorState mensaje={error} /></>;

  return (
    <div>
      <PageHeader title="Promociones" subtitle="Reglas de precio promocional por plan" />
      {!items ? (
        <LoadingState />
      ) : items.length === 0 ? (
        <EmptyState mensaje="No hay promociones configuradas." />
      ) : (
        <div className="space-y-3">
          {items.map((p: any) => {
            const vigente = p.activa && new Date(p.fecha_fin) > new Date();
            return (
              <SectionCard key={p.id}>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <p className="font-semibold">{p.codigo}</p>
                      <EstadoBadge estado={p.activa ? (vigente ? 'ACTIVA' : 'VENCIDA') : 'INACTIVA'} />
                      {p.planes?.nombre && <span className="text-xs text-slate-500">· {p.planes.nombre}</span>}
                    </div>
                    <p className="text-lg font-bold text-amber-400 tabular-nums">{formatoMoneda(p.precio_promocional)}/mes</p>
                    <p className="text-xs text-slate-500 mt-1">
                      Ventana de adquisición: {formatoFecha(p.fecha_inicio)} — {formatoFecha(p.fecha_fin)} · Beneficio: {p.duracion_beneficio_meses} meses por cliente
                    </p>
                    {p.descripcion && <p className="text-xs text-slate-600 mt-2 max-w-xl">{p.descripcion}</p>}
                  </div>
                  {!soloLectura && (
                    <button
                      onClick={() => handleToggle(p.id, p.activa)}
                      disabled={procesando === p.id}
                      className={`shrink-0 text-xs font-medium rounded-lg px-3 py-1.5 border disabled:opacity-50 ${
                        p.activa
                          ? 'bg-red-500/10 text-red-400 border-red-500/30 hover:bg-red-500/20'
                          : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20'
                      }`}
                    >
                      {p.activa ? 'Desactivar' : 'Activar'}
                    </button>
                  )}
                </div>
              </SectionCard>
            );
          })}
        </div>
      )}
    </div>
  );
}
