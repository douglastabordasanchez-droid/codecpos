/**
 * Orquestador de emisión de una nota de ajuste (crédito/débito) sobre una
 * factura electrónica ya ACEPTADA por la DIAN. Único punto que conecta
 * factura original → numeración propia de la nota → CUDE → XML → firma —
 * la UI nunca construye XML ni decide el consecutivo directamente.
 *
 * Reglas de negocio aplicadas aquí (no solo en la UI, para que también se
 * respeten si algún día se dispara una nota desde otro flujo):
 *   - Solo se puede emitir sobre una factura en estado 'accepted'. Una
 *     nota sobre un borrador, un rechazo o un error no tiene sentido fiscal.
 *   - Nunca se encadena una nota sobre otra nota — `facturaId` siempre
 *     apunta a `facturas_electronicas`, la FK de la base de datos ya lo
 *     garantiza estructuralmente.
 *   - La numeración es propia de la nota (elegida explícitamente por quien
 *     la emite) — nunca reutiliza el consecutivo de la factura original.
 *   - Todo lo que puede fallar por datos se valida ANTES de consumir el
 *     consecutivo; una vez consumido, la nota se persiste de inmediato para
 *     que el número nunca se reutilice.
 *
 * Funciona igual desde Electron y desde la web (ver transporteDian.ts).
 */
import type { NotaAjusteDian, TipoNotaAjuste, ItemFacturaDian, FacturaElectronicaDian } from './types';
import { calcularCudeNota } from './calcularCudeNota';
import { calcularSoftwareSecurityCode, construirUrlQR } from './softwareSecurityCode';
import { construirXmlNotaAjuste } from './notaAjusteXmlBuilder';
import type { DianExtensionData } from './dianExtensionsBlock';
import { calcularDocumentoFiscal, impuestosParaHash, redondear2 } from './documentoFiscal';
import { identificarAdquirente } from './ublComun';
import { obtenerTransporteDian, ErrorDeTransmision } from './transporteDian';
import { parseDianXml } from './recepcion/parser';
import { listarResolucionesPerfil, siguienteConsecutivoDian, obtenerPerfilFiscalPorId } from '../supabase/fiscalProfileService';
import { obtenerFacturaPorId } from '../supabase/facturaElectronicaDianService';
import { crearNotaAjuste, actualizarEstadoNota } from '../supabase/notaAjusteDianService';

export interface DatosNotaAjuste {
  clienteId: string;
  perfilFiscalId: string;
  facturaId: string;
  resolucionId: string;
  tipo: TipoNotaAjuste;
  conceptoCodigo: string;
  motivo: string;
  /** Si no se pasan, la nota ajusta la factura completa (todos sus items). */
  items?: ItemFacturaDian[];
  subtotal?: number;
  totalImpuestos?: number;
  total: number;
}

/**
 * Ítems de una factura ya emitida. La tabla no guarda el detalle: la fuente
 * es el XML que se firmó, que es además lo que la DIAN tiene registrado.
 */
export function itemsDeFactura(factura: FacturaElectronicaDian): ItemFacturaDian[] {
  if (factura.items.length > 0) return factura.items;
  const doc = factura.xml ? parseDianXml(factura.xml).documento : null;
  return (doc?.lineas || []).map((l) => ({
    codigo: l.codigoEstandar || l.codigoVendedor || undefined,
    descripcion: l.descripcion,
    cantidad: l.cantidad,
    unidadMedida: l.unidadMedida || undefined,
    precioUnitario: l.precioUnitario,
    subtotal: l.valorBruto,
    impuestos: l.impuestos
      .filter((i) => !i.esRetencion && ['01', '04', '03'].includes(i.codigo))
      .map((i) => ({ codigo: i.codigo as '01' | '04' | '03', porcentaje: i.tarifa, valor: i.valor })),
  }));
}

/**
 * Ítems de la nota. Sin detalle explícito ajusta la factura completa; si el
 * valor pedido es menor (ajuste parcial), se reparte proporcionalmente entre
 * las líneas para conservar la misma mezcla de tarifas de la factura.
 */
function itemsDeLaNota(datos: DatosNotaAjuste, factura: FacturaElectronicaDian): ItemFacturaDian[] {
  if (datos.items && datos.items.length > 0) return datos.items;
  const completos = itemsDeFactura(factura);
  const totalCompleto = calcularDocumentoFiscal(completos).total;
  if (totalCompleto <= 0 || Math.abs(datos.total - totalCompleto) <= 1) return completos;
  if (datos.total > totalCompleto) {
    throw new Error(`El valor de la nota ($${datos.total.toLocaleString('es-CO')}) supera el total de la factura ($${totalCompleto.toLocaleString('es-CO')}).`);
  }
  const factor = datos.total / totalCompleto;
  return completos.map((it) => ({ ...it, subtotal: redondear2(it.subtotal * factor), precioUnitario: redondear2(it.precioUnitario * factor) }));
}

export async function emitirNotaAjuste(datos: DatosNotaAjuste): Promise<NotaAjusteDian> {
  const factura = await obtenerFacturaPorId(datos.facturaId);
  if (!factura) {
    throw new Error('La factura original no existe');
  }
  if (factura.estado !== 'accepted') {
    throw new Error(`Solo se pueden emitir notas de ajuste sobre facturas aceptadas por la DIAN (estado actual: "${factura.estado}")`);
  }

  const resoluciones = await listarResolucionesPerfil(datos.perfilFiscalId);
  const resolucion = resoluciones.find((r) => r.id === datos.resolucionId);
  if (!resolucion?.id) {
    throw new Error('La resolución de numeración indicada no existe en este perfil fiscal');
  }
  if (resolucion.estado !== 'activa') {
    throw new Error(`La resolución de numeración de la nota no está activa (estado: "${resolucion.estado}")`);
  }

  const perfil = await obtenerPerfilFiscalPorId(datos.perfilFiscalId);
  if (!perfil?.id || !perfil.softwarePin || !perfil.identificadorSoftware) {
    throw new Error('El perfil fiscal no tiene configurado el PIN del software o el identificador de software — requeridos para calcular el CUDE y el código de seguridad de la nota.');
  }
  if (!factura.emisor.nit) {
    throw new Error('La factura original no tiene NIT del emisor en su snapshot — no se puede calcular el CUDE de la nota.');
  }
  const items = itemsDeLaNota(datos, factura);
  if (items.length === 0) {
    throw new Error('No se pudo leer el detalle de la factura original (no tiene XML): no se puede emitir la nota.');
  }
  const fiscal = calcularDocumentoFiscal(items);
  // El snapshot guardado no trae el tipo de persona ni el correo: se toman del perfil que emitió.
  const facturaCompleta: FacturaElectronicaDian = {
    ...factura,
    items: itemsDeFactura(factura),
    emisor: { ...factura.emisor, tipoPersona: perfil.tipoPersona, email: perfil.contactoEmail },
  };

  const consecutivo = await siguienteConsecutivoDian(resolucion.id);
  const numeroNota = `${resolucion.prefijo}${consecutivo}`;

  const nota: NotaAjusteDian = {
    clienteId: datos.clienteId,
    perfilFiscalId: datos.perfilFiscalId,
    facturaId: datos.facturaId,
    tipo: datos.tipo,
    numeroNota,
    prefijo: resolucion.prefijo,
    resolucionId: resolucion.id,
    conceptoCodigo: datos.conceptoCodigo,
    motivo: datos.motivo,
    estado: 'draft',
    items,
    subtotal: fiscal.brutoLineas,
    totalImpuestos: fiscal.totalImpuestos,
    total: fiscal.total,
    fechaEmision: new Date().toISOString(),
  };

  const guardada = await crearNotaAjuste(nota);

  try {
    const ambiente = factura.emisor.ambiente === 'produccion' ? 'produccion' : 'habilitacion';
    const cude = await calcularCudeNota({
      numeroNota,
      fecha: nota.fechaEmision,
      valorBruto: fiscal.brutoLineas,
      impuestos: impuestosParaHash(fiscal),
      valorTotal: fiscal.total,
      nitEmisor: factura.emisor.nit,
      numeroAdquirente: identificarAdquirente(factura.adquirente).numero,
      softwarePin: perfil.softwarePin,
      ambiente,
    });

    const extension: DianExtensionData = {
      invoiceAuthorization: resolucion.resolucionNumero,
      authorizationStartDate: resolucion.resolucionFecha,
      authorizationEndDate: resolucion.vigenciaHasta,
      prefix: resolucion.prefijo,
      rangoDesde: resolucion.rangoDesde,
      rangoHasta: resolucion.rangoHasta,
      softwareSecurityCode: await calcularSoftwareSecurityCode(perfil.identificadorSoftware, perfil.softwarePin, numeroNota),
      softwareId: perfil.identificadorSoftware,
      qrUrl: construirUrlQR(cude, ambiente),
    };

    const xml = construirXmlNotaAjuste({ ...nota, cude }, facturaCompleta, extension);
    await actualizarEstadoNota(nota.tipo, guardada.id!, 'pending', { cude, xml });

    try {
      await actualizarEstadoNota(nota.tipo, guardada.id!, 'signing');
      const transporte = await obtenerTransporteDian(perfil.id);
      const { xmlFirmado, respuesta } = await transporte.firmarYTransmitir({ perfilFiscalId: perfil.id, ambiente, numero: numeroNota, xml });
      await actualizarEstadoNota(nota.tipo, guardada.id!, respuesta.estado, { xml: xmlFirmado, respuestaDian: respuesta.crudo as Record<string, unknown> });
      return { ...guardada, cude, xml: xmlFirmado, estado: respuesta.estado };
    } catch (procesoError) {
      // Contingencia: la nota YA quedó registrada con su número y CUDE —
      // solo falla la firma o la transmisión, reintentable más adelante.
      const xmlFirmado = procesoError instanceof ErrorDeTransmision ? procesoError.xmlFirmado : undefined;
      await actualizarEstadoNota(nota.tipo, guardada.id!, 'contingency', xmlFirmado ? { xml: xmlFirmado } : {});
      console.warn(`[DIAN] Nota ${numeroNota} queda en contingencia: ${(procesoError as Error).message}`);
      return { ...guardada, cude, xml: xmlFirmado || xml, estado: 'contingency' };
    }
  } catch (e) {
    await actualizarEstadoNota(nota.tipo, guardada.id!, 'error');
    throw e;
  }
}
