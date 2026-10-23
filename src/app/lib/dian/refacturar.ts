/**
 * «Facturar de nuevo»: la venta fue real pero su factura quedó anulada con
 * nota crédito (datos del cliente mal escritos, factura duplicada...). Ante
 * la DIAN una factura anulada no se puede revivir: se emite una factura
 * NUEVA con los mismos productos y los datos corregidos, ligada a la misma
 * venta. La anulada conserva su número, su nota y su historia.
 *
 * Así el contador ve: factura anulada + nota crédito que la anula + factura
 * nueva por la venta real. Ni faltantes ni ventas dobles.
 */
import { getSupabaseClient } from '../supabase/config';
import { listarNotasDeFactura } from '../supabase/notaAjusteDianService';
import { registrarClienteDesdeCobro } from '../supabase/clientesFacturacionService';
import { emitirFacturaDianDirecto, type ResultadoEmision } from './emitirFacturaDian';
import { itemsDeFactura } from './emitirNotaAjuste';
import { calcularDocumentoFiscal } from './documentoFiscal';
import { parseDianXml } from './recepcion/parser';
import { adquirenteDesdeCobro, clienteParaGuardar, type DatosClienteCobro } from './clienteCobro';
import { recordarClienteFactura } from './clientesFactura';
import { itemsConIvaConfigurado, type ConfigIva } from './configIva';
import type { FacturaElectronicaDian } from './types';

/** Marca que lleva la referencia de una factura ya reemplazada. */
const MARCA_REEMPLAZADA = '~anulada-';

export function facturaReemplazada(f: Pick<FacturaElectronicaDian, 'ventaReferencia'>): boolean {
  return f.ventaReferencia.includes(MARCA_REEMPLAZADA);
}

/** Número de la venta original (FE000018), también en una factura ya reemplazada. */
export function referenciaVenta(f: Pick<FacturaElectronicaDian, 'ventaReferencia'>): string {
  return f.ventaReferencia.split(MARCA_REEMPLAZADA)[0];
}

/** Lo acreditado con notas crédito aprobadas; si cubre el total, la factura quedó anulada. */
export async function facturaAnulada(f: FacturaElectronicaDian): Promise<boolean> {
  if (!f.id) return false;
  const notas = await listarNotasDeFactura(f.id);
  const acreditado = notas.filter((n) => n.tipo === 'credito' && n.estado === 'accepted').reduce((s, n) => s + Number(n.total || 0), 0);
  return acreditado >= f.total - 1;
}

/**
 * ¿La venta de esta factura se devolvió en Ventas › Devolver o anular? Una
 * venta devuelta (como una duplicada) no se vuelve a facturar.
 */
export async function ventaDevuelta(f: FacturaElectronicaDian): Promise<boolean> {
  const client = getSupabaseClient();
  if (!client) return false;
  const ref = referenciaVenta(f);
  const esUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(ref);
  const { data: venta } = await client.from('ventas').select('id').eq('cliente_id', f.clienteId)
    .eq(esUuid ? 'id' : 'local_id', ref).limit(1).maybeSingle();
  if (!venta) return false;
  const { count } = await client.from('devoluciones').select('id', { count: 'exact', head: true }).eq('venta_id', (venta as { id: string }).id);
  return (count || 0) > 0;
}

const METODO_POR_CODIGO: Record<string, string> = { '10': 'efectivo', '48': 'tarjeta_credito', '49': 'tarjeta', '47': 'transferencia' };

/** Datos del comprador de la factura anulada, para corregirlos. */
export function clienteDeFactura(f: FacturaElectronicaDian): DatosClienteCobro {
  const receptor = f.xml ? parseDianXml(f.xml).documento?.receptor : null;
  const nit = receptor?.nit || f.adquirente.numeroDocumento;
  const esConsumidorFinal = nit === '222222222222';
  return {
    tipo: receptor?.tipoIdentificacion === '31' || receptor?.dv ? '31' : '13',
    documento: esConsumidorFinal ? '' : nit,
    nombre: esConsumidorFinal ? '' : receptor?.razonSocial || f.adquirente.nombreORazonSocial,
    email: receptor?.email || f.adquirente.email || '',
    telefono: receptor?.telefono || f.adquirente.telefono || '',
    direccion: receptor?.direccion || '',
  };
}

/**
 * Productos de la factura nueva: los mismos de la anulada, con el IVA de la
 * configuración de hoy si la anulada salió sin él (el total no cambia).
 */
export function itemsParaFacturarDeNuevo(anulada: FacturaElectronicaDian, configIva?: ConfigIva | null) {
  const items = itemsDeFactura(anulada);
  return configIva ? itemsConIvaConfigurado(items, configIva) : items;
}

export async function facturarDeNuevo(anulada: FacturaElectronicaDian, cliente: DatosClienteCobro, configIva?: ConfigIva | null): Promise<ResultadoEmision> {
  const client = getSupabaseClient();
  if (!client || !anulada.id) throw new Error('nuestra base de datos no está configurada');
  if (facturaReemplazada(anulada)) throw new Error('Esta venta ya se facturó de nuevo.');
  if (!(await facturaAnulada(anulada))) throw new Error('Solo se factura de nuevo una venta cuya factura quedó anulada con nota crédito aprobada.');
  if (await ventaDevuelta(anulada)) throw new Error('Esta venta se devolvió en Ventas › Devolver o anular: no se vuelve a facturar.');

  const items = itemsParaFacturarDeNuevo(anulada, configIva);
  if (items.length === 0) throw new Error('No se pudieron leer los productos de la factura anulada.');
  const fiscal = calcularDocumentoFiscal(items);
  const doc = anulada.xml ? parseDianXml(anulada.xml).documento : null;
  const ref = anulada.ventaReferencia;

  // La anulada deja libre la referencia de la venta: así la venta, su PDF y
  // una devolución futura encuentran la factura nueva.
  const marcada = `${ref}${MARCA_REEMPLAZADA}${anulada.numeroFactura}`;
  const { error } = await client.from('facturas_electronicas').update({ venta_referencia: marcada }).eq('id', anulada.id);
  if (error) throw new Error(error.message);

  const r = await emitirFacturaDianDirecto({
    clienteId: anulada.clienteId,
    ventaReferencia: ref,
    fecha: new Date().toISOString(),
    adquirente: adquirenteDesdeCobro(cliente),
    items,
    subtotal: fiscal.brutoLineas,
    totalImpuestos: fiscal.totalImpuestos,
    total: fiscal.total,
    pago: {
      metodo: METODO_POR_CODIGO[doc?.medioPago || ''] || 'efectivo',
      aCredito: doc?.formaPago === '2',
      fechaVencimiento: doc?.formaPago === '2' ? doc.fechaVencimiento : undefined,
    },
    retenciones: {},
  });

  // Si no alcanzó ni a crearse, la venta vuelve a apuntar a la anulada y se puede intentar otra vez.
  if (r.estado === 'error' || r.estado === 'no_emitido') {
    await client.from('facturas_electronicas').update({ venta_referencia: ref }).eq('id', anulada.id);
  } else if (cliente.documento.trim()) {
    const datos = clienteParaGuardar(cliente);
    recordarClienteFactura(datos);
    void registrarClienteDesdeCobro(anulada.clienteId, datos);
  }
  return r;
}
