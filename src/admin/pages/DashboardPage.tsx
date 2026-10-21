import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { obtenerDashboardResumen, listarNumeracionesPorVencer } from '../lib/adminApi';
import { PageHeader, SectionCard, StatCard, LoadingState, ErrorState } from '../components/ui';

export function DashboardPage() {
  const [datos, setDatos] = useState<Awaited<ReturnType<typeof obtenerDashboardResumen>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [numeraciones, setNumeraciones] = useState<Awaited<ReturnType<typeof listarNumeracionesPorVencer>>>([]);

  useEffect(() => {
    obtenerDashboardResumen().then(setDatos).catch((e) => setError(e.message));
    // Sin permiso o sin red: la tarjeta simplemente no aparece.
    listarNumeracionesPorVencer(30).then(setNumeraciones).catch(() => {});
  }, []);

  if (error) return <><PageHeader title="Dashboard" /><ErrorState mensaje={error} /></>;
  if (!datos) return <><PageHeader title="Dashboard" /><LoadingState /></>;

  return (
    <div>
      <PageHeader title="Dashboard" subtitle="Estado comercial y operativo en tiempo real" />
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {numeraciones.length > 0 && (
          <SectionCard title="Numeraciones DIAN por vencer (30 días)" className="md:col-span-2 xl:col-span-3">
            <p className="text-xs text-slate-400 mb-3">El negocio ve el aviso en su app desde 15 días antes. La numeración nueva la pide el contribuyente o su contador en el MUISCA; luego se asocia a Codec Pos y se trae desde Facturación.</p>
            <div className="divide-y divide-slate-700">
              {numeraciones.map((n) => (
                <Link key={`${n.cliente_id}-${n.prefijo}-${n.resolucion_numero}`} to={`/clientes/${n.cliente_id}`} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm hover:bg-slate-900/50 px-2 rounded">
                  <span className="text-slate-100 font-medium">{n.nombre_negocio}</span>
                  <span className="text-slate-300">{n.prefijo} · Res. {n.resolucion_numero} · quedan {Number(n.numeros_restantes).toLocaleString('es-CO')} números</span>
                  <span className={n.dias_restantes < 0 ? 'text-red-400 font-semibold' : n.dias_restantes <= 15 ? 'text-amber-400 font-semibold' : 'text-slate-300'}>
                    {n.dias_restantes < 0 ? `Venció el ${n.vigencia_hasta.slice(0, 10)}` : n.dias_restantes === 0 ? 'Vence hoy' : `Vence el ${n.vigencia_hasta.slice(0, 10)} (${n.dias_restantes} días)`}
                  </span>
                </Link>
              ))}
            </div>
          </SectionCard>
        )}

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

        <SectionCard title="Instalaciones" className="md:col-span-2 xl:col-span-3">
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
            <StatCard label="Total" value={datos.instalaciones.total} />
            <StatCard label="Escritorio (Electron)" value={datos.instalaciones.electron} />
            <StatCard label="App / Web (PWA)" value={datos.instalaciones.pwa} />
            <StatCard label="Activas (7 días)" value={datos.instalaciones.activas_7d} />
            <StatCard label="Clientes con instalación" value={datos.instalaciones.clientes_con_instalacion} />
            <StatCard label="Nuevas (30 días)" value={datos.instalaciones.nuevas_30d} />
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
