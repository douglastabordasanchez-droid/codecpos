/**
 * 🎯 SERVICIO DE CARTERA (VENTAS A CRÉDITO)
 * Ventas donde el cliente abona una parte y queda un saldo pendiente
 * 100% offline - IndexedDB
 */

import { openDB } from './indexedDB';
import { logAction } from './logger';

export interface AbonoCartera {
  id: string;
  monto: number;
  metodoPago: string;
  fecha: string;
  usuario: string;
  sesionCajaId?: string;
  referencia?: string;
  notas?: string;
}

export interface CuentaCartera {
  id: string;
  ventaId: string;
  numeroFactura: string;

  clienteId: string;
  clienteNombre: string;
  clienteTelefono?: string;
  clienteDocumento?: string;

  total: number;
  abonos: AbonoCartera[];
  totalAbonado: number;
  saldo: number;

  estado: 'pendiente' | 'pagada' | 'vencida';

  fechaVenta: string;
  fechaVencimiento: string;
  diasCredito: number;
  fechaPagoCompleto?: string;

  sesionCajaId?: string;
  usuarioCreador: string;

  recordatorioEnviado?: boolean;
  fechaUltimoRecordatorio?: string;

  notas?: string;
}

const LS_ABONOS_CARTERA = 'pos-abonos-cartera';

/** Registra un abono en el mecanismo plano que CierreCajaPage lee para
 *  sumarlo al cuadre del día en que se recibe — mismo patrón que 'pos-gastos'. */
function registrarAbonoEnCierre(abono: AbonoCartera & { cuentaId: string; clienteNombre: string }): void {
  try {
    const lista = JSON.parse(localStorage.getItem(LS_ABONOS_CARTERA) || '[]');
    const arr = Array.isArray(lista) ? lista : [];
    arr.push({
      id: abono.id,
      cuentaId: abono.cuentaId,
      clienteNombre: abono.clienteNombre,
      monto: abono.monto,
      metodoPago: abono.metodoPago,
      fecha: abono.fecha,
      usuarioId: localStorage.getItem('usuario_actual_id') || undefined,
      sesionCajaId: abono.sesionCajaId,
    });
    localStorage.setItem(LS_ABONOS_CARTERA, JSON.stringify(arr));
  } catch { /* no bloquea el registro del abono en la cuenta */ }
}

/**
 * Crea la cuenta de cartera asociada a una venta ya registrada.
 * Si `abonoInicial` > 0, ya queda registrado como el primer abono
 * (típicamente lo que el cliente pagó en el momento de la venta).
 */
export async function crearCuentaCartera(datos: {
  id?: string;
  ventaId: string;
  numeroFactura: string;
  clienteId: string;
  clienteNombre: string;
  clienteTelefono?: string;
  clienteDocumento?: string;
  total: number;
  abonoInicial: number;
  metodoAbonoInicial?: string;
  diasCredito: number;
  sesionCajaId?: string;
  usuarioCreador: string;
  notas?: string;
}): Promise<CuentaCartera> {
  try {
    const db = await openDB();

    if (datos.abonoInicial < 0 || datos.abonoInicial > datos.total) {
      throw new Error('El abono inicial no puede ser negativo ni mayor al total de la venta');
    }

    const fechaVencimiento = new Date();
    fechaVencimiento.setDate(fechaVencimiento.getDate() + datos.diasCredito);

    const abonos: AbonoCartera[] = [];
    if (datos.abonoInicial > 0) {
      abonos.push({
        id: `AB-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        monto: datos.abonoInicial,
        metodoPago: datos.metodoAbonoInicial || 'efectivo',
        fecha: new Date().toISOString(),
        usuario: datos.usuarioCreador,
        sesionCajaId: datos.sesionCajaId,
        notas: 'Abono inicial (al momento de la venta)',
      });
    }

    const cuenta: CuentaCartera = {
      id: datos.id || `CART-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      ventaId: datos.ventaId,
      numeroFactura: datos.numeroFactura,
      clienteId: datos.clienteId,
      clienteNombre: datos.clienteNombre,
      clienteTelefono: datos.clienteTelefono,
      clienteDocumento: datos.clienteDocumento,
      total: datos.total,
      abonos,
      totalAbonado: datos.abonoInicial,
      saldo: datos.total - datos.abonoInicial,
      estado: datos.abonoInicial >= datos.total ? 'pagada' : 'pendiente',
      fechaVenta: new Date().toISOString(),
      fechaVencimiento: fechaVencimiento.toISOString(),
      diasCredito: datos.diasCredito,
      fechaPagoCompleto: datos.abonoInicial >= datos.total ? new Date().toISOString() : undefined,
      sesionCajaId: datos.sesionCajaId,
      usuarioCreador: datos.usuarioCreador,
      notas: datos.notas,
    };

    await db.put('cartera', cuenta);

    if (datos.abonoInicial > 0) {
      registrarAbonoEnCierre({ ...abonos[0], cuentaId: cuenta.id, clienteNombre: cuenta.clienteNombre });
    }

    await logAction('cartera', 'cuenta_creada', {
      cuentaId: cuenta.id,
      cliente: cuenta.clienteNombre,
      total: cuenta.total,
      abonoInicial: datos.abonoInicial,
      saldo: cuenta.saldo,
    });

    return cuenta;
  } catch (error) {
    console.error('Error creando cuenta de cartera:', error);
    throw error;
  }
}

export async function obtenerCuentaCartera(id: string): Promise<CuentaCartera | null> {
  try {
    const db = await openDB();
    return (await db.get('cartera', id)) || null;
  } catch (error) {
    console.error('Error obteniendo cuenta de cartera:', error);
    return null;
  }
}

export async function listarCuentasCartera(filtros?: {
  estado?: CuentaCartera['estado'];
  clienteId?: string;
  soloConSaldo?: boolean;
}): Promise<CuentaCartera[]> {
  try {
    const db = await openDB();
    let cuentas: CuentaCartera[] = await db.getAll('cartera');

    if (filtros?.estado) {
      cuentas = cuentas.filter((c) => c.estado === filtros.estado);
    }
    if (filtros?.clienteId) {
      cuentas = cuentas.filter((c) => c.clienteId === filtros.clienteId);
    }
    if (filtros?.soloConSaldo) {
      cuentas = cuentas.filter((c) => (c.saldo || 0) > 0);
    }

    return cuentas.sort((a, b) => new Date(b.fechaVenta).getTime() - new Date(a.fechaVenta).getTime());
  } catch (error) {
    console.error('Error listando cuentas de cartera:', error);
    return [];
  }
}

export async function listarCuentasPorCliente(clienteId: string): Promise<CuentaCartera[]> {
  return listarCuentasCartera({ clienteId });
}

/**
 * Registra un abono posterior a la venta original (el cliente vuelve otro
 * día a pagar parte o todo su saldo). Además de actualizar la cuenta,
 * escribe el registro plano que CierreCajaPage suma al cuadre del día en
 * que se recibe.
 */
export async function registrarAbono(
  cuentaId: string,
  monto: number,
  metodoPago: string,
  opciones?: { referencia?: string; notas?: string; sesionCajaId?: string; usuario?: string }
): Promise<CuentaCartera> {
  try {
    const db = await openDB();
    const cuenta = await obtenerCuentaCartera(cuentaId);

    if (!cuenta) {
      throw new Error('Cuenta de cartera no encontrada');
    }
    if (cuenta.estado === 'pagada') {
      throw new Error('Esta cuenta ya está pagada en su totalidad');
    }
    if (monto <= 0) {
      throw new Error('El monto debe ser mayor a cero');
    }
    if (monto > cuenta.saldo) {
      throw new Error('El monto supera el saldo pendiente');
    }

    const usuario = opciones?.usuario || localStorage.getItem('usuario_actual') || 'Sistema';

    const abono: AbonoCartera = {
      id: `AB-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      monto,
      metodoPago,
      fecha: new Date().toISOString(),
      usuario,
      sesionCajaId: opciones?.sesionCajaId,
      referencia: opciones?.referencia,
      notas: opciones?.notas,
    };

    const nuevoTotalAbonado = cuenta.totalAbonado + monto;
    const nuevoSaldo = cuenta.total - nuevoTotalAbonado;
    const nuevoEstado: CuentaCartera['estado'] = nuevoSaldo <= 0 ? 'pagada' : 'pendiente';

    const actualizada: CuentaCartera = {
      ...cuenta,
      abonos: [...cuenta.abonos, abono],
      totalAbonado: nuevoTotalAbonado,
      saldo: Math.max(0, nuevoSaldo),
      estado: nuevoEstado,
      fechaPagoCompleto: nuevoEstado === 'pagada' ? new Date().toISOString() : cuenta.fechaPagoCompleto,
    };

    await db.put('cartera', actualizada);
    registrarAbonoEnCierre({ ...abono, cuentaId: cuenta.id, clienteNombre: cuenta.clienteNombre });

    await logAction('cartera', 'abono_registrado', {
      cuentaId,
      cliente: cuenta.clienteNombre,
      monto,
      saldoRestante: actualizada.saldo,
    });

    return actualizada;
  } catch (error) {
    console.error('Error registrando abono de cartera:', error);
    throw error;
  }
}

export async function verificarCuentasVencidas(): Promise<void> {
  try {
    const db = await openDB();
    const cuentas = await listarCuentasCartera({ estado: 'pendiente' });
    const ahora = new Date();

    for (const cuenta of cuentas) {
      if (new Date(cuenta.fechaVencimiento) < ahora) {
        await db.put('cartera', { ...cuenta, estado: 'vencida' as const });
      }
    }
  } catch (error) {
    console.error('Error verificando cuentas de cartera vencidas:', error);
  }
}

export async function obtenerCuentasProximasVencer(dias = 3): Promise<CuentaCartera[]> {
  try {
    const cuentas = await listarCuentasCartera({ soloConSaldo: true });
    const ahora = new Date();
    const limite = new Date();
    limite.setDate(limite.getDate() + dias);

    return cuentas.filter((c) => {
      if (c.estado === 'pagada') return false;
      const vencimiento = new Date(c.fechaVencimiento);
      return vencimiento <= limite;
    });
  } catch (error) {
    console.error('Error obteniendo cuentas de cartera próximas a vencer:', error);
    return [];
  }
}

export async function marcarRecordatorioEnviado(cuentaId: string): Promise<void> {
  try {
    const db = await openDB();
    const cuenta = await obtenerCuentaCartera(cuentaId);
    if (!cuenta) return;
    await db.put('cartera', {
      ...cuenta,
      recordatorioEnviado: true,
      fechaUltimoRecordatorio: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error marcando recordatorio de cartera como enviado:', error);
  }
}
