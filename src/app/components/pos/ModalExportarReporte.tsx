import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X, Eye, Download, FileText, FileSpreadsheet, Printer,
  TrendingUp, Package, DollarSign, BarChart3, Archive, Clock, Wrench,
  Calendar, User, CheckCircle, AlertTriangle, XCircle,
  CreditCard, Banknote, Wallet, ArrowUpRight, ArrowDownRight,
  ShoppingBag, Tag, Star, AlertCircle, TrendingDown, Hash,
} from 'lucide-react';
import { Button } from '../ui/button';
import { ReporteGenerado } from '../../services/reportesService';

interface Props {
  open: boolean;
  reporte: ReporteGenerado | null;
  onClose: () => void;
  onPDF: (r: ReporteGenerado) => void;
  onExcel: (r: ReporteGenerado) => void;
  onTirilla: (r: ReporteGenerado) => void;
  onDownloadTirilla: (r: ReporteGenerado) => void;
  darkMode: boolean;
}

const fmtCOP = (n: number) =>
  `$${Number(n || 0).toLocaleString('es-CO', { minimumFractionDigits: 0 })}`;

const pct = (v: number, total: number) =>
  total > 0 ? `${((v / total) * 100).toFixed(1)}%` : '0%';

const LINE = '─'.repeat(36);

const TIPO_META: Record<string, { label: string; color: string; accent: string; icon: typeof FileText }> = {
  ventas:     { label: 'Reporte de Ventas',              color: 'from-emerald-500 to-emerald-600', accent: 'emerald', icon: TrendingUp   },
  cajero:     { label: 'Reporte por Cajero',             color: 'from-cyan-500 to-cyan-600',       accent: 'cyan',    icon: Clock        },
  inventario: { label: 'Reporte de Inventario',          color: 'from-blue-500 to-blue-600',       accent: 'blue',    icon: Package      },
  gastos:     { label: 'Reporte de Gastos',              color: 'from-red-500 to-red-600',         accent: 'red',     icon: DollarSign   },
  cierres:    { label: 'Reporte de Cierres de Caja',     color: 'from-purple-500 to-purple-600',   accent: 'purple',  icon: Archive      },
  financiero: { label: 'Resumen Financiero',             color: 'from-amber-500 to-amber-600',     accent: 'amber',   icon: BarChart3    },
  taller:     { label: 'Reporte Taller de Reparaciones', color: 'from-orange-500 to-orange-600',   accent: 'orange',  icon: Wrench       },
};

// ─── Helpers de tirilla ───────────────────────────────────────────────────────

function Seccion({ title }: { title: string }) {
  return (
    <div style={{ fontWeight: 'bold', marginTop: 10, marginBottom: 3, fontSize: 11,
      borderBottom: '1px solid #000', paddingBottom: 2, textTransform: 'uppercase',
      letterSpacing: '0.5px' }}>
      {title}
    </div>
  );
}

function Fila({ label, valor, bold = false, small = false }: { label: string; valor: string; bold?: boolean; small?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2,
      fontSize: small ? 10 : 11, fontWeight: bold ? 'bold' : 'normal' }}>
      <span>{label}</span>
      <span style={{ fontWeight: 'bold' }}>{valor}</span>
    </div>
  );
}

function Sep() {
  return <div style={{ borderTop: '1px dashed #444', margin: '4px 0' }} />;
}

function MiniBar({ pctNum, color = '#16a34a' }: { pctNum: number; color?: string }) {
  return (
    <div style={{ height: 3, background: '#e5e7eb', borderRadius: 2, marginTop: 2, marginBottom: 4 }}>
      <div style={{ height: '100%', width: `${Math.min(100, pctNum)}%`, background: color, borderRadius: 2 }} />
    </div>
  );
}

// Sección de egresos/gastos compartida — refleja el mismo bloque que se imprime en PDF/Excel/tirilla
function EgresosSection({ egresos, titulo }: { egresos: any[]; titulo: string }) {
  if (!Array.isArray(egresos) || egresos.length === 0) return null;
  return (
    <>
      <Sep />
      <Seccion title={`${titulo} (${egresos.length})`} />
      {egresos.slice(0, 15).map((g: any, i: number) => {
        const d = new Date(g.fecha);
        const ds = d.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit' });
        const hs = d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
        const concepto = g.categoriaConcepto || g.categoria || g.concepto || 'Sin concepto';
        return (
          <div key={i} style={{ marginBottom: 4, paddingBottom: 4, borderBottom: '1px dotted #ccc' }}>
            <div style={{ fontWeight: 'bold', fontSize: 10 }}>{ds} {hs} · {concepto}</div>
            {g.descripcion && <div style={{ paddingLeft: 10, fontSize: 10 }}>{g.descripcion}</div>}
            <div style={{ textAlign: 'right', fontWeight: 'bold', fontSize: 11, color: '#dc2626' }}>-{fmtCOP(g.monto)}</div>
          </div>
        );
      })}
      {egresos.length > 15 && (
        <div style={{ textAlign: 'center', fontSize: 9, color: '#555' }}>
          ... y {egresos.length - 15} gastos más (ver Excel)
        </div>
      )}
    </>
  );
}

// ─── Previews por tipo ────────────────────────────────────────────────────────

function PreviewVentas({ datos }: { datos: any }) {
  const { resumen, ventas, devoluciones, egresosDetalle } = datos;
  const metodos = Object.entries(resumen?.ventasPorMetodo || {}).filter(([, v]) => Number(v) > 0);
  const totalNeto = resumen?.totalVentasNetas ?? resumen?.totalVentas ?? 0;
  const categorias: any[] = resumen?.ventasPorCategoria || [];

  return (
    <>
      <Seccion title="RESUMEN GENERAL" />
      <Fila label="Total Ventas Brutas:" valor={fmtCOP(resumen?.totalVentas || 0)} />
      {(resumen?.totalDevoluciones || 0) > 0 && (
        <Fila label="(-) Devoluciones:" valor={`-${fmtCOP(resumen.totalDevoluciones)}`} />
      )}
      <Fila label="Ventas Netas:" valor={fmtCOP(totalNeto)} bold />
      <Fila label="Transacciones:" valor={String(resumen?.cantidadTransacciones || 0)} />
      <Fila label="Ticket Promedio:" valor={fmtCOP(resumen?.ticketPromedio || 0)} />
      {(devoluciones?.length || 0) > 0 && (
        <Fila label="Devoluciones (cant.):" valor={String(devoluciones.length)} small />
      )}

      {metodos.length > 0 && (
        <>
          <Sep />
          <Seccion title="MÉTODOS DE PAGO" />
          {metodos.map(([m, v]) => {
            const pctVal = totalNeto > 0 ? ((v as number) / totalNeto) * 100 : 0;
            return (
              <div key={m}>
                <Fila label={`${m.charAt(0).toUpperCase()}${m.slice(1)}:`} valor={`${fmtCOP(v as number)} (${pctVal.toFixed(0)}%)`} />
                <MiniBar pctNum={pctVal} color="#059669" />
              </div>
            );
          })}
        </>
      )}

      {categorias.length > 0 && (
        <>
          <Sep />
          <Seccion title="VENTAS POR CATEGORÍA" />
          {categorias.slice(0, 8).map((cat: any) => (
            <div key={cat.categoria}>
              <Fila label={cat.categoria?.substring(0, 22) || 'Sin cat.'} valor={fmtCOP(cat.total)} />
              <MiniBar pctNum={totalNeto > 0 ? (cat.total / totalNeto) * 100 : 0} color="#7c3aed" />
            </div>
          ))}
        </>
      )}

      {Array.isArray(resumen?.topProductos) && resumen.topProductos.length > 0 && (
        <>
          <Sep />
          <Seccion title="TOP 10 PRODUCTOS MÁS VENDIDOS" />
          {resumen.topProductos.slice(0, 10).map((p: any, i: number) => (
            <div key={i}>
              <div style={{ fontSize: 10, fontWeight: 'bold', marginBottom: 1 }}>
                {i + 1}. {String(p.nombre || '').substring(0, 26)}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, paddingLeft: 12, marginBottom: 2 }}>
                <span>{p.cantidad} unidades</span>
                <span style={{ fontWeight: 'bold' }}>{fmtCOP(p.total)}</span>
              </div>
              <MiniBar pctNum={totalNeto > 0 ? (p.total / totalNeto) * 100 : 0} color="#0284c7" />
            </div>
          ))}
        </>
      )}

      {Array.isArray(ventas) && ventas.length > 0 && (
        <>
          <Sep />
          <Seccion title={`TRANSACCIONES (${ventas.length})`} />
          {ventas.slice(0, 20).map((v: any, i: number) => {
            const d = new Date(v.fecha);
            const ds = d.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit' });
            const hs = d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
            return (
              <div key={i} style={{ marginBottom: 4, paddingBottom: 4, borderBottom: '1px dotted #ccc' }}>
                <div style={{ fontWeight: 'bold', fontSize: 10 }}>
                  {ds} {hs} · {v.metodoPago}{v.cajero ? ` · ${v.cajero}` : ''}
                </div>
                {(v.items || []).slice(0, 3).map((it: any, j: number) => (
                  <div key={j} style={{ paddingLeft: 10, fontSize: 10 }}>
                    {it.cantidad}× {String(it.nombre || '').substring(0, 22)} {fmtCOP(it.subtotal || it.cantidad * it.precio)}
                  </div>
                ))}
                {(v.items || []).length > 3 && (
                  <div style={{ paddingLeft: 10, fontSize: 9, color: '#555' }}>... y {v.items.length - 3} ítems más</div>
                )}
                <div style={{ textAlign: 'right', fontWeight: 'bold', fontSize: 11 }}>TOTAL: {fmtCOP(v.total)}</div>
              </div>
            );
          })}
          {ventas.length > 20 && (
            <div style={{ textAlign: 'center', fontSize: 9, color: '#555' }}>
              ... y {ventas.length - 20} transacciones más (ver Excel)
            </div>
          )}
        </>
      )}

      <EgresosSection egresos={egresosDetalle} titulo="EGRESOS DEL PERIODO" />
    </>
  );
}

function PreviewCajero({ datos }: { datos: any }) {
  const { cajero, resumen, ventas, cierres, egresosDetalle } = datos;
  const metodos = Object.entries(resumen?.ventasPorMetodo || {}).filter(([, v]) => Number(v) > 0);
  const totalVentas = resumen?.totalVentas || 0;
  const confiabilidad = resumen?.totalCierres > 0
    ? ((resumen.totalCierres - (resumen.cierresConFaltante || 0)) / resumen.totalCierres * 100).toFixed(0)
    : '—';

  return (
    <>
      <Seccion title={`CAJERO: ${cajero?.nombre || 'TODOS'}`} />
      <Fila label="Total Ventas:" valor={fmtCOP(totalVentas)} bold />
      <Fila label="Transacciones:" valor={String(resumen?.cantidadTransacciones || 0)} />
      <Fila label="Ticket Promedio:" valor={fmtCOP(resumen?.ticketPromedio || 0)} />
      <Fila label="Total Gastos:" valor={fmtCOP(resumen?.totalGastos || 0)} />
      <Fila label="Neto de Caja:" valor={fmtCOP(resumen?.netoCaja ?? totalVentas)} bold />

      <Sep />
      <Seccion title="HISTORIAL DE CIERRES" />
      <Fila label="Total Cierres:" valor={String(resumen?.totalCierres || 0)} />
      <Fila label="Cierres Cuadrados:" valor={String((resumen?.totalCierres || 0) - (resumen?.cierresConFaltante || 0) - (resumen?.cierresConSobrante || 0))} />
      {(resumen?.cierresConFaltante || 0) > 0 && (
        <Fila label="Con Faltante:" valor={String(resumen.cierresConFaltante)} />
      )}
      {(resumen?.cierresConSobrante || 0) > 0 && (
        <Fila label="Con Sobrante:" valor={String(resumen.cierresConSobrante)} />
      )}
      <Fila label="Difs. acumuladas:" valor={fmtCOP(Math.abs(resumen?.diferenciasAcumuladas || 0))} />
      {confiabilidad !== '—' && (
        <div>
          <Fila label="Índice confiabilidad:" valor={`${confiabilidad}%`} bold />
          <MiniBar pctNum={Number(confiabilidad)} color={Number(confiabilidad) >= 80 ? '#16a34a' : '#d97706'} />
        </div>
      )}

      {metodos.length > 0 && (
        <>
          <Sep />
          <Seccion title="MÉTODOS DE PAGO" />
          {metodos.map(([m, v]) => {
            const pctVal = totalVentas > 0 ? ((v as number) / totalVentas) * 100 : 0;
            return (
              <div key={m}>
                <Fila label={`${m.charAt(0).toUpperCase()}${m.slice(1)}:`} valor={`${fmtCOP(v as number)} (${pctVal.toFixed(0)}%)`} />
                <MiniBar pctNum={pctVal} color="#0891b2" />
              </div>
            );
          })}
        </>
      )}

      {Array.isArray(resumen?.topProductos) && resumen.topProductos.length > 0 && (
        <>
          <Sep />
          <Seccion title="TOP PRODUCTOS" />
          {resumen.topProductos.slice(0, 8).map((p: any, i: number) => (
            <Fila key={i} label={`${i + 1}. ${String(p.nombre || '').substring(0, 22)}`}
              valor={`${p.cantidad}u · ${fmtCOP(p.total)}`} small />
          ))}
        </>
      )}

      {Array.isArray(cierres) && cierres.length > 0 && (
        <>
          <Sep />
          <Seccion title={`CIERRES DETALLADOS (${cierres.length})`} />
          {cierres.slice(0, 10).map((c: any, i: number) => {
            const d = new Date(c.fecha);
            const ds = d.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: '2-digit' });
            const dif = c.diferencia >= 0 ? `+${fmtCOP(c.diferencia)}` : fmtCOP(c.diferencia);
            return (
              <div key={i} style={{ marginBottom: 4, paddingBottom: 4, borderBottom: '1px dotted #ccc' }}>
                <div style={{ fontWeight: 'bold', fontSize: 10 }}>{ds}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10 }}>
                  <span>Total: {fmtCOP(c.totalVentas || c.totalSistema || 0)}</span>
                  <span style={{ color: c.diferencia < 0 ? '#dc2626' : c.diferencia > 0 ? '#d97706' : '#16a34a' }}>
                    Dif: {dif}
                  </span>
                </div>
              </div>
            );
          })}
        </>
      )}

      {Array.isArray(ventas) && ventas.length > 0 && (
        <>
          <Sep />
          <Seccion title={`TRANSACCIONES (${ventas.length})`} />
          {ventas.slice(0, 15).map((v: any, i: number) => {
            const d = new Date(v.fecha);
            const ds = d.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit' });
            const hs = d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
            return (
              <div key={i} style={{ marginBottom: 3, paddingBottom: 3, borderBottom: '1px dotted #ccc' }}>
                <div style={{ fontWeight: 'bold', fontSize: 10 }}>{ds} {hs} · {v.metodoPago}</div>
                {(v.items || []).slice(0, 2).map((it: any, j: number) => (
                  <div key={j} style={{ paddingLeft: 10, fontSize: 10 }}>
                    {it.cantidad}× {String(it.nombre || '').substring(0, 22)}
                  </div>
                ))}
                <div style={{ textAlign: 'right', fontWeight: 'bold', fontSize: 11 }}>TOTAL: {fmtCOP(v.total)}</div>
              </div>
            );
          })}
          {ventas.length > 15 && (
            <div style={{ textAlign: 'center', fontSize: 9, color: '#555' }}>
              ... y {ventas.length - 15} transacciones más (ver Excel)
            </div>
          )}
        </>
      )}

      <EgresosSection egresos={egresosDetalle} titulo="GASTOS DEL CAJERO" />
    </>
  );
}

function PreviewInventario({ datos }: { datos: any }) {
  const { resumen, productos, ingredientes, egresosDetalle } = datos;
  const categorias = Object.entries(resumen?.productosPorCategoria || {}).sort(([, a], [, b]) => Number(b) - Number(a));
  const margen = resumen?.valorCosto > 0
    ? ((resumen.utilidadPotencial / resumen.valorInventario) * 100).toFixed(1)
    : '0';

  return (
    <>
      <Seccion title="RESUMEN DEL INVENTARIO" />
      <Fila label="Total Productos:" valor={String(resumen?.totalProductos || 0)} />
      <Fila label="Valor de Venta (PVP):" valor={fmtCOP(resumen?.valorInventario || 0)} bold />
      <Fila label="Valor de Costo:" valor={fmtCOP(resumen?.valorCosto || 0)} />
      <Fila label="Utilidad Potencial:" valor={fmtCOP(resumen?.utilidadPotencial || 0)} bold />
      <div>
        <Fila label="Margen bruto:" valor={`${margen}%`} />
        <MiniBar pctNum={Number(margen)} color="#059669" />
      </div>

      <Sep />
      <Seccion title="ALERTAS DE INVENTARIO" />
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 3 }}>
        <span style={{ color: '#dc2626', fontWeight: 'bold' }}>
          ⚠ Stock Bajo: {resumen?.productosBajoStock || 0} productos
        </span>
      </div>
      {(resumen?.alertas?.porVencer?.length || 0) > 0 && (
        <div style={{ color: '#d97706', fontWeight: 'bold', fontSize: 11, marginBottom: 3 }}>
          ⏳ Por Vencer (7 días): {resumen.alertas.porVencer.length} productos
        </div>
      )}
      {(resumen?.alertas?.ingredientesStockCritico?.length || 0) > 0 && (
        <div style={{ color: '#7c3aed', fontSize: 11, marginBottom: 3 }}>
          📦 Ingredientes críticos: {resumen.alertas.ingredientesStockCritico.length}
        </div>
      )}

      {resumen?.alertas?.stockBajo?.length > 0 && (
        <>
          <Sep />
          <Seccion title="PRODUCTOS CON STOCK BAJO" />
          {resumen.alertas.stockBajo.slice(0, 12).map((p: any, i: number) => (
            <div key={i} style={{ marginBottom: 3 }}>
              <div style={{ fontWeight: 'bold', fontSize: 10 }}>{String(p.nombre || '').substring(0, 28)}</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, paddingLeft: 8 }}>
                <span style={{ color: '#dc2626' }}>Stock: {p.stock} / Mín: {p.minStock}</span>
                <span>{p.categoria}</span>
              </div>
              <MiniBar pctNum={p.minStock > 0 ? Math.min(100, (p.stock / p.minStock) * 100) : 0} color="#dc2626" />
            </div>
          ))}
          {resumen.alertas.stockBajo.length > 12 && (
            <div style={{ textAlign: 'center', fontSize: 9, color: '#555' }}>
              ... y {resumen.alertas.stockBajo.length - 12} más (ver Excel)
            </div>
          )}
        </>
      )}

      {resumen?.alertas?.porVencer?.length > 0 && (
        <>
          <Sep />
          <Seccion title="PRÓXIMOS A VENCER" />
          {resumen.alertas.porVencer.slice(0, 8).map((p: any, i: number) => (
            <Fila key={i} label={String(p.nombre || '').substring(0, 24)}
              valor={p.fechaVencimiento || '—'} small />
          ))}
        </>
      )}

      {categorias.length > 0 && (
        <>
          <Sep />
          <Seccion title="PRODUCTOS POR CATEGORÍA" />
          {categorias.map(([cat, count]) => {
            const pctVal = (resumen?.totalProductos || 0) > 0 ? ((count as number) / resumen.totalProductos) * 100 : 0;
            return (
              <div key={cat}>
                <Fila label={cat.substring(0, 24)} valor={`${count} prod.`} small />
                <MiniBar pctNum={pctVal} color="#2563eb" />
              </div>
            );
          })}
        </>
      )}

      {(resumen?.merma?.totalRegistros || 0) > 0 && (
        <>
          <Sep />
          <Seccion title="REGISTRO DE MERMAS" />
          <Fila label="Total registros:" valor={String(resumen.merma.totalRegistros)} />
          <Fila label="Costo estimado:" valor={fmtCOP(resumen.merma.costoEstimado)} bold />
        </>
      )}

      {Array.isArray(productos) && productos.length > 0 && (
        <>
          <Sep />
          <Seccion title={`CATÁLOGO COMPLETO (${productos.length})`} />
          {productos.slice(0, 12).map((p: any, i: number) => (
            <div key={i} style={{ marginBottom: 3, paddingBottom: 3, borderBottom: '1px dotted #ddd' }}>
              <div style={{ fontWeight: 'bold', fontSize: 10 }}>{String(p.nombre || '').substring(0, 28)}</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, paddingLeft: 8 }}>
                <span>Stock: {p.stock}{p.minStock ? ` (mín: ${p.minStock})` : ''}</span>
                <span>{fmtCOP(p.precio)}</span>
              </div>
            </div>
          ))}
          {productos.length > 12 && (
            <div style={{ textAlign: 'center', fontSize: 9, color: '#555' }}>
              ... y {productos.length - 12} productos más (ver Excel)
            </div>
          )}
        </>
      )}

      {Array.isArray(ingredientes) && ingredientes.length > 0 && (
        <>
          <Sep />
          <Seccion title={`INGREDIENTES (${ingredientes.length})`} />
          {ingredientes.slice(0, 8).map((ing: any, i: number) => (
            <Fila key={i}
              label={`${String(ing.nombre || '').substring(0, 20)} (${ing.unidad || ''})`}
              valor={`${ing.stockActual}/${ing.stockMinimo}`} small />
          ))}
        </>
      )}

      <EgresosSection egresos={egresosDetalle} titulo="EGRESOS VINCULADOS AL PERIODO" />
    </>
  );
}

function PreviewGastos({ datos }: { datos: any }) {
  const { resumen, gastos } = datos;
  const porCat = Object.entries(resumen?.gastosPorCategoria || {})
    .filter(([, v]) => Number(v) > 0)
    .sort(([, a], [, b]) => Number(b) - Number(a));
  const porDia = Object.entries(resumen?.gastosPorDia || {}).sort(([a], [b]) => b.localeCompare(a));
  const total = resumen?.totalGastos || 0;

  return (
    <>
      <Seccion title="RESUMEN DE EGRESOS" />
      <Fila label="Total Gastos:" valor={fmtCOP(total)} bold />
      <Fila label="Cantidad de gastos:" valor={String(resumen?.cantidadGastos || 0)} />
      <Fila label="Promedio por gasto:" valor={fmtCOP(resumen?.promedioGasto || 0)} />
      {resumen?.categoriaConMayorGasto && (
        <Fila label="Mayor categoría:" valor={resumen.categoriaConMayorGasto} />
      )}

      {porCat.length > 0 && (
        <>
          <Sep />
          <Seccion title="DESGLOSE POR CATEGORÍA" />
          {porCat.map(([cat, val]) => {
            const pctVal = total > 0 ? ((val as number) / total) * 100 : 0;
            return (
              <div key={cat}>
                <Fila label={cat.substring(0, 24)} valor={`${fmtCOP(val as number)} (${pctVal.toFixed(0)}%)`} />
                <MiniBar pctNum={pctVal} color="#dc2626" />
              </div>
            );
          })}
        </>
      )}

      {porDia.length > 0 && (
        <>
          <Sep />
          <Seccion title="EVOLUCIÓN DIARIA (últimos 10 días)" />
          {porDia.slice(0, 10).map(([dia, val]) => (
            <div key={dia}>
              <Fila label={dia} valor={fmtCOP(val as number)} small />
              <MiniBar pctNum={total > 0 ? ((val as number) / total) * 100 : 0} color="#f97316" />
            </div>
          ))}
        </>
      )}

      {Array.isArray(gastos) && gastos.length > 0 && (
        <>
          <Sep />
          <Seccion title={`DETALLE DE GASTOS (${gastos.length})`} />
          {[...gastos].sort((a, b) => (b.monto || 0) - (a.monto || 0)).slice(0, 20).map((g: any, i: number) => {
            const d = new Date(g.fecha);
            const ds = d.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit' });
            const hs = d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
            return (
              <div key={i} style={{ marginBottom: 4, paddingBottom: 4, borderBottom: '1px dotted #ccc' }}>
                <div style={{ fontWeight: 'bold', fontSize: 10 }}>{ds} {hs} · {g.categoria}</div>
                <div style={{ paddingLeft: 10, fontSize: 10 }}>{g.descripcion}</div>
                {g.autorizadoPor && <div style={{ paddingLeft: 10, fontSize: 9, color: '#555' }}>Por: {g.autorizadoPor}</div>}
                <div style={{ textAlign: 'right', fontWeight: 'bold', fontSize: 11 }}>{fmtCOP(g.monto)}</div>
              </div>
            );
          })}
          {gastos.length > 20 && (
            <div style={{ textAlign: 'center', fontSize: 9, color: '#555' }}>
              ... y {gastos.length - 20} gastos más (ver Excel)
            </div>
          )}
        </>
      )}
    </>
  );
}

function PreviewCierres({ datos }: { datos: any }) {
  const { resumen, cierres, egresosDetalle } = datos;
  return (
    <>
      <Seccion title="RESUMEN DE CIERRES" />
      <Fila label="Total Cierres:" valor={String(resumen?.totalCierres || 0)} />
      <Fila label="Total Recaudado:" valor={fmtCOP(resumen?.totalRecaudado || 0)} bold />
      <Fila label="Promedio diario:" valor={fmtCOP(resumen?.promedioRecaudacion || 0)} />
      <Sep />
      <Fila label="Cuadrados:" valor={String((resumen?.totalCierres || 0) - (resumen?.cierresConFaltante || 0) - (resumen?.cierresConSobrante || 0))} />
      {(resumen?.cierresConFaltante || 0) > 0 && <Fila label="Con Faltante:" valor={String(resumen.cierresConFaltante)} />}
      {(resumen?.cierresConSobrante || 0) > 0 && <Fila label="Con Sobrante:" valor={String(resumen.cierresConSobrante)} />}
      <Fila label="Diferencias Acum.:" valor={fmtCOP(resumen?.totalDiferencias || 0)} />
      {resumen?.metodoPagoMasUsado && <Fila label="Método más usado:" valor={resumen.metodoPagoMasUsado} />}

      {Array.isArray(cierres) && cierres.length > 0 && (
        <>
          <Sep />
          <Seccion title={`CIERRES (${cierres.length})`} />
          {cierres.slice(0, 15).map((c: any, i: number) => {
            const d = new Date(c.fecha);
            const ds = d.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit' });
            const dif = c.diferencia >= 0 ? `+${fmtCOP(c.diferencia)}` : fmtCOP(c.diferencia);
            return (
              <div key={i} style={{ marginBottom: 3, paddingBottom: 3, borderBottom: '1px dotted #ccc' }}>
                <div style={{ fontWeight: 'bold', fontSize: 10 }}>{ds}{c.cajero ? ` · ${c.cajero}` : ''}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10 }}>
                  <span>Total: {fmtCOP(c.totalVentas)}</span>
                  <span style={{ color: c.diferencia < 0 ? '#dc2626' : c.diferencia > 0 ? '#d97706' : '#16a34a' }}>
                    Dif: {dif}
                  </span>
                </div>
              </div>
            );
          })}
        </>
      )}

      <EgresosSection egresos={egresosDetalle} titulo="EGRESOS DEL PERIODO ANALIZADO" />
    </>
  );
}

function PreviewFinanciero({ datos }: { datos: any }) {
  const { ingresos, gastos, resumen, egresosDetalle } = datos;
  const utilidad = resumen?.utilidadNeta || 0;
  const margen = resumen?.margenUtilidad || 0;
  const ingresosBrutos = ingresos?.totalBruto || ingresos?.total || 0;
  const ingresosNetos = ingresos?.total || 0;
  const totalGastos = gastos?.total || 0;
  const esBeneficio = utilidad >= 0;
  const gastosPorCat = Object.entries(gastos?.porCategoria || {})
    .filter(([, v]) => Number(v) > 0)
    .sort(([, a], [, b]) => Number(b) - Number(a));
  const metodos = Object.entries(ingresos?.porMetodo || {}).filter(([, v]) => Number(v) > 0);

  return (
    <>
      <Seccion title="ESTADO DE RESULTADOS" />
      <div style={{ textAlign: 'center', padding: '6px 0', borderBottom: '1px solid #eee', marginBottom: 6 }}>
        <div style={{ fontSize: 10, color: '#555', marginBottom: 2 }}>UTILIDAD NETA DEL PERÍODO</div>
        <div style={{ fontSize: 22, fontWeight: 'bold', color: esBeneficio ? '#16a34a' : '#dc2626' }}>
          {utilidad >= 0 ? '+' : ''}{fmtCOP(utilidad)}
        </div>
        <div style={{ fontSize: 10, color: '#555' }}>Margen: {margen.toFixed(1)}%</div>
        <MiniBar pctNum={Math.min(100, Math.abs(margen))} color={esBeneficio ? '#16a34a' : '#dc2626'} />
      </div>

      <Seccion title="INGRESOS" />
      <Fila label="Ventas Brutas:" valor={fmtCOP(ingresosBrutos)} />
      {(ingresos?.totalDevoluciones || 0) > 0 && (
        <Fila label="(-) Devoluciones:" valor={`-${fmtCOP(ingresos.totalDevoluciones)}`} />
      )}
      <Fila label="Ingresos Netos:" valor={fmtCOP(ingresosNetos)} bold />
      <Fila label="Transacciones:" valor={String(ingresos?.transacciones || 0)} small />
      <Fila label="Ingreso/día prom.:" valor={fmtCOP(Math.round(resumen?.ingresoPromedioDiario || 0))} small />

      {metodos.length > 0 && (
        <>
          <Sep />
          <Seccion title="INGRESOS POR MÉTODO" />
          {metodos.map(([m, v]) => {
            const pctVal = ingresosNetos > 0 ? ((v as number) / ingresosNetos) * 100 : 0;
            return (
              <div key={m}>
                <Fila label={`${m.charAt(0).toUpperCase()}${m.slice(1)}:`} valor={`${fmtCOP(v as number)} (${pctVal.toFixed(0)}%)`} small />
                <MiniBar pctNum={pctVal} color="#059669" />
              </div>
            );
          })}
        </>
      )}

      <Sep />
      <Seccion title="EGRESOS / GASTOS" />
      <Fila label="Total Gastos:" valor={fmtCOP(totalGastos)} bold />
      <Fila label="Cantidad:" valor={String(gastos?.transacciones || 0)} small />
      <Fila label="Gasto/día prom.:" valor={fmtCOP(Math.round(resumen?.gastoPromedioDiario || 0))} small />

      {gastosPorCat.length > 0 && (
        <>
          <Sep />
          <Seccion title="GASTOS POR CATEGORÍA" />
          {gastosPorCat.map(([cat, val]) => {
            const pctVal = totalGastos > 0 ? ((val as number) / totalGastos) * 100 : 0;
            return (
              <div key={cat}>
                <Fila label={cat.substring(0, 24)} valor={`${fmtCOP(val as number)} (${pctVal.toFixed(0)}%)`} small />
                <MiniBar pctNum={pctVal} color="#dc2626" />
              </div>
            );
          })}
        </>
      )}

      <Sep />
      <Seccion title="ANÁLISIS DE RENTABILIDAD" />
      <Fila label="Ingresos Netos:" valor={fmtCOP(ingresosNetos)} />
      <Fila label="(-) Total Gastos:" valor={`-${fmtCOP(totalGastos)}`} />
      <div style={{ borderTop: '1px solid #000', marginTop: 4, paddingTop: 4 }}>
        <Fila label={esBeneficio ? 'UTILIDAD NETA:' : 'PÉRDIDA NETA:'} valor={`${utilidad >= 0 ? '+' : ''}${fmtCOP(utilidad)}`} bold />
        <Fila label="Margen de Utilidad:" valor={`${margen.toFixed(2)}%`} bold />
        <Fila label="Punto de Equilibrio:" valor={fmtCOP(resumen?.puntoEquilibrio || totalGastos)} small />
      </div>

      <EgresosSection egresos={egresosDetalle || gastos?.detalle} titulo="EGRESOS DETALLADOS" />
    </>
  );
}

function PreviewTaller({ datos }: { datos: any }) {
  const { resumen } = datos;
  const utilidad = resumen?.utilidadNeta || 0;
  return (
    <>
      <Seccion title="OPERACIONES" />
      <Fila label="Total Órdenes:" valor={String(resumen?.totalOrdenes || 0)} />
      <Fila label="Activas:" valor={String(resumen?.ordenesActivas || 0)} />
      <Fila label="Entregadas:" valor={String(resumen?.ordenesEntregadas || 0)} />
      <Fila label="Canceladas:" valor={String(resumen?.ordenesCanceladas || 0)} />
      {(resumen?.ordenesAtrasadas || 0) > 0 && (
        <Fila label="⚠ Atrasadas:" valor={String(resumen.ordenesAtrasadas)} />
      )}
      <Sep />
      <Seccion title="FINANZAS" />
      <Fila label="Ingresos Totales:" valor={fmtCOP(resumen?.ingresosTotales || 0)} bold />
      <Fila label="Costo Repuestos:" valor={fmtCOP(resumen?.costoTotalInsumos || 0)} />
      <div style={{ textAlign: 'center', padding: '6px 0' }}>
        <div style={{ fontSize: 11, marginBottom: 2 }}>UTILIDAD NETA</div>
        <div style={{ fontSize: 16, fontWeight: 'bold', color: utilidad >= 0 ? '#16a34a' : '#dc2626' }}>
          {fmtCOP(utilidad)}
        </div>
        <div style={{ fontSize: 10, color: '#555' }}>Margen: {(resumen?.margenUtilidad || 0).toFixed(1)}%</div>
      </div>
      {(resumen?.cantidadConSaldo || 0) > 0 && (
        <>
          <Sep />
          <Seccion title="SALDOS PENDIENTES" />
          <Fila label="Clientes con saldo:" valor={String(resumen.cantidadConSaldo)} />
          <Fila label="Total Pendiente:" valor={fmtCOP(resumen.totalPendiente || 0)} bold />
          {resumen.saldosPendientes?.slice(0, 6).map((s: any, i: number) => (
            <Fila key={i} label={String(s.cliente || '').substring(0, 20)} valor={fmtCOP(s.saldo)} small />
          ))}
        </>
      )}
      {resumen?.topRepuestos?.length > 0 && (
        <>
          <Sep />
          <Seccion title="TOP REPUESTOS" />
          {resumen.topRepuestos.slice(0, 5).map((r: any, i: number) => (
            <Fila key={i} label={`${i + 1}. ${String(r.nombre || '').substring(0, 22)}`}
              valor={`${r.cantidad}u · ${fmtCOP(r.costo)}`} small />
          ))}
        </>
      )}
      {resumen?.porTecnico && Object.keys(resumen.porTecnico).length > 0 && (
        <>
          <Sep />
          <Seccion title="POR TÉCNICO" />
          {Object.entries(resumen.porTecnico).map(([tec, d]: [string, any]) => (
            <Fila key={tec} label={String(tec).substring(0, 20)}
              valor={`${d.ordenes} órd · ${fmtCOP(d.ingresos)}`} small />
          ))}
        </>
      )}
    </>
  );
}

function PreviewReporte({ reporte }: { reporte: ReporteGenerado }) {
  const meta = TIPO_META[reporte.tipo] || TIPO_META['ventas'];

  const empresa = (() => {
    try {
      const raw = localStorage.getItem('codec_pos_config');
      if (raw) { const p = JSON.parse(raw); if (p && typeof p === 'object') return p; }
    } catch { /* ignore */ }
    for (const k of ['codecpos_empresa', 'codecpos_config', 'empresa_config', 'pos_empresa']) {
      try {
        const raw = localStorage.getItem(k);
        if (raw) { const p = JSON.parse(raw); if (p?.nombre || p?.name || p?.nombreComercial) return p; }
      } catch { /* ignore */ }
    }
    return null;
  })();

  const nombreEmpresa = empresa?.nombreComercial || empresa?.razonSocial || empresa?.nombre || empresa?.name || 'MI NEGOCIO';
  const generadoEn = new Date(reporte.fechaGeneracion).toLocaleDateString('es-CO', {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });

  return (
    <div style={{
      background: '#fff', color: '#000', fontFamily: "'Courier New', monospace",
      fontSize: 12, maxWidth: 340, margin: '0 auto', borderRadius: 12,
      overflow: 'hidden', boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
    }}>
      {/* Header empresa */}
      <div style={{ padding: '16px 20px 10px', textAlign: 'center', borderBottom: '2px solid #000', background: '#fff' }}>
        {empresa?.logoUrl && (
          <img src={empresa.logoUrl} alt="Logo"
            style={{ maxHeight: 56, maxWidth: 160, margin: '0 auto 8px', objectFit: 'contain', display: 'block' }} />
        )}
        <div style={{ fontSize: 15, fontWeight: 'bold' }}>{nombreEmpresa}</div>
        {empresa?.razonSocial && empresa.razonSocial !== empresa.nombreComercial && (
          <div style={{ fontSize: 10 }}>{empresa.razonSocial}</div>
        )}
        {empresa?.nit && (
          <div style={{ fontSize: 10 }}>
            NIT: {empresa.nit}{empresa.digitoVerificacion ? `-${empresa.digitoVerificacion}` : ''}
          </div>
        )}
        {(empresa?.direccion || empresa?.ciudad) && (
          <div style={{ fontSize: 10 }}>{empresa?.direccion || ''}{empresa?.ciudad ? ` · ${empresa.ciudad}` : ''}</div>
        )}
        {empresa?.telefono && <div style={{ fontSize: 10 }}>Tel: {empresa.telefono}</div>}
        {empresa?.email && <div style={{ fontSize: 10 }}>{empresa.email}</div>}
        {empresa?.eslogan && <div style={{ fontSize: 10, fontStyle: 'italic' }}>{empresa.eslogan}</div>}
      </div>

      {/* Título */}
      <div style={{ padding: '8px 20px', textAlign: 'center', borderBottom: '1px dashed #555' }}>
        <div style={{ fontSize: 13, fontWeight: 'bold', letterSpacing: '0.5px' }}>
          {meta.label.toUpperCase()}
        </div>
        <div style={{ fontSize: 10 }}>
          {reporte.periodo.inicio !== reporte.periodo.fin
            ? `${reporte.periodo.inicio} → ${reporte.periodo.fin}`
            : reporte.periodo.inicio}
        </div>
      </div>

      {/* Meta */}
      <div style={{ padding: '6px 20px', borderBottom: '1px solid #000', fontSize: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>Generado:</span><span>{generadoEn}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>Por:</span><span>{reporte.metadata.generadoPor || 'Sistema POS'}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>Registros:</span><span>{reporte.metadata.totalRegistros}</span>
        </div>
      </div>

      {/* Cuerpo */}
      <div style={{ padding: '6px 20px 16px' }}>
        {reporte.tipo === 'ventas'     && <PreviewVentas     datos={reporte.datos} />}
        {reporte.tipo === 'cajero'     && <PreviewCajero     datos={reporte.datos} />}
        {reporte.tipo === 'inventario' && <PreviewInventario datos={reporte.datos} />}
        {reporte.tipo === 'gastos'     && <PreviewGastos     datos={reporte.datos} />}
        {reporte.tipo === 'cierres'    && <PreviewCierres    datos={reporte.datos} />}
        {reporte.tipo === 'financiero' && <PreviewFinanciero datos={reporte.datos} />}
        {reporte.tipo === 'taller'     && <PreviewTaller     datos={reporte.datos} />}
      </div>

      {/* Footer */}
      <div style={{ padding: '8px 20px 12px', borderTop: '2px solid #000', textAlign: 'center', fontSize: 9 }}>
        <div style={{ fontWeight: 'bold', fontSize: 10 }}>{nombreEmpresa}</div>
        {(empresa?.telefono || empresa?.email) && (
          <div>{[empresa?.telefono, empresa?.email].filter(Boolean).join(' · ')}</div>
        )}
        <div style={{ color: '#555', marginTop: 2 }}>Generado con CODEC POS v2.0</div>
      </div>
    </div>
  );
}

// ─── Panel derecho — KPIs por tipo ───────────────────────────────────────────

function KpiCard({ label, value, sub, color = 'blue', darkMode }: {
  label: string; value: string; sub?: string; color?: string; darkMode: boolean;
}) {
  const colorMap: Record<string, string> = {
    emerald: darkMode ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' : 'bg-emerald-50 border-emerald-200 text-emerald-600',
    blue:    darkMode ? 'bg-blue-500/10 border-blue-500/30 text-blue-300'         : 'bg-blue-50 border-blue-200 text-blue-600',
    red:     darkMode ? 'bg-red-500/10 border-red-500/30 text-red-300'            : 'bg-red-50 border-red-200 text-red-600',
    amber:   darkMode ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'      : 'bg-amber-50 border-amber-200 text-amber-600',
    purple:  darkMode ? 'bg-purple-500/10 border-purple-500/30 text-purple-300'   : 'bg-purple-50 border-purple-200 text-purple-600',
    cyan:    darkMode ? 'bg-cyan-500/10 border-cyan-500/30 text-cyan-300'         : 'bg-cyan-50 border-cyan-200 text-cyan-600',
    orange:  darkMode ? 'bg-orange-500/10 border-orange-500/30 text-orange-300'   : 'bg-orange-50 border-orange-200 text-orange-600',
  };
  const cls = colorMap[color] || colorMap.blue;
  const txt = darkMode ? 'text-white' : 'text-slate-900';
  const stxt = darkMode ? 'text-slate-500' : 'text-gray-400';
  return (
    <div className={`p-3.5 rounded-xl border ${cls.split(' ').slice(0, 2).join(' ')}`}>
      <p className={`text-xs font-semibold ${cls.split(' ').pop()}`}>{label}</p>
      <p className={`text-xl font-black mt-0.5 ${txt}`}>{value}</p>
      {sub && <p className={`text-xs mt-0.5 ${stxt}`}>{sub}</p>}
    </div>
  );
}

function RightPanelContent({ reporte, darkMode }: { reporte: ReporteGenerado; darkMode: boolean }) {
  const card = darkMode ? 'bg-slate-800' : 'bg-gray-50';
  const txt  = darkMode ? 'text-white'   : 'text-slate-900';
  const sub  = darkMode ? 'text-slate-500' : 'text-gray-400';

  switch (reporte.tipo) {
    case 'ventas': {
      const r = reporte.datos?.resumen || {};
      const totalNeto = r.totalVentasNetas ?? r.totalVentas ?? 0;
      const metodos = Object.entries(r.ventasPorMetodo || {}).filter(([, v]) => Number(v) > 0);
      return (
        <>
          <KpiCard label="VENTAS NETAS" value={fmtCOP(totalNeto)} sub={`${r.cantidadTransacciones || 0} transacciones`} color="emerald" darkMode={darkMode} />
          <KpiCard label="TICKET PROMEDIO" value={fmtCOP(r.ticketPromedio || 0)} color="blue" darkMode={darkMode} />
          {(r.totalDevoluciones || 0) > 0 && (
            <KpiCard label="DEVOLUCIONES" value={fmtCOP(r.totalDevoluciones)} sub={`Bruto: ${fmtCOP(r.totalVentas)}`} color="red" darkMode={darkMode} />
          )}
          {metodos.length > 0 && (
            <div className={`p-3 rounded-xl border ${darkMode ? 'border-slate-700' : 'border-gray-200'} ${card}`}>
              <p className={`text-xs font-semibold mb-2 ${sub}`}>MÉTODOS DE PAGO</p>
              {metodos.map(([m, v]) => (
                <div key={m} className="flex justify-between items-center mb-1">
                  <span className={`text-xs ${sub}`}>{m.charAt(0).toUpperCase() + m.slice(1)}</span>
                  <span className={`text-xs font-bold ${txt}`}>{fmtCOP(v as number)}</span>
                </div>
              ))}
            </div>
          )}
          {(r.topProductos?.length || 0) > 0 && (
            <div className={`p-3 rounded-xl border ${darkMode ? 'border-slate-700' : 'border-gray-200'} ${card}`}>
              <p className={`text-xs font-semibold mb-2 ${sub}`}>TOP 5 PRODUCTOS</p>
              {r.topProductos.slice(0, 5).map((p: any, i: number) => (
                <div key={i} className="flex justify-between items-center mb-1">
                  <span className={`text-xs truncate flex-1 ${sub}`}>{i + 1}. {p.nombre}</span>
                  <span className={`text-xs font-bold ml-2 ${txt}`}>{p.cantidad}u</span>
                </div>
              ))}
            </div>
          )}
        </>
      );
    }

    case 'cajero': {
      const r = reporte.datos?.resumen || {};
      const caj = reporte.datos?.cajero || {};
      const confiabilidad = r.totalCierres > 0
        ? Math.round(((r.totalCierres - (r.cierresConFaltante || 0)) / r.totalCierres) * 100)
        : null;
      return (
        <>
          <div className={`flex items-center gap-2.5 p-3 rounded-xl ${card}`}>
            <User className={`w-4 h-4 ${sub}`} />
            <div>
              <p className={`text-xs ${sub}`}>Cajero analizado</p>
              <p className={`font-bold text-sm ${txt}`}>{caj.nombre || 'Todos'}</p>
            </div>
          </div>
          <KpiCard label="TOTAL VENTAS" value={fmtCOP(r.totalVentas || 0)} sub={`${r.cantidadTransacciones || 0} transacciones`} color="cyan" darkMode={darkMode} />
          <KpiCard label="TICKET PROMEDIO" value={fmtCOP(r.ticketPromedio || 0)} color="blue" darkMode={darkMode} />
          <KpiCard label="CIERRES REALIZADOS" value={String(r.totalCierres || 0)} sub={`Faltantes: ${r.cierresConFaltante || 0}`} color="purple" darkMode={darkMode} />
          {confiabilidad !== null && (
            <div className={`p-3 rounded-xl border ${darkMode ? 'border-slate-700' : 'border-gray-200'} ${card}`}>
              <p className={`text-xs font-semibold mb-1 ${sub}`}>ÍNDICE DE CONFIABILIDAD</p>
              <p className={`text-xl font-black ${confiabilidad >= 80 ? 'text-emerald-500' : confiabilidad >= 60 ? 'text-amber-500' : 'text-red-500'}`}>{confiabilidad}%</p>
              <div className={`h-2 rounded-full mt-2 ${darkMode ? 'bg-slate-700' : 'bg-gray-200'}`}>
                <div className={`h-full rounded-full ${confiabilidad >= 80 ? 'bg-emerald-500' : confiabilidad >= 60 ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${confiabilidad}%` }} />
              </div>
            </div>
          )}
          <KpiCard label="DIFERENCIAS ACUM." value={fmtCOP(Math.abs(r.diferenciasAcumuladas || 0))} color="amber" darkMode={darkMode} />
          <KpiCard label="TOTAL GASTOS" value={fmtCOP(r.totalGastos || 0)} sub={`${r.cantidadGastos || 0} registros`} color="red" darkMode={darkMode} />
          <KpiCard label="NETO DE CAJA" value={fmtCOP(r.netoCaja ?? r.totalVentas ?? 0)} sub="Ventas - Gastos" color="emerald" darkMode={darkMode} />
        </>
      );
    }

    case 'inventario': {
      const r = reporte.datos?.resumen || {};
      const margen = r.valorInventario > 0 ? ((r.utilidadPotencial / r.valorInventario) * 100).toFixed(1) : '0';
      return (
        <>
          <KpiCard label="VALOR INVENTARIO (PVP)" value={fmtCOP(r.valorInventario || 0)} sub={`${r.totalProductos || 0} productos`} color="blue" darkMode={darkMode} />
          <KpiCard label="UTILIDAD POTENCIAL" value={fmtCOP(r.utilidadPotencial || 0)} sub={`Margen: ${margen}%`} color="emerald" darkMode={darkMode} />
          <KpiCard label="VALOR DE COSTO" value={fmtCOP(r.valorCosto || 0)} color="cyan" darkMode={darkMode} />
          {(r.productosBajoStock || 0) > 0 && (
            <div className={`p-3 rounded-xl border-2 ${darkMode ? 'bg-red-500/10 border-red-500/30' : 'bg-red-50 border-red-200'}`}>
              <div className="flex items-center gap-2 mb-1">
                <AlertTriangle className="w-4 h-4 text-red-500" />
                <p className={`text-xs font-semibold text-red-500`}>ALERTAS CRÍTICAS</p>
              </div>
              <p className={`text-xl font-black ${txt}`}>{r.productosBajoStock}</p>
              <p className={`text-xs text-red-500`}>productos con stock bajo</p>
              {(r.alertas?.porVencer?.length || 0) > 0 && (
                <p className={`text-xs text-amber-500 mt-1`}>{r.alertas.porVencer.length} por vencer (7 días)</p>
              )}
            </div>
          )}
          {r.merma?.totalRegistros > 0 && (
            <KpiCard label="MERMAS REGISTRADAS" value={fmtCOP(r.merma.costoEstimado || 0)} sub={`${r.merma.totalRegistros} registros`} color="amber" darkMode={darkMode} />
          )}
        </>
      );
    }

    case 'gastos': {
      const r = reporte.datos?.resumen || {};
      const porCat = Object.entries(r.gastosPorCategoria || {}).sort(([, a], [, b]) => Number(b) - Number(a));
      return (
        <>
          <KpiCard label="TOTAL EGRESOS" value={fmtCOP(r.totalGastos || 0)} sub={`${r.cantidadGastos || 0} registros`} color="red" darkMode={darkMode} />
          <KpiCard label="PROMEDIO POR GASTO" value={fmtCOP(r.promedioGasto || 0)} color="amber" darkMode={darkMode} />
          {r.categoriaConMayorGasto && (
            <div className={`flex items-center gap-2.5 p-3 rounded-xl ${card}`}>
              <Tag className={`w-4 h-4 ${sub}`} />
              <div>
                <p className={`text-xs ${sub}`}>Mayor categoría</p>
                <p className={`font-bold text-sm ${txt}`}>{r.categoriaConMayorGasto}</p>
              </div>
            </div>
          )}
          {porCat.length > 0 && (
            <div className={`p-3 rounded-xl border ${darkMode ? 'border-slate-700' : 'border-gray-200'} ${card}`}>
              <p className={`text-xs font-semibold mb-2 ${sub}`}>CATEGORÍAS</p>
              {porCat.slice(0, 6).map(([cat, val]) => (
                <div key={cat} className="flex justify-between items-center mb-1">
                  <span className={`text-xs truncate flex-1 ${sub}`}>{cat}</span>
                  <span className={`text-xs font-bold ml-2 ${txt}`}>{fmtCOP(val as number)}</span>
                </div>
              ))}
            </div>
          )}
        </>
      );
    }

    case 'financiero': {
      const { ingresos, gastos, resumen: r } = reporte.datos;
      const utilidad = r?.utilidadNeta || 0;
      const esBeneficio = utilidad >= 0;
      return (
        <>
          <div className={`p-4 rounded-xl border-2 ${esBeneficio ? darkMode ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-emerald-50 border-emerald-200' : darkMode ? 'bg-red-500/10 border-red-500/30' : 'bg-red-50 border-red-200'}`}>
            <p className={`text-xs font-semibold mb-1 ${esBeneficio ? 'text-emerald-500' : 'text-red-500'}`}>UTILIDAD NETA</p>
            <p className={`text-2xl font-black flex items-center gap-1 ${txt}`}>
              {esBeneficio ? <ArrowUpRight className="w-5 h-5 text-emerald-500" /> : <ArrowDownRight className="w-5 h-5 text-red-500" />}
              {fmtCOP(utilidad)}
            </p>
            <p className={`text-xs mt-1 ${esBeneficio ? 'text-emerald-500' : 'text-red-500'}`}>
              Margen: {(r?.margenUtilidad || 0).toFixed(1)}%
            </p>
          </div>
          <KpiCard label="INGRESOS NETOS" value={fmtCOP(ingresos?.total || 0)} sub={`${ingresos?.transacciones || 0} transacciones`} color="blue" darkMode={darkMode} />
          <KpiCard label="TOTAL GASTOS" value={fmtCOP(gastos?.total || 0)} color="red" darkMode={darkMode} />
          <KpiCard label="INGRESO/DÍA PROM." value={fmtCOP(Math.round(r?.ingresoPromedioDiario || 0))} color="cyan" darkMode={darkMode} />
          <KpiCard label="GASTO/DÍA PROM." value={fmtCOP(Math.round(r?.gastoPromedioDiario || 0))} color="amber" darkMode={darkMode} />
        </>
      );
    }

    case 'cierres': {
      const r = reporte.datos?.resumen || {};
      return (
        <>
          <KpiCard label="TOTAL RECAUDADO" value={fmtCOP(r.totalRecaudado || 0)} sub={`${r.totalCierres || 0} cierres`} color="purple" darkMode={darkMode} />
          <KpiCard label="PROMEDIO POR CIERRE" value={fmtCOP(r.promedioRecaudacion || 0)} color="blue" darkMode={darkMode} />
          <div className={`p-3 rounded-xl border ${darkMode ? 'border-slate-700' : 'border-gray-200'} ${card}`}>
            <p className={`text-xs font-semibold mb-2 ${sub}`}>ESTADO DE CIERRES</p>
            <div className="flex justify-between mb-1">
              <span className="flex items-center gap-1 text-xs text-emerald-500"><CheckCircle className="w-3 h-3" />Cuadrados</span>
              <span className={`text-xs font-bold ${txt}`}>{(r.totalCierres || 0) - (r.cierresConFaltante || 0) - (r.cierresConSobrante || 0)}</span>
            </div>
            {(r.cierresConFaltante || 0) > 0 && (
              <div className="flex justify-between mb-1">
                <span className="flex items-center gap-1 text-xs text-red-500"><XCircle className="w-3 h-3" />Con Faltante</span>
                <span className={`text-xs font-bold ${txt}`}>{r.cierresConFaltante}</span>
              </div>
            )}
            {(r.cierresConSobrante || 0) > 0 && (
              <div className="flex justify-between">
                <span className="flex items-center gap-1 text-xs text-amber-500"><AlertTriangle className="w-3 h-3" />Con Sobrante</span>
                <span className={`text-xs font-bold ${txt}`}>{r.cierresConSobrante}</span>
              </div>
            )}
          </div>
          <KpiCard label="DIFERENCIAS ACUM." value={fmtCOP(r.totalDiferencias || 0)} color="amber" darkMode={darkMode} />
        </>
      );
    }

    case 'taller': {
      const r = reporte.datos?.resumen || {};
      const utilidad = r.utilidadNeta || 0;
      return (
        <>
          <KpiCard label="INGRESOS TALLER" value={fmtCOP(r.ingresosTotales || 0)} sub={`${r.totalOrdenes || 0} órdenes`} color="orange" darkMode={darkMode} />
          <KpiCard label="UTILIDAD NETA" value={fmtCOP(utilidad)} sub={`Margen: ${(r.margenUtilidad || 0).toFixed(1)}%`} color={utilidad >= 0 ? 'emerald' : 'red'} darkMode={darkMode} />
          <KpiCard label="COSTO REPUESTOS" value={fmtCOP(r.costoTotalInsumos || 0)} color="blue" darkMode={darkMode} />
          <div className={`p-3 rounded-xl border ${darkMode ? 'border-slate-700' : 'border-gray-200'} ${card}`}>
            <p className={`text-xs font-semibold mb-2 ${sub}`}>ESTADO DE ÓRDENES</p>
            <div className="flex justify-between mb-1"><span className={`text-xs ${sub}`}>Activas</span><span className={`text-xs font-bold ${txt}`}>{r.ordenesActivas || 0}</span></div>
            <div className="flex justify-between mb-1"><span className={`text-xs ${sub}`}>Entregadas</span><span className={`text-xs font-bold ${txt}`}>{r.ordenesEntregadas || 0}</span></div>
            {(r.ordenesAtrasadas || 0) > 0 && <div className="flex justify-between"><span className="text-xs text-red-500">Atrasadas</span><span className="text-xs font-bold text-red-500">{r.ordenesAtrasadas}</span></div>}
          </div>
          {(r.cantidadConSaldo || 0) > 0 && (
            <KpiCard label="SALDOS PENDIENTES" value={fmtCOP(r.totalPendiente || 0)} sub={`${r.cantidadConSaldo} clientes`} color="amber" darkMode={darkMode} />
          )}
        </>
      );
    }

    default: return null;
  }
}

// ─── Modal principal ──────────────────────────────────────────────────────────

export default function ModalExportarReporte({ open, reporte, onClose, onPDF, onExcel, onTirilla, onDownloadTirilla, darkMode }: Props) {
  // ⚠️ EARLY RETURNS Y VALIDACIONES PRIMERO, ANTES DE CUALQUIER HOOK
  if (!reporte) return null;

  // ✅ TODOS LOS HOOKS AL INICIO (después de validaciones, antes de lógica)
  const [busy, setBusy] = useState<'pdf' | 'excel' | 'tirilla' | null>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const meta = TIPO_META[reporte.tipo] || TIPO_META['ventas'];
  const Icono = meta.icon;

  const periodoLabel = reporte.periodo.inicio === reporte.periodo.fin
    ? reporte.periodo.inicio
    : `${reporte.periodo.inicio} → ${reporte.periodo.fin}`;

  const exec = (tipo: 'pdf' | 'excel' | 'tirilla' | 'download-tirilla') => {
    setBusy(tipo === 'download-tirilla' ? 'tirilla' : tipo);
    try {
      if (tipo === 'pdf')            onPDF(reporte);
      if (tipo === 'excel')          onExcel(reporte);
      if (tipo === 'tirilla')        onTirilla(reporte);
      if (tipo === 'download-tirilla') onDownloadTirilla(reporte);
    } finally {
      setTimeout(() => { setBusy(null); onClose(); }, 300);
    }
  };

  const previewReport = () => {
    previewRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const bg     = darkMode ? 'bg-slate-900'     : 'bg-white';
  const bgLeft = darkMode ? 'bg-slate-950'      : 'bg-gray-50';
  const border = darkMode ? 'border-slate-700'  : 'border-gray-200';
  const txt    = darkMode ? 'text-white'        : 'text-slate-900';
  const sub    = darkMode ? 'text-slate-400'    : 'text-slate-500';

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 bg-black/85 backdrop-blur-md z-[200] flex items-center justify-center p-3 md:p-6"
          onClick={e => { if (e.target === e.currentTarget) onClose(); }}
        >
          <motion.div
            initial={{ scale: 0.93, opacity: 0, y: 16 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.93, opacity: 0, y: 16 }}
            transition={{ type: 'spring', damping: 26, stiffness: 300 }}
            className={`relative w-full max-w-5xl max-h-[94vh] flex flex-col lg:flex-row rounded-3xl overflow-hidden shadow-[0_32px_80px_rgba(0,0,0,0.6)] border ${bg} ${border}`}
          >
            {/* Botón cerrar */}
            <button onClick={onClose}
              className={`absolute top-4 right-4 z-10 p-2 rounded-full transition-colors ${darkMode ? 'text-slate-400 hover:text-white hover:bg-slate-700' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'}`}>
              <X className="w-5 h-5" />
            </button>

            {/* ── Panel izquierdo: Vista previa ── */}
            <div ref={previewRef} className={`flex-1 overflow-y-auto p-6 ${bgLeft}`}>
              <p className={`text-xs font-semibold uppercase tracking-widest mb-4 ${sub}`}>
                Vista previa del reporte
              </p>
              <PreviewReporte reporte={reporte} />
            </div>

            {/* ── Panel derecho: KPIs + Acciones (scroll invisible) ── */}
            <div className={`w-full lg:w-72 shrink-0 flex flex-col border-t lg:border-t-0 lg:border-l ${border} ${bg}`}>
              {/* Header fijo */}
              <div className={`px-5 py-4 border-b ${border} shrink-0`}>
                <div className="flex items-center gap-2.5 mb-0.5">
                  <div className={`w-8 h-8 rounded-xl bg-gradient-to-br ${meta.color} flex items-center justify-center shrink-0`}>
                    <Icono className="w-4 h-4 text-white" />
                  </div>
                  <h2 className={`font-bold text-sm leading-tight ${txt}`}>{meta.label}</h2>
                </div>
                <p className={`text-xs ${sub} mt-1`}>{periodoLabel}</p>
              </div>

              {/* Contenido scrollable con KPIs y botones */}
              <div
                className="flex flex-col gap-3 p-4 flex-1"
                style={{ maxHeight: 'calc(94vh - 80px)', overflowY: 'auto', scrollbarWidth: 'none', msOverflowStyle: 'none' } as React.CSSProperties}
              >
                {/* Periodo y generador */}
                <div className={`flex items-center gap-2 px-3 py-2 rounded-xl ${darkMode ? 'bg-slate-800' : 'bg-gray-50'}`}>
                  <Calendar className={`w-3.5 h-3.5 ${sub}`} />
                  <div>
                    <p className={`text-xs ${sub}`}>Generado por</p>
                    <p className={`font-semibold text-xs ${txt}`}>{reporte.metadata.generadoPor || 'Sistema POS'}</p>
                  </div>
                  <div className="ml-auto text-right">
                    <p className={`text-xs ${sub}`}>Registros</p>
                    <p className={`font-bold text-xs ${txt}`}>{reporte.metadata.totalRegistros}</p>
                  </div>
                </div>

                {/* KPIs específicos por tipo */}
                <RightPanelContent reporte={reporte} darkMode={darkMode} />

                {/* Separador */}
                <div className={`border-t ${border}`} />

                {/* Botones de exportación */}
                <p className={`text-xs font-semibold uppercase tracking-wider ${sub}`}>Acciones rápidas</p>

                <Button
                  onClick={previewReport}
                  disabled={busy !== null}
                  className="w-full h-11 bg-slate-700 text-white font-bold rounded-xl shadow-lg text-sm"
                >
                  <Eye className="w-4 h-4 mr-2" />
                  Ver / Previsualizar
                </Button>

                <Button
                  onClick={() => exec('pdf')}
                  disabled={busy !== null}
                  className={`w-full h-11 bg-gradient-to-r ${meta.color.replace('from-', 'from-').replace('to-', 'to-')} text-white font-bold rounded-xl shadow-lg text-sm`}
                >
                  {busy === 'pdf'
                    ? <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-2" />
                    : <FileText className="w-4 h-4 mr-2" />}
                  Descargar PDF
                </Button>

                <Button
                  onClick={() => exec('excel')}
                  disabled={busy !== null}
                  className="w-full h-11 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white font-bold rounded-xl shadow-lg text-sm"
                >
                  {busy === 'excel'
                    ? <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-2" />
                    : <FileSpreadsheet className="w-4 h-4 mr-2" />}
                  Descargar Excel
                </Button>

                <Button
                  onClick={() => exec('download-tirilla')}
                  disabled={busy !== null}
                  className="w-full h-11 bg-gradient-to-r from-slate-500 to-slate-600 hover:from-slate-600 hover:to-slate-700 text-white font-bold rounded-xl shadow-lg text-sm"
                >
                  {busy === 'tirilla'
                    ? <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-2" />
                    : <Download className="w-4 h-4 mr-2" />}
                  Descargar Tirilla
                </Button>

                <Button
                  onClick={() => exec('tirilla')}
                  disabled={busy !== null}
                  className="w-full h-11 bg-gradient-to-r from-violet-500 to-violet-600 hover:from-violet-600 hover:to-violet-700 text-white font-bold rounded-xl shadow-lg text-sm"
                >
                  {busy === 'tirilla'
                    ? <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-2" />
                    : <Printer className="w-4 h-4 mr-2" />}
                  Imprimir Tirilla (80mm)
                </Button>

                <button
                  onClick={onClose}
                  disabled={busy !== null}
                  className={`w-full text-sm py-2 rounded-xl transition-colors ${sub} hover:text-purple-500`}
                >
                  Cancelar
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
