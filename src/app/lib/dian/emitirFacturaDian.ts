/**
 * Orquestador de emisión de un documento electrónico DIAN directo a partir
 * de una venta ya registrada en el POS. Es el ÚNICO lugar que conecta
 * perfil fiscal → decisión factura/documento equivalente → numeración →
 * cifras fiscales → CUFE/CUDE → XML → firma → transmisión → persistencia.
 * El carrito (POSPageNew.tsx, VenderPage.tsx) solo le pasa los datos de la
 * venta y nunca toca XML, firma ni el estado del documento.
 *
 * Qué documento se emite NO es una elección del sistema: lo decide
 * decidirTipoDocumentoDian() según si el comprador viene identificado
 * (regla de la Resolución 000165).
 *
 * Funciona igual desde Electron y desde la web: la firma y el envío pasan
 * por transporteDian.ts, que usa el certificado local o el custodiado en el
 * servidor según dónde se esté.
 *
 * Contrato de «nunca bloquear la venta»: se invoca en segundo plano, después
 * de que la venta ya quedó guardada. No lanza: cualquier fallo queda en el
 * estado del documento ('error' con su motivo, o 'contingency' para que la
 * cola lo reintente) y en el resultado que devuelve.
 */
import type { AdquirenteDian, ItemFacturaDian, EmisorSnapshot, FacturaElectronicaDian, EstadoDocumentoDian } from './types';
import { decidirTipoDocumentoDian } from './types';
import { calcularCufe } from './cufeCalculator';
import { calcularCudeDocumentoEquivalente } from './calcularCudeDocumentoEquivalente';
import { calcularSoftwareSecurityCode, construirUrlQR } from './softwareSecurityCode';
import { construirXmlFactura, type DianExtensionData } from './xmlBuilder';
import { calcularDocumentoFiscal, fechaColombia, impuestosParaHash } from './documentoFiscal';
import { identificarAdquirente, ubicacionDelEmisor } from './ublComun';
import { obtenerTransporteDian, ErrorDeTransmision } from './transporteDian';
import {
  obtenerPerfilFiscalActivo, listarResolucionesPerfil, siguienteConsecutivoDian,
} from '../supabase/fiscalProfileService';
import { crearFacturaDian, actualizarEstadoFactura } from '../supabase/facturaElectronicaDianService';
import { encolarEmisionPendiente } from './colaEmisionesLocal';

export interface DatosVentaParaDian {
  clienteId: string;
  /** id de la venta en IndexedDB (Electron) — mismo valor que numeroFacturaCompleto del POS. */
  ventaReferencia: string;
  fecha: string;
  adquirente: AdquirenteDian;
  items: ItemFacturaDian[];
  /** Informativos: las cifras fiscales se recalculan desde los ítems (ver documentoFiscal.ts). */
  subtotal: number;
  totalImpuestos: number;
  total: number;
  /** Método de pago del POS (efectivo, tarjeta, nequi...) y si fue a crédito. */
  pago?: { metodo?: string; aCredito?: boolean; fechaVencimiento?: string };
}

export interface ResultadoEmision {
  estado: EstadoDocumentoDian | 'en_cola' | 'no_emitido';
  numero?: string;
  /** Por qué no se emitió o por qué quedó pendiente, en palabras para el usuario. */
  motivo?: string;
}

const noEmitido = (referencia: string, motivo: string): ResultadoEmision => {
  console.warn(`[DIAN] No se emite documento para ${referencia}: ${motivo}`);
  return { estado: 'no_emitido', motivo };
};

export interface OpcionesEmision {
  /**
   * Identificador del set de pruebas que la DIAN le asigna al negocio durante
   * la habilitación. Con él, el documento se envía por SendTestSetAsync (el
   * único método que cuenta para habilitarse) y se espera su veredicto.
   */
  testSetId?: string;
}

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function emitirFacturaDianDirecto(datos: DatosVentaParaDian, opciones: OpcionesEmision = {}): Promise<ResultadoEmision> {
  // Sin internet no se puede ni empezar: el perfil fiscal, la numeración y
  // el consecutivo viven en la nube. La venta ya está cobrada y guardada;
  // sus datos quedan en una cola local y colaDian.ts la emite al volver la
  // red. Solo en Electron, que es donde corre la cola que la vacía; en la
  // web una venta no llega hasta aquí sin conexión.
  const hayColaDeEnvios = typeof window !== 'undefined' && !!(window as any).electron?.dian;
  if (hayColaDeEnvios && navigator.onLine === false) {
    encolarEmisionPendiente(datos);
    console.warn(`[DIAN] Sin conexión — la emisión de ${datos.ventaReferencia} queda en cola local y se enviará al volver internet.`);
    return { estado: 'en_cola', motivo: 'Sin conexión: se emitirá al volver internet.' };
  }

  let facturaId: string | undefined;
  try {
    const perfil = await obtenerPerfilFiscalActivo(datos.clienteId);
    if (!perfil?.id) return noEmitido(datos.ventaReferencia, 'El negocio no tiene un perfil fiscal activo.');
    if (!perfil.nit) return noEmitido(datos.ventaReferencia, 'El perfil fiscal no tiene NIT.');
    if (!perfil.identificadorSoftware || !perfil.softwarePin) {
      return noEmitido(datos.ventaReferencia, 'Al perfil fiscal le falta el identificador del software o el PIN del software.');
    }

    const tipoDocumento = decidirTipoDocumentoDian(datos.adquirente);
    if (tipoDocumento === 'factura' && !perfil.claveTecnica) {
      return noEmitido(datos.ventaReferencia, 'Al perfil fiscal le falta la clave técnica de la numeración.');
    }

    const resoluciones = await listarResolucionesPerfil(perfil.id);
    const resolucion = resoluciones.find((r) => r.estado === 'activa' && r.tipoDocumento === tipoDocumento);
    if (!resolucion?.id) {
      return noEmitido(datos.ventaReferencia, `No hay una numeración activa para ${tipoDocumento === 'factura' ? 'factura electrónica' : 'documento equivalente POS'}.`);
    }

    const emisor: EmisorSnapshot = {
      nit: perfil.nit,
      digitoVerificacion: perfil.digitoVerificacion,
      nombreORazonSocial: perfil.nombreORazonSocial,
      nombreComercial: perfil.nombreComercial,
      direccion: perfil.direccionFiscal,
      municipioCodigo: perfil.municipioCodigo,
      departamentoCodigo: perfil.departamentoCodigo,
      responsabilidadesFiscales: perfil.responsabilidadesFiscales,
      ambiente: perfil.ambiente,
      tipoPersona: perfil.tipoPersona,
      email: perfil.contactoEmail,
    };

    // Todo lo que puede fallar por datos del negocio se valida ANTES de
    // consumir el consecutivo: un número quemado no se recupera.
    ubicacionDelEmisor(emisor);
    if (datos.items.length === 0) return noEmitido(datos.ventaReferencia, 'La venta no tiene ítems.');

    // La fecha de emisión debe ser la misma del día en que se firma (FAD09e).
    // Una venta hecha sin conexión que se emite al día siguiente lleva la
    // fecha de hoy: su fecha real queda en la venta, que es el registro contable.
    const ahora = new Date().toISOString();
    const fechaEmision = fechaColombia(datos.fecha) === fechaColombia(ahora) ? datos.fecha : ahora;

    const fiscal = calcularDocumentoFiscal(datos.items);
    if (Math.abs(fiscal.total - datos.total) > 1) {
      console.warn(`[DIAN] ${datos.ventaReferencia}: el total fiscal (${fiscal.total}) difiere del cobrado (${datos.total}) — normal si la venta incluye propina, que no hace parte de la factura.`);
    }
    const adquirenteId = identificarAdquirente(datos.adquirente);

    const consecutivo = await siguienteConsecutivoDian(resolucion.id);
    // Prefijo + consecutivo, sin ceros de relleno: así lo compara la DIAN contra el rango autorizado.
    const numero = `${resolucion.prefijo}${consecutivo}`;

    const comunesHash = {
      fecha: fechaEmision,
      valorBruto: fiscal.brutoLineas,
      impuestos: impuestosParaHash(fiscal),
      valorTotal: fiscal.total,
      nitEmisor: perfil.nit,
      numeroAdquirente: adquirenteId.numero,
      ambiente: perfil.ambiente,
    };
    const cufe = tipoDocumento === 'factura'
      ? await calcularCufe({ ...comunesHash, numeroFactura: numero, claveTecnica: perfil.claveTecnica! })
      : await calcularCudeDocumentoEquivalente({ ...comunesHash, numeroDocumento: numero, softwarePin: perfil.softwarePin });

    const documento: FacturaElectronicaDian = {
      clienteId: datos.clienteId,
      perfilFiscalId: perfil.id,
      resolucionId: resolucion.id,
      tipoDocumento,
      ventaReferencia: datos.ventaReferencia,
      numeroFactura: numero,
      prefijo: resolucion.prefijo,
      cufe,
      estado: 'pending',
      intentosTransmision: 0,
      contingencia: false,
      emisor,
      adquirente: datos.adquirente,
      items: datos.items,
      subtotal: fiscal.brutoLineas,
      totalImpuestos: fiscal.totalImpuestos,
      total: fiscal.total,
      fechaEmision,
      pago: datos.pago,
    };

    const extension: DianExtensionData = {
      invoiceAuthorization: resolucion.resolucionNumero,
      authorizationStartDate: resolucion.resolucionFecha,
      authorizationEndDate: resolucion.vigenciaHasta,
      prefix: resolucion.prefijo,
      rangoDesde: resolucion.rangoDesde,
      rangoHasta: resolucion.rangoHasta,
      softwareSecurityCode: await calcularSoftwareSecurityCode(perfil.identificadorSoftware, perfil.softwarePin, numero),
      softwareId: perfil.identificadorSoftware,
      qrUrl: construirUrlQR(cufe, perfil.ambiente),
    };
    documento.xml = construirXmlFactura(documento, extension);

    facturaId = (await crearFacturaDian(documento)).id!;

    try {
      await actualizarEstadoFactura(facturaId, 'signing');
      const transporte = await obtenerTransporteDian(perfil.id);
      const paraEnviar = { perfilFiscalId: perfil.id, ambiente: perfil.ambiente, numero, xml: documento.xml };
      let xmlFirmado: string;
      let respuesta;
      if (opciones.testSetId) {
        const envio = await transporte.enviarSetDePruebas(paraEnviar, opciones.testSetId);
        ({ xmlFirmado, respuesta } = envio);
        await actualizarEstadoFactura(facturaId, 'sent', { xml: xmlFirmado });
        // El set de pruebas es asíncrono: la DIAN devuelve un ZipKey y valida
        // después. Se consulta hasta que haya veredicto (o ~20 s).
        for (let i = 0; envio.zipKey && i < 6 && respuesta.estado === 'error'; i++) {
          await esperar(3500);
          respuesta = await transporte.consultarResultadoSet(perfil.id, envio.zipKey);
        }
      } else {
        ({ xmlFirmado, respuesta } = await transporte.firmarYTransmitir(paraEnviar));
      }
      await actualizarEstadoFactura(facturaId, respuesta.estado, {
        xml: xmlFirmado,
        respuestaDian: respuesta.crudo as Record<string, unknown>,
        motivoRechazo: respuesta.estado === 'accepted' ? undefined : respuesta.mensajes?.join('; '),
        fechaValidacion: respuesta.estado === 'accepted' ? new Date().toISOString() : undefined,
      });
      if (respuesta.estado !== 'accepted') {
        console.warn(`[DIAN] ${numero} (venta ${datos.ventaReferencia}) fue ${respuesta.estado} por la DIAN: ${respuesta.mensajes?.join('; ')}`);
      }
      return { estado: respuesta.estado, numero, motivo: respuesta.estado === 'accepted' ? undefined : respuesta.mensajes?.join('; ') };
    } catch (procesoError) {
      // Contingencia: el documento ya existe con su número y su CUFE; falló
      // la firma o el envío y la cola lo reintenta. Si alcanzó a firmarse, se
      // guarda el XML firmado para no tener que firmar otro día.
      const motivo = (procesoError as Error).message;
      const xmlFirmado = procesoError instanceof ErrorDeTransmision ? procesoError.xmlFirmado : undefined;
      await actualizarEstadoFactura(facturaId, 'contingency', { motivoRechazo: motivo, ...(xmlFirmado ? { xml: xmlFirmado } : {}) });
      console.warn(`[DIAN] ${numero} (venta ${datos.ventaReferencia}) queda en contingencia: ${motivo}`);
      return { estado: 'contingency', numero, motivo };
    }
  } catch (e) {
    const motivo = (e as Error).message;
    console.error(`[DIAN] Error al emitir el documento de ${datos.ventaReferencia} (la venta ya se guardó, no se vio afectada):`, e);
    if (facturaId) await actualizarEstadoFactura(facturaId, 'error', { motivoRechazo: motivo }).catch(() => undefined);
    return { estado: facturaId ? 'error' : 'no_emitido', motivo };
  }
}
