/**
 * CODEC POS v2.0 — Sincronización de Promociones, Combos y Proveedores
 *
 * Mismo patrón que panaderiaSyncService.ts: catálogo SOLO baja de Electron
 * (se administra en el computador), la PWA solo consulta. Sin historial de
 * compras/pagos a proveedores todavía — ver migración 0028.
 */
import { getSupabaseClient } from './config';
import { getLinkedClienteId } from './tenantLink';
import type { Promocion, Combo } from '../promocionesService';
import type { Proveedor } from '../proveedoresService';

function ctx() {
  const client = getSupabaseClient();
  const clienteId = getLinkedClienteId();
  if (!client || !clienteId) return null;
  return { client, clienteId };
}

// ── Promociones ──────────────────────────────────────────────────────────────

export async function publicarPromociones(promociones: Promocion[]): Promise<void> {
  const c = ctx();
  if (!c || promociones.length === 0) return;
  const { error } = await c.client.from('promociones').upsert(
    promociones.map((p) => ({
      cliente_id: c.clienteId,
      local_id: p.id,
      nombre: p.nombre,
      descripcion: p.descripcion || null,
      tipo: p.tipo,
      valor_descuento: p.valorDescuento ?? null,
      aplica_a: p.aplicaA,
      monto_minimo: p.montoMinimo ?? null,
      fecha_inicio: p.fechaInicio || null,
      fecha_fin: p.fechaFin || null,
      activa: p.activa,
      prioridad: p.prioridad || 0,
      updated_at: new Date().toISOString(),
    })),
    { onConflict: 'cliente_id,local_id' }
  );
  if (error) throw new Error(error.message);
}

export async function publicarCombos(combos: Combo[]): Promise<void> {
  const c = ctx();
  if (!c || combos.length === 0) return;
  const { error } = await c.client.from('combos').upsert(
    combos.map((combo) => ({
      cliente_id: c.clienteId,
      local_id: combo.id,
      nombre: combo.nombre,
      descripcion: combo.descripcion || null,
      precio_normal: combo.precioNormal,
      precio_combo: combo.precioCombo,
      productos: combo.productos,
      fecha_inicio: combo.fechaInicio || null,
      fecha_fin: combo.fechaFin || null,
      activo: combo.activo,
      updated_at: new Date().toISOString(),
    })),
    { onConflict: 'cliente_id,local_id' }
  );
  if (error) throw new Error(error.message);
}

// ── Proveedores ──────────────────────────────────────────────────────────────

export async function publicarProveedores(proveedores: Proveedor[]): Promise<void> {
  const c = ctx();
  if (!c || proveedores.length === 0) return;
  const { error } = await c.client.from('proveedores').upsert(
    proveedores.map((p) => ({
      cliente_id: c.clienteId,
      local_id: p.id,
      nombre: p.nombre,
      nit: p.nit || null,
      contacto_principal: p.contactoPrincipal || null,
      telefono: p.telefono || null,
      email: p.email || null,
      categoria: p.categoria || null,
      saldo_pendiente: p.saldoPendiente || 0,
      total_comprado: p.totalComprado || 0,
      calificacion: p.calificacion || 5,
      activo: p.activo,
      bloqueado: p.bloqueado,
      updated_at: new Date().toISOString(),
    })),
    { onConflict: 'cliente_id,local_id' }
  );
  if (error) throw new Error(error.message);
}
