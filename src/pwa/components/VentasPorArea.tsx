/**
 * "Ventas por área" del cierre de caja (web y Electron): total de cada área,
 * perros atendidos en peluquería, y una vista previa para ver, imprimir o
 * descargar el cierre completo, el consolidado o un área, en tirilla (58 u
 * 80 mm, como la impresora configurada) o en documento tamaño carta.
 * La plataforma le pasa lo vendido en el turno y cómo imprimir la tirilla.
 */
import { useMemo, useState } from 'react';
import { Printer, Layers, ChevronDown, ChevronUp, Dog, Eye, Download, X, FileText, Receipt, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  agruparPorArea, htmlRecibos, perrosAtendidos,
  type DatosRecibo, type ItemVendido, type LineaRecibo,
} from '../lib/ventasPorArea';
import { htmlDocumento, nombreArchivo, pdfDocumento, pdfTirilla, recibosDe, type SeleccionCierre } from '../lib/recibosPdf';
import { descargarPdf } from '../../app/lib/archivoPdf';

const pesos = (n: number) => `$${Math.round(Number(n) || 0).toLocaleString('es-CO')}`;

type Formato = 'tirilla58' | 'tirilla80' | 'documento';

interface Tema { tarjeta: string; texto: string; suave: string; area: string; boton: string; linea: string; hoja: string; chip: string; chipActivo: string }

/** Imprime un HTML con el diálogo de impresión del sistema (el documento tamaño carta). */
function imprimirHtmlSistema(html: string) {
  const marco = document.createElement('iframe');
  marco.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
  document.body.appendChild(marco);
  const doc = marco.contentWindow!.document;
  doc.open(); doc.write(html); doc.close();
  setTimeout(() => { marco.contentWindow?.focus(); marco.contentWindow?.print(); setTimeout(() => marco.remove(), 60_000); }, 300);
}

/** La tirilla como se ve en papel: cada recibo en su hoja blanca sobre fondo gris. */
function htmlVistaTirilla(recibos: LineaRecibo[][], ancho: 58 | 80, logo?: string) {
  return htmlRecibos(recibos, ancho, logo)
    .replace('<body>', '<body style="width:auto;margin:0;padding:18px 0;background:#e2e8f0;display:flex;flex-direction:column;align-items:center;gap:14px">')
    .replace(/class="recibo"/g, `class="recibo" style="width:${ancho}mm;background:#fff;padding:4mm 3mm 6mm;box-shadow:0 2px 8px rgba(0,0,0,.18)"`);
}

export function VentasPorArea({ items, datos, claro = false, imprimir, anchoPredeterminado = 80 }: {
  items: ItemVendido[];
  datos: DatosRecibo;
  /** Electron en modo claro; la web usa la paleta slate (themeClaro.css la repinta). */
  claro?: boolean;
  /** Imprime la tirilla en la impresora del negocio, al ancho indicado y con el logo del negocio. */
  imprimir: (recibos: LineaRecibo[][], ancho: 58 | 80, logo?: string) => Promise<boolean | void>;
  /** Ancho del papel de la impresora configurada en este equipo. */
  anchoPredeterminado?: 58 | 80;
}) {
  const { areas, total } = useMemo(() => agruparPorArea(items), [items]);
  const [abierta, setAbierta] = useState<string | null>(null);
  const [vista, setVista] = useState<SeleccionCierre | null>(null);

  const t: Tema = claro
    ? {
        tarjeta: 'bg-white border-2 border-gray-100 rounded-3xl shadow-sm', texto: 'text-gray-900', suave: 'text-gray-500',
        area: 'bg-gray-50 border border-gray-200', boton: 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-100', linea: 'border-gray-200',
        hoja: 'bg-white border border-gray-200', chip: 'bg-gray-50 border border-gray-200 text-gray-700', chipActivo: 'bg-emerald-50 border border-emerald-500 text-emerald-700',
      }
    : {
        tarjeta: 'bg-slate-900/70 border border-slate-800 rounded-2xl', texto: 'text-white', suave: 'text-slate-400',
        area: 'bg-slate-950/50 border border-slate-800', boton: 'bg-slate-950 border border-slate-800 text-slate-300', linea: 'border-slate-800',
        hoja: 'bg-slate-900 border border-slate-800', chip: 'bg-slate-950 border border-slate-800 text-slate-300', chipActivo: 'bg-emerald-500/15 border border-emerald-500 text-emerald-400',
      };

  if (areas.length === 0) return null;

  return (
    <div className={`${t.tarjeta} p-5 space-y-4`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className={`${t.texto} font-bold text-lg flex items-center gap-2`}><Layers className="w-5 h-5 text-emerald-500" /> Ventas por área</h3>
          <p className={`${t.suave} text-xs`}>Lo vendido en este turno, separado por área. Toca «Ver recibo» para verlo, imprimirlo o descargarlo.</p>
        </div>
        <div className="text-right">
          <p className={`${t.suave} text-xs`}>Total ventas del día</p>
          <p className="text-2xl font-black text-emerald-500">{pesos(total)}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
        {areas.map((a) => {
          const esPelu = a.area === 'peluqueria';
          const verDetalle = abierta === a.area;
          return (
            <div key={a.area} className={`${t.area} relative overflow-hidden rounded-2xl p-4 pl-5`}>
              {/* Franja del color del área (un div propio: el tema claro de la web repinta los bordes). */}
              <span className="absolute left-0 top-0 bottom-0 w-1.5" style={{ background: a.color }} />
              <p className={`${t.suave} text-xs font-bold uppercase tracking-wide`}>{a.nombre}</p>
              <p className={`${t.texto} text-xl font-black mt-0.5`}>{pesos(a.total)}</p>
              <p className={`${t.suave} text-xs flex items-center gap-1`}>
                {esPelu ? <><Dog className="w-3.5 h-3.5" /> {perrosAtendidos(a)} {perrosAtendidos(a) === 1 ? 'perro atendido' : 'perros atendidos'}</> : `${a.lineas} ${a.lineas === 1 ? 'venta' : 'ventas'}`}
              </p>
              <div className="flex gap-2 mt-3">
                <button onClick={() => setVista(a.area)} className={`flex-1 h-9 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 ${t.boton}`}>
                  <Receipt className="w-3.5 h-3.5" /> Ver recibo
                </button>
                <button onClick={() => setAbierta(verDetalle ? null : a.area)} className={`h-9 px-3 rounded-lg text-xs font-bold flex items-center gap-1 ${t.boton}`}
                  aria-label={verDetalle ? 'Ocultar detalle' : 'Ver detalle'}>
                  {verDetalle ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />} Detalle
                </button>
              </div>
              {verDetalle && (
                <div className={`mt-3 pt-2 border-t ${t.linea} max-h-56 overflow-y-auto space-y-1`}>
                  {a.items.map((it, i) => (
                    <div key={i} className="flex justify-between gap-2 text-xs">
                      <span className={`${t.texto} min-w-0 truncate`}>{Number.isInteger(it.cantidad) ? it.cantidad : `${it.cantidad.toFixed(2)} kg`} · {it.nombre}</span>
                      <span className={`${t.suave} shrink-0`}>{pesos(it.total)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <button onClick={() => setVista('consolidado')}
          className="w-full sm:flex-1 h-11 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-sm font-bold flex items-center justify-center gap-2" style={{ color: '#fff' }}>
          <Eye className="w-4 h-4" /> Ver consolidado
        </button>
        <button onClick={() => setVista('completo')} className={`w-full sm:flex-1 h-11 rounded-xl text-sm font-bold flex items-center justify-center gap-2 ${t.boton}`}>
          <FileText className="w-4 h-4" /> Ver cierre completo ({areas.length + 1} recibos)
        </button>
      </div>

      {vista && (
        <VistaPrevia t={t} areas={areas} total={total} datos={datos} inicial={vista} anchoPredeterminado={anchoPredeterminado}
          imprimir={imprimir} onCerrar={() => setVista(null)} />
      )}
    </div>
  );
}

function VistaPrevia({ t, areas, total, datos, inicial, anchoPredeterminado, imprimir, onCerrar }: {
  t: Tema;
  areas: ReturnType<typeof agruparPorArea>['areas'];
  total: number;
  datos: DatosRecibo;
  inicial: SeleccionCierre;
  anchoPredeterminado: 58 | 80;
  imprimir: (recibos: LineaRecibo[][], ancho: 58 | 80, logo?: string) => Promise<boolean | void>;
  onCerrar: () => void;
}) {
  const [sel, setSel] = useState<SeleccionCierre>(inicial);
  const [formato, setFormato] = useState<Formato>(anchoPredeterminado === 58 ? 'tirilla58' : 'tirilla80');
  const [ocupado, setOcupado] = useState<'imprimir' | 'pdf' | null>(null);
  const ancho: 58 | 80 = formato === 'tirilla58' ? 58 : 80;
  const d = { ...datos, hasta: datos.hasta || new Date().toISOString() };

  const recibos = useMemo(() => recibosDe(sel, areas, total, d), [sel, areas, total]); // eslint-disable-line react-hooks/exhaustive-deps
  const html = useMemo(
    () => (formato === 'documento'
      ? htmlDocumento(sel, areas, total, d).replace('<body>', '<body style="background:#e2e8f0;padding:18px"><div style="background:#fff;max-width:816px;margin:0 auto;padding:36px 40px;box-shadow:0 2px 10px rgba(0,0,0,.18)">').replace('</body>', '</div></body>')
      : htmlVistaTirilla(recibos, ancho, d.logo)),
    [formato, sel, recibos, ancho], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const accion = async (tipo: 'imprimir' | 'pdf') => {
    setOcupado(tipo);
    try {
      if (tipo === 'pdf') {
        const blob = formato === 'documento' ? await pdfDocumento(sel, areas, total, d) : await pdfTirilla(recibos, ancho, d.logo);
        descargarPdf(blob, nombreArchivo(sel, formato === 'documento' ? 'documento' : 'tirilla'));
        toast.success('PDF descargado');
      } else if (formato === 'documento') {
        imprimirHtmlSistema(htmlDocumento(sel, areas, total, d));
      } else {
        const ok = await imprimir(recibos, ancho, d.logo);
        if (ok === false) toast.error('No se pudo imprimir. Revisa la impresora en Dispositivos.');
      }
    } catch (e: any) {
      toast.error(tipo === 'pdf' ? 'No se pudo generar el PDF' : 'No se pudo imprimir', { description: e?.message });
    } finally {
      setOcupado(null);
    }
  };

  const opciones: Array<{ id: SeleccionCierre; label: string }> = [
    { id: 'completo', label: 'Cierre completo' },
    { id: 'consolidado', label: 'Consolidado' },
    ...areas.map((a) => ({ id: a.area as SeleccionCierre, label: a.nombre.replace(/ \(.*\)$/, '') })),
  ];
  const formatos: Array<{ id: Formato; label: string }> = [
    { id: 'tirilla58', label: 'Tirilla 58 mm' },
    { id: 'tirilla80', label: 'Tirilla 80 mm' },
    { id: 'documento', label: 'Documento (carta)' },
  ];

  return (
    <div className="fixed inset-0 z-[210] bg-black/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6" onClick={onCerrar}>
      <div className={`w-full max-w-5xl max-h-[94vh] ${t.hoja} rounded-3xl flex flex-col overflow-hidden`} onClick={(e) => e.stopPropagation()}>
        <div className={`flex items-center justify-between gap-3 px-5 py-4 border-b ${t.linea}`}>
          <h3 className={`${t.texto} text-lg font-bold flex items-center gap-2`}><Eye className="w-5 h-5 text-emerald-500" /> Vista previa del cierre</h3>
          <button onClick={onCerrar} className={t.suave} aria-label="Cerrar"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-[260px_1fr] md:h-[64vh]">
          {/* Opciones */}
          <div className={`p-4 space-y-4 overflow-y-auto md:h-[64vh] border-b md:border-b-0 md:border-r ${t.linea}`}>
            <div>
              <p className={`${t.suave} text-xs font-bold mb-2`}>Formato</p>
              <div className="flex flex-wrap md:flex-col gap-1.5">
                {formatos.map((f) => (
                  <button key={f.id} onClick={() => setFormato(f.id)}
                    className={`px-3 h-9 rounded-lg text-xs font-semibold text-left flex items-center gap-2 ${formato === f.id ? t.chipActivo : t.chip}`}>
                    {f.id === 'documento' ? <FileText className="w-3.5 h-3.5" /> : <Receipt className="w-3.5 h-3.5" />} {f.label}
                    {f.id !== 'documento' && Number(f.id.slice(7)) === anchoPredeterminado && <span className="ml-auto text-[10px] opacity-70">tu impresora</span>}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className={`${t.suave} text-xs font-bold mb-2`}>¿Qué quieres ver?</p>
              <div className="flex flex-wrap md:flex-col gap-1.5">
                {opciones.map((o) => (
                  <button key={o.id} onClick={() => setSel(o.id)}
                    className={`px-3 h-9 rounded-lg text-xs font-semibold text-left ${sel === o.id ? t.chipActivo : t.chip}`}>{o.label}</button>
                ))}
              </div>
            </div>
          </div>

          {/* Vista */}
          <iframe title="Vista previa" srcDoc={html} className="w-full h-[52vh] md:h-[64vh] bg-slate-200 border-0" />
        </div>

        <div className={`flex flex-col sm:flex-row gap-2 px-5 py-4 border-t ${t.linea}`}>
          <button onClick={() => accion('imprimir')} disabled={!!ocupado}
            className="w-full sm:flex-1 h-11 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50" style={{ color: '#fff' }}>
            {ocupado === 'imprimir' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
            Imprimir {formato === 'documento' ? 'documento' : `tirilla ${ancho} mm`}
          </button>
          <button onClick={() => accion('pdf')} disabled={!!ocupado}
            className={`w-full sm:flex-1 h-11 rounded-xl text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50 ${t.boton}`}>
            {ocupado === 'pdf' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            Descargar PDF ({formato === 'documento' ? 'documento' : `tirilla ${ancho} mm`})
          </button>
        </div>
      </div>
    </div>
  );
}
