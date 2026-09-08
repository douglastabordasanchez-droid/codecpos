/**
 * Cartera (ventas a crédito) — versión PWA. Escribe directo a la tabla
 * `cuentas_cartera` en Supabase (sin RPC, misma convención que
 * ventaMovilService.ts), que syncService.ts (Electron) sincroniza en ambos
 * sentidos: lo que se crea/abona aquí se ve y se puede seguir abonando desde
 * Electron, y viceversa. Diseño deliberadamente simple: los datos del
 * cliente (nombre/teléfono/documento) se guardan sueltos en la propia
 * cuenta, sin depender de un registro de "cliente" separado ni de su
 * sincronización — evita construir un segundo subsistema solo para esto.
 */
import { getSupabaseClient } from '../../app/lib/supabase/config';

export interface AbonoCarteraMovil {
  id: string;
  monto: number;
  metodoPago: string;
  fecha: string;
  usuario: string;
  notas?: string;
}

export interface CuentaCarteraMovil {
  id: string;
  clienteCarteraNombre: string;
  clienteCarteraTelefono: string | null;
  clienteCarteraDocumento: string | null;
  total: number;
  totalAbonado: number;
  saldo: number;
  estado: 'pendiente' | 'pagada' | 'vencida';
  fechaVenta: string;
  fechaVencimiento: string;
  diasCredito: number;
  numeroFactura: string | null;
  abonos: AbonoCarteraMovil[];
}

function mapRow(row: any): CuentaCarteraMovil {
  return {
    id: row.id,
    clienteCarteraNombre: row.cliente_cartera_nombre,
    clienteCarteraTelefono: row.cliente_cartera_telefono,
    clienteCarteraDocumento: row.cliente_cartera_documento,
    total: Number(row.total),
    totalAbonado: Number(row.total_abonado),
    saldo: Number(row.saldo),
    estado: row.estado,
    fechaVenta: row.fecha_venta,
    fechaVencimiento: row.fecha_vencimiento,
    diasCredito: Number(row.dias_credito),
    numeroFactura: row.numero_factura,
    abonos: row.abonos || [],
  };
}

/** Crea la cuenta de cartera asociada a una venta ya registrada (`crearVentaMovil`). */
export async function crearCuentaCarteraMovil(
  clienteNegocioId: string,
  datos: {
    ventaLocalId?: string;
    numeroFactura?: string;
    clienteNombre: string;
    clienteTelefono?: string;
    clienteDocumento?: string;
    total: number;
    abonoInicial: number;
    metodoAbonoInicial?: string;
    diasCredito: number;
    usuarioCreador: string;
  }
): Promise<{ ok: boolean; error?: string; cuentaId?: string }> {
  const client = getSupabaseClient();
  if (!client) return { ok: false, error: 'nuestra base de datos no está configurada' };
  if (datos.abonoInicial < 0 || datos.abonoInicial > datos.total) {
    return { ok: false, error: 'El abono inicial no puede ser negativo ni mayor al total de la venta' };
  }

  const fechaVenta = new Date();
  const fechaVencimiento = new Date(fechaVenta.getTime() + datos.diasCredito * 86_400_000);
  const saldo = datos.total - datos.abonoInicial;
  const abonos: AbonoCarteraMovil[] = datos.abonoInicial > 0 ? [{
    id: `AB-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
    monto: datos.abonoInicial,
    metodoPago: datos.metodoAbonoInicial || 'efectivo',
    fecha: fechaVenta.toISOString(),
    usuario: datos.usuarioCreador,
    notas: 'Abono inicial (al momento de la venta)',
  }] : [];

  const { data, error } = await client.from('cuentas_cartera').insert({
    cliente_id: clienteNegocioId,
    venta_local_id: datos.ventaLocalId || null,
    numero_factura: datos.numeroFactura || null,
    cliente_cartera_nombre: datos.clienteNombre,
    cliente_cartera_telefono: datos.clienteTelefono || null,
    cliente_cartera_documento: datos.clienteDocumento || null,
    total: datos.total,
    total_abonado: datos.abonoInicial,
    saldo,
    estado: saldo <= 0 ? 'pagada' : 'pendiente',
    fecha_venta: fechaVenta.toISOString(),
    fecha_vencimiento: fechaVencimiento.toISOString(),
    dias_credito: datos.diasCredito,
    fecha_pago_completo: saldo <= 0 ? fechaVenta.toISOString() : null,
    usuario_creador: datos.usuarioCreador,
    abonos,
  }).select('id').single();

  if (error) return { ok: false, error: error.message };
  return { ok: true, cuentaId: data.id };
}

export async function listarCuentasCarteraMovil(clienteNegocioId: string, soloConSaldo = true): Promise<CuentaCarteraMovil[]> {
  const client = getSupabaseClient();
  if (!client) return [];
  let query = client
    .from('cuentas_cartera')
    .select('*')
    .eq('cliente_id', clienteNegocioId)
    .order('fecha_venta', { ascending: false });
  if (soloConSaldo) query = query.gt('saldo', 0);
  const { data } = await query;
  return (data || []).map(mapRow);
}

/** Registra un abono posterior sobre una cuenta existente -- visible/editable desde Electron en el siguiente ciclo de sync. */
export async function registrarAbonoCarteraMovil(
  cuentaId: string,
  monto: number,
  metodoPago: string,
  usuario: string
): Promise<{ ok: boolean; error?: string }> {
  const client = getSupabaseClient();
  if (!client) return { ok: false, error: 'nuestra base de datos no está configurada' };
  if (monto <= 0) return { ok: false, error: 'El monto debe ser mayor a cero' };

  const { data: cuenta, error: e1 } = await client.from('cuentas_cartera').select('*').eq('id', cuentaId).single();
  if (e1 || !cuenta) return { ok: false, error: e1?.message || 'Cuenta no encontrada' };
  if (cuenta.estado === 'pagada') return { ok: false, error: 'Esta cuenta ya está pagada en su totalidad' };
  if (monto > Number(cuenta.saldo)) return { ok: false, error: 'El monto supera el saldo pendiente' };

  const abono: AbonoCarteraMovil = {
    id: `AB-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
    monto, metodoPago, fecha: new Date().toISOString(), usuario,
  };
  const nuevoTotalAbonado = Number(cuenta.total_abonado) + monto;
  const nuevoSaldo = Math.max(0, Number(cuenta.total) - nuevoTotalAbonado);

  const { error: e2 } = await client.from('cuentas_cartera').update({
    abonos: [...(cuenta.abonos || []), abono],
    total_abonado: nuevoTotalAbonado,
    saldo: nuevoSaldo,
    estado: nuevoSaldo <= 0 ? 'pagada' : 'pendiente',
    fecha_pago_completo: nuevoSaldo <= 0 ? new Date().toISOString() : cuenta.fecha_pago_completo,
    updated_at: new Date().toISOString(),
  }).eq('id', cuentaId);

  if (e2) return { ok: false, error: e2.message };
  return { ok: true };
}
