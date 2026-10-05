/**
 * Vista previa de una factura dentro de la app (el ojo de Ventas), igual en
 * Electron, en la web y en el celular. Muestra el mismo PDF que se imprime y
 * se comparte (pdfGenerator.ts), dibujado con pdf.js, así que lo que ve el
 * cajero es exactamente lo que recibe el cliente.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Download, Loader2, Printer, RotateCw, Share2, X } from 'lucide-react';
import { toast } from 'sonner';
import { generarFacturaPDF, nombreArchivoFactura, type ConfigEmpresa, type Venta as VentaFactura } from '../../lib/pdfGenerator';
import { pdfAPaginas } from '../../lib/pdfVista';
import { compartirPdf, descargarPdf, imprimirPdf, puedeCompartirPdf } from '../../lib/archivoPdf';

export interface DatosFactura {
  venta: VentaFactura;
  config: ConfigEmpresa;
}

interface Props {
  abierta: boolean;
  onCerrar: () => void;
  /** Número que se muestra arriba mientras carga (FE003998). */
  titulo: string;
  obtenerDatos: () => Promise<DatosFactura>;
  /** Electron imprime con sus impresoras configuradas; si no se pasa, se imprime el PDF. */
  onImprimir?: () => void;
}

type Estado = { tipo: 'cargando' } | { tipo: 'listo' } | { tipo: 'sin-visor'; url: string } | { tipo: 'error'; mensaje: string };

export function ModalVistaFactura({ abierta, onCerrar, titulo, obtenerDatos, onImprimir }: Props) {
  const [estado, setEstado] = useState<Estado>({ tipo: 'cargando' });
  const [ocupado, setOcupado] = useState<'imprimir' | 'compartir' | null>(null);
  const [intento, setIntento] = useState(0);
  const hojasRef = useRef<HTMLDivElement>(null);
  const pdfRef = useRef<{ blob: Blob; nombre: string; venta: VentaFactura; config: ConfigEmpresa } | null>(null);
  const obtenerRef = useRef(obtenerDatos);
  obtenerRef.current = obtenerDatos;

  useEffect(() => {
    if (!abierta) return;
    let cancelado = false;
    let urlRespaldo: string | null = null;
    pdfRef.current = null;
    setEstado({ tipo: 'cargando' });
    hojasRef.current?.replaceChildren();

    (async () => {
      let blob: Blob;
      try {
        const { venta, config } = await obtenerRef.current();
        blob = await generarFacturaPDF(venta, config);
        if (cancelado) return;
        pdfRef.current = { blob, nombre: nombreArchivoFactura(venta), venta, config };
      } catch (e) {
        if (!cancelado) setEstado({ tipo: 'error', mensaje: e instanceof Error ? e.message : 'No se pudo armar la factura' });
        return;
      }
      try {
        // La hoja se mide por el área visible (mientras carga está oculta y no tiene ancho).
        const ancho = Math.min(Math.max((hojasRef.current?.parentElement?.clientWidth || 800) - 24, 280), 860);
        const paginas = await pdfAPaginas(blob, ancho);
        if (cancelado || !hojasRef.current) return;
        paginas.forEach((c) => { c.className = 'bg-white shadow-xl rounded-sm'; });
        hojasRef.current.replaceChildren(...paginas);
        setEstado({ tipo: 'listo' });
      } catch (e) {
        console.warn('[factura] Vista con pdf.js no disponible, se usa el visor del navegador:', e);
        if (cancelado) return;
        urlRespaldo = URL.createObjectURL(blob);
        setEstado({ tipo: 'sin-visor', url: urlRespaldo });
      }
    })();

    return () => {
      cancelado = true;
      if (urlRespaldo) URL.revokeObjectURL(urlRespaldo);
    };
  }, [abierta, intento]);

  // Escape cierra y la página de atrás no se desplaza mientras el modal está abierto.
  useEffect(() => {
    if (!abierta) return;
    const alTeclear = (e: KeyboardEvent) => { if (e.key === 'Escape') onCerrar(); };
    const antes = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', alTeclear);
    return () => {
      document.body.style.overflow = antes;
      window.removeEventListener('keydown', alTeclear);
    };
  }, [abierta, onCerrar]);

  const imprimir = useCallback(async () => {
    if (onImprimir) return onImprimir();
    const pdf = pdfRef.current;
    if (!pdf) return;
    setOcupado('imprimir');
    try {
      await imprimirPdf(pdf.blob, pdf.nombre);
    } catch {
      toast.error('No se pudo imprimir. Prueba con Descargar.');
    } finally {
      setOcupado(null);
    }
  }, [onImprimir]);

  const compartir = useCallback(async () => {
    const pdf = pdfRef.current;
    if (!pdf) return;
    setOcupado('compartir');
    try {
      const texto = `Factura ${pdf.venta.numeroFactura} · ${pdf.config.nombreComercial} · Total: $${Math.round(pdf.venta.total).toLocaleString('es-CO')}`;
      if (!(await compartirPdf(pdf.blob, pdf.nombre, `Factura ${pdf.venta.numeroFactura}`, texto))) {
        descargarPdf(pdf.blob, pdf.nombre);
        toast.info('Este equipo no comparte archivos: la factura se descargó.');
      }
    } catch {
      toast.error('No se pudo compartir la factura');
    } finally {
      setOcupado(null);
    }
  }, []);

  const descargar = useCallback(() => {
    const pdf = pdfRef.current;
    if (pdf) descargarPdf(pdf.blob, pdf.nombre);
  }, []);

  if (!abierta) return null;

  const listo = estado.tipo === 'listo' || estado.tipo === 'sin-visor';
  const boton = 'h-10 px-4 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-colors disabled:opacity-40';

  return createPortal(
    <div
      className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-sm flex items-stretch sm:items-center justify-center sm:p-4"
      onClick={onCerrar}
      role="dialog"
      aria-modal="true"
      aria-label={`Factura ${titulo}`}
    >
      <div
        className="bg-slate-900 sm:border sm:border-slate-700 sm:rounded-2xl w-full sm:max-w-4xl h-full sm:h-[94vh] flex flex-col overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 px-4 h-14 border-b border-slate-800 shrink-0" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
          <div className="min-w-0">
            <p className="text-white font-bold truncate">Factura {titulo}</p>
            <p className="text-slate-500 text-xs">Vista previa de cómo la recibe el cliente</p>
          </div>
          <button onClick={onCerrar} className="h-9 w-9 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center shrink-0" aria-label="Cerrar">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-auto bg-slate-800/60 p-3 sm:p-6 overscroll-contain">
          <div ref={hojasRef} className={`mx-auto max-w-[860px] space-y-4 ${estado.tipo === 'listo' ? '' : 'hidden'}`} />
          {estado.tipo === 'cargando' && (
            <div className="h-full min-h-[40vh] flex flex-col items-center justify-center gap-3 text-slate-400">
              <Loader2 className="w-8 h-8 animate-spin text-amber-500" />
              <p className="text-sm">Preparando la factura...</p>
            </div>
          )}
          {estado.tipo === 'sin-visor' && (
            <iframe src={estado.url} title={`Factura ${titulo}`} className="w-full h-full min-h-[70vh] bg-white rounded-sm" />
          )}
          {estado.tipo === 'error' && (
            <div className="h-full min-h-[40vh] flex flex-col items-center justify-center gap-3 text-center px-6">
              <p className="text-red-400 text-sm">{estado.mensaje}</p>
              <button onClick={() => setIntento((n) => n + 1)} className={`${boton} bg-slate-700 hover:bg-slate-600 text-white`}>
                <RotateCw className="w-4 h-4" /> Reintentar
              </button>
            </div>
          )}
        </div>

        <div className="grid grid-cols-3 gap-2 p-3 border-t border-slate-800 shrink-0" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
          <button onClick={imprimir} disabled={!listo || !!ocupado} className={`${boton} bg-amber-500 hover:bg-amber-600 text-slate-950`}>
            {ocupado === 'imprimir' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />} Imprimir
          </button>
          {puedeCompartirPdf() ? (
            <button onClick={compartir} disabled={!listo || !!ocupado} className={`${boton} bg-emerald-600 hover:bg-emerald-700 text-white`}>
              {ocupado === 'compartir' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Share2 className="w-4 h-4" />} Compartir
            </button>
          ) : (
            <button onClick={onCerrar} className={`${boton} bg-slate-800 hover:bg-slate-700 text-slate-200`}>Cerrar</button>
          )}
          <button onClick={descargar} disabled={!listo} className={`${boton} bg-slate-700 hover:bg-slate-600 text-white`}>
            <Download className="w-4 h-4" /> Descargar
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
