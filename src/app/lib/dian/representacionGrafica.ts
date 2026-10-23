/**
 * Representación gráfica de una factura electrónica: arma los datos del PDF
 * carta (pdfGenerator.ts) a partir del XML firmado que se le envió a la DIAN.
 *
 * La tabla facturas_electronicas no guarda las líneas; el XML sí, y es lo
 * que la DIAN validó: así el PDF nunca puede decir algo distinto. Sale igual
 * en Electron, en la web y en el celular, con las columnas de la DIAN
 * (valor unitario sin impuestos, impuesto, bruto, total y retención) y las
 * retenciones restadas del total a pagar.
 */
import { parseDianXml } from './recepcion/parser';
import { IMPUESTOS_DIAN, type DocumentoNormalizado } from './recepcion/types';
import { construirUrlQR } from './softwareSecurityCode';
import { obtenerPerfilFiscalPorId } from '../supabase/fiscalProfileService';
import { obtenerFacturaPorVenta } from '../supabase/facturaElectronicaDianService';
import { buscarClienteFacturacion } from '../supabase/clientesFacturacionService';
import { getSupabaseClient } from '../supabase/config';
import type { FacturaElectronicaDian } from './types';
import type { ConfigEmpresa, ItemFactura, Venta } from '../pdfGenerator';

/** Medios de pago DIAN (cac:PaymentMeansCode) más comunes en un punto de venta. */
const MEDIOS_PAGO: Record<string, string> = {
  '1': 'Instrumento no definido',
  '10': 'Efectivo',
  '20': 'Cheque',
  '42': 'Consignación bancaria',
  '45': 'Transferencia crédito',
  '46': 'Transferencia débito interbancario',
  '47': 'Transferencia',
  '48': 'Tarjeta crédito',
  '49': 'Tarjeta débito',
  ZZZ: 'Otro',
};

const NOMBRES_RETENCION: Record<string, string> = {
  '05': 'ReteIVA',
  '06': 'Retención en la fuente',
  '07': 'ReteICA',
};

const redondear2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

/** Fecha y hora de emisión del XML (hora de Colombia) como ISO. */
function fechaDelDocumento(doc: DocumentoNormalizado, respaldo: string): string {
  if (!doc.fechaEmision) return respaldo;
  const hora = (doc.horaEmision || '12:00:00').slice(0, 8);
  const zona = /[+-]\d{2}:\d{2}$/.test(doc.horaEmision || '') ? doc.horaEmision.slice(-6) : '-05:00';
  const fecha = new Date(`${doc.fechaEmision}T${hora}${zona}`);
  return Number.isNaN(fecha.getTime()) ? respaldo : fecha.toISOString();
}

function lineasDelXml(doc: DocumentoNormalizado): ItemFactura[] {
  return doc.lineas.map((l) => {
    const cargos = l.impuestos.filter((i) => !i.esRetencion);
    const retencion = l.impuestos.find((i) => i.esRetencion);
    const iva = cargos.find((i) => i.codigo === '01') ?? cargos[0];
    const totalImpuestos = cargos.reduce((s, i) => s + i.valor, 0);
    const precioBase = l.precioUnitario || (l.cantidad ? l.valorBruto / l.cantidad : l.valorBruto);
    return {
      nombre: l.descripcion,
      codigo: l.codigoVendedor || undefined,
      cantidad: l.cantidad,
      precio: precioBase,
      subtotal: redondear2(l.valorBruto + totalImpuestos),
      descuento: l.descuento || undefined,
      iva: iva?.tarifa ?? 0,
      fiscal: {
        precioBase,
        bruto: l.valorBruto,
        total: redondear2(l.valorBruto + totalImpuestos),
        retencion: retencion?.tarifa,
      },
    };
  });
}

/** Impuestos del documento por tarifa: «IVA 19%», «INC 8%». */
function impuestosDelXml(doc: DocumentoNormalizado): Array<{ nombre: string; valor: number }> {
  const deDocumento = doc.impuestos.filter((i) => i.alcance === 'documento' && !i.esRetencion);
  const fuente = deDocumento.length > 0 ? deDocumento : doc.impuestos.filter((i) => i.alcance === 'linea' && !i.esRetencion);
  const agrupado = new Map<string, { nombre: string; valor: number }>();
  for (const i of fuente) {
    const clave = `${i.codigo}|${i.tarifa}`;
    const actual = agrupado.get(clave) || { nombre: `${IMPUESTOS_DIAN[i.codigo] || i.nombre || i.codigo} ${i.tarifa}%`, valor: 0 };
    actual.valor = redondear2(actual.valor + i.valor);
    agrupado.set(clave, actual);
  }
  return [...agrupado.values()];
}

function retencionesDelXml(doc: DocumentoNormalizado): Array<{ nombre: string; valor: number }> {
  const deDocumento = doc.impuestos.filter((i) => i.alcance === 'documento' && i.esRetencion);
  const fuente = deDocumento.length > 0 ? deDocumento : doc.impuestos.filter((i) => i.alcance === 'linea' && i.esRetencion);
  const agrupado = new Map<string, { nombre: string; valor: number }>();
  for (const i of fuente) {
    const clave = `${i.codigo}|${i.tarifa}`;
    const actual = agrupado.get(clave) || { nombre: `${NOMBRES_RETENCION[i.codigo] || i.nombre || i.codigo} ${i.tarifa}%`, valor: 0 };
    actual.valor = redondear2(actual.valor + i.valor);
    agrupado.set(clave, actual);
  }
  return [...agrupado.values()];
}

/**
 * Datos para generarFacturaPDF() de una factura electrónica ya emitida.
 * `empresa` completa lo que el XML no trae (logo, teléfono, ciudad).
 */
export function datosPdfFacturaDian(
  factura: FacturaElectronicaDian,
  empresa: Partial<ConfigEmpresa> = {},
): { venta: Venta; config: ConfigEmpresa } {
  const doc = factura.xml ? parseDianXml(factura.xml).documento : null;
  const ambiente = factura.emisor.ambiente ?? 'habilitacion';
  const cufe = factura.cufe || doc?.cufe || '';
  const fecha = doc ? fechaDelDocumento(doc, factura.fechaEmision) : factura.fechaEmision;
  const receptor = doc?.receptor;
  const medio = doc?.medioPago ? (MEDIOS_PAGO[doc.medioPago] || doc.medioPago) : (factura.pago?.metodo || 'efectivo');
  const items = doc && doc.lineas.length > 0
    ? lineasDelXml(doc)
    : factura.items.map((i) => ({
      nombre: i.descripcion, codigo: i.codigo, cantidad: i.cantidad, precio: i.precioUnitario, subtotal: i.subtotal,
      iva: i.impuestos?.find((t) => t.codigo === '01')?.porcentaje,
    }));
  const iva = doc ? doc.resumen.totalImpuestos : factura.totalImpuestos;

  const venta: Venta = {
    numeroFactura: factura.numeroFactura,
    numeroElectronico: factura.numeroFactura,
    fecha,
    fechaGeneracion: fecha,
    items,
    subtotal: doc ? doc.totales.brutoLineas : factura.subtotal,
    iva,
    total: doc ? doc.totales.total : factura.total,
    metodoPago: medio,
    fechaVencimiento: doc?.fechaVencimiento || factura.pago?.fechaVencimiento,
    cajero: '',
    cliente: receptor?.razonSocial || factura.adquirente.nombreORazonSocial,
    clienteDocumento: (() => {
      const nit = receptor?.nit || factura.adquirente.numeroDocumento;
      const dv = receptor?.dv || factura.adquirente.digitoVerificacion;
      return dv ? `${nit}-${dv}` : nit;
    })(),
    clienteTelefono: receptor?.telefono || factura.adquirente.telefono,
    clienteDireccion: receptor?.direccion || factura.adquirente.direccion,
    clienteCiudad: receptor?.ciudad || undefined,
    clienteEmail: receptor?.email || factura.adquirente.email,
    observaciones: doc?.notas.filter(Boolean).join(' ') || undefined,
    cufe: cufe || null,
    qrUrl: doc?.autorizacion.qr || (cufe ? construirUrlQR(cufe, ambiente) : null),
    impuestosDetalle: doc ? impuestosDelXml(doc) : (iva > 0 ? [{ nombre: 'IVA', valor: iva }] : []),
    retenciones: doc ? retencionesDelXml(doc) : [],
  };

  const config: ConfigEmpresa = {
    ...empresa,
    nombreComercial: factura.emisor.nombreComercial || empresa.nombreComercial || factura.emisor.nombreORazonSocial || '',
    razonSocial: factura.emisor.nombreORazonSocial || empresa.razonSocial || '',
    nit: factura.emisor.nit || empresa.nit || '',
    digitoVerificacion: factura.emisor.digitoVerificacion || empresa.digitoVerificacion,
    direccion: factura.emisor.direccion || empresa.direccion || '',
    telefono: empresa.telefono || '',
    email: factura.emisor.email || empresa.email || '',
    ciudad: empresa.ciudad || doc?.emisor.ciudad || '',
    // Quien factura IVA es responsable de IVA; si no lo cobró, lo dice el perfil.
    regimenFiscal: empresa.regimenFiscal || (doc && doc.resumen.iva > 0 ? 'comun' : undefined),
    prefijoFactura: doc?.autorizacion.prefijo || factura.prefijo,
    claveResolucionDIAN: doc?.autorizacion.resolucion || undefined,
    fechaResolucionDIAN: doc?.autorizacion.vigenciaDesde || undefined,
    vigenciaResolucionHasta: doc?.autorizacion.vigenciaHasta || undefined,
    rangoAutorizadoDesde: doc?.autorizacion.rangoDesde || undefined,
    rangoAutorizadoHasta: doc?.autorizacion.rangoHasta || undefined,
  };
  return { venta, config };
}

/**
 * Logo, teléfono y ciudad del negocio guardados en la nube (los sube
 * Electron o la web a empresa_configuraciones y al bucket empresa-logos).
 * Se guardan 4 minutos, el enlace firmado del logo dura 10.
 */
const empresaNubeCache = new Map<string, { hasta: number; promesa: Promise<Partial<ConfigEmpresa>> }>();

function empresaEnLaNube(clienteId: string): Promise<Partial<ConfigEmpresa>> {
  const guardada = empresaNubeCache.get(clienteId);
  if (guardada && guardada.hasta > Date.now()) return guardada.promesa;
  const promesa = (async () => {
    const client = getSupabaseClient();
    if (!client) return {};
    const { data } = await client.from('empresa_configuraciones').select('datos, logo_path').eq('cliente_id', clienteId).maybeSingle();
    const fila = data as { datos?: Record<string, any> | null; logo_path?: string | null } | null;
    const datos = fila?.datos || {};
    let logoUrl = '';
    if (fila?.logo_path) {
      const { data: firmado } = await client.storage.from('empresa-logos').createSignedUrl(fila.logo_path, 600);
      logoUrl = firmado?.signedUrl || '';
    }
    return { logoUrl: logoUrl || undefined, telefono: datos.telefono || undefined, ciudad: datos.ciudad || undefined };
  })();
  empresaNubeCache.set(clienteId, { hasta: Date.now() + 4 * 60_000, promesa });
  promesa.catch(() => empresaNubeCache.delete(clienteId));
  return promesa;
}

/** Igual que datosPdfFacturaDian, completando con el perfil fiscal la
 * actividad económica y el régimen que el XML no dice, con el logo del
 * negocio en la nube (el mismo en Electron, la web y el celular) y con la
 * dirección del comprador guardada en Facturación › Clientes. */
export async function datosPdfFacturaDianCompletos(
  factura: FacturaElectronicaDian,
  empresa: Partial<ConfigEmpresa> = {},
): Promise<{ venta: Venta; config: ConfigEmpresa }> {
  const adq = factura.adquirente;
  const [perfil, nube, comprador] = await Promise.all([
    obtenerPerfilFiscalPorId(factura.perfilFiscalId).catch(() => null),
    empresa.logoUrl && empresa.telefono ? null : empresaEnLaNube(factura.clienteId).catch(() => null),
    adq.direccion || !adq.numeroDocumento ? null : buscarClienteFacturacion(factura.clienteId, adq.numeroDocumento).catch(() => null),
  ]);
  const datos = datosPdfFacturaDian(factura, {
    ...empresa,
    logoUrl: empresa.logoUrl || nube?.logoUrl,
    telefono: empresa.telefono || nube?.telefono,
    ciudad: empresa.ciudad || nube?.ciudad,
    actividadEconomica: empresa.actividadEconomica || perfil?.actividadEconomica,
    // El régimen del perfil fiscal es el que va a la DIAN; el de Configuración puede estar viejo.
    regimenFiscal: perfil?.regimenFiscal || empresa.regimenFiscal,
  });
  // El XML no lleva la dirección del comprador: sale de su ficha.
  if (comprador) {
    datos.venta.clienteDireccion ||= comprador.direccion;
    datos.venta.clienteCiudad ||= comprador.ciudad;
    datos.venta.clienteTelefono ||= comprador.telefono;
  }
  return datos;
}

/**
 * PDF de una venta de la caja de escritorio que salió con factura
 * electrónica aceptada: busca la factura por el número de la venta
 * (FE000020) y la arma desde su XML. La venta local solo guarda el nombre
 * del comprador; sin esto el PDF salía sin NIT, correo ni IVA. Devuelve
 * null sin factura aceptada o sin red, y entonces queda la factura local.
 */
export async function datosPdfFacturaDianDeVenta(
  clienteId: string | null | undefined,
  referencias: Array<string | null | undefined>,
  empresa: Partial<ConfigEmpresa> = {},
): Promise<{ venta: Venta; config: ConfigEmpresa } | null> {
  if (!clienteId) return null;
  const unicas = referencias.filter((r, i, arr): r is string => !!r && arr.indexOf(r) === i);
  try {
    for (const ref of unicas) {
      const factura = await obtenerFacturaPorVenta(clienteId, ref);
      if (factura?.xml && factura.estado === 'accepted') return datosPdfFacturaDianCompletos(factura, empresa);
    }
  } catch { /* sin red: factura local */ }
  return null;
}
