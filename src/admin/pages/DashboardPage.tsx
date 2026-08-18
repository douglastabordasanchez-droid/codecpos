import { useEffect, useState } from 'react';
import { obtenerDashboardResumen } from '../lib/adminApi';
import { PageHeader, SectionCard, StatCard, LoadingState, ErrorState } from '../components/ui';

export function DashboardPage() {
  const [datos, setDatos] = useState<Awaited<ReturnType<typeof obtenerDashboardResumen>> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    obtenerDashboardResumen().then(setDatos).catch((e) => setError(e.message));
  }, []);

  if (error) return <><PageHeader title="Dashboard" /><ErrorState mensaje={error} /></>;
  if (!datos) return <><PageHeader title="Dashboard" /><LoadingState /></>;

  return (
    <div>
      <PageHeader title="Dashboard" subtitle="Estado comercial y operativo en tiempo real" />
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        <SectionCard title="Clientes">
          <div className="grid grid-cols-3 gap-3">
            <StatCard label="Total" value={datos.clientes.total} />
            <StatCard label="Activos" value={datos.clientes.activos} />
            <StatCard label="En prueba" value={datos.clientes.en_prueba} tone="warn" />
            <StatCard label="Pruebas vencidas" value={datos.clientes.en_prueba_vencida} tone="danger" />
            <StatCard label="Cancelados" value={datos.clientes.cancelados} tone="danger" />
            <StatCard label="Suspendidos" value={datos.clientes.suspendidos} tone="danger" />
            <StatCard label="Vitalicios" value={datos.clientes.vitalicios} />
          </div>
        </SectionCard>

        <SectionCard title="Suscripciones">
          <div className="grid grid-cols-2 gap-3">
            <StatCard label="Básico" value={datos.suscripciones.basico} />
            <StatCard label="Premium" value={datos.suscripciones.premium} />
            <StatCard label="Con promoción activa" value={datos.suscripciones.con_promocion_activa} />
            <StatCard label="Renovaciones (30 días)" value={datos.suscripciones.proximas_renovaciones_30d} tone="warn" />
            <StatCard label="Cancelaciones (30 días)" value={datos.suscripciones.cancelaciones_30d} tone="danger" />
          </div>
        </SectionCard>

        <SectionCard title="Sucursales">
          <div className="grid grid-cols-3 gap-3">
            <StatCard label="Total" value={datos.sucursales.total} />
            <StatCard label="Activas" value={datos.sucursales.activas} />
            <StatCard label="Adicionales contratadas" value={datos.sucursales.adicionales_contratadas} />
          </div>
        </SectionCard>

        <SectionCard title="Licencias">
          <div className="grid grid-cols-3 gap-3">
            <StatCard label="Activas" value={datos.licencias.activas} />
            <StatCard label="Vencidas" value={datos.licencias.vencidas} tone="danger" />
            <StatCard label="Suspendidas" value={datos.licencias.suspendidas} tone="warn" />
          </div>
        </SectionCard>

        <SectionCard title="Soporte">
          <div className="grid grid-cols-2 gap-3">
            <StatCard label="Solicitudes totales" value={datos.soporte.solicitudes_totales} />
            <StatCard label="Pendientes" value={datos.soporte.pendientes} tone="warn" />
            <StatCard label="Atendidas" value={datos.soporte.atendidas} />
            <StatCard label="Clientes con soporte activo" value={datos.soporte.clientes_con_soporte_activo} />
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
