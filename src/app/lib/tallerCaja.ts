/**
 * Cobros del Taller dentro de la caja (Electron y web).
 *
 * Cada abono o pago de una orden de servicio se guarda también como una
 * venta de servicio: así entra al cierre de caja del turno, a Ventas, a
 * Reportes y sube a la nube como cualquier otra venta.
 *
 * Antes se guardaba con `numero: 0`, y como ese número es único en el
 * IndexedDB de ventas, desde el segundo cobro la venta se rechazaba en
 * silencio: el dinero del taller no aparecía en la caja. Ahora usa el mismo
 * consecutivo que una venta del punto de venta (FEA000123).
 */
import { electronStore } from './electronStore';
import { cajaDiariaService } from './cajaDiariaService';
import { armarNumeroFactura } from './numeracionCaja';
import { getTiendaActivaId } from './multitiendaService';
import type { OrdenServicio, PagoOrden } from '../types/taller';

export interface CobroTaller {
  orden: OrdenServicio;
  monto: number;
  metodoPago: PagoOrden['metodoPago'];
  /** Quien cobra (el usuario que tiene la sesión abierta). */
  usuario?: { id?: string; nombreCompleto?: string; username?: string } | null;
  /** Texto corto: «Anticipo», «Abono», «Pago final». */
  concepto?: string;
}

function hoyLocal(): string {
  const ahora = new Date();
  return new Date(ahora.getTime() - ahora.getTimezoneOffset() * 60000).toISOString().split('T')[0];
}

function prefijoConfigurado(): string | undefined {
  try { return JSON.parse(localStorage.getItem('codec_pos_config') || '{}')?.prefijoFactura; } catch { return undefined; }
}

/** Sesión de caja de quien cobra; si no tiene, la que esté abierta hoy en este equipo. */
function sesionParaCobro(usuarioId?: string): { id: string; usuarioId?: string; usuarioNombre?: string } | null {
  const propia = usuarioId ? cajaDiariaService.getSesionActiva(usuarioId, hoyLocal()) : null;
  if (propia) return propia as any;
  try {
    const sesiones: any[] = JSON.parse(localStorage.getItem('pos-caja-sesiones-diarias') || '[]');
    return sesiones.find((s) => s?.estado === 'abierta') || null;
  } catch { return null; }
}

/**
 * Registra el cobro como venta de servicio y devuelve su id y la sesión de
 * caja, para guardarlos en el pago de la orden. Devuelve null si no se pudo
 * (la orden igual guarda el pago; solo no entra a la caja).
 */
export async function registrarCobroTallerEnCaja(c: CobroTaller): Promise<{ ventaId: string; sesionCajaId?: string } | null> {
  const monto = Math.round(Number(c.monto) || 0);
  if (monto <= 0) return null;

  try {
    const ultimaLS = parseInt(localStorage.getItem('pos-ultima-factura') || '0') || 0;
    let ultimaDB = 0;
    try { ultimaDB = await electronStore.getUltimoNumeroVenta(); } catch { /* solo localStorage */ }
    const numero = Math.max(ultimaLS, ultimaDB) + 1;
    const numeroFactura = armarNumeroFactura(numero, prefijoConfigurado());
    try { localStorage.setItem('pos-ultima-factura', String(numero)); } catch { /* storage lleno */ }

    const sesion = sesionParaCobro(c.usuario?.id);
    const cajero = c.usuario?.nombreCompleto || c.usuario?.username || sesion?.usuarioNombre || 'Taller';
    const { orden } = c;
    const dispositivo = [orden.dispositivo?.marca, orden.dispositivo?.modelo].filter(Boolean).join(' ');
    const tecnico = orden.tecnicoAsignado ? ` · Técnico: ${orden.tecnicoAsignado}` : '';
    const concepto = c.concepto || 'Servicio técnico';
    const tienda = getTiendaActivaId();
    const ahora = new Date();

    await electronStore.registrarVentaServicio({
      id: numeroFactura,
      numero,
      numeroFactura,
      fecha: ahora.toISOString(),
      fechaOperativa: hoyLocal(),
      sesionCajaId: sesion?.id,
      items: [{
        id: `taller-${orden.id}`,
        codigo: orden.numeroOrden,
        nombre: `${concepto} ${orden.numeroOrden}${dispositivo ? ` · ${dispositivo}` : ''}${tecnico}`,
        cantidad: 1,
        precio: monto,
        precioVenta: monto,
        precioCompra: 0,
        costo: 0,
        subtotal: monto,
        categoria: 'Servicio técnico',
      }],
      subtotal: monto,
      iva: 0,
      porcentajeIVA: 0,
      descuento: 0,
      total: monto,
      metodoPago: c.metodoPago as any,
      cajero,
      cajeroId: c.usuario?.id || sesion?.usuarioId || '',
      cliente: orden.cliente?.nombre || 'Consumidor final',
      sincronizado: false,
      puntoVentaId: 'POS-001',
      tiendaId: tienda && tienda !== 'tienda_principal' ? tienda : null,
      createdAt: ahora.getTime(),
      syncStatus: 'pending',
      facturaEstado: 'NO_APLICA',
    } as any);

    return { ventaId: numeroFactura, sesionCajaId: sesion?.id };
  } catch (e) {
    console.warn('[Taller] No se pudo registrar el cobro en la caja:', e);
    return null;
  }
}
