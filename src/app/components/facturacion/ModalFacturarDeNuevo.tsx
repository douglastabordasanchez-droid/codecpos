/**
 * Ventana «Facturar de nuevo» de una factura anulada con nota crédito: el
 * cajero corrige los datos del cliente y se emite una factura nueva con los
 * mismos productos, ligada a la misma venta (ver lib/dian/refacturar.ts).
 */
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { X, Loader2, AlertTriangle, FileCheck2 } from 'lucide-react';
import { ClienteFacturaCobro } from '../factura/ClienteFacturaCobro';
import { clienteDeFactura, facturarDeNuevo, itemsParaFacturarDeNuevo, referenciaVenta, ventaDevuelta } from '../../lib/dian/refacturar';
import { calcularDocumentoFiscal } from '../../lib/dian/documentoFiscal';
import { leerConfigIva, type ConfigIva } from '../../lib/dian/configIva';
import type { DatosClienteCobro } from '../../lib/dian/clienteCobro';
import type { FacturaElectronicaDian } from '../../lib/dian/types';
import { money } from './comunes';

interface Props {
  factura: FacturaElectronicaDian;
  notasQueLaAnulan: string[];
  onCerrar: () => void;
  onEmitida: () => void;
}

export function ModalFacturarDeNuevo({ factura, notasQueLaAnulan, onCerrar, onEmitida }: Props) {
  const [cliente, setCliente] = useState<DatosClienteCobro>(() => clienteDeFactura(factura));
  const [devuelta, setDevuelta] = useState<boolean | null>(null);
  const [emitiendo, setEmitiendo] = useState(false);
  // IVA de hoy (Configurar mi negocio): una factura que salió sin IVA se rehace con él.
  const [configIva, setConfigIva] = useState<ConfigIva | null | undefined>(undefined);
  const items = useMemo(() => itemsParaFacturarDeNuevo(factura, configIva), [factura, configIva]);
  const totales = useMemo(() => calcularDocumentoFiscal(items), [items]);

  useEffect(() => {
    ventaDevuelta(factura).then(setDevuelta).catch(() => setDevuelta(false));
    leerConfigIva(factura.clienteId).then(setConfigIva).catch(() => setConfigIva(null));
  }, [factura]);

  async function emitir() {
    if (cliente.documento.trim() && !cliente.nombre.trim()) { toast.error('Escribe el nombre o la razón social del cliente'); return; }
    setEmitiendo(true);
    try {
      const r = await facturarDeNuevo(factura, cliente, configIva);
      if (r.estado === 'accepted') {
        toast.success(`Factura ${r.numero} aprobada por la DIAN`, { description: `Reemplaza a la ${factura.numeroFactura} en la venta ${referenciaVenta(factura)}.` });
        onEmitida();
      } else if (r.estado === 'rejected' || r.estado === 'error' || r.estado === 'no_emitido') {
        toast.error('La factura nueva no salió', { description: r.motivo || 'Revisa los datos e inténtalo de nuevo.', duration: 15000 });
      } else {
        toast.warning(`Factura ${r.numero || ''} pendiente`, { description: r.motivo || 'Se reintenta sola.', duration: 10000 });
        onEmitida();
      }
    } catch (e: any) {
      toast.error(e?.message || 'No se pudo facturar de nuevo', { duration: 12000 });
    } finally {
      setEmitiendo(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={onCerrar}>
      <div className="w-full max-w-lg max-h-[92vh] overflow-y-auto bg-slate-950 border border-slate-800 rounded-2xl p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-bold text-white">Facturar de nuevo la venta {referenciaVenta(factura)}</p>
            <p className="text-xs text-slate-400">
              La {factura.numeroFactura} quedó anulada con {notasQueLaAnulan.join(', ')}. Se emite una factura nueva con los mismos productos y los datos que corrijas aquí.
            </p>
          </div>
          <button onClick={onCerrar} className="text-slate-400" aria-label="Cerrar"><X className="w-5 h-5" /></button>
        </div>

        {devuelta && (
          <div className="flex gap-2 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2">
            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <p className="text-xs text-red-400">
              Esta venta se devolvió en Ventas › Devolver o anular (por ejemplo, una venta duplicada). No se vuelve a facturar: así el contador no ve una venta de más.
            </p>
          </div>
        )}

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 space-y-1.5">
          <p className="text-xs text-slate-500 uppercase tracking-wide font-bold">Productos ({items.length})</p>
          <div className="max-h-40 overflow-y-auto space-y-1">
            {items.map((it, i) => (
              <div key={i} className="flex justify-between gap-3 text-xs">
                <span className="text-slate-300">{it.cantidad} × {it.descripcion}</span>
                <span className="font-mono text-white whitespace-nowrap">{money(it.subtotal)}</span>
              </div>
            ))}
          </div>
          <div className="border-t border-slate-800 pt-1.5 space-y-0.5 text-xs">
            <div className="flex justify-between"><span className="text-slate-400">Total bruto</span><span className="font-mono text-slate-300">{money(totales.brutoLineas)}</span></div>
            <div className="flex justify-between"><span className="text-slate-400">IVA</span><span className="font-mono text-slate-300">{money(totales.totalImpuestos)}</span></div>
          </div>
          <div className="flex justify-between text-sm font-bold">
            <span className="text-white">Total</span><span className="font-mono text-white">{money(totales.total)}</span>
          </div>
          {configIva === null && (
            <p className="text-[11px] text-amber-400">No se pudo leer el IVA configurado: la factura nueva sale con el IVA de la anulada.</p>
          )}
        </div>

        <div className="space-y-1.5">
          <p className="text-xs text-slate-500 uppercase tracking-wide font-bold">Cliente de la factura nueva</p>
          <ClienteFacturaCobro clienteId={factura.clienteId} datos={cliente} onChange={setCliente} />
        </div>

        <div className="flex gap-2 pt-1">
          <button onClick={onCerrar} className="flex-1 h-11 rounded-lg border border-slate-800 text-slate-300 text-sm font-semibold">Cancelar</button>
          <button
            onClick={emitir}
            disabled={emitiendo || devuelta !== false || configIva === undefined}
            className="flex-1 h-11 rounded-lg bg-amber-500 text-slate-950 text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {emitiendo || devuelta === null ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileCheck2 className="w-4 h-4" />}
            {emitiendo ? 'Emitiendo...' : 'Emitir factura nueva'}
          </button>
        </div>
      </div>
    </div>
  );
}
