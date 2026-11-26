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
import { buscarClienteFacturacion } from '../supabase/clientesFacturacionService';
import { calcularRetenciones, calcularRetencionesElegidas, type RetencionesElegidas } from './retenciones';
import type { AdquirenteDian, ItemFacturaDian, EmisorSnapshot, FacturaElectronicaDian, EstadoDocumentoDian } from './types';
import { decidirTipoDocumentoDian } from './types';
import { sinIvaParaNoResponsable } from './ivaIncluido';
import { calcularCufe } from './cufeCalculator';
import { calcularCudeDocumentoEquivalente } from './calcularCudeDocumentoEquivalente';
import { calcularSoftwareSecurityCode, construirUrlQR } from './softwareSecurityCode';
import { construirXmlFactura, type DianExtensionData } from './xmlBuilder';
import { calcularDocumentoFiscal, fechaColombia, impuestosParaHash } from './documentoFiscal';
import { identificarAdquirente, ubicacionDelEmisor } from './ublComun';
import { obtenerTransporteDian, ErrorDeTransmision } from './transporteDian';
import {
  obtenerPerfilFiscalActivo, listarResolucionesPerfil, siguienteConsecutivoDian, versionDatosFiscales,
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
  /** Retenciones que el cajero activó en el cobro. Sin este campo se aplican
   * las automáticas (cliente agente de retención + perfil fiscal). */
  retenciones?: RetencionesElegidas;
}

export interface ResultadoEmision {
  estado: EstadoDocumentoDian | 'en_cola' | 'no_emitido';
  numero?: string;
  /** Por qué no se emitió o por qué quedó pendiente, en palabras para el usuario. */
  motivo?: string;
  /** El documento ya aprobado, para mostrarlo sin volver a pedirlo a la nube. */
  factura?: FacturaElectronicaDian;
}

// ⚡ Perfil fiscal y numeraciones del negocio en memoria: cambian muy poco y
// antes se pedían a la nube en cada venta (dos viajes antes de empezar). Se
// renuevan a los 3 minutos o apenas se cambian en Configuración, y si con lo guardado algo no cuadra (falta un
// dato, no hay numeración activa, falla el consecutivo) se piden de nuevo.
const VIGENCIA_DATOS_FISCALES_MS = 3 * 60_000;
type DatosFiscales = { perfil: Awaited<ReturnType<typeof obtenerPerfilFiscalActivo>>; resoluciones: Awaited<ReturnType<typeof listarResolucionesPerfil>> };
const cacheFiscal = new Map<string, { datos: DatosFiscales; hasta: number; version: number }>();
async function datosFiscales(clienteId: string, fresco = false): Promise<DatosFiscales & { deMemoria: boolean }> {
  const guardado = cacheFiscal.get(clienteId);
  if (!fresco && guardado && guardado.hasta > Date.now() && guardado.version === versionDatosFiscales) return { ...guardado.datos, deMemoria: true };
  const version = versionDatosFiscales;
  const perfil = await obtenerPerfilFiscalActivo(clienteId, { lanzarSiFalla: true });
  const resoluciones = perfil?.id ? await listarResolucionesPerfil(perfil.id, { lanzarSiFalla: true }) : [];
  if (perfil?.id) cacheFiscal.set(clienteId, { datos: { perfil, resoluciones }, hasta: Date.now() + VIGENCIA_DATOS_FISCALES_MS, version });
  else cacheFiscal.delete(clienteId);
  return { perfil, resoluciones, deMemoria: false };
}
/** Se llama al abrir la caja y luego de vez en cuando: la primera factura del día no espera. */
export function precalentarEmisionDian(clienteId: string | null | undefined) {
  if (!clienteId) return;
  void datosFiscales(clienteId, true).catch(() => undefined);
}

/** Errores del fetch cuando no hay red (Chromium/Electron y Node). */
export function esFallaDeRed(mensaje: string): boolean {
  return /failed to fetch|fetch failed|networkerror|network request failed|load failed|err_internet|err_name_not_resolved|err_network|err_connection|enotfound|econnrefused|econnreset|etimedout/i.test(mensaje);
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
    // Con lo que está en memoria; si algo no cuadra se revisa con datos frescos
    // antes de decir que no se puede (pudieron cambiarlo en Configuración).
    const prepararNumeracion = (perfil: DatosFiscales['perfil'], resoluciones: DatosFiscales['resoluciones']) => {
      if (!perfil?.id) return { motivo: 'El negocio no tiene un perfil fiscal activo.' } as const;
      if (!perfil.nit) return { motivo: 'El perfil fiscal no tiene NIT.' } as const;
      if (!perfil.identificadorSoftware || !perfil.softwarePin) {
        return { motivo: 'Al perfil fiscal le falta el identificador del software o el PIN del software.' } as const;
      }
      const activas = resoluciones.filter((r) => r.estado === 'activa');
      const tipoDocumento = decidirTipoDocumentoDian(datos.adquirente, activas.map((r) => r.tipoDocumento));
      if (tipoDocumento === 'factura' && !perfil.claveTecnica) {
        return { motivo: 'Al perfil fiscal le falta la clave técnica de la numeración.' } as const;
      }
      const resolucion = activas.find((r) => r.tipoDocumento === tipoDocumento);
      if (!resolucion?.id) {
        return { motivo: `No hay una numeración activa para ${tipoDocumento === 'factura' ? 'factura electrónica' : 'documento equivalente POS'}.` } as const;
      }
      return { perfil, tipoDocumento, resolucion } as const;
    };
    let fiscales = await datosFiscales(datos.clienteId);
    let preparado = prepararNumeracion(fiscales.perfil, fiscales.resoluciones);
    if ('motivo' in preparado && fiscales.deMemoria) {
      fiscales = await datosFiscales(datos.clienteId, true);
      preparado = prepararNumeracion(fiscales.perfil, fiscales.resoluciones);
    }
    if ('motivo' in preparado) return noEmitido(datos.ventaReferencia, preparado.motivo!);
    const { perfil, tipoDocumento, resolucion } = preparado;

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
    // Régimen simplificado = no responsable de IVA: no puede facturarlo
    // aunque el producto haya quedado marcado con IVA.
    const items = perfil.regimenFiscal === 'simplificado' ? sinIvaParaNoResponsable(datos.items) : datos.items;

    // La fecha de emisión debe ser la misma del día en que se firma (FAD09e).
    // Una venta hecha sin conexión que se emite al día siguiente lleva la
    // fecha de hoy: su fecha real queda en la venta, que es el registro contable.
    const ahora = new Date().toISOString();
    const fechaEmision = fechaColombia(datos.fecha) === fechaColombia(ahora) ? datos.fecha : ahora;

    const fiscal = calcularDocumentoFiscal(items);
    if (Math.abs(fiscal.total - datos.total) > 1) {
      console.warn(`[DIAN] ${datos.ventaReferencia}: el total fiscal (${fiscal.total}) difiere del cobrado (${datos.total}) — normal si la venta incluye propina, que no hace parte de la factura.`);
    }
    // El cliente de la base de clientes completa lo que el cajero no escribió
    // (tipo de documento, DV, correo) y dice si es agente de retención.
    const adquirenteId0 = identificarAdquirente(datos.adquirente);
    // ⚡ El cliente y el consecutivo se piden a la vez (antes uno tras otro).
    // Buscar el cliente nunca falla (sin él se usa lo que escribió el cajero),
    // así que no hay riesgo de quemar un número por esperarlo en paralelo.
    const pedirConsecutivo = siguienteConsecutivoDian(resolucion.id!).catch((e) => {
      cacheFiscal.delete(datos.clienteId); // ¿numeración cambiada o agotada? La próxima venta la lee de nuevo.
      throw e;
    });
    pedirConsecutivo.catch(() => undefined); // se espera más abajo; evita el aviso de promesa sin atender
    const clienteBase = adquirenteId0.esConsumidorFinal
      ? null
      : await buscarClienteFacturacion(datos.clienteId, adquirenteId0.numero).catch(() => null);
    const adquirente: AdquirenteDian = clienteBase
      ? {
        ...datos.adquirente,
        tipoDocumento: clienteBase.tipoDocumento || datos.adquirente.tipoDocumento,
        digitoVerificacion: datos.adquirente.digitoVerificacion || clienteBase.digitoVerificacion,
        nombreORazonSocial: datos.adquirente.nombreORazonSocial?.trim() && datos.adquirente.nombreORazonSocial !== 'Consumidor final'
          ? datos.adquirente.nombreORazonSocial
          : clienteBase.nombre,
        email: datos.adquirente.email || clienteBase.email,
        telefono: datos.adquirente.telefono || clienteBase.telefono,
        direccion: datos.adquirente.direccion || clienteBase.direccion,
      }
      : datos.adquirente;
    const adquirenteId = identificarAdquirente(adquirente);
    const retenciones = tipoDocumento !== 'factura' ? []
      : datos.retenciones ? calcularRetencionesElegidas(datos.retenciones, fiscal.brutoLineas)
        : calcularRetenciones(perfil.retenciones, clienteBase, fiscal.brutoLineas);

    const consecutivo = await pedirConsecutivo;
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
      // ⚡ Nace en 'signing': antes se creaba en 'pending' y enseguida otro viaje
      // la pasaba a 'signing'. Si la app se cierra aquí, la cola la recoge igual
      // (busca las que quedaron en 'signing' o 'sent' hace rato).
      estado: 'signing',
      intentosTransmision: 0,
      contingencia: false,
      emisor,
      adquirente,
      items,
      subtotal: fiscal.brutoLineas,
      totalImpuestos: fiscal.totalImpuestos,
      total: fiscal.total,
      fechaEmision,
      pago: datos.pago,
      retenciones: retenciones.length > 0 ? retenciones : undefined,
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
      if (respuesta.estado === 'accepted' && !opciones.testSetId) {
        const id = facturaId;
        void import('./correoFacturas').then((m) => m.enviarCorreoAlAprobar(id)).catch(() => undefined);
      } else if (respuesta.estado !== 'accepted') {
        console.warn(`[DIAN] ${numero} (venta ${datos.ventaReferencia}) fue ${respuesta.estado} por la DIAN: ${respuesta.mensajes?.join('; ')}`);
      }
      return {
        estado: respuesta.estado,
        numero,
        motivo: respuesta.estado === 'accepted' ? undefined : respuesta.mensajes?.join('; '),
        factura: respuesta.estado === 'accepted'
          ? {
            ...documento,
            id: facturaId,
            estado: 'accepted',
            xml: xmlFirmado,
            respuestaDian: respuesta.crudo as Record<string, unknown>,
            fechaValidacion: new Date().toISOString(),
          }
          : undefined,
      };
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
    // Windows dice «conectado» pero no hay internet de verdad (wifi sin
    // salida, red caída a mitad de camino): no alcanzó a crearse el documento,
    // así que la venta va a la misma cola local que sin conexión.
    if (!facturaId && hayColaDeEnvios && esFallaDeRed(motivo)) {
      encolarEmisionPendiente(datos);
      console.warn(`[DIAN] Sin conexión real con la nube — la emisión de ${datos.ventaReferencia} queda en cola local: ${motivo}`);
      return { estado: 'en_cola', motivo: 'Sin conexión: se emitirá al volver internet.' };
    }
    console.error(`[DIAN] Error al emitir el documento de ${datos.ventaReferencia} (la venta ya se guardó, no se vio afectada):`, e);
    if (facturaId) await actualizarEstadoFactura(facturaId, 'error', { motivoRechazo: motivo }).catch(() => undefined);
    return { estado: facturaId ? 'error' : 'no_emitido', motivo };
  }
}
