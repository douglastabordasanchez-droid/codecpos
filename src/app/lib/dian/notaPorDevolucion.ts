/**
 * Devolución en el POS → nota crédito electrónica.
 *
 * Si la venta devuelta tiene factura electrónica aprobada, la devolución no
 * queda completa ante la DIAN hasta emitir la nota crédito con lo devuelto.
 * Así la caja, el inventario y la contabilidad (que salen de la devolución)
 * y la DIAN (que sale de la nota) cuentan lo mismo.
 *
 * Nunca lanza: la devolución ya quedó registrada y no se puede deshacer por
 * un problema de la nota. Devuelve qué pasó para avisarle al cajero.
 */
import { emitirNotaAjuste, itemsDeFactura } from './emitirNotaAjuste';
import { calcularDocumentoFiscal, redondear2 } from './documentoFiscal';
import { obtenerFacturaPorVenta } from '../supabase/facturaElectronicaDianService';
import { asegurarNumeracionNota } from '../supabase/fiscalProfileService';
import { listarNotasDeFactura } from '../supabase/notaAjusteDianService';
import type { FacturaElectronicaDian, ItemFacturaDian } from './types';

export interface ItemDevuelto {
  codigo?: string;
  nombre: string;
  cantidad: number;
}

export type ResultadoNotaPorDevolucion =
  | { estado: 'sin_factura' }
  | { estado: 'tiquete_pos' }
  | { estado: 'factura_no_aprobada' }
  /** La factura ya tiene notas crédito aprobadas por todo su valor. */
  | { estado: 'ya_anulada'; notas: string[] }
  | { estado: 'sin_numeracion' }
  | { estado: 'emitida'; numeroNota: string; estadoDian: string }
  | { estado: 'error'; motivo: string };

const normalizar = (v?: string) => (v ?? '').trim().toLowerCase();

/** Líneas de la factura correspondientes a lo devuelto, en la proporción devuelta. */
export function lineasDevueltas(factura: FacturaElectronicaDian, devueltos: ItemDevuelto[]): ItemFacturaDian[] {
  const lineas = itemsDeFactura(factura);
  const usadas = new Set<number>();
  return devueltos.flatMap((d) => {
    const i = lineas.findIndex((l, idx) => !usadas.has(idx) && (
      (d.codigo && normalizar(l.codigo) === normalizar(d.codigo)) || normalizar(l.descripcion) === normalizar(d.nombre)));
    if (i < 0) throw new Error(`«${d.nombre}» no aparece en la factura electrónica de esta venta`);
    usadas.add(i);
    const linea = lineas[i];
    const cantidad = Math.min(d.cantidad, linea.cantidad);
    const factor = linea.cantidad > 0 ? cantidad / linea.cantidad : 0;
    return [{
      ...linea,
      cantidad,
      subtotal: redondear2(linea.subtotal * factor),
      impuestos: linea.impuestos?.map((t) => ({ ...t, valor: redondear2(t.valor * factor) })),
    }];
  });
}

export async function emitirNotaCreditoPorDevolucion(datos: {
  clienteId: string;
  ventaReferencia: string;
  /** Otras referencias con que pudo emitirse la factura (en la web: el id de
   * la venta o el número de la caja que la hizo). */
  otrasReferencias?: string[];
  items: ItemDevuelto[];
  motivo: string;
  devolucionTotal: boolean;
}): Promise<ResultadoNotaPorDevolucion> {
  try {
    let factura = null;
    for (const ref of [datos.ventaReferencia, ...(datos.otrasReferencias || [])].filter(Boolean)) {
      factura = await obtenerFacturaPorVenta(datos.clienteId, ref);
      if (factura) break;
    }
    if (!factura?.id) return { estado: 'sin_factura' };
    if (factura.tipoDocumento === 'documento_equivalente') return { estado: 'tiquete_pos' };
    if (factura.estado !== 'accepted') return { estado: 'factura_no_aprobada' };
    // Una factura ya anulada con nota crédito no admite otra: la DIAN la
    // recibiría y el negocio quedaría con un crédito doble.
    const acreditadas = (await listarNotasDeFactura(factura.id)).filter((n) => n.tipo === 'credito' && n.estado === 'accepted');
    if (acreditadas.reduce((s, n) => s + Number(n.total || 0), 0) >= factura.total - 1) {
      return { estado: 'ya_anulada', notas: acreditadas.map((n) => n.numeroNota) };
    }

    const resolucion = await asegurarNumeracionNota(datos.clienteId, factura.perfilFiscalId, 'nota_credito');
    if (!resolucion?.id) return { estado: 'sin_numeracion' };

    // Devolución completa: la nota toma la factura entera (sin detalle explícito).
    const items = datos.devolucionTotal ? undefined : lineasDevueltas(factura, datos.items);
    const fiscal = calcularDocumentoFiscal(items ?? itemsDeFactura(factura));
    const nota = await emitirNotaAjuste({
      clienteId: datos.clienteId,
      perfilFiscalId: factura.perfilFiscalId,
      facturaId: factura.id,
      resolucionId: resolucion.id,
      tipo: 'credito',
      // 1 = devolución de parte de los bienes; 2 = anulación (se devolvió todo).
      conceptoCodigo: datos.devolucionTotal ? '2' : '1',
      motivo: datos.motivo || 'Devolución de mercancía',
      items,
      subtotal: fiscal.brutoLineas,
      totalImpuestos: fiscal.totalImpuestos,
      total: fiscal.total,
    });
    return { estado: 'emitida', numeroNota: nota.numeroNota, estadoDian: nota.estado };
  } catch (e) {
    return { estado: 'error', motivo: (e as Error).message };
  }
}
