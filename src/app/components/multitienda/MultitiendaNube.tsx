/**
 * Multitienda en la nube: la misma pantalla en la web, el celular y Electron.
 * Inventario por sede (búsqueda en el servidor, sirve con 20.000 referencias),
 * transferencias con estado "en camino" y recepción con diferencias,
 * historial y sedes con carga masiva de inventario. Ver lib/multitiendaNube.ts.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeftRight, ArrowRight, Boxes, Check, CloudUpload, History, Loader2, PackageCheck, Pencil, Plus, Search,
  Store, Trash2, Truck, Upload, Warehouse, X,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  activarMultitiendaNube, buscarInventario, cancelarTransferencia, cargarInventarioSede, enviarTransferencia, escucharTransferencias,
  guardarSede, leerArchivoCarga, listarSedes, listarTransferencias, obtenerConfigMultitienda, recibirTransferencia, SEDE_PRINCIPAL,
  type FilaInventario, type Sede, type Transferencia,
} from '../../lib/multitiendaNube';

type Pestana = 'inventario' | 'transferir' | 'camino' | 'historial' | 'sedes';

interface Props {
  clienteId: string;
  esAdmin: boolean;
  /** Sede del empleado (operativos solo ven y reciben la suya). */
  miSede?: string | null;
}

const num = (n: number) => (Number.isInteger(n) ? n.toLocaleString('es-CO') : n.toLocaleString('es-CO', { maximumFractionDigits: 3 }));
const fecha = (iso: string | null) => (iso ? new Date(iso).toLocaleString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');
const caja = 'bg-slate-900/70 border border-slate-800 rounded-2xl';
const entrada = 'h-11 w-full rounded-xl bg-slate-950 border border-slate-700 px-3 text-white placeholder:text-slate-500 focus:outline-none focus:border-amber-500';
const boton = 'h-11 px-4 rounded-xl text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors disabled:opacity-50';

function useDebounced<T>(valor: T, ms = 300): T {
  const [v, setV] = useState(valor);
  useEffect(() => { const t = setTimeout(() => setV(valor), ms); return () => clearTimeout(t); }, [valor, ms]);
  return v;
}

export function MultitiendaNube({ clienteId, esAdmin, miSede }: Props) {
  const sedePropia = miSede || SEDE_PRINCIPAL;
  const [config, setConfig] = useState<{ nube: boolean } | null>(null);
  const [sedes, setSedes] = useState<Sede[]>([]);
  const [pestana, setPestana] = useState<Pestana>('inventario');
  const [enCamino, setEnCamino] = useState<Transferencia[]>([]);
  const [activando, setActivando] = useState(false);

  const cargarBase = useCallback(async () => {
    try {
      const [c, s] = await Promise.all([obtenerConfigMultitienda(), listarSedes(clienteId)]);
      setConfig(c);
      setSedes(s);
    } catch (e) {
      toast.error('No se pudo cargar la multitienda', { description: (e as Error).message });
      setConfig({ nube: false });
    }
  }, [clienteId]);

  const cargarEnCamino = useCallback(async () => {
    try { setEnCamino(await listarTransferencias(clienteId, 'en_camino', 100)); } catch { /* sin conexión */ }
  }, [clienteId]);

  useEffect(() => { cargarBase(); }, [cargarBase]);
  useEffect(() => {
    if (!config?.nube) return;
    cargarEnCamino();
    return escucharTransferencias(clienteId, cargarEnCamino);
  }, [config?.nube, clienteId, cargarEnCamino]);

  const nombreSede = useCallback((id: string) => sedes.find((s) => s.id === id)?.nombre || (id === SEDE_PRINCIPAL ? 'Tienda Principal' : id), [sedes]);
  const porRecibir = enCamino.filter((t) => esAdmin || t.destinoId === sedePropia).length;

  if (!config) {
    return <div className="py-16 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-amber-500" /></div>;
  }

  if (!config.nube) {
    return (
      <div className="space-y-4">
      <div className={`${caja} p-6 space-y-4 max-w-2xl`}>
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-amber-500/15 text-amber-400 flex items-center justify-center"><CloudUpload className="w-6 h-6" /></div>
          <div>
            <h2 className="text-white text-lg font-bold">Inventario por sede en la nube</h2>
            <p className="text-slate-400 text-sm">Para negocios con varias sedes, cada una con su caja.</p>
          </div>
        </div>
        <ul className="text-sm text-slate-300 space-y-2 list-disc pl-5">
          <li>El stock de cada sede queda en la nube: todas las cajas, la web y el celular ven lo mismo.</li>
          <li>Transferencias entre sedes en un paso: salen del origen y quedan "en camino" hasta que el destino las recibe.</li>
          <li>Se puede cargar el inventario de una sede desde un archivo (Excel o exportación de otro sistema).</li>
          <li>Cada venta descuenta el stock de la sede donde se hizo.</li>
        </ul>
        {esAdmin ? (
          <button
            onClick={async () => {
              setActivando(true);
              try { await activarMultitiendaNube(); toast.success('Multitienda en la nube activada'); await cargarBase(); }
              catch (e) { toast.error('No se pudo activar', { description: (e as Error).message }); }
              finally { setActivando(false); }
            }}
            disabled={activando}
            className={`${boton} bg-amber-500 hover:bg-amber-600 text-slate-950`}
          >
            {activando ? <Loader2 className="w-4 h-4 animate-spin" /> : <CloudUpload className="w-4 h-4" />} Activar para mi negocio
          </button>
        ) : (
          <p className="text-amber-300 text-sm">Pídele al administrador que la active.</p>
        )}
      </div>
      {/* Mientras tanto se puede consultar el stock por sede que suben las cajas. */}
      <h3 className="text-white font-bold pt-2">Stock por sede (lo que reportan las cajas)</h3>
      <PestanaInventario sedes={sedes} esAdmin={esAdmin} sedePropia={sedePropia} />
      </div>
    );
  }

  const pestanas: Array<[Pestana, string, typeof Boxes, number?]> = [
    ['inventario', 'Inventario', Boxes],
    ['transferir', 'Transferir', ArrowLeftRight],
    ['camino', 'En camino', Truck, porRecibir],
    ['historial', 'Historial', History],
    ...(esAdmin ? [['sedes', 'Sedes', Store] as [Pestana, string, typeof Boxes]] : []),
  ];

  return (
    <div className="space-y-4">
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
        {pestanas.map(([id, etiqueta, Icono, badge]) => (
          <button
            key={id}
            onClick={() => setPestana(id)}
            className={`shrink-0 h-10 px-4 rounded-xl text-sm font-semibold inline-flex items-center gap-2 border transition-colors ${
              pestana === id ? 'bg-amber-500 text-slate-950 border-amber-500' : 'bg-slate-900/70 text-slate-300 border-slate-800 hover:border-slate-600'
            }`}
          >
            <Icono className="w-4 h-4" /> {etiqueta}
            {!!badge && <span className={`min-w-5 h-5 px-1.5 rounded-full text-[11px] leading-5 ${pestana === id ? 'bg-slate-950 text-amber-400' : 'bg-amber-500 text-slate-950'}`}>{badge}</span>}
          </button>
        ))}
      </div>

      {pestana === 'inventario' && <PestanaInventario sedes={sedes} esAdmin={esAdmin} sedePropia={sedePropia} />}
      {pestana === 'transferir' && (
        <PestanaTransferir sedes={sedes} esAdmin={esAdmin} sedePropia={sedePropia} alEnviar={() => { cargarEnCamino(); setPestana('camino'); }} />
      )}
      {pestana === 'camino' && (
        <PestanaEnCamino lista={enCamino} esAdmin={esAdmin} sedePropia={sedePropia} nombreSede={nombreSede} alCambiar={cargarEnCamino} />
      )}
      {pestana === 'historial' && <PestanaHistorial clienteId={clienteId} />}
      {pestana === 'sedes' && esAdmin && <PestanaSedes clienteId={clienteId} sedes={sedes} alCambiar={cargarBase} />}
    </div>
  );
}

// ── Inventario por sede ────────────────────────────────────────────────────

function PestanaInventario({ sedes, esAdmin, sedePropia }: { sedes: Sede[]; esAdmin: boolean; sedePropia: string }) {
  const [busqueda, setBusqueda] = useState('');
  const [sede, setSede] = useState<string | null>(esAdmin ? null : sedePropia);
  const [soloBajo, setSoloBajo] = useState(false);
  const [filas, setFilas] = useState<FilaInventario[]>([]);
  const [total, setTotal] = useState(0);
  const [cargando, setCargando] = useState(false);
  const q = useDebounced(busqueda);
  const pedido = useRef(0);

  const cargar = useCallback(async (desde: number) => {
    const id = ++pedido.current;
    setCargando(true);
    try {
      const r = await buscarInventario({ busqueda: q, sede, soloBajo: soloBajo && !!sede, desde, limite: 50 });
      if (id !== pedido.current) return; // llegó una búsqueda más nueva
      setFilas((prev) => (desde === 0 ? r.filas : [...prev, ...r.filas]));
      setTotal(r.total);
    } catch (e) {
      toast.error('No se pudo cargar el inventario', { description: (e as Error).message });
    } finally {
      if (id === pedido.current) setCargando(false);
    }
  }, [q, sede, soloBajo]);

  useEffect(() => { cargar(0); }, [cargar]);

  const columnas = esAdmin ? (sede ? sedes.filter((s) => s.id === sede) : sedes) : sedes.filter((s) => s.id === sedePropia);

  return (
    <div className="space-y-3">
      <div className="flex flex-col md:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar por nombre o código..." className={`${entrada} pl-9`} />
        </div>
        {esAdmin && (
          <select value={sede ?? ''} onChange={(e) => setSede(e.target.value || null)} className={`${entrada} md:w-56`}>
            <option value="">Todas las sedes</option>
            {sedes.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
          </select>
        )}
        <label className={`h-11 px-3 rounded-xl border inline-flex items-center gap-2 text-sm cursor-pointer ${sede ? 'border-slate-700 text-slate-300' : 'border-slate-800 text-slate-600'}`}>
          <input type="checkbox" checked={soloBajo} disabled={!sede} onChange={(e) => setSoloBajo(e.target.checked)} className="accent-amber-500" />
          Solo bajo mínimo
        </label>
      </div>
      <p className="text-slate-500 text-xs">{num(total)} productos{q ? ` para "${q}"` : ''}</p>

      {/* Celular: tarjetas */}
      <div className="md:hidden space-y-2">
        {filas.map((f) => (
          <div key={f.productoId} className={`${caja} p-3`}>
            <p className="text-white text-sm font-semibold">{f.nombre}</p>
            <p className="text-slate-500 text-xs mb-2">{f.codigo || 'Sin código'} · Total {num(f.total)}</p>
            <div className="flex flex-wrap gap-1.5">
              {columnas.map((s) => {
                const v = f.stocks[s.id] ?? 0;
                return (
                  <span key={s.id} className={`text-[11px] px-2 py-1 rounded-lg ${v <= f.stockMinimo ? 'bg-red-500/15 text-red-300' : 'bg-slate-800 text-slate-300'}`}>
                    {s.nombre}: <strong>{num(v)}</strong>
                  </span>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Computador: tabla */}
      <div className={`hidden md:block ${caja} overflow-x-auto`}>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-slate-400 text-xs uppercase tracking-wide border-b border-slate-800">
              <th className="text-left font-semibold p-3 sticky left-0 bg-slate-900 min-w-[240px]">Producto</th>
              {columnas.map((s) => <th key={s.id} className="text-right font-semibold p-3 whitespace-nowrap">{s.nombre}</th>)}
              {columnas.length > 1 && <th className="text-right font-semibold p-3">Total</th>}
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.productoId} className="border-b border-slate-800/60 hover:bg-slate-800/30">
                <td className="p-3 sticky left-0 bg-slate-900">
                  <p className="text-white font-medium">{f.nombre}</p>
                  <p className="text-slate-500 text-xs">{f.codigo || 'Sin código'}{f.stockMinimo > 0 ? ` · mínimo ${num(f.stockMinimo)}` : ''}</p>
                </td>
                {columnas.map((s) => {
                  const v = f.stocks[s.id] ?? 0;
                  return <td key={s.id} className={`p-3 text-right tabular-nums ${v <= f.stockMinimo ? 'text-red-400 font-semibold' : 'text-slate-200'}`}>{num(v)}</td>;
                })}
                {columnas.length > 1 && <td className="p-3 text-right tabular-nums text-white font-bold">{num(f.total)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {cargando && <div className="flex justify-center py-4"><Loader2 className="w-6 h-6 animate-spin text-amber-500" /></div>}
      {!cargando && filas.length === 0 && <p className="text-slate-500 text-sm text-center py-8">Sin productos</p>}
      {!cargando && filas.length < total && (
        <button onClick={() => cargar(filas.length)} className={`${boton} w-full bg-slate-800 hover:bg-slate-700 text-white`}>Cargar más ({num(total - filas.length)} restantes)</button>
      )}
    </div>
  );
}

// ── Nueva transferencia ────────────────────────────────────────────────────

interface Linea { productoId: string; nombre: string; codigo: string | null; disponible: number; cantidad: number }

function PestanaTransferir({ sedes, esAdmin, sedePropia, alEnviar }: { sedes: Sede[]; esAdmin: boolean; sedePropia: string; alEnviar: () => void }) {
  const bodega = sedes.find((s) => s.tipo === 'bodega')?.id;
  const [origen, setOrigen] = useState(esAdmin ? (bodega || SEDE_PRINCIPAL) : sedePropia);
  const [destino, setDestino] = useState(() => sedes.find((s) => s.id !== (esAdmin ? (bodega || SEDE_PRINCIPAL) : sedePropia))?.id || '');
  const [busqueda, setBusqueda] = useState('');
  const [resultados, setResultados] = useState<FilaInventario[]>([]);
  const [lineas, setLineas] = useState<Linea[]>([]);
  const [notas, setNotas] = useState('');
  const [llegaYa, setLlegaYa] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const q = useDebounced(busqueda, 250);
  const buscadorRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!q.trim()) { setResultados([]); return; }
    let vigente = true;
    buscarInventario({ busqueda: q, sede: origen, limite: 12 })
      .then((r) => { if (vigente) setResultados(r.filas); })
      .catch(() => { if (vigente) setResultados([]); });
    return () => { vigente = false; };
  }, [q, origen]);

  // Al cambiar el origen, lo disponible de cada línea ya no aplica.
  useEffect(() => { setLineas([]); }, [origen]);

  const agregar = (f: FilaInventario) => {
    setLineas((prev) => {
      const ya = prev.find((l) => l.productoId === f.productoId);
      if (ya) return prev.map((l) => (l.productoId === f.productoId ? { ...l, cantidad: l.cantidad + 1 } : l));
      return [{ productoId: f.productoId, nombre: f.nombre, codigo: f.codigo, disponible: f.stocks[origen] ?? 0, cantidad: 1 }, ...prev];
    });
    setBusqueda('');
    setResultados([]);
    buscadorRef.current?.focus();
  };

  // Lector de código de barras: Enter con un código exacto lo agrega de una vez.
  const alTeclear = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter' || !busqueda.trim()) return;
    e.preventDefault();
    const exacto = resultados.find((r) => r.codigo === busqueda.trim());
    if (exacto) return agregar(exacto);
    try {
      const r = await buscarInventario({ busqueda: busqueda.trim(), sede: origen, limite: 5 });
      const unico = r.filas.find((f) => f.codigo === busqueda.trim()) || (r.filas.length === 1 ? r.filas[0] : null);
      if (unico) agregar(unico); else toast.error('No se encontró ese código');
    } catch { /* sin conexión */ }
  };

  const unidades = lineas.reduce((a, l) => a + (l.cantidad || 0), 0);
  const excedidas = lineas.filter((l) => l.cantidad > l.disponible);
  const sedesOrigen = esAdmin ? sedes : sedes.filter((s) => s.id === sedePropia);

  const enviar = async () => {
    if (!destino || destino === origen) return toast.error('Elige una sede de destino distinta');
    if (lineas.length === 0) return toast.error('Agrega al menos un producto');
    if (excedidas.length > 0) return toast.error('Hay productos con más cantidad de la disponible en el origen');
    setEnviando(true);
    try {
      await enviarTransferencia({ origen, destino, items: lineas.map((l) => ({ producto_id: l.productoId, cantidad: l.cantidad })), notas, llegaYa });
      toast.success(llegaYa ? 'Transferencia hecha: ya está en el destino' : 'Transferencia enviada: queda en camino hasta que la reciban');
      setLineas([]);
      setNotas('');
      alEnviar();
    } catch (e) {
      toast.error('No se pudo enviar', { description: (e as Error).message });
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="grid lg:grid-cols-[1fr_380px] gap-4">
      <div className="space-y-3">
        <div className={`${caja} p-3 grid grid-cols-[1fr_auto_1fr] items-end gap-2`}>
          <label className="text-xs text-slate-400 space-y-1">
            <span>Sale de</span>
            <select value={origen} onChange={(e) => setOrigen(e.target.value)} className={entrada}>
              {sedesOrigen.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
            </select>
          </label>
          <button
            onClick={() => { if (esAdmin) { setOrigen(destino); setDestino(origen); } }}
            disabled={!esAdmin}
            className="h-11 w-11 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-400 flex items-center justify-center disabled:opacity-40"
            aria-label="Intercambiar origen y destino"
          >
            <ArrowLeftRight className="w-4 h-4" />
          </button>
          <label className="text-xs text-slate-400 space-y-1">
            <span>Llega a</span>
            <select value={destino} onChange={(e) => setDestino(e.target.value)} className={entrada}>
              <option value="">Elegir sede</option>
              {sedes.filter((s) => s.id !== origen).map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
            </select>
          </label>
        </div>

        <div className="relative">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            ref={buscadorRef}
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            onKeyDown={alTeclear}
            placeholder="Busca o escanea el código del producto..."
            className={`${entrada} pl-9`}
            autoFocus
          />
          {resultados.length > 0 && (
            <div className="absolute z-20 mt-1 w-full bg-slate-900 border border-slate-700 rounded-xl shadow-2xl max-h-80 overflow-y-auto">
              {resultados.map((r) => (
                <button key={r.productoId} onClick={() => agregar(r)} className="w-full text-left px-3 py-2.5 hover:bg-slate-800 flex items-center justify-between gap-3">
                  <span className="min-w-0">
                    <span className="block text-white text-sm truncate">{r.nombre}</span>
                    <span className="block text-slate-500 text-xs">{r.codigo || 'Sin código'}</span>
                  </span>
                  <span className={`text-xs shrink-0 ${(r.stocks[origen] ?? 0) > 0 ? 'text-emerald-400' : 'text-red-400'}`}>Hay {num(r.stocks[origen] ?? 0)}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-2">
          {lineas.length === 0 && <p className="text-slate-500 text-sm text-center py-10">Busca o escanea productos para agregarlos</p>}
          {lineas.map((l) => (
            <div key={l.productoId} className={`${caja} p-3 flex items-center gap-3`}>
              <div className="flex-1 min-w-0">
                <p className="text-white text-sm font-medium truncate">{l.nombre}</p>
                <p className={`text-xs ${l.cantidad > l.disponible ? 'text-red-400' : 'text-slate-500'}`}>
                  {l.codigo || 'Sin código'} · hay {num(l.disponible)} en el origen
                </p>
              </div>
              <input
                type="number"
                inputMode="decimal"
                min={0}
                value={l.cantidad}
                onChange={(e) => {
                  const v = Math.max(0, Number(e.target.value) || 0);
                  setLineas((prev) => prev.map((x) => (x.productoId === l.productoId ? { ...x, cantidad: v } : x)));
                }}
                className="h-10 w-24 rounded-lg bg-slate-950 border border-slate-700 px-2 text-right text-white"
                aria-label={`Cantidad de ${l.nombre}`}
              />
              <button onClick={() => setLineas((prev) => prev.filter((x) => x.productoId !== l.productoId))} className="h-10 w-10 rounded-lg bg-slate-800 hover:bg-red-500/20 text-slate-400 hover:text-red-400 flex items-center justify-center" aria-label="Quitar">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className={`${caja} p-4 space-y-3 h-fit lg:sticky lg:top-4`}>
        <h3 className="text-white font-bold">Resumen</h3>
        <div className="text-sm text-slate-300 space-y-1">
          <p className="flex items-center gap-2 flex-wrap"><span className="text-white font-semibold">{sedes.find((s) => s.id === origen)?.nombre}</span><ArrowRight className="w-4 h-4 text-amber-400" /><span className="text-white font-semibold">{sedes.find((s) => s.id === destino)?.nombre || 'Sin destino'}</span></p>
          <p>{lineas.length} productos · {num(unidades)} unidades</p>
        </div>
        <textarea value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Notas (opcional): placa del camión, quién lleva..." rows={2} className="w-full rounded-xl bg-slate-950 border border-slate-700 p-3 text-sm text-white placeholder:text-slate-500" />
        <label className="flex items-start gap-2 text-sm text-slate-300 cursor-pointer">
          <input type="checkbox" checked={llegaYa} onChange={(e) => setLlegaYa(e.target.checked)} className="mt-1 accent-amber-500" />
          <span>Llega de una vez <span className="block text-xs text-slate-500">Para movimientos en el mismo lugar. Si no, queda "en camino" hasta que el destino la reciba.</span></span>
        </label>
        <button onClick={enviar} disabled={enviando || lineas.length === 0 || !destino} className={`${boton} w-full bg-amber-500 hover:bg-amber-600 text-slate-950`}>
          {enviando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Truck className="w-4 h-4" />} {llegaYa ? 'Transferir ahora' : 'Enviar transferencia'}
        </button>
      </div>
    </div>
  );
}

// ── En camino ──────────────────────────────────────────────────────────────

function PestanaEnCamino({ lista, esAdmin, sedePropia, nombreSede, alCambiar }: {
  lista: Transferencia[]; esAdmin: boolean; sedePropia: string; nombreSede: (id: string) => string; alCambiar: () => void;
}) {
  const [editando, setEditando] = useState<string | null>(null);
  const [cantidades, setCantidades] = useState<Record<string, number>>({});
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [cancelando, setCancelando] = useState<{ id: string; motivo: string } | null>(null);
  const visibles = lista.filter((t) => esAdmin || t.destinoId === sedePropia || t.origenId === sedePropia);

  const accion = async (id: string, fn: () => Promise<void>, ok: string) => {
    setOcupado(id);
    try { await fn(); toast.success(ok); setEditando(null); setCancelando(null); alCambiar(); }
    catch (e) { toast.error('No se pudo completar', { description: (e as Error).message }); }
    finally { setOcupado(null); }
  };

  if (visibles.length === 0) return <p className="text-slate-500 text-sm text-center py-12">No hay mercancía en camino</p>;

  return (
    <div className="space-y-3">
      {visibles.map((t) => {
        const puedeRecibir = esAdmin || t.destinoId === sedePropia;
        const puedeCancelar = esAdmin || t.origenId === sedePropia;
        const conDiferencias = editando === t.id;
        return (
          <div key={t.id} className={`${caja} p-4 space-y-3`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-white font-bold flex items-center gap-2 flex-wrap">
                  #{t.numero} · {nombreSede(t.origenId)} <ArrowRight className="w-4 h-4 text-amber-400" /> {nombreSede(t.destinoId)}
                </p>
                <p className="text-slate-500 text-xs">Enviada {fecha(t.creadoEn)} por {t.creadoPor || 'sistema'} · {num(t.totalUnidades)} unidades{t.notas ? ` · ${t.notas}` : ''}</p>
              </div>
              <span className="text-xs px-2 py-1 rounded-full bg-amber-500/15 text-amber-300 inline-flex items-center gap-1"><Truck className="w-3 h-3" /> En camino</span>
            </div>
            <div className="divide-y divide-slate-800 text-sm">
              {t.items.map((i) => (
                <div key={i.producto_id} className="py-1.5 flex items-center justify-between gap-3">
                  <span className="text-slate-300 truncate">{i.nombre} <span className="text-slate-600">{i.codigo || ''}</span></span>
                  {conDiferencias ? (
                    <input
                      type="number" min={0} inputMode="decimal"
                      value={cantidades[i.producto_id] ?? i.cantidad}
                      onChange={(e) => setCantidades((c) => ({ ...c, [i.producto_id]: Math.max(0, Number(e.target.value) || 0) }))}
                      className="h-9 w-24 rounded-lg bg-slate-950 border border-slate-700 px-2 text-right text-white"
                      aria-label={`Cantidad recibida de ${i.nombre}`}
                    />
                  ) : (
                    <span className="text-white tabular-nums">{num(i.cantidad)}</span>
                  )}
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              {puedeRecibir && !conDiferencias && (
                <>
                  <button onClick={() => accion(t.id, () => recibirTransferencia(t.id), 'Mercancía recibida')} disabled={ocupado === t.id} className={`${boton} bg-emerald-600 hover:bg-emerald-700 text-white`}>
                    {ocupado === t.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <PackageCheck className="w-4 h-4" />} Recibir todo
                  </button>
                  <button onClick={() => { setEditando(t.id); setCantidades({}); }} className={`${boton} bg-slate-800 hover:bg-slate-700 text-white`}><Pencil className="w-4 h-4" /> Llegó diferente</button>
                </>
              )}
              {conDiferencias && (
                <>
                  <button onClick={() => accion(t.id, () => recibirTransferencia(t.id, cantidades), 'Recibida con diferencias')} disabled={ocupado === t.id} className={`${boton} bg-emerald-600 hover:bg-emerald-700 text-white`}>
                    <Check className="w-4 h-4" /> Confirmar lo que llegó
                  </button>
                  <button onClick={() => setEditando(null)} className={`${boton} bg-slate-800 hover:bg-slate-700 text-white`}>Volver</button>
                </>
              )}
              {puedeCancelar && !conDiferencias && cancelando?.id !== t.id && (
                <button onClick={() => setCancelando({ id: t.id, motivo: '' })} className={`${boton} bg-slate-800 hover:bg-red-500/20 text-slate-300 hover:text-red-300`}>
                  <X className="w-4 h-4" /> Cancelar
                </button>
              )}
              {cancelando?.id === t.id && (
                <div className="w-full flex flex-col sm:flex-row gap-2">
                  <input
                    value={cancelando.motivo}
                    onChange={(e) => setCancelando({ id: t.id, motivo: e.target.value })}
                    placeholder="Motivo (la mercancía vuelve al origen)"
                    className={entrada}
                    autoFocus
                  />
                  <button onClick={() => accion(t.id, () => cancelarTransferencia(t.id, cancelando.motivo), 'Transferencia cancelada')} disabled={ocupado === t.id} className={`${boton} bg-red-600 hover:bg-red-700 text-white shrink-0`}>
                    Confirmar cancelación
                  </button>
                  <button onClick={() => setCancelando(null)} className={`${boton} bg-slate-800 hover:bg-slate-700 text-white shrink-0`}>Volver</button>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Historial ──────────────────────────────────────────────────────────────

function PestanaHistorial({ clienteId }: { clienteId: string }) {
  const [lista, setLista] = useState<Transferencia[] | null>(null);
  const [abierta, setAbierta] = useState<string | null>(null);
  useEffect(() => { listarTransferencias(clienteId, 'historial', 100).then(setLista).catch(() => setLista([])); }, [clienteId]);
  if (!lista) return <div className="py-10 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-amber-500" /></div>;
  if (lista.length === 0) return <p className="text-slate-500 text-sm text-center py-12">Todavía no hay transferencias</p>;
  return (
    <div className="space-y-2">
      {lista.map((t) => (
        <div key={t.id} className={`${caja} p-3`}>
          <button onClick={() => setAbierta(abierta === t.id ? null : t.id)} className="w-full text-left flex flex-wrap items-center justify-between gap-2">
            <span className="text-white text-sm font-semibold">#{t.numero} · {t.origenNombre} → {t.destinoNombre}</span>
            <span className="flex items-center gap-2 text-xs">
              <span className="text-slate-500">{fecha(t.recibidoEn || t.canceladoEn || t.creadoEn)}</span>
              <span className={`px-2 py-0.5 rounded-full ${t.estado === 'recibida' ? (t.conDiferencias ? 'bg-amber-500/15 text-amber-300' : 'bg-emerald-500/15 text-emerald-300') : 'bg-slate-700 text-slate-300'}`}>
                {t.estado === 'recibida' ? (t.conDiferencias ? 'Recibida con diferencias' : 'Recibida') : 'Cancelada'}
              </span>
            </span>
          </button>
          {abierta === t.id && (
            <div className="mt-2 text-xs text-slate-400 space-y-1">
              <p>Enviada por {t.creadoPor || 'sistema'} el {fecha(t.creadoEn)}{t.recibidoPor ? ` · recibida por ${t.recibidoPor}` : ''}{t.motivoCancelacion ? ` · motivo: ${t.motivoCancelacion}` : ''}</p>
              {t.items.map((i) => (
                <p key={i.producto_id} className="flex justify-between gap-3">
                  <span className="truncate">{i.nombre}</span>
                  <span className="tabular-nums shrink-0">
                    {num(i.cantidad)} enviadas{i.cantidad_recibida !== undefined ? ` · ${num(i.cantidad_recibida)} recibidas` : ''}
                  </span>
                </p>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Sedes y carga de inventario ────────────────────────────────────────────

function PestanaSedes({ clienteId, sedes, alCambiar }: { clienteId: string; sedes: Sede[]; alCambiar: () => void }) {
  const [form, setForm] = useState<Partial<Sede> | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [carga, setCarga] = useState<{ sede: string; texto: string; modo: 'fijar' | 'sumar' } | null>(null);
  const [progreso, setProgreso] = useState<string | null>(null);
  const vista = useMemo(() => (carga ? leerArchivoCarga(carga.texto) : null), [carga]);

  const guardar = async () => {
    if (!form?.nombre?.trim()) return toast.error('Escribe el nombre de la sede');
    setGuardando(true);
    try { await guardarSede(clienteId, form as Sede); toast.success('Sede guardada'); setForm(null); alCambiar(); }
    catch (e) { toast.error('No se pudo guardar', { description: (e as Error).message }); }
    finally { setGuardando(false); }
  };

  const cargar = async () => {
    if (!carga || !vista || vista.filas.length === 0) return;
    setProgreso('Empezando...');
    try {
      const r = await cargarInventarioSede(clienteId, carga.sede, vista.filas, carga.modo, (h, t) => setProgreso(`${num(h)} de ${num(t)}`));
      toast.success(`Inventario cargado: ${num(r.cargadas)} productos`, {
        description: r.sinCodigo.length ? `${r.sinCodigo.length} códigos no existen en el catálogo: ${r.sinCodigo.slice(0, 5).join(', ')}${r.sinCodigo.length > 5 ? '...' : ''}` : undefined,
      });
      setCarga(null);
    } catch (e) {
      toast.error('La carga se detuvo', { description: (e as Error).message });
    } finally {
      setProgreso(null);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button onClick={() => setForm({ nombre: '', tipo: 'tienda' })} className={`${boton} bg-amber-500 hover:bg-amber-600 text-slate-950`}><Plus className="w-4 h-4" /> Nueva sede</button>
      </div>
      <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
        {sedes.map((s) => (
          <div key={s.id} className={`${caja} p-4 space-y-3`}>
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center text-amber-400">
                {s.tipo === 'bodega' ? <Warehouse className="w-5 h-5" /> : <Store className="w-5 h-5" />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-white font-semibold truncate">{s.nombre}</p>
                <p className="text-slate-500 text-xs">{s.esPrincipal ? 'Principal · ' : ''}{s.tipo === 'bodega' ? 'Bodega' : 'Tienda'}{s.direccion ? ` · ${s.direccion}` : ''}</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setForm(s)} className={`${boton} flex-1 h-9 bg-slate-800 hover:bg-slate-700 text-white`}><Pencil className="w-4 h-4" /> Editar</button>
              <button onClick={() => setCarga({ sede: s.id, texto: '', modo: 'fijar' })} className={`${boton} flex-1 h-9 bg-slate-800 hover:bg-slate-700 text-white`}><Upload className="w-4 h-4" /> Cargar inventario</button>
            </div>
          </div>
        ))}
      </div>

      {form && (
        <div className="fixed inset-0 z-[120] bg-black/70 flex items-center justify-center p-4" onClick={() => setForm(null)}>
          <div className={`${caja} w-full max-w-md p-5 space-y-3 bg-slate-900`} onClick={(e) => e.stopPropagation()}>
            <h3 className="text-white font-bold">{form.id ? 'Editar sede' : 'Nueva sede'}</h3>
            <input value={form.nombre || ''} onChange={(e) => setForm({ ...form, nombre: e.target.value })} placeholder="Nombre (ej. C.C Plaza Bosa)" className={entrada} autoFocus />
            <input value={form.direccion || ''} onChange={(e) => setForm({ ...form, direccion: e.target.value })} placeholder="Dirección" className={entrada} />
            <input value={form.telefono || ''} onChange={(e) => setForm({ ...form, telefono: e.target.value })} placeholder="Teléfono" className={entrada} />
            {form.id !== SEDE_PRINCIPAL && (
              <div className="grid grid-cols-2 gap-2">
                {(['tienda', 'bodega'] as const).map((t) => (
                  <button key={t} onClick={() => setForm({ ...form, tipo: t })} className={`${boton} border ${form.tipo === t ? 'border-amber-500 bg-amber-500/10 text-amber-300' : 'border-slate-700 text-slate-300'}`}>
                    {t === 'bodega' ? <Warehouse className="w-4 h-4" /> : <Store className="w-4 h-4" />} {t === 'bodega' ? 'Bodega' : 'Tienda'}
                  </button>
                ))}
              </div>
            )}
            <div className="flex gap-2 pt-1">
              <button onClick={() => setForm(null)} className={`${boton} flex-1 bg-slate-800 hover:bg-slate-700 text-white`}>Cancelar</button>
              <button onClick={guardar} disabled={guardando} className={`${boton} flex-1 bg-amber-500 hover:bg-amber-600 text-slate-950`}>{guardando && <Loader2 className="w-4 h-4 animate-spin" />} Guardar</button>
            </div>
          </div>
        </div>
      )}

      {carga && (
        <div className="fixed inset-0 z-[120] bg-black/70 flex items-center justify-center p-4" onClick={() => !progreso && setCarga(null)}>
          <div className={`${caja} w-full max-w-lg p-5 space-y-3 bg-slate-900`} onClick={(e) => e.stopPropagation()}>
            <h3 className="text-white font-bold">Cargar inventario de {sedes.find((s) => s.id === carga.sede)?.nombre}</h3>
            <p className="text-slate-400 text-sm">Archivo CSV o columnas copiadas de Excel: <strong className="text-slate-200">código</strong> y <strong className="text-slate-200">cantidad</strong>. Sirve el inventario exportado de otro sistema o un conteo físico.</p>
            <input
              type="file" accept=".csv,.txt"
              onChange={async (e) => { const f = e.target.files?.[0]; if (f) setCarga({ ...carga, texto: await f.text() }); }}
              className="block w-full text-sm text-slate-300 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-800 file:px-3 file:py-2 file:text-white"
            />
            <textarea value={carga.texto} onChange={(e) => setCarga({ ...carga, texto: e.target.value })} rows={5} placeholder={'7701234567890;24\n7709876543210;6'} className="w-full rounded-xl bg-slate-950 border border-slate-700 p-3 text-sm text-white font-mono placeholder:text-slate-600" />
            <div className="grid grid-cols-2 gap-2">
              {(['fijar', 'sumar'] as const).map((m) => (
                <button key={m} onClick={() => setCarga({ ...carga, modo: m })} className={`${boton} border text-left ${carga.modo === m ? 'border-amber-500 bg-amber-500/10 text-amber-300' : 'border-slate-700 text-slate-300'}`}>
                  {m === 'fijar' ? 'Dejar esta cantidad (conteo)' : 'Sumar a lo que hay (llegada)'}
                </button>
              ))}
            </div>
            {vista && <p className="text-slate-400 text-xs">{num(vista.filas.length)} filas listas{vista.invalidas ? ` · ${vista.invalidas} se ignoran (encabezado o sin cantidad)` : ''}</p>}
            <div className="flex gap-2">
              <button onClick={() => setCarga(null)} disabled={!!progreso} className={`${boton} flex-1 bg-slate-800 hover:bg-slate-700 text-white`}>Cancelar</button>
              <button onClick={cargar} disabled={!!progreso || !vista?.filas.length} className={`${boton} flex-1 bg-amber-500 hover:bg-amber-600 text-slate-950`}>
                {progreso ? <><Loader2 className="w-4 h-4 animate-spin" /> {progreso}</> : <><Upload className="w-4 h-4" /> Cargar</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
