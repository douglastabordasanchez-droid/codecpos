/**
 * Notas crédito y débito emitidas — pestaña del módulo de Facturación, igual
 * en Electron, la web y el celular. Lista las dos tablas de notas con la
 * factura que ajusta cada una; al tocar una nota se abre su detalle
 * (concepto, motivo, valores, productos, CUDE, respuesta de la DIAN y XML).
 */
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Search, RefreshCw, X, Copy, Download, Eye, FileMinus2, FilePlus2, Loader2 } from 'lucide-react';
import { listarNotasDelCliente, obtenerXmlNota, type NotaConFactura } from '../../lib/supabase/notaAjusteDianService';
import { obtenerFacturaPorId } from '../../lib/supabase/facturaElectronicaDianService';
import { CONCEPTOS_NOTA_CREDITO, CONCEPTOS_NOTA_DEBITO, type FacturaElectronicaDian, type TipoNotaAjuste } from '../../lib/dian/types';
import { datosPdfFacturaDianCompletos } from '../../lib/dian/representacionGrafica';
import { ModalVistaFactura } from '../factura/ModalVistaFactura';
import { ESTADO_DIAN_UI, descargarTexto, money } from './comunes';

const campo = 'h-10 px-3 rounded-lg bg-slate-900 border border-slate-800 text-white text-sm';

interface Props {
  clienteId: string;
  recarga?: number;
  /** Búsqueda con que se abre (DBM1507 al llegar desde una factura). */
  textoInicial?: string;
}

export function etiquetaTipoNota(tipo: TipoNotaAjuste) {
  return tipo === 'credito' ? 'Nota crédito' : 'Nota débito';
}

function conceptoNota(tipo: TipoNotaAjuste, codigo?: string) {
  const lista: ReadonlyArray<{ codigo: string; label: string }> = tipo === 'credito' ? CONCEPTOS_NOTA_CREDITO : CONCEPTOS_NOTA_DEBITO;
  return lista.find((c) => c.codigo === codigo)?.label || (codigo ? `Concepto ${codigo}` : 'Sin concepto');
}

/** Mensajes de la DIAN de una respuesta guardada: primero los rechazos. */
function mensajesDian(respuesta: Record<string, unknown> | undefined): string[] {
  const errores = (respuesta?.ErrorMessage as { string?: unknown } | undefined)?.string;
  const lista = (Array.isArray(errores) ? errores : errores ? [errores] : []).map(String);
  return [...lista.filter((m) => /rechazo/i.test(m)), ...lista.filter((m) => !/rechazo/i.test(m))];
}

const fecha = (iso: string) => new Date(iso).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
const fechaHora = (iso: string) => new Date(iso).toLocaleString('es-CO', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

function ChipTipo({ tipo }: { tipo: TipoNotaAjuste }) {
  const Icon = tipo === 'credito' ? FileMinus2 : FilePlus2;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold whitespace-nowrap ${
      tipo === 'credito' ? 'bg-sky-500/15 text-sky-400' : 'bg-amber-500/15 text-amber-400'
    }`}>
      <Icon className="w-3 h-3" /> {etiquetaTipoNota(tipo)}
    </span>
  );
}

function ChipEstado({ estado }: { estado: NotaConFactura['estado'] }) {
  const info = ESTADO_DIAN_UI[estado];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold whitespace-nowrap ${info.className}`}>
      <info.Icon className="w-3 h-3" /> {info.label}
    </span>
  );
}

export function NotasAjuste({ clienteId, recarga = 0, textoInicial = '' }: Props) {
  const [notas, setNotas] = useState<NotaConFactura[]>([]);
  const [cargando, setCargando] = useState(true);
  const [filtros, setFiltros] = useState({ desde: '', hasta: '', texto: textoInicial, tipo: '' as '' | TipoNotaAjuste, estado: '' as '' | 'aprobado' | 'rechazado' | 'pendiente' });
  const [notaVista, setNotaVista] = useState<NotaConFactura | null>(null);
  const [facturaVista, setFacturaVista] = useState<FacturaElectronicaDian | null>(null);
  const [abriendoFactura, setAbriendoFactura] = useState(false);

  async function cargar() {
    setCargando(true);
    try {
      setNotas(await listarNotasDelCliente(clienteId, {
        desde: filtros.desde ? new Date(`${filtros.desde}T00:00:00`).toISOString() : undefined,
        hasta: filtros.hasta ? new Date(`${filtros.hasta}T23:59:59.999`).toISOString() : undefined,
      }));
    } catch (e: any) {
      toast.error(e?.message || 'No se pudieron cargar las notas');
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clienteId, recarga, filtros.desde, filtros.hasta]);

  const visibles = useMemo(() => {
    const texto = filtros.texto.trim().toLowerCase();
    return notas.filter((n) => {
      if (filtros.tipo && n.tipo !== filtros.tipo) return false;
      if (filtros.estado === 'aprobado' && n.estado !== 'accepted') return false;
      if (filtros.estado === 'rechazado' && !['rejected', 'error', 'cancelled'].includes(n.estado)) return false;
      if (filtros.estado === 'pendiente' && ['accepted', 'rejected', 'error', 'cancelled'].includes(n.estado)) return false;
      if (!texto) return true;
      return (
        n.numeroNota.toLowerCase().includes(texto) ||
        (n.factura?.numeroFactura || '').toLowerCase().includes(texto) ||
        (n.factura?.clienteNombre || '').toLowerCase().includes(texto) ||
        (n.factura?.clienteNit || '').includes(texto)
      );
    });
  }, [notas, filtros.texto, filtros.tipo, filtros.estado]);

  const aprobadas = visibles.filter((n) => n.estado === 'accepted');
  const totalCredito = aprobadas.filter((n) => n.tipo === 'credito').reduce((s, n) => s + n.total, 0);
  const totalDebito = aprobadas.filter((n) => n.tipo === 'debito').reduce((s, n) => s + n.total, 0);

  async function descargarXml(n: NotaConFactura) {
    try {
      const xml = n.id ? await obtenerXmlNota(n.tipo, n.id) : null;
      if (!xml) { toast.error('Esta nota no tiene XML guardado'); return; }
      descargarTexto(xml, `${n.numeroNota}.xml`, 'application/xml');
    } catch (e: any) {
      toast.error(e?.message || 'No se pudo descargar el XML');
    }
  }

  async function verFactura(n: NotaConFactura) {
    setAbriendoFactura(true);
    try {
      const f = await obtenerFacturaPorId(n.facturaId);
      if (!f) { toast.error('No se encontró la factura'); return; }
      setFacturaVista(f);
    } catch (e: any) {
      toast.error(e?.message || 'No se pudo abrir la factura');
    } finally {
      setAbriendoFactura(false);
    }
  }

  async function copiar(texto: string, que: string) {
    try { await navigator.clipboard.writeText(texto); toast.success(`${que} copiado`); } catch { toast.error('No se pudo copiar'); }
  }

  return (
    <div className="space-y-4">
      <div className="bg-slate-900/70 backdrop-blur border border-slate-800 rounded-2xl p-4 flex flex-wrap items-end gap-3">
        <label className="space-y-1">
          <span className="block text-slate-400 text-xs">Desde</span>
          <input type="date" value={filtros.desde} max={filtros.hasta || undefined} onChange={(e) => setFiltros((f) => ({ ...f, desde: e.target.value }))} className={campo} />
        </label>
        <label className="space-y-1">
          <span className="block text-slate-400 text-xs">Hasta</span>
          <input type="date" value={filtros.hasta} min={filtros.desde || undefined} onChange={(e) => setFiltros((f) => ({ ...f, hasta: e.target.value }))} className={campo} />
        </label>
        <label className="space-y-1 flex-1 min-w-[180px]">
          <span className="block text-slate-400 text-xs">Nota, factura, cliente o NIT</span>
          <span className="relative block">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
            <input value={filtros.texto} onChange={(e) => setFiltros((f) => ({ ...f, texto: e.target.value }))} placeholder="Buscar..." className={`${campo} w-full pl-9`} />
          </span>
        </label>
        <label className="space-y-1">
          <span className="block text-slate-400 text-xs">Tipo</span>
          <select value={filtros.tipo} onChange={(e) => setFiltros((f) => ({ ...f, tipo: e.target.value as '' | TipoNotaAjuste }))} className={campo}>
            <option value="">Crédito y débito</option>
            <option value="credito">Notas crédito</option>
            <option value="debito">Notas débito</option>
          </select>
        </label>
        <label className="space-y-1">
          <span className="block text-slate-400 text-xs">Estado DIAN</span>
          <select value={filtros.estado} onChange={(e) => setFiltros((f) => ({ ...f, estado: e.target.value as typeof filtros.estado }))} className={campo}>
            <option value="">Todos</option>
            <option value="aprobado">Aprobado</option>
            <option value="pendiente">Pendiente</option>
            <option value="rechazado">Rechazado</option>
          </select>
        </label>
        <button onClick={cargar} className="h-10 px-3 rounded-lg bg-slate-800 text-slate-300 text-sm font-semibold flex items-center gap-2" title="Actualizar">
          <RefreshCw className={`w-4 h-4 ${cargando ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <p className="text-slate-500 text-xs px-1">
        Para hacer una nota nueva: en Facturas de venta, botón de nota en la columna Acciones, o desde Ventas con Devolver o anular (también devuelve el inventario).
      </p>

      <div className="bg-slate-900/70 backdrop-blur border border-slate-800 rounded-2xl overflow-hidden">
        {cargando ? (
          <p className="text-center py-12 text-slate-500 text-sm">Cargando...</p>
        ) : visibles.length === 0 ? (
          <p className="text-center py-12 text-slate-500 text-sm px-4">
            {notas.length === 0 ? 'Todavía no hay notas crédito ni débito.' : 'Ninguna nota coincide con los filtros.'}
          </p>
        ) : (
          <>
            {/* Celular: tarjetas */}
            <div className="sm:hidden">
              {visibles.map((n) => (
                <button key={`${n.tipo}-${n.id}`} onClick={() => setNotaVista(n)} className="w-full text-left px-4 py-3 space-y-1.5 border-t border-slate-800 first:border-t-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono font-semibold text-white">{n.numeroNota}</span>
                    <span className="font-mono text-white">{money(n.total)}</span>
                  </div>
                  <p className="text-xs text-slate-400 truncate">
                    {fecha(n.fechaEmision)} · Factura {n.factura?.numeroFactura || ''} · {n.factura?.clienteNombre || ''}
                  </p>
                  <div className="flex flex-wrap gap-1.5"><ChipTipo tipo={n.tipo} /><ChipEstado estado={n.estado} /></div>
                </button>
              ))}
            </div>
            {/* Computador: tabla */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-950/60 text-slate-400 text-xs uppercase tracking-wide">
                  <tr>
                    <th className="text-left px-3 py-3 font-bold">Fecha</th>
                    <th className="text-left px-3 py-3 font-bold">Nota</th>
                    <th className="text-left px-3 py-3 font-bold">Tipo</th>
                    <th className="text-left px-3 py-3 font-bold">Factura afectada</th>
                    <th className="text-left px-3 py-3 font-bold">Concepto</th>
                    <th className="text-right px-3 py-3 font-bold">Valor</th>
                    <th className="text-left px-3 py-3 font-bold">Estado DIAN</th>
                  </tr>
                </thead>
                <tbody>
                  {visibles.map((n) => (
                    <tr key={`${n.tipo}-${n.id}`} onClick={() => setNotaVista(n)} className="text-slate-300 border-t border-slate-800 cursor-pointer hover:bg-slate-900">
                      <td className="px-3 py-3 whitespace-nowrap text-slate-400">{fecha(n.fechaEmision)}</td>
                      <td className="px-3 py-3 font-mono font-semibold text-white">{n.numeroNota}</td>
                      <td className="px-3 py-3"><ChipTipo tipo={n.tipo} /></td>
                      <td className="px-3 py-3">
                        <p className="font-mono text-white">{n.factura?.numeroFactura || ''}</p>
                        <p className="text-xs text-slate-500 truncate max-w-[200px]">{n.factura?.clienteNombre || ''}</p>
                      </td>
                      <td className="px-3 py-3 text-xs text-slate-400 max-w-[200px]">{conceptoNota(n.tipo, n.conceptoCodigo)}</td>
                      <td className="px-3 py-3 text-right font-mono text-white whitespace-nowrap">{money(n.total)}</td>
                      <td className="px-3 py-3"><ChipEstado estado={n.estado} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-3 py-3 border-t border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
              <span>{visibles.length} {visibles.length === 1 ? 'nota' : 'notas'}</span>
              <span>
                Aprobadas: crédito <span className="font-mono font-bold text-white">{money(totalCredito)}</span>
                {' · '}débito <span className="font-mono font-bold text-white">{money(totalDebito)}</span>
              </span>
            </div>
          </>
        )}
      </div>

      {notaVista && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setNotaVista(null)}>
          <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto bg-slate-950 border border-slate-800 rounded-2xl p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1.5">
                <p className="font-bold text-white text-lg font-mono">{notaVista.numeroNota}</p>
                <div className="flex flex-wrap gap-1.5"><ChipTipo tipo={notaVista.tipo} /><ChipEstado estado={notaVista.estado} /></div>
              </div>
              <button onClick={() => setNotaVista(null)} className="text-slate-400" aria-label="Cerrar"><X className="w-5 h-5" /></button>
            </div>

            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              <dt className="text-slate-500">Fecha</dt>
              <dd className="text-white">{fechaHora(notaVista.fechaEmision)}</dd>
              <dt className="text-slate-500">Factura</dt>
              <dd className="text-white font-mono">{notaVista.factura?.numeroFactura || ''}{notaVista.factura ? ` (${money(notaVista.factura.total)})` : ''}</dd>
              <dt className="text-slate-500">Cliente</dt>
              <dd className="text-white">{notaVista.factura?.clienteNombre || ''}<span className="block text-xs text-slate-500 font-mono">{notaVista.factura?.clienteNit || ''}</span></dd>
              <dt className="text-slate-500">Concepto</dt>
              <dd className="text-white">{conceptoNota(notaVista.tipo, notaVista.conceptoCodigo)}</dd>
              <dt className="text-slate-500">Motivo</dt>
              <dd className="text-white">{notaVista.motivo}</dd>
            </dl>

            <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 space-y-2">
              <p className="text-xs text-slate-500 uppercase tracking-wide font-bold">Productos</p>
              {notaVista.items && notaVista.items.length > 0 ? (
                <div className="space-y-1">
                  {notaVista.items.map((it, i) => (
                    <div key={i} className="flex justify-between gap-3 text-xs">
                      <span className="text-slate-300">{it.cantidad} × {it.descripcion}</span>
                      <span className="font-mono text-white whitespace-nowrap">{money(it.subtotal)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-400">Toda la factura {notaVista.factura?.numeroFactura || ''}.</p>
              )}
              <div className="border-t border-slate-800 pt-2 space-y-1 text-sm">
                {notaVista.subtotal != null && (
                  <div className="flex justify-between"><span className="text-slate-400">Subtotal</span><span className="font-mono text-white">{money(notaVista.subtotal)}</span></div>
                )}
                <div className="flex justify-between"><span className="text-slate-400">IVA</span><span className="font-mono text-white">{money(notaVista.totalImpuestos || 0)}</span></div>
                <div className="flex justify-between font-bold"><span className="text-white">Total de la nota</span><span className="font-mono text-white">{money(notaVista.total)}</span></div>
              </div>
            </div>

            {notaVista.cude && (
              <div className="space-y-1">
                <p className="text-xs text-slate-500 uppercase tracking-wide font-bold">CUDE</p>
                <button onClick={() => copiar(notaVista.cude!, 'CUDE')} className="w-full text-left text-[11px] font-mono text-slate-400 break-all bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 flex gap-2">
                  <span className="flex-1">{notaVista.cude}</span><Copy className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                </button>
              </div>
            )}

            {mensajesDian(notaVista.respuestaDian).length > 0 && (
              <div className="space-y-1">
                <p className="text-xs text-slate-500 uppercase tracking-wide font-bold">Respuesta de la DIAN</p>
                <div className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 space-y-1">
                  {mensajesDian(notaVista.respuestaDian).map((m) => (
                    <p key={m} className={`text-xs ${/rechazo/i.test(m) ? 'text-red-400' : 'text-slate-400'}`}>{m}</p>
                  ))}
                </div>
              </div>
            )}

            <div className="flex flex-wrap gap-2 pt-1">
              <button onClick={() => verFactura(notaVista)} disabled={abriendoFactura} className="flex-1 min-w-[140px] h-10 rounded-lg bg-amber-500 text-slate-950 text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50">
                {abriendoFactura ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />} Ver factura
              </button>
              <button onClick={() => descargarXml(notaVista)} className="flex-1 min-w-[140px] h-10 rounded-lg bg-slate-800 text-slate-300 text-sm font-semibold flex items-center justify-center gap-2">
                <Download className="w-4 h-4" /> XML de la nota
              </button>
            </div>
          </div>
        </div>
      )}

      <ModalVistaFactura
        abierta={!!facturaVista}
        onCerrar={() => setFacturaVista(null)}
        titulo={facturaVista?.numeroFactura || ''}
        obtenerDatos={() => datosPdfFacturaDianCompletos(facturaVista!)}
      />
    </div>
  );
}
