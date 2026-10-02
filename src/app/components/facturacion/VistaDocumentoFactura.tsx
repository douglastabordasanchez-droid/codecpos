/**
 * «Ver documento» — representación gráfica de una factura electrónica (o
 * documento equivalente POS) ya emitida.
 *
 * Todo sale del XML guardado en la factura, leído con el mismo motor de
 * recepción (../../lib/dian/recepcion): la tabla facturas_electronicas no
 * guarda las líneas, y el XML es además lo que realmente se firmó y se le
 * envió a la DIAN — así la vista nunca puede mostrar algo distinto a lo
 * transmitido. Si la factura todavía no tiene XML, se muestran solo los
 * totales de la fila.
 *
 * La «hoja» es siempre blanca, en los dos temas: es un documento para
 * imprimir. Por eso usa la familia gray-* y estilos en línea, que el modo
 * claro de la PWA no repinta (sí repinta slate-* y text-white).
 */
import { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import { X, Printer, Download, ShieldCheck, Clock, XCircle } from 'lucide-react';
import type { FacturaElectronicaDian } from '../../lib/dian/types';
import { construirUrlQR } from '../../lib/dian/softwareSecurityCode';
import { parseDianXml } from '../../lib/dian/recepcion/parser';
import { IMPUESTOS_DIAN } from '../../lib/dian/recepcion/types';
import { descargarTexto, fechaCorta, money } from './comunes';

interface Props {
  factura: FacturaElectronicaDian;
  onCerrar: () => void;
}

const ID_HOJA = 'factura-electronica-imprimible';

// Al imprimir, solo la hoja: el resto de la app (sidebar, tabla, el propio
// marco del modal) queda fuera del papel.
const CSS_IMPRESION = `
@media print {
  body * { visibility: hidden !important; }
  #${ID_HOJA}, #${ID_HOJA} * { visibility: visible !important; }
  #${ID_HOJA} { position: fixed !important; inset: 0 !important; width: 100% !important; margin: 0 !important; box-shadow: none !important; }
}`;

export function VistaDocumentoFactura({ factura, onCerrar }: Props) {
  const [qr, setQr] = useState<string | null>(null);

  const doc = useMemo(() => (factura.xml ? parseDianXml(factura.xml).documento : null), [factura.xml]);

  const ambiente = factura.emisor.ambiente || 'habilitacion';
  const esEquivalente = factura.tipoDocumento === 'documento_equivalente';
  const nombreCodigo = esEquivalente ? 'CUDE' : 'CUFE';
  const urlQr = doc?.autorizacion.qr || (factura.cufe ? construirUrlQR(factura.cufe, ambiente) : '');
  const firmado = !!factura.xml && /<ds:Signature[\s>]/.test(factura.xml);

  useEffect(() => {
    if (!urlQr) { setQr(null); return; }
    let cancelado = false;
    QRCode.toDataURL(urlQr, { margin: 1, width: 220 })
      .then((dataUrl) => { if (!cancelado) setQr(dataUrl); })
      .catch(() => { if (!cancelado) setQr(null); });
    return () => { cancelado = true; };
  }, [urlQr]);

  const sello = (() => {
    if (factura.estado === 'accepted') {
      return {
        Icon: ShieldCheck, color: '#047857', fondo: '#ecfdf5', borde: '#10b981',
        titulo: 'APROBADO POR LA DIAN',
        detalle: factura.fechaValidacion ? `Validado el ${new Date(factura.fechaValidacion).toLocaleString('es-CO')}` : 'Documento validado',
      };
    }
    if (factura.estado === 'rejected' || factura.estado === 'error') {
      return {
        Icon: XCircle, color: '#b91c1c', fondo: '#fef2f2', borde: '#ef4444',
        titulo: factura.estado === 'rejected' ? 'RECHAZADO POR LA DIAN' : 'ERROR AL EMITIR',
        detalle: factura.motivoRechazo || 'Sin detalle del motivo',
      };
    }
    if (factura.estado === 'cancelled') {
      return { Icon: XCircle, color: '#475569', fondo: '#f1f5f9', borde: '#94a3b8', titulo: 'ANULADA', detalle: '' };
    }
    return {
      Icon: Clock, color: '#b45309', fondo: '#fffbeb', borde: '#f59e0b',
      titulo: 'PENDIENTE DE VALIDACIÓN DIAN',
      detalle: factura.estado === 'contingency'
        ? 'Emitida en contingencia: se transmitirá a la DIAN automáticamente al restablecerse el servicio.'
        : 'Todavía no ha sido validada por la DIAN.',
    };
  })();

  const lineas = doc?.lineas ?? [];
  const impuestos = useMemo(() => {
    if (!doc) return [];
    const deDocumento = doc.impuestos.filter((i) => i.alcance === 'documento' && !i.esRetencion);
    const fuente = deDocumento.length > 0 ? deDocumento : doc.impuestos.filter((i) => i.alcance === 'linea' && !i.esRetencion);
    const agrupado = new Map<string, { nombre: string; tarifa: number; base: number; valor: number }>();
    for (const i of fuente) {
      const clave = `${i.codigo}|${i.tarifa}`;
      const actual = agrupado.get(clave) || { nombre: IMPUESTOS_DIAN[i.codigo] || i.nombre || i.codigo, tarifa: i.tarifa, base: 0, valor: 0 };
      actual.base += i.baseGravable;
      actual.valor += i.valor;
      agrupado.set(clave, actual);
    }
    return [...agrupado.values()];
  }, [doc]);

  const gris = { color: '#6b7280' };
  const negro = { color: '#111827' };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-start justify-center p-4 overflow-y-auto" onClick={onCerrar}>
      <style>{CSS_IMPRESION}</style>
      <div className="w-full max-w-3xl my-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-2 mb-3">
          {/* Color en línea: va sobre el overlay, que es oscuro en los dos temas. */}
          <p className="font-bold text-sm truncate" style={{ color: '#ffffff' }}>{factura.numeroFactura} · Vista previa del documento</p>
          <div className="flex items-center gap-2 shrink-0">
            {factura.xml && (
              <button
                onClick={() => descargarTexto(factura.xml!, `${factura.numeroFactura}.xml`, 'application/xml')}
                className="h-9 px-3 rounded-lg bg-slate-800 text-slate-300 text-xs font-semibold flex items-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" /> XML
              </button>
            )}
            <button onClick={() => window.print()} className="h-9 px-3 rounded-lg bg-amber-500 text-slate-950 text-xs font-bold flex items-center gap-1.5">
              <Printer className="w-3.5 h-3.5" /> Imprimir / PDF
            </button>
            <button onClick={onCerrar} className="h-9 w-9 rounded-lg bg-slate-800 text-slate-300 flex items-center justify-center" aria-label="Cerrar">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div id={ID_HOJA} className="rounded-xl shadow-2xl p-6 sm:p-8 text-[13px] leading-snug" style={{ background: '#ffffff', ...negro }}>
          {ambiente !== 'produccion' && (
            <div className="mb-4 rounded-md px-3 py-2 text-center text-xs font-bold" style={{ background: '#fef3c7', color: '#92400e', border: '1px solid #f59e0b' }}>
              AMBIENTE DE HABILITACIÓN (PRUEBAS) — DOCUMENTO SIN VALIDEZ FISCAL
            </div>
          )}

          {/* Encabezado */}
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 pb-4" style={{ borderBottom: '2px solid #111827' }}>
            <div className="min-w-0">
              <p className="text-lg font-black" style={negro}>{factura.emisor.nombreORazonSocial || 'Emisor sin nombre'}</p>
              {factura.emisor.nombreComercial && factura.emisor.nombreComercial !== factura.emisor.nombreORazonSocial && (
                <p style={gris}>{factura.emisor.nombreComercial}</p>
              )}
              <p style={negro}>NIT {factura.emisor.nit || '—'}{factura.emisor.digitoVerificacion ? `-${factura.emisor.digitoVerificacion}` : ''}</p>
              {factura.emisor.direccion && <p style={gris}>{factura.emisor.direccion}</p>}
              {!!factura.emisor.responsabilidadesFiscales?.length && (
                <p className="text-[11px]" style={gris}>Responsabilidades: {factura.emisor.responsabilidadesFiscales.join(', ')}</p>
              )}
            </div>
            <div className="shrink-0 rounded-lg px-4 py-3 sm:text-right" style={{ border: '1px solid #d1d5db' }}>
              <p className="text-[11px] font-bold uppercase tracking-wide" style={gris}>
                {esEquivalente ? 'Documento equivalente electrónico POS' : 'Factura electrónica de venta'}
              </p>
              <p className="text-xl font-black font-mono" style={negro}>{factura.numeroFactura}</p>
              <p style={gris}>Emitida: {new Date(factura.fechaEmision).toLocaleString('es-CO')}</p>
              {doc?.fechaVencimiento && <p style={gris}>Vence: {fechaCorta(doc.fechaVencimiento)}</p>}
            </div>
          </div>

          {/* Sello DIAN */}
          <div className="mt-4 rounded-lg px-4 py-3 flex items-start gap-3" style={{ background: sello.fondo, border: `1.5px solid ${sello.borde}` }}>
            <sello.Icon className="w-6 h-6 shrink-0" style={{ color: sello.color }} />
            <div className="min-w-0">
              <p className="font-black tracking-wide" style={{ color: sello.color }}>{sello.titulo}</p>
              {sello.detalle && <p className="text-xs break-words" style={{ color: sello.color }}>{sello.detalle}</p>}
            </div>
          </div>

          {/* Adquirente */}
          <div className="mt-4 rounded-lg px-4 py-3" style={{ background: '#f9fafb', border: '1px solid #e5e7eb' }}>
            <p className="text-[11px] font-bold uppercase tracking-wide mb-1" style={gris}>Cliente</p>
            <p className="font-bold" style={negro}>{factura.adquirente.nombreORazonSocial}</p>
            <p style={negro}>NIT / CC {factura.adquirente.numeroDocumento}</p>
            {(factura.adquirente.email || factura.adquirente.telefono) && (
              <p style={gris}>{[factura.adquirente.email, factura.adquirente.telefono].filter(Boolean).join(' · ')}</p>
            )}
          </div>

          {/* Ítems */}
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-xs" style={{ borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#111827' }}>
                  {['#', 'Descripción', 'Cant.', 'Vr. unitario', 'Impuesto', 'Subtotal'].map((h, i) => (
                    <th key={h} className={`px-2 py-2 font-bold ${i >= 2 ? 'text-right' : 'text-left'}`} style={{ color: '#ffffff' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lineas.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-2 py-4 text-center" style={gris}>
                      {factura.xml ? 'El XML no trae líneas de detalle.' : 'Esta factura todavía no tiene XML generado: no hay detalle de ítems.'}
                    </td>
                  </tr>
                ) : lineas.map((l) => (
                  <tr key={l.numero} style={{ borderBottom: '1px solid #e5e7eb' }}>
                    <td className="px-2 py-1.5" style={gris}>{l.numero}</td>
                    <td className="px-2 py-1.5" style={negro}>
                      {l.descripcion}
                      {(l.codigoVendedor || l.codigoEstandar) && <span className="block text-[10px]" style={gris}>Cód. {l.codigoVendedor || l.codigoEstandar}</span>}
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono" style={negro}>{l.cantidad}</td>
                    <td className="px-2 py-1.5 text-right font-mono" style={negro}>{money(l.precioUnitario)}</td>
                    <td className="px-2 py-1.5 text-right font-mono" style={negro}>{money(l.totalImpuestos)}</td>
                    <td className="px-2 py-1.5 text-right font-mono" style={negro}>{money(l.valorBruto)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Impuestos y totales */}
          <div className="mt-4 flex flex-col sm:flex-row sm:justify-between gap-4">
            <div className="flex-1">
              {impuestos.length > 0 && (
                <>
                  <p className="text-[11px] font-bold uppercase tracking-wide mb-1" style={gris}>Desglose de impuestos</p>
                  {impuestos.map((i) => (
                    <p key={`${i.nombre}-${i.tarifa}`} className="font-mono text-xs" style={negro}>
                      {i.nombre} {i.tarifa}% · base {money(i.base)} · {money(i.valor)}
                    </p>
                  ))}
                </>
              )}
            </div>
            <div className="sm:w-64 text-sm">
              <div className="flex justify-between py-0.5"><span style={gris}>Subtotal</span><span className="font-mono" style={negro}>{money(factura.subtotal)}</span></div>
              <div className="flex justify-between py-0.5"><span style={gris}>Impuestos</span><span className="font-mono" style={negro}>{money(factura.totalImpuestos)}</span></div>
              <div className="flex justify-between py-1.5 mt-1 text-base font-black" style={{ borderTop: '2px solid #111827' }}>
                <span style={negro}>TOTAL</span><span className="font-mono" style={negro}>{money(factura.total)}</span>
              </div>
            </div>
          </div>

          {/* QR, CUFE, resolución y firma */}
          <div className="mt-5 pt-4 flex flex-col sm:flex-row gap-4" style={{ borderTop: '1px solid #d1d5db' }}>
            {qr && <img src={qr} alt={`Código QR de consulta DIAN (${nombreCodigo})`} className="w-32 h-32 shrink-0" />}
            <div className="min-w-0 text-[11px] space-y-1.5">
              <div>
                <p className="font-bold" style={negro}>{nombreCodigo}</p>
                <p className="font-mono break-all" style={gris}>{factura.cufe || 'Sin calcular'}</p>
              </div>
              {doc?.autorizacion.resolucion && (
                <p style={gris}>
                  Autorización de numeración N.º {doc.autorizacion.resolucion}
                  {doc.autorizacion.vigenciaDesde && ` del ${fechaCorta(doc.autorizacion.vigenciaDesde)}`}
                  {doc.autorizacion.prefijo && `, prefijo ${doc.autorizacion.prefijo}`}
                  {doc.autorizacion.rangoDesde && ` del ${doc.autorizacion.rangoDesde} al ${doc.autorizacion.rangoHasta}`}
                  {doc.autorizacion.vigenciaHasta && `, vigente hasta ${fechaCorta(doc.autorizacion.vigenciaHasta)}`}.
                </p>
              )}
              <p style={{ color: firmado ? '#047857' : '#b45309' }} className="font-semibold">
                {firmado
                  ? 'Firmado digitalmente (XAdES-EPES) con el certificado del emisor.'
                  : 'Este documento todavía no tiene firma digital.'}
              </p>
              <p style={gris}>Representación gráfica generada por CODEC POS. Verifica el documento escaneando el código QR.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
