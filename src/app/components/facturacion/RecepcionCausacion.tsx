/**
 * Recepción y Causación — réplica de la sección «Documentos electrónicos /
 * DIAN» de Codec Document dentro del módulo de Facturación.
 *
 * Flujo: se arrastran XML (o un ZIP con XML dentro) → el motor los analiza
 * en el navegador → quedan guardados con su estado → cada compra se causa
 * (gasto + proveedor + inventario) con un clic.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  UploadCloud, FileSpreadsheet, FileDown, Search, Loader2, AlertTriangle, CheckCircle2,
  XCircle, Eye, Undo2, Trash2, X, BookCheck,
} from 'lucide-react';
import { leerArchivosDian } from '../../lib/dian/recepcion/archivos';
import {
  guardarDocumentosLeidos, listarDocumentosElectronicos, revertirCausacionDocumento,
  eliminarDocumentoElectronico, obtenerDocumentoElectronico,
  type DocumentoElectronico, type EstadoDocumentoElectronico,
} from '../../lib/supabase/documentosElectronicosService';
import { ModalCausar } from './ModalCausar';
import { ETIQUETA_TIPO_DOCUMENTO, descargarTexto, fechaCorta, money, type OperadorFacturacion } from './comunes';

const ESTADO_UI: Record<EstadoDocumentoElectronico, { label: string; className: string; Icon: typeof CheckCircle2 }> = {
  procesado: { label: 'Procesado', className: 'bg-emerald-500/15 text-emerald-400', Icon: CheckCircle2 },
  revision: { label: 'Requiere revisión', className: 'bg-amber-500/15 text-amber-400', Icon: AlertTriangle },
  invalido: { label: 'No se pudo leer', className: 'bg-red-500/15 text-red-400', Icon: XCircle },
};

type FiltroEstado = '' | EstadoDocumentoElectronico | 'por_causar' | 'causado';

const TIPOS_CAUSABLES = new Set(['factura', 'documento_equivalente', 'documento_soporte', 'nota_debito']);
const esCausable = (d: DocumentoElectronico) =>
  !d.causado && d.estado !== 'invalido' && d.direccion !== 'emitido' && TIPOS_CAUSABLES.has(d.tipo);

const campo = 'h-10 px-3 rounded-lg bg-slate-900 border border-slate-800 text-white text-sm';

interface Props {
  clienteId: string;
  operador: OperadorFacturacion;
  /** NIT del perfil fiscal del negocio: decide si un XML es recibido o emitido. */
  nitPropio: string;
  /** La tienda se está viendo en modo solo lectura (multi-tienda). */
  soloLectura?: boolean;
}

export function RecepcionCausacion({ clienteId, operador, nitPropio, soloLectura }: Props) {
  const [documentos, setDocumentos] = useState<DocumentoElectronico[]>([]);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [progreso, setProgreso] = useState<{ hechos: number; total: number } | null>(null);
  const [arrastrando, setArrastrando] = useState(false);
  const [filtros, setFiltros] = useState({ texto: '', estado: '' as FiltroEstado, desde: '', hasta: '' });
  const [detalle, setDetalle] = useState<DocumentoElectronico | null>(null);
  const [aCausar, setACausar] = useState<DocumentoElectronico | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function cargar() {
    setCargando(true);
    setErrorCarga(null);
    try {
      setDocumentos(await listarDocumentosElectronicos({ clienteId }));
    } catch (e: any) {
      setErrorCarga(e?.message || 'No se pudieron cargar los documentos');
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clienteId]);

  async function procesar(archivos: File[]) {
    if (archivos.length === 0 || progreso) return;
    setProgreso({ hechos: 0, total: 0 });
    try {
      const lectura = await leerArchivosDian(archivos, (hechos, total) => setProgreso({ hechos, total }));
      for (const err of lectura.errores) toast.error(err.nombre, { description: err.mensaje });
      if (lectura.documentos.length === 0) return;

      const resumen = await guardarDocumentosLeidos(lectura.documentos, { clienteId, empleadoId: operador.id, nitPropio });
      const partes = [
        `${resumen.nuevos} ${resumen.nuevos === 1 ? 'nuevo' : 'nuevos'}`,
        resumen.duplicados > 0 && `${resumen.duplicados} ya estaban cargados`,
        resumen.enRevision > 0 && `${resumen.enRevision} por revisar`,
        resumen.invalidos > 0 && `${resumen.invalidos} no se pudieron leer`,
      ].filter(Boolean).join(' · ');
      if (resumen.fallidos.length > 0) {
        toast.error(`${resumen.fallidos.length} documentos no se guardaron`, { description: resumen.fallidos[0].mensaje });
      }
      toast.success('Análisis terminado', { description: partes });
      await cargar();
    } catch (e: any) {
      toast.error('No se pudieron procesar los archivos', { description: e?.message });
    } finally {
      setProgreso(null);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  const visibles = useMemo(() => {
    const texto = filtros.texto.trim().toLowerCase();
    return documentos.filter((d) => {
      if (filtros.estado === 'por_causar' && !esCausable(d)) return false;
      if (filtros.estado === 'causado' && !d.causado) return false;
      if (['procesado', 'revision', 'invalido'].includes(filtros.estado) && d.estado !== filtros.estado) return false;
      if (filtros.desde && (!d.fechaEmision || d.fechaEmision < filtros.desde)) return false;
      if (filtros.hasta && (!d.fechaEmision || d.fechaEmision > filtros.hasta)) return false;
      if (!texto) return true;
      return [d.numeroCompleto, d.emisorNombre, d.emisorNit, d.nombreArchivo]
        .some((v) => (v || '').toLowerCase().includes(texto));
    });
  }, [documentos, filtros]);

  const totales = useMemo(() => visibles.reduce(
    (a, d) => ({ subtotal: a.subtotal + d.subtotal, iva: a.iva + d.totalIva, total: a.total + d.total }),
    { subtotal: 0, iva: 0, total: 0 },
  ), [visibles]);

  const porCausar = documentos.filter(esCausable).length;

  function filasExportables() {
    return visibles.map((d) => ({
      Tipo: ETIQUETA_TIPO_DOCUMENTO[d.tipo] || d.tipo,
      'Número': d.numeroCompleto || '',
      Fecha: d.fechaEmision || '',
      'NIT proveedor': d.emisorNit || '',
      Proveedor: d.emisorNombre || '',
      Subtotal: d.subtotal,
      IVA: d.totalIva,
      INC: d.totalInc,
      Retenciones: d.totalRetenciones,
      Total: d.total,
      Estado: ESTADO_UI[d.estado].label,
      Causado: d.causado ? 'Sí' : 'No',
      CUFE: d.cufe || '',
    }));
  }

  async function exportarExcel() {
    // SheetJS pesa: se carga solo cuando alguien exporta.
    const XLSX = await import('xlsx');
    const hoja = XLSX.utils.json_to_sheet(filasExportables());
    hoja['!cols'] = [14, 16, 12, 14, 36, 14, 12, 12, 12, 14, 18, 9, 40].map((wch) => ({ wch }));
    const libro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(libro, hoja, 'Documentos');
    XLSX.writeFile(libro, `documentos-electronicos-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  function exportarCsv() {
    const filas = filasExportables();
    if (filas.length === 0) return;
    const celda = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lineas = [Object.keys(filas[0]).map(celda).join(';'), ...filas.map((f) => Object.values(f).map(celda).join(';'))];
    // BOM + punto y coma: así Excel en español lo abre con tildes y columnas bien.
    descargarTexto('﻿' + lineas.join('\r\n'), `documentos-electronicos-${new Date().toISOString().slice(0, 10)}.csv`, 'text/csv;charset=utf-8');
  }

  async function revertir(d: DocumentoElectronico) {
    if (!window.confirm(`¿Revertir la causación de ${d.numeroCompleto}? Se elimina el gasto y se descuenta del inventario lo que se había sumado.`)) return;
    try {
      await revertirCausacionDocumento(d.id);
      toast.success('Causación revertida');
      setDetalle(null);
      cargar();
    } catch (e: any) {
      toast.error(e?.message || 'No se pudo revertir');
    }
  }

  async function eliminar(d: DocumentoElectronico) {
    if (!window.confirm(`¿Quitar ${d.numeroCompleto || d.nombreArchivo} de la lista? El XML se puede volver a subir después.`)) return;
    try {
      await eliminarDocumentoElectronico(d.id);
      setDetalle(null);
      cargar();
    } catch (e: any) {
      toast.error(e?.message || 'No se pudo eliminar');
    }
  }

  async function descargarXml(d: DocumentoElectronico) {
    const completo = await obtenerDocumentoElectronico(d.id);
    if (!completo?.xml) { toast.error('No se encontró el XML de este documento'); return; }
    descargarTexto(completo.xml, d.nombreArchivo || `${d.numeroCompleto || 'documento'}.xml`, 'application/xml');
  }

  return (
    <div className="space-y-4">
      {/* Zona de carga */}
      {!soloLectura && (
        <div
          onDragOver={(e) => { e.preventDefault(); setArrastrando(true); }}
          onDragLeave={() => setArrastrando(false)}
          onDrop={(e) => { e.preventDefault(); setArrastrando(false); procesar(Array.from(e.dataTransfer.files)); }}
          className={`rounded-2xl border-2 border-dashed p-6 text-center transition-colors ${arrastrando ? 'border-amber-500 bg-amber-500/10' : 'border-slate-700 bg-slate-900/50'}`}
        >
          <input ref={inputRef} type="file" accept=".xml,.zip" multiple hidden onChange={(e) => procesar(Array.from(e.target.files || []))} />
          {progreso ? (
            <div className="flex flex-col items-center gap-2 py-2">
              <Loader2 className="w-7 h-7 text-amber-400 animate-spin" />
              <p className="text-white font-semibold text-sm">
                {progreso.total > 0 ? `Analizando ${progreso.hechos} de ${progreso.total} documentos...` : 'Abriendo archivos...'}
              </p>
            </div>
          ) : (
            <>
              <UploadCloud className="w-8 h-8 text-amber-400 mx-auto mb-2" />
              <p className="text-white font-bold">Arrastra aquí los XML de tus facturas</p>
              <p className="text-slate-400 text-sm mt-1">Archivos .xml sueltos o un .zip con los XML dentro (como lo entrega la DIAN o tu proveedor)</p>
              <button onClick={() => inputRef.current?.click()} className="mt-3 h-10 px-4 rounded-lg bg-amber-500 text-slate-950 text-sm font-bold">
                Seleccionar archivos
              </button>
            </>
          )}
        </div>
      )}

      {/* Filtros y exportación */}
      <div className="bg-slate-900/70 backdrop-blur border border-slate-800 rounded-2xl p-4 flex flex-wrap items-end gap-3">
        <label className="space-y-1 flex-1 min-w-[180px]">
          <span className="block text-slate-400 text-xs">Número, proveedor o NIT</span>
          <span className="relative block">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
            <input value={filtros.texto} onChange={(e) => setFiltros((f) => ({ ...f, texto: e.target.value }))} placeholder="Buscar..." className={`${campo} w-full pl-9`} />
          </span>
        </label>
        <label className="space-y-1">
          <span className="block text-slate-400 text-xs">Estado</span>
          <select value={filtros.estado} onChange={(e) => setFiltros((f) => ({ ...f, estado: e.target.value as FiltroEstado }))} className={campo}>
            <option value="">Todos</option>
            <option value="por_causar">Por causar{porCausar > 0 ? ` (${porCausar})` : ''}</option>
            <option value="causado">Causados</option>
            <option value="revision">Requiere revisión</option>
            <option value="procesado">Procesado</option>
            <option value="invalido">No se pudo leer</option>
          </select>
        </label>
        <label className="space-y-1">
          <span className="block text-slate-400 text-xs">Desde</span>
          <input type="date" value={filtros.desde} onChange={(e) => setFiltros((f) => ({ ...f, desde: e.target.value }))} className={campo} />
        </label>
        <label className="space-y-1">
          <span className="block text-slate-400 text-xs">Hasta</span>
          <input type="date" value={filtros.hasta} onChange={(e) => setFiltros((f) => ({ ...f, hasta: e.target.value }))} className={campo} />
        </label>
        <div className="flex gap-2">
          <button onClick={exportarExcel} disabled={visibles.length === 0} className="h-10 px-3 rounded-lg bg-emerald-600/20 text-emerald-400 text-sm font-semibold flex items-center gap-1.5 disabled:opacity-40">
            <FileSpreadsheet className="w-4 h-4" /> Excel
          </button>
          <button onClick={exportarCsv} disabled={visibles.length === 0} className="h-10 px-3 rounded-lg bg-slate-800 text-slate-300 text-sm font-semibold flex items-center gap-1.5 disabled:opacity-40">
            <FileDown className="w-4 h-4" /> CSV
          </button>
        </div>
      </div>

      {/* Tabla */}
      <div className="bg-slate-900/70 backdrop-blur border border-slate-800 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-950/60 text-slate-400 text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left px-3 py-3 font-bold">Tipo</th>
                <th className="text-left px-3 py-3 font-bold">Número</th>
                <th className="text-left px-3 py-3 font-bold">Fecha</th>
                <th className="text-left px-3 py-3 font-bold">Proveedor</th>
                <th className="text-right px-3 py-3 font-bold">Subtotal</th>
                <th className="text-right px-3 py-3 font-bold">IVA</th>
                <th className="text-right px-3 py-3 font-bold">Total</th>
                <th className="text-left px-3 py-3 font-bold">Estado</th>
                <th className="text-right px-3 py-3 font-bold">Acción</th>
              </tr>
            </thead>
            <tbody>
              {cargando ? (
                <tr><td colSpan={9} className="text-center py-12 text-slate-500">Cargando...</td></tr>
              ) : errorCarga ? (
                <tr><td colSpan={9} className="text-center py-12 text-red-400 px-4">{errorCarga}</td></tr>
              ) : visibles.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center py-12 text-slate-500">
                    {documentos.length === 0 ? 'Todavía no has cargado ningún XML.' : 'Ningún documento coincide con los filtros.'}
                  </td>
                </tr>
              ) : visibles.map((d) => {
                const info = ESTADO_UI[d.estado];
                return (
                  <tr key={d.id} className="text-slate-300 border-t border-slate-800">
                    <td className="px-3 py-3 whitespace-nowrap">
                      {ETIQUETA_TIPO_DOCUMENTO[d.tipo] || d.tipo}
                      {d.direccion === 'emitido' && <span className="block text-[10px] text-sky-400 font-bold uppercase">Emitido por ti</span>}
                    </td>
                    <td className="px-3 py-3 font-mono font-semibold text-white whitespace-nowrap">{d.numeroCompleto || '—'}</td>
                    <td className="px-3 py-3 text-slate-400 whitespace-nowrap">{fechaCorta(d.fechaEmision)}</td>
                    <td className="px-3 py-3">
                      <p className="text-white truncate max-w-[180px]">{d.emisorNombre || d.nombreArchivo || '—'}</p>
                      {d.emisorNit && <p className="text-xs text-slate-500 font-mono">{d.emisorNit}</p>}
                    </td>
                    <td className="px-3 py-3 text-right font-mono whitespace-nowrap">{money(d.subtotal)}</td>
                    <td className="px-3 py-3 text-right font-mono whitespace-nowrap">{money(d.totalIva)}</td>
                    <td className="px-3 py-3 text-right font-mono text-white whitespace-nowrap">{money(d.total)}</td>
                    <td className="px-3 py-3">
                      {d.causado ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold whitespace-nowrap bg-sky-500/15 text-sky-400">
                          <BookCheck className="w-3 h-3" /> Causado
                        </span>
                      ) : (
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold whitespace-nowrap ${info.className}`}>
                          <info.Icon className="w-3 h-3" /> {info.label}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center justify-end gap-1.5">
                        {esCausable(d) && !soloLectura && (
                          <button onClick={() => setACausar(d)} className="h-8 px-3 rounded-lg bg-amber-500 text-slate-950 text-xs font-bold whitespace-nowrap">
                            Causar
                          </button>
                        )}
                        <button onClick={() => setDetalle(d)} title="Ver detalle" className="h-8 w-8 rounded-lg bg-slate-800 text-slate-300 flex items-center justify-center">
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!cargando && visibles.length > 0 && (
          <div className="px-3 py-3 border-t border-slate-800 flex flex-wrap items-center justify-between gap-x-6 gap-y-1 text-xs text-slate-400">
            <span>{visibles.length} {visibles.length === 1 ? 'documento' : 'documentos'}</span>
            <span className="flex flex-wrap gap-x-5">
              <span>Subtotal <span className="font-mono font-bold text-white">{money(totales.subtotal)}</span></span>
              <span>IVA <span className="font-mono font-bold text-white">{money(totales.iva)}</span></span>
              <span>Total <span className="font-mono font-bold text-white">{money(totales.total)}</span></span>
            </span>
          </div>
        )}
      </div>

      {/* Detalle */}
      {detalle && (
        <div className="fixed inset-0 z-50 bg-black/70 flex justify-end" onClick={() => setDetalle(null)}>
          <div className="w-full max-w-lg h-full overflow-y-auto bg-slate-950 border-l border-slate-800 p-5 space-y-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs text-slate-500 uppercase tracking-wide font-bold">{ETIQUETA_TIPO_DOCUMENTO[detalle.tipo] || detalle.tipo}</p>
                <p className="text-white text-xl font-black font-mono truncate">{detalle.numeroCompleto || detalle.nombreArchivo}</p>
                <p className="text-slate-400 text-sm">{fechaCorta(detalle.fechaEmision)}{detalle.validadoDian && ' · Validado por la DIAN'}</p>
              </div>
              <button onClick={() => setDetalle(null)} className="text-slate-400 shrink-0" aria-label="Cerrar"><X className="w-5 h-5" /></button>
            </div>

            {detalle.excepciones.length > 0 && (
              <div className="space-y-2">
                {detalle.excepciones.map((ex, i) => (
                  <div key={i} className={`rounded-xl px-3 py-2 text-xs ${ex.severidad === 'error' ? 'bg-red-500/15 text-red-400' : 'bg-amber-500/15 text-amber-400'}`}>
                    <p className="font-semibold">{ex.mensaje}</p>
                    {(ex.esperado || ex.encontrado) && (
                      <p className="font-mono mt-0.5">
                        {ex.esperado && `Declarado: ${ex.esperado}`}{ex.esperado && ex.encontrado && ' · '}{ex.encontrado && `Calculado: ${ex.encontrado}`}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}

            <section>
              <p className="text-xs text-slate-500 uppercase tracking-wide font-bold mb-1">Proveedor</p>
              <p className="text-white font-semibold">{detalle.emisorNombre || '—'}</p>
              <p className="text-slate-400 text-sm font-mono">NIT {detalle.emisorNit || '—'}</p>
            </section>

            <section>
              <p className="text-xs text-slate-500 uppercase tracking-wide font-bold mb-1">Comprador</p>
              <p className="text-white font-semibold">{detalle.receptorNombre || '—'}</p>
              <p className="text-slate-400 text-sm font-mono">NIT / CC {detalle.receptorNit || '—'}</p>
            </section>

            <section>
              <p className="text-xs text-slate-500 uppercase tracking-wide font-bold mb-2">Ítems ({detalle.lineas.length})</p>
              <div className="space-y-1.5">
                {detalle.lineas.map((l) => (
                  <div key={l.numero} className="flex items-start justify-between gap-3 text-sm bg-slate-900 border border-slate-800 rounded-lg px-3 py-2">
                    <div className="min-w-0">
                      <p className="text-white">{l.descripcion || `Línea ${l.numero}`}</p>
                      <p className="text-xs text-slate-500 font-mono">{l.cantidad} {l.unidadMedida} × {money(l.precioUnitario)}</p>
                    </div>
                    <p className="font-mono text-white shrink-0">{money(l.valorBruto)}</p>
                  </div>
                ))}
              </div>
            </section>

            <section>
              <p className="text-xs text-slate-500 uppercase tracking-wide font-bold mb-1">Impuestos y totales</p>
              <div className="text-sm space-y-0.5">
                <Fila label="Subtotal" valor={money(detalle.subtotal)} />
                {detalle.impuestos.filter((i) => i.alcance === 'documento' || detalle.impuestos.every((x) => x.alcance === 'linea')).map((i, idx) => (
                  <Fila key={idx} label={`${i.esRetencion ? 'Retención ' : ''}${i.nombre} ${i.tarifa}%`} valor={`${i.esRetencion ? '−' : ''}${money(i.valor)}`} />
                ))}
                <div className="flex justify-between pt-2 mt-1 border-t border-slate-800 font-black text-white text-base">
                  <span>Total</span><span className="font-mono">{money(detalle.total)}</span>
                </div>
              </div>
            </section>

            {detalle.cufe && (
              <section>
                <p className="text-xs text-slate-500 uppercase tracking-wide font-bold mb-1">CUFE / CUDE</p>
                <p className="text-slate-400 text-xs font-mono break-all">{detalle.cufe}</p>
              </section>
            )}

            {detalle.causado && (
              <div className="rounded-xl bg-sky-500/15 text-sky-400 px-3 py-2 text-xs">
                Causado{detalle.causadoAt && ` el ${new Date(detalle.causadoAt).toLocaleString('es-CO')}`}{detalle.causadoPorNombre && ` por ${detalle.causadoPorNombre}`}.
              </div>
            )}

            <div className="flex flex-wrap gap-2 pb-4">
              {esCausable(detalle) && !soloLectura && (
                <button onClick={() => { setACausar(detalle); setDetalle(null); }} className="h-10 px-4 rounded-lg bg-amber-500 text-slate-950 text-sm font-bold">Causar</button>
              )}
              <button onClick={() => descargarXml(detalle)} className="h-10 px-4 rounded-lg bg-slate-800 text-slate-300 text-sm font-semibold flex items-center gap-1.5">
                <FileDown className="w-4 h-4" /> XML
              </button>
              {detalle.causado && !soloLectura && (
                <button onClick={() => revertir(detalle)} className="h-10 px-4 rounded-lg bg-slate-800 text-slate-300 text-sm font-semibold flex items-center gap-1.5">
                  <Undo2 className="w-4 h-4" /> Revertir causación
                </button>
              )}
              {!detalle.causado && !soloLectura && (
                <button onClick={() => eliminar(detalle)} className="h-10 px-4 rounded-lg bg-red-500/15 text-red-400 text-sm font-semibold flex items-center gap-1.5">
                  <Trash2 className="w-4 h-4" /> Quitar
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {aCausar && (
        <ModalCausar
          documento={aCausar}
          clienteId={clienteId}
          operador={operador}
          onCerrar={() => setACausar(null)}
          onCausado={() => { setACausar(null); cargar(); }}
        />
      )}
    </div>
  );
}

function Fila({ label, valor }: { label: string; valor: string }) {
  return (
    <div className="flex justify-between text-slate-300">
      <span className="text-slate-400">{label}</span><span className="font-mono">{valor}</span>
    </div>
  );
}
