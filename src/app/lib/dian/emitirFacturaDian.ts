/**
 * Orquestador de emisión de un documento electrónico DIAN directo a partir
 * de una venta ya registrada en el POS. Es el ÚNICO lugar que conecta
 * perfil fiscal → decisión factura/documento equivalente → numeración →
 * CUFE/CUDE → XML → firma → persistencia — el carrito (POSPageNew.tsx,
 * VenderPage.tsx) solo le pasa los datos de la venta y nunca toca XML,
 * firma ni el estado del documento directamente.
 *
 * Qué documento se emite NO es una elección del sistema: lo decide
 * decidirTipoDocumentoDian() según si el comprador viene identificado
 * (NIT/cédula real) o no (ver types.ts) — regla de la Resolución 000165.
 *
 * Contrato de "nunca bloquear la venta": el llamador debe invocar esto
 * como tarea en segundo plano (fire-and-forget), después de que la venta ya
 * quedó guardada. Cualquier error aquí deja el documento en 'error' o
 * 'contingency' — nunca revierte ni afecta la venta.
 */
import type { AdquirenteDian, ItemFacturaDian, EmisorSnapshot, FacturaElectronicaDian } from './types';
import { decidirTipoDocumentoDian } from './types';
import { calcularCufe } from './cufeCalculator';
import { calcularCudeDocumentoEquivalente } from './calcularCudeDocumentoEquivalente';
import { calcularSoftwareSecurityCode, construirUrlQR } from './softwareSecurityCode';
import { construirXmlFactura, type DianExtensionData } from './xmlBuilder';
import { ElectronMainProcessSignatureProvider } from './signatureProvider';
import { DianSoapService } from './dianService';
import {
  obtenerPerfilFiscalActivo, listarResolucionesPerfil, siguienteConsecutivoDian,
} from '../supabase/fiscalProfileService';
import { crearFacturaDian, actualizarEstadoFactura } from '../supabase/facturaElectronicaDianService';

export interface DatosVentaParaDian {
  clienteId: string;
  /** id de la venta en IndexedDB (Electron) — mismo valor que numeroFacturaCompleto del POS. */
  ventaReferencia: string;
  fecha: string;
  adquirente: AdquirenteDian;
  items: ItemFacturaDian[];
  subtotal: number;
  totalImpuestos: number;
  total: number;
}

/**
 * Intenta emitir la factura electrónica DIAN directa para una venta. No
 * lanza — cualquier fallo queda registrado en logs y, si alcanza a crear la
 * fila, en el estado de la factura misma. Nunca debe invocarse con `await`
 * bloqueando el flujo de venta.
 */
export async function emitirFacturaDianDirecto(datos: DatosVentaParaDian): Promise<void> {
  try {
    const perfil = await obtenerPerfilFiscalActivo(datos.clienteId);
    if (!perfil?.id) {
      console.warn(`[DIAN] Sin perfil fiscal activo — no se emite documento DIAN directo para ${datos.ventaReferencia}`);
      return;
    }

    const tipoDocumento = decidirTipoDocumentoDian(datos.adquirente);

    const resoluciones = await listarResolucionesPerfil(perfil.id);
    const resolucionActiva = resoluciones.find((r) => r.estado === 'activa' && r.tipoDocumento === tipoDocumento) || null;
    if (!resolucionActiva?.id) {
      console.warn(`[DIAN] Sin numeración activa de tipo "${tipoDocumento}" en el perfil ${perfil.id} — no se emite documento para ${datos.ventaReferencia}. Configura esa numeración en el asistente (paso Numeración).`);
      return;
    }

    const consecutivo = await siguienteConsecutivoDian(resolucionActiva.id);
    const numeroDocumento = `${resolucionActiva.prefijo}${String(consecutivo).padStart(6, '0')}`;

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
    };

    const documento: FacturaElectronicaDian = {
      clienteId: datos.clienteId,
      perfilFiscalId: perfil.id,
      resolucionId: resolucionActiva.id,
      tipoDocumento,
      ventaReferencia: datos.ventaReferencia,
      numeroFactura: numeroDocumento,
      prefijo: resolucionActiva.prefijo,
      estado: 'draft',
      intentosTransmision: 0,
      contingencia: false,
      emisor,
      adquirente: datos.adquirente,
      items: datos.items,
      subtotal: datos.subtotal,
      totalImpuestos: datos.totalImpuestos,
      total: datos.total,
      fechaEmision: datos.fecha,
    };

    if (!perfil.nit) {
      console.warn(`[DIAN] Perfil fiscal ${perfil.id} sin NIT configurado — no se puede calcular el ${tipoDocumento === 'factura' ? 'CUFE' : 'CUDE'} de ${datos.ventaReferencia}`);
      return;
    }
    if (!perfil.identificadorSoftware || !perfil.softwarePin) {
      console.warn(`[DIAN] Perfil fiscal ${perfil.id} sin identificador de software o PIN del software configurado — no se puede calcular el código de seguridad del software para ${datos.ventaReferencia}`);
      return;
    }

    if (tipoDocumento === 'documento_equivalente') {
      // Comprador no identificado → Documento Equivalente POS. Misma
      // fórmula de CUDE que las notas de ajuste (Software-PIN, confirmada
      // contra el Anexo Técnico de Documento Equivalente v1.0), y mismo
      // root UBL Invoice que la factura — ver calcularCudeDocumentoEquivalente.ts.
      documento.cufe = await calcularCudeDocumentoEquivalente({
        numeroDocumento,
        fecha: datos.fecha,
        valorBruto: datos.subtotal,
        impuestos: datos.items.flatMap((it) => it.impuestos || []),
        valorTotal: datos.total,
        nitEmisor: perfil.nit,
        numeroAdquirente: datos.adquirente.numeroDocumento,
        softwarePin: perfil.softwarePin,
        ambiente: perfil.ambiente,
      });
    } else {
      // tipoDocumento === 'factura': comprador identificado.
      if (!perfil.claveTecnica) {
        console.warn(`[DIAN] Perfil fiscal ${perfil.id} sin clave técnica configurada — no se puede calcular el CUFE de ${datos.ventaReferencia}`);
        return;
      }
      documento.cufe = await calcularCufe({
        numeroFactura: numeroDocumento,
        fecha: datos.fecha,
        valorBruto: datos.subtotal,
        impuestos: datos.items.flatMap((it) => it.impuestos || []),
        valorTotal: datos.total,
        nitEmisor: perfil.nit,
        numeroAdquirente: datos.adquirente.numeroDocumento,
        claveTecnica: perfil.claveTecnica,
        ambiente: perfil.ambiente,
      });
    }

    const softwareSecurityCode = await calcularSoftwareSecurityCode(perfil.identificadorSoftware, perfil.softwarePin, numeroDocumento);
    const extension: DianExtensionData = {
      invoiceAuthorization: resolucionActiva.resolucionNumero,
      authorizationStartDate: resolucionActiva.resolucionFecha,
      authorizationEndDate: resolucionActiva.vigenciaHasta,
      prefix: resolucionActiva.prefijo,
      rangoDesde: resolucionActiva.rangoDesde,
      rangoHasta: resolucionActiva.rangoHasta,
      softwareSecurityCode,
      softwareId: perfil.identificadorSoftware,
      qrUrl: construirUrlQR(documento.cufe, perfil.ambiente),
    };

    documento.xml = construirXmlFactura(documento, extension);
    documento.estado = 'pending';

    const guardada = await crearFacturaDian(documento);

    try {
      await actualizarEstadoFactura(guardada.id!, 'signing');
      const provider = new ElectronMainProcessSignatureProvider(perfil.id);
      const xmlBytes = new TextEncoder().encode(documento.xml);
      const xmlFirmadoBytes = await provider.signDocument(xmlBytes);
      const xmlFirmado = new TextDecoder().decode(xmlFirmadoBytes);
      documento.xml = xmlFirmado;
      await actualizarEstadoFactura(guardada.id!, 'sent', { xml: xmlFirmado });

      const soap = new DianSoapService(perfil.id, perfil.ambiente);
      const respuesta = await soap.sendInvoice({ ...documento, xml: xmlFirmado });
      await actualizarEstadoFactura(guardada.id!, respuesta.estado, {
        respuestaDian: respuesta.crudo as Record<string, unknown>,
        motivoRechazo: respuesta.estado === 'rejected' ? respuesta.mensajes?.join('; ') : undefined,
        fechaValidacion: respuesta.estado === 'accepted' ? new Date().toISOString() : undefined,
      });
      if (respuesta.estado !== 'accepted') {
        console.warn(`[DIAN] Factura ${numeroDocumento} (venta ${datos.ventaReferencia}) fue ${respuesta.estado} por la DIAN: ${respuesta.mensajes?.join('; ')}`);
      }
    } catch (procesoError) {
      // Contingencia: la venta YA está guardada y facturada localmente con
      // CUFE calculado — solo falla la firma o la transmisión, que se
      // reintentará (Art. 3/10/37: hasta 48h tras restablecerse el servicio).
      await actualizarEstadoFactura(guardada.id!, 'contingency', {
        motivoRechazo: (procesoError as Error).message,
      });
      console.warn(`[DIAN] Factura ${numeroDocumento} (venta ${datos.ventaReferencia}) queda en contingencia: ${(procesoError as Error).message}`);
    }
  } catch (e) {
    console.error(`[DIAN] Error al emitir documento electrónico DIAN directo para ${datos.ventaReferencia} (la venta ya se guardó, no se vio afectada):`, e);
  }
}
