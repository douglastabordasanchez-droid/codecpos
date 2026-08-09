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
 *   - La numeración es propia de la nota (una resolución distinta a la de
 *     la factura, elegida explícitamente por quien la emite) — nunca
 *     reutiliza el consecutivo de la factura original.
 *   - El consecutivo se consume de forma atómica ANTES de calcular el CUDE;
 *     si el CUDE falla, el número queda registrado en 'error' y no se
 *     reutiliza — evita que dos notas terminen con el mismo número.
 */
import type { NotaAjusteDian, TipoNotaAjuste, ItemFacturaDian } from './types';
import { calcularCudeNota } from './calcularCudeNota';
import { calcularSoftwareSecurityCode, construirUrlQR } from './softwareSecurityCode';
import { construirXmlNotaAjuste } from './notaAjusteXmlBuilder';
import type { DianExtensionData } from './dianExtensionsBlock';
import { ElectronMainProcessSignatureProvider } from './signatureProvider';
import { DianSoapService } from './dianService';
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

  const consecutivo = await siguienteConsecutivoDian(resolucion.id);
  const numeroNota = `${resolucion.prefijo}${String(consecutivo).padStart(6, '0')}`;

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
    items: datos.items && datos.items.length > 0 ? datos.items : factura.items,
    subtotal: datos.subtotal ?? factura.subtotal,
    totalImpuestos: datos.totalImpuestos ?? factura.totalImpuestos,
    total: datos.total,
    fechaEmision: new Date().toISOString(),
  };

  // El consecutivo ya se consumió — se persiste la nota aunque el CUDE no
  // esté listo todavía, para no perder el número asignado ni arriesgar que
  // se reutilice en un intento posterior.
  const guardada = await crearNotaAjuste(nota);

  try {
    const perfil = await obtenerPerfilFiscalPorId(datos.perfilFiscalId);
    if (!perfil?.softwarePin || !perfil?.identificadorSoftware) {
      throw new Error('El perfil fiscal no tiene configurado el PIN del software o el identificador de software — requeridos para calcular el CUDE y el código de seguridad de la nota.');
    }
    if (!factura.emisor.nit) {
      throw new Error('La factura original no tiene NIT del emisor en su snapshot — no se puede calcular el CUDE de la nota.');
    }
    const ambiente = factura.emisor.ambiente === 'produccion' ? 'produccion' : 'habilitacion';
    const cude = await calcularCudeNota({
      numeroNota,
      fecha: nota.fechaEmision,
      valorBruto: nota.subtotal ?? 0,
      impuestos: (nota.items || []).flatMap((it) => it.impuestos || []),
      valorTotal: nota.total,
      nitEmisor: factura.emisor.nit,
      numeroAdquirente: factura.adquirente.numeroDocumento,
      softwarePin: perfil.softwarePin,
      ambiente,
    });

    const softwareSecurityCode = await calcularSoftwareSecurityCode(perfil.identificadorSoftware, perfil.softwarePin, numeroNota);
    const extension: DianExtensionData = {
      invoiceAuthorization: resolucion.resolucionNumero,
      authorizationStartDate: resolucion.resolucionFecha,
      authorizationEndDate: resolucion.vigenciaHasta,
      prefix: resolucion.prefijo,
      rangoDesde: resolucion.rangoDesde,
      rangoHasta: resolucion.rangoHasta,
      softwareSecurityCode,
      softwareId: perfil.identificadorSoftware,
      qrUrl: construirUrlQR(cude, ambiente),
    };

    const xml = construirXmlNotaAjuste({ ...nota, cude }, factura, extension);
    await actualizarEstadoNota(nota.tipo, guardada.id!, 'pending', { cude, xml });

    try {
      await actualizarEstadoNota(nota.tipo, guardada.id!, 'signing');
      const provider = new ElectronMainProcessSignatureProvider(perfil.id!);
      const xmlFirmadoBytes = await provider.signDocument(new TextEncoder().encode(xml));
      const xmlFirmado = new TextDecoder().decode(xmlFirmadoBytes);
      await actualizarEstadoNota(nota.tipo, guardada.id!, 'sent', { xml: xmlFirmado });

      const soap = new DianSoapService(perfil.id!, ambiente);
      const notaParaEnviar: NotaAjusteDian = { ...nota, cude, xml: xmlFirmado };
      const respuesta = nota.tipo === 'credito' ? await soap.sendCreditNote(notaParaEnviar) : await soap.sendDebitNote(notaParaEnviar);
      await actualizarEstadoNota(nota.tipo, guardada.id!, respuesta.estado, { respuestaDian: respuesta.crudo as Record<string, unknown> });
      return { ...guardada, cude, xml: xmlFirmado, estado: respuesta.estado };
    } catch (procesoError) {
      // Contingencia: la nota YA quedó registrada con su número y CUDE —
      // solo falla la firma o la transmisión, reintentable más adelante.
      await actualizarEstadoNota(nota.tipo, guardada.id!, 'contingency', { });
      console.warn(`[DIAN] Nota ${numeroNota} queda en contingencia: ${(procesoError as Error).message}`);
      return { ...guardada, cude, xml, estado: 'contingency' };
    }
  } catch (e) {
    await actualizarEstadoNota(nota.tipo, guardada.id!, 'error');
    throw e;
  }
}
