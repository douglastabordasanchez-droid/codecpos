/**
 * Cola de envíos DIAN en segundo plano (Electron).
 *
 * El cajero cobra y despacha: la venta se guarda y el tiquete se imprime sin
 * esperar a la DIAN. Lo que no alcanzó a transmitirse lo termina esta cola,
 * sin tocar la pantalla de venta:
 *
 *   1. Emisiones que ni empezaron por falta de internet (colaEmisionesLocal).
 *   2. Facturas en contingencia: creadas con su CUFE, pero cuya firma o
 *      transmisión falló (DIAN caída, red intermitente). También las que una
 *      factura hecha desde la web deja en contingencia, porque la web no
 *      puede firmar — este computador las firma y transmite.
 *   3. Facturas abandonadas a medio envío (la app se cerró en 'signing'/'sent').
 *
 * La normativa da 48 horas para transmitir tras restablecerse el servicio;
 * aquí se reintenta cada 30 segundos con espera creciente por documento.
 *
 * Corre en el renderer y no en el proceso principal a propósito: la sesión
 * de Supabase vive aquí, y la firma y el envío SOAP ya son llamadas IPC
 * asíncronas al proceso principal (donde está el certificado), así que nada
 * de esto bloquea la interfaz.
 */
import { obtenerTransporteDian, consultarCertificadoNube, xmlYaFirmado, ErrorDeTransmision } from './transporteDian';
import { fechaColombia } from './documentoFiscal';
import { emitirFacturaDianDirecto } from './emitirFacturaDian';
import {
  listarEmisionesPendientes, quitarEmisionPendiente, registrarIntentoEmision,
} from './colaEmisionesLocal';
import {
  actualizarEstadoFactura, incrementarIntentosTransmision, listarFacturasPendientesDeTransmision,
  obtenerFacturaPorVenta, reclamarFacturaParaTransmision,
} from '../supabase/facturaElectronicaDianService';
import type { DianResponse, FacturaElectronicaDian } from './types';

export const INTERVALO_COLA_DIAN_MS = 30_000;
const ESPERA_MAXIMA_MS = 15 * 60_000;

export interface EstadoColaDian {
  enLinea: boolean;
  /** Documentos que siguen sin transmitirse (locales + en contingencia). */
  pendientes: number;
  ultimoError?: string;
  revisadaEn: string;
}

// Espera creciente por documento, en memoria: si la DIAN está caída no tiene
// sentido martillarla cada 30 s con las mismas 20 facturas.
const fallos = new Map<string, number>();
const proximoIntento = new Map<string, number>();
const certificadoPorPerfil = new Map<string, boolean>();
let enCurso = false;
let ultimoEstado: EstadoColaDian = { enLinea: true, pendientes: 0, revisadaEn: new Date(0).toISOString() };

const apiDian = () => (typeof window !== 'undefined' ? (window as any).electron?.dian : undefined);

/** La cola solo puede trabajar donde existe el puente de firma/transmisión. */
export function colaDianDisponible(): boolean {
  const api = apiDian();
  return !!api?.firmarDocumento && !!api?.enviarFacturaSync;
}

function leToca(clave: string): boolean {
  return (proximoIntento.get(clave) ?? 0) <= Date.now();
}

function anotarFallo(clave: string): void {
  const n = (fallos.get(clave) ?? 0) + 1;
  fallos.set(clave, n);
  proximoIntento.set(clave, Date.now() + Math.min(ESPERA_MAXIMA_MS, INTERVALO_COLA_DIAN_MS * 2 ** (n - 1)));
}

function anotarExito(clave: string): void {
  fallos.delete(clave);
  proximoIntento.delete(clave);
}

/** ¿Hay con qué firmar ese perfil — el certificado en este computador o el
 * custodiado en el servidor? Sin ninguno, reclamar la factura solo se la
 * quitaría a la caja que sí puede firmarla. */
async function tieneCertificado(perfilFiscalId: string): Promise<boolean> {
  if (certificadoPorPerfil.has(perfilFiscalId)) return certificadoPorPerfil.get(perfilFiscalId)!;
  try {
    const existe = (await apiDian()?.existeCertificado?.(perfilFiscalId)) === true
      || (await consultarCertificadoNube(perfilFiscalId).catch(() => ({ existe: false }))).existe;
    // Solo se recuerda el «sí»: el certificado puede cargarse en cualquier momento.
    if (existe) certificadoPorPerfil.set(perfilFiscalId, true);
    return existe;
  } catch {
    return false;
  }
}

const esDuplicadoEnDian = (r: DianResponse) => (r.mensajes || []).some((m) => /procesado anteriormente/i.test(String(m)));

/** Firma (si falta) y transmite una factura que ya existe en la nube. */
async function reintentarFactura(f: FacturaElectronicaDian): Promise<void> {
  if (!f.id || !f.xml) throw new Error('La factura no tiene XML generado');
  const ambiente = f.emisor.ambiente || 'habilitacion';

  // La DIAN exige que la fecha de emisión sea la del día de la firma
  // (FAD09e). Un documento que quedó SIN firmar y ya es de otro día no se
  // puede arreglar firmándolo hoy: hay que emitirlo de nuevo.
  if (!xmlYaFirmado(f.xml) && fechaColombia(f.fechaEmision) !== fechaColombia(new Date())) {
    await actualizarEstadoFactura(f.id, 'error', {
      motivoRechazo: 'No se alcanzó a firmar el día de su emisión y la DIAN exige que la fecha de emisión y la de firma coincidan. Emite de nuevo el documento de esta venta.',
    });
    return;
  }

  await incrementarIntentosTransmision(f.id, f.intentosTransmision);

  const transporte = await obtenerTransporteDian(f.perfilFiscalId);
  let xml = f.xml;
  let respuesta;
  try {
    ({ xmlFirmado: xml, respuesta } = await transporte.firmarYTransmitir({ perfilFiscalId: f.perfilFiscalId, ambiente, numero: f.numeroFactura, xml: f.xml }));
  } catch (e) {
    // Si alcanzó a firmarse, se guarda la firma: mañana ya no se podría firmar.
    if (e instanceof ErrorDeTransmision && e.xmlFirmado) await actualizarEstadoFactura(f.id, 'signing', { xml: e.xmlFirmado }).catch(() => undefined);
    throw e;
  }

  // «Documento procesado anteriormente»: el envío original sí llegó y lo que
  // se perdió fue la respuesta. No es un rechazo — se consulta el estado real.
  if (respuesta.estado !== 'accepted' && esDuplicadoEnDian(respuesta) && f.cufe) {
    respuesta = await transporte.consultarEstado(f.perfilFiscalId, ambiente, f.cufe);
  }

  await actualizarEstadoFactura(f.id, respuesta.estado, {
    xml,
    respuestaDian: respuesta.crudo as Record<string, unknown>,
    motivoRechazo: respuesta.estado === 'accepted' ? '' : respuesta.mensajes?.join('; ') || 'La DIAN no validó el documento',
    fechaValidacion: respuesta.estado === 'accepted' ? new Date().toISOString() : undefined,
  });
}

async function vaciarEmisionesLocales(): Promise<void> {
  for (const emision of listarEmisionesPendientes()) {
    const { datos } = emision;
    const clave = `local:${datos.ventaReferencia}`;
    if (!leToca(clave)) continue;

    // Idempotente: si la factura de esa venta ya existe, no se emite otra.
    if (await obtenerFacturaPorVenta(datos.clienteId, datos.ventaReferencia)) {
      quitarEmisionPendiente(datos.ventaReferencia);
      anotarExito(clave);
      continue;
    }

    registrarIntentoEmision(datos.ventaReferencia);
    await emitirFacturaDianDirecto(datos); // nunca lanza
    if (await obtenerFacturaPorVenta(datos.clienteId, datos.ventaReferencia)) {
      quitarEmisionPendiente(datos.ventaReferencia);
      anotarExito(clave);
    } else {
      // No se creó: falta configuración (perfil, numeración, PIN) o la red
      // volvió a caerse. Queda en cola y se reintenta más espaciado.
      anotarFallo(clave);
    }
  }
}

/**
 * Una pasada de la cola. Segura de llamar desde varios sitios: si ya hay una
 * en curso devuelve el último estado sin hacer nada.
 */
export async function procesarColaDian(clienteId: string): Promise<EstadoColaDian> {
  if (enCurso) return ultimoEstado;
  enCurso = true;
  let ultimoError: string | undefined;

  try {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      ultimoEstado = { ...ultimoEstado, enLinea: false, pendientes: Math.max(ultimoEstado.pendientes, listarEmisionesPendientes().length), revisadaEn: new Date().toISOString() };
      return ultimoEstado;
    }

    await vaciarEmisionesLocales();

    let pendientes = await listarFacturasPendientesDeTransmision(clienteId);
    for (const f of pendientes) {
      if (!f.id || !f.actualizadaEn || !leToca(f.id)) continue;
      if (!(await tieneCertificado(f.perfilFiscalId))) continue;
      if (!(await reclamarFacturaParaTransmision(f.id, f.actualizadaEn))) continue;

      try {
        await reintentarFactura(f);
        anotarExito(f.id);
      } catch (e) {
        ultimoError = (e as Error).message;
        anotarFallo(f.id);
        // Se devuelve a contingencia para que el siguiente ciclo (de esta o
        // de otra caja) la vuelva a tomar.
        await actualizarEstadoFactura(f.id, 'contingency', { motivoRechazo: ultimoError }).catch(() => undefined);
      }
    }

    pendientes = await listarFacturasPendientesDeTransmision(clienteId);
    ultimoEstado = {
      enLinea: true,
      pendientes: pendientes.length + listarEmisionesPendientes().length,
      ultimoError,
      revisadaEn: new Date().toISOString(),
    };
  } catch (e) {
    // No se pudo ni consultar la nube: se trata como sin conexión, sin
    // inventar un «0 pendientes» que no se pudo comprobar.
    ultimoEstado = { ...ultimoEstado, enLinea: false, ultimoError: (e as Error).message, revisadaEn: new Date().toISOString() };
  } finally {
    enCurso = false;
  }
  return ultimoEstado;
}
