/**
 * Causación de un documento recibido: registra la compra como gasto,
 * actualiza el proveedor y —para las líneas que se asocien a un producto—
 * suma al inventario y actualiza el costo. Todo o nada: lo ejecuta la RPC
 * causar_documento_electronico en una sola transacción.
 */
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { X, PackagePlus, Search, Loader2 } from 'lucide-react';
import { getSupabaseClient } from '../../lib/supabase/config';
import { causarDocumentoElectronico, type DocumentoElectronico } from '../../lib/supabase/documentosElectronicosService';
import { money, type OperadorFacturacion } from './comunes';

interface ProductoLigero {
  id: string;
  nombre: string;
  codigo_barras: string | null;
}

// Mismas categorías y medios de pago que Gastos, para que la compra causada
// se agrupe igual que un gasto registrado a mano.
const CATEGORIAS = [
  'inventario', 'servicios_publicos', 'arriendo', 'aseo_limpieza', 'implementos', 'comida_alimentacion',
  'nomina', 'transporte', 'internet_telefono', 'seguridad', 'mantenimiento', 'impuestos', 'marketing', 'papeleria', 'otros',
];
const MEDIOS_PAGO = ['efectivo', 'transferencia', 'tarjeta', 'nequi', 'daviplata'];

const normalizar = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
const campo = 'h-10 px-3 rounded-lg bg-slate-900 border border-slate-800 text-white text-sm';

interface Props {
  documento: DocumentoElectronico;
  clienteId: string;
  operador: OperadorFacturacion;
  onCerrar: () => void;
  onCausado: () => void;
}

export function ModalCausar({ documento, clienteId, operador, onCerrar, onCausado }: Props) {
  const [productos, setProductos] = useState<ProductoLigero[] | null>(null);
  const [categoria, setCategoria] = useState('inventario');
  const [medioPago, setMedioPago] = useState('efectivo');
  // Forma de pago UBL: 1 = contado, 2 = crédito.
  const [aCredito, setACredito] = useState(documento.formaPago === '2');
  const [fecha, setFecha] = useState(documento.fechaEmision || new Date().toISOString().slice(0, 10));
  const [afectaInventario, setAfectaInventario] = useState(true);
  // número de línea → id de producto ('' = no afecta inventario)
  const [asociacion, setAsociacion] = useState<Record<number, string>>({});
  const [lineaBuscando, setLineaBuscando] = useState<number | null>(null);
  const [busqueda, setBusqueda] = useState('');
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    const client = getSupabaseClient();
    if (!client) { setProductos([]); return; }
    let cancelado = false;
    client
      .from('productos')
      .select('id, nombre, codigo_barras')
      .eq('cliente_id', clienteId)
      .eq('activo', true)
      .order('nombre')
      .limit(5000)
      .then(({ data }) => {
        if (cancelado) return;
        const lista = (data as ProductoLigero[]) || [];
        setProductos(lista);

        // Asociación automática: por código de barras (el estándar o el del
        // vendedor) y, si no, por nombre idéntico. Lo dudoso queda sin
        // asociar para que lo decida una persona.
        const porCodigo = new Map(lista.filter((p) => p.codigo_barras).map((p) => [p.codigo_barras!.trim(), p.id]));
        const porNombre = new Map(lista.map((p) => [normalizar(p.nombre), p.id]));
        const inicial: Record<number, string> = {};
        for (const l of documento.lineas) {
          inicial[l.numero] =
            porCodigo.get(l.codigoEstandar?.trim()) ||
            porCodigo.get(l.codigoVendedor?.trim()) ||
            porNombre.get(normalizar(l.descripcion || '')) ||
            '';
        }
        setAsociacion(inicial);
      });
    return () => { cancelado = true; };
  }, [clienteId, documento.id]);

  const nombrePorId = useMemo(() => new Map((productos || []).map((p) => [p.id, p.nombre])), [productos]);

  const sugerencias = useMemo(() => {
    const t = normalizar(busqueda);
    if (!t || !productos) return [];
    return productos.filter((p) => normalizar(p.nombre).includes(t) || (p.codigo_barras || '').includes(busqueda.trim())).slice(0, 8);
  }, [busqueda, productos]);

  const asociadas = afectaInventario ? documento.lineas.filter((l) => asociacion[l.numero]) : [];

  async function causar() {
    setGuardando(true);
    try {
      await causarDocumentoElectronico({
        documentoId: documento.id,
        categoria,
        medioPago,
        aCredito,
        // Mediodía local: la fecha de la factura es un día, no un instante;
        // a medianoche un cambio de zona la correría al día anterior.
        fecha: new Date(`${fecha}T12:00:00`).toISOString(),
        empleadoId: operador.id,
        empleadoNombre: operador.nombre,
        lineasInventario: asociadas.map((l) => ({
          productoId: asociacion[l.numero],
          cantidad: l.cantidad,
          // Costo unitario neto de descuento, antes de impuestos.
          costoUnitario: l.cantidad > 0 ? Math.round((l.valorBruto / l.cantidad) * 100) / 100 : l.precioUnitario,
        })),
      });
      toast.success(`${documento.numeroCompleto || 'Documento'} causado`, {
        description: asociadas.length > 0
          ? `Gasto registrado y ${asociadas.length} ${asociadas.length === 1 ? 'producto actualizado' : 'productos actualizados'} en inventario`
          : 'Gasto registrado',
      });
      onCausado();
    } catch (e: any) {
      toast.error(e?.message || 'No se pudo causar el documento');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={onCerrar}>
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-slate-950 border border-slate-800 rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 pt-5 pb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-bold text-white text-lg">Causar {documento.numeroCompleto || 'documento'}</p>
            <p className="text-sm text-slate-400 truncate">{documento.emisorNombre || 'Proveedor'} · NIT {documento.emisorNit || '—'}</p>
          </div>
          <button onClick={onCerrar} className="text-slate-400 shrink-0" aria-label="Cerrar"><X className="w-5 h-5" /></button>
        </div>

        <div className="px-5 grid grid-cols-3 gap-2">
          {[['Subtotal', documento.subtotal], ['Impuestos', documento.totalImpuestos], ['Total', documento.total]].map(([label, valor]) => (
            <div key={label as string} className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2">
              <p className="text-[10px] text-slate-500 uppercase tracking-wide font-bold">{label}</p>
              <p className="text-white font-mono font-bold">{money(valor as number)}</p>
            </div>
          ))}
        </div>

        <div className="px-5 mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="space-y-1">
            <span className="block text-xs text-slate-400">Se registra como gasto de</span>
            <select value={categoria} onChange={(e) => setCategoria(e.target.value)} className={`${campo} w-full`}>
              {CATEGORIAS.map((c) => <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>)}
            </select>
          </label>
          <label className="space-y-1">
            <span className="block text-xs text-slate-400">Fecha del gasto</span>
            <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className={`${campo} w-full`} />
          </label>
          <div className="space-y-1">
            <span className="block text-xs text-slate-400">Forma de pago</span>
            <div className="flex gap-2">
              {[[false, 'Contado'], [true, 'A crédito']].map(([valor, label]) => (
                <button
                  key={label as string}
                  onClick={() => setACredito(valor as boolean)}
                  className={`flex-1 h-10 rounded-lg text-sm font-bold ${aCredito === valor ? 'bg-amber-500 text-slate-950' : 'bg-slate-900 border border-slate-800 text-slate-400'}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          {aCredito ? (
            <p className="text-xs text-slate-400 self-end pb-2">Queda como saldo pendiente con el proveedor.</p>
          ) : (
            <label className="space-y-1">
              <span className="block text-xs text-slate-400">Pagado con</span>
              <select value={medioPago} onChange={(e) => setMedioPago(e.target.value)} className={`${campo} w-full`}>
                {MEDIOS_PAGO.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </label>
          )}
        </div>

        <div className="px-5 mt-5">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={afectaInventario} onChange={(e) => setAfectaInventario(e.target.checked)} className="w-4 h-4 accent-amber-500" />
            <span className="text-sm font-semibold text-white flex items-center gap-1.5"><PackagePlus className="w-4 h-4 text-amber-400" /> Sumar al inventario</span>
          </label>
          <p className="text-xs text-slate-500 mt-1">
            Cada línea asociada a un producto suma su cantidad al stock y actualiza el costo. Las que queden sin asociar solo cuentan en el gasto.
          </p>
        </div>

        {afectaInventario && (
          <div className="px-5 mt-3 space-y-2">
            {productos === null ? (
              <p className="text-slate-500 text-sm flex items-center gap-2 py-3"><Loader2 className="w-4 h-4 animate-spin" /> Buscando productos...</p>
            ) : documento.lineas.length === 0 ? (
              <p className="text-slate-500 text-sm py-3">Este documento no trae líneas de detalle.</p>
            ) : documento.lineas.map((l) => (
              <div key={l.numero} className="bg-slate-900 border border-slate-800 rounded-xl p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm text-white">{l.descripcion || `Línea ${l.numero}`}</p>
                    <p className="text-xs text-slate-500 font-mono">{l.cantidad} × {money(l.precioUnitario)} = {money(l.valorBruto)}</p>
                  </div>
                  {asociacion[l.numero] ? (
                    <button
                      onClick={() => setAsociacion((a) => ({ ...a, [l.numero]: '' }))}
                      className="shrink-0 max-w-[45%] inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-500/15 text-emerald-400 text-xs font-semibold"
                      title="Quitar asociación"
                    >
                      <span className="truncate">{nombrePorId.get(asociacion[l.numero]) || 'Producto'}</span> <X className="w-3 h-3 shrink-0" />
                    </button>
                  ) : (
                    <button
                      onClick={() => { setLineaBuscando(l.numero); setBusqueda(''); }}
                      className="shrink-0 px-2 py-1 rounded-lg bg-slate-800 text-slate-300 text-xs font-semibold"
                    >
                      Asociar producto
                    </button>
                  )}
                </div>
                {lineaBuscando === l.numero && !asociacion[l.numero] && (
                  <div className="mt-2">
                    <span className="relative block">
                      <Search className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                      <input autoFocus value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Nombre o código de barras" className={`${campo} w-full pl-9`} />
                    </span>
                    {sugerencias.length > 0 && (
                      <div className="mt-1 bg-slate-950 rounded-lg overflow-hidden">
                        {sugerencias.map((p) => (
                          <button
                            key={p.id}
                            onClick={() => { setAsociacion((a) => ({ ...a, [l.numero]: p.id })); setLineaBuscando(null); }}
                            className="w-full text-left px-3 py-2 text-sm text-slate-300 hover:bg-slate-900"
                          >
                            {p.nombre} {p.codigo_barras && <span className="text-xs text-slate-500 font-mono">· {p.codigo_barras}</span>}
                          </button>
                        ))}
                      </div>
                    )}
                    {busqueda.trim() && sugerencias.length === 0 && <p className="px-3 py-2 text-xs text-slate-500">Sin coincidencias en el inventario.</p>}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="px-5 py-5 flex gap-2">
          <button onClick={onCerrar} className="flex-1 h-11 rounded-lg border border-slate-800 text-slate-300 text-sm font-semibold">Cancelar</button>
          <button onClick={causar} disabled={guardando} className="flex-1 h-11 rounded-lg bg-amber-500 text-slate-950 text-sm font-bold disabled:opacity-50">
            {guardando ? 'Causando...' : `Causar ${money(documento.total)}`}
          </button>
        </div>
      </div>
    </div>
  );
}
