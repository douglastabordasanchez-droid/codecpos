/**
 * Tirilla de la factura electrónica (58 u 80 mm) para la impresora térmica.
 *
 * Sale cuando el cajero eligió «Sí» a factura electrónica y la DIAN la
 * aceptó: lleva el número oficial (DBM1504), la autorización de numeración,
 * el comprador, el IVA, el CUFE y el QR de consulta. La tirilla normal del
 * cobro sigue saliendo igual; esta es la representación impresa de la
 * factura. Desde aquí también se abre la factura carta (estilo Siigo).
 *
 * Todo sale del XML firmado (representacionGrafica.ts), así que lo impreso
 * es exactamente lo que validó la DIAN. Se imprime igual que la tirilla del
 * cobro: el HTML de la vista previa convertido a imagen (print:html raster).
 */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import QRCode from 'qrcode';
import { FileText, Loader2, Printer, X } from 'lucide-react';
import { toast } from 'sonner';
import type { FacturaElectronicaDian } from '../../lib/dian/types';
import { datosPdfFacturaDianCompletos } from '../../lib/dian/representacionGrafica';
import type { ConfigEmpresa, Venta } from '../../lib/pdfGenerator';
import { getCached } from '../../lib/cachedLocalStorage';
import { getConfiguredTicketWidthMm, getDefaultPrinterNameOrUndefined, getFacturasPrinterNameOrUndefined } from '../../lib/printerConfig';
import { getPrinterForSectionOrUndefined } from '../../lib/sectionPrinterConfig';
import { innerHtmlParaImpresion } from '../../lib/htmlParaImpresion';

interface Props {
  factura: FacturaElectronicaDian;
  onCerrar: () => void;
  /** Abre la factura carta en el visor. */
  onVerCarta: () => void;
}

const CSS = `
  .tfe, .tfe * { color: #000 !important; box-sizing: border-box; }
  .tfe { font-family: Arial, Helvetica, sans-serif; font-size: 12px; line-height: 1.35; }
  .tfe .c { text-align: center; }
  .tfe .r { text-align: right; }
  .tfe .b { font-weight: 700; }
  .tfe .p { font-size: 10px; }
  .tfe .pp { font-size: 9px; }
  .tfe .linea { border-top: 1px dashed #000; margin: 6px 0; height: 0; }
  .tfe .doble { border-top: 2px solid #000; margin: 7px 0; height: 0; }
  .tfe table { width: 100%; border-collapse: collapse; }
  .tfe td { vertical-align: top; padding: 1px 0; }
  .tfe .titulo { font-size: 14px; font-weight: 800; letter-spacing: 0.3px; }
  .tfe .cufe { font-family: 'Courier New', monospace; font-size: 9px; word-break: break-all; }
`;

const pesos = (n: number) => `$${(Number(n) || 0).toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
const cant = (n: number) => (Number.isInteger(n) ? String(n) : n.toLocaleString('es-CO', { maximumFractionDigits: 3 }));

function fechaHora(iso?: string) {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function mesesEntre(desde?: string, hasta?: string): number | null {
  if (!desde || !hasta) return null;
  const a = new Date(`${String(desde).slice(0, 10)}T12:00:00`).getTime();
  const b = new Date(`${String(hasta).slice(0, 10)}T12:00:00`).getTime();
  if (!a || !b || b <= a) return null;
  return Math.max(1, Math.round((b - a) / (30.44 * 86_400_000)));
}

export function TirillaFacturaElectronica({ factura, onCerrar, onVerCarta }: Props) {
  const [datos, setDatos] = useState<{ venta: Venta; config: ConfigEmpresa & Record<string, any> } | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [imprimiendo, setImprimiendo] = useState(false);
  const ticketRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelado = false;
    // Lo que el XML no trae (logo, teléfono, ciudad, mensaje del pie) sale de
    // la configuración de este equipo.
    const local = getCached<Record<string, any>>('codec_pos_config', {});
    datosPdfFacturaDianCompletos(factura, {
      logoUrl: local.logoUrl, telefono: local.telefono, ciudad: local.ciudad, departamento: local.departamento,
    })
      .then(async (d) => {
        if (cancelado) return;
        setDatos({ venta: d.venta, config: { ...d.config, mensajeTirillaBajo: local.mensajeTirillaBajo } });
        if (d.venta.qrUrl) setQr(await QRCode.toDataURL(d.venta.qrUrl, { margin: 0, width: 240, errorCorrectionLevel: 'M' }).catch(() => null));
      })
      .catch((e) => { if (!cancelado) toast.error('No se pudo armar la tirilla', { description: e?.message }); });
    return () => { cancelado = true; };
  }, [factura]);

  const imprimir = async () => {
    const el = (window as any).electron;
    const ticket = ticketRef.current;
    if (!ticket || imprimiendo) return;
    const widthMm = getConfiguredTicketWidthMm();
    const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"/>
      <title>Factura electrónica ${factura.numeroFactura}</title>
      <style>@page{size:${widthMm}mm auto;margin:0;} body{margin:0;padding:8px 6px;background:#fff;} ${CSS}</style>
      </head><body><div class="tfe">${innerHtmlParaImpresion(ticket)}</div></body></html>`;
    setImprimiendo(true);
    try {
      if (el?.print?.printHtml) {
        const printerName = getPrinterForSectionOrUndefined('pos_tickets') || getFacturasPrinterNameOrUndefined() || getDefaultPrinterNameOrUndefined() || '';
        const res = await Promise.race([
          el.print.printHtml({ html, silent: true, printerName, widthMm, raster: true }),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error('La impresora no respondió')), 90000)),
        ]);
        if (!res?.ok) throw new Error(res?.error || 'No se pudo imprimir');
        toast.success('Factura electrónica enviada a la impresora');
      } else {
        // Sin Electron (navegador): el diálogo de impresión del sistema.
        const ventana = window.open('', '_blank', 'width=420,height=700');
        if (!ventana) throw new Error('El navegador bloqueó la ventana de impresión');
        ventana.document.write(html);
        ventana.document.close();
        ventana.onload = () => { ventana.focus(); ventana.print(); };
      }
    } catch (e: any) {
      toast.error('No se pudo imprimir la factura electrónica', { description: e?.message });
    } finally {
      setImprimiendo(false);
    }
  };

  const v = datos?.venta;
  const cfg = datos?.config;
  const ancho = getConfiguredTicketWidthMm() === 58 ? 220 : 302;
  const totalRetenciones = (v?.retenciones || []).reduce((s, r) => s + Number(r.valor || 0), 0);
  const meses = mesesEntre(cfg?.fechaResolucionDIAN, cfg?.vigenciaResolucionHasta);
  const responsable = cfg?.regimenFiscal && cfg.regimenFiscal !== 'simplificado' ? 'Responsable de IVA' : cfg?.regimenFiscal === 'simplificado' ? 'No responsable de IVA' : '';

  return createPortal(
    <div className="fixed inset-0 z-[70] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={onCerrar}>
      <div className="bg-slate-900 border border-slate-700 rounded-3xl p-5 max-h-[94vh] flex flex-col gap-4 w-full max-w-[400px]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-white font-bold">Factura electrónica {factura.numeroFactura}</p>
            <p className="text-emerald-400 text-xs font-semibold">Aceptada por la DIAN</p>
          </div>
          <button onClick={onCerrar} className="text-slate-400" aria-label="Cerrar"><X className="w-5 h-5" /></button>
        </div>

        <div className="overflow-y-auto rounded-xl bg-white mx-auto" style={{ width: ancho }}>
          <style>{CSS}</style>
          {!v || !cfg ? (
            <div className="flex items-center justify-center gap-2 py-16 text-slate-500 text-sm"><Loader2 className="w-4 h-4 animate-spin" /> Armando la tirilla...</div>
          ) : (
            <div ref={ticketRef} className="tfe" style={{ padding: '10px 8px' }}>
              {cfg.logoUrl && (
                <div className="c" style={{ marginBottom: 4 }}>
                  <img src={cfg.logoUrl} alt="" style={{ maxWidth: '60%', maxHeight: 70, objectFit: 'contain' }} onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                </div>
              )}
              <div className="c b" style={{ fontSize: 13 }}>{cfg.razonSocial || cfg.nombreComercial}</div>
              {cfg.nombreComercial && cfg.nombreComercial !== cfg.razonSocial && <div className="c b">{cfg.nombreComercial}</div>}
              <div className="c">NIT {cfg.nit}{cfg.digitoVerificacion ? `-${cfg.digitoVerificacion}` : ''}</div>
              {responsable && <div className="c p">{responsable}{cfg.actividadEconomica ? ` · Actividad ${cfg.actividadEconomica}` : ''}</div>}
              {cfg.direccion && <div className="c p">{cfg.direccion}</div>}
              {(cfg.telefono || cfg.ciudad) && <div className="c p">{[cfg.telefono && `Tel ${cfg.telefono}`, cfg.ciudad].filter(Boolean).join(' · ')}</div>}
              {cfg.email && <div className="c p">{cfg.email}</div>}

              <div className="doble" />
              <div className="c titulo">FACTURA ELECTRÓNICA DE VENTA</div>
              <div className="c b" style={{ fontSize: 15 }}>No. {factura.numeroFactura}</div>
              {cfg.claveResolucionDIAN && (
                <div className="c pp" style={{ marginTop: 3 }}>
                  Autorización DIAN No. {cfg.claveResolucionDIAN}
                  {cfg.fechaResolucionDIAN ? ` del ${String(cfg.fechaResolucionDIAN).slice(0, 10)}` : ''}
                  {cfg.prefijoFactura ? `, prefijo ${cfg.prefijoFactura}` : ''}
                  {cfg.rangoAutorizadoDesde && cfg.rangoAutorizadoHasta ? ` del ${cfg.rangoAutorizadoDesde} al ${cfg.rangoAutorizadoHasta}` : ''}
                  {meses ? `. Vigencia ${meses} meses` : ''}
                </div>
              )}
              <div className="linea" />
              <table className="p">
                <tbody>
                  <tr><td>Generación:</td><td className="r">{fechaHora(v.fechaGeneracion || v.fecha)}</td></tr>
                  <tr><td>Expedición:</td><td className="r">{fechaHora(v.fecha)}</td></tr>
                  {factura.fechaValidacion && <tr><td>Validación DIAN:</td><td className="r">{fechaHora(factura.fechaValidacion)}</td></tr>}
                </tbody>
              </table>

              <div className="linea" />
              <div className="b">Cliente</div>
              <div>{v.cliente || 'Consumidor final'}</div>
              <div className="p">NIT / CC: {v.clienteDocumento || '222222222222'}</div>
              {v.clienteDireccion && <div className="p">{v.clienteDireccion}{v.clienteCiudad ? `, ${v.clienteCiudad}` : ''}</div>}
              {v.clienteTelefono && <div className="p">Tel {v.clienteTelefono}</div>}
              {v.clienteEmail && <div className="p">{v.clienteEmail}</div>}

              <div className="doble" />
              <table>
                <thead>
                  <tr className="b p"><td style={{ width: '14%' }}>Cant</td><td>Descripción</td><td className="r">Total</td></tr>
                </thead>
                <tbody>
                  {v.items.map((it, i) => (
                    <tr key={i}>
                      <td className="p">{cant(Number(it.cantidad) || 0)}</td>
                      <td>
                        <div className="p">{it.nombre}</div>
                        <div className="pp">
                          {pesos(it.fiscal?.precioBase ?? it.precio)} c/u · IVA {it.iva ?? 0}%
                        </div>
                      </td>
                      <td className="r p">{pesos(it.fiscal?.total ?? it.subtotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="pp" style={{ marginTop: 2 }}>Total ítems: {v.items.length}</div>

              <div className="doble" />
              <table>
                <tbody>
                  <tr><td>Subtotal (base)</td><td className="r">{pesos(v.subtotal)}</td></tr>
                  {(v.impuestosDetalle || []).filter((i) => i.valor > 0).map((i) => (
                    <tr key={i.nombre}><td>{i.nombre}</td><td className="r">{pesos(i.valor)}</td></tr>
                  ))}
                  <tr className="b" style={{ fontSize: totalRetenciones > 0 ? 12 : 15 }}><td>TOTAL</td><td className="r">{pesos(v.total)}</td></tr>
                  {totalRetenciones > 0 && (
                    <>
                      {(v.retenciones || []).map((r) => (
                        <tr key={r.nombre} className="p"><td>{r.nombre}</td><td className="r">-{pesos(r.valor)}</td></tr>
                      ))}
                      <tr className="b" style={{ fontSize: 15 }}><td>NETO A PAGAR</td><td className="r">{pesos(v.total - totalRetenciones)}</td></tr>
                    </>
                  )}
                </tbody>
              </table>
              <div className="linea" />
              <table className="p">
                <tbody>
                  <tr><td>Forma de pago:</td><td className="r">{v.fechaVencimiento && v.fechaVencimiento.slice(0, 10) !== String(v.fecha).slice(0, 10) ? 'Crédito' : 'Contado'}</td></tr>
                  <tr><td>Medio de pago:</td><td className="r">{v.metodoPago}</td></tr>
                </tbody>
              </table>

              <div className="doble" />
              {qr && (
                <div className="c" style={{ margin: '4px 0 6px' }}>
                  <img src={qr} alt="QR DIAN" style={{ width: ancho > 250 ? 150 : 120, height: ancho > 250 ? 150 : 120 }} />
                  <div className="pp">Escanee para consultar en la DIAN</div>
                </div>
              )}
              <div className="pp b">CUFE:</div>
              <div className="cufe">{v.cufe}</div>

              <div className="linea" />
              <div className="c pp">
                Representación impresa de la factura electrónica de venta.
                Esta factura se asimila en todos sus efectos a una letra de cambio (Ley 1231 de 2008).
              </div>
              {cfg.mensajeTirillaBajo && <div className="c p b" style={{ marginTop: 5 }}>{cfg.mensajeTirillaBajo}</div>}
              <div className="linea" />
              <div className="c pp">Proveedor tecnológico y fabricante del software: Codec Studio</div>
              <div className="c pp">Software: Codec Pos · pos.codecstudio.online</div>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={imprimir}
            disabled={!v || imprimiendo}
            className="h-12 rounded-2xl bg-gradient-to-r from-blue-500 to-blue-600 text-white text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {imprimiendo ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />} Imprimir tirilla
          </button>
          <button
            onClick={onVerCarta}
            className="h-12 rounded-2xl bg-slate-800 border border-slate-700 text-slate-200 text-sm font-bold flex items-center justify-center gap-2"
          >
            <FileText className="w-4 h-4" /> Factura carta
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
