import { forwardRef, useEffect, useState } from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

export interface ProductoTop {
  nombre: string;
  cantidad: number;
  total: number;
}

export interface CierreDataModal {
  cajero: string;
  fechaApertura: string;
  fechaCierre: string;
  baseInicial: number;
  desglose: {
    efectivo: number;
    tarjeta: number;
    nequi: number;
    daviplata: number;
    transferencia: number;
    rappi: number;
  };
  totalSistema: number;
  gastosEfectivo: number;
  gastosDetalle?: Array<{
    descripcion: string;
    concepto?: string;
    monto: number;
    medioPago?: string;
  }>;
  gastosTransferencia?: number;
  gastosTarjetaBanco?: number;
  devoluciones: number;
  abonosCarteraEfectivo?: number;
  abonosCarteraTransferencia?: number;
  abonosCarteraTarjetaBanco?: number;
  abonosCarteraDetalle?: Array<{
    descripcion: string;
    concepto?: string;
    monto: number;
    medioPago?: string;
  }>;
  efectivoEsperado: number;
  transferenciaEsperada?: number;
  tarjetaBancoEsperado?: number;
  totalEsperadoAnalitico?: number;
  totalFisicoContado: number;
  diferencia: number;
  estado: 'cuadrado' | 'faltante' | 'sobrante';
  observaciones: string;
  cantidadTransacciones: number;
  ticketPromedio: number;
  productosTop: ProductoTop[];
  billetes: {
    b100000: number;
    b50000: number;
    b20000: number;
    b10000: number;
    b5000: number;
    b2000: number;
    b1000: number;
    m500: number;
    m200: number;
    m100: number;
    m50: number;
  };
}

interface Props {
  data: CierreDataModal;
}

const fmt = (v: number) =>
  `$${Number(v || 0).toLocaleString('es-CO', { minimumFractionDigits: 0 })}`;

const LINE = '─'.repeat(38);

const denominaciones = [
  { key: 'b100000', label: '$100.000', valor: 100000 },
  { key: 'b50000', label: '$50.000', valor: 50000 },
  { key: 'b20000', label: '$20.000', valor: 20000 },
  { key: 'b10000', label: '$10.000', valor: 10000 },
  { key: 'b5000', label: '$5.000', valor: 5000 },
  { key: 'b2000', label: '$2.000', valor: 2000 },
  { key: 'b1000', label: '$1.000', valor: 1000 },
  { key: 'm500', label: '$500', valor: 500 },
  { key: 'm200', label: '$200', valor: 200 },
  { key: 'm100', label: '$100', valor: 100 },
  { key: 'm50', label: '$50', valor: 50 },
];

// Tirilla oficial de cierre de caja — usada tanto en el momento del cierre
// (ModalCierreCaja) como en el historial de Reportes (ModalDetalleCierre),
// para que el administrador vea/descargue/imprima siempre el mismo documento.
const TirillaCierreCaja = forwardRef<HTMLDivElement, Props>(({ data }, ref) => {
  const [config, setConfig] = useState<any>({});

  useEffect(() => {
    try {
      const raw = localStorage.getItem('codec_pos_config');
      if (raw) setConfig(JSON.parse(raw));
    } catch { /* ignore */ }
  }, []);

  const totalElectronico =
    data.desglose.tarjeta +
    data.desglose.nequi +
    data.desglose.daviplata +
    data.desglose.transferencia +
    data.desglose.rappi;

  const horaApertura = (() => {
    try { return format(new Date(data.fechaApertura), 'HH:mm', { locale: es }); }
    catch { return '--:--'; }
  })();

  const horaCierre = (() => {
    try { return format(new Date(data.fechaCierre), 'HH:mm', { locale: es }); }
    catch { return format(new Date(), 'HH:mm', { locale: es }); }
  })();

  const fechaDisplay = (() => {
    try { return format(new Date(data.fechaCierre || new Date()), "dd 'de' MMMM yyyy", { locale: es }); }
    catch { return format(new Date(), "dd 'de' MMMM yyyy", { locale: es }); }
  })();

  return (
    <div
      ref={ref}
      className="bg-white text-black mx-auto rounded-xl shadow-2xl overflow-hidden"
      style={{ maxWidth: 340, fontFamily: "'Courier New', monospace", fontSize: 12 }}
    >
      {/* Encabezado empresa */}
      <div className="px-6 pt-6 pb-3 text-center border-b-2 border-black">
        {config.logoUrl && (
          <img
            src={config.logoUrl}
            alt="Logo"
            style={{ maxHeight: 64, maxWidth: 180, margin: '0 auto 8px', objectFit: 'contain', display: 'block' }}
          />
        )}
        <div style={{ fontSize: 16, fontWeight: 'bold', marginBottom: 2 }}>
          {config.nombreComercial || config.razonSocial || 'MI NEGOCIO'}
        </div>
        {config.razonSocial && config.razonSocial !== config.nombreComercial && (
          <div style={{ fontSize: 11, marginBottom: 2 }}>{config.razonSocial}</div>
        )}
        {config.nit && (
          <div style={{ fontSize: 11 }}>
            NIT: {config.nit}{config.digitoVerificacion ? `-${config.digitoVerificacion}` : ''}
          </div>
        )}
        {config.direccion && <div style={{ fontSize: 10, marginTop: 2 }}>{config.direccion}{config.ciudad ? ` · ${config.ciudad}` : ''}</div>}
        {config.telefono && <div style={{ fontSize: 10 }}>Tel: {config.telefono}</div>}
        {config.email && <div style={{ fontSize: 10 }}>{config.email}</div>}
        {config.eslogan && <div style={{ fontSize: 10, fontStyle: 'italic', marginTop: 2 }}>{config.eslogan}</div>}
      </div>

      <div className="px-6 py-3 text-center border-b border-dashed border-gray-400">
        <div style={{ fontSize: 15, fontWeight: 'bold', letterSpacing: 1 }}>REPORTE DE CIERRE DE CAJA</div>
      </div>

      {/* Info del turno */}
      <div className="px-6 py-3" style={{ fontSize: 12 }}>
        <div style={{ fontWeight: 'bold', marginBottom: 4 }}>INFORMACIÓN DEL TURNO</div>
        <div>{LINE}</div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <tbody>
            <tr><td>Fecha:</td><td style={{ textAlign: 'right' }}>{fechaDisplay}</td></tr>
            <tr><td>Cajero:</td><td style={{ textAlign: 'right' }}>{data.cajero}</td></tr>
            <tr><td>Hora apertura:</td><td style={{ textAlign: 'right' }}>{horaApertura}</td></tr>
            <tr><td>Hora cierre:</td><td style={{ textAlign: 'right' }}>{horaCierre}</td></tr>
            <tr><td>Transacciones:</td><td style={{ textAlign: 'right' }}>{data.cantidadTransacciones}</td></tr>
            {data.ticketPromedio > 0 && (
              <tr><td>Ticket promedio:</td><td style={{ textAlign: 'right' }}>{fmt(data.ticketPromedio)}</td></tr>
            )}
          </tbody>
        </table>
        <div>{LINE}</div>
      </div>

      {/* Ventas por método */}
      <div className="px-6 pb-3" style={{ fontSize: 12 }}>
        <div style={{ fontWeight: 'bold', marginBottom: 4 }}>DESGLOSE DE VENTAS</div>
        <div>{LINE}</div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <tbody>
            {data.desglose.efectivo > 0 && (
              <tr><td>Efectivo:</td><td style={{ textAlign: 'right' }}>{fmt(data.desglose.efectivo)}</td></tr>
            )}
            {data.desglose.tarjeta > 0 && (
              <tr><td>Tarjeta:</td><td style={{ textAlign: 'right' }}>{fmt(data.desglose.tarjeta)}</td></tr>
            )}
            {data.desglose.nequi > 0 && (
              <tr><td>Nequi:</td><td style={{ textAlign: 'right' }}>{fmt(data.desglose.nequi)}</td></tr>
            )}
            {data.desglose.daviplata > 0 && (
              <tr><td>Daviplata:</td><td style={{ textAlign: 'right' }}>{fmt(data.desglose.daviplata)}</td></tr>
            )}
            {data.desglose.transferencia > 0 && (
              <tr><td>Transferencia:</td><td style={{ textAlign: 'right' }}>{fmt(data.desglose.transferencia)}</td></tr>
            )}
            {data.desglose.rappi > 0 && (
              <tr><td>Rappi:</td><td style={{ textAlign: 'right' }}>{fmt(data.desglose.rappi)}</td></tr>
            )}
            <tr><td colSpan={2}><div style={{ borderTop: '1px solid #000', marginTop: 2, marginBottom: 2 }} /></td></tr>
            <tr style={{ fontWeight: 'bold', fontSize: 13 }}>
              <td>TOTAL VENTAS:</td>
              <td style={{ textAlign: 'right' }}>{fmt(data.totalSistema)}</td>
            </tr>
            {totalElectronico > 0 && (
              <tr style={{ fontSize: 11, color: '#555' }}>
                <td>  (Digital/Tarjeta):</td>
                <td style={{ textAlign: 'right' }}>{fmt(totalElectronico)}</td>
              </tr>
            )}
          </tbody>
        </table>
        <div>{LINE}</div>
      </div>

      {/* Análisis de efectivo */}
      <div className="px-6 pb-3" style={{ fontSize: 12 }}>
        <div style={{ fontWeight: 'bold', marginBottom: 4 }}>ANÁLISIS DE EFECTIVO</div>
        <div>{LINE}</div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <tbody>
            <tr><td>Base inicial:</td><td style={{ textAlign: 'right' }}>{fmt(data.baseInicial)}</td></tr>
            <tr><td>+ Ventas efectivo:</td><td style={{ textAlign: 'right' }}>+{fmt(data.desglose.efectivo)}</td></tr>
            {data.devoluciones > 0 && (
              <tr><td>- Devoluciones:</td><td style={{ textAlign: 'right' }}>-{fmt(data.devoluciones)}</td></tr>
            )}
            {data.gastosEfectivo > 0 && (
              <tr><td>- Gastos:</td><td style={{ textAlign: 'right' }}>-{fmt(data.gastosEfectivo)}</td></tr>
            )}
            {!!data.abonosCarteraEfectivo && data.abonosCarteraEfectivo > 0 && (
              <tr><td>+ Abonos Cartera:</td><td style={{ textAlign: 'right' }}>+{fmt(data.abonosCarteraEfectivo)}</td></tr>
            )}
            <tr><td colSpan={2}><div style={{ borderTop: '1px solid #000', marginTop: 2, marginBottom: 2 }} /></td></tr>
            <tr style={{ fontWeight: 'bold' }}>
              <td>Efect. esperado:</td>
              <td style={{ textAlign: 'right' }}>{fmt(data.efectivoEsperado)}</td>
            </tr>
            <tr style={{ fontWeight: 'bold', fontSize: 13 }}>
              <td>Total contado:</td>
              <td style={{ textAlign: 'right' }}>{fmt(data.totalFisicoContado)}</td>
            </tr>
          </tbody>
        </table>
        <div>{LINE}</div>

        {(data.gastosDetalle || []).length > 0 && (
          <>
            <div style={{ fontWeight: 'bold', marginTop: 8, marginBottom: 4 }}>DETALLE DE EGRESOS</div>
            <div>{LINE}</div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <tbody>
                {(data.gastosDetalle || []).slice(0, 12).map((gasto, idx) => (
                  <tr key={`${idx}-${gasto.descripcion}`}>
                    <td style={{ maxWidth: 190, overflow: 'hidden' }}>
                      {idx + 1}. {`${(gasto.concepto || '').trim()}${(gasto.concepto || '').trim() && (gasto.descripcion || '').trim() && (gasto.concepto || '').trim().toLowerCase() !== (gasto.descripcion || '').trim().toLowerCase() ? ' - ' : ''}${(gasto.descripcion || '').trim() || (gasto.concepto || '').trim()}`.slice(0, 50)}
                    </td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>{fmt(gasto.monto)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div>{LINE}</div>
          </>
        )}

        {(data.abonosCarteraDetalle || []).length > 0 && (
          <>
            <div style={{ fontWeight: 'bold', marginTop: 8, marginBottom: 4 }}>DETALLE DE ABONOS DE CARTERA</div>
            <div>{LINE}</div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <tbody>
                {(data.abonosCarteraDetalle || []).slice(0, 12).map((abono, idx) => (
                  <tr key={`${idx}-${abono.descripcion}`}>
                    <td style={{ maxWidth: 190, overflow: 'hidden' }}>
                      {idx + 1}. {(abono.descripcion || '').slice(0, 50)}
                    </td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>{fmt(abono.monto)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div>{LINE}</div>
          </>
        )}

        {(data.transferenciaEsperada || data.tarjetaBancoEsperado || data.totalEsperadoAnalitico) && (
          <>
            <div style={{ fontWeight: 'bold', marginTop: 8, marginBottom: 4 }}>ANÁLISIS POR CANAL</div>
            <div>{LINE}</div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <tbody>
                {typeof data.transferenciaEsperada === 'number' && (
                  <tr>
                    <td>Transferencias netas:</td>
                    <td style={{ textAlign: 'right' }}>{fmt(data.transferenciaEsperada)}</td>
                  </tr>
                )}
                {typeof data.gastosTransferencia === 'number' && data.gastosTransferencia > 0 && (
                  <tr>
                    <td>Egresos transferencia:</td>
                    <td style={{ textAlign: 'right' }}>-{fmt(data.gastosTransferencia)}</td>
                  </tr>
                )}
                {!!data.abonosCarteraTransferencia && data.abonosCarteraTransferencia > 0 && (
                  <tr>
                    <td>Abonos Cartera (transf.):</td>
                    <td style={{ textAlign: 'right' }}>+{fmt(data.abonosCarteraTransferencia)}</td>
                  </tr>
                )}
                {typeof data.tarjetaBancoEsperado === 'number' && (
                  <tr>
                    <td>Tarjeta/Banco neto:</td>
                    <td style={{ textAlign: 'right' }}>{fmt(data.tarjetaBancoEsperado)}</td>
                  </tr>
                )}
                {typeof data.gastosTarjetaBanco === 'number' && data.gastosTarjetaBanco > 0 && (
                  <tr>
                    <td>Egresos tarj/banco:</td>
                    <td style={{ textAlign: 'right' }}>-{fmt(data.gastosTarjetaBanco)}</td>
                  </tr>
                )}
                {!!data.abonosCarteraTarjetaBanco && data.abonosCarteraTarjetaBanco > 0 && (
                  <tr>
                    <td>Abonos Cartera (tarj/banco):</td>
                    <td style={{ textAlign: 'right' }}>+{fmt(data.abonosCarteraTarjetaBanco)}</td>
                  </tr>
                )}
                {typeof data.totalEsperadoAnalitico === 'number' && (
                  <tr style={{ fontWeight: 'bold' }}>
                    <td>Total esperado analítico:</td>
                    <td style={{ textAlign: 'right' }}>{fmt(data.totalEsperadoAnalitico)}</td>
                  </tr>
                )}
              </tbody>
            </table>
            <div>{LINE}</div>
          </>
        )}

        {/* Estado */}
        <div style={{ textAlign: 'center', padding: '6px 0', fontWeight: 'bold', fontSize: 13 }}>
          {data.estado === 'cuadrado' && '✓ CAJA CUADRADA'}
          {data.estado === 'faltante' && `⚠ FALTANTE: ${fmt(Math.abs(data.diferencia))}`}
          {data.estado === 'sobrante' && `+ SOBRANTE: ${fmt(Math.abs(data.diferencia))}`}
        </div>
        <div>{LINE}</div>
      </div>

      {/* Desglose de denominaciones */}
      {Object.values(data.billetes).some(v => v > 0) && (
        <div className="px-6 pb-3" style={{ fontSize: 12 }}>
          <div style={{ fontWeight: 'bold', marginBottom: 4 }}>CONTEO DE BILLETES Y MONEDAS</div>
          <div>{LINE}</div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <tbody>
              {denominaciones.map(d => {
                const cant = data.billetes[d.key as keyof typeof data.billetes];
                if (!cant) return null;
                return (
                  <tr key={d.key}>
                    <td>{d.label} × {cant}</td>
                    <td style={{ textAlign: 'right' }}>{fmt(cant * d.valor)}</td>
                  </tr>
                );
              })}
              <tr><td colSpan={2}><div style={{ borderTop: '1px solid #000', marginTop: 2, marginBottom: 2 }} /></td></tr>
              <tr style={{ fontWeight: 'bold' }}>
                <td>TOTAL CONTADO:</td>
                <td style={{ textAlign: 'right' }}>{fmt(data.totalFisicoContado)}</td>
              </tr>
            </tbody>
          </table>
          <div>{LINE}</div>
        </div>
      )}

      {/* Top productos */}
      {data.productosTop.length > 0 && (
        <div className="px-6 pb-3" style={{ fontSize: 12 }}>
          <div style={{ fontWeight: 'bold', marginBottom: 4 }}>TOP PRODUCTOS VENDIDOS</div>
          <div>{LINE}</div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <tbody>
              {data.productosTop.slice(0, 8).map((p, i) => (
                <tr key={i}>
                  <td style={{ maxWidth: 180, overflow: 'hidden' }}>{i + 1}. {p.nombre.slice(0, 22)}</td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>×{p.cantidad}</td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap', paddingLeft: 4 }}>{fmt(p.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div>{LINE}</div>
        </div>
      )}

      {/* Observaciones */}
      {data.observaciones && (
        <div className="px-6 pb-3" style={{ fontSize: 11 }}>
          <div style={{ fontWeight: 'bold' }}>OBSERVACIONES:</div>
          <div style={{ whiteSpace: 'pre-wrap' }}>{data.observaciones}</div>
          <div>{LINE}</div>
        </div>
      )}

      {/* Firma */}
      <div className="px-6 pb-6" style={{ fontSize: 11, textAlign: 'center' }}>
        <div style={{ marginTop: 16, marginBottom: 4 }}>FIRMA DEL CAJERO</div>
        <div style={{ borderTop: '1px solid #000', width: '70%', margin: '0 auto 4px' }} />
        <div>{data.cajero}</div>
        <div style={{ marginTop: 12, borderTop: '1px dashed #888', paddingTop: 8, color: '#555', fontSize: 10 }}>
          <div style={{ fontWeight: 'bold' }}>CODEC POS v2.0</div>
          <div>Generado: {fechaDisplay} {horaCierre}</div>
          <div>Software por Codec Studio · Bogotá, Colombia</div>
        </div>
      </div>
    </div>
  );
});

TirillaCierreCaja.displayName = 'TirillaCierreCaja';

export default TirillaCierreCaja;
