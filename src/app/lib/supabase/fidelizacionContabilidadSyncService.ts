/**
 * CODEC POS v2.0 — Sincronización de Fidelización (clientes de puntos) e
 * Ingresos Extra hacia Supabase. Mismo patrón unidireccional (Electron →
 * nube, solo consulta desde la PWA) que promocionesProveedoresSyncService.ts
 * — ver migración 0029.
 */
import { getSupabaseClient } from './config';
import { getLinkedClienteId } from './tenantLink';
import type { Cliente as ClienteFidelizacion } from '../fidelizacionService';
import type { IngresoExtra } from '../contabilidadService';

function ctx() {
  const client = getSupabaseClient();
  const clienteId = getLinkedClienteId();
  if (!client || !clienteId) return null;
  return { client, clienteId };
}

export async function publicarClientesFidelizacion(clientes: ClienteFidelizacion[]): Promise<void> {
  const c = ctx();
  if (!c || clientes.length === 0) return;
  const { error } = await c.client.from('clientes_fidelizacion').upsert(
    clientes.map((cl) => ({
      cliente_id: c.clienteId,
      local_id: cl.id,
      nombre: cl.nombre,
      documento: cl.documento || null,
      telefono: cl.telefono || null,
      email: cl.email || null,
      puntos: cl.puntos,
      puntos_acumulados: cl.puntosAcumulados,
      nivel_fidelidad: cl.nivelFidelidad,
      total_compras: cl.totalCompras,
      numero_compras: cl.numeroCompras,
      activo: cl.activo,
      updated_at: new Date().toISOString(),
    })),
    { onConflict: 'cliente_id,local_id' }
  );
  if (error) throw new Error(error.message);
}

export async function publicarIngresosExtra(ingresos: IngresoExtra[]): Promise<void> {
  const c = ctx();
  if (!c || ingresos.length === 0) return;
  const { error } = await c.client.from('ingresos_extra').upsert(
    ingresos.map((i) => ({
      cliente_id: c.clienteId,
      local_id: i.id,
      fecha: i.fecha,
      concepto: i.concepto,
      categoria: i.categoria || null,
      monto: i.monto,
      metodo_pago: i.metodoPago || null,
      registrado_por: i.registradoPor || null,
      updated_at: new Date().toISOString(),
    })),
    { onConflict: 'cliente_id,local_id' }
  );
  if (error) throw new Error(error.message);
}
